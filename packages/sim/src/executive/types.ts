import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import type { PolicyItem } from "../legislature/types.js";

export const MOTION_KINDS = [
  "ministerial_censure",
  "regulation_annulment",
  "budget_approval",
  "emergency_extension",
  "emergency_termination",
  "war_authorization",
] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

export const MOTION_STATUSES = [
  "introduced",
  "scheduled",
  "passed",
  "failed",
  "withdrawn",
] as const;
export type MotionStatus = (typeof MOTION_STATUSES)[number];

export const REGULATION_STATUSES = ["active", "annulled", "expired"] as const;
export type RegulationStatus = (typeof REGULATION_STATUSES)[number];

export const BUDGET_STATUSES = ["proposed", "approved", "continuing"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const EMERGENCY_STATUSES = ["active", "expired", "terminated"] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

export const WAR_POWER_STATUSES = ["unilateral", "authorized", "expired"] as const;
export type WarPowerStatus = (typeof WAR_POWER_STATUSES)[number];

export type MinistryAdminState = {
  officeId: string;
  administrativeCapacity: number;
  currentPriorities: string[];
};

export type RegulationState = {
  id: string;
  issuerId: string;
  date: IsoDate;
  ministryOfficeId: string;
  policyItems: PolicyItem[];
  major: boolean;
  reviewDeadline: IsoDate;
  status: RegulationStatus;
  metadata: JsonObject;
};

export type BudgetState = {
  id: string;
  fiscalYear: number;
  proposalDate: IsoDate | null;
  allocations: Record<string, number>;
  status: BudgetStatus;
  assemblyDecision: "pending" | "approved" | "rejected" | "none";
  continuingSource: string | null;
  metadata: JsonObject;
};

export type EmergencyState = {
  id: string;
  declaredBy: string;
  declaredDate: IsoDate;
  expiresDate: IsoDate;
  status: EmergencyStatus;
  extensionCount: number;
  metadata: JsonObject;
};

export type WarPowerState = {
  id: string;
  startedBy: string;
  startDate: IsoDate;
  unilateralUntil: IsoDate;
  status: WarPowerStatus;
  authorized: boolean;
  metadata: JsonObject;
};

export type AssemblyMotion = {
  id: string;
  kind: MotionKind;
  sponsorId: string;
  targetId: string;
  introducedDate: IsoDate;
  scheduledDate: IsoDate | null;
  status: MotionStatus;
  voteId: string | null;
  threshold: "assembly_fraction" | "simple_majority_cast";
  fraction: number | null;
  result: "passed" | "failed" | null;
  stageReadyDate: IsoDate;
  metadata: JsonObject;
};

export type PendingMotionVote = {
  motionId: string;
  choice: LegislativeVoteChoice;
};

export type ExecutiveRuntime = {
  ministries: Record<string, MinistryAdminState>;
  regulations: Record<string, RegulationState>;
  budgets: Record<string, BudgetState>;
  emergencies: Record<string, EmergencyState>;
  warPowers: Record<string, WarPowerState>;
  motions: Record<string, AssemblyMotion>;
  pendingPlayerMotionVotes: Record<string, PendingMotionVote>;
  lastMonthProcessed: IsoDate | null;
  emergencyTrigger: boolean;
  warTrigger: boolean;
};

export function emptyExecutiveRuntime(): ExecutiveRuntime {
  return {
    ministries: {},
    regulations: {},
    budgets: {},
    emergencies: {},
    warPowers: {},
    motions: {},
    pendingPlayerMotionVotes: {},
    lastMonthProcessed: null,
    emergencyTrigger: false,
    warTrigger: false,
  };
}

export function isMotionKind(v: string): v is MotionKind {
  return (MOTION_KINDS as readonly string[]).includes(v);
}

export type ExecutiveConstitution = {
  assemblyCensureFraction: number;
  regulationReviewDays: number;
  emergencyInitialDays: number;
  emergencyExtensionDays: number;
  warUnilateralDays: number;
};

export const DEFAULT_EXECUTIVE_CONSTITUTION: ExecutiveConstitution = {
  assemblyCensureFraction: 0.55,
  regulationReviewDays: 60,
  emergencyInitialDays: 14,
  emergencyExtensionDays: 30,
  warUnilateralDays: 30,
};
