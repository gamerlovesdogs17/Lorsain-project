import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyFromVitestJson,
  classifyHonestVitestResult,
  parseVitestSummaryCounts,
  stripAnsi,
} from "./vitest-honest-classify.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const wrapper = resolve(root, "scripts/run-vitest-honest.mjs");
const tmpDir = resolve(root, ".calibration/harness-unhandled");

const GREEN_SUMMARY = `
 Test Files  1 passed (1)
      Tests  3 passed (3)
`;

const INCOMPLETE_SUMMARY = `
 Test Files  2 passed (17)
      Tests  37 passed
`;

const RPC = `[vitest-worker]: Timeout calling "onTaskUpdate"`;
const COLORED_RPC = `\u001b[31m[vitest-worker]: Timeout calling "onTaskUpdate"\u001b[39m`;
const COLORED_GREEN = `\u001b[32m Test Files  1 passed (1)\u001b[39m\n\u001b[32m      Tests  3 passed (3)\u001b[39m`;

describe("honest vitest classifier", () => {
  it("strips ANSI color sequences", () => {
    const stripped = stripAnsi(COLORED_RPC);
    expect(stripped).toContain('[vitest-worker]: Timeout calling "onTaskUpdate"');
    expect(stripped.includes(String.fromCharCode(0x1b))).toBe(false);
  });

  it("parses completed/total file and test counts", () => {
    const incomplete = parseVitestSummaryCounts(INCOMPLETE_SUMMARY);
    expect(incomplete.filesCompleted).toBe(2);
    expect(incomplete.filesTotal).toBe(17);
    expect(incomplete.testsCompleted).toBe(37);
    expect(incomplete.testsTotal).toBeNull();

    const complete = parseVitestSummaryCounts(GREEN_SUMMARY);
    expect(complete.filesCompleted).toBe(1);
    expect(complete.filesTotal).toBe(1);
    expect(complete.testsCompleted).toBe(3);
    expect(complete.testsTotal).toBe(3);
  });

  it("permits colored output: ALL COMPLETE + known RPC timeout", () => {
    const verdict = classifyHonestVitestResult(`${COLORED_GREEN}\n${COLORED_RPC}\n`, 1);
    expect(verdict.allow).toBe(true);
    expect(verdict.reason).toBe("known_vitest_worker_rpc_timeout");
  });

  it("permits uncolored output: ALL COMPLETE + known RPC timeout", () => {
    const verdict = classifyHonestVitestResult(`${GREEN_SUMMARY}\n${RPC}\n`, 1);
    expect(verdict.allow).toBe(true);
  });

  it("FAILS incomplete suite (2 of 17 files) + known RPC timeout", () => {
    const verdict = classifyHonestVitestResult(`${INCOMPLETE_SUMMARY}\n${RPC}\n`, 1);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toBe("incomplete_suite");
  });

  it("fails real test failure + RPC timeout", () => {
    const out = `
 FAIL  packages/sim/src/example.test.ts > example
AssertionError: expected 1 to be 2
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
${RPC}
`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
  });

  it("fails all complete + TypeError", () => {
    const out = `${GREEN_SUMMARY}\nTypeError: cannot read properties of undefined\n${RPC}\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
    expect(classifyHonestVitestResult(out, 1).reason).toBe("type_error");
  });

  it("fails all complete + rejection", () => {
    const out = `${GREEN_SUMMARY}\nUnhandled Rejection: boom\n${RPC}\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
  });

  it("fails all complete + known RPC + second error", () => {
    const out = `${GREEN_SUMMARY}\nUnhandled Errors 2\n${RPC}\nError: something-else\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
  });

  it("does not treat Unhandled Errors heading alone as a second error when count is 1", () => {
    const out = `${GREEN_SUMMARY}\n⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯\nUnhandled Errors 1\n${RPC}\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(true);
  });

  it("uses JSON reporter completeness when provided", () => {
    const json = {
      success: true,
      numTotalTestSuites: 1,
      numFailedTestSuites: 0,
      numTotalTests: 3,
      numPassedTests: 3,
      numFailedTests: 0,
      testResults: [{ status: "passed" }],
    };
    expect(classifyFromVitestJson(json)?.complete).toBe(true);
    const allow = classifyHonestVitestResult(`${GREEN_SUMMARY}\n${RPC}\n`, 1, json);
    expect(allow.allow).toBe(true);
  });

  it("text incompleteness beats optimistic JSON", () => {
    const optimisticJson = {
      success: true,
      numTotalTestSuites: 2,
      numFailedTestSuites: 0,
      numTotalTests: 37,
      numPassedTests: 37,
      numFailedTests: 0,
      testResults: [{ status: "passed" }, { status: "passed" }],
    };
    const fail = classifyHonestVitestResult(`${INCOMPLETE_SUMMARY}\n${RPC}\n`, 1, optimisticJson);
    expect(fail.allow).toBe(false);
    expect(fail.reason).toBe("incomplete_suite");
  });

  it("JSON incompleteness fails even when text totals match", () => {
    const partial = {
      success: true,
      numTotalTestSuites: 17,
      numFailedTestSuites: 0,
      numTotalTests: 200,
      numPassedTests: 37,
      numFailedTests: 0,
      testResults: Array.from({ length: 2 }, () => ({ status: "passed" })),
    };
    const fail = classifyHonestVitestResult(`${GREEN_SUMMARY}\n${RPC}\n`, 1, partial);
    expect(fail.allow).toBe(false);
    expect(fail.reason).toBe("incomplete_suite");
  });

  it("passes clean exit 0 without inspecting body", () => {
    expect(classifyHonestVitestResult("whatever", 0).allow).toBe(true);
  });
});

describe("honest vitest wrapper", () => {
  it("fails when a test introduces an unhandled rejection", () => {
    mkdirSync(tmpDir, { recursive: true });
    const probe = resolve(tmpDir, "unhandled.probe.test.ts");
    writeFileSync(
      probe,
      `
import { describe, it } from "vitest";
describe("unhandled probe", () => {
  it("queues an unhandled rejection", async () => {
    Promise.reject(new Error("intentional-unhandled-rejection"));
    await new Promise((r) => setTimeout(r, 30));
  });
});
`,
      "utf8",
    );
    const result = spawnSync(process.execPath, [wrapper, probe, "--reporter", "verbose"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env },
      timeout: 120_000,
    });
    rmSync(tmpDir, { recursive: true, force: true });
    expect(result.status ?? 1).not.toBe(0);
    const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(out).toMatch(/intentional-unhandled-rejection|Unhandled|unhandled/i);
  }, 120_000);
});
