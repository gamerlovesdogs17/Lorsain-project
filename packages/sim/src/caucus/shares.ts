/**
 * caucus/shares.ts — recompute membership / assembly / institutional shares.
 *
 * Within each party, active caucuses + unaligned residual sum to ~1.0 for each
 * share dimension (exact when denominators are positive).
 *
 * Institutional influence weights National Committee seats and party officers
 * (plus Assembly floor leader/whip) far above legislature committee seats.
 */

import { isOccupyingStatus, officesOfKind } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { ensureCaucusRuntime } from "./state.js";
import type { CaucusFactionRuntime, CaucusRuntime } from "./types.js";

const NC_SEAT_WEIGHT = 3.5;
const OFFICER_WEIGHT = 2.5;
const FLOOR_LEADERSHIP_WEIGHT = 2.0;
/** Soft residual — NC/officers dominate; assembly committees are not the main measure. */
const COMMITTEE_SEAT_WEIGHT = 0.15;

function isActiveCaucus(row: CaucusFactionRuntime): boolean {
  return row.ancestry.dissolved == null;
}

function deterministicUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Active (non-dissolved) caucuses for a party, sorted by faction id. */
export function activeCaucusesForParty(state: SimState, partyId: string): CaucusFactionRuntime[] {
  const runtime = ensureCaucusRuntime(state);
  return Object.values(runtime.caucuses)
    .filter((c) => c.partyId === partyId && isActiveCaucus(c))
    .sort((a, b) => a.factionId.localeCompare(b.factionId));
}

/**
 * Build active caucuses grouped by party (each list sorted by factionId).
 * Prefer this when touching many parties in one pass.
 */
export function activeCaucusesByParty(state: SimState): Map<string, CaucusFactionRuntime[]> {
  const runtime = ensureCaucusRuntime(state);
  const byParty = new Map<string, CaucusFactionRuntime[]>();
  for (const c of Object.values(runtime.caucuses)) {
    if (!isActiveCaucus(c)) continue;
    const list = byParty.get(c.partyId);
    if (list) list.push(c);
    else byParty.set(c.partyId, [c]);
  }
  for (const list of byParty.values()) {
    list.sort((a, b) => a.factionId.localeCompare(b.factionId));
  }
  return byParty;
}

export function countActiveCaucuses(state: SimState, partyId: string): number {
  const runtime = ensureCaucusRuntime(state);
  let n = 0;
  for (const c of Object.values(runtime.caucuses)) {
    if (c.partyId === partyId && isActiveCaucus(c)) n++;
  }
  return n;
}

/** Alive, non-retired politician ids by party / faction (sorted, matches queries.ts). */
export type PoliticianMemberIndex = {
  byParty: Map<string, string[]>;
  byFaction: Map<string, string[]>;
};

export function indexAlivePoliticians(state: SimState): PoliticianMemberIndex {
  const byParty = new Map<string, string[]>();
  const byFaction = new Map<string, string[]>();
  for (const p of Object.values(state.politicians)) {
    if (!p.alive || p.retired) continue;
    if (p.partyId) {
      const list = byParty.get(p.partyId);
      if (list) list.push(p.id);
      else byParty.set(p.partyId, [p.id]);
    }
    if (p.factionId) {
      const list = byFaction.get(p.factionId);
      if (list) list.push(p.id);
      else byFaction.set(p.factionId, [p.id]);
    }
  }
  for (const list of byParty.values()) list.sort();
  for (const list of byFaction.values()) list.sort();
  return { byParty, byFaction };
}

/** Assembly MP ids by party / faction (sorted, matches assemblyCaucus / factionAssemblyCaucus). */
export type AssemblyMemberIndex = {
  byParty: Map<string, string[]>;
  byFaction: Map<string, string[]>;
};

export function indexAssemblyMembers(world: KernelWorld, state: SimState): AssemblyMemberIndex {
  const asm = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
  const byParty = new Map<string, string[]>();
  const byFaction = new Map<string, string[]>();
  const seenParty = new Set<string>();
  const seenFaction = new Set<string>();

  for (const term of Object.values(state.officeTerms)) {
    if (!asm.has(term.officeId) || !isOccupyingStatus(term.status)) continue;
    const pol = state.politicians[term.holderId];
    if (!pol || !pol.alive || pol.retired) continue;

    if (pol.partyId) {
      const key = `${pol.partyId}\0${pol.id}`;
      if (!seenParty.has(key)) {
        seenParty.add(key);
        const list = byParty.get(pol.partyId);
        if (list) list.push(pol.id);
        else byParty.set(pol.partyId, [pol.id]);
      }
    }
    if (pol.factionId) {
      const key = `${pol.factionId}\0${pol.id}`;
      if (!seenFaction.has(key)) {
        seenFaction.add(key);
        const list = byFaction.get(pol.factionId);
        if (list) list.push(pol.id);
        else byFaction.set(pol.factionId, [pol.id]);
      }
    }
  }

  for (const list of byParty.values()) list.sort();
  for (const list of byFaction.values()) list.sort();
  return { byParty, byFaction };
}

function isUnalignedPolitician(runtime: CaucusRuntime, pol: { factionId: string | null }): boolean {
  return (
    !pol.factionId ||
    !runtime.caucuses[pol.factionId] ||
    !isActiveCaucus(runtime.caucuses[pol.factionId]!)
  );
}

/**
 * Institutional weight: National Committee seats (heavy), party officers,
 * Assembly delegation leadership (floor leader / whip). Committee seats are
 * a light residual only.
 */
export function institutionalWeightForFaction(
  world: KernelWorld,
  state: SimState,
  factionId: string,
  partyId: string,
): number {
  let weight = 0;

  const nc = state.partyOrgRuntime?.nationalCommittee[partyId] ?? [];
  for (const memberId of nc) {
    const pol = state.politicians[memberId];
    if (pol?.factionId === factionId && pol.alive && !pol.retired) {
      weight += NC_SEAT_WEIGHT;
    }
  }

  const officers = state.partyOrgRuntime?.officers[partyId];
  if (officers) {
    for (const off of Object.values(officers)) {
      if (!off) continue;
      const pol = state.politicians[off.politicianId];
      if (pol?.factionId === factionId && pol.alive && !pol.retired) {
        weight += OFFICER_WEIGHT;
      }
    }
  }

  const leadership = state.legislatureRuntime?.caucusLeadership?.[partyId];
  if (leadership) {
    for (const id of [leadership.floorLeaderId, leadership.whipId]) {
      if (!id) continue;
      const pol = state.politicians[id];
      if (pol?.factionId === factionId && pol.alive && !pol.retired) {
        weight += FLOOR_LEADERSHIP_WEIGHT;
      }
    }
  }

  const committees = state.legislatureRuntime?.committees ?? {};
  for (const committee of Object.values(committees)) {
    for (const memberId of committee.memberIds ?? []) {
      const pol = state.politicians[memberId];
      if (pol?.factionId === factionId && pol.partyId === partyId && pol.alive && !pol.retired) {
        weight += COMMITTEE_SEAT_WEIGHT;
      }
    }
  }

  void world;
  return weight;
}

/**
 * One-pass institutional weights for all active caucus factions + unaligned residual
 * per party. Matches institutionalWeightForFaction + unalignedInstitutionalWeight.
 */
function computeAllInstitutionalWeights(
  state: SimState,
  runtime: CaucusRuntime,
): { byFaction: Map<string, number>; unalignedByParty: Map<string, number> } {
  const byFaction = new Map<string, number>();
  const unalignedByParty = new Map<string, number>();

  const addFaction = (factionId: string, w: number) => {
    byFaction.set(factionId, (byFaction.get(factionId) ?? 0) + w);
  };
  const addUnaligned = (partyId: string, w: number) => {
    unalignedByParty.set(partyId, (unalignedByParty.get(partyId) ?? 0) + w);
  };

  /**
   * NC / officers / floor leadership: match institutionalWeightForFaction (no pol.partyId
   * check) but only attribute to factions of this party — same as calling it per active
   * faction of `partyId` while scanning that party's org seats.
   */
  const creditOrgSeat = (partyId: string, memberId: string, w: number) => {
    const pol = state.politicians[memberId];
    if (!pol?.alive || pol.retired) return;
    if (pol.factionId) {
      const row = runtime.caucuses[pol.factionId];
      if (row && isActiveCaucus(row) && row.partyId === partyId) {
        addFaction(pol.factionId, w);
        return;
      }
    }
    if (pol.partyId === partyId && isUnalignedPolitician(runtime, pol)) {
      addUnaligned(partyId, w);
    }
  };

  /** Committee seats: faction path requires partyId match. */
  const creditCommitteeSeat = (memberId: string, w: number) => {
    const pol = state.politicians[memberId];
    if (!pol?.alive || pol.retired || !pol.partyId) return;
    if (pol.factionId) {
      const row = runtime.caucuses[pol.factionId];
      if (row && isActiveCaucus(row) && pol.partyId === row.partyId) {
        addFaction(pol.factionId, w);
        return;
      }
    }
    if (isUnalignedPolitician(runtime, pol)) {
      addUnaligned(pol.partyId, w);
    }
  };

  const partyIds = new Set<string>();
  for (const row of Object.values(runtime.caucuses)) partyIds.add(row.partyId);
  for (const partyId of Object.keys(state.partyOrgRuntime?.nationalCommittee ?? {})) {
    partyIds.add(partyId);
  }
  for (const partyId of Object.keys(state.partyOrgRuntime?.officers ?? {})) {
    partyIds.add(partyId);
  }
  for (const partyId of Object.keys(state.legislatureRuntime?.caucusLeadership ?? {})) {
    partyIds.add(partyId);
  }

  for (const partyId of partyIds) {
    const nc = state.partyOrgRuntime?.nationalCommittee[partyId] ?? [];
    for (const memberId of nc) creditOrgSeat(partyId, memberId, NC_SEAT_WEIGHT);

    const officers = state.partyOrgRuntime?.officers[partyId];
    if (officers) {
      for (const off of Object.values(officers)) {
        if (!off) continue;
        creditOrgSeat(partyId, off.politicianId, OFFICER_WEIGHT);
      }
    }

    const leadership = state.legislatureRuntime?.caucusLeadership?.[partyId];
    if (leadership) {
      for (const id of [leadership.floorLeaderId, leadership.whipId]) {
        if (!id) continue;
        creditOrgSeat(partyId, id, FLOOR_LEADERSHIP_WEIGHT);
      }
    }
  }

  const committees = state.legislatureRuntime?.committees ?? {};
  for (const committee of Object.values(committees)) {
    for (const memberId of committee.memberIds ?? []) {
      creditCommitteeSeat(memberId, COMMITTEE_SEAT_WEIGHT);
    }
  }

  return { byFaction, unalignedByParty };
}

/**
 * Ensure active caucuses + unaligned partyMemberSupport sum to 1 for a party.
 */
export function rebalancePartyMemberSupport(
  state: SimState,
  partyId: string,
  precomputedActive?: CaucusFactionRuntime[],
): void {
  const runtime = ensureCaucusRuntime(state);
  const caucuses = precomputedActive ?? activeCaucusesForParty(state, partyId);
  const unaligned = runtime.unalignedByParty[partyId] ?? {
    membershipShare: 0,
    partyMemberSupport: 0,
    assemblyShare: 0,
    institutionalInfluence: 0,
  };
  runtime.unalignedByParty[partyId] = unaligned;

  let sum = unaligned.partyMemberSupport;
  for (const c of caucuses) sum += c.partyMemberSupport;

  if (sum <= 1e-9) {
    const n = caucuses.length + 1;
    const each = 1 / n;
    for (const c of caucuses) c.partyMemberSupport = each;
    unaligned.partyMemberSupport = each;
    return;
  }

  for (const c of caucuses) {
    c.partyMemberSupport = Math.max(0, Math.min(1, c.partyMemberSupport / sum));
  }
  unaligned.partyMemberSupport = Math.max(0, Math.min(1, unaligned.partyMemberSupport / sum));
}

/**
 * Seed partyMemberSupport when still 0: blend elite membershipShare with a
 * deterministic hash so parties start with varied nonzero supports.
 */
function seedPartyMemberSupportIfZero(
  state: SimState,
  partyId: string,
  factionIds: string[],
  activeRows: CaucusFactionRuntime[],
): void {
  const runtime = ensureCaucusRuntime(state);
  const needsSeed = factionIds.some((fid) => {
    const row = runtime.caucuses[fid]!;
    return row.partyMemberSupport <= 0;
  });
  const unaligned = runtime.unalignedByParty[partyId];
  const unalignedNeeds =
    !unaligned || unaligned.partyMemberSupport <= 0 || unaligned.partyMemberSupport === undefined;

  if (!needsSeed && !unalignedNeeds) return;

  for (const factionId of factionIds) {
    const row = runtime.caucuses[factionId]!;
    if (row.partyMemberSupport > 0) continue;
    const noise = deterministicUnit(`${partyId}:${factionId}:pms`);
    row.partyMemberSupport = Math.max(
      0.02,
      Math.min(0.85, row.membershipShare * 0.55 + 0.12 + noise * 0.28),
    );
  }

  if (!runtime.unalignedByParty[partyId]) {
    runtime.unalignedByParty[partyId] = {
      membershipShare: 0,
      partyMemberSupport: 0,
      assemblyShare: 0,
      institutionalInfluence: 0,
    };
  }
  const u = runtime.unalignedByParty[partyId]!;
  if (u.partyMemberSupport <= 0) {
    const noise = deterministicUnit(`${partyId}:unaligned:pms`);
    u.partyMemberSupport = Math.max(
      0.02,
      Math.min(0.85, (u.membershipShare ?? 0) * 0.55 + 0.1 + noise * 0.3),
    );
  }

  rebalancePartyMemberSupport(state, partyId, activeRows);
}

/**
 * Recompute all caucus share fields from live membership / assembly / officers.
 * Syncs leaderId from factionStates.chairId when present.
 * Also seeds / rebalances partyMemberSupport when uninitialized.
 */
export function recomputeCaucusShares(world: KernelWorld, state: SimState): void {
  const runtime = ensureCaucusRuntime(state);
  const partyIds = new Set<string>();

  for (const row of Object.values(runtime.caucuses)) {
    partyIds.add(row.partyId);
  }
  for (const fac of Object.values(state.factionStates)) {
    partyIds.add(fac.partyId);
  }

  const pols = indexAlivePoliticians(state);
  const assembly = indexAssemblyMembers(world, state);
  const inst = computeAllInstitutionalWeights(state, runtime);
  const activeByParty = activeCaucusesByParty(state);

  for (const partyId of [...partyIds].sort()) {
    const partyMembersList = pols.byParty.get(partyId) ?? [];
    const partyMemberCount = partyMembersList.length;
    const partyAssembly = assembly.byParty.get(partyId) ?? [];
    const partyAssemblyCount = partyAssembly.length;

    const activeRows = activeByParty.get(partyId) ?? [];
    const factionIds = activeRows.map((c) => c.factionId);

    let memberAssigned = 0;
    let assemblyAssigned = 0;
    let instTotal = 0;
    const instByFaction: Record<string, number> = {};

    for (const factionId of factionIds) {
      const row = runtime.caucuses[factionId]!;
      const facState = state.factionStates[factionId];
      if (facState?.chairId) row.leaderId = facState.chairId;

      const members = pols.byFaction.get(factionId)?.length ?? 0;
      const mps = assembly.byFaction.get(factionId)?.length ?? 0;
      memberAssigned += members;
      assemblyAssigned += mps;

      const factionInst = inst.byFaction.get(factionId) ?? 0;
      instByFaction[factionId] = factionInst;
      instTotal += factionInst;

      row.membershipShare =
        partyMemberCount > 0 ? members / partyMemberCount : factionIds.length > 0 ? 0 : 0;
      row.assemblyShare =
        partyAssemblyCount > 0 ? mps / partyAssemblyCount : factionIds.length > 0 ? 0 : 0;
    }

    const unalignedMembers = Math.max(0, partyMemberCount - memberAssigned);
    const unalignedAssembly = Math.max(0, partyAssemblyCount - assemblyAssigned);
    const unalignedInst = inst.unalignedByParty.get(partyId) ?? 0;
    const instDenom = instTotal + unalignedInst;

    for (const factionId of factionIds) {
      const row = runtime.caucuses[factionId]!;
      row.institutionalInfluence = instDenom > 0 ? (instByFaction[factionId] ?? 0) / instDenom : 0;
    }

    const prevUnaligned = runtime.unalignedByParty[partyId];
    runtime.unalignedByParty[partyId] = {
      membershipShare: partyMemberCount > 0 ? unalignedMembers / partyMemberCount : 0,
      partyMemberSupport: prevUnaligned?.partyMemberSupport ?? 0,
      assemblyShare: partyAssemblyCount > 0 ? unalignedAssembly / partyAssemblyCount : 0,
      institutionalInfluence: instDenom > 0 ? unalignedInst / instDenom : 0,
    };

    seedPartyMemberSupportIfZero(state, partyId, factionIds, activeRows);
  }
}
