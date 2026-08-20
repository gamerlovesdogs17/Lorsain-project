import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { allocateConflictId } from "./state.js";
import { transitionActive } from "./crises.js";
import { armWarTriggerForTerenaConflict } from "./war-powers-bridge.js";
import type { InternationalConflict, InternationalCrisis } from "./types.js";
import { TERENA_WORLD_ID } from "./types.js";

export function beginConflictFromCrisis(
  state: SimState,
  crisis: InternationalCrisis,
  date: IsoDate,
  commandId: string | null,
  aggressorId?: string,
): { conflict: InternationalConflict; events: SimEvent[] } {
  const id = allocateConflictId(state);
  const sortedParticipants = [...crisis.participantIds].sort();
  const aggressor =
    aggressorId ??
    (crisis.metadata.aggressorId as string | undefined) ??
    sortedParticipants[0] ??
    null;

  const conflict: InternationalConflict = {
    id,
    belligerentIds: sortedParticipants,
    aggressorId: aggressor,
    startedDate: date,
    endedDate: null,
    intensity: Math.min(1, crisis.intensity + 0.2),
    crisisId: crisis.id,
    objectives: ["territorial_pressure"],
    balance: 0.5,
    politicalCost: 0.3,
    outcome: null,
    ceasefireDate: null,
    warPowerId: null,
    metadata: { sourceCrisis: crisis.id },
  };
  state.foreignAffairsRuntime.conflicts[id] = conflict;
  transitionActive(crisis, date, "conflict");

  const events: SimEvent[] = [
    pushHistory(state, {
      date,
      type: "INTERNATIONAL_CONFLICT_STARTED",
      importance: 0.95,
      visibility: "public",
      actorIds: crisis.participantIds,
      entityIds: [id, crisis.id],
      payload: { conflictId: id, crisisId: crisis.id, aggressorId: aggressor },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];

  return { conflict, events };
}

export function armTerenaWarTriggerIfNeeded(
  world: KernelWorld,
  state: SimState,
  conflict: InternationalConflict,
): void {
  armWarTriggerForTerenaConflict(world, state, conflict);
}

export function processConflictMonth(
  state: SimState,
  date: IsoDate,
  commandId: string | null = null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const conflict of Object.values(state.foreignAffairsRuntime.conflicts)) {
    if (conflict.endedDate) continue;
    conflict.intensity = Math.max(0.2, conflict.intensity - 0.015);
    conflict.balance = Math.max(
      0.2,
      Math.min(0.8, conflict.balance + (conflict.intensity > 0.4 ? 0.005 : -0.005)),
    );
    conflict.politicalCost = Math.min(1, conflict.politicalCost + 0.008);

    if (conflict.intensity <= 0.25) {
      conflict.endedDate = date;
      conflict.ceasefireDate = date;
      conflict.outcome = conflict.intensity <= 0.22 ? "ceasefire" : "stalemate";

      if (conflict.crisisId) {
        const crisis = state.foreignAffairsRuntime.crises[conflict.crisisId];
        if (crisis) {
          crisis.stage = "deescalating";
          crisis.lastStageChange = date;
        }
      }

      events.push(
        pushHistory(state, {
          date,
          type: "INTERNATIONAL_CONFLICT_ENDED",
          importance: 0.85,
          visibility: "public",
          actorIds: conflict.belligerentIds,
          entityIds: [conflict.id],
          payload: {
            conflictId: conflict.id,
            outcome: conflict.outcome,
            aggressorId: conflict.aggressorId,
            ceasefireDate: conflict.ceasefireDate,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

export function activeConflicts(runtime: SimState["foreignAffairsRuntime"]): InternationalConflict[] {
  return Object.values(runtime.conflicts).filter((c) => c.endedDate == null);
}

export function terenaActiveConflicts(runtime: SimState["foreignAffairsRuntime"]): InternationalConflict[] {
  return activeConflicts(runtime).filter((c) => c.belligerentIds.includes(TERENA_WORLD_ID));
}

export function beginConflictFromCrisisWithWarTrigger(
  world: KernelWorld,
  state: SimState,
  crisis: InternationalCrisis,
  date: IsoDate,
  commandId: string | null,
  aggressorId?: string,
): { conflict: InternationalConflict; events: SimEvent[] } {
  const out = beginConflictFromCrisis(state, crisis, date, commandId, aggressorId);
  armTerenaWarTriggerIfNeeded(world, state, out.conflict);
  return out;
}
