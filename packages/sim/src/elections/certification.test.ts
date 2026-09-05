import { countIrv } from "@lorsain/election-math";
import { describe, expect, it } from "vitest";
import { certifyCount, certifyShareResult } from "./certification.js";

describe("public election certification", () => {
  it("requires and records an exact recount for a sub-half-point final margin", () => {
    const archive = countIrv(
      {
        candidateIds: ["A", "B"],
        ballots: [
          { rankings: ["A"], weight: "501" },
          { rankings: ["B"], weight: "499" },
        ],
      },
      { rng: { nextUint32: () => 0 } },
    );
    const certification = certifyCount({
      date: "2032-11-01",
      authority: "national_electoral_commission",
      archives: [archive],
    });
    expect(certification.status).toBe("certified_after_recount");
    expect(certification.recount).toBe("automatic_exact_recount_completed");
    expect(certification.margin).toBeCloseTo(0.002, 8);
  });

  it("publishes the lawful legal-lot procedure when an exact tie reaches it", () => {
    const archive = countIrv(
      {
        candidateIds: ["A", "B", "C"],
        ballots: [
          { rankings: ["C", "A"], weight: "40" },
          { rankings: ["A"], weight: "30" },
          { rankings: ["B"], weight: "30" },
        ],
      },
      { rng: { nextUint32: () => 0 } },
    );
    const certification = certifyCount({
      date: "2032-11-01",
      authority: "national_electoral_commission",
      archives: [archive],
    });
    expect(certification.tieBreakMethods).toContain("legal_lot");
  });

  it("does not mark a clear province-wide result for recount", () => {
    const certification = certifyShareResult({
      date: "2030-05-01",
      authority: "provincial_electoral_commission",
      shares: [0.57, 0.43],
    });
    expect(certification.status).toBe("certified");
    expect(certification.recount).toBe("not_required");
  });
});
