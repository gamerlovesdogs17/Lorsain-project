import type { KernelWorld, SimState } from "../types.js";
import { activeTermsForPolitician, occupyingTerms, officesOfKind } from "../offices.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import type {
  GubernatorialElection,
  ProvinceGovernanceState,
  ProvincialInvestment,
  ProvincialRuntime,
} from "./types.js";
import { emptyProvincialRuntime } from "./types.js";

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function governorOfficeForProvince(world: KernelWorld, provinceId: string) {
  return officesOfKind(world, "governor").find((office) => office.provinceId === provinceId) ?? null;
}

export function currentGovernorId(
  world: KernelWorld,
  state: SimState,
  provinceId: string,
): string | null {
  const office = governorOfficeForProvince(world, provinceId);
  if (!office) return null;
  return occupyingTerms(state, office.id)[0]?.holderId ?? null;
}

export function governedProvinceId(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string | null {
  for (const term of activeTermsForPolitician(state, politicianId)) {
    const office = world.offices[term.officeId];
    if (office?.kind === "governor" && office.provinceId) return office.provinceId;
  }
  return null;
}

function electionYearForProvince(_provinceId: string, scenarioYear: number): number {
  // V1 procedural assumption: all provincial executives next face voters in
  // 2029, then every four years. It is gameplay procedure, not constitutional lore.
  return scenarioYear + 1;
}

export function gubernatorialElectionId(provinceId: string, year: number): string {
  return `ELEC_GOV_${provinceId}_${year}`;
}

export function createGubernatorialElection(
  provinceId: string,
  year: number,
  incumbentId: string | null,
): GubernatorialElection {
  return {
    id: gubernatorialElectionId(provinceId, year),
    provinceId,
    date: `${year}-10-01`,
    filingOpenDate: `${year}-03-01`,
    filingDeadlineDate: `${year}-07-01`,
    assumptionDate: `${year}-11-01`,
    status: "planned",
    incumbentId,
    candidates: {},
    playerDecision: null,
    winnerId: null,
    voteShares: {},
    turnoutRate: null,
    resultEventId: null,
  };
}

function provinceState(
  world: KernelWorld,
  state: SimState,
  provinceId: string,
): ProvinceGovernanceState {
  const governorId = currentGovernorId(world, state, provinceId);
  const favorability = governorId
    ? candidateStandingOrDefault(world, state, governorId).favorability
    : 0;
  return {
    provinceId,
    administrativePriority: "transport",
    investmentEmphasis: "transport",
    politicalCapital: 0.62,
    publicStanding: clampUnit(favorability),
    federalRelationship: 0,
    actionPointsRemaining: 2,
    actionPointsMonth: state.currentDate,
    investmentMomentum: {
      transport: 0,
      housing: 0,
      schools: 0,
      hospitals: 0,
    },
    activePressureId: null,
    recentActionIds: [],
  };
}

export function seedProvincialRuntime(
  world: KernelWorld,
  state: SimState,
  existing: ProvincialRuntime = emptyProvincialRuntime(),
): ProvincialRuntime {
  for (const provinceId of world.provinceIds) {
    existing.provinces[provinceId] ??= provinceState(world, state, provinceId);
    const hasFuture = Object.values(existing.elections).some(
      (election) => election.provinceId === provinceId && election.status !== "assumed",
    );
    if (!hasFuture) {
      const year = electionYearForProvince(provinceId, Number(state.scenarioStartDate.slice(0, 4)));
      const election = createGubernatorialElection(
        provinceId,
        year,
        currentGovernorId(world, state, provinceId),
      );
      existing.elections[election.id] = election;
    }
  }
  return existing;
}

export function resetProvinceActionPoints(state: SimState, provinceId: string): void {
  const province = state.provincialRuntime.provinces[provinceId];
  if (!province || province.actionPointsMonth === state.currentDate) return;
  province.actionPointsMonth = state.currentDate;
  province.actionPointsRemaining = 2;
}

export function addInvestmentMomentum(
  province: ProvinceGovernanceState,
  focus: ProvincialInvestment,
  amount: number,
): void {
  province.investmentMomentum[focus] = Math.max(
    0,
    Math.min(1, province.investmentMomentum[focus] + amount),
  );
}
