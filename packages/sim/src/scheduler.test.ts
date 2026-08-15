import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { syntheticWorld } from "./synthetic-world.js";

describe("scheduler / monthly turns", () => {
  it("orders same-day events by priority then sequence", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    expect(
      sim.executeCommand({
        type: "DEV_SCHEDULE_EVENT",
        dueDate: "2000-01-10",
        eventType: "B",
        priority: 20,
      }).ok,
    ).toBe(true);
    expect(
      sim.executeCommand({
        type: "DEV_SCHEDULE_EVENT",
        dueDate: "2000-01-10",
        eventType: "A",
        priority: 10,
      }).ok,
    ).toBe(true);
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const types = r.events.filter((e) => e.type === "A" || e.type === "B").map((e) => e.type);
    expect(types).toEqual(["A", "B"]);
  });

  it("pauses on a mid-month blocking event and resumes to the month target, not +1 month from pause", () => {
    const world = jsonClone(syntheticWorld());
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
    for (let i = 0; i < 9; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok && r.ok && !r.interrupt).toBe(true);
    }
    expect(sim.getSnapshot().currentDate).toBe("2028-10-01");
    expect(sim.getSnapshot().completedTurns).toBe(9);
    const paused = sim.executeCommand({ type: "ADVANCE_TURN" });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.interrupt?.code).toBe("BLOCKING_TEST");
    expect(paused.interrupt?.requiresResolution).toBe(false);
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.getSnapshot().completedTurns).toBe(9);
    expect(sim.getSnapshot().activeTurnTarget).toBe("2028-11-01");
    const resumeBare = sim.executeCommand({ type: "RESUME_TURN" });
    expect(resumeBare.ok).toBe(false);
    if (!resumeBare.ok) expect(resumeBare.error.code).toBe("ACK_REQUIRED");
    expect(sim.getSnapshot().currentDate).toBe("2028-10-14");
    expect(sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
    const resumed = sim.executeCommand({ type: "RESUME_TURN" });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(sim.getSnapshot().currentDate).toBe("2028-11-01");
    expect(sim.getSnapshot().completedTurns).toBe(10);
    expect(sim.getSnapshot().currentDate).not.toBe("2028-11-14");
  });

  it("rejects scheduling in the past and allows same-date events", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const past = sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "1999-12-31",
      eventType: "OLD",
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error.code).toBe("SCHEDULE_DATE_IN_PAST");
    const same = sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "2000-01-01",
      eventType: "TODAY",
    });
    expect(same.ok).toBe(true);
  });

  it("preserves scheduler order across save/load", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "2000-01-20",
      eventType: "Z",
      priority: 5,
    });
    sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "2000-01-20",
      eventType: "Y",
      priority: 5,
    });
    const save = sim.serializeSave();
    const b = restoreSimulation(save, syntheticWorld());
    const r = b.executeCommand({ type: "ADVANCE_TURN" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const types = r.events.filter((e) => e.type === "Z" || e.type === "Y").map((e) => e.type);
    expect(types).toEqual(["Z", "Y"]);
  });
});
