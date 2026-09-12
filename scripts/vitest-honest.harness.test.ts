import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHonestVitestResult, stripAnsi } from "./vitest-honest-classify.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const wrapper = resolve(root, "scripts/run-vitest-honest.mjs");
const tmpDir = resolve(root, ".calibration/harness-unhandled");

const GREEN_SUMMARY = `
 Test Files  1 passed (1)
      Tests  3 passed (3)
`;

const RPC = `[vitest-worker]: Timeout calling "onTaskUpdate"`;
const COLORED_RPC = `\u001b[31m[vitest-worker]: Timeout calling "onTaskUpdate"\u001b[39m`;
const COLORED_GREEN = `\u001b[32m Test Files  1 passed (1)\u001b[39m\n\u001b[32m      Tests  3 passed (3)\u001b[39m`;

describe("honest vitest classifier", () => {
  it("strips ANSI color sequences", () => {
    expect(stripAnsi(COLORED_RPC)).toContain('[vitest-worker]: Timeout calling "onTaskUpdate"');
    expect(stripAnsi(COLORED_RPC)).not.toMatch(/\u001b/);
  });

  it("permits colored output: all tests pass + known RPC timeout", () => {
    const verdict = classifyHonestVitestResult(`${COLORED_GREEN}\n${COLORED_RPC}\n`, 1);
    expect(verdict.allow).toBe(true);
    expect(verdict.reason).toBe("known_vitest_worker_rpc_timeout");
  });

  it("permits uncolored output: all tests pass + known RPC timeout", () => {
    const verdict = classifyHonestVitestResult(`${GREEN_SUMMARY}\n${RPC}\n`, 1);
    expect(verdict.allow).toBe(true);
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

  it("fails unhandled TypeError", () => {
    const out = `${GREEN_SUMMARY}\nTypeError: cannot read properties of undefined\n${RPC}\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
    expect(classifyHonestVitestResult(out, 1).reason).toBe("type_error");
  });

  it("fails unhandled rejection text", () => {
    const out = `${GREEN_SUMMARY}\nUnhandled Rejection: boom\n${RPC}\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
  });

  it("fails known RPC + another unhandled error", () => {
    const out = `${GREEN_SUMMARY}\nUnhandled Errors 2\n${RPC}\nError: something-else\n`;
    expect(classifyHonestVitestResult(out, 1).allow).toBe(false);
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
