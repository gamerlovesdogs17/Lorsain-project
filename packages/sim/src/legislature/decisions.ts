import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { BillState, LegislativeVoteChoice, PolicyItem } from "./types.js";
import { billPolicyFit, factionStance, partyStance } from "./recommendations.js";
import { mpConstituencyId } from "./state.js";
import { organizationPressureForBill } from "../organizations/monthly.js";
import { LEGISLATIVE_PROVISIONS, policyItemForProvision } from "./provisions.js";
import { parliamentaryDiscipline } from "./discipline.js";
import { constituencyPressureForBill } from "./constituency.js";

function constituencyFit(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  bill: BillState,
): number {
  const cid = mpConstituencyId(world, state, politicianId);
  if (!cid) return 0;
  const blocIds = world.voterBlocIdsByConstituency[cid] ?? [];
  if (blocIds.length === 0) return 0;
  const item = bill.policyItems[0];
  if (!item) return 0;
  const dim = world.issueDimensions[item.issueId] ?? "institutional";
  const axis =
    dim === "economic" || dim === "economic-social"
      ? "economic"
      : dim === "social"
        ? "social"
        : dim === "foreign"
          ? "globalism"
          : "authority";
  let acc = 0;
  let w = 0;
  for (const id of blocIds) {
    const bloc = world.voterBlocs[id];
    if (!bloc) continue;
    const fit = item.dimensionEffects && Object.keys(item.dimensionEffects).length > 0
      ? (Object.entries(item.dimensionEffects) as Array<[keyof typeof bloc.ideology, number]>).reduce(
          (sum, [effectAxis, effect]) => sum + (bloc.ideology[effectAxis] ?? 0) * effect,
          0,
        ) / Object.keys(item.dimensionEffects).length
      : (bloc.ideology[axis] ?? 0) * item.direction;
    acc += fit * bloc.weight;
    w += bloc.weight;
  }
  if (w <= 0) return 0;
  return Math.max(-1, Math.min(1, (acc / w) * item.magnitude));
}

export function chooseLegislativeVote(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  bill: BillState,
  rng: RngService,
): LegislativeVoteChoice {
  if (politicianId === state.playerPoliticianId) return "abstain";
  const pol = state.politicians[politicianId];
  const fit = billPolicyFit(world, state, politicianId, bill);
  const party = partyStance(state, pol?.partyId ?? null, bill.id);
  const faction = factionStance(state, pol?.factionId ?? null, bill.id);
  const profile = getAgentProfile(world, state, politicianId);
  const partyLoyalty = profile?.traits.partyLoyalty ?? 0.5;
  const factionLoyalty = profile?.traits.factionLoyalty ?? 0.5;
  const institutionalism = profile?.traits.institutionalism ?? 0.5;
  const pragmatism = profile?.traits.pragmatism ?? 0.5;
  const district = constituencyFit(world, state, politicianId, bill);
  const currentLocalPressure = cidForPressure(world, state, politicianId, bill);
  const orgPressure = organizationPressureForBill(world, state, politicianId, bill.id);
  const partyPush = party === "support" ? 1 : party === "oppose" ? -1 : 0;
  const factionPush = faction === "support" ? 1 : faction === "oppose" ? -1 : 0;
  const discipline = pol?.partyId ? parliamentaryDiscipline(world, state, pol.partyId).score : 0;
  const dimensions = bill.policyItems.map((item) => world.issueDimensions[item.issueId] ?? "institutional");
  const issueDiscipline = dimensions.length === 0 ? 0.72 : dimensions.reduce((sum, dimension) => {
    if (dimension === "social") return sum + 0.56;
    if (dimension === "institutional") return sum + 0.66;
    if (dimension === "economic-social") return sum + 0.62;
    if (dimension === "foreign") return sum + 0.8;
    return sum + 0.74;
  }, 0) / dimensions.length;
  const factionConflict = partyPush !== 0 && factionPush === -partyPush;
  const constituencyConflict = partyPush !== 0 && district * partyPush < -0.06;
  const conscienceRoom = Math.max(0.08, 1 - discipline * issueDiscipline);
  const personalVariance = (rng.float01("legislature") - 0.5) *
    (0.18 + conscienceRoom * 0.32 + (factionConflict ? 0.12 : 0) + (constituencyConflict ? 0.1 : 0));
  const score =
    fit * 0.36 +
    partyPush * partyLoyalty * discipline * issueDiscipline * 0.38 +
    factionPush * factionLoyalty * (factionConflict ? 0.3 : 0.2) +
    district * 0.22 +
    currentLocalPressure +
    orgPressure * 0.68 +
    (pragmatism - 0.5) * 0.06 +
    (institutionalism - 0.5) * 0.04 +
    personalVariance;
  if (score > 0.045) return "yes";
  if (score < -0.045) return "no";
  return "abstain";
}

function cidForPressure(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  bill: BillState,
): number {
  const constituencyId = mpConstituencyId(world, state, politicianId);
  return constituencyId ? constituencyPressureForBill(world, state, constituencyId, bill) : 0;
}

export function chooseIntroduce(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  rng: RngService,
): PolicyItem | null {
  if (politicianId === state.playerPoliticianId) return null;
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return null;
  const definitions = LEGISLATIVE_PROVISIONS.slice().sort((a, b) => a.id.localeCompare(b.id));
  if (definitions.length === 0) return null;
  const weighted = definitions.map((definition) => ({
    definition,
    weight: 0.2 + (profile.issueSalience[definition.issueId] ?? 0.25),
  }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  let pick = rng.float01("legislature") * total;
  let definition = weighted.at(-1)!.definition;
  for (const row of weighted) {
    pick -= row.weight;
    if (pick <= 0) {
      definition = row.definition;
      break;
    }
  }
  const dim = world.issueDimensions[definition.issueId] ?? "institutional";
  const axis =
    dim === "economic" || dim === "economic-social"
      ? "economic"
      : dim === "social"
        ? "social"
        : dim === "foreign"
          ? "globalism"
          : "authority";
  const v = profile.ideology[axis] ?? 0;
  const propensity = 0.12 + Math.abs(v) * 0.26 + profile.traits.ambition * 0.2 + profile.skills.legislation * 0.18;
  if (rng.float01("legislature") > propensity) return null;
  const alternatives = definition.options.filter((option) => !option.current);
  const selected = alternatives.map((option) => {
    const fit = option.dimensionEffects && Object.keys(option.dimensionEffects).length > 0
      ? (Object.entries(option.dimensionEffects) as Array<[keyof typeof profile.ideology, number]>).reduce(
          (sum, [effectAxis, effect]) => sum + (profile.ideology[effectAxis] ?? 0) * effect,
          0,
        ) / Object.keys(option.dimensionEffects).length
      : v * option.direction;
    return { option, score: fit * option.magnitude + rng.float01("legislature") * 0.08 };
  }).sort((a, b) => b.score - a.score || a.option.id.localeCompare(b.option.id))[0]?.option;
  return selected ? policyItemForProvision(definition.id, selected.id) : null;
}

export type PresidentDispositionEvaluation = {
  decision: "sign" | "return";
  score: number;
  factors: {
    policyFit: number;
    sponsorCoalition: number;
    assemblyMandate: number;
    fiscal: number;
    organizations: number;
    institutional: number;
  };
};

export function evaluatePresidentDisposition(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  bill: BillState,
  boundedNoise = 0,
): PresidentDispositionEvaluation {
  const president = state.politicians[presidentId];
  const profile = getAgentProfile(world, state, presidentId);
  const policyFit = billPolicyFit(world, state, presidentId, bill);
  const sponsorIds = [bill.sponsorId, ...bill.cosponsorIds];
  const alignedSponsors = sponsorIds.filter((id) => president?.partyId && state.politicians[id]?.partyId === president.partyId).length;
  const sponsorCoalition = sponsorIds.length > 0 ? (alignedSponsors / sponsorIds.length) * 2 - 1 : 0;
  const floorVote = bill.floorVoteId ? state.legislatureRuntime.legislativeVotes[bill.floorVoteId] : null;
  const assemblyMandate = floorVote
    ? Math.max(-1, Math.min(1, (floorVote.yes - floorVote.no) / Math.max(1, floorVote.yes + floorVote.no + floorVote.abstain)))
    : 0;
  const fiscalTotal = bill.policyItems.reduce((sum, item) => sum + (item.fiscalImpact ?? 0), 0);
  const fiscalPressure = state.economyRuntime.national.fiscalPressure;
  const fiscal = Math.max(-1, Math.min(1, -fiscalTotal * (0.7 + fiscalPressure)));
  const organizations = organizationPressureForBill(world, state, presidentId, bill.id);
  const institutional = ((profile?.traits.institutionalism ?? 0.5) - 0.5) * 2;
  const score =
    0.08 +
    policyFit * 0.55 +
    sponsorCoalition * 0.18 +
    assemblyMandate * 0.14 +
    fiscal * 0.08 +
    organizations * 0.18 +
    institutional * 0.04 +
    Math.max(-0.07, Math.min(0.07, boundedNoise));
  return {
    decision: score < -0.06 ? "return" : "sign",
    score,
    factors: { policyFit, sponsorCoalition, assemblyMandate, fiscal, organizations, institutional },
  };
}

export function choosePresidentDisposition(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  bill: BillState,
  rng: RngService,
): "sign" | "return" {
  if (presidentId === state.playerPoliticianId) return "sign";
  return evaluatePresidentDisposition(world, state, presidentId, bill, (rng.float01("npc-decisions") - 0.5) * 0.14).decision;
}
