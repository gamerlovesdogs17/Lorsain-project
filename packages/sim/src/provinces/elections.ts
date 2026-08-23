import { addYears, compareIsoDate } from "../calendar.js";
import { createCampaignRecord, activeCampaignFor } from "../campaigns/state.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import { blocSupportShares } from "../elections/support.js";
import { registeredElectorate } from "../elections/turnout.js";
import { activeTermsForPolitician, assumeOffice, endTerm, occupyingTerms } from "../offices.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import {
  createGubernatorialElection,
  governorOfficeForProvince,
} from "./state.js";
import type { GubernatorialCandidate, GubernatorialElection } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function gubernatorialEligibilityError(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  provinceId: string,
): CommandError | null {
  const politician = state.politicians[politicianId];
  if (!politician) return reject("UNKNOWN_POLITICIAN", politicianId);
  if (!politician.alive || politician.retired) return reject("INELIGIBLE", politicianId);
  if (!world.provinceIds.includes(provinceId)) return reject("UNKNOWN_PROVINCE", provinceId);
  if (world.politicianHomeProvince[politicianId] !== provinceId) {
    return reject("PROVINCIAL_RESIDENCY", `${politicianId} is not resident in ${provinceId}`);
  }
  for (const term of activeTermsForPolitician(state, politicianId)) {
    const office = world.offices[term.officeId];
    if (!office) continue;
    if (office.kind === "constitutional_court_justice" || office.kind === "president") {
      return reject("INCOMPATIBLE_OFFICE", office.kind);
    }
    if (office.kind === "governor" && office.provinceId !== provinceId) {
      return reject("INCOMPATIBLE_OFFICE", `governor of ${office.provinceId}`);
    }
  }
  return null;
}

function npcCandidateScore(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  election: GubernatorialElection,
): number {
  const standing = candidateStandingOrDefault(world, state, politicianId);
  const kinds = activeTermsForPolitician(state, politicianId).map(
    (term) => world.offices[term.officeId]?.kind,
  );
  let score = standing.nameRecognition * 0.8 + (standing.favorability + 1) * 0.35;
  if (kinds.includes("governor")) score += 0.55;
  if (kinds.includes("mayor")) score += 0.24;
  if (kinds.includes("minister")) score += 0.18;
  if (Object.values(state.partyStates).some((party) => party.leaderId === politicianId)) score += 0.2;
  score += (stableHash(`${election.id}:${politicianId}`) % 1000) / 100000;
  return score;
}

function filedCandidate(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  politicianId: string,
  source: "player" | "npc",
): GubernatorialCandidate {
  return {
    politicianId,
    partyId: state.politicians[politicianId]?.partyId ?? null,
    filedDate: state.currentDate,
    incumbent: election.incumbentId === politicianId,
    source,
    withdrawn: false,
  };
}

function openField(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  if (election.status !== "planned") return [];
  election.status = "filing_open";
  const pool = Object.keys(state.politicians)
    .filter((id) => id !== state.playerPoliticianId)
    .filter((id) => gubernatorialEligibilityError(state, world, id, election.provinceId) == null)
    .sort(
      (a, b) =>
        npcCandidateScore(state, world, b, election) - npcCandidateScore(state, world, a, election) ||
        stableHash(`${election.id}:${a}`) - stableHash(`${election.id}:${b}`),
    );
  if (election.incumbentId && election.incumbentId !== state.playerPoliticianId) {
    const incumbent = election.incumbentId;
    const standing = candidateStandingOrDefault(world, state, incumbent);
    if (
      gubernatorialEligibilityError(state, world, incumbent, election.provinceId) == null &&
      standing.favorability > -0.55
    ) {
      election.candidates[incumbent] = filedCandidate(state, world, election, incumbent, "npc");
    }
  }
  const representedParties = new Set(
    Object.values(election.candidates).map((candidate) => candidate.partyId),
  );
  for (const politicianId of pool) {
    if (Object.keys(election.candidates).length >= 4) break;
    if (election.candidates[politicianId]) continue;
    const partyId = state.politicians[politicianId]?.partyId ?? null;
    if (representedParties.has(partyId) && Object.keys(election.candidates).length >= 2) continue;
    election.candidates[politicianId] = filedCandidate(state, world, election, politicianId, "npc");
    representedParties.add(partyId);
  }
  for (const candidate of Object.values(election.candidates)) {
    if (!activeCampaignFor(state, candidate.politicianId, "gubernatorial")) {
      createCampaignRecord(state, world, {
        politicianId: candidate.politicianId,
        type: "gubernatorial",
        electionId: election.id,
        status: "active",
        metadata: { provinceId: election.provinceId },
      });
    }
  }
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GUBERNATORIAL_FILING_OPENED",
      importance: 0.52,
      visibility: "public",
      actorIds: [],
      entityIds: [election.id, election.provinceId],
      payload: {
        electionId: election.id,
        provinceId: election.provinceId,
        filingDeadlineDate: election.filingDeadlineDate,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function fileGubernatorialCandidacy(
  state: SimState,
  world: KernelWorld,
  args: { politicianId: string; electionId: string; provinceId: string },
  commandId: string | null,
) {
  const election = state.provincialRuntime.elections[args.electionId];
  if (!election || election.provinceId !== args.provinceId) {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  if (election.status !== "filing_open" || compareIsoDate(state.currentDate, election.filingDeadlineDate) >= 0) {
    return { error: reject("FILING_CLOSED", election.id) };
  }
  const error = gubernatorialEligibilityError(state, world, args.politicianId, args.provinceId);
  if (error) return { error };
  if (election.playerDecision === "declined") return { error: reject("ALREADY_DECLINED", args.politicianId) };
  if (election.candidates[args.politicianId]) return { error: reject("ALREADY_FILED", args.politicianId) };
  election.candidates[args.politicianId] = filedCandidate(
    state,
    world,
    election,
    args.politicianId,
    "player",
  );
  if (args.politicianId === state.playerPoliticianId) election.playerDecision = "filed";
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_CANDIDACY_FILED",
    importance: 0.62,
    visibility: "public",
    actorIds: [args.politicianId],
    entityIds: [election.id, election.provinceId],
    payload: { electionId: election.id, provinceId: election.provinceId },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  return { candidate: election.candidates[args.politicianId]!, events: [event] };
}

export function declineGubernatorialCandidacy(
  state: SimState,
  args: { politicianId: string; electionId: string },
  commandId: string | null,
) {
  const election = state.provincialRuntime.elections[args.electionId];
  if (!election) return { error: reject("INVALID_ELECTION", args.electionId) };
  if (election.status !== "filing_open") return { error: reject("FILING_CLOSED", election.id) };
  if (election.candidates[args.politicianId]) return { error: reject("ALREADY_FILED", args.politicianId) };
  if (args.politicianId === state.playerPoliticianId) election.playerDecision = "declined";
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_CANDIDACY_DECLINED",
    importance: 0.25,
    visibility: "system",
    actorIds: [args.politicianId],
    entityIds: [election.id],
    payload: { electionId: election.id },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  return { events: [event] };
}

function campaignForElection(state: SimState, politicianId: string, electionId: string) {
  return Object.values(state.campaignRuntime.campaigns).find(
    (campaign) =>
      campaign.type === "gubernatorial" &&
      campaign.electionId === electionId &&
      campaign.politicianId === politicianId &&
      (campaign.status === "active" || campaign.status === "exploring"),
  );
}

function resolveElection(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  const candidateIds = Object.values(election.candidates)
    .filter((candidate) => !candidate.withdrawn)
    .map((candidate) => candidate.politicianId)
    .sort();
  if (candidateIds.length === 0) return [];
  const votes = Object.fromEntries(candidateIds.map((id) => [id, 0])) as Record<string, number>;
  let electorateWeight = 0;
  let turnoutWeight = 0;
  for (const [constituencyId, electorate] of Object.entries(world.constituencyElectorate)) {
    const provinceShare =
      electorate.provincePopulationShares.find((row) => row.provinceId === election.provinceId)
        ?.share ?? 0;
    if (provinceShare <= 0) continue;
    const registered = registeredElectorate(electorate) * provinceShare;
    for (const blocId of world.voterBlocIdsByConstituency[constituencyId] ?? []) {
      const bloc = world.voterBlocs[blocId];
      if (!bloc) continue;
      const weight = registered * bloc.weight * (0.82 + bloc.turnoutPropensity * 0.18);
      const shares = blocSupportShares(world, state, bloc, candidateIds);
      for (const politicianId of candidateIds) {
        const campaign = campaignForElection(state, politicianId, election.id);
        const organization = campaign
          ? 1 +
            campaign.fieldOrganization * 0.05 +
            (campaign.organizationByProvince[election.provinceId] ?? 0) * 0.12 +
            (campaign.organizationByConstituency[constituencyId] ?? 0) * 0.06
          : 1;
        votes[politicianId] =
          (votes[politicianId] ?? 0) + weight * (shares[politicianId] ?? 0) * organization;
      }
      electorateWeight += weight;
      turnoutWeight += weight * (0.5 + bloc.turnoutPropensity * 0.15);
    }
  }
  for (const politicianId of candidateIds) {
    votes[politicianId] =
      (votes[politicianId] ?? 0) * (0.992 + rng.float01("elections") * 0.016);
  }
  const total = Object.values(votes).reduce((sum, value) => sum + value, 0);
  election.voteShares = Object.fromEntries(
    candidateIds.map((politicianId) => [politicianId, total > 0 ? votes[politicianId]! / total : 1 / candidateIds.length]),
  );
  election.winnerId = candidateIds
    .slice()
    .sort(
      (a, b) =>
        election.voteShares[b]! - election.voteShares[a]! ||
        stableHash(`${election.id}:${a}`) - stableHash(`${election.id}:${b}`),
    )[0]!;
  election.turnoutRate = electorateWeight > 0 ? turnoutWeight / electorateWeight : 0.58;
  election.status = "resolved";
  for (const candidateId of candidateIds) {
    const campaign = campaignForElection(state, candidateId, election.id);
    if (!campaign) continue;
    campaign.status = candidateId === election.winnerId ? "won" : "lost";
    campaign.endedDate = state.currentDate;
  }
  const event = pushHistory(state, {
    date: state.currentDate,
    type: "GUBERNATORIAL_ELECTION_RESOLVED",
    importance: 0.72,
    visibility: "public",
    actorIds: [election.winnerId],
    entityIds: [election.id, election.provinceId],
    payload: {
      electionId: election.id,
      provinceId: election.provinceId,
      winnerId: election.winnerId,
      turnoutRate: election.turnoutRate,
    },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  election.resultEventId = event.id;
  return [event];
}

function assumeWinner(
  state: SimState,
  world: KernelWorld,
  election: GubernatorialElection,
  commandId: string,
): SimEvent[] {
  if (!election.winnerId) return [];
  const office = governorOfficeForProvince(world, election.provinceId);
  if (!office) return [];
  for (const term of occupyingTerms(state, office.id)) {
    endTerm(state, term.id, state.currentDate, "gubernatorial_transition");
  }
  for (const term of activeTermsForPolitician(state, election.winnerId)) {
    const held = world.offices[term.officeId];
    if (held && office.incompatibleWithKinds.includes(held.kind)) {
      endTerm(state, term.id, state.currentDate, "assumed_governorship");
    }
  }
  const assumed = assumeOffice(state, world, {
    officeId: office.id,
    holderId: election.winnerId,
    date: state.currentDate,
    accessionReason: "provincial_election",
    holdingKind: "substantive",
    endDate: addYears(state.currentDate, 4),
    startKnown: true,
    sourceElectionId: election.id,
  });
  if ("error" in assumed) return [];
  election.status = "assumed";
  const next = createGubernatorialElection(election.provinceId, Number(election.date.slice(0, 4)) + 4, election.winnerId);
  state.provincialRuntime.elections[next.id] = next;
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNOR_ASSUMED_OFFICE",
      importance: 0.68,
      visibility: "public",
      actorIds: [election.winnerId],
      entityIds: [office.id, election.id, election.provinceId],
      payload: { electionId: election.id, provinceId: election.provinceId, officeId: office.id },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function processGubernatorialCalendar(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const elections = Object.values(state.provincialRuntime.elections).sort(
    (a, b) => a.date.localeCompare(b.date) || a.provinceId.localeCompare(b.provinceId),
  );
  for (const election of elections) {
    if (election.status === "planned" && compareIsoDate(state.currentDate, election.filingOpenDate) >= 0) {
      events.push(...openField(state, world, election, commandId));
    }
    if (election.status === "filing_open" && compareIsoDate(state.currentDate, election.filingDeadlineDate) >= 0) {
      if (election.playerDecision == null) election.playerDecision = "declined";
      election.status = "field_finalized";
    }
    if (election.status === "field_finalized" && compareIsoDate(state.currentDate, election.date) >= 0) {
      events.push(...resolveElection(state, world, rng, election, commandId));
    }
    if (election.status === "resolved" && compareIsoDate(state.currentDate, election.assumptionDate) >= 0) {
      events.push(...assumeWinner(state, world, election, commandId));
    }
  }
  return events;
}

export function currentGubernatorialOpportunity(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
): GubernatorialElection[] {
  return Object.values(state.provincialRuntime.elections)
    .filter(
      (election) =>
        (election.status === "planned" || election.status === "filing_open") &&
        election.playerDecision == null &&
        gubernatorialEligibilityError(state, world, politicianId, election.provinceId) == null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.provinceId.localeCompare(b.provinceId));
}
