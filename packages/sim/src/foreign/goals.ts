import type { CanonicalWorldCountry } from "./types.js";
import type { StrategicGoalId } from "./types.js";

const DEFAULT_GOALS: StrategicGoalId[] = ["regime_stability", "expand_trade"];

export function deriveStrategicGoals(country: CanonicalWorldCountry): StrategicGoalId[] {
  const goals = new Set<StrategicGoalId>(DEFAULT_GOALS);
  const tier = country.powerTier.toLowerCase();
  const align = country.alignmentIds;

  if (tier === "superpower" || tier === "great power") {
    goals.add("regional_hegemony");
    goals.add("multilateral_leadership");
    goals.add("technological_edge");
  } else if (tier === "major power" || tier === "middle power") {
    goals.add("territorial_integrity");
    goals.add("maritime_access");
  } else {
    goals.add("neutral_autonomy");
    goals.add("secure_alliance");
  }

  if (align.includes("INT_DC")) {
    goals.add("secure_alliance");
    goals.add("counter_rival");
  }
  if (align.includes("INT_CSC")) {
    goals.add("energy_security");
    goals.add("counter_rival");
  }
  if (align.includes("INT_NAF")) {
    goals.add("neutral_autonomy");
  }
  if (country.region.toLowerCase().includes("meridian")) {
    goals.add("maritime_access");
    goals.add("energy_security");
  }
  if (country.neighborIds.length >= 4) {
    goals.add("territorial_integrity");
  }

  return [...goals].slice(0, 6);
}

export function goalActionBias(
  goals: StrategicGoalId[],
  action: "outreach" | "sanctions" | "treaty" | "posture" | "war",
): number {
  let score = 0;
  if (action === "outreach") {
    if (goals.includes("expand_trade")) score += 0.3;
    if (goals.includes("secure_alliance")) score += 0.25;
    if (goals.includes("multilateral_leadership")) score += 0.15;
  }
  if (action === "sanctions") {
    if (goals.includes("counter_rival")) score += 0.35;
    if (goals.includes("regional_hegemony")) score += 0.2;
  }
  if (action === "treaty") {
    if (goals.includes("secure_alliance")) score += 0.35;
    if (goals.includes("expand_trade")) score += 0.2;
  }
  if (action === "posture") {
    if (goals.includes("territorial_integrity")) score += 0.25;
    if (goals.includes("regime_stability")) score += 0.15;
  }
  if (action === "war") {
    if (goals.includes("regional_hegemony")) score += 0.1;
    if (goals.includes("counter_rival")) score += 0.08;
    score -= goals.includes("neutral_autonomy") ? 0.25 : 0;
  }
  return score;
}
