/**
 * Phase 17C — multi-seed runtime balance / repetition measurement.
 *
 * Default authoritative matrix: 3 seeds × 10 years → docs/qa/phase17c/final/
 * Tuning experiments: --outdir=tuning (or seed-prefix containing "tune")
 *
 * Usage:
 *   node .../tsx scripts/phase17c-balance-run.ts --run-id=phase17c-final-YYYYMMDD
 *   node .../tsx scripts/phase17c-balance-run.ts --aggregate --run-id=... --years=10 --expected-seeds=3
 *   node .../tsx scripts/phase17c-balance-run.ts --seeds=3 --years=5 --outdir=tuning --seed-prefix=phase17c-tune
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeBalanceReport,
  formatRuntimeBalanceMarkdownSummary,
  type CountRow,
  type RuntimeBalanceReport,
} from "../packages/sim/src/balance/runtimeReport.ts";
import { createSimulation } from "../packages/sim/src/engine.ts";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.ts";
import type { SimState } from "../packages/sim/src/types.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const baseOutDir = resolve(repoRoot, "docs/qa/phase17c");
const PLAYER_ID = "NPC146";

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function stringFlag(name: string, fallback: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1] ?? fallback;
}

function seedName(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, "0")}`;
}

function resolveCommitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function resolveOutDirs(outdirKind: string): { outDir: string; seedDir: string } {
  const kind = outdirKind === "tuning" ? "tuning" : outdirKind === "final" ? "final" : outdirKind;
  const outDir = resolve(baseOutDir, kind);
  return { outDir, seedDir: resolve(outDir, "seeds") };
}

export function runSingleSeed(
  seed: string,
  years: number,
  metaExtras: {
    runId: string;
    matrix: string;
    commitSha: string;
  },
): RuntimeBalanceReport {
  const months = years * 12;
  const world = loadTerenaWorld();
  const started = Date.now();
  const sim = createSimulation({
    world,
    seed,
    playerPoliticianId: PLAYER_ID,
  });
  const startingDate = sim.getSnapshot().currentDate;
  advanceIntegrated(sim, months);
  const state = sim.getSnapshot() as SimState;
  return buildRuntimeBalanceReport(world, state, {
    seed,
    monthsAdvanced: months,
    startingDate,
    endingDate: state.currentDate,
    elapsedMs: Date.now() - started,
    runId: metaExtras.runId,
    matrix: metaExtras.matrix,
    years,
    commitSha: metaExtras.commitSha,
  });
}

function writeSeedReport(seedDir: string, report: RuntimeBalanceReport): void {
  mkdirSync(seedDir, { recursive: true });
  const path = resolve(seedDir, `${report.meta.seed}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function rollupFlags(reports: RuntimeBalanceReport[]): CountRow[] {
  const map = new Map<string, number>();
  for (const rep of reports) {
    for (const flag of rep.diagnosticFlags) {
      map.set(flag.code, (map.get(flag.code) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function aggregateSeedReports(
  reports: RuntimeBalanceReport[],
  years: number,
  runId: string,
): { json: Record<string, unknown>; markdown: string } {
  const flagRollup = rollupFlags(reports);
  const json = {
    schema: "phase17c-runtime-balance-aggregate/v1",
    generatedAt: new Date().toISOString(),
    runId,
    matrix: `${reports.length}x${years}`,
    seedCount: reports.length,
    years,
    commitSha: reports[0]?.meta.commitSha ?? resolveCommitSha(),
    flagRollup,
    seeds: reports.map((r) => ({
      seed: r.meta.seed,
      runId: r.meta.runId,
      years: r.meta.years ?? years,
      path: `seeds/${r.meta.seed}.json`,
      elapsedMs: r.meta.elapsedMs,
      historyEvents: r.history.totalEvents,
      mediaStories: r.newsComposition.repetition.totalStories,
      diagnosticFlags: r.diagnosticFlags.map((f) => f.code),
    })),
    reports,
  };
  const markdown = formatRuntimeBalanceMarkdownSummary({
    generatedAt: String(json.generatedAt),
    seedCount: reports.length,
    years,
    seeds: reports,
    flagRollup,
  });
  return { json, markdown };
}

function loadMatchingSeedReports(
  seedDir: string,
  opts: { runId: string; years: number; expectedSeeds: number },
): RuntimeBalanceReport[] {
  if (!existsSync(seedDir)) return [];
  const files = readdirSync(seedDir).filter((f) => f.endsWith(".json"));
  const matched: RuntimeBalanceReport[] = [];
  const rejected: string[] = [];
  for (const file of files.sort()) {
    try {
      const report = JSON.parse(
        readFileSync(resolve(seedDir, file), "utf8"),
      ) as RuntimeBalanceReport;
      const yearsOk =
        report.meta.years === opts.years ||
        report.meta.monthsAdvanced === opts.years * 12 ||
        (report.meta.years == null && report.meta.monthsAdvanced === opts.years * 12);
      const runOk = report.meta.runId === opts.runId;
      if (runOk && yearsOk) {
        matched.push(report);
      } else {
        rejected.push(
          `${file} (runId=${report.meta.runId ?? "missing"}, years=${report.meta.years ?? report.meta.monthsAdvanced / 12})`,
        );
      }
    } catch {
      rejected.push(`${file} (parse error)`);
    }
  }
  if (rejected.length > 0) {
    console.error(`[phase17c] ignored non-matching shards:\n  - ${rejected.join("\n  - ")}`);
  }
  if (matched.length !== opts.expectedSeeds) {
    throw new Error(
      `[phase17c] expected ${opts.expectedSeeds} matching shards for runId=${opts.runId} years=${opts.years}, found ${matched.length}`,
    );
  }
  return matched;
}

function main(): void {
  const outdirKind = stringFlag("outdir", "final");
  const { outDir, seedDir } = resolveOutDirs(outdirKind);
  const aggregateJson = resolve(outDir, "runtime-balance-report.json");
  const aggregateMd = resolve(outDir, "runtime-balance-summary.md");
  // Also mirror authoritative aggregate to legacy path for docs links.
  const legacyAggregateJson = resolve(baseOutDir, "runtime-balance-report.json");
  const legacyAggregateMd = resolve(baseOutDir, "runtime-balance-summary.md");

  if (process.argv.includes("--aggregate")) {
    const years = numericFlag("years", 10);
    const expectedSeeds = numericFlag("expected-seeds", 3);
    const runId = stringFlag("run-id", "");
    if (!runId) {
      console.error("[phase17c] --aggregate requires --run-id=...");
      process.exit(1);
    }
    const reports = loadMatchingSeedReports(seedDir, { runId, years, expectedSeeds });
    const { json, markdown } = aggregateSeedReports(reports, years, runId);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(aggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    writeFileSync(aggregateMd, markdown, "utf8");
    if (outdirKind === "final") {
      writeFileSync(legacyAggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      writeFileSync(legacyAggregateMd, markdown, "utf8");
    }
    console.log(`[phase17c] aggregate → ${aggregateJson}`);
    console.log(`[phase17c] summary   → ${aggregateMd}`);
    return;
  }

  const seedCount = Math.max(1, Math.min(24, numericFlag("seeds", 3)));
  const years = Math.max(1, Math.min(25, numericFlag("years", 10)));
  const prefix = stringFlag("seed-prefix", outdirKind === "tuning" ? "phase17c-tune" : "phase17c");
  const runId = stringFlag(
    "run-id",
    `phase17c-${outdirKind}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
  );
  const matrix = `${seedCount}x${years}`;
  const commitSha = resolveCommitSha();
  const shard = process.argv.find((a) => a.startsWith("--shard="));
  const shardCount = numericFlag("shard-count", 1);

  let startIndex = 0;
  let endIndex = seedCount;
  if (shard) {
    const shardIndex = Number(shard.split("=")[1]);
    if (!Number.isFinite(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
      throw new Error(`Invalid --shard= index (0..${shardCount - 1})`);
    }
    const perShard = Math.ceil(seedCount / shardCount);
    startIndex = shardIndex * perShard;
    endIndex = Math.min(seedCount, startIndex + perShard);
  }

  const reports: RuntimeBalanceReport[] = [];
  for (let i = startIndex; i < endIndex; i += 1) {
    const seed = seedName(prefix, i);
    console.error(`[phase17c] running ${seed} (${years}y) runId=${runId}…`);
    const report = runSingleSeed(seed, years, { runId, matrix, commitSha });
    writeSeedReport(seedDir, report);
    reports.push(report);
    console.error(
      `[phase17c] ${seed}: ${report.history.totalEvents} history, ${report.newsComposition.repetition.totalStories} stories, flags=${report.diagnosticFlags.length}`,
    );
  }

  if (shardCount === 1 && !shard) {
    const { json, markdown } = aggregateSeedReports(reports, years, runId);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(aggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    writeFileSync(aggregateMd, markdown, "utf8");
    if (outdirKind === "final") {
      writeFileSync(legacyAggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      writeFileSync(legacyAggregateMd, markdown, "utf8");
    }
    console.log(
      JSON.stringify(
        { runId, matrix, seeds: reports.length, years, aggregate: aggregateJson },
        null,
        2,
      ),
    );
  } else {
    console.log(
      JSON.stringify(
        {
          runId,
          matrix,
          shard: shard?.split("=")[1] ?? "0",
          shardCount,
          seedsWritten: reports.map((r) => r.meta.seed),
          note: `Run with --aggregate --run-id=${runId} --years=${years} --expected-seeds=${seedCount} --outdir=${outdirKind}`,
        },
        null,
        2,
      ),
    );
  }
}

main();
