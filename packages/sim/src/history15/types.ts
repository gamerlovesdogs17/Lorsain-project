import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

/** Named era for a party's national chair / leadership identity. */
export type PartyEra = {
  partyId: string;
  label: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  chairId: string | null;
  trigger: string;
};

/** Sitting government / coalition term derived from president party + coalition. */
export type GovernmentTermRecord = {
  id: string;
  start: IsoDate;
  end: IsoDate | null;
  governingPartyIds: string[];
  leaderId: string | null;
  majorLawIds: string[];
  endReason: string | null;
};

/** Continuous tenure of a national party chair. */
export type LeadershipTenure = {
  partyId: string;
  chairId: string;
  start: IsoDate;
  end: IsoDate | null;
  method: string;
};

/** High-importance yearbook slice (no fabricated narrative). */
export type YearRetrospective = {
  year: number;
  headlines: string[];
  eventIds: string[];
};

/** Soft multi-year geographic / electoral habit shift signal (kept rare). */
export type RealignmentSignal = {
  id: string;
  detectedDate: IsoDate;
  indicators: string[];
  strength: number;
};

/** Light generational tag for politicians (entry into public life). */
export type GenerationalCohort = {
  politicianId: string;
  entryYear: number;
  source: "first_office" | "birth_plus_25" | "unknown";
};

export type ConstitutionalEra = {
  id: string;
  label: string;
  startDate: IsoDate;
  endDate: IsoDate | null;
  keyAmendments: string[];
  electoralSystem: string;
  executiveStructure: string;
  legislatureStructure: string;
};

export type PrecedentLinkRelation =
  "relies_on" | "follows" | "distinguishes" | "limits" | "overturns";

export type PrecedentLink = {
  fromDecisionId: string;
  toDecisionId: string;
  relation: PrecedentLinkRelation;
};

export type PoliticianLegacy = {
  politicianId: string;
  closedDate: IsoDate;
  offices: string[];
  partyLeadership: string[];
  majorLaws: string[];
  elections: string[];
  notes: string[];
};

export type ChronicleEntryBase = {
  date: IsoDate;
  kind: string;
  detail: string;
};

export type CaucusChronicleEntry = ChronicleEntryBase & {
  caucusId: string;
  partyId: string;
};

export type OrganizationChronicleEntry = ChronicleEntryBase & {
  orgId: string;
};

export type ProvinceChronicleEntry = ChronicleEntryBase & {
  provinceId: string;
};

/**
 * Phase 15 long-term history runtime.
 * Empty on migration — never fabricates eras, governments, or yearbooks.
 */
export type History15Runtime = {
  eras: PartyEra[];
  governments: GovernmentTermRecord[];
  tenures: LeadershipTenure[];
  yearbooks: YearRetrospective[];
  realignments: RealignmentSignal[];
  cohorts: Record<string, GenerationalCohort>;
  constitutionalEras: ConstitutionalEra[];
  precedentLinks: PrecedentLink[];
  politicianLegacies: Record<string, PoliticianLegacy>;
  caucusChronicles: CaucusChronicleEntry[];
  organizationChronicles: OrganizationChronicleEntry[];
  provinceChronicles: ProvinceChronicleEntry[];
  lastHistoryMonth: IsoDate | null;
  nextGovernmentId: number;
  nextRealignmentId: number;
  /** Yearly electoral-shift snapshots for soft realignment detection (no fabrication). */
  shiftSnapshots: Array<{
    year: number;
    national: Record<string, number>;
    constituencyAvg: Record<string, number>;
  }>;
  metadata: JsonObject;
};

export function emptyHistory15Runtime(): History15Runtime {
  return {
    eras: [],
    governments: [],
    tenures: [],
    yearbooks: [],
    realignments: [],
    cohorts: {},
    constitutionalEras: [],
    precedentLinks: [],
    politicianLegacies: {},
    caucusChronicles: [],
    organizationChronicles: [],
    provinceChronicles: [],
    lastHistoryMonth: null,
    nextGovernmentId: 1,
    nextRealignmentId: 1,
    shiftSnapshots: [],
    metadata: {},
  };
}
