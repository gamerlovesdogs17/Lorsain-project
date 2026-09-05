import type { CanonicalWorldCountry } from "./types.js";
import { TERENA_WORLD_ID } from "./types.js";
import { bilateralKey } from "./state.js";
import type { ForeignAffairsRuntime } from "./types.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function alignmentTradeBonus(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  const shared = a.alignmentIds.filter((id) => b.alignmentIds.includes(id));
  if (shared.includes("INT_LTO")) return 0.18;
  if (shared.includes("INT_DC") || shared.includes("INT_CSC")) return 0.12;
  if (shared.length > 0) return 0.08;
  const aCsc = a.alignmentIds.includes("INT_CSC");
  const bCsc = b.alignmentIds.includes("INT_CSC");
  const aDc = a.alignmentIds.includes("INT_DC");
  const bDc = b.alignmentIds.includes("INT_DC");
  if ((aCsc && bDc) || (aDc && bCsc)) return -0.1;
  return 0;
}

function neighborBonus(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  return a.neighborIds.includes(b.id) ? 0.22 : 0;
}

function powerTierExposure(tier: string): number {
  switch (tier.toLowerCase()) {
    case "superpower":
      return 0.35;
    case "great power":
      return 0.28;
    case "major power":
      return 0.22;
    case "middle power":
      return 0.16;
    default:
      return 0.1;
  }
}

export function deriveTradeExposure(
  country: CanonicalWorldCountry,
  worldCountries: Record<string, CanonicalWorldCountry>,
): number {
  let exposure = powerTierExposure(country.powerTier);
  if (country.region.toLowerCase().includes("meridian")) exposure += 0.08;
  if (country.id === TERENA_WORLD_ID) exposure += 0.05;
  for (const nid of country.neighborIds) {
    const n = worldCountries[nid];
    if (!n) continue;
    exposure += neighborBonus(country, n) * 0.15;
    exposure += alignmentTradeBonus(country, n) * 0.1;
  }
  return clamp01(exposure);
}

export function bilateralTradeTies(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  let ties = 0.12;
  ties += neighborBonus(a, b);
  ties += alignmentTradeBonus(a, b);
  ties += (powerTierExposure(a.powerTier) + powerTierExposure(b.powerTier)) * 0.12;
  if (a.id === TERENA_WORLD_ID) {
    ties += clamp01((b.relationWithTerena + 100) / 200) * 0.25;
  } else if (b.id === TERENA_WORLD_ID) {
    ties += clamp01((a.relationWithTerena + 100) / 200) * 0.25;
  }
  return clamp01(ties);
}

export function applyTradeToRelation(
  runtime: ForeignAffairsRuntime,
  aId: string,
  bId: string,
  delta: number,
): void {
  const key = bilateralKey(aId, bId);
  const rel = runtime.bilateralRelations[key];
  if (!rel) return;
  rel.economicTies = clamp01(rel.economicTies + delta);
  rel.general = Math.max(-100, Math.min(100, rel.general + delta * 8));
}

export function tradeShockMagnitude(exposure: number, severity: number): number {
  return clamp01(exposure * severity * 0.35);
}
