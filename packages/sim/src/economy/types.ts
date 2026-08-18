import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { PolicyItem } from "../legislature/types.js";

export const ECONOMY_SECTORS = [
  "labor",
  "manufacturing",
  "agriculture",
  "services",
  "housing",
  "trade",
] as const;
export type EconomySectorId = (typeof ECONOMY_SECTORS)[number];

export const LAG_KINDS = ["short", "medium", "longer"] as const;
export type EconomyLagKind = (typeof LAG_KINDS)[number];

export type NationalEconomyIndices = {
  outputIndex: number;
  employmentIndex: number;
  priceIndex: number;
  realWageIndex: number;
  housingIndex: number;
  confidenceIndex: number;
  fiscalPressure: number;
};

export type EconomyHistoryPoint = NationalEconomyIndices & { date: IsoDate };

export type RegionalEconomyIndices = {
  conditionsIndex: number;
  employmentIndex: number;
  housingIndex: number;
};

export type SectorEconomyIndices = {
  conditionsIndex: number;
};

export type LaggedEconomyEffect = {
  id: string;
  sourceId: string;
  remainingMonths: number;
  totalMonths: number;
  lagKind: EconomyLagKind;
  policyItems: PolicyItem[];
  metadata: JsonObject;
};

export type EconomyShock = {
  id: string;
  date: IsoDate;
  kind: string;
  magnitude: number;
  remainingMonths: number;
  metadata: JsonObject;
};

export type EconomyRuntime = {
  national: NationalEconomyIndices;
  history: EconomyHistoryPoint[];
  provinces: Record<string, RegionalEconomyIndices>;
  sectors: Record<string, SectorEconomyIndices>;
  laggedEffects: LaggedEconomyEffect[];
  shocks: EconomyShock[];
  appliedPolicySources: Record<string, string>;
  lastMonthProcessed: IsoDate | null;
};

export const BASELINE_INDICES: NationalEconomyIndices = {
  outputIndex: 100,
  employmentIndex: 100,
  priceIndex: 100,
  realWageIndex: 100,
  housingIndex: 100,
  confidenceIndex: 100,
  fiscalPressure: 0.35,
};

export function emptyEconomyRuntime(): EconomyRuntime {
  return {
    national: { ...BASELINE_INDICES },
    history: [],
    provinces: {},
    sectors: Object.fromEntries(ECONOMY_SECTORS.map((id) => [id, { conditionsIndex: 100 }])),
    laggedEffects: [],
    shocks: [],
    appliedPolicySources: {},
    lastMonthProcessed: null,
  };
}

export function baselineEconomyRuntime(provinceIds: string[], asOf: IsoDate): EconomyRuntime {
  const runtime = emptyEconomyRuntime();
  for (const id of provinceIds) {
    runtime.provinces[id] = {
      conditionsIndex: 100,
      employmentIndex: 100,
      housingIndex: 100,
    };
  }
  runtime.history = [{ date: asOf, ...runtime.national }];
  return runtime;
}
