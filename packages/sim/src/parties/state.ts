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
  seedPlannedPresidentialContests(state, world);
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

function seedPlannedPresidentialContests(state: SimState, world: KernelWorld): void {
  if (Object.keys(state.partyContests).length > 0) return;
  for (const partyId of membershipPartyIds(world)) {
    if (partyId === INDEPENDENT_AGGREGATE_ID) continue;
    const def = world.partyDefinitions[partyId];
    if (!def) continue;
    const rule = world.nominationRules[def.nominationRuleId];
    if (!rule || rule.partyId !== partyId) continue;
    const id = padId("CONTEST", state.counters.nextPartyContestId++);
    const entries: Record<string, ContestEntry> = {};
    for (const pol of Object.values(state.politicians)) {
      if (pol.partyId !== partyId || !pol.alive || pol.retired) continue;
      const entry = seedEntryFromProfile(world, state, pol.id);
      if (entry) entries[pol.id] = entry;
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
      metadata: { cycle: "2028" },
    };
    state.partyContests[id] = contest;
  }
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
