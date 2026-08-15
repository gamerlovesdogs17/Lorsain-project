import {
  countStv,
  type BallotGroupInput,
  type StvResult,
} from "../../packages/election-math/src/index.ts";
import type { RngService } from "../../packages/sim/src/index.ts";
import { allocateSeats } from "./allocate_seats.ts";
import { blendedPriors, normalizeRecord, partyAffinityMatrix } from "./geography.ts";
import {
  PARTY_IDS,
  SEAT_TARGETS,
  asUint32Source,
  float01,
  intRange,
  type Constituency,
  type PartyId,
} from "./shared.ts";

export type ElectCandidate = {
  id: string;
  name: string;
  party_id: PartyId | null;
  faction_id: string | null;
  quality: number;
  mustWin?: boolean;
  kind: "politician" | "historical";
};

export type DistrictStvMetrics = {
  first_count_elected: number;
  elected_after_transfer: number;
  eliminations: number;
  surplus_steps: number;
  elect_remaining_steps: number;
  exhausted: string;
  same_party_transfer_events: number;
};

export type ConstituencyElection = {
  constituency_id: string;
  seats: number;
  total_valid: string;
  quota: string;
  turnout: {
    total_population: number;
    registered_electorate: number;
    ballots_cast: number;
    turnout_rate: number;
    invalid_or_blank: number;
    valid_vote_value: bigint;
  };
  candidates: Array<{
    id: string;
    name: string;
    party_id: PartyId | null;
    faction_id: string | null;
    kind: "politician" | "historical";
  }>;
  ballots: BallotGroupInput[];
  result: StvResult;
  winners: string[];
  party_seats: Record<PartyId, number>;
  metrics: DistrictStvMetrics;
};

function partyOf(c: ElectCandidate): PartyId {
  return (c.party_id ?? "PARTY_IND") as PartyId;
}

function parseNum(ser: string): number {
  const [n, d] = ser.split("/").map(Number);
  return (n ?? 0) / (d || 1);
}

export function analyzeStvResult(
  result: StvResult,
  candidates: ElectCandidate[],
): DistrictStvMetrics {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  let surplus = 0;
  let electRemaining = 0;
  let samePartyTransfers = 0;

  for (const step of result.steps) {
    if (step.action === "elect_surplus") {
      surplus += 1;
      if (step.electedId) {
        for (const t of step.transfers) {
          const from = byId.get(step.electedId);
          const to = byId.get(t.toCandidateId);
          if (from && to && partyOf(from) === partyOf(to) && parseNum(t.value) > 0) {
            samePartyTransfers += 1;
          }
        }
      }
    }
    if (step.action === "eliminate" && step.eliminatedId) {
      for (const t of step.transfers) {
        const from = byId.get(step.eliminatedId);
        const to = byId.get(t.toCandidateId);
        if (from && to && partyOf(from) === partyOf(to) && parseNum(t.value) > 0) {
          samePartyTransfers += 1;
        }
      }
    }
    if (step.action === "elect_remaining") electRemaining += 1;
  }

  const quota = parseNum(result.quota);
  let firstCountElected = 0;
  for (const id of result.elected) {
    const fp = parseNum(result.firstPreferences[id] ?? "0/1");
    if (fp + 1e-12 >= quota) firstCountElected += 1;
  }

  return {
    first_count_elected: firstCountElected,
    elected_after_transfer: result.elected.length - firstCountElected,
    eliminations: result.eliminated.length,
    surplus_steps: surplus,
    elect_remaining_steps: electRemaining,
    exhausted: result.exhausted,
    same_party_transfer_events: samePartyTransfers,
  };
}

export function buildBallotsForDistrict(args: {
  constituency: Constituency;
  candidates: ElectCandidate[];
  partyShares: Record<PartyId, number>;
  totalValid: bigint;
  rng: RngService;
}): BallotGroupInput[] {
  const { candidates, partyShares, totalValid, rng, constituency } = args;
  const affinity = partyAffinityMatrix();
  const byParty = new Map<PartyId, ElectCandidate[]>();
  for (const c of candidates) {
    const p = partyOf(c);
    if (!byParty.has(p)) byParty.set(p, []);
    byParty.get(p)!.push(c);
  }

  const ballots: BallotGroupInput[] = [];
  let assigned = 0n;
  const partiesPresent = PARTY_IDS.filter((p) => (byParty.get(p)?.length ?? 0) > 0);

  // Renormalize shares over parties that fielded candidates
  const rawShares = Object.fromEntries(
    partiesPresent.map((p) => [p, Math.max(0.004, partyShares[p] ?? 0.004)]),
  ) as Record<PartyId, number>;
  const shares = normalizeRecord(rawShares);

  for (const pid of partiesPresent) {
    const slate = [...(byParty.get(pid) ?? [])].sort(
      (a, b) => b.quality - a.quality || a.id.localeCompare(b.id),
    );
    const partyVotes = BigInt(Math.max(1, Math.round(Number(totalValid) * shares[pid]!)));
    const weights = slate.map(
      (c) => Math.pow(Math.max(0.12, c.quality), 1.35) * (0.75 + float01(rng) * 0.5),
    );
    const wSum = weights.reduce((a, b) => a + b, 0);
    const fpCounts: bigint[] = [];
    let fpAssigned = 0n;
    for (let i = 0; i < slate.length; i++) {
      const w =
        i === slate.length - 1
          ? partyVotes - fpAssigned
          : BigInt(Math.max(1, Math.round((weights[i]! / wSum) * Number(partyVotes))));
      fpCounts.push(w);
      fpAssigned += w;
    }
    if (fpAssigned !== partyVotes && fpCounts.length) {
      fpCounts[0] = fpCounts[0]! + (partyVotes - fpAssigned);
    }

    for (let i = 0; i < slate.length; i++) {
      const lead = slate[i]!;
      let rem = fpCounts[i]!;
      if (rem <= 0n) continue;
      const variants = intRange(rng, 2, 4);
      for (let v = 0; v < variants; v++) {
        const chunk =
          v === variants - 1 ? rem : BigInt(Math.max(1, Math.floor(Number(rem) / (variants - v))));
        rem -= chunk;
        if (chunk <= 0n) continue;

        const samePartyRest = slate
          .filter((c) => c.id !== lead.id)
          .sort((a, b) => b.quality + float01(rng) * 0.35 - (a.quality + float01(rng) * 0.35));
        const rankings: string[] = [lead.id, ...samePartyRest.map((c) => c.id)];

        const depth =
          float01(rng) < 0.22 ? 0 : float01(rng) < 0.5 ? 2 : float01(rng) < 0.78 ? 4 : 7;
        let added = 0;
        for (const otherPid of affinity[pid] ?? PARTY_IDS) {
          if (otherPid === pid) continue;
          if (added >= depth) break;
          const others = [...(byParty.get(otherPid) ?? [])].sort(
            (a, b) => b.quality - a.quality || a.id.localeCompare(b.id),
          );
          for (const o of others.slice(0, 2)) {
            if (added >= depth) break;
            if (!rankings.includes(o.id)) {
              rankings.push(o.id);
              added += 1;
            }
          }
        }

        ballots.push({
          id: `${constituency.id}_${pid}_${lead.id}_v${v}`,
          rankings,
          weight: chunk.toString(),
        });
        assigned += chunk;
      }
    }
  }

  if (assigned !== totalValid && ballots.length) {
    const last = ballots[ballots.length - 1]!;
    last.weight = (BigInt(last.weight) + (totalValid - assigned)).toString();
  }
  return ballots;
}

export function runDistrictElection(args: {
  constituency: Constituency;
  candidates: ElectCandidate[];
  partyShares: Record<PartyId, number>;
  rng: RngService;
}): ConstituencyElection {
  const S = args.constituency.seats;
  const turnoutMeta = districtTurnout(args.constituency, args.rng);
  const totalValid = turnoutMeta.valid_vote_value;
  const ballots = buildBallotsForDistrict({
    constituency: args.constituency,
    candidates: args.candidates,
    partyShares: args.partyShares,
    totalValid,
    rng: args.rng,
  });
  const result = countStv(
    {
      candidateIds: args.candidates.map((c) => c.id),
      seats: S,
      ballots,
    },
    { rng: asUint32Source(args.rng) },
  );

  const party_seats = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  const byId = new Map(args.candidates.map((c) => [c.id, c]));
  for (const id of result.elected) {
    party_seats[partyOf(byId.get(id)!)] += 1;
  }

  return {
    constituency_id: args.constituency.id,
    seats: S,
    total_valid: result.totalValid,
    quota: result.quota,
    turnout: turnoutMeta,
    candidates: args.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      party_id: c.party_id,
      faction_id: c.faction_id,
      kind: c.kind,
    })),
    ballots,
    result,
    winners: result.elected,
    party_seats,
    metrics: analyzeStvResult(result, args.candidates),
  };
}

/** Deterministic historical turnout from constituency population (not seats×100k). */
export function districtTurnout(
  c: Constituency,
  rng: RngService,
): {
  total_population: number;
  registered_electorate: number;
  ballots_cast: number;
  turnout_rate: number;
  invalid_or_blank: number;
  valid_vote_value: bigint;
} {
  // Adult/registered share ~70–79% of population
  const regRate = 0.7 + float01(rng) * 0.09;
  const registered = Math.max(c.seats * 40_000, Math.round(c.population * regRate));
  // Turnout 57–76%
  const turnout_rate = Math.round((0.57 + float01(rng) * 0.19) * 1000) / 1000;
  const ballots_cast = Math.max(c.seats * 25_000, Math.round(registered * turnout_rate));
  // Invalid/blank 0.6–2.2%
  const invalid_rate = 0.006 + float01(rng) * 0.016;
  const invalid_or_blank = Math.max(1, Math.round(ballots_cast * invalid_rate));
  const valid = Math.max(c.seats * 20_000, ballots_cast - invalid_or_blank);
  return {
    total_population: c.population,
    registered_electorate: registered,
    ballots_cast,
    turnout_rate,
    invalid_or_blank,
    valid_vote_value: BigInt(valid),
  };
}

export type NationalElectionBundle = {
  elections: ConstituencyElection[];
  national_party_seats: Record<PartyId, number>;
  national_first_preference_shares: Record<PartyId, number>;
  realism: NationalStvRealism;
  iterations: number;
};

export type NationalStvRealism = {
  total_eliminations: number;
  total_first_count_elected: number;
  total_elected_after_transfer: number;
  total_surplus_steps: number;
  total_same_party_transfer_events: number;
  districts_with_eliminations: number;
  districts_with_transfer_wins: number;
  exhausted_share: number;
  legal_lots: number;
};

function nationalSeats(elections: ConstituencyElection[]): Record<PartyId, number> {
  const out = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  for (const el of elections) {
    for (const p of PARTY_IDS) out[p] += el.party_seats[p];
  }
  return out;
}

function fpShares(elections: ConstituencyElection[]): Record<PartyId, number> {
  const fp = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  let total = 0;
  for (const el of elections) {
    const byId = new Map(el.candidates.map((c) => [c.id, c]));
    for (const [cid, ser] of Object.entries(el.result.firstPreferences)) {
      const p = (byId.get(cid)?.party_id ?? "PARTY_IND") as PartyId;
      const v = parseNum(ser);
      fp[p] += v;
      total += v;
    }
  }
  return Object.fromEntries(PARTY_IDS.map((p) => [p, fp[p]! / total])) as Record<PartyId, number>;
}

function realismMetrics(elections: ConstituencyElection[]): NationalStvRealism {
  let elim = 0;
  let first = 0;
  let after = 0;
  let surplus = 0;
  let same = 0;
  let distElim = 0;
  let distTransfer = 0;
  let exhausted = 0;
  let valid = 0;
  let lots = 0;
  for (const el of elections) {
    elim += el.metrics.eliminations;
    first += el.metrics.first_count_elected;
    after += el.metrics.elected_after_transfer;
    surplus += el.metrics.surplus_steps;
    same += el.metrics.same_party_transfer_events;
    if (el.metrics.eliminations > 0) distElim += 1;
    if (el.metrics.elected_after_transfer > 0) distTransfer += 1;
    exhausted += parseNum(el.metrics.exhausted);
    valid += parseNum(el.total_valid);
    for (const step of el.result.steps) {
      if (step.tieResolution?.method === "legal_lot") lots += 1;
    }
  }
  return {
    total_eliminations: elim,
    total_first_count_elected: first,
    total_elected_after_transfer: after,
    total_surplus_steps: surplus,
    total_same_party_transfer_events: same,
    districts_with_eliminations: distElim,
    districts_with_transfer_wins: distTransfer,
    exhausted_share: valid > 0 ? exhausted / valid : 0,
    legal_lots: lots,
  };
}

/**
 * Calibrate latent party support so STV produces exact national seat targets,
 * while individual winners emerge from election-math (not predetermined quota packs).
 */
export function calibrateNationalElection(args: {
  constituencies: Constituency[];
  candidatesByConst: Record<string, ElectCandidate[]>;
  rng: RngService;
  maxIter?: number;
}): NationalElectionBundle {
  const maxIter = args.maxIter ?? 80;
  const seatTargets = allocateSeats(args.constituencies, args.rng);

  // Per-district party share multipliers (start from blended priors, nudged toward seat targets)
  const shares: Record<string, Record<PartyId, number>> = {};
  for (const c of args.constituencies) {
    const prior = normalizeRecord(blendedPriors(c));
    const target = seatTargets[c.id]!;
    const nudged = Object.fromEntries(
      PARTY_IDS.map((p) => {
        const seatShare = target[p]! / c.seats;
        return [p, prior[p]! * 0.55 + seatShare * 0.45];
      }),
    ) as Record<PartyId, number>;
    shares[c.id] = normalizeRecord(nudged);
  }

  // Personal quality boosts for must-win candidates
  const qualityBoost: Record<string, number> = {};

  let elections: ConstituencyElection[] = [];
  let iter = 0;
  let seats = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;

  for (; iter < maxIter; iter++) {
    elections = args.constituencies.map((c) => {
      const cands = args.candidatesByConst[c.id]!.map((cand) => ({
        ...cand,
        quality: cand.quality * (qualityBoost[cand.id] ?? 1),
      }));
      return runDistrictElection({
        constituency: c,
        candidates: cands,
        partyShares: shares[c.id]!,
        rng: args.rng,
      });
    });
    seats = nationalSeats(elections);
    const ok = PARTY_IDS.every((p) => seats[p] === SEAT_TARGETS[p]);

    // Boost must-win losers
    for (const el of elections) {
      const elected = new Set(el.winners);
      for (const cand of args.candidatesByConst[el.constituency_id]!) {
        if (cand.mustWin && !elected.has(cand.id)) {
          qualityBoost[cand.id] = (qualityBoost[cand.id] ?? 1) * 1.12;
        }
      }
    }

    if (ok) break;

    // National share adjustment
    for (const p of PARTY_IDS) {
      const diff = SEAT_TARGETS[p] - seats[p]!;
      if (diff === 0) continue;
      const factor = 1 + Math.max(-0.12, Math.min(0.12, diff * 0.018));
      for (const c of args.constituencies) {
        shares[c.id]![p] = Math.max(0.004, shares[c.id]![p]! * factor);
      }
    }

    // District repair toward seat-target party counts
    for (const el of elections) {
      const target = seatTargets[el.constituency_id]!;
      for (const p of PARTY_IDS) {
        const d = target[p]! - el.party_seats[p]!;
        if (d === 0) continue;
        shares[el.constituency_id]![p] = Math.max(
          0.004,
          shares[el.constituency_id]![p]! * (1 + Math.max(-0.15, Math.min(0.15, d * 0.06))),
        );
      }
      shares[el.constituency_id] = normalizeRecord(shares[el.constituency_id]!);
    }
  }

  seats = nationalSeats(elections);
  for (const p of PARTY_IDS) {
    if (seats[p] !== SEAT_TARGETS[p]) {
      throw new Error(
        `STV calibration failed after ${iter} iters: ${p}=${seats[p]} want ${SEAT_TARGETS[p]}. Seats=${JSON.stringify(seats)}`,
      );
    }
  }

  const realism = realismMetrics(elections);
  if (realism.total_eliminations < 30) {
    throw new Error(
      `STV realism fail: only ${realism.total_eliminations} eliminations nationally (need substantial eliminations)`,
    );
  }
  if (realism.districts_with_eliminations < 20) {
    throw new Error(
      `STV realism fail: only ${realism.districts_with_eliminations}/48 districts had eliminations`,
    );
  }
  if (realism.total_first_count_elected === 420) {
    throw new Error("STV realism fail: all winners elected on first preferences");
  }
  if (realism.total_elected_after_transfer < 40) {
    throw new Error(
      `STV realism fail: only ${realism.total_elected_after_transfer} elected after transfers`,
    );
  }

  return {
    elections,
    national_party_seats: seats,
    national_first_preference_shares: fpShares(elections),
    realism,
    iterations: iter + 1,
  };
}
