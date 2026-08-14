import { compare, type Rational, ZERO } from "./rational.js";
import { resolveLegalLot } from "./lot.js";
import type { CandidateId, TieResolution, Uint32Source } from "./types.js";

/**
 * Canonical tie hierarchy:
 * 1) previous completed count totals (walk backward through `historyTotals`)
 * 2) original first-preference totals
 * 3) legal lot
 *
 * Engine contract: callers pass `historyTotals` as prior completed count states
 * excluding the current decision state (typically `history.slice(0, -1)`).
 *
 * Reachability note for full IRV/STV counts:
 * - On the *first* count action, previous history is empty, so a tie is resolved by
 *   `first_preferences`, then `legal_lot` if still tied.
 * - After the opening tally is stored in history, that opening state equals the
 *   original first-preference totals for continuing candidates at count start.
 *   Later ties therefore usually resolve via `previous_count_totals` (including that
 *   opening state) before the dedicated `first_preferences` stage runs. The
 *   `first_preferences` method remains the explicit fallback before lot and is
 *   always tested directly with injected history maps.
 */
export function resolveTie(args: {
  purpose: TieResolution["purpose"];
  tiedIds: readonly CandidateId[];
  prefer: "lowest" | "highest";
  historyTotals: Array<Map<CandidateId, Rational>>;
  firstPreferences: Map<CandidateId, Rational>;
  rng: Uint32Source;
}): TieResolution {
  let pool = [...args.tiedIds];
  if (pool.length === 0) throw new Error("empty tie set");
  if (pool.length === 1) {
    return {
      purpose: args.purpose,
      tiedIds: pool,
      method: "previous_count_totals",
      chosenId: pool[0]!,
    };
  }

  const originalTied = [...args.tiedIds];

  for (let i = args.historyTotals.length - 1; i >= 0; i--) {
    const totals = args.historyTotals[i]!;
    const narrowed = narrowByTotals(pool, totals, args.prefer);
    if (narrowed.length === 1) {
      return {
        purpose: args.purpose,
        tiedIds: originalTied,
        method: "previous_count_totals",
        chosenId: narrowed[0]!,
        previousRoundIndex: i,
      };
    }
    pool = narrowed;
  }

  {
    const narrowed = narrowByTotals(pool, args.firstPreferences, args.prefer);
    if (narrowed.length === 1) {
      return {
        purpose: args.purpose,
        tiedIds: originalTied,
        method: "first_preferences",
        chosenId: narrowed[0]!,
      };
    }
    pool = narrowed;
  }

  const lot = resolveLegalLot(pool, args.rng);
  return {
    purpose: args.purpose,
    tiedIds: originalTied,
    method: "legal_lot",
    chosenId: lot.selectedId,
    lot,
  };
}

function narrowByTotals(
  pool: CandidateId[],
  totals: Map<CandidateId, Rational>,
  prefer: "lowest" | "highest",
): CandidateId[] {
  const ranked = [...pool].sort((a, b) => {
    const cmp = compare(totals.get(a) ?? ZERO, totals.get(b) ?? ZERO);
    if (cmp !== 0) return prefer === "lowest" ? cmp : -cmp;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const best = ranked[0]!;
  const bestVal = totals.get(best) ?? ZERO;
  return ranked.filter((id) => compare(totals.get(id) ?? ZERO, bestVal) === 0);
}
