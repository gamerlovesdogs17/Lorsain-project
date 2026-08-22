import type { IrvResult, StvResult } from "@lorsain/election-math";
import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { IdeologyAxis } from "../agents/types.js";

export const ELECTION_TYPES = ["presidential", "assembly"] as const;
export type ElectionType = (typeof ELECTION_TYPES)[number];

export const ELECTION_STATUSES = [
  "planned",
  "field_open",
  "field_finalized",
  "voting",
  "resolved",
  "cancelled",
] as const;
export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

export const ELECTION_GEOGRAPHIES = ["national", "constituency"] as const;
export type ElectionGeographyKind = (typeof ELECTION_GEOGRAPHIES)[number];

export const DOMAIN_RESOLUTION_TYPES = [
  "presidential_election",
  "assembly_election",
  "presidential_assumption",
  "assembly_assumption",
] as const;
export type DomainResolutionType = (typeof DOMAIN_RESOLUTION_TYPES)[number];

export const CANONICAL_PRESIDENTIAL_ELECTION_ID = "ELEC_PRES_2028";
export const CANONICAL_ASSEMBLY_ELECTION_ID = "ELEC_ASM_2030";

export type IdeologyVector = Record<IdeologyAxis, number>;

export type VoterBlocDefinition = {
  id: string;
  constituencyId: string;
  archetype: string;
  weight: number;
  turnoutPropensity: number;
  partyHabit: Record<string, number>;
  ideology: IdeologyVector;
  issueSalience: Record<string, number>;
};

export type TurnoutBaseline2026 = {
  totalPopulation: number;
  registeredElectorate: number;
  ballotsCast: number;
  turnoutRate: number;
  invalidOrBlank: number;
  validVoteValue: number;
};

export type ConstituencyElectorate = {
  constituencyId: string;
  population: number;
  seats: number;
  provincePopulationShares: Array<{ provinceId: string; share: number }>;
  turnout2026: TurnoutBaseline2026;
};

export type PollsterDefinition = {
  id: string;
  name: string;
  scope: string;
  method: string;
  sampleSizeMin: number;
  sampleSizeMax: number;
  quality: number;
  houseEffectsUnit: "vote_share_points";
  houseEffectsCentered: boolean;
  houseEffectsByParty: Record<string, number>;
  cadence: string;
};

export type CandidateStanding = {
  politicianId: string;
  nameRecognition: number;
  favorability: number;
  enthusiasm: number;
  momentum: number;
};

export type ElectoralEnvironment = {
  nationalPartyShift: Record<string, number>;
  constituencyPartyShift: Record<string, Record<string, number>>;
  issueClimateShift: Record<string, number>;
};

export type ElectionCandidate = {
  politicianId: string;
  partyId: string | null;
  sourceContestId: string | null;
  filedDate: IsoDate;
  /** Required for independents; ignored as hidden-profile fallback. */
  publicIdeology: IdeologyVector | null;
  withdrawn: boolean;
  /**
   * Explicit Phase 4 hook that independent qualification evidence was satisfied.
   * Signature/petition mechanics remain deferred. Party nominees are always false.
   */
  independentQualified: boolean;
};

export type BallotGroupArchive = {
  id: string;
  weight: string;
  rankings: string[];
};

export type ElectionCountInput = {
  candidateIds: string[];
  ballots: BallotGroupArchive[];
  seats?: number;
};

export type TurnoutRecord = {
  registeredElectorate: number;
  ballotsCast: number;
  invalidOrBlank: number;
  validVoteValue: number;
  turnoutRate: number;
};

export type ElectionState = {
  id: string;
  type: ElectionType;
  date: IsoDate;
  status: ElectionStatus;
  geographyKind: ElectionGeographyKind;
  constituencyId: string | null;
  seats: number;
  fieldFinalized: boolean;
  candidates: Record<string, ElectionCandidate>;
  partiesWithoutNominee: string[];
  turnout: TurnoutRecord | null;
  countInput: ElectionCountInput | null;
  countArchive: IrvResult | StvResult | null;
  winnerIds: string[];
  resultEventId: string | null;
  metadata: JsonObject;
};

export type PollCandidateShare = {
  politicianId: string;
  partyId: string | null;
  share: number;
};

export type PollRecord = {
  id: string;
  pollsterId: string;
  electionId: string | null;
  geographyKind: ElectionGeographyKind;
  constituencyId: string | null;
  fieldStart: IsoDate;
  fieldEnd: IsoDate;
  publicationDate: IsoDate;
  sampleSize: number;
  method: string;
  candidateSnapshot: Array<{ politicianId: string; partyId: string | null }>;
  firstPreference: PollCandidateShare[];
  marginOfError: number;
  houseEffectApplied: Record<string, number>;
  metadata: JsonObject;
};

export type DomainResolutionRecord = {
  id: string;
  sourceScheduledEventId: string;
  domainType: DomainResolutionType;
  date: IsoDate;
  electionId: string | null;
  resultEventId: string;
  archiveElectionId: string | null;
  metadata: JsonObject;
};

export type PublicCandidateFacts = {
  politicianId: string;
  partyId: string | null;
  factionId: string | null;
  homeProvinceId: string | null;
  officeKinds: string[];
  isIncumbentPresident: boolean;
  isPartyLeader: boolean;
  isFactionChair: boolean;
  publicIdeology: IdeologyVector | null;
  standing: CandidateStanding;
};

export type ElectorateKernelSlice = {
  voterBlocs: Record<string, VoterBlocDefinition>;
  voterBlocIdsByConstituency: Record<string, string[]>;
  constituencyElectorate: Record<string, ConstituencyElectorate>;
  pollsters: Record<string, PollsterDefinition>;
  issueDimensions: Record<string, string>;
};

export function emptyElectoralEnvironment(): ElectoralEnvironment {
  return {
    nationalPartyShift: {},
    constituencyPartyShift: {},
    issueClimateShift: {},
  };
}

export function emptyElectoralRuntime(): {
  elections: Record<string, ElectionState>;
  candidateStanding: Record<string, CandidateStanding>;
  electoralEnvironment: ElectoralEnvironment;
  polls: Record<string, PollRecord>;
  domainResolutions: Record<string, DomainResolutionRecord>;
} {
  return {
    elections: {},
    candidateStanding: {},
    electoralEnvironment: emptyElectoralEnvironment(),
    polls: {},
    domainResolutions: {},
  };
}

export function isElectionType(v: string): v is ElectionType {
  return (ELECTION_TYPES as readonly string[]).includes(v);
}

export function isElectionStatus(v: string): v is ElectionStatus {
  return (ELECTION_STATUSES as readonly string[]).includes(v);
}

export function isDomainResolutionType(v: string): v is DomainResolutionType {
  return (DOMAIN_RESOLUTION_TYPES as readonly string[]).includes(v);
}

export function isElectionGeographyKind(v: string): v is ElectionGeographyKind {
  return (ELECTION_GEOGRAPHIES as readonly string[]).includes(v);
}
