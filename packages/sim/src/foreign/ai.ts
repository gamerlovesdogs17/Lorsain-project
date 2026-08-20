import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { TERENA_WORLD_ID } from "./types.js";
import { bilateralKey, allocateDiplomaticActionId, getBilateralRelation } from "./state.js";
import { adjustRelation, outreachRelationDelta } from "./relations.js";
import { goalActionBias } from "./goals.js";
import { isSmallPowerTier, isSuperpowerTier } from "./capabilities.js";
import { activeCrises, escalateCrisis, deescalateCrisis } from "./crises.js";
import { beginConflictFromCrisis } from "./conflicts.js";
import { imposeSanctions } from "./sanctions.js";
import { proposeTreaty } from "./treaties.js";
import type { MilitaryPostureLevel } from "./types.js";

function recordAction(
  state: SimState,
  args: {
    actorCountryId: string;
    targetCountryId: string | null;
    kind: import("./types.js").DiplomaticActionKind;
    commandId: string;
  },
): string {
  const id = allocateDiplomaticActionId(state);
  state.foreignAffairsRuntime.diplomaticActions[id] = {
    id,
    date: state.currentDate,
    actorCountryId: args.actorCountryId,
    targetCountryId: args.targetCountryId,
    kind: args.kind,
    initiator: "ai",
    metadata: {},
  };
  return id;
}

function relevantPairs(world: KernelWorld, state: SimState): Array<[string, string]> {
  const pairs = new Set<string>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    pairs.add(bilateralKey(a, b));
  };
  const countries = world.worldCountries;
  for (const c of Object.values(countries)) {
    if (c.relationWithTerena !== 0 || c.neighborIds.includes(TERENA_WORLD_ID)) {
      add(c.id, TERENA_WORLD_ID);
    }
    for (const n of c.neighborIds) add(c.id, n);
  }
  for (const crisis of activeCrises(state.foreignAffairsRuntime)) {
    const ids = crisis.participantIds;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) add(ids[i]!, ids[j]!);
    }
  }
  return [...pairs].map((key) => {
    const [a, b] = key.split("|") as [string, string];
    return [a, b] as [string, string];
  });
}

function pickActorPairs(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  maxPairs: number,
): Array<[string, string]> {
  const all = relevantPairs(world, state);
  if (all.length <= maxPairs) return all;
  const picked: Array<[string, string]> = [];
  const used = new Set<string>();
  while (picked.length < maxPairs && used.size < all.length) {
    const idx = Math.floor(rng.float01("foreign-affairs") * all.length);
    const pair = all[idx]!;
    const key = bilateralKey(pair[0], pair[1]);
    if (used.has(key)) continue;
    used.add(key);
    picked.push(pair);
  }
  return picked.sort((a, b) => bilateralKey(a[0], a[1]).localeCompare(bilateralKey(b[0], b[1])));
}

function aiOutreach(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  targetId: string,
  commandId: string,
): SimEvent[] {
  const actor = world.worldCountries[actorId];
  const rel = getBilateralRelation(state.foreignAffairsRuntime, actorId, targetId);
  if (!actor || !rel) return [];
  const delta = outreachRelationDelta(actor.powerTier);
  adjustRelation(rel, delta);
  rel.lastUpdated = state.currentDate;
  recordAction(state, { actorCountryId: actorId, targetCountryId: targetId, kind: "outreach", commandId });
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "FOREIGN_OUTREACH",
      importance: 0.4,
      visibility: "public",
      actorIds: [actorId],
      entityIds: [targetId],
      payload: { actorId, targetId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

function aiPostureChange(
  state: SimState,
  countryId: string,
  posture: MilitaryPostureLevel,
  commandId: string,
): SimEvent[] {
  const runtime = state.foreignAffairsRuntime.countries[countryId];
  if (!runtime || runtime.posture === posture) return [];
  runtime.posture = posture;
  recordAction(state, {
    actorCountryId: countryId,
    targetCountryId: null,
    kind: "posture_change",
    commandId,
  });
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "MILITARY_POSTURE_CHANGED",
      importance: 0.55,
      visibility: "public",
      actorIds: [countryId],
      entityIds: [],
      payload: { countryId, posture },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function processForeignAiMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const pairs = pickActorPairs(world, state, rng, 12);
  for (const [aId, bId] of pairs) {
    if (aId === TERENA_WORLD_ID || bId === TERENA_WORLD_ID) continue;
    const actorId = rng.float01("foreign-affairs") < 0.5 ? aId : bId;
    const targetId = actorId === aId ? bId : aId;
    const actorCanon = world.worldCountries[actorId];
    const actorRuntime = state.foreignAffairsRuntime.countries[actorId];
    if (!actorCanon || !actorRuntime) continue;
    const rel = getBilateralRelation(state.foreignAffairsRuntime, actorId, targetId);
    if (!rel) continue;
    const goals = actorRuntime.strategicGoals;
    const roll = rng.float01("foreign-affairs");
    const outreachBias = goalActionBias(goals, "outreach");
    const sanctionBias = goalActionBias(goals, "sanctions");
    const treatyBias = goalActionBias(goals, "treaty");
    const postureBias = goalActionBias(goals, "posture");
    const warBias = goalActionBias(goals, "war");

    if (roll < 0.22 + outreachBias * 0.15) {
      events.push(...aiOutreach(world, state, actorId, targetId, commandId));
    } else if (roll < 0.28 + sanctionBias * 0.08 && rel.general < -5) {
      if (isSuperpowerTier(actorCanon.powerTier) || isSmallPowerTier(actorCanon.powerTier) === false) {
        const out = imposeSanctions(state, {
          imposerId: actorId,
          targetId,
          severity: 0.25 + rng.float01("foreign-affairs") * 0.35,
        }, commandId);
        if ("events" in out) events.push(...out.events);
      }
    } else if (roll < 0.32 + treatyBias * 0.06 && rel.general > 20) {
      const out = proposeTreaty(state, {
        proposerId: actorId,
        kind: "trade",
        title: `${actorCanon.name}–${world.worldCountries[targetId]?.name ?? targetId} Trade Accord`,
        memberIds: [actorId, targetId],
        requiresRatification: false,
      }, commandId);
      events.push(...out.events);
    } else if (roll < 0.38 + postureBias * 0.05 && rel.securityTension > 0.35) {
      const next: MilitaryPostureLevel =
        actorRuntime.posture === "normal" ? "heightened" : actorRuntime.posture;
      events.push(...aiPostureChange(state, actorId, next, commandId));
    } else if (roll < 0.39 + warBias * 0.02 && rel.securityTension > 0.65 && isSuperpowerTier(actorCanon.powerTier)) {
      const crisis = Object.values(state.foreignAffairsRuntime.crises).find(
        (c) =>
          c.stage !== "settled" &&
          c.participantIds.includes(actorId) &&
          c.participantIds.includes(targetId),
      );
      if (crisis && crisis.stage === "active" && rng.float01("foreign-affairs") < 0.08) {
        events.push(...beginConflictFromCrisis(state, crisis, state.currentDate, commandId).events);
      } else if (crisis) {
        escalateCrisis(crisis, state.currentDate, 1);
      }
    } else if (rel.securityTension > 0.5 && rng.float01("foreign-affairs") < 0.12) {
      const crisis = Object.values(state.foreignAffairsRuntime.crises).find(
        (c) => c.focalPairKey === bilateralKey(actorId, targetId) && c.stage !== "settled",
      );
      if (crisis) deescalateCrisis(crisis, state.currentDate);
    }
  }
  return events;
}
