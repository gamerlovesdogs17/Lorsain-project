import { getAgentProfile } from "../agents/profile.js";
import { monthStart } from "../campaigns/effects.js";
import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { activeCoalition } from "../politics/coalitions.js";
import { ensurePartyOrgRuntime } from "../partyOrg/state.js";
import { padId } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { syncConstitutionalEras, ensureFoundingConstitutionalEra } from "./constitutionalEras.js";
import { syncPoliticianLegacies } from "./legacy.js";
import { syncPrecedentLinks } from "./precedents.js";
import { ensureHistory15Runtime } from "./state.js";
import type { History15Runtime } from "./types.js";

/** High-importance types always eligible for yearbooks even if importance is lower. */
const YEARBOOK_TYPES = new Set([
  "PRESIDENTIAL_ELECTION_RESULT",
  "ASSEMBLY_ELECTION_RESULT",
  "PRESIDENT_INAUGURATED",
  "PRESIDENT_SWORN_IN",
  "PARTY_CHAIR_ELECTED",
  "PARTY_LEADERSHIP_CHANGED",
  "PARTY_LEADER_SET",
  "COALITION_FORMED",
  "COALITION_BROKEN",
  "PARTY_LIFECYCLE_SPLIT",
  "PARTY_LIFECYCLE_MERGE",
  "PARTY_LIFECYCLE_FORMATION",
  "LAW_ENACTED",
  "COURT_DECISION",
  "AMENDMENT_VOTE_PASSED",
  "WAR_DECLARED",
  "EMERGENCY_DECLARED",
]);

const QUARTER_MONTHS = new Set([1, 4, 7, 10]);

function currentChairId(state: SimState, partyId: string): string | null {
  const org = state.partyOrgRuntime?.officers[partyId]?.chair?.politicianId;
  if (org) return org;
  return state.partyStates[partyId]?.leaderId ?? null;
}

function tenureMethod(state: SimState, partyId: string, chairId: string): string {
  const recent = state.history.slice(-60);
  for (let i = recent.length - 1; i >= 0; i--) {
    const ev = recent[i]!;
    if (
      (ev.type === "PARTY_CHAIR_ELECTED" ||
        ev.type === "PARTY_LEADERSHIP_CONTEST_RESOLVED" ||
        ev.type === "PARTY_CONTEST_RESOLVED") &&
      (ev.entityIds.includes(partyId) || ev.payload?.partyId === partyId)
    ) {
      const winner =
        (typeof ev.payload?.winnerId === "string" && ev.payload.winnerId) ||
        (typeof ev.payload?.chairId === "string" && ev.payload.chairId) ||
        (typeof ev.payload?.leaderId === "string" && ev.payload.leaderId) ||
        null;
      if (!winner || winner === chairId) {
        return typeof ev.payload?.method === "string" ? ev.payload.method : "election";
      }
    }
  }
  return "assumed";
}

function eraLabel(partyId: string, chairId: string | null, trigger: string): string {
  if (chairId) return `${partyId} · chair ${chairId}`;
  return `${partyId} · vacant (${trigger})`;
}

function durableTrigger(state: SimState, partyId: string): string {
  const recent = state.history.slice(-30);
  for (let i = recent.length - 1; i >= 0; i--) {
    const ev = recent[i]!;
    if (
      (ev.type === "PARTY_CHAIR_ELECTED" ||
        ev.type === "PARTY_LEADERSHIP_CHANGED" ||
        ev.type === "PARTY_LEADER_SET" ||
        ev.type === "PARTY_LIFECYCLE_SPLIT" ||
        ev.type === "PARTY_LIFECYCLE_MERGE" ||
        ev.type === "PARTY_LIFECYCLE_FORMATION") &&
      (ev.entityIds.includes(partyId) || ev.payload?.partyId === partyId)
    ) {
      return ev.type;
    }
  }
  return "chair_change";
}

function syncLeadershipAndEras(state: SimState, runtime: History15Runtime): void {
  ensurePartyOrgRuntime(state);
  const date = state.currentDate;
  const partyIds = new Set([
    ...Object.keys(state.partyStates),
    ...Object.keys(state.partyOrgRuntime?.officers ?? {}),
  ]);

  for (const partyId of partyIds) {
    if (state.partyStates[partyId]?.status === "defunct") continue;
    const chairId = currentChairId(state, partyId);
    const openTenure = runtime.tenures.find((t) => t.partyId === partyId && t.end === null);
    if (openTenure && openTenure.chairId !== chairId) {
      openTenure.end = date;
    }
    if (chairId && (!openTenure || openTenure.chairId !== chairId)) {
      runtime.tenures.push({
        partyId,
        chairId,
        start: date,
        end: null,
        method: tenureMethod(state, partyId, chairId),
      });
    }

    const openEra = runtime.eras.find((e) => e.partyId === partyId && e.endDate === null);
    if (openEra && openEra.chairId !== chairId) {
      openEra.endDate = date;
    }
    if (!openEra || openEra.chairId !== chairId) {
      const trigger = durableTrigger(state, partyId);
      runtime.eras.push({
        partyId,
        label: eraLabel(partyId, chairId, trigger),
        startDate: date,
        endDate: null,
        chairId,
        trigger,
      });
    }
  }
}

function governingSignature(
  world: KernelWorld,
  state: SimState,
): {
  partyIds: string[];
  leaderId: string | null;
} {
  const leaderId = currentPresidentialAuthorityId(world, state);
  const presidentParty = leaderId ? (state.politicians[leaderId]?.partyId ?? null) : null;
  const coalition = activeCoalition(state);
  const partyIds = new Set<string>();
  if (presidentParty) partyIds.add(presidentParty);
  if (coalition?.status === "active") {
    for (const id of coalition.partyIds) partyIds.add(id);
  }
  return {
    partyIds: [...partyIds].sort(),
    leaderId,
  };
}

function samePartySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function majorLawsSince(state: SimState, start: string): string[] {
  return Object.values(state.legislatureRuntime.enactedLaws)
    .filter((law) => law.enactedDate >= start)
    .sort((a, b) => a.enactedDate.localeCompare(b.enactedDate))
    .map((law) => law.id)
    .slice(0, 24);
}

function syncGovernmentTerms(world: KernelWorld, state: SimState, runtime: History15Runtime): void {
  const sig = governingSignature(world, state);
  const open = runtime.governments.find((g) => g.end === null);
  if (!open) {
    if (sig.partyIds.length === 0 && !sig.leaderId) return;
    const id = padId("GOVTERM", runtime.nextGovernmentId++);
    runtime.governments.push({
      id,
      start: state.currentDate,
      end: null,
      governingPartyIds: sig.partyIds,
      leaderId: sig.leaderId,
      majorLawIds: [],
      endReason: null,
    });
    return;
  }

  open.majorLawIds = majorLawsSince(state, open.start);
  const leaderChanged = open.leaderId !== sig.leaderId;
  const partiesChanged = !samePartySet(open.governingPartyIds, sig.partyIds);
  if (!leaderChanged && !partiesChanged) return;

  open.end = state.currentDate;
  open.endReason =
    leaderChanged && partiesChanged
      ? "leadership_and_coalition_change"
      : leaderChanged
        ? "leadership_change"
        : "coalition_change";
  open.majorLawIds = majorLawsSince(state, open.start);

  if (sig.partyIds.length === 0 && !sig.leaderId) return;
  const id = padId("GOVTERM", runtime.nextGovernmentId++);
  runtime.governments.push({
    id,
    start: state.currentDate,
    end: null,
    governingPartyIds: sig.partyIds,
    leaderId: sig.leaderId,
    majorLawIds: [],
    endReason: null,
  });
}

function isYearbookEvent(ev: SimEvent): boolean {
  if (ev.visibility !== "public") return false;
  if (ev.type === "TURN_COMPLETED") return false;
  if (ev.importance >= 0.7) return true;
  return YEARBOOK_TYPES.has(ev.type);
}

function headlineFor(ev: SimEvent): string {
  const party =
    typeof ev.payload?.partyId === "string"
      ? ` (${ev.payload.partyId})`
      : ev.entityIds[0]
        ? ` (${ev.entityIds[0]})`
        : "";
  return `${ev.date}: ${ev.type.replace(/_/g, " ").toLowerCase()}${party}`;
}

function buildYearRetrospective(state: SimState, runtime: History15Runtime, year: number): void {
  if (runtime.yearbooks.some((y) => y.year === year)) return;
  const prefix = `${year}-`;
  const events = state.history
    .filter((ev) => ev.date.startsWith(prefix) && isYearbookEvent(ev))
    .sort((a, b) => b.importance - a.importance || a.date.localeCompare(b.date));
  if (events.length === 0) return;
  runtime.yearbooks.push({
    year,
    headlines: events.slice(0, 12).map(headlineFor),
    eventIds: events.slice(0, 40).map((e) => e.id),
  });
}

function constituencyAvgByParty(state: SimState): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const byParty of Object.values(state.electoralEnvironment.constituencyPartyShift)) {
    for (const [partyId, v] of Object.entries(byParty)) {
      sums[partyId] = (sums[partyId] ?? 0) + v;
      counts[partyId] = (counts[partyId] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const [partyId, sum] of Object.entries(sums)) {
    out[partyId] = sum / Math.max(1, counts[partyId] ?? 1);
  }
  return out;
}

function detectSoftRealignment(state: SimState, runtime: History15Runtime, year: number): void {
  // Keep rare: at most one signal per 5 years, and require a multi-year baseline.
  const last = runtime.realignments.at(-1);
  if (last) {
    const lastYear = Number(last.detectedDate.slice(0, 4));
    if (year - lastYear < 5) return;
  }

  const national = { ...state.electoralEnvironment.nationalPartyShift };
  const constituencyAvg = constituencyAvgByParty(state);
  if (!runtime.shiftSnapshots.some((s) => s.year === year)) {
    runtime.shiftSnapshots.push({ year, national, constituencyAvg });
    // Cap stored snapshots.
    if (runtime.shiftSnapshots.length > 40) {
      runtime.shiftSnapshots = runtime.shiftSnapshots.slice(-40);
    }
  }

  const baseline = runtime.shiftSnapshots.find((s) => s.year <= year - 3);
  if (!baseline) return;

  const indicators: string[] = [];
  let maxDelta = 0;
  const parties = new Set([
    ...Object.keys(baseline.constituencyAvg),
    ...Object.keys(constituencyAvg),
    ...Object.keys(baseline.national),
    ...Object.keys(national),
  ]);
  for (const partyId of parties) {
    const geoDelta = Math.abs(
      (constituencyAvg[partyId] ?? 0) - (baseline.constituencyAvg[partyId] ?? 0),
    );
    const natDelta = Math.abs((national[partyId] ?? 0) - (baseline.national[partyId] ?? 0));
    if (geoDelta >= 0.12) {
      indicators.push(`geographic_shift:${partyId}:${geoDelta.toFixed(3)}`);
      maxDelta = Math.max(maxDelta, geoDelta);
    }
    if (natDelta >= 0.15) {
      indicators.push(`national_shift:${partyId}:${natDelta.toFixed(3)}`);
      maxDelta = Math.max(maxDelta, natDelta);
    }
  }
  if (indicators.length < 2 || maxDelta < 0.12) return;

  const id = padId("REALIGN", runtime.nextRealignmentId++);
  runtime.realignments.push({
    id,
    detectedDate: state.currentDate,
    indicators: indicators.slice(0, 8),
    strength: Math.max(0, Math.min(1, maxDelta)),
  });
}

function tagGenerationalCohorts(
  world: KernelWorld,
  state: SimState,
  runtime: History15Runtime,
): void {
  const firstOfficeYear = new Map<string, number>();
  for (const term of Object.values(state.officeTerms)) {
    if (!term.startDate) continue;
    const y = Number(term.startDate.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    const prev = firstOfficeYear.get(term.holderId);
    if (prev == null || y < prev) firstOfficeYear.set(term.holderId, y);
  }

  for (const [politicianId, pol] of Object.entries(state.politicians)) {
    const existing = runtime.cohorts[politicianId];
    if (existing && existing.source !== "unknown") continue;
    // Upgrade unknown → first_office when an office term appears later.
    if (existing?.source === "unknown" && !firstOfficeYear.has(politicianId)) continue;

    const officeYear = firstOfficeYear.get(politicianId);
    if (officeYear != null) {
      runtime.cohorts[politicianId] = {
        politicianId,
        entryYear: officeYear,
        source: "first_office",
      };
      continue;
    }
    if (existing) continue;
    if (!pol.alive) {
      runtime.cohorts[politicianId] = {
        politicianId,
        entryYear: Number(state.currentDate.slice(0, 4)),
        source: "unknown",
      };
      continue;
    }
    const profile = getAgentProfile(world, state, politicianId);
    const birthYear = profile?.birthDate ? Number(profile.birthDate.slice(0, 4)) : null;
    if (birthYear != null && Number.isFinite(birthYear)) {
      runtime.cohorts[politicianId] = {
        politicianId,
        entryYear: birthYear + 25,
        source: "birth_plus_25",
      };
      runtime.metadata[`cohort:${politicianId}`] = birthYear + 25;
    } else {
      runtime.cohorts[politicianId] = {
        politicianId,
        entryYear: Number(state.currentDate.slice(0, 4)),
        source: "unknown",
      };
    }
  }
}

function syncChronicles(state: SimState, runtime: History15Runtime): void {
  const recent = state.history.slice(-60);
  const seenCaucus = new Set(
    runtime.caucusChronicles.map((c) => `${c.date}:${c.caucusId}:${c.kind}:${c.detail}`),
  );
  for (const ev of recent) {
    if (!ev.type.startsWith("CAUCUS_")) continue;
    const caucusId =
      (typeof ev.payload?.factionId === "string" && ev.payload.factionId) ||
      (typeof ev.payload?.originFactionId === "string" && ev.payload.originFactionId) ||
      ev.entityIds[0];
    const partyId =
      (typeof ev.payload?.partyId === "string" && ev.payload.partyId) ||
      ev.entityIds.find((id) => state.partyStates[id]) ||
      "";
    if (!caucusId) continue;
    const detail = ev.type.replace(/^CAUCUS_/, "").toLowerCase();
    const key = `${ev.date}:${caucusId}:${ev.type}:${detail}`;
    if (seenCaucus.has(key)) continue;
    runtime.caucusChronicles.push({
      caucusId,
      partyId,
      date: ev.date,
      kind: ev.type,
      detail,
    });
    seenCaucus.add(key);
  }
  if (runtime.caucusChronicles.length > 200) {
    runtime.caucusChronicles = runtime.caucusChronicles.slice(-200);
  }

  const seenOrg = new Set(
    runtime.organizationChronicles.map((c) => `${c.date}:${c.orgId}:${c.kind}`),
  );
  for (const ev of recent) {
    if (
      ev.type !== "ORG_ISSUE_CAMPAIGN" &&
      ev.type !== "PARTY_ORG_PRIORITY_SET" &&
      !ev.type.includes("ORGANIZATION")
    ) {
      continue;
    }
    const orgId =
      ev.entityIds[0] ?? (typeof ev.payload?.orgId === "string" ? ev.payload.orgId : null);
    if (!orgId) continue;
    const key = `${ev.date}:${orgId}:${ev.type}`;
    if (seenOrg.has(key)) continue;
    runtime.organizationChronicles.push({
      orgId,
      date: ev.date,
      kind: ev.type,
      detail: typeof ev.payload?.detail === "string" ? ev.payload.detail : ev.type,
    });
    seenOrg.add(key);
  }
  if (runtime.organizationChronicles.length > 200) {
    runtime.organizationChronicles = runtime.organizationChronicles.slice(-200);
  }

  const seenProv = new Set(
    runtime.provinceChronicles.map((c) => `${c.date}:${c.provinceId}:${c.kind}`),
  );
  for (const ev of recent) {
    if (
      ev.type !== "PROVINCIAL_ELECTION_RESULT" &&
      ev.type !== "PROVINCIAL_GOVERNMENT_FORMED" &&
      !ev.type.startsWith("PROVINCIAL_")
    ) {
      continue;
    }
    const provinceId =
      (typeof ev.payload?.provinceId === "string" && ev.payload.provinceId) ||
      ev.entityIds.find(
        (id) => id.startsWith("PROV") || state.provincialRuntime?.assemblies?.[id],
      ) ||
      null;
    if (!provinceId) continue;
    const key = `${ev.date}:${provinceId}:${ev.type}`;
    if (seenProv.has(key)) continue;
    runtime.provinceChronicles.push({
      provinceId,
      date: ev.date,
      kind: ev.type,
      detail: typeof ev.payload?.detail === "string" ? ev.payload.detail : ev.type,
    });
    seenProv.add(key);
  }
  if (runtime.provinceChronicles.length > 200) {
    runtime.provinceChronicles = runtime.provinceChronicles.slice(-200);
  }
}

/**
 * Phase 15 long-term history monthly pass.
 * Runs quarterly (01/04/07/10). Yearbook + realignment on January only.
 * Engine placement: late in the turn (after media).
 */
export function processHistory15Month(
  world: KernelWorld,
  state: SimState,
  _commandId: string,
): SimEvent[] {
  const runtime = ensureHistory15Runtime(state);
  const month = monthStart(state.currentDate);
  if (runtime.lastHistoryMonth === month) return [];

  const monthNum = Number(state.currentDate.slice(5, 7));
  if (!QUARTER_MONTHS.has(monthNum)) {
    // Light sync still runs monthly for precedents/legacies/eras seed
    ensureFoundingConstitutionalEra(state);
    syncPrecedentLinks(state);
    syncPoliticianLegacies(state);
    runtime.lastHistoryMonth = month;
    return [];
  }

  syncLeadershipAndEras(state, runtime);
  syncGovernmentTerms(world, state, runtime);
  tagGenerationalCohorts(world, state, runtime);
  ensureFoundingConstitutionalEra(state);
  syncConstitutionalEras(state);
  syncPrecedentLinks(state);
  syncPoliticianLegacies(state);
  syncChronicles(state, runtime);

  if (monthNum === 1) {
    const priorYear = Number(state.currentDate.slice(0, 4)) - 1;
    if (Number.isFinite(priorYear) && priorYear >= Number(state.scenarioStartDate.slice(0, 4))) {
      buildYearRetrospective(state, runtime, priorYear);
    }
    detectSoftRealignment(state, runtime, Number(state.currentDate.slice(0, 4)));
  }

  runtime.lastHistoryMonth = month;
  // Observational only — no history events emitted (avoids noise / fabrication).
  return [];
}
