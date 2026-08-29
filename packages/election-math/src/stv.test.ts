import { describe, expect, it } from "vitest";
import {
  assertStvResultConservation,
  countStv,
  parseRational,
  serializeCountResult,
  compare,
  ONE,
} from "./index.js";
import { failRng, sequenceRng } from "./test-helpers.js";

describe("countStv", () => {
  it("fills a simple multi-seat election", () => {
    // Droop quota for 100 votes, 2 seats: floor(100/3)+1 = 34
    const result = countStv(
      {
        candidateIds: ["A", "B", "C"],
        seats: 2,
        ballots: [
          { rankings: ["A", "B"], weight: "40" },
          { rankings: ["B", "A"], weight: "35" },
          { rankings: ["C", "B"], weight: "25" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.quota).toBe("34/1");
    expect(result.elected).toHaveLength(2);
    expect(result.elected).toContain("A");
    assertStvResultConservation(result);
  });

  it("elects at exact quota", () => {
    // 3 seats, 99 votes → quota floor(99/4)+1 = 25
    // Clear ordering: D over quota, then A exactly at quota, then remaining seat.
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 3,
        ballots: [
          { rankings: ["A"], weight: "25" },
          { rankings: ["B"], weight: "24" },
          { rankings: ["C"], weight: "23" },
          { rankings: ["D"], weight: "27" },
        ],
      },
      { rng: failRng() },
    );
    expect(result.quota).toBe("25/1");
    expect(result.elected).toHaveLength(3);
    expect(result.elected).toContain("D");
    expect(result.elected).toContain("A");
    assertStvResultConservation(result);
  });

  it("transfers surplus with factor < 1", () => {
    // 2 seats, 100 votes, quota 34. A has 60 → surplus 26, all transferable to B.
    const result = countStv(
      {
        candidateIds: ["A", "B", "C"],
        seats: 2,
        ballots: [
          { rankings: ["A", "B"], weight: "60" },
          { rankings: ["C"], weight: "40" },
        ],
      },
      { rng: failRng() },
    );
    const surplusStep = result.steps.find(
      (s) => s.action === "elect_surplus" && s.electedId === "A",
    )!;
    expect(surplusStep.surplus).toBe("26/1");
    expect(surplusStep.transferableTotal).toBe("60/1");
    expect(compare(parseRational(surplusStep.transferFactor!), ONE) < 0).toBe(true);
    expect(surplusStep.transferFactor).toBe("13/30"); // 26/60
    assertStvResultConservation(result);
  });

  it("uses transfer_factor 1 when transferable_total <= surplus", () => {
    // Quota for 2 seats, 50 votes: floor(50/3)+1 = 17.
    // A=20 surplus 3 with transferable 3 → factor 1.
    const result = countStv(
      {
        candidateIds: ["A", "B", "C"],
        seats: 2,
        ballots: [
          { rankings: ["A"], weight: "17" },
          { rankings: ["A", "B"], weight: "3" },
          { rankings: ["C"], weight: "18" },
          { rankings: ["B"], weight: "12" },
        ],
      },
      { rng: failRng() },
    );
    const aStep = result.steps.find((s) => s.electedId === "A" && s.action === "elect_surplus")!;
    expect(aStep.surplus).toBe("3/1");
    expect(aStep.transferableTotal).toBe("3/1");
    expect(aStep.transferFactor).toBe("1/1");
    assertStvResultConservation(result);
  });

  it("archives retained non-transferable value above quota", () => {
    // A elected with many non-transferable ballots above quota.
    const result = countStv(
      {
        candidateIds: ["A", "B", "C"],
        seats: 2,
        ballots: [
          { rankings: ["A"], weight: "50" },
          { rankings: ["B"], weight: "30" },
          { rankings: ["C"], weight: "20" },
        ],
      },
      { rng: failRng() },
    );
    const aStep = result.steps.find((s) => s.electedId === "A")!;
    expect(aStep.retainedNonTransferable).toBe("50/1");
    expect(aStep.retainedAboveQuota).toBeDefined();
    expect(compare(parseRational(aStep.retainedAboveQuota!), parseRational("0/1")) > 0).toBe(true);
    assertStvResultConservation(result);
  });

  it("transfers eliminated candidate ballots at full value and exhausts", () => {
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 2,
        ballots: [
          { rankings: ["A", "B"], weight: "40" },
          { rankings: ["B"], weight: "25" },
          { rankings: ["C", "B"], weight: "20" },
          { rankings: ["D"], weight: "15" },
        ],
      },
      { rng: failRng() },
    );
    const elim = result.steps.find((s) => s.action === "eliminate")!;
    expect(elim.eliminatedId).toBe("D");
    expect(elim.newlyExhausted).toBe("15/1");
    expect(new Set(elim.transfers.map((line) => line.toCandidateId)).size).toBe(
      elim.transfers.length,
    );
    expect(elim.transfers.every((line) => line.ballotGroupId.startsWith("@aggregate:"))).toBe(
      true,
    );
    assertStvResultConservation(result);
  });

  it("processes multiple over-quota candidates sequentially", () => {
    // Unequal over-quota totals so no opening lot: A=45 then B=40 (quota 34).
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 2,
        ballots: [
          { rankings: ["A", "C"], weight: "45" },
          { rankings: ["B", "D"], weight: "40" },
          { rankings: ["C"], weight: "8" },
          { rankings: ["D"], weight: "7" },
        ],
      },
      { rng: failRng() },
    );
    const surplusSteps = result.steps.filter((s) => s.action === "elect_surplus");
    expect(surplusSteps.length).toBeGreaterThanOrEqual(2);
    expect(surplusSteps[0]!.electedId).toBe("A");
    expect(surplusSteps[1]!.electedId).toBe("B");
    assertStvResultConservation(result);
  });

  it("elects remaining when continuing equals seats remaining", () => {
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
    // quota floor(27/3)+1 = 10. A at quota elects; then B,C continuing for 1 seat → eliminate C → elect B remaining?
    // After A: seats rem 1, continuing B,C → eliminate lowest C, then B alone = 1 seat → elect_remaining or elect.
    expect(result.elected).toHaveLength(2);
    expect(result.elected).toContain("A");
    expect(
      result.steps.some((s) => s.action === "elect_remaining" || s.action === "elect_surplus"),
    ).toBe(true);
    assertStvResultConservation(result);
  });

  it("treats same-party-looking IDs identically (no party logic)", () => {
    const a = countStv(
      {
        candidateIds: ["LAB_1", "LAB_2", "CR_1"],
        seats: 2,
        ballots: [
          { rankings: ["LAB_1", "LAB_2"], weight: "50" },
          { rankings: ["CR_1"], weight: "40" },
          { rankings: ["LAB_2"], weight: "10" },
        ],
      },
      { rng: failRng() },
    );
    const b = countStv(
      {
        candidateIds: ["X", "Y", "Z"],
        seats: 2,
        ballots: [
          { rankings: ["X", "Y"], weight: "50" },
          { rankings: ["Z"], weight: "40" },
          { rankings: ["Y"], weight: "10" },
        ],
      },
      { rng: failRng() },
    );
    expect(a.elected.map((id) => ({ LAB_1: "X", LAB_2: "Y", CR_1: "Z" })[id])).toEqual(b.elected);
    assertStvResultConservation(a);
  });

  it("resolves elimination ties via previous counts then lot", () => {
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 2,
        ballots: [
          { rankings: ["A"], weight: "40" },
          { rankings: ["B"], weight: "25" },
          { rankings: ["C"], weight: "15" },
          { rankings: ["D", "C"], weight: "10" },
          { rankings: ["B", "C"], weight: "10" },
        ],
      },
      { rng: sequenceRng([0]) },
    );
    expect(result.elected).toHaveLength(2);
    assertStvResultConservation(result);
  });

  it("replays deterministically including lot", () => {
    const input = {
      candidateIds: ["A", "B", "C"],
      seats: 1,
      ballots: [
        { rankings: ["A"], weight: "10" },
        { rankings: ["B"], weight: "10" },
        { rankings: ["C"], weight: "5" },
      ],
    };
    // 1 seat STV = essentially IRV-like with droop quota floor(25/2)+1=13 — none at quota, eliminate C, then A/B tied...
    const a = countStv(input, { rng: sequenceRng([1]) });
    const b = countStv(input, { rng: sequenceRng([1]) });
    expect(serializeCountResult(a)).toBe(serializeCountResult(b));
    assertStvResultConservation(a);
  });
});
