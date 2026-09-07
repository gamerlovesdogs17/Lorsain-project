import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { migrateSaveV25ToV26, parseSaveFile } from "./save.js";
import { auditSimulationIntegrity, integrityErrorCount } from "./integrity/audit.js";
import { SAVE_SCHEMA_VERSION } from "./types.js";

describe("schema 26 migration + integrity", () => {
  it("migrateSaveV25ToV26 seeds salience and nomination metadata defaults", () => {
    const migrated = migrateSaveV25ToV26({
      schemaVersion: 25,
      contentVersion: "x",
      scenarioId: "terena",
      simulation: {
        schemaVersion: 25,
        partyStates: {
          PARTY_LAB: {
            partyId: "PARTY_LAB",
            publicPlatform: { updatedDate: "2028-01-01", positions: {}, history: [] },
          },
        },
        partyContests: {
          CONTEST000001: {
            id: "CONTEST000001",
            type: "assembly_nomination",
            winnerId: "NPC001",
            metadata: { electionId: "E1", constituencyId: "C1" },
          },
        },
      },
    }) as {
      schemaVersion: number;
      simulation: {
        partyStates: { PARTY_LAB: { publicPlatform: { salience: unknown } } };
        partyContests: {
          CONTEST000001: { metadata: { winnerIds: string[]; nominationSlots: number } };
        };
      };
    };
    expect(migrated.schemaVersion).toBe(26);
    expect(migrated.simulation.partyStates.PARTY_LAB.publicPlatform.salience).toEqual({});
    expect(migrated.simulation.partyContests.CONTEST000001.metadata.winnerIds).toEqual(["NPC001"]);
    expect(migrated.simulation.partyContests.CONTEST000001.metadata.nominationSlots).toBe(1);
  });

  it("loads a fresh serialize through parse at schema 26", () => {
    expect(SAVE_SCHEMA_VERSION).toBe(26);
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "schema26-roundtrip",
      playerPoliticianId: "NPC146",
    });
    const save = sim.serializeSave();
    expect(save.schemaVersion).toBe(26);
    const parsed = parseSaveFile(save, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const findings = auditSimulationIntegrity(world, parsed.save.simulation);
    expect(integrityErrorCount(findings)).toBe(0);
  });
});
