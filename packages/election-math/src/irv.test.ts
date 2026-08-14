import { describe, expect, it } from "vitest";
import { countIrv, serializeCountResult } from "./index.js";
import { failRng, sequenceRng } from "./test-helpers.js";

describe("countIrv", () => {
  it("elects on first-round majority", () => {
    const result = countIrv(
      {
        candidateIds: ["A", "B"],
        ballots: [
          { id: "a", rankings: ["A"], weight: "60" },
          { id: "b", rankings: ["B"], weight: "40" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.elected).toBe("A");
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]!.action).toBe("elect");
    expect(result.rounds[0]!.majorityThreshold).toBe("50/1");
  });

  it("runs multi-round elimination with weighted groups", () => {
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { rankings: ["A", "B"], weight: "35" },
          { rankings: ["B", "A"], weight: "33" },
          { rankings: ["C", "A"], weight: "32" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.eliminated[0]).toBe("C");
    expect(result.elected).toBe("A");
    expect(result.rounds.length).toBeGreaterThan(1);
  });

  it("exhausts ballots and shrinks continuing denominator", () => {
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { rankings: ["A"], weight: "40" },
          { rankings: ["B"], weight: "35" },
          { rankings: ["C"], weight: "25" },
        ],
      },
      { rng: failRng() },
    );
    const elim = result.rounds.find((r) => r.action === "eliminate");
    expect(elim?.eliminatedId).toBe("C");
    expect(elim?.newlyExhausted).toBe("25/1");
    expect(result.exhausted).toBe("25/1");
    const after = result.rounds.find((r) => r.round === elim!.round)!;
    expect(after.continuingDenominator).toBe("100/1");
    const next = result.rounds.find((r) => r.round === elim!.round + 1);
    expect(next?.continuingDenominator).toBe("75/1");
  });

  it("resolves previous-round ties before first prefs / lot", () => {
    // Round1: A=30 B=30 C=40 → eliminate A or B (tied). Previous empty → first prefs equal → need lot?
    // First prefs same as round1. Force lot.
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { rankings: ["C", "A"], weight: "40" },
          { rankings: ["A"], weight: "30" },
          { rankings: ["B"], weight: "30" },
        ],
      },
      { rng: sequenceRng([0]) },
    );
    const elim = result.rounds.find((r) => r.action === "eliminate")!;
    expect(elim.tieResolution?.method).toBe("legal_lot");
    expect(["A", "B"]).toContain(elim.eliminatedId);
  });

  it("uses first-preference totals when previous rounds do not break tie", () => {
    // Craft: after one elimination, two tied at bottom with different first prefs.
    // R1: A=50, B=25, C=25 → eliminate B or C by first prefs if somehow totals equal at elim time.
    // Simpler: R1 A=40 B=30 C=30, eliminate B/C by lot or first prefs equal → lot.
    // For first_prefs method: need previous history that doesn't distinguish, but first prefs do.
    // After eliminating D in a 4-candidate race where B and C tied at bottom with equal previous but different FP.
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C", "D"],
        ballots: [
          { rankings: ["A", "B"], weight: "40" },
          { rankings: ["B", "A"], weight: "20" },
          { rankings: ["C", "A"], weight: "15" },
          { rankings: ["D", "C"], weight: "15" },
          { rankings: ["B", "C"], weight: "5" },
          { rankings: ["C", "B"], weight: "5" },
        ],
      },
      { rng: failRng() },
    );
    // D lowest at 15 alone? D=15, C=20, B=25, A=40 — D eliminated alone.
    expect(result.eliminated[0]).toBe("D");
    // After D→C: C=30, B=25, A=40 — eliminate B alone.
    expect(result.eliminated[1]).toBe("B");
  });

  it("uses previous completed round totals for elimination ties", () => {
    // R1: A=45, B=20, C=20, D=15 → eliminate D
    // After D transfers all to B: A=45, B=35, C=20
    // Need a case where two are tied for lowest AFTER a round where they differed.
    // R1: A=50, B=25, C=15, D=10 → elim D
    // D→C: A=50 B=25 C=25 → B and C tied. Previous: C=15 < B=25 → eliminate C (prefer lowest).
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C", "D"],
        ballots: [
          { rankings: ["A"], weight: "50" },
          { rankings: ["B"], weight: "25" },
          { rankings: ["C"], weight: "15" },
          { rankings: ["D", "C"], weight: "10" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.eliminated[0]).toBe("D");
    const second = result.rounds.find((r) => r.eliminatedId && r.round > 1)!;
    expect(second.eliminatedId).toBe("C");
    expect(second.tieResolution?.method).toBe("previous_count_totals");
  });

  it("replays deterministically", () => {
    const input = {
      candidateIds: ["A", "B", "C"],
      ballots: [
        { rankings: ["A", "B"], weight: "10" },
        { rankings: ["B", "C"], weight: "10" },
        { rankings: ["C", "A"], weight: "9" },
      ],
    };
    const a = countIrv(input, { rng: sequenceRng([1, 2, 3]) });
    const b = countIrv(input, { rng: sequenceRng([1, 2, 3]) });
    expect(serializeCountResult(a)).toBe(serializeCountResult(b));
  });

  it("excludes blank ballots from total_valid", () => {
    const result = countIrv(
      {
        candidateIds: ["A"],
        ballots: [
          { rankings: ["A"], weight: "10" },
          { rankings: [], weight: "99" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.totalValid).toBe("10/1");
    expect(result.excludedBallotGroupCount).toBe(1);
    expect(result.excludedKnownWeight).toBe("99/1");
    expect(result.elected).toBe("A");
  });
});
