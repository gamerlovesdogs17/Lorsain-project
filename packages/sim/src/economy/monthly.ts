import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { allocateEconomicShockId, allocateLaggedEffectId } from "./state.js";
import {
  addIndexDelta,
  HISTORY_MONTHS,
  lagKindForIssue,
  lagMonths,
  policyIndexDelta,
  clampIndex,
  clampFiscal,
} from "./policy.js";
import { baselineEconomyRuntime, economyRuntimeFromScenario } from "./types.js";
import type { EconomyLagKind, EconomySectorId, NationalEconomyIndices } from "./types.js";

function event(
  state: SimState,
  type: string,
  payload: Record<string, string | number | boolean | null>,
  commandId: string,
  importance = 0.45,
): SimEvent {
  return pushHistory(state, {
    date: state.currentDate,
    type,
    importance,
    visibility: "public",
    actorIds: [],
    entityIds: [],
    payload,
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
}

function queuePolicySource(
  state: SimState,
  sourceId: string,
  items: Array<{ issueId: string; direction: number; magnitude: number; fiscalImpact: number | null }>,
  lagKind: EconomyLagKind,
): void {
  if (state.economyRuntime.appliedPolicySources[sourceId]) return;
  if (items.length === 0) return;
  const id = allocateLaggedEffectId(state);
  const months = lagMonths(lagKind);
  state.economyRuntime.laggedEffects.push({
    id,
    sourceId,
    remainingMonths: months,
    totalMonths: months,
    lagKind,
    policyItems: items.map((i) => ({
      issueId: i.issueId,
      direction: i.direction,
      magnitude: i.magnitude,
      fiscalImpact: i.fiscalImpact,
    })),
    metadata: {},
  });
  state.economyRuntime.appliedPolicySources[sourceId] = id;
}

function ingestPolicy(state: SimState): void {
  for (const law of Object.values(state.legislatureRuntime.enactedLaws)) {
    if (!law.operative) continue;
    const kind = lagKindForIssue(law.policyItems[0]?.issueId ?? "ISS_REFORM");
    queuePolicySource(state, `law:${law.id}`, law.policyItems, kind);
  }
  for (const reg of Object.values(state.executiveRuntime.regulations)) {
    if (reg.status !== "active") continue;
    queuePolicySource(state, `reg:${reg.id}`, reg.policyItems, "medium");
  }
}

function applyLags(state: SimState): void {
  const next = [];
  for (const effect of state.economyRuntime.laggedEffects) {
    const slice = 1 / Math.max(1, effect.totalMonths);
    for (const item of effect.policyItems) {
      addIndexDelta(state.economyRuntime.national, policyIndexDelta(item), slice);
    }
    const remaining = effect.remainingMonths - 1;
    if (remaining > 0) next.push({ ...effect, remainingMonths: remaining });
  }
  state.economyRuntime.laggedEffects = next;
}

function moveToward(current: number, target: number, rate: number, impulse = 0): number {
  return clampIndex(current + (target - current) * rate + impulse);
}

function applyMomentumAndBudget(state: SimState, world: KernelWorld, rng: RngService): void {
  const n = state.economyRuntime.national;
  const cycle = state.economyRuntime.cycle;
  cycle.monthsElapsed += 1;
  cycle.phase = (cycle.phase + (Math.PI * 2) / 78) % (Math.PI * 2);
  const wave = Math.sin(cycle.phase);
  const noise = () => (rng.float01("economy") - 0.5) * 0.18;
  cycle.outputMomentum = Math.max(
    -0.42,
    Math.min(0.42, cycle.outputMomentum * 0.72 + wave * 0.055 + noise()),
  );
  cycle.inflationMomentum = Math.max(
    -0.3,
    Math.min(0.3, cycle.inflationMomentum * 0.76 - wave * 0.025 + noise() * 0.45),
  );
  cycle.housingMomentum = Math.max(
    -0.34,
    Math.min(0.34, cycle.housingMomentum * 0.8 + Math.sin(cycle.phase - 0.8) * 0.035 + noise() * 0.5),
  );
  const scenario = world.economyScenario;
  const start = scenario?.national ?? {
    outputIndex: 100,
    employmentIndex: 100,
    priceIndex: 100,
    realWageIndex: 100,
    housingIndex: 100,
    confidenceIndex: 100,
    fiscalPressure: 0.35,
  };
  const trend = scenario?.nationalAnnualTrend ?? {
    output: 0.35,
    employment: 0.2,
    prices: 0.5,
    realWages: 0.2,
    housing: 0.15,
  };
  const years = cycle.monthsElapsed / 12;
  const outputTarget = start.outputIndex + trend.output * years + wave * 1.35;
  n.outputIndex = moveToward(n.outputIndex, outputTarget, 0.035, cycle.outputMomentum);
  const employmentTarget =
    start.employmentIndex + trend.employment * years + (n.outputIndex - start.outputIndex) * 0.42;
  n.employmentIndex = moveToward(
    n.employmentIndex,
    employmentTarget,
    0.045,
    cycle.outputMomentum * 0.32 + noise() * 0.25,
  );
  const priceTarget = start.priceIndex + trend.prices * years - wave * 0.5;
  n.priceIndex = moveToward(n.priceIndex, priceTarget, 0.025, cycle.inflationMomentum);
  const wageTarget =
    start.realWageIndex + trend.realWages * years +
    (n.employmentIndex - start.employmentIndex) * 0.24 -
    (n.priceIndex - start.priceIndex) * 0.12;
  n.realWageIndex = moveToward(n.realWageIndex, wageTarget, 0.035, noise() * 0.18);
  const housingTarget = start.housingIndex + trend.housing * years + Math.sin(cycle.phase - 0.8) * 1.1;
  n.housingIndex = moveToward(n.housingIndex, housingTarget, 0.028, cycle.housingMomentum);
  const confidenceTarget =
    start.confidenceIndex + (n.outputIndex - start.outputIndex) * 0.6 -
    (n.priceIndex - start.priceIndex) * 0.22 - (n.fiscalPressure - start.fiscalPressure) * 4;
  n.confidenceIndex = moveToward(n.confidenceIndex, confidenceTarget, 0.08, noise() * 0.45);
  const budgets = Object.values(state.executiveRuntime.budgets);
  const latest = budgets.sort((a, b) => (a.fiscalYear < b.fiscalYear ? 1 : -1))[0];
  if (latest?.status === "approved") n.fiscalPressure = clampFiscal(n.fiscalPressure - 0.01);
  else if (latest?.status === "continuing") n.fiscalPressure = clampFiscal(n.fiscalPressure + 0.008);
  n.confidenceIndex = clampIndex(n.confidenceIndex - (n.fiscalPressure - 0.35) * 0.4);
}

function applyShock(state: SimState, world: KernelWorld, rng: RngService, commandId: string): SimEvent[] {
  const events: SimEvent[] = [];
  const early =
    world.scenarioStartDate <= "2028-01-01" && state.currentDate < "2028-03-01";
  const roll = rng.float01("economy");
  let magnitude = (rng.float01("economy") - 0.5) * 0.28;
  let kind = "routine";
  if (!early && roll < 0.035) {
    magnitude = (rng.float01("economy") - 0.5) * 2.2;
    kind = magnitude > 0 ? "expansion" : "contraction";
  }
  const n = state.economyRuntime.national;
  n.outputIndex = clampIndex(n.outputIndex + magnitude);
  n.employmentIndex = clampIndex(n.employmentIndex + magnitude * 0.45);
  n.confidenceIndex = clampIndex(n.confidenceIndex + magnitude * 0.55);
  n.priceIndex = clampIndex(n.priceIndex + Math.abs(magnitude) * 0.15);
  if (Math.abs(magnitude) >= 0.6) {
    const id = allocateEconomicShockId(state);
    state.economyRuntime.shocks.push({
      id,
      date: state.currentDate,
      kind,
      magnitude,
      remainingMonths: 2,
      metadata: {},
    });
    events.push(
      event(
        state,
        "ECONOMIC_SHOCK",
        { shockId: id, kind, magnitude },
        commandId,
        0.7,
      ),
    );
  }
  state.economyRuntime.shocks = state.economyRuntime.shocks.filter((s) => {
    s.remainingMonths -= 1;
    return s.remainingMonths > 0;
  });
  return events;
}

function updateRegions(world: KernelWorld, state: SimState): void {
  const n = state.economyRuntime.national;
  const scenario = world.economyScenario;
  const startNational = scenario?.national ?? {
    outputIndex: 100,
    employmentIndex: 100,
    priceIndex: 100,
    realWageIndex: 100,
    housingIndex: 100,
    confidenceIndex: 100,
    fiscalPressure: 0.35,
  };
  const years = state.economyRuntime.cycle.monthsElapsed / 12;
  for (const [sectorId, current] of Object.entries(state.economyRuntime.sectors)) {
    const profile = scenario?.sectors[sectorId as keyof typeof scenario.sectors];
    if (!profile) continue;
    let nationalSignal = n.outputIndex - startNational.outputIndex;
    if (sectorId === "labor") {
      nationalSignal = ((n.employmentIndex - startNational.employmentIndex) +
        (n.realWageIndex - startNational.realWageIndex)) / 2;
    } else if (sectorId === "housing") {
      nationalSignal = n.housingIndex - startNational.housingIndex;
    } else if (sectorId === "trade") {
      nationalSignal =
        (n.outputIndex - startNational.outputIndex) * 0.65 -
        (n.priceIndex - startNational.priceIndex) * 0.25;
    } else if (sectorId === "services") {
      nationalSignal =
        (n.outputIndex - startNational.outputIndex) * 0.45 +
        (n.confidenceIndex - startNational.confidenceIndex) * 0.55;
    }
    const target =
      profile.conditionsIndex + nationalSignal * profile.cyclicalSensitivity +
      profile.annualStructuralTrend * years;
    current.conditionsIndex = moveToward(current.conditionsIndex, target, 0.12);
  }
  for (const provinceId of world.provinceIds) {
    const profile = scenario?.provinces[provinceId];
    const current = state.economyRuntime.provinces[provinceId] ?? {
      conditionsIndex: profile?.starting.conditionsIndex ?? 100,
      employmentIndex: profile?.starting.employmentIndex ?? 100,
      housingIndex: profile?.starting.housingIndex ?? 100,
    };
    if (!profile) {
      current.conditionsIndex = moveToward(current.conditionsIndex, n.outputIndex, 0.08);
      current.employmentIndex = moveToward(current.employmentIndex, n.employmentIndex, 0.08);
      current.housingIndex = moveToward(current.housingIndex, n.housingIndex, 0.08);
      state.economyRuntime.provinces[provinceId] = current;
      continue;
    }
    const sectorSignal = Object.entries(profile.sectorExposure).reduce((sum, [sectorId, weight]) => {
      const sector = state.economyRuntime.sectors[sectorId];
      const base = scenario?.sectors[sectorId as EconomySectorId]?.conditionsIndex ?? 100;
      return sum + ((sector?.conditionsIndex ?? base) - base) * weight;
    }, 0);
    const outputSignal = n.outputIndex - startNational.outputIndex;
    const employmentSignal = n.employmentIndex - startNational.employmentIndex;
    const housingSignal = n.housingIndex - startNational.housingIndex;
    const priceSignal = n.priceIndex - startNational.priceIndex;
    const tradeProfile = scenario.sectors.trade;
    const tradeSignal =
      (state.economyRuntime.sectors.trade?.conditionsIndex ?? tradeProfile.conditionsIndex) -
      tradeProfile.conditionsIndex;
    current.conditionsIndex = moveToward(
      current.conditionsIndex,
      profile.starting.conditionsIndex +
        outputSignal * profile.sensitivity.growth * 0.55 +
        sectorSignal * 0.45 +
        tradeSignal * profile.sensitivity.trade * 0.16 -
        priceSignal * profile.sensitivity.inflation * 0.18 +
        profile.annualStructuralTrend.conditions * years,
      0.1,
    );
    current.employmentIndex = moveToward(
      current.employmentIndex,
      profile.starting.employmentIndex + employmentSignal * profile.sensitivity.growth +
        sectorSignal * 0.25 +
        tradeSignal * profile.sensitivity.trade * 0.1 +
        profile.annualStructuralTrend.employment * years,
      0.09,
    );
    current.housingIndex = moveToward(
      current.housingIndex,
      profile.starting.housingIndex + housingSignal * profile.sensitivity.housing -
        priceSignal * 0.12 + profile.annualStructuralTrend.housing * years,
      0.07,
    );
    state.economyRuntime.provinces[provinceId] = current;
  }
}

/** Legacy/reference composites for worlds that do not provide canonical sector profiles. */
export function sectorIndicesFromNational(
  n: NationalEconomyIndices,
): Record<string, { conditionsIndex: number }> {
  return {
    labor: { conditionsIndex: clampIndex((n.employmentIndex + n.realWageIndex) / 2) },
    manufacturing: { conditionsIndex: clampIndex(n.outputIndex * 0.7 + n.employmentIndex * 0.3) },
    agriculture: { conditionsIndex: clampIndex(n.outputIndex * 0.6 + n.confidenceIndex * 0.4) },
    services: { conditionsIndex: clampIndex(n.confidenceIndex * 0.6 + n.outputIndex * 0.4) },
    housing: { conditionsIndex: clampIndex(n.housingIndex) },
    trade: {
      conditionsIndex: clampIndex(
        n.outputIndex * 0.6 + n.confidenceIndex * 0.2 + (200 - n.priceIndex) * 0.2,
      ),
    },
  };
}

function bumpIssueClimate(
  world: KernelWorld,
  climate: Record<string, number>,
  issueId: string,
  delta: number,
): void {
  if (!world.issueIds.includes(issueId)) return;
  climate[issueId] = Math.max(-1, Math.min(1, (climate[issueId] ?? 0) * 0.85 + delta));
}

function publicPoliticalEffects(world: KernelWorld, state: SimState): void {
  const n = state.economyRuntime.national;
  const conf = (n.confidenceIndex - 100) / 100;
  const prices = (n.priceIndex - 100) / 100;
  const housing = (100 - n.housingIndex) / 100;
  const president = currentPresidentialAuthorityId(world, state);
  if (president) {
    const standing = ensureCandidateStanding(world, state, president);
    standing.favorability = clampUnit(standing.favorability + Math.max(-0.018, Math.min(0.018, conf * 0.04)));
    standing.momentum = clampUnit(standing.momentum + Math.max(-0.012, Math.min(0.012, conf * 0.03)));
  }
  const climate = state.electoralEnvironment.issueClimateShift;
  bumpIssueClimate(world, climate, "ISS_HOUSING", housing * 0.04);
  bumpIssueClimate(world, climate, "ISS_WELFARE", prices * 0.03);
  bumpIssueClimate(world, climate, "ISS_LABOR", ((100 - n.employmentIndex) / 100) * 0.03);
}

export function processEconomyMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.economyRuntime.lastMonthProcessed === month) return [];
  if (Object.keys(state.economyRuntime.provinces).length === 0) {
    const seeded = world.economyScenario
      ? economyRuntimeFromScenario(world.economyScenario)
      : baselineEconomyRuntime(world.provinceIds, state.currentDate);
    state.economyRuntime.provinces = seeded.provinces;
    state.economyRuntime.provinceHistory = seeded.provinceHistory;
  }
  const events: SimEvent[] = [];
  ingestPolicy(state);
  applyLags(state);
  applyMomentumAndBudget(state, world, rng);
  events.push(...applyShock(state, world, rng, commandId));
  updateRegions(world, state);
  publicPoliticalEffects(world, state);
  state.economyRuntime.history.push({ date: month, ...state.economyRuntime.national });
  if (state.economyRuntime.history.length > HISTORY_MONTHS) {
    state.economyRuntime.history.splice(0, state.economyRuntime.history.length - HISTORY_MONTHS);
  }
  for (const [id, province] of Object.entries(state.economyRuntime.provinces)) {
    const rows = (state.economyRuntime.provinceHistory[id] ??= []);
    rows.push({ date: month, ...province });
    if (rows.length > HISTORY_MONTHS) rows.splice(0, rows.length - HISTORY_MONTHS);
  }
  for (const [id, sector] of Object.entries(state.economyRuntime.sectors)) {
    const rows = (state.economyRuntime.sectorHistory[id] ??= []);
    rows.push({ date: month, ...sector });
    if (rows.length > HISTORY_MONTHS) rows.splice(0, rows.length - HISTORY_MONTHS);
  }
  state.economyRuntime.lastMonthProcessed = month;
  const n = state.economyRuntime.national;
  events.push(
    event(
      state,
      "ECONOMY_MONTH",
      {
        outputIndex: n.outputIndex,
        employmentIndex: n.employmentIndex,
        priceIndex: n.priceIndex,
        confidenceIndex: n.confidenceIndex,
      },
      commandId,
      0.35,
    ),
  );
  return events;
}
