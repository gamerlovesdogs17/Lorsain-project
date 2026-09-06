import type { KernelWorld, SimState } from "../types.js";
import { getRelationship } from "../agents/relationships.js";
import { getAgentProfile } from "../agents/profile.js";

export type ExplainFactor = { code: string; label: string; weight: number };

/** Why a politician endorsed a candidate — factor array for Why UI. */
export function explainEndorsement(
  world: KernelWorld,
  state: SimState,
  endorserId: string,
  targetId: string,
  contestId?: string | null,
): ExplainFactor[] {
  const factors: ExplainFactor[] = [];
  const endorser = state.politicians[endorserId];
  const target = state.politicians[targetId];
  if (!endorser || !target) return factors;

  if (endorser.partyId && endorser.partyId === target.partyId) {
    factors.push({ code: "same_party", label: "Same party", weight: 0.25 });
  }
  if (endorser.factionId && endorser.factionId === target.factionId) {
    factors.push({ code: "same_faction", label: "Shared faction", weight: 0.3 });
  }

  const rel = getRelationship(state, endorserId, targetId, state.currentDate);
  const composite = rel.affinity * 0.4 + rel.trust * 0.4 + rel.respect * 0.2;
  if (composite > 0.15) {
    factors.push({
      code: "relationship",
      label: "Personal relationship",
      weight: Math.min(0.35, composite),
    });
  } else if (composite < -0.15) {
    factors.push({
      code: "frosty_relationship",
      label: "Frosty personal relationship",
      weight: Math.max(-0.35, composite),
    });
  }

  const ep = getAgentProfile(world, state, endorserId);
  const tp = getAgentProfile(world, state, targetId);
  if (ep && tp) {
    const ideologyDistance =
      Math.abs(ep.ideology.economic - tp.ideology.economic) * 0.3 +
      Math.abs(ep.ideology.social - tp.ideology.social) * 0.3 +
      Math.abs(ep.ideology.authority - tp.ideology.authority) * 0.2 +
      Math.abs(ep.ideology.green - tp.ideology.green) * 0.2;
    const alignment = Math.max(-0.25, 0.3 - ideologyDistance);
    factors.push({
      code: "ideology_fit",
      label: alignment >= 0 ? "Ideological alignment" : "Ideological distance",
      weight: alignment,
    });
    if (tp.skills.negotiation >= 0.65) {
      factors.push({ code: "competence", label: "Perceived competence", weight: 0.12 });
    }
    if (
      ep.traits.partyLoyalty >= 0.7 &&
      state.partyStates[endorser.partyId ?? ""]?.leaderId === targetId
    ) {
      factors.push({ code: "loyalty_to_leader", label: "Loyalty to sitting leader", weight: 0.2 });
    }
  }

  if (contestId) {
    const prior = Object.values(state.endorsements).filter(
      (e) =>
        e.endorserId === endorserId &&
        e.targetId === targetId &&
        e.status === "active" &&
        e.contestId !== contestId,
    ).length;
    if (prior > 0) {
      factors.push({ code: "prior_endorsements", label: "Prior endorsements", weight: 0.15 });
    }
  }

  return factors.sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code));
}

/** Why a caucus/party member would support a leadership candidate. */
export function explainLeadershipSupport(
  world: KernelWorld,
  state: SimState,
  supporterId: string,
  candidateId: string,
  contestId?: string | null,
): ExplainFactor[] {
  const base = explainEndorsement(world, state, supporterId, candidateId, contestId);
  const profile = getAgentProfile(world, state, candidateId);
  if (profile) {
    const leadership =
      profile.skills.negotiation * 0.2 +
      profile.skills.legislation * 0.15 +
      profile.traits.ambition * 0.1;
    base.push({
      code: "leadership_skill",
      label: "Leadership skill",
      weight: Math.min(0.3, leadership),
    });
  }
  const contest = contestId ? state.partyContests[contestId] : null;
  if (contest?.type === "party_leadership") {
    const incumbent = state.partyStates[contest.partyId]?.leaderId;
    if (incumbent === candidateId) {
      base.push({ code: "incumbent", label: "Incumbent advantage", weight: 0.18 });
    } else if (incumbent) {
      base.push({ code: "challenger", label: "Change candidate", weight: 0.08 });
    }
  }
  return base.sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code));
}
