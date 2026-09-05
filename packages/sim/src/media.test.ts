import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import type { KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "./terena-party-input.js";
import { storiesChronological } from "./media/index.js";

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

function mediaHarness(): KernelWorld {
  const world = legislativeHarnessWorld("MED-HARNESS");
  world.mediaOutlets = {
    MED_TPS: {
      id: "MED_TPS",
      name: "Terenan Public Service",
      type: "public broadcaster",
      ideology: 0,
      factualReputation: 0.92,
      audience: "national",
    },
    MED_DIR: {
      id: "MED_DIR",
      name: "Direct Terena",
      type: "populist",
      ideology: -0.4,
      factualReputation: 0.48,
      audience: "populist",
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

describe("Phase 9 media", () => {
  it("uses the seven canonical outlets", () => {
    const world = loadTerenaWorld();
    expect(Object.keys(world.mediaOutlets).sort()).toEqual([
      "MED_CST",
      "MED_DIR",
      "MED_EXC",
      "MED_LED",
      "MED_REC",
      "MED_TPS",
      "MED_WRK",
    ]);
  });

  it("covers real public events and keeps factEventType invariant", () => {
    const world = mediaHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "MED-FACT" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Rights bill",
      policyItems: [{ issueId: "ISS_RIGHTS", direction: 1, magnitude: 0.5, fiscalImpact: null }],
    });
    advance(sim, 2);
    const stories = storiesChronological(sim.getSnapshot());
    const historyIds = new Set(sim.getSnapshot().history.map((e) => e.id));
    const types = new Set(sim.getSnapshot().history.map((e) => e.type));
    for (const story of stories) {
      expect(story.sourceEventIds.every((id) => historyIds.has(id))).toBe(true);
      expect(types.has(story.factEventType)).toBe(true);
    }
  });

  it("high-factual and low-factual outlets frame differently without inventing events", () => {
    const world = mediaHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "MED-FRAME" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Institutional reform",
      policyItems: [{ issueId: "ISS_REFORM", direction: 1, magnitude: 0.6, fiscalImpact: null }],
    });
    advance(sim, 3);
    const stories = Object.values(sim.getSnapshot().mediaRuntime.stories);
    const tps = stories.filter((s) => s.outletId === "MED_TPS");
    const dir = stories.filter((s) => s.outletId === "MED_DIR");
    if (tps.length && dir.length) {
      expect(tps.some((s) => s.framing === "sensational")).toBe(false);
    }
    const lingering = sim.getSnapshot().mediaRuntime.lingering;
    for (const e of lingering) {
      expect(Math.abs(e.favorabilityDelta)).toBeLessThan(0.05);
      expect(Math.abs(e.momentumDelta)).toBeLessThan(0.05);
    }
  });

  it("same seed produces the same coverage and save/restore continues", () => {
    const world = mediaHarness();
    const a = createSimulation({ world, playerPoliticianId: "MP02", seed: "MED-DET" });
    expectOk(a, {
      type: "INTRODUCE_BILL",
      title: "Welfare bill",
      policyItems: [{ issueId: "ISS_WELFARE", direction: 1, magnitude: 0.4, fiscalImpact: null }],
    });
    advance(a, 4);
    const b = restoreSimulation(a.serializeSave(), world);
    expect(b.hashState()).toBe(a.hashState());
    advance(a, 4);
    advance(b, 4);
    expect(a.hashState()).toBe(b.hashState());
    const c = createSimulation({ world, playerPoliticianId: "MP02", seed: "MED-DET" });
    expectOk(c, {
      type: "INTRODUCE_BILL",
      title: "Welfare bill",
      policyItems: [{ issueId: "ISS_WELFARE", direction: 1, magnitude: 0.4, fiscalImpact: null }],
    });
    advance(c, 8);
    expect(c.hashState()).toBe(a.hashState());
  });
});
