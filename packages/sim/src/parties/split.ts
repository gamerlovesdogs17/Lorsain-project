import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { reviewGoals } from "../agents/goals.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { padId, pushHistory } from "../scheduler.js";
import { vacateFactionChair, vacatePartyLeadership } from "./membership.js";
import { reconcilePoliticianContestParticipation } from "./lifecycle.js";
import { factionMembers } from "./queries.js";
import type { DynamicPartyDefinition } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function splitFaction(
  state: SimState,
  world: KernelWorld,
  args: {
    factionId: string;
    newPartyName: string;
    newPartyShort: string;
    politicianIds: string[];
  },
  commandId: string | null,
): { partyId: string; events: SimEvent[] } | { error: CommandError } {
  const facDef = world.factionDefinitions[args.factionId];
  const facState = state.factionStates[args.factionId];
  if (!facDef || !facState) return { error: reject("INVALID_FACTION", args.factionId) };
  if (!args.newPartyName.trim() || !args.newPartyShort.trim()) {
    return { error: reject("INVALID_SPLIT", "new party name required") };
  }
  const movers = [...new Set(args.politicianIds)].sort();
  if (movers.length === 0) return { error: reject("INVALID_SPLIT", "no politicians to move") };
  for (const id of movers) {
    const pol = state.politicians[id];
    if (!pol) return { error: reject("UNKNOWN_POLITICIAN", id) };
    if (!pol.alive) return { error: reject("POLITICIAN_DEAD", id) };
    if (pol.factionId !== args.factionId || pol.partyId !== facDef.partyId) {
      return { error: reject("INVALID_SPLIT", `${id} is not a member of the splitting faction`) };
    }
  }
  const originRule = world.partyDefinitions[facDef.partyId]?.nominationRuleId ?? "";
  const partyId = padId("DPARTY", state.counters.nextDynamicPartyId++);
  const created: DynamicPartyDefinition = {
    partyId,
    name: args.newPartyName,
    short: args.newPartyShort,
    originPartyId: facDef.partyId,
    originFactionId: args.factionId,
    nominationRuleId: originRule,
    createdDate: state.currentDate,
  };
  state.dynamicParties[partyId] = created;
  const previousChair = facState.chairId;
  const events: SimEvent[] = [];
  for (const id of movers) {
    vacatePartyLeadership(state, world, id, events, commandId);
    vacateFactionChair(state, world, id, events, commandId);
    const pol = state.politicians[id]!;
    pol.partyId = partyId;
    pol.factionId = null;
    recordPoliticalMemory(
      state,
      world,
      {
        ownerId: id,
        subjectIds: [id],
        kind: "betrayal",
        valence: -0.3,
        salience: 0.8,
        durability: "durable",
        tags: ["party_split"],
        metadata: { originPartyId: facDef.partyId, newPartyId: partyId, factionId: args.factionId },
      },
      state.currentDate,
    );
    reviewGoals(state, world, id, state.currentDate);
    reconcilePoliticianContestParticipation(world, state, id, events, commandId);
  }
  const remaining = factionMembers(state, args.factionId);
  if (remaining.length === 0) {
    facState.status = "split_origin";
    facState.chairId = null;
  } else if (previousChair && remaining.includes(previousChair)) {
    facState.status = "active";
    facState.chairId = previousChair;
  } else {
    facState.status = "chair_vacant";
    facState.chairId = null;
  }
  state.partyStates[partyId] = {
    partyId,
    leaderId: null,
    status: "leadership_vacant",
    cohesion: 0.55,
  };
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_LEADERSHIP_CONTEST_REQUIRED",
      importance: 0.7,
      visibility: "public",
      actorIds: [],
      entityIds: [partyId],
      payload: { partyId, reason: "faction_split" },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "FACTION_SPLIT",
      importance: 0.95,
      visibility: "public",
      actorIds: movers,
      entityIds: [partyId, facDef.partyId, args.factionId],
      payload: {
        newPartyId: partyId,
        originPartyId: facDef.partyId,
        factionId: args.factionId,
        politicianIds: movers,
        remainingFactionMembers: factionMembers(state, args.factionId),
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { partyId, events };
}
