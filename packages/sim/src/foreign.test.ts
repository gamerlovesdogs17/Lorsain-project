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
import { proposeTreaty, evaluateCounterpartyAcceptance } from "./foreign/treaties.js";
import {
  advanceTreatyAfterCounterpartyAcceptance,
  processTreatyRatificationVotes,
} from "./foreign/treaty-ratification.js";
import { canProposeTreaty } from "./foreign/treaty-identity.js";
import { applyActiveTreatyEffects } from "./foreign/treaty-effects.js";
import { processOrganizationForeignReactions } from "./foreign/organization-foreign-bridge.js";
import { processNpcTerenaWarPowers } from "./foreign/npc-war-powers.js";
import { stageIsRipe } from "./legislature/procedure.js";
import { imposeSanctions, liftSanctions } from "./foreign/sanctions.js";
import {
  escalateCrisis,
  transitionActive,
  publicActiveCrises,
  processCrisisLifecycle,
} from "./foreign/crises.js";
import { checkCrisisEmergence } from "./foreign/crisis-emergence.js";
import { beginConflictFromCrisisWithWarTrigger } from "./foreign/conflicts.js";
import { resolveCountryLeaderDisplay, processLeadershipChanges } from "./foreign/leaders.js";
import { resolveWarTriggerConflictId } from "./foreign/war-powers-bridge.js";
import {
  isSecurityCouncilVetoPower,
  processInstitutionsMonth,
} from "./foreign/institutions.js";
import { addMonths } from "./calendar.js";
import { createRngService } from "./rng.js";
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

function proposeTreatyOk(
  state: SimState,
  args: Parameters<typeof proposeTreaty>[1],
  commandId: string | null,
) {
  const out = proposeTreaty(state, args, commandId);
  if ("error" in out) throw new Error(out.error.message);
  return out;
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
    expect(Object.keys(runtime.countries)).toHaveLength(48);
    expect(runtime.countries.W41).toBeDefined();
    expect(runtime.countries.W41?.leaderId).toBeNull();
    expect(runtime.countries.W41?.posture).toBe("normal");
    expect(runtime.countries.W41?.institutionIds).toContain("INT_DC");
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
    expect(hashCanonical(a.getSnapshot().foreignAffairsRuntime)).toBe(
      hashCanonical(b.getSnapshot().foreignAffairsRuntime),
    );
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
          pendingIncomingDiplomacy: [],
          diplomaticActionsThisMonth: 0,
          lastMonthProcessed: null,
          warTriggerArmedByConflictId: null,
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
    expect(Object.keys(restoredA.getSnapshot().foreignAffairsRuntime.countries)).toHaveLength(48);
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
    const { treaty, events } = proposeTreatyOk(
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
    expect(events.some((e) => e.type === "TREATY_PROPOSED")).toBe(true);
    treaty.status = "ratification_pending";
    treaty.ratificationStatus = "pending";
    treaty.counterpartyResponses.W13 = "accepted";
    const voteId = "LV00001";
    treaty.ratificationVoteId = voteId;
    snap.foreignAffairsRuntime.treatyRatifications["TRV00001"] = {
      treatyId: treaty.id,
      voteId,
      introducedDate: snap.currentDate,
      voteReadyDate: snap.currentDate,
      status: "pending",
    };
    snap.counters.nextTreatyRatificationId = 2;
    snap.counters.nextLegislativeVoteId = 2;
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
    const snap = sim.getSnapshot();
    const runtime = snap.foreignAffairsRuntime;
    expect(runtime.pendingPresidentialActions).toHaveLength(0);
    expect(Object.values(runtime.diplomaticActions).every((a) => a.initiator !== "player")).toBe(
      true,
    );
    const playerStillPresident =
      currentPresidentialAuthorityId(world, snap) === "NPC001";
    if (playerStillPresident) {
      expect(
        Object.values(runtime.sanctions).every((s) => s.imposerId !== TERENA_WORLD_ID),
      ).toBe(true);
      expect(
        Object.values(runtime.treaties).every(
          (t) => t.metadata.preexisting === true || t.proposerId !== TERENA_WORLD_ID,
        ),
      ).toBe(true);
    }
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

describe("Phase 10.1 foreign affairs functional completion", () => {
  it("allows President Mara Velic to impose sanctions on W40", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR101-SANC" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    const r = sim.executeCommand({
      type: "IMPOSE_SANCTIONS",
      actorId: "NPC001",
      targetCountryId: "W40",
      severity: 0.45,
    });
    expect(r.ok).toBe(true);
    const snap = sim.getSnapshot();
    const sanction = Object.values(snap.foreignAffairsRuntime.sanctions).find(
      (s) => s.imposerId === TERENA_WORLD_ID && s.targetId === "W40" && s.active,
    );
    expect(sanction).toBeTruthy();
    expect(snap.history.some((e) => e.type === "SANCTIONS_IMPOSED")).toBe(true);
    expect(snap.foreignAffairsRuntime.diplomaticActionsThisMonth).toBe(1);
  });

  it("allows President Mara Velic to adjust Terena military posture", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR101-POST" });
    const heightened = sim.executeCommand({
      type: "ADJUST_MILITARY_POSTURE",
      actorId: "NPC001",
      posture: "heightened",
    });
    expect(heightened.ok).toBe(true);
    expect(sim.getSnapshot().foreignAffairsRuntime.countries.W41?.posture).toBe("heightened");
    const normal = sim.executeCommand({
      type: "ADJUST_MILITARY_POSTURE",
      actorId: "NPC001",
      posture: "normal",
    });
    expect(normal.ok).toBe(true);
    expect(sim.getSnapshot().foreignAffairsRuntime.countries.W41?.posture).toBe("normal");
  });

  it("does not settle a crisis when escalating from active", () => {
    const crisis = {
      id: "ICR00099",
      stage: "active" as const,
      participantIds: ["W40", TERENA_WORLD_ID],
      focalPairKey: bilateralKey("W40", TERENA_WORLD_ID),
      startedDate: "2028-01-01" as const,
      lastStageChange: "2028-01-01" as const,
      intensity: 0.7,
      metadata: {},
    };
    escalateCrisis(crisis, "2028-02-01");
    expect(crisis.stage).not.toBe("settled");
    expect(["conflict", "deescalating"]).toContain(crisis.stage);
    transitionActive(crisis, "2028-03-01", "conflict");
    expect(crisis.stage).toBe("conflict");
  });

  it("emits structured events for consequential crisis stage changes", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR101-CRIS-EV" });
    const base = jsonClone(sim.getSnapshot());
    let found = false;
    for (let i = 0; i < 64 && !found; i += 1) {
      const snap = jsonClone(base);
      snap.foreignAffairsRuntime.crises["ICR00099"] = {
        id: "ICR00099",
        stage: "incident",
        participantIds: ["W05", "W06"],
        focalPairKey: bilateralKey("W05", "W06"),
        startedDate: snap.currentDate,
        lastStageChange: snap.currentDate,
        intensity: 0.45,
        metadata: { test: true },
      };
      const rng = createRngService(`FOR101-CRIS-EV-${i}`);
      const events = processCrisisLifecycle(world, snap, rng, snap.currentDate, "CMD00001");
      found = events.some((e) => e.type.startsWith("FOREIGN_CRISIS_"));
    }
    expect(found).toBe(true);
  });

  it("can allocate a new crisis from high-tension conditions", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR101-EMERGE" });
    const snap = jsonClone(sim.getSnapshot());
    const key = bilateralKey("W05", "W06");
    const rel = snap.foreignAffairsRuntime.bilateralRelations[key];
    expect(rel).toBeTruthy();
    rel!.securityTension = 0.95;
    rel!.general = -60;
    snap.foreignAffairsRuntime.countries.W05!.posture = "mobilized";
    snap.foreignAffairsRuntime.countries.W06!.posture = "heightened";
    const before = Object.keys(snap.foreignAffairsRuntime.crises).length;
    const rng = createRngService("FOR101-EMERGE-LOCAL");
    for (let i = 0; i < 48; i += 1) {
      const emerged = checkCrisisEmergence(world, snap, rng, snap.currentDate);
      if (emerged.length > 0) break;
    }
    expect(Object.keys(snap.foreignAffairsRuntime.crises).length).toBeGreaterThan(before);
  });

  it("rejects hostile mutual-defense treaties without counterparty consent", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR101-TREATY" });
    const snap = jsonClone(sim.getSnapshot());
    const { treaty } = proposeTreatyOk(
      snap,
      {
        proposerId: TERENA_WORLD_ID,
        kind: "mutual_defense",
        title: "Terena–Vaskara Defense Pact",
        memberIds: [TERENA_WORLD_ID, "W40"],
        requiresRatification: true,
      },
      null,
    );
    expect(treaty.status).toBe("counterparty_pending");
    expect(treaty.ratificationStatus).not.toBe("pending");
    let rejected = false;
    for (let i = 0; i < 24 && !rejected; i += 1) {
      const rng = createRngService(`FOR101-TREATY-REJ-${i}`);
      const decision = evaluateCounterpartyAcceptance(world, snap, treaty, "W40", rng);
      if (decision === "rejected") rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("records foreign AI diplomatic actions toward Terena over 27 months", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR101-AI-W41" });
    advanceHandsOff(sim, MONTHS_BEFORE_ASSEMBLY);
    const towardTerena = Object.values(sim.getSnapshot().foreignAffairsRuntime.diplomaticActions).filter(
      (a) =>
        a.initiator === "ai" &&
        (a.targetCountryId === TERENA_WORLD_ID || a.actorCountryId === TERENA_WORLD_ID),
    );
    expect(towardTerena.length).toBeGreaterThan(0);
    expect(
      towardTerena.every(
        (a) => !(a.actorCountryId === TERENA_WORLD_ID && a.metadata.npcPresident !== true),
      ),
    ).toBe(true);
  });

  it("can begin conflict from severe crisis and arm Terena war trigger for player President", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR101-WAR" });
    const snap = jsonClone(sim.getSnapshot());
    const crisis = {
      id: "ICR00098",
      stage: "active" as const,
      participantIds: ["W40", TERENA_WORLD_ID],
      focalPairKey: bilateralKey("W40", TERENA_WORLD_ID),
      startedDate: snap.currentDate,
      lastStageChange: snap.currentDate,
      intensity: 0.85,
      metadata: { aggressorId: "W40" },
    };
    snap.foreignAffairsRuntime.crises[crisis.id] = crisis;
    const { conflict, events } = beginConflictFromCrisisWithWarTrigger(
      world,
      snap,
      crisis,
      snap.currentDate,
      "CMD00001",
      "W40",
    );
    expect(conflict.belligerentIds).toContain(TERENA_WORLD_ID);
    expect(events.some((e) => e.type === "INTERNATIONAL_CONFLICT_STARTED")).toBe(true);
    expect(resolveWarTriggerConflictId(snap)).toBe(conflict.id);
    expect(snap.executiveRuntime.warTrigger).toBe(true);
    expect(collectPlayerActionableDecisions(world, snap).some((d) => d.kind === "war_powers")).toBe(
      true,
    );
  });

  it("resolves runtime leader display after foreign leadership change", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR101-LEAD-UI" });
    const snap = jsonClone(sim.getSnapshot());
    const runtime = snap.foreignAffairsRuntime.countries.W05!;
    runtime.metadata.activeLeader = { name: "Test Leader", title: "President" };
    runtime.leaderId = "FLD_W05_REPLACEMENT";
    const display = resolveCountryLeaderDisplay(world, snap, "W05");
    expect(display?.name).toBe("Test Leader");
    const terenaDisplay = resolveCountryLeaderDisplay(world, snap, TERENA_WORLD_ID);
    expect(terenaDisplay?.title).toBe("President");
  });

  it("excludes latent crises from public active crisis counts", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR101-LATENT" });
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    const latent = Object.values(runtime.crises).filter((c) => c.stage === "latent");
    expect(latent.length).toBeGreaterThan(0);
    expect(publicActiveCrises(runtime).every((c) => c.stage !== "latent")).toBe(true);
  });

  it("allows AI sanctions to be lifted when relations improve", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR101-LIFT" });
    const snap = jsonClone(sim.getSnapshot());
    imposeSanctions(
      snap,
      { imposerId: "W13", targetId: "W05", severity: 0.4 },
      "CMD00001",
    );
    const rel = snap.foreignAffairsRuntime.bilateralRelations[bilateralKey("W13", "W05")]!;
    rel.general = 25;
    const out = liftSanctions(snap, { imposerId: "W13", targetId: "W05" }, "CMD00002");
    expect("events" in out).toBe(true);
    if ("events" in out) {
      expect(out.events.some((e) => e.type === "SANCTIONS_LIFTED")).toBe(true);
    }
  });

  it("arms war trigger for MP player without granting presidential player control", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-WAR-MP" });
    const snap = jsonClone(sim.getSnapshot());
    expect(currentPresidentialAuthorityId(world, snap)).not.toBe("NPC030");
    const crisis = {
      id: "ICR00097",
      stage: "active" as const,
      participantIds: ["W40", TERENA_WORLD_ID],
      focalPairKey: bilateralKey("W40", TERENA_WORLD_ID),
      startedDate: snap.currentDate,
      lastStageChange: snap.currentDate,
      intensity: 0.85,
      metadata: { aggressorId: "W40" },
    };
    snap.foreignAffairsRuntime.crises[crisis.id] = crisis;
    beginConflictFromCrisisWithWarTrigger(world, snap, crisis, snap.currentDate, "CMD00001", "W40");
    expect(snap.executiveRuntime.warTrigger).toBe(true);
    expect(resolveWarTriggerConflictId(snap)).toBeTruthy();
    expect(collectPlayerActionableDecisions(world, snap).some((d) => d.kind === "war_powers")).toBe(
      false,
    );
  });

  it("blocks duplicate treaty proposals for the same pair and kind", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-DUP" });
    const snap = jsonClone(sim.getSnapshot());
    proposeTreatyOk(snap, {
      proposerId: "W05",
      kind: "trade",
      title: "W05–W41 Trade",
      memberIds: ["W05", TERENA_WORLD_ID],
      requiresRatification: false,
    }, null);
    const gate = canProposeTreaty(snap.foreignAffairsRuntime, "trade", ["W05", TERENA_WORLD_ID], snap.currentDate);
    expect(gate.ok).toBe(false);
    const dup = proposeTreaty(
      snap,
      {
        proposerId: "W05",
        kind: "trade",
        title: "Duplicate",
        memberIds: ["W05", TERENA_WORLD_ID],
        requiresRatification: false,
      },
      null,
    );
    expect("error" in dup).toBe(true);
  });

  it("defers treaty ratification tally until the vote-ready month", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-RAT-TIME" });
    const snap = jsonClone(sim.getSnapshot());
    const { treaty } = proposeTreatyOk(
      snap,
      {
        proposerId: TERENA_WORLD_ID,
        kind: "mutual_defense",
        title: "Terena–Alvari Defense",
        memberIds: [TERENA_WORLD_ID, "W13"],
        requiresRatification: true,
        skipCounterparty: true,
      },
      null,
    );
    treaty.counterpartyResponses.W13 = "accepted";
    advanceTreatyAfterCounterpartyAcceptance(snap, treaty, "CMD00001");
    expect(treaty.status).toBe("ratification_pending");
    expect(stageIsRipe(snap, snap.foreignAffairsRuntime.treatyRatifications[Object.keys(snap.foreignAffairsRuntime.treatyRatifications)[0]!]!.voteReadyDate)).toBe(false);
    const rng = createRngService("FOR102-RAT-TIME-VOTE");
    processTreatyRatificationVotes(world, snap, rng, "CMD00002");
    expect(treaty.status).toBe("ratification_pending");
    expect(Object.keys(snap.legislatureRuntime.legislativeVotes)).toHaveLength(0);
  });

  it("applies bilateral treaty effects once even with duplicate active records", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-STACK" });
    const snap = jsonClone(sim.getSnapshot());
    const key = bilateralKey("W05", "W06");
    const before = snap.foreignAffairsRuntime.bilateralRelations[key]!.economicTies;
    for (let i = 0; i < 3; i += 1) {
      snap.foreignAffairsRuntime.treaties[`TRT0000${i + 1}`] = {
        id: `TRT0000${i + 1}`,
        kind: "trade",
        title: `Dup ${i}`,
        proposerId: "W05",
        memberIds: ["W05", "W06"],
        signedDate: snap.currentDate,
        status: "active",
        ratificationStatus: "not_required",
        ratificationVoteId: null,
        counterpartyResponses: {},
        metadata: {},
      };
    }
    applyActiveTreatyEffects(snap, snap.currentDate);
    const afterOne = snap.foreignAffairsRuntime.bilateralRelations[key]!.economicTies;
    applyActiveTreatyEffects(snap, snap.currentDate);
    const afterTwo = snap.foreignAffairsRuntime.bilateralRelations[key]!.economicTies;
    expect(afterOne - before).toBeGreaterThan(0);
    expect(afterTwo - afterOne).toBe(0);
  });

  it("reacts to same-month foreign sanctions through the post-foreign organization bridge", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-ORG" });
    const snap = jsonClone(sim.getSnapshot());
    const businessOrgId = "ORG_MAN";
    snap.organizationRuntime.actors = {
      [businessOrgId]: {
        id: businessOrgId,
        influence: 0.5,
        resources: 0.5,
        publicPositions: {},
        relationships: {},
        billPressure: [],
        endorsements: [],
        cooldownUntil: null,
        lastActionMonth: null,
        recentActions: [],
      },
    };
    if (!world.interestOrganizations[businessOrgId]) {
      world.interestOrganizations[businessOrgId] = {
        id: businessOrgId,
        name: "National Manufacturers Council",
        type: "business",
        lean: "centre-right",
        strength: 0.7,
        issues: ["ISS_TRADE"],
        leanPartyIds: [],
      };
    }
    const sanctionEvent = {
      date: snap.currentDate,
      type: "SANCTIONS_IMPOSED",
      importance: 0.7,
      visibility: "public" as const,
      actorIds: ["W40"],
      entityIds: ["W05"],
      payload: {},
      sourceScheduledEventId: null,
      sourceCommandId: null,
    };
    const reactions = processOrganizationForeignReactions(snap, world, "CMD00001", [sanctionEvent]);
    expect(reactions.some((e) => e.type === "ORGANIZATION_FOREIGN_REACTION")).toBe(true);
    const again = processOrganizationForeignReactions(snap, world, "CMD00002", [sanctionEvent]);
    expect(again).toHaveLength(0);
  });

  it("allows NPC President to invoke war powers when player is an MP", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-NPC-WAR" });
    const snap = jsonClone(sim.getSnapshot());
    snap.executiveRuntime.warTrigger = true;
    snap.foreignAffairsRuntime.warTriggerArmedByConflictId = "CNF00001";
    snap.foreignAffairsRuntime.conflicts.CNF00001 = {
      id: "CNF00001",
      belligerentIds: ["W40", TERENA_WORLD_ID],
      aggressorId: "W40",
      startedDate: snap.currentDate,
      endedDate: null,
      intensity: 0.9,
      crisisId: null,
      objectives: ["border_security"],
      balance: 0.55,
      politicalCost: 0.4,
      outcome: null,
      ceasefireDate: null,
      warPowerId: null,
      metadata: {},
    };
    let begun = false;
    for (let i = 0; i < 24; i += 1) {
      const events = processNpcTerenaWarPowers(
        world,
        snap,
        createRngService(`FOR102-NPC-WAR-${i}`),
        "CMD00001",
      );
      if (events.some((e) => e.type === "WAR_POWERS_BEGUN")) {
        begun = true;
        break;
      }
    }
    expect(begun).toBe(true);
    const warIds = Object.keys(snap.executiveRuntime.warPowers);
    expect(warIds.length).toBe(1);
    const warId = warIds[0]!;
    expect(snap.foreignAffairsRuntime.conflicts.CNF00001?.warPowerId).toBe(warId);
    const authMotions = Object.values(snap.executiveRuntime.motions).filter(
      (m) => m.kind === "war_authorization" && m.targetId === warId,
    );
    expect(authMotions).toHaveLength(1);
    expect(authMotions[0]!.metadata.constitutionalReferral).toBe(true);
    expect(authMotions[0]!.sponsorId).not.toBe(
      currentPresidentialAuthorityId(world, snap),
    );
    expect(
      snap.history.some(
        (e) => e.type === "ASSEMBLY_MOTION_INTRODUCED" && e.payload.kind === "war_authorization",
      ),
    ).toBe(true);
  });

  it("completes treaty ratification end-to-end without DecisionContractError", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-RAT-E2E" });
    const snap = jsonClone(sim.getSnapshot());
    const { treaty } = proposeTreatyOk(
      snap,
      {
        proposerId: TERENA_WORLD_ID,
        kind: "mutual_defense",
        title: "Terena–Graeven Defense Pact",
        memberIds: [TERENA_WORLD_ID, "W13"],
        requiresRatification: true,
        skipCounterparty: true,
      },
      null,
    );
    treaty.counterpartyResponses.W13 = "accepted";
    advanceTreatyAfterCounterpartyAcceptance(snap, treaty, "CMD00001");
    expect(treaty.status).toBe("ratification_pending");
    const rat = Object.values(snap.foreignAffairsRuntime.treatyRatifications)[0]!;
    expect(stageIsRipe(snap, rat.voteReadyDate)).toBe(false);
    expect(() =>
      processTreatyRatificationVotes(world, snap, createRngService("FOR102-RAT-E2E-A"), "CMD00002"),
    ).not.toThrow();
    expect(treaty.status).toBe("ratification_pending");
    expect(Object.keys(snap.legislatureRuntime.legislativeVotes)).toHaveLength(0);

    snap.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id] = {
      treatyId: treaty.id,
      choice: "yes",
    };
    snap.currentDate = addMonths(snap.currentDate, 1);
    expect(stageIsRipe(snap, rat.voteReadyDate)).toBe(true);
    expect(() =>
      processTreatyRatificationVotes(world, snap, createRngService("FOR102-RAT-E2E-B"), "CMD00003"),
    ).not.toThrow();
    const vote = snap.legislatureRuntime.legislativeVotes[rat.voteId];
    expect(vote).toBeTruthy();
    expect(vote!.votes.NPC030).toBe("yes");
    expect(vote!.threshold).toBe("simple_majority_cast");
    expect(vote!.metadata.displayTitle).toContain("Treaty ratification:");
    expect(snap.foreignAffairsRuntime.pendingPlayerTreatyVotes[treaty.id]).toBeUndefined();
    expect(["active", "rejected"]).toContain(treaty.status);
    if (treaty.status === "active") {
      expect(vote!.passed).toBe(true);
      expect(vote!.yes).toBeGreaterThan(vote!.no);
    } else {
      expect(vote!.passed).toBe(false);
      expect(vote!.yes).toBeLessThanOrEqual(vote!.no);
    }
  });

  it("seeds canonical WA and LTO membership with correct Security Council vetoes", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-INST" });
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    const waMembers = Object.values(runtime.countries).filter((c) =>
      c.institutionIds.includes("INT_WA"),
    );
    const ltoMembers = Object.values(runtime.countries).filter((c) =>
      c.institutionIds.includes("INT_LTO"),
    );
    expect(waMembers).toHaveLength(48);
    expect(ltoMembers).toHaveLength(43);
    expect(runtime.countries.W40?.institutionIds).toContain("INT_LTO");
    expect(runtime.countries.W24?.institutionIds).toContain("INT_LTO");
    expect(isSecurityCouncilVetoPower(world, "W24")).toBe(true);
    expect(isSecurityCouncilVetoPower(world, "W28")).toBe(true);
    expect(isSecurityCouncilVetoPower(world, "W37")).toBe(true);
    expect(isSecurityCouncilVetoPower(world, "W40")).toBe(true);
    expect(isSecurityCouncilVetoPower(world, "W13")).toBe(false);
  });

  it("can file and advance an LTO dispute between LTO members", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-LTO" });
    const snap = jsonClone(sim.getSnapshot());
    expect(snap.foreignAffairsRuntime.countries.W40?.institutionIds).toContain("INT_LTO");
    expect(snap.foreignAffairsRuntime.countries.W05?.institutionIds).toContain("INT_LTO");
    snap.foreignAffairsRuntime.sanctions.SAN00001 = {
      id: "SAN00001",
      imposerId: "W40",
      targetId: "W05",
      imposedDate: snap.currentDate,
      liftedDate: null,
      severity: 0.6,
      economicWeight: 0.4,
      scope: "sectoral",
      active: true,
      metadata: {},
    };
    let filed = false;
    for (let i = 0; i < 40; i += 1) {
      const events = processInstitutionsMonth(
        world,
        snap,
        createRngService(`FOR102-LTO-${i}`),
        "CMD00001",
      );
      if (events.some((e) => e.type === "LTO_DISPUTE_FILED")) {
        filed = true;
        break;
      }
    }
    expect(filed).toBe(true);
    const dispute = Object.values(snap.foreignAffairsRuntime.institutionRuntime.ltoDisputes)[0]!;
    expect(dispute.stage).toBe("filed");
    for (let i = 0; i < 20; i += 1) {
      processInstitutionsMonth(world, snap, createRngService(`FOR102-LTO-ADV-${i}`), "CMD00002");
      if (dispute.stage === "settled" || dispute.stage === "failed" || dispute.stage === "ruling") {
        break;
      }
    }
    expect(["consultation", "settled", "ruling", "failed"]).toContain(dispute.stage);
  });

  it("applies bounded WA consequences and honors great-power vetoes", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-WA" });
    const snap = jsonClone(sim.getSnapshot());
    snap.foreignAffairsRuntime.conflicts.CNF00099 = {
      id: "CNF00099",
      belligerentIds: ["W40", "W05"],
      aggressorId: "W40",
      startedDate: snap.currentDate,
      endedDate: null,
      intensity: 0.8,
      crisisId: null,
      objectives: ["border_security"],
      balance: 0.5,
      politicalCost: 0.3,
      outcome: null,
      ceasefireDate: null,
      warPowerId: null,
      metadata: {},
    };
    const before = snap.foreignAffairsRuntime.conflicts.CNF00099!.intensity;
    let saw = false;
    for (let i = 0; i < 60; i += 1) {
      const events = processInstitutionsMonth(
        world,
        snap,
        createRngService(`FOR102-WA-${i}`),
        "CMD00001",
      );
      const wa = events.find((e) => e.type === "WORLD_ASSEMBLY_ACTION");
      if (wa) {
        saw = true;
        if (wa.payload.vetoBlocked) {
          expect(["W24", "W28", "W37", "W40"]).toContain(wa.payload.vetoActorId);
          expect(wa.payload.vetoActorId).not.toBe("W13");
        } else if (wa.payload.outcome === "mediation_request") {
          expect(snap.foreignAffairsRuntime.conflicts.CNF00099!.intensity).toBeLessThan(before);
        }
        break;
      }
    }
    expect(saw).toBe(true);
  });

  it("does not emit same-name fake leadership replacements", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-LEAD" });
    const snap = jsonClone(sim.getSnapshot());
    const beforeNames = new Map(
      Object.entries(snap.foreignAffairsRuntime.countries).map(([id]) => [
        id,
        resolveCountryLeaderDisplay(world, snap, id)?.name ?? null,
      ]),
    );
    const changed = processLeadershipChanges(
      world,
      snap,
      createRngService("FOR102-LEAD-A"),
      snap.currentDate,
    );
    for (const leader of changed) {
      const previous = beforeNames.get(leader.countryId);
      expect(leader.name).not.toBe(previous);
    }
    const queen = resolveCountryLeaderDisplay(world, snap, "W03");
    expect(queen?.title).toMatch(/Queen|King|Grand|Prince|Duke/i);
  });

  it("spreads leadership reviews from canonical since_year rather than a synchronized wave", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR102-LEAD-DIST" });
    const snap = sim.getSnapshot();
    const reviews = Object.values(snap.foreignAffairsRuntime.countries)
      .map((c) => (c.metadata.leadership as { nextReview?: string } | undefined)?.nextReview)
      .filter((d): d is string => typeof d === "string");
    expect(reviews.length).toBeGreaterThan(30);
    const uniqueMonths = new Set(reviews.map((d) => d.slice(0, 7)));
    expect(uniqueMonths.size).toBeGreaterThan(6);
  });
});
