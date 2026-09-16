import type { ThresholdPresetId } from "./types.js";

export const THRESHOLD_PRESET_FRACTIONS: Record<Exclude<ThresholdPresetId, "custom">, number> = {
  simple_majority: 0.5,
  three_fifths: 0.6,
  two_thirds: 2 / 3,
  three_quarters: 0.75,
};

export function absoluteMajorityFromPreset(
  assemblySeats: number,
  preset: ThresholdPresetId | undefined,
  explicit?: number,
): number {
  if (explicit != null && Number.isFinite(explicit)) return Math.max(1, Math.floor(explicit));
  const frac =
    preset && preset !== "custom"
      ? THRESHOLD_PRESET_FRACTIONS[preset]
      : THRESHOLD_PRESET_FRACTIONS.simple_majority;
  return Math.floor(assemblySeats * frac) + 1;
}

export function fractionFromPreset(
  preset: ThresholdPresetId | undefined,
  explicit?: number,
  fallback = 0.5,
): number {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (preset && preset !== "custom") return THRESHOLD_PRESET_FRACTIONS[preset];
  return fallback;
}
