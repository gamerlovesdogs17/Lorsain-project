/**
 * partyOrg/committee.ts
 *
 * National Committee membership seeding and major-action committee votes.
 * Replaces the always-yes stub approval used in commands.ts.
 */

import { IDEOLOGY_AXES } from "../agents/types.js";
import { getAgentProfile } from "../agents/profile.js";
import type { JsonObject } from "../json.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimState } from "../types.js";
import type { CaucusStanceTowardChair } from "../caucus/types.js";
import { getPartyRules } from "./rules.js";
import { ensurePartyOrgRuntime } from "./state.js";

const MIN_COMMITTEE = 12;
const MAX_COMMITTEE = 24;

function shortHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function targetCommitteeSize(partyId: string): number {
  return MIN_COMMITTEE + (shortHash(`nc-size:${partyId}`) % (MAX_COMMITTEE - MIN_COMMITTEE + 1));
}

function isActivePartyMember(state: SimState, partyId: string, id: string): boolean {
  const pol = state.politicians[id];
  return Boolean(pol && pol.partyId === partyId && pol.alive && !pol.retired);
}

/** Earliest active/suspended assembly term start — proxy for MP seniority. */
function assemblySeniorityDate(world: KernelWorld, state: SimState, politicianId: string): string {
  let earliest: string | null = null;
  for (const term of Object.values(state.officeTerms)) {
    if (term.holderId !== politicianId) continue;
    if (term.status !== "active" && term.status !== "suspended") continue;
    const office = world.offices[term.officeId];
    if (office?.kind !== "assembly_member") continue;
    if (!term.startDate) continue;
    if (!earliest || term.startDate < earliest) earliest = term.startDate;
  }
  return earliest ?? "9999-12-31";
}

function ideologyFit(
  world: KernelWorld,
  state: SimState,
  memberId: string,
  chairId: string | null,
): number {
  if (!chairId) return 0.5;
  const a = getAgentProfile(world, state, memberId)?.ideology;
  const b = getAgentProfile(world, state, chairId)?.ideology;
  if (!a || !b) return 0.5;
  let sum = 0;
  for (const axis of IDEOLOGY_AXES) {
    sum += 1 - Math.min(1, Math.abs((a[axis] ?? 0) - (b[axis] ?? 0)) / 2);
  }
  return sum / IDEOLOGY_AXES.length;
}

function stanceBias(stance: CaucusStanceTowardChair | null): number {
  switch (stance) {
    case "loyal":
      return 0.35;
    case "cooperative":
      return 0.2;
    case "conditional":
      return 0;
    case "critical":
      return -0.25;
    case "oppositional":
      return -0.4;
    default:
      return 0.1;
  }
}

function memberStanceTowardChair(
  state: SimState,
  memberId: string,
): CaucusStanceTowardChair | null {
  const factionId = state.politicians[memberId]?.factionId;
  if (!factionId) return null;
  return state.caucusRuntime?.caucuses[factionId]?.stanceTowardChair ?? null;
}

/**
 * Seeds `nationalCommittee[partyId]` with 12–24 politician IDs when empty or
 * undersized. Prefer officers, faction chairs, then top MPs by seniority/hash.
 * Never shrinks an already valid roster.
 */
export function seedNationalCommittee(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): string[] {
  const runtime = ensurePartyOrgRuntime(state);
  const existing = runtime.nationalCommittee[partyId] ?? [];
  const validExisting = existing.filter((id) => isActivePartyMember(state, partyId, id));
  const target = targetCommitteeSize(partyId);

  if (validExisting.length >= MIN_COMMITTEE && validExisting.length <= MAX_COMMITTEE) {
    runtime.nationalCommittee[partyId] = validExisting;
    return validExisting;
  }

  const officers = runtime.officers[partyId] ?? {};
  const seeds: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id) || !isActivePartyMember(state, partyId, id)) return;
    seen.add(id);
    seeds.push(id);
  };

  push(officers.chair?.politicianId);
  push(officers.vice_chair?.politicianId);
  push(officers.treasurer?.politicianId);

  const factionIds = (world.partyDefinitions[partyId]?.factionIds ?? []).slice().sort();
  for (const fid of factionIds) {
    push(state.factionStates[fid]?.chairId);
    push(state.caucusRuntime?.caucuses[fid]?.leaderId ?? null);
  }

  const partyMps = currentAssemblyMemberIds(world, state).filter((id) =>
    isActivePartyMember(state, partyId, id),
  );
  partyMps.sort(
    (a, b) =>
      assemblySeniorityDate(world, state, a).localeCompare(
        assemblySeniorityDate(world, state, b),
      ) ||
      shortHash(`nc-mp:${partyId}:${a}`) - shortHash(`nc-mp:${partyId}:${b}`) ||
      a.localeCompare(b),
  );
  for (const id of partyMps) push(id);

  if (seeds.length < target) {
    const pool = Object.entries(state.politicians)
      .filter(([, p]) => p.partyId === partyId && p.alive && !p.retired)
      .map(([id]) => id)
      .sort(
        (a, b) =>
          shortHash(`nc-fill:${partyId}:${a}`) - shortHash(`nc-fill:${partyId}:${b}`) ||
          a.localeCompare(b),
      );
    for (const id of pool) {
      if (seeds.length >= target) break;
      push(id);
    }
  }

  // Prefer keeping valid existing members, then fill to target (capped).
  const merged: string[] = [];
  const mergeSeen = new Set<string>();
  for (const id of [...validExisting, ...seeds]) {
    if (mergeSeen.has(id) || !isActivePartyMember(state, partyId, id)) continue;
    mergeSeen.add(id);
    merged.push(id);
    if (merged.length >= Math.max(target, MIN_COMMITTEE)) break;
  }

  const roster = merged.slice(0, Math.min(MAX_COMMITTEE, Math.max(MIN_COMMITTEE, target)));
  // If still short of MIN, take whatever we have (tiny parties).
  runtime.nationalCommittee[partyId] =
    roster.length >= MIN_COMMITTEE ? roster : merged.slice(0, MAX_COMMITTEE);
  return runtime.nationalCommittee[partyId]!;
}

/** Ensure every party with a partyState has a seeded national committee. */
export function ensureNationalCommittees(world: KernelWorld, state: SimState): void {
  for (const partyId of Object.keys(state.partyStates)) {
    seedNationalCommittee(world, state, partyId);
  }
}

export type CommitteeVoteResult = {
  passed: boolean;
  yes: number;
  no: number;
  abstain: number;
};

type CommitteeVoteChoice = "yes" | "no" | "abstain";

function memberVote(
  world: KernelWorld,
  state: SimState,
  args: {
    memberId: string;
    chairId: string | null;
    partyId: string;
    proposalKind: string;
    commandId: string;
  },
): CommitteeVoteChoice {
  const { memberId, chairId, partyId, proposalKind, commandId } = args;
  const stance = memberStanceTowardChair(state, memberId);

  // Player member: cooperative default unless caucus stance is critical/oppositional.
  if (memberId === state.playerPoliticianId) {
    if (stance === "critical" || stance === "oppositional") return "no";
    return "yes";
  }

  const affinity = chairId ? (state.relationships[memberId]?.[chairId]?.affinity ?? 0) : 0;
  const ideo = ideologyFit(world, state, memberId, chairId);
  const bias = stanceBias(stance);
  const noise =
    ((shortHash(`${commandId}:${partyId}:${proposalKind}:${memberId}:vote`) % 1001) - 500) / 2500;
  const score = affinity * 0.4 + (ideo - 0.5) * 0.7 + bias + noise;

  if (score > 0.08) return "yes";
  if (score < -0.08) return "no";
  return "abstain";
}

/**
 * Conduct a national-committee vote on a major party action.
 * When rules do not require approval, returns passed without voting.
 */
export function conductCommitteeVote(
  state: SimState,
  world: KernelWorld,
  args: {
    partyId: string;
    proposalKind: string;
    proposalPayload?: JsonObject;
    commandId: string;
  },
): CommitteeVoteResult {
  const rules = getPartyRules(state, world, args.partyId);
  if (!rules.nationalCommitteeApprovalRequired) {
    return { passed: true, yes: 0, no: 0, abstain: 0 };
  }

  const runtime = ensurePartyOrgRuntime(state);
  const members = seedNationalCommittee(world, state, args.partyId);
  const chairId = runtime.officers[args.partyId]?.chair?.politicianId ?? null;

  let yes = 0;
  let no = 0;
  let abstain = 0;
  const playerIsMember = members.includes(state.playerPoliticianId);

  for (const memberId of members) {
    const choice = memberVote(world, state, {
      memberId,
      chairId,
      partyId: args.partyId,
      proposalKind: args.proposalKind,
      commandId: args.commandId,
    });
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }

  const voting = yes + no;
  const passed = voting === 0 ? false : yes > no && yes > voting / 2;

  if (playerIsMember) {
    pushHistory(state, {
      date: state.currentDate,
      type: "PLAYER_COMMITTEE_VOTE",
      importance: 0.45,
      visibility: "system",
      actorIds: [state.playerPoliticianId],
      entityIds: [args.partyId],
      payload: {
        partyId: args.partyId,
        proposalKind: args.proposalKind,
        opportunity: true,
        autoResolved: true,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    });
  }

  pushHistory(state, {
    date: state.currentDate,
    type: "PARTY_COMMITTEE_VOTE",
    importance: 0.55,
    visibility: "public",
    actorIds: chairId ? [chairId] : [],
    entityIds: [args.partyId],
    payload: {
      partyId: args.partyId,
      proposalKind: args.proposalKind,
      proposalPayload: args.proposalPayload ?? {},
      yes,
      no,
      abstain,
      passed,
      memberCount: members.length,
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return { passed, yes, no, abstain };
}

/** Helper for command handlers: run vote and return COMMITTEE_REJECTED error if failed. */
export function requireCommitteeApproval(
  state: SimState,
  world: KernelWorld,
  args: {
    partyId: string;
    proposalKind: string;
    proposalPayload?: JsonObject;
    commandId: string;
  },
):
  | { ok: true; vote: CommitteeVoteResult }
  | { ok: false; error: { code: string; message: string } } {
  const vote = conductCommitteeVote(state, world, args);
  const rules = getPartyRules(state, world, args.partyId);
  if (!rules.nationalCommitteeApprovalRequired) return { ok: true, vote };
  if (!vote.passed) {
    return {
      ok: false,
      error: {
        code: "COMMITTEE_REJECTED",
        message: `National Committee rejected ${args.proposalKind} (${vote.yes} yes / ${vote.no} no).`,
      },
    };
  }
  return { ok: true, vote };
}
