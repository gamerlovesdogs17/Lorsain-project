import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import type { SimState } from "./types.js";

/**
 * Phase 15 long-run audit: 25 years (300 months), one deterministic seed.
 * Asserts leadership transitions, elections, non-frozen activity, bounded chaos.
 * Run solo — full Terena months are slow; avoid parallel vitest files.
 */
describe("Phase 15 long-run history audit", () => {
  it(
    "25-year run records transitions without freezing or chaos",
    () => {
      const seed = "phase15-longrun-a";
      const world = loadTerenaWorld();
      const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
      const started = performance.now();
      // Chunked advance keeps the vitest worker responsive for timeout/RPC.
      for (let i = 0; i < 300; i += 12) {
        advanceIntegrated(sim, Math.min(12, 300 - i));
      }
      const elapsedMs = performance.now() - started;
      const state = sim.getSnapshot() as SimState;
      const history15 = ensureHistory15Runtime(state);
      const politics = ensurePoliticsRuntime(state);

      const closedTenures = history15.tenures.filter((t) => t.end != null).length;
      const chairEvents = state.history.filter(
        (e) =>
          e.type === "PARTY_CHAIR_ELECTED" ||
          e.type === "PARTY_LEADERSHIP_CHANGED" ||
          e.type === "PARTY_LEADER_SET" ||
          e.type === "PARTY_LEADERSHIP_CONTEST_RESOLVED",
      ).length;
      const leadershipTransitions = Math.max(closedTenures, chairEvents);
      expect(leadershipTransitions).toBeGreaterThan(0);

      const elections = Object.values(state.elections).filter((e) => e.status === "resolved");
      expect(elections.length).toBeGreaterThan(0);

      const meaningfulActivity =
        state.history.filter(
          (e) =>
            e.type === "POLITICIAN_CAREER_DECISION" ||
            e.type === "PARTY_RECRUITED_CANDIDATE" ||
            e.type === "CAUCUS_AGENDA_SET" ||
            e.type === "CABINET_RESHUFFLE" ||
            e.type === "ORG_ISSUE_CAMPAIGN" ||
            e.type === "PARTY_CHAIR_ELECTED" ||
            e.type === "ENDORSEMENT_MADE" ||
            e.type === "POLITICIAN_RETIRED" ||
            e.type === "LAW_ENACTED" ||
            e.type === "BILL_INTRODUCED",
        ).length + Object.keys(politics.careerAmbitions).length;
      expect(meaningfulActivity).toBeGreaterThan(10);

      const lifecycleEvents = state.history.filter(
        (e) =>
          e.type === "PARTY_LIFECYCLE_SPLIT" ||
          e.type === "PARTY_LIFECYCLE_MERGE" ||
          e.type === "PARTY_LIFECYCLE_FORMATION" ||
          e.type === "FACTION_SPLIT",
      ).length;
      // 25y bound: allow some churn, not runaway chaos.
      expect(lifecycleEvents).toBeLessThanOrEqual(40);

      expect(history15.eras.length).toBeGreaterThan(0);
      expect(history15.governments.length).toBeGreaterThan(0);
      expect(history15.yearbooks.length).toBeGreaterThan(0);
      expect(Object.keys(history15.cohorts).length).toBeGreaterThan(0);

      // Optional 50y extension when the 25y pass is comfortably under 120s.
      if (elapsedMs < 120_000) {
        for (let i = 0; i < 300; i += 12) {
          advanceIntegrated(sim, Math.min(12, 300 - i));
        }
        const longer = ensureHistory15Runtime(sim.getSnapshot() as SimState);
        expect(longer.tenures.length).toBeGreaterThanOrEqual(history15.tenures.length);
        expect(longer.yearbooks.length).toBeGreaterThanOrEqual(history15.yearbooks.length);
        const lifecycle50 = (sim.getSnapshot() as SimState).history.filter(
          (e) =>
            e.type === "PARTY_LIFECYCLE_SPLIT" ||
            e.type === "PARTY_LIFECYCLE_MERGE" ||
            e.type === "PARTY_LIFECYCLE_FORMATION" ||
            e.type === "FACTION_SPLIT",
        ).length;
        expect(lifecycle50).toBeLessThanOrEqual(80);
      }
    },
    { timeout: 900_000 },
  );
});
