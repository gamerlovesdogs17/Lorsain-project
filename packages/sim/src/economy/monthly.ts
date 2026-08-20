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
import type { EconomyLagKind, NationalEconomyIndices, RegionalEconomyIndices } from "./types.js";

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

function applyMomentumAndBudget(state: SimState, rng: RngService): void {
  const n = state.economyRuntime.national;
  const prev = state.economyRuntime.history[state.economyRuntime.history.length - 1];
  const keys = [
    "outputIndex",
    "employmentIndex",
    "priceIndex",
    "realWageIndex",
    "housingIndex",
    "confidenceIndex",
  ] as const;
  for (const key of keys) {
    const last = prev?.[key] ?? 100;
    const delta = n[key] - last;
    const revert = (100 - n[key]) * 0.02;
    n[key] = clampIndex(n[key] + delta * 0.28 + revert);
  }
  const budgets = Object.values(state.executiveRuntime.budgets);
  const latest = budgets.sort((a, b) => (a.fiscalYear < b.fiscalYear ? 1 : -1))[0];
  if (latest?.status === "approved") n.fiscalPressure = clampFiscal(n.fiscalPressure - 0.01);
  else if (latest?.status === "continuing") n.fiscalPressure = clampFiscal(n.fiscalPressure + 0.008);
  n.confidenceIndex = clampIndex(n.confidenceIndex - (n.fiscalPressure - 0.35) * 0.4);
  void rng;
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

function archetypeWeight(archetype: string): {
  employment: number;
  housing: number;
  trade: number;
  labor: number;
} {
  const a = archetype.toLowerCase();
  return {
    employment: /industrial|union|working/.test(a) ? 1 : /public-sector|public sector/.test(a) ? 0.6 : 0.3,
    housing: /renter|urban|young/.test(a) ? 1 : /professional/.test(a) ? 0.5 : 0.25,
    trade: /maritime|trade|agriculture|farm/.test(a) ? 1 : /business/.test(a) ? 0.6 : 0.2,
    labor: /union|working|public/.test(a) ? 1 : 0.25,
  };
}

function updateRegions(world: KernelWorld, state: SimState): void {
  const n = state.economyRuntime.national;
  for (const provinceId of world.provinceIds) {
    let emp = 0;
    let house = 0;
    let trade = 0;
    let labor = 0;
    let w = 0;
    for (const [cid, shares] of Object.entries(world.constituencyProvinceShares)) {
      const share = shares.find((s) => s.provinceId === provinceId)?.share ?? 0;
      if (share <= 0) continue;
      const pop = world.constituencyElectorate[cid]?.population ?? 1;
      for (const blocId of world.voterBlocIdsByConstituency[cid] ?? []) {
        const bloc = world.voterBlocs[blocId];
        if (!bloc) continue;
        const aw = archetypeWeight(bloc.archetype);
        const wt = share * pop * bloc.weight;
        emp += aw.employment * wt;
        house += aw.housing * wt;
        trade += aw.trade * wt;
        labor += aw.labor * wt;
        w += wt;
      }
    }
    const mix = w > 0 ? { emp: emp / w, house: house / w, trade: trade / w, labor: labor / w } : {
      emp: 0.4,
      house: 0.4,
      trade: 0.4,
      labor: 0.4,
    };
    const rec: RegionalEconomyIndices = {
      conditionsIndex: clampIndex(
        n.outputIndex * 0.55 +
          n.confidenceIndex * 0.25 +
          (n.employmentIndex - 100) * mix.emp * 0.2 +
          100 * (1 - 0.55 - 0.25),
      ),
      employmentIndex: clampIndex(n.employmentIndex + (n.realWageIndex - 100) * mix.labor * 0.15),
      housingIndex: clampIndex(n.housingIndex + (100 - n.priceIndex) * mix.house * 0.08),
    };
    rec.conditionsIndex = clampIndex(
      rec.conditionsIndex + (n.outputIndex - 100) * mix.trade * 0.12,
    );
    state.economyRuntime.provinces[provinceId] = rec;
  }
  Object.assign(state.economyRuntime.sectors, sectorIndicesFromNational(n));
}

/** Sector composites stay at 100 when every national index is at the January 2028 baseline. */
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
    for (const id of world.provinceIds) {
      state.economyRuntime.provinces[id] = {
        conditionsIndex: 100,
        employmentIndex: 100,
        housingIndex: 100,
      };
    }
  }
  const events: SimEvent[] = [];
  ingestPolicy(state);
  applyLags(state);
  applyMomentumAndBudget(state, rng);
  events.push(...applyShock(state, world, rng, commandId));
  updateRegions(world, state);
  publicPoliticalEffects(world, state);
  state.economyRuntime.history.push({ date: month, ...state.economyRuntime.national });
  if (state.economyRuntime.history.length > HISTORY_MONTHS) {
    state.economyRuntime.history.splice(0, state.economyRuntime.history.length - HISTORY_MONTHS);
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
