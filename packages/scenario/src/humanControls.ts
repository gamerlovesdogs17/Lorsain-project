/**
 * Human-facing threshold presets for Scenario Studio.
 * Store exact fractions in scenario documents; UI shows labels.
 */
export const THRESHOLD_PRESETS = [
  { id: "simple_majority", label: "Simple majority", fraction: 0.5 },
  { id: "three_fifths", label: "Three-fifths", fraction: 0.6 },
  { id: "two_thirds", label: "Two-thirds", fraction: 2 / 3 },
  { id: "three_quarters", label: "Three-quarters", fraction: 0.75 },
] as const;

export type ThresholdPresetId = (typeof THRESHOLD_PRESETS)[number]["id"] | "custom";

export function thresholdPresetForFraction(fraction: number | undefined | null): ThresholdPresetId {
  if (fraction == null || !Number.isFinite(fraction)) return "simple_majority";
  for (const p of THRESHOLD_PRESETS) {
    if (Math.abs(p.fraction - fraction) < 0.005) return p.id;
  }
  return "custom";
}

export function fractionForThresholdPreset(id: ThresholdPresetId, customFraction?: number): number {
  if (id === "custom") {
    return typeof customFraction === "number" && Number.isFinite(customFraction)
      ? customFraction
      : 0.5;
  }
  const hit = THRESHOLD_PRESETS.find((p) => p.id === id);
  return hit?.fraction ?? 0.5;
}

export const TRAIT_BANDS = [
  { id: "weak", label: "Weak", value: 0.28 },
  { id: "average", label: "Average", value: 0.5 },
  { id: "strong", label: "Strong", value: 0.78 },
] as const;

export type TraitBandId = (typeof TRAIT_BANDS)[number]["id"];

export function traitBandForValue(value: number | undefined | null): TraitBandId {
  if (value == null || !Number.isFinite(value)) return "average";
  if (value < 0.4) return "weak";
  if (value < 0.65) return "average";
  return "strong";
}

export function valueForTraitBand(id: TraitBandId): number {
  return TRAIT_BANDS.find((b) => b.id === id)?.value ?? 0.5;
}

export const GOVERNMENT_FORM_PRESETS = [
  { id: "presidential", label: "Presidential" },
  { id: "parliamentary", label: "Parliamentary" },
  { id: "semi_presidential", label: "Semi-presidential" },
] as const;

/** @deprecated Prefer ASSEMBLY_ELECTION_OPTIONS from optionCatalogs — kept for Quick Build. */
export const ELECTORAL_PRESETS = [
  { id: "stv", label: "Preferential (STV)" },
  { id: "closed_list_pr", label: "Proportional list" },
  { id: "fptp", label: "Constituency plurality" },
  { id: "mixed_member", label: "Mixed member" },
] as const;

export {
  ASSEMBLY_ELECTION_OPTIONS as ELECTORAL_SYSTEM_OPTIONS,
  PRESIDENTIAL_ELECTION_OPTIONS,
  PARTY_IDEOLOGY_FAMILIES,
} from "./optionCatalogs.js";
