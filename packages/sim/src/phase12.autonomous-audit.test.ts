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
  const platformReviews = history.filter((e) => e.type === "PARTY_PLATFORM_REVIEW").length;
  const billsIntroduced = Object.keys(state.legislatureRuntime.bills).length;
  const meaningfulActivity =
    careerDecisions +
    recruitments +
    openSeatsDetected +
    caucusAgendas +
    cabinetReshuffles +
    orgCampaigns +
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
    platformReviews,
    billsIntroduced,
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
});
