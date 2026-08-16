import { daysBetween, type IsoDate } from "../calendar.js";
import type { CommandError, SimState } from "../types.js";
import { agentMutationDateError, notBeforeExistingDateError } from "./time.js";
import {
  BELIEF_CONFIDENCE_HALF_LIFE_DAYS,
  BELIEF_UPDATE,
  clamp,
  clamp01,
  halfLifeDecay,
} from "./policy.js";
import {
  beliefDimensionValid,
  isBeliefTopic,
  type BeliefTopic,
  type IdeologyAxis,
  type SkillKey,
  type TraitKey,
} from "./types.js";

export type BeliefRecord = {
  ownerId: string;
  targetId: string;
  topic: BeliefTopic;
  dimension: string;
  estimate: number;
  confidence: number;
  lastUpdatedDate: IsoDate;
  evidenceCount: number;
  source: string | null;
};

export type Observation = {
  observerId: string;
  targetId: string;
  topic: BeliefTopic;
  dimension: string;
  observed: number;
  observationConfidence: number;
  sourceReliability: number;
  source?: string | null;
};

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function beliefKey(topic: BeliefTopic, dimension: string): string {
  return `${topic}:${dimension}`;
}

export function estimateRange(topic: BeliefTopic): { min: number; max: number; span: number } {
  if (topic === "ideology") return { min: -1, max: 1, span: 2 };
  return { min: 0, max: 1, span: 1 };
}

export function staleConfidence(belief: BeliefRecord, asOfDate: IsoDate): number {
  const days = Math.max(0, daysBetween(belief.lastUpdatedDate, asOfDate));
  return halfLifeDecay(belief.confidence, BELIEF_CONFIDENCE_HALF_LIFE_DAYS[belief.topic], days);
}

export function getBelief(
  state: SimState,
  ownerId: string,
  targetId: string,
  topic: BeliefTopic,
  dimension: string,
  asOfDate: IsoDate,
): BeliefRecord | null {
  const rec = state.beliefs[ownerId]?.[targetId]?.[beliefKey(topic, dimension)];
  if (!rec) return null;
  return { ...rec, confidence: staleConfidence(rec, asOfDate) };
}

function ensureBeliefSlot(
  state: SimState,
  ownerId: string,
  targetId: string,
): Record<string, BeliefRecord> {
  if (!state.beliefs[ownerId]) state.beliefs[ownerId] = {};
  const byTarget = state.beliefs[ownerId];
  if (!byTarget[targetId]) byTarget[targetId] = {};
  return byTarget[targetId];
}

export type ObservationResult =
  | { changed: true; belief: BeliefRecord }
  | { changed: false; belief: BeliefRecord | null }
  | { error: CommandError };

/**
 * Weighted observation update. Repeated credible evidence moves the estimate
 * toward the signal and raises confidence. Weak/unreliable evidence moves less.
 * Strong contradiction can lower confidence. Never writes the target's true profile.
 * quality = observationConfidence * sourceReliability; quality <= 0 is a no-op.
 */
export function recordObservation(
  state: SimState,
  observation: Observation,
  asOfDate: IsoDate,
): ObservationResult {
  const { observerId, targetId, topic, dimension } = observation;
  if (!state.politicians[observerId]) {
    return { error: reject("UNKNOWN_POLITICIAN", observerId) };
  }
  if (!state.politicians[targetId]) {
    return { error: reject("UNKNOWN_POLITICIAN", targetId) };
  }
  if (observerId === targetId) {
    return { error: reject("INVALID_BELIEF", "self-beliefs are not supported") };
  }
  const dateErr = agentMutationDateError(state, asOfDate);
  if (dateErr) return { error: reject("INVALID_BELIEF", dateErr) };
  if (!isBeliefTopic(topic) || !beliefDimensionValid(topic, dimension)) {
    return { error: reject("INVALID_BELIEF", `invalid topic/dimension ${topic}/${dimension}`) };
  }
  if (observation.source != null && typeof observation.source !== "string") {
    return { error: reject("INVALID_BELIEF", "source must be a string or null") };
  }
  const range = estimateRange(topic);
  if (
    typeof observation.observed !== "number" ||
    !Number.isFinite(observation.observed) ||
    observation.observed < range.min ||
    observation.observed > range.max
  ) {
    return { error: reject("INVALID_BELIEF", `observed estimate out of range for ${topic}`) };
  }
  if (
    typeof observation.observationConfidence !== "number" ||
    !Number.isFinite(observation.observationConfidence) ||
    observation.observationConfidence < 0 ||
    observation.observationConfidence > 1
  ) {
    return { error: reject("INVALID_BELIEF", "observationConfidence must be in [0, 1]") };
  }
  if (
    typeof observation.sourceReliability !== "number" ||
    !Number.isFinite(observation.sourceReliability) ||
    observation.sourceReliability < 0 ||
    observation.sourceReliability > 1
  ) {
    return { error: reject("INVALID_BELIEF", "sourceReliability must be in [0, 1]") };
  }
  const quality = observation.observationConfidence * observation.sourceReliability;
  const key = beliefKey(topic, dimension);
  const existing = state.beliefs[observerId]?.[targetId]?.[key] ?? null;
  if (existing) {
    const rewind = notBeforeExistingDateError(
      asOfDate,
      existing.lastUpdatedDate,
      "belief lastUpdatedDate",
    );
    if (rewind) return { error: reject("INVALID_BELIEF", rewind) };
  }
  if (!(quality > 0)) {
    return { changed: false, belief: existing ? { ...existing } : null };
  }
  const slot = ensureBeliefSlot(state, observerId, targetId);
  let next: BeliefRecord;
  if (!existing) {
    next = {
      ownerId: observerId,
      targetId,
      topic,
      dimension,
      estimate: observation.observed,
      confidence: clamp01(
        BELIEF_UPDATE.initialConfidenceFloor + BELIEF_UPDATE.initialConfidenceScale * quality,
      ),
      lastUpdatedDate: asOfDate,
      evidenceCount: 1,
      source: observation.source ?? null,
    };
  } else {
    const confidence = staleConfidence(existing, asOfDate);
    const delta = observation.observed - existing.estimate;
    const disagreement = Math.abs(delta) / range.span;
    const move =
      quality * (BELIEF_UPDATE.moveBase + BELIEF_UPDATE.moveFromUncertainty * (1 - confidence));
    const estimate = clamp(existing.estimate + delta * move, range.min, range.max);
    let nextConfidence = confidence;
    if (
      disagreement > BELIEF_UPDATE.contradictDisagreement &&
      quality > BELIEF_UPDATE.contradictQuality
    ) {
      nextConfidence =
        confidence * (1 - BELIEF_UPDATE.contradictConfidenceLoss * quality * disagreement);
    } else {
      nextConfidence = confidence + (1 - confidence) * quality * BELIEF_UPDATE.agreeConfidenceGain;
    }
    next = {
      ownerId: observerId,
      targetId,
      topic,
      dimension,
      estimate,
      confidence: clamp01(nextConfidence),
      lastUpdatedDate: asOfDate,
      evidenceCount: existing.evidenceCount + 1,
      source: observation.source ?? existing.source,
    };
  }
  slot[key] = next;
  return { changed: true, belief: next };
}

export type { IdeologyAxis, SkillKey, TraitKey };
