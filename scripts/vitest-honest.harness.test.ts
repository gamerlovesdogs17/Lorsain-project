import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const wrapper = resolve(root, "scripts/run-vitest-honest.mjs");
const tmpDir = resolve(root, ".calibration/harness-unhandled");

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
