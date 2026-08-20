import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { hashCanonical, jsonClone } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "./terena-party-input.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld, type SimState } from "./types.js";
import { CANONICAL_TERENA_RELATIONS } from "./foreign/baseline.js";
import { bilateralKey } from "./foreign/state.js";
import { TERENA_WORLD_ID } from "./foreign/types.js";
import { proposeTreaty } from "./foreign/treaties.js";
import { collectPlayerActionableDecisions } from "./player-decisions.js";
import { currentPresidentialAuthorityId } from "./executive/state.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const FOREIGN_HISTORY_TYPES = new Set([
  "FOREIGN_AFFAIRS_MONTH",
  "FOREIGN_LEADERSHIP_CHANGE",
  "FOREIGN_OUTREACH",
  "DIPLOMATIC_OUTREACH",
  "DIPLOMATIC_SUMMIT",
  "DIPLOMATIC_WARNING",
  "SANCTIONS_IMPOSED",
  "SANCTIONS_LIFTED",
  "TREATY_PROPOSED",
  "TREATY_RATIFICATION_PENDING",
  "TREATY_RATIFIED",
  "TREATY_REJECTED",
  "MILITARY_POSTURE_CHANGED",
  "CRISIS_ESCALATED",
  "CRISIS_DEESCALATED",
  "CONFLICT_BEGAN",
  "CONFLICT_ENDED",
]);

function loadTerenaWorld(): KernelWorld {
  const bundle = loadContentBundleFromRepo(repoRoot);
  const input = {
    contentVersion: bundle.manifest.content_version,
    scenario: jsonClone(bundle.content.scenario),
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    offices: bundle.content.terena_offices.offices,
    constitution: jsonClone(bundle.content.terena_constitution),
    administrations: bundle.content.terena_presidential_administrations.administrations,
    ...terenaPartyFields({
      parties: bundle.content.terena_parties.parties,
      nominationRules: bundle.content.terena_nomination_rules.rules,
      provinceFeatures: bundle.content.terena_provinces.features,
      constituencyFeatures: bundle.content.terena_constituencies.features,
    }),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle),
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

const MONTHS_BEFORE_ASSEMBLY = 27;

function advanceHandsOff(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (!r.interrupt) continue;
    if (r.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") {
      expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    if (!r.interrupt.requiresResolution) {
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    if (r.interrupt.resolutionStatus === "resolved") {
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
  }
}

function terenaRelation(state: SimState, countryId: string): number | undefined {
  return state.foreignAffairsRuntime.bilateralRelations[bilateralKey(TERENA_WORLD_ID, countryId)]
    ?.general;
}

function foreignHistoryFingerprint(sim: Simulation): string {
  const snap = sim.getSnapshot();
  const runtime = snap.foreignAffairsRuntime;
  const history = snap.history
    .filter((e) => FOREIGN_HISTORY_TYPES.has(e.type))
    .map((e) => ({
      date: e.date,
      type: e.type,
      entityIds: [...e.entityIds].sort(),
      payload: e.payload,
    }));
  const countries = Object.fromEntries(
    Object.entries(runtime.countries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, c]) => [
        id,
        {
          leaderId: c.leaderId,
          posture: c.posture,
          activeSanctionIds: [...c.activeSanctionIds].sort(),
        },
      ]),
  );
  const crises = Object.values(runtime.crises)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({
      id: c.id,
      stage: c.stage,
      participantIds: [...c.participantIds].sort(),
      intensity: c.intensity,
    }));
  return hashCanonical({ countries, crises, history });
}

function assertNoStrategicGoalsInPublicEvents(world: KernelWorld, state: SimState): void {
  for (const event of state.history) {
    expect(JSON.stringify(event.payload)).not.toContain("strategicGoals");
  }
  for (const decision of collectPlayerActionableDecisions(world, state)) {
    expect(JSON.stringify(decision)).not.toContain("strategicGoals");
  }
}

describe("Phase 10 foreign affairs", () => {
  it("seeds 48 countries and canonical Terena bilateral relations", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-BASE" });
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    expect(Object.keys(world.worldCountries)).toHaveLength(48);
    expect(Object.keys(runtime.countries)).toHaveLength(47);
    expect(runtime.countries.W41).toBeUndefined();
    for (const [countryId, expected] of Object.entries(CANONICAL_TERENA_RELATIONS)) {
      expect(terenaRelation(sim.getSnapshot(), countryId)).toBe(expected);
      expect(runtime.bilateralRelations[bilateralKey(TERENA_WORLD_ID, countryId)]?.general).toBe(
        expected,
      );
    }
  });

  it("starts Vaskara (W40) at heightened posture with a latent Terena crisis", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-VASK" });
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    expect(runtime.countries.W40?.posture).toBe("heightened");
    const latent = Object.values(runtime.crises).find(
      (c) =>
        c.stage === "latent" &&
        c.participantIds.includes("W40") &&
        c.participantIds.includes(TERENA_WORLD_ID),
    );
    expect(latent).toBeTruthy();
    expect(latent?.focalPairKey).toBe(bilateralKey("W40", TERENA_WORLD_ID));
    expect(latent?.metadata.label).toBe("meridian_basin_tension");
  });

  it("reproduces identical foreign history over 27 months for the same seed", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-DET-48" });
    const b = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-DET-48" });
    advanceHandsOff(a, MONTHS_BEFORE_ASSEMBLY);
    advanceHandsOff(b, MONTHS_BEFORE_ASSEMBLY);
    expect(foreignHistoryFingerprint(a)).toBe(foreignHistoryFingerprint(b));
  });

  it("continues identically after save/reload mid-run", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-SAVE" });
    advanceHandsOff(a, 12);
    const save = a.serializeSave();
    const b = restoreSimulation(save, world);
    expect(b.hashState()).toBe(a.hashState());
    advanceHandsOff(a, 12);
    advanceHandsOff(b, 12);
    expect(a.hashState()).toBe(b.hashState());
    expect(foreignHistoryFingerprint(a)).toBe(foreignHistoryFingerprint(b));
  });

  it("migrates schema 9 to 10 deterministically without fabricated foreign history", () => {
    const world = loadTerenaWorld();
    const fresh = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-MIG" });
    advanceHandsOff(fresh, 6);
    const snap = jsonClone(fresh.getSnapshot());
    const historyBeforeMigration = snap.history.length;
    const raw = {
      schemaVersion: 9,
      contentVersion: snap.contentVersion,
      scenarioId: snap.scenarioId,
      simulation: {
        ...snap,
        schemaVersion: 9,
        foreignAffairsRuntime: {
          countries: {},
          bilateralRelations: {},
          treaties: {},
          sanctions: {},
          crises: {},
          conflicts: {},
          diplomaticActions: {},
          treatyRatifications: {},
          pendingPresidentialActions: [],
          pendingPlayerTreatyVotes: {},
          diplomaticActionsThisMonth: 0,
          lastMonthProcessed: null,
        },
      },
    };
    const parsed = parseSaveFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    const restoredA = restoreSimulation(parsed.save, world);
    expect(restoredA.getSnapshot().history).toHaveLength(historyBeforeMigration);
    expect(
      Object.keys(restoredA.getSnapshot().foreignAffairsRuntime.diplomaticActions),
    ).toHaveLength(0);
    expect(Object.keys(restoredA.getSnapshot().foreignAffairsRuntime.countries)).toHaveLength(47);
    const restoredB = restoreSimulation(parsed.save, world);
    for (const [countryId, expected] of Object.entries(CANONICAL_TERENA_RELATIONS)) {
      expect(terenaRelation(restoredA.getSnapshot(), countryId)).toBe(expected);
    }
    advanceHandsOff(restoredA, 6);
    advanceHandsOff(restoredB, 6);
    expect(restoredA.hashState()).toBe(restoredB.hashState());
  });

  it("reproduces leadership change events for the same seed", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-LEAD" });
    const b = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-LEAD" });
    advanceHandsOff(a, MONTHS_BEFORE_ASSEMBLY);
    advanceHandsOff(b, MONTHS_BEFORE_ASSEMBLY);
    const leaderEvents = (sim: Simulation) =>
      sim
        .getSnapshot()
        .history.filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE")
        .map((e) => ({
          date: e.date,
          countryId: e.payload.countryId,
          leaderId: e.payload.leaderId,
          name: e.payload.name,
        }));
    expect(leaderEvents(a)).toEqual(leaderEvents(b));
  });

  it("does not auto-cast treaty ratification votes for the player MP", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-RAT" });
    const snap = jsonClone(sim.getSnapshot());
    const { treaty, events } = proposeTreaty(
      snap,
      {
        proposerId: TERENA_WORLD_ID,
        kind: "mutual_defense",
        title: "Test mutual defense pact",
        memberIds: [TERENA_WORLD_ID, "W13"],
        requiresRatification: true,
      },
      null,
    );
    expect(events.some((e) => e.type === "TREATY_RATIFICATION_PENDING")).toBe(true);
    snap.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id] = {
      treatyId: treaty.id,
      choice: null,
    };
    const withVote = restoreSimulation(
      {
        schemaVersion: SAVE_SCHEMA_VERSION,
        contentVersion: snap.contentVersion,
        scenarioId: snap.scenarioId,
        simulation: snap,
      },
      world,
    );
    advanceHandsOff(withVote, 1);
    expect(withVote.getSnapshot().foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id]?.choice).toBeNull();
  });

  it("does not auto-sanction or auto-treaty when the player is President", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR-PRES" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    advanceHandsOff(sim, MONTHS_BEFORE_ASSEMBLY);
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    expect(runtime.pendingPresidentialActions).toHaveLength(0);
    expect(Object.values(runtime.diplomaticActions).every((a) => a.initiator !== "player")).toBe(
      true,
    );
    expect(
      Object.values(runtime.sanctions).every((s) => s.imposerId !== TERENA_WORLD_ID),
    ).toBe(true);
    expect(
      Object.values(runtime.treaties).every(
        (t) => t.metadata.preexisting === true || t.proposerId !== TERENA_WORLD_ID,
      ),
    ).toBe(true);
  });

  it("keeps strategic goals out of public history and player decision surfaces", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-INFO" });
    advanceHandsOff(sim, 24);
    const snap = sim.getSnapshot();
    expect(Object.values(snap.foreignAffairsRuntime.countries).some((c) => c.strategicGoals.length > 0)).toBe(
      true,
    );
    assertNoStrategicGoalsInPublicEvents(world, snap);
    /**
     * Runtime shape: `foreignAffairsRuntime.countries[id].strategicGoals` is sim-internal AI
     * state. UI layers must not surface it without dedicated intelligence mechanics.
     */
  });
});
