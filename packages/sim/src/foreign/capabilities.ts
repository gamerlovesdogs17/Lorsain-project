import type { CanonicalWorldCountry } from "./types.js";
import type { CapabilityVector } from "./types.js";

const POWER_TIER_WEIGHT: Record<string, number> = {
  superpower: 1,
  "great power": 0.85,
  "major power": 0.7,
  "middle power": 0.5,
  "small power": 0.3,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function tierWeight(tier: string): number {
  return POWER_TIER_WEIGHT[tier.toLowerCase()] ?? 0.4;
}

function regionNavalBonus(region: string): number {
  const r = region.toLowerCase();
  if (r.includes("meridian") || r.includes("vespera")) return 0.12;
  if (r.includes("arden")) return 0.04;
  return 0;
}

function regionLandBonus(region: string): number {
  const r = region.toLowerCase();
  if (r.includes("arden")) return 0.1;
  if (r.includes("meridian")) return 0.04;
  return 0;
}

export function deriveCapabilities(country: CanonicalWorldCountry): CapabilityVector {
  const tier = tierWeight(country.powerTier);
  const pop = country.population;
  const popFactor = clamp01(Math.log10(Math.max(pop, 1_000_000)) / 9);
  const base = tier * 0.55 + popFactor * 0.45;
  const gov = country.government.toLowerCase();
  const cyberBonus = /managed|federal|republic/.test(gov) ? 0.06 : 0;
  return {
    economic: clamp01(base * 0.95 + popFactor * 0.1),
    land: clamp01(base * 0.85 + regionLandBonus(country.region)),
    air: clamp01(base * 0.8 + tier * 0.08),
    naval: clamp01(base * 0.65 + regionNavalBonus(country.region) + popFactor * 0.05),
    strategic: clamp01(tier * 0.75 + popFactor * 0.15),
    cyber: clamp01(tier * 0.55 + cyberBonus + popFactor * 0.08),
    logistics: clamp01(base * 0.75 + tier * 0.1),
  };
}

export function aggregateMilitaryStrength(cap: CapabilityVector): number {
  return (
    cap.land * 0.28 +
    cap.air * 0.22 +
    cap.naval * 0.18 +
    cap.strategic * 0.12 +
    cap.cyber * 0.08 +
    cap.logistics * 0.12
  );
}

export function isSuperpowerTier(powerTier: string): boolean {
  const t = powerTier.toLowerCase();
  return t === "superpower" || t === "great power";
}

export function isSmallPowerTier(powerTier: string): boolean {
  return powerTier.toLowerCase() === "small power";
}
