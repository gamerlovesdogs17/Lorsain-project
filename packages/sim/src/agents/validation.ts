import { compareIsoDate, isIsoDate, type IsoDate } from "../calendar.js";
import { isJsonObject, jsonSafetyError } from "../json.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { estimateRange, type BeliefRecord } from "./beliefs.js";
import { assertGoalShape, type PoliticianGoal } from "./goals.js";
import type { PoliticalMemory } from "./memories.js";
import {
  agentProfileError,
  readIdeology,
  readIdeologyOverride,
  readIssueSalience,
  readIssueSalienceOverride,
  readSkillOverride,
  readSkills,
  readTraitOverride,
  readTraits,
  type AgentProfile,
  type AgentProfileOverride,
} from "./profile.js";
import { RELATIONSHIP_MAX, RELATIONSHIP_MIN } from "./policy.js";
import { parseRelationshipDelta, type RelationshipEdge } from "./relationships.js";
import {
  AI_TIERS,
  beliefDimensionValid,
  isAiTier,
  isBeliefTopic,
  isMemoryDurability,
  isMemoryKind,
  type AiTier,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function finiteInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

export type ParsedAgentState = {
  relationships: SimState["relationships"];
  memories: SimState["memories"];
  beliefs: SimState["beliefs"];
  goals: SimState["goals"];
  generatedAgentProfiles: SimState["generatedAgentProfiles"];
  agentProfileOverrides: SimState["agentProfileOverrides"];
};

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function parseProfile(
  id: string,
  raw: unknown,
  issueIds?: readonly string[],
): AgentProfile | string {
  if (!isRecord(raw)) return `generatedAgentProfiles.${id} must be an object`;
  if (raw.politicianId !== id) return `generatedAgentProfiles.${id} politicianId mismatch`;
  if (raw.birthDate != null && !isIsoDate(raw.birthDate)) {
    return `generatedAgentProfiles.${id} invalid birthDate`;
  }
  if (!isRecord(raw.ideology) || !isRecord(raw.traits) || !isRecord(raw.skills)) {
    return `generatedAgentProfiles.${id} missing ideology/traits/skills`;
  }
  if (!isRecord(raw.issueSalience)) return `generatedAgentProfiles.${id} issueSalience`;
  const ideology = readIdeology(raw.ideology);
  if (typeof ideology === "string") return `generatedAgentProfiles.${id} ${ideology}`;
  const traits = readTraits(raw.traits);
  if (typeof traits === "string") return `generatedAgentProfiles.${id} ${traits}`;
  const skills = readSkills(raw.skills);
  if (typeof skills === "string") return `generatedAgentProfiles.${id} ${skills}`;
  const issueSalience = readIssueSalience(raw.issueSalience, issueIds);
  if (typeof issueSalience === "string") return `generatedAgentProfiles.${id} ${issueSalience}`;
  if (typeof raw.aiTier !== "string" || !isAiTier(raw.aiTier)) {
    return `generatedAgentProfiles.${id} invalid aiTier`;
  }
  if (!Array.isArray(raw.roleTypes) || raw.roleTypes.some((r) => typeof r !== "string")) {
    return `generatedAgentProfiles.${id} roleTypes`;
  }
  let presidentialStatus: string | null;
  if (raw.presidentialStatus == null) {
    presidentialStatus = null;
  } else if (typeof raw.presidentialStatus === "string") {
    presidentialStatus = raw.presidentialStatus;
  } else {
    return `generatedAgentProfiles.${id} presidentialStatus must be a string or null`;
  }
  const profile: AgentProfile = {
    politicianId: id,
    birthDate: raw.birthDate == null ? null : (raw.birthDate as IsoDate),
    ideology,
    traits,
    skills,
    issueSalience,
    aiTier: raw.aiTier,
    roleTypes: [...new Set(raw.roleTypes)].sort(),
    presidentialStatus,
  };
  const err = agentProfileError(profile, issueIds);
  if (err) return err;
  return profile;
}

function parseOverride(
  id: string,
  raw: unknown,
  issueIds?: readonly string[],
): AgentProfileOverride | string {
  if (!isRecord(raw)) return `agentProfileOverrides.${id} must be an object`;
  const extra = Object.keys(raw).filter(
    (k) => !["ideology", "traits", "skills", "issueSalience"].includes(k),
  );
  if (extra.length) return `agentProfileOverrides.${id} unknown field ${extra[0]}`;
  const out: AgentProfileOverride = {};
  if (raw.ideology != null) {
    if (!isRecord(raw.ideology)) return `agentProfileOverrides.${id} ideology`;
    const ideology = readIdeologyOverride(raw.ideology);
    if (typeof ideology === "string") return `agentProfileOverrides.${id} ${ideology}`;
    out.ideology = ideology;
  }
  if (raw.traits != null) {
    if (!isRecord(raw.traits)) return `agentProfileOverrides.${id} traits`;
    const traits = readTraitOverride(raw.traits);
    if (typeof traits === "string") return `agentProfileOverrides.${id} ${traits}`;
    out.traits = traits;
  }
  if (raw.skills != null) {
    if (!isRecord(raw.skills)) return `agentProfileOverrides.${id} skills`;
    const skills = readSkillOverride(raw.skills);
    if (typeof skills === "string") return `agentProfileOverrides.${id} ${skills}`;
    out.skills = skills;
  }
  if (raw.issueSalience != null) {
    if (!isRecord(raw.issueSalience)) return `agentProfileOverrides.${id} issueSalience`;
    const issueSalience = readIssueSalienceOverride(raw.issueSalience, issueIds);
    if (typeof issueSalience === "string") return `agentProfileOverrides.${id} ${issueSalience}`;
    out.issueSalience = issueSalience;
  }
  return out;
}

function parseEdge(
  sourceId: string,
  targetId: string,
  raw: unknown,
  politicianIds: Set<string>,
  currentDate: string,
): RelationshipEdge | string {
  if (!isRecord(raw)) return `relationships.${sourceId}.${targetId} must be an object`;
  if (raw.sourceId !== sourceId || raw.targetId !== targetId) {
    return `relationships.${sourceId}.${targetId} id mismatch`;
  }
  if (sourceId === targetId) return `relationships.${sourceId} cannot target self`;
  if (!politicianIds.has(sourceId) || !politicianIds.has(targetId)) {
    return `relationships.${sourceId}.${targetId} unknown politician`;
  }
  for (const k of ["affinity", "trust", "respect"] as const) {
    if (!finiteInRange(raw[k], RELATIONSHIP_MIN, RELATIONSHIP_MAX)) {
      return `relationships.${sourceId}.${targetId} ${k} out of range`;
    }
  }
  if (!isIsoDate(raw.lastUpdatedDate)) {
    return `relationships.${sourceId}.${targetId} invalid lastUpdatedDate`;
  }
  if (compareIsoDate(raw.lastUpdatedDate, currentDate) > 0) {
    return `relationships.${sourceId}.${targetId} lastUpdatedDate after currentDate`;
  }
  if (!isInt(raw.interactionCount) || raw.interactionCount < 1) {
    return `relationships.${sourceId}.${targetId} interactionCount must be a positive integer`;
  }
  return {
    sourceId,
    targetId,
    affinity: raw.affinity as number,
    trust: raw.trust as number,
    respect: raw.respect as number,
    lastUpdatedDate: raw.lastUpdatedDate,
    interactionCount: raw.interactionCount,
  };
}

function parseMemory(
  key: string,
  raw: unknown,
  politicianIds: Set<string>,
  currentDate: string,
  historyIds: Set<string>,
): PoliticalMemory | string {
  if (!isRecord(raw)) return `memories.${key} must be an object`;
  if (raw.id !== key) return `memories.${key} id mismatch`;
  if (parseCanonicalAllocatedId("MEM", key) == null) {
    return `memories.${key} id must be MEM followed by a positive integer`;
  }
  if (typeof raw.ownerId !== "string" || !politicianIds.has(raw.ownerId)) {
    return `memories.${key} unknown owner`;
  }
  if (!Array.isArray(raw.subjectIds) || raw.subjectIds.some((s) => typeof s !== "string")) {
    return `memories.${key} subjectIds`;
  }
  const dupSubject = firstDuplicate(raw.subjectIds);
  if (dupSubject) return `memories.${key} duplicate subjectIds`;
  for (const id of raw.subjectIds) {
    if (!politicianIds.has(id)) return `memories.${key} unknown subject ${id}`;
  }
  if (typeof raw.kind !== "string" || !isMemoryKind(raw.kind)) {
    return `memories.${key} invalid kind`;
  }
  if (!isIsoDate(raw.date)) return `memories.${key} invalid date`;
  if (compareIsoDate(raw.date, currentDate) > 0) return `memories.${key} date after currentDate`;
  if (!finiteInRange(raw.valence, -1, 1)) return `memories.${key} valence`;
  if (!finiteInRange(raw.salience, 0, 1)) return `memories.${key} salience`;
  if (typeof raw.durability !== "string" || !isMemoryDurability(raw.durability)) {
    return `memories.${key} durability`;
  }
  if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string")) {
    return `memories.${key} tags`;
  }
  if (firstDuplicate(raw.tags)) return `memories.${key} duplicate tags`;
  if (raw.sourceEventId != null) {
    if (typeof raw.sourceEventId !== "string" || !historyIds.has(raw.sourceEventId)) {
      return `memories.${key} sourceEventId does not resolve`;
    }
  }
  let relationshipEffects: PoliticalMemory["relationshipEffects"] = null;
  if (raw.relationshipEffects != null) {
    const parsed = parseRelationshipDelta(
      raw.relationshipEffects,
      `memories.${key}.relationshipEffects`,
    );
    if (typeof parsed === "string") return parsed;
    relationshipEffects = parsed;
  }
  if (!isJsonObject(raw.metadata)) return `memories.${key} metadata must be JSON-safe`;
  const jsonErr = jsonSafetyError(raw.metadata, `memories.${key}.metadata`);
  if (jsonErr) return jsonErr;
  return {
    id: key,
    ownerId: raw.ownerId,
    subjectIds: [...raw.subjectIds].sort(),
    kind: raw.kind,
    date: raw.date,
    valence: raw.valence,
    salience: raw.salience,
    durability: raw.durability,
    tags: [...raw.tags].sort(),
    sourceEventId: raw.sourceEventId == null ? null : raw.sourceEventId,
    relationshipEffects,
    metadata: raw.metadata,
  };
}

function parseBelief(
  ownerId: string,
  targetId: string,
  key: string,
  raw: unknown,
  politicianIds: Set<string>,
  currentDate: string,
): BeliefRecord | string {
  if (!isRecord(raw)) return `beliefs.${ownerId}.${targetId}.${key} must be an object`;
  if (raw.ownerId !== ownerId || raw.targetId !== targetId) {
    return `beliefs.${ownerId}.${targetId} id mismatch`;
  }
  if (!politicianIds.has(ownerId) || !politicianIds.has(targetId)) {
    return `beliefs.${ownerId}.${targetId} unknown politician`;
  }
  if (ownerId === targetId) return `beliefs.${ownerId} cannot target self`;
  if (typeof raw.topic !== "string" || !isBeliefTopic(raw.topic)) {
    return `beliefs.${ownerId}.${targetId} invalid topic`;
  }
  if (typeof raw.dimension !== "string" || !beliefDimensionValid(raw.topic, raw.dimension)) {
    return `beliefs.${ownerId}.${targetId} invalid dimension`;
  }
  if (beliefDimensionValid(raw.topic, raw.dimension) && key !== `${raw.topic}:${raw.dimension}`) {
    return `beliefs.${ownerId}.${targetId} key mismatch`;
  }
  const range = estimateRange(raw.topic);
  if (!finiteInRange(raw.estimate, range.min, range.max)) {
    return `beliefs.${ownerId}.${targetId}.${key} estimate out of range`;
  }
  if (!finiteInRange(raw.confidence, 0, 1)) {
    return `beliefs.${ownerId}.${targetId}.${key} confidence`;
  }
  if (!isIsoDate(raw.lastUpdatedDate)) return `beliefs.${ownerId}.${targetId} lastUpdatedDate`;
  if (compareIsoDate(raw.lastUpdatedDate, currentDate) > 0) {
    return `beliefs.${ownerId}.${targetId} lastUpdatedDate after currentDate`;
  }
  if (!isInt(raw.evidenceCount) || raw.evidenceCount < 1) {
    return `beliefs.${ownerId}.${targetId} evidenceCount`;
  }
  if (raw.source != null && typeof raw.source !== "string") {
    return `beliefs.${ownerId}.${targetId} source`;
  }
  return {
    ownerId,
    targetId,
    topic: raw.topic,
    dimension: raw.dimension,
    estimate: raw.estimate,
    confidence: raw.confidence,
    lastUpdatedDate: raw.lastUpdatedDate,
    evidenceCount: raw.evidenceCount,
    source: raw.source == null ? null : raw.source,
  };
}

function parseGoal(
  key: string,
  raw: unknown,
  politicianIds: Set<string>,
  currentDate: string,
): PoliticianGoal | string {
  if (!isRecord(raw)) return `goals.${key} must be an object`;
  if (raw.id !== key) return `goals.${key} id mismatch`;
  if (parseCanonicalAllocatedId("GOAL", key) == null) {
    return `goals.${key} id must be GOAL followed by a positive integer`;
  }
  if (typeof raw.ownerId !== "string" || !politicianIds.has(raw.ownerId)) {
    return `goals.${key} unknown owner`;
  }
  const goal = raw as unknown as PoliticianGoal;
  if (
    typeof raw.type !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.horizon !== "string"
  ) {
    return `goals.${key} missing type/status/horizon`;
  }
  if (!finiteInRange(raw.priority, 0, 1)) return `goals.${key} priority`;
  if (!isIsoDate(raw.createdDate) || !isIsoDate(raw.lastReviewedDate)) {
    return `goals.${key} invalid dates`;
  }
  if (compareIsoDate(raw.createdDate, currentDate) > 0)
    return `goals.${key} createdDate after currentDate`;
  if (compareIsoDate(raw.lastReviewedDate, currentDate) > 0) {
    return `goals.${key} lastReviewedDate after currentDate`;
  }
  if (compareIsoDate(raw.lastReviewedDate, raw.createdDate) < 0) {
    return `goals.${key} lastReviewedDate before createdDate`;
  }
  for (const field of [
    "targetOfficeId",
    "targetOfficeKind",
    "targetIssueId",
    "targetEntityId",
  ] as const) {
    if (raw[field] != null && typeof raw[field] !== "string") return `goals.${key} ${field}`;
  }
  if (typeof raw.source !== "string") return `goals.${key} source`;
  if (!isJsonObject(raw.metadata)) return `goals.${key} metadata must be JSON-safe`;
  const shaped: PoliticianGoal = {
    id: key,
    ownerId: raw.ownerId,
    type: goal.type,
    priority: raw.priority,
    status: goal.status,
    createdDate: raw.createdDate,
    lastReviewedDate: raw.lastReviewedDate,
    horizon: goal.horizon,
    targetOfficeId: typeof raw.targetOfficeId === "string" ? raw.targetOfficeId : null,
    targetOfficeKind: typeof raw.targetOfficeKind === "string" ? raw.targetOfficeKind : null,
    targetIssueId: typeof raw.targetIssueId === "string" ? raw.targetIssueId : null,
    targetEntityId: typeof raw.targetEntityId === "string" ? raw.targetEntityId : null,
    source: raw.source,
    metadata: raw.metadata,
  };
  const err = assertGoalShape(shaped);
  if (err) return err;
  return shaped;
}

export function parseAgentState(
  raw: Record<string, unknown>,
  args: {
    politicianIds: Set<string>;
    currentDate: string;
    historyIds: Set<string>;
    issueIds?: readonly string[];
    officeIds?: readonly string[];
  },
): ParsedAgentState | string {
  if (!isRecord(raw.relationships)) return "relationships must be an object";
  const relationships: SimState["relationships"] = {};
  for (const [sourceId, inner] of Object.entries(raw.relationships)) {
    if (!isRecord(inner)) return `relationships.${sourceId} must be an object`;
    relationships[sourceId] = {};
    for (const [targetId, rec] of Object.entries(inner)) {
      const edge = parseEdge(sourceId, targetId, rec, args.politicianIds, args.currentDate);
      if (typeof edge === "string") return edge;
      relationships[sourceId][targetId] = edge;
    }
  }
  if (!isRecord(raw.memories)) return "memories must be an object";
  const memories: SimState["memories"] = {};
  for (const [id, rec] of Object.entries(raw.memories)) {
    const mem = parseMemory(id, rec, args.politicianIds, args.currentDate, args.historyIds);
    if (typeof mem === "string") return mem;
    memories[id] = mem;
  }
  if (!isRecord(raw.beliefs)) return "beliefs must be an object";
  const beliefs: SimState["beliefs"] = {};
  for (const [ownerId, byTarget] of Object.entries(raw.beliefs)) {
    if (!isRecord(byTarget)) return `beliefs.${ownerId} must be an object`;
    beliefs[ownerId] = {};
    for (const [targetId, byKey] of Object.entries(byTarget)) {
      if (!isRecord(byKey)) return `beliefs.${ownerId}.${targetId} must be an object`;
      beliefs[ownerId][targetId] = {};
      for (const [key, rec] of Object.entries(byKey)) {
        const belief = parseBelief(
          ownerId,
          targetId,
          key,
          rec,
          args.politicianIds,
          args.currentDate,
        );
        if (typeof belief === "string") return belief;
        beliefs[ownerId][targetId][key] = belief;
      }
    }
  }
  if (!isRecord(raw.goals)) return "goals must be an object";
  const goals: SimState["goals"] = {};
  for (const [id, rec] of Object.entries(raw.goals)) {
    const goal = parseGoal(id, rec, args.politicianIds, args.currentDate);
    if (typeof goal === "string") return goal;
    goals[id] = goal;
  }
  if (!isRecord(raw.generatedAgentProfiles)) return "generatedAgentProfiles must be an object";
  const generatedAgentProfiles: SimState["generatedAgentProfiles"] = {};
  for (const [id, rec] of Object.entries(raw.generatedAgentProfiles)) {
    if (!args.politicianIds.has(id)) {
      return `generatedAgentProfiles.${id} has no runtime politician`;
    }
    const profile = parseProfile(id, rec, args.issueIds);
    if (typeof profile === "string") return profile;
    generatedAgentProfiles[id] = profile;
  }
  if (!isRecord(raw.agentProfileOverrides)) return "agentProfileOverrides must be an object";
  const agentProfileOverrides: SimState["agentProfileOverrides"] = {};
  for (const [id, rec] of Object.entries(raw.agentProfileOverrides)) {
    if (!args.politicianIds.has(id)) {
      return `agentProfileOverrides.${id} unknown politician`;
    }
    const over = parseOverride(id, rec, args.issueIds);
    if (typeof over === "string") return over;
    agentProfileOverrides[id] = over;
  }
  return {
    relationships,
    memories,
    beliefs,
    goals,
    generatedAgentProfiles,
    agentProfileOverrides,
  };
}

export function agentCounterError(
  state: Pick<ParsedAgentState, "memories" | "goals">,
  counters: { nextMemoryId: number; nextGoalId: number },
): string | null {
  let maxMem = 0;
  for (const id of Object.keys(state.memories)) {
    maxMem = Math.max(maxMem, parseCanonicalAllocatedId("MEM", id) ?? 0);
  }
  if (counters.nextMemoryId <= maxMem) return "nextMemoryId does not exceed allocated memory ids";
  let maxGoal = 0;
  for (const id of Object.keys(state.goals)) {
    maxGoal = Math.max(maxGoal, parseCanonicalAllocatedId("GOAL", id) ?? 0);
  }
  if (counters.nextGoalId <= maxGoal) return "nextGoalId does not exceed allocated goal ids";
  return null;
}

export function validateKernelAgentProfiles(world: KernelWorld): CommandError | null {
  const politicianIds = new Set(world.politicians.map((p) => p.id));
  for (const p of world.politicians) {
    const profile = world.agentProfiles[p.id];
    if (!profile) {
      return { code: "INVALID_WORLD", message: `Missing AgentProfile for ${p.id}` };
    }
    const err = agentProfileError(profile, world.issueIds);
    if (err) return { code: "INVALID_WORLD", message: err };
    if (profile.politicianId !== p.id) {
      return { code: "INVALID_WORLD", message: `AgentProfile ${p.id} politicianId mismatch` };
    }
  }
  for (const id of Object.keys(world.agentProfiles)) {
    if (!politicianIds.has(id)) {
      return { code: "INVALID_WORLD", message: `AgentProfile ${id} has no politician` };
    }
  }
  return null;
}

export function emptyAgentRuntime(): Pick<
  SimState,
  | "relationships"
  | "memories"
  | "beliefs"
  | "goals"
  | "generatedAgentProfiles"
  | "agentProfileOverrides"
> {
  return {
    relationships: {},
    memories: {},
    beliefs: {},
    goals: {},
    generatedAgentProfiles: {},
    agentProfileOverrides: {},
  };
}

export type { AiTier };
export { AI_TIERS };
