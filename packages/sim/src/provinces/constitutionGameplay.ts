/**
 * Executable constitutional order helpers — maps order state into real gameplay rules.
 */
import { addIndexDelta, clampIndex, clampFiscal } from "../economy/policy.js";
import type { SimState } from "../types.js";
import {
  amendmentThresholds,
  emptyConstitutionalOrder,
  type ConstitutionalMetricEffects,
  type ConstitutionalOrderState,
  type PresidentialElectionMode,
  type JudicialReviewMode,
  type EmergencyPowerMode,
  type TreatyApprovalMode,
  type AssemblyElectionMode,
} from "./constitutionalOrder.js";
import type { ConstitutionChangeAlternative } from "./constitutionChanges.js";

export function ensureOrder(state: SimState): ConstitutionalOrderState {
  if (!state.provincialRuntime.constitutionalOrder) {
    state.provincialRuntime.constitutionalOrder = emptyConstitutionalOrder();
  }
  const order = state.provincialRuntime.constitutionalOrder;
  if (!order.orderMetrics) {
    order.orderMetrics = emptyOrderMetrics();
  }
  return order;
}

export function emptyOrderMetrics(): Required<ConstitutionalMetricEffects> {
  return {
    institutionalStability: 0,
    politicalCompetition: 0,
    civilLiberty: 0,
    executiveCapacity: 0,
    provincialAutonomy: 0,
    judicialIndependence: 0,
    governmentLegitimacy: 0,
  };
}

/** Apply displayed metricEffects to live order metrics and national economy indices. */
export function applyConstitutionalMetricEffects(
  state: SimState,
  effects: ConstitutionalMetricEffects,
): void {
  const order = ensureOrder(state);
  if (!order.orderMetrics) order.orderMetrics = emptyOrderMetrics();
  const metrics = order.orderMetrics;
  for (const key of Object.keys(effects) as (keyof ConstitutionalMetricEffects)[]) {
    const delta = effects[key];
    if (typeof delta !== "number" || !Number.isFinite(delta)) continue;
    metrics[key] = (metrics[key] ?? 0) + delta;
  }
  const national = state.economyRuntime?.national;
  if (!national) return;
  // Map constitutional metrics onto existing modeled indices (no vanity metrics).
  const confidence =
    (effects.governmentLegitimacy ?? 0) * 0.35 +
    (effects.politicalCompetition ?? 0) * 0.15 +
    (effects.civilLiberty ?? 0) * 0.2 +
    (effects.institutionalStability ?? 0) * 0.25;
  const output =
    (effects.executiveCapacity ?? 0) * 0.12 + (effects.provincialAutonomy ?? 0) * 0.05;
  const employment = (effects.politicalCompetition ?? 0) * 0.04;
  addIndexDelta(
    national,
    {
      confidenceIndex: confidence,
      outputIndex: output,
      employmentIndex: employment,
      fiscalPressure: (effects.executiveCapacity ?? 0) * -0.01,
    },
    1,
  );
  // Keep indices in legal ranges even if addIndexDelta already clamps monthly moves.
  national.confidenceIndex = clampIndex(national.confidenceIndex);
  national.outputIndex = clampIndex(national.outputIndex);
  national.employmentIndex = clampIndex(national.employmentIndex);
  national.fiscalPressure = clampFiscal(national.fiscalPressure);
}

export function applyAlternativeGameplayEffects(
  state: SimState,
  alt: ConstitutionChangeAlternative,
): void {
  if (alt.metricEffects) applyConstitutionalMetricEffects(state, alt.metricEffects);
}

export function presidentialElectionMode(state: SimState): PresidentialElectionMode {
  return ensureOrder(state).presidentialElection;
}

export function assemblyElectionMode(state: SimState): AssemblyElectionMode {
  return ensureOrder(state).assemblyElection;
}

export function judicialReviewMode(state: SimState): JudicialReviewMode {
  return ensureOrder(state).judicialReview;
}

export function emergencyPowerMode(state: SimState): EmergencyPowerMode {
  return ensureOrder(state).emergencyPowers;
}

export function treatyApprovalMode(state: SimState): TreatyApprovalMode {
  return ensureOrder(state).treatyApproval;
}

export function referendumRequiredForAmendments(state: SimState): boolean {
  return amendmentThresholds(ensureOrder(state)).referendumRequired;
}

/** Adjust court merits lean based on judicial review mode. */
export function adjustMeritsLeanForJudicialReview(state: SimState, lean: number): number {
  const mode = judicialReviewMode(state);
  let next = lean;
  if (mode === "strong_review") next += 0.18;
  else if (mode === "deferential_review") next -= 0.22;
  else if (mode === "legislative_finality") next = -1; // force uphold path
  return Math.max(-1, Math.min(1, next));
}

export function judicialReviewAllowsInvalidation(state: SimState): boolean {
  return judicialReviewMode(state) !== "legislative_finality";
}

export function emergencyDeclarationAllowed(state: SimState, byPresident: boolean): {
  allowed: boolean;
  reason?: string;
  initialDays: number;
  requiresAssemblyConfirmation: boolean;
  courtReviewRequired: boolean;
} {
  const mode = emergencyPowerMode(state);
  if (mode === "assembly_declared_only" && byPresident) {
    return {
      allowed: false,
      reason: "Emergency may be declared only by the National Assembly",
      initialDays: 14,
      requiresAssemblyConfirmation: true,
      courtReviewRequired: true,
    };
  }
  if (mode === "narrow_assembly_supervised") {
    const out: {
      allowed: boolean;
      reason?: string;
      initialDays: number;
      requiresAssemblyConfirmation: boolean;
      courtReviewRequired: boolean;
    } = {
      allowed: byPresident,
      initialDays: 14,
      requiresAssemblyConfirmation: true,
      courtReviewRequired: true,
    };
    if (!byPresident) out.reason = "Assembly-supervised emergency required";
    return out;
  }
  if (mode === "broad_executive_emergency") {
    return {
      allowed: true,
      initialDays: 90,
      requiresAssemblyConfirmation: false,
      courtReviewRequired: false,
    };
  }
  return {
    allowed: true,
    initialDays: 14,
    requiresAssemblyConfirmation: true,
    courtReviewRequired: true,
  };
}

export function treatyRequiresAssemblyUnderOrder(state: SimState, kind: string): boolean {
  const mode = treatyApprovalMode(state);
  if (mode === "executive_alone") return false;
  if (mode === "assembly_and_provinces") return true;
  if (mode === "supermajority_assembly") return true;
  // assembly_ratification default — trade may skip under legacy helper; keep trade exception only for default
  if (mode === "assembly_ratification" && kind === "trade") return false;
  return true;
}

export function treatyAssemblyFraction(state: SimState): number {
  const mode = treatyApprovalMode(state);
  if (mode === "supermajority_assembly") return 2 / 3;
  return 0.5;
}

/** Whether competing party labels may appear on ballots / nominations. */
export function competitivePartiesAllowed(state: SimState): boolean {
  const order = ensureOrder(state);
  return order.partySystem === "competitive_multiparty" || order.partySystem === "restricted_registration";
}

export function describePresidentialElectionMethod(mode: PresidentialElectionMode): string {
  switch (mode) {
    case "plurality":
      return "national_plurality";
    case "majority_runoff":
      return "majority_runoff";
    case "assembly_selection":
      return "assembly_selection";
    case "national_rcv":
    default:
      return "national_ranked_choice";
  }
}
