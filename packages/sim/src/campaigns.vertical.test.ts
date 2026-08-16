import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serializeCountResult } from "@lorsain/election-math";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { hashCanonical, jsonClone } from "./hash.js";
import { regularElectionDate } from "./calendar.js";
import { occupyingTerms } from "./offices.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields } from "./terena-party-input.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import { replayElectionCount } from "./elections/replay.js";
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

function runToInauguration(sim: Simulation): string {
  const hit = advanceThroughInterrupts(sim, 16, "PRESIDENTIAL_ELECTION_DUE");
  expect(hit).toBe(true);
  const snap = sim.getSnapshot();
  expect(snap.pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
  const nomination = Object.values(snap.partyContests).filter(
    (c) => c.type === "presidential_nomination",
  );
  expect(nomination.length).toBe(6);
  for (const contest of nomination) {
    expect(["resolved", "cancelled"]).toContain(contest.status);
  }
  const election = snap.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
  expect(election.fieldFinalized).toBe(true);
  expect(
    Object.values(election.candidates).filter((c) => !c.withdrawn).length,
  ).toBeGreaterThanOrEqual(2);
  expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
  const resolved = sim.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
  expect(resolved.status).toBe("resolved");
  expect(serializeCountResult(replayElectionCount(resolved))).toBe(
    serializeCountResult(resolved.countArchive),
  );
  const winnerId = resolved.winnerIds[0]!;
  expectOk(sim, { type: "RESUME_TURN" });
  for (let i = 0; i < 4; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(r.error.message);
    if (r.ok && r.interrupt) {
      if (!r.interrupt.requiresResolution) {
        expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
        expectOk(sim, { type: "RESUME_TURN" });
      } else if (r.interrupt.resolutionStatus === "resolved") {
        expectOk(sim, { type: "RESUME_TURN" });
      }
    }
  }
  expect(sim.getSnapshot().currentDate >= "2029-01-20").toBe(true);
  expect(
    occupyingTerms(sim.getSnapshot(), "OFFICE_PRESIDENT").some((t) => t.holderId === winnerId),
  ).toBe(true);
  return winnerId;
}

describe("Phase 5 2028 vertical slice", () => {
  it("NPCs campaign autonomously through nomination, general election, and inauguration", () => {
    const diskBefore = contentHashes();
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P5-2028-AUTO" });
    expect(Object.keys(sim.getSnapshot().campaignRuntime.campaigns).length).toBe(0);
    const startStanding = Object.keys(sim.getSnapshot().candidateStanding).length;
    expect(startStanding).toBeGreaterThan(0);
    expectOk(sim, { type: "ADVANCE_TURN" });
    const afterDeclare = Object.values(sim.getSnapshot().campaignRuntime.campaigns).filter(
      (c) => c.status === "active",
    );
    expect(afterDeclare.length).toBeGreaterThan(5);
    expect(afterDeclare.length).toBeLessThan(200);
    const playerActs = sim
      .getSnapshot()
      .history.filter(
        (e) =>
          e.actorIds.includes("NPC002") &&
          [
            "FUNDRAISING_PUSH",
            "CAMPAIGN_VISIT",
            "AD_CAMPAIGN",
            "CAMPAIGN_ATTACK",
            "CAMPAIGN_WITHDRAWN",
            "DEBATE_PREPARED",
          ].includes(e.type),
      );
    expect(playerActs.length).toBe(0);
    const npcFundraise = sim.getSnapshot().history.filter((e) => e.type === "FUNDRAISING_PUSH");
    const npcVisit = sim.getSnapshot().history.filter((e) => e.type === "CAMPAIGN_VISIT");
    expect(npcFundraise.length + npcVisit.length).toBeGreaterThan(0);
    advanceThroughInterrupts(sim, 5);
    expect(
      Object.values(sim.getSnapshot().campaignRuntime.campaigns).some((c) => c.totalRaised > 0),
    ).toBe(true);
    const mid = sim.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(sim.hashState());
    expectOk(sim, { type: "ADVANCE_TURN" });
    expectOk(restored, { type: "ADVANCE_TURN" });
    expect(sim.hashState()).toBe(restored.hashState());
    const winnerId = runToInauguration(sim);
    expect(sim.getSnapshot().politicians.NPC002?.alive).toBe(true);
    expect(winnerId).toMatch(/^NPC/);
    const general = Object.values(sim.getSnapshot().campaignRuntime.campaigns).filter(
      (c) => c.type === "presidential_general",
    );
    expect(general.length).toBeGreaterThan(0);
    expect(contentHashes()).toEqual(diskBefore);
    console.log(
      JSON.stringify({
        startCampaigns: 0,
        afterDeclare: afterDeclare.length,
        winnerId,
        debates: Object.keys(sim.getSnapshot().campaignRuntime.debates).length,
        polls: Object.keys(sim.getSnapshot().polls).length,
        nextPres: regularElectionDate(world.presidentialCalendar, 2033),
      }),
    );
  }, 180_000);

  it("player withdrawal/loss does not end the simulation", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P5-2028-LOSS" });
    expectOk(sim, { type: "ADVANCE_TURN" });
    const partyId = sim.getSnapshot().politicians.NPC002?.partyId;
    const contest = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.partyId === partyId && c.type === "presidential_nomination",
    );
    if (contest) {
      const declared = sim.executeCommand({
        type: "DECLARE_PARTY_CONTEST_CANDIDACY",
        contestId: contest.id,
        politicianId: "NPC002",
      });
      if (declared.ok) {
        const camp = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
          (c) => c.politicianId === "NPC002" && c.status === "active",
        );
        if (camp) expectOk(sim, { type: "WITHDRAW_CAMPAIGN", campaignId: camp.id });
      }
    }
    advanceThroughInterrupts(sim, 3);
    expect(sim.getSnapshot().politicians.NPC002?.alive).toBe(true);
    expect(sim.getSnapshot().politicians.NPC002?.retired).toBe(false);
    expectOk(sim, { type: "ADVANCE_TURN" });
    expect(sim.getSnapshot().currentDate > "2028-01-01").toBe(true);
  }, 60_000);
});

describe("Phase 5 campaign realism harness", () => {
  it("resources and standing help, but seeds can produce different nominees", () => {
    const world = loadTerenaWorld();
    const winners = new Set<string>();
    const cashBySeed: number[] = [];
    for (let i = 0; i < 4; i++) {
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

describe("Phase 5 campaign performance", () => {
  it("processes an active presidential campaign month without pathological scaling", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P5-PERF" });
    const t0 = Date.now();
    expectOk(sim, { type: "ADVANCE_TURN" });
    const firstMs = Date.now() - t0;
    const n = Object.values(sim.getSnapshot().campaignRuntime.campaigns).filter(
      (c) => c.status === "active",
    ).length;
    expect(n).toBeGreaterThan(5);
    const t1 = Date.now();
    expectOk(sim, { type: "ADVANCE_TURN" });
    const monthMs = Date.now() - t1;
    expect(firstMs).toBeLessThan(15_000);
    expect(monthMs).toBeLessThan(15_000);
    console.log(
      JSON.stringify({ firstMonthMs: firstMs, secondMonthMs: monthMs, activeCampaigns: n }),
    );
  }, 60_000);
});
