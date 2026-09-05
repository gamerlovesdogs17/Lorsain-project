import type { IsoDate } from "../calendar.js";
import type { ElectionCertification } from "../elections/types.js";

export const PROVINCIAL_PRIORITIES = [
  "transport",
  "land_use",
  "schools",
  "hospitals",
  "policing",
  "local_revenue",
] as const;
export type ProvincialPriority = (typeof PROVINCIAL_PRIORITIES)[number];

export const PROVINCIAL_INVESTMENTS = ["transport", "housing", "schools", "hospitals"] as const;
export type ProvincialInvestment = (typeof PROVINCIAL_INVESTMENTS)[number];

export type ProvinceGovernanceState = {
  provinceId: string;
  administrativePriority: ProvincialPriority;
  investmentEmphasis: ProvincialInvestment;
  politicalCapital: number;
  publicStanding: number;
  federalRelationship: number;
  actionPointsRemaining: number;
  actionPointsMonth: IsoDate;
  investmentMomentum: Record<ProvincialInvestment, number>;
  activePressureId: string | null;
  recentActionIds: string[];
};

export type ProvincialActionRecord = {
  id: string;
  date: IsoDate;
  provinceId: string;
  actorId: string;
  kind:
    | "priority"
    | "investment"
    | "federal_position"
    | "pressure_response"
    | "ministry_advice"
    | "civic_priority";
  focus: string;
  direction: number;
};

export type ProvincialPressure = {
  id: string;
  provinceId: string;
  kind: "housing_strain" | "employment_loss" | "service_disruption" | "transport_disruption";
  title: string;
  openedDate: IsoDate;
  severity: number;
  status: "open" | "responded" | "subsided";
  respondedDate: IsoDate | null;
  response: "mobilize" | "coordinate" | "request_federal_support" | null;
};

export type GubernatorialCandidate = {
  politicianId: string;
  partyId: string | null;
  filedDate: IsoDate;
  incumbent: boolean;
  source: "player" | "npc";
  withdrawn: boolean;
};

export const GUBERNATORIAL_INCUMBENT_DECISIONS = [
  "seek_reelection",
  "retire",
  "seek_other_office",
  "leave_electoral_politics",
] as const;
export type GubernatorialIncumbentDecision = (typeof GUBERNATORIAL_INCUMBENT_DECISIONS)[number];

export type GovernorVacancyState = {
  provinceId: string;
  status: "vacant" | "acting";
  openedDate: IsoDate;
  reason: string;
  actingHolderId: string | null;
  expectedElectionId: string | null;
};

export type GubernatorialElection = {
  id: string;
  provinceId: string;
  date: IsoDate;
  filingOpenDate: IsoDate;
  filingDeadlineDate: IsoDate;
  assumptionDate: IsoDate;
  cycleKind: "regular" | "special";
  status: "planned" | "filing_open" | "field_finalized" | "resolved" | "assumed";
  incumbentId: string | null;
  incumbentDecision: GubernatorialIncumbentDecision | null;
  candidates: Record<string, GubernatorialCandidate>;
  playerDecision: "filed" | "declined" | null;
  winnerId: string | null;
  voteShares: Record<string, number>;
  turnoutRate: number | null;
  resultEventId: string | null;
  certification?: ElectionCertification;
};

export const PROVINCIAL_BILL_SUBJECTS = [
  "transport_service",
  "housing_delivery",
  "school_capacity",
  "hospital_access",
  "local_administration",
  "policing_public_safety",
  "environmental_regulation",
  "labor_standards",
  "agricultural_support",
  "utilities_infrastructure",
  "economic_development",
  "social_services",
] as const;
export type ProvincialBillSubject = (typeof PROVINCIAL_BILL_SUBJECTS)[number];

export type ProvincialLegislator = {
  id: string;
  displayName: string;
  description: string;
  provinceId: string;
  partyId: string | null;
  factionId: string | null;
  birthYear: number;
  active: boolean;
  source: "scenario" | "recruited" | "player";
  careerStartDate: IsoDate;
  serviceStartDate: IsoDate | null;
  serviceEndDate: IsoDate | null;
  serviceTerms: Array<{ startDate: IsoDate; endDate: IsoDate | null; electionId: string | null }>;
  electionIds: string[];
  sponsoredBillIds: string[];
  cosponsoredBillIds: string[];
  standing: number;
  legislativeSkill: number;
  campaignSkill: number;
  ambition: number;
  fullPoliticianId: string | null;
};

export const PROVINCIAL_LEADERSHIP_ROLES = ["speaker", "floor_leader", "whip"] as const;
export type ProvincialLeadershipRole = (typeof PROVINCIAL_LEADERSHIP_ROLES)[number];

export type ProvincialPartyLeadership = {
  partyId: string;
  floorLeaderId: string | null;
  whipId: string | null;
  selectedDate: IsoDate;
};

export type ProvincialLeadershipRecord = {
  id: string;
  date: IsoDate;
  provinceId: string;
  role: ProvincialLeadershipRole;
  partyId: string | null;
  candidateIds: string[];
  ballots: Record<string, number>;
  winnerId: string | null;
  trigger: "general_election" | "player_challenge";
};

export type ProvincialAssemblyState = {
  provinceId: string;
  seatCount: number;
  memberIds: string[];
  partySeats: Record<string, number>;
  presidingOfficerId: string | null;
  partyLeadership: Record<string, ProvincialPartyLeadership>;
  leadershipHistory: ProvincialLeadershipRecord[];
  termStartDate: IsoDate;
  nextElectionDate: IsoDate;
  sessionLabel: string;
  agendaBillIds: string[];
};

export type ProvincialAssemblyElection = {
  id: string;
  provinceId: string;
  date: IsoDate;
  status: "planned" | "filing_open" | "resolved";
  candidateIds: string[];
  playerDecision: "filed" | "declined" | null;
  partyVoteShares: Record<string, number>;
  partySeats: Record<string, number>;
  electedIds: string[];
  personalRankingsByParty: Record<string, string[]>;
  turnoutRate: number | null;
  certification?: ElectionCertification;
};

export type ProvincialPartyBillPosition = {
  partyId: string;
  stance: "support" | "oppose" | "free_vote";
  setById: string | null;
  strength: number;
};

export type ProvincialBill = {
  id: string;
  provinceId: string;
  title: string;
  summary: string;
  subject: ProvincialBillSubject;
  sponsorId: string;
  cosponsorIds: string[];
  policyDirection: -1 | 1;
  fiscalImpact: number;
  agendaSource:
    | "governor_priority"
    | "economic_pressure"
    | "legislative_agenda"
    | "organization_pressure"
    | "election_mandate";
  partyPositions: Record<string, ProvincialPartyBillPosition>;
  introducedDate: IsoDate;
  status:
    | "introduced"
    | "passed"
    | "failed"
    | "signed"
    | "vetoed"
    | "invalidated"
    | "override_passed"
    | "override_failed";
  voteId: string | null;
  governorDispositionDate: IsoDate | null;
  effectStrength: number;
};

export type ProvincialVote = {
  id: string;
  provinceId: string;
  subjectKind: "bill" | "veto_override" | "constitutional_ratification";
  subjectId: string;
  date: IsoDate;
  votes: Record<string, "yes" | "no" | "abstain">;
  partyIdsAtVote?: Record<string, string | null>;
  factionIdsAtVote?: Record<string, string | null>;
  yes: number;
  no: number;
  abstain: number;
  passed: boolean;
};

export type ProvincialPromotion = {
  id: string;
  date: IsoDate;
  provinceId: string;
  legislatorId: string;
  politicianId: string;
  reason: "federal_recruitment" | "gubernatorial_recruitment" | "player_career";
};

export const CONSTITUTIONAL_RULE_IDS = [
  "assembly_term_years",
  "presidential_term_limit",
  "court_term_years",
  "veto_override_fraction",
] as const;
export type ConstitutionalRuleId = (typeof CONSTITUTIONAL_RULE_IDS)[number];

export type RuntimeConstitutionalRule = {
  id: ConstitutionalRuleId;
  label: string;
  value: number;
  unit: "years" | "terms" | "fraction";
  amendedDate: IsoDate | null;
  sourceAmendmentId: string | null;
};

export const CONSTITUTIONAL_AMENDMENT_INTENTS = [
  "technical_clarification",
  "expand_individual_rights",
  "restrict_individual_rights",
  "devolve_national_power",
  "centralize_national_power",
  "strengthen_executive",
  "constrain_executive",
  "reform_elections",
  "alter_office_terms",
  "judicial_structure",
] as const;
export type ConstitutionalAmendmentIntent = (typeof CONSTITUTIONAL_AMENDMENT_INTENTS)[number];

export type ConstitutionalAmendment = {
  id: string;
  title: string;
  summary: string;
  sponsorId: string;
  proposedDate: IsoDate;
  ruleId: ConstitutionalRuleId | null;
  proposedValue: number | null;
  /** Clause replacement text for document amendments without a numeric runtime rule. */
  documentClauseId?: string | null;
  currentText?: string | null;
  proposedText?: string | null;
  /** Public legal-policy purpose selected before text is drafted. */
  intent: ConstitutionalAmendmentIntent;
  /** Whether ratification changes a modeled rule or only the authoritative document text. */
  runtimeEffect: "modeled_rule" | "text_only";
  /** Public political resistance, not a hidden formal voting threshold. */
  politicalDifficulty?: number;
  proposalTrigger:
    | "player_sponsorship"
    | "election_mandate"
    | "institutional_conflict"
    | "executive_legislative_conflict"
    | "court_crisis"
    | "reform_movement"
    | "legacy_proposal";
  politicalImpetus: number;
  status: "proposed" | "assembly_failed" | "ratifying" | "ratified" | "failed";
  assemblyVoteId: string | null;
  assemblyVotes: Record<string, "yes" | "no" | "abstain">;
  assemblyYes: number;
  ratificationDeadline: IsoDate | null;
  provincialVoteIds: Record<string, string>;
  ratifiedProvinceIds: string[];
  rejectedProvinceIds: string[];
  enactedDate: IsoDate | null;
};

export type ProvincialRuntime = {
  provinces: Record<string, ProvinceGovernanceState>;
  elections: Record<string, GubernatorialElection>;
  governorVacancies: Record<string, GovernorVacancyState>;
  actions: Record<string, ProvincialActionRecord>;
  pressures: Record<string, ProvincialPressure>;
  assemblies: Record<string, ProvincialAssemblyState>;
  legislators: Record<string, ProvincialLegislator>;
  assemblyElections: Record<string, ProvincialAssemblyElection>;
  bills: Record<string, ProvincialBill>;
  votes: Record<string, ProvincialVote>;
  promotions: Record<string, ProvincialPromotion>;
  constitutionalRules: Record<string, RuntimeConstitutionalRule>;
  constitutionalAmendments: Record<string, ConstitutionalAmendment>;
  lastMonthProcessed: IsoDate | null;
};

export function emptyProvincialRuntime(): ProvincialRuntime {
  return {
    provinces: {},
    elections: {},
    governorVacancies: {},
    actions: {},
    pressures: {},
    assemblies: {},
    legislators: {},
    assemblyElections: {},
    bills: {},
    votes: {},
    promotions: {},
    constitutionalRules: {},
    constitutionalAmendments: {},
    lastMonthProcessed: null,
  };
}

export function isProvincialPriority(value: string): value is ProvincialPriority {
  return (PROVINCIAL_PRIORITIES as readonly string[]).includes(value);
}

export function isProvincialInvestment(value: string): value is ProvincialInvestment {
  return (PROVINCIAL_INVESTMENTS as readonly string[]).includes(value);
}
