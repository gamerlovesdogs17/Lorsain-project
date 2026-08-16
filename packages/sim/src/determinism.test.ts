import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { hashCanonical } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { syntheticWorld } from "./synthetic-world.js";

function advance(sim: ReturnType<typeof createSimulation>, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (r.ok && r.interrupt) {
      if (r.interrupt.requiresResolution) {
        throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
      }
      const ack = sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" });
      expect(ack.ok).toBe(true);
      const resume = sim.executeCommand({ type: "RESUME_TURN" });
      expect(resume.ok).toBe(true);
    } else {
      expect(r.ok).toBe(true);
    }
  }
}

describe("20-year kernel determinism", () => {
  it("save at 10 years, continue vs restore, identical 20-year hashes", () => {
    const world = syntheticWorld("KERNEL-20YR");
    const a = createSimulation({ world, playerPoliticianId: "P1" });
    advance(a, 120);
    const save = a.serializeSave();
    expect(a.getSnapshot().currentDate).toBe("2010-01-01");
    const b = restoreSimulation(save, world);
    advance(a, 120);
    advance(b, 120);
    expect(a.getSnapshot().currentDate).toBe("2020-01-01");
    expect(b.getSnapshot().currentDate).toBe("2020-01-01");
    expect(a.hashState()).toBe(b.hashState());

    const c = createSimulation({ world, playerPoliticianId: "P1" });
    advance(c, 240);
    expect(c.hashState()).toBe(a.hashState());
    expect(a.hashState()).toBe("33a7bc804cf1298b9c80153ae3d68031");
  });

  it("different seed with stochastic event produces a different valid hash", () => {
    const w1 = syntheticWorld("SEED-A");
    const w2 = syntheticWorld("SEED-B");
    const a = createSimulation({ world: w1, playerPoliticianId: "P1" });
    const b = createSimulation({ world: w2, playerPoliticianId: "P1" });
    advance(a, 120);
    advance(b, 120);
    expect(a.hashState()).not.toBe(b.hashState());
    expect(a.getSnapshot().currentDate).toBe(b.getSnapshot().currentDate);
  });
});

describe("save / load", () => {
  it("new game save/load matches state hash", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const hash = sim.hashState();
    const restored = restoreSimulation(sim.serializeSave(), syntheticWorld());
    expect(restored.hashState()).toBe(hash);
  });

  it("save after RNG draws restores the next draw", () => {
    const sim = createSimulation({ world: syntheticWorld("RNG-SAVE"), playerPoliticianId: "P1" });
    const d1 = sim.executeCommand({ type: "DEV_DRAW_RNG", stream: "flavor" });
    expect(d1.ok).toBe(true);
    const save = sim.serializeSave();
    const nextA = sim.executeCommand({ type: "DEV_DRAW_RNG", stream: "flavor" });
    const restored = restoreSimulation(save, syntheticWorld("RNG-SAVE"));
    const nextB = restored.executeCommand({ type: "DEV_DRAW_RNG", stream: "flavor" });
    expect(nextA.ok && nextB.ok).toBe(true);
    if (!nextA.ok || !nextB.ok) return;
    expect(nextA.events[0]?.payload.value).toBe(nextB.events[0]?.payload.value);
  });

  it("save while paused at mid-month interrupt resumes correctly", () => {
    const world = syntheticWorld();
    world.scenarioStartDate = "2028-01-01";
    world.initialScheduled = [
      {
        dueDate: "2028-10-14",
        eventType: "BLOCKING_TEST",
        payload: {},
        priority: 0,
        blocking: true,
        requiresResolution: false,
        source: "test",
      },
    ];
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    advance(sim, 9);
    const paused = sim.executeCommand({ type: "ADVANCE_TURN" });
    expect(paused.ok && paused.interrupt?.code).toBe("BLOCKING_TEST");
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(restored.getSnapshot().currentDate).toBe("2028-10-14");
    expect(restored.executeCommand({ type: "RESUME_TURN" }).ok).toBe(false);
    expect(restored.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
    const resumed = restored.executeCommand({ type: "RESUME_TURN" });
    expect(resumed.ok).toBe(true);
    expect(restored.getSnapshot().currentDate).toBe("2028-11-01");
  });

  it("rejects malformed, future schema, and incompatible content versions", () => {
    expect(parseSaveFile(null).ok).toBe(false);
    expect(
      parseSaveFile({
        schemaVersion: 99,
        contentVersion: "x",
        scenarioId: "s",
        rng: {},
        simulation: {},
      }).ok,
    ).toBe(false);
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const save = sim.serializeSave();
    save.contentVersion = "9.9.9-nope";
    const badContent = parseSaveFile(save, "0.3.1-predev");
    expect(badContent.ok).toBe(false);
    if (!badContent.ok) expect(badContent.error.code).toBe("INCOMPATIBLE_CONTENT");
  });

  it("continues event IDs deterministically after load", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    sim.executeCommand({ type: "ADVANCE_TURN" });
    const last = sim.getSnapshot().history.at(-1)?.id;
    const restored = restoreSimulation(sim.serializeSave(), syntheticWorld());
    restored.executeCommand({ type: "ADVANCE_TURN" });
    const next = restored.getSnapshot().history.at(-1)?.id;
    expect(last && next && next > last).toBe(true);
  });

  it("canonical hash ignores object key insertion order", () => {
    expect(hashCanonical({ b: 1, a: 2 })).toBe(hashCanonical({ a: 2, b: 1 }));
  });

  it("leaves kernel world unchanged after 120 turns", () => {
    const world = syntheticWorld("IMMUTABLE");
    const before = hashCanonical(world);
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    advance(sim, 120);
    expect(hashCanonical(sim.world())).toBe(before);
    expect(hashCanonical(world)).toBe(before);
  });
});
