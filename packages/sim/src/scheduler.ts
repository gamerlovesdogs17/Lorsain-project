import { compareIsoDate, type IsoDate } from "./calendar.js";
import type { JsonObject } from "./json.js";
import type { CommandError, ScheduledEvent, SimEvent, SimState } from "./types.js";

export function padId(prefix: string, n: number, width = 6): string {
  return `${prefix}${String(n).padStart(width, "0")}`;
}

export function compareScheduled(a: ScheduledEvent, b: ScheduledEvent): number {
  const d = compareIsoDate(a.dueDate, b.dueDate);
  if (d !== 0) return d;
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function sortScheduler(state: SimState): void {
  state.scheduler.events.sort(compareScheduled);
}

export function resolutionEventMustBlock(
  blocking: boolean,
  requiresResolution: boolean,
): CommandError | null {
  if (requiresResolution && !blocking) {
    return {
      code: "RESOLUTION_EVENT_MUST_BLOCK",
      message: "requiresResolution events must also be blocking",
    };
  }
  return null;
}

export function enqueueScheduled(
  state: SimState,
  entry: {
    dueDate: IsoDate;
    eventType: string;
    payload: JsonObject;
    priority: number;
    blocking: boolean;
    requiresResolution: boolean;
    source: string | null;
  },
): ScheduledEvent | { error: CommandError } {
  const resolutionErr = resolutionEventMustBlock(entry.blocking, entry.requiresResolution);
  if (resolutionErr) return { error: resolutionErr };
  if (compareIsoDate(entry.dueDate, state.currentDate) < 0) {
    return {
      error: {
        code: "SCHEDULE_DATE_IN_PAST",
        message: `Cannot schedule ${entry.eventType} on ${entry.dueDate} before currentDate ${state.currentDate}`,
      },
    };
  }
  const id = padId("SEV", state.counters.nextScheduledId++);
  const sequence = state.counters.schedulerSequence++;
  const ev: ScheduledEvent = {
    id,
    dueDate: entry.dueDate,
    eventType: entry.eventType,
    payload: entry.payload,
    priority: entry.priority,
    sequence,
    blocking: entry.blocking,
    requiresResolution: entry.requiresResolution,
    source: entry.source,
    status: "pending",
  };
  state.scheduler.events.push(ev);
  sortScheduler(state);
  return ev;
}

export function nextPendingBefore(
  state: SimState,
  target: IsoDate,
  includeTarget = false,
): ScheduledEvent | null {
  for (const ev of state.scheduler.events) {
    if (ev.status !== "pending") continue;
    if (compareIsoDate(ev.dueDate, state.currentDate) < 0) continue;
    const relativeToTarget = compareIsoDate(ev.dueDate, target);
    if (relativeToTarget > 0 || (!includeTarget && relativeToTarget === 0)) continue;
    return ev;
  }
  return null;
}

export function pushHistory(
  state: SimState,
  partial: Omit<SimEvent, "id" | "turn"> & { turn?: number },
): SimEvent {
  const ev: SimEvent = {
    id: padId("EVT", state.counters.nextEventId++),
    date: partial.date,
    turn: partial.turn ?? state.completedTurns,
    type: partial.type,
    importance: partial.importance,
    visibility: partial.visibility,
    actorIds: partial.actorIds,
    entityIds: partial.entityIds,
    payload: partial.payload,
    sourceScheduledEventId: partial.sourceScheduledEventId,
    sourceCommandId: partial.sourceCommandId,
  };
  state.history.push(ev);
  return ev;
}
