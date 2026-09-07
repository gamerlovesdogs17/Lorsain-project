import type { SimState } from "../types.js";
import {
  emptyPartyOrgRuntime,
  LEADERSHIP_ELECTION_METHODS,
  NATIONAL_OFFICE_ROLES,
  PARTY_DISCIPLINE_KINDS,
  type PartyOrgRuntime,
} from "./types.js";

// ---------------------------------------------------------------------------
// Ensure / lazy-init
// ---------------------------------------------------------------------------

export function ensurePartyOrgRuntime(state: SimState): PartyOrgRuntime {
  if (!state.partyOrgRuntime) {
    state.partyOrgRuntime = emptyPartyOrgRuntime();
  }
  return state.partyOrgRuntime;
}

// ---------------------------------------------------------------------------
// Defensive parse (called by save.ts on restore)
// ---------------------------------------------------------------------------

export function parsePartyOrgRuntime(raw: unknown): PartyOrgRuntime | string {
  if (raw == null) return emptyPartyOrgRuntime();
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "partyOrgRuntime must be an object";
  }
  const obj = raw as Record<string, unknown>;
  const base = emptyPartyOrgRuntime();

  if (obj.officers && typeof obj.officers === "object" && !Array.isArray(obj.officers)) {
    // Shallow-validate: only copy roles we know
    const raw_officers = obj.officers as Record<string, unknown>;
    for (const [partyId, roleMap] of Object.entries(raw_officers)) {
      if (!roleMap || typeof roleMap !== "object" || Array.isArray(roleMap)) continue;
      const src = roleMap as Record<string, unknown>;
      const dst: PartyOrgRuntime["officers"][string] = {};
      for (const role of NATIONAL_OFFICE_ROLES) {
        const off = src[role];
        if (!off || typeof off !== "object" || Array.isArray(off)) continue;
        const o = off as Record<string, unknown>;
        if (typeof o.politicianId !== "string" || typeof o.assumedDate !== "string") continue;
        dst[role] = {
          role,
          politicianId: o.politicianId,
          partyId: typeof o.partyId === "string" ? o.partyId : partyId,
          assumedDate: o.assumedDate as string,
        };
      }
      base.officers[partyId] = dst;
    }
  }

  if (obj.priorities && typeof obj.priorities === "object" && !Array.isArray(obj.priorities)) {
    const raw_prio = obj.priorities as Record<string, unknown>;
    for (const [partyId, arr] of Object.entries(raw_prio)) {
      if (Array.isArray(arr)) {
        base.priorities[partyId] = arr.filter((x): x is string => typeof x === "string");
      }
    }
  }

  if (obj.positions && typeof obj.positions === "object" && !Array.isArray(obj.positions)) {
    const raw_pos = obj.positions as Record<string, unknown>;
    for (const [partyId, issueMap] of Object.entries(raw_pos)) {
      if (!issueMap || typeof issueMap !== "object" || Array.isArray(issueMap)) continue;
      const dst: Record<string, "support" | "oppose" | "neutral"> = {};
      for (const [issueId, stance] of Object.entries(issueMap as Record<string, unknown>)) {
        if (stance === "support" || stance === "oppose" || stance === "neutral") {
          dst[issueId] = stance;
        }
      }
      base.positions[partyId] = dst;
    }
  }

  if (
    obj.campaignStrategies &&
    typeof obj.campaignStrategies === "object" &&
    !Array.isArray(obj.campaignStrategies)
  ) {
    const raw_cs = obj.campaignStrategies as Record<string, unknown>;
    for (const [partyId, strat] of Object.entries(raw_cs)) {
      if (typeof strat === "string") base.campaignStrategies[partyId] = strat;
    }
  }

  if (
    obj.coalitionTalks &&
    typeof obj.coalitionTalks === "object" &&
    !Array.isArray(obj.coalitionTalks)
  ) {
    base.coalitionTalks = obj.coalitionTalks as PartyOrgRuntime["coalitionTalks"];
  }

  if (
    obj.disciplineActions &&
    typeof obj.disciplineActions === "object" &&
    !Array.isArray(obj.disciplineActions)
  ) {
    const raw_da = obj.disciplineActions as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_da)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const kind =
        typeof r.kind === "string" && (PARTY_DISCIPLINE_KINDS as readonly string[]).includes(r.kind)
          ? (r.kind as PartyOrgRuntime["disciplineActions"][string]["kind"])
          : "warning";
      const status =
        r.status === "pending" || r.status === "applied" || r.status === "dismissed"
          ? r.status
          : "pending";
      base.disciplineActions[id] = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        targetId: typeof r.targetId === "string" ? r.targetId : "",
        kind,
        recommendedByActorId:
          typeof r.recommendedByActorId === "string" ? r.recommendedByActorId : "",
        date: typeof r.date === "string" ? r.date : "2000-01-01",
        status,
      };
    }
  }

  if (
    obj.chairElections &&
    typeof obj.chairElections === "object" &&
    !Array.isArray(obj.chairElections)
  ) {
    const raw_ce = obj.chairElections as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_ce)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const method =
        typeof r.method === "string" &&
        (LEADERSHIP_ELECTION_METHODS as readonly string[]).includes(r.method)
          ? (r.method as PartyOrgRuntime["chairElections"][string]["method"])
          : "committee";
      const status =
        r.status === "open" || r.status === "resolved" || r.status === "cancelled"
          ? r.status
          : "open";
      base.chairElections[id] = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        openedDate: typeof r.openedDate === "string" ? r.openedDate : "2000-01-01",
        status,
        candidates: Array.isArray(r.candidates)
          ? r.candidates.filter((x): x is string => typeof x === "string")
          : [],
        winnerId: typeof r.winnerId === "string" ? r.winnerId : null,
        resolvedDate: typeof r.resolvedDate === "string" ? r.resolvedDate : null,
        method,
      };
    }
  }

  if (
    obj.partyEndorsements &&
    typeof obj.partyEndorsements === "object" &&
    !Array.isArray(obj.partyEndorsements)
  ) {
    base.partyEndorsements = obj.partyEndorsements as PartyOrgRuntime["partyEndorsements"];
  }

  if (
    obj.supportAllocations &&
    typeof obj.supportAllocations === "object" &&
    !Array.isArray(obj.supportAllocations)
  ) {
    base.supportAllocations = obj.supportAllocations as PartyOrgRuntime["supportAllocations"];
  }

  if (
    obj.provincialOrganizations &&
    typeof obj.provincialOrganizations === "object" &&
    !Array.isArray(obj.provincialOrganizations)
  ) {
    const raw_po = obj.provincialOrganizations as Record<string, unknown>;
    const dst: NonNullable<PartyOrgRuntime["provincialOrganizations"]> = {};
    for (const [orgId, rec] of Object.entries(raw_po)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      if (typeof r.partyId !== "string" || typeof r.provinceId !== "string") continue;
      dst[orgId] = {
        partyId: r.partyId,
        provinceId: r.provinceId,
        chairId: typeof r.chairId === "string" ? r.chairId : null,
        assemblyLeaderId: typeof r.assemblyLeaderId === "string" ? r.assemblyLeaderId : null,
      };
    }
    base.provincialOrganizations = dst;
  }

  if (typeof obj.nextElectionId === "number" && obj.nextElectionId > 0) {
    base.nextElectionId = obj.nextElectionId;
  }
  if (typeof obj.nextDisciplineId === "number" && obj.nextDisciplineId > 0) {
    base.nextDisciplineId = obj.nextDisciplineId;
  }
  if (typeof obj.lastOrgMonth === "string" || obj.lastOrgMonth === null) {
    base.lastOrgMonth = (obj.lastOrgMonth as string | null) ?? null;
  }
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    base.metadata = obj.metadata as PartyOrgRuntime["metadata"];
  }

  return base;
}
