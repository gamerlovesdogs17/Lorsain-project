import type { ProvinceEconomicProfile } from "../economy/types.js";

export type ProvinceTradeShockDelta = {
  employmentIndex: number;
  conditionsIndex: number;
};

/** Same national trade shock — export-linked provinces absorb more employment pain. */
export function provinceTradeShockDelta(
  profile: ProvinceEconomicProfile,
  tradeSectorDelta: number,
): ProvinceTradeShockDelta {
  const exportWeight =
    (profile.sectorExposure.trade ?? 0) +
    (profile.sectorExposure.manufacturing ?? 0) * 0.4 +
    (profile.sectorExposure.agriculture ?? 0) * 0.25;
  const serviceWeight = profile.sectorExposure.services ?? 0;
  const exportMultiplier = 0.55 + exportWeight * 1.35 - serviceWeight * 0.35;
  const conditionsMultiplier = 0.35 + exportWeight * 0.9 - serviceWeight * 0.2;
  const sens = profile.sensitivity.trade;
  return {
    employmentIndex: tradeSectorDelta * sens * exportMultiplier,
    conditionsIndex: tradeSectorDelta * sens * conditionsMultiplier * 0.65,
  };
}

export function isExportHeavyProvince(profile: ProvinceEconomicProfile): boolean {
  const exportWeight =
    (profile.sectorExposure.trade ?? 0) + (profile.sectorExposure.manufacturing ?? 0) * 0.35;
  const serviceWeight = profile.sectorExposure.services ?? 0;
  return exportWeight - serviceWeight > 0.12;
}
