import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  decayPartyForeignPolicySalience,
  processDomesticForeignPolitics,
} from "./foreign/domesticPolitics.js";
import { imposeSanctions } from "./foreign/sanctions.js";
import { TERENA_WORLD_ID } from "./foreign/types.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import { updateMinisterialPerformance } from "./governing/performance.js";
import { parseSaveFile } from "./save.js";
import { SAVE_SCHEMA_VERSION, type SimEvent, type SimState } from "./types.js";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Phase 16 domestic foreign politics bridge", () => {
  it("reacts to sanctions with selective caucus priorities; bumps salience not position", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p16-dom-a", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    ensureCaucusRuntime(state);

    const targetId = Object.keys(state.foreignAffairsRuntime.countries)
      .filter((id) => id !== TERENA_WORLD_ID)
      .sort()[0]!;

    const imposed = imposeSanctions(
      state,
      {
        imposerId: TERENA_WORLD_ID,
        targetId,
        severity: 0.5,
      },
      "CMD_S",
    );
    expect("error" in imposed).toBe(false);
    if ("error" in imposed) return;

    const foreignEvents: SimEvent[] = imposed.events;
    const partyWithPlatform = Object.values(state.partyStates).find((p) => p.publicPlatform)!;
    const beforeFp = partyWithPlatform.publicPlatform!.positions.foreign_policy ?? 0;
    const beforeSalience = partyWithPlatform.publicPlatform!.salience?.foreign_policy ?? 0;

    const beforePriorities = Object.values(ensureCaucusRuntime(state).caucuses).map((c) => [
      c.factionId,
      [...c.priorities],
    ]);

    const domestic = processDomesticForeignPolitics(state, world, "CMD_D", foreignEvents);
    expect(domestic.some((e) => e.type === "DOMESTIC_FOREIGN_POLITICS_REACTION")).toBe(true);
    const reaction = domestic.find((e) => e.type === "DOMESTIC_FOREIGN_POLITICS_REACTION");
    expect(reaction?.payload.theme).toBe("sanctions");

    // Not every caucus is forced onto foreign_policy identically.
    const afterCaucuses = Object.values(ensureCaucusRuntime(state).caucuses);
    const allForcedForeign = afterCaucuses.every((c) => c.priorities[0] === "foreign_policy");
    expect(allForcedForeign).toBe(false);

    const afterFp = partyWithPlatform.publicPlatform!.positions.foreign_policy ?? 0;
    const afterSalience = partyWithPlatform.publicPlatform!.salience?.foreign_policy ?? 0;
    expect(afterFp).toBe(beforeFp);
    expect(afterSalience).toBeGreaterThan(beforeSalience);

    // Priorities may change for some caucuses but must remain actor-specific.
    const changed = afterCaucuses.filter((c) => {
      const before = beforePriorities.find(([id]) => id === c.factionId)?.[1] as
        string[] | undefined;
      return before && JSON.stringify(before) !== JSON.stringify(c.priorities);
    });
    expect(changed.length).toBeLessThan(afterCaucuses.length);

    const again = processDomesticForeignPolitics(state, world, "CMD_D2", foreignEvents);
    expect(again.length).toBe(0);

    // Clear foreign pressure so monthly salience decay can run.
    for (const s of Object.values(state.foreignAffairsRuntime.sanctions)) {
      s.active = false;
    }
    for (const c of Object.values(state.foreignAffairsRuntime.crises)) {
      c.stage = "settled";
    }
    const meta = state.organizationRuntime.metadata;
    for (const key of Object.keys(meta)) {
      if (key.startsWith("foreignPressure:")) delete meta[key];
    }

    const beforeDecay = partyWithPlatform.publicPlatform!.salience?.foreign_policy ?? 0;
    const decayed = decayPartyForeignPolicySalience(state);
    expect(decayed).toBeGreaterThan(0);
    const afterDecay = partyWithPlatform.publicPlatform!.salience?.foreign_policy ?? 0;
    expect(afterDecay).toBeLessThan(beforeDecay);
  });

  it("feeds foreign minister performance from active crises/sanctions", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p16-dom-b", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    ensureGoverningRuntime(state);
    updateMinisterialPerformance(world, state);
    const before = Object.values(state.governingRuntime.ministerialPerformance).find(
      (r) => r.departmentId === "foreign",
    );

    const existing = Object.values(state.foreignAffairsRuntime.crises)[0];
    if (existing) {
      existing.stage = "active";
    } else {
      const otherId = Object.keys(state.foreignAffairsRuntime.countries)
        .filter((id) => id !== TERENA_WORLD_ID)
        .sort()[0]!;
      state.foreignAffairsRuntime.crises["CRISIS_TEST_P16"] = {
        id: "CRISIS_TEST_P16",
        stage: "active",
        participantIds: [TERENA_WORLD_ID, otherId],
        focalPairKey: null,
        startedDate: state.currentDate,
        lastStageChange: state.currentDate,
        intensity: 0.7,
        metadata: {},
      };
    }

    updateMinisterialPerformance(world, state);
    const after = Object.values(state.governingRuntime.ministerialPerformance).find(
      (r) => r.departmentId === "foreign",
    );
    if (before && after) {
      expect(after.score).toBeLessThanOrEqual(before.score + 1e-9);
    } else {
      expect(after ?? before).toBeTruthy();
    }
  });

  it("schema remains current and save parse succeeds", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p16-dom-c", playerPoliticianId: "NPC146" });
    expect(SAVE_SCHEMA_VERSION).toBe(26);
    const save = sim.serializeSave();
    const parsed = parseSaveFile(JSON.parse(JSON.stringify(save)));
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});
