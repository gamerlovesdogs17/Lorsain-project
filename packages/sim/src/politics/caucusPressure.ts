import { pushHistory } from "../scheduler.js";
import { CAUCUS_PRESSURE_TEMPLATES } from "../partyOrg/catalog.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";

function deterministicRoll(partyId: string, templateId: string, dateStr: string): number {
  let h = 0;
  const s = `${partyId}:${templateId}:${dateStr}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

/**
 * Rare caucus pressure events tied to leadership agendas (Phase 17B wave 2).
 */
export function processCaucusPressureMonth(
  _world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (rng.float01("npc-decisions") > 0.22) return events;

  const leadershipEntries = Object.entries(state.legislatureRuntime.caucusLeadership).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  for (const [partyId, leadership] of leadershipEntries) {
    const hasPriority = leadership.priorityBillIds.length > 0;
    const applicable = CAUCUS_PRESSURE_TEMPLATES.filter(
      (t) => !t.requiresPriorityBill || hasPriority,
    );
    if (applicable.length === 0) continue;

    const roll = deterministicRoll(partyId, "pressure", state.currentDate);
    if (roll > 0.06) continue;

    const idx = Math.floor(
      deterministicRoll(partyId, "pick", state.currentDate) * applicable.length,
    );
    const template = applicable[idx] ?? applicable[0]!;
    const actorIds = [leadership.floorLeaderId, leadership.whipId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "CAUCUS_PRESSURE_EVENT",
        importance: 0.38,
        visibility: "public",
        actorIds: actorIds.slice(0, 2),
        entityIds: [partyId, template.id, ...leadership.priorityBillIds.slice(0, 2)],
        payload: {
          partyId,
          templateId: template.id,
          title: template.title,
          description: template.description,
          priorityBillIds: leadership.priorityBillIds,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    break;
  }

  return events;
}
