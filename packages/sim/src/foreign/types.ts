import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

export const TERENA_WORLD_ID = "W41" as const;

export const MILITARY_POSTURE_LEVELS = [
  "normal",
  "heightened",
  "mobilized",
  "crisis_deployment",
] as const;
export type MilitaryPostureLevel = (typeof MILITARY_POSTURE_LEVELS)[number];

export const CAPABILITY_AXES = [
  "economic",
  "land",
  "air",
  "naval",
  "strategic",
  "cyber",
  "logistics",
] as const;
export type CapabilityAxis = (typeof CAPABILITY_AXES)[number];

export type CapabilityVector = Record<CapabilityAxis, number>;

export const STRATEGIC_GOAL_IDS = [
  "secure_alliance",
  "expand_trade",
  "regional_hegemony",
  "energy_security",
  "territorial_integrity",
  "regime_stability",
  "counter_rival",
  "multilateral_leadership",
  "sanctions_relief",
  "maritime_access",
  "technological_edge",
  "neutral_autonomy",
] as const;
export type StrategicGoalId = (typeof STRATEGIC_GOAL_IDS)[number];

export const CRISIS_STAGES = [
  "latent",
  "incident",
  "active",
  "deescalating",
  "settled",
  "conflict",
] as const;
export type CrisisStage = (typeof CRISIS_STAGES)[number];

export const TREATY_KINDS = [
  "collective_security",
  "trade",
  "non_aggression",
  "mutual_defense",
  "sanctions_coordination",
] as const;
export type TreatyKind = (typeof TREATY_KINDS)[number];

export const TREATY_RATIFICATION_STATUSES = [
  "not_required",
  "pending",
  "ratified",
  "rejected",
  "withdrawn",
] as const;
export type TreatyRatificationStatus = (typeof TREATY_RATIFICATION_STATUSES)[number];

export type BilateralRelation = {
  general: number;
  trust: number;
  securityTension: number;
  economicTies: number;
  lastUpdated: IsoDate | null;
};

export type ForeignCountryRuntime = {
  countryId: string;
  leaderId: string;
  posture: MilitaryPostureLevel;
  capabilities: CapabilityVector;
  tradeExposure: number;
  strategicGoals: StrategicGoalId[];
  institutionIds: string[];
  activeSanctionIds: string[];
  metadata: JsonObject;
};

export type TreatyRecord = {
  id: string;
  kind: TreatyKind;
  title: string;
  proposerId: string;
  memberIds: string[];
  signedDate: IsoDate | null;
  status: "proposed" | "active" | "suspended" | "terminated";
  ratificationStatus: TreatyRatificationStatus;
  ratificationVoteId: string | null;
  metadata: JsonObject;
};

export type SanctionRecord = {
  id: string;
  imposerId: string;
  targetId: string;
  imposedDate: IsoDate;
  liftedDate: IsoDate | null;
  severity: number;
  economicWeight: number;
  active: boolean;
  metadata: JsonObject;
};

export type InternationalCrisis = {
  id: string;
  stage: CrisisStage;
  participantIds: string[];
  focalPairKey: string | null;
  startedDate: IsoDate;
  lastStageChange: IsoDate;
  intensity: number;
  metadata: JsonObject;
};

export type InternationalConflict = {
  id: string;
  belligerentIds: string[];
  startedDate: IsoDate;
  endedDate: IsoDate | null;
  intensity: number;
  crisisId: string | null;
  metadata: JsonObject;
};

export type DiplomaticActionKind =
  | "outreach"
  | "summit"
  | "sanctions"
  | "lift_sanctions"
  | "posture_change"
  | "exercises"
  | "treaty_proposal"
  | "warning"
  | "mediation"
  | "trade_negotiation"
  | "alliance_consultation";

export type DiplomaticActionRecord = {
  id: string;
  date: IsoDate;
  actorCountryId: string;
  targetCountryId: string | null;
  kind: DiplomaticActionKind;
  initiator: "player" | "ai";
  metadata: JsonObject;
};

export type TreatyRatificationState = {
  treatyId: string;
  voteId: string;
  introducedDate: IsoDate;
  status: "pending" | "passed" | "failed";
};

export type PendingPresidentialForeignAction = {
  kind: DiplomaticActionKind;
  targetCountryId: string | null;
  treatyKind?: TreatyKind;
  severity?: number;
  posture?: MilitaryPostureLevel;
  metadata: JsonObject;
};

export type ForeignAffairsRuntime = {
  countries: Record<string, ForeignCountryRuntime>;
  bilateralRelations: Record<string, BilateralRelation>;
  treaties: Record<string, TreatyRecord>;
  sanctions: Record<string, SanctionRecord>;
  crises: Record<string, InternationalCrisis>;
  conflicts: Record<string, InternationalConflict>;
  diplomaticActions: Record<string, DiplomaticActionRecord>;
  treatyRatifications: Record<string, TreatyRatificationState>;
  pendingPresidentialActions: PendingPresidentialForeignAction[];
  pendingPlayerTreatyVotes: Record<string, { treatyId: string; choice: "yes" | "no" | "abstain" | null }>;
  diplomaticActionsThisMonth: number;
  lastMonthProcessed: IsoDate | null;
};

export type CanonicalWorldCountry = {
  id: string;
  name: string;
  region: string;
  government: string;
  population: number;
  powerTier: string;
  alignment: string;
  alignmentIds: string[];
  neighborIds: string[];
  relationWithTerena: number;
  mapPathId: string;
};

export type CanonicalWorldInstitution = {
  id: string;
  name: string;
  type: string;
  founded: number | null;
};

export type CanonicalWorldLeader = {
  id: string;
  countryId: string;
  name: string;
  title: string;
  sinceYear: number;
  governmentForm: string;
};

export function emptyCapabilityVector(): CapabilityVector {
  return {
    economic: 0.3,
    land: 0.3,
    air: 0.3,
    naval: 0.3,
    strategic: 0.2,
    cyber: 0.2,
    logistics: 0.3,
  };
}

export function emptyBilateralRelation(): BilateralRelation {
  return {
    general: 0,
    trust: 0.5,
    securityTension: 0.15,
    economicTies: 0.2,
    lastUpdated: null,
  };
}

export function emptyForeignAffairsRuntime(): ForeignAffairsRuntime {
  return {
    countries: {},
    bilateralRelations: {},
    treaties: {},
    sanctions: {},
    crises: {},
    conflicts: {},
    diplomaticActions: {},
    treatyRatifications: {},
    pendingPresidentialActions: [],
    pendingPlayerTreatyVotes: {},
    diplomaticActionsThisMonth: 0,
    lastMonthProcessed: null,
  };
}

export function isMilitaryPostureLevel(v: string): v is MilitaryPostureLevel {
  return (MILITARY_POSTURE_LEVELS as readonly string[]).includes(v);
}

export function isStrategicGoalId(v: string): v is StrategicGoalId {
  return (STRATEGIC_GOAL_IDS as readonly string[]).includes(v);
}

export function isTreatyKind(v: string): v is TreatyKind {
  return (TREATY_KINDS as readonly string[]).includes(v);
}

export function isCrisisStage(v: string): v is CrisisStage {
  return (CRISIS_STAGES as readonly string[]).includes(v);
}

export const MAX_DIPLOMATIC_ACTIONS_PER_MONTH = 2;
