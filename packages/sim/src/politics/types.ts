import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { PartyPlatformIssue } from "../parties/types.js";

/** Autonomous System activity caps — keep NPC agency busy but not chaotic. */
export const AS_MAX_CAREER_ACTIONS_PER_MONTH = 8;
export const AS_MAX_RECRUITMENTS_PER_MONTH = 4;
export const AS_MAX_CABINET_RESHUFFLES_PER_YEAR = 2;
export const AS_MAX_LIFECYCLE_EVENTS_PER_YEAR = 1;
export const AS_MAX_ORG_CAMPAIGNS_PER_MONTH = 3;
export const AS_MAX_PRIORITY_BILLS_PER_CAUCUS = 3;
export const AS_CAREER_COOLDOWN_MONTHS = 6;
export const AS_PARTY_LIFECYCLE_COOLDOWN_MONTHS = 36;
export const AS_CABINET_RESHUFFLE_COOLDOWN_MONTHS = 10;
export const AS_MEMORY_ALLIANCE_THRESHOLD = 3;
export const AS_MEMORY_RIVALRY_THRESHOLD = 2;

/** Documented autonomous activity bounds (per seed run). Used by audit tests/docs. */
export const AS_AUDIT_BOUNDS_24M = {
  careerMin: 1,
  careerMax: 200,
  recruitMin: 0,
  recruitMax: 100,
  openSeatMin: 0,
  openSeatMax: 120,
  caucusMin: 0,
  caucusMax: 160,
  reshuffleMin: 0,
  reshuffleMax: 6,
  lifecycleMin: 0,
  lifecycleMax: 3,
  orgCampaignMin: 0,
  orgCampaignMax: 80,
  meaningfulMin: 1,
} as const;

export const AS_AUDIT_BOUNDS_60M = {
  careerMin: 2,
  careerMax: 480,
  recruitMin: 0,
  recruitMax: 240,
  openSeatMin: 0,
  openSeatMax: 280,
  caucusMin: 0,
  caucusMax: 400,
  reshuffleMin: 0,
  reshuffleMax: 12,
  lifecycleMin: 0,
  lifecycleMax: 5,
  orgCampaignMin: 0,
  orgCampaignMax: 180,
  meaningfulMin: 3,
} as const;

export type CareerAmbitionKind =
  "seek_higher_office" | "contest_leadership" | "accept_cabinet" | "retire" | "hold_course";

export type CareerAmbitionStage =
  "considering" | "exploring" | "candidate" | "campaigning" | "won" | "lost" | "withdrew";

export type CareerAmbitionRecord = {
  politicianId: string;
  kind: CareerAmbitionKind;
  stage: CareerAmbitionStage;
  targetOfficeId: string | null;
  targetContestId: string | null;
  targetElectionId: string | null;
  willingCabinet: boolean;
  decidedDate: IsoDate;
  cooldownUntil: IsoDate | null;
  notes: string;
};

export type OpenSeatCategory =
  "countback" | "upcoming_election" | "by_election" | "future_open_seat" | "midterm_exit";

export type OpenSeatContest = {
  id: string;
  officeId: string;
  officeKind: string;
  constituencyId: string | null;
  partyId: string | null;
  reason: "retirement" | "resignation" | "death" | "upcoming_election" | "by_election";
  category: OpenSeatCategory;
  detectedDate: IsoDate;
  status: "open" | "recruited" | "filled" | "expired" | "skipped_countback";
  recruitedPoliticianId: string | null;
  electionId: string | null;
};

export type CoalitionAgreement = {
  id: string;
  formedDate: IsoDate;
  status: "active" | "broken" | "negotiating";
  brokenDate: IsoDate | null;
  partyIds: string[];
  policyPriorities: PartyPlatformIssue[];
  /** Approximate share of cabinet portfolios per party (sums ≈ 1). */
  cabinetShares: Record<string, number>;
  trigger: "assembly_confidence" | "no_plurality";
  breakdownReason: string | null;
  negotiationScore: number;
  alternativeOptions: Array<{ partyIds: string[]; score: number }>;
  metadata: JsonObject;
};

export type OrgScorecardEntry = {
  orgId: string;
  politicianId: string;
  issueId: string;
  score: number;
  votesCounted: number;
  lastUpdated: IsoDate;
};

export type OrgIssueCampaign = {
  id: string;
  orgId: string;
  issueId: string;
  stance: "support" | "oppose";
  targetPoliticianId: string | null;
  targetBillId: string | null;
  startedDate: IsoDate;
  status: "active" | "closed";
  summary: string;
};

export type PartyLifecycleCooldown = {
  partyId: string;
  lastEventDate: IsoDate;
  lastKind: "split" | "merge" | "formation";
};

export type PartyFamilyLink = {
  partyId: string;
  event: "split_from" | "merged_into" | "formed" | "absorbed";
  relatedPartyId: string | null;
  date: IsoDate;
  notes: string;
};

export type LeadershipSupportExplanation = {
  contestId: string;
  supporterId: string;
  candidateId: string;
  factors: Array<{ code: string; label: string; weight: number }>;
  recordedDate: IsoDate;
};

export type CabinetReshuffleReason =
  | "poor_performance"
  | "coalition_balance"
  | "faction_pressure"
  | "upcoming_election"
  | "forced_fixture";

export type AutonomousAgencyMetrics = {
  seed: string;
  months: number;
  careerDecisions: number;
  recruitments: number;
  openSeatsDetected: number;
  caucusAgendas: number;
  cabinetReshuffles: number;
  lifecycleEvents: number;
  orgCampaigns: number;
  coalitionsFormed: number;
  coalitionsBroken: number;
  platformReviews: number;
  billsIntroduced: number;
  amendmentsProposed: number;
  leadershipContests: number;
  caucusContests: number;
  endorsements: number;
  retirements: number;
  meaningfulActivity: number;
};

/**
 * Phase 12 political-agency runtime. Empty on migration — never fabricates history.
 */
export type Phase12Runtime = {
  careerAmbitions: Record<string, CareerAmbitionRecord>;
  partyLifecycleCooldown: Record<string, PartyLifecycleCooldown>;
  partyFamilyHistory: PartyFamilyLink[];
  coalitionAgreements: Record<string, CoalitionAgreement>;
  orgScorecards: Record<string, OrgScorecardEntry>;
  orgCampaigns: Record<string, OrgIssueCampaign>;
  openSeatContests: Record<string, OpenSeatContest>;
  leadershipSupportNotes: Record<string, LeadershipSupportExplanation>;
  lastAgencyMonth: IsoDate | null;
  cabinetReshufflesThisYear: number;
  cabinetReshuffleYear: number | null;
  lastCabinetReshuffleDate: IsoDate | null;
  lifecycleEventsThisYear: number;
  lifecycleEventYear: number | null;
  /** Test / scenario fixture override for rare lifecycle rolls (0–1 probability boost). */
  lifecycleFixtureOverride: {
    forceSplitPartyId?: string | null;
    forceMergePartyIds?: [string, string] | null;
    forceFormation?: boolean;
    probabilityFloor?: number;
  } | null;
  activityThisMonth: {
    careerActions: number;
    recruitments: number;
    orgCampaigns: number;
  };
  metadata: JsonObject;
};

export function emptyPoliticsRuntime(): Phase12Runtime {
  return {
    careerAmbitions: {},
    partyLifecycleCooldown: {},
    partyFamilyHistory: [],
    coalitionAgreements: {},
    orgScorecards: {},
    orgCampaigns: {},
    openSeatContests: {},
    leadershipSupportNotes: {},
    lastAgencyMonth: null,
    cabinetReshufflesThisYear: 0,
    cabinetReshuffleYear: null,
    lastCabinetReshuffleDate: null,
    lifecycleEventsThisYear: 0,
    lifecycleEventYear: null,
    lifecycleFixtureOverride: null,
    activityThisMonth: {
      careerActions: 0,
      recruitments: 0,
      orgCampaigns: 0,
    },
    metadata: {},
  };
}
