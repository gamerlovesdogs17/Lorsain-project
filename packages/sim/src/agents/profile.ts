import { isIsoDate, parseIsoDate, type IsoDate } from "../calendar.js";
import { isJsonObject, jsonSafetyError } from "../json.js";
import type { JsonObject } from "../json.js";
import type { KernelWorld, SimState } from "../types.js";
import { clamp } from "./policy.js";
import {
  AI_TIERS,
  IDEOLOGY_AXES,
  SKILL_KEYS,
  TRAIT_KEYS,
  type AiTier,
  type IdeologyAxis,
  type SkillKey,
  type TraitKey,
} from "./types.js";

export type IdeologyVector = Record<IdeologyAxis, number>;
export type TraitVector = Record<TraitKey, number>;
export type SkillVector = Record<SkillKey, number>;

/**
 * Immutable starting (or generated) politician-brain profile.
 * Hidden simulation truth — other actors do not receive this object.
 */
export type AgentProfile = {
  politicianId: string;
  birthDate: IsoDate | null;
  ideology: IdeologyVector;
  traits: TraitVector;
  skills: SkillVector;
  issueSalience: Record<string, number>;
  aiTier: AiTier;
  roleTypes: string[];
  presidentialStatus: string | null;
};

/**
 * Sparse runtime overrides for future ideology/skill drift.
 * Never copy 530 full profiles into a save solely in anticipation of this.
 */
export type AgentProfileOverride = {
  ideology?: Partial<IdeologyVector>;
  traits?: Partial<TraitVector>;
  skills?: Partial<SkillVector>;
  issueSalience?: Record<string, number>;
};

export type FigureProfileSource = {
  id: string;
  birth_date?: string | null;
  ideology?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  skills?: Record<string, unknown>;
  issue_salience?: Record<string, unknown>;
  ai_tier?: string;
  roles?: Array<{ type: string }>;
  presidential_status?: string | null;
};

function finiteInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

export function emptyIdeology(): IdeologyVector {
  return {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
}

export function emptyTraits(fill = 0.5): TraitVector {
  return {
    ambition: fill,
    integrity: fill,
    ego: fill,
    riskTolerance: fill,
    sociability: fill,
    pragmatism: fill,
    institutionalism: fill,
    partyLoyalty: fill,
    factionLoyalty: fill,
    retirementInclination: fill,
  };
}

export function emptySkills(fill = 0.5): SkillVector {
  return {
    campaigning: fill,
    fundraising: fill,
    legislation: fill,
    administration: fill,
    media: fill,
    negotiation: fill,
  };
}

function unknownKeys(raw: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(raw).filter((k) => !allowed.includes(k));
}

export function readIdeology(raw: Record<string, unknown>): IdeologyVector | string {
  const extra = unknownKeys(raw, IDEOLOGY_AXES);
  if (extra.length) return `ideology has unknown axis ${extra[0]}`;
  const out = emptyIdeology();
  for (const axis of IDEOLOGY_AXES) {
    if (!finiteInRange(raw[axis], -1, 1))
      return `ideology.${axis} must be a finite number in [-1, 1]`;
    out[axis] = raw[axis];
  }
  return out;
}

export function readTraits(raw: Record<string, unknown>): TraitVector | string {
  const extra = unknownKeys(raw, TRAIT_KEYS);
  if (extra.length) return `traits has unknown key ${extra[0]}`;
  const out = emptyTraits(0);
  for (const key of TRAIT_KEYS) {
    if (!finiteInRange(raw[key], 0, 1)) return `traits.${key} must be a finite number in [0, 1]`;
    out[key] = raw[key];
  }
  return out;
}

export function readSkills(raw: Record<string, unknown>): SkillVector | string {
  const extra = unknownKeys(raw, SKILL_KEYS);
  if (extra.length) return `skills has unknown key ${extra[0]}`;
  const out = emptySkills(0);
  for (const key of SKILL_KEYS) {
    if (!finiteInRange(raw[key], 0, 1)) return `skills.${key} must be a finite number in [0, 1]`;
    out[key] = raw[key];
  }
  return out;
}

export function readIdeologyOverride(
  raw: Record<string, unknown>,
): Partial<IdeologyVector> | string {
  const extra = unknownKeys(raw, IDEOLOGY_AXES);
  if (extra.length) return `ideology has unknown axis ${extra[0]}`;
  const out: Partial<IdeologyVector> = {};
  for (const axis of IDEOLOGY_AXES) {
    if (!(axis in raw)) continue;
    if (!finiteInRange(raw[axis], -1, 1))
      return `ideology.${axis} must be a finite number in [-1, 1]`;
    out[axis] = raw[axis];
  }
  return out;
}

export function readTraitOverride(raw: Record<string, unknown>): Partial<TraitVector> | string {
  const extra = unknownKeys(raw, TRAIT_KEYS);
  if (extra.length) return `traits has unknown key ${extra[0]}`;
  const out: Partial<TraitVector> = {};
  for (const key of TRAIT_KEYS) {
    if (!(key in raw)) continue;
    if (!finiteInRange(raw[key], 0, 1)) return `traits.${key} must be a finite number in [0, 1]`;
    out[key] = raw[key];
  }
  return out;
}

export function readSkillOverride(raw: Record<string, unknown>): Partial<SkillVector> | string {
  const extra = unknownKeys(raw, SKILL_KEYS);
  if (extra.length) return `skills has unknown key ${extra[0]}`;
  const out: Partial<SkillVector> = {};
  for (const key of SKILL_KEYS) {
    if (!(key in raw)) continue;
    if (!finiteInRange(raw[key], 0, 1)) return `skills.${key} must be a finite number in [0, 1]`;
    out[key] = raw[key];
  }
  return out;
}

export function readIssueSalienceOverride(
  raw: Record<string, unknown>,
  issueIds?: readonly string[],
): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (issueIds && issueIds.length > 0 && !issueIds.includes(k)) {
      return `issue_salience has unknown issue ${k}`;
    }
    if (!finiteInRange(v, 0, 1)) return `issue_salience.${k} must be a finite number in [0, 1]`;
    out[k] = v;
  }
  return out;
}

export function readIssueSalience(
  raw: Record<string, unknown>,
  issueIds?: readonly string[],
): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!finiteInRange(v, 0, 1)) return `issue_salience.${k} must be a finite number in [0, 1]`;
    out[k] = v;
  }
  if (issueIds && issueIds.length > 0) {
    for (const id of issueIds) {
      if (!(id in out)) return `issue_salience missing required issue ${id}`;
    }
    for (const id of Object.keys(out)) {
      if (!issueIds.includes(id)) return `issue_salience has unknown issue ${id}`;
    }
  }
  return out;
}

export function agentProfileError(
  profile: AgentProfile,
  issueIds?: readonly string[],
): string | null {
  if (!profile.politicianId) return "AgentProfile missing politicianId";
  if (profile.birthDate != null && !isIsoDate(profile.birthDate)) {
    return `AgentProfile ${profile.politicianId} has invalid birthDate`;
  }
  const ideologyErr = readIdeology(profile.ideology);
  if (typeof ideologyErr === "string") return `AgentProfile ${profile.politicianId} ${ideologyErr}`;
  const traitErr = readTraits(profile.traits);
  if (typeof traitErr === "string") return `AgentProfile ${profile.politicianId} ${traitErr}`;
  const skillErr = readSkills(profile.skills);
  if (typeof skillErr === "string") return `AgentProfile ${profile.politicianId} ${skillErr}`;
  const salienceErr = readIssueSalience(profile.issueSalience, issueIds);
  if (typeof salienceErr === "string") return `AgentProfile ${profile.politicianId} ${salienceErr}`;
  if (!(AI_TIERS as readonly string[]).includes(profile.aiTier)) {
    return `AgentProfile ${profile.politicianId} invalid aiTier`;
  }
  if (!Array.isArray(profile.roleTypes) || profile.roleTypes.some((r) => typeof r !== "string")) {
    return `AgentProfile ${profile.politicianId} roleTypes must be strings`;
  }
  if (profile.presidentialStatus != null && typeof profile.presidentialStatus !== "string") {
    return `AgentProfile ${profile.politicianId} invalid presidentialStatus`;
  }
  const jsonErr = jsonSafetyError(
    profile as unknown as JsonObject,
    `profile.${profile.politicianId}`,
  );
  if (jsonErr) return jsonErr;
  return null;
}

export function profileFromFigure(
  figure: FigureProfileSource,
  issueIds?: readonly string[],
): AgentProfile {
  if (!figure.ideology || !isJsonObject(figure.ideology)) {
    throw new Error(`Figure ${figure.id} missing ideology`);
  }
  if (!figure.traits || !isJsonObject(figure.traits)) {
    throw new Error(`Figure ${figure.id} missing traits`);
  }
  if (!figure.skills || !isJsonObject(figure.skills)) {
    throw new Error(`Figure ${figure.id} missing skills`);
  }
  if (!figure.issue_salience || !isJsonObject(figure.issue_salience)) {
    throw new Error(`Figure ${figure.id} missing issue_salience`);
  }
  if (
    typeof figure.ai_tier !== "string" ||
    !(AI_TIERS as readonly string[]).includes(figure.ai_tier)
  ) {
    throw new Error(`Figure ${figure.id} missing or invalid ai_tier`);
  }
  const ideology = readIdeology(figure.ideology);
  if (typeof ideology === "string") throw new Error(`Figure ${figure.id} ${ideology}`);
  const traits = readTraits(figure.traits);
  if (typeof traits === "string") throw new Error(`Figure ${figure.id} ${traits}`);
  const skills = readSkills(figure.skills);
  if (typeof skills === "string") throw new Error(`Figure ${figure.id} ${skills}`);
  const issueSalience = readIssueSalience(figure.issue_salience, issueIds);
  if (typeof issueSalience === "string") throw new Error(`Figure ${figure.id} ${issueSalience}`);
  let birthDate: IsoDate | null = null;
  if (figure.birth_date != null && figure.birth_date !== "") {
    if (!isIsoDate(figure.birth_date)) throw new Error(`Figure ${figure.id} invalid birth_date`);
    birthDate = figure.birth_date;
  }
  const roleTypes = [...new Set((figure.roles ?? []).map((r) => r.type))].sort();
  return {
    politicianId: figure.id,
    birthDate,
    ideology,
    traits,
    skills,
    issueSalience,
    aiTier: figure.ai_tier as AiTier,
    roleTypes,
    presidentialStatus: figure.presidential_status ?? null,
  };
}

export function syntheticAgentProfile(
  politicianId: string,
  partial: Partial<AgentProfile> & {
    traits?: Partial<TraitVector>;
    skills?: Partial<SkillVector>;
    ideology?: Partial<IdeologyVector>;
  } = {},
): AgentProfile {
  const traits = { ...emptyTraits(0.5), retirementInclination: 0.3, ...partial.traits };
  const profile: AgentProfile = {
    politicianId,
    birthDate: partial.birthDate ?? "1960-06-15",
    ideology: { ...emptyIdeology(), ...partial.ideology },
    traits,
    skills: { ...emptySkills(0.5), ...partial.skills },
    issueSalience: partial.issueSalience ?? { ISS_REFORM: 0.4 },
    aiTier: partial.aiTier ?? "standard",
    roleTypes: partial.roleTypes ?? [],
    presidentialStatus: partial.presidentialStatus ?? null,
  };
  const err = agentProfileError(profile);
  if (err) throw new Error(err);
  return profile;
}

function applyKnownOverride<T extends Record<string, number>>(
  base: T,
  over: Partial<T> | undefined,
  keys: readonly string[],
  min: number,
  max: number,
): T {
  if (!over) return base;
  const out = { ...base };
  for (const key of keys) {
    const v = over[key as keyof T];
    if (typeof v === "number" && Number.isFinite(v)) {
      (out as Record<string, number>)[key] = clamp(v, min, max);
    }
  }
  return out;
}

/**
 * Resolve a politician profile.
 * Canonical KernelWorld profiles are the base for starter IDs.
 * Save-owned generatedAgentProfiles may only supply IDs absent from
 * world.agentProfiles. Sparse overrides may then apply to either source.
 */
export function getAgentProfile(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): AgentProfile | null {
  const canonical = world.agentProfiles[politicianId];
  const generated = state.generatedAgentProfiles[politicianId];
  const base = canonical ?? generated;
  if (!base) return null;
  const over = state.agentProfileOverrides[politicianId];
  if (!over) return base;
  const issueSalience = { ...base.issueSalience };
  if (over.issueSalience) {
    for (const [k, v] of Object.entries(over.issueSalience)) {
      if (world.issueIds.length > 0 && !world.issueIds.includes(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) issueSalience[k] = clamp(v, 0, 1);
    }
  }
  return {
    ...base,
    ideology: applyKnownOverride(base.ideology, over.ideology, IDEOLOGY_AXES, -1, 1),
    traits: applyKnownOverride(base.traits, over.traits, TRAIT_KEYS, 0, 1),
    skills: applyKnownOverride(base.skills, over.skills, SKILL_KEYS, 0, 1),
    issueSalience,
  };
}

export function requireAgentProfile(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): AgentProfile {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) {
    throw new Error(`No AgentProfile for politician ${politicianId}`);
  }
  return profile;
}

export function ageOnDate(birthDate: IsoDate | null, on: IsoDate): number | null {
  if (!birthDate) return null;
  const b = parseIsoDate(birthDate);
  const o = parseIsoDate(on);
  let age = o.year - b.year;
  if (o.month < b.month || (o.month === b.month && o.day < b.day)) age -= 1;
  return age;
}

export type PublicPoliticianFacts = {
  id: string;
  alive: boolean;
  retired: boolean;
  partyId: string | null;
  factionId: string | null;
  occupying: Array<{ officeId: string; kind: string }>;
  officeIds: string[];
  officeKinds: string[];
};

export function publicPoliticianFacts(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): PublicPoliticianFacts | null {
  const p = state.politicians[politicianId];
  if (!p) return null;
  const occupying: Array<{ officeId: string; kind: string }> = [];
  for (const t of Object.values(state.officeTerms)) {
    if (t.holderId !== politicianId || t.status === "ended") continue;
    occupying.push({
      officeId: t.officeId,
      kind: world.offices[t.officeId]?.kind ?? "unknown",
    });
  }
  occupying.sort((a, b) => (a.officeId < b.officeId ? -1 : a.officeId > b.officeId ? 1 : 0));
  return {
    id: p.id,
    alive: p.alive,
    retired: p.retired,
    partyId: p.partyId,
    factionId: p.factionId,
    occupying,
    officeIds: occupying.map((o) => o.officeId),
    officeKinds: occupying.map((o) => o.kind),
  };
}
