import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { currentPresidentialAuthorityId } from "./executive/state.js";
import { occupyingTerms } from "./offices.js";
import { CANONICAL_ASSEMBLY_ELECTION_ID } from "./elections/types.js";
import {
  advanceIntegrated,
  assertCatastrophicInvariants,
  expectOk,
  loadTerenaWorld,
  runDeterministicHorizon,
} from "./integration/harness.js";

describe("Phase 11.1 full-game integration", () => {
  it("reaches 2029 presidential transition with matching continuous/reload hashes", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-MP-2029" });
    const b = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-MP-2029" });

    advanceIntegrated(a, 18);
    expect(a.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const president = currentPresidentialAuthorityId(world, a.getSnapshot());
    expect(president).toBeTruthy();
    expect(president).not.toBe("NPC001");

    advanceIntegrated(b, 10);
    const mid = b.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(b.hashState());
    advanceIntegrated(b, 8);
    advanceIntegrated(restored, 8);
    expect(restored.hashState()).toBe(b.hashState());
    expect(a.hashState()).toBe(b.hashState());
    expect(assertCatastrophicInvariants(world, a.getSnapshot())).toEqual([]);
  }, 240_000);

  it("resolves the 2030 Assembly election and reseats 420 members", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-ASM-2030" });
    // 2028-01 → 2030-05 is 28 months; resolve presidential along the way.
    const hit = advanceIntegrated(sim, 40, "ASSEMBLY_ELECTION_DUE");
    expect(hit).toBe("ASSEMBLY_ELECTION_DUE");
    expect(sim.getSnapshot().currentDate).toBe("2030-05-12");
    expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    expectOk(sim, { type: "RESUME_TURN" });
    const election = sim.getSnapshot().elections[CANONICAL_ASSEMBLY_ELECTION_ID];
    expect(election?.status).toBe("resolved");
    expect(election?.winnerIds.length).toBe(420);

    // Advance through June 1 assumption.
    advanceIntegrated(sim, 2);
    expect(sim.getSnapshot().currentDate >= "2030-06-01").toBe(true);
    expect(currentAssemblyMemberIds(world, sim.getSnapshot())).toHaveLength(420);
    expect(occupyingTerms(sim.getSnapshot(), "OFFICE_SPEAKER").length).toBeGreaterThan(0);
    expect(assertCatastrophicInvariants(world, sim.getSnapshot())).toEqual([]);

    const save = sim.serializeSave();
    expect(restoreSimulation(save, world).hashState()).toBe(sim.hashState());
  }, 360_000);

  it("keeps Mara Velic playable after leaving the presidency", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "P11-MARA" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    advanceIntegrated(sim, 18);
    expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).not.toBe("NPC001");
    const appoint = sim.executeCommand({
      type: "ISSUE_REGULATION",
      ministryOfficeId: "OFFICE_MIN_FINANCE",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.1, fiscalImpact: null }],
    });
    expect(appoint.ok).toBe(false);
    // Former president can still advance time.
    expectOk(sim, { type: "ADVANCE_TURN" });
    expect(sim.getSnapshot().playerPoliticianId).toBe("NPC001");
    expect(assertCatastrophicInvariants(world, sim.getSnapshot())).toEqual([]);
  }, 240_000);

  it("matches deterministic multi-year hashes with checkpoint reloads (MP)", () => {
    const out = runDeterministicHorizon({
      playerPoliticianId: "NPC146",
      seed: "P11-DET-MP",
      months: 36,
      checkpoints: ["2028-07-01", "2028-10-14", "2029-01-20", "2030-07-01"],
    });
    expect(out.finalHash).toBe(out.reloadHash);
    expect(out.invariantFailures).toEqual([]);
    expect(out.dates.at(-1)! >= "2030-12-01").toBe(true);
  }, 480_000);

  it("records ordinary and assembly election resolve timings", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-PERF" });
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      advanceIntegrated(sim, 1);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    // Soft ceiling — document regressions without flaking on slow CI hosts.
    expect(median).toBeLessThan(5_000);
    console.log(
      JSON.stringify({
        phase11Perf: {
          ordinaryMedianMs: Math.round(median),
          ordinaryMaxMs: Math.round(samples[samples.length - 1]!),
        },
      }),
    );

    const asm = createSimulation({ world, playerPoliticianId: "NPC146", seed: "P11-PERF-ASM" });
    const hit = advanceIntegrated(asm, 40, "ASSEMBLY_ELECTION_DUE");
    expect(hit).toBe("ASSEMBLY_ELECTION_DUE");
    const t0 = performance.now();
    expectOk(asm, { type: "RESOLVE_ASSEMBLY_ELECTION" });
    const resolveMs = performance.now() - t0;
    expectOk(asm, { type: "RESUME_TURN" });
    expect(resolveMs).toBeLessThan(30_000);
    console.log(JSON.stringify({ phase11Perf: { assemblyResolveMs: Math.round(resolveMs) } }));
  }, 360_000);
});
