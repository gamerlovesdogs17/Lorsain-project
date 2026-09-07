import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { advanceIntegrated, loadTerenaWorld } from "./integration/harness.js";
import { ensureHistory15Runtime } from "./history15/state.js";
import { auditSimulationIntegrity, integrityErrorCount } from "./integrity/audit.js";
import type { SimState } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const outDir = resolve(repoRoot, "docs/qa/phase15");

type HorizonAudit = {
  seed: string;
  years: number;
  months: number;
  elapsedMs: number;
  saveBytes: number;
  electionsResolved: number;
  leadershipTransitions: number;
  lifecycleEvents: number;
  eras: number;
  governments: number;
  yearbooks: number;
  integrityErrors: number;
  foreignSalienceSamples: number;
};

function runHorizon(seed: string, years: number): HorizonAudit {
  const months = years * 12;
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const started = performance.now();
  for (let i = 0; i < months; i += 12) {
    advanceIntegrated(sim, Math.min(12, months - i));
  }
  const elapsedMs = performance.now() - started;
  const state = sim.getSnapshot() as SimState;
  const history15 = ensureHistory15Runtime(state);
  const saveBytes = JSON.stringify(sim.serializeSave()).length;
  const findings = auditSimulationIntegrity(world, state);

  const closedTenures = history15.tenures.filter((t) => t.end != null).length;
  const chairEvents = state.history.filter(
    (e) =>
      e.type === "PARTY_CHAIR_ELECTED" ||
      e.type === "PARTY_LEADERSHIP_CHANGED" ||
      e.type === "PARTY_LEADER_SET" ||
      e.type === "PARTY_LEADERSHIP_CONTEST_RESOLVED",
  ).length;
  const lifecycleEvents = state.history.filter(
    (e) =>
      e.type === "PARTY_LIFECYCLE_SPLIT" ||
      e.type === "PARTY_LIFECYCLE_MERGE" ||
      e.type === "PARTY_LIFECYCLE_FORMATION" ||
      e.type === "FACTION_SPLIT",
  ).length;

  let foreignSalienceSamples = 0;
  for (const party of Object.values(state.partyStates)) {
    const s = party.publicPlatform?.salience?.foreign_policy;
    if (typeof s === "number" && s > 0) foreignSalienceSamples += 1;
  }

  return {
    seed,
    years,
    months,
    elapsedMs,
    saveBytes,
    electionsResolved: Object.values(state.elections).filter((e) => e.status === "resolved").length,
    leadershipTransitions: Math.max(closedTenures, chairEvents),
    lifecycleEvents,
    eras: history15.eras.length,
    governments: history15.governments.length,
    yearbooks: history15.yearbooks.length,
    integrityErrors: integrityErrorCount(findings),
    foreignSalienceSamples,
  };
}

function assertHealthy(audit: HorizonAudit, years: number) {
  expect(audit.electionsResolved).toBeGreaterThan(0);
  expect(audit.eras).toBeGreaterThan(0);
  expect(audit.governments).toBeGreaterThan(0);
  expect(audit.yearbooks).toBeGreaterThan(0);
  expect(audit.leadershipTransitions).toBeGreaterThan(0);
  // Frozen world rejected: some leadership/activity over decades
  expect(audit.lifecycleEvents).toBeLessThanOrEqual(years <= 25 ? 40 : years <= 50 ? 80 : 160);
  expect(audit.integrityErrors).toBe(0);
}

/**
 * Phase 15 certification matrix: 3×25, 2×50, 1×100 years.
 * Integration-only; writes machine-readable audit JSON.
 */
describe("Phase 15 long-run certification matrix", () => {
  const audits: HorizonAudit[] = [];

  it(
    "3×25 year seeds stay active without chaos",
    () => {
      for (const seed of ["phase15-cert-25a", "phase15-cert-25b", "phase15-cert-25c"] as const) {
        const audit = runHorizon(seed, 25);
        assertHealthy(audit, 25);
        audits.push(audit);
      }
    },
    { timeout: 2_700_000 },
  );

  it(
    "2×50 year seeds stay coherent",
    () => {
      for (const seed of ["phase15-cert-50a", "phase15-cert-50b"] as const) {
        const audit = runHorizon(seed, 50);
        assertHealthy(audit, 50);
        audits.push(audit);
      }
    },
    { timeout: 3_600_000 },
  );

  it(
    "1×100 year seed completes with bounded churn",
    () => {
      const audit = runHorizon("phase15-cert-100a", 100);
      assertHealthy(audit, 100);
      audits.push(audit);
      mkdirSync(outDir, { recursive: true });
      const path = resolve(outDir, "longrun-audit.json");
      writeFileSync(
        path,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            matrix: "3x25 + 2x50 + 1x100",
            audits,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    },
    { timeout: 5_400_000 },
  );
});
