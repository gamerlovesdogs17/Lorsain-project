import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { applyRelationshipChange } from "./agents/relationships.js";
import { recordPoliticalMemory } from "./agents/memories.js";
import { recordObservation } from "./agents/beliefs.js";
import { buildDecisionActorContext } from "./agents/context.js";
import { evaluateDecision, emptySignals, type DecisionOption } from "./agents/decisions.js";
import type { SimState } from "./types.js";
import { terenaPartyFields } from "./terena-party-input.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

describe("Phase 2 performance substrate", () => {
  it("evaluates 10,000 decisions over a 530-agent sparse graph", () => {
    const bundle = loadContentBundleFromRepo(repoRoot);
    const world = buildTerenaKernelWorld({
      contentVersion: bundle.manifest.content_version,
      scenario: jsonClone(bundle.content.scenario),
      figures: bundle.content.starting_figures.figures,
      issues: bundle.content.terena_issues.issues.map((i: { id: string }) => ({ id: i.id })),
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
    } satisfies TerenaKernelInput);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const ids = Object.keys(state.politicians);
    const t0 = Date.now();
    for (let i = 0; i < 3000; i++) {
      const src = ids[i % ids.length]!;
      const dst = ids[(i * 17 + 3) % ids.length]!;
      if (src === dst) continue;
      const rel = applyRelationshipChange(
        state,
        src,
        dst,
        { affinity: ((i % 9) - 4) * 0.05, trust: ((i % 5) - 2) * 0.04 },
        state.currentDate,
      );
      if ("error" in rel) throw new Error(rel.error.message);
    }
    for (let i = 0; i < 1500; i++) {
      const owner = ids[i % ids.length]!;
      const subject = ids[(i * 11 + 5) % ids.length]!;
      if (owner === subject) continue;
      const mem = recordPoliticalMemory(
        state,
        world,
        {
          ownerId: owner,
          subjectIds: [subject],
          kind: "generic",
          valence: ((i % 7) - 3) / 3,
          salience: 0.2 + (i % 5) * 0.1,
          durability: i % 11 === 0 ? "permanent" : "normal",
        },
        state.currentDate,
      );
      if ("error" in mem) throw new Error(mem.error.message);
    }
    for (let i = 0; i < 1500; i++) {
      const observer = ids[i % ids.length]!;
      const target = ids[(i * 13 + 7) % ids.length]!;
      if (observer === target) continue;
      const obs = recordObservation(
        state,
        {
          observerId: observer,
          targetId: target,
          topic: "trait",
          dimension: "ambition",
          observed: (i % 10) / 10,
          observationConfidence: 0.5,
          sourceReliability: 0.5,
        },
        state.currentDate,
      );
      if ("error" in obs) throw new Error(obs.error.message);
    }
    const actor = "NPC002";
    const targets = ids.slice(0, 8).filter((id) => id !== actor);
    const ctx = buildDecisionActorContext(world, state, actor, targets);
    const options: DecisionOption[] = [];
    for (let i = 0; i < 12; i++) {
      options.push({
        optionId: `OPT${String(i).padStart(2, "0")}`,
        actionType: "TEST",
        targetIds: targets.slice(0, 2),
        uncertainty: 0.1,
        signals: emptySignals({
          careerBenefit: (i % 5) / 5,
          partyAlignment: (i % 3) / 3,
          risk: (i % 4) / 4,
        }),
        goalImpacts: ctx.goals[0] && i % 2 === 0 ? { [ctx.goals[0].id]: 0.4 } : {},
        metadata: {},
      });
    }
    for (let n = 0; n < 10_000; n++) {
      evaluateDecision(options, ctx);
    }
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);
});
