import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { ENVIRONMENT_SHIFT } from "../elections/policy.js";
import { activeCoalition } from "../politics/coalitions.js";
import { ensurePoliticsRuntime } from "../politics/state.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensureGoverningRuntime } from "./state.js";
import {
  emptyPromiseStatusCounts,
  emptyServiceOutcomes,
  type GovernmentRecord,
  type PromiseStatus,
} from "./types.js";

/** Soft cap on cumulative national-party mood nudge from governing record. */
const RECORD_MOOD_CAP = 0.15;
const RECORD_MOOD_STEP = 0.03;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function governingPartyId(world: KernelWorld, state: SimState): string | null {
  const presidentId = currentPresidentialAuthorityId(world, state);
  if (!presidentId) return null;
  return state.politicians[presidentId]?.partyId ?? null;
}

function coalitionStability(state: SimState): number {
  const coalition = activeCoalition(state);
  if (!coalition) return 0.55;
  if (coalition.status === "negotiating") return 0.4;
  const brokenRecently = state.history
    .slice(-40)
    .some((e) => e.type === "COALITION_BROKEN" && e.date === state.currentDate);
  if (brokenRecently) return 0.15;
  const ageMonths = Math.max(
    0,
    (Date.parse(state.currentDate) - Date.parse(coalition.formedDate)) / (1000 * 60 * 60 * 24 * 30),
  );
  return clamp(0.55 + Math.min(0.35, ageMonths * 0.02) + coalition.negotiationScore * 0.1, 0, 1);
}

function courtDefeats(state: SimState): number {
  return state.history.filter(
    (e) =>
      e.type === "LAW_INVALIDATED" ||
      e.type === "REGULATION_INVALIDATED" ||
      (e.type === "COURT_DECISION" && e.payload?.outcome === "strike_down"),
  ).length;
}

function scoreRecord(rec: Omit<GovernmentRecord, "score">): number {
  const promises = rec.promiseStatusCounts;
  const kept =
    (promises.enacted ?? 0) + (promises.implemented ?? 0) + (promises.partially_enacted ?? 0);
  const broken = (promises.blocked ?? 0) + (promises.abandoned ?? 0) + (promises.contradicted ?? 0);
  const promiseScore = clamp((kept - broken) / Math.max(1, kept + broken), -1, 1);
  const fiscalScore = clamp(rec.fiscalBalance / 40, -0.4, 0.4);
  const serviceAvg =
    (rec.serviceOutcomes.healthcareAccess +
      rec.serviceOutcomes.educationQuality +
      rec.serviceOutcomes.infrastructureQuality +
      rec.serviceOutcomes.publicSafety +
      rec.serviceOutcomes.administrativeDelivery) /
    5;
  const serviceScore = (serviceAvg - 0.5) * 1.2;
  const lawScore = clamp(rec.lawsPassed / 12, 0, 0.35);
  const courtPenalty = clamp(rec.courtDefeats * 0.04, 0, 0.35);
  return clamp(
    promiseScore * 0.3 +
      fiscalScore +
      serviceScore * 0.35 +
      lawScore +
      (rec.coalitionStability - 0.5) * 0.25 -
      courtPenalty,
    -1,
    1,
  );
}

/** Build a factual snapshot of the sitting government's record (no fabrication). */
export function computeGovernmentRecord(world: KernelWorld, state: SimState): GovernmentRecord {
  const runtime = ensureGoverningRuntime(state);
  const promiseStatusCounts = emptyPromiseStatusCounts();
  for (const p of Object.values(runtime.promises)) {
    promiseStatusCounts[p.status] = (promiseStatusCounts[p.status] ?? 0) + 1;
  }
  const services = { ...emptyServiceOutcomes(), ...runtime.services };
  const base: Omit<GovernmentRecord, "score"> = {
    updatedDate: state.currentDate,
    governingPartyId: governingPartyId(world, state),
    lawsPassed: Object.keys(state.legislatureRuntime.enactedLaws).length,
    promiseStatusCounts,
    fiscalBalance: runtime.fiscal.balance,
    serviceOutcomes: services,
    coalitionStability: coalitionStability(state),
    courtDefeats: courtDefeats(state),
  };
  return { ...base, score: scoreRecord(base) };
}

function applyLightMoodFeedback(state: SimState, record: GovernmentRecord): void {
  const partyId = record.governingPartyId;
  if (!partyId || Math.abs(record.score) < 0.08) return;
  const env = state.electoralEnvironment;
  const cur = env.nationalPartyShift[partyId] ?? 0;
  const delta = record.score > 0 ? RECORD_MOOD_STEP : -RECORD_MOOD_STEP;
  const next = clamp(cur + delta, -RECORD_MOOD_CAP, RECORD_MOOD_CAP);
  env.nationalPartyShift[partyId] = clamp(next, ENVIRONMENT_SHIFT.min, ENVIRONMENT_SHIFT.max);

  // Light issue-climate nudge from weak/strong administrative delivery when present.
  const delivery = record.serviceOutcomes.administrativeDelivery;
  if (delivery < 0.4 || delivery > 0.72) {
    const issueId = "ISS_REFORM";
    const issueCur = env.issueClimateShift[issueId] ?? 0;
    const issueDelta = delivery < 0.4 ? 0.02 : -0.01;
    env.issueClimateShift[issueId] = clamp(
      issueCur + issueDelta,
      ENVIRONMENT_SHIFT.min,
      ENVIRONMENT_SHIFT.max,
    );
  }

  // Touch politics metadata so audits can see the hook fired.
  const politics = ensurePoliticsRuntime(state);
  politics.metadata.lastGoverningRecordScore = record.score;
  politics.metadata.lastGoverningRecordMoodPartyId = partyId;
}

/**
 * Refresh the factual government record quarterly (months 01/04/07/10).
 * Emits GOVERNMENT_RECORD_UPDATED and applies a small electoral-environment nudge.
 */
export function refreshGovernmentRecord(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const month = Number(state.currentDate.slice(5, 7));
  if (![1, 4, 7, 10].includes(month)) return [];

  const runtime = ensureGoverningRuntime(state);
  const record = computeGovernmentRecord(world, state);
  runtime.record = record;
  applyLightMoodFeedback(state, record);

  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_RECORD_UPDATED",
      importance: 0.42,
      visibility: "public",
      actorIds: [],
      entityIds: record.governingPartyId ? [record.governingPartyId] : [],
      payload: {
        score: record.score,
        lawsPassed: record.lawsPassed,
        fiscalBalance: record.fiscalBalance,
        coalitionStability: record.coalitionStability,
        courtDefeats: record.courtDefeats,
        promiseStatusCounts: record.promiseStatusCounts as Record<PromiseStatus, number>,
        governingPartyId: record.governingPartyId,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}
