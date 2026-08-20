/**
 * Hands-off foreign-affairs calibration across multiple seeds.
 * Uses calibration-only month driver (bypasses unresolved domestic interrupts).
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
  type TerenaKernelInput,
} from "../packages/sim/src/index.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SEEDS = Number(process.env.FOREIGN_CAL_SEEDS ?? 20);
const YEARS = Number(process.env.FOREIGN_CAL_YEARS ?? 15);
const MONTHS = YEARS * 12;

type RunMetrics = {
  seed: string;
  monthsCompleted: number;
  crisesCreated: number;
  crisesSettled: number;
  conflictsStarted: number;
  conflictsEnded: number;
  terenaWars: number;
  vaskaraTerenaWars: number;
  greatPowerWars: number;
  sanctionsImposed: number;
  sanctionsLifted: number;
  treatiesProposed: number;
  treatiesRejected: number;
  treatiesActivated: number;
  leadershipChanges: number;
  aiActionsTowardTerena: number;
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

function isGreatPower(countryId: string, world: ReturnType<typeof loadTerenaWorld>): boolean {
  const tier = world.worldCountries[countryId]?.powerTier.toLowerCase() ?? "";
  return tier === "superpower" || tier === "great power";
}

function runSeed(seed: string, world: ReturnType<typeof loadTerenaWorld>): RunMetrics {
  const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed });
  const monthsCompleted = sim.advanceForeignCalibrationMonths(MONTHS);
  const snap = sim.getSnapshot();
  const runtime = snap.foreignAffairsRuntime;

  const crisesCreated = Object.values(runtime.crises).filter((c) => c.metadata.preexisting !== true);
  const crisesSettled = crisesCreated.filter((c) => c.stage === "settled").length;

  const conflictStartedEvents = snap.history.filter((e) => e.type === "INTERNATIONAL_CONFLICT_STARTED");
  const conflictEndedEvents = snap.history.filter((e) => e.type === "INTERNATIONAL_CONFLICT_ENDED");
  const conflictsStarted = conflictStartedEvents.length;
  const conflictsEnded = conflictEndedEvents.length;

  const terenaWarEvents = conflictStartedEvents.filter((e) =>
    (e.payload.belligerentIds as string[] | undefined)?.includes(TERENA_WORLD_ID) ??
    e.actorIds.includes(TERENA_WORLD_ID),
  );
  const vaskaraTerenaWarEvents = conflictStartedEvents.filter((e) => {
    const ids = new Set([...(e.actorIds ?? []), ...((e.payload.participantIds as string[]) ?? [])]);
    return ids.has("W40") && ids.has(TERENA_WORLD_ID);
  });

  const greatPowerWars = conflictStartedEvents.filter((e) =>
    e.actorIds.some((id) => isGreatPower(id, world)),
  ).length;

  const sanctionsImposed = snap.history.filter((e) => e.type === "SANCTIONS_IMPOSED").length;
  const sanctionsLifted = snap.history.filter((e) => e.type === "SANCTIONS_LIFTED").length;
  const treatiesProposed = snap.history.filter((e) => e.type === "TREATY_PROPOSED").length;
  const treatiesRejected = snap.history.filter((e) => e.type === "TREATY_REJECTED").length;
  const treatiesActivated = snap.history.filter((e) => e.type === "TREATY_RATIFIED").length;

  const leadershipChanges = snap.history.filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE").length;

  const aiActionsTowardTerena = Object.values(runtime.diplomaticActions).filter(
    (a) =>
      a.initiator === "ai" &&
      (a.targetCountryId === TERENA_WORLD_ID || a.actorCountryId === TERENA_WORLD_ID),
  ).length;

  let elevatedPostureMonths = 0;
  for (const event of snap.history) {
    if (event.type !== "MILITARY_POSTURE_CHANGED" && event.type !== "TERENA_POSTURE_CHANGED") {
      continue;
    }
    const posture = event.payload.posture;
    if (posture === "heightened" || posture === "mobilized" || posture === "crisis_deployment") {
      elevatedPostureMonths += 1;
    }
  }

  return {
    seed,
    monthsCompleted,
    crisesCreated: crisesCreated.length,
    crisesSettled,
    conflictsStarted,
    conflictsEnded,
    terenaWars: terenaWarEvents.length,
    vaskaraTerenaWars: vaskaraTerenaWarEvents.length,
    greatPowerWars,
    sanctionsImposed,
    sanctionsLifted,
    treatiesProposed,
    treatiesRejected,
    treatiesActivated,
    leadershipChanges,
    aiActionsTowardTerena,
    elevatedPostureMonths,
  };
}

function printSummary(label: string, values: number[]): void {
  const s = summarize(values);
  console.log(
    `  ${label.padEnd(32)} min=${s.min.toFixed(1)} p25=${s.p25.toFixed(1)} med=${s.median.toFixed(1)} p75=${s.p75.toFixed(1)} max=${s.max.toFixed(1)} mean=${s.mean.toFixed(2)}`,
  );
}

function main(): void {
  console.log(`Foreign affairs calibration: ${SEEDS} seeds × ${YEARS} years (${MONTHS} months)`);
  console.log(`Terena world id: ${TERENA_WORLD_ID}`);
  console.log(`Driver: foreign-calibration harness (domestic interrupts bypassed)\n`);
  const world = loadTerenaWorld();
  const runs: RunMetrics[] = [];
  for (let i = 0; i < SEEDS; i += 1) {
    const seed = `FOREIGN-CAL-${String(i + 1).padStart(2, "0")}`;
    runs.push(runSeed(seed, world));
  }

  console.log("Per-seed totals:");
  for (const run of runs) {
    console.log(
      `  ${run.seed}  mo=${run.monthsCompleted} crises=${run.crisesCreated} settled=${run.crisesSettled} wars=${run.conflictsStarted} ended=${run.conflictsEnded} terenaWars=${run.terenaWars} vaskW41=${run.vaskaraTerenaWars} gpWars=${run.greatPowerWars} sanctions=${run.sanctionsImposed}/${run.sanctionsLifted} treaties=${run.treatiesProposed}/${run.treatiesRejected}/${run.treatiesActivated} ai→W41=${run.aiActionsTowardTerena} leaders=${run.leadershipChanges}`,
    );
  }

  console.log("\nDistribution summary:");
  printSummary("months completed", runs.map((r) => r.monthsCompleted));
  printSummary("crises created", runs.map((r) => r.crisesCreated));
  printSummary("crises settled", runs.map((r) => r.crisesSettled));
  printSummary("conflicts started (ever)", runs.map((r) => r.conflictsStarted));
  printSummary("conflicts ended", runs.map((r) => r.conflictsEnded));
  printSummary("Terena wars (ever)", runs.map((r) => r.terenaWars));
  printSummary("Vaskara–Terena wars", runs.map((r) => r.vaskaraTerenaWars));
  printSummary("great-power wars", runs.map((r) => r.greatPowerWars));
  printSummary("sanctions imposed", runs.map((r) => r.sanctionsImposed));
  printSummary("sanctions lifted", runs.map((r) => r.sanctionsLifted));
  printSummary("treaties proposed", runs.map((r) => r.treatiesProposed));
  printSummary("treaties rejected", runs.map((r) => r.treatiesRejected));
  printSummary("treaties activated", runs.map((r) => r.treatiesActivated));
  printSummary("AI actions toward Terena", runs.map((r) => r.aiActionsTowardTerena));
  printSummary("leadership changes", runs.map((r) => r.leadershipChanges));
  printSummary("elevated posture signals", runs.map((r) => r.elevatedPostureMonths));

  const anyCrisis = runs.filter((r) => r.crisesCreated > 0).length;
  const anyWar = runs.filter((r) => r.conflictsStarted > 0).length;
  const anySanctionLift = runs.filter((r) => r.sanctionsLifted > 0).length;
  const anyAiTerena = runs.filter((r) => r.aiActionsTowardTerena > 0).length;
  console.log(`\nRuns with ≥1 emergent crisis: ${anyCrisis}/${SEEDS}`);
  console.log(`Runs with ≥1 conflict (ever): ${anyWar}/${SEEDS}`);
  console.log(`Runs with sanctions lifted: ${anySanctionLift}/${SEEDS}`);
  console.log(`Runs with foreign AI toward Terena: ${anyAiTerena}/${SEEDS}`);
  const incomplete = runs.filter((r) => r.monthsCompleted < MONTHS).length;
  if (incomplete > 0) {
    console.log(`\nWarning: ${incomplete}/${SEEDS} runs completed fewer than ${MONTHS} months.`);
  }
}

main();
