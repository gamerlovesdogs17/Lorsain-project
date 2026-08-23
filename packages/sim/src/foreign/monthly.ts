import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { seedForeignAffairsRuntime } from "./baseline.js";
import { processForeignAiMonth } from "./ai.js";
import { processCrisisLifecycle } from "./crises.js";
import { checkCrisisEmergence } from "./crisis-emergence.js";
import { processConflictMonth } from "./conflicts.js";
import { processLeadershipChanges } from "./leaders.js";
import { processTreatyRatificationVotes, processCounterpartyTreatyResponses } from "./treaties.js";
import { applyActiveTreatyEffects } from "./treaty-effects.js";
import { processInstitutionsMonth } from "./institutions.js";
import { processNpcTerenaDiplomacy } from "./terena-diplomacy.js";
import { processNpcTerenaWarPowers } from "./npc-war-powers.js";
import { processForeignDomesticStateMonth } from "./foreign-domestic-state.js";
import { processTreatyLifecycleMonth } from "./treaty-lifecycle.js";
import { refreshTradeSectorFromForeign } from "./economy-bridge.js";
import { needsForeignAffairsSeed } from "./state.js";
import { publicActiveCrises } from "./crises.js";

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

  const emerged = checkCrisisEmergence(world, state, rng, state.currentDate);
  for (const crisis of emerged) {
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "FOREIGN_CRISIS_TENSION_CREATED",
        importance: 0.35,
        visibility: "system",
        actorIds: crisis.participantIds,
        entityIds: [crisis.id],
        payload: {
          crisisId: crisis.id,
          cause: crisis.metadata.cause ?? "emergence",
          stage: crisis.stage,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  events.push(...processCrisisLifecycle(world, state, rng, state.currentDate, commandId));
  events.push(...processForeignAiMonth(world, state, rng, commandId));
  events.push(...processCounterpartyTreatyResponses(world, state, rng, commandId));
  events.push(...processTreatyRatificationVotes(world, state, rng, commandId));
  events.push(...processTreatyLifecycleMonth(world, state, state.currentDate, commandId));
  events.push(...processInstitutionsMonth(world, state, rng, commandId));
  events.push(...processNpcTerenaDiplomacy(world, state, rng, commandId));
  events.push(...processConflictMonth(state, world, state.currentDate, commandId));
  events.push(...processNpcTerenaWarPowers(world, state, rng, commandId));
  processForeignDomesticStateMonth(world, state, state.currentDate);
  applyActiveTreatyEffects(state, state.currentDate);

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
        activeCrises: publicActiveCrises(state.foreignAffairsRuntime).length,
        activeConflicts: Object.values(state.foreignAffairsRuntime.conflicts).filter(
          (c) => c.endedDate == null,
        ).length,
        pendingIncoming: state.foreignAffairsRuntime.pendingIncomingDiplomacy.length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}
