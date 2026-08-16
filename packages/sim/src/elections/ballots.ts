import { add, fromInt, parseRational, serializeRational } from "@lorsain/election-math";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { BALLOT_GROUPS, PREFERENCE_REALIZATION, TRANSFER } from "./policy.js";
import { blocSupportShares, electoralPartyId, publicCandidateFacts } from "./support.js";
import type {
  BallotGroupArchive,
  IdeologyVector,
  PublicCandidateFacts,
  VoterBlocDefinition,
} from "./types.js";

const GROUP_KEYS = ["habitLoyalFull", "habitLoyalTrunc", "ideologyFull", "standingTrunc"] as const;

export function largestRemainder(parts: number[], total: number): number[] {
  if (parts.length === 0) return [];
  const sum = parts.reduce((a, b) => a + b, 0);
  if (!(total >= 0) || !Number.isInteger(total)) {
    throw new Error(`largestRemainder total must be a nonnegative integer, got ${total}`);
  }
  if (sum <= 0 || total <= 0) return parts.map(() => 0);
  const scaled = parts.map((p) => (p / sum) * total);
  const floors = scaled.map((x) => Math.floor(x));
  let used = floors.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (used < total && k < order.length) {
    floors[order[k]!.i]! += 1;
    used += 1;
    k += 1;
  }
  return floors;
}

export function integerBallotWeightSum(ballots: readonly BallotGroupArchive[]): bigint {
  let sum = 0n;
  for (const g of ballots) {
    const r = parseRational(g.weight);
    if (r.den !== 1n) {
      throw new Error(`ballot ${g.id} weight ${g.weight} is not an integer`);
    }
    sum += r.num;
  }
  return sum;
}

function gauss01(rng: RngService): number {
  const u1 = Math.max(1e-12, rng.float01("campaigns"));
  const u2 = rng.float01("campaigns");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function renormalizeShares(
  shares: Record<string, number>,
  ordered: readonly string[],
): Record<string, number> {
  let sum = 0;
  for (const id of ordered) sum += Math.max(0, shares[id] ?? 0);
  const out: Record<string, number> = {};
  if (sum <= 0) {
    const even = ordered.length ? 1 / ordered.length : 0;
    for (const id of ordered) out[id] = even;
    return out;
  }
  for (const id of ordered) out[id] = Math.max(0, shares[id] ?? 0) / sum;
  return out;
}

function realizeShares(
  shares: Record<string, number>,
  ordered: readonly string[],
  rng: RngService | null | undefined,
): Record<string, number> {
  if (!rng || PREFERENCE_REALIZATION.amplitude <= 0) return shares;
  const noisy: Record<string, number> = {};
  for (const id of ordered) {
    noisy[id] = (shares[id] ?? 0) + gauss01(rng) * PREFERENCE_REALIZATION.amplitude;
  }
  return renormalizeShares(noisy, ordered);
}

function distance(a: IdeologyVector, b: IdeologyVector): number {
  let s = 0;
  for (const k of Object.keys(a) as (keyof IdeologyVector)[]) {
    s += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  }
  return s / 6;
}

function homeProvinceShare(
  world: KernelWorld,
  bloc: VoterBlocDefinition,
  provinceId: string | null,
): number {
  if (!provinceId) return 0;
  const shares = world.constituencyElectorate[bloc.constituencyId]?.provincePopulationShares ?? [];
  return shares.find((s) => s.provinceId === provinceId)?.share ?? 0;
}

function rankCandidates(args: {
  world: KernelWorld;
  bloc: VoterBlocDefinition;
  candidates: PublicCandidateFacts[];
  first: string;
  mode: (typeof GROUP_KEYS)[number];
  shares: Record<string, number>;
}): string[] {
  const rest = args.candidates.filter((c) => c.politicianId !== args.first);
  const scored = rest.map((c) => {
    let s = 0;
    const first = args.candidates.find((x) => x.politicianId === args.first)!;
    if (first.publicIdeology && c.publicIdeology) {
      s += (1 - distance(first.publicIdeology, c.publicIdeology)) * TRANSFER.ideology;
    }
    const firstParty = electoralPartyId(args.world, first.partyId);
    const candParty = electoralPartyId(args.world, c.partyId);
    if (candParty && firstParty && candParty === firstParty) s += TRANSFER.partyFamily;
    const localShare = homeProvinceShare(args.world, args.bloc, c.homeProvinceId);
    if (localShare > 0) s += 0.15 * Math.min(1, localShare);
    if (c.homeProvinceId && first.homeProvinceId && c.homeProvinceId === first.homeProvinceId) {
      s += TRANSFER.regional;
    }
    s += ((c.standing.favorability + 1) / 2) * TRANSFER.standing;
    if (args.mode.startsWith("habit")) {
      s += candParty ? (args.bloc.partyHabit[candParty] ?? 0) * 0.8 : 0;
    }
    if (args.mode.startsWith("ideology") && args.bloc.ideology && c.publicIdeology) {
      s += (1 - distance(args.bloc.ideology, c.publicIdeology)) * 0.6;
    }
    if (args.mode.startsWith("standing")) s += c.standing.nameRecognition * 0.4;
    s += (args.shares[c.politicianId] ?? 0) * 0.2;
    return { id: c.politicianId, s };
  });
  scored.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
  const trunc = args.mode.endsWith("Trunc");
  const max = trunc
    ? Math.min(BALLOT_GROUPS.truncationAfter, scored.length + 1)
    : Math.min(BALLOT_GROUPS.maxRankings, scored.length + 1);
  return [args.first, ...scored.map((x) => x.id)].slice(0, max);
}

function blocTurnoutContribution(bloc: VoterBlocDefinition): number {
  return Math.max(0, bloc.weight) * Math.max(0, bloc.turnoutPropensity);
}

export function generateConstituencyBallots(
  world: KernelWorld,
  state: SimState,
  constituencyId: string,
  candidateIds: readonly string[],
  validVoteValue: number,
  ideologyById?: Record<string, IdeologyVector | null>,
  rng?: RngService | null,
  mobilizationByCandidate?: Record<string, number>,
): BallotGroupArchive[] {
  if (!Number.isInteger(validVoteValue) || validVoteValue < 0) {
    throw new Error(`validVoteValue must be a nonnegative integer, got ${validVoteValue}`);
  }
  const orderedCandidates = [...candidateIds].sort();
  const facts = orderedCandidates.map((id) => {
    const f = publicCandidateFacts(world, state, id, ideologyById?.[id] ?? null);
    if (!f) throw new Error(`unknown candidate ${id}`);
    return f;
  });
  const blocIds = (world.voterBlocIdsByConstituency[constituencyId] ?? []).slice().sort();
  const blocs = blocIds
    .map((id) => world.voterBlocs[id])
    .filter((b): b is VoterBlocDefinition => !!b);
  const blocParts = blocs.map(blocTurnoutContribution);
  const blocVotes = largestRemainder(blocParts, validVoteValue);
  const sharesByMode = [
    BALLOT_GROUPS.habitLoyalFull,
    BALLOT_GROUPS.habitLoyalTrunc,
    BALLOT_GROUPS.ideologyFull,
    BALLOT_GROUPS.standingTrunc,
  ];
  const groups: BallotGroupArchive[] = [];
  for (let b = 0; b < blocs.length; b++) {
    const bloc = blocs[b]!;
    const nBloc = blocVotes[b]!;
    if (nBloc <= 0) continue;
    const latent = blocSupportShares(world, state, bloc, orderedCandidates, ideologyById);
    let shares = realizeShares(latent, orderedCandidates, rng);
    if (mobilizationByCandidate) {
      const scaled: Record<string, number> = {};
      for (const id of orderedCandidates) {
        const factor = mobilizationByCandidate[id];
        scaled[id] = (shares[id] ?? 0) * (factor == null ? 1 : Math.max(0, factor));
      }
      shares = renormalizeShares(scaled, orderedCandidates);
    }
    const firstPrefVotes = largestRemainder(
      orderedCandidates.map((id) => shares[id] ?? 0),
      nBloc,
    );
    for (let c = 0; c < orderedCandidates.length; c++) {
      const first = orderedCandidates[c]!;
      const nFirst = firstPrefVotes[c]!;
      if (nFirst <= 0) continue;
      const modeVotes = largestRemainder(sharesByMode, nFirst);
      for (let m = 0; m < GROUP_KEYS.length; m++) {
        const n = modeVotes[m]!;
        if (n <= 0) continue;
        const mode = GROUP_KEYS[m]!;
        groups.push({
          id: `${bloc.id}:${first}:${mode}`,
          weight: serializeRational(fromInt(n)),
          rankings: rankCandidates({
            world,
            bloc,
            candidates: facts,
            first,
            mode,
            shares,
          }),
        });
      }
    }
  }
  return groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function mergeNationalBallots(
  groupsByConstituency: BallotGroupArchive[][],
): BallotGroupArchive[] {
  const merged = new Map<
    string,
    { weight: ReturnType<typeof parseRational>; rankings: string[] }
  >();
  for (const groups of groupsByConstituency) {
    for (const g of groups) {
      const w = parseRational(g.weight);
      if (w.den !== 1n) {
        throw new Error(`ballot ${g.id} weight ${g.weight} is not an integer`);
      }
      const prev = merged.get(g.id);
      if (prev) prev.weight = add(prev.weight, w);
      else merged.set(g.id, { weight: w, rankings: g.rankings });
    }
  }
  return [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, v]) => ({
      id,
      weight: serializeRational(v.weight),
      rankings: v.rankings,
    }));
}

export function firstPreferenceTotals(
  ballots: readonly BallotGroupArchive[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of ballots) {
    const top = g.rankings[0];
    if (!top) continue;
    const r = parseRational(g.weight);
    if (r.den !== 1n) throw new Error(`ballot ${g.id} weight is not an integer`);
    out[top] = (out[top] ?? 0) + Number(r.num);
  }
  return out;
}
