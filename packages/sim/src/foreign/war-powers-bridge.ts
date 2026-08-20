import type { SimState } from "../types.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import type { KernelWorld } from "../types.js";
import { armExecutiveTrigger } from "../executive/procedure.js";
import { TERENA_WORLD_ID } from "./types.js";
import type { InternationalConflict } from "./types.js";

export function armWarTriggerForTerenaConflict(
  world: KernelWorld,
  state: SimState,
  conflict: InternationalConflict,
): void {
  if (!conflict.belligerentIds.includes(TERENA_WORLD_ID)) return;
  const playerIsPresident =
    currentPresidentialAuthorityId(world, state) === state.playerPoliticianId;
  if (playerIsPresident) {
    state.foreignAffairsRuntime.warTriggerArmedByConflictId = conflict.id;
    armExecutiveTrigger(state, "war");
  }
}

export function linkWarPowerToConflict(
  state: SimState,
  conflictId: string,
  warPowerId: string,
): void {
  const conflict = state.foreignAffairsRuntime.conflicts[conflictId];
  if (!conflict) return;
  conflict.warPowerId = warPowerId;
  if (state.foreignAffairsRuntime.warTriggerArmedByConflictId === conflictId) {
    state.foreignAffairsRuntime.warTriggerArmedByConflictId = null;
  }
}

export function resolveWarTriggerConflictId(state: SimState): string | null {
  return state.foreignAffairsRuntime.warTriggerArmedByConflictId;
}
