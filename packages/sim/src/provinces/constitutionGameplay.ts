/**
 * Executable constitutional order helpers — maps order state into real gameplay rules.
 */
import { addIndexDelta, clampIndex, clampFiscal } from "../economy/policy.js";
import type { KernelWorld, SimState } from "../types.js";
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
import { currentAssemblyMemberIds } from "../legislature/state.js";

export function ensureOrder(state: SimState): ConstitutionalOrderState {
  if (!state.provincialRuntime.constitutionalOrder) {
    state.provincialRuntime.constitutionalOrder = emptyConstitutionalOrder();
  }
  const order = state.provincialRuntime.constitutionalOrder;
  if (!order.orderMetrics) {
    order.orderMetrics = emptyOrderMetrics();
  }
  // Backfill entrenchment for saves created before this field existed
  if (!order.entrenchment) {
    order.entrenchment = "none";
  }
  if (!order.pendingInterlockAmendmentIds) {
    order.pendingInterlockAmendmentIds = [];
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

/**
 * War unilateral window from defenseControl relative to constitutional baseline days.
 * civil_supremacy / joint_command require Assembly authorization sooner than
 * executive_command (which extends the unilateral window).
 */
export function warUnilateralDaysForDefenseControl(
  state: SimState,
  baselineDays: number,
): number {
  const base = Math.max(1, Math.floor(baselineDays));
  const control = ensureOrder(state).defenseControl;
  if (control === "executive_command") return base * 3;
  if (control === "joint_command") return Math.max(7, Math.floor(base / 2));
  // civil_supremacy — founding unilateral ceiling (sooner than executive_command)
  return base;
}

export function cabinetFormationMode(
  state: SimState,
): ConstitutionalOrderState["cabinetFormation"] {
  return ensureOrder(state).cabinetFormation;
}

/** A1: Gate executive regulation issuance based on executiveAuthority mode. */
export function executiveAuthorityGateRegulation(
  state: SimState,
  major: boolean,
): { allowed: boolean; reason?: string } {
  const authority = ensureOrder(state).executiveAuthority;
  if (authority === "assembly_dominant") {
    return {
      allowed: false,
      reason: "assembly_dominant executive suspends presidential decree/regulation power; regulations must go through legislative process",
    };
  }
  if (authority === "constrained_dual_mandate" && major) {
    return {
      allowed: false,
      reason: "constrained_dual_mandate requires legislative co-approval for major regulations",
    };
  }
  // standard_presidential and strengthened_executive allow regulations
  return { allowed: true };
}

/** A1: Gate emergency declaration based on executiveAuthority mode. */
export function executiveAuthorityGateEmergency(
  state: SimState,
): { allowed: boolean; reason?: string } {
  const authority = ensureOrder(state).executiveAuthority;
  if (authority === "assembly_dominant") {
    return {
      allowed: false,
      reason: "assembly_dominant executive cannot unilaterally declare emergencies; requires Assembly action",
    };
  }
  return { allowed: true };
}

/** Party with the most sitting Assembly members (ties broken by party id). */
export function assemblyPluralityPartyId(world: KernelWorld, state: SimState): string | null {
  const counts: Record<string, number> = {};
  for (const id of currentAssemblyMemberIds(world, state)) {
    const partyId = state.politicians[id]?.partyId;
    if (!partyId) continue;
    counts[partyId] = (counts[partyId] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

