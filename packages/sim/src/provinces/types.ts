import type { IsoDate } from "../calendar.js";

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
  kind: "priority" | "investment" | "federal_position" | "pressure_response" | "ministry_advice" | "civic_priority";
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

export type GubernatorialElection = {
  id: string;
  provinceId: string;
  date: IsoDate;
  filingOpenDate: IsoDate;
  filingDeadlineDate: IsoDate;
  assumptionDate: IsoDate;
  status: "planned" | "filing_open" | "field_finalized" | "resolved" | "assumed";
  incumbentId: string | null;
  candidates: Record<string, GubernatorialCandidate>;
  playerDecision: "filed" | "declined" | null;
  winnerId: string | null;
  voteShares: Record<string, number>;
  turnoutRate: number | null;
  resultEventId: string | null;
};

export type ProvincialRuntime = {
  provinces: Record<string, ProvinceGovernanceState>;
  elections: Record<string, GubernatorialElection>;
  actions: Record<string, ProvincialActionRecord>;
  pressures: Record<string, ProvincialPressure>;
  lastMonthProcessed: IsoDate | null;
};

export function emptyProvincialRuntime(): ProvincialRuntime {
  return { provinces: {}, elections: {}, actions: {}, pressures: {}, lastMonthProcessed: null };
}

export function isProvincialPriority(value: string): value is ProvincialPriority {
  return (PROVINCIAL_PRIORITIES as readonly string[]).includes(value);
}

export function isProvincialInvestment(value: string): value is ProvincialInvestment {
  return (PROVINCIAL_INVESTMENTS as readonly string[]).includes(value);
}
