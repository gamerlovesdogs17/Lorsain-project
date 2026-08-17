import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import {
  emptyExecutiveRuntime,
  isMotionKind,
  type AssemblyMotion,
  type BudgetState,
  type EmergencyState,
  type ExecutiveRuntime,
  type MinistryAdminState,
  type RegulationState,
  type WarPowerState,
} from "./types.js";
import { isLegislativeVoteChoice } from "../legislature/types.js";
import type { PolicyItem } from "../legislature/types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function parsePolicyItems(raw: unknown): PolicyItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PolicyItem[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.issueId !== "string") continue;
    if (typeof item.direction !== "number" || typeof item.magnitude !== "number") continue;
    out.push({
      issueId: item.issueId,
      direction: item.direction,
      magnitude: item.magnitude,
      fiscalImpact: typeof item.fiscalImpact === "number" ? item.fiscalImpact : null,
    });
  }
  return out;
}

export function parseExecutiveRuntime(raw: unknown): ExecutiveRuntime | string {
  if (raw == null) return emptyExecutiveRuntime();
  if (!isRecord(raw)) return "executiveRuntime must be an object";
  const runtime = emptyExecutiveRuntime();
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "executiveRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  runtime.emergencyTrigger = raw.emergencyTrigger === true;
  runtime.warTrigger = raw.warTrigger === true;
  if (isRecord(raw.ministries)) {
    for (const [id, rec] of Object.entries(raw.ministries)) {
      if (!isRecord(rec)) continue;
      const ministry: MinistryAdminState = {
        officeId: typeof rec.officeId === "string" ? rec.officeId : id,
        administrativeCapacity:
          typeof rec.administrativeCapacity === "number" ? rec.administrativeCapacity : 0.55,
        currentPriorities: Array.isArray(rec.currentPriorities)
          ? rec.currentPriorities.filter((x): x is string => typeof x === "string")
          : [],
      };
      runtime.ministries[id] = ministry;
    }
  }
  if (isRecord(raw.regulations)) {
    for (const [id, rec] of Object.entries(raw.regulations)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("REG", id) == null) continue;
      const regulation: RegulationState = {
        id,
        issuerId: typeof rec.issuerId === "string" ? rec.issuerId : "",
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        ministryOfficeId: typeof rec.ministryOfficeId === "string" ? rec.ministryOfficeId : "",
        policyItems: parsePolicyItems(rec.policyItems),
        major: rec.major === true,
        reviewDeadline:
          typeof rec.reviewDeadline === "string" && isIsoDate(rec.reviewDeadline)
            ? rec.reviewDeadline
            : "2000-01-01",
        status: rec.status === "annulled" || rec.status === "expired" ? rec.status : "active",
        metadata: isRecord(rec.metadata) ? (rec.metadata as RegulationState["metadata"]) : {},
      };
      runtime.regulations[id] = regulation;
    }
  }
  if (isRecord(raw.budgets)) {
    for (const [id, rec] of Object.entries(raw.budgets)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const allocations: Record<string, number> = {};
      if (isRecord(rec.allocations)) {
        for (const [k, v] of Object.entries(rec.allocations)) {
          if (typeof v === "number") allocations[k] = v;
        }
      }
      const budget: BudgetState = {
        id,
        fiscalYear: isInt(rec.fiscalYear) ? rec.fiscalYear : 2000,
        proposalDate:
          typeof rec.proposalDate === "string" && isIsoDate(rec.proposalDate)
            ? rec.proposalDate
            : null,
        allocations,
        status: rec.status === "proposed" || rec.status === "approved" ? rec.status : "continuing",
        assemblyDecision:
          rec.assemblyDecision === "pending" ||
          rec.assemblyDecision === "approved" ||
          rec.assemblyDecision === "rejected"
            ? rec.assemblyDecision
            : "none",
        continuingSource: typeof rec.continuingSource === "string" ? rec.continuingSource : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as BudgetState["metadata"]) : {},
      };
      runtime.budgets[id] = budget;
    }
  }
  if (isRecord(raw.emergencies)) {
    for (const [id, rec] of Object.entries(raw.emergencies)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const emergency: EmergencyState = {
        id,
        declaredBy: typeof rec.declaredBy === "string" ? rec.declaredBy : "",
        declaredDate:
          typeof rec.declaredDate === "string" && isIsoDate(rec.declaredDate)
            ? rec.declaredDate
            : "2000-01-01",
        expiresDate:
          typeof rec.expiresDate === "string" && isIsoDate(rec.expiresDate)
            ? rec.expiresDate
            : "2000-01-01",
        status: rec.status === "expired" || rec.status === "terminated" ? rec.status : "active",
        extensionCount: isInt(rec.extensionCount) ? rec.extensionCount : 0,
        metadata: isRecord(rec.metadata) ? (rec.metadata as EmergencyState["metadata"]) : {},
      };
      runtime.emergencies[id] = emergency;
    }
  }
  if (isRecord(raw.warPowers)) {
    for (const [id, rec] of Object.entries(raw.warPowers)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const war: WarPowerState = {
        id,
        startedBy: typeof rec.startedBy === "string" ? rec.startedBy : "",
        startDate:
          typeof rec.startDate === "string" && isIsoDate(rec.startDate)
            ? rec.startDate
            : "2000-01-01",
        unilateralUntil:
          typeof rec.unilateralUntil === "string" && isIsoDate(rec.unilateralUntil)
            ? rec.unilateralUntil
            : "2000-01-01",
        status: rec.status === "authorized" || rec.status === "expired" ? rec.status : "unilateral",
        authorized: rec.authorized === true,
        metadata: isRecord(rec.metadata) ? (rec.metadata as WarPowerState["metadata"]) : {},
      };
      runtime.warPowers[id] = war;
    }
  }
  if (isRecord(raw.motions)) {
    for (const [id, rec] of Object.entries(raw.motions)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (typeof rec.kind !== "string" || !isMotionKind(rec.kind)) continue;
      const motion: AssemblyMotion = {
        id,
        kind: rec.kind,
        sponsorId: typeof rec.sponsorId === "string" ? rec.sponsorId : "",
        targetId: typeof rec.targetId === "string" ? rec.targetId : "",
        introducedDate:
          typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
            ? rec.introducedDate
            : "2000-01-01",
        scheduledDate:
          typeof rec.scheduledDate === "string" && isIsoDate(rec.scheduledDate)
            ? rec.scheduledDate
            : null,
        status:
          rec.status === "passed" || rec.status === "failed" || rec.status === "withdrawn"
            ? rec.status
            : rec.status === "introduced"
              ? "introduced"
              : "scheduled",
        voteId: typeof rec.voteId === "string" ? rec.voteId : null,
        threshold:
          rec.threshold === "assembly_fraction" ? "assembly_fraction" : "simple_majority_cast",
        fraction: typeof rec.fraction === "number" ? rec.fraction : null,
        result: rec.result === "passed" || rec.result === "failed" ? rec.result : null,
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
              ? rec.introducedDate
              : "2000-01-01",
        metadata: isRecord(rec.metadata) ? (rec.metadata as AssemblyMotion["metadata"]) : {},
      };
      runtime.motions[id] = motion;
    }
  }
  if (isRecord(raw.pendingPlayerMotionVotes)) {
    for (const [id, rec] of Object.entries(raw.pendingPlayerMotionVotes)) {
      if (!isRecord(rec)) continue;
      if (typeof rec.motionId !== "string") continue;
      if (typeof rec.choice !== "string" || !isLegislativeVoteChoice(rec.choice)) continue;
      runtime.pendingPlayerMotionVotes[id] = { motionId: rec.motionId, choice: rec.choice };
    }
  }
  return runtime;
}

export function executiveCounterError(
  runtime: ExecutiveRuntime,
  counters: {
    nextRegulationId: number;
    nextMotionId: number;
    nextEmergencyId: number;
    nextWarPowerId: number;
    nextBudgetId: number;
  },
): string | null {
  const maxReg = Object.keys(runtime.regulations).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("REG", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextRegulationId <= maxReg) return "counters.nextRegulationId";
  const maxMot = Object.keys(runtime.motions).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("MOT", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextMotionId <= maxMot) return "counters.nextMotionId";
  const maxEmg = Object.keys(runtime.emergencies).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("EMG", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextEmergencyId <= maxEmg) return "counters.nextEmergencyId";
  const maxWar = Object.keys(runtime.warPowers).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("WAR", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextWarPowerId <= maxWar) return "counters.nextWarPowerId";
  const maxBud = Object.keys(runtime.budgets).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("BUD", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextBudgetId <= maxBud) return "counters.nextBudgetId";
  return null;
}
