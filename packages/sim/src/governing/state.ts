import type { SimState } from "../types.js";
import {
  emptyCapacityState,
  emptyFiscalState,
  emptyGoverningRuntime,
  emptyPromiseStatusCounts,
  emptyServiceOutcomes,
  type Phase13Runtime,
  type DepartmentId,
  DEPARTMENT_IDS,
  IMPLEMENTATION_STATUSES,
  IMPLEMENTATION_POSTURES,
  PROMISE_STATUSES,
  AGENDA_ITEM_SOURCES,
  REVENUE_SOURCES,
  SPENDING_CATEGORIES,
} from "./types.js";

export function ensureGoverningRuntime(state: SimState): Phase13Runtime {
  if (!state.governingRuntime) {
    state.governingRuntime = emptyGoverningRuntime();
  }
  return state.governingRuntime;
}

export function parseGoverningRuntime(raw: unknown): Phase13Runtime | string {
  if (raw == null) return emptyGoverningRuntime();
  if (typeof raw !== "object" || Array.isArray(raw)) return "governingRuntime must be an object";
  const obj = raw as Record<string, unknown>;
  const base = emptyGoverningRuntime();

  if (obj.capacity && typeof obj.capacity === "object" && !Array.isArray(obj.capacity)) {
    const c = obj.capacity as Record<string, unknown>;
    const departments = emptyCapacityState().departments;
    if (c.departments && typeof c.departments === "object" && !Array.isArray(c.departments)) {
      for (const id of DEPARTMENT_IDS) {
        const v = (c.departments as Record<string, unknown>)[id];
        if (typeof v === "number" && Number.isFinite(v)) {
          departments[id] = Math.max(0, Math.min(1, v));
        }
      }
    }
    const provinces: Record<string, number> = {};
    if (c.provinces && typeof c.provinces === "object" && !Array.isArray(c.provinces)) {
      for (const [pid, v] of Object.entries(c.provinces as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          provinces[pid] = Math.max(0, Math.min(1, v));
        }
      }
    }
    base.capacity = {
      national:
        typeof c.national === "number" && Number.isFinite(c.national)
          ? Math.max(0, Math.min(1, c.national))
          : 0.55,
      departments,
      provinces,
      strain:
        typeof c.strain === "number" && Number.isFinite(c.strain)
          ? Math.max(0, Math.min(1, c.strain))
          : 0,
    };
  }

  if (obj.fiscal && typeof obj.fiscal === "object" && !Array.isArray(obj.fiscal)) {
    const f = obj.fiscal as Record<string, unknown>;
    const fiscal = emptyFiscalState(typeof f.fiscalYear === "number" ? f.fiscalYear : 2000);
    if (typeof f.revenue === "number") fiscal.revenue = f.revenue;
    if (typeof f.expenditure === "number") fiscal.expenditure = f.expenditure;
    if (typeof f.balance === "number") fiscal.balance = f.balance;
    if (typeof f.debt === "number") fiscal.debt = f.debt;
    if (typeof f.lastUpdated === "string" || f.lastUpdated === null) {
      fiscal.lastUpdated = (f.lastUpdated as string | null) ?? null;
    }
    if (f.revenueBySource && typeof f.revenueBySource === "object") {
      for (const src of REVENUE_SOURCES) {
        const v = (f.revenueBySource as Record<string, unknown>)[src];
        if (typeof v === "number") fiscal.revenueBySource[src] = v;
      }
    }
    if (f.spendingByCategory && typeof f.spendingByCategory === "object") {
      for (const cat of SPENDING_CATEGORIES) {
        const v = (f.spendingByCategory as Record<string, unknown>)[cat];
        if (typeof v === "number") fiscal.spendingByCategory[cat] = v;
      }
    }
    base.fiscal = fiscal;
  }

  if (obj.services && typeof obj.services === "object" && !Array.isArray(obj.services)) {
    const s = obj.services as Record<string, unknown>;
    const services = emptyServiceOutcomes();
    for (const key of Object.keys(services) as (keyof typeof services)[]) {
      if (typeof s[key] === "number") services[key] = Math.max(0, Math.min(1, s[key] as number));
    }
    base.services = services;
  }

  if (
    obj.implementations &&
    typeof obj.implementations === "object" &&
    !Array.isArray(obj.implementations)
  ) {
    for (const [id, rec] of Object.entries(obj.implementations as Record<string, unknown>)) {
      if (!rec || typeof rec !== "object") continue;
      const r = rec as Record<string, unknown>;
      const status =
        typeof r.status === "string" &&
        (IMPLEMENTATION_STATUSES as readonly string[]).includes(r.status)
          ? (r.status as (typeof IMPLEMENTATION_STATUSES)[number])
          : "enacted";
      const posture =
        typeof r.posture === "string" &&
        (IMPLEMENTATION_POSTURES as readonly string[]).includes(r.posture)
          ? (r.posture as (typeof IMPLEMENTATION_POSTURES)[number])
          : "standard";
      const departmentId =
        typeof r.departmentId === "string" &&
        (DEPARTMENT_IDS as readonly string[]).includes(r.departmentId)
          ? (r.departmentId as DepartmentId)
          : "economy";
      base.implementations[id] = {
        lawId: typeof r.lawId === "string" ? r.lawId : id,
        status,
        posture,
        progress: typeof r.progress === "number" ? Math.max(0, Math.min(1, r.progress)) : 0,
        departmentId,
        ministryOfficeId: typeof r.ministryOfficeId === "string" ? r.ministryOfficeId : null,
        enactedDate: typeof r.enactedDate === "string" ? r.enactedDate : "2000-01-01",
        legalEffectiveDate:
          typeof r.legalEffectiveDate === "string" ? r.legalEffectiveDate : "2000-01-01",
        implementationStartDate:
          typeof r.implementationStartDate === "string" ? r.implementationStartDate : null,
        expectedCompletionDate:
          typeof r.expectedCompletionDate === "string" ? r.expectedCompletionDate : null,
        lagKind:
          r.lagKind === "fast" ||
          r.lagKind === "medium" ||
          r.lagKind === "slow" ||
          r.lagKind === "electoral"
            ? r.lagKind
            : "medium",
        monthsRequired: typeof r.monthsRequired === "number" ? r.monthsRequired : 6,
        monthsElapsed: typeof r.monthsElapsed === "number" ? r.monthsElapsed : 0,
        major: r.major === true,
        blockedReason: typeof r.blockedReason === "string" ? r.blockedReason : null,
        metadata:
          r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
            ? (r.metadata as Phase13Runtime["implementations"][string]["metadata"])
            : {},
      };
    }
  }

  if (obj.promises && typeof obj.promises === "object" && !Array.isArray(obj.promises)) {
    for (const [id, rec] of Object.entries(obj.promises as Record<string, unknown>)) {
      if (!rec || typeof rec !== "object") continue;
      const r = rec as Record<string, unknown>;
      const status =
        typeof r.status === "string" && (PROMISE_STATUSES as readonly string[]).includes(r.status)
          ? (r.status as (typeof PROMISE_STATUSES)[number])
          : "pending";
      base.promises[id] = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        issueId: typeof r.issueId === "string" ? r.issueId : "ISS_REFORM",
        direction: typeof r.direction === "number" ? r.direction : 0,
        status,
        source:
          r.source === "platform" || r.source === "coalition" || r.source === "campaign"
            ? r.source
            : "platform",
        relatedLawId: typeof r.relatedLawId === "string" ? r.relatedLawId : null,
        createdDate: typeof r.createdDate === "string" ? r.createdDate : "2000-01-01",
        updatedDate: typeof r.updatedDate === "string" ? r.updatedDate : "2000-01-01",
        notes: typeof r.notes === "string" ? r.notes : "",
      };
    }
  }

  if (obj.agenda && typeof obj.agenda === "object" && !Array.isArray(obj.agenda)) {
    const a = obj.agenda as Record<string, unknown>;
    base.agenda = {
      updatedDate:
        typeof a.updatedDate === "string" || a.updatedDate === null
          ? ((a.updatedDate as string | null) ?? null)
          : null,
      items: Array.isArray(a.items)
        ? a.items
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map((item, idx) => ({
              id: typeof item.id === "string" ? item.id : `AGENDA_${idx}`,
              title: typeof item.title === "string" ? item.title : "Agenda item",
              issueId: typeof item.issueId === "string" ? item.issueId : "ISS_REFORM",
              priority: typeof item.priority === "number" ? item.priority : 0.5,
              source:
                typeof item.source === "string" &&
                (AGENDA_ITEM_SOURCES as readonly string[]).includes(item.source)
                  ? (item.source as (typeof AGENDA_ITEM_SOURCES)[number])
                  : "government_priority",
              departmentId:
                typeof item.departmentId === "string" &&
                (DEPARTMENT_IDS as readonly string[]).includes(item.departmentId)
                  ? (item.departmentId as DepartmentId)
                  : null,
              status:
                item.status === "completed" || item.status === "deferred" ? item.status : "active",
            }))
        : [],
    };
  }

  if (
    obj.interactions &&
    typeof obj.interactions === "object" &&
    !Array.isArray(obj.interactions)
  ) {
    base.interactions = obj.interactions as Phase13Runtime["interactions"];
  }

  if (
    obj.ministerialPerformance &&
    typeof obj.ministerialPerformance === "object" &&
    !Array.isArray(obj.ministerialPerformance)
  ) {
    base.ministerialPerformance =
      obj.ministerialPerformance as Phase13Runtime["ministerialPerformance"];
  }

  if (obj.budgetCycle && typeof obj.budgetCycle === "object" && !Array.isArray(obj.budgetCycle)) {
    const b = obj.budgetCycle as Record<string, unknown>;
    base.budgetCycle = {
      fiscalYear: typeof b.fiscalYear === "number" ? b.fiscalYear : 2000,
      stage:
        b.stage === "forecast" ||
        b.stage === "draft" ||
        b.stage === "assembly" ||
        b.stage === "passed" ||
        b.stage === "failed" ||
        b.stage === "continuing_resolution" ||
        b.stage === "idle"
          ? b.stage
          : "idle",
      budgetId: typeof b.budgetId === "string" ? b.budgetId : null,
      failureConsequence:
        b.failureConsequence === "continuing_resolution" ||
        b.failureConsequence === "political_crisis"
          ? b.failureConsequence
          : null,
      lastProcessedDate:
        typeof b.lastProcessedDate === "string" || b.lastProcessedDate === null
          ? ((b.lastProcessedDate as string | null) ?? null)
          : null,
    };
  }

  // Government record — parse loosely; ignore malformed snapshots.
  if (obj.record === null) {
    base.record = null;
  } else if (obj.record && typeof obj.record === "object" && !Array.isArray(obj.record)) {
    const r = obj.record as Record<string, unknown>;
    const services = emptyServiceOutcomes();
    if (r.serviceOutcomes && typeof r.serviceOutcomes === "object") {
      const s = r.serviceOutcomes as Record<string, unknown>;
      for (const key of Object.keys(services) as (keyof typeof services)[]) {
        if (typeof s[key] === "number") services[key] = Math.max(0, Math.min(1, s[key] as number));
      }
    }
    const promiseStatusCounts = emptyPromiseStatusCounts();
    if (r.promiseStatusCounts && typeof r.promiseStatusCounts === "object") {
      for (const status of PROMISE_STATUSES) {
        const v = (r.promiseStatusCounts as Record<string, unknown>)[status];
        if (typeof v === "number" && Number.isFinite(v))
          promiseStatusCounts[status] = Math.max(0, v);
      }
    }
    base.record = {
      updatedDate:
        typeof r.updatedDate === "string" || r.updatedDate === null
          ? ((r.updatedDate as string | null) ?? null)
          : null,
      governingPartyId: typeof r.governingPartyId === "string" ? r.governingPartyId : null,
      lawsPassed: typeof r.lawsPassed === "number" ? Math.max(0, r.lawsPassed) : 0,
      promiseStatusCounts,
      fiscalBalance: typeof r.fiscalBalance === "number" ? r.fiscalBalance : 0,
      serviceOutcomes: services,
      coalitionStability:
        typeof r.coalitionStability === "number"
          ? Math.max(0, Math.min(1, r.coalitionStability))
          : 0.5,
      courtDefeats: typeof r.courtDefeats === "number" ? Math.max(0, r.courtDefeats) : 0,
      score: typeof r.score === "number" ? Math.max(-1, Math.min(1, r.score)) : 0,
    };
  }

  if (typeof obj.lastGoverningMonth === "string" || obj.lastGoverningMonth === null) {
    base.lastGoverningMonth = (obj.lastGoverningMonth as string | null) ?? null;
  }
  if (Array.isArray(obj.historyNotes)) {
    base.historyNotes = obj.historyNotes
      .filter((n): n is string => typeof n === "string")
      .slice(-40);
  }
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    base.metadata = obj.metadata as Phase13Runtime["metadata"];
  }

  return base;
}
