import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { IdeologyAxis } from "../agents/types.js";

export const COMMITTEE_IDS = [
  "COMMITTEE_ECONOMIC",
  "COMMITTEE_SOCIAL_ECONOMIC",
  "COMMITTEE_SOCIAL",
  "COMMITTEE_INSTITUTIONAL",
  "COMMITTEE_FOREIGN",
] as const;
export type CommitteeId = (typeof COMMITTEE_IDS)[number];

export const COMMITTEE_DIMENSIONS: Record<CommitteeId, string> = {
  COMMITTEE_ECONOMIC: "economic",
  COMMITTEE_SOCIAL_ECONOMIC: "economic-social",
  COMMITTEE_SOCIAL: "social",
  COMMITTEE_INSTITUTIONAL: "institutional",
  COMMITTEE_FOREIGN: "foreign",
};

export const BILL_STATUSES = [
  "draft",
  "introduced",
  "committee",
  "committee_failed",
  "committee_passed",
  "floor_scheduled",
  "floor_failed",
  "floor_passed",
  "sent_to_president",
  "signed",
  "returned_by_president",
  "repassage_scheduled",
  "repassed",
  "repassage_failed",
  "enacted",
  "withdrawn",
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const LEGISLATIVE_VOTE_CHOICES = ["yes", "no", "abstain"] as const;
export type LegislativeVoteChoice = (typeof LEGISLATIVE_VOTE_CHOICES)[number];

export const LEGISLATIVE_VOTE_STAGES = ["committee", "floor", "repassage"] as const;
export type LegislativeVoteStage = (typeof LEGISLATIVE_VOTE_STAGES)[number];

export const RECOMMENDATION_STANCES = ["support", "oppose", "free_vote"] as const;
export type RecommendationStance = (typeof RECOMMENDATION_STANCES)[number];

export const AMENDMENT_STATUSES = ["proposed", "adopted", "rejected", "withdrawn"] as const;
export type AmendmentStatus = (typeof AMENDMENT_STATUSES)[number];

export const PRESIDENTIAL_DISPOSITIONS = ["pending", "signed", "returned", "none"] as const;
export type PresidentialDisposition = (typeof PRESIDENTIAL_DISPOSITIONS)[number];

export type PolicyItem = {
  issueId: string;
  provisionId?: string;
  optionId?: string;
  direction: number;
  magnitude: number;
  fiscalImpact: number | null;
  /** Optional qualitative structure for choices that do not fit one left-right scalar. */
  dimensionEffects?: Partial<Record<IdeologyAxis, number>>;
};

export type CommitteeState = {
  id: CommitteeId;
  name: string;
  dimension: string;
  memberIds: string[];
  chairId: string | null;
};

export type BillState = {
  id: string;
  sponsorId: string;
  cosponsorIds: string[];
  introducedDate: IsoDate | null;
  title: string;
  summary: string;
  policyItems: PolicyItem[];
  assignedCommitteeId: CommitteeId | null;
  status: BillStatus;
  amendmentIds: string[];
  committeeVoteId: string | null;
  floorVoteId: string | null;
  presidentialDisposition: PresidentialDisposition;
  repassageVoteId: string | null;
  enactedDate: IsoDate | null;
  enactedLawId: string | null;
  /** Month the current vote-bearing stage began. Tallied only after a later month. */
  stageReadyDate: IsoDate | null;
  metadata: JsonObject;
  version: number;
  versionHistory: BillVersionRecord[];
};

export type BillVersionRecord = {
  version: number;
  date: IsoDate;
  reason: "introduced" | "amendment_adopted";
  amendmentId: string | null;
  policyItems: PolicyItem[];
};

export type AmendmentState = {
  id: string;
  billId: string;
  sponsorId: string;
  date: IsoDate;
  policyItems: PolicyItem[];
  status: AmendmentStatus;
  metadata: JsonObject;
  targetProvisionIds: string[];
};

export type LegislativeVoteRecord = {
  id: string;
  billId: string;
  stage: LegislativeVoteStage;
  date: IsoDate;
  committeeId: CommitteeId | null;
  votes: Record<string, LegislativeVoteChoice>;
  /** Public affiliation snapshots prevent later party changes from rewriting the roll call. */
  partyIdsAtVote?: Record<string, string | null>;
  factionIdsAtVote?: Record<string, string | null>;
  yes: number;
  no: number;
  abstain: number;
  passed: boolean;
  threshold: "simple_majority_cast" | "absolute_majority";
  metadata: JsonObject;
};

export type EnactedLawRecord = {
  id: string;
  billId: string;
  title: string;
  policyItems: PolicyItem[];
  amendmentIds: string[];
  floorVoteId: string | null;
  repassageVoteId: string | null;
  presidentialDisposition: PresidentialDisposition;
  enactedDate: IsoDate;
  sponsorId: string;
  eventIds: string[];
  operative: boolean;
  invalidatedByDecisionId: string | null;
  metadata: JsonObject;
};

/** One stack frame: an Act that set a provision to a concrete option. */
export type ProvisionEnactmentRecord = {
  lawId: string;
  optionId: string;
  enactedDate: IsoDate;
  /** Option in force immediately before this enactment; null when departing founding baseline. */
  previousOptionId: string | null;
};

export type LawProvenanceAction = "amend" | "replace" | "repeal";

export type PendingPlayerVote = {
  billId: string;
  stage: LegislativeVoteStage;
  choice: LegislativeVoteChoice;
  amendmentId: string | null;
};

export type PartyRecommendation = {
  partyId: string;
  billId: string;
  stance: RecommendationStance;
  setById?: string | null;
  date?: IsoDate;
  source?: "caucus_leadership" | "derived";
};

export type FactionRecommendation = {
  factionId: string;
  billId: string;
  stance: RecommendationStance;
};

export type CaucusLeadershipState = {
  partyId: string;
  floorLeaderId: string | null;
  whipId: string | null;
  selectedDate: IsoDate | null;
  nextElectionDate: IsoDate;
  priorityBillIds: string[];
  /** Optional Phase 12 caucus agenda extensions (backward-compatible). */
  leadershipCandidateId?: string | null;
  platformDemand?: string | null;
  coalitionPreference?: string[] | null;
};

export type CaucusLeadershipContest = {
  id: string;
  partyId: string;
  role: "floor_leader" | "whip";
  status: "open" | "resolved" | "cancelled";
  openedDate: IsoDate;
  closeDate: IsoDate;
  candidateIds: string[];
  playerDecision: "declared" | "declined" | null;
  votes: Record<string, string>;
  winnerId: string | null;
  trigger: "general_election" | "vacancy" | "challenge" | "scheduled_review";
  platforms: Record<string, "legislative_agenda" | "party_unity" | "electoral_recovery">;
  endorsements: Record<string, string[]>;
};

export type LegislatureRuntime = {
  committees: Record<string, CommitteeState>;
  bills: Record<string, BillState>;
  amendments: Record<string, AmendmentState>;
  legislativeVotes: Record<string, LegislativeVoteRecord>;
  enactedLaws: Record<string, EnactedLawRecord>;
  /**
   * Per-provision enactment stack (oldest → newest). Current law is the top entry;
   * empty means founding baseline.
   */
  provisionHistory: Record<string, ProvisionEnactmentRecord[]>;
  partyRecommendations: Record<string, PartyRecommendation>;
  factionRecommendations: Record<string, FactionRecommendation>;
  caucusLeadership: Record<string, CaucusLeadershipState>;
  caucusContests: Record<string, CaucusLeadershipContest>;
  floorQueue: string[];
  pendingPlayerVotes: Record<string, PendingPlayerVote>;
  lastMonthProcessed: IsoDate | null;
  sessionLabel: string;
};

export function emptyLegislatureRuntime(): LegislatureRuntime {
  return {
    committees: {},
    bills: {},
    amendments: {},
    legislativeVotes: {},
    enactedLaws: {},
    provisionHistory: {},
    partyRecommendations: {},
    factionRecommendations: {},
    caucusLeadership: {},
    caucusContests: {},
    floorQueue: [],
    pendingPlayerVotes: {},
    lastMonthProcessed: null,
    sessionLabel: "assembly",
  };
}

export function isBillStatus(v: string): v is BillStatus {
  return (BILL_STATUSES as readonly string[]).includes(v);
}

export function isCommitteeId(v: string): v is CommitteeId {
  return (COMMITTEE_IDS as readonly string[]).includes(v);
}

export function isLegislativeVoteChoice(v: string): v is LegislativeVoteChoice {
  return (LEGISLATIVE_VOTE_CHOICES as readonly string[]).includes(v);
}

export function isLegislativeVoteStage(v: string): v is LegislativeVoteStage {
  return (LEGISLATIVE_VOTE_STAGES as readonly string[]).includes(v);
}

export function pendingVoteKey(
  billId: string,
  stage: LegislativeVoteStage,
  amendmentId: string | null = null,
): string {
  return `${billId}:${stage}:${amendmentId ?? "_"}`;
}
