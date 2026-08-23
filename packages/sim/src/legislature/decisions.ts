import { buildDecisionActorContext } from "../agents/context.js";
import { chooseDecision, emptySignals, type DecisionOption } from "../agents/decisions.js";
import { getAgentProfile } from "../agents/profile.js";
import { goalsOwnedBy } from "../agents/goals.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { BillState, LegislativeVoteChoice, PolicyItem } from "./types.js";
import { billPolicyFit, factionStance, partyStance } from "./recommendations.js";
import { mpConstituencyId } from "./state.js";
import { organizationPressureForBill } from "../organizations/monthly.js";

function goalImpacts(state: SimState, actorId: string, n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of goalsOwnedBy(state, actorId).filter((x) => x.status === "active")) {
    if (g.type === "advance_party" || g.type === "advance_faction" || g.type === "issue_outcome") {
      out[g.id] = n;
    } else if (g.type === "career_advancement" || g.type === "increase_influence") {
      out[g.id] = n * 0.4;
    }
  }
  return out;
}

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
    acc += (bloc.ideology[axis] ?? 0) * bloc.weight;
    w += bloc.weight;
  }
  if (w <= 0) return 0;
  return Math.max(-1, Math.min(1, (acc / w) * item.direction * item.magnitude));
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
  const rel = 0;
  const orgPressure = organizationPressureForBill(world, state, politicianId, bill.id);
  const partyPush = party === "support" ? 1 : party === "oppose" ? -1 : 0;
  const factionPush = faction === "support" ? 1 : faction === "oppose" ? -1 : 0;
  const options: DecisionOption[] = [
    {
      optionId: "YES",
      actionType: "CAST_LEGISLATIVE_VOTE",
      targetIds: [bill.sponsorId],
      uncertainty: 0.12,
      signals: emptySignals({
        ideologicalAlignment: fit,
        partyAlignment: partyPush * partyLoyalty,
        factionAlignment: factionPush * factionLoyalty,
        pragmaticEffectiveness: district * 0.5 + pragmatism * 0.1,
        institutionalAlignment: institutionalism * 0.2,
        relationshipConsequence: rel + orgPressure,
        careerBenefit: 0.15,
        risk: 0.1,
      }),
      goalImpacts: goalImpacts(state, politicianId, 0.3),
      metadata: { billId: bill.id, choice: "yes" },
    },
    {
      optionId: "NO",
      actionType: "CAST_LEGISLATIVE_VOTE",
      targetIds: [bill.sponsorId],
      uncertainty: 0.12,
      signals: emptySignals({
        ideologicalAlignment: -fit,
        partyAlignment: -partyPush * partyLoyalty,
        factionAlignment: -factionPush * factionLoyalty,
        pragmaticEffectiveness: -district * 0.5 + pragmatism * 0.1,
        institutionalAlignment: institutionalism * 0.15,
        relationshipConsequence: -orgPressure,
        careerBenefit: 0.1,
        risk: 0.12,
      }),
      goalImpacts: goalImpacts(state, politicianId, 0.15),
      metadata: { billId: bill.id, choice: "no" },
    },
    {
      optionId: "ABSTAIN",
      actionType: "CAST_LEGISLATIVE_VOTE",
      targetIds: [],
      uncertainty: 0.2,
      signals: emptySignals({
        risk: 0.05,
        institutionalAlignment: 0.05,
        pragmaticEffectiveness: 0.08,
        careerBenefit: 0.02,
      }),
      goalImpacts: {},
      metadata: { billId: bill.id, choice: "abstain" },
    },
  ];
  const ctx = buildDecisionActorContext(world, state, politicianId, [bill.sponsorId]);
  const chosen = chooseDecision(options, ctx, rng).chosen;
  if (chosen?.optionId === "YES") return "yes";
  if (chosen?.optionId === "NO") return "no";
  return "abstain";
}

export function chooseIntroduce(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  rng: RngService,
): PolicyItem | null {
  if (politicianId === state.playerPoliticianId) return null;
  const issues = world.issueIds.slice().sort();
  if (issues.length === 0) return null;
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return null;
  const issueId = issues[Math.floor(rng.float01("legislature") * issues.length)]!;
  const dim = world.issueDimensions[issueId] ?? "institutional";
  const axis =
    dim === "economic" || dim === "economic-social"
      ? "economic"
      : dim === "social"
        ? "social"
        : dim === "foreign"
          ? "globalism"
          : "authority";
  const v = profile.ideology[axis] ?? 0;
  const direction = v >= 0 ? 1 : -1;
  const magnitude = Math.min(1, 0.35 + Math.abs(v) * 0.5);
  const options: DecisionOption[] = [
    {
      optionId: "INTRODUCE",
      actionType: "INTRODUCE_BILL",
      targetIds: [],
      uncertainty: 0.2,
      signals: emptySignals({
        ideologicalAlignment: Math.abs(v),
        careerBenefit: 0.35 + profile.traits.ambition * 0.3,
        pragmaticEffectiveness: 0.2 + profile.skills.legislation * 0.3,
        risk: 0.15,
      }),
      goalImpacts: goalImpacts(state, politicianId, 0.4),
      metadata: { issueId },
    },
    {
      optionId: "WAIT",
      actionType: "WAIT",
      targetIds: [],
      uncertainty: 0.08,
      signals: emptySignals({ risk: 0.04, careerBenefit: 0.05 }),
      goalImpacts: {},
      metadata: {},
    },
  ];
  const ctx = buildDecisionActorContext(world, state, politicianId, []);
  const chosen = chooseDecision(options, ctx, rng).chosen;
  if (chosen?.optionId !== "INTRODUCE") return null;
  return { issueId, direction, magnitude, fiscalImpact: null };
}

export function choosePresidentDisposition(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  bill: BillState,
  rng: RngService,
): "sign" | "return" {
  if (presidentId === state.playerPoliticianId) return "sign";
  const fit = billPolicyFit(world, state, presidentId, bill);
  const options: DecisionOption[] = [
    {
      optionId: "SIGN",
      actionType: "SIGN_BILL",
      targetIds: [bill.sponsorId],
      uncertainty: 0.15,
      signals: emptySignals({
        ideologicalAlignment: fit,
        institutionalAlignment: 0.25,
        careerBenefit: 0.2,
        risk: 0.1,
      }),
      goalImpacts: goalImpacts(state, presidentId, 0.25),
      metadata: { billId: bill.id },
    },
    {
      optionId: "RETURN",
      actionType: "RETURN_BILL",
      targetIds: [bill.sponsorId],
      uncertainty: 0.2,
      signals: emptySignals({
        ideologicalAlignment: -fit,
        institutionalAlignment: 0.1,
        careerBenefit: 0.15,
        risk: 0.22,
      }),
      goalImpacts: goalImpacts(state, presidentId, 0.1),
      metadata: { billId: bill.id },
    },
  ];
  const ctx = buildDecisionActorContext(world, state, presidentId, [bill.sponsorId]);
  const chosen = chooseDecision(options, ctx, rng).chosen;
  return chosen?.optionId === "RETURN" ? "return" : "sign";
}
