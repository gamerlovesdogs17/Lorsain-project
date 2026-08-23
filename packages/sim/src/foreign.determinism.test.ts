import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "./terena-party-input.js";
import type { Command, KernelWorld } from "./types.js";
import type { StreamName } from "./rng.js";

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
    if (r.interrupt.code === "ASSEMBLY_ELECTION_DUE") {
      expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
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

function streamState(sim: Simulation, stream: StreamName) {
  return sim.getSnapshot().rng.streams[stream];
}

function nextElectionDraw(sim: Simulation): number {
  const r = sim.executeCommand({ type: "DEV_DRAW_RNG", stream: "elections" });
  if (!r.ok || !r.events[0]?.payload.value) throw new Error("election draw failed");
  return r.events[0].payload.value as number;
}

describe("Phase 10 foreign affairs RNG isolation", () => {
  it("does not perturb the elections stream when advancing turns", () => {
    const world = loadTerenaWorld();
    const a = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-RNG-ELEC" });
    const b = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-RNG-ELEC" });
    advanceHandsOff(a, 18);
    advanceHandsOff(b, 18);
    expect(streamState(a, "elections")).toEqual(streamState(b, "elections"));
    expect(nextElectionDraw(a)).toBe(nextElectionDraw(b));
  });

  it("leaves the foreign-affairs stream unchanged after unrelated commands", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-RNG-UNREL" });
    advanceHandsOff(sim, 3);
    const before = streamState(sim, "foreign-affairs");
    expectOk(sim, { type: "DEV_DRAW_RNG", stream: "flavor" });
    expectOk(sim, { type: "DEV_DRAW_RNG", stream: "campaigns" });
    expect(streamState(sim, "foreign-affairs")).toEqual(before);
  });
});
