import {
  fromInt,
  isPositive,
  mul,
  parseRational,
  serializeRational,
  type Rational,
} from "@lorsain/election-math";
import { buildDecisionActorContext } from "../agents/context.js";
import { emptySignals, evaluateDecision, type DecisionOption } from "../agents/decisions.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import {
  CAMPAIGNS_NOISE_AMP,
  CR_FACTION_BLEND,
  CURRENT_FACTION_BLEND,
  ENDORSEMENT_INFLUENCE,
  RL_PROVINCE_FLOOR,
  SELECTOR_GROUP_IDIOSYNCRASY,
  SELECTOR_PROMINENCE,
  SELECTOR_PUBLIC_WEIGHTS,
  SELECTOR_TENDENCY_SHARES,
} from "./policy.js";
import { activeEndorsementsForContest } from "./endorsements.js";
import { resolveProvincialOrganization } from "./organizations.js";
import { assemblyCaucus, factionAssemblyCaucus, factionMembers, partyMembers } from "./queries.js";
import type {
  NominationMethod,
  PartyContest,
  SelectorGroup,
  SelectorKind,
  SelectorTendency,
} from "./types.js";
import { isNominationMethod } from "./types.js";
import { publicElectabilitySignal } from "../elections/electability.js";
import { contestPollAverage } from "../elections/polls.js";

function shareToRational(share: number): Rational {
  const den = 1_000_000;
  return parseRational(`${Math.max(0, Math.round(share * den))}/${den}`);
}

function publicProminence(entry: PartyContest["entries"][string]): number {
  const seed = entry.seedPresidentialStatus
    ? (SELECTOR_PROMINENCE[entry.seedPresidentialStatus] ?? 0)
    : 0;
  const statusBoost =
    entry.status === "declared" || entry.status === "qualified"
      ? 0.35
      : entry.status === "exploring"
        ? 0.2
        : 0.1;
  return Math.max(seed, statusBoost);
}

const activeOfficeKindCaches = new WeakMap<SimState, Map<string, Set<string>>>();

function activeOfficeKinds(world: KernelWorld, state: SimState): Map<string, Set<string>> {
  const existing = activeOfficeKindCaches.get(state);
  if (existing) return existing;
  const map = new Map<string, Set<string>>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const kind = world.offices[term.officeId]?.kind;
    if (!kind) continue;
    const kinds = map.get(term.holderId) ?? new Set<string>();
    kinds.add(kind);
    map.set(term.holderId, kinds);
  }
  activeOfficeKindCaches.set(state, map);
  return map;
}

function isKindHolder(world: KernelWorld, state: SimState, id: string, kind: string): boolean {
  return activeOfficeKinds(world, state).get(id)?.has(kind) ?? false;
}

function saturatingEndorsement(raw: number): number {
  return (
    SELECTOR_PUBLIC_WEIGHTS.endorsementCap *
    (1 - Math.exp(-SELECTOR_PUBLIC_WEIGHTS.endorsementK * raw))
  );
}

function liveEndorsementWeights(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const end of activeEndorsementsForContest(state, contest.id)) {
    let weight = 0;
    if (end.endorserType === "faction") {
      const fac = state.factionStates[end.endorserId];
      const def = world.factionDefinitions[end.endorserId];
      if (!fac || !def || fac.status !== "active" || def.partyId !== contest.partyId) continue;
      weight = ENDORSEMENT_INFLUENCE.factionInstitutional;
    } else if (end.endorserType === "provincial_organization") {
      const org = resolveProvincialOrganization(world, end.endorserId);
      if (!org || org.status !== "active" || org.partyId !== contest.partyId) continue;
      weight = ENDORSEMENT_INFLUENCE.provincialOrganization;
    } else {
      const pol = state.politicians[end.endorserId];
      if (!pol || !pol.alive || pol.retired) continue;
      weight = ENDORSEMENT_INFLUENCE.politician as number;
      if (isKindHolder(world, state, pol.id, "assembly_member")) weight = ENDORSEMENT_INFLUENCE.mp;
      if (isKindHolder(world, state, pol.id, "governor"))
        weight = Math.max(weight, ENDORSEMENT_INFLUENCE.governor);
      if (state.partyStates[contest.partyId]?.leaderId === pol.id) {
        weight = Math.max(weight, ENDORSEMENT_INFLUENCE.partyLeader);
      }
      if (pol.factionId && state.factionStates[pol.factionId]?.chairId === pol.id) {
        weight = Math.max(weight, ENDORSEMENT_INFLUENCE.factionChair);
      }
    }
    raw[end.targetId] = (raw[end.targetId] ?? 0) + weight;
  }
  const out: Record<string, number> = {};
  for (const [candidateId, value] of Object.entries(raw)) {
    out[candidateId] = saturatingEndorsement(value);
  }
  return out;
}

export function blendedFactionShares(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  memberIds?: readonly string[],
): Record<string, number> {
  const def = world.partyDefinitions[partyId];
  const factionIds = def?.factionIds ?? [];
  const canonical = def?.canonicalFactionShares ?? {};
  if (factionIds.length === 0) return {};
  const members = memberIds ?? partyMembers(state, partyId);
  const counts: Record<string, number> = {};
  let n = 0;
  for (const id of members) {
    const f = state.politicians[id]?.factionId;
    if (!f || !factionIds.includes(f)) continue;
    counts[f] = (counts[f] ?? 0) + 1;
    n++;
  }
  const out: Record<string, number> = {};
  let sum = 0;
  for (const fid of factionIds) {
    const c = canonical[fid] ?? 0;
    const cur = n > 0 ? (counts[fid] ?? 0) / n : c;
    const v = (1 - CURRENT_FACTION_BLEND) * c + CURRENT_FACTION_BLEND * cur;
    out[fid] = v;
    sum += v;
  }
  if (sum > 0) {
    for (const fid of factionIds) out[fid] = (out[fid] ?? 0) / sum;
  }
  return out;
}

function tendencyBias(
  tendency: SelectorTendency | null,
  kind: "faction" | "office" | "leadership" | "regional" | "prominence" | "endorsement" | "cross",
): number {
  if (!tendency) return 1;
  if (tendency === "institutional") {
    if (kind === "leadership" || kind === "office") return 1.4;
    if (kind === "faction") return 1.42;
    if (kind === "endorsement") return 0.55;
    if (kind === "regional") return 0.7;
    if (kind === "cross") return 0.2;
    return 0.85;
  }
  if (tendency === "moderate") {
    if (kind === "prominence") return 1.28;
    if (kind === "faction") return 0.68;
    if (kind === "endorsement") return 1.15;
    if (kind === "leadership") return 0.72;
    if (kind === "cross") return 1.65;
    return 1;
  }
  if (kind === "regional") return 1.5;
  if (kind === "leadership") return 0.32;
  if (kind === "faction") return 0.36;
  if (kind === "endorsement") return 1.22;
  if (kind === "prominence") return 0.92;
  if (kind === "cross") return 2.05;
  return 1;
}

function groupIdiosyncrasy(groupId: string, candidateId: string): number {
  let h = 2166136261;
  const s = `${groupId}|${candidateId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

function holdsAnyOffice(world: KernelWorld, state: SimState, politicianId: string): boolean {
  return (activeOfficeKinds(world, state).get(politicianId)?.size ?? 0) > 0;
}

type CandidatePublicCache = {
  endorsement: number;
  prominence: number;
  office: boolean;
  partyLeader: boolean;
  factionChair: boolean;
  home: string | null;
  electability: number;
};
const publicCandidateCaches = new WeakMap<SimState, Map<string, CandidatePublicCache>>();
const publicContestPollCaches = new WeakMap<SimState, Map<string, Record<string, number>>>();
const publicContestEndorsementCaches = new WeakMap<SimState, Map<string, Record<string, number>>>();

export function clearSelectoratePublicCache(state: SimState): void {
  publicCandidateCaches.delete(state);
  publicContestPollCaches.delete(state);
  publicContestEndorsementCaches.delete(state);
  activeOfficeKindCaches.delete(state);
}

function cachedContestEndorsementWeights(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): Record<string, number> {
  let cache = publicContestEndorsementCaches.get(state);
  if (!cache) {
    cache = new Map();
    publicContestEndorsementCaches.set(state, cache);
  }
  const existing = cache.get(contest.id);
  if (existing) return existing;
  const weights = liveEndorsementWeights(world, state, contest);
  cache.set(contest.id, weights);
  return weights;
}

function cachedContestPollShares(state: SimState, contestId: string): Record<string, number> {
  let cache = publicContestPollCaches.get(state);
  if (!cache) {
    cache = new Map();
    publicContestPollCaches.set(state, cache);
  }
  const existing = cache.get(contestId);
  if (existing) return existing;
  const shares = contestPollAverage(state, state.currentDate, contestId);
  cache.set(contestId, shares);
  return shares;
}

function candidatePublicCache(world: KernelWorld, state: SimState, contest: PartyContest, candidateId: string): CandidatePublicCache {
  let cache = publicCandidateCaches.get(state);
  if (!cache) {
    cache = new Map();
    publicCandidateCaches.set(state, cache);
  }
  const key = `${contest.id}:${candidateId}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const pol = state.politicians[candidateId];
  const entry = contest.entries[candidateId];
  const value: CandidatePublicCache = {
    endorsement: cachedContestEndorsementWeights(world, state, contest)[candidateId] ?? 0,
    prominence: entry ? publicProminence(entry) : 0,
    office: holdsAnyOffice(world, state, candidateId),
    partyLeader: state.partyStates[contest.partyId]?.leaderId === candidateId,
    factionChair: Boolean(pol?.factionId && state.factionStates[pol.factionId]?.chairId === candidateId),
    home: state.politicians[candidateId]?.homeProvinceId ?? world.politicianHomeProvince[candidateId] ?? null,
    electability: publicElectabilitySignal(
      world,
      state,
      candidateId,
      contest.type,
      contest.id,
      cachedContestPollShares(state, contest.id)[candidateId] ?? 0,
    ),
  };
  cache.set(key, value);
  return value;
}

function publicScore(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  candidateId: string,
  group: SelectorGroup,
): number {
  const pol = state.politicians[candidateId];
  const entry = contest.entries[candidateId];
  if (!pol || !entry) return 0;
  const cached = candidatePublicCache(world, state, contest, candidateId);
  let score = 0;
  if (group.factionId && pol.factionId === group.factionId) {
    score += SELECTOR_PUBLIC_WEIGHTS.sameFaction * tendencyBias(group.tendency, "faction");
  } else if (group.factionId && pol.factionId && pol.factionId !== group.factionId) {
    score += SELECTOR_PUBLIC_WEIGHTS.crossFaction * tendencyBias(group.tendency, "cross");
  }
  score +=
    cached.endorsement *
    tendencyBias(group.tendency, "endorsement");
  score +=
    cached.prominence *
    SELECTOR_PUBLIC_WEIGHTS.prominence *
    tendencyBias(group.tendency, "prominence");
  if (cached.office) {
    score += SELECTOR_PUBLIC_WEIGHTS.publicOffice * tendencyBias(group.tendency, "office");
  }
  if (cached.partyLeader) {
    score += SELECTOR_PUBLIC_WEIGHTS.leadership * tendencyBias(group.tendency, "leadership");
  }
  if (cached.factionChair) {
    score += SELECTOR_PUBLIC_WEIGHTS.leadership * 0.55 * tendencyBias(group.tendency, "leadership");
  }
  const home = cached.home;
  if (group.provinceId && home === group.provinceId) {
    score += SELECTOR_PUBLIC_WEIGHTS.regional * tendencyBias(group.tendency, "regional");
  } else if (!group.provinceId && home) {
    score += SELECTOR_PUBLIC_WEIGHTS.regional * 0.12 * tendencyBias(group.tendency, "regional");
  }
  const cohesion = state.partyStates[contest.partyId]?.cohesion ?? 0.5;
  if (group.kind === "members" || group.kind === "convention_delegates") {
    score += cohesion * SELECTOR_PUBLIC_WEIGHTS.discipline;
  }
  score += cached.electability;
  score += groupIdiosyncrasy(group.id, candidateId) * SELECTOR_GROUP_IDIOSYNCRASY;
  return score;
}

function caucusActorId(group: SelectorGroup): string | null {
  if (!group.id.startsWith("caucus:")) return null;
  return group.id.slice("caucus:".length);
}

function politicianRankingOptions(
  contest: PartyContest,
  actorId: string,
  candidateIds: readonly string[],
  state: SimState,
): DecisionOption[] {
  const actor = state.politicians[actorId];
  return [...candidateIds].sort().map((id) => {
    const target = state.politicians[id];
    const partyAlign = target && actor && target.partyId === actor.partyId ? 0.55 : 0.05;
    const facAlign =
      target && actor && target.factionId && target.factionId === actor.factionId ? 0.72 : 0.18;
    const leader = state.partyStates[contest.partyId]?.leaderId === id;
    return {
      optionId: id,
      actionType: "CAUCUS_RANK",
      targetIds: [id],
      uncertainty: 0.22,
      signals: emptySignals({
        partyAlignment: partyAlign,
        factionAlignment: facAlign,
        careerBenefit: leader ? 0.2 : 0.08,
        institutionalAlignment: leader ? 0.25 : 0.1,
        risk: 0.12,
      }),
      goalImpacts: {},
      metadata: { contestId: contest.id },
    };
  });
}

export function rankCandidatesForPolitician(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  actorId: string,
  candidateIds: readonly string[],
  rng?: RngService,
): string[] {
  const ctx = buildDecisionActorContext(world, state, actorId, [...candidateIds]);
  const options = politicianRankingOptions(contest, actorId, candidateIds, state);
  const ranked = evaluateDecision(options, ctx, rng);
  ranked.sort((a, b) => {
    if (a.finalUtility !== b.finalUtility) return b.finalUtility - a.finalUtility;
    return a.optionId < b.optionId ? -1 : 1;
  });
  return ranked.map((r) => r.optionId);
}

export function rankCandidatesForGroup(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  group: SelectorGroup,
  candidateIds: readonly string[],
  rng?: RngService,
): string[] {
  const actorId = caucusActorId(group);
  if (actorId)
    return rankCandidatesForPolitician(world, state, contest, actorId, candidateIds, rng);
  const scored = candidateIds.map((id) => {
    let s = publicScore(world, state, contest, id, group);
    if (rng) s += (rng.float01("campaigns") * 2 - 1) * CAMPAIGNS_NOISE_AMP;
    return { id, s };
  });
  scored.sort((a, b) => {
    if (a.s !== b.s) return b.s - a.s;
    return a.id < b.id ? -1 : 1;
  });
  const top = scored[0];
  const second = scored[1];
  const third = scored[2];
  if (top && second && third && group.tendency === "outsider") {
    const f1 = state.politicians[top.id]?.factionId;
    const f2 = state.politicians[second.id]?.factionId;
    const f3 = state.politicians[third.id]?.factionId;
    if (f1 && f1 === f2 && f3 && f3 !== f1) {
      scored[1] = third;
      scored[2] = second;
    }
  }
  return scored.map((x) => x.id);
}

function tendencyEntries(): Array<{ id: string; tendency: SelectorTendency; share: number }> {
  return [
    { id: "inst", tendency: "institutional", share: SELECTOR_TENDENCY_SHARES.institutional },
    { id: "mod", tendency: "moderate", share: SELECTOR_TENDENCY_SHARES.moderate },
    { id: "out", tendency: "outsider", share: SELECTOR_TENDENCY_SHARES.outsider },
  ];
}

function factionProvinceShares(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  factionId: string | null,
  partyMemberIds?: readonly string[],
): Array<{ provinceId: string | null; share: number }> {
  const members = (partyMemberIds ?? partyMembers(state, partyId)).filter((id) => {
    if (!factionId) return true;
    return state.politicians[id]?.factionId === factionId;
  });
  const counts: Record<string, number> = {};
  let unspecified = 0;
  for (const id of members) {
    const home = state.politicians[id]?.homeProvinceId ?? world.politicianHomeProvince[id];
    if (!home) unspecified += 1;
    else counts[home] = (counts[home] ?? 0) + 1;
  }
  const provinces = Object.keys(counts).sort();
  if (members.length === 0 || (provinces.length === 0 && unspecified === members.length)) {
    return [{ provinceId: null, share: 1 }];
  }
  const total = members.length || 1;
  const out: Array<{ provinceId: string | null; share: number }> = provinces.map((provinceId) => ({
    provinceId,
    share: (counts[provinceId] ?? 0) / total,
  }));
  if (unspecified > 0) out.push({ provinceId: null, share: unspecified / total });
  return out;
}

function heterogeneousFactionGroups(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  kind: SelectorKind,
  prefix: string,
  total: Rational,
  onlyFactionId?: string | null,
): SelectorGroup[] {
  const members = partyMembers(state, partyId);
  const shares = blendedFactionShares(world, state, partyId, members);
  const factions = (onlyFactionId ? [onlyFactionId] : Object.keys(shares)).sort();
  if (factions.length === 0) {
    return [
      {
        id: `${prefix}:all`,
        kind,
        partyId,
        factionId: null,
        provinceId: null,
        tendency: "moderate",
        weight: serializeRational(total),
      },
    ];
  }
  const groups: SelectorGroup[] = [];
  const factionDenom = onlyFactionId ? 1 : factions.reduce((s, f) => s + (shares[f] ?? 0), 0) || 1;
  for (const factionId of factions) {
    const factionShare = onlyFactionId ? 1 : (shares[factionId] ?? 0) / factionDenom;
    const provinces = factionProvinceShares(world, state, partyId, factionId, members);
    for (const t of tendencyEntries()) {
      for (const prov of provinces) {
        const w = mul(
          mul(mul(total, shareToRational(factionShare)), shareToRational(t.share)),
          shareToRational(prov.share),
        );
        if (!isPositive(w)) continue;
        const provKey = prov.provinceId ?? "na";
        groups.push({
          id: `${prefix}:${factionId}:${t.id}:${provKey}`,
          kind,
          partyId,
          factionId,
          provinceId: prov.provinceId,
          tendency: t.tendency,
          weight: serializeRational(w),
        });
      }
    }
  }
  return groups;
}

export function labourSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  weights?: { memberWeight: number; affiliateUnionDelegateWeight: number },
): SelectorGroup[] {
  const rule = world.nominationRules[world.partyDefinitions[partyId]?.nominationRuleId ?? ""];
  const memberW = weights?.memberWeight ?? rule?.memberWeight ?? 0.8;
  const unionW = weights?.affiliateUnionDelegateWeight ?? rule?.affiliateUnionDelegateWeight ?? 0.2;
  return [
    ...heterogeneousFactionGroups(
      world,
      state,
      partyId,
      "members",
      "lab-members",
      shareToRational(memberW),
    ),
    ...heterogeneousFactionGroups(
      world,
      state,
      partyId,
      "union_delegates",
      "lab-union",
      shareToRational(unionW),
    ),
  ];
}

export function memberFactionSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  onlyFactionId?: string | null,
): SelectorGroup[] {
  const living = onlyFactionId
    ? factionMembers(state, onlyFactionId)
    : partyMembers(state, partyId);
  if (living.length === 0) return [];
  return heterogeneousFactionGroups(
    world,
    state,
    partyId,
    "members",
    "members",
    fromInt(1),
    onlyFactionId,
  );
}

export function civicSupporterSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): SelectorGroup[] {
  const groups: SelectorGroup[] = [
    {
      id: "cr-open",
      kind: "supporters",
      partyId,
      factionId: null,
      provinceId: null,
      tendency: "moderate",
      weight: serializeRational(shareToRational(1 - CR_FACTION_BLEND)),
    },
  ];
  groups.push(
    ...heterogeneousFactionGroups(
      world,
      state,
      partyId,
      "supporters",
      "cr-fac",
      shareToRational(CR_FACTION_BLEND),
    ),
  );
  return groups;
}

export function greenConventionSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): SelectorGroup[] {
  return heterogeneousFactionGroups(
    world,
    state,
    partyId,
    "convention_delegates",
    "grn-del",
    fromInt(1),
  );
}

export function regionalProvincialSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): SelectorGroup[] {
  const baseline = world.partyProvinceBaseline[partyId] ?? {};
  const provinces = (world.provinceIds.length ? world.provinceIds : Object.keys(baseline))
    .slice()
    .sort();
  const members = partyMembers(state, partyId);
  const homeCount: Record<string, number> = {};
  for (const id of members) {
    const home = state.politicians[id]?.homeProvinceId ?? world.politicianHomeProvince[id];
    if (!home) continue;
    homeCount[home] = (homeCount[home] ?? 0) + 1;
  }
  const raw: Array<{ provinceId: string; value: number }> = [];
  for (const provinceId of provinces) {
    const frac = baseline[provinceId];
    let vote = 0;
    if (frac) {
      const [n, d] = frac.split("/");
      vote = Number(n) / Number(d || 1);
    }
    const membershipProxy = 1 + (homeCount[provinceId] ?? 0);
    raw.push({
      provinceId,
      value: Math.max(RL_PROVINCE_FLOOR, vote * membershipProxy + RL_PROVINCE_FLOOR),
    });
  }
  const total = raw.reduce((s, r) => s + r.value, 0) || 1;
  return raw.map((r) => ({
    id: `rl:${r.provinceId}`,
    kind: "provincial_delegates" as const,
    partyId,
    factionId: null,
    provinceId: r.provinceId,
    tendency: null,
    weight: serializeRational(shareToRational(r.value / total)),
  }));
}

export function pmMemberSelectorate(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): SelectorGroup[] {
  return heterogeneousFactionGroups(world, state, partyId, "members", "pm-members", fromInt(1));
}

function caucusSelectorate(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): SelectorGroup[] {
  const ids =
    contest.type === "faction_chair" && contest.factionId
      ? factionAssemblyCaucus(world, state, contest.factionId)
      : assemblyCaucus(world, state, contest.partyId);
  return ids
    .filter((id) => id !== state.playerPoliticianId)
    .map((id) => ({
      id: `caucus:${id}`,
      kind: "members" as const,
      partyId: contest.partyId,
      factionId: state.politicians[id]?.factionId ?? null,
      provinceId: state.politicians[id]?.homeProvinceId ?? world.politicianHomeProvince[id] ?? null,
      tendency: null,
      weight: "1/1",
    }));
}

export function contestSelectorMethod(
  contest: PartyContest,
  world: KernelWorld,
): NominationMethod | null {
  if (contest.type === "party_leadership" || contest.type === "faction_chair") {
    const raw = contest.metadata.selectorMethod;
    return typeof raw === "string" && isNominationMethod(raw) ? raw : null;
  }
  const rule = world.nominationRules[contest.ruleId];
  return rule?.method ?? null;
}

export function selectorateForRule(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): SelectorGroup[] {
  const method = contestSelectorMethod(contest, world);
  const chairFaction = contest.type === "faction_chair" ? contest.factionId : null;
  switch (method) {
    case "weighted_ranked_choice": {
      if (contest.type === "presidential_nomination") {
        return labourSelectorate(world, state, contest.partyId);
      }
      const mw = contest.metadata.memberWeight;
      const uw = contest.metadata.affiliateUnionDelegateWeight;
      if (
        typeof mw !== "number" ||
        typeof uw !== "number" ||
        !Number.isFinite(mw) ||
        !Number.isFinite(uw)
      ) {
        return [];
      }
      return labourSelectorate(world, state, contest.partyId, {
        memberWeight: mw,
        affiliateUnionDelegateWeight: uw,
      });
    }
    case "closed_member_rcv":
    case "member_rcv":
      return memberFactionSelectorate(world, state, contest.partyId, chairFaction);
    case "registered_supporter_rcv":
      return civicSupporterSelectorate(world, state, contest.partyId);
    case "transferable_convention":
      return greenConventionSelectorate(world, state, contest.partyId);
    case "weighted_provincial_delegates":
      return regionalProvincialSelectorate(world, state, contest.partyId);
    case "direct_member_rcv":
      return pmMemberSelectorate(world, state, contest.partyId);
    case "caucus_rcv":
      return caucusSelectorate(world, state, contest);
    default:
      return memberFactionSelectorate(world, state, contest.partyId, chairFaction);
  }
}
