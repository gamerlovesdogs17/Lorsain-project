/**
 * Phase 16 — domestic foreign-policy politics bridge.
 *
 * On major public FA events, nudge actor-specific priorities, platform salience,
 * org pressure, and (for migration themes) border-province chronicle pressure.
 * Does NOT push foreign_policy onto every caucus identically.
 *
 * Platform `positions.foreign_policy` (stance) is left alone; crises bump
 * `salience.foreign_policy` instead.
 */
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { ensureCaucusRuntime } from "../caucus/state.js";
import { ensureGoverningRuntime } from "../governing/state.js";
import { clampUnit } from "../governing/capacity.js";
import { getAgentProfile } from "../agents/profile.js";
import { provinceThemeId } from "../provinces/themes.js";
import { TERENA_WORLD_ID } from "./types.js";
import { publicActiveCrises } from "./crises.js";
import { crisisDomesticReactionTheme } from "./crisis-packages.js";

const FOREIGN_PRIORITY = "foreign_policy";
const TRADE_PRIORITY = "trade";
const SECURITY_PRIORITY = "security";
const RIGHTS_PRIORITY = "rights";
const MIGRATION_PRIORITY = "migration";

/** Monthly decay of foreign_policy salience when no active foreign pressure. */
const FOREIGN_SALIENCE_DECAY = 0.04;

type DomesticTheme =
  | "trade"
  | "sanctions"
  | "defense"
  | "rights"
  | "migration"
  | "treaty"
  | "crisis"
  | "posture"
  | "energy"
  | "technology";

function isMajorForeignEvent(type: string): boolean {
  return (
    type.includes("SANCTION") ||
    type.includes("TREATY") ||
    type.includes("CONFLICT") ||
    type.includes("TRADE") ||
    type.includes("MIGRATION") ||
    type.includes("REFUGEE") ||
    type.includes("RIGHTS") ||
    type.includes("HUMAN_RIGHTS") ||
    type === "FOREIGN_CRISIS_ESCALATED" ||
    type === "CRISIS_ESCALATED" ||
    type === "CRISIS_DEESCALATED" ||
    type === "MILITARY_POSTURE_CHANGED" ||
    type === "TREATY_TERMINATED"
  );
}

function themeFor(type: string, payload: Record<string, unknown> | undefined): DomesticTheme {
  const kind = typeof payload?.kind === "string" ? payload.kind.toLowerCase() : "";
  const narrativeTitle =
    typeof payload?.narrativeTitle === "string" ? payload.narrativeTitle : undefined;
  const domesticReaction =
    typeof payload?.domesticReaction === "string" ? payload.domesticReaction : null;
  if (domesticReaction === "energy") return "energy";
  if (domesticReaction === "technology") return "technology";
  if (narrativeTitle) {
    const crisisTheme = crisisDomesticReactionTheme(narrativeTitle);
    if (crisisTheme === "energy") return "energy";
    if (crisisTheme === "technology") return "technology";
    if (crisisTheme === "migration") return "migration";
    if (crisisTheme === "rights") return "rights";
    if (crisisTheme === "sanctions") return "sanctions";
    if (crisisTheme === "trade") return "trade";
  }
  if (type.includes("SANCTION") || kind.includes("sanction")) return "sanctions";
  if (type.includes("TRADE") || kind.includes("trade")) return "trade";
  if (
    type.includes("MIGRATION") ||
    type.includes("REFUGEE") ||
    kind.includes("migration") ||
    kind.includes("refugee")
  ) {
    return "migration";
  }
  if (type.includes("RIGHTS") || kind.includes("rights") || kind.includes("human_rights")) {
    return "rights";
  }
  if (type.includes("POSTURE") || kind.includes("defense") || kind.includes("military")) {
    return "posture";
  }
  if (type.includes("TREATY")) {
    if (domesticReaction === "rights") return "rights";
    if (domesticReaction === "sanctions") return "sanctions";
    if (domesticReaction === "trade") return "trade";
    if (kind.includes("defense") || kind.includes("security") || kind.includes("mutual")) {
      return "defense";
    }
    if (kind.includes("trade")) return "trade";
    return "treaty";
  }
  if (type.includes("CONFLICT") || type.includes("CRISIS")) return "crisis";
  return "crisis";
}

function pushUniquePriority(priorities: string[], priority: string): boolean {
  if (priorities.includes(priority)) return false;
  priorities.unshift(priority);
  if (priorities.length > 10) priorities.length = 10;
  return true;
}

function caucusLeaderIdeology(
  world: KernelWorld,
  state: SimState,
  leaderId: string | null,
): { authority: number; social: number; economic: number } {
  if (!leaderId) return { authority: 0, social: 0, economic: 0 };
  const profile = getAgentProfile(world, state, leaderId);
  return {
    authority: profile?.ideology.authority ?? 0,
    social: profile?.ideology.social ?? 0,
    economic: profile?.ideology.economic ?? 0,
  };
}

function bumpRelevantCaucusPriorities(
  world: KernelWorld,
  state: SimState,
  theme: DomesticTheme,
): number {
  const runtime = ensureCaucusRuntime(state);
  let touched = 0;
  for (const caucus of Object.values(runtime.caucuses)) {
    const ideology = caucusLeaderIdeology(world, state, caucus.leaderId);
    let priority: string | null = null;
    switch (theme) {
      case "trade":
      case "sanctions":
        // Labor-leaning (left economic) or business/export (right economic) care about trade.
        if (Math.abs(ideology.economic) >= 0.15 || caucus.priorities.includes(TRADE_PRIORITY)) {
          priority = theme === "sanctions" ? FOREIGN_PRIORITY : TRADE_PRIORITY;
        }
        break;
      case "defense":
      case "posture":
      case "crisis":
        // Security hawks (high authority) or pacifists (low authority) react to defense events.
        if (ideology.authority >= 0.2) priority = SECURITY_PRIORITY;
        else if (ideology.authority <= -0.2) priority = FOREIGN_PRIORITY;
        else if (caucus.priorities.includes(SECURITY_PRIORITY)) priority = SECURITY_PRIORITY;
        break;
      case "rights":
        if (ideology.social <= -0.1 || caucus.priorities.includes(RIGHTS_PRIORITY)) {
          priority = RIGHTS_PRIORITY;
        }
        break;
      case "migration":
        if (
          Math.abs(ideology.social) >= 0.15 ||
          Math.abs(ideology.authority) >= 0.2 ||
          caucus.priorities.includes(MIGRATION_PRIORITY)
        ) {
          priority = MIGRATION_PRIORITY;
        }
        break;
      case "energy":
        if (Math.abs(ideology.economic) >= 0.12 || caucus.priorities.includes(TRADE_PRIORITY)) {
          priority = TRADE_PRIORITY;
        }
        break;
      case "technology":
        if (ideology.authority >= 0.15 || caucus.priorities.includes(FOREIGN_PRIORITY)) {
          priority = FOREIGN_PRIORITY;
        }
        break;
      case "treaty":
        // Soft salience only for caucuses already attentive to foreign affairs.
        if (caucus.priorities.includes(FOREIGN_PRIORITY)) priority = FOREIGN_PRIORITY;
        break;
      default:
        break;
    }
    if (priority && pushUniquePriority(caucus.priorities, priority)) touched += 1;
  }
  return touched;
}

/**
 * Bump party public-platform salience for foreign_policy (not stance/position).
 * Crises and other major FA themes raise how much parties emphasize the issue.
 */
function bumpPartyPlatformSalience(state: SimState, theme: DomesticTheme): number {
  let touched = 0;
  for (const party of Object.values(state.partyStates)) {
    if (!party.publicPlatform) continue;
    party.publicPlatform.salience ??= {};
    const current = party.publicPlatform.salience.foreign_policy ?? 0;
    const delta =
      theme === "sanctions" || theme === "crisis"
        ? 0.08
        : theme === "trade" || theme === "defense" || theme === "energy"
          ? 0.06
          : theme === "rights" || theme === "migration" || theme === "technology"
            ? 0.05
            : 0.03;
    const next = Math.max(0, Math.min(1, current + delta));
    if (next !== current) {
      party.publicPlatform.salience.foreign_policy = next;
      party.publicPlatform.updatedDate = state.currentDate;
      touched += 1;
    }
  }
  return touched;
}

/** True when public crises, Terena-linked sanctions, or org foreign pressure remain. */
export function hasActiveForeignPressure(state: SimState): boolean {
  if (publicActiveCrises(state.foreignAffairsRuntime).length > 0) return true;
  const sanctions = Object.values(state.foreignAffairsRuntime.sanctions);
  if (
    sanctions.some(
      (s) => s.active && (s.imposerId === TERENA_WORLD_ID || s.targetId === TERENA_WORLD_ID),
    )
  ) {
    return true;
  }
  const meta = state.organizationRuntime.metadata;
  for (const [key, value] of Object.entries(meta)) {
    if (key.startsWith("foreignPressure:") && typeof value === "number" && value > 0.05) {
      return true;
    }
  }
  return false;
}

/**
 * Decay `salience.foreign_policy` toward 0 when there is no active foreign pressure.
 * Exported for tests and monthly FA/domestic hooks.
 */
export function decayPartyForeignPolicySalience(state: SimState): number {
  if (hasActiveForeignPressure(state)) return 0;
  let touched = 0;
  for (const party of Object.values(state.partyStates)) {
    if (!party.publicPlatform) continue;
    party.publicPlatform.salience ??= {};
    const current = party.publicPlatform.salience.foreign_policy ?? 0;
    if (current <= 0) continue;
    const next = Math.max(0, current - FOREIGN_SALIENCE_DECAY);
    party.publicPlatform.salience.foreign_policy = next;
    if (next !== current) {
      party.publicPlatform.updatedDate = state.currentDate;
      touched += 1;
    }
  }
  return touched;
}

function orgMatchesTheme(orgType: string, issues: string[], theme: DomesticTheme): boolean {
  const type = orgType.toLowerCase();
  const issueSet = new Set(issues);
  switch (theme) {
    case "trade":
    case "sanctions":
      return (
        type.includes("union") ||
        type.includes("labor") ||
        type.includes("business") ||
        type.includes("manufactur") ||
        type.includes("maritime") ||
        type.includes("farm") ||
        type.includes("export") ||
        issueSet.has("ISS_TRADE") ||
        issueSet.has("ISS_LABOR") ||
        issueSet.has("ISS_ECONOMY")
      );
    case "defense":
    case "posture":
    case "crisis":
      return (
        type.includes("security") ||
        type.includes("veteran") ||
        type.includes("defense") ||
        type.includes("peace") ||
        type.includes("pacif") ||
        issueSet.has("ISS_SECURITY") ||
        issueSet.has("ISS_FOREIGN")
      );
    case "rights":
      return (
        type.includes("rights") ||
        type.includes("advocacy") ||
        type.includes("civil") ||
        type.includes("climate") ||
        issueSet.has("ISS_WELFARE")
      );
    case "migration":
      return (
        type.includes("migrant") ||
        type.includes("refugee") ||
        type.includes("border") ||
        type.includes("municipal") ||
        issueSet.has("ISS_SECURITY")
      );
    default:
      return issueSet.has("ISS_FOREIGN") || type.includes("foreign");
  }
}

function bumpOrgPressure(world: KernelWorld, state: SimState, theme: DomesticTheme): number {
  const meta = state.organizationRuntime.metadata;
  const pressureKey = `foreignPressure:${theme}`;
  const prev = typeof meta[pressureKey] === "number" ? (meta[pressureKey] as number) : 0;
  meta[pressureKey] = Math.min(
    1,
    prev + (theme === "crisis" ? 0.08 : theme === "sanctions" ? 0.06 : 0.04),
  );
  meta.foreignPressureDate = state.currentDate;

  let touched = 0;
  const sortedOrgs = Object.keys(world.interestOrganizations).sort();
  for (const orgId of sortedOrgs) {
    const canon = world.interestOrganizations[orgId]!;
    if (!orgMatchesTheme(canon.type, canon.issues, theme)) continue;
    const actor = state.organizationRuntime.actors[orgId];
    if (!actor) continue;
    actor.recentActions.unshift({
      date: state.currentDate,
      kind: "foreign_politics",
      summary: `Domestic pressure rising on ${theme}`,
    });
    if (actor.recentActions.length > 6) actor.recentActions.length = 6;
    touched += 1;
    if (touched >= 6) break;
  }
  return touched;
}

function bumpBorderProvincePressure(state: SimState, theme: DomesticTheme): number {
  if (theme !== "migration" && theme !== "crisis" && theme !== "defense") return 0;
  let touched = 0;
  for (const [provinceId, gov] of Object.entries(state.provincialRuntime.provinces)) {
    const themeId = provinceThemeId(provinceId);
    if (theme === "migration" && themeId !== "border_province") continue;
    if (
      (theme === "crisis" || theme === "defense") &&
      themeId !== "border_province" &&
      themeId !== "coastal_trade_hub"
    ) {
      continue;
    }
    const delta = theme === "migration" ? 0.04 : 0.025;
    gov.federalRelationship = Math.max(-1, Math.min(1, gov.federalRelationship - delta));
    touched += 1;
  }
  return touched;
}

/**
 * Soft monthly decay of org foreignPressure:* metadata so salience can recover
 * once crises/sanctions clear.
 */
function decayOrgForeignPressure(state: SimState): void {
  const meta = state.organizationRuntime.metadata;
  for (const key of Object.keys(meta)) {
    if (!key.startsWith("foreignPressure:")) continue;
    const value = meta[key];
    if (typeof value !== "number") continue;
    const next = Math.max(0, value - 0.03);
    if (next <= 0) delete meta[key];
    else meta[key] = next;
  }
}

/**
 * Apply domestic political reactions to major foreign events emitted this month.
 * Runs after organization-foreign-bridge in the monthly engine.
 * Dedupes via organizationRuntime.metadata.domesticPoliticsKeys.
 * Always applies monthly salience decay when foreign pressure is absent.
 */
export function processDomesticForeignPolitics(
  state: SimState,
  world: KernelWorld,
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

    const theme = themeFor(ev.type, ev.payload as Record<string, unknown> | undefined);
    const caucusTouched = bumpRelevantCaucusPriorities(world, state, theme);
    if (theme === "crisis" || theme === "sanctions" || theme === "defense") {
      const caucusRuntime = ensureCaucusRuntime(state);
      for (const caucus of Object.values(caucusRuntime.caucuses)) {
        const ideology = caucusLeaderIdeology(world, state, caucus.leaderId);
        if (ideology.authority < 0.1) continue;
        if (caucus.stanceTowardChair === "cooperative") {
          caucus.stanceTowardChair = "conditional";
          break;
        }
      }
    }
    const partyTouched = bumpPartyPlatformSalience(state, theme);
    const orgTouched = bumpOrgPressure(world, state, theme);
    const provinceTouched = bumpBorderProvincePressure(state, theme);

    if (theme === "crisis" || theme === "sanctions" || theme === "defense") {
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
          provinceTouched,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  // Soften stale org pressure, then decay platform salience if calm.
  decayOrgForeignPressure(state);
  decayPartyForeignPolicySalience(state);

  return events;
}
