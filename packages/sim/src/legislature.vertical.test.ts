import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone, hashCanonical } from "./hash.js";
import { occupyingTerms, officesOfKind, endTerm } from "./offices.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields } from "./terena-party-input.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { whipEstimate } from "./legislature/whip.js";
import { recordVote } from "./legislature/procedure.js";
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

describe("Phase 6 Terena 2028 legislature + campaigns", () => {
  it("seeds 420 MPs and five committees without copying an Assembly roster", () => {
    const diskBefore = contentHashes();
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P6-TER" });
    const snap = sim.getSnapshot();
    expect(currentAssemblyMemberIds(world, snap)).toHaveLength(420);
    expect(world.legislativeConstitution).toEqual({
      assemblySeatCount: 420,
      assemblyAbsoluteMajority: 211,
    });
    expect(Object.keys(snap.legislatureRuntime.committees)).toHaveLength(5);
    expect(snap.legislatureRuntime.bills).toEqual({});
    expect(contentHashes()).toEqual(diskBefore);
  });

  it("introduces bills during 2028 while campaigns still run, and save/load stays deterministic", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P6-TER-RUN" });
    expectOk(sim, { type: "ADVANCE_TURN" });
    expect(Object.keys(sim.getSnapshot().campaignRuntime.campaigns).length).toBeGreaterThan(5);
    expect(Object.keys(sim.getSnapshot().legislatureRuntime.bills).length).toBeGreaterThan(0);
    expect(Object.keys(sim.getSnapshot().legislatureRuntime.legislativeVotes)).toHaveLength(0);
    const mid = sim.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(sim.hashState());
    expectOk(sim, { type: "ADVANCE_TURN" });
    expectOk(restored, { type: "ADVANCE_TURN" });
    expect(sim.hashState()).toBe(restored.hashState());
    const hit = advanceThroughInterrupts(sim, 14, "PRESIDENTIAL_ELECTION_DUE");
    expect(hit).toBe(true);
    expect(sim.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    expectOk(sim, { type: "RESUME_TURN" });
    advanceThroughInterrupts(sim, 4);
    expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const winner = occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.status === "active" && t.holdingKind === "substantive",
    )?.holderId;
    expect(winner).toMatch(/^NPC/);
    expect(sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]?.status).toBe(
      "resolved",
    );
    const lawsOrPending = Object.values(sim.getSnapshot().legislatureRuntime.bills).some((b) =>
      ["enacted", "signed", "sent_to_president", "repassage_scheduled"].includes(b.status),
    );
    expect(
      lawsOrPending || Object.keys(sim.getSnapshot().legislatureRuntime.enactedLaws).length > 0,
    ).toBe(true);
  }, 180_000);
});

describe("Phase 6 legislative performance", () => {
  it("keeps 420-MP floor/committee/whip work off pathological all-pairs scaling", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P6-PERF" });
    const t0 = Date.now();
    expectOk(sim, { type: "ADVANCE_TURN" });
    const monthMs = Date.now() - t0;
    const snap = jsonClone(sim.getSnapshot());
    const billId = Object.keys(snap.legislatureRuntime.bills)[0];
    expect(billId).toBeTruthy();
    const tWhip = Date.now();
    const whip = whipEstimate(world, snap, billId!);
    const whipMs = Date.now() - tWhip;
    expect(whip).toBeTruthy();
    const members = currentAssemblyMemberIds(world, snap);
    const votes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const id of members) votes[id] = id === "NPC002" ? "abstain" : "yes";
    const staged = jsonClone(snap);
    const existing = Object.values(staged.legislatureRuntime.bills)[0]!;
    existing.status = "floor_scheduled";
    const tVote = Date.now();
    const recorded = recordVote(
      world,
      staged,
      { billId: existing.id, stage: "floor", votes },
      null,
    );
    const voteMs = Date.now() - tVote;
    expect("error" in recorded).toBe(false);
    expect(monthMs).toBeLessThan(20_000);
    expect(whipMs).toBeLessThan(500);
    expect(voteMs).toBeLessThan(250);
    console.log(JSON.stringify({ legislatureMonthMs: monthMs, whipMs, floorVoteMs: voteMs }));
  }, 60_000);
});

describe("Phase 6 Terena constitutional majority", () => {
  it("still requires 211 yes to repass when 419 MPs currently sit", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P6-211" });
    const state = jsonClone(sim.getSnapshot());
    const assemblyOffices = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
    const mps = currentAssemblyMemberIds(world, state);
    expect(mps).toHaveLength(420);
    const vacateId = mps.find((id) => id !== "NPC002");
    expect(vacateId).toBeTruthy();
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
    state.legislatureRuntime.bills.BILL000001 = {
      id: "BILL000001",
      sponsorId: remaining[0]!,
      cosponsorIds: [],
      introducedDate: state.currentDate,
      title: "Returned vacancy bill",
      summary: "",
      policyItems: [
        { issueId: world.issueIds[0]!, direction: 1, magnitude: 0.5, fiscalImpact: null },
      ],
      assignedCommitteeId: "COMMITTEE_INSTITUTIONAL",
      status: "repassage_scheduled",
      amendmentIds: [],
      committeeVoteId: null,
      floorVoteId: null,
      presidentialDisposition: "returned",
      repassageVoteId: null,
      enactedDate: null,
      enactedLawId: null,
      stageReadyDate: state.currentDate,
      metadata: {},
    };
    const votesFor = (yesCount: number) => {
      const votes: Record<string, "yes" | "no" | "abstain"> = {};
      remaining.forEach((id, i) => {
        votes[id] = i < yesCount ? "yes" : "no";
      });
      return votes;
    };
    const fail = recordVote(
      world,
      jsonClone(state),
      { billId: "BILL000001", stage: "repassage", votes: votesFor(210) },
      null,
    );
    expect("error" in fail).toBe(false);
    if ("error" in fail) return;
    expect(fail.vote.passed).toBe(false);
    expect(fail.vote.yes).toBe(210);
    const pass = recordVote(
      world,
      jsonClone(state),
      { billId: "BILL000001", stage: "repassage", votes: votesFor(211) },
      null,
    );
    expect("error" in pass).toBe(false);
    if ("error" in pass) return;
    expect(pass.vote.passed).toBe(true);
    expect(pass.vote.yes).toBe(211);
  });
});
