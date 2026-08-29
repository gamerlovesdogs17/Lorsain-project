import type { Rational } from "./rational.js";
import { add, parseRational, serializeRational, ZERO } from "./rational.js";

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
  /** Ballot-group ID in legacy archives; @aggregate:* in compact exact archives. */
  ballotGroupId: string;
};

/**
 * Preserve exact transfer totals while avoiding one persisted line per modeled
 * ballot group. The count itself still runs on every group; only its archive is
 * folded by destination after the step is complete.
 */
export function aggregateTransferLines(lines: TransferLine[]): TransferLine[] {
  const grouped = new Map<CandidateId | null, Rational>();
  for (const line of lines) {
    grouped.set(
      line.toCandidateId,
      add(grouped.get(line.toCandidateId) ?? ZERO, parseRational(line.value)),
    );
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => {
      if (a == null) return b == null ? 0 : 1;
      if (b == null) return -1;
      return a.localeCompare(b);
    })
    .map(([toCandidateId, value]) => ({
      toCandidateId,
      value: serializeRational(value),
      ballotGroupId: `@aggregate:${toCandidateId ?? "exhausted"}`,
    }));
}

export function serializeTotals(map: Map<CandidateId, Rational>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, v] of [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    out[id] = serializeRational(v);
  }
  return out;
}
