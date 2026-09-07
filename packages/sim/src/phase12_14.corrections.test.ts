import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { scorePartyMergeCompatibility } from "./politics/lifecycle.js";
import {
  conductAssemblyConfidenceVote,
  activeCoalition,
  processCoalitionMonth,
  MAX_FORMATION_ATTEMPTS,
} from "./politics/coalitions.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import type { SimState } from "./types.js";
import { PARTY_PLATFORM_ISSUES } from "./parties/types.js";
import { cabinetFormationMode } from "./provinces/constitutionGameplay.js";

describe("Phase 12 finalization corrections", () => {
  it("merger compatibility vetoes strongly opposed platforms", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "merge-compat", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const parties = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort();
    expect(parties.length).toBeGreaterThanOrEqual(2);
    const a = parties[0]!;
    const b = parties[1]!;
    const pa = state.partyStates[a]!.publicPlatform;
    const pb = state.partyStates[b]!.publicPlatform;
    if (pa && pb) {
      for (const issue of PARTY_PLATFORM_ISSUES) {
        pa.positions[issue] = 1;
        pb.positions[issue] = -1;
      }
    }
    const score = scorePartyMergeCompatibility(state, a, b);
    expect(score).toBeLessThan(0.55);
  });

  it("enacting a coalition priority is NOT a policy violation", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "coal-viol", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const partyIds = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort()
      .slice(0, 2);
    ensurePoliticsRuntime(state).coalitionAgreements["COAL_TEST"] = {
      id: "COAL_TEST",
      formedDate: state.currentDate,
      status: "active",
      brokenDate: null,
      partyIds,
      policyPriorities: ["labor", "housing"],
      cabinetShares: {},
      trigger: "no_plurality",
      breakdownReason: null,
      negotiationScore: 0.6,
      alternativeOptions: [],
      metadata: {},
    };
    state.history.push({
      id: "H_TEST_ENACT",
      date: state.currentDate,
      type: "LAW_ENACTED",
      importance: 0.5,
      visibility: "public",
      actorIds: [],
      entityIds: [],
      payload: { platformIssue: "labor", issueId: "ISS_LABOR" },
      sourceScheduledEventId: null,
      sourceCommandId: null,
    });
    processCoalitionMonth(world, state, "CMD_TEST");
    expect(activeCoalition(state)?.id).toBe("COAL_TEST");
    expect(activeCoalition(state)?.status).toBe("active");
  });

  it("partner MP revolt beyond ~35% no-votes breaks coalition on priority bill", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "coal-revolt", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const partyIds = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort()
      .slice(0, 2);
    const partnerId = partyIds[1]!;
    ensurePoliticsRuntime(state).coalitionAgreements["COAL_REVOLT"] = {
      id: "COAL_REVOLT",
      formedDate: state.currentDate,
      status: "active",
      brokenDate: null,
      partyIds,
      policyPriorities: ["labor"],
      cabinetShares: {},
      trigger: "no_plurality",
      breakdownReason: null,
      negotiationScore: 0.7,
      alternativeOptions: [],
      metadata: {},
    };

    const billId = "BILL_PRIORITY_LABOR";
    state.legislatureRuntime.bills[billId] = {
      id: billId,
      title: "Labor Priority Act",
      summary: "Coalition priority labor bill",
      sponsorId: state.playerPoliticianId,
      cosponsorIds: [],
      status: "floor_scheduled",
      policyItems: [
        {
          issueId: "ISS_LABOR",
          provisionId: "PROV_MINIMUM_WAGE",
          optionId: "living_wage_floor",
          direction: 1,
          magnitude: 0.4,
          fiscalImpact: 0.1,
        },
      ],
      amendmentIds: [],
      assignedCommitteeId: null,
      committeeVoteId: null,
      floorVoteId: null,
      repassageVoteId: null,
      presidentialDisposition: "pending",
      stageReadyDate: state.currentDate,
      introducedDate: state.currentDate,
      enactedDate: null,
      enactedLawId: null,
      metadata: {},
      version: 1,
      versionHistory: [],
    };
    state.legislatureRuntime.partyRecommendations[`${partnerId}:${billId}`] = {
      partyId: partnerId,
      billId,
      stance: "support",
      setById: null,
      date: state.currentDate,
      source: "caucus_leadership",
    };

    const partnerMps = Object.values(state.politicians)
      .filter((p) => p.partyId === partnerId)
      .map((p) => p.id)
      .sort()
      .slice(0, 10);
    expect(partnerMps.length).toBeGreaterThanOrEqual(3);
    const votes: Record<string, "yes" | "no" | "abstain"> = {};
    for (let i = 0; i < partnerMps.length; i += 1) {
      // ≥40% no so clearly above the 35% tolerance.
      votes[partnerMps[i]!] = i % 5 === 0 || i % 5 === 1 ? "no" : "yes";
    }
    // Ensure at least 35% no.
    const noCount = Object.values(votes).filter((v) => v === "no").length;
    if (noCount / partnerMps.length < 0.35) {
      votes[partnerMps[0]!] = "no";
      votes[partnerMps[1]!] = "no";
      if (partnerMps[2]) votes[partnerMps[2]] = "no";
    }

    const voteId = "LV_REVOLT_1";
    state.legislatureRuntime.legislativeVotes[voteId] = {
      id: voteId,
      billId,
      stage: "floor",
      date: state.currentDate,
      committeeId: null,
      votes,
      partyIdsAtVote: Object.fromEntries(partnerMps.map((id) => [id, partnerId])),
      yes: Object.values(votes).filter((v) => v === "yes").length,
      no: Object.values(votes).filter((v) => v === "no").length,
      abstain: 0,
      passed: true,
      threshold: "simple_majority_cast",
      metadata: {},
    };
    state.history.push({
      id: "H_FLOOR_REVOLT",
      date: state.currentDate,
      type: "BILL_FLOOR_PASSED",
      importance: 0.7,
      visibility: "public",
      actorIds: [],
      entityIds: [billId, voteId],
      payload: { billId, voteId },
      sourceScheduledEventId: null,
      sourceCommandId: null,
    });

    // Keep plurality trigger so active coalition is still "needed".
    state.provincialRuntime.constitutionalOrder.cabinetFormation = "assembly_confidence";

    processCoalitionMonth(world, state, "CMD_REVOLT");
    const coal = ensurePoliticsRuntime(state).coalitionAgreements["COAL_REVOLT"];
    expect(coal?.status).toBe("broken");
    expect(coal?.breakdownReason).toBe("policy_violation");
    expect(state.history.some((e) => e.type === "COALITION_BROKEN")).toBe(true);
  });

  it("assembly confidence vote uses sitting MPs", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "conf-vote", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const parties = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort()
      .slice(0, 2);
    const events = conductAssemblyConfidenceVote(world, state, parties, "CMD_CONF");
    expect(events.some((e) => e.type.includes("ASSEMBLY_CONFIDENCE"))).toBe(true);
    const payload = events[0]!.payload as {
      yes: number;
      no: number;
      total: number;
      passed: boolean;
    };
    expect(payload.total).toBe(payload.yes + payload.no);
    expect(typeof payload.passed).toBe("boolean");
  });

  it("formation retries track attempts and emit GOVERNING_FORMATION_FALLBACK when exhausted", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "form-retry", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    state.provincialRuntime.constitutionalOrder.cabinetFormation = "assembly_confidence";
    expect(cabinetFormationMode(state)).toBe("assembly_confidence");

    const parties = Object.keys(state.partyStates)
      .filter((id) => state.partyStates[id]?.status !== "defunct")
      .sort();
    expect(parties.length).toBeGreaterThanOrEqual(3);

    // Align platforms so negotiation score clears the form threshold.
    for (const partyId of parties) {
      const platform = state.partyStates[partyId]?.publicPlatform;
      if (!platform) continue;
      for (const issue of PARTY_PLATFORM_ISSUES) platform.positions[issue] = 0.2;
    }

    // Fragment Assembly affiliations so no enumerated coalition option can win confidence.
    const mps = currentAssemblyMemberIds(world, state);
    expect(mps.length).toBeGreaterThan(10);
    for (let i = 0; i < mps.length; i += 1) {
      const pol = state.politicians[mps[i]!];
      if (!pol) continue;
      pol.partyId = parties[i % parties.length]!;
    }

    const events = processCoalitionMonth(world, state, "CMD_FORM");
    const attempts = Number(
      (ensurePoliticsRuntime(state).metadata as Record<string, unknown>).formationAttempts ?? 0,
    );
    expect(attempts).toBe(MAX_FORMATION_ATTEMPTS);
    expect(events.filter((e) => e.type === "ASSEMBLY_CONFIDENCE_FAILED").length).toBe(
      MAX_FORMATION_ATTEMPTS,
    );
    expect(events.some((e) => e.type === "GOVERNING_FORMATION_FALLBACK")).toBe(true);
    expect(state.provincialRuntime.constitutionalOrder.cabinetNeedsConfidence).toBe(true);
    expect(state.provincialRuntime.constitutionalOrder.cabinetHasAssemblyConfidence).toBe(false);
  });
});
