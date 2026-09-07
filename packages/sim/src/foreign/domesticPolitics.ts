/**
 * Phase 16 — domestic foreign-policy politics bridge.
 *
 * On major public FA events (treaties, sanctions, crises), nudge caucus priorities,
 * party platform foreign_policy salience, and light org pressure. Complements
 * organization-foreign-bridge (org reaction events).
 */
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { ensureCaucusRuntime } from "../caucus/state.js";
import { ensureGoverningRuntime } from "../governing/state.js";
import { clampUnit } from "../governing/capacity.js";

const FOREIGN_PRIORITY = "foreign_policy";

function isMajorForeignEvent(type: string): boolean {
  return (
    type.includes("SANCTION") ||
    type.includes("TREATY") ||
    type.includes("CONFLICT") ||
    type === "FOREIGN_CRISIS_ESCALATED" ||
    type === "CRISIS_ESCALATED" ||
    type === "CRISIS_DEESCALATED" ||
    type === "MILITARY_POSTURE_CHANGED" ||
    type === "TREATY_TERMINATED"
  );
}

function themeFor(type: string): "sanctions" | "treaty" | "crisis" | "posture" {
  if (type.includes("SANCTION")) return "sanctions";
  if (type.includes("TREATY")) return "treaty";
  if (type.includes("POSTURE")) return "posture";
  return "crisis";
}

function bumpCaucusPriorities(state: SimState): number {
  const runtime = ensureCaucusRuntime(state);
  let touched = 0;
  for (const caucus of Object.values(runtime.caucuses)) {
    if (!caucus.priorities.includes(FOREIGN_PRIORITY)) {
      caucus.priorities = [FOREIGN_PRIORITY, ...caucus.priorities].slice(0, 10);
      touched += 1;
    }
  }
  return touched;
}

function bumpPartyPlatformSalience(state: SimState, theme: string): number {
  let touched = 0;
  for (const party of Object.values(state.partyStates)) {
    if (!party.publicPlatform) continue;
    const positions = party.publicPlatform.positions;
    const current = positions.foreign_policy ?? 0;
    const delta =
      theme === "sanctions" || theme === "crisis" ? 0.02 : theme === "treaty" ? 0.01 : 0.015;
    const next = Math.max(-1, Math.min(1, current + (current >= 0 ? delta : -delta)));
    if (next !== current) {
      positions.foreign_policy = next;
      party.publicPlatform.updatedDate = state.currentDate;
      touched += 1;
    }
  }
  return touched;
}

function bumpOrgPressure(state: SimState, theme: string): number {
  const meta = state.organizationRuntime.metadata;
  const pressureKey = `foreignPressure:${theme}`;
  const prev = typeof meta[pressureKey] === "number" ? (meta[pressureKey] as number) : 0;
  meta[pressureKey] = Math.min(
    1,
    prev + (theme === "crisis" ? 0.08 : theme === "sanctions" ? 0.06 : 0.04),
  );
  meta.foreignPressureDate = state.currentDate;

  let touched = 0;
  for (const actor of Object.values(state.organizationRuntime.actors)) {
    if (!actor) continue;
    actor.recentActions.unshift({
      date: state.currentDate,
      kind: "foreign_politics",
      summary: `Domestic pressure rising on ${theme}`,
    });
    if (actor.recentActions.length > 6) actor.recentActions.length = 6;
    touched += 1;
    if (touched >= 4) break;
  }
  return touched;
}

/**
 * Apply domestic political reactions to major foreign events emitted this month.
 * Runs after organization-foreign-bridge in the monthly engine.
 * Dedupes via organizationRuntime.metadata.domesticPoliticsKeys.
 */
export function processDomesticForeignPolitics(
  state: SimState,
  _world: KernelWorld,
  commandId: string,
  foreignEventsThisMonth: SimEvent[],
): SimEvent[] {
  const events: SimEvent[] = [];
  const meta = state.organizationRuntime.metadata;
  const reactedRaw = meta.domesticPoliticsKeys;
  const reacted =
    reactedRaw && typeof reactedRaw === "object" && !Array.isArray(reactedRaw)
      ? (reactedRaw as Record<string, string>)
      : {};
  meta.domesticPoliticsKeys = reacted;

  for (const ev of foreignEventsThisMonth) {
    if (ev.visibility !== "public" || !isMajorForeignEvent(ev.type)) continue;
    const dedupeKey = `dom|${ev.date}|${ev.type}|${[...ev.entityIds].sort().join(",")}`;
    if (reacted[dedupeKey]) continue;

    const theme = themeFor(ev.type);
    const caucusTouched = bumpCaucusPriorities(state);
    if (theme === "crisis" || theme === "sanctions") {
      const caucusRuntime = ensureCaucusRuntime(state);
      for (const caucus of Object.values(caucusRuntime.caucuses)) {
        if (caucus.stanceTowardChair === "cooperative") {
          caucus.stanceTowardChair = "conditional";
          break;
        }
      }
    }
    const partyTouched = bumpPartyPlatformSalience(state, theme);
    const orgTouched = bumpOrgPressure(state, theme);

    if (theme === "crisis" || theme === "sanctions") {
      const governing = ensureGoverningRuntime(state);
      for (const [officeId, rec] of Object.entries(governing.ministerialPerformance)) {
        if (rec.departmentId !== "foreign") continue;
        const penalty = theme === "crisis" ? 0.04 : 0.025;
        rec.score = clampUnit(rec.score - penalty);
        rec.updatedDate = state.currentDate;
        governing.ministerialPerformance[officeId] = rec;
      }
    }

    reacted[dedupeKey] = state.currentDate;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "DOMESTIC_FOREIGN_POLITICS_REACTION",
        importance: 0.42,
        visibility: "public",
        actorIds: [],
        entityIds: [...ev.entityIds.slice(0, 3)],
        payload: {
          foreignEventType: ev.type,
          theme,
          caucusTouched,
          partyTouched,
          orgTouched,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
