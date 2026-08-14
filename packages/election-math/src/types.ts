import type { Rational } from "./rational.js";
import { serializeRational } from "./rational.js";

export type CandidateId = string;

export type BallotGroupInput = {
  /** Optional stable ID for debugging/archives. */
  id?: string;
  /** Most preferred first. */
  rankings: CandidateId[];
  /** Exact weight as "num/den" or integer string. Must be > 0. */
  weight: string;
};

export type PreparedBallot = {
  id: string;
  rankings: CandidateId[];
  weight: Rational;
};

export type Uint32Source = {
  nextUint32(): number;
};

export type TieResolutionMethod = "previous_count_totals" | "first_preferences" | "legal_lot";

export type LotArchive = {
  sortedTiedIds: CandidateId[];
  draws: number[];
  acceptedDraw: number;
  limit: number;
  selectedIndex: number;
  selectedId: CandidateId;
  n: number;
};

export type TieResolution = {
  purpose: "eliminate_lowest" | "elect_highest_surplus" | "irv_eliminate";
  tiedIds: CandidateId[];
  method: TieResolutionMethod;
  chosenId: CandidateId;
  previousRoundIndex?: number;
  lot?: LotArchive;
};

export type TransferLine = {
  toCandidateId: CandidateId | null; // null = exhausted
  value: string; // serialized rational
  ballotGroupId: string;
};

export function serializeTotals(map: Map<CandidateId, Rational>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    out[id] = serializeRational(v);
  }
  return out;
}
