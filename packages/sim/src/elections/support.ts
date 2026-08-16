import { IDEOLOGY_AXES, type IdeologyAxis } from "../agents/types.js";
import { emptyIdeology } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import {
  ENVIRONMENT_SHIFT,
  ISSUE_DIMENSION_AXES,
  PUBLIC_FACTION_BLEND,
  SUPPORT_SOFTMAX_TEMPERATURE,
  SUPPORT_SUM_TOLERANCE,
  SUPPORT_WEIGHTS,
} from "./policy.js";
import { publicFactionIdeologyBaseline, publicPartyIdeologyBaseline } from "./public-ideology.js";
import { candidateStandingOrDefault } from "./standing.js";
import { registeredElectorate } from "./turnout.js";
import type { IdeologyVector, PublicCandidateFacts, VoterBlocDefinition } from "./types.js";

/**
 * Electoral aggregate party ID. Independents remain partyId=null as politicians;
 * voters/polls/house effects use the independent statistical aggregate.
 */
export function electoralPartyId(world: KernelWorld, partyId: string | null): string | null {
  if (partyId == null || partyId === world.independentAggregatePartyId) {
    return world.independentAggregatePartyId;
  }
  return partyId;
}

export function isElectoralAggregatePartyId(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): boolean {
  if (partyId === world.independentAggregatePartyId) return true;
  if (world.partyDefinitions[partyId]) return true;
  if (state.dynamicParties[partyId]) return true;
  return false;
}

export function softmaxSupport(utilities: number[]): number[] {
  if (utilities.length === 0) return [];
  const t = SUPPORT_SOFTMAX_TEMPERATURE;
  let max = -Infinity;
  for (const u of utilities) if (u > max) max = u;
  const exps = utilities.map((u) => Math.exp((u - max) / t));
  let sum = 0;
  for (const e of exps) sum += e;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    return utilities.map(() => 1 / utilities.length);
  }
  return exps.map((e) => e / sum);
}

export function assertNormalized(shares: number[]): void {
  let sum = 0;
  for (const s of shares) {
    if (!(s >= 0) || !Number.isFinite(s)) {
      throw new Error("support share is not a finite nonnegative probability");
    }
    sum += s;
  }
  if (Math.abs(sum - 1) > SUPPORT_SUM_TOLERANCE && shares.length > 0) {
    throw new Error(`support shares sum to ${sum}`);
  }
}

export function publicCandidateIdeology(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  explicit?: IdeologyVector | null,
): IdeologyVector | null {
  if (explicit) return explicit;
  const pol = state.politicians[politicianId];
  if (!pol) return null;
  const partyId = pol.partyId;
  if (!partyId || partyId === world.independentAggregatePartyId) return null;
  const party = publicPartyIdeologyBaseline(world, state, partyId);
  if (!party) return null;
  const out = emptyIdeology();
  for (const axis of IDEOLOGY_AXES) out[axis] = party[axis] ?? 0;
  if (pol.factionId && world.factionDefinitions[pol.factionId]?.partyId === partyId) {
    const fac = publicFactionIdeologyBaseline(world, pol.factionId);
    if (fac) {
      for (const axis of IDEOLOGY_AXES) {
        out[axis] =
          (1 - PUBLIC_FACTION_BLEND) * out[axis] + PUBLIC_FACTION_BLEND * (fac[axis] ?? 0);
      }
    }
  }
  return out;
}

export function publicCandidateFacts(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  explicitIdeology?: IdeologyVector | null,
): PublicCandidateFacts | null {
  const pol = state.politicians[politicianId];
  if (!pol) return null;
  const standing = candidateStandingOrDefault(world, state, politicianId);
  const officeKinds: string[] = [];
  for (const t of Object.values(state.officeTerms)) {
    if (t.holderId !== politicianId || t.status === "ended") continue;
    const kind = world.offices[t.officeId]?.kind;
    if (kind) officeKinds.push(kind);
  }
  return {
    politicianId,
    partyId: pol.partyId,
    factionId: pol.factionId,
    homeProvinceId: world.politicianHomeProvince[politicianId] ?? null,
    officeKinds,
    isIncumbentPresident: officeKinds.includes("president"),
    isPartyLeader: Object.values(state.partyStates).some((p) => p.leaderId === politicianId),
    isFactionChair: Object.values(state.factionStates).some((f) => f.chairId === politicianId),
    publicIdeology: publicCandidateIdeology(world, state, politicianId, explicitIdeology ?? null),
    standing,
  };
}

function axisWeightsForBloc(
  world: KernelWorld,
  bloc: VoterBlocDefinition,
): Record<IdeologyAxis, number> {
  const acc: Record<IdeologyAxis, number> = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  for (const [issueId, sal] of Object.entries(bloc.issueSalience)) {
    const dim = world.issueDimensions[issueId];
    const axes = dim ? ISSUE_DIMENSION_AXES[dim] : undefined;
    if (!axes || axes.length === 0) continue;
    const part = sal / axes.length;
    for (const axis of axes) acc[axis] += part;
  }
  let sum = 0;
  for (const axis of IDEOLOGY_AXES) sum += acc[axis];
  if (sum <= 0) {
    const u = 1 / IDEOLOGY_AXES.length;
    for (const axis of IDEOLOGY_AXES) acc[axis] = u;
    return acc;
  }
  for (const axis of IDEOLOGY_AXES) acc[axis] /= sum;
  return acc;
}

function ideologicalFit(
  world: KernelWorld,
  bloc: VoterBlocDefinition,
  ideology: IdeologyVector | null,
): number {
  if (!ideology) return 0.5;
  const weights = axisWeightsForBloc(world, bloc);
  let dist = 0;
  for (const axis of IDEOLOGY_AXES) {
    dist += (weights[axis] * Math.abs(bloc.ideology[axis] - ideology[axis])) / 2;
  }
  return 1 - dist;
}

function partyEnvShift(state: SimState, partyId: string | null, constituencyId: string): number {
  if (!partyId) return 0;
  const national = state.electoralEnvironment.nationalPartyShift[partyId] ?? 0;
  const local = state.electoralEnvironment.constituencyPartyShift[constituencyId]?.[partyId] ?? 0;
  return national * SUPPORT_WEIGHTS.nationalPartyEnv + local * SUPPORT_WEIGHTS.constituencyPartyEnv;
}

/**
 * Candidate-relative issue climate.
 *
 * issueClimateShift[issueId] in [-1,+1] raises the electoral importance of that
 * issue's canonical ideology dimension in the signed direction of the shift.
 * Candidate utility then responds to bloc salience × climate × public ideology
 * on the mapped axis. Axes are L1-normalized so issue-ID cardinality does not
 * overweight a dimension.
 */
function issueClimateFit(
  world: KernelWorld,
  state: SimState,
  bloc: VoterBlocDefinition,
  ideology: IdeologyVector | null,
): number {
  if (!ideology) return 0;
  const axisShift: Record<IdeologyAxis, number> = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  const axisSal: Record<IdeologyAxis, number> = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  for (const [issueId, sal] of Object.entries(bloc.issueSalience)) {
    const shift = state.electoralEnvironment.issueClimateShift[issueId];
    if (shift == null) continue;
    const dim = world.issueDimensions[issueId];
    const axes = dim ? ISSUE_DIMENSION_AXES[dim] : undefined;
    if (!axes || axes.length === 0) continue;
    const clamped = Math.max(ENVIRONMENT_SHIFT.min, Math.min(ENVIRONMENT_SHIFT.max, shift));
    const part = sal / axes.length;
    for (const axis of axes) {
      axisShift[axis] += part * clamped;
      axisSal[axis] += part;
    }
  }
  let acc = 0;
  let w = 0;
  for (const axis of IDEOLOGY_AXES) {
    if (axisSal[axis] <= 0) continue;
    acc += axisShift[axis] * ideology[axis];
    w += axisSal[axis];
  }
  if (w <= 0) return 0;
  return (acc / w) * SUPPORT_WEIGHTS.issueClimate;
}

export function blocCandidateUtility(
  world: KernelWorld,
  state: SimState,
  bloc: VoterBlocDefinition,
  facts: PublicCandidateFacts,
): number {
  const partyId = electoralPartyId(world, facts.partyId);
  const habit = partyId ? (bloc.partyHabit[partyId] ?? 0) : 0;
  let u = habit * SUPPORT_WEIGHTS.partyHabit;
  u += ideologicalFit(world, bloc, facts.publicIdeology) * SUPPORT_WEIGHTS.ideology;
  const shares = world.constituencyElectorate[bloc.constituencyId]?.provincePopulationShares ?? [];
  if (facts.homeProvinceId) {
    const share = shares.find((s) => s.provinceId === facts.homeProvinceId)?.share ?? 0;
    if (share > 0) {
      u += SUPPORT_WEIGHTS.regionalHome + share * SUPPORT_WEIGHTS.regionalShare;
    }
  }
  if (facts.isIncumbentPresident) u += SUPPORT_WEIGHTS.incumbency;
  if (facts.officeKinds.includes("assembly_member") || facts.officeKinds.includes("governor")) {
    u += SUPPORT_WEIGHTS.officeHolder;
  }
  if (facts.isPartyLeader) u += SUPPORT_WEIGHTS.partyLeader;
  if (facts.isFactionChair) u += SUPPORT_WEIGHTS.factionChair;
  const st = facts.standing;
  u += st.nameRecognition * SUPPORT_WEIGHTS.nameRecognition;
  u += ((st.favorability + 1) / 2) * SUPPORT_WEIGHTS.favorability;
  u += st.enthusiasm * SUPPORT_WEIGHTS.enthusiasm;
  u += ((st.momentum + 1) / 2) * SUPPORT_WEIGHTS.momentum;
  u += partyEnvShift(state, partyId, bloc.constituencyId);
  u += issueClimateFit(world, state, bloc, facts.publicIdeology);
  return u;
}

export function blocSupportShares(
  world: KernelWorld,
  state: SimState,
  bloc: VoterBlocDefinition,
  candidateIds: readonly string[],
  ideologyById?: Record<string, IdeologyVector | null>,
): Record<string, number> {
  const ordered = [...candidateIds].sort();
  const factsList: PublicCandidateFacts[] = [];
  for (const id of ordered) {
    const facts = publicCandidateFacts(world, state, id, ideologyById?.[id] ?? null);
    if (!facts) throw new Error(`unknown candidate ${id}`);
    factsList.push(facts);
  }
  const utilities = factsList.map((f) => blocCandidateUtility(world, state, bloc, f));
  const shares = softmaxSupport(utilities);
  assertNormalized(shares);
  const out: Record<string, number> = {};
  for (let i = 0; i < ordered.length; i++) out[ordered[i]!] = shares[i]!;
  return out;
}

export function constituencyElectorateScale(world: KernelWorld, constituencyId: string): number {
  const el = world.constituencyElectorate[constituencyId];
  if (!el) return 0;
  return registeredElectorate(el);
}

export function aggregateSupport(
  world: KernelWorld,
  state: SimState,
  constituencyIds: readonly string[],
  candidateIds: readonly string[],
  turnoutWeight: (bloc: VoterBlocDefinition) => number,
  ideologyById?: Record<string, IdeologyVector | null>,
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const id of candidateIds) acc[id] = 0;
  let total = 0;
  for (const cid of constituencyIds) {
    const scale = constituencyElectorateScale(world, cid);
    if (scale <= 0) continue;
    for (const bid of world.voterBlocIdsByConstituency[cid] ?? []) {
      const bloc = world.voterBlocs[bid];
      if (!bloc) continue;
      const w = scale * bloc.weight * turnoutWeight(bloc);
      if (w <= 0) continue;
      const shares = blocSupportShares(world, state, bloc, candidateIds, ideologyById);
      for (const id of candidateIds) {
        acc[id] = (acc[id] ?? 0) + w * (shares[id] ?? 0);
      }
      total += w;
    }
  }
  if (total <= 0) {
    const even = 1 / Math.max(1, candidateIds.length);
    const out: Record<string, number> = {};
    for (const id of candidateIds) out[id] = even;
    return out;
  }
  const out: Record<string, number> = {};
  for (const id of candidateIds) out[id] = (acc[id] ?? 0) / total;
  return out;
}
