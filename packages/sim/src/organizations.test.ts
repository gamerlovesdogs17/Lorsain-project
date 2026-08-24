import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { SAVE_SCHEMA_VERSION, type KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "./terena-party-input.js";
import { MAX_ORG_MEETINGS_PER_MONTH, organizationPressureForBill } from "./organizations/index.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function expectOk(sim: Simulation, command: Parameters<Simulation["executeCommand"]>[0]) {
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

function orgHarness(): KernelWorld {
  const world = legislativeHarnessWorld("ORG-HARNESS");
  world.interestOrganizations = {
    ORG_TCL: {
      id: "ORG_TCL",
      name: "Terenan Confederation of Labor",
      type: "union federation",
      lean: "Labour",
      strength: 0.92,
      issues: ["ISS_WELFARE", "ISS_RIGHTS"],
      leanPartyIds: ["PARTY_A"],
    },
    ORG_MAN: {
      id: "ORG_MAN",
      name: "Federation of Manufacturers",
      type: "business",
      lean: "National Union",
      strength: 0.84,
      issues: ["ISS_TAX", "ISS_WELFARE"],
      leanPartyIds: ["PARTY_B"],
    },
  };
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
    ...terenaWorldFieldsFromBundle(bundle),
    organizations: bundle.content.terena_organizations.organizations,
    mediaOutlets: bundle.content.terena_media.outlets,
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

describe("Phase 9 organizations", () => {
  it("consumes the ten canonical Terena organizations", () => {
    const world = loadTerenaWorld();
    expect(Object.keys(world.interestOrganizations).sort()).toEqual([
      "ORG_CAN",
      "ORG_CLF",
      "ORG_FARM",
      "ORG_MAN",
      "ORG_MUNI",
      "ORG_PORT",
      "ORG_PUB",
      "ORG_SMB",
      "ORG_TCL",
      "ORG_VET",
    ]);
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "ORG-CANON" });
    expect(Object.keys(sim.getSnapshot().organizationRuntime.actors)).toHaveLength(10);
  });

  it("unions and business groups take different labor-bill stances", () => {
    const world = orgHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-STANCE" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Welfare institutions",
      policyItems: [{ issueId: "ISS_WELFARE", direction: 1, magnitude: 0.7, fiscalImpact: null }],
    });
    advance(sim, 2);
    const actors = sim.getSnapshot().organizationRuntime.actors;
    const labor = actors.ORG_TCL?.billPressure[0];
    const biz = actors.ORG_MAN?.billPressure[0];
    if (labor && biz && labor.billId === biz.billId) {
      expect(labor.stance).not.toBe(biz.stance);
    }
    expect(organizationPressureForBill(world, sim.getSnapshot(), "MP02", "BILL000001")).toBeLessThanOrEqual(
      0.12,
    );
    expect(organizationPressureForBill(world, sim.getSnapshot(), "MP02", "BILL000001")).toBeGreaterThanOrEqual(
      -0.12,
    );
  });

  it("keeps meetings secondary and does not leak hidden scores in public actions", () => {
    const world = orgHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-MEET" });
    expectOk(sim, { type: "MEET_ORGANIZATION", organizationId: "ORG_TCL" });
    expectOk(sim, {
      type: "DISCUSS_ORGANIZATION_POLICY",
      organizationId: "ORG_TCL",
      issueId: "ISS_LABOR",
      direction: 1,
    });
    const third = sim.executeCommand({ type: "MEET_ORGANIZATION", organizationId: "ORG_MAN" });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error.code).toBe("ORG_MEETING_LIMIT");
    expect(sim.getSnapshot().organizationRuntime.meetingsThisMonth).toBe(MAX_ORG_MEETINGS_PER_MONTH);
    expect(
      sim.getSnapshot().organizationRuntime.actors.ORG_TCL?.relationships.MP02?.affinity,
    ).toBeCloseTo(0.015);
    const summaries = sim.getSnapshot().organizationRuntime.actors.ORG_TCL?.recentActions ?? [];
    expect(summaries.every((a) => !/utility|weight|hidden/i.test(a.summary))).toBe(true);
  });

  it("updates organization trust and alignment from legislative behavior", () => {
    const world = orgHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-BEHAVIOR" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Income Security Act",
      policyItems: [
        { issueId: "ISS_WELFARE", direction: 1, magnitude: 0.7, fiscalImpact: null },
      ],
    });
    const relationship = sim.getSnapshot().organizationRuntime.actors.ORG_TCL?.relationships.MP02;
    expect(relationship?.policyAlignment ?? 0).toBeGreaterThan(0);
    expect(relationship?.trust ?? 0).toBeGreaterThan(0);
    expect(relationship?.lastReason).toBe("Sponsored priority legislation");
  });

  it("organizations still act when the player does nothing", () => {
    const world = orgHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-AUTO" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Tax posture",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.6, fiscalImpact: null }],
    });
    advance(sim, 4);
    const acted = Object.values(sim.getSnapshot().organizationRuntime.actors).some(
      (a) => a.recentActions.length > 0 || a.billPressure.length > 0,
    );
    expect(acted).toBe(true);
  });

  it("withdraws an active endorsement after a sustained policy break", () => {
    const world = orgHarness();
    const created = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-WITHDRAW" });
    const raw = jsonClone(created.serializeSave()) as ReturnType<Simulation["serializeSave"]>;
    const mutable = raw.simulation;
    const campaign = Object.values(mutable.campaignRuntime.campaigns)
      .find((row) => row.politicianId === "MP02");
    const actor = mutable.organizationRuntime.actors.ORG_TCL!;
    actor.endorsements.push({
      politicianId: "MP02",
      campaignId: campaign?.id ?? null,
      date: mutable.currentDate,
      public: true,
      status: "active",
      withdrawnDate: null,
    });
    actor.relationships.MP02 = {
      affinity: -0.2,
      trust: -0.5,
      policyAlignment: -0.6,
      lastUpdatedDate: mutable.currentDate,
      lastReason: "Opposed priority legislation",
    };
    const sim = restoreSimulation(raw, world);
    advance(sim, 1);
    const snapshot = sim.getSnapshot();
    const withdrawn = snapshot.organizationRuntime.actors.ORG_TCL?.endorsements[0];
    expect(withdrawn?.status).toBe("withdrawn");
    expect(withdrawn?.withdrawnDate).not.toBeNull();
    expect(snapshot.history.some((event) => event.type === "ORGANIZATION_ENDORSEMENT_WITHDRAWN")).toBe(true);
  });

  it("save/restore continues organization state", () => {
    const world = orgHarness();
    const a = createSimulation({ world, playerPoliticianId: "MP02", seed: "ORG-SAVE" });
    expectOk(a, { type: "MEET_ORGANIZATION", organizationId: "ORG_TCL" });
    advance(a, 3);
    const b = restoreSimulation(a.serializeSave(), world);
    expect(b.hashState()).toBe(a.hashState());
    advance(a, 3);
    advance(b, 3);
    expect(a.hashState()).toBe(b.hashState());
    expect(a.serializeSave().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});
