/**
 * Phase 17C — multi-seed runtime balance / repetition measurement.
 *
 * Default: 3 seeds × 10 years. Informational only (not normal CI).
 *
 * Usage:
 *   node .../tsx scripts/phase17c-balance-run.ts
 *   node .../tsx scripts/phase17c-balance-run.ts --seeds=5 --years=12
 *   node .../tsx scripts/phase17c-balance-run.ts --shard=0 --shard-count=3
 *   node .../tsx scripts/phase17c-balance-run.ts --aggregate
 */
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
const outDir = resolve(repoRoot, "docs/qa/phase17c");
const seedDir = resolve(outDir, "seeds");
const aggregateJson = resolve(outDir, "runtime-balance-report.json");
const aggregateMd = resolve(outDir, "runtime-balance-summary.md");

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

export function runSingleSeed(seed: string, years: number): RuntimeBalanceReport {
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
  });
}

function writeSeedReport(report: RuntimeBalanceReport): void {
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
): { json: Record<string, unknown>; markdown: string } {
  const flagRollup = rollupFlags(reports);
  const json = {
    schema: "phase17c-runtime-balance-aggregate/v1",
    generatedAt: new Date().toISOString(),
    seedCount: reports.length,
    years,
    flagRollup,
    seeds: reports.map((r) => ({
      seed: r.meta.seed,
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

function loadExistingSeedReports(): RuntimeBalanceReport[] {
  if (!existsSync(seedDir)) return [];
  const files = readdirSync(seedDir).filter((f) => f.endsWith(".json"));
  const out: RuntimeBalanceReport[] = [];
  for (const file of files.sort()) {
    try {
      out.push(JSON.parse(readFileSync(resolve(seedDir, file), "utf8")) as RuntimeBalanceReport);
    } catch {
      // skip corrupt shard
    }
  }
  return out;
}

function main(): void {
  if (process.argv.includes("--aggregate")) {
    const years = numericFlag("years", 10);
    const reports = loadExistingSeedReports();
    if (reports.length === 0) {
      console.error("[phase17c] No seed JSON files in docs/qa/phase17c/seeds/");
      process.exit(1);
    }
    const { json, markdown } = aggregateSeedReports(reports, years);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(aggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    writeFileSync(aggregateMd, markdown, "utf8");
    console.log(`[phase17c] aggregate → ${aggregateJson}`);
    console.log(`[phase17c] summary   → ${aggregateMd}`);
    return;
  }

  const seedCount = Math.max(1, Math.min(24, numericFlag("seeds", 3)));
  const years = Math.max(1, Math.min(25, numericFlag("years", 10)));
  const prefix = stringFlag("seed-prefix", "phase17c");
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
    console.error(`[phase17c] running ${seed} (${years}y)…`);
    const report = runSingleSeed(seed, years);
    writeSeedReport(report);
    reports.push(report);
    console.error(
      `[phase17c] ${seed}: ${report.history.totalEvents} history, ${report.newsComposition.repetition.totalStories} stories, flags=${report.diagnosticFlags.length}`,
    );
  }

  if (shardCount === 1 && !shard) {
    const { json, markdown } = aggregateSeedReports(reports, years);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(aggregateJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    writeFileSync(aggregateMd, markdown, "utf8");
    console.log(JSON.stringify({ seeds: reports.length, years, aggregate: aggregateJson }, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          shard: shard?.split("=")[1] ?? "0",
          shardCount,
          seedsWritten: reports.map((r) => r.meta.seed),
          note: "Run with --aggregate after all shards finish.",
        },
        null,
        2,
      ),
    );
  }
}

main();
