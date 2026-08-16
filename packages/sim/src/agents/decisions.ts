import type { JsonObject } from "../json.js";
import { jsonSafetyError } from "../json.js";
import type { RngService } from "../rng.js";
import {
  DECISION_NOISE_CAP,
  DECISION_OPTION_BUDGET,
  DECISION_TIER_NOISE,
  DECISION_WEIGHTS,
  UTILITY_SUM_EPSILON,
  clamp01,
} from "./policy.js";
import type { DecisionActorContext } from "./context.js";
import { relationshipComposite, type RelationshipStance } from "./relationships.js";

export type DecisionSignals = {
  ideologicalAlignment: number;
  partyAlignment: number;
  factionAlignment: number;
  careerBenefit: number;
  relationshipConsequence: number;
  integrityAlignment: number;
  institutionalAlignment: number;
  statusBenefit: number;
  pragmaticEffectiveness: number;
  risk: number;
};

export type DecisionOption = {
  optionId: string;
  actionType: string;
  targetIds: string[];
  uncertainty: number;
  signals: DecisionSignals;
  /** Impacts keyed by the actor's active goal IDs, not goal types. */
  goalImpacts: Record<string, number>;
  metadata: JsonObject;
};

export type UtilityComponents = {
  goalProgress: number;
  ideology: number;
  party: number;
  faction: number;
  career: number;
  relationship: number;
  integrity: number;
  institutionalism: number;
  ego: number;
  pragmatism: number;
  risk: number;
};

export type GoalImpactContribution = {
  goalId: string;
  impact: number;
  contribution: number;
};

export type UtilityBreakdown = {
  optionId: string;
  totalUtility: number;
  components: UtilityComponents;
  goalContributions: GoalImpactContribution[];
  stochasticAdjustment: number;
  finalUtility: number;
  considered: boolean;
};

export class DecisionContractError extends Error {
  readonly code = "INVALID_DECISION_OPTION";
  constructor(message: string) {
    super(message);
    this.name = "DecisionContractError";
  }
}

const COMPONENT_KEYS = [
  "goalProgress",
  "ideology",
  "party",
  "faction",
  "career",
  "relationship",
  "integrity",
  "institutionalism",
  "ego",
  "pragmatism",
  "risk",
] as const;

const SIGNAL_BOUNDS: Record<keyof DecisionSignals, { min: number; max: number }> = {
  ideologicalAlignment: { min: -1, max: 1 },
  partyAlignment: { min: -1, max: 1 },
  factionAlignment: { min: -1, max: 1 },
  careerBenefit: { min: -1, max: 1 },
  relationshipConsequence: { min: -1, max: 1 },
  integrityAlignment: { min: -1, max: 1 },
  institutionalAlignment: { min: -1, max: 1 },
  statusBenefit: { min: -1, max: 1 },
  pragmaticEffectiveness: { min: -1, max: 1 },
  risk: { min: 0, max: 1 },
};

const SIGNAL_KEYS = Object.keys(SIGNAL_BOUNDS) as Array<keyof DecisionSignals>;

export function sumComponents(components: UtilityComponents): number {
  let s = 0;
  for (const k of COMPONENT_KEYS) s += components[k];
  return s;
}

function finiteInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function meanStance(ctx: DecisionActorContext, targetIds: string[]): RelationshipStance | null {
  const stances = targetIds
    .filter((id) => id !== ctx.actorId)
    .map((id) => ctx.relationshipsToward[id])
    .filter((s): s is RelationshipStance => s != null);
  if (!stances.length) return null;
  const acc = { affinity: 0, trust: 0, respect: 0 };
  for (const s of stances) {
    acc.affinity += s.affinity;
    acc.trust += s.trust;
    acc.respect += s.respect;
  }
  const n = stances.length;
  return { affinity: acc.affinity / n, trust: acc.trust / n, respect: acc.respect / n };
}

function isOptionRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decisionOptionError(option: unknown, ctx: DecisionActorContext): string | null {
  if (!isOptionRecord(option)) {
    return "DecisionOption must be a non-null object";
  }
  const opt = option as unknown as DecisionOption;
  if (typeof opt.optionId !== "string" || opt.optionId.length === 0) {
    return "DecisionOption missing optionId";
  }
  if (typeof opt.actionType !== "string" || opt.actionType.length === 0) {
    return `option ${opt.optionId} actionType must be a nonempty string`;
  }
  if (!Array.isArray(opt.targetIds) || opt.targetIds.some((id) => typeof id !== "string")) {
    return `option ${opt.optionId} targetIds must be an array of strings`;
  }
  const dupTarget = firstDuplicate(opt.targetIds);
  if (dupTarget) {
    return `option ${opt.optionId} duplicate targetId ${dupTarget}`;
  }
  for (const targetId of opt.targetIds) {
    if (!ctx.publicFactsById[targetId]) {
      return `option ${opt.optionId} targetId ${targetId} is not in actor public facts`;
    }
  }
  if (!finiteInRange(opt.uncertainty, 0, 1)) {
    return `option ${opt.optionId} uncertainty must be a finite number in [0, 1]`;
  }
  if (opt.signals === null || typeof opt.signals !== "object" || Array.isArray(opt.signals)) {
    return `option ${opt.optionId} signals must be an object`;
  }
  const extraSignals = Object.keys(opt.signals).filter(
    (k) => !SIGNAL_KEYS.includes(k as keyof DecisionSignals),
  );
  if (extraSignals.length) {
    return `option ${opt.optionId} unknown signal ${extraSignals[0]}`;
  }
  for (const key of SIGNAL_KEYS) {
    const bounds = SIGNAL_BOUNDS[key];
    const value = opt.signals[key];
    if (!finiteInRange(value, bounds.min, bounds.max)) {
      return `option ${opt.optionId} ${key} must be a finite number in [${bounds.min}, ${bounds.max}]`;
    }
  }
  if (
    opt.goalImpacts === null ||
    typeof opt.goalImpacts !== "object" ||
    Array.isArray(opt.goalImpacts)
  ) {
    return `option ${opt.optionId} goalImpacts must be an object`;
  }
  const activeGoals = new Map(ctx.goals.filter((g) => g.status === "active").map((g) => [g.id, g]));
  for (const [goalId, impact] of Object.entries(opt.goalImpacts)) {
    if (typeof goalId !== "string" || goalId.length === 0) {
      return `option ${opt.optionId} goalImpacts keys must be nonempty strings`;
    }
    if (!finiteInRange(impact, -1, 1)) {
      return `option ${opt.optionId} goalImpacts.${goalId} must be a finite number in [-1, 1]`;
    }
    const goal = activeGoals.get(goalId);
    if (!goal || goal.ownerId !== ctx.actorId) {
      return `option ${opt.optionId} goalImpacts.${goalId} is not an active goal of the actor`;
    }
  }
  const jsonErr = jsonSafetyError(opt.metadata, `option.${opt.optionId}.metadata`);
  if (jsonErr) return jsonErr;
  return null;
}

export function decisionOptionSetError(options: unknown, ctx: DecisionActorContext): string | null {
  if (!Array.isArray(options)) return "DecisionOption set must be an array";
  for (let i = 0; i < options.length; i++) {
    if (!isOptionRecord(options[i])) {
      return `DecisionOption at index ${i} must be a non-null object`;
    }
  }
  const typed = options as DecisionOption[];
  const ids = typed.map((opt) => opt.optionId);
  const dup = firstDuplicate(ids.filter((id) => typeof id === "string" && id.length > 0));
  if (dup) return `duplicate DecisionOption id ${dup}`;
  for (const option of typed) {
    const err = decisionOptionError(option, ctx);
    if (err) return err;
  }
  return null;
}

function assertValidOptionSet(options: DecisionOption[], ctx: DecisionActorContext): void {
  const err = decisionOptionSetError(options, ctx);
  if (err) throw new DecisionContractError(err);
}

export function evaluateOption(
  option: DecisionOption,
  ctx: DecisionActorContext,
  stochasticAdjustment = 0,
): UtilityBreakdown {
  const err = decisionOptionError(option, ctx);
  if (err) throw new DecisionContractError(err);
  const t = ctx.profile.traits;
  const s = option.signals;
  const known = meanStance(ctx, option.targetIds);
  const relKnowledge = known ? relationshipComposite(known) : 0;
  const relationshipInput =
    option.targetIds.filter((id) => id !== ctx.actorId).length > 0
      ? DECISION_WEIGHTS.relationshipDomainBlend * s.relationshipConsequence +
        DECISION_WEIGHTS.relationshipKnowledgeBlend * relKnowledge
      : s.relationshipConsequence;
  const goalContributions: GoalImpactContribution[] = [];
  let goalProgress = 0;
  const impactIds = Object.keys(option.goalImpacts).sort();
  const goalsById = new Map(ctx.goals.filter((g) => g.status === "active").map((g) => [g.id, g]));
  for (const goalId of impactIds) {
    const goal = goalsById.get(goalId);
    if (!goal) continue;
    const impact = option.goalImpacts[goalId]!;
    const contribution = goal.priority * impact * DECISION_WEIGHTS.goalScale;
    goalContributions.push({ goalId, impact, contribution });
    goalProgress += contribution;
  }
  const components: UtilityComponents = {
    goalProgress,
    ideology: DECISION_WEIGHTS.ideologyBase * s.ideologicalAlignment,
    party:
      (DECISION_WEIGHTS.partyBase + DECISION_WEIGHTS.partyLoyalty * t.partyLoyalty) *
      s.partyAlignment,
    faction:
      (DECISION_WEIGHTS.factionBase + DECISION_WEIGHTS.factionLoyalty * t.factionLoyalty) *
      s.factionAlignment,
    career:
      (DECISION_WEIGHTS.careerBase + DECISION_WEIGHTS.ambition * t.ambition) * s.careerBenefit,
    relationship:
      (DECISION_WEIGHTS.relationshipBase + DECISION_WEIGHTS.sociability * t.sociability) *
      relationshipInput,
    integrity:
      (DECISION_WEIGHTS.integrityBase + DECISION_WEIGHTS.integrity * t.integrity) *
      s.integrityAlignment,
    institutionalism:
      (DECISION_WEIGHTS.institutionalBase +
        DECISION_WEIGHTS.institutionalism * t.institutionalism) *
      s.institutionalAlignment,
    ego: (DECISION_WEIGHTS.egoBase + DECISION_WEIGHTS.ego * t.ego) * s.statusBenefit,
    pragmatism:
      (DECISION_WEIGHTS.pragmatismBase + DECISION_WEIGHTS.pragmatism * t.pragmatism) *
      s.pragmaticEffectiveness,
    risk:
      -(DECISION_WEIGHTS.riskBase + DECISION_WEIGHTS.riskAversion * (1 - t.riskTolerance)) *
      clamp01(s.risk),
  };
  const totalUtility = sumComponents(components);
  return {
    optionId: option.optionId,
    totalUtility,
    components,
    goalContributions,
    stochasticAdjustment,
    finalUtility: totalUtility + stochasticAdjustment,
    considered: true,
  };
}

export function breakdownSumsToTotal(
  breakdown: UtilityBreakdown,
  eps = UTILITY_SUM_EPSILON,
): boolean {
  return Math.abs(sumComponents(breakdown.components) - breakdown.totalUtility) <= eps;
}

export function breakdownSumsToFinal(
  breakdown: UtilityBreakdown,
  eps = UTILITY_SUM_EPSILON,
): boolean {
  return (
    Math.abs(breakdown.totalUtility + breakdown.stochasticAdjustment - breakdown.finalUtility) <=
    eps
  );
}

function noiseAmplitude(ctx: DecisionActorContext, uncertainty: number): number {
  const base = DECISION_TIER_NOISE[ctx.profile.aiTier];
  return Math.min(DECISION_NOISE_CAP, base * (1 + clamp01(uncertainty)));
}

function sortOptions(options: DecisionOption[]): DecisionOption[] {
  return [...options].sort((a, b) => {
    if (a.optionId < b.optionId) return -1;
    if (a.optionId > b.optionId) return 1;
    return 0;
  });
}

function compareRanked(a: UtilityBreakdown, b: UtilityBreakdown): number {
  if (a.considered !== b.considered) return a.considered ? -1 : 1;
  if (a.finalUtility !== b.finalUtility) return b.finalUtility - a.finalUtility;
  if (a.optionId < b.optionId) return -1;
  if (a.optionId > b.optionId) return 1;
  return 0;
}

export function evaluateDecision(
  options: DecisionOption[],
  ctx: DecisionActorContext,
  rng?: RngService,
): UtilityBreakdown[] {
  assertValidOptionSet(options, ctx);
  const sorted = sortOptions(options);
  const budget = DECISION_OPTION_BUDGET[ctx.profile.aiTier];
  const prelim = sorted.map((opt) => ({ opt, ev: evaluateOption(opt, ctx, 0) }));
  prelim.sort((a, b) => {
    if (a.ev.totalUtility !== b.ev.totalUtility) return b.ev.totalUtility - a.ev.totalUtility;
    if (a.opt.optionId < b.opt.optionId) return -1;
    if (a.opt.optionId > b.opt.optionId) return 1;
    return 0;
  });
  const considered = new Set(prelim.slice(0, budget).map((p) => p.opt.optionId));
  return sorted.map((opt) => {
    const inPool = considered.has(opt.optionId);
    if (!rng || !inPool) {
      return { ...evaluateOption(opt, ctx, 0), considered: inPool };
    }
    const amp = noiseAmplitude(ctx, opt.uncertainty);
    const adj = (rng.float01("npc-decisions") * 2 - 1) * amp;
    return { ...evaluateOption(opt, ctx, adj), considered: true };
  });
}

export function chooseDecision(
  options: DecisionOption[],
  ctx: DecisionActorContext,
  rng?: RngService,
): { chosen: UtilityBreakdown | null; ranked: UtilityBreakdown[] } {
  if (!Array.isArray(options)) {
    throw new DecisionContractError("DecisionOption set must be an array");
  }
  if (options.length === 0) return { chosen: null, ranked: [] };
  const evaluated = evaluateDecision(options, ctx, rng);
  const pool = evaluated.filter((r) => r.considered);
  const consideredPool = pool.length ? pool : evaluated;
  let chosen = consideredPool[0]!;
  for (const row of consideredPool) {
    if (row.finalUtility > chosen.finalUtility) chosen = row;
    else if (row.finalUtility === chosen.finalUtility && row.optionId < chosen.optionId)
      chosen = row;
  }
  const ranked = [...evaluated].sort(compareRanked);
  return { chosen, ranked };
}

export function emptySignals(partial: Partial<DecisionSignals> = {}): DecisionSignals {
  return {
    ideologicalAlignment: 0,
    partyAlignment: 0,
    factionAlignment: 0,
    careerBenefit: 0,
    relationshipConsequence: 0,
    integrityAlignment: 0,
    institutionalAlignment: 0,
    statusBenefit: 0,
    pragmaticEffectiveness: 0,
    risk: 0,
    ...partial,
  };
}
