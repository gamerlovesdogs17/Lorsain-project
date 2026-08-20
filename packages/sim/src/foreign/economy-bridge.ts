import type { SimState } from "../types.js";
import { allocateLaggedEffectId } from "../economy/state.js";
import type { SanctionRecord } from "./types.js";
import { TERENA_WORLD_ID } from "./types.js";
import { tradeShockMagnitude } from "./trade.js";

export function queueSanctionTradeEffect(state: SimState, sanction: SanctionRecord): void {
  if (sanction.imposerId !== TERENA_WORLD_ID && sanction.targetId !== TERENA_WORLD_ID) return;
  const sourceId = `sanction:${sanction.id}`;
  if (state.economyRuntime.appliedPolicySources[sourceId]) return;
  const magnitude = tradeShockMagnitude(
    state.foreignAffairsRuntime.countries[TERENA_WORLD_ID]?.tradeExposure ?? 0.25,
    sanction.severity,
  );
  const direction = sanction.targetId === TERENA_WORLD_ID ? -1 : -0.5;
  const id = allocateLaggedEffectId(state);
  state.economyRuntime.laggedEffects.push({
    id,
    sourceId,
    remainingMonths: 4,
    totalMonths: 4,
    lagKind: "medium",
    policyItems: [
      {
        issueId: "ISS_TRADE",
        direction,
        magnitude,
        fiscalImpact: direction * magnitude * 0.02,
      },
    ],
    metadata: { sanctionId: sanction.id, domain: "foreign" },
  });
  state.economyRuntime.appliedPolicySources[sourceId] = id;
}

export function queueTradeNegotiationEffect(state: SimState, partnerId: string): void {
  const sourceId = `trade_neg:${partnerId}:${state.currentDate.slice(0, 7)}`;
  if (state.economyRuntime.appliedPolicySources[sourceId]) return;
  const exposure =
    state.foreignAffairsRuntime.countries[partnerId]?.tradeExposure ??
    state.foreignAffairsRuntime.countries[TERENA_WORLD_ID]?.tradeExposure ??
    0.2;
  const magnitude = tradeShockMagnitude(exposure, 0.35);
  const id = allocateLaggedEffectId(state);
  state.economyRuntime.laggedEffects.push({
    id,
    sourceId,
    remainingMonths: 3,
    totalMonths: 3,
    lagKind: "short",
    policyItems: [
      {
        issueId: "ISS_TRADE",
        direction: 1,
        magnitude,
        fiscalImpact: magnitude * 0.015,
      },
    ],
    metadata: { partnerId, domain: "foreign" },
  });
  state.economyRuntime.appliedPolicySources[sourceId] = id;
}

export function refreshTradeSectorFromForeign(state: SimState): void {
  const runtime = state.foreignAffairsRuntime;
  const terena = runtime.countries[TERENA_WORLD_ID];
  if (!terena) return;
  let pressure = 0;
  for (const sid of terena.activeSanctionIds) {
    const s = runtime.sanctions[sid];
    if (s?.active) pressure += s.severity * 0.08;
  }
  const trade = state.economyRuntime.sectors.trade;
  if (!trade) return;
  const delta = Math.max(-3, Math.min(3, (0.15 - pressure) * 10));
  trade.conditionsIndex = Math.max(70, Math.min(130, trade.conditionsIndex + delta * 0.05));
}
