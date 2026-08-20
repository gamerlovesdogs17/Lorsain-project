import { padId } from "../scheduler.js";
import type { SimState } from "../types.js";
import {
  emptyForeignAffairsRuntime,
  type BilateralRelation,
  type ForeignAffairsRuntime,
} from "./types.js";

export function bilateralKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function allocateTreatyId(state: SimState): string {
  return padId("TRT", state.counters.nextTreatyId++);
}

export function allocateSanctionId(state: SimState): string {
  return padId("SAN", state.counters.nextSanctionId++);
}

export function allocateCrisisId(state: SimState): string {
  return padId("CRI", state.counters.nextCrisisId++);
}

export function allocateConflictId(state: SimState): string {
  return padId("CNF", state.counters.nextConflictId++);
}

export function allocateForeignLeaderId(state: SimState): string {
  return padId("WLD", state.counters.nextForeignLeaderId++);
}

export function allocateDiplomaticActionId(state: SimState): string {
  return padId("DIP", state.counters.nextDiplomaticActionId++);
}

export function allocateTreatyRatificationId(state: SimState): string {
  return padId("TRV", state.counters.nextTreatyRatificationId++);
}

export function ensureForeignAffairsRuntime(state: SimState): ForeignAffairsRuntime {
  if (!state.foreignAffairsRuntime) {
    state.foreignAffairsRuntime = emptyForeignAffairsRuntime();
  }
  return state.foreignAffairsRuntime;
}

export function needsForeignAffairsSeed(state: SimState): boolean {
  return Object.keys(state.foreignAffairsRuntime?.countries ?? {}).length === 0;
}

export function getBilateralRelation(
  runtime: ForeignAffairsRuntime,
  a: string,
  b: string,
): BilateralRelation | undefined {
  return runtime.bilateralRelations[bilateralKey(a, b)];
}

export { parseForeignAffairsRuntime } from "./validation.js";
