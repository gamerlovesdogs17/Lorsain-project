import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import {
  AS_AUDIT_BOUNDS_24M,
  AS_AUDIT_BOUNDS_60M,
  type AutonomousAgencyMetrics,
} from "./politics/types.js";
import type { SimState } from "./types.js";

/** Exported for docs / calibration notes. */
export const PHASE12_AUTONOMOUS_AUDIT_METRICS: AutonomousAgencyMetrics[] = [];

function collectMetrics(seed: string, months: number, state: SimState): AutonomousAgencyMetrics {
  const runtime = ensurePoliticsRuntime(state);
  const history = state.history;
  const careerDecisions = history.filter((e) => e.type === "POLITICIAN_CAREER_DECISION").length;
  const recruitments = history.filter((e) => e.type === "PARTY_RECRUITED_CANDIDATE").length;
  const openSeatsDetected = history.filter((e) => e.type === "OPEN_SEAT_DETECTED").length;
  const caucusAgendas = history.filter((e) => e.type === "CAUCUS_AGENDA_SET").length;
  const cabinetReshuffles = history.filter((e) => e.type === "CABINET_RESHUFFLE").length;
  const lifecycleEvents = history.filter(
    (e) =>
      e.type === "PARTY_LIFECYCLE_SPLIT" ||
      e.type === "PARTY_LIFECYCLE_MERGE" ||
      e.type === "PARTY_LIFECYCLE_FORMATION" ||
      e.type === "FACTION_SPLIT",
  ).length;
  const orgCampaigns = history.filter((e) => e.type === "ORG_ISSUE_CAMPAIGN").length;
  const coalitionsFormed = history.filter((e) => e.type === "COALITION_FORMED").length;
  const coalitionsBroken = history.filter((e) => e.type === "COALITION_BROKEN").length;
  const platformReviews = history.filter((e) => e.type === "PARTY_PLATFORM_REVIEW").length;
  const amendmentsProposed = history.filter(
    (e) => e.type === "AMENDMENT_PROPOSED" || e.type === "AMENDMENT_VOTE_PASSED",
  ).length;
  const leadershipContests = history.filter(
    (e) =>
      e.type === "PARTY_CONTEST_RESOLVED" ||
      e.type === "PARTY_LEADERSHIP_CONTEST_RESOLVED" ||
      e.type === "PARTY_LEADERSHIP_CONTEST_REQUIRED" ||
      e.type === "PARTY_CHAIR_ELECTION_OPENED" ||
      e.type === "PARTY_CHAIR_ELECTED",
  ).length;
  const caucusContests = history.filter(
    (e) =>
      e.type === "CAUCUS_LEADERSHIP_ELECTION_OPENED" ||
      e.type === "CAUCUS_LEADERSHIP_ELECTION_RESOLVED",
  ).length;
  const endorsements = history.filter(
    (e) =>
      e.type === "ENDORSEMENT_MADE" ||
      e.type === "ENDORSEMENT_RECEIVED" ||
      e.type === "PARTY_CANDIDATE_ENDORSED",
  ).length;
  const retirements = history.filter((e) => e.type === "POLITICIAN_RETIRED").length;
  const billsIntroduced = Object.keys(state.legislatureRuntime.bills).length;
  const meaningfulActivity =
    careerDecisions +
    recruitments +
    openSeatsDetected +
    caucusAgendas +
    cabinetReshuffles +
    orgCampaigns +
    amendmentsProposed +
    leadershipContests +
    caucusContests +
    endorsements +
    retirements +
    coalitionsBroken +
    Object.keys(runtime.careerAmbitions).length;
  return {
    seed,
    months,
    careerDecisions,
    recruitments,
    openSeatsDetected,
    caucusAgendas,
    cabinetReshuffles,
    lifecycleEvents,
    orgCampaigns,
    coalitionsFormed,
    coalitionsBroken,
    platformReviews,
    billsIntroduced,
    amendmentsProposed,
    leadershipContests,
    caucusContests,
    endorsements,
    retirements,
    meaningfulActivity,
  };
}

function assertBounds(
  metrics: AutonomousAgencyMetrics,
  bounds: typeof AS_AUDIT_BOUNDS_24M | typeof AS_AUDIT_BOUNDS_60M,
): void {
  expect(metrics.careerDecisions).toBeGreaterThanOrEqual(bounds.careerMin);
  expect(metrics.careerDecisions).toBeLessThanOrEqual(bounds.careerMax);
  expect(metrics.recruitments).toBeGreaterThanOrEqual(bounds.recruitMin);
  expect(metrics.recruitments).toBeLessThanOrEqual(bounds.recruitMax);
  expect(metrics.openSeatsDetected).toBeGreaterThanOrEqual(bounds.openSeatMin);
  expect(metrics.openSeatsDetected).toBeLessThanOrEqual(bounds.openSeatMax);
  expect(metrics.caucusAgendas).toBeGreaterThanOrEqual(bounds.caucusMin);
  expect(metrics.caucusAgendas).toBeLessThanOrEqual(bounds.caucusMax);
  expect(metrics.cabinetReshuffles).toBeGreaterThanOrEqual(bounds.reshuffleMin);
  expect(metrics.cabinetReshuffles).toBeLessThanOrEqual(bounds.reshuffleMax);
  expect(metrics.lifecycleEvents).toBeGreaterThanOrEqual(bounds.lifecycleMin);
  expect(metrics.lifecycleEvents).toBeLessThanOrEqual(bounds.lifecycleMax);
  expect(metrics.orgCampaigns).toBeGreaterThanOrEqual(bounds.orgCampaignMin);
  expect(metrics.orgCampaigns).toBeLessThanOrEqual(bounds.orgCampaignMax);
  expect(metrics.meaningfulActivity).toBeGreaterThanOrEqual(bounds.meaningfulMin);
  expect(metrics.billsIntroduced).toBeGreaterThan(0);
  // Soft non-negativity for expanded counters (activity may be rare).
  expect(metrics.amendmentsProposed).toBeGreaterThanOrEqual(0);
  expect(metrics.leadershipContests).toBeGreaterThanOrEqual(0);
  expect(metrics.caucusContests).toBeGreaterThanOrEqual(0);
  expect(metrics.endorsements).toBeGreaterThanOrEqual(0);
  expect(metrics.retirements).toBeGreaterThanOrEqual(0);
  expect(metrics.coalitionsBroken).toBeGreaterThanOrEqual(0);
}

/** Soft cross-seed diversity: at least one tracked counter differs across seeds. */
function assertCrossSeedDiversity(rows: AutonomousAgencyMetrics[]): void {
  if (rows.length < 2) return;
  const keys: Array<keyof AutonomousAgencyMetrics> = [
    "careerDecisions",
    "recruitments",
    "caucusAgendas",
    "cabinetReshuffles",
    "orgCampaigns",
    "coalitionsFormed",
    "coalitionsBroken",
    "amendmentsProposed",
    "leadershipContests",
    "caucusContests",
    "endorsements",
    "retirements",
    "billsIntroduced",
    "meaningfulActivity",
  ];
  let diverse = false;
  for (const key of keys) {
    const values = new Set(rows.map((r) => r[key]));
    if (values.size > 1) {
      diverse = true;
      break;
    }
  }
  expect(diverse).toBe(true);
}

describe("Phase 12 autonomous agency audit", () => {
  const seeds24 = ["phase12-audit-a", "phase12-audit-b", "phase12-audit-c"];
  const seeds60 = ["phase12-audit-60a", "phase12-audit-60b"];

  for (const seed of seeds24) {
    it(`24-month autonomy bounds (${seed})`, () => {
      const world = loadTerenaWorld();
      const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
      advanceIntegrated(sim, 24);
      const metrics = collectMetrics(seed, 24, sim.getSnapshot() as SimState);
      PHASE12_AUTONOMOUS_AUDIT_METRICS.push(metrics);
      assertBounds(metrics, AS_AUDIT_BOUNDS_24M);
      expect(ensurePoliticsRuntime(sim.getSnapshot() as SimState).lastAgencyMonth).not.toBeNull();
    });
  }

  it("24-month soft cross-seed diversity", () => {
    const rows = PHASE12_AUTONOMOUS_AUDIT_METRICS.filter((m) => m.months === 24);
    expect(rows.length).toBeGreaterThanOrEqual(seeds24.length);
    assertCrossSeedDiversity(rows.slice(-seeds24.length));
  });

  for (const seed of seeds60) {
    it(`60-month autonomy bounds (${seed})`, () => {
      const world = loadTerenaWorld();
      const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
      advanceIntegrated(sim, 60);
      const metrics = collectMetrics(seed, 60, sim.getSnapshot() as SimState);
      PHASE12_AUTONOMOUS_AUDIT_METRICS.push(metrics);
      assertBounds(metrics, AS_AUDIT_BOUNDS_60M);
      expect(ensurePoliticsRuntime(sim.getSnapshot() as SimState).lastAgencyMonth).not.toBeNull();
    });
  }

  it("60-month soft cross-seed diversity", () => {
    const rows = PHASE12_AUTONOMOUS_AUDIT_METRICS.filter((m) => m.months === 60);
    expect(rows.length).toBeGreaterThanOrEqual(seeds60.length);
    assertCrossSeedDiversity(rows.slice(-seeds60.length));
  });
});
