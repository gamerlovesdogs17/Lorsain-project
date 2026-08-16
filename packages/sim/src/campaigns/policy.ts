/** Centralized Phase 5 campaign coefficients. Effects stay small and bounded. */

export const CAMPAIGN_CASH = {
  max: 50_000_000,
  minRaise: 1,
} as const;

export const CAMPAIGN_ACTION_POINTS = {
  base: 2,
  officeBonus: 1,
  max: 3,
} as const;

export const FUNDRAISING = {
  base: 18_000,
  standingWeight: 0.55,
  skillWeight: 0.45,
  capacityWeight: 0.35,
  officeWeight: 0.25,
  pollWeight: 0.2,
  endorsementWeight: 0.15,
  noiseAmp: 0.08,
  effort: 1,
} as const;

export const STANDING_DELTA = {
  maxPerAction: 0.045,
  visit: 0.018,
  organize: 0.012,
  ad: 0.022,
  message: 0.016,
  attack: 0.02,
  backlash: 0.014,
  debate: 0.028,
  endorsement: 0.015,
  momentumFromAction: 0.012,
} as const;

export const DIMINISHING = {
  halfLife: 0.58,
  recentLimit: 10,
  sameKeyMonths: 4,
} as const;

export const MOMENTUM = {
  monthlyDecay: 0.62,
  maxAbs: 1,
} as const;

export const FIELD = {
  organizeGain: 0.14,
  visitOrgGain: 0.05,
  turnoutScale: 0.035,
} as const;

export const AD_SPEND = {
  min: 1,
  ref: 40_000,
  k: 0.55,
} as const;

export const DEBATE = {
  prepWeight: 0.35,
  mediaWeight: 0.4,
  standingWeight: 0.2,
  noiseAmp: 0.08,
  nominationMonths: [3, 6, 8],
  generalMonths: [9],
} as const;

export const WITHDRAW = {
  pollHopeless: 0.08,
  cashFloor: 4_000,
} as const;

export const QUALIFICATION = {
  milestoneBase: 0.62,
  standingWeight: 0.22,
  skillWeight: 0.16,
  nuBatch: 4,
} as const;

export const PUBLIC_EFFECT_CLAMP = 0.08;
