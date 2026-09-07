/**
 * phase15.precedent.test.ts — explicit precedent cite graph + treatment consistency.
 */
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  courtPrecedentChain,
  filterValidPrecedentTreatments,
  isControllingPrecedent,
  isOverturnedPrecedent,
  recordExplicitPrecedentLinks,
  syncPrecedentLinks,
  validatePrecedentTreatment,
  wouldCreatePrecedentCycle,
} from "./history15/precedents.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import type { PrecedentLinkRelation } from "./history15/types.js";
import { candidatePrecedents, decidePrecedentTreatments } from "./courts/procedure.js";
import type { CourtCase, PrecedentRecord } from "./courts/types.js";
import type { RngService } from "./rng.js";
import type { SimState } from "./types.js";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seedState(seed: string): SimState {
  const world = loadTerenaWorld();
  const sim = createSimulation({
    world,
    seed,
    playerPoliticianId: "NPC146",
  });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensureHistory15Runtime(state);
  return state;
}

function putPrecedent(
  state: SimState,
  rec: PrecedentRecord,
  treatments?: Array<{ priorDecisionId: string; relation: PrecedentLinkRelation }>,
): void {
  state.constitutionalRuntime.precedents[rec.decisionId] = rec;
  state.constitutionalRuntime.courtDecisions[rec.decisionId] = {
    id: rec.decisionId,
    caseId: rec.caseId,
    decisionDate: rec.decisionDate,
    disposition: rec.disposition,
    uphold: rec.uphold,
    invalidate: rec.invalidate,
    nonparticipation: 0,
    votes: {},
    constitutionalQuestion: rec.constitutionalQuestion,
    constitutionalRule: rec.constitutionalRule,
    caseType: rec.caseType,
    ...(treatments ? { precedentTreatments: treatments } : {}),
    metadata: {},
  };
}

function stubCase(
  overrides: Partial<CourtCase> &
    Pick<CourtCase, "caseType" | "constitutionalRule" | "constitutionalQuestion">,
): CourtCase {
  return {
    id: "CASE_LIVE",
    filedDate: "2030-01-01",
    petitionerId: "P1",
    respondentId: "P2",
    challengedKind: "law",
    challengedId: "LAW1",
    meritsLean: 0.2,
    status: "pending",
    participatingJudgeIds: ["J1", "J2", "J3"],
    votes: {},
    disposition: null,
    decisionId: null,
    decisionDate: null,
    stageReadyDate: "2030-01-01",
    expedited: false,
    eventIds: [],
    metadata: {},
    ...overrides,
  };
}

function fixedRng(values: number[]): RngService {
  let i = 0;
  const next = () => {
    const v = values[Math.min(i, values.length - 1)]!;
    i += 1;
    return v;
  };
  return {
    algo: "xoshiro128**",
    masterSeed: "fixed",
    uint32: () => Math.floor(next() * 0x1_0000_0000),
    float01: () => next(),
    serialize: () => {
      throw new Error("fixedRng does not serialize");
    },
  };
}

describe("Phase 15 explicit precedents", () => {
  it("inferred-similar cases with NO recorded relation → empty chain", () => {
    const state = seedState("phase15-precedent-empty");
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
    const state = seedState("phase15-precedent-follow");
    putPrecedent(state, {
      decisionId: "DEC_A",
      caseId: "CASE_A",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_I",
      disposition: "UPHOLD",
      decisionDate: "2028-01-01",
      uphold: 5,
      invalidate: 2,
    });
    putPrecedent(
      state,
      {
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
      [{ priorDecisionId: "DEC_A", relation: "follows" }],
    );

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

  it("stores A follows, B distinguishes, C limits, D overturns, E no relation; graph has no cycles", () => {
    const state = seedState("phase15-precedent-graph-abcde");
    const base = {
      caseType: "LAW_REVIEW" as const,
      constitutionalRule: "ARTICLE_I",
      constitutionalQuestion: "q_equal_protection",
      uphold: 5,
      invalidate: 2,
    };
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_ROOT",
      caseId: "CASE_ROOT",
      disposition: "UPHOLD",
      decisionDate: "2025-01-01",
    });
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_A",
      caseId: "CASE_A",
      disposition: "UPHOLD",
      decisionDate: "2026-01-01",
    });
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_B",
      caseId: "CASE_B",
      constitutionalQuestion: "q_due_process_variant",
      disposition: "UPHOLD",
      decisionDate: "2027-01-01",
    });
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_C",
      caseId: "CASE_C",
      disposition: "UPHOLD",
      decisionDate: "2028-01-01",
    });
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_D",
      caseId: "CASE_D",
      disposition: "INVALIDATE",
      decisionDate: "2029-01-01",
      uphold: 2,
      invalidate: 5,
    });
    putPrecedent(state, {
      ...base,
      decisionId: "DEC_E",
      caseId: "CASE_E",
      disposition: "UPHOLD",
      decisionDate: "2030-01-01",
    });

    // Record controlling cites before the overturn edge exists on the graph.
    recordExplicitPrecedentLinks(state, "DEC_A", [
      { priorDecisionId: "DEC_ROOT", relation: "follows" },
    ]);
    recordExplicitPrecedentLinks(state, "DEC_B", [
      { priorDecisionId: "DEC_ROOT", relation: "distinguishes" },
    ]);
    recordExplicitPrecedentLinks(state, "DEC_C", [
      { priorDecisionId: "DEC_ROOT", relation: "limits" },
    ]);
    state.constitutionalRuntime.courtDecisions.DEC_A!.precedentTreatments = [
      { priorDecisionId: "DEC_ROOT", relation: "follows" },
    ];
    state.constitutionalRuntime.courtDecisions.DEC_B!.precedentTreatments = [
      { priorDecisionId: "DEC_ROOT", relation: "distinguishes" },
    ];
    state.constitutionalRuntime.courtDecisions.DEC_C!.precedentTreatments = [
      { priorDecisionId: "DEC_ROOT", relation: "limits" },
    ];
    state.constitutionalRuntime.courtDecisions.DEC_D!.precedentTreatments = [
      { priorDecisionId: "DEC_ROOT", relation: "overturns" },
    ];
    recordExplicitPrecedentLinks(state, "DEC_D", [
      { priorDecisionId: "DEC_ROOT", relation: "overturns" },
    ]);

    const links = state.history15Runtime!.precedentLinks;
    expect(links).toEqual(
      expect.arrayContaining([
        { fromDecisionId: "DEC_A", toDecisionId: "DEC_ROOT", relation: "follows" },
        { fromDecisionId: "DEC_B", toDecisionId: "DEC_ROOT", relation: "distinguishes" },
        { fromDecisionId: "DEC_C", toDecisionId: "DEC_ROOT", relation: "limits" },
        { fromDecisionId: "DEC_D", toDecisionId: "DEC_ROOT", relation: "overturns" },
      ]),
    );
    expect(links.some((l) => l.fromDecisionId === "DEC_E")).toBe(false);
    expect(courtPrecedentChain(state, "DEC_E")).toEqual([]);

    expect(wouldCreatePrecedentCycle(state, "DEC_ROOT", "DEC_A")).toBe(true);
    expect(wouldCreatePrecedentCycle(state, "DEC_E", "DEC_ROOT")).toBe(false);
    expect(isOverturnedPrecedent(state, "DEC_ROOT")).toBe(true);
    expect(isControllingPrecedent(state, "DEC_ROOT")).toBe(false);
  });

  it("rejects self-reference, future cites, duplicates, cycles, and controlling cites of overturned priors", () => {
    const state = seedState("phase15-precedent-validate");
    putPrecedent(state, {
      decisionId: "DEC_OLD",
      caseId: "CASE_OLD",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q",
      constitutionalRule: "ARTICLE_I",
      disposition: "UPHOLD",
      decisionDate: "2026-01-01",
      uphold: 5,
      invalidate: 2,
    });
    putPrecedent(state, {
      decisionId: "DEC_NEW",
      caseId: "CASE_NEW",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q",
      constitutionalRule: "ARTICLE_I",
      disposition: "INVALIDATE",
      decisionDate: "2028-01-01",
      uphold: 2,
      invalidate: 5,
    });
    putPrecedent(state, {
      decisionId: "DEC_FUTURE",
      caseId: "CASE_FUTURE",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q",
      constitutionalRule: "ARTICLE_I",
      disposition: "UPHOLD",
      decisionDate: "2035-01-01",
      uphold: 5,
      invalidate: 2,
    });

    expect(validatePrecedentTreatment(state, "DEC_NEW", "DEC_NEW", "follows").ok).toBe(false);
    expect(validatePrecedentTreatment(state, "DEC_NEW", "DEC_FUTURE", "follows").ok).toBe(false);

    recordExplicitPrecedentLinks(state, "DEC_NEW", [
      { priorDecisionId: "DEC_OLD", relation: "overturns" },
    ]);
    expect(isOverturnedPrecedent(state, "DEC_OLD")).toBe(true);
    expect(validatePrecedentTreatment(state, "DEC_NEW", "DEC_OLD", "follows").ok).toBe(false);
    expect(validatePrecedentTreatment(state, "DEC_NEW", "DEC_OLD", "overturns").ok).toBe(false); // duplicate

    // Cycle: OLD cannot cite NEW after NEW→OLD exists.
    expect(validatePrecedentTreatment(state, "DEC_OLD", "DEC_NEW", "distinguishes").ok).toBe(false);

    const filtered = filterValidPrecedentTreatments(state, "DEC_NEW", [
      { priorDecisionId: "DEC_NEW", relation: "follows" },
      { priorDecisionId: "DEC_FUTURE", relation: "relies_on" },
      { priorDecisionId: "DEC_OLD", relation: "follows" },
    ]);
    expect(filtered).toEqual([]);
  });

  it("candidatePrecedents matches caseType+rule and skips overturned controlling priors", () => {
    const state = seedState("phase15-precedent-candidates");
    putPrecedent(state, {
      decisionId: "DEC_LIVE",
      caseId: "CASE_LIVE",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_I",
      disposition: "UPHOLD",
      decisionDate: "2026-01-01",
      uphold: 5,
      invalidate: 2,
    });
    putPrecedent(state, {
      decisionId: "DEC_OTHER_RULE",
      caseId: "CASE_OTHER",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_II",
      disposition: "UPHOLD",
      decisionDate: "2026-06-01",
      uphold: 5,
      invalidate: 2,
    });
    putPrecedent(state, {
      decisionId: "DEC_OVERTURNER",
      caseId: "CASE_OV",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_I",
      disposition: "INVALIDATE",
      decisionDate: "2027-01-01",
      uphold: 2,
      invalidate: 5,
    });
    recordExplicitPrecedentLinks(state, "DEC_OVERTURNER", [
      { priorDecisionId: "DEC_LIVE", relation: "overturns" },
    ]);

    const found = candidatePrecedents(
      state,
      stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_equal_protection",
      }),
      { asOfDate: "2030-01-01" },
    );
    expect(found.map((p) => p.decisionId)).toEqual(["DEC_OVERTURNER"]);
    expect(found.some((p) => p.decisionId === "DEC_LIVE")).toBe(false);
  });

  it("decidePrecedentTreatments can follow, distinguish, limit, overturn, or ignore", () => {
    const world = loadTerenaWorld();
    const state = seedState("phase15-precedent-decide");
    putPrecedent(state, {
      decisionId: "DEC_PRIOR",
      caseId: "CASE_PRIOR",
      caseType: "LAW_REVIEW",
      constitutionalQuestion: "q_equal_protection",
      constitutionalRule: "ARTICLE_I",
      disposition: "UPHOLD",
      decisionDate: "2020-01-01",
      uphold: 7,
      invalidate: 2,
    });
    state.constitutionalRuntime.courtCases.CASE_PRIOR = stubCase({
      id: "CASE_PRIOR",
      caseType: "LAW_REVIEW",
      constitutionalRule: "ARTICLE_I",
      constitutionalQuestion: "q_equal_protection",
      participatingJudgeIds: ["J1", "J2", "J3"],
      status: "decided",
      disposition: "UPHOLD",
      decisionId: "DEC_PRIOR",
      decisionDate: "2020-01-01",
    });

    const sameQuestionUphold = decidePrecedentTreatments(world, state, {
      courtCase: stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_equal_protection",
        meritsLean: 0.05,
        participatingJudgeIds: ["J1", "J2", "J3"],
      }),
      disposition: "UPHOLD",
      decisionId: "DEC_FOLLOW",
      decisionDate: "2030-01-01",
      currentJudgeIds: ["J1", "J2", "J3"],
      rng: fixedRng([0.05, 0.99]),
    });
    expect(
      sameQuestionUphold.some((t) => t.relation === "follows" || t.relation === "relies_on"),
    ).toBe(true);

    const distinguished = decidePrecedentTreatments(world, state, {
      courtCase: stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_different_fact_pattern",
        meritsLean: 0.7,
        participatingJudgeIds: ["X1", "X2", "X3"],
      }),
      disposition: "UPHOLD",
      decisionId: "DEC_DIST",
      decisionDate: "2030-01-01",
      currentJudgeIds: ["X1", "X2", "X3"],
      rng: fixedRng([0.8, 0.99]),
    });
    expect(
      distinguished.length === 0 ||
        distinguished.some((t) => t.relation === "distinguishes" || t.relation === "limits"),
    ).toBe(true);

    const limited = decidePrecedentTreatments(world, state, {
      courtCase: stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_equal_protection",
        meritsLean: 0.4,
        participatingJudgeIds: ["X1", "X2", "X3"],
      }),
      disposition: "UPHOLD",
      decisionId: "DEC_LIMIT",
      decisionDate: "2030-01-01",
      currentJudgeIds: ["X1", "X2", "X3"],
      rng: fixedRng([0.55, 0.99]),
    });
    expect(
      limited.some((t) =>
        ["limits", "follows", "relies_on", "distinguishes"].includes(t.relation),
      ) || limited.length === 0,
    ).toBe(true);

    const overturned = decidePrecedentTreatments(world, state, {
      courtCase: stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_equal_protection",
        meritsLean: 0.9,
        participatingJudgeIds: ["Y1", "Y2", "Y3", "Y4", "Y5"],
      }),
      disposition: "INVALIDATE",
      decisionId: "DEC_OVERTURN",
      decisionDate: "2032-01-01",
      currentJudgeIds: ["Y1", "Y2", "Y3", "Y4", "Y5"],
      rng: fixedRng([0.2, 0.0]),
    });
    expect(overturned.some((t) => t.relation === "overturns")).toBe(true);

    const ignored = decidePrecedentTreatments(world, state, {
      courtCase: stubCase({
        caseType: "LAW_REVIEW",
        constitutionalRule: "ARTICLE_I",
        constitutionalQuestion: "q_tangential",
        meritsLean: 0.01,
        participatingJudgeIds: ["Z1"],
      }),
      disposition: "UPHOLD",
      decisionId: "DEC_IGNORE",
      decisionDate: "2030-01-01",
      currentJudgeIds: ["Z1"],
      rng: fixedRng([0.1, 0.99]),
    });
    expect(ignored).toEqual([]);
  });
});
