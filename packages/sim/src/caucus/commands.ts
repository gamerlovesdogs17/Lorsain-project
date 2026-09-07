/**
 * caucus/commands.ts
 *
 * Shared NPC/player command handlers for Caucuses 2.0.
 * Auth: actor must be the caucus leader (faction chair) or deputy.
 */

import { IDEOLOGY_AXES } from "../agents/types.js";
import { changeFaction } from "../parties/membership.js";
import { factionMembers } from "../parties/queries.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensureCaucusRuntime } from "./state.js";
import { recomputeCaucusShares } from "./shares.js";
import type { CaucusRelationKind, CaucusStanceTowardChair } from "./types.js";

type OkResult = { ok: true };
type ErrResult = { ok: false; error: { code: string; message: string } };
type CommandOutcome = OkResult | ErrResult;

function ok(): OkResult {
  return { ok: true };
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
  const edge = { kind: args.kind, since: state.currentDate };
  row.alliances[args.otherFactionId] = edge;
  // Reciprocal for alliances; rivalries may be one-sided initially but we mirror lightly.
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
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
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
    // Also allow the receiving caucus leader to propose absorption of a weak peer
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

  absorb.ancestry.dissolved = state.currentDate;
  absorb.ancestry.successor = args.intoFactionId;
  absorb.ancestry.mergedWith = args.intoFactionId;
  absorb.leaderId = null;
  absorb.deputyId = null;
  absorb.alliances = {};
  absorb.membershipShare = 0;
  absorb.assemblyShare = 0;
  absorb.institutionalInfluence = 0;

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
