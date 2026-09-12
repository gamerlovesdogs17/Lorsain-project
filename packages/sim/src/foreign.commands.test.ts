/**
 * Cheap foreign-affairs command/correctness tests for Normal Integration CI.
 * Long-horizon / determinism / 27-month cases live in foreign.test.ts (Extended).
 */
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
import type { Command, KernelWorld, SimState } from "./types.js";
import { CANONICAL_TERENA_RELATIONS } from "./foreign/baseline.js";
import { bilateralKey } from "./foreign/state.js";
import { TERENA_WORLD_ID } from "./foreign/types.js";
import { proposeTreaty } from "./foreign/treaties.js";
import {
  advanceTreatyAfterCounterpartyAcceptance,
  processTreatyRatificationVotes,
} from "./foreign/treaty-ratification.js";
import { canProposeTreaty } from "./foreign/treaty-identity.js";
import { publicActiveCrises } from "./foreign/crises.js";
import { resolveCountryLeaderDisplay } from "./foreign/leaders.js";
import { stageIsRipe } from "./legislature/procedure.js";
import { createRngService } from "./rng.js";
import { currentPresidentialAuthorityId } from "./executive/state.js";

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

function terenaRelation(state: SimState, countryId: string): number | undefined {
  return state.foreignAffairsRuntime.bilateralRelations[bilateralKey(TERENA_WORLD_ID, countryId)]
    ?.general;
}

describe("foreign affairs commands (cheap)", () => {
  it("seeds 48 countries and canonical Terena bilateral relations", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-BASE" });
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
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-VASK" });
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

  it("allows President Mara Velic to impose sanctions on W40", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR-CMD-SANC" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    expectOk(sim, {
      type: "IMPOSE_SANCTIONS",
      targetCountryId: "W40",
      severity: 0.45,
    });
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
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "FOR-CMD-POST" });
    expectOk(sim, {
      type: "ADJUST_MILITARY_POSTURE",
      posture: "heightened",
    });
    expect(sim.getSnapshot().foreignAffairsRuntime.countries.W41?.posture).toBe("heightened");
    expectOk(sim, {
      type: "ADJUST_MILITARY_POSTURE",
      posture: "normal",
    });
    expect(sim.getSnapshot().foreignAffairsRuntime.countries.W41?.posture).toBe("normal");
  });

  it("rejects IMPOSE_SANCTIONS when the player is not President", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-MP-SANC" });
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).not.toBe("NPC030");
    const r = sim.executeCommand({
      type: "IMPOSE_SANCTIONS",
      targetCountryId: "W40",
      severity: 0.45,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_PRESIDENT");
  });

  it("excludes latent crises from public active crisis counts", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-LATENT" });
    const runtime = sim.getSnapshot().foreignAffairsRuntime;
    const latent = Object.values(runtime.crises).filter((c) => c.stage === "latent");
    expect(latent.length).toBeGreaterThan(0);
    expect(publicActiveCrises(runtime).every((c) => c.stage !== "latent")).toBe(true);
  });

  it("resolves runtime leader display after foreign leadership change", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-LEAD-UI" });
    const snap = jsonClone(sim.getSnapshot());
    const runtime = snap.foreignAffairsRuntime.countries.W05!;
    runtime.metadata.activeLeader = { name: "Test Leader", title: "President" };
    runtime.leaderId = "FLD_W05_REPLACEMENT";
    const display = resolveCountryLeaderDisplay(world, snap, "W05");
    expect(display?.name).toBe("Test Leader");
    const terenaDisplay = resolveCountryLeaderDisplay(world, snap, TERENA_WORLD_ID);
    expect(terenaDisplay?.title).toBe("President");
  });

  it("blocks duplicate treaty proposals for the same pair and kind", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-DUP" });
    const snap = jsonClone(sim.getSnapshot());
    proposeTreatyOk(
      snap,
      {
        proposerId: "W05",
        kind: "trade",
        title: "W05–W41 Trade",
        memberIds: ["W05", TERENA_WORLD_ID],
        requiresRatification: false,
      },
      null,
    );
    const gate = canProposeTreaty(
      snap.foreignAffairsRuntime,
      "trade",
      ["W05", TERENA_WORLD_ID],
      snap.currentDate,
    );
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
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "FOR-CMD-RAT" });
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
    expect(
      stageIsRipe(
        snap,
        snap.foreignAffairsRuntime.treatyRatifications[
          Object.keys(snap.foreignAffairsRuntime.treatyRatifications)[0]!
        ]!.voteReadyDate,
      ),
    ).toBe(false);
    const rng = createRngService("FOR-CMD-RAT-VOTE");
    processTreatyRatificationVotes(world, snap, rng, "CMD00002");
    expect(treaty.status).toBe("ratification_pending");
    expect(Object.keys(snap.legislatureRuntime.legislativeVotes)).toHaveLength(0);
  });
});
