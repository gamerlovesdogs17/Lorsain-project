/**
 * @lorsain/election-math — institution-agnostic IRV / STV counting (Phase 0.5).
 *
 * Exact BigInt rationals, Droop quota, Weighted Inclusive Gregory, canonical ties/lots.
 * Must not import simulation RNG, game UI, parties, politicians, or Terena content.
 * Inject Uint32Source for deterministic legal lots (simulation adapts its elections stream).
 */

export const ELECTION_MATH_PACKAGE_VERSION = "0.3.0-predev" as const;
export const ELECTION_MATH_PHASE = "0.5_complete" as const;

export {
  rational,
  fromBigInt,
  fromInt,
  parseRational,
  serializeRational,
  add,
  sub,
  mul,
  div,
  neg,
  compare,
  eq,
  lt,
  lte,
  gt,
  gte,
  isZero,
  isPositive,
  floor,
  min,
  max,
  sum,
  gcd,
  ZERO,
  ONE,
  type Rational,
} from "./rational.js";

export type {
  CandidateId,
  BallotGroupInput,
  PreparedBallot,
  Uint32Source,
  TieResolutionMethod,
  LotArchive,
  TieResolution,
  TransferLine,
} from "./types.js";
export { serializeTotals } from "./types.js";

export {
  prepareBallots,
  nextContinuingPreference,
  assertPositiveTotalValid,
  type BallotValidationResult,
  type ExcludedBallotStats,
  type ExcludedReasonStats,
} from "./ballots.js";
export { resolveLegalLot } from "./lot.js";
export { resolveTie } from "./tiebreak.js";

export { countIrv, type IrvInput, type IrvOptions, type IrvResult, type IrvRound } from "./irv.js";
export {
  countStv,
  assertVoteConservation,
  assertStvResultConservation,
  type StvInput,
  type StvOptions,
  type StvResult,
  type StvStep,
} from "./stv.js";

/** Canonical JSON serialization for byte-equivalent replay checks. */
export function serializeCountResult(result: unknown): string {
  return `${JSON.stringify(result, null, 0)}\n`;
}
