import { describe, expect, it } from "vitest";
import { fromInt, resolveTie } from "./index.js";
import { failRng, sequenceRng } from "./test-helpers.js";

function mapOf(entries: Record<string, number>) {
  return new Map(Object.entries(entries).map(([k, v]) => [k, fromInt(v)]));
}

describe("resolveTie hierarchy (direct)", () => {
  it("A: previous-count totals resolve (prefer lowest)", () => {
    const r = resolveTie({
      purpose: "eliminate_lowest",
      tiedIds: ["B", "C"],
      prefer: "lowest",
      historyTotals: [mapOf({ A: 50, B: 30, C: 20 }), mapOf({ A: 50, B: 25, C: 25 })],
      firstPreferences: mapOf({ A: 50, B: 25, C: 25 }),
      rng: failRng(),
    });
    // Current pool tied; walk back: previous completed state B=30>C=20 → eliminate C
    expect(r.method).toBe("previous_count_totals");
    expect(r.chosenId).toBe("C");
    expect(r.previousRoundIndex).toBe(0);
  });

  it("A: previous-count totals resolve (prefer highest)", () => {
    const r = resolveTie({
      purpose: "elect_highest_surplus",
      tiedIds: ["A", "B"],
      prefer: "highest",
      historyTotals: [mapOf({ A: 40, B: 35, C: 10 })],
      firstPreferences: mapOf({ A: 30, B: 30, C: 25 }),
      rng: failRng(),
    });
    expect(r.method).toBe("previous_count_totals");
    expect(r.chosenId).toBe("A");
  });

  it("B: previous counts stay tied; first preferences resolve (prefer lowest)", () => {
    const r = resolveTie({
      purpose: "irv_eliminate",
      tiedIds: ["B", "C"],
      prefer: "lowest",
      historyTotals: [mapOf({ A: 40, B: 30, C: 30 }), mapOf({ A: 45, B: 27, C: 27 })],
      firstPreferences: mapOf({ A: 40, B: 20, C: 40 }),
      rng: failRng(),
    });
    expect(r.method).toBe("first_preferences");
    expect(r.chosenId).toBe("B");
  });

  it("B: previous counts stay tied; first preferences resolve (prefer highest)", () => {
    const r = resolveTie({
      purpose: "elect_highest_surplus",
      tiedIds: ["X", "Y"],
      prefer: "highest",
      historyTotals: [mapOf({ X: 10, Y: 10 })],
      firstPreferences: mapOf({ X: 12, Y: 8 }),
      rng: failRng(),
    });
    expect(r.method).toBe("first_preferences");
    expect(r.chosenId).toBe("X");
  });

  it("C: previous + first prefs tied → legal lot (prefer lowest)", () => {
    const r = resolveTie({
      purpose: "eliminate_lowest",
      tiedIds: ["B", "C"],
      prefer: "lowest",
      historyTotals: [mapOf({ A: 40, B: 30, C: 30 })],
      firstPreferences: mapOf({ A: 40, B: 30, C: 30 }),
      rng: sequenceRng([1]),
    });
    expect(r.method).toBe("legal_lot");
    expect(r.lot?.sortedTiedIds).toEqual(["B", "C"]);
    expect(r.chosenId).toBe(r.lot!.selectedId);
  });

  it("C: empty previous history uses first prefs then lot", () => {
    const r = resolveTie({
      purpose: "irv_eliminate",
      tiedIds: ["A", "B"],
      prefer: "lowest",
      historyTotals: [],
      firstPreferences: mapOf({ A: 10, B: 10 }),
      rng: sequenceRng([0]),
    });
    expect(r.method).toBe("legal_lot");
    expect(r.chosenId).toBe("A");
  });
});
