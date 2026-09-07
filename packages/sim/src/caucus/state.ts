import type { SimState } from "../types.js";
import {
  CAUCUS_GROWTH_STRATEGIES,
  CAUCUS_RELATION_KINDS,
  CAUCUS_STANCES_TOWARD_CHAIR,
  emptyCaucusAncestry,
  emptyCaucusFactionRuntime,
  emptyCaucusRuntime,
  type CaucusFactionRuntime,
  type CaucusGrowthStrategy,
  type CaucusRuntime,
  type CaucusStanceTowardChair,
} from "./types.js";

export function ensureCaucusRuntime(state: SimState): CaucusRuntime {
  if (!state.caucusRuntime) {
    state.caucusRuntime = emptyCaucusRuntime();
  }
  seedCaucusesFromFactions(state);
  return state.caucusRuntime;
}

/** Ensure every active factionState has a caucus row (lazy, non-destructive). */
export function seedCaucusesFromFactions(state: SimState): void {
  const runtime = state.caucusRuntime ?? emptyCaucusRuntime();
  if (!state.caucusRuntime) state.caucusRuntime = runtime;

  for (const [factionId, fac] of Object.entries(state.factionStates)) {
    if (fac.status === "split_origin") continue;
    const existing = runtime.caucuses[factionId];
    if (existing) continue;
    const row = emptyCaucusFactionRuntime(factionId, fac.partyId);
    row.leaderId = fac.chairId;
    row.ancestry.founded = state.currentDate;
    runtime.caucuses[factionId] = row;
  }
}

function isStance(v: unknown): v is CaucusStanceTowardChair {
  return typeof v === "string" && (CAUCUS_STANCES_TOWARD_CHAIR as readonly string[]).includes(v);
}

function isGrowthStrategy(v: unknown): v is CaucusGrowthStrategy {
  return typeof v === "string" && (CAUCUS_GROWTH_STRATEGIES as readonly string[]).includes(v);
}

function parseCaucusFaction(factionId: string, raw: unknown): CaucusFactionRuntime | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const partyId = typeof r.partyId === "string" ? r.partyId : "";
  if (!partyId) return null;
  const base = emptyCaucusFactionRuntime(factionId, partyId);

  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;

  base.membershipShare = num(r.membershipShare, 0);
  base.partyMemberSupport = num(r.partyMemberSupport, 0);
  base.assemblyShare = num(r.assemblyShare, 0);
  base.institutionalInfluence = num(r.institutionalInfluence, 0);
  base.leaderId = typeof r.leaderId === "string" ? r.leaderId : null;
  base.deputyId = typeof r.deputyId === "string" ? r.deputyId : null;
  base.priorities = Array.isArray(r.priorities)
    ? r.priorities.filter((x): x is string => typeof x === "string").slice(0, 10)
    : [];
  base.stanceTowardChair = isStance(r.stanceTowardChair) ? r.stanceTowardChair : "cooperative";
  base.endorsedChairCandidateId =
    typeof r.endorsedChairCandidateId === "string" ? r.endorsedChairCandidateId : null;
  base.endorsedPrimaryCandidateId =
    typeof r.endorsedPrimaryCandidateId === "string" ? r.endorsedPrimaryCandidateId : null;
  base.endorsementMomentum = num(r.endorsementMomentum, 0.35);
  base.growthStrategy = isGrowthStrategy(r.growthStrategy) ? r.growthStrategy : "recruit_members";
  if (Array.isArray(r.history)) {
    base.history = r.history
      .filter(
        (h): h is { date: string; kind: string; detail: string } =>
          !!h &&
          typeof h === "object" &&
          !Array.isArray(h) &&
          typeof (h as { date?: unknown }).date === "string" &&
          typeof (h as { kind?: unknown }).kind === "string" &&
          typeof (h as { detail?: unknown }).detail === "string",
      )
      .slice(-80)
      .map((h) => ({ date: h.date, kind: h.kind, detail: h.detail }));
  }

  if (r.alliances && typeof r.alliances === "object" && !Array.isArray(r.alliances)) {
    for (const [otherId, edge] of Object.entries(r.alliances as Record<string, unknown>)) {
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) continue;
      const e = edge as Record<string, unknown>;
      const kind =
        typeof e.kind === "string" && (CAUCUS_RELATION_KINDS as readonly string[]).includes(e.kind)
          ? (e.kind as "alliance" | "rivalry")
          : null;
      if (!kind || typeof e.since !== "string") continue;
      base.alliances[otherId] = {
        kind,
        since: e.since,
        ...(typeof e.goal === "string" ? { goal: e.goal } : {}),
      };
    }
  }

  if (r.ancestry && typeof r.ancestry === "object" && !Array.isArray(r.ancestry)) {
    const a = r.ancestry as Record<string, unknown>;
    base.ancestry = {
      founded: typeof a.founded === "string" ? a.founded : null,
      splitFrom: typeof a.splitFrom === "string" ? a.splitFrom : null,
      mergedWith: typeof a.mergedWith === "string" ? a.mergedWith : null,
      successor: typeof a.successor === "string" ? a.successor : null,
      dissolved: typeof a.dissolved === "string" ? a.dissolved : null,
    };
  } else {
    base.ancestry = emptyCaucusAncestry();
  }

  return base;
}

export function parseCaucusRuntime(raw: unknown): CaucusRuntime | string {
  if (raw == null) return emptyCaucusRuntime();
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "caucusRuntime must be an object";
  }
  const obj = raw as Record<string, unknown>;
  const base = emptyCaucusRuntime();

  if (obj.caucuses && typeof obj.caucuses === "object" && !Array.isArray(obj.caucuses)) {
    for (const [factionId, rec] of Object.entries(obj.caucuses as Record<string, unknown>)) {
      const parsed = parseCaucusFaction(factionId, rec);
      if (parsed) base.caucuses[factionId] = parsed;
    }
  }

  if (
    obj.unalignedByParty &&
    typeof obj.unalignedByParty === "object" &&
    !Array.isArray(obj.unalignedByParty)
  ) {
    for (const [partyId, rec] of Object.entries(obj.unalignedByParty as Record<string, unknown>)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const clamp = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      base.unalignedByParty[partyId] = {
        membershipShare: clamp(r.membershipShare),
        partyMemberSupport: clamp(r.partyMemberSupport),
        assemblyShare: clamp(r.assemblyShare),
        institutionalInfluence: clamp(r.institutionalInfluence),
      };
    }
  }

  if (typeof obj.lastCaucusMonth === "string" || obj.lastCaucusMonth === null) {
    base.lastCaucusMonth = (obj.lastCaucusMonth as string | null) ?? null;
  }
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    base.metadata = obj.metadata as CaucusRuntime["metadata"];
  }

  return base;
}
