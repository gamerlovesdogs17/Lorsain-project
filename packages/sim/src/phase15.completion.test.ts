/**
 * phase15.completion.test.ts — Phase 15 encyclopedia completion smoke tests.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { compareElections } from "./history15/comparison.js";
import { ensureFoundingConstitutionalEra } from "./history15/constitutionalEras.js";
import { recordPoliticianLegacy } from "./history15/legacy.js";
import { courtPrecedentChain, syncPrecedentLinks } from "./history15/precedents.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import { processHistory15Month } from "./history15/monthly.js";
import { emptyHistory15Runtime } from "./history15/types.js";
import { migrateSaveV24ToV25, parseSaveFile } from "./save.js";
import type { SimState } from "./types.js";
import { jsonClone } from "./hash.js";

describe("Phase 15 completion", () => {
  it("constitutional era exists after ensure/monthly", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-completion-era",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    ensureHistory15Runtime(state);
    expect(state.history15Runtime!.constitutionalEras.length).toBe(0);
    ensureFoundingConstitutionalEra(state);
    expect(state.history15Runtime!.constitutionalEras.length).toBe(1);
    expect(state.history15Runtime!.constitutionalEras[0]!.label).toBe("Founding");

    // Monthly also seeds when empty
    const state2 = jsonClone(sim.getSnapshot()) as SimState;
    processHistory15Month(world, state2, "CMD000001");
    expect(ensureHistory15Runtime(state2).constitutionalEras.length).toBeGreaterThan(0);
  });

  it("precedent link can form when two similar decisions exist", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-completion-prec",
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
        decisionDate: "2028-01-15",
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
    const links = state.history15Runtime!.precedentLinks;
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.fromDecisionId === "DEC_B" && l.toDecisionId === "DEC_A")).toBe(
      true,
    );
    expect(links[0]!.relation).toBe("distinguishes");

    const chain = courtPrecedentChain(state, "DEC_B");
    expect(chain.map((p) => p.decisionId)).toEqual(["DEC_B", "DEC_A"]);
  });

  it("legacy record on retirement if feasible", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-completion-legacy",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const politicianId = Object.keys(state.politicians)[0]!;
    state.politicians[politicianId]!.retired = true;
    const legacy = recordPoliticianLegacy(state, politicianId, state.currentDate);
    expect(legacy).toBeTruthy();
    expect(legacy!.politicianId).toBe(politicianId);
    expect(legacy!.closedDate).toBe(state.currentDate);
    expect(Array.isArray(legacy!.offices)).toBe(true);
    expect(ensureHistory15Runtime(state).politicianLegacies[politicianId]).toBeTruthy();
  });

  it("election comparison returns structure", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-completion-cmp",
      playerPoliticianId: "NPC146",
    });
    const state = sim.getSnapshot() as SimState;
    const ids = Object.keys(state.elections).sort();
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const a = ids[0]!;
    const b = ids[1] ?? a;
    const cmp = compareElections(state, a, b);
    expect(cmp.electionIdA).toBe(a);
    expect(cmp.electionIdB).toBe(b);
    expect(cmp).toHaveProperty("voteSharesA");
    expect(cmp).toHaveProperty("voteSharesB");
    expect(cmp).toHaveProperty("seatsA");
    expect(cmp).toHaveProperty("seatsB");
    expect(cmp).toHaveProperty("turnoutA");
    expect(cmp).toHaveProperty("turnoutB");
  });

  it("migrateSaveV24ToV25 seeds empty Phase15/caucus fields", () => {
    const migrated = migrateSaveV24ToV25({
      schemaVersion: 24,
      contentVersion: "x",
      scenarioId: "terena",
      simulation: {
        schemaVersion: 24,
        history15Runtime: emptyHistory15Runtime(),
        caucusRuntime: { caucuses: {}, unalignedByParty: {}, lastCaucusMonth: null, metadata: {} },
      },
    }) as {
      schemaVersion: number;
      simulation: {
        history15Runtime: { constitutionalEras: unknown[]; precedentLinks: unknown[] };
        caucusRuntime: unknown;
      };
    };
    expect(migrated.schemaVersion).toBe(25);
    expect(Array.isArray(migrated.simulation.history15Runtime.constitutionalEras)).toBe(true);
    expect(Array.isArray(migrated.simulation.history15Runtime.precedentLinks)).toBe(true);

    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-mig-parse",
      playerPoliticianId: "NPC146",
    });
    const save = sim.serializeSave();
    // parse still works at schema 24; new fields default via emptyHistory15Runtime on ensure
    const parsed = parseSaveFile(save, world.contentVersion);
    expect(parsed.ok).toBe(true);
  });
});
