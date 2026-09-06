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

export type CareerAmbitionKind =
  "seek_higher_office" | "contest_leadership" | "accept_cabinet" | "retire" | "hold_course";

export type CareerAmbitionRecord = {
  politicianId: string;
  kind: CareerAmbitionKind;
  targetOfficeId: string | null;
  targetContestId: string | null;
  decidedDate: IsoDate;
  cooldownUntil: IsoDate | null;
  notes: string;
};

export type OpenSeatContest = {
  id: string;
  officeId: string;
  officeKind: string;
  constituencyId: string | null;
  partyId: string | null;
  reason: "retirement" | "resignation" | "death" | "upcoming_election";
  detectedDate: IsoDate;
  status: "open" | "recruited" | "filled" | "expired";
  recruitedPoliticianId: string | null;
  electionId: string | null;
};

export type CoalitionAgreement = {
  id: string;
  formedDate: IsoDate;
  status: "active" | "broken";
  brokenDate: IsoDate | null;
  partyIds: string[];
  policyPriorities: PartyPlatformIssue[];
  /** Approximate share of cabinet portfolios per party (sums ≈ 1). */
  cabinetShares: Record<string, number>;
  trigger: "assembly_confidence" | "no_plurality";
  breakdownReason: string | null;
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
  startedDate: IsoDate;
  status: "active" | "closed";
  summary: string;
};

export type PartyLifecycleCooldown = {
  partyId: string;
  lastEventDate: IsoDate;
  lastKind: "split" | "merge" | "formation";
};

export type LeadershipSupportExplanation = {
  contestId: string;
  supporterId: string;
  candidateId: string;
  factors: Array<{ code: string; label: string; weight: number }>;
  recordedDate: IsoDate;
};

/**
 * Phase 12 political-agency runtime. Empty on migration — never fabricates history.
 */
export type Phase12Runtime = {
  careerAmbitions: Record<string, CareerAmbitionRecord>;
  partyLifecycleCooldown: Record<string, PartyLifecycleCooldown>;
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
