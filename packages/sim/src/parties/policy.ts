/** Centralized Phase 3 political-institution coefficients. */

export const INDEPENDENT_AGGREGATE_ID = "PARTY_IND";

export const ENDORSEMENT_INFLUENCE = {
  politician: 1,
  mp: 1.35,
  governor: 1.55,
  partyLeader: 1.9,
  factionChair: 1.7,
  factionInstitutional: 1.45,
  provincialOrganization: 1.15,
} as const;

export const ENDORSEMENT_RELATIONSHIP_DELTA = {
  affinity: 0.04,
  trust: 0.03,
  respect: 0.02,
} as const;

/** Public mass-selectorate weights. Faction remains strongest; endorsements saturate. */
export const SELECTOR_PUBLIC_WEIGHTS = {
  sameFaction: 1.15,
  crossFaction: 0.58,
  endorsementCap: 0.88,
  endorsementK: 0.4,
  prominence: 1.15,
  publicOffice: 0.55,
  leadership: 0.5,
  regional: 1.05,
  discipline: 0.12,
} as const;

/** Stable per-group public idiosyncrasy. Not hidden traits and not extra RNG. */
export const SELECTOR_GROUP_IDIOSYNCRASY = 0.2;

export const SELECTOR_TENDENCY_SHARES = {
  institutional: 0.34,
  moderate: 0.4,
  outsider: 0.26,
} as const;

/**
 * Blend of canonical faction culture with current politician roster composition.
 * 0.22 keeps membership culture mostly stable while allowing major faction swings
 * to move the selectorate without letting one MP redefine millions of members.
 */
export const CURRENT_FACTION_BLEND = 0.22;

export const SELECTOR_PROMINENCE: Record<string, number> = {
  frontrunner: 1,
  likely: 0.75,
  possible: 0.45,
  exploring: 0.25,
  declared: 0.35,
};

export const RL_PROVINCE_FLOOR = 0.012;
export const CR_FACTION_BLEND = 0.45;
export const DISCIPLINE_SIGNAL_SCALE = 0.35;
export const MEMBERSHIP_LOYALTY_STAY = 0.4;
export const CAMPAIGNS_NOISE_AMP = 0.16;

export const PRESIDENTIAL_ENTRY_FROM_STATUS: Record<string, "potential" | "exploring"> = {
  frontrunner: "potential",
  likely: "potential",
  possible: "potential",
  exploring: "exploring",
};
