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
import { presidentialNominationCycleMetadata, partyAllowedUnderConstitution } from "../parties/state.js";
import { certifyCount, certifyShareResult } from "./certification.js";
import {
  describePresidentialElectionMethod,
  presidentialElectionMode,
} from "../provinces/constitutionGameplay.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { candidateStandingOrDefault } from "./standing.js";

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
  const live = Object.values(election.candidates).filter((c) => {
    if (c.withdrawn) return false;
    return partyAllowedUnderConstitution(state, c.partyId);
  });
  if (live.length < 2) return { error: reject("INSUFFICIENT_CANDIDATES", "need at least two") };
  const mode = presidentialElectionMode(state);
  const method = describePresidentialElectionMethod(mode);

  if (mode === "assembly_selection") {
    const members = currentAssemblyMemberIds(world, state);
    const tallies: Record<string, number> = {};
    for (const id of live.map((c) => c.politicianId)) tallies[id] = 0;
    for (const mpId of members) {
      if (mpId === state.playerPoliticianId) continue;
      const ranked = live
        .map((c) => c.politicianId)
        .sort((a, b) => {
          const score = (id: string) => {
            const cand = live.find((c) => c.politicianId === id)!;
            const mp = state.politicians[mpId];
            const sameParty = mp?.partyId && cand.partyId === mp.partyId ? 1 : 0;
            const standing = candidateStandingOrDefault(world, state, id);
            return sameParty * 2 + standing.favorability + standing.nameRecognition * 0.5;
          };
          return score(b) - score(a) || a.localeCompare(b);
        });
      const pick = ranked[0];
      if (pick) tallies[pick] = (tallies[pick] ?? 0) + 1;
    }
    const winnerId = Object.keys(tallies).sort(
      (a, b) => (tallies[b] ?? 0) - (tallies[a] ?? 0) || a.localeCompare(b),
    )[0]!;
    const shares = Object.values(tallies).map((n) => n / Math.max(1, members.length));
    const certification = certifyShareResult({
      date: state.currentDate,
      authority: "national_electoral_commission",
      shares,
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
        method,
        assemblyTallies: tallies,
        certification,
      },
      sourceScheduledEventId: args.scheduledEventId,
      sourceCommandId: args.commandId,
    });
    election.status = "resolved";
    election.winnerIds = [winnerId];
    election.resultEventId = resultEvent.id;
    election.certification = certification;
    election.metadata = { ...election.metadata, presidentialMethod: method };
    state.presidential.certifiedPresidentElectId = winnerId;
    if (election.metadata.specialElection !== true) {
      state.presidential.electedTermCountByPolitician[winnerId] =
        (state.presidential.electedTermCountByPolitician[winnerId] ?? 0) + 1;
    }
    scheduleAssumptionIfNeeded(state, world, election.date, election.id, args.commandId);
    return { events: [resultEvent], election };
  }

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

  let countCandidateIds = candidateIds;
  let countBallots = ballots;
  if (mode === "plurality") {
    // Plurality: only first preferences count — truncate rankings.
    countBallots = ballots.map((b) => ({
      ...b,
      rankings: b.rankings.length > 0 ? [b.rankings[0]!] : [],
    }));
  } else if (mode === "majority_runoff") {
    // First round plurality; if no majority, runoff between top two.
    const first = countIrv(
      {
        candidateIds,
        ballots: ballots.map((b) => ({
          ...b,
          rankings: b.rankings.length > 0 ? [b.rankings[0]!] : [],
        })),
      },
      { rng: { nextUint32: () => rng.uint32("elections") } },
    );
    const totals = first.firstPreferences;
    const ordered = candidateIds
      .slice()
      .sort((a, b) => {
        const av = Number(totals[a]?.split("/")[0] ?? 0);
        const bv = Number(totals[b]?.split("/")[0] ?? 0);
        return bv - av || a.localeCompare(b);
      });
    const top = ordered[0]!;
    const topVotes = Number(totals[top]?.split("/")[0] ?? 0);
    const totalValidNum = Number(first.totalValid.split("/")[0] ?? 0);
    if (topVotes * 2 <= totalValidNum && ordered.length >= 2) {
      countCandidateIds = ordered.slice(0, 2);
      const allow = new Set(countCandidateIds);
      countBallots = ballots.map((b) => ({
        ...b,
        rankings: b.rankings.filter((id) => allow.has(id)),
      }));
    } else {
      // Majority on first preferences — elect top without further rounds by truncating field.
      countCandidateIds = [top];
      countBallots = ballots.map((b) => ({ ...b, rankings: [top] }));
    }
  }

  const result = countIrv(
    { candidateIds: countCandidateIds, ballots: countBallots },
    { rng: { nextUint32: () => rng.uint32("elections") } },
  );
  if (!result.elected) {
    return { error: reject("COUNT_FAILED", "presidential count produced no winner") };
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
      method,
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
  election.metadata = { ...election.metadata, presidentialMethod: method };
  state.presidential.certifiedPresidentElectId = winnerId;
  if (election.metadata.specialElection !== true) {
    state.presidential.electedTermCountByPolitician[winnerId] =
      (state.presidential.electedTermCountByPolitician[winnerId] ?? 0) + 1;
  }
  scheduleAssumptionIfNeeded(state, world, election.date, election.id, args.commandId);
  return { events: [resultEvent], election };
}
