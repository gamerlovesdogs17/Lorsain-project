import { padId } from "../scheduler.js";
import type { SimState } from "../types.js";

export function allocateOrgActionId(state: SimState): string {
  return padId("OACT", state.counters.nextOrgActionId++);
}
