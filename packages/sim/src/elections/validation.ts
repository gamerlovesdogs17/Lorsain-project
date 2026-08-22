import { parseRational } from "@lorsain/election-math";
import { compareIsoDate, isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import { isJsonObject, type JsonObject } from "../json.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import { ENVIRONMENT_SHIFT, isRecognizedPollMethod, SHARE_SUM_TOLERANCE } from "./policy.js";
import { electionReplayError, replayElectionCount } from "./replay.js";
import { payloadElectionId, resolutionForScheduledEvent } from "./resolution.js";
import { isElectoralAggregatePartyId } from "./support.js";
import { integerBallotWeightSum } from "./ballots.js";
import {
  isDomainResolutionType,
  isElectionGeographyKind,
  isElectionStatus,
  isElectionType,
  type BallotGroupArchive,
  type CandidateStanding,
  type DomainResolutionRecord,
  type ElectionCandidate,
  type ElectionCountInput,
  type ElectionState,
  type ElectoralEnvironment,
  type PollRecord,
  type TurnoutRecord,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function finite01(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function finiteUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -1 && v <= 1;
}

function finiteShift(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= ENVIRONMENT_SHIFT.min &&
    v <= ENVIRONMENT_SHIFT.max
  );
}

function parseIdeology(raw: unknown): ElectionCandidate["publicIdeology"] | string {
  if (raw == null) return null;
  if (!isRecord(raw)) return "publicIdeology must be an object";
  const out: NonNullable<ElectionCandidate["publicIdeology"]> = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  for (const axis of IDEOLOGY_AXES) {
    if (!finiteUnit(raw[axis])) return `publicIdeology.${axis}`;
    out[axis] = raw[axis];
  }
  return out;
}

function parseCandidate(pid: string, raw: unknown): ElectionCandidate | string {
  if (!isRecord(raw)) return `candidate ${pid}`;
  if (raw.politicianId !== pid) return `candidate ${pid} id mismatch`;
  if (raw.partyId != null && typeof raw.partyId !== "string") return `candidate ${pid} partyId`;
  if (raw.sourceContestId != null && typeof raw.sourceContestId !== "string") {
    return `candidate ${pid} sourceContestId`;
  }
  if (!isIsoDate(raw.filedDate)) return `candidate ${pid} filedDate`;
  const ideology = parseIdeology(raw.publicIdeology);
  if (typeof ideology === "string") return `candidate ${pid} ${ideology}`;
  if (typeof raw.withdrawn !== "boolean") return `candidate ${pid} withdrawn`;
  const independentQualified =
    raw.independentQualified === undefined ? false : raw.independentQualified;
  if (typeof independentQualified !== "boolean") {
    return `candidate ${pid} independentQualified`;
  }
  return {
    politicianId: pid,
    partyId: raw.partyId == null ? null : raw.partyId,
    sourceContestId: raw.sourceContestId == null ? null : raw.sourceContestId,
    filedDate: raw.filedDate,
    publicIdeology: ideology,
    withdrawn: raw.withdrawn,
    independentQualified,
  };
}

function parseTurnout(raw: unknown): TurnoutRecord | string {
  if (!isRecord(raw)) return "turnout";
  if (
    !isInt(raw.registeredElectorate) ||
    raw.registeredElectorate < 0 ||
    !isInt(raw.ballotsCast) ||
    raw.ballotsCast < 0 ||
    !isInt(raw.invalidOrBlank) ||
    raw.invalidOrBlank < 0 ||
    !isInt(raw.validVoteValue) ||
    raw.validVoteValue < 0
  ) {
    return "turnout integers";
  }
  if (raw.registeredElectorate < raw.ballotsCast) return "turnout registered < ballotsCast";
  if (raw.ballotsCast !== raw.validVoteValue + raw.invalidOrBlank) {
    return "turnout ballotsCast != valid + invalid";
  }
  if (typeof raw.turnoutRate !== "number" || !Number.isFinite(raw.turnoutRate)) {
    return "turnoutRate";
  }
  const expected = raw.registeredElectorate > 0 ? raw.ballotsCast / raw.registeredElectorate : 0;
  if (Math.abs(raw.turnoutRate - expected) > 1e-9) return "turnoutRate mismatch";
  return {
    registeredElectorate: raw.registeredElectorate,
    ballotsCast: raw.ballotsCast,
    invalidOrBlank: raw.invalidOrBlank,
    validVoteValue: raw.validVoteValue,
    turnoutRate: raw.turnoutRate,
  };
}

function parseCountInput(raw: unknown, validVoteValue: number | null): ElectionCountInput | string {
  if (!isRecord(raw)) return "countInput";
  if (
    !Array.isArray(raw.candidateIds) ||
    raw.candidateIds.some((x) => typeof x !== "string") ||
    raw.candidateIds.length === 0
  ) {
    return "countInput.candidateIds";
  }
  if (new Set(raw.candidateIds).size !== raw.candidateIds.length) {
    return "countInput duplicate candidates";
  }
  const allowed = new Set(raw.candidateIds as string[]);
  if (!Array.isArray(raw.ballots)) return "countInput.ballots";
  const ballotIds = new Set<string>();
  const ballots: BallotGroupArchive[] = [];
  for (const row of raw.ballots) {
    if (!isRecord(row) || typeof row.id !== "string") return "countInput.ballot id";
    if (ballotIds.has(row.id)) return `countInput duplicate ballot ${row.id}`;
    ballotIds.add(row.id);
    if (typeof row.weight !== "string") return `countInput.ballot ${row.id} weight`;
    let parsed;
    try {
      parsed = parseRational(row.weight);
    } catch {
      return `countInput.ballot ${row.id} weight`;
    }
    if (parsed.den !== 1n || parsed.num <= 0n) {
      return `countInput.ballot ${row.id} weight must be a positive integer`;
    }
    if (!Array.isArray(row.rankings) || row.rankings.some((x) => typeof x !== "string")) {
      return `countInput.ballot ${row.id} rankings`;
    }
    for (const cid of row.rankings) {
      if (!allowed.has(cid)) return `countInput.ballot ${row.id} unknown ranking ${cid}`;
    }
    ballots.push({
      id: row.id,
      weight: row.weight,
      rankings: row.rankings as string[],
    });
  }
  if (validVoteValue != null) {
    const sum = integerBallotWeightSum(ballots);
    if (sum !== BigInt(validVoteValue)) {
      return `countInput weights ${sum} != validVoteValue ${validVoteValue}`;
    }
  }
  const seats = raw.seats == null ? undefined : raw.seats;
  if (seats !== undefined && (!isInt(seats) || seats < 1)) return "countInput.seats";
  return {
    candidateIds: raw.candidateIds as string[],
    ballots,
    ...(seats !== undefined ? { seats } : {}),
  };
}

function parseElection(id: string, raw: unknown): ElectionState | string {
  if (!isRecord(raw)) return `elections.${id}`;
  if (raw.id !== id) return `elections.${id} id mismatch`;
  if (typeof raw.type !== "string" || !isElectionType(raw.type)) return `elections.${id} type`;
  if (!isIsoDate(raw.date)) return `elections.${id} date`;
  if (typeof raw.status !== "string" || !isElectionStatus(raw.status)) {
    return `elections.${id} status`;
  }
  if (raw.status === "voting") {
    return `elections.${id} voting status cannot be persisted`;
  }
  if (typeof raw.geographyKind !== "string" || !isElectionGeographyKind(raw.geographyKind)) {
    return `elections.${id} geographyKind`;
  }
  if (raw.constituencyId != null && typeof raw.constituencyId !== "string") {
    return `elections.${id} constituencyId`;
  }
  if (!isInt(raw.seats) || raw.seats < 0) return `elections.${id} seats`;
  if (typeof raw.fieldFinalized !== "boolean") return `elections.${id} fieldFinalized`;
  if (!isRecord(raw.candidates)) return `elections.${id} candidates`;
  const candidates: Record<string, ElectionCandidate> = {};
  for (const [pid, c] of Object.entries(raw.candidates)) {
    const parsed = parseCandidate(pid, c);
    if (typeof parsed === "string") return `elections.${id} ${parsed}`;
    candidates[pid] = parsed;
  }
  if (
    !Array.isArray(raw.partiesWithoutNominee) ||
    raw.partiesWithoutNominee.some((x) => typeof x !== "string")
  ) {
    return `elections.${id} partiesWithoutNominee`;
  }
  if (
    raw.winnerIds != null &&
    (!Array.isArray(raw.winnerIds) || raw.winnerIds.some((x) => typeof x !== "string"))
  ) {
    return `elections.${id} winnerIds`;
  }
  if (raw.resultEventId != null && typeof raw.resultEventId !== "string") {
    return `elections.${id} resultEventId`;
  }
  if (!isJsonObject(raw.metadata)) return `elections.${id} metadata`;
  const winnerIds = Array.isArray(raw.winnerIds) ? (raw.winnerIds as string[]) : [];
  if (raw.status === "resolved") {
    if (!raw.fieldFinalized) return `elections.${id} resolved election not finalized`;
    const nationalAssemblyParent =
      raw.type === "assembly" &&
      raw.geographyKind === "national" &&
      isJsonObject(raw.metadata) &&
      raw.metadata.certifiedForAssumption === true &&
      isRecord(raw.metadata.constituencyWinners);
    if (!nationalAssemblyParent) {
      if (!raw.turnout || !raw.countInput || !raw.countArchive) {
        return `elections.${id} resolved election missing archive`;
      }
    }
    if (!raw.resultEventId) return `elections.${id} resolved election missing resultEventId`;
    if (nationalAssemblyParent) {
      return {
        id,
        type: raw.type,
        date: raw.date,
        status: raw.status,
        geographyKind: raw.geographyKind,
        constituencyId: raw.constituencyId == null ? null : raw.constituencyId,
        seats: Number(raw.seats),
        fieldFinalized: true,
        candidates,
        partiesWithoutNominee: raw.partiesWithoutNominee as string[],
        turnout: null,
        countInput: null,
        countArchive: null,
        winnerIds,
        resultEventId: raw.resultEventId as string,
        metadata: raw.metadata as JsonObject,
      };
    }
    const turnout = parseTurnout(raw.turnout);
    if (typeof turnout === "string") return `elections.${id} ${turnout}`;
    const countInput = parseCountInput(raw.countInput, turnout.validVoteValue);
    if (typeof countInput === "string") return `elections.${id} ${countInput}`;
    if (!isRecord(raw.countArchive) || typeof raw.countArchive.method !== "string") {
      return `elections.${id} countArchive`;
    }
    return {
      id,
      type: raw.type,
      date: raw.date,
      status: raw.status,
      geographyKind: raw.geographyKind,
      constituencyId: raw.constituencyId == null ? null : raw.constituencyId,
      seats: raw.seats,
      fieldFinalized: raw.fieldFinalized,
      candidates,
      partiesWithoutNominee: raw.partiesWithoutNominee as string[],
      turnout,
      countInput,
      countArchive: raw.countArchive as ElectionState["countArchive"],
      winnerIds,
      resultEventId: raw.resultEventId,
      metadata: raw.metadata,
    };
  }
  if (raw.countArchive != null || raw.countInput != null || raw.turnout != null) {
    return `elections.${id} unresolved election has count artifacts`;
  }
  if (winnerIds.length) return `elections.${id} unresolved election has winners`;
  if (raw.resultEventId != null) return `elections.${id} unresolved election has resultEvent`;
  if (raw.status === "planned" && raw.fieldFinalized) {
    return `elections.${id} planned election cannot be finalized`;
  }
  if (raw.status === "field_finalized" && !raw.fieldFinalized) {
    return `elections.${id} field_finalized status without fieldFinalized`;
  }
  return {
    id,
    type: raw.type,
    date: raw.date,
    status: raw.status,
    geographyKind: raw.geographyKind,
    constituencyId: raw.constituencyId == null ? null : raw.constituencyId,
    seats: raw.seats,
    fieldFinalized: raw.fieldFinalized,
    candidates,
    partiesWithoutNominee: raw.partiesWithoutNominee as string[],
    turnout: null,
    countInput: null,
    countArchive: null,
    winnerIds: [],
    resultEventId: null,
    metadata: raw.metadata,
  };
}

function parsePoll(id: string, raw: unknown): PollRecord | string {
  if (!isRecord(raw)) return `polls.${id}`;
  if (raw.id !== id) return `polls.${id} id mismatch`;
  if (parseCanonicalAllocatedId("POLL", id) == null) return `polls.${id} canonical id`;
  if (typeof raw.pollsterId !== "string") return `polls.${id} pollsterId`;
  if (raw.electionId != null && typeof raw.electionId !== "string") return `polls.${id} electionId`;
  if (typeof raw.geographyKind !== "string" || !isElectionGeographyKind(raw.geographyKind)) {
    return `polls.${id} geographyKind`;
  }
  if (raw.constituencyId != null && typeof raw.constituencyId !== "string") {
    return `polls.${id} constituencyId`;
  }
  if (raw.geographyKind === "constituency") {
    if (!raw.constituencyId) return `polls.${id} constituency geography missing constituencyId`;
  } else if (raw.constituencyId) {
    return `polls.${id} national poll cannot name a constituency`;
  }
  if (!isIsoDate(raw.fieldStart) || !isIsoDate(raw.fieldEnd) || !isIsoDate(raw.publicationDate)) {
    return `polls.${id} dates`;
  }
  if (compareIsoDate(raw.fieldStart, raw.fieldEnd) > 0)
    return `polls.${id} fieldStart after fieldEnd`;
  if (compareIsoDate(raw.fieldEnd, raw.publicationDate) > 0) {
    return `polls.${id} publicationDate before fieldEnd`;
  }
  if (!isInt(raw.sampleSize) || raw.sampleSize < 1 || raw.sampleSize > 20000) {
    return `polls.${id} sampleSize`;
  }
  if (typeof raw.method !== "string" || !isRecognizedPollMethod(raw.method)) {
    return `polls.${id} method`;
  }
  if (!Array.isArray(raw.candidateSnapshot) || raw.candidateSnapshot.length === 0) {
    return `polls.${id} candidateSnapshot`;
  }
  const snapIds = new Set<string>();
  const snapshot: PollRecord["candidateSnapshot"] = [];
  for (const row of raw.candidateSnapshot) {
    if (!isRecord(row) || typeof row.politicianId !== "string") {
      return `polls.${id} candidateSnapshot row`;
    }
    if (snapIds.has(row.politicianId)) return `polls.${id} duplicate snapshot ${row.politicianId}`;
    snapIds.add(row.politicianId);
    if (row.partyId != null && typeof row.partyId !== "string") {
      return `polls.${id} snapshot partyId`;
    }
    snapshot.push({
      politicianId: row.politicianId,
      partyId: row.partyId == null ? null : row.partyId,
    });
  }
  if (!Array.isArray(raw.firstPreference) || raw.firstPreference.length !== snapshot.length) {
    return `polls.${id} firstPreference size`;
  }
  const prefIds = new Set<string>();
  let shareSum = 0;
  const firstPreference: PollRecord["firstPreference"] = [];
  for (const row of raw.firstPreference) {
    if (!isRecord(row) || typeof row.politicianId !== "string" || !finite01(row.share)) {
      return `polls.${id} firstPreference`;
    }
    if (prefIds.has(row.politicianId)) return `polls.${id} duplicate firstPreference`;
    if (!snapIds.has(row.politicianId)) return `polls.${id} firstPreference not in snapshot`;
    prefIds.add(row.politicianId);
    if (row.partyId != null && typeof row.partyId !== "string") return `polls.${id} share partyId`;
    shareSum += row.share;
    firstPreference.push({
      politicianId: row.politicianId,
      partyId: row.partyId == null ? null : row.partyId,
      share: row.share,
    });
  }
  if (prefIds.size !== snapIds.size) return `polls.${id} firstPreference candidate set`;
  if (Math.abs(shareSum - 1) > SHARE_SUM_TOLERANCE) return `polls.${id} shares not normalized`;
  if (
    typeof raw.marginOfError !== "number" ||
    !Number.isFinite(raw.marginOfError) ||
    raw.marginOfError < 0
  ) {
    return `polls.${id} marginOfError`;
  }
  if (!isRecord(raw.houseEffectApplied)) return `polls.${id} houseEffectApplied`;
  for (const [k, v] of Object.entries(raw.houseEffectApplied)) {
    if (typeof k !== "string" || typeof v !== "number" || !Number.isFinite(v)) {
      return `polls.${id} houseEffectApplied`;
    }
  }
  if (!isJsonObject(raw.metadata)) return `polls.${id} metadata`;
  return {
    id,
    pollsterId: raw.pollsterId,
    electionId: raw.electionId == null ? null : raw.electionId,
    geographyKind: raw.geographyKind,
    constituencyId: raw.constituencyId == null ? null : raw.constituencyId,
    fieldStart: raw.fieldStart,
    fieldEnd: raw.fieldEnd,
    publicationDate: raw.publicationDate,
    sampleSize: raw.sampleSize,
    method: raw.method,
    candidateSnapshot: snapshot,
    firstPreference,
    marginOfError: raw.marginOfError,
    houseEffectApplied: raw.houseEffectApplied as Record<string, number>,
    metadata: raw.metadata,
  };
}

function parseStanding(id: string, raw: unknown): CandidateStanding | string {
  if (!isRecord(raw)) return `candidateStanding.${id}`;
  if (raw.politicianId !== id) return `candidateStanding.${id} id mismatch`;
  if (!finite01(raw.nameRecognition) || !finiteUnit(raw.favorability)) {
    return `candidateStanding.${id} recognition/favorability`;
  }
  if (!finite01(raw.enthusiasm) || !finiteUnit(raw.momentum)) {
    return `candidateStanding.${id} enthusiasm/momentum`;
  }
  return {
    politicianId: id,
    nameRecognition: raw.nameRecognition,
    favorability: raw.favorability,
    enthusiasm: raw.enthusiasm,
    momentum: raw.momentum,
  };
}

function parseShiftMap(raw: unknown, label: string): Record<string, number> | string {
  if (!isRecord(raw)) return label;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!finiteShift(v)) return `${label}.${k}`;
    out[k] = v;
  }
  return out;
}

function parseElectoralEnvironment(raw: unknown): ElectoralEnvironment | string {
  if (!isRecord(raw)) return "electoralEnvironment must be an object";
  const national = parseShiftMap(raw.nationalPartyShift, "nationalPartyShift");
  if (typeof national === "string") return `electoralEnvironment.${national}`;
  if (!isRecord(raw.constituencyPartyShift)) {
    return "electoralEnvironment.constituencyPartyShift";
  }
  const constituencyPartyShift: ElectoralEnvironment["constituencyPartyShift"] = {};
  for (const [cid, inner] of Object.entries(raw.constituencyPartyShift)) {
    const parsed = parseShiftMap(inner, `constituencyPartyShift.${cid}`);
    if (typeof parsed === "string") return `electoralEnvironment.${parsed}`;
    constituencyPartyShift[cid] = parsed;
  }
  const issues = parseShiftMap(raw.issueClimateShift, "issueClimateShift");
  if (typeof issues === "string") return `electoralEnvironment.${issues}`;
  return {
    nationalPartyShift: national,
    constituencyPartyShift,
    issueClimateShift: issues,
  };
}

function parseDres(id: string, raw: unknown): DomainResolutionRecord | string {
  if (!isRecord(raw)) return `domainResolutions.${id}`;
  if (raw.id !== id) return `domainResolutions.${id} id mismatch`;
  if (parseCanonicalAllocatedId("DRES", id) == null) return `domainResolutions.${id} canonical id`;
  if (typeof raw.sourceScheduledEventId !== "string") return `domainResolutions.${id} source`;
  if (typeof raw.domainType !== "string" || !isDomainResolutionType(raw.domainType)) {
    return `domainResolutions.${id} domainType`;
  }
  if (!isIsoDate(raw.date)) return `domainResolutions.${id} date`;
  if (raw.electionId != null && typeof raw.electionId !== "string") {
    return `domainResolutions.${id} electionId`;
  }
  if (typeof raw.resultEventId !== "string") return `domainResolutions.${id} resultEventId`;
  if (raw.archiveElectionId != null && typeof raw.archiveElectionId !== "string") {
    return `domainResolutions.${id} archiveElectionId`;
  }
  if (!isJsonObject(raw.metadata)) return `domainResolutions.${id} metadata`;
  return {
    id,
    sourceScheduledEventId: raw.sourceScheduledEventId,
    domainType: raw.domainType,
    date: raw.date,
    electionId: raw.electionId == null ? null : raw.electionId,
    resultEventId: raw.resultEventId,
    archiveElectionId: raw.archiveElectionId == null ? null : raw.archiveElectionId,
    metadata: raw.metadata,
  };
}

export function parseElectoralRuntime(raw: Record<string, unknown>):
  | {
      elections: Record<string, ElectionState>;
      candidateStanding: Record<string, CandidateStanding>;
      electoralEnvironment: ElectoralEnvironment;
      polls: Record<string, PollRecord>;
      domainResolutions: Record<string, DomainResolutionRecord>;
    }
  | string {
  const elections: Record<string, ElectionState> = {};
  if (raw.elections != null) {
    if (!isRecord(raw.elections)) return "elections must be an object";
    for (const [id, rec] of Object.entries(raw.elections)) {
      const parsed = parseElection(id, rec);
      if (typeof parsed === "string") return parsed;
      elections[id] = parsed;
    }
  }
  const candidateStanding: Record<string, CandidateStanding> = {};
  if (raw.candidateStanding != null) {
    if (!isRecord(raw.candidateStanding)) return "candidateStanding must be an object";
    for (const [id, rec] of Object.entries(raw.candidateStanding)) {
      const parsed = parseStanding(id, rec);
      if (typeof parsed === "string") return parsed;
      candidateStanding[id] = parsed;
    }
  }
  let electoralEnvironment: ElectoralEnvironment = {
    nationalPartyShift: {},
    constituencyPartyShift: {},
    issueClimateShift: {},
  };
  if (raw.electoralEnvironment != null) {
    const parsed = parseElectoralEnvironment(raw.electoralEnvironment);
    if (typeof parsed === "string") return parsed;
    electoralEnvironment = parsed;
  }
  const polls: Record<string, PollRecord> = {};
  if (raw.polls != null) {
    if (!isRecord(raw.polls)) return "polls must be an object";
    for (const [id, rec] of Object.entries(raw.polls)) {
      const parsed = parsePoll(id, rec);
      if (typeof parsed === "string") return parsed;
      polls[id] = parsed;
    }
  }
  const domainResolutions: Record<string, DomainResolutionRecord> = {};
  if (raw.domainResolutions != null) {
    if (!isRecord(raw.domainResolutions)) return "domainResolutions must be an object";
    for (const [id, rec] of Object.entries(raw.domainResolutions)) {
      const parsed = parseDres(id, rec);
      if (typeof parsed === "string") return parsed;
      domainResolutions[id] = parsed;
    }
  }
  return { elections, candidateStanding, electoralEnvironment, polls, domainResolutions };
}

export function electoralCounterError(
  parsed: {
    polls: Record<string, PollRecord>;
    domainResolutions: Record<string, DomainResolutionRecord>;
  },
  counters: { nextPollId: number; nextDomainResolutionId: number },
): string | null {
  let maxPoll = 0;
  for (const id of Object.keys(parsed.polls)) {
    maxPoll = Math.max(maxPoll, parseCanonicalAllocatedId("POLL", id) ?? 0);
  }
  if (counters.nextPollId <= maxPoll) return "nextPollId does not exceed allocated POLL ids";
  let maxD = 0;
  for (const id of Object.keys(parsed.domainResolutions)) {
    maxD = Math.max(maxD, parseCanonicalAllocatedId("DRES", id) ?? 0);
  }
  if (counters.nextDomainResolutionId <= maxD) {
    return "nextDomainResolutionId does not exceed allocated DRES ids";
  }
  return null;
}

function historyEvent(state: SimState, id: string): SimEvent | undefined {
  return state.history.find((e) => e.id === id);
}

export function domainResolutionEvidenceError(
  state: SimState,
  rec: DomainResolutionRecord,
): string | null {
  const src = state.scheduler.events.find((e) => e.id === rec.sourceScheduledEventId);
  if (!src || src.status !== "processed" || src.requiresResolution !== true) {
    return `DRES ${rec.id} source event invalid`;
  }
  const expectedType =
    rec.domainType === "presidential_election"
      ? "PRESIDENTIAL_ELECTION_DUE"
      : rec.domainType === "assembly_election"
        ? "ASSEMBLY_ELECTION_DUE"
        : rec.domainType === "presidential_assumption"
          ? "PRESIDENTIAL_ASSUMPTION_DUE"
          : rec.domainType === "assembly_assumption"
            ? "ASSEMBLY_ASSUMPTION_DUE"
            : null;
  if (!expectedType || src.eventType !== expectedType) {
    return `DRES ${rec.id} domainType/source event mismatch`;
  }
  if (rec.date !== src.dueDate) return `DRES ${rec.id} date mismatch`;
  const result = historyEvent(state, rec.resultEventId);
  if (!result) return `DRES ${rec.id} result event missing`;
  if (result.sourceScheduledEventId !== rec.sourceScheduledEventId) {
    return `DRES ${rec.id} result event source mismatch`;
  }
  if (rec.electionId) {
    const election = state.elections[rec.electionId];
    if (!election) return `DRES ${rec.id} election missing`;
    const payloadId = payloadElectionId(src.payload);
    if (payloadId && payloadId !== rec.electionId) {
      return `DRES ${rec.id} source event electionId mismatch`;
    }
    if (rec.domainType === "presidential_election" || rec.domainType === "assembly_election") {
      if (election.status !== "resolved") return `DRES ${rec.id} election is not resolved`;
      if (rec.date !== election.date) return `DRES ${rec.id} election date mismatch`;
      if (rec.archiveElectionId !== election.id) return `DRES ${rec.id} archiveElectionId`;
      if (rec.resultEventId !== election.resultEventId) {
        return `DRES ${rec.id} resultEventId does not match election`;
      }
      const expectedResultType =
        rec.domainType === "presidential_election"
          ? "PRESIDENTIAL_ELECTION_RESULT"
          : "ASSEMBLY_ELECTION_RESULT";
      if (result.type !== expectedResultType) return `DRES ${rec.id} result event type`;
      if (result.date !== election.date) return `DRES ${rec.id} result event date`;
      if (payloadElectionId(result.payload) !== election.id) {
        return `DRES ${rec.id} result payload electionId`;
      }
    }
    if (rec.domainType === "presidential_assumption") {
      if (election.status !== "resolved") return `DRES ${rec.id} assumption source not resolved`;
      if (rec.archiveElectionId !== election.id) return `DRES ${rec.id} archiveElectionId`;
      if (result.type !== "PRESIDENTIAL_ASSUMPTION") return `DRES ${rec.id} result event type`;
      if (result.date !== rec.date) return `DRES ${rec.id} result event date`;
    }
    if (rec.domainType === "assembly_assumption") {
      if (election.status !== "resolved") return `DRES ${rec.id} assumption source not resolved`;
      if (rec.archiveElectionId !== election.id) return `DRES ${rec.id} archiveElectionId`;
      if (result.type !== "ASSEMBLY_ASSUMPTION") return `DRES ${rec.id} result event type`;
      if (result.date !== rec.date) return `DRES ${rec.id} result event date`;
    }
  }
  return null;
}

function resolvedElectionWorldError(
  election: ElectionState,
  state: SimState,
  world: KernelWorld,
): CommandError | null {
  if (compareIsoDate(election.date, state.currentDate) > 0) {
    return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} date is in the future` };
  }
  for (const c of Object.values(election.candidates)) {
    if (!state.politicians[c.politicianId]) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} unknown historical candidate ${c.politicianId}`,
      };
    }
    if (compareIsoDate(c.filedDate, world.scenarioStartDate) < 0) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} candidate ${c.politicianId} filed before scenario start`,
      };
    }
    if (compareIsoDate(c.filedDate, election.date) > 0) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} candidate ${c.politicianId} filed after election date`,
      };
    }
  }
  if (
    election.type === "assembly" &&
    election.geographyKind === "national" &&
    election.metadata.certifiedForAssumption === true &&
    isRecord(election.metadata.constituencyWinners)
  ) {
    if (!election.resultEventId) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} missing resolved artifacts`,
      };
    }
    if (election.winnerIds.length !== election.seats) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} wrong seat count` };
    }
    if (new Set(election.winnerIds).size !== election.winnerIds.length) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} duplicate winners` };
    }
    const winnersMeta = election.metadata.constituencyWinners as Record<string, unknown>;
    const flat: string[] = [];
    for (const cid of Object.keys(winnersMeta).sort()) {
      const row = winnersMeta[cid];
      if (!Array.isArray(row) || row.some((x) => typeof x !== "string")) {
        return {
          code: "INVALID_SAVE_WORLD",
          message: `election ${election.id} constituencyWinners`,
        };
      }
      flat.push(...(row as string[]));
    }
    if (flat.length !== election.winnerIds.length || flat.some((id) => !election.winnerIds.includes(id))) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} constituencyWinners mismatch`,
      };
    }
    const result = historyEvent(state, election.resultEventId);
    if (!result) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} result event missing` };
    }
    if (result.type !== "ASSEMBLY_ELECTION_RESULT" || result.date !== election.date) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} result event type/date`,
      };
    }
    if (payloadElectionId(result.payload) !== election.id) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} result event payload`,
      };
    }
    return null;
  }
  if (
    !election.countInput ||
    !election.countArchive ||
    !election.turnout ||
    !election.resultEventId
  ) {
    return {
      code: "INVALID_SAVE_WORLD",
      message: `election ${election.id} missing resolved artifacts`,
    };
  }
  for (const id of election.countInput.candidateIds) {
    if (!state.politicians[id]) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} count candidate ${id} missing`,
      };
    }
  }
  const replayErr = electionReplayError(election);
  if (replayErr) return { code: "INVALID_SAVE_WORLD", message: replayErr };
  const replayed = replayElectionCount(election);
  if (election.type === "presidential") {
    if (election.winnerIds.length !== 1 || election.seats !== 1) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} presidential winners`,
      };
    }
    if (replayed.method !== "irv" || replayed.elected !== election.winnerIds[0]) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} winnerIds tamper` };
    }
  } else {
    if (election.winnerIds.length !== election.seats) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} wrong seat count` };
    }
    if (new Set(election.winnerIds).size !== election.winnerIds.length) {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} duplicate winners` };
    }
    if (replayed.method !== "stv") {
      return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} archive method` };
    }
    const elected = new Set(replayed.elected);
    if (
      elected.size !== election.winnerIds.length ||
      election.winnerIds.some((id) => !elected.has(id))
    ) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} STV winners mismatch`,
      };
    }
  }
  const result = historyEvent(state, election.resultEventId);
  if (!result) {
    return { code: "INVALID_SAVE_WORLD", message: `election ${election.id} result event missing` };
  }
  const expectedType =
    election.type === "presidential" ? "PRESIDENTIAL_ELECTION_RESULT" : "ASSEMBLY_ELECTION_RESULT";
  if (result.type !== expectedType || result.date !== election.date) {
    return {
      code: "INVALID_SAVE_WORLD",
      message: `election ${election.id} result event type/date`,
    };
  }
  if (payloadElectionId(result.payload) !== election.id) {
    return {
      code: "INVALID_SAVE_WORLD",
      message: `election ${election.id} result event payload`,
    };
  }
  if (election.type === "presidential") {
    if (result.payload.winnerId !== election.winnerIds[0]) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `election ${election.id} result winner payload`,
      };
    }
  }
  return null;
}

export function validateElectoralAgainstWorld(
  state: SimState,
  world: KernelWorld,
): CommandError | null {
  for (const [partyId, shift] of Object.entries(state.electoralEnvironment.nationalPartyShift)) {
    if (!isElectoralAggregatePartyId(world, state, partyId) || !finiteShift(shift)) {
      return { code: "INVALID_SAVE_WORLD", message: `nationalPartyShift ${partyId}` };
    }
  }
  for (const [cid, inner] of Object.entries(state.electoralEnvironment.constituencyPartyShift)) {
    if (
      !world.constituencyElectorate[cid] &&
      Object.keys(world.constituencyElectorate).length > 0
    ) {
      return { code: "INVALID_SAVE_WORLD", message: `unknown constituency environment ${cid}` };
    }
    for (const [partyId, shift] of Object.entries(inner)) {
      if (!isElectoralAggregatePartyId(world, state, partyId) || !finiteShift(shift)) {
        return { code: "INVALID_SAVE_WORLD", message: `constituencyPartyShift ${cid}.${partyId}` };
      }
    }
  }
  for (const [issueId, shift] of Object.entries(state.electoralEnvironment.issueClimateShift)) {
    if (world.issueIds.length > 0 && !world.issueIds.includes(issueId)) {
      return { code: "INVALID_SAVE_WORLD", message: `unknown issueClimateShift ${issueId}` };
    }
    if (!finiteShift(shift)) {
      return { code: "INVALID_SAVE_WORLD", message: `issueClimateShift ${issueId}` };
    }
  }
  for (const poll of Object.values(state.polls)) {
    if (!world.pollsters[poll.pollsterId] && Object.keys(world.pollsters).length > 0) {
      return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} unknown pollster` };
    }
    if (compareIsoDate(poll.fieldStart, world.scenarioStartDate) < 0) {
      return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} fieldStart before scenario` };
    }
    if (compareIsoDate(poll.publicationDate, state.currentDate) > 0) {
      return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} published in the future` };
    }
    if (poll.electionId && !state.elections[poll.electionId]) {
      return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} election does not resolve` };
    }
    if (poll.constituencyId && !world.constituencyElectorate[poll.constituencyId]) {
      if (Object.keys(world.constituencyElectorate).length > 0) {
        return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} unknown constituency` };
      }
    }
    for (const row of poll.candidateSnapshot) {
      if (!state.politicians[row.politicianId]) {
        return {
          code: "INVALID_SAVE_WORLD",
          message: `poll ${poll.id} unknown snapshot politician`,
        };
      }
      if (
        row.partyId &&
        row.partyId !== world.independentAggregatePartyId &&
        !isElectoralAggregatePartyId(world, state, row.partyId)
      ) {
        return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} snapshot party` };
      }
    }
    for (const [partyId, v] of Object.entries(poll.houseEffectApplied)) {
      if (!isElectoralAggregatePartyId(world, state, partyId) || !Number.isFinite(v)) {
        return { code: "INVALID_SAVE_WORLD", message: `poll ${poll.id} house effect party` };
      }
    }
  }
  for (const election of Object.values(state.elections)) {
    if (election.status === "resolved") {
      const err = resolvedElectionWorldError(election, state, world);
      if (err) return err;
    } else {
      for (const c of Object.values(election.candidates)) {
        const pol = state.politicians[c.politicianId];
        if (!pol) {
          return {
            code: "INVALID_SAVE_WORLD",
            message: `election ${election.id} unknown candidate`,
          };
        }
        if (!c.withdrawn && election.status !== "cancelled") {
          if (!pol.alive || pol.retired) {
            return {
              code: "INVALID_SAVE_WORLD",
              message: `unresolved election ${election.id} candidate ${c.politicianId} is not currently eligible`,
            };
          }
        }
      }
    }
  }
  const seenSource = new Set<string>();
  for (const rec of Object.values(state.domainResolutions)) {
    if (seenSource.has(rec.sourceScheduledEventId)) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `duplicate domain resolution for ${rec.sourceScheduledEventId}`,
      };
    }
    seenSource.add(rec.sourceScheduledEventId);
    const dresErr = domainResolutionEvidenceError(state, rec);
    if (dresErr) return { code: "INVALID_SAVE_WORLD", message: dresErr };
  }
  return null;
}

export function processedResolutionSatisfied(state: SimState, scheduledEventId: string): boolean {
  const pending = state.pendingInterrupt;
  if (
    pending &&
    pending.kind === "BLOCKING_DOMAIN" &&
    pending.scheduledEventId === scheduledEventId &&
    pending.resolutionStatus === "unresolved"
  ) {
    return true;
  }
  const rec = resolutionForScheduledEvent(state, scheduledEventId);
  if (!rec) return false;
  return domainResolutionEvidenceError(state, rec) == null;
}
