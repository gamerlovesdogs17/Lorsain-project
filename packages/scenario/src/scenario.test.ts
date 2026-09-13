import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  exportScenarioJson,
  importScenarioJson,
  parseScenarioDocument,
  scenarioJsonRoundtrip,
  validateScenario,
} from "./index.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixturePath = resolve(repoRoot, "docs/qa/phase18/fixtures/custom-mini-world.lorsain.json");

describe("@lorsain/scenario", () => {
  it("validates and imports the phase 18 QA mini fixture", () => {
    const text = readFileSync(fixturePath, "utf8");
    const report = validateScenario(JSON.parse(text) as unknown);
    expect(report.errors).toEqual([]);
    const imported = importScenarioJson(text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.document.scenarioId).toBe("ALPHAVEN_2026");
    expect(imported.document.countryName).toBe("Alphaven Federation");
  });

  it("roundtrips scenario JSON", () => {
    const text = readFileSync(fixturePath, "utf8");
    const doc = parseScenarioDocument(JSON.parse(text) as unknown);
    const again = scenarioJsonRoundtrip(doc);
    expect(exportScenarioJson(again)).toEqual(exportScenarioJson(doc));
  });

  it("warns on unknown root fields", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
    raw.futureField = "hello";
    const report = validateScenario(raw);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.code === "UNKNOWN_ROOT_FIELD")).toBe(true);
  });
});
