import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { allocateConflictId, getBilateralRelation } from "./state.js";
import { transitionActive } from "./crises.js";
import { armWarTriggerForTerenaConflict } from "./war-powers-bridge.js";
import { aggregateMilitaryStrength } from "./capabilities.js";
import { deterrenceModifier } from "./treaty-effects.js";
import type { InternationalConflict, InternationalCrisis } from "./types.js";
import { TERENA_WORLD_ID } from "./types.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function computeInitialBalance(
  state: SimState,
  world: KernelWorld,
  aggressorId: string | null,
  defenderId: string,
  otherIds: string[],
): number {
  const runtime = state.foreignAffairsRuntime;
  const agg = aggressorId ? runtime.countries[aggressorId] : null;
  const def = runtime.countries[defenderId];
  if (!agg || !def) return 0.5;

  const aggMil = aggregateMilitaryStrength(agg.capabilities) + agg.capabilities.economic * 0.15;
  const defMil = aggregateMilitaryStrength(def.capabilities) + def.capabilities.economic * 0.15;
  let balance = aggMil / Math.max(0.15, aggMil + defMil);

  const rel = getBilateralRelation(runtime, aggressorId!, defenderId);
  if (rel) balance += rel.securityTension * 0.08 - deterrenceModifier(runtime, aggressorId!, defenderId);

  for (const allyId of otherIds) {
    const ally = runtime.countries[allyId];
    if (!ally) continue;
    const onAggressorSide = allyId === aggressorId;
    const strength = aggregateMilitaryStrength(ally.capabilities) * 0.08;
    balance += onAggressorSide ? strength : -strength;
  }

  const aggCanon = world.worldCountries[aggressorId!];
  const defCanon = world.worldCountries[defenderId];
  if (aggCanon?.neighborIds.includes(defenderId)) balance += 0.04;
  if (defCanon?.neighborIds.includes(aggressorId!)) balance -= 0.03;

  return clamp01(balance);
}

function deriveObjectives(crisis: InternationalCrisis, aggressorId: string | null): string[] {
  const cause = (crisis.metadata.cause as string | undefined) ?? "emergence";
  if (cause.includes("maritime") || cause.includes("naval")) return ["maritime_access"];
  if (cause.includes("border") || cause.includes("territorial")) return ["border_security"];
  if (cause.includes("alliance")) return ["alliance_defense"];
  if (crisis.intensity > 0.75) return ["coercive_settlement"];
  if (aggressorId) return ["limited_punitive"];
  return ["border_security"];
}

export function beginConflictFromCrisis(
  state: SimState,
  world: KernelWorld,
  crisis: InternationalCrisis,
  date: IsoDate,
  commandId: string | null,
  aggressorId?: string,
): { conflict: InternationalConflict; events: SimEvent[] } {
  const id = allocateConflictId(state);
  const sortedParticipants = [...crisis.participantIds].sort();
  const aggressor =
    aggressorId ??
    (crisis.metadata.aggressorId as string | undefined) ??
    sortedParticipants[0] ??
    null;
  const defender =
    sortedParticipants.find((p) => p !== aggressor) ?? sortedParticipants[1] ?? sortedParticipants[0]!;
  const others = sortedParticipants.filter((p) => p !== aggressor && p !== defender);

  const conflict: InternationalConflict = {
    id,
    belligerentIds: sortedParticipants,
    aggressorId: aggressor,
    startedDate: date,
    endedDate: null,
    intensity: Math.min(1, crisis.intensity + 0.2),
    crisisId: crisis.id,
    objectives: deriveObjectives(crisis, aggressor),
    balance: computeInitialBalance(state, world, aggressor, defender, others),
    politicalCost: 0.25 + crisis.intensity * 0.15,
    outcome: null,
    ceasefireDate: null,
    warPowerId: null,
    metadata: { sourceCrisis: crisis.id, cause: crisis.metadata.cause ?? "emergence" },
  };
  state.foreignAffairsRuntime.conflicts[id] = conflict;
  transitionActive(crisis, date, "conflict");

  const events: SimEvent[] = [
    pushHistory(state, {
      date,
      type: "INTERNATIONAL_CONFLICT_STARTED",
      importance: 0.95,
      visibility: "public",
      actorIds: crisis.participantIds,
      entityIds: [id, crisis.id],
      payload: {
        conflictId: id,
        crisisId: crisis.id,
        aggressorId: aggressor,
        balance: conflict.balance,
        objectives: conflict.objectives,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];

  return { conflict, events };
}

export function armTerenaWarTriggerIfNeeded(
  world: KernelWorld,
  state: SimState,
  conflict: InternationalConflict,
): void {
  armWarTriggerForTerenaConflict(world, state, conflict);
}

function capabilityDelta(state: SimState, conflict: InternationalConflict): number {
  const runtime = state.foreignAffairsRuntime;
  const agg = conflict.aggressorId ? runtime.countries[conflict.aggressorId] : null;
  const defenderId = conflict.belligerentIds.find((id) => id !== conflict.aggressorId);
  const def = defenderId ? runtime.countries[defenderId] : null;
  if (!agg || !def) return 0;
  const aggScore = aggregateMilitaryStrength(agg.capabilities);
  const defScore = aggregateMilitaryStrength(def.capabilities);
  return (aggScore - defScore) * 0.012;
}

export function processConflictMonth(
  state: SimState,
  world: KernelWorld,
  date: IsoDate,
  commandId: string | null = null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const conflict of Object.values(state.foreignAffairsRuntime.conflicts)) {
    if (conflict.endedDate) continue;

    const capShift = capabilityDelta(state, conflict);
    conflict.balance = clamp01(conflict.balance + capShift + (conflict.intensity > 0.5 ? 0.004 : -0.003));

    const tradeCost = conflict.belligerentIds.reduce((acc, id) => {
      const c = state.foreignAffairsRuntime.countries[id];
      return acc + (c?.tradeExposure ?? 0);
    }, 0);
    conflict.politicalCost = clamp01(
      conflict.politicalCost + 0.006 + tradeCost * 0.004 + conflict.intensity * 0.003,
    );

    const settlePressure = conflict.politicalCost * 0.5 + (1 - conflict.intensity) * 0.2;
    if (settlePressure > 0.55) {
      conflict.intensity = Math.max(0.15, conflict.intensity - 0.025);
    } else {
      conflict.intensity = Math.max(0.15, conflict.intensity - 0.012);
    }

    if (conflict.intensity <= 0.22 || conflict.politicalCost >= 0.92) {
      conflict.endedDate = date;
      conflict.ceasefireDate = date;
      if (conflict.balance > 0.58) conflict.outcome = "limited_aggressor_success";
      else if (conflict.balance < 0.42) conflict.outcome = "limited_defender_success";
      else if (conflict.intensity <= 0.2) conflict.outcome = "ceasefire";
      else conflict.outcome = "stalemate";

      if (conflict.crisisId) {
        const crisis = state.foreignAffairsRuntime.crises[conflict.crisisId];
        if (crisis) {
          crisis.stage = "deescalating";
          crisis.lastStageChange = date;
        }
      }

      events.push(
        pushHistory(state, {
          date,
          type: "INTERNATIONAL_CONFLICT_ENDED",
          importance: 0.85,
          visibility: "public",
          actorIds: conflict.belligerentIds,
          entityIds: [conflict.id],
          payload: {
            conflictId: conflict.id,
            outcome: conflict.outcome,
            aggressorId: conflict.aggressorId,
            balance: conflict.balance,
            politicalCost: conflict.politicalCost,
            ceasefireDate: conflict.ceasefireDate,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  void world;
  return events;
}

export function activeConflicts(runtime: SimState["foreignAffairsRuntime"]): InternationalConflict[] {
  return Object.values(runtime.conflicts).filter((c) => c.endedDate == null);
}

export function terenaActiveConflicts(runtime: SimState["foreignAffairsRuntime"]): InternationalConflict[] {
  return activeConflicts(runtime).filter((c) => c.belligerentIds.includes(TERENA_WORLD_ID));
}

export function beginConflictFromCrisisWithWarTrigger(
  world: KernelWorld,
  state: SimState,
  crisis: InternationalCrisis,
  date: IsoDate,
  commandId: string | null,
  aggressorId?: string,
): { conflict: InternationalConflict; events: SimEvent[] } {
  const out = beginConflictFromCrisis(state, world, crisis, date, commandId, aggressorId);
  armTerenaWarTriggerIfNeeded(world, state, out.conflict);
  return out;
}

export function crisisConflictProbability(
  world: KernelWorld,
  state: SimState,
  crisis: InternationalCrisis,
): number {
  const [a, b] = crisis.participantIds;
  if (!a || !b) return 0.08;
  const rel = getBilateralRelation(state.foreignAffairsRuntime, a, b);
  const runtimeA = state.foreignAffairsRuntime.countries[a];
  const runtimeB = state.foreignAffairsRuntime.countries[b];
  let p = 0.06 + crisis.intensity * 0.18;
  if (rel) p += rel.securityTension * 0.2 - rel.economicTies * 0.08;
  if (runtimeA) p += (runtimeA.posture === "mobilized" ? 0.08 : 0) + runtimeA.domesticPressure * 0.05;
  if (runtimeB) p += (runtimeB.posture === "mobilized" ? 0.08 : 0) + runtimeB.domesticPressure * 0.05;
  p -= deterrenceModifier(state.foreignAffairsRuntime, a, b);
  if (runtimeA && runtimeB) {
    const bal =
      aggregateMilitaryStrength(runtimeA.capabilities) /
      Math.max(
        0.1,
        aggregateMilitaryStrength(runtimeA.capabilities) +
          aggregateMilitaryStrength(runtimeB.capabilities),
      );
    p += (bal - 0.5) * 0.1;
  }
  void world;
  return clamp01(p);
}
