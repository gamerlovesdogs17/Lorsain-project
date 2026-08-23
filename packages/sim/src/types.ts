import type { IsoDate, RegularElectionCalendar } from "./calendar.js";
import type { JsonObject } from "./json.js";
import type { SerializedRngState, StreamName } from "./rng.js";
import type { BeliefRecord } from "./agents/beliefs.js";
import type { PoliticianGoal } from "./agents/goals.js";
import type { PoliticalMemory } from "./agents/memories.js";
import type { AgentProfile, AgentProfileOverride } from "./agents/profile.js";
import type { RelationshipEdge } from "./agents/relationships.js";
import type { MemoryDurability, MemoryKind } from "./agents/types.js";
import type {
  CandidateStanding,
  ConstituencyElectorate,
  DomainResolutionRecord,
  ElectionState,
  ElectoralEnvironment,
  IdeologyVector,
  PollRecord,
  PollsterDefinition,
  VoterBlocDefinition,
} from "./elections/types.js";
import type { CampaignRuntime } from "./campaigns/types.js";
import type {
  DynamicPartyDefinition,
  EndorsementRecord,
  FactionDefinition,
  FactionState,
  NominationMethod,
  NominationRuleDefinition,
  PartyContest,
  PartyDefinition,
  PartyState,
  PresidentialEligibilityRules,
  ProvincialPartyOrganization,
} from "./parties/types.js";
import type {
  LegislatureRuntime,
  PolicyItem,
  LegislativeVoteChoice,
  LegislativeVoteStage,
} from "./legislature/types.js";
import type { ExecutiveRuntime, MotionKind } from "./executive/types.js";
import type { ConstitutionalRuntime, CourtCaseType, JudicialVoteChoice } from "./courts/types.js";
import type { CanonicalEconomyScenario, EconomyRuntime } from "./economy/types.js";
import type {
  CanonicalInterestOrganization,
  OrganizationRuntime,
} from "./organizations/types.js";
import type { CanonicalMediaOutlet, MediaRuntime } from "./media/types.js";
import type {
  CanonicalWorldCountry,
  CanonicalWorldInstitution,
  CanonicalWorldLeader,
  ForeignAffairsRuntime,
} from "./foreign/types.js";
import type {
  ProvincialInvestment,
  ProvincialPriority,
  ProvincialRuntime,
} from "./provinces/types.js";

export type { CanonicalWorldCountry, CanonicalWorldInstitution, CanonicalWorldLeader } from "./foreign/types.js";

export const SAVE_SCHEMA_VERSION = 12 as const;

export type PoliticianRuntime = {
  id: string;
  alive: boolean;
  retired: boolean;
  partyId: string | null;
  factionId: string | null;
};

export type OfficeTermStatus = "active" | "ended" | "suspended";
export type HoldingKind = "substantive" | "acting";
export type ExpirationPolicy = "auto_vacate" | "requires_domain_resolution" | "none";

export type OfficeTerm = {
  id: string;
  officeId: string;
  holderId: string;
  startDate: IsoDate | null;
  startKnown: boolean;
  endDate: IsoDate | null;
  accessionReason: string;
  status: OfficeTermStatus;
  holdingKind: HoldingKind;
  sourceElectionId: string | null;
  endedDate: IsoDate | null;
  endedReason: string | null;
};

export type ScheduledEventStatus = "pending" | "processed" | "cancelled";

export type ScheduledEvent = {
  id: string;
  dueDate: IsoDate;
  eventType: string;
  payload: JsonObject;
  priority: number;
  sequence: number;
  blocking: boolean;
  requiresResolution: boolean;
  source: string | null;
  status: ScheduledEventStatus;
};

export type InterruptKind = "PRESENTATION" | "BLOCKING_DOMAIN";
export type InterruptResolutionStatus = "unresolved" | "acknowledged" | "resolved";

export type PendingInterrupt = {
  kind: InterruptKind;
  code: string;
  date: IsoDate;
  scheduledEventId: string;
  message: string;
  requiresResolution: boolean;
  resolutionStatus: InterruptResolutionStatus;
};

/** @deprecated Use PendingInterrupt. Kept as an alias for existing imports. */
export type DomainInterrupt = PendingInterrupt;

export type SimEvent = {
  id: string;
  date: IsoDate;
  turn: number;
  type: string;
  importance: number;
  visibility: "public" | "system";
  actorIds: string[];
  entityIds: string[];
  payload: JsonObject;
  sourceScheduledEventId: string | null;
  sourceCommandId: string | null;
};

export type Counters = {
  nextEventId: number;
  nextScheduledId: number;
  nextTermId: number;
  schedulerSequence: number;
  nextCommandId: number;
  nextMemoryId: number;
  nextGoalId: number;
  nextEndorsementId: number;
  nextPartyContestId: number;
  nextDynamicPartyId: number;
  nextPollId: number;
  nextElectionId: number;
  nextDomainResolutionId: number;
  nextCampaignId: number;
  nextDebateId: number;
  nextBillId: number;
  nextAmendmentId: number;
  nextLegislativeVoteId: number;
  nextLawId: number;
  nextRegulationId: number;
  nextMotionId: number;
  nextEmergencyId: number;
  nextWarPowerId: number;
  nextBudgetId: number;
  nextCaseId: number;
  nextCourtNominationId: number;
  nextCourtDecisionId: number;
  nextImpeachmentId: number;
  nextRecallId: number;
  nextConstitutionalGroundsId: number;
  nextLaggedEffectId: number;
  nextEconomicShockId: number;
  nextOrgActionId: number;
  nextMediaStoryId: number;
  nextTreatyId: number;
  nextSanctionId: number;
  nextCrisisId: number;
  nextConflictId: number;
  nextForeignLeaderId: number;
  nextDiplomaticActionId: number;
  nextTreatyRatificationId: number;
  nextIncomingDiplomacyId: number;
};

export type PresidentialRuntime = {
  nextRegularElectionDate: IsoDate;
  electedTermCountByPolitician: Record<string, number>;
  certifiedPresidentElectId: string | null;
};

export type SimState = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  contentVersion: string;
  scenarioId: string;
  scenarioStartDate: IsoDate;
  currentDate: IsoDate;
  completedTurns: number;
  activeTurnTarget: IsoDate | null;
  rng: SerializedRngState;
  playerPoliticianId: string;
  politicians: Record<string, PoliticianRuntime>;
  officeTerms: Record<string, OfficeTerm>;
  scheduler: { events: ScheduledEvent[] };
  pendingInterrupt: PendingInterrupt | null;
  history: SimEvent[];
  counters: Counters;
  presidential: PresidentialRuntime;
  relationships: Record<string, Record<string, RelationshipEdge>>;
  memories: Record<string, PoliticalMemory>;
  beliefs: Record<string, Record<string, Record<string, BeliefRecord>>>;
  goals: Record<string, PoliticianGoal>;
  generatedAgentProfiles: Record<string, AgentProfile>;
  agentProfileOverrides: Record<string, AgentProfileOverride>;
  partyStates: Record<string, PartyState>;
  factionStates: Record<string, FactionState>;
  endorsements: Record<string, EndorsementRecord>;
  partyContests: Record<string, PartyContest>;
  dynamicParties: Record<string, DynamicPartyDefinition>;
  elections: Record<string, ElectionState>;
  candidateStanding: Record<string, CandidateStanding>;
  electoralEnvironment: ElectoralEnvironment;
  polls: Record<string, PollRecord>;
  domainResolutions: Record<string, DomainResolutionRecord>;
  campaignRuntime: CampaignRuntime;
  legislatureRuntime: LegislatureRuntime;
  executiveRuntime: ExecutiveRuntime;
  constitutionalRuntime: ConstitutionalRuntime;
  economyRuntime: EconomyRuntime;
  provincialRuntime: ProvincialRuntime;
  organizationRuntime: OrganizationRuntime;
  mediaRuntime: MediaRuntime;
  foreignAffairsRuntime: ForeignAffairsRuntime;
};

export type Command =
  | { type: "ADVANCE_TURN" }
  | { type: "RESUME_TURN" }
  | { type: "ACKNOWLEDGE_INTERRUPT" }
  | {
      type: "INJECT_PRESIDENTIAL_VACANCY";
      reason: string;
      presidentElectId?: string;
    }
  | { type: "DEV_DRAW_RNG"; stream: StreamName }
  | {
      type: "DEV_SCHEDULE_EVENT";
      dueDate: IsoDate;
      eventType: string;
      payload?: JsonObject;
      priority?: number;
      blocking?: boolean;
      requiresResolution?: boolean;
    }
  | { type: "DEV_SET_ALIVE"; politicianId: string; alive: boolean }
  | { type: "DEV_SET_RETIRED"; politicianId: string; retired: boolean }
  | { type: "DEV_VACATE_OFFICE"; officeId: string; reason: string }
  | { type: "DEV_CERTIFY_PRESIDENT_ELECT"; politicianId: string }
  | {
      type: "DEV_ASSUME_OFFICE";
      officeId: string;
      holderId: string;
      holdingKind?: "substantive" | "acting";
      accessionReason?: string;
    }
  | { type: "DEV_RESUME_TERM"; termId: string }
  | {
      type: "DEV_RECORD_INTERACTION";
      sourceId: string;
      targetId: string;
      delta: { affinity?: number; trust?: number; respect?: number };
      memory?: {
        kind: MemoryKind;
        valence: number;
        salience: number;
        durability: MemoryDurability;
        tags?: string[];
        subjectIds?: string[];
        metadata?: JsonObject;
        relationshipEffects?: { affinity?: number; trust?: number; respect?: number };
        sourceEventId?: string | null;
      };
    }
  | {
      type: "DEV_RECORD_OBSERVATION";
      observerId: string;
      targetId: string;
      topic: "ideology" | "trait" | "skill";
      dimension: string;
      observed: number;
      observationConfidence: number;
      sourceReliability: number;
      source?: string | null;
    }
  | { type: "DEV_REVIEW_AGENT_GOALS"; politicianId?: string }
  | {
      type: "CHANGE_PARTY_MEMBERSHIP";
      politicianId: string;
      partyId: string | null;
    }
  | { type: "CHANGE_FACTION"; politicianId: string; factionId: string | null }
  | {
      type: "DECLARE_PARTY_CONTEST_CANDIDACY";
      contestId: string;
      politicianId: string;
    }
  | {
      type: "WITHDRAW_PARTY_CONTEST_CANDIDACY";
      contestId: string;
      politicianId: string;
    }
  | {
      type: "ENDORSE_PARTY_CONTEST_CANDIDATE";
      contestId: string;
      endorserId: string;
      targetId: string;
      endorserType?: "politician" | "faction" | "provincial_organization";
    }
  | { type: "WITHDRAW_ENDORSEMENT"; endorsementId: string }
  | {
      type: "DEV_CREATE_PARTY_CONTEST";
      contestType: "presidential_nomination" | "party_leadership" | "faction_chair";
      partyId: string;
      factionId?: string | null;
      ruleId?: string;
      selectorMethod?: NominationMethod;
      memberWeight?: number;
      affiliateUnionDelegateWeight?: number;
    }
  | { type: "DEV_OPEN_PARTY_CONTEST"; contestId: string }
  | { type: "DEV_RESOLVE_PARTY_CONTEST"; contestId: string }
  | { type: "DEV_CANCEL_PARTY_CONTEST"; contestId: string }
  | {
      type: "DEV_SET_CONTEST_QUALIFICATION";
      contestId: string;
      politicianId: string;
      evidence: {
        memberNominationRequirementSatisfied?: boolean;
        provincialSupportRequirementSatisfied?: boolean;
      };
    }
  | {
      type: "DEV_SPLIT_FACTION";
      factionId: string;
      newPartyName: string;
      newPartyShort: string;
      politicianIds: string[];
    }
  | {
      type: "RESOLVE_PRESIDENTIAL_ELECTION";
      electionId?: string;
    }
  | {
      type: "RESOLVE_ASSEMBLY_ELECTION";
      electionId?: string;
    }
  | {
      type: "FILE_ASSEMBLY_CANDIDACY";
      electionId: string;
      constituencyId: string;
    }
  | {
      type: "DECLINE_ASSEMBLY_CANDIDACY";
      electionId: string;
    }
  | {
      type: "FINALIZE_ELECTION_FIELD";
      electionId: string;
    }
  | {
      type: "DEV_CREATE_POLL";
      pollsterId: string;
      electionId?: string;
      geographyKind: "national" | "constituency";
      constituencyId?: string | null;
      candidateIds: string[];
      sampleSize?: number;
    }
  | {
      type: "DEV_SET_CANDIDATE_STANDING";
      politicianId: string;
      nameRecognition?: number;
      favorability?: number;
      enthusiasm?: number;
      momentum?: number;
    }
  | {
      type: "DEV_SET_ELECTORAL_ENVIRONMENT";
      nationalPartyShift?: Record<string, number>;
      constituencyId?: string;
      constituencyPartyShift?: Record<string, number>;
      issueClimateShift?: Record<string, number>;
    }
  | {
      type: "DEV_ADD_ELECTION_CANDIDATE";
      electionId: string;
      politicianId: string;
      partyId?: string | null;
      publicIdeology?: Record<string, number> | null;
      independentQualified?: boolean;
      sourceContestId?: string | null;
    }
  | { type: "RESOLVE_PRESIDENTIAL_ASSUMPTION" }
  | {
      type: "DECLARE_CAMPAIGN";
      politicianId: string;
      campaignType:
        | "presidential_nomination"
        | "presidential_general"
        | "assembly"
        | "gubernatorial";
      contestId?: string | null;
      electionId?: string | null;
      constituencyId?: string | null;
    }
  | { type: "CAMPAIGN_FUNDRAISE"; campaignId: string }
  | {
      type: "CAMPAIGN_VISIT";
      campaignId: string;
      geographyKind: "national" | "province" | "constituency";
      geographyId?: string | null;
    }
  | {
      type: "CAMPAIGN_ORGANIZE";
      campaignId: string;
      constituencyId?: string;
      geographyKind?: "province" | "constituency";
      geographyId?: string;
    }
  | {
      type: "CAMPAIGN_ADVERTISE";
      campaignId: string;
      spend: number;
      messageType: "positive" | "contrast" | "negative";
      geographyKind?: "national" | "province" | "constituency";
      geographyId?: string | null;
      targetPoliticianId?: string | null;
      issueId?: string | null;
    }
  | { type: "CAMPAIGN_MESSAGE"; campaignId: string; issueId?: string | null }
  | {
      type: "CAMPAIGN_ATTACK";
      campaignId: string;
      targetPoliticianId: string;
      issueId?: string | null;
    }
  | { type: "CAMPAIGN_SEEK_ENDORSEMENT"; campaignId: string; endorserId?: string }
  | { type: "CAMPAIGN_SEEK_NOMINATION_SUPPORT"; campaignId: string }
  | { type: "CAMPAIGN_PREPARE_DEBATE"; campaignId: string }
  | { type: "WITHDRAW_CAMPAIGN"; campaignId: string }
  | {
      type: "FILE_GUBERNATORIAL_CANDIDACY";
      electionId: string;
      provinceId: string;
    }
  | { type: "DECLINE_GUBERNATORIAL_CANDIDACY"; electionId: string }
  | {
      type: "GOVERNOR_SET_PRIORITY";
      provinceId: string;
      priority: ProvincialPriority;
    }
  | {
      type: "GOVERNOR_DIRECT_INVESTMENT";
      provinceId: string;
      focus: ProvincialInvestment;
    }
  | {
      type: "GOVERNOR_TAKE_FEDERAL_POSITION";
      provinceId: string;
      issueId: string;
      direction: -1 | 1;
    }
  | {
      type: "GOVERNOR_RESPOND_TO_PRESSURE";
      provinceId: string;
      pressureId: string;
      response: "mobilize" | "coordinate" | "request_federal_support";
    }
  | { type: "MINISTER_ADVISE_PRIORITY"; issueId: string }
  | { type: "MAYOR_SET_CIVIC_PRIORITY"; priority: "housing" | "transport" | "services" }
  | {
      type: "INTRODUCE_BILL";
      policyItems: PolicyItem[];
      title?: string;
      summary?: string;
      cosponsorIds?: string[];
    }
  | { type: "COSPONSOR_BILL"; billId: string }
  | { type: "PROPOSE_AMENDMENT"; billId: string; policyItems: PolicyItem[] }
  | {
      type: "CAST_LEGISLATIVE_VOTE";
      billId: string;
      stage: LegislativeVoteStage;
      choice: LegislativeVoteChoice;
      amendmentId?: string;
    }
  | { type: "SIGN_BILL"; billId: string }
  | { type: "RETURN_BILL"; billId: string }
  | { type: "SCHEDULE_BILL"; billId: string }
  | { type: "DELAY_BILL"; billId: string }
  | { type: "APPOINT_MINISTER"; officeId: string; politicianId: string }
  | { type: "DISMISS_MINISTER"; officeId: string }
  | {
      type: "ISSUE_REGULATION";
      ministryOfficeId: string;
      policyItems: PolicyItem[];
      major?: boolean;
    }
  | { type: "INTRODUCE_MOTION"; kind: MotionKind; targetId: string }
  | { type: "CAST_MOTION_VOTE"; motionId: string; choice: LegislativeVoteChoice }
  | { type: "PROPOSE_BUDGET"; allocations: Record<string, number> }
  | { type: "DECLARE_EMERGENCY" }
  | { type: "BEGIN_WAR_POWERS" }
  | { type: "NOMINATE_CONSTITUTIONAL_JUDGE"; nomineeId: string; seatOfficeId: string }
  | {
      type: "CAST_CONFIRMATION_VOTE";
      nominationId: string;
      choice: LegislativeVoteChoice;
    }
  | { type: "CAST_JUDICIAL_VOTE"; caseId: string; choice: JudicialVoteChoice }
  | { type: "INTRODUCE_IMPEACHMENT"; basisId: string }
  | { type: "MEET_ORGANIZATION"; organizationId: string }
  | { type: "SEEK_ORGANIZATION_ENDORSEMENT"; organizationId: string; campaignId: string }
  | { type: "ASK_ORGANIZATION_BILL_SUPPORT"; organizationId: string; billId: string }
  | {
      type: "DISCUSS_ORGANIZATION_POLICY";
      organizationId: string;
      issueId: string;
      direction: number;
    }
  | {
      type: "CAST_IMPEACHMENT_VOTE";
      proceedingId: string;
      choice: LegislativeVoteChoice;
    }
  | { type: "INTRODUCE_RECALL_REFERRAL"; targetId?: string }
  | {
      type: "CAST_RECALL_REFERRAL_VOTE";
      proceedingId: string;
      choice: LegislativeVoteChoice;
    }
  | {
      type: "FILE_CONSTITUTIONAL_CASE";
      caseType: CourtCaseType;
      challengedKind?:
        | "law"
        | "regulation"
        | "emergency"
        | "war_power"
        | "appointment"
        | "election"
        | "impeachment"
        | "executive_action";
      challengedId: string;
      respondentId?: string;
      constitutionalQuestion: string;
      constitutionalRule: string;
      meritsLean?: number;
      expedited?: boolean;
    }
  | { type: "DIPLOMATIC_OUTREACH"; targetCountryId: string }
  | { type: "DIPLOMATIC_SUMMIT"; targetCountryId: string }
  | { type: "PROPOSE_TREATY"; targetCountryId: string; kind: string; title?: string }
  | { type: "NEGOTIATE_TRADE"; targetCountryId: string }
  | { type: "IMPOSE_SANCTIONS"; targetCountryId: string; severity?: number }
  | { type: "LIFT_SANCTIONS"; targetCountryId: string }
  | { type: "ALLIANCE_CONSULTATION"; institutionId?: string }
  | { type: "ADJUST_MILITARY_POSTURE"; posture: string }
  | { type: "MEDIATE_CRISIS"; crisisId: string }
  | { type: "ISSUE_DIPLOMATIC_WARNING"; targetCountryId: string }
  | {
      type: "CAST_TREATY_RATIFICATION_VOTE";
      treatyId: string;
      choice: "yes" | "no" | "abstain";
    }
  | {
      type: "RESPOND_INCOMING_DIPLOMACY";
      pendingId: string;
      response: "accept" | "reject";
    }
  | { type: "ACCEPT_INCOMING_TREATY"; pendingId: string }
  | { type: "REJECT_INCOMING_TREATY"; pendingId: string };

export type CommandError = { code: string; message: string };

export type CommandResult =
  | {
      ok: true;
      commandId: string;
      events: SimEvent[];
      interrupt: PendingInterrupt | null;
    }
  | { ok: false; error: CommandError };

/**
 * Save envelope. Authoritative RNG lives only in `simulation.rng`.
 * Root-level `rng` is not part of schema v1.
 */
export type SaveFile = {
  schemaVersion: number;
  contentVersion: string;
  scenarioId: string;
  simulation: SimState;
};

export type SaveParseResult = { ok: true; save: SaveFile } | { ok: false; error: CommandError };

export type KernelOffice = {
  id: string;
  kind: string;
  title: string;
  jurisdictionId: string;
  capacity: number;
  constituencyId: string | null;
  provinceId: string | null;
  cityId: string | null;
  seatIndex: number | null;
  portfolio: string | null;
  incompatibleWithKinds: string[];
  mayCoexistWithKinds: string[];
  requiresHolderKinds: string[];
  suspendWhenActingPresident: boolean;
  noPartyMembershipWhileServing: boolean;
  actingAllowed: boolean;
  expirationPolicy: ExpirationPolicy;
};

export type InitialScheduledSpec = {
  dueDate: IsoDate;
  eventType: string;
  payload: JsonObject;
  priority: number;
  blocking: boolean;
  requiresResolution: boolean;
  source: string | null;
};

export type KernelWorld = {
  contentVersion: string;
  scenarioId: string;
  scenarioStartDate: IsoDate;
  canonicalSeed: string;
  offices: Record<string, KernelOffice>;
  successionOfficeIds: string[];
  specialElectionMoreThanDays: number;
  specialElectionWithinDays: number;
  presidentElectActingWithinDays: number;
  presidentialCalendar: RegularElectionCalendar;
  assemblyCalendar: RegularElectionCalendar;
  nextRegularPresidentialElectionDate: IsoDate;
  nextRegularAssemblyElectionDate: IsoDate;
  politicians: PoliticianRuntime[];
  startingTerms: Array<Omit<OfficeTerm, "id">>;
  initialScheduled: InitialScheduledSpec[];
  electedTermCounts: Record<string, number>;
  agentProfiles: Record<string, AgentProfile>;
  issueIds: string[];
  partyDefinitions: Record<string, PartyDefinition>;
  factionDefinitions: Record<string, FactionDefinition>;
  nominationRules: Record<string, NominationRuleDefinition>;
  independentAggregatePartyId: string;
  startingPartyLeaders: Record<string, string>;
  startingFactionChairs: Record<string, string>;
  provinceIds: string[];
  politicianHomeProvince: Record<string, string>;
  constituencyProvinceShares: Record<string, Array<{ provinceId: string; share: number }>>;
  partyProvinceBaseline: Record<string, Record<string, string>>;
  provincialPartyOrganizations: Record<string, ProvincialPartyOrganization>;
  presidentialEligibility: PresidentialEligibilityRules;
  voterBlocs: Record<string, VoterBlocDefinition>;
  voterBlocIdsByConstituency: Record<string, string[]>;
  constituencyElectorate: Record<string, ConstituencyElectorate>;
  pollsters: Record<string, PollsterDefinition>;
  issueDimensions: Record<string, string>;
  economyScenario?: CanonicalEconomyScenario;
  /**
   * Immutable public party ideology baselines, established at scenario construction.
   * Runtime voter support must not live-average hidden AgentProfile ideology.
   */
  partyPublicIdeology: Record<string, IdeologyVector>;
  factionPublicIdeology: Record<string, IdeologyVector>;
  legislativeConstitution: {
    assemblySeatCount: number;
    assemblyAbsoluteMajority: number;
  };
  executiveConstitution: {
    assemblyCensureFraction: number;
    regulationReviewDays: number;
    emergencyInitialDays: number;
    emergencyExtensionDays: number;
    warUnilateralDays: number;
  };
  courtConstitution: {
    judges: number;
    termYears: number;
    renewable: boolean;
    confirmationFraction: number;
    recallReferralFraction: number;
    recallVoteDays: number;
  };
  interestOrganizations: Record<string, CanonicalInterestOrganization>;
  mediaOutlets: Record<string, CanonicalMediaOutlet>;
  worldCountries: Record<string, CanonicalWorldCountry>;
  worldInstitutions: Record<string, CanonicalWorldInstitution>;
  worldLeaders: Record<string, CanonicalWorldLeader>;
  worldLeadersByCountryId: Record<string, string>;
  terenaWorldCountryId: string;
};

export type CreateSimulationOptions = {
  world: KernelWorld;
  playerPoliticianId: string;
  seed?: string;
};
