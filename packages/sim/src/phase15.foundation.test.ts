import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import { partyFamilyTimeline } from "./history15/family.js";
import { migrateSaveV23ToV24, parseSaveFile } from "./save.js";
import { SAVE_SCHEMA_VERSION, type SimState } from "./types.js";
import { emptyHistory15Runtime } from "./history15/types.js";

describe("Phase 15 history foundation smoke", () => {
  it("schema 24 seeds empty history15Runtime on migration", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(24);
    const legacy = {
      schemaVersion: 23,
      contentVersion: "x",
      scenarioId: "terena",
      simulation: { schemaVersion: 23 },
    };
    const migrated = migrateSaveV23ToV24(legacy) as {
      schemaVersion: number;
      simulation: { history15Runtime: unknown };
    };
    expect(migrated.schemaVersion).toBe(24);
    expect(migrated.simulation.history15Runtime).toEqual(emptyHistory15Runtime());
  });

  it("24 months populates eras, governments, and cohorts", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase15-smoke",
      playerPoliticianId: "NPC146",
    });
    advanceIntegrated(sim, 24);
    const state = sim.getSnapshot() as SimState;
    const history15 = ensureHistory15Runtime(state);
    expect(history15.eras.length).toBeGreaterThan(0);
    expect(history15.governments.length).toBeGreaterThan(0);
    expect(history15.tenures.length).toBeGreaterThan(0);
    expect(Object.keys(history15.cohorts).length).toBeGreaterThan(0);
    expect(history15.lastHistoryMonth).not.toBeNull();
    // Family helpers are safe even with empty history.
    expect(Array.isArray(partyFamilyTimeline(state))).toBe(true);

    const save = sim.serializeSave();
    const parsed = parseSaveFile(save, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.save.schemaVersion).toBe(24);
      expect(parsed.save.simulation.history15Runtime?.eras.length).toBeGreaterThan(0);
    }
  });
});
