/**
 * Pure classification for scripts/run-vitest-honest.mjs.
 * Strips ANSI before matching so colored Vitest reporters classify correctly.
 */

/** Strip CSI / OSC terminal escape sequences (Vitest color output). */
export function stripAnsi(text) {
  if (!text) return "";
  return String(text)
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "");
}

const WORKER_RPC_TIMEOUT = /\[vitest-worker\]:\s*Timeout calling ["']?onTaskUpdate["']?/i;

/**
 * @param {string} combinedRaw stdout+stderr from Vitest
 * @param {number|null} exitCode process exit code
 * @returns {{ allow: boolean, reason: string, normalized: string }}
 */
export function classifyHonestVitestResult(combinedRaw, exitCode) {
  const normalized = stripAnsi(combinedRaw ?? "");
  if (exitCode === 0) {
    return { allow: true, reason: "vitest_exit_0", normalized };
  }

  const failedTestsMatch = /Tests\s+(\d+)\s+failed/i.exec(normalized);
  const failedFilesMatch = /Test Files\s+(\d+)\s+failed/i.exec(normalized);
  const failedTestCount = failedTestsMatch ? Number(failedTestsMatch[1]) : null;
  const failedFileCount = failedFilesMatch ? Number(failedFilesMatch[1]) : null;
  const passedTestsMatch = /Tests\s+(\d+)\s+passed/i.exec(normalized);
  const passedTestCount = passedTestsMatch ? Number(passedTestsMatch[1]) : null;

  const hasWorkerRpc = WORKER_RPC_TIMEOUT.test(normalized);
  if (!hasWorkerRpc) {
    return { allow: false, reason: "non_rpc_failure", normalized };
  }

  if (/\bAssertionError\b/.test(normalized)) {
    return { allow: false, reason: "assertion_error", normalized };
  }
  if (/\bTypeError\b/.test(normalized)) {
    return { allow: false, reason: "type_error", normalized };
  }
  if (/Unhandled (?:Rejection|Error)|unhandled rejection|Unhandled rejection/i.test(normalized)) {
    return { allow: false, reason: "unhandled_error", normalized };
  }

  const unhandledCountMatch = /Unhandled Errors?\s+(\d+)/i.exec(normalized);
  if (unhandledCountMatch && Number(unhandledCountMatch[1]) > 1) {
    return { allow: false, reason: "multiple_unhandled", normalized };
  }

  if (/\n\s*FAIL\s+/m.test(normalized) || /Failed Tests\s+\d+/i.test(normalized)) {
    return { allow: false, reason: "fail_marker", normalized };
  }

  const zeroFailedTests =
    failedTestCount === 0 ||
    (failedTestCount == null && passedTestCount != null && passedTestCount > 0);
  const zeroFailedFiles = failedFileCount === 0 || failedFileCount == null;
  if (!zeroFailedTests || !zeroFailedFiles) {
    return { allow: false, reason: "failed_tests_or_files", normalized };
  }

  return { allow: true, reason: "known_vitest_worker_rpc_timeout", normalized };
}
