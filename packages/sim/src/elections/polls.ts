import type { CommandError, KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { compareIsoDate, daysBetween } from "../calendar.js";
import { padId } from "../scheduler.js";
import {
  isLikelyVoterMethod,
  isRecognizedPollMethod,
  POLL,
  pollsterAllowsGeography,
} from "./policy.js";
import { activeElectionCandidateIds } from "./field.js";
import { aggregateSupport, electoralPartyId } from "./support.js";
import type { ElectionGeographyKind, IdeologyVector, PollRecord } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function gauss01(rng: RngService): number {
  const u1 = Math.max(1e-12, rng.float01("campaigns"));
  const u2 = rng.float01("campaigns");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function renormalize(shares: Record<string, number>): Record<string, number> {
  let sum = 0;
  for (const v of Object.values(shares)) sum += Math.max(0, v);
  const out: Record<string, number> = {};
  if (sum <= 0) {
    const ids = Object.keys(shares);
    const even = ids.length ? 1 / ids.length : 0;
    for (const id of ids) out[id] = even;
    return out;
  }
  for (const [id, v] of Object.entries(shares)) out[id] = Math.max(0, v) / sum;
  return out;
}

function applyHouseEffects(
  world: KernelWorld,
  shares: Record<string, number>,
  partyByCandidate: Record<string, string | null>,
  house: Record<string, number>,
): { shares: Record<string, number>; applied: Record<string, number> } {
  const partyMembers: Record<string, string[]> = {};
  for (const [cid, party] of Object.entries(partyByCandidate)) {
    const key = electoralPartyId(world, party) ?? world.independentAggregatePartyId;
    (partyMembers[key] ??= []).push(cid);
  }
  const next = { ...shares };
  const applied: Record<string, number> = {};
  for (const [partyId, members] of Object.entries(partyMembers)) {
    const effect = house[partyId] ?? 0;
    applied[partyId] = effect;
    if (members.length === 0 || effect === 0) continue;
    const partyShare = members.reduce((a, id) => a + (next[id] ?? 0), 0);
    if (partyShare <= 0) {
      const even = effect / members.length;
      for (const id of members) next[id] = (next[id] ?? 0) + even;
      continue;
    }
    for (const id of members) {
      const w = (next[id] ?? 0) / partyShare;
      next[id] = (next[id] ?? 0) + effect * w;
    }
  }
  return { shares: renormalize(next), applied };
}

export function createPoll(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    pollsterId: string;
    electionId?: string | null;
    geographyKind: ElectionGeographyKind;
    provinceId?: string | null;
    constituencyId?: string | null;
    candidateIds: string[];
    partyByCandidate: Record<string, string | null>;
    ideologyById?: Record<string, IdeologyVector | null>;
    fieldStart: string;
    fieldEnd: string;
    publicationDate: string;
    sampleSize?: number;
    method?: string;
  },
): { poll: PollRecord } | { error: CommandError } {
  const pollster = world.pollsters[args.pollsterId];
  if (!pollster) return { error: reject("INVALID_POLLSTER", args.pollsterId) };
  if (args.candidateIds.length === 0)
    return { error: reject("EMPTY_FIELD", "poll field is empty") };
  const seen = new Set<string>();
  for (const id of args.candidateIds) {
    if (seen.has(id)) return { error: reject("INVALID_CANDIDATE", `duplicate ${id}`) };
    seen.add(id);
    if (!state.politicians[id]) return { error: reject("INVALID_CANDIDATE", id) };
  }
  if (compareIsoDate(args.fieldStart, world.scenarioStartDate) < 0) {
    return { error: reject("INVALID_DATES", "fieldStart before scenario start") };
  }
  if (compareIsoDate(args.fieldStart, args.fieldEnd) > 0) {
    return { error: reject("INVALID_DATES", "fieldStart after fieldEnd") };
  }
  if (compareIsoDate(args.fieldEnd, args.publicationDate) > 0) {
    return { error: reject("INVALID_DATES", "publicationDate before fieldEnd") };
  }
  if (compareIsoDate(args.publicationDate, state.currentDate) > 0) {
    return { error: reject("INVALID_DATES", "cannot publish a future poll") };
  }
  if (!pollsterAllowsGeography(pollster.scope, args.geographyKind)) {
    return {
      error: reject(
        "UNSUPPORTED_POLLSTER_SCOPE",
        `${pollster.id} scope ${pollster.scope} cannot conduct ${args.geographyKind} polls`,
      ),
    };
  }
  if (args.geographyKind === "province") {
    if (!args.provinceId || !world.provinceIds.includes(args.provinceId)) {
      return { error: reject("INVALID_GEOGRAPHY", String(args.provinceId)) };
    }
    if (args.constituencyId) {
      return { error: reject("INVALID_GEOGRAPHY", "province poll cannot name a constituency") };
    }
  } else if (args.geographyKind === "constituency") {
    if (!args.constituencyId || !world.constituencyElectorate[args.constituencyId]) {
      return { error: reject("INVALID_GEOGRAPHY", String(args.constituencyId)) };
    }
    if (args.provinceId) {
      return { error: reject("INVALID_GEOGRAPHY", "constituency poll cannot name a province") };
    }
  } else if (args.constituencyId || args.provinceId) {
    return { error: reject("INVALID_GEOGRAPHY", "national poll cannot name a local geography") };
  }
  if (args.electionId) {
    const election = state.elections[args.electionId];
    if (!election) return { error: reject("INVALID_ELECTION", args.electionId) };
    const field = new Set(activeElectionCandidateIds(election));
    if (field.size === 0) {
      return { error: reject("EMPTY_ELECTION_FIELD", args.electionId) };
    }
    for (const id of args.candidateIds) {
      if (!field.has(id)) {
        return {
          error: reject(
            "CANDIDATE_NOT_IN_ELECTION",
            `${id} is not an active candidate in ${args.electionId}`,
          ),
        };
      }
    }
  }
  const method = args.method ?? pollster.method;
  if (!isRecognizedPollMethod(method)) {
    return { error: reject("UNSUPPORTED_POLL_METHOD", method) };
  }
  if (args.sampleSize != null) {
    if (!Number.isInteger(args.sampleSize) || args.sampleSize < 1 || args.sampleSize > 20000) {
      return { error: reject("INVALID_SAMPLE_SIZE", String(args.sampleSize)) };
    }
  }
  let sampleSize = args.sampleSize;
  if (sampleSize == null) {
    const span = pollster.sampleSizeMax - pollster.sampleSizeMin + 1;
    sampleSize = pollster.sampleSizeMin + Math.floor(rng.float01("campaigns") * span);
  }
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 20000) {
    return { error: reject("INVALID_SAMPLE_SIZE", String(sampleSize)) };
  }
  const constituencyIds =
    args.geographyKind === "constituency" && args.constituencyId
      ? [args.constituencyId]
      : args.geographyKind === "province" && args.provinceId
        ? Object.keys(world.constituencyElectorate)
            .filter((constituencyId) => world.constituencyElectorate[constituencyId]?.provincePopulationShares.some(
              (share) => share.provinceId === args.provinceId && share.share > 0,
            ))
            .sort()
      : Object.keys(world.constituencyElectorate).sort();
  if (constituencyIds.length === 0) {
    return { error: reject("INVALID_GEOGRAPHY", "no electorate loaded") };
  }
  const exponent = isLikelyVoterMethod(method)
    ? POLL.likelyVoterTurnoutExponent
    : POLL.otherMethodTurnoutExponent;
  const latent = aggregateSupport(
    world,
    state,
    constituencyIds,
    args.candidateIds,
    (bloc) => Math.pow(bloc.turnoutPropensity, exponent),
    args.ideologyById,
  );
  const housed = applyHouseEffects(
    world,
    latent,
    args.partyByCandidate,
    pollster.houseEffectsByParty,
  );
  const noisy: Record<string, number> = {};
  const modelSd = POLL.modelErrorBase + (1 - pollster.quality) * POLL.qualityErrorScale;
  for (const id of [...args.candidateIds].sort()) {
    const p = housed.shares[id] ?? 0;
    const samplingSd = Math.sqrt(Math.max(1e-12, (p * (1 - p)) / sampleSize));
    noisy[id] = p + gauss01(rng) * samplingSd + gauss01(rng) * modelSd;
  }
  const observed = renormalize(noisy);
  const moe = 1.96 * Math.sqrt(0.25 / sampleSize);
  const id = padId("POLL", state.counters.nextPollId++);
  const poll: PollRecord = {
    id,
    pollsterId: args.pollsterId,
    electionId: args.electionId ?? null,
    geographyKind: args.geographyKind,
    provinceId: args.provinceId ?? null,
    constituencyId: args.constituencyId ?? null,
    fieldStart: args.fieldStart,
    fieldEnd: args.fieldEnd,
    publicationDate: args.publicationDate,
    sampleSize,
    method,
    candidateSnapshot: [...args.candidateIds].sort().map((politicianId) => ({
      politicianId,
      partyId: args.partyByCandidate[politicianId] ?? null,
    })),
    firstPreference: Object.entries(observed)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([politicianId, share]) => ({
        politicianId,
        partyId: args.partyByCandidate[politicianId] ?? null,
        share,
      })),
    marginOfError: moe,
    houseEffectApplied: housed.applied,
    metadata: { quality: pollster.quality },
  };
  state.polls[id] = poll;
  return { poll };
}

export function recentPolls(
  state: SimState,
  opts: { electionId: string; limit?: number },
): PollRecord[] {
  return Object.values(state.polls)
    .filter((p) => p.electionId === opts.electionId)
    .sort((a, b) =>
      a.publicationDate < b.publicationDate
        ? 1
        : a.publicationDate > b.publicationDate
          ? -1
          : a.id < b.id
            ? 1
            : -1,
    )
    .slice(0, opts.limit ?? 12);
}

export function contestPollAverage(
  state: SimState,
  currentDate: string,
  contestId: string,
): Record<string, number> {
  const polls = Object.values(state.polls)
    .filter((p) => p.electionId == null && p.metadata.contestId === contestId)
    .sort((a, b) =>
      a.publicationDate < b.publicationDate
        ? 1
        : a.publicationDate > b.publicationDate
          ? -1
          : a.id < b.id
            ? 1
            : -1,
    )
    .slice(0, 20);
  const acc: Record<string, number> = {};
  let wsum = 0;
  for (const poll of polls) {
    const age = Math.max(0, daysBetween(poll.publicationDate, currentDate));
    const recency = Math.pow(0.5, age / POLL.recencyHalfLifeDays);
    const quality = typeof poll.metadata.quality === "number" ? poll.metadata.quality : 0.7;
    const w = recency * (POLL.qualityAverageWeight * quality + (1 - POLL.qualityAverageWeight));
    for (const row of poll.firstPreference) {
      acc[row.politicianId] = (acc[row.politicianId] ?? 0) + w * row.share;
    }
    wsum += w;
  }
  if (wsum <= 0) return {};
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(acc)) out[id] = v / wsum;
  return out;
}

export function pollAverage(
  state: SimState,
  currentDate: string,
  opts: { electionId: string },
): Record<string, number> {
  const polls = recentPolls(state, { electionId: opts.electionId, limit: 20 });
  const acc: Record<string, number> = {};
  let wsum = 0;
  for (const poll of polls) {
    const age = Math.max(0, daysBetween(poll.publicationDate, currentDate));
    const recency = Math.pow(0.5, age / POLL.recencyHalfLifeDays);
    const quality = typeof poll.metadata.quality === "number" ? poll.metadata.quality : 0.7;
    const w = recency * (POLL.qualityAverageWeight * quality + (1 - POLL.qualityAverageWeight));
    for (const row of poll.firstPreference) {
      acc[row.politicianId] = (acc[row.politicianId] ?? 0) + w * row.share;
    }
    wsum += w;
  }
  if (wsum <= 0) return {};
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(acc)) out[id] = v / wsum;
  return out;
}

export function relevantPresidentialElectionId(state: SimState): string | null {
  const open = Object.values(state.elections)
    .filter((e) => e.type === "presidential" && e.status !== "resolved" && e.status !== "cancelled")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return open[0]?.id ?? null;
}
