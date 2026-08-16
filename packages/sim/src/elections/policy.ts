import type { IdeologyAxis } from "../agents/types.js";

/**
 * Centralized Phase 4 electorate / polling / turnout coefficients.
 * Voters never read hidden AgentProfile traits or skills.
 */

/** Maps canonical issue.dimension labels onto ideology axes. Split labels share salience. */
export const ISSUE_DIMENSION_AXES: Record<string, readonly IdeologyAxis[]> = {
  economic: ["economic"],
  "economic-social": ["economic", "social"],
  social: ["social"],
  institutional: ["authority"],
  foreign: ["nationalism", "globalism"],
};

export const SUPPORT_WEIGHTS = {
  partyHabit: 1.15,
  ideology: 0.95,
  regionalHome: 0.28,
  regionalShare: 0.18,
  incumbency: 0.22,
  officeHolder: 0.08,
  partyLeader: 0.16,
  factionChair: 0.05,
  nameRecognition: 0.22,
  favorability: 0.34,
  enthusiasm: 0.12,
  momentum: 0.1,
  nationalPartyEnv: 0.42,
  constituencyPartyEnv: 0.28,
  issueClimate: 0.12,
} as const;

export const SUPPORT_SOFTMAX_TEMPERATURE = 0.72;
export const SUPPORT_SUM_TOLERANCE = 1e-12;
export const BLOC_WEIGHT_TOLERANCE = 1e-9;
export const SHARE_SUM_TOLERANCE = 1e-8;
export const PROVINCE_SHARE_SUM_TOLERANCE = 1e-4;
export const HOUSE_EFFECT_CENTER_TOLERANCE = 1e-6;

/** Issue-climate and party-environment shifts written into ElectoralEnvironment. */
export const ENVIRONMENT_SHIFT = { min: -1, max: 1 } as const;

/**
 * Modest election-day preference realization, applied to latent first-preference
 * shares before integer allocation. Uses the campaigns stream, never elections.
 */
export const PREFERENCE_REALIZATION = {
  amplitude: 0.018,
} as const;

/** Same-party candidates: faction public culture blend into party culture. */
export const PUBLIC_FACTION_BLEND = 0.28;

export const STANDING_INIT = {
  baseRecognition: 0.04,
  baseFavorability: 0,
  baseEnthusiasm: 0.12,
  baseMomentum: 0,
  presidentRecognition: 0.92,
  presidentFavorability: 0.18,
  ministerRecognition: 0.38,
  mpRecognition: 0.16,
  governorRecognition: 0.34,
  partyLeaderRecognition: 0.55,
  factionChairRecognition: 0.22,
  presidentialFrontrunner: {
    recognition: 0.7,
    favorability: 0.12,
    enthusiasm: 0.35,
    momentum: 0.15,
  },
  presidentialLikely: { recognition: 0.48, favorability: 0.06, enthusiasm: 0.24, momentum: 0.08 },
  presidentialPossible: { recognition: 0.28, favorability: 0.02, enthusiasm: 0.16, momentum: 0.02 },
  presidentialExploring: { recognition: 0.16, favorability: 0, enthusiasm: 0.1, momentum: 0 },
} as const;

export const TURNOUT = {
  minRate: 0.28,
  maxRate: 0.88,
  propensityWeight: 0.45,
  historicalWeight: 0.4,
  importancePresidential: 0.06,
  importanceAssembly: 0.03,
  enthusiasmScale: 0.08,
  dayNoiseAmp: 0.012,
  invalidNoiseAmp: 0.0015,
  minInvalidRate: 0.004,
  maxInvalidRate: 0.035,
} as const;

export const POLL = {
  modelErrorBase: 0.018,
  qualityErrorScale: 0.028,
  likelyVoterTurnoutExponent: 1.35,
  otherMethodTurnoutExponent: 0.55,
  recencyHalfLifeDays: 21,
  qualityAverageWeight: 0.65,
} as const;

export const BALLOT_GROUPS = {
  habitLoyalFull: 0.34,
  habitLoyalTrunc: 0.16,
  ideologyFull: 0.28,
  standingTrunc: 0.22,
  truncationAfter: 3,
  maxRankings: 6,
} as const;

export const TRANSFER = {
  ideology: 1,
  partyFamily: 0.72,
  regional: 0.28,
  standing: 0.22,
  truncationBase: 0.08,
  truncationPerStep: 0.05,
} as const;

/** Modest public electability signal for Phase 3 selectorates. Not latent support. */
export const SELECTOR_ELECTABILITY = {
  standing: 0.06,
  pollShare: 0.09,
} as const;

export const RECOGNIZED_POLL_METHODS = [
  "mixed_mode_likely_voter",
  "online_panel",
  "live_phone_likely_voter",
  "IVR_plus_online",
  "probability_online",
  "mixed_mode",
  "online_likely_voter",
  "live_phone",
  "face_to_face_plus_phone",
  "member_panel",
  "probability_mixed",
  "ivr_likely_voter",
] as const;

export const LIKELY_VOTER_METHODS = [
  "mixed_mode_likely_voter",
  "live_phone_likely_voter",
  "ivr_likely_voter",
  "online_likely_voter",
] as const;

export const NATIONAL_POLLSTER_SCOPE = "national";

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function clampUnit(n: number): number {
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

export function isLikelyVoterMethod(method: string): boolean {
  return (LIKELY_VOTER_METHODS as readonly string[]).includes(method);
}

export function isRecognizedPollMethod(method: string): boolean {
  return (RECOGNIZED_POLL_METHODS as readonly string[]).includes(method);
}

export function pollsterAllowsGeography(
  scope: string,
  geographyKind: "national" | "constituency",
): boolean {
  if (scope === NATIONAL_POLLSTER_SCOPE) return true;
  void geographyKind;
  return false;
}
