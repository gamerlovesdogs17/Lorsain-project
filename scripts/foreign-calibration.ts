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
  conflictsActiveAtHorizon: number;
  terenaWars: number;
  vaskaraTerenaWars: number;
  greatPowerWars: number;
  sanctionsImposed: number;
  sanctionsLifted: number;
  treatiesTotal: number;
  treatiesActive: number;
  treatiesUniqueActive: number;
  treatiesDuplicateActive: number;
  treatiesMaxDuplicate: number;
  treatiesTerminated: number;
  treatiesSuspended: number;
  treatiesProposed: number;
  treatiesRejected: number;
  treatiesActivated: number;
  leadershipChanges: number;
  leadershipSameName: number;
  leadershipMaxOnOneDate: number;
  leadershipUniqueDates: number;
  leadershipDemocratic: number;
  leadershipAuthoritarian: number;
  leadershipMonarchTitle: number;
  waActions: number;
  waVetoes: number;
  ltoFiled: number;
  ltoSettled: number;
  ltoFailed: number;
  dcConsultations: number;
  cscActions: number;
  nafMediations: number;
  warTriggers: number;
  npcWarInvocations: number;
  assemblyWarAuth: number;
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

function treatyIdentityKey(kind: string, members: string[]): string {
  return `${kind}|${[...members].sort().join(",")}`;
}

function runSeed(seed: string, world: ReturnType<typeof loadTerenaWorld>): RunMetrics {
  const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed });
  const monthsCompleted = sim.advanceForeignCalibrationMonths(MONTHS);
  const snap = sim.getSnapshot();
  const runtime = snap.foreignAffairsRuntime;

  const crisesCreated = Object.values(runtime.crises).filter(
    (c) => c.metadata.preexisting !== true,
  );
  const crisesSettled = crisesCreated.filter((c) => c.stage === "settled").length;

  const conflictStartedEvents = snap.history.filter(
    (e) => e.type === "INTERNATIONAL_CONFLICT_STARTED",
  );
  const conflictEndedEvents = snap.history.filter((e) => e.type === "INTERNATIONAL_CONFLICT_ENDED");
  const conflictsStarted = conflictStartedEvents.length;
  const conflictsEnded = conflictEndedEvents.length;
  const conflictsActiveAtHorizon = Object.values(runtime.conflicts).filter(
    (c) => !c.endedDate,
  ).length;

  const terenaWarEvents = conflictStartedEvents.filter(
    (e) =>
      ((e.payload.belligerentIds as string[] | undefined)?.includes(TERENA_WORLD_ID) ?? false) ||
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

  const treaties = Object.values(runtime.treaties);
  const active = treaties.filter((t) => t.status === "active");
  const activeKeys = new Map<string, number>();
  for (const t of active) {
    const key = treatyIdentityKey(t.kind, t.memberIds);
    activeKeys.set(key, (activeKeys.get(key) ?? 0) + 1);
  }
  const duplicateCounts = [...activeKeys.values()].filter((n) => n > 1);
  const treatiesDuplicateActive = duplicateCounts.reduce((a, b) => a + (b - 1), 0);
  const treatiesMaxDuplicate = Math.max(1, ...activeKeys.values(), 1);

  const leadershipEvents = snap.history.filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE");
  const byDate = new Map<string, number>();
  let sameName = 0;
  let democratic = 0;
  let authoritarian = 0;
  let monarchTitle = 0;
  for (const e of leadershipEvents) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1);
    const countryId = String(e.payload.countryId ?? "");
    const name = String(e.payload.name ?? "");
    const gov = world.worldCountries[countryId]?.government ?? "";
    if (/managed|theocracy|empire|one-party|military/i.test(gov)) authoritarian += 1;
    else democratic += 1;
    const title = String(e.payload.title ?? "");
    if (
      /king|queen|emperor|duke|prince/i.test(title) ||
      /king|queen|emperor|duke|prince/i.test(name)
    ) {
      monarchTitle += 1;
    }
    const prior = leadershipEvents.find(
      (p) =>
        p.payload.countryId === countryId && p.date < e.date && String(p.payload.name) === name,
    );
    if (prior) sameName += 1;
  }
  // Prefer explicit same-name detection against previous leader name in payload when available.
  sameName = 0;
  const lastNameByCountry = new Map<string, string>();
  for (const e of [...leadershipEvents].sort((a, b) => a.date.localeCompare(b.date))) {
    const countryId = String(e.payload.countryId ?? "");
    const name = String(e.payload.name ?? "");
    const prev = lastNameByCountry.get(countryId);
    if (prev && prev === name) sameName += 1;
    lastNameByCountry.set(countryId, name);
  }

  const waActions = snap.history.filter((e) => e.type === "WORLD_ASSEMBLY_ACTION").length;
  const waVetoes = snap.history.filter(
    (e) => e.type === "WORLD_ASSEMBLY_ACTION" && e.payload.vetoBlocked === true,
  ).length;
  const ltoFiled = snap.history.filter((e) => e.type === "LTO_DISPUTE_FILED").length;
  const ltoSettled = Object.values(runtime.institutionRuntime.ltoDisputes).filter(
    (d) => d.stage === "settled",
  ).length;
  const ltoFailed = Object.values(runtime.institutionRuntime.ltoDisputes).filter(
    (d) => d.stage === "failed",
  ).length;
  const dcConsultations = snap.history.filter((e) => e.type === "ALLIANCE_CONSULTATION").length;
  const cscActions = snap.history.filter((e) => e.type === "CSC_DIPLOMATIC_ACTION").length;
  const nafMediations = snap.history.filter((e) => e.type === "NAF_MEDIATION").length;
  const warTriggers = snap.history.filter((e) => e.type === "WAR_POWERS_BEGUN").length;
  const npcWarInvocations = warTriggers; // calibration player is MP; presidential invocations are NPC
  const assemblyWarAuth = snap.history.filter(
    (e) => e.type === "ASSEMBLY_MOTION_INTRODUCED" && e.payload.kind === "war_authorization",
  ).length;

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
    conflictsActiveAtHorizon,
    terenaWars: terenaWarEvents.length,
    vaskaraTerenaWars: vaskaraTerenaWarEvents.length,
    greatPowerWars,
    sanctionsImposed,
    sanctionsLifted,
    treatiesTotal: treaties.length,
    treatiesActive: active.length,
    treatiesUniqueActive: activeKeys.size,
    treatiesDuplicateActive,
    treatiesMaxDuplicate:
      treatiesMaxDuplicate === 1 && active.length === 0 ? 0 : treatiesMaxDuplicate,
    treatiesTerminated: treaties.filter((t) => t.status === "terminated").length,
    treatiesSuspended: treaties.filter((t) => t.status === "suspended").length,
    treatiesProposed,
    treatiesRejected,
    treatiesActivated,
    leadershipChanges: leadershipEvents.length,
    leadershipSameName: sameName,
    leadershipMaxOnOneDate: Math.max(0, ...byDate.values(), 0),
    leadershipUniqueDates: byDate.size,
    leadershipDemocratic: democratic,
    leadershipAuthoritarian: authoritarian,
    leadershipMonarchTitle: monarchTitle,
    waActions,
    waVetoes,
    ltoFiled,
    ltoSettled,
    ltoFailed,
    dcConsultations,
    cscActions,
    nafMediations,
    warTriggers,
    npcWarInvocations,
    assemblyWarAuth,
    aiActionsTowardTerena,
    elevatedPostureMonths,
  };
}

function printSummary(label: string, values: number[]): void {
  const s = summarize(values);
  console.log(
    `  ${label.padEnd(36)} min=${s.min.toFixed(1)} p25=${s.p25.toFixed(1)} med=${s.median.toFixed(1)} p75=${s.p75.toFixed(1)} max=${s.max.toFixed(1)} mean=${s.mean.toFixed(2)}`,
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
      `  ${run.seed} treaties=${run.treatiesTotal}/${run.treatiesActive} uniq=${run.treatiesUniqueActive} dup=${run.treatiesDuplicateActive} maxDup=${run.treatiesMaxDuplicate} leaders=${run.leadershipChanges} sameName=${run.leadershipSameName} maxLeadDay=${run.leadershipMaxOnOneDate} LTO=${run.ltoFiled}/${run.ltoSettled}/${run.ltoFailed} WA=${run.waActions}/veto=${run.waVetoes} wars=${run.conflictsStarted}/${run.conflictsEnded}/active=${run.conflictsActiveAtHorizon} warAuth=${run.assemblyWarAuth}`,
    );
  }

  console.log("\nDistribution summary:");
  printSummary(
    "months completed",
    runs.map((r) => r.monthsCompleted),
  );
  printSummary(
    "crises created",
    runs.map((r) => r.crisesCreated),
  );
  printSummary(
    "crises settled",
    runs.map((r) => r.crisesSettled),
  );
  printSummary(
    "conflicts started",
    runs.map((r) => r.conflictsStarted),
  );
  printSummary(
    "conflicts ended",
    runs.map((r) => r.conflictsEnded),
  );
  printSummary(
    "conflicts active @ horizon",
    runs.map((r) => r.conflictsActiveAtHorizon),
  );
  printSummary(
    "Terena wars",
    runs.map((r) => r.terenaWars),
  );
  printSummary(
    "Vaskara–Terena wars",
    runs.map((r) => r.vaskaraTerenaWars),
  );
  printSummary(
    "great-power wars",
    runs.map((r) => r.greatPowerWars),
  );
  printSummary(
    "sanctions imposed",
    runs.map((r) => r.sanctionsImposed),
  );
  printSummary(
    "sanctions lifted",
    runs.map((r) => r.sanctionsLifted),
  );
  printSummary(
    "treaties total",
    runs.map((r) => r.treatiesTotal),
  );
  printSummary(
    "treaties active",
    runs.map((r) => r.treatiesActive),
  );
  printSummary(
    "treaties unique active",
    runs.map((r) => r.treatiesUniqueActive),
  );
  printSummary(
    "treaties duplicate active",
    runs.map((r) => r.treatiesDuplicateActive),
  );
  printSummary(
    "treaties max duplicate",
    runs.map((r) => r.treatiesMaxDuplicate),
  );
  printSummary(
    "treaties terminated",
    runs.map((r) => r.treatiesTerminated),
  );
  printSummary(
    "treaties suspended",
    runs.map((r) => r.treatiesSuspended),
  );
  printSummary(
    "treaties proposed",
    runs.map((r) => r.treatiesProposed),
  );
  printSummary(
    "treaties rejected",
    runs.map((r) => r.treatiesRejected),
  );
  printSummary(
    "treaties activated",
    runs.map((r) => r.treatiesActivated),
  );
  printSummary(
    "leadership changes",
    runs.map((r) => r.leadershipChanges),
  );
  printSummary(
    "leadership same-name",
    runs.map((r) => r.leadershipSameName),
  );
  printSummary(
    "leadership max on one date",
    runs.map((r) => r.leadershipMaxOnOneDate),
  );
  printSummary(
    "leadership unique dates",
    runs.map((r) => r.leadershipUniqueDates),
  );
  printSummary(
    "WA actions",
    runs.map((r) => r.waActions),
  );
  printSummary(
    "WA vetoes",
    runs.map((r) => r.waVetoes),
  );
  printSummary(
    "LTO disputes filed",
    runs.map((r) => r.ltoFiled),
  );
  printSummary(
    "LTO settled",
    runs.map((r) => r.ltoSettled),
  );
  printSummary(
    "LTO failed",
    runs.map((r) => r.ltoFailed),
  );
  printSummary(
    "DC consultations",
    runs.map((r) => r.dcConsultations),
  );
  printSummary(
    "CSC actions",
    runs.map((r) => r.cscActions),
  );
  printSummary(
    "NAF mediations",
    runs.map((r) => r.nafMediations),
  );
  printSummary(
    "war-power begun",
    runs.map((r) => r.warTriggers),
  );
  printSummary(
    "Assembly war auth motions",
    runs.map((r) => r.assemblyWarAuth),
  );
  printSummary(
    "AI actions toward Terena",
    runs.map((r) => r.aiActionsTowardTerena),
  );
  printSummary(
    "elevated posture signals",
    runs.map((r) => r.elevatedPostureMonths),
  );

  console.log(`\nRuns with LTO disputes: ${runs.filter((r) => r.ltoFiled > 0).length}/${SEEDS}`);
  console.log(
    `Runs with zero active treaty duplicates: ${runs.filter((r) => r.treatiesDuplicateActive === 0).length}/${SEEDS}`,
  );
  console.log(
    `Runs with zero same-name replacements: ${runs.filter((r) => r.leadershipSameName === 0).length}/${SEEDS}`,
  );
  console.log(
    `Max leadership on one date across runs: ${Math.max(...runs.map((r) => r.leadershipMaxOnOneDate))}`,
  );
  const incomplete = runs.filter((r) => r.monthsCompleted < MONTHS).length;
  if (incomplete > 0) {
    console.log(`\nWarning: ${incomplete}/${SEEDS} runs completed fewer than ${MONTHS} months.`);
  }
}

main();
