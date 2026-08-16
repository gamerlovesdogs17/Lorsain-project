import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { reviewGoals } from "../agents/goals.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { pushHistory } from "../scheduler.js";
import { partyMembers, factionMembers } from "./queries.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function setPartyLeader(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  leaderId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const party = state.partyStates[partyId];
  if (!party) return { error: reject("INVALID_PARTY", partyId) };
  const pol = state.politicians[leaderId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", leaderId) };
  if (!pol.alive || pol.retired) return { error: reject("INVALID_PARTY", "leader must be active") };
  if (pol.partyId !== partyId) {
    return { error: reject("INVALID_PARTY", "leader must belong to the party") };
  }
  const previous = party.leaderId;
  const events: SimEvent[] = [];
  party.leaderId = leaderId;
  party.status = "active";
  if (previous && previous !== leaderId) {
    reviewGoals(state, world, previous, state.currentDate);
    recordPoliticalMemory(
      state,
      world,
      {
        ownerId: previous,
        subjectIds: [leaderId],
        kind: "election_rivalry",
        valence: -0.2,
        salience: 0.55,
        durability: "normal",
        tags: ["leadership"],
        metadata: { partyId },
      },
      state.currentDate,
    );
  }
  reviewGoals(state, world, leaderId, state.currentDate);
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_LEADER_SELECTED",
      importance: 0.9,
      visibility: "public",
      actorIds: [leaderId],
      entityIds: [partyId],
      payload: {
        partyId,
        leaderId,
        previousLeaderId: previous,
        memberCount: partyMembers(state, partyId).length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { events };
}

export function setFactionChair(
  state: SimState,
  world: KernelWorld,
  factionId: string,
  chairId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const faction = state.factionStates[factionId];
  if (!faction) return { error: reject("INVALID_FACTION", factionId) };
  const pol = state.politicians[chairId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", chairId) };
  if (!pol.alive || pol.retired)
    return { error: reject("INVALID_FACTION", "chair must be active") };
  if (pol.factionId !== factionId || pol.partyId !== faction.partyId) {
    return { error: reject("INVALID_FACTION", "chair must belong to the faction") };
  }
  const previous = faction.chairId;
  faction.chairId = chairId;
  faction.status = "active";
  if (previous && previous !== chairId) reviewGoals(state, world, previous, state.currentDate);
  reviewGoals(state, world, chairId, state.currentDate);
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "FACTION_CHAIR_SELECTED",
        importance: 0.7,
        visibility: "public",
        actorIds: [chairId],
        entityIds: [factionId],
        payload: {
          factionId,
          chairId,
          previousChairId: previous,
          memberCount: factionMembers(state, factionId).length,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}
