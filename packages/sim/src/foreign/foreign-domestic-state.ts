import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import { TERENA_WORLD_ID } from "./types.js";
import { activeConflicts } from "./conflicts.js";
import { getBilateralRelation } from "./state.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampTrend(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

function activeSanctionPressure(state: SimState, countryId: string): number {
  let total = 0;
  for (const sanction of Object.values(state.foreignAffairsRuntime.sanctions)) {
    if (!sanction.active || sanction.targetId !== countryId) continue;
    total += sanction.severity * (0.5 + sanction.economicWeight * 0.5);
  }
  return clamp01(total);
}

function tradeTreatyBonus(state: SimState, countryId: string): number {
  let bonus = 0;
  for (const treaty of Object.values(state.foreignAffairsRuntime.treaties)) {
    if (treaty.status !== "active" || treaty.kind !== "trade") continue;
    if (!treaty.memberIds.includes(countryId)) continue;
    bonus += 0.04;
  }
  return Math.min(0.2, bonus);
}

function warPressure(state: SimState, countryId: string): number {
  let pressure = 0;
  for (const conflict of activeConflicts(state.foreignAffairsRuntime)) {
    if (!conflict.belligerentIds.includes(countryId)) continue;
    pressure += conflict.intensity * 0.25 + conflict.politicalCost * 0.15;
  }
  return clamp01(pressure);
}

/** Lightweight monthly update for foreign domestic/economic abstract state. */
export function processForeignDomesticStateMonth(
  world: KernelWorld,
  state: SimState,
  date: IsoDate,
): void {
  void date;
  for (const [countryId, runtime] of Object.entries(state.foreignAffairsRuntime.countries).sort()) {
    if (countryId === TERENA_WORLD_ID) continue;
    const canonical = world.worldCountries[countryId];
    if (!canonical) continue;

    const sanctions = activeSanctionPressure(state, countryId);
    const war = warPressure(state, countryId);
    const tradeBonus = tradeTreatyBonus(state, countryId);
    const mobilized =
      runtime.posture === "mobilized" || runtime.posture === "crisis_deployment" ? 0.08 : 0;

    let trendDelta = tradeBonus * 0.15 - sanctions * 0.12 - war * 0.1 - mobilized;
    if (runtime.economicTrend < 0) trendDelta += 0.02;
    runtime.economicTrend = clampTrend(runtime.economicTrend * 0.85 + trendDelta);

    const economyStress = clamp01(
      (runtime.economicTrend < -0.2 ? 0.08 : 0) + sanctions * 0.15 + war * 0.12,
    );
    runtime.governmentStability = clamp01(
      runtime.governmentStability * 0.97 + (0.5 - economyStress) * 0.03 - war * 0.02,
    );

    let pressureDelta = sanctions * 0.06 + war * 0.08 + mobilized * 0.5;
    if (runtime.economicTrend < -0.35) pressureDelta += 0.04;
    if (runtime.economicTrend > 0.2 && war < 0.1) pressureDelta -= 0.03;
    runtime.domesticPressure = clamp01(runtime.domesticPressure * 0.94 + pressureDelta);

    if (runtime.economicTrend > 0.05) {
      runtime.economicCapacity = clamp01(runtime.economicCapacity + 0.001);
    } else if (runtime.economicTrend < -0.25) {
      runtime.economicCapacity = clamp01(runtime.economicCapacity - 0.002);
    }

    if (sanctions > 0.2) {
      for (const otherId of canonical.neighborIds) {
        const rel = getBilateralRelation(state.foreignAffairsRuntime, countryId, otherId);
        if (rel && rel.general > -80) {
          rel.trust = clamp01(rel.trust - sanctions * 0.008);
        }
      }
    }
  }
}
