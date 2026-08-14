import { describe, expect, it } from "vitest";
import { resolveLegalLot } from "./lot.js";
import { sequenceRng } from "./test-helpers.js";

describe("legal lot rejection sampling", () => {
  it("sorts candidate IDs lexicographically", () => {
    const lot = resolveLegalLot(["c", "a", "b"], sequenceRng([0]));
    expect(lot.sortedTiedIds).toEqual(["a", "b", "c"]);
    expect(lot.selectedIndex).toBe(0);
    expect(lot.selectedId).toBe("a");
  });

  it("accepts first draw when in range", () => {
    const lot = resolveLegalLot(["A", "B"], sequenceRng([2]));
    expect(lot.draws).toEqual([2]);
    expect(lot.acceptedDraw).toBe(2);
    expect(lot.selectedIndex).toBe(0);
    expect(lot.selectedId).toBe("A");
    expect(lot.n).toBe(2);
    expect(lot.limit).toBe(Math.floor(2 ** 32 / 2) * 2);
  });

  it("archives rejected draws then accepts", () => {
    const n = 3;
    const limit = Math.floor(2 ** 32 / n) * n;
    // For n=3, limit === 2^32-1, so only 0xffffffff is rejected within uint32.
    expect(limit).toBe(0xffffffff);
    const lot = resolveLegalLot(["X", "Y", "Z"], sequenceRng([0xffffffff, 5]));
    expect(lot.draws).toEqual([0xffffffff, 5]);
    expect(lot.acceptedDraw).toBe(5);
    expect(lot.selectedIndex).toBe(5 % 3);
    expect(lot.selectedId).toBe(lot.sortedTiedIds[lot.selectedIndex]);
  });

  it("archives rejected draws then accepts for N not dividing 2^32 evenly", () => {
    const n = 7;
    const limit = Math.floor(2 ** 32 / n) * n;
    expect(limit).toBeLessThan(0xffffffff);
    expect(limit % n).toBe(0);
    const lot = resolveLegalLot(
      ["g", "f", "e", "d", "c", "b", "a"],
      sequenceRng([limit, limit + 1, 11]),
    );
    expect(lot.draws).toEqual([limit, limit + 1, 11]);
    expect(lot.acceptedDraw).toBe(11);
    expect(lot.sortedTiedIds).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(lot.selectedIndex).toBe(11 % 7);
  });
});
