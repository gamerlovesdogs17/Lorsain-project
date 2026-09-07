import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyConfirmMajorActionsGate } from "./feedback.js";
import {
  attentionNotificationCategory,
  categorizeAttention,
  filterAttentionByNotificationSettings,
  notificationImportanceFromLevel,
  type CategorizedAttention,
} from "./navigation.js";
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_KEY,
  loadSettings,
  saveSettings,
  updateSettings,
} from "./settings.js";

describe("askConfirm / confirmMajorActions", () => {
  it("runs the action immediately when confirmMajorActions is false", () => {
    const action = vi.fn();
    const showDialog = applyConfirmMajorActionsGate(false, action);
    expect(showDialog).toBe(false);
    expect(action).toHaveBeenCalledOnce();
  });

  it("defers to a dialog when confirmMajorActions is true", () => {
    const action = vi.fn();
    const showDialog = applyConfirmMajorActionsGate(true, action);
    expect(showDialog).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });
});

describe("notification category filter", () => {
  const baseNotifications = { ...DEFAULT_PLAYER_SETTINGS.notifications };

  function item(
    partial: Pick<CategorizedAttention, "id" | "label" | "screen" | "level"> &
      Partial<Omit<CategorizedAttention, "id" | "label" | "screen" | "level">>,
  ): CategorizedAttention {
    const level = partial.level;
    const next: CategorizedAttention = {
      id: partial.id,
      label: partial.label,
      screen: partial.screen,
      level,
      category: partial.category ?? attentionNotificationCategory(partial),
      importance: partial.importance ?? notificationImportanceFromLevel(level),
    };
    if (partial.detail !== undefined) next.detail = partial.detail;
    if (partial.tone !== undefined) next.tone = partial.tone;
    return next;
  }

  it("maps screens onto notification categories", () => {
    expect(attentionNotificationCategory({ screen: "elections" })).toBe("elections");
    expect(attentionNotificationCategory({ screen: "campaign" })).toBe("elections");
    expect(attentionNotificationCategory({ screen: "assembly" })).toBe("legislation");
    expect(attentionNotificationCategory({ screen: "party" })).toBe("party");
    expect(attentionNotificationCategory({ screen: "organizations" })).toBe("caucuses");
    expect(attentionNotificationCategory({ screen: "foreign" })).toBe("foreign");
    expect(attentionNotificationCategory({ screen: "career" })).toBe("career");
    expect(attentionNotificationCategory({ screen: "executive" })).toBe("government");
    expect(
      attentionNotificationCategory({ screen: "party", id: "caucus-split", label: "Caucus split" }),
    ).toBe("caucuses");
  });

  it("formalizes importance from notification levels", () => {
    expect(notificationImportanceFromLevel("ACTION_REQUIRED")).toBe("requires_decision");
    expect(notificationImportanceFromLevel("MAJOR")).toBe("important");
    expect(notificationImportanceFromLevel("BACKGROUND")).toBe("informational");
    expect(notificationImportanceFromLevel("SYSTEM")).toBe("informational");
  });

  it("hides informational items in disabled categories", () => {
    const items = [
      item({
        id: "bg-leg",
        label: "Committee report",
        screen: "assembly",
        level: "BACKGROUND",
      }),
      item({
        id: "bg-fa",
        label: "Treaty note",
        screen: "foreign",
        level: "BACKGROUND",
      }),
    ];
    const filtered = filterAttentionByNotificationSettings(items, {
      ...baseNotifications,
      legislation: false,
      foreign: true,
    });
    expect(filtered.map((row) => row.id)).toEqual(["bg-fa"]);
  });

  it("never suppresses ACTION_REQUIRED / requires_decision items", () => {
    const required = item({
      id: "interrupt-election",
      label: "Resolve election",
      screen: "elections",
      level: "ACTION_REQUIRED",
      tone: "urgent",
    });
    const filtered = filterAttentionByNotificationSettings([required], {
      ...baseNotifications,
      elections: false,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.importance).toBe("requires_decision");
  });

  it("keeps important (non-informational) items even when the category is off", () => {
    const filing = item({
      id: "filing-1",
      label: "Filing open",
      screen: "career",
      level: "MAJOR",
      tone: "soon",
    });
    const filtered = filterAttentionByNotificationSettings([filing], {
      ...baseNotifications,
      career: false,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.importance).toBe("important");
  });

  it("categorizeAttention attaches category and importance", () => {
    const result = categorizeAttention(
      { id: "vote-1", label: "Vote on bill", screen: "assembly", tone: "urgent" },
      false,
    );
    expect(result.level).toBe("ACTION_REQUIRED");
    expect(result.category).toBe("legislation");
    expect(result.importance).toBe("requires_decision");
  });
});

describe("settings persistence", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("round-trips autosave, confirmMajorActions, and notification toggles", () => {
    const next = updateSettings({
      autosave: false,
      confirmMajorActions: false,
      notifications: {
        ...DEFAULT_PLAYER_SETTINGS.notifications,
        foreign: false,
        caucuses: false,
      },
    });
    expect(next.autosave).toBe(false);
    expect(next.confirmMajorActions).toBe(false);
    expect(next.notifications.foreign).toBe(false);
    expect(next.notifications.caucuses).toBe(false);
    expect(next.notifications.elections).toBe(true);

    const raw = store.get(PLAYER_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(loadSettings()).toEqual(next);

    saveSettings({
      ...DEFAULT_PLAYER_SETTINGS,
      notifications: { ...DEFAULT_PLAYER_SETTINGS.notifications },
      autosave: true,
      confirmMajorActions: true,
    });
    expect(loadSettings().autosave).toBe(true);
    expect(loadSettings().confirmMajorActions).toBe(true);
  });
});
