/**
 * caucus/shares.ts — recompute membership / assembly / institutional shares.
 *
 * Within each party, active caucuses + unaligned residual sum to ~1.0 for each
 * share dimension (exact when denominators are positive).
 */

import type { KernelWorld, SimState } from "../types.js";
import {
  factionAssemblyCaucus,
  factionMembers,
  partyMembers,
  assemblyCaucus,
} from "../parties/queries.js";
import { ensureCaucusRuntime } from "./state.js";
import type { CaucusFactionRuntime } from "./types.js";

const OFFICER_WEIGHT = 2.5;
const COMMITTEE_SEAT_WEIGHT = 1.0;

function isActiveCaucus(row: CaucusFactionRuntime): boolean {
  return row.ancestry.dissolved == null;
}

/**
 * Institutional weight: party officers in this faction + legislature committee seats.
 */
export function institutionalWeightForFaction(
  world: KernelWorld,
  state: SimState,
  factionId: string,
  partyId: string,
): number {
  let weight = 0;
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

  const committees = state.legislatureRuntime?.committees ?? {};
  for (const committee of Object.values(committees)) {
    for (const memberId of committee.memberIds ?? []) {
      const pol = state.politicians[memberId];
      if (pol?.factionId === factionId && pol.partyId === partyId && pol.alive && !pol.retired) {
        weight += COMMITTEE_SEAT_WEIGHT;
      }
    }
  }

  return weight;
}

/**
 * Recompute all caucus share fields from live membership / assembly / officers.
 * Syncs leaderId from factionStates.chairId when present.
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

    // Unaligned residual (members without an active caucus / not counted above)
    const unalignedMembers = Math.max(0, partyMemberCount - memberAssigned);
    const unalignedAssembly = Math.max(0, partyAssemblyCount - assemblyAssigned);

    // Unaligned institutional: party officers/committee seats with no faction
    let unalignedInst = 0;
    const officers = state.partyOrgRuntime?.officers[partyId];
    if (officers) {
      for (const off of Object.values(officers)) {
        if (!off) continue;
        const pol = state.politicians[off.politicianId];
        if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
        if (
          !pol.factionId ||
          !runtime.caucuses[pol.factionId] ||
          !isActiveCaucus(runtime.caucuses[pol.factionId]!)
        ) {
          unalignedInst += OFFICER_WEIGHT;
        }
      }
    }
    const committees = state.legislatureRuntime?.committees ?? {};
    for (const committee of Object.values(committees)) {
      for (const memberId of committee.memberIds ?? []) {
        const pol = state.politicians[memberId];
        if (!pol?.alive || pol.retired || pol.partyId !== partyId) continue;
        if (
          !pol.factionId ||
          !runtime.caucuses[pol.factionId] ||
          !isActiveCaucus(runtime.caucuses[pol.factionId]!)
        ) {
          unalignedInst += COMMITTEE_SEAT_WEIGHT;
        }
      }
    }
    const instDenom = instTotal + unalignedInst;

    for (const factionId of factionIds) {
      const row = runtime.caucuses[factionId]!;
      row.institutionalInfluence = instDenom > 0 ? (instByFaction[factionId] ?? 0) / instDenom : 0;
    }

    runtime.unalignedByParty[partyId] = {
      membershipShare: partyMemberCount > 0 ? unalignedMembers / partyMemberCount : 0,
      assemblyShare: partyAssemblyCount > 0 ? unalignedAssembly / partyAssemblyCount : 0,
      institutionalInfluence: instDenom > 0 ? unalignedInst / instDenom : 0,
    };
  }
}
