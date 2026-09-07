/**
 * phase15.precedent.test.ts — explicit precedent cite graph only.
 */
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  courtPrecedentChain,
  recordExplicitPrecedentLinks,
  syncPrecedentLinks,
} from "./history15/precedents.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import type { SimState } from "./types.js";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Phase 15 explicit precedents", () => {
  it("inferred-similar cases with NO recorded relation → empty chain", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-precedent-empty",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    ensureHistory15Runtime(state);
    state.constitutionalRuntime.precedents = {
      DEC_A: {
        decisionId: "DEC_A",
        caseId: "CASE_A",
        caseType: "LAW_REVIEW",
        constitutionalQuestion: "q_equal_protection",
        constitutionalRule: "ARTICLE_I",
        disposition: "UPHOLD",
        decisionDate: "2028-01-01",
        uphold: 5,
        invalidate: 2,
      },
      DEC_B: {
        decisionId: "DEC_B",
        caseId: "CASE_B",
        caseType: "LAW_REVIEW",
        constitutionalQuestion: "q_equal_protection",
        constitutionalRule: "ARTICLE_I",
        disposition: "INVALIDATE",
        decisionDate: "2029-06-01",
        uphold: 2,
        invalidate: 5,
      },
    };

    syncPrecedentLinks(state);
    expect(state.history15Runtime!.precedentLinks.length).toBe(0);
    expect(courtPrecedentChain(state, "DEC_B")).toEqual([]);
  });

  it("explicit follows → chain present", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-precedent-follow",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    ensureHistory15Runtime(state);
    state.constitutionalRuntime.precedents = {
      DEC_A: {
        decisionId: "DEC_A",
        caseId: "CASE_A",
        caseType: "LAW_REVIEW",
        constitutionalQuestion: "q_equal_protection",
        constitutionalRule: "ARTICLE_I",
        disposition: "UPHOLD",
        decisionDate: "2028-01-01",
        uphold: 5,
        invalidate: 2,
      },
      DEC_B: {
        decisionId: "DEC_B",
        caseId: "CASE_B",
        caseType: "LAW_REVIEW",
        constitutionalQuestion: "q_equal_protection",
        constitutionalRule: "ARTICLE_I",
        disposition: "UPHOLD",
        decisionDate: "2029-06-01",
        uphold: 4,
        invalidate: 3,
      },
    };
    state.constitutionalRuntime.courtDecisions.DEC_B = {
      id: "DEC_B",
      caseId: "CASE_B",
      decisionDate: "2029-06-01",
      disposition: "UPHOLD",
      uphold: 4,
      invalidate: 3,
      nonparticipation: 0,
      votes: {},
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_I",
      caseType: "LAW_REVIEW",
      precedentTreatments: [{ priorDecisionId: "DEC_A", relation: "follows" }],
      metadata: {},
    };

    recordExplicitPrecedentLinks(state, "DEC_B", [
      { priorDecisionId: "DEC_A", relation: "follows" },
    ]);
    expect(
      state.history15Runtime!.precedentLinks.some(
        (l) =>
          l.fromDecisionId === "DEC_B" && l.toDecisionId === "DEC_A" && l.relation === "follows",
      ),
    ).toBe(true);

    const chain = courtPrecedentChain(state, "DEC_B");
    expect(chain.map((p) => p.decisionId)).toEqual(["DEC_B", "DEC_A"]);
  });
});
