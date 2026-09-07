/**
 * partyOrg/sync.ts
 *
 * Keeps `partyStates[partyId].leaderId` and `partyOrgRuntime.officers[partyId].chair`
 * as a single authoritative national leader (the Chair). Chair wins when both exist.
 */

import type { KernelWorld, SimState } from "../types.js";
import { ensurePartyOrgRuntime } from "./state.js";

/**
 * Set `partyStates[partyId].leaderId` from the seated chair.
 * Direct write (not setPartyLeader) to avoid chair↔leader loops and to preserve
 * chair.assumedDate used for term elections.
 */
export function syncPartyLeaderFromChair(
  state: SimState,
  _world: KernelWorld,
  partyId: string,
  _commandId: string | null,
): void {
  const runtime = ensurePartyOrgRuntime(state);
  const chair = runtime.officers[partyId]?.chair;
  if (!chair) return;
  const party = state.partyStates[partyId];
  if (!party) return;
  if (party.leaderId === chair.politicianId) return;
  party.leaderId = chair.politicianId;
}

/**
 * If chair is vacant and legacy leaderId is set, seed the chair seat from leaderId.
 */
export function syncChairFromLegacyLeader(
  state: SimState,
  _world: KernelWorld,
  partyId: string,
): void {
  const runtime = ensurePartyOrgRuntime(state);
  const party = state.partyStates[partyId];
  if (!party?.leaderId) return;

  if (!runtime.officers[partyId]) runtime.officers[partyId] = {};
  const officers = runtime.officers[partyId]!;
  if (officers.chair) return;

  const pol = state.politicians[party.leaderId];
  if (!pol?.alive || pol.retired || pol.partyId !== partyId) return;

  officers.chair = {
    role: "chair",
    politicianId: party.leaderId,
    partyId,
    assumedDate: state.currentDate,
  };
}

/**
 * Returns partyIds where both chair and leaderId are populated but disagree.
 */
export function assertChairLeaderInvariant(state: SimState): string[] {
  const runtime = state.partyOrgRuntime;
  if (!runtime) return [];
  const diverged: string[] = [];
  for (const partyId of Object.keys(state.partyStates)) {
    const leaderId = state.partyStates[partyId]?.leaderId ?? null;
    const chairId = runtime.officers[partyId]?.chair?.politicianId ?? null;
    if (leaderId && chairId && leaderId !== chairId) diverged.push(partyId);
  }
  return diverged;
}

/**
 * For every party: if chair exists, sync leaderId FROM chair; if only leaderId, seed chair.
 */
export function reconcileAllPartyLeaders(
  state: SimState,
  world: KernelWorld,
  commandId: string | null,
): void {
  ensurePartyOrgRuntime(state);
  for (const partyId of Object.keys(state.partyStates)) {
    const chair = state.partyOrgRuntime?.officers[partyId]?.chair;
    const leaderId = state.partyStates[partyId]?.leaderId ?? null;
    if (chair) {
      syncPartyLeaderFromChair(state, world, partyId, commandId);
    } else if (leaderId) {
      syncChairFromLegacyLeader(state, world, partyId);
    }
  }
}
