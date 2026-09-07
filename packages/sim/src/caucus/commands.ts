/**
 * caucus/commands.ts
 *
 * Shared NPC/player command handlers for Caucuses 2.0.
 * Auth: actor must be the caucus leader (faction chair) or deputy.
 */

import { IDEOLOGY_AXES } from "../agents/types.js";
import { changeFaction } from "../parties/membership.js";
import { factionMembers, partyMembers } from "../parties/queries.js";
import { padId, pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensureCaucusRuntime } from "./state.js";
import {
  activeCaucusesForParty,
  countActiveCaucuses,
  rebalancePartyMemberSupport,
  recomputeCaucusShares,
} from "./shares.js";
import {
  emptyCaucusFactionRuntime,
  type CaucusGrowthStrategy,
  type CaucusRelationKind,
  type CaucusStanceTowardChair,
  CAUCUS_GROWTH_STRATEGIES,
} from "./types.js";

type OkResult = { ok: true; factionId?: string };
type ErrResult = { ok: false; error: { code: string; message: string } };
type CommandOutcome = OkResult | ErrResult;

const FORM_MIN_UNALIGNED_POLS = 3;
const FORM_MIN_UNALIGNED_SUPPORT = 0.08;
const MAX_ACTIVE_CAUCUSES = 8;

function ok(extra?: { factionId: string }): OkResult {
  return extra ? { ok: true, factionId: extra.factionId } : { ok: true };
}
function err(code: string, message: string): ErrResult {
  return { ok: false, error: { code, message } };
}

function requireCaucusLeader(
  state: SimState,
  factionId: string,
  actorId: string,
): ErrResult | null {
  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[factionId];
  if (!row || row.ancestry.dissolved) {
    return err("CAUCUS_NOT_FOUND", `No active caucus for faction ${factionId}.`);
  }
  const facChair = state.factionStates[factionId]?.chairId ?? null;
  const leaderId = row.leaderId ?? facChair;
  if (leaderId === actorId) return null;
  if (row.deputyId === actorId) return null;
  return err(
    "NOT_CAUCUS_LEADER",
    `Politician ${actorId} is not caucus leader/deputy for ${factionId}.`,
  );
}

function activeSameParty(state: SimState, a: string, b: string): boolean {
  const runtime = ensureCaucusRuntime(state);
  const ca = runtime.caucuses[a];
  const cb = runtime.caucuses[b];
  if (!ca || !cb || ca.ancestry.dissolved || cb.ancestry.dissolved) return false;
  return ca.partyId === cb.partyId;
}

function nextDynamicFactionId(state: SimState): string {
  const runtime = ensureCaucusRuntime(state);
  const raw = runtime.metadata.nextDynamicFactionId;
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
  runtime.metadata.nextDynamicFactionId = n + 1;
  return padId("DFACTION", n);
}

/**
 * Register a runtime faction + caucus via state.dynamicFactions + factionStates
 * (world.factionDefinitions is frozen after createSimulation).
 */
export function registerDynamicCaucusFaction(
  world: KernelWorld,
  state: SimState,
  args: {
    partyId: string;
    name: string;
    share?: number;
    chairId?: string | null;
    splitFrom?: string | null;
  },
): string {
  const factionId = nextDynamicFactionId(state);
  const share = args.share ?? 0.05;
  if (!state.dynamicFactions) state.dynamicFactions = {};
  state.dynamicFactions[factionId] = {
    factionId,
    partyId: args.partyId,
    name: args.name,
    share,
  };
  // Best-effort mirror onto world when still mutable (tests with unfrozen worlds).
  try {
    if (Object.isExtensible(world.factionDefinitions)) {
      world.factionDefinitions[factionId] = state.dynamicFactions[factionId]!;
      const partyDef = world.partyDefinitions[args.partyId];
      if (partyDef && Object.isExtensible(partyDef) && !partyDef.factionIds.includes(factionId)) {
        partyDef.factionIds = [...partyDef.factionIds, factionId].sort();
        if (Object.isExtensible(partyDef.canonicalFactionShares)) {
          partyDef.canonicalFactionShares = {
            ...partyDef.canonicalFactionShares,
            [factionId]: share,
          };
        }
      }
    }
  } catch {
    // Frozen world — state.dynamicFactions is authoritative.
  }

  state.factionStates[factionId] = {
    factionId,
    partyId: args.partyId,
    chairId: args.chairId ?? null,
    status: args.chairId ? "active" : "chair_vacant",
    cohesion: 0.55,
  };

  const runtime = ensureCaucusRuntime(state);
  const row = emptyCaucusFactionRuntime(factionId, args.partyId);
  row.leaderId = args.chairId ?? null;
  row.ancestry.founded = state.currentDate;
  row.ancestry.splitFrom = args.splitFrom ?? null;
  row.history.push({
    date: state.currentDate,
    kind: args.splitFrom ? "split_formed" : "formed",
    detail: args.splitFrom ? `Split from ${args.splitFrom}` : `Formed in party ${args.partyId}`,
  });
  runtime.caucuses[factionId] = row;
  return factionId;
}

function pushCaucusHistory(state: SimState, factionId: string, kind: string, detail: string): void {
  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[factionId];
  if (!row) return;
  row.history.push({ date: state.currentDate, kind, detail });
  if (row.history.length > 80) row.history = row.history.slice(-80);
}

/** Ideology + share + alliance compatibility in [0,1]. Hard veto below ~0.4. */
export function scoreCaucusMergeCompatibility(
  world: KernelWorld,
  state: SimState,
  absorbId: string,
  intoId: string,
): number {
  if (absorbId === intoId) return 0;
  if (!activeSameParty(state, absorbId, intoId)) return 0;

  const runtime = ensureCaucusRuntime(state);
  const absorb = runtime.caucuses[absorbId]!;
  const into = runtime.caucuses[intoId]!;

  const ia = world.factionPublicIdeology[absorbId];
  const ib = world.factionPublicIdeology[intoId];
  let ideo = 0.45;
  if (ia && ib) {
    let sum = 0;
    for (const axis of IDEOLOGY_AXES) {
      sum += 1 - Math.min(1, Math.abs((ia[axis] ?? 0) - (ib[axis] ?? 0)));
    }
    ideo = sum / IDEOLOGY_AXES.length;
  }

  const allianceBonus =
    absorb.alliances[intoId]?.kind === "alliance" || into.alliances[absorbId]?.kind === "alliance"
      ? 0.18
      : absorb.alliances[intoId]?.kind === "rivalry" || into.alliances[absorbId]?.kind === "rivalry"
        ? -0.25
        : 0;

  const sizeWeakness = Math.max(0, Math.min(1, (0.22 - absorb.membershipShare) / 0.22));
  const score = Math.max(
    0,
    Math.min(1, ideo * 0.55 + allianceBonus + sizeWeakness * 0.2 + into.membershipShare * 0.1),
  );
  if (ideo < 0.4) return ideo * 0.25;
  return score;
}

export function setCaucusPriorities(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    priorities: string[];
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  row.priorities = args.priorities.slice(0, 10);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_PRIORITIES_SET",
    importance: 0.4,
    visibility: "public",
    actorIds: [args.actorId],
    entityIds: [args.factionId, row.partyId],
    payload: { factionId: args.factionId, priorities: row.priorities },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

export function setCaucusGrowthStrategy(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    growthStrategy: CaucusGrowthStrategy;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;
  if (!(CAUCUS_GROWTH_STRATEGIES as readonly string[]).includes(args.growthStrategy)) {
    return err("INVALID_STRATEGY", `Unknown growth strategy ${args.growthStrategy}.`);
  }

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  row.growthStrategy = args.growthStrategy;
  pushCaucusHistory(state, args.factionId, "growth_strategy", args.growthStrategy);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_GROWTH_STRATEGY_SET",
    importance: 0.35,
    visibility: "system",
    actorIds: [args.actorId],
    entityIds: [args.factionId, row.partyId],
    payload: { factionId: args.factionId, growthStrategy: args.growthStrategy },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });
  return ok();
}

export function endorseChairCandidate(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    candidateId: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  const cand = state.politicians[args.candidateId];
  if (!cand?.alive || cand.retired || cand.partyId !== row.partyId) {
    return err("INVALID_CANDIDATE", `Candidate ${args.candidateId} is not an active party member.`);
  }

  row.endorsedChairCandidateId = args.candidateId;
  row.endorsementMomentum = Math.min(1, row.endorsementMomentum + 0.04);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_CHAIR_ENDORSED",
    importance: 0.55,
    visibility: "public",
    actorIds: [args.actorId, args.candidateId],
    entityIds: [args.factionId, row.partyId],
    payload: {
      factionId: args.factionId,
      candidateId: args.candidateId,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

export function endorsePrimaryCandidate(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    candidateId: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  const cand = state.politicians[args.candidateId];
  if (!cand?.alive || cand.retired || cand.partyId !== row.partyId) {
    return err("INVALID_CANDIDATE", `Candidate ${args.candidateId} is not an active party member.`);
  }

  row.endorsedPrimaryCandidateId = args.candidateId;
  row.endorsementMomentum = Math.min(1, row.endorsementMomentum + 0.03);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_PRIMARY_ENDORSED",
    importance: 0.5,
    visibility: "public",
    actorIds: [args.actorId, args.candidateId],
    entityIds: [args.factionId, row.partyId],
    payload: {
      factionId: args.factionId,
      candidateId: args.candidateId,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

export function formCaucusAlliance(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    otherFactionId: string;
    kind: CaucusRelationKind;
    commandId: string;
    goal?: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  if (args.factionId === args.otherFactionId) {
    return err("SAME_CAUCUS", "A caucus cannot form an alliance with itself.");
  }
  if (!activeSameParty(state, args.factionId, args.otherFactionId)) {
    return err("CROSS_PARTY", "Caucus alliances must be within the same party.");
  }

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  const other = runtime.caucuses[args.otherFactionId]!;
  const edge = {
    kind: args.kind,
    since: state.currentDate,
    ...(args.goal ? { goal: args.goal.slice(0, 80) } : {}),
  };
  row.alliances[args.otherFactionId] = edge;
  if (args.kind === "alliance" || !other.alliances[args.factionId]) {
    other.alliances[args.factionId] = { ...edge };
  }

  pushHistory(state, {
    date: state.currentDate,
    type: args.kind === "alliance" ? "CAUCUS_ALLIANCE_FORMED" : "CAUCUS_RIVALRY_DECLARED",
    importance: 0.5,
    visibility: "public",
    actorIds: [args.actorId],
    entityIds: [args.factionId, args.otherFactionId, row.partyId],
    payload: {
      factionId: args.factionId,
      otherFactionId: args.otherFactionId,
      kind: args.kind,
      ...(args.goal ? { goal: args.goal } : {}),
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

/**
 * Form a new caucus from unaligned party politicians when viability thresholds hold.
 */
export function formCaucus(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    politicianIds: string[];
    name?: string;
    commandId: string;
  },
): CommandOutcome {
  const actor = state.politicians[args.actorId];
  if (!actor?.alive || actor.retired || actor.partyId !== args.partyId) {
    return err(
      "INVALID_ACTOR",
      `Actor ${args.actorId} is not an active member of ${args.partyId}.`,
    );
  }
  if (countActiveCaucuses(state, args.partyId) >= MAX_ACTIVE_CAUCUSES) {
    return err(
      "TOO_MANY_CAUCUSES",
      `Party ${args.partyId} already has the maximum active caucuses.`,
    );
  }

  const runtime = ensureCaucusRuntime(state);
  const unalignedSupport = runtime.unalignedByParty[args.partyId]?.partyMemberSupport ?? 0;
  const unalignedPols = partyMembers(state, args.partyId).filter((id) => {
    const p = state.politicians[id]!;
    return (
      !p.factionId ||
      !runtime.caucuses[p.factionId] ||
      runtime.caucuses[p.factionId]!.ancestry.dissolved != null
    );
  });
  if (unalignedPols.length < FORM_MIN_UNALIGNED_POLS) {
    return err(
      "INSUFFICIENT_UNALIGNED",
      `Need at least ${FORM_MIN_UNALIGNED_POLS} unaligned politicians to form a caucus.`,
    );
  }
  if (unalignedSupport < FORM_MIN_UNALIGNED_SUPPORT && unalignedPols.length < 6) {
    return err(
      "VIABILITY_THRESHOLD",
      `Unaligned party-member support ${unalignedSupport.toFixed(2)} is below viability.`,
    );
  }

  const founders = [...new Set(args.politicianIds)].filter((id) => unalignedPols.includes(id));
  if (founders.length < 2) {
    return err("INSUFFICIENT_FOUNDERS", "At least two unaligned founders are required.");
  }
  if (!founders.includes(args.actorId)) founders.unshift(args.actorId);

  const factionId = registerDynamicCaucusFaction(world, state, {
    partyId: args.partyId,
    name: args.name?.trim() || `Caucus ${founders[0]}`,
    chairId: args.actorId,
  });

  for (const id of founders) {
    changeFaction(state, world, id, factionId, args.commandId);
  }

  const row = runtime.caucuses[factionId]!;
  const take = Math.min(0.25, Math.max(0.05, unalignedSupport * 0.4));
  row.partyMemberSupport = take;
  const u = runtime.unalignedByParty[args.partyId];
  if (u) u.partyMemberSupport = Math.max(0, u.partyMemberSupport - take);
  rebalancePartyMemberSupport(state, args.partyId);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_FORMED",
    importance: 0.65,
    visibility: "public",
    actorIds: [args.actorId, ...founders.slice(0, 4)],
    entityIds: [factionId, args.partyId],
    payload: { factionId, partyId: args.partyId, founders },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  recomputeCaucusShares(world, state);
  return ok({ factionId });
}

/** Dissolve an active caucus; members become unaligned. */
export function dissolveCaucus(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    commandId: string;
    reason?: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  const members = factionMembers(state, args.factionId);
  for (const id of members) {
    changeFaction(state, world, id, null, args.commandId);
  }

  const support = row.partyMemberSupport;
  row.ancestry.dissolved = state.currentDate;
  row.leaderId = null;
  row.deputyId = null;
  row.alliances = {};
  row.membershipShare = 0;
  row.assemblyShare = 0;
  row.institutionalInfluence = 0;
  row.partyMemberSupport = 0;
  pushCaucusHistory(state, args.factionId, "dissolved", args.reason ?? "dissolved by leadership");

  const fac = state.factionStates[args.factionId];
  if (fac) {
    fac.chairId = null;
    fac.status = "split_origin";
  }

  const u = runtime.unalignedByParty[row.partyId];
  if (u) u.partyMemberSupport = Math.min(1, (u.partyMemberSupport ?? 0) + support);
  rebalancePartyMemberSupport(state, row.partyId);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_DISSOLVED",
    importance: 0.6,
    visibility: "public",
    actorIds: [args.actorId],
    entityIds: [args.factionId, row.partyId],
    payload: {
      factionId: args.factionId,
      reason: args.reason ?? null,
      membersReleased: members.length,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  recomputeCaucusShares(world, state);
  return ok();
}

/**
 * Split an oversized caucus into a new dynamic faction/caucus when possible.
 */
export function splitCaucus(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    politicianIds: string[];
    name?: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const origin = runtime.caucuses[args.factionId]!;
  if (countActiveCaucuses(state, origin.partyId) >= MAX_ACTIVE_CAUCUSES) {
    return err("TOO_MANY_CAUCUSES", "Cannot split: party already at caucus cap.");
  }

  const members = factionMembers(state, args.factionId);
  const movers = [...new Set(args.politicianIds)].filter((id) => members.includes(id));
  if (movers.length < 2) {
    return err("INSUFFICIENT_MOVERS", "Split requires at least two members to leave.");
  }
  if (members.length - movers.length < 2) {
    return err("ORIGIN_TOO_SMALL", "Origin caucus would be left below viability.");
  }

  // Prefer reviving a dissolved sibling before minting a new faction id.
  let newFactionId: string | null = null;
  let revived = false;
  for (const [fid, row] of Object.entries(runtime.caucuses)) {
    if (row.partyId !== origin.partyId || !row.ancestry.dissolved) continue;
    if (row.ancestry.successor === args.factionId || origin.ancestry.mergedWith === fid) {
      newFactionId = fid;
      revived = true;
      row.ancestry.dissolved = null;
      row.ancestry.splitFrom = args.factionId;
      row.ancestry.successor = null;
      const fac = state.factionStates[fid];
      if (fac) fac.status = "chair_vacant";
      break;
    }
  }

  if (!newFactionId) {
    newFactionId = registerDynamicCaucusFaction(world, state, {
      partyId: origin.partyId,
      name: args.name?.trim() || `Split from ${args.factionId}`,
      chairId: movers[0] ?? null,
      splitFrom: args.factionId,
    });
  }

  for (const id of movers) {
    changeFaction(state, world, id, newFactionId, args.commandId);
  }

  const created = runtime.caucuses[newFactionId]!;
  created.leaderId = movers[0] ?? null;
  const fac = state.factionStates[newFactionId];
  if (fac && created.leaderId) {
    fac.chairId = created.leaderId;
    fac.status = "active";
  }

  const take = Math.min(origin.partyMemberSupport * 0.35, 0.25);
  created.partyMemberSupport = take;
  origin.partyMemberSupport = Math.max(0, origin.partyMemberSupport - take);
  pushCaucusHistory(state, args.factionId, "split", `Split → ${newFactionId}`);
  pushCaucusHistory(state, newFactionId, "split_formed", `From ${args.factionId}`);
  rebalancePartyMemberSupport(state, origin.partyId);

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_SPLIT",
    importance: 0.65,
    visibility: "public",
    actorIds: [args.actorId, ...movers.slice(0, 3)],
    entityIds: [args.factionId, newFactionId, origin.partyId],
    payload: {
      originFactionId: args.factionId,
      newFactionId,
      membersMoved: movers.length,
      revived,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  recomputeCaucusShares(world, state);
  return ok({ factionId: newFactionId });
}

/**
 * Propose / execute a caucus merger (absorb → into) after a compatibility check.
 * Moves living members, dissolves the absorb caucus, records ancestry.
 */
export function proposeCaucusMerger(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    absorbFactionId: string;
    intoFactionId: string;
    commandId: string;
    /** Minimum compatibility required (default 0.55). */
    minCompatibility?: number;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.absorbFactionId, args.actorId);
  if (authErr) {
    const alt = requireCaucusLeader(state, args.intoFactionId, args.actorId);
    if (alt) return authErr;
  }

  if (!activeSameParty(state, args.absorbFactionId, args.intoFactionId)) {
    return err("INVALID_MERGE", "Both caucuses must be active in the same party.");
  }

  const score = scoreCaucusMergeCompatibility(
    world,
    state,
    args.absorbFactionId,
    args.intoFactionId,
  );
  const min = args.minCompatibility ?? 0.55;
  if (score < min) {
    return err(
      "INCOMPATIBLE_MERGE",
      `Caucus merge compatibility ${score.toFixed(2)} is below threshold ${min.toFixed(2)}.`,
    );
  }

  const runtime = ensureCaucusRuntime(state);
  const absorb = runtime.caucuses[args.absorbFactionId]!;
  const into = runtime.caucuses[args.intoFactionId]!;
  const movers = factionMembers(state, args.absorbFactionId);
  const events: SimEvent[] = [];

  for (const politicianId of movers) {
    const result = changeFaction(state, world, politicianId, args.intoFactionId, args.commandId);
    if ("error" in result) continue;
    events.push(...result.events);
  }

  into.partyMemberSupport = Math.min(1, into.partyMemberSupport + absorb.partyMemberSupport * 0.85);
  absorb.ancestry.dissolved = state.currentDate;
  absorb.ancestry.successor = args.intoFactionId;
  absorb.ancestry.mergedWith = args.intoFactionId;
  absorb.leaderId = null;
  absorb.deputyId = null;
  absorb.alliances = {};
  absorb.membershipShare = 0;
  absorb.assemblyShare = 0;
  absorb.institutionalInfluence = 0;
  absorb.partyMemberSupport = 0;
  pushCaucusHistory(state, args.absorbFactionId, "merged", `Into ${args.intoFactionId}`);
  pushCaucusHistory(state, args.intoFactionId, "absorbed", `Absorbed ${args.absorbFactionId}`);

  into.ancestry.mergedWith = args.absorbFactionId;
  delete into.alliances[args.absorbFactionId];

  const facState = state.factionStates[args.absorbFactionId];
  if (facState) {
    facState.chairId = null;
    facState.status = "split_origin";
  }

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_MERGED",
    importance: 0.7,
    visibility: "public",
    actorIds: [args.actorId],
    entityIds: [args.absorbFactionId, args.intoFactionId, absorb.partyId],
    payload: {
      absorbFactionId: args.absorbFactionId,
      intoFactionId: args.intoFactionId,
      compatibility: score,
      membersMoved: movers.length,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  rebalancePartyMemberSupport(state, absorb.partyId);
  recomputeCaucusShares(world, state);
  return ok();
}

/**
 * Light recruit: move one politician into the caucus (same party only).
 */
export function recruitToCaucus(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    politicianId: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  const pol = state.politicians[args.politicianId];
  if (!pol?.alive || pol.retired) {
    return err("INVALID_RECRUIT", `Politician ${args.politicianId} is not active.`);
  }
  if (pol.partyId !== row.partyId) {
    return err("CROSS_PARTY", "Recruits must already belong to the same party.");
  }
  if (pol.factionId === args.factionId) {
    return ok();
  }

  const result = changeFaction(state, world, args.politicianId, args.factionId, args.commandId);
  if ("error" in result) {
    return err(result.error.code, result.error.message);
  }

  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_RECRUIT",
    importance: 0.35,
    visibility: "public",
    actorIds: [args.actorId, args.politicianId],
    entityIds: [args.factionId, row.partyId],
    payload: {
      factionId: args.factionId,
      politicianId: args.politicianId,
      previousFactionId: result.previousFactionId,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  recomputeCaucusShares(world, state);
  return ok();
}

export function setCaucusStanceTowardChair(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    factionId: string;
    stance: CaucusStanceTowardChair;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireCaucusLeader(state, args.factionId, args.actorId);
  if (authErr) return authErr;
  const runtime = ensureCaucusRuntime(state);
  const row = runtime.caucuses[args.factionId]!;
  row.stanceTowardChair = args.stance;
  pushHistory(state, {
    date: state.currentDate,
    type: "CAUCUS_STANCE_SET",
    importance: 0.35,
    visibility: "system",
    actorIds: [args.actorId],
    entityIds: [args.factionId],
    payload: { factionId: args.factionId, stance: args.stance },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });
  return ok();
}

/** Re-export helpers used by monthly / tests. */
export { activeCaucusesForParty, countActiveCaucuses };
