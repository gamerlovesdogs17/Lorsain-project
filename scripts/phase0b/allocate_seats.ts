import type { RngService } from "../../packages/sim/src/index.ts";
import { blendedPriors } from "./geography.ts";
import type { Constituency, PartyId } from "./shared.ts";
import { PARTY_IDS, SEAT_TARGETS, float01 } from "./shared.ts";

export { blendedPriors } from "./geography.ts";

/**
 * Allocate exact national seat targets across constituencies using
 * geography-weighted Hamilton + repair. Used as calibration targets /
 * slate sizing guidance — not as predetermined STV winners.
 */
export function allocateSeats(
  constituencies: Constituency[],
  rng: RngService,
): Record<string, Record<PartyId, number>> {
  const alloc: Record<string, Record<PartyId, number>> = {};
  for (const c of constituencies) {
    alloc[c.id] = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  }

  const nationalPrior = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  const local = new Map<string, Record<PartyId, number>>();
  for (const c of constituencies) {
    const p = blendedPriors(c);
    local.set(c.id, p);
    for (const pid of PARTY_IDS) nationalPrior[pid] += p[pid] * c.seats;
  }

  for (const pid of PARTY_IDS) {
    const target = SEAT_TARGETS[pid];
    const weights = constituencies.map((c) => {
      const p = local.get(c.id)!;
      return { id: c.id, w: p[pid] * c.seats };
    });
    const sumW = weights.reduce((s, x) => s + x.w, 0);
    const exact = weights.map((x) => ({ id: x.id, q: (x.w / sumW) * target }));
    const floors = exact.map((x) => ({
      id: x.id,
      n: Math.floor(x.q),
      frac: x.q - Math.floor(x.q),
    }));
    let assigned = floors.reduce((s, x) => s + x.n, 0);
    const order = [...floors].sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
    let i = 0;
    while (assigned < target) {
      floors.find((f) => f.id === order[i % order.length]!.id)!.n += 1;
      assigned += 1;
      i += 1;
    }
    for (const f of floors) alloc[f.id]![pid] = f.n;
  }

  for (const c of constituencies) {
    const row = alloc[c.id]!;
    let sum = PARTY_IDS.reduce((s, p) => s + row[p], 0);
    const priors = local.get(c.id)!;
    const partiesByPrior = [...PARTY_IDS].sort(
      (a, b) => priors[b] - priors[a] || a.localeCompare(b),
    );
    let guard = 0;
    while (sum > c.seats && guard++ < 1000) {
      const victim = [...partiesByPrior].reverse().find((p) => row[p] > 0) ?? "PARTY_IND";
      row[victim] -= 1;
      sum -= 1;
    }
    while (sum < c.seats && guard++ < 1000) {
      const add = partiesByPrior[0]!;
      const under = partiesByPrior.find((p) => nationalCount(alloc, p) < SEAT_TARGETS[p]);
      const pid = under ?? add;
      row[pid] += 1;
      sum += 1;
    }
  }

  for (let iter = 0; iter < 5000; iter++) {
    const counts = Object.fromEntries(PARTY_IDS.map((p) => [p, nationalCount(alloc, p)])) as Record<
      PartyId,
      number
    >;
    const over = PARTY_IDS.filter((p) => counts[p] > SEAT_TARGETS[p]);
    const under = PARTY_IDS.filter((p) => counts[p] < SEAT_TARGETS[p]);
    if (over.length === 0 && under.length === 0) break;
    let moved = false;
    for (const o of over) {
      for (const u of under) {
        for (const c of constituencies) {
          const row = alloc[c.id]!;
          if (row[o] > 0) {
            row[o] -= 1;
            row[u] += 1;
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) {
      const c = constituencies[Math.floor(float01(rng) * constituencies.length)]!;
      const row = alloc[c.id]!;
      const o = over[0];
      const u = under[0];
      if (o && u && row[o] > 0) {
        row[o] -= 1;
        row[u] += 1;
      }
    }
  }

  for (const c of constituencies) {
    const sum = PARTY_IDS.reduce((s, p) => s + alloc[c.id]![p], 0);
    if (sum !== c.seats) throw new Error(`${c.id} seat alloc ${sum} != ${c.seats}`);
  }
  for (const p of PARTY_IDS) {
    const n = nationalCount(alloc, p);
    if (n !== SEAT_TARGETS[p]) throw new Error(`${p} national ${n} != ${SEAT_TARGETS[p]}`);
  }
  return alloc;
}

function nationalCount(alloc: Record<string, Record<PartyId, number>>, party: PartyId): number {
  return Object.values(alloc).reduce((s, row) => s + row[party], 0);
}

export function partyStrengthOrder(c: Constituency): PartyId[] {
  const p = blendedPriors(c);
  return [...PARTY_IDS].sort((a, b) => p[b] - p[a] || a.localeCompare(b));
}
