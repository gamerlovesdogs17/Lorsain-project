import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import type { IdeologyAxis } from "../agents/types.js";
import type { BillState, RecommendationStance } from "./types.js";

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
    const dim = world.issueDimensions[item.issueId] ?? "institutional";
    const axis = axisForDimension(dim);
    acc += (profile.ideology[axis] ?? 0) * item.direction * item.magnitude;
    n += 1;
  }
  if (n === 0) return 0;
  return Math.max(-1, Math.min(1, acc / n));
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
    const fit = members.length ? acc / members.length : 0;
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
