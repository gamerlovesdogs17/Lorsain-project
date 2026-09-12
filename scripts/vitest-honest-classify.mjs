/**
 * Pure classification for scripts/run-vitest-honest.mjs.
 * Strips ANSI before matching so colored Vitest reporters classify correctly.
 * Suite completeness is mandatory: incomplete runs must never be whitelisted.
 */

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

/** Strip CSI / OSC terminal escape sequences (Vitest color output). */
export function stripAnsi(text) {
  if (!text) return "";
  const csi = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
  const osc = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");
  const single = new RegExp(`${ESC}[@-Z\\\\-_]`, "g");
  return String(text).replace(csi, "").replace(osc, "").replace(single, "");
}

const WORKER_RPC_TIMEOUT = /\[vitest-worker\]:\s*Timeout calling ["']?onTaskUpdate["']?/i;

/**
 * Parse Vitest text summary counts.
 * Supports:
 *   Test Files  2 passed (17)
 *   Test Files  1 passed | 0 failed (1)
 *   Tests  37 passed
 *   Tests  3 passed (3)
 *   Tests  1 failed | 2 passed (3)
 *
 * @returns {{
 *   filesCompleted: number | null,
 *   filesTotal: number | null,
 *   filesFailed: number | null,
 *   testsCompleted: number | null,
 *   testsTotal: number | null,
 *   testsFailed: number | null,
 * }}
 */
export function parseVitestSummaryCounts(normalized) {
  const filesLine =
    /Test Files\s+([^\n]+)/i.exec(normalized)?.[1] ??
    /Test Files\s+(.+)$/im.exec(normalized)?.[1] ??
    "";
  const testsLine =
    /(?:^|\n)\s*Tests\s+([^\n]+)/i.exec(normalized)?.[1] ??
    /(?:^|\n)\s*Tests\s+(.+)$/im.exec(normalized)?.[1] ??
    "";

  const filesFailed = /(\d+)\s+failed/i.exec(filesLine);
  const filesPassed = /(\d+)\s+passed/i.exec(filesLine);
  const filesTotalParen = /\((\d+)\)/.exec(filesLine);
  const filesCompleted = filesPassed ? Number(filesPassed[1]) : null;
  const filesFailedCount = filesFailed ? Number(filesFailed[1]) : null;
  let filesTotal = filesTotalParen ? Number(filesTotalParen[1]) : null;
  if (filesTotal == null && filesCompleted != null && (filesFailedCount == null || filesFailedCount === 0)) {
    // "1 passed (1)" already covered; bare "1 passed" without total is incomplete signal → leave null
    filesTotal = null;
  }

  const testsFailed = /(\d+)\s+failed/i.exec(testsLine);
  const testsPassed = /(\d+)\s+passed/i.exec(testsLine);
  const testsTotalParen = /\((\d+)\)/.exec(testsLine);
  const testsCompleted = testsPassed ? Number(testsPassed[1]) : null;
  const testsFailedCount = testsFailed ? Number(testsFailed[1]) : null;
  const testsTotal = testsTotalParen ? Number(testsTotalParen[1]) : null;

  return {
    filesCompleted,
    filesTotal,
    filesFailed: filesFailedCount,
    testsCompleted,
    testsTotal,
    testsFailed: testsFailedCount,
  };
}

/**
 * Prefer machine-readable Vitest JSON when present.
 * Accepts Vitest JSON reporter payload or Jest-compatible summary fields.
 *
 * @param {unknown} json
 * @returns {{
 *   complete: boolean,
 *   failed: boolean,
 *   reason: string,
 *   filesCompleted: number | null,
 *   filesTotal: number | null,
 *   testsCompleted: number | null,
 *   testsTotal: number | null,
 * } | null}
 */
export function classifyFromVitestJson(json) {
  if (!json || typeof json !== "object") return null;
  const obj = /** @type {Record<string, unknown>} */ (json);

  // Vitest JSON reporter (v1-style / experimental): success + testResults
  if (Array.isArray(obj.testResults) || typeof obj.numTotalTests === "number") {
    const filesTotal =
      typeof obj.numTotalTestSuites === "number"
        ? obj.numTotalTestSuites
        : Array.isArray(obj.testResults)
          ? obj.testResults.length
          : null;
    const filesFailed =
      typeof obj.numFailedTestSuites === "number"
        ? obj.numFailedTestSuites
        : Array.isArray(obj.testResults)
          ? obj.testResults.filter((r) => r && typeof r === "object" && r.status === "failed").length
          : null;
    const testsTotal = typeof obj.numTotalTests === "number" ? obj.numTotalTests : null;
    const testsFailed = typeof obj.numFailedTests === "number" ? obj.numFailedTests : null;
    const testsPassed = typeof obj.numPassedTests === "number" ? obj.numPassedTests : null;
    const filesCompleted =
      filesTotal != null && filesFailed != null ? filesTotal - filesFailed : null;
    const testsCompleted =
      testsPassed != null
        ? testsPassed
        : testsTotal != null && testsFailed != null
          ? testsTotal - testsFailed
          : null;

    const failed =
      (testsFailed != null && testsFailed > 0) ||
      (filesFailed != null && filesFailed > 0) ||
      obj.success === false;
    const complete =
      filesTotal != null &&
      filesCompleted != null &&
      filesCompleted === filesTotal &&
      testsTotal != null &&
      testsCompleted != null &&
      testsCompleted === testsTotal &&
      !failed;

    return {
      complete,
      failed: Boolean(failed),
      reason: failed ? "json_failed" : complete ? "json_complete" : "json_incomplete",
      filesCompleted,
      filesTotal,
      testsCompleted,
      testsTotal,
    };
  }

  // Vitest 3+ custom reporter dump with files/tests arrays
  if (Array.isArray(obj.files) || Array.isArray(obj.tests)) {
    const files = Array.isArray(obj.files) ? obj.files : [];
    const tests = Array.isArray(obj.tests) ? obj.tests : [];
    const filesTotal = files.length;
    const filesFailed = files.filter((f) => f && f.result?.state === "fail").length;
    const filesCompleted = files.filter(
      (f) => f && (f.result?.state === "pass" || f.result?.state === "fail"),
    ).length;
    const testsTotal = tests.length || files.reduce((n, f) => n + (f.tasks?.length ?? 0), 0);
    const failedTasks = tests.filter((t) => t && t.result?.state === "fail").length;
    const passedTasks = tests.filter((t) => t && t.result?.state === "pass").length;
    const complete =
      filesTotal > 0 &&
      filesCompleted === filesTotal &&
      filesFailed === 0 &&
      (testsTotal === 0 || (passedTasks === testsTotal && failedTasks === 0));
    return {
      complete,
      failed: filesFailed > 0 || failedTasks > 0,
      reason:
        filesFailed > 0 || failedTasks > 0
          ? "json_failed"
          : complete
            ? "json_complete"
            : "json_incomplete",
      filesCompleted,
      filesTotal,
      testsCompleted: passedTasks,
      testsTotal,
    };
  }

  return null;
}

/**
 * @param {string} combinedRaw stdout+stderr from Vitest
 * @param {number|null} exitCode process exit code
 * @param {unknown} [jsonResult] optional parsed JSON reporter output
 * @returns {{ allow: boolean, reason: string, normalized: string }}
 */
export function classifyHonestVitestResult(combinedRaw, exitCode, jsonResult) {
  const normalized = stripAnsi(combinedRaw ?? "");
  if (exitCode === 0) {
    return { allow: true, reason: "vitest_exit_0", normalized };
  }

  const fromJson = classifyFromVitestJson(jsonResult);
  const summary = parseVitestSummaryCounts(normalized);

  const failedTestCount = summary.testsFailed;
  const failedFileCount = summary.filesFailed;
  const passedTestCount = summary.testsCompleted;

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
  // Match real unhandled errors/rejections, not the "Unhandled Errors" heading alone.
  if (
    /Unhandled Rejection\b|unhandled rejection\b|Unhandled rejection\b/i.test(normalized) ||
    /Unhandled Error\b(?!\s*\d)/i.test(normalized)
  ) {
    return { allow: false, reason: "unhandled_error", normalized };
  }

  const unhandledCountMatch = /Unhandled Errors?\s+(\d+)/i.exec(normalized);
  if (unhandledCountMatch && Number(unhandledCountMatch[1]) > 1) {
    return { allow: false, reason: "multiple_unhandled", normalized };
  }

  if (/\n\s*FAIL\s+/m.test(normalized) || /Failed Tests\s+\d+/i.test(normalized)) {
    return { allow: false, reason: "fail_marker", normalized };
  }

  // Text summary is authoritative for incompleteness (e.g. "2 passed (17)").
  const textFilesIncomplete =
    summary.filesCompleted != null &&
    summary.filesTotal != null &&
    summary.filesCompleted < summary.filesTotal;
  const textTestsIncomplete =
    summary.testsCompleted != null &&
    summary.testsTotal != null &&
    summary.testsCompleted < summary.testsTotal;
  if (textFilesIncomplete || textTestsIncomplete) {
    return { allow: false, reason: "incomplete_suite", normalized };
  }

  if (fromJson) {
    if (fromJson.failed) {
      return { allow: false, reason: "failed_tests_or_files", normalized };
    }
    if (!fromJson.complete) {
      return { allow: false, reason: "incomplete_suite", normalized };
    }
  } else {
    // Text path: require completed === total for both files and tests.
    const filesComplete =
      summary.filesCompleted != null &&
      summary.filesTotal != null &&
      summary.filesCompleted === summary.filesTotal;
    const testsComplete =
      summary.testsCompleted != null &&
      summary.testsTotal != null &&
      summary.testsCompleted === summary.testsTotal;
    if (!filesComplete || !testsComplete) {
      return { allow: false, reason: "incomplete_suite", normalized };
    }
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
