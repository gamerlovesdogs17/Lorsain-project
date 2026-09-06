import { addMonths } from "../calendar.js";
import type { EnactedLawRecord, PolicyItem } from "../legislature/types.js";
import { pushHistory } from "../scheduler.js";
import type { SimEvent, SimState } from "../types.js";
import { applyImplementationStrain, effectiveCapacity } from "./capacity.js";
import { departmentForLawItems, ministryOfficeForDepartment } from "./departments.js";
import { ensureGoverningRuntime } from "./state.js";
import type { ImplementationPosture, ImplementationRecord, ImplementationStatus } from "./types.js";

export type LagKind = ImplementationRecord["lagKind"];

function issueIds(items: PolicyItem[]): string[] {
  return items.map((i) => i.issueId);
}

export function lagKindForPolicyItems(items: PolicyItem[]): LagKind {
  const issues = issueIds(items);
  const provisions = items.map((i) => i.provisionId ?? "");
  if (
    provisions.some((p) => p.includes("ELECTORAL") || p.includes("ELECTION")) ||
    issues.includes("ISS_REFORM")
  ) {
    return "electoral";
  }
  if (
    provisions.some(
      (p) => p.includes("TAX") || p.includes("TARIFF") || p.includes("WAGE") || p.includes("LEVY"),
    ) ||
    issues.includes("ISS_TRADE")
  ) {
    return "fast";
  }
  if (
    provisions.some(
      (p) =>
        p.includes("RAIL") ||
        p.includes("INFRA") ||
        p.includes("GRID") ||
        p.includes("NUCLEAR") ||
        p.includes("HOUSING"),
    ) ||
    issues.includes("ISS_HOUSING") ||
    issues.includes("ISS_CLIMATE") ||
    issues.includes("ISS_OWNERSHIP")
  ) {
    return "slow";
  }
  if (
    issues.includes("ISS_WELFARE") ||
    issues.includes("ISS_LABOR") ||
    issues.includes("ISS_HEALTH")
  ) {
    return "medium";
  }
  return "medium";
}

export function monthsRequiredForLag(lag: LagKind, major: boolean): number {
  const base = lag === "fast" ? 2 : lag === "medium" ? 6 : lag === "slow" ? 14 : 12;
  return major ? base + 4 : base;
}

export function isMajorLaw(items: PolicyItem[]): boolean {
  if (items.length >= 3) return true;
  const fiscal = items.reduce((s, i) => s + Math.abs(i.fiscalImpact ?? i.magnitude * 0.1), 0);
  if (fiscal >= 0.35) return true;
  const lag = lagKindForPolicyItems(items);
  return lag === "slow" || lag === "electoral";
}

export function defaultPostureForLaw(items: PolicyItem[], major: boolean): ImplementationPosture {
  if (!major) return "standard";
  const lag = lagKindForPolicyItems(items);
  if (lag === "slow") return "phased";
  if (lag === "fast") return "accelerated";
  return "standard";
}

function statusFromProgress(
  progress: number,
  delayed: boolean,
  blocked: boolean,
): ImplementationStatus {
  if (blocked) return "blocked";
  if (delayed) return "delayed";
  if (progress >= 0.999) return "fully_implemented";
  if (progress >= 0.75) return "substantially_implemented";
  if (progress >= 0.35) return "partially_implemented";
  if (progress > 0.02) return "preparing";
  return "enacted";
}

export function createImplementationRecord(
  law: EnactedLawRecord,
  posture?: ImplementationPosture,
): ImplementationRecord {
  const lagKind = lagKindForPolicyItems(law.policyItems);
  const major = isMajorLaw(law.policyItems);
  const chosen = posture ?? defaultPostureForLaw(law.policyItems, major);
  const monthsRequired = monthsRequiredForLag(lagKind, major);
  const departmentId = departmentForLawItems(law.policyItems);
  const legalEffectiveDate =
    lagKind === "electoral" ? addMonths(law.enactedDate, 6) : law.enactedDate;
  return {
    lawId: law.id,
    status: "enacted",
    posture: chosen,
    progress: 0,
    departmentId,
    ministryOfficeId: ministryOfficeForDepartment(departmentId),
    enactedDate: law.enactedDate,
    legalEffectiveDate,
    implementationStartDate: null,
    expectedCompletionDate: addMonths(law.enactedDate, monthsRequired),
    lagKind,
    monthsRequired,
    monthsElapsed: 0,
    major,
    blockedReason: null,
    metadata: {},
  };
}

/** Register newly enacted operative laws that lack an implementation record. */
export function syncImplementationsFromLaws(state: SimState): ImplementationRecord[] {
  const runtime = ensureGoverningRuntime(state);
  const created: ImplementationRecord[] = [];
  for (const law of Object.values(state.legislatureRuntime.enactedLaws)) {
    if (!law.operative) continue;
    if (runtime.implementations[law.id]) continue;
    const rec = createImplementationRecord(law);
    runtime.implementations[law.id] = rec;
    created.push(rec);
    applyImplementationStrain(state, rec.posture, rec.major);
  }
  for (const [lawId, rec] of Object.entries(runtime.implementations)) {
    const law = state.legislatureRuntime.enactedLaws[lawId];
    if (!law || !law.operative) {
      if (rec.status !== "blocked" && rec.status !== "fully_implemented") {
        rec.status = "blocked";
        rec.blockedReason = "law_not_operative";
      }
    }
  }
  return created;
}

function monthlyProgressDelta(rec: ImplementationRecord, capacity: number): number {
  const base = 1 / Math.max(1, rec.monthsRequired);
  let pace = base;
  if (rec.posture === "accelerated") pace *= 1.45;
  else if (rec.posture === "phased") pace *= 0.7;
  // Capacity below 0.5 slows strongly; above 0.5 slightly accelerates.
  const capFactor = 0.35 + capacity * 0.9;
  pace *= Math.max(0.15, capFactor);
  return pace;
}

export function advanceImplementations(state: SimState, commandId: string): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const events: SimEvent[] = [];
  syncImplementationsFromLaws(state);

  for (const rec of Object.values(runtime.implementations)) {
    if (rec.status === "fully_implemented" || rec.status === "blocked") continue;
    const law = state.legislatureRuntime.enactedLaws[rec.lawId];
    if (!law?.operative) {
      rec.status = "blocked";
      rec.blockedReason = "law_not_operative";
      continue;
    }

    if (state.currentDate < rec.legalEffectiveDate) {
      rec.status = "enacted";
      continue;
    }

    if (!rec.implementationStartDate) {
      rec.implementationStartDate = state.currentDate;
    }

    const capacity = effectiveCapacity(
      state,
      rec.departmentId,
      typeof rec.metadata.provinceId === "string" ? rec.metadata.provinceId : null,
    );
    const prev = rec.progress;
    const delta = monthlyProgressDelta(rec, capacity);
    rec.monthsElapsed += 1;
    rec.progress = Math.min(1, rec.progress + delta);

    const delayed = capacity < 0.35 && rec.progress < 0.9;
    rec.status = statusFromProgress(rec.progress, delayed, false);

    if (prev < 1 && rec.progress >= 1) {
      rec.status = "fully_implemented";
      rec.progress = 1;
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "LAW_FULLY_IMPLEMENTED",
          importance: 0.55,
          visibility: "public",
          actorIds: [],
          entityIds: [rec.lawId],
          payload: {
            lawId: rec.lawId,
            departmentId: rec.departmentId,
            posture: rec.posture,
            monthsElapsed: rec.monthsElapsed,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else if (prev < 0.35 && rec.progress >= 0.35) {
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "LAW_IMPLEMENTATION_PROGRESS",
          importance: 0.35,
          visibility: "public",
          actorIds: [],
          entityIds: [rec.lawId],
          payload: {
            lawId: rec.lawId,
            status: rec.status,
            progress: Math.round(rec.progress * 100) / 100,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

export function setImplementationPosture(
  state: SimState,
  lawId: string,
  posture: ImplementationPosture,
): ImplementationRecord | null {
  const runtime = ensureGoverningRuntime(state);
  const rec = runtime.implementations[lawId];
  if (!rec) return null;
  if (rec.status === "fully_implemented" || rec.status === "blocked") return rec;
  rec.posture = posture;
  applyImplementationStrain(state, posture, rec.major);
  return rec;
}
