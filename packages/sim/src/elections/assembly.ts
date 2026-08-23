import { countStv } from "@lorsain/election-math";
import { parseIsoDate } from "../calendar.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { generateConstituencyBallots, integerBallotWeightSum } from "./ballots.js";
import { publicCandidateFacts } from "./support.js";
import { constituencyTurnout } from "./turnout.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import type { ElectionCandidate, ElectionState } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
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
  if (args.candidateIds.length < el.seats) {
    return { error: reject("INSUFFICIENT_CANDIDATES", "fewer candidates than seats") };
  }
  const ordered = [...args.candidateIds].sort();
  const facts = [];
  for (const id of ordered) {
    const f = publicCandidateFacts(world, state, id, args.ideologyById?.[id] ?? null);
    if (!f) return { error: reject("UNKNOWN_POLITICIAN", id) };
    facts.push(f);
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
  const result = countStv(
    { candidateIds: ordered, seats: el.seats, ballots },
    { rng: { nextUint32: () => rng.uint32("elections") } },
  );
  if (result.elected.length !== el.seats) {
    return { error: reject("COUNT_FAILED", "STV did not elect magnitude seats") };
  }
  const year = parseIsoDate(state.currentDate).year;
  const election: ElectionState = {
    id: `ELEC_ASM_${year}_${args.constituencyId}`,
    type: "assembly",
    date: state.currentDate,
    status: "resolved",
    geographyKind: "constituency",
    constituencyId: args.constituencyId,
    seats: el.seats,
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
    winnerIds: [...result.elected],
    resultEventId: null,
    assembly: null,
    metadata: {},
  };
  return { election };
}
