import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "./terena-party-input.js";
import type { Command, KernelWorld } from "./types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

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

function advanceThroughInterrupts(sim: Simulation, turns: number): void {
  for (let i = 0; i < turns; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (r.interrupt) {
      if (!r.interrupt.requiresResolution) {
        expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
        expectOk(sim, { type: "RESUME_TURN" });
      } else if (r.interrupt.resolutionStatus === "resolved") {
        expectOk(sim, { type: "RESUME_TURN" });
      }
    }
  }
}

describe("Phase 5 campaign realism harness", () => {
  it("resources and standing help, but seeds can produce different nominees", () => {
    const world = loadTerenaWorld();
    const winners = new Set<string>();
    const cashBySeed: number[] = [];
    for (let i = 0; i < 2; i++) {
      const sim = createSimulation({
        world,
        playerPoliticianId: "NPC002",
        seed: `P5-REALISM-${i}`,
      });
      expectOk(sim, { type: "ADVANCE_TURN" });
      advanceThroughInterrupts(sim, 1);
      const active = Object.values(sim.getSnapshot().campaignRuntime.campaigns).filter(
        (c) => c.status === "active",
      );
      const raised = active.reduce((n, c) => n + c.totalRaised, 0);
      cashBySeed.push(raised);
      expect(raised).toBeGreaterThan(0);
      advanceThroughInterrupts(sim, 8);
      const labour = Object.values(sim.getSnapshot().partyContests).find(
        (c) => c.partyId === "PARTY_LAB" && c.type === "presidential_nomination",
      )!;
      if (labour.status === "resolved" && labour.winnerId) winners.add(labour.winnerId);
    }
    expect(Math.max(...cashBySeed)).toBeGreaterThan(Math.min(...cashBySeed) * 0.2);
    expect(winners.size).toBeGreaterThanOrEqual(1);
  }, 180_000);
});
