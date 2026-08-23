import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { beginWarPowers, scheduleWarAuthorizationReferral } from "../executive/procedure.js";
import { linkWarPowerToConflict, resolveWarTriggerConflictId } from "./war-powers-bridge.js";
import { TERENA_WORLD_ID } from "./types.js";

function conflictIntensityForTrigger(state: SimState, conflictId: string | null): number {
  if (!conflictId) return 0.5;
  const conflict = state.foreignAffairsRuntime.conflicts[conflictId];
  if (!conflict || conflict.endedDate) return 0;
  return conflict.intensity;
}

/** NPC President responds to an armed war trigger when the player is not President. */
export function processNpcTerenaWarPowers(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  if (!state.executiveRuntime.warTrigger) return [];
  const president = currentPresidentialAuthorityId(world, state);
  if (!president || president === state.playerPoliticianId) return [];

  const conflictId = resolveWarTriggerConflictId(state);
  const intensity = conflictIntensityForTrigger(state, conflictId);
  const roll = rng.float01("foreign-affairs");
  const invokeThreshold = 0.35 + intensity * 0.35;
  if (roll > invokeThreshold) return [];

  const out = beginWarPowers(world, state, { actorId: president }, commandId);
  if ("error" in out) return [];
  const events = [...out.events];

  const warId = out.events.find((e) => e.type === "WAR_POWERS_BEGUN")?.payload.warPowerId;
  if (typeof warId === "string" && conflictId) {
    linkWarPowerToConflict(state, conflictId, warId);
  }

  if (typeof warId === "string") {
    const motionOut = scheduleWarAuthorizationReferral(world, state, warId, commandId);
    if (!("error" in motionOut)) events.push(...motionOut.events);
  }

  void TERENA_WORLD_ID;
  return events;
}
