/**
 * partyOrg/elections.ts
 *
 * National chair election lifecycle:
 *   openPartyChairElection   – opens a vacancy election
 *   declareChairCandidacy    – a politician declares candidacy
 *   resolveChairElection     – tallies under the party's voting system
 *
 * Electorate construction:
 *   committee           → seedNationalCommittee / runtime.nationalCommittee roster
 *   membership          → lightweight blocs: elector politician IDs, but each vote
 *                         is weighted by caucus membershipShare (party-member
 *                         support). Weight = membershipShare / (# electors in that
 *                         faction); unaligned electors share unalignedByParty.
 *                         Falls back to equal weight 1 when caucus shares are absent.
 *   convention_delegates → bounded: MPs + national committee + faction chairs (unique)
 *
 * Voting systems (PartyRules.votingSystem / election.votingSystem):
 *   plurality       – highest weighted affinity total
 *   runoff / multiple_ballot – if no majority, top-2 runoff (2 rounds max)
 *   ranked_choice   – IRV-lite: eliminate lowest until majority via affinity ranks
 */

import { getAgentProfile } from "../agents/profile.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { setPartyLeader } from "../parties/leadership.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { CAMPAIGN_STRATEGY_IDS, getCampaignStrategy, listPartyPriorities } from "./catalog.js";
import { seedNationalCommittee } from "./committee.js";
import { getPartyRules } from "./rules.js";
import { ensurePartyOrgRuntime } from "./state.js";
import type {
  ChairCandidateProgram,
  ChairElection,
  LeadershipElectionMethod,
  VotingSystem,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function activePartyPoliticianIds(state: SimState, partyId: string): string[] {
  return Object.entries(state.politicians)
    .filter(([, p]) => p.partyId === partyId && p.alive && !p.retired)
    .map(([id]) => id);
}

/**
 * Build the electorate for a chair election method.
 *
 * Membership: still returns politician IDs (virtual ballots). Vote weights are
 * applied separately via `electorWeight` using caucus membershipShare as
 * party-member support.
 */
export function buildElectorIds(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  method: LeadershipElectionMethod,
): string[] {
  const runtime = ensurePartyOrgRuntime(state);
  const activeInParty = activePartyPoliticianIds(state, partyId);

  if (method === "committee") {
    const roster = seedNationalCommittee(world, state, partyId);
    const fromRuntime = runtime.nationalCommittee[partyId] ?? roster;
    const valid = fromRuntime.filter((id) => {
      const pol = state.politicians[id];
      return Boolean(pol && pol.partyId === partyId && pol.alive && !pol.retired);
    });
    return valid.length > 0 ? valid : activeInParty.slice(0, 5);
  }

  if (method === "convention_delegates") {
    const mps = currentAssemblyMemberIds(world, state).filter((id) => {
      const pol = state.politicians[id];
      return Boolean(pol && pol.partyId === partyId && pol.alive && !pol.retired);
    });
    const committee = seedNationalCommittee(world, state, partyId);
    const factionChairs: string[] = [];
    for (const fid of world.partyDefinitions[partyId]?.factionIds ?? []) {
      const chairId = state.factionStates[fid]?.chairId;
      if (chairId) factionChairs.push(chairId);
      const caucusLeader = state.caucusRuntime?.caucuses[fid]?.leaderId;
      if (caucusLeader) factionChairs.push(caucusLeader);
    }
    const bounded = uniqueIds([...mps, ...committee, ...factionChairs]).filter((id) => {
      const pol = state.politicians[id];
      return Boolean(pol && pol.partyId === partyId && pol.alive && !pol.retired);
    });
    // Soft cap keeps conventions tractable in large parties.
    if (bounded.length > 80) return bounded.slice(0, 80);
    return bounded.length > 0 ? bounded : activeInParty.slice(0, 20);
  }

  // membership: all active party politicians as elector proxies
  return activeInParty;
}

/**
 * Bloc weight for a membership ballot elector.
 *
 * Uses caucus `membershipShare` (party-member support) when available:
 * each elector in a faction receives `membershipShare / count(electors in faction)`.
 * Unaligned electors share `unalignedByParty[partyId].membershipShare`.
 * Without caucus data, weight is 1 (equal one-person-one-vote).
 */
function electorWeight(
  state: SimState,
  partyId: string,
  electorId: string,
  electors: string[],
  method: LeadershipElectionMethod,
): number {
  if (method !== "membership") return 1;

  const caucusRuntime = state.caucusRuntime;
  if (!caucusRuntime) return 1;

  const factionId = state.politicians[electorId]?.factionId ?? null;
  if (factionId && caucusRuntime.caucuses[factionId]) {
    const share = caucusRuntime.caucuses[factionId]!.membershipShare;
    const sameFaction = electors.filter((id) => state.politicians[id]?.factionId === factionId);
    const n = Math.max(1, sameFaction.length);
    return share / n;
  }

  const unalignedShare = caucusRuntime.unalignedByParty[partyId]?.membershipShare ?? 0;
  const unalignedElectors = electors.filter((id) => !state.politicians[id]?.factionId);
  const n = Math.max(1, unalignedElectors.length);
  return unalignedShare / n;
}

/** Simple affinity lookup, boosted when the elector's caucus endorsed the candidate. */
function affinityFor(state: SimState, electorId: string, candidateId: string): number {
  let aff = state.relationships[electorId]?.[candidateId]?.affinity ?? 0;
  const factionId = state.politicians[electorId]?.factionId;
  if (factionId) {
    const endorsed = state.caucusRuntime?.caucuses[factionId]?.endorsedChairCandidateId;
    if (endorsed === candidateId) aff += 0.35;
  }
  return aff;
}

/** Rank candidates for an elector by descending affinity (ties: lexicographic id). */
function rankCandidates(state: SimState, electorId: string, candidates: string[]): string[] {
  return candidates.slice().sort((a, b) => {
    const affA = affinityFor(state, electorId, a);
    const affB = affinityFor(state, electorId, b);
    if (affA !== affB) return affB - affA;
    return a.localeCompare(b);
  });
}

function pickTopAffinity(state: SimState, electorId: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string = candidates[0]!;
  let bestAffinity = affinityFor(state, electorId, best);
  for (let i = 1; i < candidates.length; i++) {
    const cid = candidates[i]!;
    const aff = affinityFor(state, electorId, cid);
    if (aff > bestAffinity || (aff === bestAffinity && cid < best)) {
      bestAffinity = aff;
      best = cid;
    }
  }
  return best;
}

function tallyFirstPreferences(
  state: SimState,
  electors: string[],
  weights: Record<string, number>,
  candidates: string[],
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const cid of candidates) tally[cid] = 0;
  for (const electorId of electors) {
    const best = pickTopAffinity(state, electorId, candidates);
    if (!best) continue;
    tally[best] = (tally[best] ?? 0) + (weights[electorId] ?? 1);
  }
  return tally;
}

function totalVotes(tally: Record<string, number>): number {
  return Object.values(tally).reduce((s, v) => s + v, 0);
}

function pluralityWinner(candidates: string[], tally: Record<string, number>): string {
  let winnerId = candidates[0]!;
  for (const cid of candidates) {
    const votes = tally[cid] ?? 0;
    const bestVotes = tally[winnerId] ?? 0;
    if (votes > bestVotes || (votes === bestVotes && cid < winnerId)) {
      winnerId = cid;
    }
  }
  return winnerId;
}

function hasMajority(tally: Record<string, number>, candidateId: string): boolean {
  const total = totalVotes(tally);
  if (total <= 0) return true;
  return (tally[candidateId] ?? 0) > total / 2;
}

/** Top-two runoff / multiple-ballot (capped at 2 rounds). */
function resolveRunoff(
  state: SimState,
  electors: string[],
  weights: Record<string, number>,
  candidates: string[],
): { winnerId: string; tally: Record<string, number> } {
  const first = tallyFirstPreferences(state, electors, weights, candidates);
  const firstWinner = pluralityWinner(candidates, first);
  if (candidates.length <= 2 || hasMajority(first, firstWinner)) {
    return { winnerId: firstWinner, tally: first };
  }

  // Select top 2 (ties broken by id)
  const ordered = candidates.slice().sort((a, b) => {
    const va = first[a] ?? 0;
    const vb = first[b] ?? 0;
    if (va !== vb) return vb - va;
    return a.localeCompare(b);
  });
  const top2 = ordered.slice(0, 2);
  const second = tallyFirstPreferences(state, electors, weights, top2);
  return { winnerId: pluralityWinner(top2, second), tally: second };
}

/**
 * IRV-lite: repeatedly eliminate the lowest first-preference candidate until
 * someone has a majority of remaining active ballots, using affinity rankings.
 */
function resolveRankedChoice(
  state: SimState,
  electors: string[],
  weights: Record<string, number>,
  candidates: string[],
): { winnerId: string; tally: Record<string, number> } {
  let remaining = candidates.slice();
  let lastTally: Record<string, number> = {};

  while (remaining.length > 1) {
    const tally: Record<string, number> = {};
    for (const cid of remaining) tally[cid] = 0;

    for (const electorId of electors) {
      const ranking = rankCandidates(state, electorId, remaining);
      const top = ranking[0];
      if (!top) continue;
      tally[top] = (tally[top] ?? 0) + (weights[electorId] ?? 1);
    }
    lastTally = tally;

    const leader = pluralityWinner(remaining, tally);
    if (hasMajority(tally, leader)) {
      return { winnerId: leader, tally };
    }

    // Eliminate lowest (ties: higher id eliminated — deterministic)
    let loser = remaining[0]!;
    for (const cid of remaining) {
      const votes = tally[cid] ?? 0;
      const loserVotes = tally[loser] ?? 0;
      if (votes < loserVotes || (votes === loserVotes && cid > loser)) {
        loser = cid;
      }
    }
    remaining = remaining.filter((c) => c !== loser);
  }

  const winnerId = remaining[0] ?? candidates[0]!;
  return { winnerId, tally: lastTally };
}

function resolveByVotingSystem(
  state: SimState,
  electors: string[],
  weights: Record<string, number>,
  candidates: string[],
  votingSystem: VotingSystem,
): { winnerId: string; tally: Record<string, number> } {
  if (votingSystem === "ranked_choice") {
    return resolveRankedChoice(state, electors, weights, candidates);
  }
  if (votingSystem === "runoff" || votingSystem === "multiple_ballot") {
    return resolveRunoff(state, electors, weights, candidates);
  }
  const tally = tallyFirstPreferences(state, electors, weights, candidates);
  return { winnerId: pluralityWinner(candidates, tally), tally };
}

// ---------------------------------------------------------------------------
// Candidate programs & leadership stability
// ---------------------------------------------------------------------------

/**
 * Derive a lightweight chair-candidate program from ideology, caucus priorities,
 * and existing party priority list.
 */
export function buildChairCandidateProgram(
  state: SimState,
  world: KernelWorld,
  candidateId: string,
  partyId: string,
): ChairCandidateProgram {
  const runtime = ensurePartyOrgRuntime(state);
  const profile = getAgentProfile(world, state, candidateId);
  const ideology = profile?.ideology;
  const economic = ideology?.economic ?? 0;
  const social = ideology?.social ?? 0;
  const authority = ideology?.authority ?? 0;

  const platformDirection =
    economic < -0.25
      ? "interventionist_left"
      : economic > 0.25
        ? "market_liberal"
        : social < -0.2
          ? "social_conservative"
          : social > 0.2
            ? "social_liberal"
            : "pragmatic_center";

  const coalitionStrategy =
    authority > 0.3 ? "harden_identity" : authority < -0.2 ? "broad_tent" : "negotiated_partners";

  const campaignIdx = Math.abs((economic * 10) | 0) % Math.max(1, CAMPAIGN_STRATEGY_IDS.length);
  const campaignStrategy =
    getCampaignStrategy(CAMPAIGN_STRATEGY_IDS[campaignIdx] ?? "persuasion")?.id ?? "persuasion";

  const factionId = state.politicians[candidateId]?.factionId;
  const caucusPriorities = factionId
    ? (state.caucusRuntime?.caucuses[factionId]?.priorities ?? [])
    : [];
  const partyPriorities = runtime.priorities[partyId] ?? [];
  const catalogFallback = listPartyPriorities()[0]?.id ?? "growth_and_jobs";
  const priorityIssue = caucusPriorities[0] ?? partyPriorities[0] ?? catalogFallback;

  const unityStrategy =
    (state.caucusRuntime?.caucuses[factionId ?? ""]?.stanceTowardChair ?? "cooperative") ===
      "oppositional" ||
    (state.caucusRuntime?.caucuses[factionId ?? ""]?.stanceTowardChair ?? "") === "critical"
      ? "confront_dissent"
      : "broker_factions";

  return {
    platformDirection,
    coalitionStrategy,
    campaignStrategy,
    priorityIssue,
    unityStrategy,
  };
}

export type LeadershipStability =
  "secure" | "stable" | "contested" | "vulnerable" | "challenge_underway";

/**
 * Soft leadership stability estimate from open elections and committee affinity
 * toward the sitting chair.
 */
export function leadershipStability(state: SimState, partyId: string): LeadershipStability {
  const runtime = ensurePartyOrgRuntime(state);
  const open = Object.values(runtime.chairElections).find(
    (e) => e.partyId === partyId && e.status === "open",
  );
  if (open) {
    if (open.triggerReason === "challenge" || open.candidates.length >= 2) {
      return "challenge_underway";
    }
    return "contested";
  }

  const chairId = runtime.officers[partyId]?.chair?.politicianId;
  if (!chairId) return "vulnerable";

  const committee = runtime.nationalCommittee[partyId] ?? [];
  if (committee.length === 0) return "stable";

  let sum = 0;
  let n = 0;
  for (const memberId of committee) {
    if (memberId === chairId) continue;
    sum += state.relationships[memberId]?.[chairId]?.affinity ?? 0;
    n += 1;
  }
  const mean = n > 0 ? sum / n : 0;
  if (mean >= 0.35) return "secure";
  if (mean >= 0.1) return "stable";
  if (mean >= -0.15) return "contested";
  return "vulnerable";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens a chair election for `partyId`.
 *
 * Fails if an open election already exists for this party.
 */
export function openPartyChairElection(
  state: SimState,
  world: KernelWorld,
  args: { partyId: string; commandId: string; triggerReason?: string },
): { ok: true; electionId: string } | { ok: false; error: { code: string; message: string } } {
  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  const alreadyOpen = Object.values(runtime.chairElections).find(
    (e) => e.partyId === args.partyId && e.status === "open",
  );
  if (alreadyOpen) {
    return {
      ok: false,
      error: {
        code: "ELECTION_ALREADY_OPEN",
        message: `Chair election ${alreadyOpen.id} is already open for party ${args.partyId}.`,
      },
    };
  }

  const rules = getPartyRules(state, world, args.partyId);
  const id = `PCELECT${String(runtime.nextElectionId++).padStart(5, "0")}`;
  const triggerReason = args.triggerReason ?? "scheduled";

  const election: ChairElection = {
    id,
    partyId: args.partyId,
    openedDate: state.currentDate,
    status: "open",
    candidates: [],
    winnerId: null,
    resolvedDate: null,
    method: rules.chairElectionMethod,
    stage: "opening",
    triggerReason,
    programs: {},
    votingSystem: rules.votingSystem,
  };
  runtime.chairElections[id] = election;

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CHAIR_ELECTION_OPENED",
      importance: 0.6,
      visibility: "public",
      actorIds: [],
      entityIds: [args.partyId, id],
      payload: {
        partyId: args.partyId,
        electionId: id,
        method: rules.chairElectionMethod,
        votingSystem: rules.votingSystem,
        triggerReason,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return { ok: true, electionId: id };
}

/**
 * Declares candidacy in an open chair election.
 *
 * The politician must be an active member of the party.
 * Duplicate declarations are silently ignored (idempotent).
 */
export function declareChairCandidacy(
  state: SimState,
  world: KernelWorld,
  args: { electionId: string; politicianId: string; commandId: string },
): { ok: true } | { ok: false; error: { code: string; message: string } } {
  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  const election = runtime.chairElections[args.electionId];
  if (!election) {
    return {
      ok: false,
      error: {
        code: "ELECTION_NOT_FOUND",
        message: `No chair election with id ${args.electionId}.`,
      },
    };
  }
  if (election.status !== "open") {
    return {
      ok: false,
      error: {
        code: "ELECTION_NOT_OPEN",
        message: `Election ${args.electionId} is not open (status: ${election.status}).`,
      },
    };
  }

  const pol = state.politicians[args.politicianId];
  if (!pol || !pol.alive || pol.retired) {
    return {
      ok: false,
      error: {
        code: "POLITICIAN_INELIGIBLE",
        message: `Politician ${args.politicianId} is not active.`,
      },
    };
  }
  if (pol.partyId !== election.partyId) {
    return {
      ok: false,
      error: {
        code: "NOT_PARTY_MEMBER",
        message: `Politician ${args.politicianId} is not a member of party ${election.partyId}.`,
      },
    };
  }

  if (!election.candidates.includes(args.politicianId)) {
    election.candidates.push(args.politicianId);
    election.programs[args.politicianId] = buildChairCandidateProgram(
      state,
      world,
      args.politicianId,
      election.partyId,
    );
    if (election.stage === "opening") election.stage = "nominations";

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CHAIR_CANDIDACY_DECLARED",
        importance: 0.45,
        visibility: "public",
        actorIds: [args.politicianId],
        entityIds: [election.partyId, args.electionId],
        payload: {
          electionId: args.electionId,
          partyId: election.partyId,
          politicianId: args.politicianId,
          program: election.programs[args.politicianId] ?? null,
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  }

  return { ok: true };
}

/**
 * Resolves a chair election under the election's voting system.
 *
 * On success:
 *   • Sets `runtime.officers[partyId].chair` to the winner
 *   • Sets `state.partyStates[partyId].leaderId` to the winner
 *   • Marks stages result → aftermath and status resolved
 *   • Emits PARTY_CHAIR_ELECTED history event
 */
export function resolveChairElection(
  state: SimState,
  world: KernelWorld,
  args: { electionId: string; commandId: string },
): { ok: true; winnerId: string } | { ok: false; error: { code: string; message: string } } {
  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  const election = runtime.chairElections[args.electionId];
  if (!election) {
    return {
      ok: false,
      error: { code: "ELECTION_NOT_FOUND", message: `No chair election ${args.electionId}.` },
    };
  }
  if (election.status !== "open") {
    return {
      ok: false,
      error: { code: "ELECTION_NOT_OPEN", message: `Election ${args.electionId} is not open.` },
    };
  }
  if (election.candidates.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_CANDIDATES",
        message: `Election ${args.electionId} has no declared candidates.`,
      },
    };
  }

  election.stage = "ballot";
  const rules = getPartyRules(state, world, election.partyId);
  const votingSystem = election.votingSystem ?? rules.votingSystem;

  // Ensure every candidate has a program snapshot
  for (const cid of election.candidates) {
    if (!election.programs[cid]) {
      election.programs[cid] = buildChairCandidateProgram(state, world, cid, election.partyId);
    }
  }

  if (election.candidates.length === 1) {
    const winnerId = election.candidates[0]!;
    const tally: Record<string, number> = { [winnerId]: 1 };
    election.tally = tally;
    applyWinner(state, world, runtime, election, winnerId, events, args.commandId);
    return { ok: true, winnerId };
  }

  const electors = buildElectorIds(state, world, election.partyId, election.method);
  const weights: Record<string, number> = {};
  for (const electorId of electors) {
    weights[electorId] = electorWeight(
      state,
      election.partyId,
      electorId,
      electors,
      election.method,
    );
  }

  const { winnerId, tally } = resolveByVotingSystem(
    state,
    electors,
    weights,
    election.candidates,
    votingSystem,
  );
  election.tally = tally;
  applyWinner(state, world, runtime, election, winnerId, events, args.commandId);
  return { ok: true, winnerId };
}

// ---------------------------------------------------------------------------
// Internal: apply winner mutations
// ---------------------------------------------------------------------------

function applyWinner(
  state: SimState,
  world: KernelWorld,
  runtime: ReturnType<typeof ensurePartyOrgRuntime>,
  election: ChairElection,
  winnerId: string,
  events: SimEvent[],
  commandId: string,
): void {
  election.stage = "result";
  election.status = "resolved";
  election.winnerId = winnerId;
  election.resolvedDate = state.currentDate;
  election.stage = "aftermath";

  if (!runtime.officers[election.partyId]) runtime.officers[election.partyId] = {};
  runtime.officers[election.partyId]!.chair = {
    role: "chair",
    politicianId: winnerId,
    partyId: election.partyId,
    assumedDate: state.currentDate,
  };
  const lead = setPartyLeader(state, world, election.partyId, winnerId, commandId);
  if ("events" in lead) events.push(...lead.events);

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CHAIR_ELECTED",
      importance: 0.75,
      visibility: "public",
      actorIds: [winnerId],
      entityIds: [election.partyId, election.id],
      payload: {
        electionId: election.id,
        partyId: election.partyId,
        winnerId,
        candidateCount: election.candidates.length,
        votingSystem: election.votingSystem ?? null,
        tally: election.tally ?? {},
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
}
