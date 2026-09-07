import { addMonths } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { reviewGoals } from "../agents/goals.js";
import { splitFaction } from "../parties/split.js";
import { partyMembers, factionMembers } from "../parties/queries.js";
import { partyLegalStatus } from "../parties/state.js";
import { competitivePartiesAllowed } from "../provinces/constitutionGameplay.js";
import { pushHistory, padId } from "../scheduler.js";
import { vacatePartyLeadership, vacateFactionChair } from "../parties/membership.js";
import { reconcilePoliticianContestParticipation } from "../parties/lifecycle.js";
import { reconcileUnresolvedElectionCandidacies } from "../elections/field.js";
import { PARTY_PLATFORM_ISSUES } from "../parties/types.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { DynamicPartyDefinition } from "../parties/types.js";
import { ensurePoliticsRuntime } from "./state.js";
import { AS_MAX_LIFECYCLE_EVENTS_PER_YEAR, AS_PARTY_LIFECYCLE_COOLDOWN_MONTHS } from "./types.js";

/** Compatibility score in [0,1]. Size is a weak willingness factor, not the principal rule. */
export function scorePartyMergeCompatibility(
  state: SimState,
  absorbId: string,
  intoId: string,
): number {
  if (absorbId === intoId) return 0;
  const a = state.partyStates[absorbId];
  const b = state.partyStates[intoId];
  if (!a || !b || a.status === "defunct" || b.status === "defunct") return 0;

  const pa = a.publicPlatform?.positions;
  const pb = b.publicPlatform?.positions;
  let ideo = 0.35;
  if (pa && pb) {
    let sum = 0;
    for (const issue of PARTY_PLATFORM_ISSUES) {
      sum += 1 - Math.min(1, Math.abs((pa[issue] ?? 0) - (pb[issue] ?? 0)));
    }
    ideo = sum / PARTY_PLATFORM_ISSUES.length;
  }

  const runtime = ensurePoliticsRuntime(state);
  let coalHist = 0.45;
  for (const past of Object.values(runtime.coalitionAgreements)) {
    const hasA = past.partyIds.includes(absorbId);
    const hasB = past.partyIds.includes(intoId);
    if (hasA && hasB) coalHist += past.status === "broken" ? -0.12 : 0.18;
  }
  coalHist = Math.max(0, Math.min(1, coalHist));

  const family = runtime.partyFamilyHistory.filter(
    (link) =>
      (link.partyId === absorbId && link.relatedPartyId === intoId) ||
      (link.partyId === intoId && link.relatedPartyId === absorbId),
  );
  let familyScore = 0.5;
  if (family.some((f) => f.event === "split_from")) familyScore -= 0.25;
  if (family.some((f) => f.event === "merged_into" || f.event === "absorbed")) familyScore += 0.1;

  const nA = partyMembers(state, absorbId).length;
  const nB = partyMembers(state, intoId).length;
  const weakness = Math.max(0, Math.min(1, (12 - Math.min(nA, nB)) / 12));
  const sizeBalance = 1 - Math.min(1, Math.abs(nA - nB) / 20);

  // Hard veto: strongly incompatible platforms do not organically merge.
  if (ideo < 0.42) return ideo * 0.2;

  return Math.max(
    0,
    Math.min(
      1,
      ideo * 0.45 + coalHist * 0.2 + familyScore * 0.1 + weakness * 0.15 + sizeBalance * 0.1,
    ),
  );
}

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

function pushFamily(
  state: SimState,
  partyId: string,
  event: "split_from" | "merged_into" | "formed" | "absorbed",
  relatedPartyId: string | null,
  notes: string,
): void {
  ensurePoliticsRuntime(state).partyFamilyHistory.push({
    partyId,
    event,
    relatedPartyId,
    date: state.currentDate,
    notes,
  });
}

function formNewParty(
  world: KernelWorld,
  state: SimState,
  founders: string[],
  originPartyId: string | null,
  commandId: string,
): { partyId: string; events: SimEvent[] } | null {
  if (founders.length < 2) return null;
  const events: SimEvent[] = [];
  const partyId = padId("DPARTY", state.counters.nextDynamicPartyId++);
  const resolvedOrigin =
    originPartyId ??
    Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort()[0] ??
    Object.keys(world.partyDefinitions).sort()[0]!;
  const originRule =
    world.partyDefinitions[resolvedOrigin]?.nominationRuleId ??
    state.dynamicParties[resolvedOrigin]?.nominationRuleId ??
    Object.values(world.nominationRules).sort((a, b) => a.ruleId.localeCompare(b.ruleId))[0]
      ?.ruleId ??
    "";
  if (!originRule) return null;
  const created: DynamicPartyDefinition = {
    partyId,
    name: `${world.partyDefinitions[resolvedOrigin]?.short ?? "New"} Civic Alliance`,
    short: `CRA${partyId.slice(-2)}`,
    originPartyId: resolvedOrigin,
    originFactionId: null,
    nominationRuleId: originRule,
    createdDate: state.currentDate,
  };
  state.dynamicParties[partyId] = created;
  state.partyStates[partyId] = {
    partyId,
    leaderId: null,
    status: "leadership_vacant",
    cohesion: 0.5,
    publicPlatform: {
      updatedDate: state.currentDate,
      positions: {
        economy: 0,
        taxes: 0,
        labor: 0,
        housing: 0,
        social_policy: 0,
        environment: 0,
        institutional_reform: 0,
        foreign_policy: 0,
      },
      history: [],
    },
  };

  for (const id of founders) {
    vacatePartyLeadership(state, world, id, events, commandId);
    vacateFactionChair(state, world, id, events, commandId);
    const pol = state.politicians[id]!;
    const from = pol.partyId;
    pol.partyId = partyId;
    pol.factionId = null;
    recordPoliticalMemory(
      state,
      world,
      {
        ownerId: id,
        subjectIds: [id],
        kind: "generic",
        valence: 0.2,
        salience: 0.55,
        durability: "durable",
        tags: ["party_formation"],
        metadata: { newPartyId: partyId, fromPartyId: from },
      },
      state.currentDate,
    );
    reviewGoals(state, world, id, state.currentDate);
    reconcilePoliticianContestParticipation(world, state, id, events, commandId);
    reconcileUnresolvedElectionCandidacies(world, state, id);
  }

  pushFamily(state, partyId, "formed", resolvedOrigin, "force_or_rare_formation");
  pushFamily(state, resolvedOrigin, "split_from", partyId, "source_of_formation");

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_LIFECYCLE_FORMATION",
      importance: 0.9,
      visibility: "public",
      actorIds: founders,
      entityIds: [partyId, resolvedOrigin],
      payload: { newPartyId: partyId, originPartyId: resolvedOrigin, founderIds: founders },
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
      entityIds: [partyId],
      payload: { partyId, reason: "party_formation" },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { partyId, events };
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
          pushFamily(state, split.partyId, "split_from", partyId, "fixture_split");
          pushFamily(state, partyId, "split_from", split.partyId, "origin_of_split");
          markCooldown(state, partyId, "split");
          markCooldown(state, split.partyId, "split");
          runtime.lifecycleEventsThisYear += 1;
          runtime.lifecycleFixtureOverride = null;
          return events;
        }
      }
    }
  }

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

  if (fixture?.forceFormation) {
    const independents = Object.values(state.politicians)
      .filter(
        (p) =>
          p.alive &&
          !p.retired &&
          p.id !== state.playerPoliticianId &&
          (p.partyId == null ||
            (getAgentProfile(world, state, p.id)?.traits.partyLoyalty ?? 0.5) < 0.35),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 4)
      .map((p) => p.id);
    const formed = formNewParty(
      world,
      state,
      independents.length >= 2
        ? independents
        : Object.values(state.politicians)
            .filter((p) => p.alive && !p.retired && p.id !== state.playerPoliticianId && p.partyId)
            .sort(
              (a, b) =>
                (getAgentProfile(world, state, a.id)?.traits.partyLoyalty ?? 1) -
                  (getAgentProfile(world, state, b.id)?.traits.partyLoyalty ?? 1) ||
                a.id.localeCompare(b.id),
            )
            .slice(0, 3)
            .map((p) => p.id),
      independents[0] ? (state.politicians[independents[0]]?.partyId ?? null) : null,
      commandId,
    );
    if (formed) {
      events.push(...formed.events);
      markCooldown(state, formed.partyId, "formation");
      runtime.lifecycleEventsThisYear += 1;
      runtime.lifecycleFixtureOverride = null;
      return events;
    }
  }

  const floor = fixture?.probabilityFloor ?? 0.012;
  for (const partyId of Object.keys(state.partyStates).sort()) {
    if (onCooldown(state, partyId)) continue;
    if (partyLegalStatus(state, partyId) === "prohibited") continue;
    if (state.partyStates[partyId]?.status === "defunct") continue;
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
    pushFamily(state, split.partyId, "split_from", partyId, "natural_split");
    pushFamily(state, partyId, "split_from", split.partyId, "origin_of_split");
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

  // Rare organic formation from low-loyalty cluster.
  if (rng.float01("npc-decisions") < floor * 0.35) {
    const lowLoyalty = Object.values(state.politicians)
      .filter(
        (p) =>
          p.alive &&
          !p.retired &&
          p.id !== state.playerPoliticianId &&
          p.partyId &&
          (getAgentProfile(world, state, p.id)?.traits.partyLoyalty ?? 1) < 0.28 &&
          (getAgentProfile(world, state, p.id)?.traits.ambition ?? 0) >= 0.55,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (lowLoyalty.length >= 3) {
      const origin = lowLoyalty[0]!.partyId;
      const formed = formNewParty(
        world,
        state,
        lowLoyalty.slice(0, 3).map((p) => p.id),
        origin,
        commandId,
      );
      if (formed) {
        events.push(...formed.events);
        markCooldown(state, formed.partyId, "formation");
        if (origin) markCooldown(state, origin, "formation");
        runtime.lifecycleEventsThisYear += 1;
        return events;
      }
    }
  }

  if (rng.float01("npc-decisions") < floor * 0.5) {
    const candidates = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .map((id) => ({ id, n: partyMembers(state, id).length }))
      .filter((row) => row.n > 0 && row.n <= 10)
      .sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
    let best: { absorbId: string; intoId: string; score: number } | null = null;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const absorbId = candidates[i]!.id;
        const intoId = candidates[j]!.id;
        const score = scorePartyMergeCompatibility(state, absorbId, intoId);
        if (score < 0.55) continue;
        if (!best || score > best.score || (score === best.score && absorbId < best.absorbId)) {
          best = { absorbId, intoId, score };
        }
      }
    }
    if (best) {
      const mergeEvents = mergeParties(world, state, best.absorbId, best.intoId, commandId);
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
  if (state.partyStates[absorbId]?.status === "defunct") return [];
  if (state.partyStates[intoId]?.status === "defunct") return [];

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
    absorb.status = "defunct";
  }

  pushFamily(state, absorbId, "merged_into", intoId, "absorbed_by_merge");
  pushFamily(state, intoId, "absorbed", absorbId, "surviving_party");

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
      payload: {
        absorbedPartyId: absorbId,
        survivingPartyId: intoId,
        predecessorPartyId: absorbId,
        successorPartyId: intoId,
        mergeDate: state.currentDate,
        politicianIds: movers,
        compatibilityScore: scorePartyMergeCompatibility(state, absorbId, intoId),
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}
