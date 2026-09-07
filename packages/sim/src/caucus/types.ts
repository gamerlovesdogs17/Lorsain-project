import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

// ---------------------------------------------------------------------------
// Enumerated constants
// ---------------------------------------------------------------------------

export const CAUCUS_STANCES_TOWARD_CHAIR = [
  "loyal",
  "cooperative",
  "conditional",
  "critical",
  "oppositional",
] as const;
export type CaucusStanceTowardChair = (typeof CAUCUS_STANCES_TOWARD_CHAIR)[number];

export const CAUCUS_RELATION_KINDS = ["alliance", "rivalry"] as const;
export type CaucusRelationKind = (typeof CAUCUS_RELATION_KINDS)[number];

export const CAUCUS_GROWTH_STRATEGIES = [
  "recruit_members",
  "recruit_mps",
  "win_committee",
  "win_leadership",
  "influence_platform",
  "back_primaries",
  "provincial_base",
] as const;
export type CaucusGrowthStrategy = (typeof CAUCUS_GROWTH_STRATEGIES)[number];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type CaucusAllianceEdge = {
  kind: CaucusRelationKind;
  since: IsoDate;
  /** Optional alliance goal label (e.g. "block_chair", "platform_plank"). */
  goal?: string;
};

/**
 * Lightweight ancestry for merge/split bookkeeping.
 * Factions remain the identity key; ancestry records how caucuses evolved.
 */
export type CaucusAncestry = {
  founded: IsoDate | null;
  splitFrom: string | null;
  mergedWith: string | null;
  successor: string | null;
  dissolved: IsoDate | null;
};

export type CaucusHistoryEntry = {
  date: IsoDate;
  kind: string;
  detail: string;
};

/**
 * Per-faction caucus politics. Faction id = caucus id.
 * Shares are 0–1 and, within a party, should sum roughly to ~1 across
 * active caucuses + the party's unaligned residual.
 */
export type CaucusFactionRuntime = {
  factionId: string;
  partyId: string;
  /**
   * Elite / politician affiliation share within the party (headcount of
   * faction-tagged politicians ÷ party politicians). Not mass-party membership.
   */
  membershipShare: number;
  /**
   * Aggregate Party membership support 0–1 (mass/base support), NOT politician headcount.
   * Active caucuses + unaligned residual should sum to ~1 within a party.
   */
  partyMemberSupport: number;
  assemblyShare: number;
  institutionalInfluence: number;
  leaderId: string | null;
  deputyId: string | null;
  priorities: string[];
  stanceTowardChair: CaucusStanceTowardChair;
  endorsedChairCandidateId: string | null;
  endorsedPrimaryCandidateId: string | null;
  alliances: Record<string, CaucusAllianceEdge>;
  ancestry: CaucusAncestry;
  /** Soft momentum from chair/primary endorsement outcomes (0–1). */
  endorsementMomentum: number;
  growthStrategy: CaucusGrowthStrategy;
  history: CaucusHistoryEntry[];
};

export type CaucusUnalignedShares = {
  membershipShare: number;
  partyMemberSupport: number;
  assemblyShare: number;
  institutionalInfluence: number;
};

/**
 * Caucuses 2.0 runtime — internal party organization layer on top of factions.
 */
export type CaucusRuntime = {
  caucuses: Record<string, CaucusFactionRuntime>;
  /** Residual shares for party members not in any active caucus. */
  unalignedByParty: Record<string, CaucusUnalignedShares>;
  lastCaucusMonth: IsoDate | null;
  metadata: JsonObject;
};

export function emptyCaucusAncestry(): CaucusAncestry {
  return {
    founded: null,
    splitFrom: null,
    mergedWith: null,
    successor: null,
    dissolved: null,
  };
}

export function emptyCaucusFactionRuntime(
  factionId: string,
  partyId: string,
): CaucusFactionRuntime {
  return {
    factionId,
    partyId,
    membershipShare: 0,
    partyMemberSupport: 0,
    assemblyShare: 0,
    institutionalInfluence: 0,
    leaderId: null,
    deputyId: null,
    priorities: [],
    stanceTowardChair: "cooperative",
    endorsedChairCandidateId: null,
    endorsedPrimaryCandidateId: null,
    alliances: {},
    ancestry: emptyCaucusAncestry(),
    endorsementMomentum: 0.35,
    growthStrategy: "recruit_members",
    history: [],
  };
}

export function emptyCaucusRuntime(): CaucusRuntime {
  return {
    caucuses: {},
    unalignedByParty: {},
    lastCaucusMonth: null,
    metadata: {},
  };
}
