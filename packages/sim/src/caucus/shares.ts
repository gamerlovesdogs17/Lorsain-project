/**
 * caucus/shares.ts — recompute membership / assembly / institutional shares.
 *
 * Within each party, active caucuses + unaligned residual sum to ~1.0 for each
 * share dimension (exact when denominators are positive).
 *
 * Institutional influence weights National Committee seats and party officers
 * (plus Assembly floor leader/whip) far above legislature committee seats.
 */

import type { KernelWorld, SimState } from "../types.js";
import {
  factionAssemblyCaucus,
  factionMembers,
  partyMembers,
  assemblyCaucus,
} from "../parties/queries.js";
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

export function countActiveCaucuses(state: SimState, partyId: string): number {
  return activeCaucusesForParty(state, partyId).length;
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

function unalignedInstitutionalWeight(
  state: SimState,
  runtime: CaucusRuntime,
  partyId: string,
): number {
  let weight = 0;
  const isUnaligned = (pol: { factionId: string | null }) =>
    !pol.factionId ||
    !runtime.caucuses[pol.factionId] ||
    !isActiveCaucus(runtime.caucuses[pol.factionId]!);

  const nc = state.partyOrgRuntime?.nationalCommittee[partyId] ?? [];
  for (const memberId of nc) {
    const pol = state.politicians[memberId];
    if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
    if (isUnaligned(pol)) weight += NC_SEAT_WEIGHT;
  }

  const officers = state.partyOrgRuntime?.officers[partyId];
  if (officers) {
    for (const off of Object.values(officers)) {
      if (!off) continue;
      const pol = state.politicians[off.politicianId];
      if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
      if (isUnaligned(pol)) weight += OFFICER_WEIGHT;
    }
  }

  const leadership = state.legislatureRuntime?.caucusLeadership?.[partyId];
  if (leadership) {
    for (const id of [leadership.floorLeaderId, leadership.whipId]) {
      if (!id) continue;
      const pol = state.politicians[id];
      if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
      if (isUnaligned(pol)) weight += FLOOR_LEADERSHIP_WEIGHT;
    }
  }

  const committees = state.legislatureRuntime?.committees ?? {};
  for (const committee of Object.values(committees)) {
    for (const memberId of committee.memberIds ?? []) {
      const pol = state.politicians[memberId];
      if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
      if (isUnaligned(pol)) weight += COMMITTEE_SEAT_WEIGHT;
    }
  }
  return weight;
}

/**
 * Ensure active caucuses + unaligned partyMemberSupport sum to 1 for a party.
 */
export function rebalancePartyMemberSupport(state: SimState, partyId: string): void {
  const runtime = ensureCaucusRuntime(state);
  const caucuses = activeCaucusesForParty(state, partyId);
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

  rebalancePartyMemberSupport(state, partyId);
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

  for (const partyId of [...partyIds].sort()) {
    const partyMemberCount = partyMembers(state, partyId).length;
    const partyAssembly = assemblyCaucus(world, state, partyId);
    const partyAssemblyCount = partyAssembly.length;

    const factionIds = Object.keys(runtime.caucuses)
      .filter((fid) => {
        const row = runtime.caucuses[fid]!;
        return row.partyId === partyId && isActiveCaucus(row);
      })
      .sort();

    let memberAssigned = 0;
    let assemblyAssigned = 0;
    let instTotal = 0;
    const instByFaction: Record<string, number> = {};

    for (const factionId of factionIds) {
      const row = runtime.caucuses[factionId]!;
      const facState = state.factionStates[factionId];
      if (facState?.chairId) row.leaderId = facState.chairId;

      const members = factionMembers(state, factionId).length;
      const mps = factionAssemblyCaucus(world, state, factionId).length;
      memberAssigned += members;
      assemblyAssigned += mps;

      const inst = institutionalWeightForFaction(world, state, factionId, partyId);
      instByFaction[factionId] = inst;
      instTotal += inst;

      row.membershipShare =
        partyMemberCount > 0 ? members / partyMemberCount : factionIds.length > 0 ? 0 : 0;
      row.assemblyShare =
        partyAssemblyCount > 0 ? mps / partyAssemblyCount : factionIds.length > 0 ? 0 : 0;
    }

    const unalignedMembers = Math.max(0, partyMemberCount - memberAssigned);
    const unalignedAssembly = Math.max(0, partyAssemblyCount - assemblyAssigned);
    const unalignedInst = unalignedInstitutionalWeight(state, runtime, partyId);
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

    seedPartyMemberSupportIfZero(state, partyId, factionIds);
  }
}
