import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { reviewGoals } from "../agents/goals.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { applyRelationshipChange } from "../agents/relationships.js";
import { pushHistory } from "../scheduler.js";
import { INDEPENDENT_AGGREGATE_ID } from "./policy.js";
import { isJoinablePartyId } from "./queries.js";
import { reconcilePoliticianContestParticipation } from "./lifecycle.js";
import { assertIndependentMembership } from "./state.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export type MembershipChangeResult = {
  events: SimEvent[];
  previousPartyId: string | null;
  previousFactionId: string | null;
};

export function vacatePartyLeadership(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  events: SimEvent[],
  commandId: string | null,
): void {
  for (const party of Object.values(state.partyStates)) {
    if (party.leaderId !== politicianId) continue;
    party.leaderId = null;
    party.status = "leadership_vacant";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_LEADERSHIP_VACANT",
        importance: 0.85,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [party.partyId],
        payload: { partyId: party.partyId, formerLeaderId: politicianId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_LEADERSHIP_CONTEST_REQUIRED",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: [party.partyId],
        payload: { partyId: party.partyId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    reviewGoals(state, world, politicianId, state.currentDate);
  }
}

export function vacateFactionChair(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  events: SimEvent[],
  commandId: string | null,
): void {
  for (const faction of Object.values(state.factionStates)) {
    if (faction.chairId !== politicianId) continue;
    faction.chairId = null;
    faction.status = "chair_vacant";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "FACTION_CHAIR_VACANT",
        importance: 0.7,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [faction.factionId],
        payload: { factionId: faction.factionId, formerChairId: politicianId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    reviewGoals(state, world, politicianId, state.currentDate);
  }
}

export function changePartyMembership(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  partyId: string | null,
  commandId: string | null = null,
): MembershipChangeResult | { error: CommandError } {
  const pol = state.politicians[politicianId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", politicianId) };
  if (!pol.alive) return { error: reject("POLITICIAN_DEAD", politicianId) };
  const indErr = assertIndependentMembership(partyId, world);
  if (indErr) return { error: indErr };
  if (partyId != null && !isJoinablePartyId(world, state, partyId)) {
    return { error: reject("INVALID_PARTY", partyId) };
  }
  const previousPartyId = pol.partyId;
  const previousFactionId = pol.factionId;
  if (previousPartyId === partyId) {
    return { events: [], previousPartyId, previousFactionId };
  }
  const events: SimEvent[] = [];
  vacatePartyLeadership(state, world, politicianId, events, commandId);
  vacateFactionChair(state, world, politicianId, events, commandId);
  pol.partyId = partyId;
  pol.factionId = null;
  recordPoliticalMemory(
    state,
    world,
    {
      ownerId: politicianId,
      subjectIds: [politicianId],
      kind: previousPartyId && partyId ? "betrayal" : "generic",
      valence: partyId ? -0.15 : -0.25,
      salience: 0.7,
      durability: "durable",
      tags: ["party_membership"],
      metadata: { previousPartyId, partyId },
    },
    state.currentDate,
  );
  if (previousPartyId) {
    const oldLeader = state.partyStates[previousPartyId]?.leaderId;
    if (oldLeader && oldLeader !== politicianId) {
      applyRelationshipChange(
        state,
        oldLeader,
        politicianId,
        { trust: -0.12, affinity: -0.08 },
        state.currentDate,
      );
    }
  }
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: partyId ? "PARTY_MEMBERSHIP_CHANGED" : "BECAME_INDEPENDENT",
      importance: 0.65,
      visibility: "public",
      actorIds: [politicianId],
      entityIds: [partyId ?? INDEPENDENT_AGGREGATE_ID, previousPartyId ?? ""].filter(Boolean),
      payload: { politicianId, partyId, previousPartyId, previousFactionId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  reviewGoals(state, world, politicianId, state.currentDate);
  reconcilePoliticianContestParticipation(world, state, politicianId, events, commandId);
  return { events, previousPartyId, previousFactionId };
}

export function changeFaction(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  factionId: string | null,
  commandId: string | null = null,
): MembershipChangeResult | { error: CommandError } {
  const pol = state.politicians[politicianId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", politicianId) };
  if (!pol.alive) return { error: reject("POLITICIAN_DEAD", politicianId) };
  if (factionId == null) {
    const previousFactionId = pol.factionId;
    if (previousFactionId == null) {
      return { events: [], previousPartyId: pol.partyId, previousFactionId };
    }
    const events: SimEvent[] = [];
    vacateFactionChair(state, world, politicianId, events, commandId);
    pol.factionId = null;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "FACTION_MEMBERSHIP_CHANGED",
        importance: 0.4,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [previousFactionId],
        payload: { politicianId, factionId: null, previousFactionId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    reviewGoals(state, world, politicianId, state.currentDate);
    reconcilePoliticianContestParticipation(world, state, politicianId, events, commandId);
    return { events, previousPartyId: pol.partyId, previousFactionId };
  }
  const facDef = world.factionDefinitions[factionId];
  if (!facDef) return { error: reject("INVALID_FACTION", factionId) };
  if (pol.partyId == null) {
    return { error: reject("INVALID_FACTION", "independent politician cannot join a faction") };
  }
  if (facDef.partyId !== pol.partyId) {
    return { error: reject("INVALID_FACTION", "faction does not belong to politician party") };
  }
  const previousFactionId = pol.factionId;
  if (previousFactionId === factionId) {
    return { events: [], previousPartyId: pol.partyId, previousFactionId };
  }
  const events: SimEvent[] = [];
  vacateFactionChair(state, world, politicianId, events, commandId);
  pol.factionId = factionId;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "FACTION_MEMBERSHIP_CHANGED",
      importance: 0.45,
      visibility: "public",
      actorIds: [politicianId],
      entityIds: [factionId],
      payload: { politicianId, factionId, previousFactionId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  reviewGoals(state, world, politicianId, state.currentDate);
  reconcilePoliticianContestParticipation(world, state, politicianId, events, commandId);
  return { events, previousPartyId: pol.partyId, previousFactionId };
}

export function applyRetirementOrDeathVacancies(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  vacatePartyLeadership(state, world, politicianId, events, commandId);
  vacateFactionChair(state, world, politicianId, events, commandId);
  reconcilePoliticianContestParticipation(world, state, politicianId, events, commandId);
  return events;
}
