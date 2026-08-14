import { describe, expect, it } from "vitest";
import {
  assertStvResultConservation,
  countIrv,
  countStv,
  parseRational,
  serializeCountResult,
  compare,
  ONE,
  ZERO,
} from "./index.js";
import { failRng, sequenceRng } from "./test-helpers.js";

describe("election-math invariants", () => {
  const stvCases = [
    {
      candidateIds: ["A", "B", "C", "D"],
      seats: 2,
      ballots: [
        { rankings: ["A", "B"], weight: "30" },
        { rankings: ["B", "A"], weight: "25" },
        { rankings: ["C", "D"], weight: "20" },
        { rankings: ["D", "C"], weight: "15" },
        { rankings: ["A", "C"], weight: "10" },
      ],
    },
    {
      candidateIds: ["W", "X", "Y", "Z"],
      seats: 3,
      ballots: [
        { rankings: ["W", "X"], weight: "40" },
        { rankings: ["X", "Y"], weight: "30" },
        { rankings: ["Y", "Z"], weight: "20" },
        { rankings: ["Z", "W"], weight: "10" },
      ],
    },
  ];

  for (const [i, input] of stvCases.entries()) {
    it(`STV case ${i}: seat/elect/elim invariants + conservation`, () => {
      const result = countStv(input, { rng: sequenceRng([0, 1, 2, 3, 4]) });
      expect(result.elected.length).toBe(input.seats);
      expect(new Set(result.elected).size).toBe(result.elected.length);
      for (const id of result.elected) {
        expect(input.candidateIds).toContain(id);
        expect(result.eliminated).not.toContain(id);
      }
      for (const step of result.steps) {
        if (step.transferFactor) {
          expect(compare(parseRational(step.transferFactor), ONE) <= 0).toBe(true);
        }
        expect(compare(parseRational(step.newlyExhausted), ZERO) >= 0).toBe(true);
        expect(compare(parseRational(step.exhaustedTotal), ZERO) >= 0).toBe(true);
        for (const v of Object.values(step.totalsAfter)) {
          expect(compare(parseRational(v), ZERO) >= 0).toBe(true);
        }
      }
      assertStvResultConservation(result);
      const again = countStv(input, { rng: sequenceRng([0, 1, 2, 3, 4]) });
      expect(serializeCountResult(result)).toBe(serializeCountResult(again));
    });
  }

  it("IRV produces at most one winner from candidate set", () => {
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { rankings: ["A", "B"], weight: "12" },
          { rankings: ["B", "C"], weight: "11" },
          { rankings: ["C", "A"], weight: "10" },
        ],
      },
      { rng: failRng() },
    );
    expect(typeof result.elected).toBe("string");
    expect(["A", "B", "C"]).toContain(result.elected);
    expect(result.eliminated).not.toContain(result.elected);
  });

  it("terminates for valid finite STV input", () => {
    const result = countStv(
      {
        candidateIds: Array.from({ length: 8 }, (_, i) => `C${i}`),
        seats: 3,
        ballots: Array.from({ length: 20 }, (_, i) => ({
          rankings: [`C${i % 8}`, `C${(i + 1) % 8}`, `C${(i + 2) % 8}`],
          weight: String(3 + (i % 5)),
        })),
      },
      { rng: sequenceRng(Array.from({ length: 32 }, (_, i) => i)) },
    );
    expect(result.elected).toHaveLength(3);
    assertStvResultConservation(result);
  });
});
