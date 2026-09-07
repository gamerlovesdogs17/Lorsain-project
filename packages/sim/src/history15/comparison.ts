import type { SimState } from "../types.js";

export type ElectionComparison = {
  electionIdA: string;
  electionIdB: string;
  typeA: string | null;
  typeB: string | null;
  dateA: string | null;
  dateB: string | null;
  voteSharesA: Record<string, number>;
  voteSharesB: Record<string, number>;
  seatsA: Record<string, number>;
  seatsB: Record<string, number>;
  turnoutA: number | null;
  turnoutB: number | null;
};

function voteSharesFromElection(
  state: SimState,
  electionId: string,
): { shares: Record<string, number>; turnout: number | null; seats: Record<string, number> } {
  const election = state.elections[electionId];
  if (!election) return { shares: {}, turnout: null, seats: {} };

  const turnout = election.turnout?.turnoutRate ?? null;
  const seats: Record<string, number> = {
    ...(election.assembly?.partySeatTotals ?? {}),
  };

  const shares: Record<string, number> = {};
  const archive = election.countArchive as
    { firstPreferences?: Record<string, string> } | null | undefined;
  if (archive?.firstPreferences) {
    let total = 0;
    const raw: Record<string, number> = {};
    for (const [candId, votesStr] of Object.entries(archive.firstPreferences)) {
      const v = Number(votesStr);
      if (!Number.isFinite(v)) continue;
      const partyId = election.candidates[candId]?.partyId ?? candId;
      raw[partyId] = (raw[partyId] ?? 0) + v;
      total += v;
    }
    if (total > 0) {
      for (const [partyId, v] of Object.entries(raw)) {
        shares[partyId] = v / total;
      }
    }
  } else if (election.assembly?.constituencyResults) {
    let total = 0;
    const raw: Record<string, number> = {};
    for (const row of Object.values(election.assembly.constituencyResults)) {
      for (const [candId, votesStr] of Object.entries(row.firstPreferences ?? {})) {
        const v = Number(votesStr);
        if (!Number.isFinite(v)) continue;
        const partyId = row.partyByCandidate?.[candId] ?? candId;
        raw[partyId ?? candId] = (raw[partyId ?? candId] ?? 0) + v;
        total += v;
      }
    }
    if (total > 0) {
      for (const [partyId, v] of Object.entries(raw)) {
        shares[partyId] = v / total;
      }
    }
  }

  return { shares, turnout, seats };
}

/** Compare two elections: vote shares, seats, turnout when available. */
export function compareElections(
  state: SimState,
  electionIdA: string,
  electionIdB: string,
): ElectionComparison {
  const a = state.elections[electionIdA];
  const b = state.elections[electionIdB];
  const left = voteSharesFromElection(state, electionIdA);
  const right = voteSharesFromElection(state, electionIdB);
  return {
    electionIdA,
    electionIdB,
    typeA: a?.type ?? null,
    typeB: b?.type ?? null,
    dateA: a?.date ?? null,
    dateB: b?.date ?? null,
    voteSharesA: left.shares,
    voteSharesB: right.shares,
    seatsA: left.seats,
    seatsB: right.seats,
    turnoutA: left.turnout,
    turnoutB: right.turnout,
  };
}
