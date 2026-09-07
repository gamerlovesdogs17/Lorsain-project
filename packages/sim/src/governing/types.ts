import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

/** Legal enactment vs administrative delivery stages. */
export const IMPLEMENTATION_STATUSES = [
  "enacted",
  "preparing",
  "partially_implemented",
  "substantially_implemented",
  "fully_implemented",
  "delayed",
  "blocked",
] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const IMPLEMENTATION_POSTURES = ["accelerated", "standard", "phased"] as const;
export type ImplementationPosture = (typeof IMPLEMENTATION_POSTURES)[number];

/** Canonical Cabinet portfolios used for department ownership. */
export const DEPARTMENT_IDS = [
  "finance",
  "labour",
  "health",
  "education",
  "interior",
  "justice",
  "transport",
  "energy",
  "foreign",
  "defense",
  "economy",
  "agriculture",
] as const;
export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export const REVENUE_SOURCES = [
  "income_tax",
  "corporate_tax",
  "consumption_tax",
  "payroll_contributions",
  "tariffs",
  "other",
] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const SPENDING_CATEGORIES = [
  "healthcare",
  "education",
  "social_protection",
  "infrastructure",
  "defence",
  "administration",
  "other",
] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

export const PROMISE_STATUSES = [
  "pending",
  "introduced",
  "partially_enacted",
  "enacted",
  "implemented",
  "blocked",
  "abandoned",
  "contradicted",
] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

export const AGENDA_ITEM_SOURCES = [
  "platform",
  "coalition",
  "crisis",
  "government_priority",
] as const;
export type AgendaItemSource = (typeof AGENDA_ITEM_SOURCES)[number];

export type FiscalState = {
  fiscalYear: number;
  revenue: number;
  expenditure: number;
  balance: number;
  debt: number;
  revenueBySource: Record<RevenueSource, number>;
  spendingByCategory: Record<SpendingCategory, number>;
  lastUpdated: IsoDate | null;
};

export type CapacityState = {
  /** National administrative capacity, bounded 0–1. */
  national: number;
  /** Per-department capacity, bounded 0–1. */
  departments: Record<DepartmentId, number>;
  /** Per-province implementation capacity, bounded 0–1. */
  provinces: Record<string, number>;
  /** Short-term strain from accelerated implementation (0–1). */
  strain: number;
};

export type ServiceOutcomes = {
  healthcareAccess: number;
  educationQuality: number;
  infrastructureQuality: number;
  publicSafety: number;
  administrativeDelivery: number;
};

export type ImplementationRecord = {
  lawId: string;
  status: ImplementationStatus;
  posture: ImplementationPosture;
  progress: number;
  departmentId: DepartmentId;
  ministryOfficeId: string | null;
  enactedDate: IsoDate;
  legalEffectiveDate: IsoDate;
  implementationStartDate: IsoDate | null;
  expectedCompletionDate: IsoDate | null;
  lagKind: "fast" | "medium" | "slow" | "electoral";
  monthsRequired: number;
  monthsElapsed: number;
  major: boolean;
  blockedReason: string | null;
  metadata: JsonObject;
};

export type PromiseRecord = {
  id: string;
  partyId: string;
  issueId: string;
  direction: number;
  status: PromiseStatus;
  source: "platform" | "coalition" | "campaign";
  relatedLawId: string | null;
  createdDate: IsoDate;
  updatedDate: IsoDate;
  notes: string;
};

export type GovernmentAgendaItem = {
  id: string;
  title: string;
  issueId: string;
  priority: number;
  source: AgendaItemSource;
  departmentId: DepartmentId | null;
  status: "active" | "completed" | "deferred";
};

export type GovernmentAgenda = {
  updatedDate: IsoDate | null;
  items: GovernmentAgendaItem[];
};

export type PolicyInteractionRecord = {
  id: string;
  kind: "synergy" | "strain" | "contradiction";
  label: string;
  provisionIds: string[];
  issueIds: string[];
  severity: number;
  detectedDate: IsoDate;
  resolved: boolean;
};

export type MinisterialPerformance = {
  officeId: string;
  departmentId: DepartmentId;
  score: number;
  capacityFactor: number;
  implementationFactor: number;
  updatedDate: IsoDate;
};

export type BudgetCycleState = {
  fiscalYear: number;
  stage: "forecast" | "draft" | "assembly" | "passed" | "failed" | "continuing_resolution" | "idle";
  budgetId: string | null;
  failureConsequence: "continuing_resolution" | "political_crisis" | null;
  lastProcessedDate: IsoDate | null;
};

/**
 * Factual snapshot of the sitting government's record, refreshed quarterly.
 * Feeds a small, bounded nudge into the electoral environment (national mood).
 */
export type GovernmentRecord = {
  updatedDate: IsoDate | null;
  governingPartyId: string | null;
  lawsPassed: number;
  promiseStatusCounts: Record<PromiseStatus, number>;
  fiscalBalance: number;
  serviceOutcomes: ServiceOutcomes;
  coalitionStability: number;
  courtDefeats: number;
  /** Aggregate quality of the record, bounded −1..1. */
  score: number;
};

/**
 * Phase 13 governing runtime. Empty on migration — never fabricates history.
 */
export type Phase13Runtime = {
  capacity: CapacityState;
  fiscal: FiscalState;
  services: ServiceOutcomes;
  implementations: Record<string, ImplementationRecord>;
  promises: Record<string, PromiseRecord>;
  agenda: GovernmentAgenda;
  interactions: Record<string, PolicyInteractionRecord>;
  ministerialPerformance: Record<string, MinisterialPerformance>;
  budgetCycle: BudgetCycleState;
  /** Factual government-record snapshot (Phase 13 → elections hook). */
  record: GovernmentRecord | null;
  lastGoverningMonth: IsoDate | null;
  historyNotes: string[];
  metadata: JsonObject;
};

export function emptyRevenueBySource(): Record<RevenueSource, number> {
  return {
    income_tax: 0,
    corporate_tax: 0,
    consumption_tax: 0,
    payroll_contributions: 0,
    tariffs: 0,
    other: 0,
  };
}

export function emptySpendingByCategory(): Record<SpendingCategory, number> {
  return {
    healthcare: 0,
    education: 0,
    social_protection: 0,
    infrastructure: 0,
    defence: 0,
    administration: 0,
    other: 0,
  };
}

export function emptyCapacityState(): CapacityState {
  const departments = {} as Record<DepartmentId, number>;
  for (const id of DEPARTMENT_IDS) departments[id] = 0.55;
  return { national: 0.55, departments, provinces: {}, strain: 0 };
}

export function emptyServiceOutcomes(): ServiceOutcomes {
  return {
    healthcareAccess: 0.55,
    educationQuality: 0.55,
    infrastructureQuality: 0.55,
    publicSafety: 0.55,
    administrativeDelivery: 0.55,
  };
}

export function emptyFiscalState(fiscalYear = 2000): FiscalState {
  return {
    fiscalYear,
    revenue: 100,
    expenditure: 100,
    balance: 0,
    debt: 40,
    revenueBySource: emptyRevenueBySource(),
    spendingByCategory: emptySpendingByCategory(),
    lastUpdated: null,
  };
}

export function emptyPromiseStatusCounts(): Record<PromiseStatus, number> {
  const counts = {} as Record<PromiseStatus, number>;
  for (const status of PROMISE_STATUSES) counts[status] = 0;
  return counts;
}

export function emptyGoverningRuntime(): Phase13Runtime {
  return {
    capacity: emptyCapacityState(),
    fiscal: emptyFiscalState(),
    services: emptyServiceOutcomes(),
    implementations: {},
    promises: {},
    agenda: { updatedDate: null, items: [] },
    interactions: {},
    ministerialPerformance: {},
    budgetCycle: {
      fiscalYear: 2000,
      stage: "idle",
      budgetId: null,
      failureConsequence: null,
      lastProcessedDate: null,
    },
    record: null,
    lastGoverningMonth: null,
    historyNotes: [],
    metadata: {},
  };
}
