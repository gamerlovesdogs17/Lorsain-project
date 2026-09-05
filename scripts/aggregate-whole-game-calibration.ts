/** Aggregate resumable Phase 11.3 whole-game seed shards without running gameplay. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateRuns,
  calibrationSourceFingerprint,
  type RunTelemetry,
} from "./whole-game-calibration.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function numericFlag(name: string): number | null {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=", 2)[1];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function stringFlag(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

const months = Math.max(1, Math.floor(numericFlag("months") ?? 600));
const seedStart = Math.max(0, Math.floor(numericFlag("seed-start") ?? 0));
const seedCountRaw = numericFlag("seed-count");
const seedCount = seedCountRaw == null ? null : Math.max(1, Math.floor(seedCountRaw));
const shardDir = resolve(
  stringFlag("shard-dir") ?? join(repoRoot, ".calibration/phase11_3/shards", `${months}m`),
);
const outputPath = resolve(
  stringFlag("output") ?? join(repoRoot, "docs/qa/phase11_3/whole_game_calibration.json"),
);
const markdownPath = resolve(
  stringFlag("markdown") ?? join(repoRoot, "docs/qa/phase11_3/whole_game_calibration.md"),
);
const determinismInput = stringFlag("determinism-input");

type Shard = {
  formatVersion: number;
  sourceFingerprint: string;
  contentVersion: string;
  generatedAt: string;
  seedIndex: number;
  months: number;
  run: RunTelemetry;
};

function inRequestedRange(index: number): boolean {
  return index >= seedStart && (seedCount == null || index < seedStart + seedCount);
}

const shards = readdirSync(shardDir, { withFileTypes: true })
  .filter(
    (entry) => entry.isFile() && entry.name.endsWith(`-${String(months).padStart(3, "0")}m.json`),
  )
  .map((entry) => {
    const path = join(shardDir, entry.name);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Shard;
    return { path, parsed };
  })
  .filter(
    ({ parsed }) =>
      parsed.formatVersion === 1 && parsed.months === months && inRequestedRange(parsed.seedIndex),
  )
  .sort((a, b) => a.parsed.seedIndex - b.parsed.seedIndex);

const fingerprints = [...new Set(shards.map(({ parsed }) => parsed.sourceFingerprint))];
if (fingerprints.length > 1) {
  throw new Error(
    `Shard directory contains ${fingerprints.length} source revisions; rerun stale seeds before aggregating.`,
  );
}
if (fingerprints[0] && fingerprints[0] !== calibrationSourceFingerprint) {
  throw new Error(
    "Shard source fingerprint is stale; rerun these seeds against the current source before aggregating.",
  );
}

const contentVersions = [...new Set(shards.map(({ parsed }) => parsed.contentVersion))];
if (contentVersions.length > 1) {
  throw new Error(
    `Shard directory contains ${contentVersions.length} content versions; rerun stale seeds before aggregating.`,
  );
}

const seen = new Set<number>();
const runs: RunTelemetry[] = [];
for (const { parsed } of shards) {
  if (seen.has(parsed.seedIndex)) throw new Error(`Duplicate shard for seed ${parsed.seedIndex}`);
  seen.add(parsed.seedIndex);
  runs.push(parsed.run);
}

function summarizeValues(values: number[]) {
  if (values.length === 0) return { n: 0, min: 0, median: 0, p95: 0, max: 0, mean: 0, sum: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const pick = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))] ?? 0;
  return {
    n: sorted.length,
    min: sorted[0]!,
    median: pick(0.5),
    p95: pick(0.95),
    max: sorted.at(-1)!,
    mean: sum / sorted.length,
    sum,
  };
}

const baseAggregate = aggregateRuns(runs, months);
const aggregate = {
  ...baseAggregate,
  institutions: {
    ...baseAggregate.institutions,
    provincialBillsPassed: summarizeValues(
      runs.map((run) => run.institutions.provincialBillsPassed),
    ),
    partyContestsResolved: summarizeValues(
      runs.map((run) => run.institutions.partyContestsResolved),
    ),
    caucusContestsResolved: summarizeValues(
      runs.map((run) => run.institutions.caucusContestsResolved),
    ),
    constitutionalAssemblyPassed: summarizeValues(
      runs.map((run) => run.institutions.constitutionalAssemblyPassed),
    ),
    constitutionalFailed: summarizeValues(runs.map((run) => run.institutions.constitutionalFailed)),
    federalProvincialCases: summarizeValues(
      runs.map((run) => run.institutions.federalProvincialCases),
    ),
    organizationEndorsements: summarizeValues(
      runs.map((run) => run.institutions.organizationEndorsements),
    ),
  },
  careers: {
    sampleSize: summarizeValues(runs.map((run) => run.careers.sampleSize)),
    termsObserved: summarizeValues(runs.map((run) => run.careers.termsObserved)),
    transitions: summarizeValues(runs.map((run) => run.careers.transitions.length)),
  },
  performance: {
    ...baseAggregate.performance,
    maxTurnMs: summarizeValues(runs.map((run) => run.performance.maxTurnMs)),
  },
};
const expected = seedCount ?? runs.length;
const meta = {
  phase: "11.3",
  harness: "whole-game-calibration-aggregate",
  generatedAt: new Date().toISOString(),
  months,
  seedStart,
  seedCountRequested: seedCount,
  shardsFound: runs.length,
  complete: runs.length === expected,
  sourceFingerprint: fingerprints[0] ?? null,
  contentVersion: shards[0]?.parsed.contentVersion ?? null,
  shardDirectory: relative(repoRoot, shardDir).replace(/\\/g, "/"),
};
const payload = {
  meta,
  aggregate,
  determinism: determinismInput
    ? ((JSON.parse(readFileSync(resolve(determinismInput), "utf8")) as { determinism?: unknown })
        .determinism ?? null)
    : null,
  runIndex: shards.map(({ path, parsed }) => ({
    seed: parsed.run.seed,
    seedIndex: parsed.seedIndex,
    monthsCompleted: parsed.run.monthsCompleted,
    finalDate: parsed.run.finalDate,
    finalHash: parsed.run.finalHash,
    error: parsed.run.error,
    catastrophicFailureCount: parsed.run.catastrophicFailureCount,
    shard: relative(repoRoot, path).replace(/\\/g, "/"),
  })),
};

const markdown =
  `# Phase 11.3 whole-game calibration\n\n` +
  `Generated: ${meta.generatedAt}\n\n` +
  `Source fingerprint: \`${meta.sourceFingerprint ?? "none"}\`\n\n` +
  `## Completion and invariants\n\n` +
  `- Shards: ${runs.length}/${expected}\n` +
  `- Horizon: ${months} months per seed\n` +
  `- Completed without execution error: ${aggregate.runsCompleted}\n` +
  `- Runs with errors: ${aggregate.runsWithErrors}\n` +
  `- Catastrophic failures: ${aggregate.catastrophic.totalFailures}\n` +
  `- Candidate-shortage events: ${aggregate.institutions.candidateShortageEvents.sum}\n` +
  `- Minimum federal candidate surplus, minimum/median: ${aggregate.institutions.minimumFederalCandidateSurplus.min} / ${aggregate.institutions.minimumFederalCandidateSurplus.median}\n\n` +
  `## Political recruitment and careers\n\n` +
  `- Median provincial politicians persisted/generated: ${aggregate.institutions.provincialLegislators.median} / ${aggregate.institutions.provincialLegislatorsGenerated.median}\n` +
  `- Median Provincial-to-national promotions: ${aggregate.institutions.provincialPromotions.median}\n` +
  `- Median generated national politicians: ${aggregate.institutions.generatedNationalPoliticians.median}\n` +
  `- Median federal Assembly candidates in archived races: ${aggregate.institutions.federalAssemblyCandidates.median}\n` +
  `- Median active original politicians / mean active political age: ${aggregate.institutions.activeOriginalPoliticians.median} / ${aggregate.institutions.meanActivePoliticalAge.median.toFixed(1)}\n` +
  `- Median NPC retirements / deaths: ${aggregate.institutions.politiciansRetired.median} / ${aggregate.institutions.politiciansDied.median}\n\n` +
  `## Provincial politics\n\n` +
  `- Median Provincial Assembly elections / leadership elections: ${aggregate.institutions.provincialElections.median} / ${aggregate.institutions.provincialLeadershipElections.median}\n` +
  `- Median bills introduced / passed: ${aggregate.institutions.provincialBillsIntroduced.median} / ${aggregate.institutions.provincialBillsPassed.median}\n` +
  `- Median signed / vetoed / overridden: ${aggregate.institutions.provincialBillsSigned.median} / ${aggregate.institutions.provincialVetoes.median} / ${aggregate.institutions.provincialOverrides.median}\n` +
  `- Median cross-party passes / mean party cohesion: ${aggregate.institutions.provincialCrossPartyPasses.median} / ${aggregate.institutions.provincialMeanPartyCohesion.median.toFixed(3)}\n` +
  `- Median divided-government bills signed / vetoed: ${aggregate.institutions.provincialDividedGovernmentSigned.median} / ${aggregate.institutions.provincialDividedGovernmentVetoed.median}\n` +
  `- Median provincial leadership turnover: ${aggregate.institutions.provincialLeadershipTurnover.median}\n\n` +
  `## Party and constitutional politics\n\n` +
  `- Median party / faction / Assembly-caucus contests: ${aggregate.institutions.partyLeadershipContests.median} / ${aggregate.institutions.factionChairContests.median} / ${aggregate.institutions.caucusContests.median}\n` +
  `- Median constitutional proposals / federal passage / adoption / failure: ${aggregate.institutions.constitutionalProposed.median} / ${aggregate.institutions.constitutionalAssemblyPassed.median} / ${aggregate.institutions.constitutionalRatified.median} / ${aggregate.institutions.constitutionalFailed.median}\n` +
  `- Constitutional proposal types: ${JSON.stringify(aggregate.institutions.constitutionalByRule)}\n` +
  `- Constitutional triggers: ${JSON.stringify(aggregate.institutions.constitutionalByTrigger)}\n\n` +
  `## Federal legislature and organizations\n\n` +
  `- Median federal bills introduced/enacted/returned: ${aggregate.legislative.billsIntroduced.median} / ${aggregate.legislative.billsEnactedOrSigned.median} / ${aggregate.legislative.billsReturnedByPresident.median}\n` +
  `- Median federal amendments proposed/adopted and cross-party passes: ${aggregate.legislative.amendmentsProposed.median} / ${aggregate.legislative.amendmentsAdopted.median} / ${aggregate.legislative.crossPartyFloorPasses.median}\n` +
  `- Median federal party cohesion / whip compliance: ${aggregate.legislative.meanPartyCohesion.median.toFixed(3)} / ${aggregate.legislative.meanWhipCompliance.median.toFixed(3)}\n` +
  `- Median organization actions / relationships / bill positions: ${aggregate.institutions.organizationActions.median} / ${aggregate.institutions.organizationRelationships.median} / ${aggregate.institutions.organizationBillPositions.median}\n` +
  `- Median organization meetings / policy talks / endorsements / withdrawals: ${aggregate.institutions.organizationMeetings.median} / ${aggregate.institutions.organizationPolicyTalks.median} / ${aggregate.institutions.organizationEndorsements.median} / ${aggregate.institutions.organizationEndorsementWithdrawals.median}\n\n` +
  `## Economy, foreign affairs, and performance\n\n` +
  `- Median output-index delta / sign changes / direction changes: ${aggregate.economy.outputDelta.median.toFixed(2)} / ${aggregate.economy.meanOutputSignChanges.median} / ${aggregate.economy.meanOutputDirectionChanges.median}\n` +
  `- Median provincial rank churn / ending spread / largest spread: ${aggregate.regionalEconomy.rankingChurn.median.toFixed(3)} / ${aggregate.regionalEconomy.endSpread.median.toFixed(2)} / ${aggregate.regionalEconomy.largestSpread.median.toFixed(2)}\n` +
  `- Median crises created / conflicts started / treaties ratified: ${aggregate.foreign.crisesCreated.median} / ${aggregate.foreign.conflictsStarted.median} / ${aggregate.foreign.treatiesRatified.median}\n` +
  `- Median turn / p95 turn / maximum observed: ${aggregate.performance.medianTurnMs.median.toFixed(2)} ms / ${aggregate.performance.p95TurnMs.median.toFixed(2)} ms / ${aggregate.performance.maxTurnMs.max.toFixed(2)} ms\n` +
  `- Median final save: ${aggregate.saveGrowth.finalBytes.median} bytes\n\n` +
  (payload.determinism
    ? `## Determinism\n\n\`${JSON.stringify(payload.determinism)}\`\n`
    : `Determinism is intentionally run by the gameplay harness, not inferred from shards. Supply its compact output with \`--determinism-input\` to include it here.\n`);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, markdown, "utf8");

console.log(`Aggregated ${runs.length}/${expected} shards from ${shardDir}`);
console.log(`Wrote ${outputPath}`);
console.log(`Wrote ${markdownPath}`);

if (process.argv.includes("--require-complete") && runs.length !== expected) {
  process.exitCode = 2;
}
