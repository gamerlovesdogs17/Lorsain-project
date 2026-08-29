import { assertPositiveTotalValid, nextContinuingPreference, prepareBallots } from "./ballots.js";
import type { ExcludedBallotStats } from "./ballots.js";
import {
  add,
  compare,
  div,
  eq,
  fromInt,
  gt,
  serializeRational,
  sum,
  ZERO,
  type Rational,
} from "./rational.js";
import { resolveTie } from "./tiebreak.js";
import type {
  BallotGroupInput,
  CandidateId,
  PreparedBallot,
  TieResolution,
  TransferLine,
  Uint32Source,
} from "./types.js";
import { aggregateTransferLines, serializeTotals } from "./types.js";

export type IrvRound = {
  round: number;
  totalsBefore: Record<string, string>;
  continuingDenominator: string;
  majorityThreshold: string;
  action: "elect" | "eliminate";
  electedId?: CandidateId;
  eliminatedId?: CandidateId;
  transfers: TransferLine[];
  newlyExhausted: string;
  exhaustedTotal: string;
  totalsAfter: Record<string, string>;
  tieResolution?: TieResolution;
};

export type IrvResult = {
  method: "irv";
  candidateIds: CandidateId[];
  totalValid: string;
  /** @deprecated Use excludedBallotGroupCount — this is a group count, not voters. */
  excludedBallotCount: number;
  excludedBallotGroupCount: number;
  excludedKnownWeight: string;
  unknownWeightGroups: number;
  excludedByReason: ExcludedBallotStats["excludedByReason"];
  elected: CandidateId;
  eliminated: CandidateId[];
  exhausted: string;
  rounds: IrvRound[];
  firstPreferences: Record<string, string>;
};

export type IrvInput = {
  candidateIds: CandidateId[];
  ballots: BallotGroupInput[];
};

export type IrvOptions = {
  rng: Uint32Source;
};

type LiveBallot = {
  ballot: PreparedBallot;
  weight: Rational;
  credited: CandidateId | null;
};

function exclusionFields(stats: ExcludedBallotStats) {
  return {
    excludedBallotCount: stats.excludedBallotGroupCount,
    excludedBallotGroupCount: stats.excludedBallotGroupCount,
    excludedKnownWeight: stats.excludedKnownWeight,
    unknownWeightGroups: stats.unknownWeightGroups,
    excludedByReason: stats.excludedByReason,
  };
}

export function countIrv(input: IrvInput, options: IrvOptions): IrvResult {
  if (input.candidateIds.length === 0) throw new Error("IRV requires candidates");
  const unique = new Set(input.candidateIds);
  if (unique.size !== input.candidateIds.length) throw new Error("duplicate candidate IDs");

  const prepared = prepareBallots(input.candidateIds, input.ballots);
  assertPositiveTotalValid(prepared.totalValid, "IRV");

  const continuing = new Set(input.candidateIds);
  const eliminated: CandidateId[] = [];
  let exhausted = ZERO;
  const rounds: IrvRound[] = [];
  const history: Array<Map<CandidateId, Rational>> = [];

  const live: LiveBallot[] = prepared.valid.map((b) => ({
    ballot: b,
    weight: b.weight,
    credited: nextContinuingPreference(b.rankings, continuing),
  }));

  const firstPreferences = new Map<CandidateId, Rational>();
  for (const id of input.candidateIds) firstPreferences.set(id, ZERO);
  for (const lb of live) {
    if (lb.credited) {
      firstPreferences.set(lb.credited, add(firstPreferences.get(lb.credited)!, lb.weight));
    } else {
      exhausted = add(exhausted, lb.weight);
      lb.credited = null;
    }
  }

  let round = 0;
  while (continuing.size > 0) {
    round += 1;
    const totals = tally(live, continuing);
    history.push(new Map(totals));

    const continuingDenom = sum([...totals.values()]);
    const majorityThreshold = div(continuingDenom, fromInt(2));

    let majorityWinner: CandidateId | null = null;
    for (const [id, v] of totals) {
      if (gt(v, majorityThreshold)) {
        majorityWinner = id;
        break;
      }
    }

    if (majorityWinner || continuing.size === 1) {
      const electedId = majorityWinner ?? [...continuing][0]!;
      rounds.push({
        round,
        totalsBefore: serializeTotals(totals),
        continuingDenominator: serializeRational(continuingDenom),
        majorityThreshold: serializeRational(majorityThreshold),
        action: "elect",
        electedId,
        transfers: [],
        newlyExhausted: serializeRational(ZERO),
        exhaustedTotal: serializeRational(exhausted),
        totalsAfter: serializeTotals(totals),
      });
      return {
        method: "irv",
        candidateIds: [...input.candidateIds],
        totalValid: serializeRational(prepared.totalValid),
        ...exclusionFields(prepared.exclusionStats),
        elected: electedId,
        eliminated,
        exhausted: serializeRational(exhausted),
        rounds,
        firstPreferences: serializeTotals(firstPreferences),
      };
    }

    let lowestVal: Rational | null = null;
    const lowestIds: CandidateId[] = [];
    for (const id of continuing) {
      const v = totals.get(id) ?? ZERO;
      if (lowestVal === null || compare(v, lowestVal) < 0) {
        lowestVal = v;
        lowestIds.length = 0;
        lowestIds.push(id);
      } else if (eq(v, lowestVal)) {
        lowestIds.push(id);
      }
    }

    let tieResolution: TieResolution | undefined;
    let eliminatedId = lowestIds[0]!;
    if (lowestIds.length > 1) {
      tieResolution = resolveTie({
        purpose: "irv_eliminate",
        tiedIds: lowestIds,
        prefer: "lowest",
        historyTotals: history.slice(0, -1),
        firstPreferences,
        rng: options.rng,
      });
      eliminatedId = tieResolution.chosenId;
    }

    const transfers: TransferLine[] = [];
    let newlyExhausted = ZERO;
    continuing.delete(eliminatedId);
    eliminated.push(eliminatedId);

    for (const lb of live) {
      if (lb.credited !== eliminatedId) continue;
      const next = nextContinuingPreference(lb.ballot.rankings, continuing);
      if (next) {
        transfers.push({
          toCandidateId: next,
          value: serializeRational(lb.weight),
          ballotGroupId: lb.ballot.id,
        });
        lb.credited = next;
      } else {
        transfers.push({
          toCandidateId: null,
          value: serializeRational(lb.weight),
          ballotGroupId: lb.ballot.id,
        });
        newlyExhausted = add(newlyExhausted, lb.weight);
        exhausted = add(exhausted, lb.weight);
        lb.credited = null;
      }
    }

    const totalsAfter = tally(live, continuing);
    rounds.push({
      round,
      totalsBefore: serializeTotals(totals),
      continuingDenominator: serializeRational(continuingDenom),
      majorityThreshold: serializeRational(majorityThreshold),
      action: "eliminate",
      eliminatedId,
      transfers: aggregateTransferLines(transfers),
      newlyExhausted: serializeRational(newlyExhausted),
      exhaustedTotal: serializeRational(exhausted),
      totalsAfter: serializeTotals(totalsAfter),
      ...(tieResolution ? { tieResolution } : {}),
    });
  }

  throw new Error("IRV failed to elect a winner");
}

function tally(live: LiveBallot[], continuing: Set<CandidateId>): Map<CandidateId, Rational> {
  const totals = new Map<CandidateId, Rational>();
  for (const id of continuing) totals.set(id, ZERO);
  for (const lb of live) {
    if (lb.credited && continuing.has(lb.credited)) {
      totals.set(lb.credited, add(totals.get(lb.credited)!, lb.weight));
    }
  }
  return totals;
}
