import type { IsoDate } from "../calendar.js";
import type { SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { allocateConflictId } from "./state.js";
import type { InternationalConflict, InternationalCrisis } from "./types.js";

export function beginConflictFromCrisis(
  state: SimState,
  crisis: InternationalCrisis,
  date: IsoDate,
  commandId: string | null,
): { conflict: InternationalConflict; events: SimEvent[] } {
  const id = allocateConflictId(state);
  const conflict: InternationalConflict = {
    id,
    belligerentIds: [...crisis.participantIds].sort(),
    startedDate: date,
    endedDate: null,
    intensity: Math.min(1, crisis.intensity + 0.2),
    crisisId: crisis.id,
    metadata: {},
  };
  state.foreignAffairsRuntime.conflicts[id] = conflict;
  crisis.stage = "conflict";
  crisis.lastStageChange = date;
  crisis.intensity = Math.min(1, crisis.intensity + 0.15);
  return {
    conflict,
    events: [
      pushHistory(state, {
        date,
        type: "INTERNATIONAL_CONFLICT_STARTED",
        importance: 0.95,
        visibility: "public",
        actorIds: crisis.participantIds,
        entityIds: [id, crisis.id],
        payload: { conflictId: id, crisisId: crisis.id },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function processConflictMonth(state: SimState, date: IsoDate): void {
  for (const conflict of Object.values(state.foreignAffairsRuntime.conflicts)) {
    if (conflict.endedDate) continue;
    conflict.intensity = Math.max(0.2, conflict.intensity - 0.015);
    if (conflict.intensity <= 0.25) {
      conflict.endedDate = date;
      if (conflict.crisisId) {
        const crisis = state.foreignAffairsRuntime.crises[conflict.crisisId];
        if (crisis) {
          crisis.stage = "deescalating";
          crisis.lastStageChange = date;
        }
      }
    }
  }
}

export function activeConflicts(runtime: SimState["foreignAffairsRuntime"]): InternationalConflict[] {
  return Object.values(runtime.conflicts).filter((c) => c.endedDate == null);
}
