import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importScenarioJson, parseScenarioDocument } from "@lorsain/scenario";
import {
  auditSimulationIntegrity,
  createSimulation,
  parseSaveFile,
  restoreSimulation,
} from "./index.js";
import { buildKernelWorldFromScenarioDocument } from "./scenario/kernelBridge.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixturePath = resolve(repoRoot, "docs/qa/phase18/fixtures/custom-mini-world.lorsain.json");

function loadCustomWorld() {
  const text = readFileSync(fixturePath, "utf8");
  const imported = importScenarioJson(text);
  if (!imported.ok) throw new Error(imported.error);
  return {
    doc: imported.document,
    world: buildKernelWorldFromScenarioDocument(imported.document),
  };
}

describe("Phase 18A custom mini world", () => {
  it("builds kernel world from scenario document without Terena bundle", () => {
    const { doc, world } = loadCustomWorld();
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

  it("initializes, advances 12 months, save/load, and passes integrity audit", () => {
    const { world } = loadCustomWorld();
    const player =
      world.politicians.find((p) => p.id.startsWith("NPC_ASM"))?.id ??
      world.politicians[0]?.id ??
      "NPC_AUF_LDR";
    const sim = createSimulation({ world, playerPoliticianId: player, seed: "P18A-MINI" });
    for (let i = 0; i < 12; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      if (r.interrupt?.requiresResolution) {
        if (r.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") {
          sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
        } else if (r.interrupt.code === "ASSEMBLY_ELECTION_DUE") {
          sim.executeCommand({ type: "RESOLVE_ASSEMBLY_ELECTION" });
        } else {
          sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" });
        }
        sim.executeCommand({ type: "RESUME_TURN" });
      }
    }
    const snap = sim.getSnapshot();
    expect(snap.completedTurns).toBe(12);
    expect(snap.scenarioFormatVersion).toBe(1);
    expect(snap.scenarioName).toBe("Alphaven Federation (QA Mini)");

    const save = sim.serializeSave();
    const parsed = parseSaveFile(save, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.scenarioId).toBe("ALPHAVEN_2026");
    expect(parsed.save.scenarioFormatVersion).toBe(1);

    const reloaded = restoreSimulation(parsed.save, world);
    expect(reloaded.hashState()).toBe(sim.hashState());

    const audit = auditSimulationIntegrity(world, reloaded.getSnapshot());
    expect(audit.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("parseScenarioDocument matches fixture metadata", () => {
    const doc = parseScenarioDocument(JSON.parse(readFileSync(fixturePath, "utf8")) as unknown);
    expect(doc.startDate).toBe("2026-06-15");
    expect(doc.contentEmbed.kind).toBe("mini_playable_v1");
  });
});
