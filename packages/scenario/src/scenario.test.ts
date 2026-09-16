import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  exportScenarioJson,
  importScenarioJson,
  parseScenarioDocument,
  scenarioJsonRoundtrip,
  validateScenario,
  quickBuildScenario,
  validateContentPack,
  exportContentPackJson,
  parseContentPack,
  type ContentPackDocument,
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

  it("quickBuild is deterministic for the same seed", () => {
    const input = {
      countryName: "Aster Republic",
      startDate: "2029-01-20",
      governmentForm: "presidential" as const,
      assemblySeats: 120,
      provinceCount: 5,
      partyCount: 4,
      electoralPreset: "stv" as const,
      generationSeed: "aster-phase18b",
      scenarioId: "ASTER_2029",
    };
    const a = exportScenarioJson(quickBuildScenario(input));
    const b = exportScenarioJson(quickBuildScenario(input));
    expect(a).toBe(b);
    const doc = quickBuildScenario(input);
    expect(doc.contentSections.constitution?.assemblySeats).toBe(120);
    expect(doc.contentSections.geography?.provinces).toHaveLength(5);
    expect(doc.contentSections.parties).toHaveLength(4);
    const seats = doc.contentSections.geography?.constituencies?.reduce((s, c) => s + c.seats, 0);
    expect(seats).toBe(120);
  });

  it("validateScenario returns human messages and fixHints for seat mismatch", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
    const sections = raw.contentSections as Record<string, unknown>;
    sections.geography = {
      provinces: [{ id: "P1", name: "One" }],
      constituencies: [{ id: "C1", name: "Only", provinceId: "P1", seats: 10 }],
    };
    (sections.constitution as Record<string, unknown>).assemblySeats = 24;
    const report = validateScenario(raw);
    expect(report.errors.some((e) => e.code === "CONSTITUENCY_SEAT_MISMATCH")).toBe(true);
    const err = report.errors.find((e) => e.code === "CONSTITUENCY_SEAT_MISMATCH");
    expect(err?.fixHint).toBeTruthy();
    expect(err?.message).toMatch(/sum to 10/);
  });

  it("validateContentPack flags missing dependency pack", () => {
    const pack = {
      format: "lorsain-content-pack",
      formatVersion: 1,
      packId: "pack_a",
      name: "Pack A",
      version: "1.0.0",
      dependencies: [{ packId: "pack_missing", version: "1.0.0" }],
      categories: { billTemplates: [{ id: "BILL_1", title: "Sample" }] },
    };
    const report = validateContentPack(pack, { availablePackIds: new Set(["pack_a"]) });
    expect(report.errors.some((e) => e.code === "MISSING_DEPENDENCY_PACK")).toBe(true);
    expect(report.errors[0]?.fixHint).toMatch(/Install/);
    const round = parseContentPack(JSON.parse(exportContentPackJson(pack as ContentPackDocument)) as unknown);
    expect(round.packId).toBe("pack_a");
  });

  it("quickBuild respects non-Terena counts (not 420/21/48)", () => {
    const doc = quickBuildScenario({
      countryName: "Brinor",
      startDate: "2030-09-01",
      governmentForm: "parliamentary",
      assemblySeats: 240,
      provinceCount: 10,
      partyCount: 5,
      electoralPreset: "mixed_member",
      generationSeed: "brinor-fixture",
      scenarioId: "BRINOR_2030",
    });
    expect(doc.contentSections.constitution?.assemblySeats).toBe(240);
    expect(doc.contentSections.geography?.provinces?.length).toBe(10);
    expect(doc.contentSections.parties?.length).toBe(5);
    expect(doc.contentSections.constitution?.assemblySeats).not.toBe(420);
  });
});

/** Regenerate QA fixtures when quickBuild schema changes (not run in CI by default). */
describe.skip("fixture writer", () => {
  it("writes aster and brinor fixtures", () => {
    const aster = quickBuildScenario({
      countryName: "Aster Federation",
      startDate: "2029-04-01",
      governmentForm: "presidential",
      assemblySeats: 120,
      provinceCount: 5,
      partyCount: 4,
      electoralPreset: "stv",
      generationSeed: "aster-custom-fixture-v1",
      scenarioId: "ASTER_2029",
      name: "Aster Federation (QA Custom)",
    });
    const brinor = quickBuildScenario({
      countryName: "Brinor Commonwealth",
      startDate: "2030-09-01",
      governmentForm: "parliamentary",
      assemblySeats: 240,
      provinceCount: 10,
      partyCount: 5,
      electoralPreset: "mixed_member",
      generationSeed: "brinor-custom-fixture-v1",
      scenarioId: "BRINOR_2030",
      name: "Brinor Commonwealth (QA Custom)",
    });
    writeFileSync(
      resolve(repoRoot, "docs/qa/phase18/fixtures/aster-custom.lorsain.json"),
      exportScenarioJson(aster),
    );
    writeFileSync(
      resolve(repoRoot, "docs/qa/phase18/fixtures/brinor-custom.lorsain.json"),
      exportScenarioJson(brinor),
    );
  });
});
