import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import type { SimState } from "./types.js";

/**
 * Phase 15 multi-seed lighter audits: 3 seeds × 25 years (300 months).
 * Integration-only — excluded from test:fast.
 */
const SEEDS = ["phase15-multiseed-a", "phase15-multiseed-b", "phase15-multiseed-c"] as const;

describe("Phase 15 multi-seed history audit", () => {
  for (const seed of SEEDS) {
    it(
      `25y lighter audit (${seed})`,
      () => {
        const world = loadTerenaWorld();
        const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
        for (let i = 0; i < 300; i += 12) {
          advanceIntegrated(sim, Math.min(12, 300 - i));
        }
        const state = sim.getSnapshot() as SimState;
        const history15 = ensureHistory15Runtime(state);

        expect(Object.values(state.elections).some((e) => e.status === "resolved")).toBe(true);
        expect(history15.eras.length).toBeGreaterThan(0);
        expect(history15.yearbooks.length).toBeGreaterThan(0);
        expect(history15.governments.length).toBeGreaterThan(0);

        const lifecycleEvents = state.history.filter(
          (e) =>
            e.type === "PARTY_LIFECYCLE_SPLIT" ||
            e.type === "PARTY_LIFECYCLE_MERGE" ||
            e.type === "PARTY_LIFECYCLE_FORMATION" ||
            e.type === "FACTION_SPLIT",
        ).length;
        expect(lifecycleEvents).toBeLessThanOrEqual(40);

        const activity = state.history.filter(
          (e) =>
            e.type === "LAW_ENACTED" ||
            e.type === "PARTY_CHAIR_ELECTED" ||
            e.type === "CABINET_RESHUFFLE" ||
            e.type === "ENDORSEMENT_MADE" ||
            e.type === "BILL_INTRODUCED",
        ).length;
        expect(activity).toBeGreaterThan(5);
      },
      { timeout: 900_000 },
    );
  }
});
