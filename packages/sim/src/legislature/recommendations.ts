import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import type { IdeologyAxis } from "../agents/types.js";
import type { BillState, PolicyItem, RecommendationStance } from "./types.js";
import { partyPlatformFit } from "../parties/platforms.js";
import {
  optionForPolicyItem,
  provisionForPolicyItem,
} from "./provisions.js";

function axisForDimension(dimension: string): IdeologyAxis {
  if (dimension === "economic" || dimension === "economic-social") return "economic";
  if (dimension === "social") return "social";
  if (dimension === "foreign") return "globalism";
  return "authority";
}

export function billPolicyFit(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  bill: BillState,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return 0;
  let acc = 0;
  let n = 0;
  for (const item of bill.policyItems) {
    if (item.dimensionEffects && Object.keys(item.dimensionEffects).length > 0) {
      const rows = Object.entries(item.dimensionEffects) as Array<[IdeologyAxis, number]>;
      const structuralFit =
        rows.reduce((sum, [axis, effect]) => sum + (profile.ideology[axis] ?? 0) * effect, 0) /
        rows.length;
      acc += structuralFit * item.magnitude;
      n += 1;
      continue;
    }
    const dim = world.issueDimensions[item.issueId] ?? "institutional";
    const axis = axisForDimension(dim);
    acc += (profile.ideology[axis] ?? 0) * item.direction * item.magnitude;
    n += 1;
  }
  if (n === 0) return 0;
  return Math.max(-1, Math.min(1, acc / n));
}

function policyItemFit(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  item: PolicyItem,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return 0;
  if (item.dimensionEffects && Object.keys(item.dimensionEffects).length > 0) {
    const rows = Object.entries(item.dimensionEffects) as Array<[IdeologyAxis, number]>;
    const structuralFit =
      rows.reduce((sum, [axis, effect]) => sum + (profile.ideology[axis] ?? 0) * effect, 0) /
      rows.length;
    return Math.max(-1, Math.min(1, structuralFit * item.magnitude));
  }
  const dim = world.issueDimensions[item.issueId] ?? "institutional";
  const axis = axisForDimension(dim);
  return Math.max(-1, Math.min(1, (profile.ideology[axis] ?? 0) * item.direction * item.magnitude));
}

export type BillComponentEvaluation = {
  provisionId: string | null;
  optionId: string | null;
  label: string;
  fit: number;
  factors: string[];
};

/** Scores each policy item on a bill for NPC Why UI explanations. */
export function evaluateBillComponents(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  bill: BillState,
): BillComponentEvaluation[] {
  const profile = getAgentProfile(world, state, politicianId);
  return bill.policyItems.map((item) => {
    const definition = provisionForPolicyItem(item);
    const option = optionForPolicyItem(item);
    const fit = policyItemFit(world, state, politicianId, item);
    const factors: string[] = [];
    if (option?.parameterValue != null && option.controlHint) {
      factors.push(`${option.controlHint} parameter ${option.parameterValue}`);
    }
    if (item.dimensionEffects && Object.keys(item.dimensionEffects).length > 0) {
      const top = Object.entries(item.dimensionEffects)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 2)
        .map(([axis, effect]) => `${axis} ${effect > 0 ? "+" : ""}${effect.toFixed(2)}`);
      if (top.length) factors.push(`structural: ${top.join(", ")}`);
    } else if (item.direction !== 0) {
      factors.push(
        `${world.issueDimensions[item.issueId] ?? "institutional"} direction ${item.direction > 0 ? "right" : "left"}`,
      );
    }
    if (profile && item.fiscalImpact != null && Math.abs(item.fiscalImpact) > 0.05) {
      const econ = profile.ideology.economic ?? 0;
      if (item.fiscalImpact > 0 && econ > 0.2) factors.push("higher spending aligns with economic views");
      if (item.fiscalImpact < 0 && econ < -0.2) factors.push("fiscal restraint aligns with economic views");
    }
    if (fit > 0.15) factors.push("overall alignment");
    if (fit < -0.15) factors.push("overall conflict");
    return {
      provisionId: item.provisionId ?? null,
      optionId: item.optionId ?? null,
      label: option?.label ?? definition?.category ?? item.issueId,
      fit,
      factors,
    };
  });
}

export function stanceFromFit(fit: number): RecommendationStance {
  if (fit > 0.08) return "support";
  if (fit < -0.08) return "oppose";
  return "free_vote";
}

export function upsertRecommendations(world: KernelWorld, state: SimState, bill: BillState): void {
  const parties = new Set<string>();
  const factions = new Set<string>();
  for (const p of Object.values(state.politicians)) {
    if (p.partyId) parties.add(p.partyId);
    if (p.factionId) factions.add(p.factionId);
  }
  for (const partyId of [...parties].sort()) {
    const members = Object.values(state.politicians)
      .filter((p) => p.partyId === partyId && p.alive && !p.retired)
      .map((p) => p.id)
      .sort();
    let acc = 0;
    for (const id of members) acc += billPolicyFit(world, state, id, bill);
    const memberFit = members.length ? acc / members.length : 0;
    const platformFit = partyPlatformFit(state, partyId, bill);
    const fit = memberFit * 0.6 + platformFit * 0.4;
    const key = `${partyId}:${bill.id}`;
    if (state.legislatureRuntime.partyRecommendations[key]?.source === "caucus_leadership") {
      continue;
    }
    state.legislatureRuntime.partyRecommendations[key] = {
      partyId,
      billId: bill.id,
      stance: stanceFromFit(fit),
      setById: null,
      date: state.currentDate,
      source: "derived",
    };
  }
  for (const factionId of [...factions].sort()) {
    const members = Object.values(state.politicians)
      .filter((p) => p.factionId === factionId && p.alive && !p.retired)
      .map((p) => p.id)
      .sort();
    let acc = 0;
    for (const id of members) acc += billPolicyFit(world, state, id, bill);
    const fit = members.length ? acc / members.length : 0;
    const key = `${factionId}:${bill.id}`;
    state.legislatureRuntime.factionRecommendations[key] = {
      factionId,
      billId: bill.id,
      stance: stanceFromFit(fit),
    };
  }
}

export function partyStance(
  state: SimState,
  partyId: string | null,
  billId: string,
): RecommendationStance {
  if (!partyId) return "free_vote";
  return (
    state.legislatureRuntime.partyRecommendations[`${partyId}:${billId}`]?.stance ?? "free_vote"
  );
}

export function factionStance(
  state: SimState,
  factionId: string | null,
  billId: string,
): RecommendationStance {
  if (!factionId) return "free_vote";
  return (
    state.legislatureRuntime.factionRecommendations[`${factionId}:${billId}`]?.stance ?? "free_vote"
  );
}
