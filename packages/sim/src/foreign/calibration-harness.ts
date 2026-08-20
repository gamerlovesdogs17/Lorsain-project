import { addMonths } from "../calendar.js";
import { padId } from "../scheduler.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { processForeignAffairsMonth } from "./monthly.js";

/**
 * Calibration-only month advance: runs foreign affairs without domestic scheduled interrupts.
 * Never used in normal gameplay — see scripts/foreign-calibration.ts.
 */
export function advanceOneForeignCalibrationMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
): void {
  const target = addMonths(state.scenarioStartDate, state.completedTurns + 1);
  const commandId = padId("CMD", state.counters.nextCommandId++);
  processForeignAffairsMonth(state, world, rng, commandId);
  state.currentDate = target;
  state.completedTurns += 1;
  state.activeTurnTarget = null;
  state.pendingInterrupt = null;
}

export function advanceForeignCalibrationMonths(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  months: number,
): number {
  for (let i = 0; i < months; i += 1) {
    advanceOneForeignCalibrationMonth(state, world, rng);
  }
  return months;
}
