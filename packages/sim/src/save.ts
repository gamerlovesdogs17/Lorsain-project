import { addMonths, compareIsoDate, isIsoDate } from "./calendar.js";
import { isJsonObject } from "./json.js";
import { canonicalJson } from "./hash.js";
import { parseSerializedRngState, type SerializedRngState } from "./rng.js";
import { resolutionEventMustBlock } from "./scheduler.js";
import {
  SAVE_SCHEMA_VERSION,
  type CommandError,
  type Counters,
  type OfficeTerm,
  type PendingInterrupt,
  type PoliticianRuntime,
  type PresidentialRuntime,
  type SaveParseResult,
  type ScheduledEvent,
  type SimEvent,
  type SimState,
} from "./types.js";

export type ContentMigration = {
  fromContentVersion: string;
  toContentVersion: string;
  migrate: (raw: unknown) => unknown;
};

export type SchemaMigration = {
  fromSchema: number;
  toSchema: number;
  migrate: (raw: unknown) => unknown;
};

/** Registry starts at v1. Add migrateSaveV1ToV2 here when schema 2 exists. */
export const SCHEMA_MIGRATIONS: SchemaMigration[] = [];

export const CONTENT_MIGRATIONS: ContentMigration[] = [];

function fail(code: string, message: string): SaveParseResult {
  return { ok: false, error: { code, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function paddedNumeric(prefix: string, id: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}

function rngEqual(a: SerializedRngState, b: SerializedRngState): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function migrateSaveUnknown(
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; error: CommandError } {
  if (!isRecord(raw) || typeof raw.schemaVersion !== "number") {
    return { ok: false, error: { code: "MALFORMED_SAVE", message: "Save missing schemaVersion" } };
  }
  let current: unknown = raw;
  let version = raw.schemaVersion;
  if (!Number.isInteger(version)) {
    return {
      ok: false,
      error: { code: "MALFORMED_SAVE", message: "schemaVersion must be an integer" },
    };
  }
  if (version > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_SCHEMA",
        message: `Save schemaVersion ${version} is newer than supported ${SAVE_SCHEMA_VERSION}`,
      },
    };
  }
  while (version < SAVE_SCHEMA_VERSION) {
    const step = SCHEMA_MIGRATIONS.find((m) => m.fromSchema === version);
    if (!step) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_SCHEMA",
          message: `No migration from schemaVersion ${version} to ${SAVE_SCHEMA_VERSION}`,
        },
      };
    }
    current = step.migrate(current);
    if (!isRecord(current) || typeof current.schemaVersion !== "number") {
      return {
        ok: false,
        error: { code: "MALFORMED_SAVE", message: "Schema migration produced invalid save" },
      };
    }
    version = current.schemaVersion;
  }
  return { ok: true, value: current };
}

function applyContentMigrations(
  raw: unknown,
  fromVersion: string,
  toVersion: string,
  registry: ContentMigration[],
): { ok: true; value: unknown } | { ok: false; error: CommandError } {
  if (fromVersion === toVersion) return { ok: true, value: raw };
  let current = raw;
  let version = fromVersion;
  const guard = new Set<string>();
  while (version !== toVersion) {
    if (guard.has(version)) {
      return {
        ok: false,
        error: { code: "INCOMPATIBLE_CONTENT", message: `Content migration loop at ${version}` },
      };
    }
    guard.add(version);
    const step =
      registry.find((m) => m.fromContentVersion === version && m.toContentVersion === toVersion) ??
      registry.find((m) => m.fromContentVersion === version);
    if (!step) {
      return {
        ok: false,
        error: {
          code: "INCOMPATIBLE_CONTENT",
          message: `Save contentVersion ${fromVersion} is incompatible with ${toVersion} (no migration)`,
        },
      };
    }
    current = step.migrate(current);
    version = step.toContentVersion;
    if (isRecord(current)) {
      current.contentVersion = version;
      if (isRecord(current.simulation)) current.simulation.contentVersion = version;
    }
  }
  return { ok: true, value: current };
}

function parsePolitician(id: string, raw: unknown): PoliticianRuntime | string {
  if (!isRecord(raw)) return `politicians.${id} must be an object`;
  if (raw.id !== id) return `politicians.${id} id mismatch`;
  if (typeof raw.alive !== "boolean" || typeof raw.retired !== "boolean") {
    return `politicians.${id} alive/retired must be boolean`;
  }
  if (raw.partyId != null && typeof raw.partyId !== "string") {
    return `politicians.${id} partyId must be string or null`;
  }
  if (raw.factionId != null && typeof raw.factionId !== "string") {
    return `politicians.${id} factionId must be string or null`;
  }
  return {
    id,
    alive: raw.alive,
    retired: raw.retired,
    partyId: raw.partyId === undefined ? null : (raw.partyId as string | null),
    factionId: raw.factionId === undefined ? null : (raw.factionId as string | null),
  };
}

function parseTerm(key: string, raw: unknown): OfficeTerm | string {
  if (!isRecord(raw)) return `officeTerms.${key} must be an object`;
  if (typeof raw.id !== "string" || raw.id !== key) return `officeTerms.${key} id mismatch`;
  if (typeof raw.officeId !== "string" || typeof raw.holderId !== "string") {
    return `officeTerms.${key} office/holder ids must be strings`;
  }
  const statuses = new Set(["active", "ended", "suspended"]);
  if (typeof raw.status !== "string" || !statuses.has(raw.status)) {
    return `officeTerms.${key} invalid status`;
  }
  if (raw.holdingKind !== "substantive" && raw.holdingKind !== "acting") {
    return `officeTerms.${key} invalid holdingKind`;
  }
  if (typeof raw.startKnown !== "boolean") return `officeTerms.${key} startKnown must be boolean`;
  if (raw.startDate != null && !isIsoDate(raw.startDate)) {
    return `officeTerms.${key} invalid startDate`;
  }
  if (raw.endDate != null && !isIsoDate(raw.endDate)) return `officeTerms.${key} invalid endDate`;
  if (raw.endedDate != null && !isIsoDate(raw.endedDate)) {
    return `officeTerms.${key} invalid endedDate`;
  }
  if (raw.endedReason != null && typeof raw.endedReason !== "string") {
    return `officeTerms.${key} invalid endedReason`;
  }
  if (raw.status === "ended") {
    if (raw.endedDate == null || raw.endedReason == null) {
      return `officeTerms.${key} ended term missing ended metadata`;
    }
  } else if (raw.endedDate != null || raw.endedReason != null) {
    return `officeTerms.${key} active/suspended term cannot have ended metadata`;
  }
  if (typeof raw.accessionReason !== "string") return `officeTerms.${key} accessionReason`;
  if (raw.sourceElectionId != null && typeof raw.sourceElectionId !== "string") {
    return `officeTerms.${key} sourceElectionId`;
  }
  return {
    id: raw.id,
    officeId: raw.officeId,
    holderId: raw.holderId,
    startDate: raw.startDate == null ? null : raw.startDate,
    startKnown: raw.startKnown,
    endDate: raw.endDate == null ? null : raw.endDate,
    accessionReason: raw.accessionReason,
    status: raw.status as OfficeTerm["status"],
    holdingKind: raw.holdingKind,
    sourceElectionId: raw.sourceElectionId == null ? null : raw.sourceElectionId,
    endedDate: raw.endedDate == null ? null : raw.endedDate,
    endedReason: raw.endedReason == null ? null : raw.endedReason,
  };
}

function parseScheduled(raw: unknown, currentDate: string): ScheduledEvent | string {
  if (!isRecord(raw)) return "scheduler event must be an object";
  if (typeof raw.id !== "string") return "scheduler event id";
  if (!isIsoDate(raw.dueDate)) return `scheduler ${raw.id} invalid dueDate`;
  if (typeof raw.eventType !== "string") return `scheduler ${raw.id} eventType`;
  if (!isJsonObject(raw.payload)) return `scheduler ${raw.id} payload is not JSON-safe`;
  if (!isInt(raw.priority)) return `scheduler ${raw.id} priority`;
  if (!isInt(raw.sequence) || raw.sequence < 0) return `scheduler ${raw.id} sequence`;
  if (typeof raw.blocking !== "boolean" || typeof raw.requiresResolution !== "boolean") {
    return `scheduler ${raw.id} blocking/requiresResolution`;
  }
  const resolutionErr = resolutionEventMustBlock(raw.blocking, raw.requiresResolution);
  if (resolutionErr) return `${resolutionErr.code}: ${resolutionErr.message}`;
  if (raw.source != null && typeof raw.source !== "string") return `scheduler ${raw.id} source`;
  const st = raw.status;
  if (st !== "pending" && st !== "processed" && st !== "cancelled") {
    return `scheduler ${raw.id} invalid status`;
  }
  if (st === "pending" && compareIsoDate(raw.dueDate, currentDate) < 0) {
    return `scheduler ${raw.id} pending event is in the past`;
  }
  return {
    id: raw.id,
    dueDate: raw.dueDate,
    eventType: raw.eventType,
    payload: raw.payload,
    priority: raw.priority,
    sequence: raw.sequence,
    blocking: raw.blocking,
    requiresResolution: raw.requiresResolution,
    source: raw.source == null ? null : raw.source,
    status: st,
  };
}

function parseHistory(raw: unknown): SimEvent | string {
  if (!isRecord(raw)) return "history event must be an object";
  if (typeof raw.id !== "string") return "history id";
  if (!isIsoDate(raw.date)) return `history ${raw.id} date`;
  if (!isInt(raw.turn) || raw.turn < 0) return `history ${raw.id} turn`;
  if (typeof raw.type !== "string") return `history ${raw.id} type`;
  if (typeof raw.importance !== "number" || !Number.isFinite(raw.importance)) {
    return `history ${raw.id} importance`;
  }
  if (raw.visibility !== "public" && raw.visibility !== "system") {
    return `history ${raw.id} visibility`;
  }
  if (!isStringArray(raw.actorIds) || !isStringArray(raw.entityIds)) {
    return `history ${raw.id} actorIds/entityIds must be string arrays`;
  }
  if (!isJsonObject(raw.payload)) return `history ${raw.id} payload is not JSON-safe`;
  if (raw.sourceScheduledEventId != null && typeof raw.sourceScheduledEventId !== "string") {
    return `history ${raw.id} sourceScheduledEventId`;
  }
  if (raw.sourceCommandId != null && typeof raw.sourceCommandId !== "string") {
    return `history ${raw.id} sourceCommandId`;
  }
  return {
    id: raw.id,
    date: raw.date,
    turn: raw.turn,
    type: raw.type,
    importance: raw.importance,
    visibility: raw.visibility,
    actorIds: raw.actorIds,
    entityIds: raw.entityIds,
    payload: raw.payload,
    sourceScheduledEventId: raw.sourceScheduledEventId == null ? null : raw.sourceScheduledEventId,
    sourceCommandId: raw.sourceCommandId == null ? null : raw.sourceCommandId,
  };
}

function parseInterrupt(raw: unknown): PendingInterrupt | string {
  if (raw == null) return "null";
  if (!isRecord(raw)) return "pendingInterrupt must be an object";
  if (raw.kind !== "PRESENTATION" && raw.kind !== "BLOCKING_DOMAIN") {
    return "pendingInterrupt.kind";
  }
  if (
    typeof raw.code !== "string" ||
    !isIsoDate(raw.date) ||
    typeof raw.scheduledEventId !== "string"
  ) {
    return "pendingInterrupt identity fields";
  }
  if (typeof raw.message !== "string" || typeof raw.requiresResolution !== "boolean") {
    return "pendingInterrupt message/requiresResolution";
  }
  if (
    raw.resolutionStatus !== "unresolved" &&
    raw.resolutionStatus !== "acknowledged" &&
    raw.resolutionStatus !== "resolved"
  ) {
    return "pendingInterrupt.resolutionStatus";
  }
  if (raw.kind === "BLOCKING_DOMAIN" && raw.requiresResolution !== true) {
    return "BLOCKING_DOMAIN interrupt must require resolution";
  }
  if (raw.kind === "PRESENTATION" && raw.requiresResolution !== false) {
    return "PRESENTATION interrupt must not require resolution";
  }
  return {
    kind: raw.kind,
    code: raw.code,
    date: raw.date,
    scheduledEventId: raw.scheduledEventId,
    message: raw.message,
    requiresResolution: raw.requiresResolution,
    resolutionStatus: raw.resolutionStatus,
  };
}

function parseCounters(raw: unknown): Counters | string {
  if (!isRecord(raw)) return "counters must be an object";
  const keys = [
    "nextEventId",
    "nextScheduledId",
    "nextTermId",
    "schedulerSequence",
    "nextCommandId",
  ] as const;
  const out = {} as Counters;
  for (const k of keys) {
    if (!isInt(raw[k]) || (raw[k] as number) < 1) return `counters.${k} must be a positive integer`;
    out[k] = raw[k] as number;
  }
  return out;
}

function parsePresidential(raw: unknown, politicianIds: Set<string>): PresidentialRuntime | string {
  if (!isRecord(raw)) return "presidential runtime must be an object";
  if (!isIsoDate(raw.nextRegularElectionDate)) return "presidential.nextRegularElectionDate";
  if (!isRecord(raw.electedTermCountByPolitician))
    return "presidential.electedTermCountByPolitician";
  const counts: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw.electedTermCountByPolitician)) {
    if (typeof id !== "string" || id.length === 0) return `elected term count key ${id}`;
    if (!isInt(n) || n < 0) return `elected term count for ${id}`;
    counts[id] = n;
  }
  if (raw.certifiedPresidentElectId != null) {
    if (typeof raw.certifiedPresidentElectId !== "string") return "certifiedPresidentElectId";
    if (!politicianIds.has(raw.certifiedPresidentElectId)) {
      return "certifiedPresidentElectId is not a known politician";
    }
  }
  return {
    nextRegularElectionDate: raw.nextRegularElectionDate,
    electedTermCountByPolitician: counts,
    certifiedPresidentElectId:
      raw.certifiedPresidentElectId == null ? null : raw.certifiedPresidentElectId,
  };
}

function parseSimulation(
  raw: unknown,
  root: { contentVersion: string; scenarioId: string },
): SimState | string {
  if (!isRecord(raw)) return "simulation state missing";
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) return "simulation.schemaVersion mismatch";
  if (raw.contentVersion !== root.contentVersion) {
    return "simulation.contentVersion != root contentVersion";
  }
  if (raw.scenarioId !== root.scenarioId) return "simulation.scenarioId != root scenarioId";
  if (!isIsoDate(raw.scenarioStartDate)) return "invalid scenarioStartDate";
  if (!isIsoDate(raw.currentDate)) return "invalid currentDate";
  if (compareIsoDate(raw.currentDate, raw.scenarioStartDate) < 0) {
    return "currentDate is before scenarioStartDate";
  }
  if (!isInt(raw.completedTurns) || raw.completedTurns < 0) return "completedTurns";
  if (raw.activeTurnTarget != null && !isIsoDate(raw.activeTurnTarget)) {
    return "invalid activeTurnTarget";
  }
  if (typeof raw.playerPoliticianId !== "string" || raw.playerPoliticianId.length === 0) {
    return "playerPoliticianId missing";
  }
  let rng: SerializedRngState;
  try {
    rng = parseSerializedRngState(raw.rng);
  } catch (e) {
    return `simulation RNG: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (!isRecord(raw.politicians)) return "politicians must be an object";
  const politicians: Record<string, PoliticianRuntime> = {};
  for (const [id, rec] of Object.entries(raw.politicians)) {
    const p = parsePolitician(id, rec);
    if (typeof p === "string") return p;
    politicians[id] = p;
  }
  if (!politicians[raw.playerPoliticianId]) {
    return "playerPoliticianId is not in politician state";
  }
  if (!isRecord(raw.officeTerms)) return "officeTerms must be an object";
  const officeTerms: Record<string, OfficeTerm> = {};
  for (const [id, rec] of Object.entries(raw.officeTerms)) {
    const t = parseTerm(id, rec);
    if (typeof t === "string") return t;
    officeTerms[id] = t;
  }
  if (!isRecord(raw.scheduler) || !Array.isArray(raw.scheduler.events)) {
    return "malformed scheduler";
  }
  const events: ScheduledEvent[] = [];
  const schedIds = new Set<string>();
  for (const ev of raw.scheduler.events) {
    const parsed = parseScheduled(ev, raw.currentDate);
    if (typeof parsed === "string") return parsed;
    if (schedIds.has(parsed.id)) return `duplicate scheduled id ${parsed.id}`;
    schedIds.add(parsed.id);
    events.push(parsed);
  }
  if (!Array.isArray(raw.history)) return "history must be an array";
  const history: SimEvent[] = [];
  const histIds = new Set<string>();
  for (const ev of raw.history) {
    const parsed = parseHistory(ev);
    if (typeof parsed === "string") return parsed;
    if (histIds.has(parsed.id)) return `duplicate history id ${parsed.id}`;
    histIds.add(parsed.id);
    history.push(parsed);
  }
  const counters = parseCounters(raw.counters);
  if (typeof counters === "string") return counters;
  let maxEvt = 0;
  let maxSev = 0;
  let maxTerm = 0;
  let maxSeq = 0;
  let maxCmd = 0;
  for (const ev of history) {
    maxEvt = Math.max(maxEvt, paddedNumeric("EVT", ev.id) ?? 0);
    maxCmd = Math.max(maxCmd, paddedNumeric("CMD", ev.sourceCommandId ?? "") ?? 0);
  }
  for (const ev of events) {
    maxSev = Math.max(maxSev, paddedNumeric("SEV", ev.id) ?? 0);
    maxSeq = Math.max(maxSeq, ev.sequence);
  }
  for (const t of Object.values(officeTerms)) {
    maxTerm = Math.max(maxTerm, paddedNumeric("TERM", t.id) ?? 0);
  }
  if (counters.nextEventId <= maxEvt) return "nextEventId does not exceed allocated history ids";
  if (counters.nextScheduledId <= maxSev)
    return "nextScheduledId does not exceed allocated scheduler ids";
  if (counters.nextTermId <= maxTerm) return "nextTermId does not exceed allocated term ids";
  if (counters.schedulerSequence <= maxSeq)
    return "schedulerSequence does not exceed allocated sequences";
  if (counters.nextCommandId <= maxCmd)
    return "nextCommandId does not exceed allocated command ids";

  const interruptParsed =
    raw.pendingInterrupt == null ? null : parseInterrupt(raw.pendingInterrupt);
  if (typeof interruptParsed === "string" && interruptParsed !== "null") return interruptParsed;
  const pendingInterrupt =
    interruptParsed === "null" || interruptParsed == null ? null : interruptParsed;
  if (pendingInterrupt && !schedIds.has(pendingInterrupt.scheduledEventId)) {
    return "pendingInterrupt.scheduledEventId does not exist";
  }
  if (pendingInterrupt) {
    const src = events.find((e) => e.id === pendingInterrupt.scheduledEventId);
    if (!src) return "pendingInterrupt.scheduledEventId does not exist";
    if (src.status !== "processed") {
      return "pendingInterrupt source event must be processed";
    }
    if (src.blocking !== true) {
      return "pendingInterrupt source event must be blocking";
    }
    if (src.eventType !== pendingInterrupt.code) {
      return "pendingInterrupt.code must match source eventType";
    }
    if (src.dueDate !== pendingInterrupt.date) {
      return "pendingInterrupt.date must match source dueDate";
    }
    if (src.requiresResolution !== pendingInterrupt.requiresResolution) {
      return "pendingInterrupt.requiresResolution must match source event";
    }
  }
  const expectedTarget = addMonths(raw.scenarioStartDate, raw.completedTurns + 1);
  if (pendingInterrupt) {
    if (raw.activeTurnTarget == null) return "paused state missing activeTurnTarget";
    if (raw.activeTurnTarget !== expectedTarget) {
      return "activeTurnTarget is not compatible with the current turn window";
    }
    if (compareIsoDate(raw.currentDate, raw.activeTurnTarget) >= 0) {
      return "currentDate must be before activeTurnTarget while paused";
    }
  } else if (raw.activeTurnTarget != null) {
    return "activeTurnTarget must be null when no interrupt is pending";
  } else {
    const expectedCurrent = addMonths(raw.scenarioStartDate, raw.completedTurns);
    if (raw.currentDate !== expectedCurrent) {
      return "currentDate must equal scenarioStartDate + completedTurns months when not paused";
    }
  }
  const presidential = parsePresidential(raw.presidential, new Set(Object.keys(politicians)));
  if (typeof presidential === "string") return presidential;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion: raw.contentVersion,
    scenarioId: raw.scenarioId,
    scenarioStartDate: raw.scenarioStartDate,
    currentDate: raw.currentDate,
    completedTurns: raw.completedTurns,
    activeTurnTarget: raw.activeTurnTarget == null ? null : raw.activeTurnTarget,
    rng,
    playerPoliticianId: raw.playerPoliticianId,
    politicians,
    officeTerms,
    scheduler: { events },
    pendingInterrupt,
    history,
    counters,
    presidential,
  };
}

export type ParseSaveOptions = {
  contentMigrations?: ContentMigration[];
};

export function parseSaveFile(
  raw: unknown,
  expectedContentVersion?: string,
  options?: ParseSaveOptions,
): SaveParseResult {
  const migrated = migrateSaveUnknown(raw);
  if (!migrated.ok) return { ok: false, error: migrated.error };
  let obj: unknown = migrated.value;
  if (!isRecord(obj)) return fail("MALFORMED_SAVE", "Save root must be an object");
  if (obj.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return fail("UNSUPPORTED_SCHEMA", `Unexpected schemaVersion ${String(obj.schemaVersion)}`);
  }
  if (typeof obj.contentVersion !== "string" || obj.contentVersion.length === 0) {
    return fail("MALFORMED_SAVE", "contentVersion missing");
  }
  if (typeof obj.scenarioId !== "string" || obj.scenarioId.length === 0) {
    return fail("MALFORMED_SAVE", "scenarioId missing");
  }
  if (expectedContentVersion && obj.contentVersion !== expectedContentVersion) {
    const applied = applyContentMigrations(
      obj,
      obj.contentVersion,
      expectedContentVersion,
      options?.contentMigrations ?? CONTENT_MIGRATIONS,
    );
    if (!applied.ok) return { ok: false, error: applied.error };
    obj = applied.value;
    if (!isRecord(obj)) return fail("MALFORMED_SAVE", "Content migration produced a non-object");
    if (obj.contentVersion !== expectedContentVersion) {
      return fail(
        "INCOMPATIBLE_CONTENT",
        `Content migration did not produce ${expectedContentVersion}`,
      );
    }
  }
  if (typeof obj.contentVersion !== "string" || typeof obj.scenarioId !== "string") {
    return fail("MALFORMED_SAVE", "contentVersion/scenarioId missing after migration");
  }
  const contentVersion = obj.contentVersion;
  const scenarioId = obj.scenarioId;
  if (!isRecord(obj.simulation)) return fail("MALFORMED_SAVE", "simulation state missing");
  const sim = parseSimulation(obj.simulation, {
    contentVersion,
    scenarioId,
  });
  if (typeof sim === "string") {
    if (sim.startsWith("RESOLUTION_EVENT_MUST_BLOCK:")) {
      return fail(
        "RESOLUTION_EVENT_MUST_BLOCK",
        sim.slice("RESOLUTION_EVENT_MUST_BLOCK:".length).trim(),
      );
    }
    return fail("MALFORMED_SAVE", sim);
  }
  if (obj.rng !== undefined) {
    try {
      const envelopeRng = parseSerializedRngState(obj.rng);
      if (!rngEqual(envelopeRng, sim.rng)) {
        return fail(
          "INVALID_RNG",
          "Root rng and simulation.rng must be identical if both are present",
        );
      }
    } catch (e) {
      return fail("INVALID_RNG", e instanceof Error ? e.message : String(e));
    }
  }
  return {
    ok: true,
    save: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      contentVersion,
      scenarioId,
      simulation: sim,
    },
  };
}

/** Placeholder named for the v1→v2 contract. Not registered until schema 2 exists. */
export function migrateSaveV1ToV2(raw: unknown): unknown {
  return raw;
}
