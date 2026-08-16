export const IDEOLOGY_AXES = [
  "economic",
  "social",
  "authority",
  "green",
  "nationalism",
  "globalism",
] as const;
export type IdeologyAxis = (typeof IDEOLOGY_AXES)[number];

export const TRAIT_KEYS = [
  "ambition",
  "integrity",
  "ego",
  "riskTolerance",
  "sociability",
  "pragmatism",
  "institutionalism",
  "partyLoyalty",
  "factionLoyalty",
  "retirementInclination",
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export const SKILL_KEYS = [
  "campaigning",
  "fundraising",
  "legislation",
  "administration",
  "media",
  "negotiation",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export const AI_TIERS = ["rich", "standard", "light"] as const;
export type AiTier = (typeof AI_TIERS)[number];

export const MEMORY_DURABILITIES = ["fleeting", "normal", "durable", "permanent"] as const;
export type MemoryDurability = (typeof MEMORY_DURABILITIES)[number];

export const MEMORY_KINDS = [
  "endorsement",
  "favor",
  "betrayal",
  "public_attack",
  "private_help",
  "appointment",
  "successful_cooperation",
  "failed_negotiation",
  "kept_promise",
  "broken_promise",
  "major_vote_support",
  "election_rivalry",
  "scandal_association",
  "generic",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const BELIEF_TOPICS = ["ideology", "trait", "skill"] as const;
export type BeliefTopic = (typeof BELIEF_TOPICS)[number];

export const GOAL_TYPES = [
  "retain_office",
  "career_advancement",
  "seek_office",
  "increase_influence",
  "advance_party",
  "advance_faction",
  "issue_outcome",
  "reputation",
  "legacy",
  "retirement",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_STATUSES = ["active", "satisfied", "abandoned", "superseded"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_HORIZONS = ["immediate", "near", "medium", "career", "lifetime"] as const;
export type GoalHorizon = (typeof GOAL_HORIZONS)[number];

export const PRESIDENTIAL_SEEK_STATUSES = [
  "frontrunner",
  "likely",
  "possible",
  "exploring",
] as const;

export function isIdeologyAxis(v: string): v is IdeologyAxis {
  return (IDEOLOGY_AXES as readonly string[]).includes(v);
}

export function isTraitKey(v: string): v is TraitKey {
  return (TRAIT_KEYS as readonly string[]).includes(v);
}

export function isSkillKey(v: string): v is SkillKey {
  return (SKILL_KEYS as readonly string[]).includes(v);
}

export function isAiTier(v: string): v is AiTier {
  return (AI_TIERS as readonly string[]).includes(v);
}

export function isMemoryDurability(v: string): v is MemoryDurability {
  return (MEMORY_DURABILITIES as readonly string[]).includes(v);
}

export function isMemoryKind(v: string): v is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(v);
}

export function isBeliefTopic(v: string): v is BeliefTopic {
  return (BELIEF_TOPICS as readonly string[]).includes(v);
}

export function isGoalType(v: string): v is GoalType {
  return (GOAL_TYPES as readonly string[]).includes(v);
}

export function isGoalStatus(v: string): v is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(v);
}

export function isGoalHorizon(v: string): v is GoalHorizon {
  return (GOAL_HORIZONS as readonly string[]).includes(v);
}

export function beliefDimensionValid(topic: BeliefTopic, dimension: string): boolean {
  if (topic === "ideology") return isIdeologyAxis(dimension);
  if (topic === "trait") return isTraitKey(dimension);
  return isSkillKey(dimension);
}
