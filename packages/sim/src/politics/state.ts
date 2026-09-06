import type { SimState } from "../types.js";
import { emptyPoliticsRuntime, type Phase12Runtime } from "./types.js";

export function ensurePoliticsRuntime(state: SimState): Phase12Runtime {
  if (!state.politicsRuntime) {
    state.politicsRuntime = emptyPoliticsRuntime();
  }
  return state.politicsRuntime;
}

export function resetPoliticsMonthCounters(runtime: Phase12Runtime): void {
  runtime.activityThisMonth = {
    careerActions: 0,
    recruitments: 0,
    orgCampaigns: 0,
  };
}

export function parsePoliticsRuntime(raw: unknown): Phase12Runtime | string {
  if (raw == null) return emptyPoliticsRuntime();
  if (typeof raw !== "object" || Array.isArray(raw)) return "politicsRuntime must be an object";
  const obj = raw as Record<string, unknown>;
  const base = emptyPoliticsRuntime();
  if (
    obj.careerAmbitions &&
    typeof obj.careerAmbitions === "object" &&
    !Array.isArray(obj.careerAmbitions)
  ) {
    base.careerAmbitions = obj.careerAmbitions as Phase12Runtime["careerAmbitions"];
  }
  if (
    obj.partyLifecycleCooldown &&
    typeof obj.partyLifecycleCooldown === "object" &&
    !Array.isArray(obj.partyLifecycleCooldown)
  ) {
    base.partyLifecycleCooldown =
      obj.partyLifecycleCooldown as Phase12Runtime["partyLifecycleCooldown"];
  }
  if (
    obj.coalitionAgreements &&
    typeof obj.coalitionAgreements === "object" &&
    !Array.isArray(obj.coalitionAgreements)
  ) {
    base.coalitionAgreements = obj.coalitionAgreements as Phase12Runtime["coalitionAgreements"];
  }
  if (
    obj.orgScorecards &&
    typeof obj.orgScorecards === "object" &&
    !Array.isArray(obj.orgScorecards)
  ) {
    base.orgScorecards = obj.orgScorecards as Phase12Runtime["orgScorecards"];
  }
  if (
    obj.orgCampaigns &&
    typeof obj.orgCampaigns === "object" &&
    !Array.isArray(obj.orgCampaigns)
  ) {
    base.orgCampaigns = obj.orgCampaigns as Phase12Runtime["orgCampaigns"];
  }
  if (
    obj.openSeatContests &&
    typeof obj.openSeatContests === "object" &&
    !Array.isArray(obj.openSeatContests)
  ) {
    base.openSeatContests = obj.openSeatContests as Phase12Runtime["openSeatContests"];
  }
  if (
    obj.leadershipSupportNotes &&
    typeof obj.leadershipSupportNotes === "object" &&
    !Array.isArray(obj.leadershipSupportNotes)
  ) {
    base.leadershipSupportNotes =
      obj.leadershipSupportNotes as Phase12Runtime["leadershipSupportNotes"];
  }
  if (typeof obj.lastAgencyMonth === "string" || obj.lastAgencyMonth === null) {
    base.lastAgencyMonth = (obj.lastAgencyMonth as string | null) ?? null;
  }
  if (typeof obj.cabinetReshufflesThisYear === "number") {
    base.cabinetReshufflesThisYear = obj.cabinetReshufflesThisYear;
  }
  if (typeof obj.cabinetReshuffleYear === "number" || obj.cabinetReshuffleYear === null) {
    base.cabinetReshuffleYear = (obj.cabinetReshuffleYear as number | null) ?? null;
  }
  if (typeof obj.lastCabinetReshuffleDate === "string" || obj.lastCabinetReshuffleDate === null) {
    base.lastCabinetReshuffleDate = (obj.lastCabinetReshuffleDate as string | null) ?? null;
  }
  if (typeof obj.lifecycleEventsThisYear === "number") {
    base.lifecycleEventsThisYear = obj.lifecycleEventsThisYear;
  }
  if (typeof obj.lifecycleEventYear === "number" || obj.lifecycleEventYear === null) {
    base.lifecycleEventYear = (obj.lifecycleEventYear as number | null) ?? null;
  }
  if (obj.lifecycleFixtureOverride === null || typeof obj.lifecycleFixtureOverride === "object") {
    base.lifecycleFixtureOverride =
      (obj.lifecycleFixtureOverride as Phase12Runtime["lifecycleFixtureOverride"]) ?? null;
  }
  if (obj.activityThisMonth && typeof obj.activityThisMonth === "object") {
    const a = obj.activityThisMonth as Record<string, unknown>;
    base.activityThisMonth = {
      careerActions: typeof a.careerActions === "number" ? a.careerActions : 0,
      recruitments: typeof a.recruitments === "number" ? a.recruitments : 0,
      orgCampaigns: typeof a.orgCampaigns === "number" ? a.orgCampaigns : 0,
    };
  }
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    base.metadata = obj.metadata as Phase12Runtime["metadata"];
  }
  return base;
}
