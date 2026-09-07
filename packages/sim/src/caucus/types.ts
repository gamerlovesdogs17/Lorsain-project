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

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type CaucusAllianceEdge = {
  kind: CaucusRelationKind;
  since: IsoDate;
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

/**
 * Per-faction caucus politics. Faction id = caucus id.
 * Shares are 0–1 and, within a party, should sum roughly to ~1 across
 * active caucuses + the party's unaligned residual.
 */
export type CaucusFactionRuntime = {
  factionId: string;
  partyId: string;
  membershipShare: number;
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
};

export type CaucusUnalignedShares = {
  membershipShare: number;
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
