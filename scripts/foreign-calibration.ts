/**
 * Hands-off foreign-affairs calibration across multiple seeds.
 * Run: pnpm calibrate:foreign
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "../packages/content-loader/src/node.ts";
import {
  buildTerenaKernelWorld,
  createSimulation,
  TERENA_WORLD_ID,
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
  type Simulation,
  type TerenaKernelInput,
} from "../packages/sim/src/index.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SEEDS = 20;
const YEARS = 15;
const MONTHS = YEARS * 12;

type RunMetrics = {
  seed: string;
  monthsCompleted: number;
  crises: number;
  sanctions: number;
  treaties: number;
  wars: number;
  leadershipChanges: number;
  avgCrisisDurationMonths: number;
  elevatedPostureMonths: number;
};

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadTerenaWorld() {
  const bundle = loadContentBundleFromRepo(repoRoot);
  const input = {
    contentVersion: bundle.manifest.content_version,
    scenario: jsonClone(bundle.content.scenario),
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    offices: bundle.content.terena_offices.offices,
    constitution: jsonClone(bundle.content.terena_constitution),
    administrations: bundle.content.terena_presidential_administrations.administrations,
    ...terenaPartyFields({
      parties: bundle.content.terena_parties.parties,
      nominationRules: bundle.content.terena_nomination_rules.rules,
      provinceFeatures: bundle.content.terena_provinces.features,
      constituencyFeatures: bundle.content.terena_constituencies.features,
    }),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle),
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

function advanceHandsOff(sim: Simulation, n: number): number {
  let advanced = 0;
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (!r.interrupt) {
      advanced += 1;
      continue;
    }
    if (r.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") {
      const resolved = sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
      if (!resolved.ok) throw new Error(`RESOLVE failed: ${resolved.error.code}`);
      const resume = sim.executeCommand({ type: "RESUME_TURN" });
      if (!resume.ok) throw new Error(`RESUME failed: ${resume.error.code}`);
      advanced += 1;
      continue;
    }
    if (r.interrupt.code === "ASSEMBLY_ELECTION_DUE") {
      return advanced;
    }
    if (!r.interrupt.requiresResolution) {
      const ack = sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" });
      if (!ack.ok) throw new Error(`ACK failed: ${ack.error.code}`);
      const resume = sim.executeCommand({ type: "RESUME_TURN" });
      if (!resume.ok) throw new Error(`RESUME failed: ${resume.error.code}`);
      advanced += 1;
      continue;
    }
    if (r.interrupt.resolutionStatus === "resolved") {
      const resume = sim.executeCommand({ type: "RESUME_TURN" });
      if (!resume.ok) throw new Error(`RESUME failed: ${resume.error.code}`);
      advanced += 1;
      continue;
    }
    throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
  }
  return advanced;
}

function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

function summarize(values: number[]): {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
  const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  return {
    min: sorted[0] ?? 0,
    p25: pick(0.25),
    median: pick(0.5),
    p75: pick(0.75),
    max: sorted.at(-1) ?? 0,
    mean,
  };
}

function runSeed(seed: string, world: ReturnType<typeof loadTerenaWorld>): RunMetrics {
  const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed });
  const monthsCompleted = advanceHandsOff(sim, MONTHS);
  const snap = sim.getSnapshot();
  const runtime = snap.foreignAffairsRuntime;

  const crises = Object.values(runtime.crises).filter((c) => c.metadata.preexisting !== true);
  const sanctions = Object.values(runtime.sanctions);
  const treaties = Object.values(runtime.treaties).filter((t) => t.metadata.preexisting !== true);
  const wars = Object.values(runtime.conflicts).filter((c) => c.endedDate == null);
  const leadershipChanges = snap.history.filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE").length;

  const crisisDurations = crises.map((c) => {
    const end =
      c.stage === "settled" ? monthIndex(c.lastStageChange) : monthIndex(snap.currentDate);
    return Math.max(1, end - monthIndex(c.startedDate) + 1);
  });
  const avgCrisisDurationMonths =
    crisisDurations.length === 0
      ? 0
      : crisisDurations.reduce((a, b) => a + b, 0) / crisisDurations.length;

  let elevatedPostureMonths = 0;
  for (const event of snap.history) {
    if (event.type !== "MILITARY_POSTURE_CHANGED") continue;
    const posture = event.payload.posture;
    if (posture === "heightened" || posture === "mobilized" || posture === "crisis_deployment") {
      elevatedPostureMonths += 1;
    }
  }
  if (runtime.countries.W40?.posture !== "normal") {
    elevatedPostureMonths += 1;
  }

  return {
    seed,
    monthsCompleted,
    crises: crises.length,
    sanctions: sanctions.length,
    treaties: treaties.length,
    wars: wars.length,
    leadershipChanges,
    avgCrisisDurationMonths,
    elevatedPostureMonths,
  };
}

function printSummary(label: string, values: number[]): void {
  const s = summarize(values);
  console.log(
    `  ${label.padEnd(28)} min=${s.min.toFixed(1)} p25=${s.p25.toFixed(1)} med=${s.median.toFixed(1)} p75=${s.p75.toFixed(1)} max=${s.max.toFixed(1)} mean=${s.mean.toFixed(2)}`,
  );
}

function main(): void {
  console.log(`Foreign affairs calibration: ${SEEDS} seeds × ${YEARS} years (${MONTHS} months)`);
  console.log(`Terena world id: ${TERENA_WORLD_ID}\n`);
  const world = loadTerenaWorld();
  const runs: RunMetrics[] = [];
  for (let i = 0; i < SEEDS; i += 1) {
    const seed = `FOREIGN-CAL-${String(i + 1).padStart(2, "0")}`;
    runs.push(runSeed(seed, world));
  }

  console.log("Per-seed totals:");
  for (const run of runs) {
    console.log(
      `  ${run.seed}  months=${run.monthsCompleted} crises=${run.crises} sanctions=${run.sanctions} treaties=${run.treaties} wars=${run.wars} leaders=${run.leadershipChanges} avgCrisisMo=${run.avgCrisisDurationMonths.toFixed(1)} elevatedMo=${run.elevatedPostureMonths}`,
    );
  }

  console.log("\nDistribution summary:");
  printSummary("months completed", runs.map((r) => r.monthsCompleted));
  printSummary("crises", runs.map((r) => r.crises));
  printSummary("sanctions", runs.map((r) => r.sanctions));
  printSummary("treaties", runs.map((r) => r.treaties));
  printSummary("active wars (end)", runs.map((r) => r.wars));
  printSummary("leadership changes", runs.map((r) => r.leadershipChanges));
  printSummary("avg crisis duration (mo)", runs.map((r) => r.avgCrisisDurationMonths));
  printSummary("elevated posture signals", runs.map((r) => r.elevatedPostureMonths));

  const anyWar = runs.filter((r) => r.wars > 0).length;
  const anyCrisis = runs.filter((r) => r.crises > 0).length;
  console.log(`\nRuns with ≥1 non-preexisting crisis: ${anyCrisis}/${SEEDS}`);
  console.log(`Runs with active war at horizon: ${anyWar}/${SEEDS}`);
  const stoppedEarly = runs.filter((r) => r.monthsCompleted < MONTHS).length;
  if (stoppedEarly > 0) {
    console.log(
      `\nNote: ${stoppedEarly}/${SEEDS} runs stopped at ASSEMBLY_ELECTION_DUE (resolution not yet wired).`,
    );
  }
}

main();
