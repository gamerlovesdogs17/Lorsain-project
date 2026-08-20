import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import {
  TERENA_WORLD_ID,
  type BilateralRelation,
  type CanonicalWorldCountry,
  type ForeignCountryRuntime,
  type InternationalCrisis,
  type TreatyRecord,
} from "./types.js";
import { bilateralKey, allocateCrisisId, allocateTreatyId } from "./state.js";
import { deriveCapabilities } from "./capabilities.js";
import { deriveStrategicGoals } from "./goals.js";
import { deriveInitialBilateralRelation } from "./relations.js";
import { deriveTradeExposure } from "./trade.js";

const CANONICAL_TERENA_RELATIONS: Record<string, number> = {
  W40: -40,
  W13: 75,
  W48: 55,
  W05: 30,
  W12: 20,
  W37: 65,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function deriveGovernmentStability(country: CanonicalWorldCountry): number {
  const gov = country.government.toLowerCase();
  if (/democracy|republic|constitutional|federal|parliamentary/.test(gov)) return 0.72;
  if (/monarchy|managed/.test(gov)) return 0.58;
  if (/theocracy|empire|autocracy/.test(gov)) return 0.45;
  return 0.55;
}

function deriveEconomicCapacity(country: CanonicalWorldCountry): number {
  const tier = country.powerTier.toLowerCase();
  const tierMap: Record<string, number> = {
    superpower: 0.92,
    "great power": 0.82,
    "major power": 0.68,
    "middle power": 0.52,
    "small power": 0.35,
  };
  return clamp01(tierMap[tier] ?? 0.45);
}

function deriveDomesticPressure(country: CanonicalWorldCountry): number {
  const gov = country.government.toLowerCase();
  if (/managed|theocracy|empire/.test(gov)) return 0.55;
  if (/democracy|republic/.test(gov)) return 0.35;
  return 0.42;
}

function assertCanonicalTerenaRelations(runtime: ForeignAffairsRuntimeShape): void {
  for (const [countryId, expected] of Object.entries(CANONICAL_TERENA_RELATIONS)) {
    const key = bilateralKey(TERENA_WORLD_ID, countryId);
    const rel = runtime.bilateralRelations[key];
    if (!rel || rel.general !== expected) {
      throw new Error(
        `Canonical Terena relation ${countryId} expected ${expected}, got ${rel?.general ?? "missing"}`,
      );
    }
  }
}

type ForeignAffairsRuntimeShape = SimState["foreignAffairsRuntime"];

function buildCountryRuntime(
  canonical: CanonicalWorldCountry,
  leaderId: string | null,
  countries: Record<string, CanonicalWorldCountry>,
): ForeignCountryRuntime {
  const isTerena = canonical.id === TERENA_WORLD_ID;
  return {
    countryId: canonical.id,
    leaderId,
    posture: canonical.id === "W40" ? "heightened" : "normal",
    capabilities: deriveCapabilities(canonical),
    tradeExposure: deriveTradeExposure(canonical, countries),
    strategicGoals: deriveStrategicGoals(canonical),
    institutionIds: isTerena ? ["INT_DC"] : [...canonical.alignmentIds],
    activeSanctionIds: [],
    governmentStability: deriveGovernmentStability(canonical),
    economicCapacity: deriveEconomicCapacity(canonical),
    economicTrend: 0,
    domesticPressure: deriveDomesticPressure(canonical),
    metadata: {},
  };
}

export function seedForeignAffairsRuntime(world: KernelWorld, state: SimState): void {
  const runtime = state.foreignAffairsRuntime;
  const countries = world.worldCountries;
  if (Object.keys(countries).length === 0) return;

  const leaderByCountry = new Map<string, string>();
  for (const [countryId, leaderId] of Object.entries(world.worldLeadersByCountryId)) {
    leaderByCountry.set(countryId, leaderId);
  }
  for (const [leaderId, leader] of Object.entries(world.worldLeaders)) {
    leaderByCountry.set(leader.countryId, leaderId);
  }

  for (const canonical of Object.values(countries)) {
    const isTerena = canonical.id === TERENA_WORLD_ID;
    const leaderId = isTerena ? null : (leaderByCountry.get(canonical.id) ?? null);
    if (!isTerena && !leaderId) continue;
    runtime.countries[canonical.id] = buildCountryRuntime(canonical, leaderId, countries);
  }

  const ids = Object.keys(countries).sort();
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = countries[ids[i]!]!;
      const b = countries[ids[j]!]!;
      const key = bilateralKey(a.id, b.id);
      const rel: BilateralRelation = deriveInitialBilateralRelation(a, b);
      rel.lastUpdated = world.scenarioStartDate;
      runtime.bilateralRelations[key] = rel;
    }
  }

  const dcMembers = ids.filter((id) => countries[id]!.alignmentIds.includes("INT_DC"));
  if (dcMembers.length >= 2) {
    const treatyId = allocateTreatyId(state);
    const treaty: TreatyRecord = {
      id: treatyId,
      kind: "collective_security",
      title: "Democratic Concord Collective Security",
      proposerId: "INT_DC",
      memberIds: dcMembers,
      signedDate: "1951-04-04" as IsoDate,
      status: "active",
      ratificationStatus: "not_required",
      ratificationVoteId: null,
      counterpartyResponses: {},
      metadata: { institutionId: "INT_DC", preexisting: true },
    };
    runtime.treaties[treatyId] = treaty;
  }

  const vaskaraTerenaKey = bilateralKey("W40", TERENA_WORLD_ID);
  const latentCrisisId = allocateCrisisId(state);
  const crisis: InternationalCrisis = {
    id: latentCrisisId,
    stage: "latent",
    participantIds: ["W40", TERENA_WORLD_ID],
    focalPairKey: vaskaraTerenaKey,
    startedDate: world.scenarioStartDate,
    lastStageChange: world.scenarioStartDate,
    intensity: 0.35,
    metadata: { label: "meridian_basin_tension", preexisting: true },
  };
  runtime.crises[latentCrisisId] = crisis;

  assertCanonicalTerenaRelations(runtime);
}

export { CANONICAL_TERENA_RELATIONS };
