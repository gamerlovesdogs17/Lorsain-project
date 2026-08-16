import { buildDecisionActorContext } from "../agents/context.js";
import { chooseDecision, emptySignals, type DecisionOption } from "../agents/decisions.js";
import { goalsOwnedBy } from "../agents/goals.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { DISCIPLINE_SIGNAL_SCALE, MEMBERSHIP_LOYALTY_STAY } from "./policy.js";
import { partyCultureCompatibility } from "./culture.js";
import { partyMembers } from "./queries.js";

export function endorsementDecisionOptions(
  contestId: string,
  candidateIds: readonly string[],
): DecisionOption[] {
  const opts: DecisionOption[] = [
    {
      optionId: "NEUTRAL",
      actionType: "ENDORSEMENT_NEUTRAL",
      targetIds: [],
      uncertainty: 0.2,
      signals: emptySignals({ risk: 0.1, institutionalAlignment: 0.1 }),
      goalImpacts: {},
      metadata: { contestId },
    },
  ];
  for (const id of [...candidateIds].sort()) {
    opts.push({
      optionId: `ENDORSE:${id}`,
      actionType: "ENDORSE_CANDIDATE",
      targetIds: [id],
      uncertainty: 0.25,
      signals: emptySignals({ partyAlignment: 0.4, factionAlignment: 0.3, careerBenefit: 0.15 }),
      goalImpacts: {},
      metadata: { contestId, targetId: id },
    });
  }
  return opts;
}

export function chooseEndorsement(
  world: KernelWorld,
  state: SimState,
  endorserId: string,
  contestId: string,
  candidateIds: readonly string[],
  rng: RngService,
): string | null {
  if (endorserId === state.playerPoliticianId) return null;
  const ctx = buildDecisionActorContext(world, state, endorserId, [...candidateIds]);
  const contest = state.partyContests[contestId];
  const cohesion = contest ? (state.partyStates[contest.partyId]?.cohesion ?? 0.5) : 0.5;
  const options = endorsementDecisionOptions(contestId, candidateIds).map((opt) => {
    const targetId = typeof opt.metadata.targetId === "string" ? opt.metadata.targetId : null;
    const target = targetId ? state.politicians[targetId] : null;
    const endorser = state.politicians[endorserId];
    const partyAlign = target && endorser && target.partyId === endorser.partyId ? 0.6 : 0;
    const facAlign =
      target && endorser && target.factionId && target.factionId === endorser.factionId ? 0.7 : 0.1;
    const rel = ctx.relationshipsToward[targetId ?? ""]?.trust ?? 0;
    return {
      ...opt,
      signals: emptySignals({
        partyAlignment: Math.min(1, partyAlign + cohesion * DISCIPLINE_SIGNAL_SCALE),
        factionAlignment: facAlign,
        relationshipConsequence: rel,
        careerBenefit: opt.signals.careerBenefit,
        risk: 0.15,
        institutionalAlignment: 0.2,
      }),
    };
  });
  const out = chooseDecision(options, ctx, rng);
  const chosen = out.chosen?.optionId ?? null;
  if (!chosen || chosen === "NEUTRAL") return null;
  return chosen.startsWith("ENDORSE:") ? chosen.slice("ENDORSE:".length) : null;
}

export function membershipDecisionOptions(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): DecisionOption[] {
  const pol = state.politicians[politicianId];
  if (!pol) return [];
  const opts: DecisionOption[] = [
    {
      optionId: "STAY",
      actionType: "STAY_PARTY",
      targetIds: [],
      uncertainty: 0.15,
      signals: emptySignals({
        partyAlignment: MEMBERSHIP_LOYALTY_STAY,
        institutionalAlignment: 0.3,
        risk: 0.05,
      }),
      goalImpacts: {},
      metadata: {},
    },
  ];
  if (pol.partyId) {
    const def = world.partyDefinitions[pol.partyId];
    for (const factionId of def?.factionIds ?? []) {
      if (factionId === pol.factionId) continue;
      opts.push({
        optionId: `FACTION:${factionId}`,
        actionType: "SWITCH_FACTION",
        targetIds: [],
        uncertainty: 0.25,
        signals: emptySignals({ factionAlignment: 0.4, risk: 0.2 }),
        goalImpacts: {},
        metadata: { factionId },
      });
    }
    opts.push({
      optionId: "INDEPENDENT",
      actionType: "LEAVE_PARTY",
      targetIds: [],
      uncertainty: 0.45,
      signals: emptySignals({ risk: 0.55, integrityAlignment: 0.2 }),
      goalImpacts: {},
      metadata: {},
    });
  }
  for (const partyId of Object.keys(world.partyDefinitions).sort()) {
    if (partyId === pol.partyId) continue;
    const compat = partyCultureCompatibility(world, state, politicianId, partyId);
    opts.push({
      optionId: `JOIN:${partyId}`,
      actionType: "JOIN_PARTY",
      targetIds: [],
      uncertainty: 0.4,
      signals: emptySignals({
        partyAlignment: compat,
        careerBenefit: 0.15,
        risk: 0.4,
      }),
      goalImpacts: {},
      metadata: { partyId },
    });
  }
  const goals = goalsOwnedBy(state, politicianId).filter((g) => g.status === "active");
  void goals;
  void partyMembers;
  return opts;
}

export function chooseMembershipAction(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  rng: RngService,
): string | null {
  if (politicianId === state.playerPoliticianId) return null;
  const options = membershipDecisionOptions(world, state, politicianId);
  if (options.length === 0) return null;
  const ctx = buildDecisionActorContext(world, state, politicianId, []);
  return chooseDecision(options, ctx, rng).chosen?.optionId ?? null;
}
