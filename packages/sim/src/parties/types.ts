import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { IrvResult } from "@lorsain/election-math";

export const MEMBERSHIP_PARTY_ORGANIZATION = "membership_party" as const;
export const INDEPENDENT_AGGREGATE_ORGANIZATION = "independent_aggregate" as const;

export const PARTY_STATUSES = ["active", "leadership_vacant"] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

/**
 * Faction institution status:
 * - active: functioning faction; chairId must resolve to a living current member
 * - chair_vacant: functioning faction with members; chairId must be null
 * - split_origin: total/effective dissolution after a split left no living members;
 *   chairId must be null. Split history lives on FACTION_SPLIT events, not this field.
 */
export const FACTION_STATUSES = ["active", "chair_vacant", "split_origin"] as const;
export type FactionStatus = (typeof FACTION_STATUSES)[number];

export const CONTEST_TYPES = [
  "presidential_nomination",
  "party_leadership",
  "faction_chair",
] as const;
export type PartyContestType = (typeof CONTEST_TYPES)[number];

export const CONTEST_STATUSES = [
  "planned",
  "open",
  "qualification",
  "voting",
  "resolved",
  "cancelled",
] as const;
export type PartyContestStatus = (typeof CONTEST_STATUSES)[number];

export const CANDIDATE_STATUSES = [
  "potential",
  "exploring",
  "declared",
  "qualified",
  "withdrawn",
  "eliminated",
  "winner",
] as const;
export type ContestCandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const ENDORSEMENT_STATUSES = ["active", "withdrawn", "superseded", "ended"] as const;
export type EndorsementStatus = (typeof ENDORSEMENT_STATUSES)[number];

export const ENDORSER_TYPES = ["politician", "faction", "provincial_organization"] as const;
export type EndorserType = (typeof ENDORSER_TYPES)[number];

export const NOMINATION_METHODS = [
  "weighted_ranked_choice",
  "closed_member_rcv",
  "registered_supporter_rcv",
  "transferable_convention",
  "weighted_provincial_delegates",
  "direct_member_rcv",
  "member_rcv",
  "caucus_rcv",
  "none",
] as const;
export type NominationMethod = (typeof NOMINATION_METHODS)[number];

export const SELECTOR_KINDS = [
  "members",
  "union_delegates",
  "supporters",
  "convention_delegates",
  "provincial_delegates",
] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

export const SELECTOR_TENDENCIES = ["institutional", "moderate", "outsider"] as const;
export type SelectorTendency = (typeof SELECTOR_TENDENCIES)[number];

export type QualificationEvidence = {
  memberNominationRequirementSatisfied: boolean;
  provincialSupportRequirementSatisfied: boolean;
};

export type ProvincialPartyOrganization = {
  id: string;
  partyId: string;
  provinceId: string;
  status: "active";
};

export type PresidentialEligibilityRules = {
  minimumAge: number;
  ageMeasuredOn: "presidential_election_day";
  termLimitElected: number;
  mustResignOfficeKinds: string[];
  mayCampaignOfficeKinds: Record<string, boolean>;
};

export type ContestBallotGroup = {
  id: string;
  weight: string;
  rankings: string[];
};

export type ContestCountInput = {
  candidateIds: string[];
  ballots: ContestBallotGroup[];
};

export type PartyDefinition = {
  partyId: string;
  name: string;
  short: string;
  organizationType: typeof MEMBERSHIP_PARTY_ORGANIZATION;
  nominationRuleId: string;
  factionIds: string[];
  canonicalFactionShares: Record<string, number>;
  /** Canonical party color from content; omitted in synthetic harnesses. */
  color?: string | null;
};

export type FactionDefinition = {
  factionId: string;
  partyId: string;
  name: string;
  share: number;
};

export type NominationRuleDefinition = {
  ruleId: string;
  partyId: string;
  method: NominationMethod;
  memberWeight: number | null;
  affiliateUnionDelegateWeight: number | null;
  assemblyCaucusEndorsementFraction: number | null;
  provincialOrganizationEndorsementsMin: number | null;
  memberNominationsRequired: boolean;
  memberNominationThresholdRequired: boolean;
  provincialNominationSupportRequired: boolean;
  supporterRegistrationRequired: boolean;
};

export type DynamicPartyDefinition = {
  partyId: string;
  name: string;
  short: string;
  originPartyId: string;
  originFactionId: string | null;
  nominationRuleId: string;
  createdDate: IsoDate;
};

export const PARTY_PLATFORM_ISSUES = [
  "economy",
  "taxes",
  "labor",
  "housing",
  "social_policy",
  "environment",
  "institutional_reform",
  "foreign_policy",
] as const;
export type PartyPlatformIssue = (typeof PARTY_PLATFORM_ISSUES)[number];

export type PartyPlatformHistoryEntry = {
  date: IsoDate;
  reason: "scenario_opening" | "annual_conference" | "leadership_change";
  leaderId: string | null;
  positions: Record<PartyPlatformIssue, number>;
};

export type PartyPublicPlatform = {
  updatedDate: IsoDate;
  positions: Record<PartyPlatformIssue, number>;
  history: PartyPlatformHistoryEntry[];
};

export type PartyState = {
  partyId: string;
  leaderId: string | null;
  status: PartyStatus;
  cohesion: number;
  /** Public, slowly moving issue positions. Numeric values remain simulation-internal. */
  publicPlatform?: PartyPublicPlatform;
};

export type FactionState = {
  factionId: string;
  partyId: string;
  chairId: string | null;
  status: FactionStatus;
  cohesion: number;
};

export type EndorsementRecord = {
  id: string;
  endorserType: EndorserType;
  endorserId: string;
  targetId: string;
  contestId: string;
  date: IsoDate;
  status: EndorsementStatus;
  public: boolean;
  metadata: JsonObject;
};

export type ContestEntry = {
  politicianId: string;
  status: ContestCandidateStatus;
  declaredDate: IsoDate | null;
  qualificationEvidence: QualificationEvidence;
  seedPresidentialStatus: string | null;
};

export type SelectorGroup = {
  id: string;
  kind: SelectorKind;
  partyId: string;
  factionId: string | null;
  provinceId: string | null;
  tendency: SelectorTendency | null;
  weight: string;
};

export type PartyContest = {
  id: string;
  type: PartyContestType;
  partyId: string;
  factionId: string | null;
  ruleId: string;
  status: PartyContestStatus;
  createdDate: IsoDate;
  openedDate: IsoDate | null;
  resolvedDate: IsoDate | null;
  entries: Record<string, ContestEntry>;
  winnerId: string | null;
  selectorSummary: SelectorGroup[];
  countInput: ContestCountInput | null;
  countArchive: IrvResult | null;
  metadata: JsonObject;
};

export type PublicPartyCulture = {
  partyId: string;
  memberCount: number;
  meanIdeology: Record<string, number>;
};

export function emptyQualificationEvidence(): QualificationEvidence {
  return {
    memberNominationRequirementSatisfied: false,
    provincialSupportRequirementSatisfied: false,
  };
}

export function isPartyStatus(v: string): v is PartyStatus {
  return (PARTY_STATUSES as readonly string[]).includes(v);
}
export function isFactionStatus(v: string): v is FactionStatus {
  return (FACTION_STATUSES as readonly string[]).includes(v);
}
export function isContestType(v: string): v is PartyContestType {
  return (CONTEST_TYPES as readonly string[]).includes(v);
}
export function isContestStatus(v: string): v is PartyContestStatus {
  return (CONTEST_STATUSES as readonly string[]).includes(v);
}
export function isCandidateStatus(v: string): v is ContestCandidateStatus {
  return (CANDIDATE_STATUSES as readonly string[]).includes(v);
}
export function isEndorsementStatus(v: string): v is EndorsementStatus {
  return (ENDORSEMENT_STATUSES as readonly string[]).includes(v);
}
export function isEndorserType(v: string): v is EndorserType {
  return (ENDORSER_TYPES as readonly string[]).includes(v);
}
export function isNominationMethod(v: string): v is NominationMethod {
  return (NOMINATION_METHODS as readonly string[]).includes(v);
}
export function isSelectorKind(v: string): v is SelectorKind {
  return (SELECTOR_KINDS as readonly string[]).includes(v);
}
export function isSelectorTendency(v: string): v is SelectorTendency {
  return (SELECTOR_TENDENCIES as readonly string[]).includes(v);
}
