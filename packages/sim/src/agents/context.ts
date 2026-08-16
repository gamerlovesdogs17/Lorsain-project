import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import { getBelief, type BeliefRecord } from "./beliefs.js";
import { BELIEF_TOPICS, IDEOLOGY_AXES, SKILL_KEYS, TRAIT_KEYS } from "./types.js";
import { goalsOwnedBy, type PoliticianGoal } from "./goals.js";
import { DECISION_MEMORY_CONTEXT } from "./policy.js";
import { effectiveSalience, memoriesOwnedBy, type PoliticalMemory } from "./memories.js";
import {
  getAgentProfile,
  publicPoliticianFacts,
  type AgentProfile,
  type PublicPoliticianFacts,
} from "./profile.js";
import { getRelationship, type RelationshipStance } from "./relationships.js";

/**
 * Decision-time knowledge for one actor. Contains the actor's own true profile
 * plus owned beliefs/relationships/goals and public facts about others.
 * It must not include another politician's hidden AgentProfile.
 */
export type DecisionActorContext = {
  actorId: string;
  currentDate: IsoDate;
  profile: AgentProfile;
  partyId: string | null;
  factionId: string | null;
  occupyingKinds: string[];
  goals: PoliticianGoal[];
  relationshipsToward: Record<string, RelationshipStance>;
  beliefsAbout: Record<string, BeliefRecord[]>;
  memories: PoliticalMemory[];
  publicFactsById: Record<string, PublicPoliticianFacts>;
};

export function buildDecisionActorContext(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  targetIds: string[],
): DecisionActorContext {
  const profile = getAgentProfile(world, state, actorId);
  if (!profile) {
    throw new Error(`No AgentProfile for decision actor ${actorId}`);
  }
  const runtime = state.politicians[actorId];
  if (!runtime) throw new Error(`Unknown politician ${actorId}`);
  const factsSelf = publicPoliticianFacts(world, state, actorId);
  const uniqueTargets = [...new Set(targetIds.filter((id) => id !== actorId))].sort();
  const relationshipsToward: Record<string, RelationshipStance> = {};
  const beliefsAbout: Record<string, BeliefRecord[]> = {};
  const publicFactsById: Record<string, PublicPoliticianFacts> = {};
  if (factsSelf) publicFactsById[actorId] = factsSelf;
  for (const targetId of uniqueTargets) {
    const facts = publicPoliticianFacts(world, state, targetId);
    if (facts) publicFactsById[targetId] = facts;
    relationshipsToward[targetId] = getRelationship(state, actorId, targetId, state.currentDate);
    const recs: BeliefRecord[] = [];
    for (const topic of BELIEF_TOPICS) {
      const dims =
        topic === "ideology" ? IDEOLOGY_AXES : topic === "trait" ? TRAIT_KEYS : SKILL_KEYS;
      for (const dim of dims) {
        const belief = getBelief(state, actorId, targetId, topic, dim, state.currentDate);
        if (belief) recs.push(belief);
      }
    }
    if (recs.length) beliefsAbout[targetId] = recs;
  }
  const memoryCap = DECISION_MEMORY_CONTEXT[profile.aiTier];
  const memories =
    memoryCap <= 0
      ? []
      : [...memoriesOwnedBy(state, actorId)]
          .sort((a, b) => {
            const sa = effectiveSalience(a, state.currentDate);
            const sb = effectiveSalience(b, state.currentDate);
            if (sa !== sb) return sb - sa;
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          })
          .slice(0, memoryCap);
  return {
    actorId,
    currentDate: state.currentDate,
    profile,
    partyId: runtime.partyId,
    factionId: runtime.factionId,
    occupyingKinds: factsSelf?.officeKinds ?? [],
    goals: goalsOwnedBy(state, actorId).filter((g) => g.status === "active"),
    relationshipsToward,
    beliefsAbout,
    memories,
    publicFactsById,
  };
}
