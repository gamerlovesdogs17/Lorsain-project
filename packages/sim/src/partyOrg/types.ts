import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

// ---------------------------------------------------------------------------
// Enumerated constant arrays
// ---------------------------------------------------------------------------

export const NATIONAL_OFFICE_ROLES = [
  "chair",
  "vice_chair",
  "treasurer",
  "national_committee_member",
] as const;
export type NationalOfficeRole = (typeof NATIONAL_OFFICE_ROLES)[number];

export const LEADERSHIP_ELECTION_METHODS = [
  "membership",
  "committee",
  "convention_delegates",
] as const;
export type LeadershipElectionMethod = (typeof LEADERSHIP_ELECTION_METHODS)[number];

export const NOMINATION_METHODS_FOR_OFFICE = [
  "self_nomination",
  "committee_nomination",
  "designated",
] as const;
export type NominationMethodForOffice = (typeof NOMINATION_METHODS_FOR_OFFICE)[number];

export const PARTY_DISCIPLINE_KINDS = ["warning", "censure", "suspend_support"] as const;
export type PartyDisciplineKind = (typeof PARTY_DISCIPLINE_KINDS)[number];

export const VOTING_SYSTEMS = ["plurality", "runoff", "ranked_choice", "multiple_ballot"] as const;
export type VotingSystem = (typeof VOTING_SYSTEMS)[number];

export const OFFICER_SELECTION_METHODS = [
  "membership",
  "committee",
  "chair_ticket",
  "chair_appointment",
  "chair_appointment_confirmed",
] as const;
export type OfficerSelectionMethod = (typeof OFFICER_SELECTION_METHODS)[number];

export const CHAIR_ELECTION_STAGES = [
  "opening",
  "nominations",
  "campaign",
  "ballot",
  "result",
  "aftermath",
] as const;
export type ChairElectionStage = (typeof CHAIR_ELECTION_STAGES)[number];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * A string label representing a party priority (e.g. "housing", "fiscal_discipline").
 * Kept as an alias so callers can document intent.
 */
export type PartyPriority = string;

/** Governance / election rules for a single party's national organisation. */
export type PartyRules = {
  partyId: string;
  /** How the national chair is elected: by membership ballot, committee vote, or convention. */
  chairElectionMethod: LeadershipElectionMethod;
  /** When true, major actions (coalition talks, discipline, large endorsements) require a
   *  national-committee vote before taking effect. */
  nationalCommitteeApprovalRequired: boolean;
  /** How candidates for chair put themselves forward. */
  nominationMethodForChair: NominationMethodForOffice;
  /** Chair term length in months (0 = indefinite until replaced). */
  termMonths: number;
  /** Ballot rule used when resolving chair elections. */
  votingSystem: VotingSystem;
  /** How the vice chair is selected after a chair is seated. */
  viceChairSelection: OfficerSelectionMethod;
  /** How the treasurer is selected after a chair is seated. */
  treasurerSelection: OfficerSelectionMethod;
  /** Optional free-text description of how challenges to the chair are opened. */
  challengeMechanism?: string;
};

/** A single officer record — one per (partyId, role) combination. */
export type NationalOfficer = {
  role: NationalOfficeRole;
  politicianId: string;
  partyId: string;
  assumedDate: IsoDate;
};

/** An official party stance on an issue. */
export type PartyOfficialPosition = {
  partyId: string;
  issueId: string;
  stance: "support" | "oppose" | "neutral";
  setByActorId: string;
  setDate: IsoDate;
};

/** The party's active campaign strategy descriptor. */
export type PartyCampaignStrategy = {
  partyId: string;
  strategy: string;
  setByActorId: string;
  setDate: IsoDate;
};

/** A recommended disciplinary action against a party member. */
export type PartyDisciplineAction = {
  id: string;
  partyId: string;
  targetId: string;
  kind: PartyDisciplineKind;
  recommendedByActorId: string;
  date: IsoDate;
  status: "pending" | "applied" | "dismissed";
};

/** Candidate program snapshot attached to a chair election. */
export type ChairCandidateProgram = {
  platformDirection: string;
  coalitionStrategy: string;
  campaignStrategy: string;
  priorityIssue: string;
  unityStrategy: string;
};

/** A national chair election cycle. */
export type ChairElection = {
  id: string;
  partyId: string;
  openedDate: IsoDate;
  status: "open" | "resolved" | "cancelled";
  /** politicianIds of declared candidates. */
  candidates: string[];
  winnerId: string | null;
  resolvedDate: IsoDate | null;
  method: LeadershipElectionMethod;
  stage: ChairElectionStage;
  /** Why this election opened (e.g. scheduled, vacancy, challenge). */
  triggerReason: string;
  /** Per-candidate programs keyed by politicianId. */
  programs: Record<string, ChairCandidateProgram>;
  /** Final (or latest) vote tally when resolved. */
  tally?: Record<string, number>;
  votingSystem?: VotingSystem;
};

/** Pending national-committee vote awaiting an explicit player choice. */
export type PendingCommitteeVote = {
  id: string;
  partyId: string;
  proposalKind: string;
  proposalPayload: JsonObject;
  npcYes: number;
  npcNo: number;
  npcAbstain: number;
  playerChoice: "yes" | "no" | "abstain" | null;
  deferredCommand: JsonObject | null;
  /** Linked unified pending action id when present. */
  pendingActionId?: string | null;
  status: "pending" | "resolved" | "cancelled";
  createdDate: IsoDate;
};

export const PENDING_PARTY_ACTION_STATUSES = [
  "awaiting_committee",
  "approved",
  "rejected",
  "executed",
  "cancelled",
] as const;
export type PendingPartyActionStatus = (typeof PENDING_PARTY_ACTION_STATUSES)[number];

/**
 * Deferred major party-org action awaiting (or following) National Committee approval.
 * Payload is applied exactly once via executePendingPartyAction when approved.
 */
export type PendingPartyAction = {
  id: string;
  partyId: string;
  actionType: string;
  payload: JsonObject;
  createdBy: string;
  committeeVoteId: string | null;
  status: PendingPartyActionStatus;
  createdDate: IsoDate;
  executedDate: IsoDate | null;
};

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/**
 * Phase 14 party-organisation runtime.
 * Lazy-initialised; never fabricates history on migration.
 */
export type PartyOrgRuntime = {
  /** Officers: partyId → role → NationalOfficer (absent key = vacant). */
  officers: Record<string, Partial<Record<NationalOfficeRole, NationalOfficer>>>;
  /** Ordered priority list per party. */
  priorities: Record<string, string[]>;
  /** Official positions: partyId → issueId → stance. */
  positions: Record<string, Record<string, "support" | "oppose" | "neutral">>;
  /** Active campaign strategy strings per party. */
  campaignStrategies: Record<string, string>;
  /** Coalition-talk authorisations: partyId → partnerPartyId → {authorized, redLines}. */
  coalitionTalks: Record<string, Record<string, { authorized: boolean; redLines: string[] }>>;
  /** Discipline actions by unique id. */
  disciplineActions: Record<string, PartyDisciplineAction>;
  /** Chair elections by unique id. */
  chairElections: Record<string, ChairElection>;
  /**
   * Party-level candidate endorsements for general/provincial contests.
   * Key = contestId; value includes the party that made it.
   */
  partyEndorsements: Record<
    string,
    { partyId: string; candidateId: string; actorId: string; date: IsoDate }
  >;
  /** Resource/support allocations: partyId → target-key → share (0–1). */
  supportAllocations: Record<string, Record<string, number>>;
  /**
   * National committee member lists (partyId → politicianIds).
   * Seeded to 12–24 members (officers, faction chairs, senior MPs).
   */
  nationalCommittee: Record<string, string[]>;
  /**
   * Provincial party organisations — foundation for sub-national party apparatus.
   * Keyed by provincial-organisation id (mirrors world.provincialPartyOrganizations).
   * Seeded lightly when officers are ensured; leadership seats default to vacant.
   */
  provincialOrganizations?: Record<
    string,
    { partyId: string; provinceId: string; chairId: string | null; assemblyLeaderId: string | null }
  >;
  /** partyId → issueId → emphasis level for messaging. */
  issueEmphasis: Record<string, Record<string, "high" | "medium" | "low">>;
  /** partyId → issueId → selected PLATFORM_POLICY_OPTIONS id. */
  platformPlanks: Record<string, Record<string, string>>;
  /** Pending committee votes awaiting player ballot. */
  pendingCommitteeVotes: Record<string, PendingCommitteeVote>;
  nextPendingCommitteeId: number;
  /** Deferred major actions linked to committee votes (unified execute-on-pass). */
  pendingActions: Record<string, PendingPartyAction>;
  nextPendingActionId: number;
  /** Auto-increment counters private to this runtime (avoids touching shared Counters). */
  nextElectionId: number;
  nextDisciplineId: number;
  lastOrgMonth: IsoDate | null;
  metadata: JsonObject;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function emptyPartyOrgRuntime(): PartyOrgRuntime {
  return {
    officers: {},
    priorities: {},
    positions: {},
    campaignStrategies: {},
    coalitionTalks: {},
    disciplineActions: {},
    chairElections: {},
    partyEndorsements: {},
    supportAllocations: {},
    nationalCommittee: {},
    issueEmphasis: {},
    platformPlanks: {},
    pendingCommitteeVotes: {},
    nextPendingCommitteeId: 1,
    pendingActions: {},
    nextPendingActionId: 1,
    nextElectionId: 1,
    nextDisciplineId: 1,
    lastOrgMonth: null,
    metadata: {},
  };
}
