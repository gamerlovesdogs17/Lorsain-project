import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";

export const COURT_CASE_TYPES = [
  "LAW_REVIEW",
  "REGULATION_REVIEW",
  "EXECUTIVE_ACTION_REVIEW",
  "EMERGENCY_REVIEW",
  "ELECTION_CONSTITUTIONAL_DISPUTE",
  "IMPEACHMENT_JUDGMENT",
  "FEDERAL_PROVINCIAL_DISPUTE",
] as const;
export type CourtCaseType = (typeof COURT_CASE_TYPES)[number];

export const COURT_CASE_STATUSES = ["filed", "pending", "decided", "dismissed"] as const;
export type CourtCaseStatus = (typeof COURT_CASE_STATUSES)[number];

export const COURT_DISPOSITIONS = ["UPHOLD", "INVALIDATE"] as const;
export type CourtDisposition = (typeof COURT_DISPOSITIONS)[number];

export const JUDICIAL_VOTE_CHOICES = ["uphold", "invalidate", "nonparticipation"] as const;
export type JudicialVoteChoice = (typeof JUDICIAL_VOTE_CHOICES)[number];

export const NOMINATION_STATUSES = [
  "awaiting_nomination",
  "pending_confirmation",
  "confirmed",
  "rejected",
  "withdrawn",
] as const;
export type NominationStatus = (typeof NOMINATION_STATUSES)[number];

export const IMPEACHMENT_GROUNDS = [
  "serious_constitutional_abuse",
  "treason",
  "serious_public_corruption",
  "grave_unlawful_exercise_of_office",
] as const;
export type ImpeachmentGrounds = (typeof IMPEACHMENT_GROUNDS)[number];

export const IMPEACHMENT_STATUSES = [
  "introduced",
  "assembly_pending",
  "assembly_failed",
  "court_pending",
  "removed",
  "rejected_by_court",
] as const;
export type ImpeachmentStatus = (typeof IMPEACHMENT_STATUSES)[number];

export const RECALL_STATUSES = [
  "introduced",
  "referral_pending",
  "referral_failed",
  "vote_scheduled",
  "succeeded",
  "failed",
] as const;
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export type CourtCase = {
  id: string;
  filedDate: IsoDate;
  caseType: CourtCaseType;
  petitionerId: string;
  respondentId: string;
  challengedKind:
    | "law"
    | "regulation"
    | "emergency"
    | "war_power"
    | "appointment"
    | "election"
    | "impeachment"
    | "executive_action"
    | "provincial_law";
  challengedId: string;
  constitutionalQuestion: string;
  constitutionalRule: string;
  meritsLean: number;
  status: CourtCaseStatus;
  participatingJudgeIds: string[];
  votes: Record<string, JudicialVoteChoice>;
  disposition: CourtDisposition | null;
  decisionId: string | null;
  decisionDate: IsoDate | null;
  stageReadyDate: IsoDate;
  expedited: boolean;
  eventIds: string[];
  metadata: JsonObject;
};

export type CourtDecision = {
  id: string;
  caseId: string;
  decisionDate: IsoDate;
  disposition: CourtDisposition;
  uphold: number;
  invalidate: number;
  nonparticipation: number;
  votes: Record<string, JudicialVoteChoice>;
  constitutionalQuestion: string;
  constitutionalRule: string;
  caseType: CourtCaseType;
  metadata: JsonObject;
};

export type CourtNomination = {
  id: string;
  seatOfficeId: string;
  nomineeId: string | null;
  nominatorId: string | null;
  nominatedDate: IsoDate | null;
  status: NominationStatus;
  stageReadyDate: IsoDate;
  votes: Record<string, LegislativeVoteChoice>;
  yes: number;
  no: number;
  abstain: number;
  voteId: string | null;
  metadata: JsonObject;
};

export type ImpeachmentProceeding = {
  id: string;
  targetId: string;
  sponsorId: string;
  grounds: ImpeachmentGrounds;
  basisId: string | null;
  evidenceStrength: number;
  severity: number;
  introducedDate: IsoDate;
  status: ImpeachmentStatus;
  stageReadyDate: IsoDate;
  votes: Record<string, LegislativeVoteChoice>;
  yes: number;
  no: number;
  abstain: number;
  caseId: string | null;
  metadata: JsonObject;
};

export type RecallProceeding = {
  id: string;
  targetId: string;
  sponsorId: string;
  introducedDate: IsoDate;
  status: RecallStatus;
  stageReadyDate: IsoDate;
  votes: Record<string, LegislativeVoteChoice>;
  yes: number;
  no: number;
  abstain: number;
  nationalVoteDate: IsoDate | null;
  nationalYesShare: number | null;
  metadata: JsonObject;
};

export type PrecedentRecord = {
  decisionId: string;
  caseId: string;
  caseType: CourtCaseType;
  constitutionalQuestion: string;
  constitutionalRule: string;
  disposition: CourtDisposition;
  decisionDate: IsoDate;
  uphold: number;
  invalidate: number;
};

export type PendingCourtPlayerVote = {
  kind: "confirmation" | "judicial" | "impeachment" | "recall";
  targetId: string;
  choice: string;
};

export const GROUNDS_SOURCE_KINDS = [
  "court_finding",
  "invalidated_emergency",
  "unconstitutional_executive",
  "unconstitutional_war_power",
  "future_corruption_investigation",
  "future_treason_finding",
  "future_scandal",
  "synthetic_test",
] as const;
export type GroundsSourceKind = (typeof GROUNDS_SOURCE_KINDS)[number];

export const GROUNDS_STATUSES = ["available", "consumed", "invalidated"] as const;
export type GroundsStatus = (typeof GROUNDS_STATUSES)[number];

export type ConstitutionalGroundsRecord = {
  id: string;
  targetPoliticianId: string;
  grounds: ImpeachmentGrounds;
  sourceKind: GroundsSourceKind;
  sourceId: string;
  createdDate: IsoDate;
  evidenceStrength: number;
  severity: number;
  public: boolean;
  status: GroundsStatus;
  metadata: JsonObject;
};

export type ConstitutionalRuntime = {
  courtCases: Record<string, CourtCase>;
  courtDecisions: Record<string, CourtDecision>;
  nominations: Record<string, CourtNomination>;
  impeachments: Record<string, ImpeachmentProceeding>;
  recalls: Record<string, RecallProceeding>;
  precedents: Record<string, PrecedentRecord>;
  grounds: Record<string, ConstitutionalGroundsRecord>;
  pendingPlayerVotes: Record<string, PendingCourtPlayerVote>;
  lastMonthProcessed: IsoDate | null;
};

export function emptyConstitutionalRuntime(): ConstitutionalRuntime {
  return {
    courtCases: {},
    courtDecisions: {},
    nominations: {},
    impeachments: {},
    recalls: {},
    precedents: {},
    grounds: {},
    pendingPlayerVotes: {},
    lastMonthProcessed: null,
  };
}

export function isCourtCaseType(v: string): v is CourtCaseType {
  return (COURT_CASE_TYPES as readonly string[]).includes(v);
}

export function isJudicialVoteChoice(v: string): v is JudicialVoteChoice {
  return (JUDICIAL_VOTE_CHOICES as readonly string[]).includes(v);
}

export function isImpeachmentGrounds(v: string): v is ImpeachmentGrounds {
  return (IMPEACHMENT_GROUNDS as readonly string[]).includes(v);
}

export function isGroundsSourceKind(v: string): v is GroundsSourceKind {
  return (GROUNDS_SOURCE_KINDS as readonly string[]).includes(v);
}

export type CourtConstitution = {
  judges: number;
  termYears: number;
  renewable: boolean;
  confirmationFraction: number;
  recallReferralFraction: number;
  recallVoteDays: number;
};

export const DEFAULT_COURT_CONSTITUTION: CourtConstitution = {
  judges: 9,
  termYears: 12,
  renewable: false,
  confirmationFraction: 0.6,
  recallReferralFraction: 0.6,
  recallVoteDays: 60,
};

export const MAX_ACTIVE_COURT_CASES = 3;
