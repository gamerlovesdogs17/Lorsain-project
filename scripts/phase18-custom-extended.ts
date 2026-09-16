/**
 * Phase 18B–D extended custom-world runs (not part of default CI).
 *
 *   pnpm exec tsx scripts/phase18-custom-extended.ts
 *   pnpm exec tsx scripts/phase18-custom-extended.ts --years=5
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importScenarioJson } from "../packages/scenario/src/index.ts";
import { createSimulation } from "../packages/sim/src/engine.ts";
import { auditSimulationIntegrity } from "../packages/sim/src/integrity/audit.ts";
import { buildKernelWorldFromScenarioDocument } from "../packages/sim/src/scenario/kernelBridge.ts";
import { advanceIntegrated } from "../packages/sim/src/integration/harness.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const fixturesDir = resolve(repoRoot, "docs/qa/phase18/fixtures");
const outPath = resolve(repoRoot, "docs/qa/phase18/extended-custom-summary.json");

const WORLDS = [
  { label: "aster", file: "aster-custom.lorsain.json", seed: "P18-EXT-ASTER" },
  { label: "brinor", file: "brinor-custom.lorsain.json", seed: "P18-EXT-BRINOR" },
] as const;

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function resolveCommitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function runWorld(label: string, fixtureFile: string, seed: string, years: number) {
  const path = resolve(fixturesDir, fixtureFile);
  const imported = importScenarioJson(readFileSync(path, "utf8"));
  if (!imported.ok) throw new Error(`${label}: ${imported.error}`);
  const world = buildKernelWorldFromScenarioDocument(imported.document);
  const player =
    world.politicians.find((p) => p.id.startsWith("NPC_ASM"))?.id ??
    world.politicians[0]?.id ??
    "NPC_PLAYER";
  const started = Date.now();
  const sim = createSimulation({ world, playerPoliticianId: player, seed });
  const startDate = sim.getSnapshot().currentDate;
  advanceIntegrated(sim, years * 12);
  const snap = sim.getSnapshot();
  const auditErrors = auditSimulationIntegrity(world, snap).filter((f) => f.severity === "error");
  return {
    label,
    scenarioId: world.scenarioId,
    seed,
    years,
    startDate,
    endDate: snap.currentDate,
    completedTurns: snap.completedTurns,
    presidentialElectionsResolved: Object.values(snap.elections).filter(
      (e) => e.type === "presidential" && e.status === "resolved",
    ).length,
    assemblyElectionsResolved: Object.values(snap.elections).filter(
      (e) => e.type === "assembly" && e.status === "resolved",
    ).length,
    auditErrorCount: auditErrors.length,
    auditErrors: auditErrors.slice(0, 8),
    elapsedMs: Date.now() - started,
  };
}

const years = numericFlag("years", 5);
const results = WORLDS.map((w) => runWorld(w.label, w.file, w.seed, years));

const summary = {
  generatedAt: new Date().toISOString(),
  commitSha: resolveCommitSha(),
  years,
  worlds: results,
};

mkdirSync(resolve(repoRoot, "docs/qa/phase18"), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
for (const r of results) {
  console.log(
    `${r.label}: ${r.startDate} → ${r.endDate}, pres=${r.presidentialElectionsResolved}, asm=${r.assemblyElectionsResolved}, auditErrors=${r.auditErrorCount}`,
  );
}
if (results.some((r) => r.auditErrorCount > 0)) {
  process.exitCode = 1;
}
