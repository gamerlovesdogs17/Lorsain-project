import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone, hashCanonical } from "./hash.js";
import { occupyingTerms } from "./offices.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields } from "./terena-party-input.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { currentPresidentialAuthorityId, deriveCabinet } from "./executive/state.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld } from "./types.js";

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
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

function contentHashes(): Record<string, string> {
  const files = [
    "data/terena_voter_blocs_2028.json",
    "data/terena_pollsters.json",
    "data/terena_election_assembly_2026.json",
    "data/terena_parties.json",
    "data/terena_issues.json",
    "data/terena_constitution.json",
    "data/terena_offices.json",
  ];
  const out: Record<string, string> = {};
  for (const f of files) {
    out[f] = hashCanonical(JSON.parse(readFileSync(resolve(repoRoot, f), "utf8")));
  }
  return out;
}

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function advanceThroughInterrupts(sim: Simulation, turns: number, stopOn?: string): boolean {
  for (let i = 0; i < turns; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (r.interrupt) {
      if (stopOn && r.interrupt.code === stopOn) return true;
      if (!r.interrupt.requiresResolution) {
        expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
        expectOk(sim, { type: "RESUME_TURN" });
      } else if (r.interrupt.resolutionStatus === "resolved") {
        expectOk(sim, { type: "RESUME_TURN" });
      } else {
        return true;
      }
    }
  }
  return false;
}

describe("Phase 7 playable 2028–2029 path", () => {
  it("lets an ordinary MP play to the January 2029 transition without DEV commands", () => {
    const diskBefore = contentHashes();
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC030", seed: "P7-PLAY" });
    expect(sim.getSnapshot().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(sim.getSnapshot().currentDate).toBe("2028-01-01");
    expect(currentAssemblyMemberIds(world, sim.getSnapshot()).includes("NPC030")).toBe(true);
    expect(currentPresidentialAuthorityId(world, sim.getSnapshot())).toBe("NPC001");
    expect(deriveCabinet(world, sim.getSnapshot())).toHaveLength(12);

    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Player labour bill",
      policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.4, fiscalImpact: null }],
    });
    const billId = Object.keys(sim.getSnapshot().legislatureRuntime.bills)[0];
    expect(billId).toBeTruthy();
    expectOk(sim, {
      type: "PROPOSE_AMENDMENT",
      billId: billId!,
      policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.2, fiscalImpact: null }],
    });
    const assigned = sim.getSnapshot().legislatureRuntime.bills[billId!]?.assignedCommitteeId;
    const onCommittee = assigned
      ? (sim.getSnapshot().legislatureRuntime.committees[assigned]?.memberIds.includes("NPC030") ??
        false)
      : false;
    if (onCommittee) {
      expectOk(sim, {
        type: "CAST_LEGISLATIVE_VOTE",
        billId: billId!,
        stage: "committee",
        choice: "yes",
      });
    }
    const appoint = sim.executeCommand({
      type: "APPOINT_MINISTER",
      officeId: deriveCabinet(world, sim.getSnapshot())[0]!.officeId,
      politicianId: "NPC030",
    });
    expect(appoint.ok).toBe(false);

    expectOk(sim, { type: "ADVANCE_TURN" });
    expect(Object.keys(sim.getSnapshot().legislatureRuntime.legislativeVotes)).toHaveLength(0);
    const mid = sim.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(sim.hashState());

    const hit = advanceThroughInterrupts(sim, 14, "PRESIDENTIAL_ELECTION_DUE");
    expect(hit).toBe(true);
    expect(sim.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    expectOk(sim, { type: "RESUME_TURN" });
    const election = sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID];
    expect(election?.status).toBe("resolved");
    expect(election?.countArchive && "rounds" in election.countArchive).toBe(true);
    advanceThroughInterrupts(sim, 4);
    expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const president = occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.status === "active" && t.holdingKind === "substantive",
    )?.holderId;
    expect(president).toMatch(/^NPC/);
    expect(president).not.toBe("NPC001");
    expect(deriveCabinet(world, sim.getSnapshot())).toHaveLength(12);
    const after = sim.serializeSave();
    expect(restoreSimulation(after, world).hashState()).toBe(sim.hashState());
    expect(contentHashes()).toEqual(diskBefore);
  }, 180_000);

  it("gives a presidential contender campaign commands and a sitting President executive commands", () => {
    const world = loadTerenaWorld();
    const contender = createSimulation({ world, playerPoliticianId: "NPC003", seed: "P7-RUN" });
    expect(currentAssemblyMemberIds(world, contender.getSnapshot()).includes("NPC003")).toBe(false);
    const intro = contender.executeCommand({
      type: "INTRODUCE_BILL",
      title: "Governor bill",
      policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.3, fiscalImpact: null }],
    });
    expect(intro.ok).toBe(false);
    const contest = Object.values(contender.getSnapshot().partyContests).find(
      (c) => c.partyId === "PARTY_LAB" && c.type === "presidential_nomination",
    );
    expect(contest).toBeTruthy();
    expectOk(contender, {
      type: "DECLARE_CAMPAIGN",
      politicianId: "NPC003",
      campaignType: "presidential_nomination",
      contestId: contest!.id,
    });
    const campaign = Object.values(contender.getSnapshot().campaignRuntime.campaigns).find(
      (c) => c.politicianId === "NPC003",
    );
    expect(campaign).toBeTruthy();
    expectOk(contender, { type: "CAMPAIGN_FUNDRAISE", campaignId: campaign!.id });

    const president = createSimulation({ world, playerPoliticianId: "NPC001", seed: "P7-PRES" });
    expect(currentPresidentialAuthorityId(world, president.getSnapshot())).toBe("NPC001");
    const seat = president.executeCommand({
      type: "INTRODUCE_BILL",
      title: "Presidential bill",
      policyItems: [{ issueId: "ISS_REFORM", direction: 1, magnitude: 0.2, fiscalImpact: null }],
    });
    expect(seat.ok).toBe(false);
    const vacant = deriveCabinet(world, president.getSnapshot()).find((m) => m.holderId == null);
    const officeId = vacant?.officeId ?? deriveCabinet(world, president.getSnapshot())[0]!.officeId;
    expectOk(president, {
      type: "APPOINT_MINISTER",
      officeId,
      politicianId: "NPC030",
    });
    expectOk(president, {
      type: "ISSUE_REGULATION",
      ministryOfficeId: officeId,
      policyItems: [{ issueId: "ISS_REFORM", direction: 1, magnitude: 0.2, fiscalImpact: null }],
      major: true,
    });
    advanceThroughInterrupts(president, 1);
    expect(Object.keys(president.getSnapshot().executiveRuntime.regulations).length).toBe(1);
  }, 60_000);
});
