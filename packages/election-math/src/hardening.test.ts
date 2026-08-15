import { describe, expect, it } from "vitest";
import { countIrv, countStv, prepareBallots } from "./index.js";
import { failRng } from "./test-helpers.js";

describe("zero valid vote rejection", () => {
  const candidates = ["A", "B"];

  it("rejects IRV with empty ballots", () => {
    expect(() => countIrv({ candidateIds: candidates, ballots: [] }, { rng: failRng() })).toThrow(
      /totalValid/,
    );
  });

  it("rejects STV with empty ballots", () => {
    expect(() =>
      countStv({ candidateIds: candidates, seats: 1, ballots: [] }, { rng: failRng() }),
    ).toThrow(/totalValid/);
  });

  it("rejects all blank ballots", () => {
    expect(() =>
      countIrv(
        {
          candidateIds: candidates,
          ballots: [
            { rankings: [], weight: "10" },
            { rankings: [], weight: "5" },
          ],
        },
        { rng: failRng() },
      ),
    ).toThrow(/totalValid/);
  });

  it("rejects all malformed ballots", () => {
    expect(() =>
      countStv(
        {
          candidateIds: candidates,
          seats: 1,
          ballots: [
            { rankings: ["Z"], weight: "10" },
            { rankings: ["A", "A"], weight: "3" },
          ],
        },
        { rng: failRng() },
      ),
    ).toThrow(/totalValid/);
  });

  it("rejects all non-positive-weight ballots", () => {
    expect(() =>
      countIrv(
        {
          candidateIds: candidates,
          ballots: [
            { rankings: ["A"], weight: "0" },
            { rankings: ["B"], weight: "-1" },
          ],
        },
        { rng: failRng() },
      ),
    ).toThrow(/totalValid/);
  });

  it("still allows candidates with zero votes when totalValid > 0", () => {
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [{ rankings: ["A"], weight: "10" }],
      },
      { rng: failRng() },
    );
    expect(result.elected).toBe("A");
    expect(result.firstPreferences.C).toBe("0/1");
  });
});

describe("prepareBallots unique IDs", () => {
  it("rejects duplicate explicit IDs", () => {
    const prepared = prepareBallots(
      ["A"],
      [
        { id: "g1", rankings: ["A"], weight: "1" },
        { id: "g1", rankings: ["A"], weight: "2" },
      ],
    );
    expect(prepared.valid).toHaveLength(1);
    expect(prepared.valid[0]!.id).toBe("g1");
    expect(prepared.excluded).toHaveLength(1);
    expect(prepared.excluded[0]!.reason).toBe("duplicate_ballot_group_id");
    expect(prepared.totalValid).toEqual({ num: 1n, den: 1n });
  });

  it("does not collide auto IDs with reserved explicit auto-pattern IDs", () => {
    const prepared = prepareBallots(
      ["A"],
      [
        { id: "__auto_ballot_000001", rankings: ["A"], weight: "1" },
        { rankings: ["A"], weight: "2" },
        { rankings: ["A"], weight: "3" },
      ],
    );
    expect(prepared.valid.map((b) => b.id)).toEqual([
      "__auto_ballot_000001",
      "__auto_ballot_000002",
      "__auto_ballot_000003",
    ]);
  });

  it("assigns deterministic auto IDs for omitted IDs", () => {
    const a = prepareBallots(
      ["A", "B"],
      [
        { rankings: ["A"], weight: "1" },
        { rankings: ["B"], weight: "2" },
        { rankings: ["A", "B"], weight: "3" },
      ],
    );
    const b = prepareBallots(
      ["A", "B"],
      [
        { rankings: ["A"], weight: "1" },
        { rankings: ["B"], weight: "2" },
        { rankings: ["A", "B"], weight: "3" },
      ],
    );
    expect(a.valid.map((x) => x.id)).toEqual([
      "__auto_ballot_000001",
      "__auto_ballot_000002",
      "__auto_ballot_000003",
    ]);
    expect(a.valid.map((x) => x.id)).toEqual(b.valid.map((x) => x.id));
  });

  it("tracks excluded known weight and unknown weight groups", () => {
    const prepared = prepareBallots(
      ["A"],
      [
        { rankings: [], weight: "7" },
        { rankings: ["A"], weight: "not-a-number" },
        { rankings: ["A"], weight: "0" },
      ],
    );
    expect(prepared.exclusionStats.excludedBallotGroupCount).toBe(3);
    expect(prepared.exclusionStats.excludedKnownWeight).toBe("7/1");
    expect(prepared.exclusionStats.unknownWeightGroups).toBe(1);
    expect(prepared.exclusionStats.excludedByReason.blank_ranking?.groups).toBe(1);
    expect(prepared.exclusionStats.excludedByReason.invalid_weight?.groups).toBe(1);
    expect(prepared.exclusionStats.excludedByReason.non_positive_weight?.knownWeight).toBe("0/1");
  });

  it("never lets negative excluded weights reduce excludedKnownWeight", () => {
    const prepared = prepareBallots(
      ["A"],
      [
        { rankings: [], weight: "5" },
        { rankings: ["A"], weight: "-10" },
      ],
    );
    expect(prepared.exclusionStats.excludedBallotGroupCount).toBe(2);
    expect(prepared.exclusionStats.excludedKnownWeight).toBe("5/1");
    expect(prepared.exclusionStats.excludedByReason.blank_ranking?.knownWeight).toBe("5/1");
    expect(prepared.exclusionStats.excludedByReason.non_positive_weight?.groups).toBe(1);
    expect(prepared.exclusionStats.excludedByReason.non_positive_weight?.knownWeight).toBe("0/1");
  });
});

describe("STV elect_remaining archive", () => {
  it("archives electedIds for remaining-candidates election", () => {
    // After eliminating the lowest, one seat remains with one continuing → elect_remaining.
    const result = countStv(
      {
        candidateIds: ["A", "B", "C"],
        seats: 2,
        ballots: [
          { rankings: ["A"], weight: "10" },
          { rankings: ["B"], weight: "9" },
          { rankings: ["C"], weight: "8" },
        ],
      },
      { rng: failRng() },
    );
    const rem = result.steps.find((s) => s.action === "elect_remaining");
    expect(rem).toBeDefined();
    expect(rem!.electedIds).toEqual(["B"]);
    expect(rem!.electedId).toBeUndefined();
  });
});
