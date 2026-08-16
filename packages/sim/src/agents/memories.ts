import { compareIsoDate, daysBetween, type IsoDate } from "../calendar.js";
import { jsonSafetyError, type JsonObject } from "../json.js";
import { padId } from "../scheduler.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { getAgentProfile } from "./profile.js";
import {
  MEMORY_HALF_LIFE_DAYS,
  MEMORY_NONPERMANENT_CAPS,
  MEMORY_PERMANENT_CAP,
  MEMORY_SALIENCE_MAX,
  MEMORY_SALIENCE_MIN,
  MEMORY_VALENCE_MAX,
  MEMORY_VALENCE_MIN,
  clamp,
  halfLifeDecay,
} from "./policy.js";
import {
  applyRelationshipChange,
  relationshipDeltaError,
  type RelationshipDelta,
} from "./relationships.js";
import { agentMutationDateError, notBeforeExistingDateError } from "./time.js";
import {
  isMemoryDurability,
  isMemoryKind,
  type MemoryDurability,
  type MemoryKind,
} from "./types.js";

export type PoliticalMemory = {
  id: string;
  ownerId: string;
  subjectIds: string[];
  kind: MemoryKind;
  date: IsoDate;
  valence: number;
  salience: number;
  durability: MemoryDurability;
  tags: string[];
  sourceEventId: string | null;
  relationshipEffects: RelationshipDelta | null;
  metadata: JsonObject;
};

export type MemoryDraft = {
  ownerId: string;
  subjectIds?: string[] | undefined;
  kind: MemoryKind;
  valence: number;
  salience: number;
  durability: MemoryDurability;
  tags?: string[] | undefined;
  sourceEventId?: string | null | undefined;
  relationshipEffects?: RelationshipDelta | null | undefined;
  metadata?: JsonObject | undefined;
};

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function effectiveSalience(memory: PoliticalMemory, asOfDate: IsoDate): number {
  if (memory.durability === "permanent") return memory.salience;
  const days = Math.max(0, daysBetween(memory.date, asOfDate));
  return halfLifeDecay(memory.salience, MEMORY_HALF_LIFE_DAYS[memory.durability], days);
}

function memorySortKey(memory: PoliticalMemory, asOfDate: IsoDate): [number, string, string] {
  return [effectiveSalience(memory, asOfDate), memory.date, memory.id];
}

function compareMemories(a: PoliticalMemory, b: PoliticalMemory, asOfDate: IsoDate): number {
  const ka = memorySortKey(a, asOfDate);
  const kb = memorySortKey(b, asOfDate);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] < kb[1]) return -1;
  if (ka[1] > kb[1]) return 1;
  if (ka[2] < kb[2]) return -1;
  if (ka[2] > kb[2]) return 1;
  return 0;
}

export function memoriesOwnedBy(state: SimState, ownerId: string): PoliticalMemory[] {
  return Object.values(state.memories).filter((m) => m.ownerId === ownerId);
}

/**
 * Deterministic retention: drop lowest effective-salience non-permanent memories
 * first; tie-break by date then ID. Permanent memories use a separate cap.
 */
export function pruneMemoriesForOwner(
  state: SimState,
  world: KernelWorld,
  ownerId: string,
  asOfDate: IsoDate,
): string[] {
  const profile = getAgentProfile(world, state, ownerId);
  const cap = MEMORY_NONPERMANENT_CAPS[profile?.aiTier ?? "standard"];
  const owned = memoriesOwnedBy(state, ownerId);
  const removed: string[] = [];
  const permanent = owned.filter((m) => m.durability === "permanent");
  if (permanent.length > MEMORY_PERMANENT_CAP) {
    const extra = [...permanent].sort((a, b) => compareMemories(a, b, asOfDate));
    const drop = extra.slice(0, extra.length - MEMORY_PERMANENT_CAP);
    for (const m of drop) {
      delete state.memories[m.id];
      removed.push(m.id);
    }
  }
  const transient = owned.filter((m) => m.durability !== "permanent" && !removed.includes(m.id));
  if (transient.length > cap) {
    const extra = [...transient].sort((a, b) => compareMemories(a, b, asOfDate));
    const drop = extra.slice(0, extra.length - cap);
    for (const m of drop) {
      delete state.memories[m.id];
      removed.push(m.id);
    }
  }
  return removed;
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function recordPoliticalMemory(
  state: SimState,
  world: KernelWorld,
  draft: MemoryDraft,
  asOfDate: IsoDate,
): { memory: PoliticalMemory; prunedIds: string[] } | { error: CommandError } {
  if (!state.politicians[draft.ownerId]) {
    return { error: reject("UNKNOWN_POLITICIAN", draft.ownerId) };
  }
  const dateErr = agentMutationDateError(state, asOfDate);
  if (dateErr) return { error: reject("INVALID_MEMORY", dateErr) };
  if (!isMemoryKind(draft.kind)) {
    return { error: reject("INVALID_MEMORY", `unknown kind ${draft.kind}`) };
  }
  if (!isMemoryDurability(draft.durability)) {
    return { error: reject("INVALID_MEMORY", `unknown durability ${draft.durability}`) };
  }
  if (
    typeof draft.valence !== "number" ||
    !Number.isFinite(draft.valence) ||
    draft.valence < MEMORY_VALENCE_MIN ||
    draft.valence > MEMORY_VALENCE_MAX
  ) {
    return { error: reject("INVALID_MEMORY", "valence must be in [-1, 1]") };
  }
  if (
    typeof draft.salience !== "number" ||
    !Number.isFinite(draft.salience) ||
    draft.salience < MEMORY_SALIENCE_MIN ||
    draft.salience > MEMORY_SALIENCE_MAX
  ) {
    return { error: reject("INVALID_MEMORY", "salience must be in [0, 1]") };
  }
  const rawSubjects = draft.subjectIds ?? [];
  if (rawSubjects.some((id) => typeof id !== "string")) {
    return { error: reject("INVALID_MEMORY", "subjectIds must be strings") };
  }
  const subjectIds = uniqueSortedStrings(rawSubjects);
  for (const id of subjectIds) {
    if (!state.politicians[id]) return { error: reject("UNKNOWN_POLITICIAN", id) };
  }
  const rawTags = draft.tags ?? [];
  if (rawTags.some((tag) => typeof tag !== "string")) {
    return { error: reject("INVALID_MEMORY", "tags must be strings") };
  }
  const tags = uniqueSortedStrings(rawTags);
  const metadata = draft.metadata ?? {};
  const jsonErr = jsonSafetyError(metadata, "memory.metadata");
  if (jsonErr) return { error: reject("NON_JSON_PAYLOAD", jsonErr) };
  if (draft.sourceEventId != null) {
    if (typeof draft.sourceEventId !== "string") {
      return { error: reject("INVALID_MEMORY", "sourceEventId must be a string or null") };
    }
    const sourceEvent = state.history.find((e) => e.id === draft.sourceEventId);
    if (!sourceEvent) {
      return { error: reject("UNKNOWN_EVENT", draft.sourceEventId) };
    }
    if (compareIsoDate(sourceEvent.date, asOfDate) > 0) {
      return {
        error: reject("INVALID_MEMORY", "source event date must not be after memory date"),
      };
    }
  }
  let relationshipEffects: RelationshipDelta | null = null;
  if (draft.relationshipEffects != null) {
    const deltaErr = relationshipDeltaError(draft.relationshipEffects, "relationshipEffects");
    if (deltaErr) return { error: reject("INVALID_MEMORY", deltaErr) };
    relationshipEffects = draft.relationshipEffects;
    for (const targetId of subjectIds) {
      if (targetId === draft.ownerId) continue;
      const edge = state.relationships[draft.ownerId]?.[targetId];
      if (!edge) continue;
      const rewind = notBeforeExistingDateError(
        asOfDate,
        edge.lastUpdatedDate,
        "memory relationshipEffects",
      );
      if (rewind) return { error: reject("INVALID_MEMORY", rewind) };
    }
  }
  const id = padId("MEM", state.counters.nextMemoryId++);
  const memory: PoliticalMemory = {
    id,
    ownerId: draft.ownerId,
    subjectIds,
    kind: draft.kind,
    date: asOfDate,
    valence: clamp(draft.valence, MEMORY_VALENCE_MIN, MEMORY_VALENCE_MAX),
    salience: clamp(draft.salience, MEMORY_SALIENCE_MIN, MEMORY_SALIENCE_MAX),
    durability: draft.durability,
    tags,
    sourceEventId: draft.sourceEventId ?? null,
    relationshipEffects,
    metadata,
  };
  state.memories[id] = memory;
  if (relationshipEffects) {
    for (const targetId of subjectIds) {
      if (targetId === draft.ownerId) continue;
      const rel = applyRelationshipChange(
        state,
        draft.ownerId,
        targetId,
        relationshipEffects,
        asOfDate,
      );
      if ("error" in rel) return rel;
    }
  }
  const prunedIds = pruneMemoriesForOwner(state, world, draft.ownerId, asOfDate);
  return { memory, prunedIds };
}
