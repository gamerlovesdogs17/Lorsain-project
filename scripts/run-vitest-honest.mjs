#!/usr/bin/env node
/**
 * Run Vitest without globally ignoring unhandled errors.
 *
 * Vitest 3 can still emit a post-suite worker RPC timeout
 * (`[vitest-worker]: Timeout calling "onTaskUpdate"`) after every assertion
 * passed (P10-VITEST-TIMEOUT). This wrapper:
 * - never sets dangerouslyIgnoreUnhandledErrors
 * - writes a JSON reporter artifact for machine-readable completion counts
 * - exits 0 only when the suite fully completed AND the only residual failure
 *   mode is that known worker RPC timeout
 * - otherwise preserves Vitest's exit code so genuine unhandled errors fail CI
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHonestVitestResult } from "./vitest-honest-classify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const vitestBin = require.resolve("vitest/vitest.mjs");

const args = process.argv.slice(2);
const jsonDir = mkdtempSync(path.join(tmpdir(), "vitest-honest-"));
const jsonPath = path.join(jsonDir, "result.json");

const result = spawnSync(
  process.execPath,
  [
    vitestBin,
    "run",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${jsonPath}`,
    ...args,
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  },
);

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
const combined = `${stdout}\n${stderr}`;
process.stdout.write(stdout);
process.stderr.write(stderr);

let jsonResult = null;
try {
  jsonResult = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  jsonResult = null;
}
try {
  rmSync(jsonDir, { recursive: true, force: true });
} catch {
  // ignore cleanup failures
}

const exitCode = result.status ?? 1;
const verdict = classifyHonestVitestResult(combined, exitCode, jsonResult);
if (verdict.allow) {
  if (verdict.reason === "known_vitest_worker_rpc_timeout") {
    console.error(
      "[run-vitest-honest] Ignoring known Vitest worker RPC timeout after a complete green suite (P10-VITEST-TIMEOUT).",
    );
  }
  process.exit(0);
}

process.exit(exitCode);
