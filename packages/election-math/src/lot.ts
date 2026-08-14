import type { CandidateId, LotArchive, Uint32Source } from "./types.js";

const RANGE = 0x1_0000_0000; // 2^32

/**
 * Deterministic rejection-sampled lot over lexicographically sorted IDs.
 * Does not import simulation RNG — caller injects Uint32Source.
 */
export function resolveLegalLot(tiedIds: CandidateId[], rng: Uint32Source): LotArchive {
  if (tiedIds.length === 0) throw new Error("legal lot requires at least one candidate");
  const sortedTiedIds = [...tiedIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = sortedTiedIds.length;
  const limit = Math.floor(RANGE / n) * n;
  if (limit <= 0) throw new Error("illegal lot limit");

  const draws: number[] = [];
  for (;;) {
    const draw = rng.nextUint32() >>> 0;
    draws.push(draw);
    if (draw < limit) {
      const selectedIndex = draw % n;
      return {
        sortedTiedIds,
        draws,
        acceptedDraw: draw,
        limit,
        selectedIndex,
        selectedId: sortedTiedIds[selectedIndex]!,
        n,
      };
    }
  }
}
