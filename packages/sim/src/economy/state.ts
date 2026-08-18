import { padId } from "../scheduler.js";
import type { SimState } from "../types.js";

export function allocateLaggedEffectId(state: SimState): string {
  return padId("ECOFX", state.counters.nextLaggedEffectId++);
}

export function allocateEconomicShockId(state: SimState): string {
  return padId("ECOS", state.counters.nextEconomicShockId++);
}
