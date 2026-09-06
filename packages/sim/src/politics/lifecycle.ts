import { addMonths } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { reviewGoals } from "../agents/goals.js";
import { splitFaction } from "../parties/split.js";
import { partyMembers, factionMembers } from "../parties/queries.js";
import { partyLegalStatus } from "../parties/state.js";
import { competitivePartiesAllowed } from "../provinces/constitutionGameplay.js";
import { pushHistory } from "../scheduler.js";
import { vacatePartyLeadership, vacateFactionChair } from "../parties/membership.js";
import { reconcilePoliticianContestParticipation } from "../parties/lifecycle.js";
import { reconcileUnresolvedElectionCandidacies } from "../elections/field.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { ensurePoliticsRuntime } from "./state.js";
import { AS_MAX_LIFECYCLE_EVENTS_PER_YEAR, AS_PARTY_LIFECYCLE_COOLDOWN_MONTHS } from "./types.js";

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function onCooldown(state: SimState, partyId: string): boolean {
  const runtime = ensurePoliticsRuntime(state);
  const row = runtime.partyLifecycleCooldown[partyId];
  if (!row) return false;
  return addMonths(row.lastEventDate, AS_PARTY_LIFECYCLE_COOLDOWN_MONTHS) > state.currentDate;
}

function markCooldown(
  state: SimState,
  partyId: string,
  kind: "split" | "merge" | "formation",
): void {
  ensurePoliticsRuntime(state).partyLifecycleCooldown[partyId] = {
    partyId,
    lastEventDate: state.currentDate,
    lastKind: kind,
  };
}

/**
 * RARE deterministic Party split/merge/formation using fixtures/high thresholds.
 * History events; respects single_legal_party / competitivePartiesAllowed.
 */
export function processPartyLifecycleMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const year = Number(state.currentDate.slice(0, 4));
  if (runtime.lifecycleEventYear !== year) {
    runtime.lifecycleEventYear = year;
    runtime.lifecycleEventsThisYear = 0;
  }
  if (runtime.lifecycleEventsThisYear >= AS_MAX_LIFECYCLE_EVENTS_PER_YEAR) return [];
  if (!competitivePartiesAllowed(state)) return [];

  const fixture = runtime.lifecycleFixtureOverride;
  const events: SimEvent[] = [];

  // Forced split via fixture (tests).
  if (fixture?.forceSplitPartyId) {
    const partyId = fixture.forceSplitPartyId;
    const factions = Object.values(state.factionStates)
      .filter((f) => f.partyId === partyId && f.status === "active")
      .sort((a, b) => a.factionId.localeCompare(b.factionId));
    const faction = factions[0];
    if (faction) {
      const movers = factionMembers(state, faction.factionId)
        .filter((id) => id !== state.playerPoliticianId)
        .slice(0, Math.max(2, Math.floor(factionMembers(state, faction.factionId).length / 2)));
      if (movers.length >= 2) {
        const split = splitFaction(
          state,
          world,
          {
            factionId: faction.factionId,
            newPartyName: `${world.partyDefinitions[partyId]?.short ?? partyId} Breakaway`,
            newPartyShort: `${(world.partyDefinitions[partyId]?.short ?? "NP").slice(0, 3)}B`,
            politicianIds: movers,
          },
          commandId,
        );
        if (!("error" in split)) {
          events.push(...split.events);
          markCooldown(state, partyId, "split");
          markCooldown(state, split.partyId, "split");
          runtime.lifecycleEventsThisYear += 1;
          runtime.lifecycleFixtureOverride = null;
          return events;
        }
      }
    }
  }

  // Forced merge via fixture.
  if (fixture?.forceMergePartyIds) {
    const [a, b] = fixture.forceMergePartyIds;
    const mergeEvents = mergeParties(world, state, a, b, commandId);
    if (mergeEvents.length > 0) {
      events.push(...mergeEvents);
      runtime.lifecycleEventsThisYear += 1;
      runtime.lifecycleFixtureOverride = null;
      return events;
    }
  }

  // Natural rare split: very low cohesion + large discontented faction.
  const floor = fixture?.probabilityFloor ?? 0.012;
  for (const partyId of Object.keys(state.partyStates).sort()) {
    if (onCooldown(state, partyId)) continue;
    if (partyLegalStatus(state, partyId) === "prohibited") continue;
    const party = state.partyStates[partyId]!;
    if (party.cohesion > 0.38) continue;
    const factions = Object.values(state.factionStates)
      .filter((f) => f.partyId === partyId && f.status === "active")
      .sort(
        (a, b) =>
          factionMembers(state, b.factionId).length - factionMembers(state, a.factionId).length,
      );
    const faction = factions[0];
    if (!faction) continue;
    const movers = factionMembers(state, faction.factionId).filter(
      (id) => id !== state.playerPoliticianId,
    );
    if (movers.length < 3) continue;
    const meanFactionLoyalty =
      movers.reduce(
        (sum, id) => sum + (getAgentProfile(world, state, id)?.traits.factionLoyalty ?? 0.5),
        0,
      ) / movers.length;
    if (meanFactionLoyalty < 0.55) continue;
    const roll = rng.float01("npc-decisions");
    const chance =
      floor +
      (0.38 - party.cohesion) * 0.04 +
      (stableHash(`${partyId}:${state.currentDate}:split`) % 100) / 10000;
    if (roll > chance) continue;

    const take = movers
      .slice()
      .sort(
        (x, y) =>
          (getAgentProfile(world, state, y)?.traits.factionLoyalty ?? 0) -
            (getAgentProfile(world, state, x)?.traits.factionLoyalty ?? 0) || x.localeCompare(y),
      )
      .slice(0, Math.max(3, Math.floor(movers.length * 0.6)));
    const split = splitFaction(
      state,
      world,
      {
        factionId: faction.factionId,
        newPartyName: `${world.partyDefinitions[partyId]?.name ?? partyId} Reform League`,
        newPartyShort: `RL${partyId.slice(-2)}`,
        politicianIds: take,
      },
      commandId,
    );
    if ("error" in split) continue;
    events.push(...split.events);
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_LIFECYCLE_SPLIT",
        importance: 0.95,
        visibility: "public",
        actorIds: take,
        entityIds: [partyId, split.partyId, faction.factionId],
        payload: {
          originPartyId: partyId,
          newPartyId: split.partyId,
          factionId: faction.factionId,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    markCooldown(state, partyId, "split");
    markCooldown(state, split.partyId, "split");
    runtime.lifecycleEventsThisYear += 1;
    return events;
  }

  // Rare merge of two tiny parties with similar platforms.
  if (rng.float01("npc-decisions") < floor * 0.5) {
    const small = Object.keys(state.partyStates)
      .map((id) => ({ id, n: partyMembers(state, id).length }))
      .filter((row) => row.n > 0 && row.n <= 6)
      .sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
    if (small.length >= 2) {
      const mergeEvents = mergeParties(world, state, small[0]!.id, small[1]!.id, commandId);
      if (mergeEvents.length > 0) {
        events.push(...mergeEvents);
        runtime.lifecycleEventsThisYear += 1;
        return events;
      }
    }
  }

  return events;
}

function mergeParties(
  world: KernelWorld,
  state: SimState,
  absorbId: string,
  intoId: string,
  commandId: string,
): SimEvent[] {
  if (absorbId === intoId) return [];
  if (onCooldown(state, absorbId) || onCooldown(state, intoId)) return [];
  if (!competitivePartiesAllowed(state)) return [];
  if (partyLegalStatus(state, absorbId) === "prohibited") return [];
  if (partyLegalStatus(state, intoId) === "prohibited") return [];

  const movers = partyMembers(state, absorbId).filter((id) => id !== state.playerPoliticianId);
  if (movers.length === 0) return [];
  const events: SimEvent[] = [];

  for (const id of movers) {
    vacatePartyLeadership(state, world, id, events, commandId);
    vacateFactionChair(state, world, id, events, commandId);
    const pol = state.politicians[id]!;
    pol.partyId = intoId;
    pol.factionId = null;
    recordPoliticalMemory(
      state,
      world,
      {
        ownerId: id,
        subjectIds: [id],
        kind: "generic",
        valence: 0.1,
        salience: 0.5,
        durability: "normal",
        tags: ["party_merge"],
        metadata: { fromPartyId: absorbId, toPartyId: intoId },
      },
      state.currentDate,
    );
    reviewGoals(state, world, id, state.currentDate);
    reconcilePoliticianContestParticipation(world, state, id, events, commandId);
    reconcileUnresolvedElectionCandidacies(world, state, id);
  }

  const absorb = state.partyStates[absorbId];
  if (absorb) {
    absorb.leaderId = null;
    absorb.status = "leadership_vacant";
  }

  markCooldown(state, absorbId, "merge");
  markCooldown(state, intoId, "merge");

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_LIFECYCLE_MERGE",
      importance: 0.9,
      visibility: "public",
      actorIds: movers,
      entityIds: [absorbId, intoId],
      payload: { absorbedPartyId: absorbId, survivingPartyId: intoId, politicianIds: movers },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}
