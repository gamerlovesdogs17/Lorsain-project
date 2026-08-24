import { addMonths, compareIsoDate, isIsoDate } from "./calendar.js";
import { isJsonObject } from "./json.js";
import { canonicalJson } from "./hash.js";
import { parseCanonicalAllocatedId } from "./ids.js";
import { parseSerializedRngState, type SerializedRngState } from "./rng.js";
import { resolutionEventMustBlock } from "./scheduler.js";
import { agentCounterError, parseAgentState } from "./agents/validation.js";
import { parsePartyRuntime, partyCounterError } from "./parties/validation.js";
import { parseElectoralRuntime, electoralCounterError } from "./elections/validation.js";
import { parseCampaignRuntime, campaignCounterError } from "./campaigns/validation.js";
import { parseLegislatureRuntime, legislatureCounterError } from "./legislature/validation.js";
import { parseExecutiveRuntime, executiveCounterError } from "./executive/validation.js";
import { parseConstitutionalRuntime, constitutionalCounterError } from "./courts/validation.js";
import { parseEconomyRuntime, economyCounterError } from "./economy/validation.js";
import { parseOrganizationRuntime, organizationCounterError } from "./organizations/validation.js";
import { parseMediaRuntime, mediaCounterError } from "./media/validation.js";
import { parseForeignAffairsRuntime, foreignCounterError } from "./foreign/validation.js";
import { parseProvincialRuntime } from "./provinces/validation.js";
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
  return parseCanonicalAllocatedId(prefix, id);
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
  if (raw.homeProvinceId != null && typeof raw.homeProvinceId !== "string") {
    return `politicians.${id} homeProvinceId must be string or undefined`;
  }
  if (raw.displayName != null && typeof raw.displayName !== "string") {
    return `politicians.${id} displayName must be string or undefined`;
  }
  if (raw.description != null && typeof raw.description !== "string") {
    return `politicians.${id} description must be string or undefined`;
  }
  return {
    id,
    alive: raw.alive,
    retired: raw.retired,
    partyId: raw.partyId === undefined ? null : (raw.partyId as string | null),
    factionId: raw.factionId === undefined ? null : (raw.factionId as string | null),
    ...(typeof raw.homeProvinceId === "string" ? { homeProvinceId: raw.homeProvinceId } : {}),
    ...(typeof raw.displayName === "string" ? { displayName: raw.displayName } : {}),
    ...(typeof raw.description === "string" ? { description: raw.description } : {}),
  };
}

function parseTerm(key: string, raw: unknown): OfficeTerm | string {
  if (!isRecord(raw)) return `officeTerms.${key} must be an object`;
  if (typeof raw.id !== "string" || raw.id !== key) return `officeTerms.${key} id mismatch`;
  if (paddedNumeric("TERM", raw.id) == null) {
    return `officeTerms.${key} id must be TERM followed by a positive integer`;
  }
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
  if (paddedNumeric("SEV", raw.id) == null) {
    return `scheduler ${raw.id} id must be SEV followed by a positive integer`;
  }
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
  if (st === "processed" && compareIsoDate(raw.dueDate, currentDate) > 0) {
    return `scheduler ${raw.id} processed event is in the future`;
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
  if (paddedNumeric("EVT", raw.id) == null) {
    return `history ${raw.id} id must be EVT followed by a positive integer`;
  }
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
  if (raw.kind === "BLOCKING_DOMAIN" && raw.resolutionStatus === "acknowledged") {
    return "BLOCKING_DOMAIN interrupt cannot be acknowledged";
  }
  if (raw.kind === "PRESENTATION" && raw.requiresResolution !== false) {
    return "PRESENTATION interrupt must not require resolution";
  }
  if (raw.kind === "PRESENTATION" && raw.resolutionStatus === "resolved") {
    return "PRESENTATION interrupt cannot use resolutionStatus resolved";
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
    "nextMemoryId",
    "nextGoalId",
    "nextEndorsementId",
    "nextPartyContestId",
    "nextDynamicPartyId",
    "nextPollId",
    "nextElectionId",
    "nextDomainResolutionId",
    "nextCampaignId",
    "nextDebateId",
    "nextBillId",
    "nextAmendmentId",
    "nextLegislativeVoteId",
    "nextLawId",
    "nextRegulationId",
    "nextMotionId",
    "nextEmergencyId",
    "nextWarPowerId",
    "nextBudgetId",
    "nextCaseId",
    "nextCourtNominationId",
    "nextCourtDecisionId",
    "nextImpeachmentId",
    "nextRecallId",
    "nextConstitutionalGroundsId",
    "nextLaggedEffectId",
    "nextEconomicShockId",
    "nextOrgActionId",
    "nextMediaStoryId",
    "nextTreatyId",
    "nextSanctionId",
    "nextCrisisId",
    "nextConflictId",
    "nextForeignLeaderId",
    "nextDiplomaticActionId",
    "nextTreatyRatificationId",
    "nextIncomingDiplomacyId",
  ] as const;
  const out = {} as Counters;
  for (const k of keys) {
    if (k === "nextIncomingDiplomacyId") {
      out[k] = isInt(raw[k]) && (raw[k] as number) >= 1 ? (raw[k] as number) : 1;
      continue;
    }
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
    if (pendingInterrupt.date !== raw.currentDate) {
      return "pendingInterrupt.date must equal currentDate";
    }
  }
  const electoral = parseElectoralRuntime(raw);
  if (typeof electoral === "string") return electoral;
  const electoralCountErr = electoralCounterError(electoral, counters);
  if (electoralCountErr) return electoralCountErr;
  const campaigns = parseCampaignRuntime(raw.campaignRuntime);
  if (typeof campaigns === "string") return campaigns;
  const campaignCountErr = campaignCounterError(campaigns, counters);
  if (campaignCountErr) return campaignCountErr;
  const legislature = parseLegislatureRuntime(raw.legislatureRuntime);
  if (typeof legislature === "string") return legislature;
  const legislatureCountErr = legislatureCounterError(legislature, counters);
  if (legislatureCountErr) return legislatureCountErr;
  const executive = parseExecutiveRuntime(raw.executiveRuntime);
  if (typeof executive === "string") return executive;
  const executiveCountErr = executiveCounterError(executive, counters);
  if (executiveCountErr) return executiveCountErr;
  const constitutional = parseConstitutionalRuntime(raw.constitutionalRuntime);
  if (typeof constitutional === "string") return constitutional;
  const constitutionalCountErr = constitutionalCounterError(constitutional, counters);
  if (constitutionalCountErr) return constitutionalCountErr;
  const economy = parseEconomyRuntime(raw.economyRuntime);
  if (typeof economy === "string") return economy;
  const economyCountErr = economyCounterError(economy, counters);
  if (economyCountErr) return economyCountErr;
  const provincial = parseProvincialRuntime(raw.provincialRuntime);
  if (typeof provincial === "string") return provincial;
  const organizations = parseOrganizationRuntime(raw.organizationRuntime);
  if (typeof organizations === "string") return organizations;
  const orgCountErr = organizationCounterError(organizations, counters);
  if (orgCountErr) return orgCountErr;
  const media = parseMediaRuntime(raw.mediaRuntime);
  if (typeof media === "string") return media;
  const mediaCountErr = mediaCounterError(media, counters);
  if (mediaCountErr) return mediaCountErr;
  const foreign = parseForeignAffairsRuntime(raw.foreignAffairsRuntime);
  if (typeof foreign === "string") return foreign;
  const foreignCountErr = foreignCounterError(foreign, counters);
  if (foreignCountErr) return foreignCountErr;

  for (const ev of events) {
    if (ev.requiresResolution === true && ev.status === "processed") {
      const liveBlock =
        pendingInterrupt &&
        pendingInterrupt.kind === "BLOCKING_DOMAIN" &&
        pendingInterrupt.scheduledEventId === ev.id &&
        pendingInterrupt.resolutionStatus === "unresolved";
      const dres = Object.values(electoral.domainResolutions).find(
        (r) => r.sourceScheduledEventId === ev.id,
      );
      if (!liveBlock && !dres) {
        return `processed resolution event ${ev.id} must have an unresolved BLOCKING_DOMAIN interrupt or a DomainResolutionRecord`;
      }
    }
  }
  for (const ev of history) {
    if (compareIsoDate(ev.date, raw.currentDate) > 0) {
      return `history ${ev.id} date is after currentDate`;
    }
    if (ev.turn > raw.completedTurns) {
      return `history ${ev.id} turn is after completedTurns`;
    }
    if (ev.sourceScheduledEventId != null) {
      const src = events.find((e) => e.id === ev.sourceScheduledEventId);
      if (!src) return `history ${ev.id} sourceScheduledEventId does not exist`;
      if (src.status === "pending") {
        return `history ${ev.id} sourceScheduledEventId is still pending`;
      }
    }
    if (ev.sourceCommandId != null) {
      const n = paddedNumeric("CMD", ev.sourceCommandId);
      if (n == null || n < 1) return `history ${ev.id} sourceCommandId is not a canonical CMD id`;
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
  const historyDates = new Map(history.map((ev) => [ev.id, ev.date]));
  const agent = parseAgentState(raw, {
    politicianIds: new Set(Object.keys(politicians)),
    scenarioStartDate: raw.scenarioStartDate,
    currentDate: raw.currentDate,
    historyDates,
  });
  if (typeof agent === "string") return agent;
  const agentCountErr = agentCounterError(agent, counters);
  if (agentCountErr) return agentCountErr;
  const party = parsePartyRuntime(raw, {
    politicianIds: new Set(Object.keys(politicians)),
    scenarioStartDate: raw.scenarioStartDate,
    currentDate: raw.currentDate,
  });
  if (typeof party === "string") return party;
  const partyCountErr = partyCounterError(party, counters);
  if (partyCountErr) return partyCountErr;
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
    relationships: agent.relationships,
    memories: agent.memories,
    beliefs: agent.beliefs,
    goals: agent.goals,
    generatedAgentProfiles: agent.generatedAgentProfiles,
    agentProfileOverrides: agent.agentProfileOverrides,
    partyStates: party.partyStates,
    factionStates: party.factionStates,
    endorsements: party.endorsements,
    partyContests: party.partyContests,
    dynamicParties: party.dynamicParties,
    elections: electoral.elections,
    candidateStanding: electoral.candidateStanding,
    electoralEnvironment: electoral.electoralEnvironment,
    polls: electoral.polls,
    domainResolutions: electoral.domainResolutions,
    campaignRuntime: campaigns,
    legislatureRuntime: legislature,
    executiveRuntime: executive,
    constitutionalRuntime: constitutional,
    economyRuntime: economy,
    provincialRuntime: provincial,
    organizationRuntime: organizations,
    mediaRuntime: media,
    foreignAffairsRuntime: foreign,
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

/**
 * Phase 1 saves begin Phase 2 cognitive history at migration/load because
 * relationships/memories/beliefs/goals did not exist previously.
 * No fabricated interpersonal past is written here. restoreSimulation seeds
 * deterministic initial goals when nextGoalId is still 1 and goals are empty.
 */
export function migrateSaveV1ToV2(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 2 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 2 };
  sim.relationships = isRecord(sim.relationships) ? sim.relationships : {};
  sim.memories = isRecord(sim.memories) ? sim.memories : {};
  sim.beliefs = isRecord(sim.beliefs) ? sim.beliefs : {};
  sim.goals = isRecord(sim.goals) ? sim.goals : {};
  sim.generatedAgentProfiles = isRecord(sim.generatedAgentProfiles)
    ? sim.generatedAgentProfiles
    : {};
  sim.agentProfileOverrides = isRecord(sim.agentProfileOverrides) ? sim.agentProfileOverrides : {};
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextMemoryId: isInt(sim.counters.nextMemoryId) ? sim.counters.nextMemoryId : 1,
      nextGoalId: isInt(sim.counters.nextGoalId) ? sim.counters.nextGoalId : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 1, toSchema: 2, migrate: migrateSaveV1ToV2 });

/**
 * Phase 2 saves begin Phase 3 party institutional state at migration/load
 * because PartyState/FactionState/endorsements/contests did not exist.
 * No fabricated past contests are written. restoreSimulation seeds canonical
 * starting leadership from KernelWorld when partyStates are empty.
 */
export function migrateSaveV2ToV3(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 3 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 3 };
  sim.partyStates = isRecord(sim.partyStates) ? sim.partyStates : {};
  sim.factionStates = isRecord(sim.factionStates) ? sim.factionStates : {};
  sim.endorsements = isRecord(sim.endorsements) ? sim.endorsements : {};
  sim.partyContests = isRecord(sim.partyContests) ? sim.partyContests : {};
  sim.dynamicParties = isRecord(sim.dynamicParties) ? sim.dynamicParties : {};
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextEndorsementId: isInt(sim.counters.nextEndorsementId) ? sim.counters.nextEndorsementId : 1,
      nextPartyContestId: isInt(sim.counters.nextPartyContestId)
        ? sim.counters.nextPartyContestId
        : 1,
      nextDynamicPartyId: isInt(sim.counters.nextDynamicPartyId)
        ? sim.counters.nextDynamicPartyId
        : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 2, toSchema: 3, migrate: migrateSaveV2ToV3 });

/**
 * Phase 3 saves begin Phase 4 electoral-domain state at migration/load.
 * No fabricated polls or completed general-election results are written.
 * restoreSimulation seeds canonical upcoming ElectionState when elections are empty.
 */
export function migrateSaveV3ToV4(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 4 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 4 };
  sim.elections = isRecord(sim.elections) ? sim.elections : {};
  sim.candidateStanding = isRecord(sim.candidateStanding) ? sim.candidateStanding : {};
  sim.electoralEnvironment = isRecord(sim.electoralEnvironment)
    ? sim.electoralEnvironment
    : { nationalPartyShift: {}, constituencyPartyShift: {}, issueClimateShift: {} };
  sim.polls = isRecord(sim.polls) ? sim.polls : {};
  sim.domainResolutions = isRecord(sim.domainResolutions) ? sim.domainResolutions : {};
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextPollId: isInt(sim.counters.nextPollId) ? sim.counters.nextPollId : 1,
      nextElectionId: isInt(sim.counters.nextElectionId) ? sim.counters.nextElectionId : 1,
      nextDomainResolutionId: isInt(sim.counters.nextDomainResolutionId)
        ? sim.counters.nextDomainResolutionId
        : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 3, toSchema: 4, migrate: migrateSaveV3ToV4 });

/**
 * Phase 4 saves begin Phase 5 campaign-domain state at migration/load.
 * No fabricated campaign history is written.
 */
export function migrateSaveV4ToV5(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 5 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 5 };
  sim.campaignRuntime = isRecord(sim.campaignRuntime)
    ? sim.campaignRuntime
    : { campaigns: {}, debates: {}, lastMonthProcessed: null };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextCampaignId: isInt(sim.counters.nextCampaignId) ? sim.counters.nextCampaignId : 1,
      nextDebateId: isInt(sim.counters.nextDebateId) ? sim.counters.nextDebateId : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 4, toSchema: 5, migrate: migrateSaveV4ToV5 });

/**
 * Phase 5 saves begin Phase 6 legislature-domain state at migration/load.
 * No fabricated bills, votes, or enacted laws are written.
 */
export function migrateSaveV5ToV6(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 6 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 6 };
  sim.legislatureRuntime = isRecord(sim.legislatureRuntime)
    ? sim.legislatureRuntime
    : {
        committees: {},
        bills: {},
        amendments: {},
        legislativeVotes: {},
        enactedLaws: {},
        partyRecommendations: {},
        factionRecommendations: {},
        floorQueue: [],
        pendingPlayerVotes: {},
        lastMonthProcessed: null,
        sessionLabel: "assembly",
      };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextBillId: isInt(sim.counters.nextBillId) ? sim.counters.nextBillId : 1,
      nextAmendmentId: isInt(sim.counters.nextAmendmentId) ? sim.counters.nextAmendmentId : 1,
      nextLegislativeVoteId: isInt(sim.counters.nextLegislativeVoteId)
        ? sim.counters.nextLegislativeVoteId
        : 1,
      nextLawId: isInt(sim.counters.nextLawId) ? sim.counters.nextLawId : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 5, toSchema: 6, migrate: migrateSaveV5ToV6 });

/**
 * Phase 6 saves begin Phase 7 executive-domain state at migration/load.
 * No fabricated appointments, regulations, motions, or emergencies are written.
 */
export function migrateSaveV6ToV7(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 7 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 7 };
  sim.executiveRuntime = isRecord(sim.executiveRuntime)
    ? sim.executiveRuntime
    : {
        ministries: {},
        regulations: {},
        budgets: {},
        emergencies: {},
        warPowers: {},
        motions: {},
        pendingPlayerMotionVotes: {},
        lastMonthProcessed: null,
        emergencyTrigger: false,
        warTrigger: false,
      };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextRegulationId: isInt(sim.counters.nextRegulationId) ? sim.counters.nextRegulationId : 1,
      nextMotionId: isInt(sim.counters.nextMotionId) ? sim.counters.nextMotionId : 1,
      nextEmergencyId: isInt(sim.counters.nextEmergencyId) ? sim.counters.nextEmergencyId : 1,
      nextWarPowerId: isInt(sim.counters.nextWarPowerId) ? sim.counters.nextWarPowerId : 1,
      nextBudgetId: isInt(sim.counters.nextBudgetId) ? sim.counters.nextBudgetId : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 6, toSchema: 7, migrate: migrateSaveV6ToV7 });

/**
 * Phase 7 saves begin Phase 8 constitutional-court state at migration/load.
 * No fabricated cases, nominations, or impeachments are written.
 */
export function migrateSaveV7ToV8(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 8 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 8 };
  sim.constitutionalRuntime = isRecord(sim.constitutionalRuntime)
    ? sim.constitutionalRuntime
    : {
        courtCases: {},
        courtDecisions: {},
        nominations: {},
        impeachments: {},
        recalls: {},
        precedents: {},
        grounds: {},
        pendingPlayerVotes: {},
        lastMonthProcessed: null,
      };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextCaseId: isInt(sim.counters.nextCaseId) ? sim.counters.nextCaseId : 1,
      nextCourtNominationId: isInt(sim.counters.nextCourtNominationId)
        ? sim.counters.nextCourtNominationId
        : 1,
      nextCourtDecisionId: isInt(sim.counters.nextCourtDecisionId)
        ? sim.counters.nextCourtDecisionId
        : 1,
      nextImpeachmentId: isInt(sim.counters.nextImpeachmentId) ? sim.counters.nextImpeachmentId : 1,
      nextRecallId: isInt(sim.counters.nextRecallId) ? sim.counters.nextRecallId : 1,
      nextConstitutionalGroundsId: isInt(sim.counters.nextConstitutionalGroundsId)
        ? sim.counters.nextConstitutionalGroundsId
        : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 7, toSchema: 8, migrate: migrateSaveV7ToV8 });

/**
 * Phase 8 saves begin Phase 9 economy / organization / media state at migration.
 * No fabricated prior media stories or organization actions. Economy starts at
 * Legacy schema-8 saves used a reference-100 economic baseline.
 */
export function migrateSaveV8ToV9(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 9 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 9 };
  const start =
    typeof sim.scenarioStartDate === "string" ? sim.scenarioStartDate : "2028-01-01";
  sim.economyRuntime = isRecord(sim.economyRuntime)
    ? sim.economyRuntime
    : {
        national: {
          outputIndex: 100,
          employmentIndex: 100,
          priceIndex: 100,
          realWageIndex: 100,
          housingIndex: 100,
          confidenceIndex: 100,
          fiscalPressure: 0.35,
        },
        history: [
          {
            date: start,
            outputIndex: 100,
            employmentIndex: 100,
            priceIndex: 100,
            realWageIndex: 100,
            housingIndex: 100,
            confidenceIndex: 100,
            fiscalPressure: 0.35,
          },
        ],
        provinces: {},
        sectors: {
          labor: { conditionsIndex: 100 },
          manufacturing: { conditionsIndex: 100 },
          agriculture: { conditionsIndex: 100 },
          services: { conditionsIndex: 100 },
          housing: { conditionsIndex: 100 },
          trade: { conditionsIndex: 100 },
        },
        laggedEffects: [],
        shocks: [],
        appliedPolicySources: {},
        lastMonthProcessed: null,
      };
  sim.organizationRuntime = isRecord(sim.organizationRuntime)
    ? sim.organizationRuntime
    : { actors: {}, meetingsThisMonth: 0, lastMonthProcessed: null, metadata: {} };
  sim.mediaRuntime = isRecord(sim.mediaRuntime)
    ? sim.mediaRuntime
    : { stories: {}, lingering: [], lastMonthProcessed: null };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextLaggedEffectId: isInt(sim.counters.nextLaggedEffectId)
        ? sim.counters.nextLaggedEffectId
        : 1,
      nextEconomicShockId: isInt(sim.counters.nextEconomicShockId)
        ? sim.counters.nextEconomicShockId
        : 1,
      nextOrgActionId: isInt(sim.counters.nextOrgActionId) ? sim.counters.nextOrgActionId : 1,
      nextMediaStoryId: isInt(sim.counters.nextMediaStoryId) ? sim.counters.nextMediaStoryId : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 8, toSchema: 9, migrate: migrateSaveV8ToV9 });

/**
 * Phase 9 saves begin Phase 10 foreign-affairs state at migration.
 * No fabricated treaties, crises, or diplomatic history are written.
 * restoreSimulation seeds canonical foreign baseline when countries are empty.
 */
export function migrateSaveV9ToV10(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 10 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 10 };
  sim.foreignAffairsRuntime = isRecord(sim.foreignAffairsRuntime)
    ? sim.foreignAffairsRuntime
    : {
        countries: {},
        bilateralRelations: {},
        treaties: {},
        sanctions: {},
        crises: {},
        conflicts: {},
        diplomaticActions: {},
        treatyRatifications: {},
        pendingPresidentialActions: [],
        pendingPlayerTreatyVotes: {},
        treatyProposalCooldowns: {},
        institutionRuntime: { waActions: 0, ltoDisputes: {}, cscActions: 0, nafMediations: 0 },
        warTriggerArmedByConflictId: null,
        diplomaticActionsThisMonth: 0,
        lastMonthProcessed: null,
      };
  if (isRecord(sim.counters)) {
    sim.counters = {
      ...sim.counters,
      nextTreatyId: isInt(sim.counters.nextTreatyId) ? sim.counters.nextTreatyId : 1,
      nextSanctionId: isInt(sim.counters.nextSanctionId) ? sim.counters.nextSanctionId : 1,
      nextCrisisId: isInt(sim.counters.nextCrisisId) ? sim.counters.nextCrisisId : 1,
      nextConflictId: isInt(sim.counters.nextConflictId) ? sim.counters.nextConflictId : 1,
      nextForeignLeaderId: isInt(sim.counters.nextForeignLeaderId)
        ? sim.counters.nextForeignLeaderId
        : 1,
      nextDiplomaticActionId: isInt(sim.counters.nextDiplomaticActionId)
        ? sim.counters.nextDiplomaticActionId
        : 1,
      nextTreatyRatificationId: isInt(sim.counters.nextTreatyRatificationId)
        ? sim.counters.nextTreatyRatificationId
        : 1,
      nextIncomingDiplomacyId: isInt(sim.counters.nextIncomingDiplomacyId)
        ? sim.counters.nextIncomingDiplomacyId
        : 1,
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 9, toSchema: 10, migrate: migrateSaveV9ToV10 });

function migrationMonthStart(date: string, months: number): string {
  return `${addMonths(date, months).slice(0, 7)}-01`;
}

/**
 * Phase 10 saves lacked persistent Assembly filing/field/result structures and
 * nomination contests were not explicitly tied to their presidential cycle.
 * Legacy Assembly outcomes are retained as summary archives; no missing STV
 * rounds or ballots are fabricated.
 */
export function migrateSaveV10ToV11(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 11 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 11 };
  const elections = isRecord(sim.elections) ? { ...sim.elections } : {};
  const presidentialElections: Array<{ id: string; date: string }> = [];
  for (const [id, value] of Object.entries(elections).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(value)) continue;
    const election: Record<string, unknown> = { ...value };
    if (
      election.type === "presidential" &&
      typeof election.date === "string" &&
      election.status !== "cancelled"
    ) {
      presidentialElections.push({ id, date: election.date });
    }
    election.assembly = isRecord(election.assembly) ? election.assembly : null;
    if (
      election.type === "assembly" &&
      election.geographyKind === "national" &&
      election.status === "resolved" &&
      election.assembly == null &&
      typeof election.date === "string"
    ) {
      const metadata = isRecord(election.metadata) ? election.metadata : {};
      const winners = isRecord(metadata.constituencyWinners)
        ? metadata.constituencyWinners
        : {};
      const constituencyElectionIds = isRecord(metadata.constituencyElectionIds)
        ? metadata.constituencyElectionIds
        : {};
      const candidates = isRecord(election.candidates) ? election.candidates : {};
      const candidacies: Record<string, unknown> = {};
      const fields: Record<string, unknown> = {};
      const results: Record<string, unknown> = {};
      const partySeatTotals: Record<string, number> = {};
      for (const [cid, rawWinnerIds] of Object.entries(winners).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        if (!Array.isArray(rawWinnerIds) || rawWinnerIds.some((pid) => typeof pid !== "string")) {
          continue;
        }
        const electedIds = rawWinnerIds as string[];
        const partyByCandidate: Record<string, string | null> = {};
        for (const pid of electedIds) {
          const candidate = isRecord(candidates[pid]) ? candidates[pid] : null;
          const partyId = candidate && typeof candidate.partyId === "string" ? candidate.partyId : null;
          partyByCandidate[pid] = partyId;
          partySeatTotals[partyId ?? "independent"] =
            (partySeatTotals[partyId ?? "independent"] ?? 0) + 1;
          candidacies[pid] = {
            politicianId: pid,
            constituencyId: cid,
            partyId,
            filedDate:
              candidate && typeof candidate.filedDate === "string"
                ? candidate.filedDate
                : election.date,
            source: "npc",
            incumbent: false,
            status: "filed",
          };
        }
        fields[cid] = {
          constituencyId: cid,
          magnitude: electedIds.length,
          candidateIds: electedIds,
          finalizedDate: migrationMonthStart(election.date, -1),
        };
        results[cid] = {
          constituencyId: cid,
          constituencyElectionId:
            typeof constituencyElectionIds[cid] === "string"
              ? constituencyElectionIds[cid]
              : `${id}_${cid}`,
          magnitude: electedIds.length,
          candidateIds: electedIds,
          partyByCandidate,
          firstPreferences: {},
          electedIds,
          turnout: {
            registeredElectorate: 0,
            ballotsCast: 0,
            invalidOrBlank: 0,
            validVoteValue: 0,
            turnoutRate: 0,
          },
          countArchive: null,
          archiveCompleteness: "legacy_summary",
        };
      }
      election.assembly = {
        filingStatus: "closed",
        filingOpenDate: migrationMonthStart(election.date, -6),
        filingDeadlineDate: migrationMonthStart(election.date, -1),
        decisions: {},
        candidacies,
        constituencyFields: fields,
        constituencyResults: results,
        previousPartySeatTotals: {},
        partySeatTotals,
      };
    }
    elections[id] = election;
  }
  sim.elections = elections;

  presidentialElections.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (isRecord(sim.partyContests) && presidentialElections.length > 0) {
    const contests = { ...sim.partyContests };
    for (const [id, value] of Object.entries(contests)) {
      if (!isRecord(value) || value.type !== "presidential_nomination") continue;
      const contest: Record<string, unknown> = { ...value };
      const metadata = isRecord(contest.metadata) ? { ...contest.metadata } : {};
      if (typeof metadata.electionId !== "string") {
        const anchorDate =
          typeof contest.resolvedDate === "string"
            ? contest.resolvedDate
            : typeof contest.openedDate === "string"
              ? contest.openedDate
              : typeof contest.createdDate === "string"
                ? contest.createdDate
                : "";
        const linked =
          presidentialElections.find((election) => election.date >= anchorDate) ??
          presidentialElections[presidentialElections.length - 1]!;
        metadata.electionId = linked.id;
        metadata.electionDate = linked.date;
        metadata.cycleYear = Number(linked.date.slice(0, 4));
        metadata.cycle = linked.date.slice(0, 4);
        metadata.partyId = typeof contest.partyId === "string" ? contest.partyId : "";
        metadata.candidateSource =
          linked.id === "ELEC_PRES_2028" ? "scenario_start" : "runtime_politics";
      }
      contest.metadata = metadata;
      contests[id] = contest;
    }
    sim.partyContests = contests;
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 10, toSchema: 11, migrate: migrateSaveV10ToV11 });

/**
 * Phase 11.2 adds provincial governance/elections and province-level campaign
 * organization. Existing political history is preserved; the new provincial
 * layer is seeded deterministically from live offices after restore.
 */
export function migrateSaveV11ToV12(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 12 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 12 };
  sim.provincialRuntime = isRecord(sim.provincialRuntime)
    ? sim.provincialRuntime
    : { provinces: {}, elections: {}, actions: {}, pressures: {}, lastMonthProcessed: null };
  if (isRecord(sim.campaignRuntime) && isRecord(sim.campaignRuntime.campaigns)) {
    const campaigns: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(sim.campaignRuntime.campaigns)) {
      campaigns[id] = isRecord(value) ? { ...value, organizationByProvince: {} } : value;
    }
    sim.campaignRuntime = { ...sim.campaignRuntime, campaigns };
  }
  if (isRecord(sim.partyContests)) {
    const contests: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(sim.partyContests)) {
      if (!isRecord(value)) {
        contests[id] = value;
        continue;
      }
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const futureShell =
        value.type === "presidential_nomination" &&
        value.status === "planned" &&
        metadata.candidateSource === "runtime_politics";
      contests[id] = futureShell ? { ...value, entries: {} } : value;
    }
    sim.partyContests = contests;
  }
  if (isRecord(sim.economyRuntime)) {
    sim.economyRuntime = {
      ...sim.economyRuntime,
      provinceHistory: isRecord(sim.economyRuntime.provinceHistory)
        ? sim.economyRuntime.provinceHistory
        : {},
      sectorHistory: isRecord(sim.economyRuntime.sectorHistory)
        ? sim.economyRuntime.sectorHistory
        : {},
      cycle: isRecord(sim.economyRuntime.cycle)
        ? sim.economyRuntime.cycle
        : {
            phase: 0.35,
            outputMomentum: 0,
            inflationMomentum: 0,
            housingMomentum: 0,
            monthsElapsed: 0,
          },
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 11, toSchema: 12, migrate: migrateSaveV11ToV12 });

/**
 * Phase 11.3 adds lightweight Provincial Assemblies, a renewable political
 * recruitment pool, public runtime identities, and mutable curated
 * constitutional rules. Existing history is preserved; current institutions
 * are seeded deterministically after restore.
 */
export function migrateSaveV12ToV13(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const next: Record<string, unknown> = { ...raw, schemaVersion: 13 };
  if (!isRecord(raw.simulation)) return next;
  const sim: Record<string, unknown> = { ...raw.simulation, schemaVersion: 13 };
  const provincial = isRecord(sim.provincialRuntime) ? sim.provincialRuntime : {};
  sim.provincialRuntime = {
    ...provincial,
    assemblies: isRecord(provincial.assemblies) ? provincial.assemblies : {},
    legislators: isRecord(provincial.legislators) ? provincial.legislators : {},
    assemblyElections: isRecord(provincial.assemblyElections) ? provincial.assemblyElections : {},
    bills: isRecord(provincial.bills) ? provincial.bills : {},
    votes: isRecord(provincial.votes) ? provincial.votes : {},
    promotions: isRecord(provincial.promotions) ? provincial.promotions : {},
    constitutionalRules: isRecord(provincial.constitutionalRules) ? provincial.constitutionalRules : {},
    constitutionalAmendments: isRecord(provincial.constitutionalAmendments)
      ? provincial.constitutionalAmendments
      : {},
  };
  if (isRecord(sim.legislatureRuntime)) {
    sim.legislatureRuntime = {
      ...sim.legislatureRuntime,
      caucusLeadership: isRecord(sim.legislatureRuntime.caucusLeadership)
        ? sim.legislatureRuntime.caucusLeadership
        : {},
      caucusContests: isRecord(sim.legislatureRuntime.caucusContests)
        ? sim.legislatureRuntime.caucusContests
        : {},
    };
  }
  next.simulation = sim;
  return next;
}

SCHEMA_MIGRATIONS.push({ fromSchema: 12, toSchema: 13, migrate: migrateSaveV12ToV13 });
