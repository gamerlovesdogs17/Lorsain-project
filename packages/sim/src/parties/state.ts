import { padId } from "../scheduler.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { getAgentProfile } from "../agents/profile.js";
import { INDEPENDENT_AGGREGATE_ID } from "./policy.js";
import { meanLoyalty, partyMembers, factionMembers, membershipPartyIds } from "./queries.js";
import {
  emptyQualificationEvidence,
  type ContestEntry,
  type PartyContest,
  type QualificationEvidence,
} from "./types.js";
import { evaluatePresidentialEligibility } from "./eligibility.js";
import { PRESIDENTIAL_ENTRY_FROM_STATUS, isSeedPresidentialStatus } from "./policy.js";
import { activeTermsForPolitician } from "../offices.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import type { ElectionState } from "../elections/types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function emptyPartyRuntime(): Pick<
  SimState,
  "partyStates" | "factionStates" | "endorsements" | "partyContests" | "dynamicParties"
> {
  return {
    partyStates: {},
    factionStates: {},
    endorsements: {},
    partyContests: {},
    dynamicParties: {},
  };
}

export function needsPartyInstitutionSeed(state: SimState, world: KernelWorld): boolean {
  return membershipPartyIds(world).length > 0 && Object.keys(state.partyStates).length === 0;
}

export function seedPartyInstitutions(state: SimState, world: KernelWorld): void {
  for (const partyId of membershipPartyIds(world)) {
    const canonical = world.startingPartyLeaders[partyId] ?? null;
    const leaderId =
      canonical && currentPartyOfficeholderEligible(state, canonical, partyId) ? canonical : null;
    const members = partyMembers(state, partyId);
    state.partyStates[partyId] = {
      partyId,
      leaderId,
      status: leaderId ? "active" : "leadership_vacant",
      cohesion: meanLoyalty(world, state, members, "partyLoyalty"),
    };
  }
  for (const factionId of Object.keys(world.factionDefinitions).sort()) {
    const def = world.factionDefinitions[factionId]!;
    const canonical = world.startingFactionChairs[factionId] ?? null;
    const chairId =
      canonical && currentFactionOfficeholderEligible(state, canonical, def.partyId, factionId)
        ? canonical
        : null;
    const members = factionMembers(state, factionId);
    state.factionStates[factionId] = {
      factionId,
      partyId: def.partyId,
      chairId,
      status: chairId ? "active" : "chair_vacant",
      cohesion: meanLoyalty(world, state, members, "factionLoyalty"),
    };
  }
  const election = Object.values(state.elections)
    .filter((e) => e.type === "presidential" && e.status !== "resolved" && e.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (election) ensurePresidentialNominationContests(state, world, election);
}

function currentPartyOfficeholderEligible(
  state: SimState,
  politicianId: string,
  partyId: string,
): boolean {
  const p = state.politicians[politicianId];
  return !!p && p.alive && !p.retired && p.partyId === partyId;
}

function currentFactionOfficeholderEligible(
  state: SimState,
  politicianId: string,
  partyId: string,
  factionId: string,
): boolean {
  const p = state.politicians[politicianId];
  return !!p && p.alive && !p.retired && p.partyId === partyId && p.factionId === factionId;
}

function seedEntryFromProfile(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): ContestEntry | null {
  const profile = getAgentProfile(world, state, politicianId);
  const status = profile?.presidentialStatus ?? null;
  if (!status || status === "term_limited_incumbent" || !isSeedPresidentialStatus(status)) {
    return null;
  }
  const mapped = PRESIDENTIAL_ENTRY_FROM_STATUS[status];
  if (!mapped) return null;
  if (!evaluatePresidentialEligibility(world, state, politicianId).eligible) return null;
  const evidence: QualificationEvidence = emptyQualificationEvidence();
  return {
    politicianId,
    status: mapped,
    declaredDate: null,
    qualificationEvidence: evidence,
    seedPresidentialStatus: status,
  };
}

export type PresidentialNominationCycleMetadata = {
  electionId: string;
  electionDate: string;
  cycleYear: number;
  partyId: string;
  candidateSource: "scenario_start" | "runtime_politics";
};

export function presidentialNominationCycleMetadata(
  contest: PartyContest,
): PresidentialNominationCycleMetadata | null {
  const electionId = contest.metadata.electionId;
  const electionDate = contest.metadata.electionDate;
  const cycleYear = contest.metadata.cycleYear;
  const partyId = contest.metadata.partyId;
  const candidateSource = contest.metadata.candidateSource;
  if (
    typeof electionId !== "string" ||
    typeof electionDate !== "string" ||
    typeof cycleYear !== "number" ||
    typeof partyId !== "string" ||
    (candidateSource !== "scenario_start" && candidateSource !== "runtime_politics")
  ) {
    return null;
  }
  return { electionId, electionDate, cycleYear, partyId, candidateSource };
}

export function presidentialNominationContestsForElection(
  state: SimState,
  electionId: string,
): PartyContest[] {
  return Object.values(state.partyContests)
    .filter(
      (contest) =>
        contest.type === "presidential_nomination" &&
        presidentialNominationCycleMetadata(contest)?.electionId === electionId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function presidentialInterestScore(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  electionDate: string,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return -Infinity;
  const standing = candidateStandingOrDefault(world, state, politicianId);
  const officeKinds = activeTermsForPolitician(state, politicianId)
    .map((term) => world.offices[term.officeId]?.kind)
    .filter((kind): kind is string => Boolean(kind));
  let office = 0;
  if (officeKinds.includes("governor")) office = 1;
  else if (officeKinds.includes("minister")) office = 0.9;
  else if (officeKinds.includes("assembly_member")) office = 0.65;
  const leadership = Object.values(state.partyStates).some(
    (party) => party.leaderId === politicianId,
  )
    ? 1
    : Object.values(state.factionStates).some((faction) => faction.chairId === politicianId)
      ? 0.55
      : 0;
  const priorGeneral = Object.values(state.elections).some(
    (election) =>
      election.type === "presidential" &&
      election.status === "resolved" &&
      Boolean(election.candidates[politicianId]),
  )
    ? 1
    : 0;
  const priorNomination = Object.values(state.partyContests).some(
    (contest) =>
      contest.type === "presidential_nomination" &&
      contest.status === "resolved" &&
      Boolean(contest.entries[politicianId]),
  )
    ? 1
    : 0;
  const momentum = (standing.momentum + 1) / 2;
  const score =
    profile.traits.ambition * 0.25 +
    profile.traits.riskTolerance * 0.08 +
    profile.skills.campaigning * 0.14 +
    profile.skills.fundraising * 0.08 +
    standing.nameRecognition * 0.12 +
    ((standing.favorability + 1) / 2) * 0.1 +
    momentum * 0.05 +
    office * 0.08 +
    leadership * 0.06 +
    priorGeneral * 0.025 +
    priorNomination * 0.015;
  return evaluatePresidentialEligibility(world, state, politicianId, electionDate).eligible
    ? score
    : -Infinity;
}

function futureEntriesForParty(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  electionDate: string,
): Record<string, ContestEntry> {
  const ranked = Object.values(state.politicians)
    .filter(
      (politician) =>
        politician.id !== state.playerPoliticianId &&
        politician.partyId === partyId &&
        politician.alive &&
        !politician.retired,
    )
    .map((politician) => ({
      politicianId: politician.id,
      score: presidentialInterestScore(state, world, politician.id, electionDate),
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.politicianId.localeCompare(b.politicianId))
    .slice(0, 5);
  const entries: Record<string, ContestEntry> = {};
  ranked.forEach((row, index) => {
    entries[row.politicianId] = {
      politicianId: row.politicianId,
      status: index < 2 ? "exploring" : "potential",
      declaredDate: null,
      qualificationEvidence: emptyQualificationEvidence(),
      seedPresidentialStatus: null,
    };
  });
  return entries;
}

export function ensurePresidentialNominationContests(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
): PartyContest[] {
  const existing = presidentialNominationContestsForElection(state, election.id);
  if (existing.length > 0) return existing;
  const cycleYear = Number(election.date.slice(0, 4));
  const scenarioStartCycle = election.id === "ELEC_PRES_2028";
  const partyIds = [
    ...membershipPartyIds(world),
    ...Object.keys(state.dynamicParties).sort(),
  ].filter((id, index, all) => all.indexOf(id) === index);
  for (const partyId of partyIds) {
    if (partyId === INDEPENDENT_AGGREGATE_ID) continue;
    const def = world.partyDefinitions[partyId] ?? state.dynamicParties[partyId];
    if (!def) continue;
    const rule = world.nominationRules[def.nominationRuleId];
    if (!rule || (rule.partyId !== partyId && !state.dynamicParties[partyId])) continue;
    const id = padId("CONTEST", state.counters.nextPartyContestId++);
    let entries: Record<string, ContestEntry> = {};
    if (scenarioStartCycle) {
      for (const pol of Object.values(state.politicians)) {
        if (pol.partyId !== partyId || !pol.alive || pol.retired) continue;
        const entry = seedEntryFromProfile(world, state, pol.id);
        if (entry) entries[pol.id] = entry;
      }
    } else {
      entries = futureEntriesForParty(state, world, partyId, election.date);
    }
    const contest: PartyContest = {
      id,
      type: "presidential_nomination",
      partyId,
      factionId: null,
      ruleId: def.nominationRuleId,
      status: "planned",
      createdDate: state.currentDate,
      openedDate: null,
      resolvedDate: null,
      entries,
      winnerId: null,
      selectorSummary: [],
      countInput: null,
      countArchive: null,
      metadata: {
        electionId: election.id,
        electionDate: election.date,
        cycle: String(cycleYear),
        cycleYear,
        partyId,
        candidateSource: scenarioStartCycle ? "scenario_start" : "runtime_politics",
      },
    };
    state.partyContests[id] = contest;
  }
  return presidentialNominationContestsForElection(state, election.id);
}

export function assertIndependentMembership(
  partyId: string | null,
  world: KernelWorld,
): CommandError | null {
  if (partyId === INDEPENDENT_AGGREGATE_ID || partyId === world.independentAggregatePartyId) {
    return reject("INVALID_PARTY", "PARTY_IND cannot be used as membership");
  }
  return null;
}
