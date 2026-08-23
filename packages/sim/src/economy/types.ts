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

export type ProvinceEconomicProfile = {
  provinceId: string;
  starting: RegionalEconomyIndices;
  sectorExposure: Record<EconomySectorId, number>;
  sensitivity: { growth: number; inflation: number; housing: number; trade: number };
  annualStructuralTrend: { conditions: number; employment: number; housing: number };
  character: string;
};

export type CanonicalEconomyScenario = {
  asOf: IsoDate;
  referenceNote: string;
  national: NationalEconomyIndices;
  nationalAnnualTrend: {
    output: number;
    employment: number;
    prices: number;
    realWages: number;
    housing: number;
  };
  sectors: Record<
    EconomySectorId,
    { conditionsIndex: number; cyclicalSensitivity: number; annualStructuralTrend: number }
  >;
  provinces: Record<string, ProvinceEconomicProfile>;
  provenance: string[];
};

export type RegionalEconomyHistoryPoint = RegionalEconomyIndices & { date: IsoDate };
export type SectorEconomyHistoryPoint = SectorEconomyIndices & { date: IsoDate };

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
  provinceHistory: Record<string, RegionalEconomyHistoryPoint[]>;
  sectorHistory: Record<string, SectorEconomyHistoryPoint[]>;
  provinces: Record<string, RegionalEconomyIndices>;
  sectors: Record<string, SectorEconomyIndices>;
  laggedEffects: LaggedEconomyEffect[];
  shocks: EconomyShock[];
  appliedPolicySources: Record<string, string>;
  cycle: {
    phase: number;
    outputMomentum: number;
    inflationMomentum: number;
    housingMomentum: number;
    monthsElapsed: number;
  };
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
    provinceHistory: {},
    sectorHistory: {},
    provinces: {},
    sectors: Object.fromEntries(ECONOMY_SECTORS.map((id) => [id, { conditionsIndex: 100 }])),
    laggedEffects: [],
    shocks: [],
    appliedPolicySources: {},
    cycle: {
      phase: 0.35,
      outputMomentum: 0,
      inflationMomentum: 0,
      housingMomentum: 0,
      monthsElapsed: 0,
    },
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
  for (const id of provinceIds) runtime.provinceHistory[id] = [{ date: asOf, ...runtime.provinces[id]! }];
  for (const [id, sector] of Object.entries(runtime.sectors)) {
    runtime.sectorHistory[id] = [{ date: asOf, ...sector }];
  }
  return runtime;
}

export function economyRuntimeFromScenario(
  scenario: CanonicalEconomyScenario,
): EconomyRuntime {
  const runtime = emptyEconomyRuntime();
  runtime.national = { ...scenario.national };
  runtime.provinces = Object.fromEntries(
    Object.entries(scenario.provinces).map(([id, profile]) => [id, { ...profile.starting }]),
  );
  runtime.sectors = Object.fromEntries(
    Object.entries(scenario.sectors).map(([id, sector]) => [id, { conditionsIndex: sector.conditionsIndex }]),
  );
  runtime.history = [{ date: scenario.asOf, ...runtime.national }];
  runtime.provinceHistory = Object.fromEntries(
    Object.entries(runtime.provinces).map(([id, province]) => [id, [{ date: scenario.asOf, ...province }]]),
  );
  runtime.sectorHistory = Object.fromEntries(
    Object.entries(runtime.sectors).map(([id, sector]) => [id, [{ date: scenario.asOf, ...sector }]]),
  );
  return runtime;
}
