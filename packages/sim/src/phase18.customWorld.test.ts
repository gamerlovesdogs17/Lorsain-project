import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  importScenarioJson,
  parseScenarioDocument,
  type ScenarioDocument,
} from "@lorsain/scenario";
import {
  auditSimulationIntegrity,
  createSimulation,
  parseSaveFile,
  restoreSimulation,
} from "./index.js";
import { TERENA_ASSEMBLY_CALENDAR, TERENA_PRESIDENTIAL_CALENDAR } from "./calendar.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import { advanceIntegrated, loadTerenaWorld } from "./integration/harness.js";
import { buildKernelWorldFromScenarioDocument } from "./scenario/kernelBridge.js";
import { resolveMiniWorldElectionSchedule } from "./scenario/miniWorldCalendars.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixturesDir = resolve(repoRoot, "docs/qa/phase18/fixtures");

const FIXTURE_PATHS = {
  alphaven: resolve(fixturesDir, "custom-mini-world.lorsain.json"),
  aster: resolve(fixturesDir, "aster-custom.lorsain.json"),
  brinor: resolve(fixturesDir, "brinor-custom.lorsain.json"),
} as const;

function loadFixture(path: string): {
  doc: ScenarioDocument;
  world: ReturnType<typeof buildKernelWorldFromScenarioDocument>;
} {
  const text = readFileSync(path, "utf8");
  const imported = importScenarioJson(text);
  if (!imported.ok) throw new Error(imported.error);
  return {
    doc: imported.document,
    world: buildKernelWorldFromScenarioDocument(imported.document),
  };
}

function runTwelveMonthSaveLoad(path: string, seed: string): void {
  const { doc, world } = loadFixture(path);
  const player =
    world.politicians.find((p) => p.id.startsWith("NPC_ASM"))?.id ??
    world.politicians.find((p) => p.id.includes("_0001"))?.id ??
    world.politicians[0]?.id ??
    doc.contentSections.parties?.[0]?.leaderId ??
    "NPC_PLAYER";
  const sim = createSimulation({ world, playerPoliticianId: player, seed });
  advanceIntegrated(sim, 12);
  const snap = sim.getSnapshot();
  expect(snap.completedTurns).toBe(12);
  expect(snap.scenarioId).toBe(doc.scenarioId);

  const save = sim.serializeSave();
  const parsed = parseSaveFile(save, world.contentVersion);
  if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
  expect(parsed.save.scenarioId).toBe(doc.scenarioId);

  const reloaded = restoreSimulation(parsed.save, world);
  expect(reloaded.hashState()).toBe(sim.hashState());

  const audit = auditSimulationIntegrity(world, reloaded.getSnapshot());
  expect(audit.filter((f) => f.severity === "error")).toEqual([]);
}

describe("Phase 18A custom mini world (Alphaven)", () => {
  it("builds kernel world from scenario document without Terena bundle", () => {
    const { doc, world } = loadFixture(FIXTURE_PATHS.alphaven);
    expect(world.scenarioId).toBe(doc.scenarioId);
    expect(world.countryName).toBe("Alphaven Federation");
    expect(world.legislativeConstitution.assemblySeatCount).toBe(24);
    expect(world.courtConstitution.judges).toBe(5);
    expect(world.provinceIds).toEqual(["PRV_ALPINE", "PRV_COAST"]);
    expect(Object.keys(world.partyDefinitions).sort()).toEqual([
      "PARTY_ALP_UNITY",
      "PARTY_COAST_REF",
      "PARTY_HIGHLAND_L",
    ]);
  });

  it("uses startDate-anchored calendars instead of Terena constants", () => {
    const { doc, world } = loadFixture(FIXTURE_PATHS.alphaven);
    const schedule = resolveMiniWorldElectionSchedule(doc);
    expect(world.presidentialCalendar.anchorYear).toBe(2026);
    expect(world.presidentialCalendar).toEqual(schedule.presidentialCalendar);
    expect(world.assemblyCalendar).toEqual(schedule.assemblyCalendar);
    expect(world.presidentialCalendar).not.toEqual(TERENA_PRESIDENTIAL_CALENDAR);
    expect(world.assemblyCalendar).not.toEqual(TERENA_ASSEMBLY_CALENDAR);
    const presEvent = world.initialScheduled.find(
      (e) => e.eventType === "PRESIDENTIAL_ELECTION_DUE",
    );
    expect(presEvent?.payload.electionId).toBe(
      `ELEC_PRES_${world.nextRegularPresidentialElectionDate.slice(0, 4)}`,
    );
    expect(presEvent?.payload.electionId).not.toBe(CANONICAL_PRESIDENTIAL_ELECTION_ID);
    expect(world.initialScheduled.some((e) => e.eventType === "ASSEMBLY_ELECTION_DUE")).toBe(false);
    expect(world.nextRegularAssemblyElectionDate > doc.startDate).toBe(true);
    expect(world.nextRegularPresidentialElectionDate > doc.startDate).toBe(true);
  });

  it("initializes, advances 12 months, save/load, and passes integrity audit", () => {
    runTwelveMonthSaveLoad(FIXTURE_PATHS.alphaven, "P18A-MINI");
  });

  it("parseScenarioDocument matches fixture metadata", () => {
    const doc = parseScenarioDocument(
      JSON.parse(readFileSync(FIXTURE_PATHS.alphaven, "utf8")) as unknown,
    );
    expect(doc.startDate).toBe("2026-06-15");
    expect(doc.contentEmbed.kind).toBe("mini_playable_v1");
  });
});

describe("Phase 18B Aster custom world", () => {
  it("reflects five-province, 120-seat, four-party quick-build structure", () => {
    const { doc, world } = loadFixture(FIXTURE_PATHS.aster);
    expect(doc.scenarioId).toBe("ASTER_2029");
    expect(doc.contentSections.geography?.provinces).toHaveLength(5);
    expect(doc.contentSections.parties).toHaveLength(4);
    expect(world.legislativeConstitution.assemblySeatCount).toBe(120);
    expect(world.provinceIds).toHaveLength(5);
    expect(Object.keys(world.partyDefinitions)).toHaveLength(4);
    expect(world.presidentialCalendar.anchorYear).toBe(2029);
  });

  it("advances 12 months with save/load integrity", () => {
    runTwelveMonthSaveLoad(FIXTURE_PATHS.aster, "P18B-ASTER");
  });
});

describe("Phase 18C Brinor custom world", () => {
  it("reflects ten-province, 240-seat, five-party parliamentary structure", () => {
    const { doc, world } = loadFixture(FIXTURE_PATHS.brinor);
    expect(doc.scenarioId).toBe("BRINOR_2030");
    expect(doc.contentSections.constitution?.governmentForm).toBe("parliamentary");
    expect(doc.contentSections.geography?.provinces).toHaveLength(10);
    expect(doc.contentSections.parties).toHaveLength(5);
    expect(world.legislativeConstitution.assemblySeatCount).toBe(240);
    expect(world.provinceIds).toHaveLength(10);
    expect(Object.keys(world.partyDefinitions)).toHaveLength(5);
    expect(world.presidentialCalendar.anchorYear).toBe(2030);
  });

  it("advances 12 months with save/load integrity", () => {
    runTwelveMonthSaveLoad(FIXTURE_PATHS.brinor, "P18B-BRINOR");
  });
});

describe("Phase 18D Terena save migration smoke", () => {
  it("restores an older Terena browser save against current kernel world", () => {
    const savePath = resolve(repoRoot, "docs/qa/phase17a/fixtures/government-browser-save.json");
    const raw = JSON.parse(readFileSync(savePath, "utf8"));
    const world = loadTerenaWorld();
    const parsed = parseSaveFile(raw, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sim = restoreSimulation(parsed.save, world);
    expect(sim.getSnapshot().scenarioId).toBe("TERENA_2028");
    expect(sim.getSnapshot().completedTurns).toBeGreaterThan(0);
  });
});
