/**
 * caucus/monthly.ts
 *
 * Gradual caucus share drift, rare alliances, rare merge/split with viability
 * thresholds, endorsement-history growth, and faction-chair → caucus-leader sync.
 *
 * Engine placement: immediately after processPartyOrgMonth.
 */

import { monthStart } from "../campaigns/effects.js";
import { changeFaction } from "../parties/membership.js";
import { factionMembers } from "../parties/queries.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import {
  formCaucusAlliance,
  proposeCaucusMerger,
  scoreCaucusMergeCompatibility,
} from "./commands.js";
import { ensureCaucusRuntime } from "./state.js";
import { recomputeCaucusShares } from "./shares.js";
import type { CaucusFactionRuntime } from "./types.js";

const MIN_ACTIVE_CAUCUSES_BEFORE_MERGE = 2;
const MAX_ACTIVE_CAUCUSES_SOFT = 6;
const MERGE_VIABILITY_SHARE = 0.12;
const MERGE_COMPAT_THRESHOLD = 0.62;
const SPLIT_MIN_SHARE = 0.42;
const SPLIT_MOVE_FRACTION = 0.18;
const DRIFT_RATE = 0.04;

function deterministicRoll(key: string, dateStr: string): number {
  let h = 0;
  const s = key + dateStr;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

function isActive(row: CaucusFactionRuntime): boolean {
  return row.ancestry.dissolved == null;
}

function activeCaucusesForParty(
  runtime: ReturnType<typeof ensureCaucusRuntime>,
  partyId: string,
): CaucusFactionRuntime[] {
  return Object.values(runtime.caucuses)
    .filter((c) => c.partyId === partyId && isActive(c))
    .sort((a, b) => a.factionId.localeCompare(b.factionId));
}

/** Sync factionStates.chairId → caucus leaderId; pick a light deputy from members. */
function syncLeadersFromFactionChairs(state: SimState): void {
  const runtime = ensureCaucusRuntime(state);
  for (const [factionId, row] of Object.entries(runtime.caucuses)) {
    if (!isActive(row)) continue;
    const fac = state.factionStates[factionId];
    if (fac?.chairId) {
      row.leaderId = fac.chairId;
    } else if (row.leaderId) {
      const pol = state.politicians[row.leaderId];
      if (!pol?.alive || pol.retired || pol.factionId !== factionId) {
        row.leaderId = null;
      }
    }
    if (row.deputyId) {
      const dep = state.politicians[row.deputyId];
      if (!dep?.alive || dep.retired || dep.factionId !== factionId || dep.id === row.leaderId) {
        row.deputyId = null;
      }
    }
    if (!row.deputyId && row.leaderId) {
      const members = factionMembers(state, factionId).filter((id) => id !== row.leaderId);
      row.deputyId = members[0] ?? null;
    }
  }
}

/** Soft membership drift toward endorsementMomentum / cohesion targets (bounded). */
function applyShareDrift(state: SimState, month: string): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(runtime, partyId);
    if (caucuses.length === 0) continue;

    // Relative attraction weights from momentum + cohesion
    const weights: Record<string, number> = {};
    let sumW = 0;
    for (const c of caucuses) {
      const cohesion = state.factionStates[c.factionId]?.cohesion ?? 0.5;
      const w = 0.35 + c.endorsementMomentum * 0.4 + cohesion * 0.25;
      weights[c.factionId] = w;
      sumW += w;
    }
    if (sumW <= 0) continue;

    const alignedShare = Math.max(0, 1 - (runtime.unalignedByParty[partyId]?.membershipShare ?? 0));
    for (const c of caucuses) {
      const target = alignedShare * ((weights[c.factionId] ?? 0) / sumW);
      const delta = (target - c.membershipShare) * DRIFT_RATE;
      // Drift is informational until recruit/merge moves people; nudge momentum instead
      // so subsequent rare recruits bias toward growing caucuses.
      if (delta > 0.002) {
        c.endorsementMomentum = Math.min(1, c.endorsementMomentum + 0.01);
      } else if (delta < -0.002) {
        c.endorsementMomentum = Math.max(0, c.endorsementMomentum - 0.008);
      }
      // Tiny stance drift toward chair when loyal/endorsing
      if (c.endorsedChairCandidateId) {
        const roll = deterministicRoll(`${c.factionId}:stance:${month}`, month);
        if (roll < 0.08 && c.stanceTowardChair === "conditional") {
          c.stanceTowardChair = "cooperative";
        }
      }
    }
  }
}

function maybeFormAlliance(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(runtime, partyId);
    if (caucuses.length < 2) continue;
    // ~4% chance per party-month
    if (deterministicRoll(`${partyId}:ally:${month}`, month) > 0.04) continue;

    for (let i = 0; i < caucuses.length; i++) {
      for (let j = i + 1; j < caucuses.length; j++) {
        const a = caucuses[i]!;
        const b = caucuses[j]!;
        if (a.alliances[b.factionId] || b.alliances[a.factionId]) continue;
        const score = scoreCaucusMergeCompatibility(world, state, a.factionId, b.factionId);
        if (score < 0.5) continue;
        const actorId = a.leaderId ?? b.leaderId;
        if (!actorId) continue;
        const result = formCaucusAlliance(state, world, {
          actorId,
          factionId: a.factionId,
          otherFactionId: b.factionId,
          kind: "alliance",
          commandId,
        });
        if (result.ok) {
          const last = state.history[state.history.length - 1];
          if (last) events.push(last);
          return; // at most one alliance event per month
        }
      }
    }
  }
}

function maybeMerge(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(runtime, partyId);
    if (caucuses.length < MIN_ACTIVE_CAUCUSES_BEFORE_MERGE) continue;
    // Prefer merge when too many caucuses; otherwise rare
    const overcrowded = caucuses.length > MAX_ACTIVE_CAUCUSES_SOFT;
    const chance = overcrowded ? 0.08 : 0.025;
    if (deterministicRoll(`${partyId}:merge:${month}`, month) > chance) continue;

    // Smallest viable absorb target
    const sorted = [...caucuses].sort((a, b) => a.membershipShare - b.membershipShare);
    const absorb = sorted[0]!;
    if (absorb.membershipShare > MERGE_VIABILITY_SHARE) continue;

    let bestInto: CaucusFactionRuntime | null = null;
    let bestScore = 0;
    for (const into of sorted.slice(1)) {
      const score = scoreCaucusMergeCompatibility(world, state, absorb.factionId, into.factionId);
      if (score > bestScore) {
        bestScore = score;
        bestInto = into;
      }
    }
    if (!bestInto || bestScore < MERGE_COMPAT_THRESHOLD) continue;
    const actorId = absorb.leaderId ?? bestInto.leaderId;
    if (!actorId) continue;

    const result = proposeCaucusMerger(state, world, {
      actorId,
      absorbFactionId: absorb.factionId,
      intoFactionId: bestInto.factionId,
      commandId,
      minCompatibility: MERGE_COMPAT_THRESHOLD,
    });
    if (result.ok) {
      const last = state.history[state.history.length - 1];
      if (last) events.push(last);
      return;
    }
  }
}

/**
 * Rare soft split: peel a minority from an oversized caucus into unaligned or a
 * previously dissolved sibling (revive), never inventing dozens of new caucuses.
 */
function maybeSplit(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(runtime, partyId);
    // Don't split when already many active caucuses
    if (caucuses.length >= MAX_ACTIVE_CAUCUSES_SOFT) continue;
    if (deterministicRoll(`${partyId}:split:${month}`, month) > 0.02) continue;

    const oversized = [...caucuses]
      .filter((c) => c.membershipShare >= SPLIT_MIN_SHARE)
      .sort((a, b) => b.membershipShare - a.membershipShare)[0];
    if (!oversized) continue;

    const members = factionMembers(state, oversized.factionId);
    const moveCount = Math.max(1, Math.floor(members.length * SPLIT_MOVE_FRACTION));
    if (moveCount < 2 || members.length - moveCount < 3) continue;

    // Prefer reviving a dissolved same-party caucus that merged into this one
    let reviveId: string | null = null;
    for (const [fid, row] of Object.entries(runtime.caucuses)) {
      if (row.partyId !== partyId) continue;
      if (!row.ancestry.dissolved) continue;
      if (row.ancestry.successor === oversized.factionId || oversized.ancestry.mergedWith === fid) {
        reviveId = fid;
        break;
      }
    }

    const movers = members.slice(-moveCount);
    if (reviveId) {
      const revived = runtime.caucuses[reviveId]!;
      revived.ancestry.dissolved = null;
      revived.ancestry.splitFrom = oversized.factionId;
      revived.ancestry.successor = null;
      const fac = state.factionStates[reviveId];
      if (fac) fac.status = "chair_vacant";

      for (const id of movers) {
        changeFaction(state, world, id, reviveId, commandId);
      }
      revived.leaderId = movers[0] ?? null;
      if (fac && revived.leaderId) {
        fac.chairId = revived.leaderId;
        fac.status = "active";
      }
      oversized.ancestry.splitFrom = null;

      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CAUCUS_SPLIT",
          importance: 0.65,
          visibility: "public",
          actorIds: movers.slice(0, 3),
          entityIds: [oversized.factionId, reviveId, partyId],
          payload: {
            originFactionId: oversized.factionId,
            newFactionId: reviveId,
            membersMoved: movers.length,
            revived: true,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else {
      // Soft split to unaligned — pressure without spawning new caucus ids
      for (const id of movers) {
        changeFaction(state, world, id, null, commandId);
      }
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CAUCUS_SOFT_SPLIT",
          importance: 0.45,
          visibility: "public",
          actorIds: movers.slice(0, 3),
          entityIds: [oversized.factionId, partyId],
          payload: {
            originFactionId: oversized.factionId,
            membersMoved: movers.length,
            toUnaligned: true,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
    return;
  }
}

export function processCaucusMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensureCaucusRuntime(state);
  const month = monthStart(state.currentDate);
  if (runtime.lastCaucusMonth === month) return [];

  const events: SimEvent[] = [];

  syncLeadersFromFactionChairs(state);
  recomputeCaucusShares(world, state);
  applyShareDrift(state, month);
  maybeFormAlliance(state, world, month, commandId, events);
  maybeMerge(state, world, month, commandId, events);
  maybeSplit(state, world, month, commandId, events);
  recomputeCaucusShares(world, state);

  runtime.lastCaucusMonth = month;
  return events;
}
