import type { Screen } from "./pages.js";
import type { NotificationCategory } from "./settings.js";

export type NavEntry = {
  screen: Screen;
  globalFocus: { kind: string; id: string } | null;
};

const MAX_HISTORY = 50;

export type NavHistory = {
  entries: NavEntry[];
  index: number;
};

export function emptyNavHistory(initial: NavEntry): NavHistory {
  return { entries: [initial], index: 0 };
}

export function navPush(history: NavHistory, entry: NavEntry): NavHistory {
  const current = history.entries[history.index];
  if (
    current &&
    current.screen === entry.screen &&
    current.globalFocus?.kind === entry.globalFocus?.kind &&
    current.globalFocus?.id === entry.globalFocus?.id
  ) {
    return history;
  }
  const trimmed = history.entries.slice(0, history.index + 1);
  trimmed.push(entry);
  if (trimmed.length > MAX_HISTORY) trimmed.shift();
  return { entries: trimmed, index: trimmed.length - 1 };
}

export function navBack(history: NavHistory): NavHistory {
  if (history.index <= 0) return history;
  return { ...history, index: history.index - 1 };
}

export function navForward(history: NavHistory): NavHistory {
  if (history.index >= history.entries.length - 1) return history;
  return { ...history, index: history.index + 1 };
}

export function navCurrent(history: NavHistory): NavEntry {
  return history.entries[history.index] ?? { screen: "home", globalFocus: null };
}

export function canGoBack(history: NavHistory): boolean {
  return history.index > 0;
}

export function canGoForward(history: NavHistory): boolean {
  return history.index < history.entries.length - 1;
}

export type NotificationLevel = "ACTION_REQUIRED" | "MAJOR" | "BACKGROUND" | "SYSTEM";

/** Player-facing importance for inbox filtering and copy. */
export type NotificationImportance = "informational" | "important" | "requires_decision";

export type CategorizedAttention = {
  id: string;
  label: string;
  detail?: string;
  screen: Screen;
  tone?: "urgent" | "soon" | "info";
  level: NotificationLevel;
  category: NotificationCategory;
  importance: NotificationImportance;
};

export function notificationImportanceFromLevel(level: NotificationLevel): NotificationImportance {
  switch (level) {
    case "ACTION_REQUIRED":
      return "requires_decision";
    case "MAJOR":
      return "important";
    case "BACKGROUND":
    case "SYSTEM":
      return "informational";
  }
}

/** Map inbox / attention targets onto Settings notification categories. */
export function attentionNotificationCategory(item: {
  screen: Screen;
  id?: string;
  label?: string;
}): NotificationCategory {
  const haystack = `${item.id ?? ""} ${item.label ?? ""}`.toLowerCase();
  if (haystack.includes("caucus")) return "caucuses";
  switch (item.screen) {
    case "elections":
    case "campaign":
      return "elections";
    case "assembly":
      return "legislation";
    case "party":
      return "party";
    case "organizations":
      return "caucuses";
    case "foreign":
      return "foreign";
    case "career":
    case "office":
      return "career";
    case "executive":
    case "courts":
    case "economy":
    case "home":
    case "news":
    case "archive":
    case "terena":
    case "situation":
    case "settings":
      return "government";
  }
}

/**
 * Hide INFORMATIONAL inbox items whose category is disabled.
 * ACTION_REQUIRED / requires_decision (and other non-informational items) are never suppressed.
 */
export function filterAttentionByNotificationSettings(
  items: CategorizedAttention[],
  notifications: Record<NotificationCategory, boolean>,
): CategorizedAttention[] {
  return items.filter((item) => {
    if (item.importance !== "informational" || item.level === "ACTION_REQUIRED") {
      return true;
    }
    return notifications[item.category] !== false;
  });
}

export function categorizeAttention(
  item: {
    id: string;
    label: string;
    detail?: string;
    screen: Screen;
    tone?: "urgent" | "soon" | "info";
  },
  hasInterrupt: boolean,
): CategorizedAttention {
  let level: NotificationLevel;
  if (item.tone === "urgent" || (hasInterrupt && item.id.startsWith("interrupt"))) {
    level = "ACTION_REQUIRED";
  } else if (item.tone === "soon") {
    level = "MAJOR";
  } else {
    const systemPrefixes = ["autosave", "system"];
    level = systemPrefixes.some((p) => item.id.startsWith(p)) ? "SYSTEM" : "BACKGROUND";
  }
  return {
    ...item,
    level,
    category: attentionNotificationCategory(item),
    importance: notificationImportanceFromLevel(level),
  };
}

export function notificationLevelRank(level: NotificationLevel): number {
  switch (level) {
    case "ACTION_REQUIRED":
      return 0;
    case "MAJOR":
      return 1;
    case "BACKGROUND":
      return 2;
    case "SYSTEM":
      return 3;
  }
}

export function sortCategorizedAttention(items: CategorizedAttention[]): CategorizedAttention[] {
  return [...items].sort(
    (a, b) =>
      notificationLevelRank(a.level) - notificationLevelRank(b.level) ||
      a.label.localeCompare(b.label),
  );
}

export function notificationLevelLabel(level: NotificationLevel): string {
  switch (level) {
    case "ACTION_REQUIRED":
      return "Action required";
    case "MAJOR":
      return "Important";
    case "BACKGROUND":
      return "Background";
    case "SYSTEM":
      return "System";
  }
}

export function notificationLevelTone(level: NotificationLevel): "urgent" | "soon" | "info" {
  switch (level) {
    case "ACTION_REQUIRED":
      return "urgent";
    case "MAJOR":
      return "soon";
    case "BACKGROUND":
    case "SYSTEM":
      return "info";
  }
}

export type SearchEntryResolution = {
  screen: Screen;
  focus: { kind: string; id: string } | null;
};

export function resolveSearchEntry(entry: {
  kind: string;
  id: string;
  screen: Screen;
}): SearchEntryResolution {
  return {
    screen: entry.screen,
    focus: entry.kind === "Page" ? null : { kind: entry.kind, id: entry.id },
  };
}

export function shouldShowMonthSummary(
  events: Array<{ type: string; importance?: number; visibility?: string }>,
  threshold = 3,
): boolean {
  const meaningful = events.filter(
    (e) => e.visibility === "public" && e.type !== "TURN_COMPLETED" && (e.importance ?? 0) >= 0.4,
  );
  const hasElection = events.some(
    (e) =>
      e.type.includes("ELECTION") ||
      e.type.includes("LEGISLATION") ||
      e.type.includes("COURT") ||
      e.type.includes("ENACTED") ||
      e.type.includes("IMPEACH") ||
      e.type.includes("NOMINATION"),
  );
  return meaningful.length >= threshold || hasElection;
}
