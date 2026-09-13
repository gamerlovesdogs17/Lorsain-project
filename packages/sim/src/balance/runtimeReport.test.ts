import { describe, expect, it } from "vitest";
import { buildRuntimeBalanceReport, RUNTIME_BALANCE_REPORT_SCHEMA } from "./runtimeReport.js";
import { createSimulation } from "../engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../integration/harness.js";
import type { SimState } from "../types.js";

describe("buildRuntimeBalanceReport", () => {
  it("produces schema-tagged stats after integrated advance", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "phase17c-unit-smoke",
      playerPoliticianId: "NPC146",
    });
    const startingDate = sim.getSnapshot().currentDate;
    advanceIntegrated(sim, 24);
    const state = sim.getSnapshot() as SimState;
    const report = buildRuntimeBalanceReport(world, state, {
      seed: "phase17c-unit-smoke",
      monthsAdvanced: 24,
      startingDate,
      endingDate: state.currentDate,
    });
    expect(report.schema).toBe(RUNTIME_BALANCE_REPORT_SCHEMA);
    expect(report.history.totalEvents).toBeGreaterThan(0);
    expect(report.newsComposition.repetition.totalStories).toBeGreaterThan(0);
    expect(report.templates.some((t) => t.catalog === "EXECUTIVE_SITUATIONS")).toBe(true);
    expect(Array.isArray(report.diagnosticFlags)).toBe(true);
  });
});
