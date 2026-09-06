import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { processCareerDecisionsMonth } from "./politics/careers.js";
import { processOpenSeatRecruitmentMonth } from "./politics/recruitment.js";
import { enhanceLeadershipContestsMonth } from "./politics/leadership.js";
import { processPartyLifecycleMonth } from "./politics/lifecycle.js";
import { processPoliticalMemoryMonth, recentPoliticalMemories } from "./politics/memory.js";
import { processCabinetReshuffleMonth } from "./politics/cabinet.js";
import { processOrganizationPoliticsMonth } from "./politics/organizations.js";
import { processCoalitionMonth, activeCoalition } from "./politics/coalitions.js";
import { processPoliticalAgencyMonth } from "./politics/agency.js";
import { ensurePoliticsRuntime, resetPoliticsMonthCounters } from "./politics/state.js";
import { recordPoliticalMemory } from "./agents/memories.js";
import {
  createPartyContest,
  declareCandidacy,
  openPartyContest,
  resolvePartyContest,
} from "./parties/contests.js";
import { createRngService } from "./rng.js";
import { occupyingTerms, officesOfKind } from "./offices.js";
import { applyPoliticianExit } from "./political-lifecycle.js";
import { seedMinistriesIfNeeded } from "./executive/state.js";
import type { SimState } from "./types.js";

function worldAndSim(seed = "phase12-agency") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  return { world, sim };
}

describe("Phase 12 political agency", () => {
  it("career seek/retire decision responds to opportunity", () => {
    const { world, sim } = worldAndSim("phase12-career");
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensurePoliticsRuntime(state);
    const asmOffice = officesOfKind(world, "assembly_member")[0]!;
    runtime.openSeatContests["OPEN_TEST"] = {
      id: "OPEN_TEST",
      officeId: asmOffice.id,
      officeKind: "assembly_member",
      constituencyId: asmOffice.constituencyId ?? null,
      partyId:
        state.politicians["NPC001"]?.partyId ??
        Object.values(state.politicians).find((p) => p.partyId)?.partyId ??
        null,
      reason: "retirement",
      detectedDate: state.currentDate,
      status: "open",
      recruitedPoliticianId: null,
      electionId: null,
    };
    const ambitious = Object.values(state.politicians).find(
      (p) => p.alive && !p.retired && p.id !== state.playerPoliticianId && p.partyId,
    )!;
    state.agentProfileOverrides[ambitious.id] = {
      traits: { ambition: 0.95, retirementInclination: 0.05 },
    };
    resetPoliticsMonthCounters(runtime);
    const rng = createRngService("phase12-career-rng");
    const events = processCareerDecisionsMonth(world, state, rng, "CMD_TEST");
    const ambition = ensurePoliticsRuntime(state).careerAmbitions[ambitious.id];
    expect(
      ambition != null ||
        events.some(
          (e) => e.type === "POLITICIAN_CAREER_DECISION" || e.type === "POLITICIAN_RETIRED",
        ),
    ).toBe(true);

    const retiringId = occupyingTerms(state, officesOfKind(world, "assembly_member")[1]!.id)[0]
      ?.holderId;
    expect(retiringId).toBeTruthy();
    if (retiringId && retiringId !== state.playerPoliticianId) {
      state.agentProfileOverrides[retiringId] = {
        traits: { ambition: 0.4, retirementInclination: 0.99 },
      };
      delete runtime.careerAmbitions[retiringId];
      resetPoliticsMonthCounters(runtime);
      // Force many draws until retire sticks, or call exit path via high inclination.
      for (let i = 0; i < 12; i += 1) {
        delete runtime.careerAmbitions[retiringId];
        resetPoliticsMonthCounters(runtime);
        processCareerDecisionsMonth(
          world,
          state,
          createRngService(`phase12-retire-${i}`),
          `CMD_R${i}`,
        );
        if (
          runtime.careerAmbitions[retiringId]?.kind === "retire" ||
          state.politicians[retiringId]?.retired
        ) {
          break;
        }
      }
      expect(
        runtime.careerAmbitions[retiringId]?.kind === "retire" ||
          state.politicians[retiringId]?.retired === true,
      ).toBe(true);
    }
  });

  it("open-seat recruitment detects and recruits", () => {
    const { world, sim } = worldAndSim("phase12-recruit");
    const state = jsonClone(sim.getSnapshot());
    const office = officesOfKind(world, "assembly_member")[0]!;
    const term = occupyingTerms(state, office.id)[0];
    expect(term).toBeTruthy();
    const incumbent = term!.holderId;
    applyPoliticianExit(state, world, incumbent, "retirement", "CMD_R");
    const rng = createRngService("phase12-recruit-rng");
    const events = processOpenSeatRecruitmentMonth(world, state, rng, "CMD_R2");
    const seats = Object.values(ensurePoliticsRuntime(state).openSeatContests);
    expect(seats.length).toBeGreaterThan(0);
    expect(
      events.some((e) => e.type === "OPEN_SEAT_DETECTED" || e.type === "PARTY_RECRUITED_CANDIDATE"),
    ).toBe(true);
  });

  it("leadership contest still resolves with support notes", () => {
    const { world, sim } = worldAndSim("phase12-lead");
    const state = jsonClone(sim.getSnapshot());
    const partyId = Object.keys(state.partyStates).sort()[0]!;
    const members = Object.values(state.politicians)
      .filter(
        (p) => p.partyId === partyId && p.alive && !p.retired && p.id !== state.playerPoliticianId,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(members.length).toBeGreaterThanOrEqual(2);
    const created = createPartyContest(
      state,
      world,
      {
        type: "party_leadership",
        partyId,
        metadata: { selectorMethod: "member_rcv" },
      },
      "CMD_L",
    );
    expect("error" in created).toBe(false);
    if ("error" in created) return;
    for (const m of members.slice(0, 2)) {
      declareCandidacy(state, world, created.contest.id, m.id, "CMD_L");
    }
    openPartyContest(state, created.contest.id, "CMD_L");
    const rng = createRngService("phase12-lead-rng");
    enhanceLeadershipContestsMonth(world, state, rng, "CMD_L2");
    const resolved = resolvePartyContest(state, world, created.contest.id, rng, "CMD_L3");
    expect("error" in resolved).toBe(false);
    expect(state.partyContests[created.contest.id]?.status).toBe("resolved");
    expect(state.partyContests[created.contest.id]?.winnerId).toBeTruthy();
  });

  it("rare party split with fixture override", () => {
    const { world, sim } = worldAndSim("phase12-split");
    const state = jsonClone(sim.getSnapshot());
    const faction = Object.values(state.factionStates).find(
      (f) =>
        f.status === "active" &&
        Object.values(state.politicians).filter((p) => p.factionId === f.factionId).length >= 3,
    );
    expect(faction).toBeTruthy();
    const runtime = ensurePoliticsRuntime(state);
    runtime.lifecycleFixtureOverride = { forceSplitPartyId: faction!.partyId };
    const rng = createRngService("phase12-split-rng");
    const events = processPartyLifecycleMonth(world, state, rng, "CMD_S");
    expect(
      events.some((e) => e.type === "FACTION_SPLIT" || e.type === "PARTY_LIFECYCLE_SPLIT"),
    ).toBe(true);
    expect(Object.keys(state.dynamicParties).length).toBeGreaterThan(0);
  });

  it("memory survives conceptual round-trip (record + read)", () => {
    const { world, sim } = worldAndSim("phase12-mem");
    const state = jsonClone(sim.getSnapshot());
    const a = Object.keys(state.politicians).sort()[0]!;
    const b = Object.keys(state.politicians).sort()[1]!;
    const recorded = recordPoliticalMemory(
      state,
      world,
      {
        ownerId: a,
        subjectIds: [b],
        kind: "endorsement",
        valence: 0.4,
        salience: 0.7,
        durability: "durable",
        tags: ["phase12", "roundtrip"],
        metadata: { test: true },
      },
      state.currentDate,
    );
    expect("error" in recorded).toBe(false);
    processPoliticalMemoryMonth(world, state);
    const recent = recentPoliticalMemories(state, a, 10);
    expect(recent.some((m) => m.tags.includes("roundtrip"))).toBe(true);
    const snap = jsonClone(state);
    const again = recentPoliticalMemories(snap, a, 10);
    expect(again.some((m) => m.tags.includes("roundtrip"))).toBe(true);
  });

  it("cabinet reshuffle event fires for NPC president", () => {
    const { world, sim } = worldAndSim("phase12-cab");
    const state = jsonClone(sim.getSnapshot());
    seedMinistriesIfNeeded(world, state);
    const runtime = ensurePoliticsRuntime(state);
    runtime.lastCabinetReshuffleDate = null;
    runtime.cabinetReshufflesThisYear = 0;
    runtime.cabinetReshuffleYear = Number(state.currentDate.slice(0, 4));
    runtime.metadata.forceCabinetReshuffle = true;
    const rng = createRngService("phase12-cab-force");
    const events = processCabinetReshuffleMonth(world, state, rng, "CMD_C");
    expect(events.some((e) => e.type === "CABINET_RESHUFFLE")).toBe(true);
  });

  it("org scorecard from votes", () => {
    const { world, sim } = worldAndSim("phase12-org");
    advanceIntegrated(sim, 3);
    const live = jsonClone(sim.getSnapshot());
    const votes = Object.values(live.legislatureRuntime.legislativeVotes);
    if (votes.length === 0) {
      const billId = Object.keys(live.legislatureRuntime.bills)[0];
      if (billId) {
        live.legislatureRuntime.legislativeVotes["LV_TEST"] = {
          id: "LV_TEST",
          billId,
          stage: "floor",
          date: live.currentDate,
          committeeId: null,
          votes: { MP01: "yes", MP03: "no" },
          yes: 1,
          no: 1,
          abstain: 0,
          passed: false,
          threshold: "simple_majority_cast",
          metadata: {},
        };
      }
    }
    const rng = createRngService("phase12-org-rng");
    processOrganizationPoliticsMonth(world, live, rng, "CMD_O");
    const cards = Object.values(ensurePoliticsRuntime(live).orgScorecards);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("coalition agreement when forced", () => {
    const { world: _world, sim } = worldAndSim("phase12-coal");
    const state = jsonClone(sim.getSnapshot());
    state.provincialRuntime.constitutionalOrder = {
      ...state.provincialRuntime.constitutionalOrder!,
      cabinetFormation: "assembly_confidence",
      cabinetHasAssemblyConfidence: false,
      cabinetNeedsConfidence: true,
    };
    const events = processCoalitionMonth(_world, state, "CMD_COAL");
    expect(events.some((e) => e.type === "COALITION_FORMED")).toBe(true);
    expect(activeCoalition(state)?.status).toBe("active");
    expect((activeCoalition(state)?.partyIds.length ?? 0) >= 2).toBe(true);
  });

  it("NPC bill still introduces (existing path)", () => {
    const { sim } = worldAndSim("phase12-bills");
    advanceIntegrated(sim, 4);
    const bills = Object.values(sim.getSnapshot().legislatureRuntime.bills);
    const npcSponsored = bills.filter((b) => b.sponsorId !== "NPC146");
    expect(npcSponsored.length).toBeGreaterThan(0);
  });

  it("autonomous 24-month sim: meaningful activity without chaos", () => {
    const { sim } = worldAndSim("phase12-24m");
    advanceIntegrated(sim, 24);
    const state = sim.getSnapshot();
    const runtime = ensurePoliticsRuntime(state as SimState);
    const history = state.history;
    const career = history.filter((e) => e.type === "POLITICIAN_CAREER_DECISION").length;
    const recruit = history.filter((e) => e.type === "PARTY_RECRUITED_CANDIDATE").length;
    const openSeat = history.filter((e) => e.type === "OPEN_SEAT_DETECTED").length;
    const caucus = history.filter((e) => e.type === "CAUCUS_AGENDA_SET").length;
    const reshuffle = history.filter((e) => e.type === "CABINET_RESHUFFLE").length;
    const lifecycle = history.filter(
      (e) =>
        e.type === "PARTY_LIFECYCLE_SPLIT" ||
        e.type === "PARTY_LIFECYCLE_MERGE" ||
        e.type === "FACTION_SPLIT",
    ).length;
    const bills = Object.keys(state.legislatureRuntime.bills).length;

    expect(runtime.lastAgencyMonth).not.toBeNull();
    expect(bills).toBeGreaterThan(0);
    expect(career).toBeLessThanOrEqual(200);
    expect(recruit).toBeLessThanOrEqual(100);
    expect(openSeat).toBeLessThanOrEqual(120);
    expect(reshuffle).toBeLessThanOrEqual(6);
    expect(lifecycle).toBeLessThanOrEqual(3);
    const meaningful =
      career +
      recruit +
      openSeat +
      caucus +
      reshuffle +
      Object.keys(runtime.careerAmbitions).length;
    expect(meaningful).toBeGreaterThan(0);
  });

  it("processPoliticalAgencyMonth is idempotent within a month", () => {
    const { world, sim } = worldAndSim("phase12-idem");
    const state = jsonClone(sim.getSnapshot());
    const rng = createRngService("phase12-idem-rng");
    const first = processPoliticalAgencyMonth(world, state, rng, "CMD_I1");
    const second = processPoliticalAgencyMonth(world, state, rng, "CMD_I2");
    expect(second).toEqual([]);
    expect(Array.isArray(first)).toBe(true);
  });
});
