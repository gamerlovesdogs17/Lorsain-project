/**
 * Golden count fixtures — expected tables are hand-computed, not derived from countIrv/countStv.
 */
import { describe, expect, it } from "vitest";
import { assertStvResultConservation, countIrv, countStv } from "./index.js";
import { failRng } from "./test-helpers.js";

describe("golden IRV multi-round fixture", () => {
  it("matches hand-computed round table", () => {
    // Hand table:
    // Ballots: A>B:40, B>C:35, C>A:25. totalValid=100.
    // R1 totals A=40 B=35 C=25; denom=100; majority=50; eliminate C; transfer 25→A; exhaust 0
    // R2 totals A=65 B=35; denom=100; majority=50; elect A
    const result = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { id: "ab", rankings: ["A", "B"], weight: "40" },
          { id: "bc", rankings: ["B", "C"], weight: "35" },
          { id: "ca", rankings: ["C", "A"], weight: "25" },
        ],
      },
      { rng: failRng() },
    );

    expect(result.totalValid).toBe("100/1");
    expect(result.firstPreferences).toEqual({ A: "40/1", B: "35/1", C: "25/1" });
    expect(result.rounds).toHaveLength(2);

    const r1 = result.rounds[0]!;
    expect(r1.round).toBe(1);
    expect(r1.action).toBe("eliminate");
    expect(r1.totalsBefore).toEqual({ A: "40/1", B: "35/1", C: "25/1" });
    expect(r1.continuingDenominator).toBe("100/1");
    expect(r1.majorityThreshold).toBe("50/1");
    expect(r1.eliminatedId).toBe("C");
    expect(r1.newlyExhausted).toBe("0/1");
    expect(r1.totalsAfter).toEqual({ A: "65/1", B: "35/1" });

    const r2 = result.rounds[1]!;
    expect(r2.round).toBe(2);
    expect(r2.action).toBe("elect");
    expect(r2.totalsBefore).toEqual({ A: "65/1", B: "35/1" });
    expect(r2.continuingDenominator).toBe("100/1");
    expect(r2.majorityThreshold).toBe("50/1");
    expect(r2.electedId).toBe("A");

    expect(result.elected).toBe("A");
    expect(result.eliminated).toEqual(["C"]);
    expect(result.exhausted).toBe("0/1");
  });
});

describe("golden STV Droop+WIG fixture", () => {
  it("matches hand-computed quota, surplus, and transfer factors", () => {
    // Hand table (2 seats, A B C D, totalValid=100):
    // quota = floor(100/3)+1 = 34
    // FP: A=40, B=30, C=20, D=10
    // Step1 elect A: surplus=6; transferable=40 (all A>B); factor=6/40=3/20; B+=6 → B=36
    // Step2 elect B: surplus=2; transferable=30 (B>C); A>B pile has no next continuing;
    //   factor=2/30=1/15; C+=2 → C=22; seats filled → complete (D never eliminated)
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 2,
        ballots: [
          { id: "ab", rankings: ["A", "B"], weight: "40" },
          { id: "bc", rankings: ["B", "C"], weight: "30" },
          { id: "c", rankings: ["C"], weight: "20" },
          { id: "d", rankings: ["D"], weight: "10" },
        ],
      },
      { rng: failRng() },
    );

    expect(result.quota).toBe("34/1");
    expect(result.totalValid).toBe("100/1");
    expect(result.firstPreferences).toEqual({
      A: "40/1",
      B: "30/1",
      C: "20/1",
      D: "10/1",
    });

    const s1 = result.steps.find((s) => s.action === "elect_surplus" && s.electedId === "A")!;
    expect(s1.totalsBefore).toEqual({ A: "40/1", B: "30/1", C: "20/1", D: "10/1" });
    expect(s1.surplus).toBe("6/1");
    expect(s1.transferableTotal).toBe("40/1");
    expect(s1.transferFactor).toBe("3/20");
    expect(s1.totalsAfter).toEqual({ B: "36/1", C: "20/1", D: "10/1" });

    const s2 = result.steps.find((s) => s.action === "elect_surplus" && s.electedId === "B")!;
    expect(s2.totalsBefore).toEqual({ B: "36/1", C: "20/1", D: "10/1" });
    expect(s2.surplus).toBe("2/1");
    expect(s2.transferableTotal).toBe("30/1");
    expect(s2.transferFactor).toBe("1/15");
    expect(s2.totalsAfter).toEqual({ C: "22/1", D: "10/1" });

    expect(result.elected).toEqual(["A", "B"]);
    expect(result.exhausted).toBe("0/1");
    assertStvResultConservation(result);
  });

  it("3-seat-style elimination path archives elect_remaining IDs", () => {
    // seats=3, same ballots, totalValid=100, quota=floor(100/4)+1=26
    // FP A=40 B=30 C=20 D=10
    // Elect A (40): surplus=14; transferable=40; factor=14/40=7/20; B+=14 → B=44
    // Elect B (44): surplus=18; transferable=30 (B>C); non-transferable from A-pile=14;
    //   factor=18/30>1? transferable 30 > surplus 18 → factor=18/30=3/5
    //   transfer 18 to C; retain 12 from transferable + 14 non-transferable = 26
    //   C=20+18=38
    // Elect C (38): surplus=12; transferable=0 (C has no next); retain all 38 above quota
    // Elected A,B,C — no elim needed
    //
    // Alternate smaller field for elim+remaining:
    // seats=2, A=15 B=14 C=12 D=9 total=50, quota=floor(50/3)+1=17
    // Nobody at quota. Eliminate D (9 exhaust). Totals A=15 B=14 C=12
    // Nobody at quota. Eliminate C (12 exhaust). Totals A=15 B=14
    // continuing=2 seats=2 → elect_remaining [A,B]
    const result = countStv(
      {
        candidateIds: ["A", "B", "C", "D"],
        seats: 2,
        ballots: [
          { id: "a", rankings: ["A"], weight: "15" },
          { id: "b", rankings: ["B"], weight: "14" },
          { id: "c", rankings: ["C"], weight: "12" },
          { id: "d", rankings: ["D"], weight: "9" },
        ],
      },
      { rng: failRng() },
    );

    expect(result.quota).toBe("17/1");
    expect(result.firstPreferences).toEqual({
      A: "15/1",
      B: "14/1",
      C: "12/1",
      D: "9/1",
    });

    const elims = result.steps.filter((s) => s.action === "eliminate");
    expect(elims.map((s) => s.eliminatedId)).toEqual(["D", "C"]);
    expect(elims[0]!.newlyExhausted).toBe("9/1");
    expect(elims[1]!.newlyExhausted).toBe("12/1");

    const rem = result.steps.find((s) => s.action === "elect_remaining")!;
    expect(rem.electedIds).toEqual(["A", "B"]);
    expect(rem.totalsBefore).toEqual({ A: "15/1", B: "14/1" });

    expect(result.elected).toEqual(["A", "B"]);
    expect(result.exhausted).toBe("21/1");
    assertStvResultConservation(result);
  });
});
