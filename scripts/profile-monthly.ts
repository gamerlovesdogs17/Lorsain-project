import { createSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";

const timings: Record<string, number[]> = {};
(globalThis as typeof globalThis & { __lorsainStageTimings?: Record<string, number[]> }).__lorsainStageTimings = timings;
const world = loadTerenaWorld();
const seed = process.argv[3] ?? process.env.LORSAIN_PROFILE_SEED ?? "P113-PROFILE";
const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed });
const months = Number(process.argv[2] ?? process.env.LORSAIN_PROFILE_MONTHS ?? 12);
for (let month = 0; month < months; month += 1) {
  advanceIntegrated(sim, 1);
  if ((month + 1) % 12 !== 0 && month + 1 !== months) continue;
  const rows = Object.entries(timings).map(([stage, samples]) => ({ stage, totalMs: samples.reduce((sum, value) => sum + value, 0), meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length, maxMs: Math.max(...samples), samples: samples.length })).sort((a, b) => b.totalMs - a.totalMs);
  console.log(`\nmonth ${month + 1} · ${sim.getSnapshot().currentDate}`);
  for (const row of rows.slice(0, 12)) console.log(`${row.stage.padEnd(28)} total=${row.totalMs.toFixed(1)} mean=${row.meanMs.toFixed(1)} max=${row.maxMs.toFixed(1)} n=${row.samples}`);
  for (const key of Object.keys(timings)) timings[key] = [];
}
