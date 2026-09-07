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
   *  national-committee stub-approval before taking effect. */
  nationalCommitteeApprovalRequired: boolean;
  /** How candidates for chair put themselves forward. */
  nominationMethodForChair: NominationMethodForOffice;
  /** Chair term length in months (0 = indefinite until replaced). */
  termMonths: number;
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
   * Provincial party organisations — foundation for sub-national party apparatus.
   * Keyed by provincial-organisation id (mirrors world.provincialPartyOrganizations).
   * Seeded lightly when officers are ensured; leadership seats default to vacant.
   */
  provincialOrganizations?: Record<
    string,
    { partyId: string; provinceId: string; chairId: string | null; assemblyLeaderId: string | null }
  >;
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
    nextElectionId: 1,
    nextDisciplineId: 1,
    lastOrgMonth: null,
    metadata: {},
  };
}
