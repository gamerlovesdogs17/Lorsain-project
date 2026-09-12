/**
 * Short world smoke for Normal Push CI (Tier 1).
 * Default: 5 simulated years (~2 minutes). Catastrophic-breakage detection —
 * not long-run certification (see Extended / Release workflows).
 *
 * Note: a 2-year horizon can stop mid assembly-field build and currently
 * surfaces NOMINATION_DUPLICATE_CANDIDATE integrity errors on some seeds;
 * 5y reaches a clean post-election state for the stable smoke seed.
 *
 * Usage:
 *   node .../tsx scripts/phase15-smoke-world.ts
 *   node .../tsx scripts/phase15-smoke-world.ts --years=5
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation, restoreSimulation } from "../packages/sim/src/engine.ts";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.ts";
import {
  auditSimulationIntegrity,
  integrityErrorCount,
} from "../packages/sim/src/integrity/audit.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const yearsArg = process.argv.find((a) => a.startsWith("--years="));
const years = Math.max(1, Math.min(10, Number(yearsArg?.split("=")[1] ?? 5) || 5));
const months = years * 12;
/** Stable seed across horizons so Tier-1 smoke does not thrash on year-arg naming. */
const seed = "phase15-smoke";

const started = Date.now();
const world = loadTerenaWorld();
const sim = createSimulation({
  world,
  seed,
  playerPoliticianId: "NPC146",
});
const startDate = sim.getSnapshot().currentDate;
advanceIntegrated(sim, months);
const state = sim.getSnapshot();
const save = sim.serializeSave();
const round = restoreSimulation(save, world);
const hashOk = round.hashState() === sim.hashState();

const findings = auditSimulationIntegrity(world, state);
const errors = integrityErrorCount(findings);
const elapsedMs = Date.now() - started;

const activeGovernors = Object.values(state.officeTerms).filter((t) => {
  if (t.status !== "active" && t.status !== "suspended") return false;
  return world.offices[t.officeId]?.kind === "governor";
}).length;

const electionsResolved = Object.values(state.elections).filter(
  (e) => e.status === "resolved",
).length;

const audit = {
  kind: "tier1_smoke",
  seed,
  years,
  months,
  startingDate: startDate,
  endingDate: state.currentDate,
  elapsedMs,
  saveBytes: JSON.stringify(save).length,
  politicians: Object.keys(state.politicians).length,
  activeGovernors,
  electionsResolved,
  integrityErrors: errors,
  integritySample: findings.filter((f) => f.severity === "error").slice(0, 12),
  saveRestoreHashMatch: hashOk,
  result: errors === 0 && hashOk && electionsResolved > 0 ? "pass" : "fail",
};

const outDir = resolve(repoRoot, "docs/qa/phase15");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "smoke-audit.json"), JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
if (audit.result !== "pass") {
  console.error("[smoke] FAILED");
  process.exit(1);
}
console.error(`[smoke] OK ${years}y in ${(elapsedMs / 1000).toFixed(1)}s`);
