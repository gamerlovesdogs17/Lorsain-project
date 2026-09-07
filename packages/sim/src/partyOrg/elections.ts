/**
 * partyOrg/elections.ts
 *
 * National chair election lifecycle:
 *   openPartyChairElection   – opens a vacancy election
 *   declareChairCandidacy    – a politician declares candidacy
 *   resolveChairElection     – tallies a simple plurality among the eligible electorate
 *
 * Electorate approximation (no actual membership rolls exist at runtime):
 *   membership          → all active politicians in the party
 *   committee           → chair, vice_chair, treasurer, national_committee_member officers
 *   convention_delegates → all active politicians in the party (like membership,
 *                          represents MPs + affiliated delegates)
 *
 * Each elector votes for the candidate with whom they have the highest
 * relationship affinity (from state.relationships).  Ties are broken
 * deterministically by candidate ID lexicographic order.
 */

import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { getPartyRules } from "./rules.js";
import { ensurePartyOrgRuntime } from "./state.js";
import type { ChairElection, LeadershipElectionMethod } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildElectorIds(
  state: SimState,
  partyId: string,
  method: LeadershipElectionMethod,
): string[] {
  const runtime = ensurePartyOrgRuntime(state);
  const activeInParty = Object.entries(state.politicians)
    .filter(([, p]) => p.partyId === partyId && p.alive && !p.retired)
    .map(([id]) => id);

  if (method === "committee") {
    // Only seated officers vote in committee elections
    const officers = runtime.officers[partyId];
    if (!officers) return activeInParty.slice(0, 5); // fallback: up to 5
    return Object.values(officers)
      .filter(Boolean)
      .map((o) => o!.politicianId);
  }
  // membership / convention_delegates: all active party members
  return activeInParty;
}

/** Simple affinity lookup (0 if relationship absent). */
function affinityFor(state: SimState, electorId: string, candidateId: string): number {
  return state.relationships[electorId]?.[candidateId]?.affinity ?? 0;
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
  args: { partyId: string; commandId: string },
): { ok: true; electionId: string } | { ok: false; error: { code: string; message: string } } {
  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  // Guard: no double-open
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

  const election: ChairElection = {
    id,
    partyId: args.partyId,
    openedDate: state.currentDate,
    status: "open",
    candidates: [],
    winnerId: null,
    resolvedDate: null,
    method: rules.chairElectionMethod,
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
      payload: { partyId: args.partyId, electionId: id, method: rules.chairElectionMethod },
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
  _world: KernelWorld,
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
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  }

  return { ok: true };
}

/**
 * Resolves a chair election by simple plurality.
 *
 * Each elector in the electorate (determined by the election method) casts
 * one vote for the candidate with whom they have the highest relationship
 * affinity.  Ties are broken by candidate ID lexicographic order.
 *
 * On success:
 *   • Sets `runtime.officers[partyId].chair` to the winner
 *   • Sets `state.partyStates[partyId].leaderId` to the winner (keeping the
 *     existing leadership concept in sync with the new chair)
 *   • Marks the election as resolved
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

  // Single candidate: uncontested win
  if (election.candidates.length === 1) {
    const winnerId = election.candidates[0]!;
    applyWinner(state, runtime, election, winnerId, events, args.commandId);
    return { ok: true, winnerId };
  }

  // Build electorate and tally votes
  const electors = buildElectorIds(state, election.partyId, election.method);
  const tally: Record<string, number> = {};
  for (const cid of election.candidates) tally[cid] = 0;

  for (const electorId of electors) {
    let best: string | null = null;
    let bestAffinity = -Infinity;
    for (const cid of election.candidates) {
      const aff = affinityFor(state, electorId, cid);
      if (aff > bestAffinity || (aff === bestAffinity && best !== null && cid < best)) {
        bestAffinity = aff;
        best = cid;
      }
    }
    if (best) tally[best] = (tally[best] ?? 0) + 1;
  }

  // Plurality winner (ties broken by ID)
  let winnerId = election.candidates[0]!;
  for (const cid of election.candidates) {
    const votes = tally[cid] ?? 0;
    const bestVotes = tally[winnerId] ?? 0;
    if (votes > bestVotes || (votes === bestVotes && cid < winnerId)) {
      winnerId = cid;
    }
  }

  applyWinner(state, runtime, election, winnerId, events, args.commandId);
  return { ok: true, winnerId };
}

// ---------------------------------------------------------------------------
// Internal: apply winner mutations
// ---------------------------------------------------------------------------

function applyWinner(
  state: SimState,
  runtime: ReturnType<typeof ensurePartyOrgRuntime>,
  election: ChairElection,
  winnerId: string,
  events: SimEvent[],
  commandId: string,
): void {
  election.status = "resolved";
  election.winnerId = winnerId;
  election.resolvedDate = state.currentDate;

  // Update officers
  if (!runtime.officers[election.partyId]) runtime.officers[election.partyId] = {};
  runtime.officers[election.partyId]!.chair = {
    role: "chair",
    politicianId: winnerId,
    partyId: election.partyId,
    assumedDate: state.currentDate,
  };

  // Keep partyStates.leaderId in sync
  const partyState = state.partyStates[election.partyId];
  if (partyState) partyState.leaderId = winnerId;

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
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
}
