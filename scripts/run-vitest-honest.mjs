#!/usr/bin/env node
/**
 * Run Vitest without globally ignoring unhandled errors.
 *
 * Vitest 3 can still emit a post-suite worker RPC timeout
 * (`[vitest-worker]: Timeout calling "onTaskUpdate"`) after every assertion
 * passed (P10-VITEST-TIMEOUT). This wrapper:
 * - never sets dangerouslyIgnoreUnhandledErrors
 * - exits 0 only when the run reports zero failed tests AND the only
 *   residual failure mode is that known worker RPC timeout
 * - otherwise preserves Vitest's exit code so genuine unhandled errors fail CI
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHonestVitestResult } from "./vitest-honest-classify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const vitestBin = require.resolve("vitest/vitest.mjs");

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [vitestBin, "run", ...args], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env },
  maxBuffer: 64 * 1024 * 1024,
});

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
const combined = `${stdout}\n${stderr}`;
process.stdout.write(stdout);
process.stderr.write(stderr);

const exitCode = result.status ?? 1;
const verdict = classifyHonestVitestResult(combined, exitCode);
if (verdict.allow) {
  if (verdict.reason === "known_vitest_worker_rpc_timeout") {
    console.error(
      "[run-vitest-honest] Ignoring known Vitest worker RPC timeout after a green assertion suite (P10-VITEST-TIMEOUT).",
    );
  }
  process.exit(0);
}

process.exit(exitCode);
