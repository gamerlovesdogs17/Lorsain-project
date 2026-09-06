import { describe, it, expect } from "vitest";
import {
  emptyNavHistory,
  navPush,
  navBack,
  navForward,
  navCurrent,
  canGoBack,
  canGoForward,
  categorizeAttention,
  sortCategorizedAttention,
  shouldShowMonthSummary,
  resolveSearchEntry,
  type CategorizedAttention,
} from "./navigation.js";

describe("Navigation history", () => {
  it("starts at the initial entry", () => {
    const h = emptyNavHistory({ screen: "home", globalFocus: null });
    expect(navCurrent(h)).toEqual({ screen: "home", globalFocus: null });
    expect(canGoBack(h)).toBe(false);
    expect(canGoForward(h)).toBe(false);
  });

  it("pushes new entries and enables back", () => {
    let h = emptyNavHistory({ screen: "home", globalFocus: null });
    h = navPush(h, { screen: "party", globalFocus: { kind: "Party", id: "p1" } });
    expect(navCurrent(h)).toEqual({ screen: "party", globalFocus: { kind: "Party", id: "p1" } });
    expect(canGoBack(h)).toBe(true);
    expect(canGoForward(h)).toBe(false);
  });

  it("navigates back and forward", () => {
    let h = emptyNavHistory({ screen: "home", globalFocus: null });
    h = navPush(h, { screen: "career", globalFocus: { kind: "Politician", id: "pol1" } });
    h = navPush(h, { screen: "assembly", globalFocus: null });
    expect(h.entries.length).toBe(3);

    h = navBack(h);
    expect(navCurrent(h).screen).toBe("career");
    expect(canGoForward(h)).toBe(true);

    h = navForward(h);
    expect(navCurrent(h).screen).toBe("assembly");
    expect(canGoForward(h)).toBe(false);
  });

  it("truncates forward history on new push after back", () => {
    let h = emptyNavHistory({ screen: "home", globalFocus: null });
    h = navPush(h, { screen: "career", globalFocus: null });
    h = navPush(h, { screen: "party", globalFocus: null });
    h = navBack(h);
    h = navPush(h, { screen: "courts", globalFocus: null });
    expect(h.entries.length).toBe(3);
    expect(navCurrent(h).screen).toBe("courts");
    expect(canGoForward(h)).toBe(false);
  });

  it("does not duplicate same entry", () => {
    let h = emptyNavHistory({ screen: "home", globalFocus: null });
    h = navPush(h, { screen: "home", globalFocus: null });
    expect(h.entries.length).toBe(1);
  });

  it("caps at 50 entries", () => {
    let h = emptyNavHistory({ screen: "home", globalFocus: null });
    for (let i = 0; i < 60; i++) {
      h = navPush(h, { screen: "career", globalFocus: { kind: "Politician", id: `pol${i}` } });
    }
    expect(h.entries.length).toBeLessThanOrEqual(50);
  });
});

describe("Search entry resolution", () => {
  it("resolves a Politician entry to career screen with focus", () => {
    const result = resolveSearchEntry({ kind: "Politician", id: "pol1", screen: "career" });
    expect(result.screen).toBe("career");
    expect(result.focus).toEqual({ kind: "Politician", id: "pol1" });
  });

  it("resolves a Party entry to party screen with focus", () => {
    const result = resolveSearchEntry({ kind: "Party", id: "p1", screen: "party" });
    expect(result.screen).toBe("party");
    expect(result.focus).toEqual({ kind: "Party", id: "p1" });
  });

  it("resolves a Page entry without focus", () => {
    const result = resolveSearchEntry({ kind: "Page", id: "home", screen: "home" });
    expect(result.screen).toBe("home");
    expect(result.focus).toBeNull();
  });

  it("resolves an Act/Law entry to assembly screen", () => {
    const result = resolveSearchEntry({ kind: "Law", id: "law1", screen: "assembly" });
    expect(result.screen).toBe("assembly");
    expect(result.focus).toEqual({ kind: "Law", id: "law1" });
  });
});

describe("Notification category assignment", () => {
  it("marks urgent items as ACTION_REQUIRED", () => {
    const result = categorizeAttention(
      { id: "vote-1", label: "Vote on bill", screen: "assembly", tone: "urgent" },
      false,
    );
    expect(result.level).toBe("ACTION_REQUIRED");
  });

  it("marks soon items as MAJOR", () => {
    const result = categorizeAttention(
      { id: "filing-1", label: "Filing deadline", screen: "career", tone: "soon" },
      false,
    );
    expect(result.level).toBe("MAJOR");
  });

  it("marks info items as BACKGROUND", () => {
    const result = categorizeAttention(
      { id: "info-1", label: "Committee report", screen: "assembly", tone: "info" },
      false,
    );
    expect(result.level).toBe("BACKGROUND");
  });

  it("marks interrupt items as ACTION_REQUIRED when interrupt is active", () => {
    const result = categorizeAttention(
      { id: "interrupt-election", label: "Election", screen: "elections", tone: "info" },
      true,
    );
    expect(result.level).toBe("ACTION_REQUIRED");
  });

  it("sorts by level rank", () => {
    const items: CategorizedAttention[] = [
      { id: "b", label: "B", screen: "home", level: "BACKGROUND" },
      { id: "a", label: "A", screen: "home", level: "ACTION_REQUIRED" },
      { id: "m", label: "M", screen: "home", level: "MAJOR" },
    ];
    const sorted = sortCategorizedAttention(items);
    expect(sorted[0]!.level).toBe("ACTION_REQUIRED");
    expect(sorted[1]!.level).toBe("MAJOR");
    expect(sorted[2]!.level).toBe("BACKGROUND");
  });
});

describe("Month summary threshold", () => {
  it("returns false for trivial turns", () => {
    const events = [
      { type: "TURN_COMPLETED", importance: 0.1, visibility: "public" },
      { type: "OPINION_SHIFT", importance: 0.2, visibility: "public" },
    ];
    expect(shouldShowMonthSummary(events)).toBe(false);
  });

  it("returns true when enough meaningful events exist", () => {
    const events = [
      { type: "BILL_INTRODUCED", importance: 0.6, visibility: "public" },
      { type: "ELECTION_CALLED", importance: 0.8, visibility: "public" },
      { type: "COURT_DECISION", importance: 0.7, visibility: "public" },
    ];
    expect(shouldShowMonthSummary(events)).toBe(true);
  });

  it("returns true when elections/legislation/court events occur", () => {
    const events = [
      { type: "ELECTION_RESOLVED", importance: 0.3, visibility: "public" },
    ];
    expect(shouldShowMonthSummary(events)).toBe(true);
  });

  it("respects custom threshold", () => {
    const events = [
      { type: "BILL_PASSED", importance: 0.5, visibility: "public" },
      { type: "OPINION_SHIFT", importance: 0.5, visibility: "public" },
    ];
    expect(shouldShowMonthSummary(events, 5)).toBe(false);
  });
});
