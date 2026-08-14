import { describe, expect, it } from "vitest";
import { countIrv, countStv } from "./index.js";
import { sequenceRng } from "./test-helpers.js";

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("election-math performance (representative)", () => {
  it("IRV: several candidates × thousands of weighted ranking groups", () => {
    const candidateIds = ["A", "B", "C", "D", "E", "F"];
    const ballots = Array.from({ length: 5000 }, (_, i) => {
      const rot = i % candidateIds.length;
      const rankings = [
        candidateIds[rot]!,
        candidateIds[(rot + 1) % candidateIds.length]!,
        candidateIds[(rot + 2) % candidateIds.length]!,
      ];
      return { id: `g${i}`, rankings, weight: String(1 + (i % 17)) };
    });
    const elapsed = ms(() => {
      const r = countIrv({ candidateIds, ballots }, { rng: sequenceRng([0, 1, 2, 3]) });
      expect(candidateIds).toContain(r.elected);
    });
    console.log(`[perf] IRV 6c×5000 groups: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(30_000);
  });

  it("STV: 8-seat field with thousands of groups", () => {
    const candidateIds = Array.from({ length: 16 }, (_, i) => `C${String(i).padStart(2, "0")}`);
    const ballots = Array.from({ length: 4000 }, (_, i) => {
      const base = i % candidateIds.length;
      const rankings = [0, 1, 2, 3, 4].map((k) => candidateIds[(base + k) % candidateIds.length]!);
      return { id: `g${i}`, rankings, weight: String(1 + (i % 11)) };
    });
    const elapsed = ms(() => {
      const r = countStv(
        { candidateIds, seats: 8, ballots },
        { rng: sequenceRng(Array.from({ length: 64 }, (_, i) => i * 97)) },
      );
      expect(r.elected).toHaveLength(8);
    });
    console.log(`[perf] STV 16c/8 seats ×4000 groups: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(60_000);
  });
});
