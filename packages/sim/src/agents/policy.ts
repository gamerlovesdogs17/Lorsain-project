import type { AiTier, BeliefTopic, MemoryDurability } from "./types.js";

/** Civil-year length used by lazy decay (no calendar-month sweeps). */
export const DAYS_PER_YEAR = 365.25;

/**
 * Directional interpersonal stance range. Missing edges are treated as 0 (neutral).
 */
export const RELATIONSHIP_MIN = -1;
export const RELATIONSHIP_MAX = 1;

/**
 * Maximum absolute change applied in a single relationship interaction.
 * Minor contacts cannot slam an edge to ±1.
 */
export const RELATIONSHIP_MAX_ABS_DELTA = 0.25;

/**
 * Annual exponential decay rates toward neutral (0). Applied lazily from
 * lastUpdatedDate. Affinity is more ephemeral than trust/respect.
 *
 * decayed = value * (1 - annualRate) ^ (days / 365.25)
 */
export const RELATIONSHIP_ANNUAL_DECAY = {
  affinity: 0.35,
  trust: 0.12,
  respect: 0.1,
} as const;

/** Memory valence range. */
export const MEMORY_VALENCE_MIN = -1;
export const MEMORY_VALENCE_MAX = 1;
export const MEMORY_SALIENCE_MIN = 0;
export const MEMORY_SALIENCE_MAX = 1;

/**
 * Effective-salience half-lives in days. Permanent memories do not decay.
 * computed = salience * 0.5 ^ (days / halfLife)
 */
export const MEMORY_HALF_LIFE_DAYS: Record<Exclude<MemoryDurability, "permanent">, number> = {
  fleeting: 30,
  normal: 180,
  durable: 720,
};

/** Non-permanent memories retained per politician, by AI tier. */
export const MEMORY_NONPERMANENT_CAPS: Record<AiTier, number> = {
  rich: 100,
  standard: 50,
  light: 20,
};

/** Permanent memories are separately capped to bound save growth. */
export const MEMORY_PERMANENT_CAP = 40;

/**
 * Belief confidence half-lives in days (lazy staleness). Estimate is unchanged;
 * low confidence does not reveal truth.
 */
export const BELIEF_CONFIDENCE_HALF_LIFE_DAYS: Record<BeliefTopic, number> = {
  ideology: 365 * 4,
  trait: 365 * 8,
  skill: 365 * 2,
};

/** Observation blending (not Bayesian). quality = observationConfidence * sourceReliability. */
export const BELIEF_UPDATE = {
  initialConfidenceFloor: 0.2,
  initialConfidenceScale: 0.5,
  moveBase: 0.25,
  moveFromUncertainty: 0.55,
  agreeConfidenceGain: 0.35,
  contradictDisagreement: 0.45,
  contradictQuality: 0.5,
  contradictConfidenceLoss: 0.35,
} as const;

export const GOAL_PRIORITY_MIN = 0;
export const GOAL_PRIORITY_MAX = 1;

/** Maximum active goals generated/retained per AI tier. */
export const MAX_ACTIVE_GOALS: Record<AiTier, number> = {
  rich: 5,
  standard: 3,
  light: 2,
};

/** Drafts below this priority are dropped before ranking. */
export const GOAL_MIN_DRAFT_PRIORITY = 0.15;

/**
 * Decision utility coefficients. Each contribution is
 * (base + traitWeight * trait) * bounded signal.
 * No single factor can dominate; practical max weight per channel is ~0.30.
 */
export const DECISION_WEIGHTS = {
  ideologyBase: 0.18,
  partyBase: 0.06,
  partyLoyalty: 0.22,
  factionBase: 0.05,
  factionLoyalty: 0.22,
  careerBase: 0.06,
  ambition: 0.24,
  relationshipBase: 0.05,
  sociability: 0.18,
  integrityBase: 0.08,
  integrity: 0.24,
  institutionalBase: 0.06,
  institutionalism: 0.22,
  egoBase: 0.04,
  ego: 0.18,
  pragmatismBase: 0.06,
  pragmatism: 0.2,
  riskBase: 0.06,
  riskAversion: 0.22,
  goalScale: 0.28,
  /** Blend domain-provided relationship signal with known interpersonal stance. */
  relationshipDomainBlend: 0.4,
  relationshipKnowledgeBlend: 0.6,
} as const;

/** Option consideration budget (after deterministic pre-rank, before noise). */
export const DECISION_OPTION_BUDGET: Record<AiTier, number> = {
  rich: 24,
  standard: 12,
  light: 6,
};

/** Memory rows included in decision context, by tier. */
export const DECISION_MEMORY_CONTEXT: Record<AiTier, number> = {
  rich: 8,
  standard: 4,
  light: 0,
};

/**
 * Symmetric noise amplitude before uncertainty scaling.
 * final noise = min(cap, tierNoise * (1 + option.uncertainty))
 * Drawn from npc-decisions as (float01 * 2 - 1) * amplitude.
 */
export const DECISION_TIER_NOISE: Record<AiTier, number> = {
  rich: 0.02,
  standard: 0.04,
  light: 0.08,
};

export const DECISION_NOISE_CAP = 0.12;

export const UTILITY_SUM_EPSILON = 1e-9;

export function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

export function clampUnit(n: number): number {
  return clamp(n, RELATIONSHIP_MIN, RELATIONSHIP_MAX);
}

export function saturateDelta(delta: number): number {
  return clamp(delta, -RELATIONSHIP_MAX_ABS_DELTA, RELATIONSHIP_MAX_ABS_DELTA);
}

export function exponentialTowardNeutral(value: number, annualRate: number, days: number): number {
  if (days <= 0 || annualRate <= 0 || value === 0) return value;
  return value * (1 - annualRate) ** (days / DAYS_PER_YEAR);
}

export function halfLifeDecay(value: number, halfLifeDays: number, days: number): number {
  if (days <= 0 || value === 0) return value;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return value;
  return value * 0.5 ** (days / halfLifeDays);
}
