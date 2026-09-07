import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { refreshGovernmentAgenda } from "./agenda.js";
import { processBudgetCycle } from "./budget.js";
import { decayCapacityStrain, syncCapacityFromExecutive } from "./capacity.js";
import { recomputeFiscalFromCurrentLaw } from "./fiscal.js";
import { advanceImplementations } from "./implementation.js";
import { detectPolicyInteractions } from "./interactions.js";
import { updateMinisterialPerformance } from "./performance.js";
import { updatePromiseStatuses } from "./promises.js";
import { refreshGovernmentRecord } from "./record.js";
import { ensureGoverningRuntime } from "./state.js";
import { clampUnit } from "./capacity.js";

/**
 * Phase 13 monthly orchestrator.
 * Engine placement: after legislature + executive (budgets/regs exist), before courts.
 */
export function processGoverningMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const month = monthStart(state.currentDate);
  if (runtime.lastGoverningMonth === month) return [];

  const events: SimEvent[] = [];

  syncCapacityFromExecutive(world, state);
  events.push(...advanceImplementations(state, commandId));
  decayCapacityStrain(state);

  recomputeFiscalFromCurrentLaw(state);
  events.push(...processBudgetCycle(state, commandId));

  refreshGovernmentAgenda(world, state);
  updatePromiseStatuses(world, state);
  const interactions = detectPolicyInteractions(state);
  updateMinisterialPerformance(world, state);
  updateServiceOutcomes(state);
  events.push(...applyServicePoliticalEffects(world, state, commandId));
  events.push(...refreshGovernmentRecord(world, state, commandId));

  const contradictions = interactions.filter((i) => i.kind === "contradiction" && !i.resolved);
  if (contradictions.length > 0) {
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "POLICY_CONTRADICTION_DETECTED",
        importance: 0.55,
        visibility: "public",
        actorIds: [],
        entityIds: contradictions.flatMap((c) => c.provisionIds),
        payload: {
          count: contradictions.length,
          labels: contradictions.map((c) => c.label),
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  runtime.lastGoverningMonth = month;
  return events;
}

function updateServiceOutcomes(state: SimState): void {
  const runtime = ensureGoverningRuntime(state);
  const cap = runtime.capacity.national;
  const fiscalPressure =
    runtime.fiscal.expenditure > 0
      ? Math.max(0, runtime.fiscal.expenditure - runtime.fiscal.revenue) /
        runtime.fiscal.expenditure
      : 0;
  const implAvg = (() => {
    const vals = Object.values(runtime.implementations);
    if (vals.length === 0) return 0.55;
    return vals.reduce((s, r) => s + r.progress, 0) / vals.length;
  })();

  runtime.services.administrativeDelivery = clampUnit(cap * 0.7 + implAvg * 0.3);
  runtime.services.healthcareAccess = clampUnit(
    0.45 +
      (runtime.fiscal.spendingByCategory.healthcare / 40) * 0.3 +
      cap * 0.2 -
      fiscalPressure * 0.1,
  );
  runtime.services.educationQuality = clampUnit(
    0.45 + (runtime.fiscal.spendingByCategory.education / 30) * 0.3 + cap * 0.2,
  );
  runtime.services.infrastructureQuality = clampUnit(
    0.4 + (runtime.fiscal.spendingByCategory.infrastructure / 30) * 0.35 + implAvg * 0.2,
  );
  runtime.services.publicSafety = clampUnit(0.5 + cap * 0.25 - runtime.capacity.strain * 0.2);
}

/** Bounded political feedback from service outcomes into history / org pressure. */
function applyServicePoliticalEffects(
  _world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const events: SimEvent[] = [];
  const s = runtime.services;
  const weak =
    s.healthcareAccess < 0.38 ||
    s.educationQuality < 0.38 ||
    s.infrastructureQuality < 0.35 ||
    s.administrativeDelivery < 0.35;
  const strong =
    s.healthcareAccess > 0.72 && s.educationQuality > 0.7 && s.administrativeDelivery > 0.7;
  if (!weak && !strong) return events;
  // At most one signal per quarter-ish (month ending in 01/04/07/10).
  const month = Number(state.currentDate.slice(5, 7));
  if (![1, 4, 7, 10].includes(month)) return events;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: weak ? "SERVICE_DELIVERY_CRITICISM" : "SERVICE_DELIVERY_CREDIT",
      importance: weak ? 0.55 : 0.4,
      visibility: "public",
      actorIds: [],
      entityIds: [],
      payload: {
        healthcareAccess: s.healthcareAccess,
        educationQuality: s.educationQuality,
        infrastructureQuality: s.infrastructureQuality,
        publicSafety: s.publicSafety,
        administrativeDelivery: s.administrativeDelivery,
        tone: weak ? "criticism" : "credit",
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}
