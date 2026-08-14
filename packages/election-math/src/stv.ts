import { assertPositiveTotalValid, nextContinuingPreference, prepareBallots } from "./ballots.js";
import type { ExcludedBallotStats } from "./ballots.js";
import {
  add,
  compare,
  div,
  eq,
  floor,
  fromBigInt,
  fromInt,
  gt,
  gte,
  mul,
  serializeRational,
  sub,
  sum,
  ZERO,
  ONE,
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
import { serializeTotals } from "./types.js";

export type StvStep = {
  step: number;
  action: "elect_surplus" | "eliminate" | "elect_remaining" | "complete";
  totalsBefore: Record<string, string>;
  totalsAfter: Record<string, string>;
  quota: string;
  seatsFilled: number;
  seatsRemaining: number;
  /** Single candidate elected by surplus processing. */
  electedId?: CandidateId;
  /** Candidates elected together by the remaining-candidates rule (lex order). */
  electedIds?: CandidateId[];
  eliminatedId?: CandidateId;
  surplus?: string;
  transferableTotal?: string;
  transferFactor?: string;
  retainedNonTransferable?: string;
  retainedAboveQuota?: string;
  transfers: TransferLine[];
  newlyExhausted: string;
  exhaustedTotal: string;
  retainedWithElectedTotal: string;
  continuingTotal: string;
  conservationTotal: string;
  tieResolution?: TieResolution;
};

export type StvResult = {
  method: "stv";
  candidateIds: CandidateId[];
  seats: number;
  totalValid: string;
  quota: string;
  /** @deprecated Use excludedBallotGroupCount — this is a group count, not voters. */
  excludedBallotCount: number;
  excludedBallotGroupCount: number;
  excludedKnownWeight: string;
  unknownWeightGroups: number;
  excludedByReason: ExcludedBallotStats["excludedByReason"];
  elected: CandidateId[];
  eliminated: CandidateId[];
  exhausted: string;
  retainedWithElected: string;
  steps: StvStep[];
  firstPreferences: Record<string, string>;
};

export type StvInput = {
  candidateIds: CandidateId[];
  seats: number;
  ballots: BallotGroupInput[];
};

export type StvOptions = {
  rng: Uint32Source;
};

type LiveBallot = {
  ballot: PreparedBallot;
  /** Current continuing weight (0 if exhausted or fully locked to elected). */
  weight: Rational;
  credited: CandidateId | null;
};

export function countStv(input: StvInput, options: StvOptions): StvResult {
  if (input.seats <= 0) throw new Error("STV seats must be positive");
  if (input.candidateIds.length === 0) throw new Error("STV requires candidates");
  if (new Set(input.candidateIds).size !== input.candidateIds.length) {
    throw new Error("duplicate candidate IDs");
  }
  if (input.seats > input.candidateIds.length) {
    throw new Error("seats cannot exceed candidate count");
  }

  const prepared = prepareBallots(input.candidateIds, input.ballots);
  assertPositiveTotalValid(prepared.totalValid, "STV");

  const continuing = new Set(input.candidateIds);
  const elected: CandidateId[] = [];
  const eliminated: CandidateId[] = [];
  let exhausted = ZERO;
  let retainedWithElected = ZERO;
  const steps: StvStep[] = [];
  const history: Array<Map<CandidateId, Rational>> = [];

  const quota = fromBigInt(floor(div(prepared.totalValid, fromInt(input.seats + 1))) + 1n);

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
      lb.weight = ZERO;
    }
  }

  let step = 0;
  const maxSteps = input.candidateIds.length * 4 + 16;

  while (elected.length < input.seats && step < maxSteps) {
    step += 1;
    const totals = tally(live, continuing);
    history.push(cloneMap(totals));
    const seatsRemaining = input.seats - elected.length;

    const overQuota = [...continuing].filter((id) => gte(totals.get(id) ?? ZERO, quota));
    if (overQuota.length > 0) {
      overQuota.sort((a, b) => {
        const cmp = compare(totals.get(b) ?? ZERO, totals.get(a) ?? ZERO);
        if (cmp !== 0) return cmp;
        return a < b ? -1 : a > b ? 1 : 0;
      });
      const topVal = totals.get(overQuota[0]!) ?? ZERO;
      const tiedTop = overQuota.filter((id) => eq(totals.get(id) ?? ZERO, topVal));

      let chosen = tiedTop[0]!;
      let tieResolution: TieResolution | undefined;
      if (tiedTop.length > 1) {
        tieResolution = resolveTie({
          purpose: "elect_highest_surplus",
          tiedIds: tiedTop,
          prefer: "highest",
          historyTotals: history.slice(0, -1),
          firstPreferences,
          rng: options.rng,
        });
        chosen = tieResolution.chosenId;
      }

      const candidateTotal = totals.get(chosen) ?? ZERO;
      const surplus = sub(candidateTotal, quota);
      const continuingWithout = new Set([...continuing].filter((c) => c !== chosen));

      const credited = live.filter((lb) => lb.credited === chosen && gt(lb.weight, ZERO));
      let transferableTotal = ZERO;
      const transferable: LiveBallot[] = [];
      const nonTransferable: LiveBallot[] = [];
      for (const lb of credited) {
        const next = nextContinuingPreference(lb.ballot.rankings, continuingWithout);
        if (next) {
          transferable.push(lb);
          transferableTotal = add(transferableTotal, lb.weight);
        } else {
          nonTransferable.push(lb);
        }
      }

      let transferFactor = ONE;
      if (!gt(surplus, ZERO)) {
        transferFactor = ZERO;
      } else if (gt(transferableTotal, surplus)) {
        transferFactor = div(surplus, transferableTotal);
      } else {
        transferFactor = ONE;
      }

      let retainedNonTransferable = ZERO;
      for (const lb of nonTransferable) {
        retainedNonTransferable = add(retainedNonTransferable, lb.weight);
        retainedWithElected = add(retainedWithElected, lb.weight);
        lb.weight = ZERO;
        lb.credited = null;
      }

      let retainedFromTransferable = ZERO;
      const transfers: TransferLine[] = [];
      for (const lb of transferable) {
        const next = nextContinuingPreference(lb.ballot.rankings, continuingWithout)!;
        const transferred = mul(lb.weight, transferFactor);
        const retained = sub(lb.weight, transferred);
        if (gt(retained, ZERO)) {
          retainedFromTransferable = add(retainedFromTransferable, retained);
          retainedWithElected = add(retainedWithElected, retained);
        }
        if (gt(transferred, ZERO)) {
          transfers.push({
            toCandidateId: next,
            value: serializeRational(transferred),
            ballotGroupId: lb.ballot.id,
          });
          lb.weight = transferred;
          lb.credited = next;
        } else {
          lb.weight = ZERO;
          lb.credited = null;
        }
      }

      const totalLocked = add(retainedNonTransferable, retainedFromTransferable);
      const retainedAboveQuota = gt(totalLocked, quota) ? sub(totalLocked, quota) : ZERO;

      continuing.delete(chosen);
      elected.push(chosen);

      pushStep({
        step,
        action: "elect_surplus",
        totalsBefore: totals,
        live,
        continuing,
        exhausted,
        retainedWithElected,
        quota,
        seats: input.seats,
        electedCount: elected.length,
        transfers,
        newlyExhausted: ZERO,
        steps,
        electedId: chosen,
        surplus,
        transferableTotal,
        transferFactor,
        retainedNonTransferable,
        retainedAboveQuota,
        ...(tieResolution ? { tieResolution } : {}),
      });
      continue;
    }

    // No candidate at quota: elect remaining if seats == continuing, else eliminate.
    if (continuing.size === seatsRemaining) {
      const remaining = [...continuing].sort();
      for (const id of remaining) {
        const pile = live.filter((lb) => lb.credited === id);
        for (const lb of pile) {
          retainedWithElected = add(retainedWithElected, lb.weight);
          lb.weight = ZERO;
          lb.credited = null;
        }
        continuing.delete(id);
        elected.push(id);
      }
      pushStep({
        step,
        action: "elect_remaining",
        totalsBefore: totals,
        live,
        continuing,
        exhausted,
        retainedWithElected,
        quota,
        seats: input.seats,
        electedCount: elected.length,
        transfers: [],
        newlyExhausted: ZERO,
        steps,
        electedIds: remaining,
      });
      break;
    }

    // Eliminate lowest
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
        purpose: "eliminate_lowest",
        tiedIds: lowestIds,
        prefer: "lowest",
        historyTotals: history.slice(0, -1),
        firstPreferences,
        rng: options.rng,
      });
      eliminatedId = tieResolution.chosenId;
    }

    continuing.delete(eliminatedId);
    eliminated.push(eliminatedId);

    const transfers: TransferLine[] = [];
    let newlyExhausted = ZERO;
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
        lb.weight = ZERO;
        lb.credited = null;
      }
    }

    pushStep({
      step,
      action: "eliminate",
      totalsBefore: totals,
      live,
      continuing,
      exhausted,
      retainedWithElected,
      quota,
      seats: input.seats,
      electedCount: elected.length,
      transfers,
      newlyExhausted,
      steps,
      eliminatedId,
      ...(tieResolution ? { tieResolution } : {}),
    });
  }

  if (elected.length !== input.seats) {
    throw new Error(`STV did not fill seats: elected ${elected.length} of ${input.seats}`);
  }

  assertVoteConservation(prepared.totalValid, live, continuing, exhausted, retainedWithElected);

  pushStep({
    step: steps.length + 1,
    action: "complete",
    totalsBefore: new Map(),
    live,
    continuing,
    exhausted,
    retainedWithElected,
    quota,
    seats: input.seats,
    electedCount: elected.length,
    transfers: [],
    newlyExhausted: ZERO,
    steps,
  });

  const excl = prepared.exclusionStats;
  return {
    method: "stv",
    candidateIds: [...input.candidateIds],
    seats: input.seats,
    totalValid: serializeRational(prepared.totalValid),
    quota: serializeRational(quota),
    excludedBallotCount: excl.excludedBallotGroupCount,
    excludedBallotGroupCount: excl.excludedBallotGroupCount,
    excludedKnownWeight: excl.excludedKnownWeight,
    unknownWeightGroups: excl.unknownWeightGroups,
    excludedByReason: excl.excludedByReason,
    elected,
    eliminated,
    exhausted: serializeRational(exhausted),
    retainedWithElected: serializeRational(retainedWithElected),
    steps,
    firstPreferences: serializeTotals(firstPreferences),
  };
}

function tally(live: LiveBallot[], continuing: Set<CandidateId>): Map<CandidateId, Rational> {
  const totals = new Map<CandidateId, Rational>();
  for (const id of continuing) totals.set(id, ZERO);
  for (const lb of live) {
    if (lb.credited && continuing.has(lb.credited) && gt(lb.weight, ZERO)) {
      totals.set(lb.credited, add(totals.get(lb.credited)!, lb.weight));
    }
  }
  return totals;
}

function cloneMap(m: Map<CandidateId, Rational>): Map<CandidateId, Rational> {
  return new Map(m);
}

function continuingTotal(live: LiveBallot[], continuing: Set<CandidateId>): Rational {
  return sum(
    live
      .filter((lb) => lb.credited && continuing.has(lb.credited) && gt(lb.weight, ZERO))
      .map((lb) => lb.weight),
  );
}

export function assertVoteConservation(
  totalValid: Rational,
  live: LiveBallot[],
  continuing: Set<CandidateId>,
  exhausted: Rational,
  retainedWithElected: Rational,
): void {
  const cont = continuingTotal(live, continuing);
  const parts = add(add(cont, exhausted), retainedWithElected);
  if (!eq(parts, totalValid)) {
    throw new Error(
      `vote conservation violated: ${serializeRational(parts)} != ${serializeRational(totalValid)}`,
    );
  }
}

/** Public invariant: every STV step archives exact conservation of total_valid. */
export function assertStvResultConservation(result: StvResult): void {
  for (const step of result.steps) {
    if (step.conservationTotal !== result.totalValid) {
      throw new Error(
        `STV step ${step.step} conservation ${step.conservationTotal} != totalValid ${result.totalValid}`,
      );
    }
  }
}

function pushStep(args: {
  step: number;
  action: StvStep["action"];
  totalsBefore: Map<CandidateId, Rational>;
  live: LiveBallot[];
  continuing: Set<CandidateId>;
  exhausted: Rational;
  retainedWithElected: Rational;
  quota: Rational;
  seats: number;
  electedCount: number;
  transfers: TransferLine[];
  newlyExhausted: Rational;
  steps: StvStep[];
  electedId?: CandidateId;
  electedIds?: CandidateId[];
  eliminatedId?: CandidateId;
  surplus?: Rational;
  transferableTotal?: Rational;
  transferFactor?: Rational;
  retainedNonTransferable?: Rational;
  retainedAboveQuota?: Rational;
  tieResolution?: TieResolution;
}): void {
  const after = tally(args.live, args.continuing);
  const cont = continuingTotal(args.live, args.continuing);
  const conservationTotal = add(add(cont, args.exhausted), args.retainedWithElected);
  args.steps.push({
    step: args.step,
    action: args.action,
    totalsBefore: serializeTotals(args.totalsBefore),
    totalsAfter: serializeTotals(after),
    quota: serializeRational(args.quota),
    seatsFilled: args.electedCount,
    seatsRemaining: args.seats - args.electedCount,
    ...(args.electedId ? { electedId: args.electedId } : {}),
    ...(args.electedIds ? { electedIds: args.electedIds } : {}),
    ...(args.eliminatedId ? { eliminatedId: args.eliminatedId } : {}),
    ...(args.surplus ? { surplus: serializeRational(args.surplus) } : {}),
    ...(args.transferableTotal
      ? { transferableTotal: serializeRational(args.transferableTotal) }
      : {}),
    ...(args.transferFactor ? { transferFactor: serializeRational(args.transferFactor) } : {}),
    ...(args.retainedNonTransferable
      ? { retainedNonTransferable: serializeRational(args.retainedNonTransferable) }
      : {}),
    ...(args.retainedAboveQuota
      ? { retainedAboveQuota: serializeRational(args.retainedAboveQuota) }
      : {}),
    transfers: args.transfers,
    newlyExhausted: serializeRational(args.newlyExhausted),
    exhaustedTotal: serializeRational(args.exhausted),
    retainedWithElectedTotal: serializeRational(args.retainedWithElected),
    continuingTotal: serializeRational(cont),
    conservationTotal: serializeRational(conservationTotal),
    ...(args.tieResolution ? { tieResolution: args.tieResolution } : {}),
  });
}
