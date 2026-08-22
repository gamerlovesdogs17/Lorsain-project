import { addMonths } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import type { SimEvent as HistoryEvent } from "../types.js";

function noteForeignReaction(
  state: SimState,
  orgId: string,
  summary: string,
): void {
  const actor = state.organizationRuntime.actors[orgId];
  if (!actor) return;
  actor.recentActions.unshift({
    date: state.currentDate,
    kind: "foreign",
    summary,
  });
  if (actor.recentActions.length > 6) actor.recentActions.length = 6;
  actor.cooldownUntil = addMonths(state.currentDate, 1);
}

function isForeignReactionType(type: string): boolean {
  return (
    type.includes("SANCTION") ||
    type.includes("INTERNATIONAL_CONFLICT") ||
    type === "FOREIGN_CRISIS_ESCALATED" ||
    type === "TREATY_TERMINATED"
  );
}

/** Apply domestic organization reactions to foreign events emitted this month (runs after foreign affairs). */
export function processOrganizationForeignReactions(
  state: SimState,
  world: KernelWorld,
  commandId: string,
  foreignEventsThisMonth: HistoryEvent[],
): SimEvent[] {
  const events: SimEvent[] = [];
  const reacted = state.organizationRuntime.metadata.foreignReactionKeys;
  const reactionKeys =
    reacted && typeof reacted === "object" && !Array.isArray(reacted)
      ? (reacted as Record<string, string>)
      : {};
  state.organizationRuntime.metadata.foreignReactionKeys = reactionKeys;

  for (const ev of foreignEventsThisMonth) {
    if (ev.visibility !== "public" || !isForeignReactionType(ev.type)) continue;
    const dedupeKey = `${ev.date}|${ev.type}|${[...ev.entityIds].sort().join(",")}`;
    if (reactionKeys[dedupeKey]) continue;

    let reactedOnce = false;
    for (const [orgId, actor] of Object.entries(state.organizationRuntime.actors).sort()) {
      const canon = world.interestOrganizations[orgId];
      if (!canon || !actor) continue;
      const type = canon.type.toLowerCase();

      if (ev.type.includes("SANCTION") && (type.includes("business") || type.includes("maritime"))) {
        noteForeignReaction(state, orgId, "Business and trade groups warn on sanctions fallout abroad");
        reactedOnce = true;
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "ORGANIZATION_FOREIGN_REACTION",
            importance: 0.48,
            visibility: "public",
            actorIds: [],
            entityIds: [orgId, ...ev.entityIds.slice(0, 2)],
            payload: { organizationId: orgId, foreignEventType: ev.type, theme: "sanctions" },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
        break;
      }
      if (ev.type.includes("CONFLICT") && (type.includes("advocacy") || type.includes("security"))) {
        noteForeignReaction(state, orgId, "Advocacy groups call for de-escalation and humanitarian restraint");
        reactedOnce = true;
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "ORGANIZATION_FOREIGN_REACTION",
            importance: 0.5,
            visibility: "public",
            actorIds: [],
            entityIds: [orgId, ...ev.entityIds.slice(0, 2)],
            payload: { organizationId: orgId, foreignEventType: ev.type, theme: "conflict" },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
        break;
      }
    }
    if (reactedOnce) reactionKeys[dedupeKey] = state.currentDate;
  }

  return events;
}
