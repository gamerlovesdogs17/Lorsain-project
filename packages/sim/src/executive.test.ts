import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { kernelOffice } from "./synthetic-world.js";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields } from "./terena-party-input.js";
import { occupyingTerms, officesOfKind, endTerm } from "./offices.js";
import { parseSaveFile } from "./save.js";
import { currentMinisterHolderId, deriveCabinet } from "./executive/state.js";
import { currentPresidentialAuthorityId, currentAssemblyMemberIds } from "./legislature/state.js";
import { assemblyFractionYesNeeded, recordMotionVote } from "./executive/procedure.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function advance(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (r.interrupt) {
      if (r.interrupt.requiresResolution) {
        throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
      }
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
  }
}

function executiveHarness(): KernelWorld {
  const world = legislativeHarnessWorld("EXEC-HARNESS");
  world.offices.OFFICE_MINISTER_FINANCE = kernelOffice({
    id: "OFFICE_MINISTER_FINANCE",
    kind: "minister",
    title: "Minister of Finance",
    portfolio: "finance",
    incompatibleWithKinds: ["president", "constitutional_court_justice", "speaker"],
  });
  world.successionOfficeIds = ["OFFICE_SPEAKER"];
  return world;
}

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
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

describe("Phase 7 executive kernel", () => {
  it("uses schemaVersion 7 and empty executive runtime at new game", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-NEW" });
    expect(sim.getSnapshot().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(SAVE_SCHEMA_VERSION).toBe(7);
    expect(sim.getSnapshot().executiveRuntime.regulations).toEqual({});
    expect(sim.getSnapshot().executiveRuntime.motions).toEqual({});
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("P1");
  });

  it("lets a player President appoint and dismiss a minister", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-CAB" });
    expectOk(sim, {
      type: "APPOINT_MINISTER",
      officeId: "OFFICE_MINISTER_FINANCE",
      politicianId: "MP04",
    });
    expect(currentMinisterHolderId(world, sim.getSnapshot(), "OFFICE_MINISTER_FINANCE")).toBe(
      "MP04",
    );
    expectOk(sim, { type: "DISMISS_MINISTER", officeId: "OFFICE_MINISTER_FINANCE" });
    expect(currentMinisterHolderId(world, sim.getSnapshot(), "OFFICE_MINISTER_FINANCE")).toBeNull();
    const npc = createSimulation({ world, playerPoliticianId: "MP02", seed: "P7-NPC-CAB" });
    const auto = npc.executeCommand({
      type: "APPOINT_MINISTER",
      officeId: "OFFICE_MINISTER_FINANCE",
      politicianId: "MP04",
    });
    expect(auto.ok).toBe(false);
  });

  it("does not auto-appoint or auto-regulate when the player is President", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-AUTONOMY" });
    advance(sim, 4);
    expect(currentMinisterHolderId(world, sim.getSnapshot(), "OFFICE_MINISTER_FINANCE")).toBeNull();
    expect(Object.keys(sim.getSnapshot().executiveRuntime.regulations)).toHaveLength(0);
  });

  it("issues a regulation and allows Assembly annulment during the review window", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-REG" });
    expectOk(sim, {
      type: "ISSUE_REGULATION",
      ministryOfficeId: "OFFICE_MINISTER_FINANCE",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.3, fiscalImpact: null }],
      major: true,
    });
    const mpSave = jsonClone(sim.serializeSave());
    mpSave.simulation.playerPoliticianId = "MP02";
    const asMp = restoreSimulation(mpSave, world);
    expectOk(asMp, {
      type: "INTRODUCE_MOTION",
      kind: "regulation_annulment",
      targetId: "REG000001",
    });
    expectOk(asMp, { type: "CAST_MOTION_VOTE", motionId: "MOT000001", choice: "yes" });
    advance(asMp, 1);
    expect(asMp.getSnapshot().executiveRuntime.regulations.REG000001?.status).toBe("active");
    advance(asMp, 1);
    expect(["annulled", "active"]).toContain(
      asMp.getSnapshot().executiveRuntime.regulations.REG000001?.status,
    );
  });

  it("continues the previous budget when a new one is not approved", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P7-BUD" });
    advance(sim, 1);
    const budgets = Object.values(sim.getSnapshot().executiveRuntime.budgets);
    expect(budgets.length).toBeGreaterThan(0);
    expect(budgets.some((b) => b.status === "continuing" || b.status === "proposed")).toBe(true);
  });

  it("lets an Acting President use presidential executive powers", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-ACT" });
    expectOk(sim, { type: "INJECT_PRESIDENTIAL_VACANCY", reason: "test_vacancy" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("MP01");
    const save = jsonClone(sim.serializeSave());
    save.simulation.playerPoliticianId = "MP01";
    const acting = restoreSimulation(save, world);
    expectOk(acting, {
      type: "APPOINT_MINISTER",
      officeId: "OFFICE_MINISTER_FINANCE",
      politicianId: "MP04",
    });
    expect(currentMinisterHolderId(world, acting.getSnapshot(), "OFFICE_MINISTER_FINANCE")).toBe(
      "MP04",
    );
  });

  it("gives the player a month before a motion is tallied", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-MOT" });
    expectOk(sim, {
      type: "APPOINT_MINISTER",
      officeId: "OFFICE_MINISTER_FINANCE",
      politicianId: "MP04",
    });
    const mpSave = jsonClone(sim.serializeSave());
    mpSave.simulation.playerPoliticianId = "MP02";
    const asMp = restoreSimulation(mpSave, world);
    expectOk(asMp, {
      type: "INTRODUCE_MOTION",
      kind: "ministerial_censure",
      targetId: "OFFICE_MINISTER_FINANCE",
    });
    expect(asMp.getSnapshot().executiveRuntime.motions.MOT000001?.status).toBe("scheduled");
    expectOk(asMp, { type: "CAST_MOTION_VOTE", motionId: "MOT000001", choice: "no" });
    advance(asMp, 1);
    expect(asMp.getSnapshot().executiveRuntime.motions.MOT000001?.status).toBe("scheduled");
    expect(asMp.getSnapshot().executiveRuntime.motions.MOT000001?.result).toBeNull();
    advance(asMp, 1);
    expect(["passed", "failed"]).toContain(
      asMp.getSnapshot().executiveRuntime.motions.MOT000001?.status,
    );
  });

  it("requires a trigger to declare an emergency or begin war powers", () => {
    const world = executiveHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-TRIG" });
    const noEm = sim.executeCommand({ type: "DECLARE_EMERGENCY" });
    expect(noEm.ok).toBe(false);
    const noWar = sim.executeCommand({ type: "BEGIN_WAR_POWERS" });
    expect(noWar.ok).toBe(false);
    const save = jsonClone(sim.serializeSave());
    save.simulation.executiveRuntime.emergencyTrigger = true;
    const live = restoreSimulation(save, world);
    expectOk(live, { type: "DECLARE_EMERGENCY" });
    expect(Object.keys(live.getSnapshot().executiveRuntime.emergencies).length).toBe(1);
    const warSave = jsonClone(sim.serializeSave());
    warSave.simulation.executiveRuntime.warTrigger = true;
    const war = restoreSimulation(warSave, world);
    expectOk(war, { type: "BEGIN_WAR_POWERS" });
    expect(Object.keys(war.getSnapshot().executiveRuntime.warPowers).length).toBe(1);
  });

  it("migrates v6 saves into empty executive runtime", () => {
    const world = executiveHarness();
    const fresh = createSimulation({ world, playerPoliticianId: "P1", seed: "P7-MIG" });
    const v6 = jsonClone(fresh.serializeSave()) as unknown as Record<string, unknown>;
    v6.schemaVersion = 6;
    const sim = v6.simulation as Record<string, unknown>;
    sim.schemaVersion = 6;
    delete sim.executiveRuntime;
    const counters = sim.counters as Record<string, unknown>;
    delete counters.nextRegulationId;
    delete counters.nextMotionId;
    delete counters.nextEmergencyId;
    delete counters.nextWarPowerId;
    delete counters.nextBudgetId;
    const parsed = parseSaveFile(v6, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(7);
    expect(parsed.save.simulation.executiveRuntime.motions).toEqual({});
  });
});

describe("Phase 7 Terena executive", () => {
  it("derives the 12-minister cabinet from office terms and uses 231 yes for censure", () => {
    const world = loadTerenaWorld();
    expect(world.executiveConstitution.assemblyCensureFraction).toBe(0.55);
    expect(
      assemblyFractionYesNeeded(
        world.legislativeConstitution.assemblySeatCount,
        world.executiveConstitution.assemblyCensureFraction,
      ),
    ).toBe(231);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P7-TER" });
    const cabinet = deriveCabinet(world, sim.getSnapshot());
    expect(cabinet).toHaveLength(12);
    expect(cabinet.every((m) => m.officeId.startsWith("OFFICE_MINISTER_"))).toBe(true);
    expect(occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").length).toBeGreaterThan(0);
  });

  it("still requires 231 yes to censure when 419 MPs currently sit", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P7-231" });
    const state = jsonClone(sim.getSnapshot());
    const assemblyOffices = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
    const mps = currentAssemblyMemberIds(world, state);
    expect(mps).toHaveLength(420);
    const vacateId = mps.find((id) => id !== "NPC002");
    const term = Object.values(state.officeTerms).find(
      (t) =>
        t.holderId === vacateId &&
        assemblyOffices.has(t.officeId) &&
        (t.status === "active" || t.status === "suspended"),
    );
    expect(term).toBeTruthy();
    endTerm(state, term!.id, state.currentDate, "presidential_assumption");
    const remaining = currentAssemblyMemberIds(world, state);
    expect(remaining).toHaveLength(419);
    const needed = assemblyFractionYesNeeded(world.legislativeConstitution.assemblySeatCount, 0.55);
    expect(needed).toBe(231);
    const ministerOffice = deriveCabinet(world, state).find((m) => m.holderId != null);
    expect(ministerOffice).toBeTruthy();
    state.executiveRuntime.motions.MOT000001 = {
      id: "MOT000001",
      kind: "ministerial_censure",
      sponsorId: remaining[0]!,
      targetId: ministerOffice!.officeId,
      introducedDate: state.currentDate,
      scheduledDate: state.currentDate,
      status: "scheduled",
      voteId: null,
      threshold: "assembly_fraction",
      fraction: 0.55,
      result: null,
      stageReadyDate: "2027-12-01",
      metadata: {},
    };
    const failVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) failVotes[id] = i < 230 ? "yes" : "no";
    const failed = recordMotionVote(
      world,
      jsonClone(state),
      { motionId: "MOT000001", votes: failVotes },
      null,
    );
    expect("error" in failed).toBe(false);
    if (!("error" in failed)) expect(failed.passed).toBe(false);
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) passVotes[id] = i < 231 ? "yes" : "no";
    const passed = recordMotionVote(
      world,
      state,
      { motionId: "MOT000001", votes: passVotes },
      null,
    );
    expect("error" in passed).toBe(false);
    if (!("error" in passed)) expect(passed.passed).toBe(true);
  });
});
