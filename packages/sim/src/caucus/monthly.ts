/**
 * caucus/monthly.ts
 *
 * Gradual caucus share / partyMemberSupport drift, rare alliances, rare
 * merge/split/formation/dissolution, endorsement-history growth, and
 * faction-chair → caucus-leader sync.
 *
 * Engine placement: immediately after processPartyOrgMonth.
 */

import { monthStart } from "../campaigns/effects.js";
import { changeFaction } from "../parties/membership.js";
import { factionAssemblyCaucus, factionMembers, partyMembers } from "../parties/queries.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import {
  dissolveCaucus,
  formCaucus,
  formCaucusAlliance,
  proposeCaucusMerger,
  scoreCaucusMergeCompatibility,
  splitCaucus,
} from "./commands.js";
import { ensureCaucusRuntime } from "./state.js";
import {
  activeCaucusesForParty,
  rebalancePartyMemberSupport,
  recomputeCaucusShares,
} from "./shares.js";
import type { CaucusFactionRuntime } from "./types.js";

const MIN_ACTIVE_CAUCUSES_BEFORE_MERGE = 2;
const MAX_ACTIVE_CAUCUSES_SOFT = 6;
const MERGE_VIABILITY_SHARE = 0.12;
const MERGE_COMPAT_THRESHOLD = 0.62;
const SPLIT_MIN_SHARE = 0.42;
const SPLIT_MOVE_FRACTION = 0.18;
const DRIFT_RATE = 0.04;
const PMS_DRIFT = 0.018;
const DISSOLVE_SUPPORT = 0.025;
const DISSOLVE_STREAK_MONTHS = 4;
const FORM_CHANCE = 0.015;

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

function lowSupportStreakKey(factionId: string): string {
  return `lowSupportStreak:${factionId}`;
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

function stanceDriftFactor(stance: CaucusFactionRuntime["stanceTowardChair"]): number {
  switch (stance) {
    case "loyal":
      return 0.012;
    case "cooperative":
      return 0.006;
    case "conditional":
      return 0;
    case "critical":
      return -0.006;
    case "oppositional":
      return -0.012;
    default:
      return 0;
  }
}

function strategyDrift(c: CaucusFactionRuntime): number {
  switch (c.growthStrategy) {
    case "recruit_members":
      return 0.01;
    case "recruit_mps":
      return c.assemblyShare > 0.05 ? 0.008 : -0.004;
    case "win_committee":
      return c.institutionalInfluence > 0.08 ? 0.007 : -0.002;
    case "win_leadership":
      return c.endorsementMomentum * 0.02 - 0.004;
    case "influence_platform":
      return c.priorities.length > 0 ? 0.006 : 0;
    case "back_primaries":
      return c.endorsedPrimaryCandidateId ? 0.009 : -0.003;
    case "provincial_base":
      return 0.005;
    default:
      return 0;
  }
}

/** Soft membership drift + gradual partyMemberSupport drift by strategy. */
function applyShareDrift(world: KernelWorld, state: SimState, month: string): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(state, partyId);
    if (caucuses.length === 0) continue;

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
    let recentElectionBoost = 0;
    const recent = state.history.slice(-40);
    for (let i = recent.length - 1; i >= 0; i--) {
      const ev = recent[i]!;
      if (
        (ev.type === "PRESIDENTIAL_ELECTION_RESULT" || ev.type === "ASSEMBLY_ELECTION_RESULT") &&
        ev.entityIds.includes(partyId)
      ) {
        recentElectionBoost = 0.006;
        break;
      }
    }

    for (const c of caucuses) {
      const target = alignedShare * ((weights[c.factionId] ?? 0) / sumW);
      const delta = (target - c.membershipShare) * DRIFT_RATE;
      if (delta > 0.002) {
        c.endorsementMomentum = Math.min(1, c.endorsementMomentum + 0.01);
      } else if (delta < -0.002) {
        c.endorsementMomentum = Math.max(0, c.endorsementMomentum - 0.008);
      }

      const pmsDelta =
        strategyDrift(c) +
        (c.endorsementMomentum - 0.35) * 0.02 +
        stanceDriftFactor(c.stanceTowardChair) +
        recentElectionBoost;
      c.partyMemberSupport = Math.max(0, Math.min(1, c.partyMemberSupport + pmsDelta * PMS_DRIFT));

      if (c.endorsedChairCandidateId) {
        const roll = deterministicRoll(`${c.factionId}:stance:${month}`, month);
        if (roll < 0.08 && c.stanceTowardChair === "conditional") {
          c.stanceTowardChair = "cooperative";
        }
      }

      void world;
    }

    rebalancePartyMemberSupport(state, partyId);
  }
}

function maybeFormAlliance(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(state, partyId);
    if (caucuses.length < 2) continue;
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
          goal: score > 0.7 ? "joint_platform" : "mutual_support",
        });
        if (result.ok) {
          const last = state.history[state.history.length - 1];
          if (last) events.push(last);
          return;
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
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(state, partyId);
    if (caucuses.length < MIN_ACTIVE_CAUCUSES_BEFORE_MERGE) continue;
    const overcrowded = caucuses.length > MAX_ACTIVE_CAUCUSES_SOFT;
    const chance = overcrowded ? 0.08 : 0.025;
    if (deterministicRoll(`${partyId}:merge:${month}`, month) > chance) continue;

    const sorted = [...caucuses].sort(
      (a, b) =>
        a.partyMemberSupport - b.partyMemberSupport || a.membershipShare - b.membershipShare,
    );
    const absorb = sorted[0]!;
    if (absorb.membershipShare > MERGE_VIABILITY_SHARE && absorb.partyMemberSupport > 0.1) {
      continue;
    }

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
 * Rare split: prefer creating a NEW dynamic faction/caucus; revive dissolved siblings first.
 */
function maybeSplit(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const caucuses = activeCaucusesForParty(state, partyId);
    if (caucuses.length >= MAX_ACTIVE_CAUCUSES_SOFT) continue;
    if (deterministicRoll(`${partyId}:split:${month}`, month) > 0.02) continue;

    const oversized = [...caucuses]
      .filter((c) => c.membershipShare >= SPLIT_MIN_SHARE || c.partyMemberSupport >= 0.4)
      .sort((a, b) => b.membershipShare - a.membershipShare)[0];
    if (!oversized) continue;

    const members = factionMembers(state, oversized.factionId);
    const moveCount = Math.max(1, Math.floor(members.length * SPLIT_MOVE_FRACTION));
    if (moveCount < 2 || members.length - moveCount < 3) continue;

    const movers = members.slice(-moveCount);
    const actorId = oversized.leaderId ?? movers[0];
    if (!actorId) continue;

    const result = splitCaucus(state, world, {
      actorId,
      factionId: oversized.factionId,
      politicianIds: movers,
      commandId,
    });
    if (result.ok) {
      const last = state.history[state.history.length - 1];
      if (last) events.push(last);
      return;
    }

    // Fallback: soft split to unaligned if dynamic faction registration failed auth-wise
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
    return;
  }
}

function maybeDissolve(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    for (const c of activeCaucusesForParty(state, partyId)) {
      const mps = factionAssemblyCaucus(world, state, c.factionId).length;
      const key = lowSupportStreakKey(c.factionId);
      const prev =
        typeof runtime.metadata[key] === "number" ? (runtime.metadata[key] as number) : 0;
      if (c.partyMemberSupport < DISSOLVE_SUPPORT && mps === 0) {
        runtime.metadata[key] = prev + 1;
      } else {
        runtime.metadata[key] = 0;
        continue;
      }
      if ((runtime.metadata[key] as number) < DISSOLVE_STREAK_MONTHS) continue;
      if (deterministicRoll(`${c.factionId}:dissolve:${month}`, month) > 0.55) continue;

      const actorId = c.leaderId ?? factionMembers(state, c.factionId)[0];
      if (!actorId) {
        c.ancestry.dissolved = state.currentDate;
        c.partyMemberSupport = 0;
        continue;
      }
      const result = dissolveCaucus(state, world, {
        actorId,
        factionId: c.factionId,
        commandId,
        reason: "low_party_member_support",
      });
      if (result.ok) {
        runtime.metadata[key] = 0;
        const last = state.history[state.history.length - 1];
        if (last) events.push(last);
        return;
      }
    }
  }
}

function maybeFormFromUnaligned(
  state: SimState,
  world: KernelWorld,
  month: string,
  commandId: string,
  events: SimEvent[],
): void {
  const runtime = ensureCaucusRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    if (deterministicRoll(`${partyId}:form:${month}`, month) > FORM_CHANCE) continue;
    const caucuses = activeCaucusesForParty(state, partyId);
    if (caucuses.length >= MAX_ACTIVE_CAUCUSES_SOFT) continue;

    const unalignedSupport = runtime.unalignedByParty[partyId]?.partyMemberSupport ?? 0;
    if (unalignedSupport < 0.12) continue;

    const unaligned = partyMembers(state, partyId).filter((id) => {
      const p = state.politicians[id]!;
      return (
        !p.factionId ||
        !runtime.caucuses[p.factionId] ||
        runtime.caucuses[p.factionId]!.ancestry.dissolved != null
      );
    });
    if (unaligned.length < 3) continue;

    const founders = unaligned.slice(0, Math.min(4, unaligned.length));
    const actorId = founders[0]!;
    const result = formCaucus(state, world, {
      actorId,
      partyId,
      politicianIds: founders,
      name: `Reform bloc ${month}`,
      commandId,
    });
    if (result.ok) {
      const last = state.history[state.history.length - 1];
      if (last) events.push(last);
      return;
    }
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
  applyShareDrift(world, state, month);
  maybeFormAlliance(state, world, month, commandId, events);
  maybeMerge(state, world, month, commandId, events);
  maybeSplit(state, world, month, commandId, events);
  maybeDissolve(state, world, month, commandId, events);
  maybeFormFromUnaligned(state, world, month, commandId, events);
  recomputeCaucusShares(world, state);

  runtime.lastCaucusMonth = month;
  return events;
}
