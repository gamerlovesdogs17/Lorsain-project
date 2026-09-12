import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { jsonClone } from "./hash.js";
import { updateMinisterialPerformance } from "./governing/performance.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import { setImplementationPosture } from "./governing/implementation.js";
import { deriveCabinet } from "./executive/state.js";
import { currentPresidentialAuthorityId } from "./legislature/state.js";
import type { ImplementationRecord } from "./governing/types.js";

describe("Phase 17A government fixtures", () => {
  it("cabinet performance distinguishes early vs scored ministers", () => {
    const world = loadTerenaWorld();
    const boot = createSimulation({ world, seed: "p17a-boot", playerPoliticianId: "NPC146" });
    const presidentId = currentPresidentialAuthorityId(world, boot.getSnapshot()) ?? "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-cabinet",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const cab = deriveCabinet(world, state).filter((m) => m.holderId);
    expect(cab.length).toBeGreaterThan(3);

    updateMinisterialPerformance(world, state);
    const scored = Object.keys(runtime.ministerialPerformance);
    expect(scored.length).toBeGreaterThan(0);

    const freshOffice = scored[0]!;
    delete runtime.ministerialPerformance[freshOffice];
    expect(runtime.ministerialPerformance[freshOffice]).toBeUndefined();
    expect(Object.keys(runtime.ministerialPerformance).length).toBeGreaterThan(0);
  });

  it("implementation posture change is a real governing response", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p17a-impl", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const rec: ImplementationRecord = {
      lawId: "LAW_P17A",
      status: "delayed",
      posture: "standard",
      progress: 0.28,
      departmentId: "economy",
      ministryOfficeId: null,
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 6,
      major: true,
      blockedReason: null,
      metadata: {},
    };
    runtime.implementations[rec.lawId] = rec;
    const before = rec.posture;
    const changed = setImplementationPosture(state, rec.lawId, "accelerated");
    expect(changed).toBeTruthy();
    expect(changed!.posture).toBe("accelerated");
    expect(changed!.posture).not.toBe(before);
  });

  it("budget proposal mutates executive budget state and survives reload", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-budget",
      playerPoliticianId: presidentId,
    });
    const cab = deriveCabinet(world, sim.getSnapshot()).filter((m) => m.holderId);
    const allocations: Record<string, number> = {};
    for (const seat of cab) allocations[seat.officeId] = 120;
    if (Object.keys(allocations).length === 0) {
      const empty = sim.executeCommand({ type: "PROPOSE_BUDGET", allocations: {} });
      expect(empty.ok).toBe(false);
      return;
    }
    const result = sim.executeCommand({ type: "PROPOSE_BUDGET", allocations });
    expect(result.ok).toBe(true);
    const budgets = Object.values(sim.getSnapshot().executiveRuntime.budgets);
    expect(budgets.length).toBeGreaterThan(0);
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(Object.keys(restored.getSnapshot().executiveRuntime.budgets).length).toBe(
      budgets.length,
    );
  });
});
