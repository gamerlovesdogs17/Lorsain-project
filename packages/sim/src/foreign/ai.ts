import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { pushHistory } from "../scheduler.js";
import {
  TERENA_WORLD_ID,
  type MilitaryPostureLevel,
  type PendingIncomingDiplomacy,
} from "./types.js";
import {
  bilateralKey,
  allocateDiplomaticActionId,
  allocateIncomingDiplomacyId,
  getBilateralRelation,
} from "./state.js";
import { adjustRelation, outreachRelationDelta } from "./relations.js";
import { goalActionBias } from "./goals.js";
import { isSmallPowerTier, isSuperpowerTier } from "./capabilities.js";
import { activeCrises, escalateCrisis, deescalateCrisis } from "./crises.js";
import { beginConflictFromCrisisWithWarTrigger } from "./conflicts.js";
import { imposeSanctions, liftSanctions } from "./sanctions.js";
import { proposeTreaty } from "./treaties.js";
import { deterrenceModifier } from "./treaty-effects.js";

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

function queueIncomingForPlayerPresident(
  world: KernelWorld,
  state: SimState,
  pending: Omit<PendingIncomingDiplomacy, "id">,
): void {
  if (currentPresidentialAuthorityId(world, state) !== state.playerPoliticianId) return;
  state.foreignAffairsRuntime.pendingIncomingDiplomacy.push({
    ...pending,
    id: allocateIncomingDiplomacyId(state),
  });
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

function resolveActorTarget(pair: [string, string]): { actorId: string; targetId: string } {
  const [aId, bId] = pair;
  if (aId === TERENA_WORLD_ID) return { actorId: bId, targetId: TERENA_WORLD_ID };
  if (bId === TERENA_WORLD_ID) return { actorId: aId, targetId: TERENA_WORLD_ID };
  return { actorId: aId, targetId: bId };
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

function aiWarning(
  state: SimState,
  actorId: string,
  targetId: string,
  commandId: string,
): SimEvent[] {
  const rel = getBilateralRelation(state.foreignAffairsRuntime, actorId, targetId);
  if (!rel) return [];
  adjustRelation(rel, { general: -3, securityTension: 0.06, trust: -0.04 });
  rel.lastUpdated = state.currentDate;
  recordAction(state, { actorCountryId: actorId, targetCountryId: targetId, kind: "warning", commandId });
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "DIPLOMATIC_WARNING",
      importance: 0.55,
      visibility: "public",
      actorIds: [actorId],
      entityIds: [targetId],
      payload: { actorId, targetId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

function aiExercises(
  state: SimState,
  actorId: string,
  targetId: string | null,
  commandId: string,
): SimEvent[] {
  recordAction(state, {
    actorCountryId: actorId,
    targetCountryId: targetId,
    kind: "exercises",
    commandId,
  });
  if (targetId) {
    const rel = getBilateralRelation(state.foreignAffairsRuntime, actorId, targetId);
    if (rel) {
      adjustRelation(rel, { securityTension: 0.05, trust: -0.03 });
      rel.lastUpdated = state.currentDate;
    }
  }
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "MILITARY_EXERCISES",
      importance: 0.6,
      visibility: "public",
      actorIds: [actorId],
      entityIds: targetId ? [targetId] : [],
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

function nextPosture(current: MilitaryPostureLevel, escalate: boolean): MilitaryPostureLevel {
  const order: MilitaryPostureLevel[] = ["normal", "heightened", "mobilized", "crisis_deployment"];
  const idx = order.indexOf(current);
  if (escalate) return order[Math.min(order.length - 1, idx + 1)] ?? current;
  return order[Math.max(0, idx - 1)] ?? current;
}

function aiTreatyToTerena(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  commandId: string,
): SimEvent[] {
  const actorCanon = world.worldCountries[actorId];
  if (!actorCanon) return [];
  const out = proposeTreaty(
    state,
    {
      proposerId: actorId,
      kind: "trade",
      title: `${actorCanon.name}–Terena Trade Accord`,
      memberIds: [actorId, TERENA_WORLD_ID],
      requiresRatification: false,
    },
    commandId,
  );
  if ("error" in out) return [];
  queueIncomingForPlayerPresident(world, state, {
    kind: "treaty_proposal",
    actorCountryId: actorId,
    targetCountryId: TERENA_WORLD_ID,
    treatyId: out.treaty.id,
    treatyKind: out.treaty.kind,
    title: out.treaty.title,
    date: state.currentDate,
    metadata: {},
  });
  return out.events;
}

function tryLiftSanctions(
  state: SimState,
  actorId: string,
  targetId: string,
  rel: NonNullable<ReturnType<typeof getBilateralRelation>>,
  commandId: string,
): SimEvent[] | null {
  const active = Object.values(state.foreignAffairsRuntime.sanctions).find(
    (s) => s.active && s.imposerId === actorId && s.targetId === targetId,
  );
  if (!active || rel.securityTension > 0.42) return null;
  if (rel.general < -55) return null;
  const out = liftSanctions(state, { imposerId: actorId, targetId }, commandId);
  if ("error" in out) return null;
  return out.events;
}

export function processForeignAiMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const pairs = pickActorPairs(world, state, rng, 12);

  for (const pair of pairs) {
    let { actorId, targetId } = resolveActorTarget(pair);
    if (pair[0] !== TERENA_WORLD_ID && pair[1] !== TERENA_WORLD_ID) {
      actorId = rng.float01("foreign-affairs") < 0.5 ? pair[0]! : pair[1]!;
      targetId = actorId === pair[0] ? pair[1]! : pair[0]!;
    }

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

    const lifted = tryLiftSanctions(state, actorId, targetId, rel, commandId);
    if (lifted) {
      events.push(...lifted);
      continue;
    }

    if (roll < 0.22 + outreachBias * 0.15) {
      events.push(...aiOutreach(world, state, actorId, targetId, commandId));
    } else if (roll < 0.26 && rel.securityTension > 0.4) {
      events.push(...aiWarning(state, actorId, targetId, commandId));
    } else if (roll < 0.28 + sanctionBias * 0.08 && rel.general < -5) {
      if (isSuperpowerTier(actorCanon.powerTier) || !isSmallPowerTier(actorCanon.powerTier)) {
        const out = imposeSanctions(
          state,
          {
            imposerId: actorId,
            targetId,
            severity: 0.25 + rng.float01("foreign-affairs") * 0.35,
            scope: rel.general < -30 ? "sectoral" : "targeted",
          },
          commandId,
        );
        if ("events" in out) events.push(...out.events);
      }
    } else if (roll < 0.31 + treatyBias * 0.06 && rel.general > 20) {
      if (targetId === TERENA_WORLD_ID) {
        events.push(...aiTreatyToTerena(world, state, actorId, commandId));
      } else {
        const out = proposeTreaty(
          state,
          {
            proposerId: actorId,
            kind: "trade",
            title: `${actorCanon.name}–${world.worldCountries[targetId]?.name ?? targetId} Trade Accord`,
            memberIds: [actorId, targetId],
            requiresRatification: false,
          },
          commandId,
        );
        if ("error" in out) continue;
        events.push(...out.events);
      }
    } else if (roll < 0.35 && rel.securityTension > 0.45) {
      events.push(...aiExercises(state, actorId, targetId, commandId));
    } else if (roll < 0.38 + postureBias * 0.05 && rel.securityTension > 0.35) {
      const escalate = actorRuntime.posture !== "mobilized" && rel.securityTension > 0.5;
      const next = nextPosture(actorRuntime.posture, escalate);
      events.push(...aiPostureChange(state, actorId, next, commandId));
    } else if (roll < 0.42 && rel.securityTension < 0.3 && actorRuntime.posture !== "normal") {
      events.push(...aiPostureChange(state, actorId, nextPosture(actorRuntime.posture, false), commandId));
    } else if (roll < 0.43 + warBias * 0.02 && rel.securityTension > 0.65 && isSuperpowerTier(actorCanon.powerTier)) {
      const deterrence = deterrenceModifier(state.foreignAffairsRuntime, actorId, targetId);
      if (rng.float01("foreign-affairs") < 0.08 - deterrence * 0.05) {
        const crisis = Object.values(state.foreignAffairsRuntime.crises).find(
          (c) =>
            c.stage !== "settled" &&
            c.participantIds.includes(actorId) &&
            c.participantIds.includes(targetId),
        );
        if (crisis && crisis.stage === "active") {
          events.push(
            ...beginConflictFromCrisisWithWarTrigger(
              world,
              state,
              crisis,
              state.currentDate,
              commandId,
              actorId,
            ).events,
          );
        } else if (crisis) {
          escalateCrisis(crisis, state.currentDate, 1);
        }
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
