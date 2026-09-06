import { countStv, type StvResult } from "@lorsain/election-math";
import { parseIsoDate } from "../calendar.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import {
  firstPreferenceTotals,
  generateConstituencyBallots,
  integerBallotWeightSum,
  largestRemainder,
} from "./ballots.js";
import { publicCandidateFacts } from "./support.js";
import { constituencyTurnout } from "./turnout.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import type {
  CandidateStanding,
  ElectionCandidate,
  ElectionState,
  PublicCandidateFacts,
} from "./types.js";
import { assemblyElectionMode } from "../provinces/constitutionGameplay.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function listRankScore(standing: CandidateStanding): number {
  return (
    standing.nameRecognition * 0.35 +
    ((standing.favorability + 1) / 2) * 0.45 +
    standing.enthusiasm * 0.2 +
    standing.momentum * 0.05
  );
}

/**
 * Closed-list PR (per constituency): aggregate first preferences by party,
 * allocate seats by largest-remainder / Hare quota (quota = totalVotes / seats;
 * each party gets floor(votes/quota) then remainders fill), then fill seats from
 * each party's candidate list ordered by standing/quality within the party.
 */
function electClosedListPr(args: {
  ordered: string[];
  seats: number;
  ballots: ReturnType<typeof generateConstituencyBallots>;
  partyByCandidate: Record<string, string | null>;
  factsById: Map<string, PublicCandidateFacts>;
}): string[] {
  const totals = firstPreferenceTotals(args.ballots);
  const partyVotes: Record<string, number> = {};
  for (const id of args.ordered) {
    const partyKey = args.partyByCandidate[id] ?? `independent:${id}`;
    partyVotes[partyKey] = (partyVotes[partyKey] ?? 0) + (totals[id] ?? 0);
  }
  const partyKeys = Object.keys(partyVotes).sort(
    (a, b) => (partyVotes[b] ?? 0) - (partyVotes[a] ?? 0) || a.localeCompare(b),
  );
  const votes = partyKeys.map((k) => partyVotes[k] ?? 0);
  const seatAlloc = largestRemainder(votes, args.seats);
  const winners: string[] = [];
  for (let i = 0; i < partyKeys.length; i += 1) {
    const partyKey = partyKeys[i]!;
    const n = seatAlloc[i] ?? 0;
    if (n <= 0) continue;
    const list = args.ordered
      .filter((id) => (args.partyByCandidate[id] ?? `independent:${id}`) === partyKey)
      .sort((a, b) => {
        const fa = args.factsById.get(a)!;
        const fb = args.factsById.get(b)!;
        return listRankScore(fb.standing) - listRankScore(fa.standing) || a.localeCompare(b);
      });
    for (let k = 0; k < n && k < list.length; k += 1) {
      winners.push(list[k]!);
    }
  }
  // If some parties lacked enough candidates, top up by remaining list order of leftover vote leaders.
  if (winners.length < args.seats) {
    const taken = new Set(winners);
    const remainder = args.ordered
      .filter((id) => !taken.has(id))
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b));
    for (const id of remainder) {
      if (winners.length >= args.seats) break;
      winners.push(id);
    }
  }
  return winners.slice(0, args.seats);
}

/**
 * Compensatory MMP national top-up allocation (Hare quota / largest-remainder).
 *
 * Algorithm (simplified Lorsain MMP):
 * 1. Each constituency elects max(1, floor(magnitude/2)) seats by FPTP (plurality).
 * 2. Party first-preference vote totals are aggregated nationally.
 * 3. Hare quota / largest-remainder allocates the FULL chamber size proportionally.
 * 4. Each party receives max(0, entitlement − constituencyWins) top-up seats.
 * 5. If a party's constituency wins exceed its entitlement, overhang occurs:
 *    the chamber temporarily expands (no seats are confiscated).
 * 6. Top-up seats are filled from each party's unelected candidates ordered by
 *    list rank score (name recognition + favorability + enthusiasm + momentum).
 *
 * @returns topUpWinnersByParty — candidate ids selected as list top-up, per party
 * @returns partyEntitlements — Hare quota seat entitlements per party
 * @returns overhang — number of overhang seats (chamber expansion)
 * @returns expandedChamberSize — final chamber size including overhang
 */
export function computeMmpTopUp(args: {
  totalChamberSeats: number;
  nationalPartyVotes: Record<string, number>;
  constituencyWinsByParty: Record<string, number>;
  /** Unelected candidates per party, ordered by list rank (best first). */
  listCandidatesByParty: Record<string, string[]>;
}): {
  topUpWinnersByParty: Record<string, string[]>;
  partyEntitlements: Record<string, number>;
  overhang: number;
  expandedChamberSize: number;
} {
  const partyIds = Object.keys(args.nationalPartyVotes).sort(
    (a, b) =>
      (args.nationalPartyVotes[b] ?? 0) - (args.nationalPartyVotes[a] ?? 0) || a.localeCompare(b),
  );
  if (partyIds.length === 0) {
    return { topUpWinnersByParty: {}, partyEntitlements: {}, overhang: 0, expandedChamberSize: 0 };
  }
  const votes = partyIds.map((p) => args.nationalPartyVotes[p] ?? 0);
  const seatAlloc = largestRemainder(votes, args.totalChamberSeats);

  const partyEntitlements: Record<string, number> = {};
  const topUpWinnersByParty: Record<string, string[]> = {};
  let totalTopUp = 0;
  let totalConstituencySeats = 0;

  for (let i = 0; i < partyIds.length; i++) {
    const party = partyIds[i]!;
    const entitled = seatAlloc[i] ?? 0;
    const won = args.constituencyWinsByParty[party] ?? 0;
    partyEntitlements[party] = entitled;
    totalConstituencySeats += won;
    const topUpNeeded = Math.max(0, entitled - won);
    const candidates = args.listCandidatesByParty[party] ?? [];
    topUpWinnersByParty[party] = candidates.slice(0, topUpNeeded);
    totalTopUp += topUpWinnersByParty[party]!.length;
  }

  const listSlots = args.totalChamberSeats - totalConstituencySeats;
  const overhang = Math.max(0, totalTopUp - Math.max(0, listSlots));
  const expandedChamberSize = totalConstituencySeats + totalTopUp;

  return { topUpWinnersByParty, partyEntitlements, overhang, expandedChamberSize };
}

/** Minimal STV-shaped archive for certification without running STV. */
function syntheticCountArchive(args: {
  ordered: string[];
  seats: number;
  ballots: ReturnType<typeof generateConstituencyBallots>;
  elected: string[];
}): StvResult {
  const totals = firstPreferenceTotals(args.ballots);
  const totalValid = Object.values(totals).reduce((a, b) => a + b, 0);
  const firstPreferences: Record<string, string> = {};
  for (const id of args.ordered) {
    firstPreferences[id] = String(totals[id] ?? 0);
  }
  return {
    method: "stv",
    candidateIds: args.ordered,
    seats: args.seats,
    totalValid: String(totalValid),
    quota: "0",
    excludedBallotCount: 0,
    excludedBallotGroupCount: 0,
    excludedKnownWeight: "0",
    unknownWeightGroups: 0,
    excludedByReason: {},
    elected: args.elected,
    eliminated: args.ordered.filter((id) => !args.elected.includes(id)),
    exhausted: "0",
    retainedWithElected: "0",
    steps: [],
    firstPreferences,
  };
}

export function resolveAssemblyConstituency(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    constituencyId: string;
    candidateIds: string[];
    partyByCandidate: Record<string, string | null>;
    ideologyById?: Record<string, ElectionCandidate["publicIdeology"]>;
    mobilizationByCandidate?: Record<string, number>;
  },
): { election: ElectionState } | { error: CommandError } {
  const el = world.constituencyElectorate[args.constituencyId];
  if (!el) return { error: reject("INVALID_GEOGRAPHY", args.constituencyId) };
  if (args.candidateIds.length === 0) {
    return { error: reject("EMPTY_FIELD", "assembly field is empty") };
  }
  const method = assemblyElectionMode(state);
  // For mixed_member, the constituency tier elects a subset by FPTP (plurality);
  // national compensatory top-up (Hare quota) fills the remainder in assembly-national.ts.
  const effectiveSeats =
    method === "mixed_member" ? Math.max(1, Math.floor(el.seats / 2)) : el.seats;
  const seen = new Set<string>();
  for (const id of args.candidateIds) {
    if (seen.has(id)) return { error: reject("INVALID_CANDIDATE", `duplicate ${id}`) };
    seen.add(id);
    const pol = state.politicians[id];
    if (!pol) return { error: reject("UNKNOWN_POLITICIAN", id) };
    if (!pol.alive || pol.retired) return { error: reject("INELIGIBLE_CANDIDATE", id) };
    const party = args.partyByCandidate[id] ?? pol.partyId;
    if (party === world.independentAggregatePartyId) {
      return { error: reject("INDEPENDENT_PARTY_ID", `${id} cannot have PARTY_IND membership`) };
    }
    if (party == null) {
      const ideology = args.ideologyById?.[id] ?? null;
      if (!ideology) return { error: reject("PUBLIC_POSITION_REQUIRED", id) };
      for (const axis of IDEOLOGY_AXES) {
        const v = ideology[axis];
        if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) {
          return { error: reject("INVALID_PUBLIC_IDEOLOGY", `${id}.${axis}`) };
        }
      }
    } else if (pol.partyId !== party) {
      return { error: reject("PARTY_MISMATCH", `${id} party ${party} != ${pol.partyId}`) };
    }
  }
  if (args.candidateIds.length < effectiveSeats) {
    return { error: reject("INSUFFICIENT_CANDIDATES", "fewer candidates than seats") };
  }
  const ordered = [...args.candidateIds].sort();
  const facts = [];
  const factsById = new Map<string, PublicCandidateFacts>();
  for (const id of ordered) {
    const f = publicCandidateFacts(world, state, id, args.ideologyById?.[id] ?? null);
    if (!f) return { error: reject("UNKNOWN_POLITICIAN", id) };
    facts.push(f);
    factsById.set(id, f);
  }
  const turnout = constituencyTurnout(world, args.constituencyId, facts, "assembly", rng);
  const ballots = generateConstituencyBallots(
    world,
    state,
    args.constituencyId,
    ordered,
    turnout.validVoteValue,
    args.ideologyById,
    rng,
    args.mobilizationByCandidate,
  );
  const validSum = integerBallotWeightSum(ballots);
  if (validSum !== BigInt(turnout.validVoteValue)) {
    return {
      error: reject("VOTE_CONSERVATION", `weights ${validSum} != ${turnout.validVoteValue}`),
    };
  }
  let result: StvResult;
  let winnerIds: string[];
  if (method === "fptp") {
    const totals = firstPreferenceTotals(ballots);
    winnerIds = [...ordered]
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b))
      .slice(0, el.seats);
    // Archive a truncated STV run for certification compatibility when possible.
    result = countStv(
      {
        candidateIds: ordered,
        seats: el.seats,
        ballots: ballots.map((b) => ({
          ...b,
          rankings: b.rankings.length > 0 ? [b.rankings[0]!] : [],
        })),
      },
      { rng: { nextUint32: () => rng.uint32("elections") } },
    );
  } else if (method === "closed_list_pr") {
    // Do not call countStv — Hare quota / largest-remainder closed list.
    winnerIds = electClosedListPr({
      ordered,
      seats: el.seats,
      ballots,
      partyByCandidate: args.partyByCandidate,
      factsById,
    });
    result = syntheticCountArchive({
      ordered,
      seats: el.seats,
      ballots,
      elected: winnerIds,
    });
  } else if (method === "mixed_member") {
    // Constituency-tier FPTP: elect effectiveSeats winners by plurality.
    // National compensatory top-up (Hare quota) happens in resolveAssemblyElection.
    const totals = firstPreferenceTotals(ballots);
    winnerIds = [...ordered]
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b))
      .slice(0, effectiveSeats);
    result = syntheticCountArchive({
      ordered,
      seats: effectiveSeats,
      ballots,
      elected: winnerIds,
    });
  } else {
    result = countStv(
      { candidateIds: ordered, seats: el.seats, ballots },
      { rng: { nextUint32: () => rng.uint32("elections") } },
    );
    if (result.elected.length !== el.seats) {
      return { error: reject("COUNT_FAILED", "STV did not elect magnitude seats") };
    }
    winnerIds = [...result.elected];
  }
  if (winnerIds.length !== effectiveSeats) {
    return { error: reject("COUNT_FAILED", `${method} did not elect expected seats`) };
  }
  const year = parseIsoDate(state.currentDate).year;
  const election: ElectionState = {
    id: `ELEC_ASM_${year}_${args.constituencyId}`,
    type: "assembly",
    date: state.currentDate,
    status: "resolved",
    geographyKind: "constituency",
    constituencyId: args.constituencyId,
    seats: effectiveSeats,
    fieldFinalized: true,
    candidates: Object.fromEntries(
      args.candidateIds.map((id) => [
        id,
        {
          politicianId: id,
          partyId: args.partyByCandidate[id] ?? null,
          sourceContestId: null,
          filedDate: state.currentDate,
          publicIdeology: args.ideologyById?.[id] ?? null,
          withdrawn: false,
          independentQualified: (args.partyByCandidate[id] ?? null) == null,
        } satisfies ElectionCandidate,
      ]),
    ),
    partiesWithoutNominee: [],
    turnout,
    countInput: { candidateIds: ordered, ballots, seats: el.seats },
    countArchive: result,
    winnerIds,
    resultEventId: null,
    assembly: null,
    metadata: { assemblyElectoralMethod: method },
  };
  return { election };
}
