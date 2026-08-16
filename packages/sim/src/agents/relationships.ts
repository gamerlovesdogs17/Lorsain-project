import { daysBetween, type IsoDate } from "../calendar.js";
import type { CommandError, SimState } from "../types.js";
import { agentMutationDateError, notBeforeExistingDateError } from "./time.js";
import {
  RELATIONSHIP_ANNUAL_DECAY,
  clampUnit,
  exponentialTowardNeutral,
  saturateDelta,
} from "./policy.js";

export type RelationshipStance = {
  affinity: number;
  trust: number;
  respect: number;
};

export type RelationshipEdge = RelationshipStance & {
  sourceId: string;
  targetId: string;
  lastUpdatedDate: IsoDate;
  interactionCount: number;
};

export const NEUTRAL_STANCE: RelationshipStance = { affinity: 0, trust: 0, respect: 0 };

export function countRelationshipEdges(state: Pick<SimState, "relationships">): number {
  let n = 0;
  for (const inner of Object.values(state.relationships)) n += Object.keys(inner).length;
  return n;
}

export function decayStance(stance: RelationshipStance, days: number): RelationshipStance {
  return {
    affinity: exponentialTowardNeutral(stance.affinity, RELATIONSHIP_ANNUAL_DECAY.affinity, days),
    trust: exponentialTowardNeutral(stance.trust, RELATIONSHIP_ANNUAL_DECAY.trust, days),
    respect: exponentialTowardNeutral(stance.respect, RELATIONSHIP_ANNUAL_DECAY.respect, days),
  };
}

export function decayedEdge(edge: RelationshipEdge, asOfDate: IsoDate): RelationshipEdge {
  const days = daysBetween(edge.lastUpdatedDate, asOfDate);
  const stance = decayStance(edge, days);
  return { ...edge, ...stance };
}

/** Read without materializing. Missing edges are neutral and are not stored. */
export function getRelationship(
  state: SimState,
  sourceId: string,
  targetId: string,
  asOfDate: IsoDate,
): RelationshipStance {
  const edge = state.relationships[sourceId]?.[targetId];
  if (!edge) return { ...NEUTRAL_STANCE };
  const decayed = decayedEdge(edge, asOfDate);
  return { affinity: decayed.affinity, trust: decayed.trust, respect: decayed.respect };
}

export function relationshipComposite(stance: RelationshipStance): number {
  return stance.affinity * 0.4 + stance.trust * 0.4 + stance.respect * 0.2;
}

export const RELATIONSHIP_DELTA_KEYS = ["affinity", "trust", "respect"] as const;

export type RelationshipDelta = {
  affinity?: number;
  trust?: number;
  respect?: number;
};

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function relationshipDeltaError(
  delta: unknown,
  label = "relationship delta",
): string | null {
  if (delta === null || typeof delta !== "object" || Array.isArray(delta)) {
    return `${label} must be an object`;
  }
  const rec = delta as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!(RELATIONSHIP_DELTA_KEYS as readonly string[]).includes(key)) {
      return `${label} has unknown key ${key}`;
    }
  }
  for (const key of RELATIONSHIP_DELTA_KEYS) {
    if (!(key in rec)) continue;
    const value = rec[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${label}.${key} must be a finite number`;
    }
  }
  return null;
}

export function parseRelationshipDelta(
  raw: unknown,
  label = "relationship delta",
): RelationshipDelta | string {
  const err = relationshipDeltaError(raw, label);
  if (err) return err;
  return raw as RelationshipDelta;
}

/**
 * Apply a saturating directional delta. Decays any existing edge to asOfDate
 * before writing. Does not create a record for a no-op / still-neutral pair.
 */
export function applyRelationshipChange(
  state: SimState,
  sourceId: string,
  targetId: string,
  delta: RelationshipDelta,
  asOfDate: IsoDate,
): { edge: RelationshipEdge | null } | { error: CommandError } {
  const deltaErr = relationshipDeltaError(delta);
  if (deltaErr) {
    return { error: reject("INVALID_RELATIONSHIP", deltaErr) };
  }
  if (!state.politicians[sourceId]) {
    return { error: reject("UNKNOWN_POLITICIAN", sourceId) };
  }
  if (!state.politicians[targetId]) {
    return { error: reject("UNKNOWN_POLITICIAN", targetId) };
  }
  if (sourceId === targetId) {
    return { error: reject("INVALID_RELATIONSHIP", "sourceId must not equal targetId") };
  }
  const dateErr = agentMutationDateError(state, asOfDate);
  if (dateErr) return { error: reject("INVALID_RELATIONSHIP", dateErr) };
  const existing = state.relationships[sourceId]?.[targetId];
  if (existing) {
    const rewind = notBeforeExistingDateError(
      asOfDate,
      existing.lastUpdatedDate,
      "relationship lastUpdatedDate",
    );
    if (rewind) return { error: reject("INVALID_RELATIONSHIP", rewind) };
  }
  const dAff = saturateDelta(delta.affinity ?? 0);
  const dTrust = saturateDelta(delta.trust ?? 0);
  const dRespect = saturateDelta(delta.respect ?? 0);
  if (!existing && dAff === 0 && dTrust === 0 && dRespect === 0) {
    return { edge: null };
  }
  const base: RelationshipEdge = existing
    ? decayedEdge(existing, asOfDate)
    : {
        sourceId,
        targetId,
        affinity: 0,
        trust: 0,
        respect: 0,
        lastUpdatedDate: asOfDate,
        interactionCount: 0,
      };
  const next: RelationshipEdge = {
    sourceId,
    targetId,
    affinity: clampUnit(base.affinity + dAff),
    trust: clampUnit(base.trust + dTrust),
    respect: clampUnit(base.respect + dRespect),
    lastUpdatedDate: asOfDate,
    interactionCount: base.interactionCount + 1,
  };
  if (!state.relationships[sourceId]) state.relationships[sourceId] = {};
  state.relationships[sourceId][targetId] = next;
  return { edge: next };
}
