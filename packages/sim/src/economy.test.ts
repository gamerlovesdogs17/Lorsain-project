import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { SAVE_SCHEMA_VERSION, type KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { parseSaveFile } from "./save.js";
import { INDEX_CEIL, INDEX_FLOOR, MAX_MONTHLY_INDEX_MOVE, policyIndexDelta } from "./economy/policy.js";
import type { EnactedLawRecord } from "./legislature/types.js";
import type { NationalEconomyIndices } from "./economy/types.js";

function expectOk(sim: Simulation, command: Parameters<Simulation["executeCommand"]>[0]) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function advance(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (r.interrupt) {
      if (r.interrupt.requiresResolution) {
        throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
      }
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
  }
}

function finiteIndices(n: NationalEconomyIndices): void {
  for (const [k, v] of Object.entries(n)) {
    expect(Number.isFinite(v), k).toBe(true);
    expect(v).not.toBe(Number.POSITIVE_INFINITY);
    if (k === "fiscalPressure") {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    } else {
      expect(v).toBeGreaterThanOrEqual(INDEX_FLOOR);
      expect(v).toBeLessThanOrEqual(INDEX_CEIL);
    }
  }
}

function withOperativeLaw(sim: Simulation, world: KernelWorld, issueId: string, direction: 1 | -1) {
  const snap = jsonClone(sim.getSnapshot());
  const law: EnactedLawRecord = {
    id: "LAWTEST01",
    billId: "BILLTEST01",
    title: "Synthetic policy",
    policyItems: [{ issueId, direction, magnitude: 0.7, fiscalImpact: 0.1 }],
    amendmentIds: [],
    floorVoteId: null,
    repassageVoteId: null,
    presidentialDisposition: "signed",
    enactedDate: snap.currentDate,
    sponsorId: snap.playerPoliticianId,
    eventIds: [],
    operative: true,
    invalidatedByDecisionId: null,
    metadata: {},
  };
  snap.legislatureRuntime.enactedLaws[law.id] = law;
  return restoreSimulation(
    {
      schemaVersion: SAVE_SCHEMA_VERSION,
      contentVersion: snap.contentVersion,
      scenarioId: snap.scenarioId,
      simulation: snap,
    },
    world,
  );
}

describe("Phase 9 economy", () => {
  it("keeps indices finite and bounded over 36 routine months", () => {
    const world = legislativeHarnessWorld("ECON-36");
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ECON-36" });
    const start = sim.getSnapshot().economyRuntime.national.outputIndex;
    expect(start).toBe(100);
    advance(sim, 36);
    const n = sim.getSnapshot().economyRuntime.national;
    finiteIndices(n);
    expect(Math.abs(n.outputIndex - start)).toBeLessThan(MAX_MONTHLY_INDEX_MOVE * 36);
    const hist = sim.getSnapshot().economyRuntime.history;
    for (let i = 1; i < hist.length; i++) {
      const prev = hist[i - 1]!;
      const cur = hist[i]!;
      expect(Math.abs(cur.outputIndex - prev.outputIndex)).toBeLessThanOrEqual(
        MAX_MONTHLY_INDEX_MOVE + 0.001,
      );
    }
  });

  it("lags ordinary legislation instead of moving output immediately", () => {
    const world = legislativeHarnessWorld("ECON-LAG");
    const base = createSimulation({ world, playerPoliticianId: "MP02", seed: "ECON-LAG" });
    const before = base.getSnapshot().economyRuntime.national.outputIndex;
    const sim = withOperativeLaw(base, world, "ISS_HOUSING", 1);
    expect(sim.getSnapshot().economyRuntime.national.outputIndex).toBe(before);
    advance(sim, 1);
    expect(Math.abs(sim.getSnapshot().economyRuntime.national.outputIndex - before)).toBeLessThan(3);
    expect(sim.getSnapshot().economyRuntime.laggedEffects.length).toBeGreaterThan(0);
  });

  it("labor and ownership policies are tradeoffs, not one-sided ideology wins", () => {
    const labor = policyIndexDelta({
      issueId: "ISS_LABOR",
      direction: 1,
      magnitude: 0.8,
      fiscalImpact: null,
    });
    const ownership = policyIndexDelta({
      issueId: "ISS_OWNERSHIP",
      direction: 1,
      magnitude: 0.8,
      fiscalImpact: null,
    });
    expect((labor.realWageIndex ?? 0) > 0).toBe(true);
    expect((labor.outputIndex ?? 0) < 0).toBe(true);
    expect((ownership.outputIndex ?? 0) > 0).toBe(true);
    expect((ownership.realWageIndex ?? 0) < 0).toBe(true);
  });

  it("same seed reproduces and save/restore continues identically", () => {
    const world = legislativeHarnessWorld("ECON-DET");
    const a = createSimulation({ world, playerPoliticianId: "MP02", seed: "ECON-DET" });
    advance(a, 8);
    const save = a.serializeSave();
    const parsed = parseSaveFile(JSON.parse(JSON.stringify(save)));
    expect(parsed.ok).toBe(true);
    const b = restoreSimulation(save, world);
    expect(b.hashState()).toBe(a.hashState());
    advance(a, 8);
    advance(b, 8);
    expect(a.hashState()).toBe(b.hashState());
    const c = createSimulation({ world, playerPoliticianId: "MP02", seed: "ECON-DET" });
    advance(c, 16);
    expect(c.hashState()).toBe(a.hashState());
  });

  it("different seeds vary without leaving the index band", () => {
    const w1 = legislativeHarnessWorld("ECON-A");
    const w2 = legislativeHarnessWorld("ECON-B");
    const a = createSimulation({ world: w1, playerPoliticianId: "MP02", seed: "ECON-A" });
    const b = createSimulation({ world: w2, playerPoliticianId: "MP02", seed: "ECON-B" });
    advance(a, 18);
    advance(b, 18);
    finiteIndices(a.getSnapshot().economyRuntime.national);
    finiteIndices(b.getSnapshot().economyRuntime.national);
    expect(a.hashState()).not.toBe(b.hashState());
  });

  it("migrates schema 8 to 9 with January 2028 = 100 and empty media/org history", () => {
    const world = legislativeHarnessWorld("ECON-MIG");
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ECON-MIG" });
    const snap = jsonClone(sim.getSnapshot());
    const raw = {
      schemaVersion: 8,
      contentVersion: snap.contentVersion,
      scenarioId: snap.scenarioId,
      simulation: {
        ...snap,
        schemaVersion: 8,
        economyRuntime: undefined,
        organizationRuntime: undefined,
        mediaRuntime: undefined,
      },
    };
    delete (raw.simulation as { economyRuntime?: unknown }).economyRuntime;
    delete (raw.simulation as { organizationRuntime?: unknown }).organizationRuntime;
    delete (raw.simulation as { mediaRuntime?: unknown }).mediaRuntime;
    const parsed = parseSaveFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(9);
    const restored = restoreSimulation(parsed.save, world);
    expect(restored.getSnapshot().economyRuntime.national.outputIndex).toBe(100);
    expect(Object.keys(restored.getSnapshot().mediaRuntime.stories)).toHaveLength(0);
    expect(
      Object.values(restored.getSnapshot().organizationRuntime.actors).every(
        (a) => a.recentActions.length === 0,
      ),
    ).toBe(true);
  });
});
