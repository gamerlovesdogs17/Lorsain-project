import type { SimState } from "../types.js";
import {
  emptyHistory15Runtime,
  type History15Runtime,
  type GenerationalCohort,
  type PrecedentLinkRelation,
} from "./types.js";

export function ensureHistory15Runtime(state: SimState): History15Runtime {
  if (!state.history15Runtime) {
    state.history15Runtime = emptyHistory15Runtime();
  }
  const runtime = state.history15Runtime;
  // Forward-compat: older saves / partial objects
  if (!runtime.constitutionalEras) runtime.constitutionalEras = [];
  if (!runtime.precedentLinks) runtime.precedentLinks = [];
  if (!runtime.politicianLegacies) runtime.politicianLegacies = {};
  if (!runtime.caucusChronicles) runtime.caucusChronicles = [];
  if (!runtime.organizationChronicles) runtime.organizationChronicles = [];
  if (!runtime.provinceChronicles) runtime.provinceChronicles = [];
  return runtime;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseCohort(politicianId: string, raw: unknown): GenerationalCohort | null {
  if (!isRecord(raw)) return null;
  const entryYear =
    typeof raw.entryYear === "number" && Number.isFinite(raw.entryYear)
      ? Math.floor(raw.entryYear)
      : null;
  if (entryYear == null) return null;
  const source =
    raw.source === "first_office" || raw.source === "birth_plus_25" || raw.source === "unknown"
      ? raw.source
      : "unknown";
  return { politicianId, entryYear, source };
}

const PRECEDENT_RELATIONS = new Set([
  "relies_on",
  "follows",
  "distinguishes",
  "limits",
  "overturns",
]);

export function parseHistory15Runtime(raw: unknown): History15Runtime | string {
  if (raw == null) return emptyHistory15Runtime();
  if (!isRecord(raw)) return "history15Runtime must be an object";
  const base = emptyHistory15Runtime();

  if (Array.isArray(raw.eras)) {
    for (const row of raw.eras) {
      if (!isRecord(row) || typeof row.partyId !== "string" || typeof row.label !== "string")
        continue;
      if (typeof row.startDate !== "string") continue;
      base.eras.push({
        partyId: row.partyId,
        label: row.label,
        startDate: row.startDate,
        endDate: typeof row.endDate === "string" ? row.endDate : null,
        chairId: typeof row.chairId === "string" ? row.chairId : null,
        trigger: typeof row.trigger === "string" ? row.trigger : "unknown",
      });
    }
  }

  if (Array.isArray(raw.governments)) {
    for (const row of raw.governments) {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.start !== "string") continue;
      base.governments.push({
        id: row.id,
        start: row.start,
        end: typeof row.end === "string" ? row.end : null,
        governingPartyIds: Array.isArray(row.governingPartyIds)
          ? row.governingPartyIds.filter((x): x is string => typeof x === "string")
          : [],
        leaderId: typeof row.leaderId === "string" ? row.leaderId : null,
        majorLawIds: Array.isArray(row.majorLawIds)
          ? row.majorLawIds.filter((x): x is string => typeof x === "string")
          : [],
        endReason: typeof row.endReason === "string" ? row.endReason : null,
      });
    }
  }

  if (Array.isArray(raw.tenures)) {
    for (const row of raw.tenures) {
      if (
        !isRecord(row) ||
        typeof row.partyId !== "string" ||
        typeof row.chairId !== "string" ||
        typeof row.start !== "string"
      ) {
        continue;
      }
      base.tenures.push({
        partyId: row.partyId,
        chairId: row.chairId,
        start: row.start,
        end: typeof row.end === "string" ? row.end : null,
        method: typeof row.method === "string" ? row.method : "unknown",
      });
    }
  }

  if (Array.isArray(raw.yearbooks)) {
    for (const row of raw.yearbooks) {
      if (!isRecord(row) || typeof row.year !== "number") continue;
      base.yearbooks.push({
        year: Math.floor(row.year),
        headlines: Array.isArray(row.headlines)
          ? row.headlines.filter((x): x is string => typeof x === "string").slice(0, 40)
          : [],
        eventIds: Array.isArray(row.eventIds)
          ? row.eventIds.filter((x): x is string => typeof x === "string").slice(0, 80)
          : [],
      });
    }
  }

  if (Array.isArray(raw.realignments)) {
    for (const row of raw.realignments) {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.detectedDate !== "string") {
        continue;
      }
      base.realignments.push({
        id: row.id,
        detectedDate: row.detectedDate,
        indicators: Array.isArray(row.indicators)
          ? row.indicators.filter((x): x is string => typeof x === "string")
          : [],
        strength:
          typeof row.strength === "number" && Number.isFinite(row.strength)
            ? Math.max(0, Math.min(1, row.strength))
            : 0,
      });
    }
  }

  if (isRecord(raw.cohorts)) {
    for (const [id, rec] of Object.entries(raw.cohorts)) {
      const parsed = parseCohort(id, rec);
      if (parsed) base.cohorts[id] = parsed;
    }
  }

  if (Array.isArray(raw.constitutionalEras)) {
    for (const row of raw.constitutionalEras) {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string") continue;
      if (typeof row.startDate !== "string") continue;
      base.constitutionalEras.push({
        id: row.id,
        label: row.label,
        startDate: row.startDate,
        endDate: typeof row.endDate === "string" ? row.endDate : null,
        keyAmendments: Array.isArray(row.keyAmendments)
          ? row.keyAmendments.filter((x): x is string => typeof x === "string")
          : [],
        electoralSystem: typeof row.electoralSystem === "string" ? row.electoralSystem : "unknown",
        executiveStructure:
          typeof row.executiveStructure === "string" ? row.executiveStructure : "unknown",
        legislatureStructure:
          typeof row.legislatureStructure === "string" ? row.legislatureStructure : "unknown",
      });
    }
  }

  if (Array.isArray(raw.precedentLinks)) {
    for (const row of raw.precedentLinks) {
      if (
        !isRecord(row) ||
        typeof row.fromDecisionId !== "string" ||
        typeof row.toDecisionId !== "string" ||
        typeof row.relation !== "string" ||
        !PRECEDENT_RELATIONS.has(row.relation)
      ) {
        continue;
      }
      base.precedentLinks.push({
        fromDecisionId: row.fromDecisionId,
        toDecisionId: row.toDecisionId,
        relation: row.relation as PrecedentLinkRelation,
      });
    }
  }

  if (isRecord(raw.politicianLegacies)) {
    for (const [id, rec] of Object.entries(raw.politicianLegacies)) {
      if (!isRecord(rec) || typeof rec.politicianId !== "string") continue;
      if (typeof rec.closedDate !== "string") continue;
      const strArr = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      base.politicianLegacies[id] = {
        politicianId: rec.politicianId,
        closedDate: rec.closedDate,
        offices: strArr(rec.offices),
        partyLeadership: strArr(rec.partyLeadership),
        majorLaws: strArr(rec.majorLaws),
        elections: strArr(rec.elections),
        notes: strArr(rec.notes),
      };
    }
  }

  if (Array.isArray(raw.caucusChronicles)) {
    for (const row of raw.caucusChronicles) {
      if (
        !isRecord(row) ||
        typeof row.caucusId !== "string" ||
        typeof row.partyId !== "string" ||
        typeof row.date !== "string" ||
        typeof row.kind !== "string" ||
        typeof row.detail !== "string"
      ) {
        continue;
      }
      base.caucusChronicles.push({
        caucusId: row.caucusId,
        partyId: row.partyId,
        date: row.date,
        kind: row.kind,
        detail: row.detail,
      });
    }
  }

  if (Array.isArray(raw.organizationChronicles)) {
    for (const row of raw.organizationChronicles) {
      if (
        !isRecord(row) ||
        typeof row.orgId !== "string" ||
        typeof row.date !== "string" ||
        typeof row.kind !== "string" ||
        typeof row.detail !== "string"
      ) {
        continue;
      }
      base.organizationChronicles.push({
        orgId: row.orgId,
        date: row.date,
        kind: row.kind,
        detail: row.detail,
      });
    }
  }

  if (Array.isArray(raw.provinceChronicles)) {
    for (const row of raw.provinceChronicles) {
      if (
        !isRecord(row) ||
        typeof row.provinceId !== "string" ||
        typeof row.date !== "string" ||
        typeof row.kind !== "string" ||
        typeof row.detail !== "string"
      ) {
        continue;
      }
      base.provinceChronicles.push({
        provinceId: row.provinceId,
        date: row.date,
        kind: row.kind,
        detail: row.detail,
      });
    }
  }

  if (typeof raw.lastHistoryMonth === "string" || raw.lastHistoryMonth === null) {
    base.lastHistoryMonth = (raw.lastHistoryMonth as string | null) ?? null;
  }
  if (typeof raw.nextGovernmentId === "number" && Number.isFinite(raw.nextGovernmentId)) {
    base.nextGovernmentId = Math.max(1, Math.floor(raw.nextGovernmentId));
  }
  if (typeof raw.nextRealignmentId === "number" && Number.isFinite(raw.nextRealignmentId)) {
    base.nextRealignmentId = Math.max(1, Math.floor(raw.nextRealignmentId));
  }

  if (Array.isArray(raw.shiftSnapshots)) {
    for (const row of raw.shiftSnapshots) {
      if (!isRecord(row) || typeof row.year !== "number") continue;
      const national: Record<string, number> = {};
      const constituencyAvg: Record<string, number> = {};
      if (isRecord(row.national)) {
        for (const [k, v] of Object.entries(row.national)) {
          if (typeof v === "number" && Number.isFinite(v)) national[k] = v;
        }
      }
      if (isRecord(row.constituencyAvg)) {
        for (const [k, v] of Object.entries(row.constituencyAvg)) {
          if (typeof v === "number" && Number.isFinite(v)) constituencyAvg[k] = v;
        }
      }
      base.shiftSnapshots.push({
        year: Math.floor(row.year),
        national,
        constituencyAvg,
      });
    }
  }

  if (isRecord(raw.metadata)) {
    base.metadata = raw.metadata as History15Runtime["metadata"];
  }

  return base;
}
