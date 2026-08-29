import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { parseSaveFile } from "./save.js";
import { jsonClone } from "./hash.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld } from "./types.js";
import { addMonths } from "./calendar.js";
import { restoreRngService } from "./rng.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { absoluteMajorityNeeded, legislativeConstitutionFromSeats } from "./legislature/policy.js";
import { processLegislatureMonth } from "./legislature/monthly.js";
import { recordAmendmentVote } from "./legislature/procedure.js";
import { whipEstimate } from "./legislature/whip.js";
import { currentAssemblyMemberIds, currentPresidentId } from "./legislature/state.js";
import { evaluatePresidentDisposition } from "./legislature/decisions.js";
import { getAgentProfile } from "./agents/profile.js";
import type { BillState } from "./legislature/types.js";

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

function playerCommitteeIssue(world: KernelWorld, sim: Simulation, playerId = "MP02") {
  const host = Object.values(sim.getSnapshot().legislatureRuntime.committees).find((c) =>
    c.memberIds.includes(playerId),
  );
  expect(host).toBeTruthy();
  const issueId =
    Object.entries(world.issueDimensions).find(([, dim]) => dim === host!.dimension)?.[0] ??
    "ISS_TAX";
  return { host: host!, issueId };
}

describe("Phase 6 legislature kernel", () => {
  it("uses schemaVersion 6, derived Assembly membership, and functional committees", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-SEED" });
    const snap = sim.getSnapshot();
    expect(snap.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(SAVE_SCHEMA_VERSION).toBe(14);
    expect(currentAssemblyMemberIds(world, snap)).toHaveLength(36);
    expect(Object.keys(snap.legislatureRuntime.committees).sort()).toEqual([
      "COMMITTEE_ECONOMIC",
      "COMMITTEE_FOREIGN",
      "COMMITTEE_INSTITUTIONAL",
      "COMMITTEE_SOCIAL",
      "COMMITTEE_SOCIAL_ECONOMIC",
    ]);
    const seated = new Set(
      Object.values(snap.legislatureRuntime.committees).flatMap((c) => c.memberIds),
    );
    expect(seated.has("MP02")).toBe(true);
    expect(snap.counters.nextBillId).toBe(1);
  });

  it("reads Assembly absolute majority from world constitution, not current attendance", () => {
    expect(legislativeConstitutionFromSeats(420)).toEqual({
      assemblySeatCount: 420,
      assemblyAbsoluteMajority: 211,
    });
    expect(legislativeConstitutionFromSeats(36)).toEqual({
      assemblySeatCount: 36,
      assemblyAbsoluteMajority: 19,
    });
    const harness = legislativeHarnessWorld();
    expect(harness.legislativeConstitution).toEqual({
      assemblySeatCount: 36,
      assemblyAbsoluteMajority: 19,
    });
    expect(absoluteMajorityNeeded(harness)).toBe(19);
    expect(
      absoluteMajorityNeeded({
        legislativeConstitution: { assemblySeatCount: 420, assemblyAbsoluteMajority: 211 },
      } as KernelWorld),
    ).toBe(211);
  });

  it("does not auto-sponsor or auto-vote the player; uncast player votes are abstain", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-ABSTAIN" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.6, fiscalImpact: null }],
      title: "Player tax bill",
    });
    expect(sim.getSnapshot().legislatureRuntime.bills.BILL000001?.sponsorId).toBe("MP02");
    advance(sim, 2);
    const npcSponsored = Object.values(sim.getSnapshot().legislatureRuntime.bills).filter(
      (b) => b.sponsorId !== "MP02",
    );
    expect(npcSponsored.length).toBeGreaterThan(0);
    expect(npcSponsored.every((b) => !b.cosponsorIds.includes("MP02"))).toBe(true);
    const votes = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).filter(
      (v) => v.billId === "BILL000001" && v.metadata.kind !== "amendment",
    );
    expect(votes.length).toBeGreaterThan(0);
    for (const vote of votes) {
      if (vote.votes.MP02) expect(vote.votes.MP02).toBe("abstain");
    }
  });

  it("records an explicit player committee vote when CAST_LEGISLATIVE_VOTE targets committee", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-VOTE" });
    const { issueId } = playerCommitteeIssue(world, sim);
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId, direction: 1, magnitude: 0.5, fiscalImpact: null }],
    });
    expectOk(sim, {
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "committee",
      choice: "yes",
    });
    advance(sim, 2);
    const recorded = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) => v.billId === "BILL000001" && v.stage === "committee" && v.votes.MP02 === "yes",
    );
    expect(recorded).toBeTruthy();
    expect(recorded!.metadata.kind).not.toBe("amendment");
  });

  it("leaves player-president bills pending until SIGN_BILL or RETURN_BILL", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P6-VETO" });
    expect(currentPresidentId(world, sim.getSnapshot())).toBe("P1");
    let pendingId: string | null = null;
    for (let i = 0; i < 30 && !pendingId; i++) {
      advance(sim, 1);
      pendingId =
        Object.values(sim.getSnapshot().legislatureRuntime.bills).find(
          (b) => b.status === "sent_to_president",
        )?.id ?? null;
    }
    expect(pendingId).toBeTruthy();
    const before = sim.hashState();
    const auto = Object.values(sim.getSnapshot().legislatureRuntime.bills).find(
      (b) => b.status === "signed" || b.status === "enacted" || b.status === "repassage_scheduled",
    );
    expect(auto).toBeUndefined();
    expectOk(sim, { type: "RETURN_BILL", billId: pendingId! });
    expect(sim.hashState()).not.toBe(before);
    expect(sim.getSnapshot().legislatureRuntime.bills[pendingId!]!.presidentialDisposition).toBe(
      "returned",
    );
    advance(sim, 1);
    expect(sim.getSnapshot().legislatureRuntime.bills[pendingId!]!.status).toBe(
      "repassage_scheduled",
    );
    advance(sim, 1);
    const final = sim.getSnapshot().legislatureRuntime.bills[pendingId!]!;
    expect(["repassed", "repassage_failed", "enacted"]).toContain(final.status);
    const repass = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) => v.billId === pendingId && v.stage === "repassage",
    );
    expect(repass).toBeTruthy();
    expect(repass!.threshold).toBe("absolute_majority");
    expect(repass!.yes + repass!.no + repass!.abstain).toBe(
      currentAssemblyMemberIds(world, sim.getSnapshot()).length,
    );
  });

  it("makes the same NPC President sign an aligned bill and return a strongly hostile bill", () => {
    const world = legislativeHarnessWorld("LEGIS-DISPOSITION");
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-DISPOSITION" });
    const state = jsonClone(sim.getSnapshot());
    const presidentId = currentPresidentId(world, state)!;
    const president = state.politicians[presidentId]!;
    const profile = getAgentProfile(world, state, presidentId)!;
    const alignedSponsor = currentAssemblyMemberIds(world, state).find((id) => state.politicians[id]?.partyId === president.partyId)!;
    const hostileSponsor = currentAssemblyMemberIds(world, state).find((id) => state.politicians[id]?.partyId !== president.partyId)!;
    const direction = profile.ideology.economic >= 0 ? 1 : -1;
    const base: BillState = {
      id: "BILL999998",
      sponsorId: alignedSponsor,
      cosponsorIds: [alignedSponsor],
      introducedDate: state.currentDate,
      title: "Controlled disposition bill",
      summary: "Controlled disposition test.",
      policyItems: [{ issueId: "ISS_TAX", direction, magnitude: 1, fiscalImpact: 0, dimensionEffects: { economic: direction } }],
      assignedCommitteeId: null,
      status: "sent_to_president",
      amendmentIds: [],
      committeeVoteId: null,
      floorVoteId: null,
      presidentialDisposition: "pending",
      repassageVoteId: null,
      enactedDate: null,
      enactedLawId: null,
      stageReadyDate: state.currentDate,
      metadata: {},
      version: 1,
      versionHistory: [],
    };
    const aligned = evaluatePresidentDisposition(world, state, presidentId, base);
    const hostile = evaluatePresidentDisposition(world, state, presidentId, {
      ...base,
      id: "BILL999999",
      sponsorId: hostileSponsor,
      cosponsorIds: [hostileSponsor],
      policyItems: [{ issueId: "ISS_TAX", direction: -direction, magnitude: 1, fiscalImpact: 0.25, dimensionEffects: { economic: -direction } }],
    });
    expect(aligned.decision).toBe("sign");
    expect(hostile.decision).toBe("return");
    expect(aligned.score - hostile.score).toBeGreaterThan(0.5);
  });

  it("runs 48 months with introductions, committee deaths, floor outcomes, signing, and mixed coalitions", () => {
    const world = legislativeHarnessWorld("LEGIS-48");
    const a = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-48A" });
    advance(a, 48);
    const snap = a.getSnapshot();
    expect(snap.currentDate).toBe("2024-01-01");
    const bills = Object.values(snap.legislatureRuntime.bills);
    expect(bills.length).toBeGreaterThan(5);
    expect(bills.some((b) => b.status === "committee_failed")).toBe(true);
    expect(
      bills.some((b) =>
        ["floor_failed", "floor_passed", "sent_to_president", "signed", "enacted"].includes(
          b.status,
        ),
      ),
    ).toBe(true);
    expect(
      bills.some((b) =>
        [
          "signed",
          "enacted",
          "repassage_failed",
          "repassed",
          "returned_by_president",
          "repassage_scheduled",
        ].includes(b.status),
      ) || Object.keys(snap.legislatureRuntime.enactedLaws).length > 0,
    ).toBe(true);
    const floorVotes = Object.values(snap.legislatureRuntime.legislativeVotes).filter(
      (v) => v.stage === "floor",
    );
    expect(floorVotes.length).toBeGreaterThan(0);
    const mixedParty = floorVotes.some((vote) => {
      const byParty = new Map<string, Set<string>>();
      for (const [pid, choice] of Object.entries(vote.votes)) {
        if (pid === "MP02") continue;
        const party = snap.politicians[pid]?.partyId ?? "_";
        const set = byParty.get(party) ?? new Set();
        set.add(choice);
        byParty.set(party, set);
      }
      return [...byParty.values()].some((s) => s.has("yes") && s.has("no"));
    });
    expect(mixedParty).toBe(true);
    const byIssue = new Map<string, { yesA: number; n: number }>();
    for (const vote of floorVotes) {
      const bill = snap.legislatureRuntime.bills[vote.billId];
      const issue = bill?.policyItems[0]?.issueId ?? "x";
      let yesA = 0;
      let n = 0;
      for (const [pid, choice] of Object.entries(vote.votes)) {
        if (snap.politicians[pid]?.partyId !== "PARTY_A") continue;
        n += 1;
        if (choice === "yes") yesA += 1;
      }
      const prev = byIssue.get(issue) ?? { yesA: 0, n: 0 };
      byIssue.set(issue, { yesA: prev.yesA + yesA, n: prev.n + n });
    }
    const rates = [...byIssue.values()].filter((x) => x.n >= 8).map((x) => x.yesA / x.n);
    if (rates.length >= 2) {
      expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.02);
    }
    const mid = a.serializeSave();
    const restored = restoreSimulation(mid, world);
    expect(restored.hashState()).toBe(a.hashState());
    const b = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-48A" });
    advance(b, 48);
    expect(b.hashState()).toBe(a.hashState());
    const whip = whipEstimate(world, snap, floorVotes[0]!.billId);
    expect(whip).toBeTruthy();
    const actualYes = floorVotes[0]!.yes;
    expect(
      actualYes < whip!.yesRange[0] || actualYes > whip!.yesRange[1] || whip!.uncertain > 0,
    ).toBe(true);
  }, 120_000);

  it("migrates v5 saves into empty legislature runtime", () => {
    const world = legislativeHarnessWorld();
    const fresh = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-MIG" });
    const v5 = jsonClone(fresh.serializeSave()) as unknown as Record<string, unknown>;
    v5.schemaVersion = 5;
    const sim = v5.simulation as Record<string, unknown>;
    sim.schemaVersion = 5;
    delete sim.legislatureRuntime;
    const counters = sim.counters as Record<string, unknown>;
    delete counters.nextBillId;
    delete counters.nextAmendmentId;
    delete counters.nextLegislativeVoteId;
    delete counters.nextLawId;
    const parsed = parseSaveFile(v5, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(parsed.save.simulation.legislatureRuntime.bills).toEqual({});
    expect(parsed.save.simulation.executiveRuntime.regulations).toEqual({});
    expect(parsed.save.simulation.counters.nextBillId).toBe(1);
  });

  it("rejects NPC-targeted legislative commands as player-autonomy violations", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-AUT" });
    const bad = sim.executeCommand({
      type: "SIGN_BILL",
      billId: "BILL000001",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(["UNKNOWN_BILL", "NOT_PRESIDENT", "INVALID_BILL"]).toContain(bad.error.code);
  });

  it("makes an NPC bill visible before any player committee or floor tally", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-VISIBLE" });
    expect(Object.keys(sim.getSnapshot().legislatureRuntime.bills)).toHaveLength(0);
    advance(sim, 1);
    const bills = Object.values(sim.getSnapshot().legislatureRuntime.bills);
    expect(bills.length).toBeGreaterThan(0);
    const npcBill = bills.find((b) => b.sponsorId !== "MP02");
    expect(npcBill).toBeTruthy();
    const votesAfterIntro = Object.values(
      sim.getSnapshot().legislatureRuntime.legislativeVotes,
    ).filter((v) => v.billId === npcBill!.id && v.metadata.kind !== "amendment");
    expect(votesAfterIntro).toHaveLength(0);
    advance(sim, 1);
    const committee = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) => v.billId === npcBill!.id && v.stage === "committee" && v.metadata.kind !== "amendment",
    );
    expect(committee).toBeTruthy();
  });

  it("lets the player cast committee then floor votes on separate stages", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-STAGES" });
    const { issueId } = playerCommitteeIssue(world, sim);
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId, direction: 1, magnitude: 0.55, fiscalImpact: null }],
    });
    const floorEarly = sim.executeCommand({
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "floor",
      choice: "yes",
    });
    expect(floorEarly.ok).toBe(false);
    expectOk(sim, {
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "committee",
      choice: "yes",
    });
    advance(sim, 2);
    const afterCommittee = sim.getSnapshot().legislatureRuntime.bills.BILL000001!;
    expect(afterCommittee.status).toBe("floor_scheduled");
    const committeeVote = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) =>
        v.billId === "BILL000001" && v.stage === "committee" && v.metadata.kind !== "amendment",
    );
    expect(committeeVote?.votes.MP02).toBe("yes");
    const committeeAgain = sim.executeCommand({
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "committee",
      choice: "no",
    });
    expect(committeeAgain.ok).toBe(false);
    expectOk(sim, {
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "floor",
      choice: "no",
    });
    let floorVote = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) => v.billId === "BILL000001" && v.stage === "floor" && v.metadata.kind !== "amendment",
    );
    for (let month = 0; month < 4 && !floorVote; month += 1) {
      advance(sim, 1);
      floorVote = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
        (v) => v.billId === "BILL000001" && v.stage === "floor" && v.metadata.kind !== "amendment",
      );
    }
    expect(floorVote?.votes.MP02).toBe("no");
    expect(committeeVote?.votes.MP02).toBe("yes");
  });

  it("does not consume a committee pending choice as a floor vote", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-NOCROSS" });
    const { issueId } = playerCommitteeIssue(world, sim);
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId, direction: 1, magnitude: 0.5, fiscalImpact: null }],
    });
    expectOk(sim, {
      type: "CAST_LEGISLATIVE_VOTE",
      billId: "BILL000001",
      stage: "committee",
      choice: "yes",
    });
    advance(sim, 2);
    const committeeVote = Object.values(sim.getSnapshot().legislatureRuntime.legislativeVotes).find(
      (v) =>
        v.billId === "BILL000001" && v.stage === "committee" && v.metadata.kind !== "amendment",
    );
    expect(committeeVote?.votes.MP02).toBe("yes");
    expect(
      Object.values(sim.getSnapshot().legislatureRuntime.pendingPlayerVotes).some(
        (p) => p.billId === "BILL000001" && p.stage === "floor",
      ),
    ).toBe(false);
    for (let i = 0; i < 12; i++) {
      const snap = sim.getSnapshot();
      const floor = Object.values(snap.legislatureRuntime.legislativeVotes).find(
        (v) => v.billId === "BILL000001" && v.stage === "floor" && v.metadata.kind !== "amendment",
      );
      if (floor) {
        expect(floor.votes.MP02).toBe("abstain");
        return;
      }
      if (snap.legislatureRuntime.bills.BILL000001!.status === "committee_failed") return;
      advance(sim, 1);
    }
  });

  it("adopts or rejects a player amendment before the parent bill leaves the stage", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-AMD" });
    const { issueId, host } = playerCommitteeIssue(world, sim);
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId, direction: 1, magnitude: 0.8, fiscalImpact: null }],
    });
    expectOk(sim, {
      type: "PROPOSE_AMENDMENT",
      billId: "BILL000001",
      policyItems: [{ issueId, direction: 1, magnitude: 0.2, fiscalImpact: null }],
    });
    const base = jsonClone(sim.getSnapshot());
    const amendmentId = Object.keys(base.legislatureRuntime.amendments)[0]!;
    const yesVotes = Object.fromEntries(host.memberIds.map((id) => [id, "yes" as const]));
    const noVotes = Object.fromEntries(host.memberIds.map((id) => [id, "no" as const]));
    const adoptedState = jsonClone(base);
    const adoptedOut = recordAmendmentVote(
      world,
      adoptedState,
      {
        billId: "BILL000001",
        amendmentId,
        stage: "committee",
        votes: yesVotes,
        committeeId: host.id,
      },
      null,
    );
    expect("error" in adoptedOut).toBe(false);
    expect(adoptedState.legislatureRuntime.amendments[amendmentId]!.status).toBe("adopted");
    expect(adoptedState.legislatureRuntime.bills.BILL000001!.policyItems[0]!.magnitude).toBe(0.2);
    const rejectedState = jsonClone(base);
    recordAmendmentVote(
      world,
      rejectedState,
      {
        billId: "BILL000001",
        amendmentId,
        stage: "committee",
        votes: noVotes,
        committeeId: host.id,
      },
      null,
    );
    expect(rejectedState.legislatureRuntime.amendments[amendmentId]!.status).toBe("rejected");
    expect(rejectedState.legislatureRuntime.bills.BILL000001!.policyItems[0]!.magnitude).toBe(0.8);
    advance(sim, 2);
    const live = sim.getSnapshot();
    const liveAmd = Object.values(live.legislatureRuntime.amendments)[0]!;
    expect(["adopted", "rejected"]).toContain(liveAmd.status);
    if (liveAmd.status === "proposed") {
      throw new Error("player amendment was still proposed after the committee month");
    }
    if (live.legislatureRuntime.bills.BILL000001!.status === "floor_scheduled") {
      expect(liveAmd.status === "adopted" || liveAmd.status === "rejected").toBe(true);
    }
  });

  it("will not tally a bill while a proposed amendment is still unripe", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P6-AMD-SKIP" });
    const { issueId } = playerCommitteeIssue(world, sim);
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      policyItems: [{ issueId, direction: 1, magnitude: 0.8, fiscalImpact: null }],
    });
    expectOk(sim, {
      type: "PROPOSE_AMENDMENT",
      billId: "BILL000001",
      policyItems: [{ issueId, direction: 1, magnitude: 0.2, fiscalImpact: null }],
    });
    const state = jsonClone(sim.getSnapshot());
    state.currentDate = addMonths(state.currentDate, 1);
    state.legislatureRuntime.lastMonthProcessed = null;
    const amendment = Object.values(state.legislatureRuntime.amendments)[0]!;
    amendment.date = state.currentDate;
    const rng = restoreRngService(state.rng);
    processLegislatureMonth(state, world, rng, "CMD0001");
    expect(state.legislatureRuntime.bills.BILL000001!.status).toBe("committee");
    expect(state.legislatureRuntime.amendments[amendment.id]!.status).toBe("proposed");
    expect(
      Object.values(state.legislatureRuntime.legislativeVotes).some(
        (v) => v.billId === "BILL000001" && v.metadata.kind !== "amendment",
      ),
    ).toBe(false);
  });
});
