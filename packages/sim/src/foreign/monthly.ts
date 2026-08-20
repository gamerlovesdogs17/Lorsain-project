import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { seedForeignAffairsRuntime } from "./baseline.js";
import { processForeignAiMonth } from "./ai.js";
import { processCrisisLifecycle } from "./crises.js";
import { processConflictMonth } from "./conflicts.js";
import { processLeadershipChanges } from "./leaders.js";
import { processTreatyRatificationVotes } from "./treaties.js";
import { refreshTradeSectorFromForeign } from "./economy-bridge.js";
import { needsForeignAffairsSeed } from "./state.js";

export function processForeignAffairsMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.foreignAffairsRuntime.lastMonthProcessed === month) return [];
  if (needsForeignAffairsSeed(state)) seedForeignAffairsRuntime(world, state);

  state.foreignAffairsRuntime.diplomaticActionsThisMonth = 0;
  const events: SimEvent[] = [];

  processCrisisLifecycle(state, rng, state.currentDate);
  events.push(...processForeignAiMonth(world, state, rng, commandId));
  events.push(...processTreatyRatificationVotes(world, state, rng, commandId));
  processConflictMonth(state, state.currentDate);
  const leaders = processLeadershipChanges(world, state, rng, state.currentDate);
  for (const leader of leaders) {
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "FOREIGN_LEADERSHIP_CHANGE",
        importance: 0.55,
        visibility: "public",
        actorIds: [leader.countryId],
        entityIds: [leader.id],
        payload: { countryId: leader.countryId, leaderId: leader.id, name: leader.name },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
  refreshTradeSectorFromForeign(state);

  state.foreignAffairsRuntime.lastMonthProcessed = month;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "FOREIGN_AFFAIRS_MONTH",
      importance: 0.3,
      visibility: "system",
      actorIds: [],
      entityIds: [],
      payload: {
        activeCrises: Object.values(state.foreignAffairsRuntime.crises).filter(
          (c) => c.stage !== "settled",
        ).length,
        activeConflicts: Object.values(state.foreignAffairsRuntime.conflicts).filter(
          (c) => c.endedDate == null,
        ).length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}
