import { countIrv, serializeCountResult } from "@lorsain/election-math";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { compareIsoDate } from "../calendar.js";
import { pushHistory } from "../scheduler.js";
import { evaluatePresidentialEligibility } from "../parties/eligibility.js";
import {
  generateConstituencyBallots,
  integerBallotWeightSum,
  mergeNationalBallots,
} from "./ballots.js";
import { finalizedFieldError, partiesWithoutNominee } from "./field.js";
import { publicCandidateFacts } from "./support.js";
import type { PublicCandidateFacts } from "./types.js";
import { constituencyTurnout, mergeTurnout } from "./turnout.js";
import { scheduleAssumptionIfNeeded } from "./state.js";
import type { ElectionCandidate, ElectionState } from "./types.js";
import { FIELD } from "../campaigns/policy.js";
import { constituencyGotvBoost } from "../campaigns/gotv.js";
import { presidentialNominationCycleMetadata } from "../parties/state.js";
import { certifyCount } from "./certification.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function syncNominationWinnerToElection(state: SimState, contestId: string): void {
  const contest = state.partyContests[contestId];
  if (!contest || contest.type !== "presidential_nomination" || contest.status !== "resolved") {
    return;
  }
  if (!contest.winnerId) return;
  const cycle = presidentialNominationCycleMetadata(contest);
  const election = cycle ? state.elections[cycle.electionId] : undefined;
  if (!election) return;
  if (
    election.type !== "presidential" ||
    election.fieldFinalized ||
    election.status === "resolved" ||
    election.status === "cancelled"
  ) {
    return;
  }
  const winner = contest.winnerId;
  election.candidates[winner] = {
    politicianId: winner,
    partyId: contest.partyId,
    sourceContestId: contest.id,
    filedDate: contest.resolvedDate ?? state.currentDate,
    publicIdeology: null,
    withdrawn: false,
    independentQualified: false,
  };
  if (election.status === "planned") election.status = "field_open";
}

export function finalizePresidentialField(
  state: SimState,
  world: KernelWorld,
  electionId: string,
): { election: ElectionState } | { error: CommandError } {
  const election = state.elections[electionId];
  if (!election || election.type !== "presidential") {
    return { error: reject("INVALID_ELECTION", electionId) };
  }
  if (election.status === "resolved" || election.status === "cancelled") {
    return { error: reject("INVALID_ELECTION", "election is closed") };
  }
  election.partiesWithoutNominee = partiesWithoutNominee(world, election);
  const fieldErr = finalizedFieldError(state, world, election);
  if (fieldErr) return { error: fieldErr };
  election.fieldFinalized = true;
  election.status = "field_finalized";
  return { election };
}

export function resolvePresidentialElection(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  args: { electionId: string; scheduledEventId: string; commandId: string },
): { events: SimEvent[]; election: ElectionState } | { error: CommandError } {
  const election = state.elections[args.electionId];
  if (!election || election.type !== "presidential") {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  if (!election.fieldFinalized) {
    return { error: reject("FIELD_NOT_FINALIZED", args.electionId) };
  }
  if (compareIsoDate(state.currentDate, election.date) !== 0) {
    return { error: reject("WRONG_DATE", `currentDate ${state.currentDate} != ${election.date}`) };
  }
  const live = Object.values(election.candidates).filter((c) => !c.withdrawn);
  if (live.length < 2) return { error: reject("INSUFFICIENT_CANDIDATES", "need at least two") };
  const ideologyById: Record<string, ElectionCandidate["publicIdeology"]> = {};
  const facts: PublicCandidateFacts[] = [];
  for (const c of live) {
    const pol = state.politicians[c.politicianId];
    if (!pol?.alive || pol.retired) {
      return { error: reject("INELIGIBLE_CANDIDATE", c.politicianId) };
    }
    const elig = evaluatePresidentialEligibility(world, state, c.politicianId, election.date);
    if (!elig.eligible) {
      return {
        error: reject("INELIGIBLE_CANDIDATE", `${c.politicianId}: ${elig.reasons.join("; ")}`),
      };
    }
    ideologyById[c.politicianId] = c.publicIdeology;
    const f = publicCandidateFacts(world, state, c.politicianId, c.publicIdeology);
    if (!f) return { error: reject("INVALID_CANDIDATE", c.politicianId) };
    facts.push(f);
  }
  const candidateIds = live.map((c) => c.politicianId).sort();
  const constituencyIds = Object.keys(world.constituencyElectorate).sort();
  const turnoutParts = constituencyIds.map((cid) =>
    constituencyTurnout(world, cid, facts, "presidential", rng),
  );
  const turnout = mergeTurnout(turnoutParts);
  const perConst = constituencyIds.map((cid, i) => {
    const mobilization: Record<string, number> = {};
    for (const id of candidateIds) {
      let org = 0;
      let gotv = 0;
      for (const camp of Object.values(state.campaignRuntime.campaigns)) {
        if (camp.politicianId !== id) continue;
        if (camp.status !== "active" || camp.type !== "presidential_general") continue;
        org = Math.max(org, camp.organizationByConstituency[cid] ?? 0);
        gotv = Math.max(gotv, constituencyGotvBoost(world, camp, cid, state.currentDate));
      }
      mobilization[id] = 1 + FIELD.turnoutScale * org + FIELD.gotvTurnoutScale * gotv;
    }
    return generateConstituencyBallots(
      world,
      state,
      cid,
      candidateIds,
      turnoutParts[i]!.validVoteValue,
      ideologyById,
      rng,
      mobilization,
    );
  });
  const ballots = mergeNationalBallots(perConst);
  const validSum = integerBallotWeightSum(ballots);
  const partSum = turnoutParts.reduce((a, r) => a + BigInt(r.validVoteValue), 0n);
  if (validSum !== BigInt(turnout.validVoteValue) || validSum !== partSum) {
    return {
      error: reject(
        "VOTE_CONSERVATION",
        `ballot weights ${validSum} != valid votes ${turnout.validVoteValue}`,
      ),
    };
  }
  const result = countIrv(
    { candidateIds, ballots },
    { rng: { nextUint32: () => rng.uint32("elections") } },
  );
  if (!result.elected) {
    return { error: reject("COUNT_FAILED", "IRV produced no winner") };
  }
  const winnerId = result.elected;
  const certification = certifyCount({
    date: state.currentDate,
    authority: "national_electoral_commission",
    archives: [result],
  });
  const resultEvent = pushHistory(state, {
    date: state.currentDate,
    type: "PRESIDENTIAL_ELECTION_RESULT",
    importance: 1,
    visibility: "public",
    actorIds: [winnerId],
    entityIds: [election.id],
    payload: {
      electionId: election.id,
      winnerId,
      turnout,
      replay: serializeCountResult(result),
      certification,
    },
    sourceScheduledEventId: args.scheduledEventId,
    sourceCommandId: args.commandId,
  });
  election.status = "resolved";
  election.turnout = turnout;
  election.countInput = { candidateIds, ballots };
  election.countArchive = result;
  election.winnerIds = [winnerId];
  election.resultEventId = resultEvent.id;
  election.certification = certification;
  state.presidential.certifiedPresidentElectId = winnerId;
  if (election.metadata.specialElection !== true) {
    state.presidential.electedTermCountByPolitician[winnerId] =
      (state.presidential.electedTermCountByPolitician[winnerId] ?? 0) + 1;
  }
  scheduleAssumptionIfNeeded(state, world, election.date, election.id, args.commandId);
  return { events: [resultEvent], election };
}
