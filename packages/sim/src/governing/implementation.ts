import { addMonths } from "../calendar.js";
import type { EnactedLawRecord, PolicyItem } from "../legislature/types.js";
import { pushHistory } from "../scheduler.js";
import type { SimEvent, SimState, KernelWorld } from "../types.js";
import { currentMinisterHolderId } from "../executive/state.js";
import { currentPresidentialAuthorityId } from "../legislature/state.js";
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
  const provinceScoped = law.policyItems.some(
    (i) =>
      i.issueId === "ISS_HOUSING" ||
      i.issueId === "ISS_EDUCATION" ||
      (i.provisionId?.includes("PROVINCIAL") ?? false) ||
      (i.provisionId?.includes("LOCAL") ?? false),
  );
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
    metadata: provinceScoped
      ? { provinceDelivery: true, deliveryMode: "provincial_execution" }
      : { deliveryMode: "national_uniform" },
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

    const provinceId =
      typeof rec.metadata.provinceId === "string"
        ? rec.metadata.provinceId
        : rec.metadata.provinceDelivery === true
          ? (Object.keys(ensureGoverningRuntime(state).capacity.provinces ?? {}).sort()[0] ?? null)
          : null;
    const capacity = effectiveCapacity(state, rec.departmentId, provinceId);
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

export const IMPLEMENTATION_RESPONSE_ACTIONS = [
  "increase_resources",
  "revise_timetable",
  "issue_guidance",
  "negotiate_provinces",
  "request_amending_legislation",
  "reduce_scope",
  "replace_responsible_minister",
  "pause_rollout",
] as const;
export type ImplementationResponseAction = (typeof IMPLEMENTATION_RESPONSE_ACTIONS)[number];

export function isImplementationResponseAction(v: unknown): v is ImplementationResponseAction {
  return (
    typeof v === "string" && (IMPLEMENTATION_RESPONSE_ACTIONS as readonly string[]).includes(v)
  );
}

function reject(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

/**
 * Authoritative player/NPC response to an implementation problem.
 * Same underlying path for human and NPC executives.
 */
export function respondToImplementation(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    lawId: string;
    action: ImplementationResponseAction;
    /** Optional replacement minister when action is replace_responsible_minister. */
    replacementPoliticianId?: string;
  },
  commandId: string | null,
):
  | { events: SimEvent[]; record: ImplementationRecord }
  | { error: { code: string; message: string } } {
  const runtime = ensureGoverningRuntime(state);
  const rec = runtime.implementations[args.lawId];
  if (!rec) return { error: reject("UNKNOWN_IMPLEMENTATION", args.lawId) };
  if (rec.status === "fully_implemented") {
    return { error: reject("IMPLEMENTATION_COMPLETE", args.lawId) };
  }

  const presidentId = currentPresidentialAuthorityId(world, state);
  const isPresident = presidentId === args.actorId;
  const officeId = rec.ministryOfficeId ?? ministryOfficeForDepartment(rec.departmentId);
  const ministerId = officeId ? currentMinisterHolderId(world, state, officeId) : null;
  const isResponsibleMinister = ministerId === args.actorId;
  if (!isPresident && !isResponsibleMinister) {
    return {
      error: reject(
        "NOT_IMPLEMENTATION_AUTHORITY",
        "only the head of government or responsible minister may respond",
      ),
    };
  }

  const before = {
    status: rec.status,
    posture: rec.posture,
    progress: rec.progress,
    monthsRequired: rec.monthsRequired,
    blockedReason: rec.blockedReason,
  };

  let resultSummary = "";
  switch (args.action) {
    case "increase_resources": {
      const dept = runtime.capacity.departments[rec.departmentId] ?? runtime.capacity.national;
      runtime.capacity.departments[rec.departmentId] = Math.min(0.95, dept + 0.08);
      runtime.capacity.national = Math.min(0.95, runtime.capacity.national + 0.03);
      runtime.capacity.strain = Math.max(0, runtime.capacity.strain - 0.05);
      if (rec.posture === "phased") rec.posture = "standard";
      else if (rec.posture === "standard") rec.posture = "accelerated";
      applyImplementationStrain(state, rec.posture, rec.major);
      if (rec.status === "delayed" || rec.status === "blocked") {
        rec.status = rec.progress > 0.02 ? "partially_implemented" : "preparing";
        rec.blockedReason = null;
      }
      resultSummary = "additional administrative resources assigned";
      break;
    }
    case "revise_timetable": {
      rec.monthsRequired = Math.max(1, rec.monthsRequired + 4);
      rec.posture = "phased";
      rec.expectedCompletionDate = addMonths(
        rec.implementationStartDate ?? rec.enactedDate,
        rec.monthsRequired,
      );
      if (rec.status === "delayed") rec.status = "preparing";
      applyImplementationStrain(state, rec.posture, rec.major);
      resultSummary = "timetable extended and delivery phased";
      break;
    }
    case "issue_guidance": {
      rec.progress = Math.min(0.99, rec.progress + 0.06);
      if (rec.status === "delayed") rec.status = "partially_implemented";
      rec.blockedReason = null;
      resultSummary = "administrative guidance issued";
      break;
    }
    case "negotiate_provinces": {
      if (
        rec.metadata.provinceDelivery === true ||
        rec.metadata.deliveryMode === "provincial_execution"
      ) {
        for (const pid of Object.keys(runtime.capacity.provinces)) {
          runtime.capacity.provinces[pid] = Math.min(
            0.95,
            (runtime.capacity.provinces[pid] ?? 0.5) + 0.05,
          );
        }
        rec.progress = Math.min(0.99, rec.progress + 0.05);
        if (rec.status === "blocked" || rec.status === "delayed") {
          rec.status = "partially_implemented";
          rec.blockedReason = null;
        }
        resultSummary = "provincial delivery terms renegotiated";
      } else {
        runtime.capacity.national = Math.min(0.95, runtime.capacity.national + 0.02);
        resultSummary = "consultations opened; limited national effect";
      }
      break;
    }
    case "request_amending_legislation": {
      rec.blockedReason = "awaiting_amending_legislation";
      rec.status = "delayed";
      rec.metadata.amendmentRequested = true;
      rec.metadata.amendmentRequestedDate = state.currentDate;
      resultSummary = "amending legislation requested";
      break;
    }
    case "reduce_scope": {
      rec.monthsRequired = Math.max(1, Math.round(rec.monthsRequired * 0.75));
      rec.major = false;
      rec.posture = "standard";
      rec.progress = Math.min(0.99, rec.progress + 0.08);
      if (rec.status === "blocked" || rec.status === "delayed") {
        rec.status = "partially_implemented";
        rec.blockedReason = null;
      }
      rec.metadata.scopeReduced = true;
      applyImplementationStrain(state, rec.posture, rec.major);
      resultSummary = "implementation scope reduced";
      break;
    }
    case "replace_responsible_minister": {
      if (!isPresident) {
        return {
          error: reject("NOT_PRESIDENT", "only the head of government may replace a minister"),
        };
      }
      if (!officeId || !ministerId) {
        return { error: reject("NO_MINISTER", "no responsible minister to replace") };
      }
      // Political marker only here — actual office change uses APPOINT/DISMISS/RESHUFFLE.
      rec.metadata.ministerReplacementRequested = true;
      rec.metadata.previousMinisterId = ministerId;
      if (args.replacementPoliticianId) {
        rec.metadata.requestedReplacementId = args.replacementPoliticianId;
      }
      resultSummary = "ministerial replacement requested for this portfolio";
      break;
    }
    case "pause_rollout": {
      rec.posture = "phased";
      rec.status = "delayed";
      rec.blockedReason = "rollout_paused";
      rec.metadata.pausedDate = state.currentDate;
      applyImplementationStrain(state, rec.posture, rec.major);
      resultSummary = "rollout paused";
      break;
    }
    default:
      return { error: reject("UNKNOWN_ACTION", String(args.action)) };
  }

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "IMPLEMENTATION_RESPONSE",
      importance: 0.7,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [args.lawId, officeId ?? rec.departmentId],
      payload: {
        lawId: args.lawId,
        action: args.action,
        actorId: args.actorId,
        officeId: officeId ?? null,
        departmentId: rec.departmentId,
        result: resultSummary,
        before,
        after: {
          status: rec.status,
          posture: rec.posture,
          progress: Math.round(rec.progress * 100) / 100,
          monthsRequired: rec.monthsRequired,
          blockedReason: rec.blockedReason,
        },
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
  return { events, record: rec };
}
