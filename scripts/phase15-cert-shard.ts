/**
 * Phase 15 certification shard runner (outside Vitest to avoid worker RPC limits).
 *
 * Usage:
 *   node .../tsx scripts/phase15-cert-shard.ts --shard=CERT-25-A
 *   node .../tsx scripts/phase15-cert-shard.ts --aggregate
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation } from "../packages/sim/src/engine.ts";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.ts";
import { ensureHistory15Runtime } from "../packages/sim/src/history15/state.ts";
import {
  auditSimulationIntegrity,
  integrityErrorCount,
} from "../packages/sim/src/integrity/audit.ts";
import type { SimState } from "../packages/sim/src/types.ts";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = resolve(repoRoot, "docs/qa/phase15");
const shardDir = resolve(outDir, "shards");

export const CERT_SHARDS = [
  { id: "CERT-25-A", seed: "phase15-cert-25a", years: 25 },
  { id: "CERT-25-B", seed: "phase15-cert-25b", years: 25 },
  { id: "CERT-25-C", seed: "phase15-cert-25c", years: 25 },
  { id: "CERT-50-A", seed: "phase15-cert-50a", years: 50 },
  { id: "CERT-50-B", seed: "phase15-cert-50b", years: 50 },
  { id: "CERT-100", seed: "phase15-cert-100a", years: 100 },
] as const;

export type CertShardId = (typeof CERT_SHARDS)[number]["id"];

export type CertShardAudit = {
  shardId: string;
  seed: string;
  years: number;
  months: number;
  startingDate: string;
  endingDate: string;
  elapsedMs: number;
  saveBytes: number;
  politicians: number;
  deaths: number;
  retirements: number;
  electionsResolved: number;
  leadershipTransitions: number;
  lifecycleEvents: number;
  caucusEvents: number;
  courtCases: number;
  precedentEvents: number;
  eras: number;
  governments: number;
  yearbooks: number;
  foreignCrises: number;
  foreignTreaties: number;
  integrityErrors: number;
  integritySample: Array<{ code: string; message: string }>;
  result: "pass" | "fail";
  failureReason?: string;
};

function lifecycleBound(years: number): number {
  return years <= 25 ? 40 : years <= 50 ? 80 : 160;
}

function countHistory(state: SimState, types: string[]): number {
  const set = new Set(types);
  return state.history.filter((e) => set.has(e.type)).length;
}

export function runCertShard(shardId: string): CertShardAudit {
  const spec = CERT_SHARDS.find((s) => s.id === shardId);
  if (!spec) throw new Error(`Unknown shard ${shardId}`);
  const months = spec.years * 12;
  const world = loadTerenaWorld();
  const sim = createSimulation({
    world,
    seed: spec.seed,
    playerPoliticianId: "NPC146",
  });
  const startingDate = sim.getSnapshot().currentDate;
  const started = performance.now();
  let earlyFailure: string | undefined;
  for (let i = 0; i < months; i += 12) {
    advanceIntegrated(sim, Math.min(12, months - i));
    const mid = sim.getSnapshot() as SimState;
    const midFindings = auditSimulationIntegrity(world, mid);
    const midErrors = integrityErrorCount(midFindings);
    if (midErrors > 0) {
      earlyFailure = `integrity errors at year ${Math.floor((i + 12) / 12)}: ${midErrors} (${midFindings
        .filter((f) => f.severity === "error")
        .slice(0, 3)
        .map((f) => f.code)
        .join(", ")})`;
      break;
    }
  }
  const elapsedMs = performance.now() - started;
  const state = sim.getSnapshot() as SimState;
  const endingDate = state.currentDate;
  const history15 = ensureHistory15Runtime(state);
  const saveBytes = JSON.stringify(sim.serializeSave()).length;
  const findings = auditSimulationIntegrity(world, state);
  const integrityErrors = integrityErrorCount(findings);

  const closedTenures = history15.tenures.filter((t) => t.end != null).length;
  const chairEvents = countHistory(state, [
    "PARTY_CHAIR_ELECTED",
    "PARTY_LEADERSHIP_CHANGED",
    "PARTY_LEADER_SET",
    "PARTY_LEADERSHIP_CONTEST_RESOLVED",
  ]);
  const lifecycleEvents = countHistory(state, [
    "PARTY_LIFECYCLE_SPLIT",
    "PARTY_LIFECYCLE_MERGE",
    "PARTY_LIFECYCLE_FORMATION",
    "FACTION_SPLIT",
  ]);
  const caucusEvents = countHistory(state, [
    "CAUCUS_FORMED",
    "CAUCUS_SPLIT",
    "CAUCUS_MERGED",
    "CAUCUS_DISSOLVED",
    "FACTION_SPLIT",
  ]);
  const deaths = countHistory(state, ["POLITICIAN_DIED"]);
  const retirements = countHistory(state, ["POLITICIAN_RETIRED"]);
  const courtCases = Object.keys(state.constitutionalRuntime?.courtDecisions ?? {}).length;
  const precedentEvents = (history15.precedentLinks ?? []).length;
  const foreignCrises = Object.values(state.foreignAffairsRuntime?.crises ?? {}).length;
  const foreignTreaties = Object.values(state.foreignAffairsRuntime?.treaties ?? {}).length;
  const electionsResolved = Object.values(state.elections).filter(
    (e) => e.status === "resolved",
  ).length;
  const leadershipTransitions = Math.max(closedTenures, chairEvents);

  let failureReason: string | undefined = earlyFailure;
  if (!failureReason && electionsResolved <= 0) failureReason = "no elections resolved (frozen)";
  else if (!failureReason && history15.eras.length <= 0) failureReason = "no eras";
  else if (!failureReason && history15.governments.length <= 0) failureReason = "no governments";
  else if (!failureReason && history15.yearbooks.length <= 0) failureReason = "no yearbooks";
  else if (!failureReason && leadershipTransitions <= 0)
    failureReason = "no leadership transitions (frozen)";
  else if (!failureReason && lifecycleEvents > lifecycleBound(spec.years))
    failureReason = `lifecycle chaos: ${lifecycleEvents} > ${lifecycleBound(spec.years)}`;
  else if (!failureReason && integrityErrors > 0)
    failureReason = `integrity errors: ${integrityErrors}`;

  return {
    shardId: spec.id,
    seed: spec.seed,
    years: spec.years,
    months,
    startingDate,
    endingDate,
    elapsedMs,
    saveBytes,
    politicians: Object.keys(state.politicians).length,
    deaths,
    retirements,
    electionsResolved,
    leadershipTransitions,
    lifecycleEvents,
    caucusEvents,
    courtCases,
    precedentEvents,
    eras: history15.eras.length,
    governments: history15.governments.length,
    yearbooks: history15.yearbooks.length,
    foreignCrises,
    foreignTreaties,
    integrityErrors,
    integritySample: findings
      .filter((f) => f.severity === "error")
      .slice(0, 12)
      .map((f) => ({ code: f.code, message: f.message })),
    result: failureReason ? "fail" : "pass",
    ...(failureReason ? { failureReason } : {}),
  };
}

function writeShard(audit: CertShardAudit): string {
  mkdirSync(shardDir, { recursive: true });
  const path = resolve(shardDir, `${audit.shardId}.json`);
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  return path;
}

function aggregateShards(): {
  path: string;
  ok: boolean;
  audits: CertShardAudit[];
} {
  mkdirSync(outDir, { recursive: true });
  const audits: CertShardAudit[] = [];
  for (const spec of CERT_SHARDS) {
    const path = resolve(shardDir, `${spec.id}.json`);
    if (!existsSync(path)) {
      throw new Error(`Missing shard artifact ${path}`);
    }
    audits.push(JSON.parse(readFileSync(path, "utf8")) as CertShardAudit);
  }
  const ok = audits.every((a) => a.result === "pass");
  const summary = {
    generatedAt: new Date().toISOString(),
    matrix: "3x25 + 2x50 + 1x100",
    result: ok ? "pass" : "fail",
    shards: CERT_SHARDS.map((s) => s.id),
    audits,
  };
  const path = resolve(outDir, "longrun-audit.json");
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return { path, ok, audits };
}

function parseArgs(argv: string[]): { shard?: string; aggregate: boolean } {
  let shard: string | undefined;
  let aggregate = false;
  for (const arg of argv) {
    if (arg === "--aggregate") aggregate = true;
    else if (arg.startsWith("--shard=")) shard = arg.slice("--shard=".length);
  }
  return { shard, aggregate };
}

const args = parseArgs(process.argv.slice(2));
if (args.aggregate) {
  const { path, ok, audits } = aggregateShards();
  console.log(
    JSON.stringify(
      {
        aggregate: path,
        result: ok ? "pass" : "fail",
        shards: audits.map((a) => ({
          id: a.shardId,
          result: a.result,
          elapsedSec: (a.elapsedMs / 1000).toFixed(1),
          integrityErrors: a.integrityErrors,
          failureReason: a.failureReason ?? null,
        })),
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
} else if (args.shard) {
  const audit = runCertShard(args.shard);
  const path = writeShard(audit);
  console.log(
    JSON.stringify(
      {
        wrote: path,
        shardId: audit.shardId,
        result: audit.result,
        elapsedSec: (audit.elapsedMs / 1000).toFixed(1),
        saveBytes: audit.saveBytes,
        integrityErrors: audit.integrityErrors,
        failureReason: audit.failureReason ?? null,
      },
      null,
      2,
    ),
  );
  if (audit.result !== "pass") process.exit(1);
} else {
  console.error(
    `Usage: phase15-cert-shard.ts --shard=${CERT_SHARDS.map((s) => s.id).join("|")} | --aggregate`,
  );
  console.error(
    `Existing shard files: ${existsSync(shardDir) ? readdirSync(shardDir).join(", ") : "(none)"}`,
  );
  process.exit(2);
}
