import { add, eq, isPositive, parseRational, ZERO } from "@lorsain/election-math";
import type { IrvResult } from "@lorsain/election-math";
import { compareIsoDate, isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import { isJsonObject, jsonSafetyError } from "../json.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import {
  isCurrentlyActiveCandidate,
  isUnresolvedContestStatus,
  politicianEligibleForContest,
} from "./lifecycle.js";
import { INDEPENDENT_AGGREGATE_ID, isSeedPresidentialStatus } from "./policy.js";
import { factionMembers, membershipPartyIds, resolvePartyDefinition } from "./queries.js";
import { contestCountReplayError } from "./replay.js";
import { presidentialNominationCycleMetadata } from "./state.js";
import {
  PARTY_PLATFORM_ISSUES,
  emptyQualificationEvidence,
  isCandidateStatus,
  isContestStatus,
  isContestType,
  isEndorsementStatus,
  isEndorserType,
  isFactionStatus,
  isNominationMethod,
  isPartyStatus,
  isSelectorKind,
  isSelectorTendency,
  type ContestCountInput,
  type ContestEntry,
  type DynamicPartyDefinition,
  type EndorsementRecord,
  type FactionState,
  type PartyContest,
  type PartyPublicPlatform,
  type PartyState,
  type QualificationEvidence,
  type SelectorGroup,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parsePublicPlatform(
  raw: unknown,
  currentDate: string,
  politicianIds: Set<string>,
): PartyPublicPlatform | string {
  if (raw == null) {
    return {
      updatedDate: currentDate,
      positions: Object.fromEntries(
        PARTY_PLATFORM_ISSUES.map((issue) => [issue, 0]),
      ) as PartyPublicPlatform["positions"],
      history: [],
    };
  }
  if (!isRecord(raw) || typeof raw.updatedDate !== "string" || !isIsoDate(raw.updatedDate)) {
    return "publicPlatform.updatedDate";
  }
  if (compareIsoDate(raw.updatedDate, currentDate) > 0)
    return "publicPlatform.updatedDate in future";
  if (!isRecord(raw.positions)) return "publicPlatform.positions";
  const positions = {} as PartyPublicPlatform["positions"];
  for (const issue of PARTY_PLATFORM_ISSUES) {
    const value = raw.positions[issue];
    if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
      return `publicPlatform.positions.${issue}`;
    }
    positions[issue] = value;
  }
  if (!Array.isArray(raw.history) || raw.history.length > 12) return "publicPlatform.history";
  const history: PartyPublicPlatform["history"] = [];
  for (const entry of raw.history) {
    if (!isRecord(entry) || typeof entry.date !== "string" || !isIsoDate(entry.date))
      return "publicPlatform.history.date";
    if (compareIsoDate(entry.date, currentDate) > 0) return "publicPlatform.history date in future";
    if (
      !["scenario_opening", "annual_conference", "leadership_change"].includes(String(entry.reason))
    ) {
      return "publicPlatform.history.reason";
    }
    if (
      entry.leaderId != null &&
      (typeof entry.leaderId !== "string" || !politicianIds.has(entry.leaderId))
    ) {
      return "publicPlatform.history.leaderId";
    }
    if (!isRecord(entry.positions)) return "publicPlatform.history.positions";
    const snapshot = {} as PartyPublicPlatform["positions"];
    for (const issue of PARTY_PLATFORM_ISSUES) {
      const value = entry.positions[issue];
      if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
        return `publicPlatform.history.positions.${issue}`;
      }
      snapshot[issue] = value;
    }
    history.push({
      date: entry.date,
      reason: entry.reason as PartyPublicPlatform["history"][number]["reason"],
      leaderId: entry.leaderId == null ? null : entry.leaderId,
      positions: snapshot,
    });
  }
  return { updatedDate: raw.updatedDate, positions, history };
}

const EVIDENCE_KEYS = [
  "memberNominationRequirementSatisfied",
  "provincialSupportRequirementSatisfied",
] as const;

function parsePositiveRational(raw: unknown, label: string): string | null {
  if (typeof raw !== "string") return `${label} must be a rational string`;
  try {
    const r = parseRational(raw);
    if (!isPositive(r)) return `${label} must be a strictly positive rational`;
    return null;
  } catch {
    return `${label} is not a valid rational`;
  }
}

function parseNonNegativeRational(raw: unknown, label: string): string | null {
  if (typeof raw !== "string") return `${label} must be a rational string`;
  try {
    const r = parseRational(raw);
    if (r.num < 0n) return `${label} must be a non-negative rational`;
    return null;
  } catch {
    return `${label} is not a valid rational`;
  }
}

function parseSeedPresidentialStatus(
  raw: unknown,
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  if (!isSeedPresidentialStatus(raw)) {
    return { ok: false, error: `${label} must be null or a recognized seed status` };
  }
  return { ok: true, value: raw };
}

function parseEvidence(raw: unknown, label: string): QualificationEvidence | string {
  if (raw == null) return emptyQualificationEvidence();
  if (!isRecord(raw)) return `${label} must be an object`;
  for (const key of Object.keys(raw)) {
    if (!(EVIDENCE_KEYS as readonly string[]).includes(key)) {
      return `${label} unknown field ${key}`;
    }
  }
  const out = emptyQualificationEvidence();
  for (const key of EVIDENCE_KEYS) {
    if (key in raw) {
      if (typeof raw[key] !== "boolean") return `${label}.${key} must be boolean`;
      out[key] = raw[key] as boolean;
    }
  }
  return out;
}

function parseStringArray(raw: unknown, label: string): string[] | string {
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || x.length === 0)) {
    return `${label} must be an array of nonempty strings`;
  }
  return raw as string[];
}

function parseCountInput(raw: unknown, label: string): ContestCountInput | string {
  if (!isRecord(raw)) return `${label} must be an object`;
  const candidateIds = parseStringArray(raw.candidateIds, `${label}.candidateIds`);
  if (typeof candidateIds === "string") return candidateIds;
  if (!Array.isArray(raw.ballots)) return `${label}.ballots must be an array`;
  const ballots: ContestCountInput["ballots"] = [];
  const ids = new Set<string>();
  for (const [i, b] of raw.ballots.entries()) {
    if (!isRecord(b) || typeof b.id !== "string" || b.id.length === 0) {
      return `${label}.ballots[${i}] id`;
    }
    if (ids.has(b.id)) return `${label} duplicate ballot group ${b.id}`;
    ids.add(b.id);
    const wErr = parsePositiveRational(b.weight, `${label}.ballots[${i}].weight`);
    if (wErr) return wErr;
    const rankings = parseStringArray(b.rankings, `${label}.ballots[${i}].rankings`);
    if (typeof rankings === "string") return rankings;
    ballots.push({ id: b.id, weight: b.weight as string, rankings });
  }
  return { candidateIds, ballots };
}

function selectorCountCorrespondence(
  selectorSummary: SelectorGroup[],
  countInput: ContestCountInput,
  label: string,
): string | null {
  if (selectorSummary.length === 0 || countInput.ballots.length === 0) {
    return `${label} resolved contest requires nonempty selectorSummary and countInput`;
  }
  let selectorWeight = ZERO;
  for (const group of selectorSummary) {
    selectorWeight = add(selectorWeight, parseRational(group.weight));
  }
  let ballotWeight = ZERO;
  for (const ballot of countInput.ballots) {
    ballotWeight = add(ballotWeight, parseRational(ballot.weight));
  }
  if (!eq(selectorWeight, ballotWeight)) {
    return `${label} selectorSummary and countInput total weights differ`;
  }
  return null;
}

function parseRationalMap(raw: unknown, label: string): Record<string, string> | string {
  if (!isRecord(raw)) return `${label} must be an object`;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const err = parseNonNegativeRational(v, `${label}.${k}`);
    if (err) return err;
    out[k] = v as string;
  }
  return out;
}

function parseIrvResult(raw: unknown, label: string): IrvResult | string {
  if (!isRecord(raw)) return `${label} must be an object`;
  if (raw.method !== "irv") return `${label}.method must be irv`;
  const candidateIds = parseStringArray(raw.candidateIds, `${label}.candidateIds`);
  if (typeof candidateIds === "string") return candidateIds;
  if (typeof raw.elected !== "string" || !candidateIds.includes(raw.elected)) {
    return `${label}.elected must resolve in candidate set`;
  }
  const tv = parsePositiveRational(raw.totalValid, `${label}.totalValid`);
  if (tv) return tv;
  const ex = parseNonNegativeRational(raw.exhausted, `${label}.exhausted`);
  if (ex) return ex;
  if (typeof raw.excludedBallotCount !== "number" || !Number.isInteger(raw.excludedBallotCount)) {
    return `${label}.excludedBallotCount`;
  }
  if (
    typeof raw.excludedBallotGroupCount !== "number" ||
    !Number.isInteger(raw.excludedBallotGroupCount)
  ) {
    return `${label}.excludedBallotGroupCount`;
  }
  const ekw = parseNonNegativeRational(raw.excludedKnownWeight, `${label}.excludedKnownWeight`);
  if (ekw) return ekw;
  if (typeof raw.unknownWeightGroups !== "number" || !Number.isInteger(raw.unknownWeightGroups)) {
    return `${label}.unknownWeightGroups`;
  }
  if (!isRecord(raw.excludedByReason)) return `${label}.excludedByReason`;
  const eliminated = parseStringArray(raw.eliminated, `${label}.eliminated`);
  if (typeof eliminated === "string") return eliminated;
  const firstPreferences = parseRationalMap(raw.firstPreferences, `${label}.firstPreferences`);
  if (typeof firstPreferences === "string") return firstPreferences;
  if (!Array.isArray(raw.rounds) || raw.rounds.length < 1) return `${label}.rounds`;
  const rounds: IrvResult["rounds"] = [];
  for (const [i, roundRaw] of raw.rounds.entries()) {
    if (!isRecord(roundRaw)) return `${label}.rounds[${i}]`;
    if (typeof roundRaw.round !== "number" || !Number.isInteger(roundRaw.round)) {
      return `${label}.rounds[${i}].round`;
    }
    if (roundRaw.action !== "elect" && roundRaw.action !== "eliminate") {
      return `${label}.rounds[${i}].action`;
    }
    const before = parseRationalMap(roundRaw.totalsBefore, `${label}.rounds[${i}].totalsBefore`);
    if (typeof before === "string") return before;
    const after = parseRationalMap(roundRaw.totalsAfter, `${label}.rounds[${i}].totalsAfter`);
    if (typeof after === "string") return after;
    const cd = parsePositiveRational(
      roundRaw.continuingDenominator,
      `${label}.rounds[${i}].continuingDenominator`,
    );
    if (cd) return cd;
    const mt = parsePositiveRational(
      roundRaw.majorityThreshold,
      `${label}.rounds[${i}].majorityThreshold`,
    );
    if (mt) return mt;
    const ne = parseNonNegativeRational(
      roundRaw.newlyExhausted,
      `${label}.rounds[${i}].newlyExhausted`,
    );
    if (ne) return ne;
    const et = parseNonNegativeRational(
      roundRaw.exhaustedTotal,
      `${label}.rounds[${i}].exhaustedTotal`,
    );
    if (et) return et;
    if (!Array.isArray(roundRaw.transfers)) return `${label}.rounds[${i}].transfers`;
    if (roundRaw.action === "elect") {
      if (typeof roundRaw.electedId !== "string") return `${label}.rounds[${i}].electedId`;
    } else if (typeof roundRaw.eliminatedId !== "string") {
      return `${label}.rounds[${i}].eliminatedId`;
    }
    if (roundRaw.tieResolution != null) {
      if (!isRecord(roundRaw.tieResolution)) return `${label}.rounds[${i}].tieResolution`;
      if (typeof roundRaw.tieResolution.chosenId !== "string") {
        return `${label}.rounds[${i}].tieResolution.chosenId`;
      }
      if (roundRaw.tieResolution.lot != null) {
        if (!isRecord(roundRaw.tieResolution.lot)) return `${label}.rounds[${i}].lot`;
        if (
          !Array.isArray(roundRaw.tieResolution.lot.draws) ||
          roundRaw.tieResolution.lot.draws.some(
            (d) => typeof d !== "number" || !Number.isInteger(d),
          )
        ) {
          return `${label}.rounds[${i}].lot.draws`;
        }
      }
    }
    rounds.push(roundRaw as IrvResult["rounds"][number]);
  }
  return {
    method: "irv",
    candidateIds,
    totalValid: raw.totalValid as string,
    excludedBallotCount: raw.excludedBallotCount,
    excludedBallotGroupCount: raw.excludedBallotGroupCount,
    excludedKnownWeight: raw.excludedKnownWeight as string,
    unknownWeightGroups: raw.unknownWeightGroups,
    excludedByReason: raw.excludedByReason as IrvResult["excludedByReason"],
    elected: raw.elected,
    eliminated,
    exhausted: raw.exhausted as string,
    rounds,
    firstPreferences,
  };
}

function parseSelectorGroup(
  raw: unknown,
  contestPartyId: string,
  label: string,
  seen: Set<string>,
): SelectorGroup | string {
  if (!isRecord(raw)) return `${label} must be an object`;
  if (typeof raw.id !== "string" || raw.id.length === 0) return `${label}.id`;
  if (seen.has(raw.id)) return `${label} duplicate selector group ${raw.id}`;
  seen.add(raw.id);
  if (typeof raw.kind !== "string" || !isSelectorKind(raw.kind)) return `${label}.kind`;
  if (typeof raw.partyId !== "string" || raw.partyId !== contestPartyId) {
    return `${label}.partyId must equal contest party`;
  }
  if (raw.factionId != null && typeof raw.factionId !== "string") return `${label}.factionId`;
  if (raw.provinceId != null && typeof raw.provinceId !== "string") return `${label}.provinceId`;
  if (
    raw.tendency != null &&
    (typeof raw.tendency !== "string" || !isSelectorTendency(raw.tendency))
  ) {
    return `${label}.tendency`;
  }
  const wErr = parsePositiveRational(raw.weight, `${label}.weight`);
  if (wErr) return wErr;
  return {
    id: raw.id,
    kind: raw.kind,
    partyId: raw.partyId,
    factionId: raw.factionId == null ? null : raw.factionId,
    provinceId: raw.provinceId == null ? null : raw.provinceId,
    tendency: raw.tendency == null ? null : raw.tendency,
    weight: raw.weight as string,
  };
}

export type ParsedPartyRuntime = {
  partyStates: SimState["partyStates"];
  factionStates: SimState["factionStates"];
  endorsements: SimState["endorsements"];
  partyContests: SimState["partyContests"];
  dynamicParties: SimState["dynamicParties"];
};

export function parsePartyRuntime(
  raw: Record<string, unknown>,
  args: {
    politicianIds: Set<string>;
    scenarioStartDate: string;
    currentDate: string;
  },
): ParsedPartyRuntime | string {
  if (!isRecord(raw.partyStates)) return "partyStates must be an object";
  if (!isRecord(raw.factionStates)) return "factionStates must be an object";
  if (!isRecord(raw.endorsements)) return "endorsements must be an object";
  if (!isRecord(raw.partyContests)) return "partyContests must be an object";
  if (!isRecord(raw.dynamicParties)) return "dynamicParties must be an object";

  const dynamicParties: Record<string, DynamicPartyDefinition> = {};
  for (const [id, rec] of Object.entries(raw.dynamicParties)) {
    if (!isRecord(rec)) return `dynamicParties.${id} must be an object`;
    if (rec.partyId !== id) return `dynamicParties.${id} id mismatch`;
    if (parseCanonicalAllocatedId("DPARTY", id) == null) {
      return `dynamicParties.${id} id must be DPARTY followed by a positive integer`;
    }
    if (typeof rec.name !== "string" || rec.name.trim() === "") {
      return `dynamicParties.${id} name`;
    }
    if (typeof rec.short !== "string" || rec.short.trim() === "") {
      return `dynamicParties.${id} short`;
    }
    if (typeof rec.originPartyId !== "string" || rec.originPartyId.length === 0) {
      return `dynamicParties.${id} originPartyId`;
    }
    if (typeof rec.nominationRuleId !== "string" || rec.nominationRuleId.length === 0) {
      return `dynamicParties.${id} nominationRuleId`;
    }
    if (rec.originFactionId != null && typeof rec.originFactionId !== "string") {
      return `dynamicParties.${id} originFactionId`;
    }
    if (!isIsoDate(rec.createdDate)) return `dynamicParties.${id} createdDate`;
    if (compareIsoDate(rec.createdDate, args.scenarioStartDate) < 0) {
      return `dynamicParties.${id} createdDate before scenarioStartDate`;
    }
    if (compareIsoDate(rec.createdDate, args.currentDate) > 0) {
      return `dynamicParties.${id} createdDate after currentDate`;
    }
    dynamicParties[id] = {
      partyId: id,
      name: rec.name,
      short: rec.short,
      originPartyId: rec.originPartyId,
      originFactionId: rec.originFactionId == null ? null : rec.originFactionId,
      nominationRuleId: rec.nominationRuleId,
      createdDate: rec.createdDate,
    };
  }

  const partyStates: Record<string, PartyState> = {};
  for (const [id, rec] of Object.entries(raw.partyStates)) {
    if (!isRecord(rec)) return `partyStates.${id} must be an object`;
    if (rec.partyId !== id) return `partyStates.${id} id mismatch`;
    if (id === INDEPENDENT_AGGREGATE_ID) return "PARTY_IND cannot have PartyState";
    if (typeof rec.status !== "string" || !isPartyStatus(rec.status)) {
      return `partyStates.${id} invalid status`;
    }
    if (
      typeof rec.cohesion !== "number" ||
      !Number.isFinite(rec.cohesion) ||
      rec.cohesion < 0 ||
      rec.cohesion > 1
    ) {
      return `partyStates.${id} cohesion`;
    }
    if (
      rec.leaderId != null &&
      (typeof rec.leaderId !== "string" || !args.politicianIds.has(rec.leaderId))
    ) {
      return `partyStates.${id} leader does not resolve`;
    }
    if (rec.status === "leadership_vacant" && rec.leaderId != null) {
      return `partyStates.${id} leadership_vacant requires null leaderId`;
    }
    if (rec.status === "active" && rec.leaderId == null) {
      return `partyStates.${id} active requires leaderId`;
    }
    const publicPlatform = parsePublicPlatform(
      rec.publicPlatform,
      args.currentDate,
      args.politicianIds,
    );
    if (typeof publicPlatform === "string") return `partyStates.${id}.${publicPlatform}`;
    partyStates[id] = {
      partyId: id,
      leaderId: rec.leaderId == null ? null : rec.leaderId,
      status: rec.status,
      cohesion: rec.cohesion,
      publicPlatform,
    };
  }

  const factionStates: Record<string, FactionState> = {};
  for (const [id, rec] of Object.entries(raw.factionStates)) {
    if (!isRecord(rec)) return `factionStates.${id} must be an object`;
    if (rec.factionId !== id) return `factionStates.${id} id mismatch`;
    if (typeof rec.partyId !== "string") return `factionStates.${id} partyId`;
    if (typeof rec.status !== "string" || !isFactionStatus(rec.status)) {
      return `factionStates.${id} invalid status`;
    }
    if (
      typeof rec.cohesion !== "number" ||
      !Number.isFinite(rec.cohesion) ||
      rec.cohesion < 0 ||
      rec.cohesion > 1
    ) {
      return `factionStates.${id} cohesion`;
    }
    if (
      rec.chairId != null &&
      (typeof rec.chairId !== "string" || !args.politicianIds.has(rec.chairId))
    ) {
      return `factionStates.${id} chair does not resolve`;
    }
    if (rec.status === "chair_vacant" && rec.chairId != null) {
      return `factionStates.${id} chair_vacant requires null chairId`;
    }
    if (rec.status === "active" && rec.chairId == null) {
      return `factionStates.${id} active requires chairId`;
    }
    if (rec.status === "split_origin" && rec.chairId != null) {
      return `factionStates.${id} split_origin requires null chairId`;
    }
    factionStates[id] = {
      factionId: id,
      partyId: rec.partyId,
      chairId: rec.chairId == null ? null : rec.chairId,
      status: rec.status,
      cohesion: rec.cohesion,
    };
  }

  const partyContests: Record<string, PartyContest> = {};
  for (const [id, rec] of Object.entries(raw.partyContests)) {
    if (!isRecord(rec)) return `partyContests.${id} must be an object`;
    if (rec.id !== id) return `partyContests.${id} id mismatch`;
    if (parseCanonicalAllocatedId("CONTEST", id) == null) {
      return `partyContests.${id} id must be CONTEST followed by a positive integer`;
    }
    if (typeof rec.type !== "string" || !isContestType(rec.type)) return `partyContests.${id} type`;
    if (typeof rec.partyId !== "string") return `partyContests.${id} partyId`;
    if (typeof rec.ruleId !== "string") return `partyContests.${id} ruleId`;
    if (typeof rec.status !== "string" || !isContestStatus(rec.status)) {
      return `partyContests.${id} status`;
    }
    if (!isIsoDate(rec.createdDate)) return `partyContests.${id} createdDate`;
    if (compareIsoDate(rec.createdDate, args.scenarioStartDate) < 0) {
      return `partyContests.${id} createdDate before scenarioStartDate`;
    }
    if (compareIsoDate(rec.createdDate, args.currentDate) > 0) {
      return `partyContests.${id} createdDate after currentDate`;
    }
    if (rec.openedDate != null && !isIsoDate(rec.openedDate))
      return `partyContests.${id} openedDate`;
    if (rec.resolvedDate != null && !isIsoDate(rec.resolvedDate))
      return `partyContests.${id} resolvedDate`;
    if (rec.openedDate && compareIsoDate(rec.openedDate, args.scenarioStartDate) < 0) {
      return `partyContests.${id} openedDate before scenarioStartDate`;
    }
    if (rec.openedDate && compareIsoDate(rec.openedDate, args.currentDate) > 0) {
      return `partyContests.${id} openedDate after currentDate`;
    }
    if (rec.resolvedDate && compareIsoDate(rec.resolvedDate, args.scenarioStartDate) < 0) {
      return `partyContests.${id} resolvedDate before scenarioStartDate`;
    }
    if (rec.resolvedDate && compareIsoDate(rec.resolvedDate, args.currentDate) > 0) {
      return `partyContests.${id} resolvedDate after currentDate`;
    }
    if (rec.openedDate && compareIsoDate(rec.createdDate, rec.openedDate) > 0) {
      return `partyContests.${id} createdDate after openedDate`;
    }
    if (
      rec.resolvedDate &&
      rec.openedDate &&
      compareIsoDate(rec.openedDate, rec.resolvedDate) > 0
    ) {
      return `partyContests.${id} openedDate after resolvedDate`;
    }
    if (rec.resolvedDate && compareIsoDate(rec.createdDate, rec.resolvedDate) > 0) {
      return `partyContests.${id} createdDate after resolvedDate`;
    }
    if (rec.type === "faction_chair") {
      if (typeof rec.factionId !== "string" || rec.factionId.length === 0) {
        return `partyContests.${id} faction-chair requires factionId`;
      }
    } else if (rec.factionId != null) {
      return `partyContests.${id} factionId only valid for faction-chair contests`;
    }
    if (rec.type === "party_leadership" || rec.type === "faction_chair") {
      if (!isJsonObject(rec.metadata)) return `partyContests.${id} metadata`;
      const method = rec.metadata.selectorMethod;
      if (typeof method !== "string" || !isNominationMethod(method) || method === "none") {
        return `partyContests.${id} requires explicit selectorMethod`;
      }
      if (rec.ruleId !== "") {
        return `partyContests.${id} generic contest must not carry a presidential ruleId`;
      }
      if (method === "weighted_ranked_choice") {
        const mw = rec.metadata.memberWeight;
        const uw = rec.metadata.affiliateUnionDelegateWeight;
        if (
          typeof mw !== "number" ||
          typeof uw !== "number" ||
          !Number.isFinite(mw) ||
          !Number.isFinite(uw) ||
          mw < 0 ||
          uw < 0 ||
          mw + uw <= 0
        ) {
          return `partyContests.${id} generic weighted_ranked_choice requires explicit selector weights`;
        }
      }
    }
    if (!isRecord(rec.entries)) return `partyContests.${id} entries`;
    const entries: Record<string, ContestEntry> = {};
    let winnerEntries = 0;
    for (const [pid, entryRaw] of Object.entries(rec.entries)) {
      if (!isRecord(entryRaw)) return `partyContests.${id}.entries.${pid}`;
      if (entryRaw.politicianId !== pid || !args.politicianIds.has(pid)) {
        return `partyContests.${id} candidate ${pid} does not resolve`;
      }
      if (typeof entryRaw.status !== "string" || !isCandidateStatus(entryRaw.status)) {
        return `partyContests.${id} candidate ${pid} status`;
      }
      if (entryRaw.declaredDate != null && !isIsoDate(entryRaw.declaredDate)) {
        return `partyContests.${id} candidate ${pid} declaredDate`;
      }
      if (entryRaw.declaredDate) {
        if (compareIsoDate(entryRaw.declaredDate, args.scenarioStartDate) < 0) {
          return `partyContests.${id} candidate ${pid} declaredDate before scenarioStartDate`;
        }
        if (compareIsoDate(entryRaw.declaredDate, args.currentDate) > 0) {
          return `partyContests.${id} candidate ${pid} declaredDate after currentDate`;
        }
        if (compareIsoDate(entryRaw.declaredDate, rec.createdDate) < 0) {
          return `partyContests.${id} candidate ${pid} declaredDate before contest createdDate`;
        }
        if (rec.resolvedDate && compareIsoDate(entryRaw.declaredDate, rec.resolvedDate) > 0) {
          return `partyContests.${id} candidate ${pid} declaredDate after contest resolvedDate`;
        }
      }
      const evidence = parseEvidence(
        entryRaw.qualificationEvidence,
        `partyContests.${id}.entries.${pid}.qualificationEvidence`,
      );
      if (typeof evidence === "string") return evidence;
      const seed = parseSeedPresidentialStatus(
        entryRaw.seedPresidentialStatus,
        `partyContests.${id} candidate ${pid} seedPresidentialStatus`,
      );
      if (!seed.ok) return seed.error;
      if (entryRaw.status === "winner") winnerEntries += 1;
      entries[pid] = {
        politicianId: pid,
        status: entryRaw.status,
        declaredDate: entryRaw.declaredDate == null ? null : entryRaw.declaredDate,
        qualificationEvidence: evidence,
        seedPresidentialStatus: seed.value,
      };
    }
    if (rec.status === "planned") {
      if (rec.openedDate != null || rec.resolvedDate != null || rec.winnerId != null) {
        return `partyContests.${id} planned contest has opened/resolved/winner`;
      }
      if (rec.countArchive != null || rec.countInput != null) {
        return `partyContests.${id} planned contest has count archive`;
      }
    }
    if (rec.status === "open" || rec.status === "qualification" || rec.status === "voting") {
      if (rec.openedDate == null || rec.resolvedDate != null || rec.winnerId != null) {
        return `partyContests.${id} open contest lifecycle`;
      }
      if (rec.countArchive != null || rec.countInput != null) {
        return `partyContests.${id} unfinished contest has count archive`;
      }
    }
    if (rec.status === "resolved") {
      if (rec.openedDate == null || rec.resolvedDate == null || typeof rec.winnerId !== "string") {
        return `partyContests.${id} resolved contest requires openedDate, resolvedDate, winnerId`;
      }
      if (winnerEntries !== 1)
        return `partyContests.${id} resolved contest needs exactly one winner entry`;
      if (entries[rec.winnerId]?.status !== "winner") {
        return `partyContests.${id} winner entry status`;
      }
      if (rec.countArchive == null || rec.countInput == null) {
        return `partyContests.${id} resolved count-based contest requires countInput and countArchive`;
      }
    }
    if (rec.status === "cancelled") {
      if (rec.winnerId != null) {
        return `partyContests.${id} cancelled contest cannot have a winner`;
      }
      if (winnerEntries !== 0) {
        return `partyContests.${id} cancelled contest cannot have a winner entry`;
      }
      if (rec.countArchive != null || rec.countInput != null) {
        return `partyContests.${id} cancelled contest has count archive`;
      }
    }
    if (rec.winnerId != null) {
      if (typeof rec.winnerId !== "string" || !entries[rec.winnerId]) {
        return `partyContests.${id} winner is not in candidate set`;
      }
    }
    const selectorSummary: SelectorGroup[] = [];
    if (rec.selectorSummary != null) {
      if (!Array.isArray(rec.selectorSummary)) return `partyContests.${id} selectorSummary`;
      const seen = new Set<string>();
      for (const [i, g] of rec.selectorSummary.entries()) {
        const parsed = parseSelectorGroup(
          g,
          rec.partyId,
          `partyContests.${id}.selectorSummary[${i}]`,
          seen,
        );
        if (typeof parsed === "string") return parsed;
        selectorSummary.push(parsed);
      }
    }
    let countArchive: PartyContest["countArchive"] = null;
    if (rec.countArchive != null) {
      const parsed = parseIrvResult(rec.countArchive, `partyContests.${id}.countArchive`);
      if (typeof parsed === "string") return parsed;
      if (rec.winnerId && parsed.elected !== rec.winnerId) {
        return `partyContests.${id} archive elected mismatch`;
      }
      countArchive = parsed;
    }
    let countInput: PartyContest["countInput"] = null;
    if (rec.countInput != null) {
      const parsed = parseCountInput(rec.countInput, `partyContests.${id}.countInput`);
      if (typeof parsed === "string") return parsed;
      countInput = parsed;
    }
    if (rec.status === "resolved") {
      if (!countInput || !countArchive) {
        return `partyContests.${id} resolved count-based contest requires countInput and countArchive`;
      }
      const corr = selectorCountCorrespondence(selectorSummary, countInput, `partyContests.${id}`);
      if (corr) return corr;
      if (!countInput.candidateIds.includes(rec.winnerId as string)) {
        return `partyContests.${id} winner is not in countInput.candidateIds`;
      }
      for (const pid of countInput.candidateIds) {
        const entry = entries[pid];
        if (!entry) return `partyContests.${id} counted candidate ${pid} missing entry`;
        if (pid === rec.winnerId) {
          if (entry.status !== "winner") return `partyContests.${id} counted winner not finalized`;
        } else if (entry.status !== "eliminated") {
          return `partyContests.${id} counted nonwinner ${pid} must be eliminated`;
        }
      }
    }
    if (!isJsonObject(rec.metadata)) return `partyContests.${id} metadata`;
    const jsonErr = jsonSafetyError(rec.metadata, `partyContests.${id}.metadata`);
    if (jsonErr) return jsonErr;
    partyContests[id] = {
      id,
      type: rec.type,
      partyId: rec.partyId,
      factionId: rec.factionId == null ? null : String(rec.factionId),
      ruleId: rec.ruleId,
      status: rec.status,
      createdDate: rec.createdDate,
      openedDate: rec.openedDate == null ? null : rec.openedDate,
      resolvedDate: rec.resolvedDate == null ? null : rec.resolvedDate,
      entries,
      winnerId: rec.winnerId == null ? null : rec.winnerId,
      selectorSummary,
      countInput,
      countArchive,
      metadata: rec.metadata,
    };
  }

  const endorsements: Record<string, EndorsementRecord> = {};
  const activeKey = new Set<string>();
  for (const [id, rec] of Object.entries(raw.endorsements)) {
    if (!isRecord(rec)) return `endorsements.${id} must be an object`;
    if (rec.id !== id) return `endorsements.${id} id mismatch`;
    if (parseCanonicalAllocatedId("END", id) == null) {
      return `endorsements.${id} id must be END followed by a positive integer`;
    }
    if (typeof rec.endorserType !== "string" || !isEndorserType(rec.endorserType)) {
      return `endorsements.${id} endorserType`;
    }
    if (typeof rec.endorserId !== "string" || typeof rec.targetId !== "string") {
      return `endorsements.${id} endorser/target`;
    }
    if (typeof rec.contestId !== "string" || !partyContests[rec.contestId]) {
      return `endorsements.${id} contest does not resolve`;
    }
    if (rec.endorserType === "politician" && !args.politicianIds.has(rec.endorserId)) {
      return `endorsements.${id} endorser does not resolve`;
    }
    if (!args.politicianIds.has(rec.targetId)) return `endorsements.${id} target does not resolve`;
    if (typeof rec.status !== "string" || !isEndorsementStatus(rec.status)) {
      return `endorsements.${id} status`;
    }
    if (!partyContests[rec.contestId]!.entries[rec.targetId]) {
      return `endorsements.${id} target is not a contest candidate`;
    }
    const host = partyContests[rec.contestId]!;
    if (rec.status === "active" && (host.status === "resolved" || host.status === "cancelled")) {
      return `endorsements.${id} active endorsement in closed contest`;
    }
    if (!isIsoDate(rec.date)) return `endorsements.${id} date`;
    if (compareIsoDate(rec.date, args.scenarioStartDate) < 0) {
      return `endorsements.${id} date before scenarioStartDate`;
    }
    if (compareIsoDate(rec.date, args.currentDate) > 0)
      return `endorsements.${id} date after currentDate`;
    if (compareIsoDate(rec.date, host.createdDate) < 0) {
      return `endorsements.${id} date before contest createdDate`;
    }
    if (host.resolvedDate && compareIsoDate(rec.date, host.resolvedDate) > 0) {
      return `endorsements.${id} date after contest resolvedDate`;
    }
    if (typeof rec.public !== "boolean") return `endorsements.${id} public`;
    if (!isJsonObject(rec.metadata)) return `endorsements.${id} metadata`;
    if (rec.status === "active") {
      const key = `${rec.endorserType}|${rec.endorserId}|${rec.contestId}`;
      if (activeKey.has(key)) return `endorsements duplicate active endorsement ${key}`;
      activeKey.add(key);
    }
    endorsements[id] = {
      id,
      endorserType: rec.endorserType,
      endorserId: rec.endorserId,
      targetId: rec.targetId,
      contestId: rec.contestId,
      date: rec.date,
      status: rec.status,
      public: rec.public,
      metadata: rec.metadata,
    };
  }

  return { partyStates, factionStates, endorsements, partyContests, dynamicParties };
}

export function partyCounterError(
  runtime: ParsedPartyRuntime,
  counters: {
    nextEndorsementId: number;
    nextPartyContestId: number;
    nextDynamicPartyId: number;
  },
): string | null {
  let maxE = 0;
  for (const id of Object.keys(runtime.endorsements)) {
    maxE = Math.max(maxE, parseCanonicalAllocatedId("END", id) ?? 0);
  }
  if (counters.nextEndorsementId <= maxE)
    return "nextEndorsementId does not exceed allocated END ids";
  let maxC = 0;
  for (const id of Object.keys(runtime.partyContests)) {
    maxC = Math.max(maxC, parseCanonicalAllocatedId("CONTEST", id) ?? 0);
  }
  if (counters.nextPartyContestId <= maxC) {
    return "nextPartyContestId does not exceed allocated CONTEST ids";
  }
  let maxD = 0;
  for (const id of Object.keys(runtime.dynamicParties)) {
    maxD = Math.max(maxD, parseCanonicalAllocatedId("DPARTY", id) ?? 0);
  }
  if (counters.nextDynamicPartyId <= maxD) {
    return "nextDynamicPartyId does not exceed allocated DPARTY ids";
  }
  return null;
}

function worldErr(message: string): CommandError {
  return { code: "INVALID_SAVE_WORLD", message };
}

export function validatePartyAgainstWorld(
  state: SimState,
  world: KernelWorld,
): CommandError | null {
  const canonicalParties = membershipPartyIds(world);
  const expectedPartyIds = new Set([...canonicalParties, ...Object.keys(state.dynamicParties)]);
  if (
    state.partyStates[world.independentAggregatePartyId] ||
    state.partyStates[INDEPENDENT_AGGREGATE_ID]
  ) {
    return worldErr("PARTY_IND PartyState");
  }
  for (const partyId of expectedPartyIds) {
    if (!state.partyStates[partyId]) return worldErr(`missing PartyState ${partyId}`);
  }
  for (const party of Object.values(state.partyStates)) {
    if (!expectedPartyIds.has(party.partyId)) {
      return worldErr(`unknown PartyState ${party.partyId}`);
    }
    if (party.status === "active") {
      const lead = party.leaderId ? state.politicians[party.leaderId] : null;
      if (!lead || !lead.alive || lead.retired || lead.partyId !== party.partyId) {
        return worldErr(`active party ${party.partyId} leader is not a valid current member`);
      }
    }
    if (party.status === "leadership_vacant" && party.leaderId != null) {
      return worldErr(`leadership_vacant party ${party.partyId} has a leader`);
    }
  }

  const canonicalFactions = Object.keys(world.factionDefinitions);
  for (const factionId of canonicalFactions) {
    if (!state.factionStates[factionId]) return worldErr(`missing FactionState ${factionId}`);
  }
  for (const fac of Object.values(state.factionStates)) {
    const def = world.factionDefinitions[fac.factionId];
    if (!def) return worldErr(`unknown FactionState ${fac.factionId}`);
    if (def.partyId !== fac.partyId) {
      return worldErr(`faction ${fac.factionId} party linkage`);
    }
    if (fac.status === "chair_vacant" && fac.chairId != null) {
      return worldErr(`chair_vacant faction ${fac.factionId} has a chair`);
    }
    if (fac.status === "active") {
      if (!fac.chairId) return worldErr(`active faction ${fac.factionId} requires a chair`);
      const chair = state.politicians[fac.chairId];
      if (
        !chair ||
        !chair.alive ||
        chair.retired ||
        chair.factionId !== fac.factionId ||
        chair.partyId !== fac.partyId
      ) {
        return worldErr(`chair ${fac.chairId} is not a valid current faction member`);
      }
    } else if (fac.chairId) {
      const chair = state.politicians[fac.chairId];
      if (
        !chair ||
        !chair.alive ||
        chair.retired ||
        chair.factionId !== fac.factionId ||
        chair.partyId !== fac.partyId
      ) {
        return worldErr(`chair ${fac.chairId} is not a valid current faction member`);
      }
    }
    if (fac.status === "split_origin") {
      if (fac.chairId != null) {
        return worldErr(`split_origin faction ${fac.factionId} has a chair`);
      }
      if (factionMembers(state, fac.factionId).length > 0) {
        return worldErr(`split_origin faction ${fac.factionId} still has members`);
      }
    }
  }

  for (const dyn of Object.values(state.dynamicParties)) {
    if (world.partyDefinitions[dyn.partyId] || dyn.partyId === world.independentAggregatePartyId) {
      return worldErr(`dynamic party ${dyn.partyId} collides with canonical id`);
    }
    const origin =
      world.partyDefinitions[dyn.originPartyId] ?? state.dynamicParties[dyn.originPartyId];
    if (!origin) return worldErr(`dynamic party ${dyn.partyId} originPartyId does not resolve`);
    if (dyn.originFactionId) {
      const ofac = world.factionDefinitions[dyn.originFactionId];
      if (!ofac || ofac.partyId !== dyn.originPartyId) {
        return worldErr(
          `dynamic party ${dyn.partyId} originFactionId does not belong to origin party`,
        );
      }
    }
    if (!world.nominationRules[dyn.nominationRuleId]) {
      return worldErr(`dynamic party ${dyn.partyId} nominationRuleId does not resolve`);
    }
    if (!state.partyStates[dyn.partyId]) {
      return worldErr(`dynamic party ${dyn.partyId} missing PartyState`);
    }
  }

  for (const p of Object.values(state.politicians)) {
    if (p.partyId === INDEPENDENT_AGGREGATE_ID || p.partyId === world.independentAggregatePartyId) {
      return worldErr(`${p.id} uses PARTY_IND as membership`);
    }
    if (p.partyId && !resolvePartyDefinition(world, state, p.partyId)) {
      return worldErr(`${p.id} unknown party ${p.partyId}`);
    }
    if (p.factionId) {
      const fac = world.factionDefinitions[p.factionId] ?? state.factionStates[p.factionId];
      if (!fac) return worldErr(`${p.id} unknown faction ${p.factionId}`);
      const facParty = world.factionDefinitions[p.factionId]?.partyId ?? fac.partyId;
      if (facParty !== p.partyId) return worldErr(`${p.id} faction/party mismatch`);
    }
    if (!p.partyId && p.factionId) return worldErr(`${p.id} independent with faction`);
  }

  for (const contest of Object.values(state.partyContests)) {
    if (!resolvePartyDefinition(world, state, contest.partyId)) {
      return worldErr(`contest ${contest.id} unknown party`);
    }
    if (contest.type === "presidential_nomination") {
      const rule = world.nominationRules[contest.ruleId];
      if (!rule) return worldErr(`contest ${contest.id} nomination rule does not resolve`);
      if (rule.partyId !== contest.partyId && !state.dynamicParties[contest.partyId]) {
        return worldErr(`contest ${contest.id} rule/party mismatch`);
      }
      const cycle = presidentialNominationCycleMetadata(contest);
      const presidentialElections = Object.values(state.elections).filter(
        (election) => election.type === "presidential",
      );
      if (!cycle && presidentialElections.length > 0) {
        return worldErr(`contest ${contest.id} missing presidential cycle metadata`);
      }
      if (cycle) {
        const election = state.elections[cycle.electionId];
        if (
          !election ||
          election.type !== "presidential" ||
          election.date !== cycle.electionDate ||
          cycle.partyId !== contest.partyId ||
          cycle.cycleYear !== Number(election.date.slice(0, 4))
        ) {
          return worldErr(`contest ${contest.id} presidential cycle linkage`);
        }
      }
    }
    if (contest.type === "faction_chair") {
      if (!contest.factionId) return worldErr(`contest ${contest.id} missing factionId`);
      const fac = world.factionDefinitions[contest.factionId];
      if (!fac || fac.partyId !== contest.partyId) {
        return worldErr(`contest ${contest.id} faction does not belong to contest party`);
      }
    }
    for (const g of contest.selectorSummary) {
      if (g.partyId !== contest.partyId) {
        return worldErr(`contest ${contest.id} selector group wrong party`);
      }
      if (g.factionId) {
        const fac = world.factionDefinitions[g.factionId];
        if (!fac || fac.partyId !== contest.partyId) {
          return worldErr(`contest ${contest.id} selector faction invalid`);
        }
      }
      if (g.provinceId && !world.provinceIds.includes(g.provinceId)) {
        return worldErr(`contest ${contest.id} selector province ${g.provinceId} unknown`);
      }
    }
    for (const entry of Object.values(contest.entries)) {
      const pol = state.politicians[entry.politicianId];
      if (!pol) return worldErr("contest candidate missing");
      if (
        isUnresolvedContestStatus(contest.status) &&
        isCurrentlyActiveCandidate(contest, entry.status)
      ) {
        if (!pol.alive || pol.retired) {
          return worldErr(
            `contest ${contest.id} candidate ${pol.id} is dead or retired while still ${entry.status}`,
          );
        }
        if (contest.type !== "faction_chair" && pol.partyId !== contest.partyId) {
          return worldErr(`contest ${contest.id} candidate ${pol.id} wrong party`);
        }
        if (
          contest.type === "faction_chair" &&
          (pol.factionId !== contest.factionId || pol.partyId !== contest.partyId)
        ) {
          return worldErr(`contest ${contest.id} candidate ${pol.id} wrong faction`);
        }
        const fail = politicianEligibleForContest(world, state, contest, pol.id);
        if (fail) {
          return worldErr(`contest ${contest.id} candidate ${pol.id} is ineligible (${fail.code})`);
        }
      }
    }
    if (contest.status === "resolved") {
      const replayErr = contestCountReplayError(contest);
      if (replayErr) return worldErr(replayErr);
      if (!contest.countInput || !contest.countArchive) {
        return worldErr(`contest ${contest.id} resolved contest missing count archive`);
      }
      const corr = selectorCountCorrespondence(
        contest.selectorSummary,
        contest.countInput,
        `contest ${contest.id}`,
      );
      if (corr) return worldErr(corr);
      if (
        JSON.stringify([...contest.countInput.candidateIds].sort()) !==
        JSON.stringify([...contest.countArchive.candidateIds].sort())
      ) {
        return worldErr(`contest ${contest.id} count candidate set mismatch`);
      }
    }
  }

  for (const rec of Object.values(state.endorsements)) {
    const contest = state.partyContests[rec.contestId];
    if (!contest) return worldErr(`endorsement ${rec.id} contest missing`);
    const entry = contest.entries[rec.targetId];
    if (!entry) return worldErr(`endorsement ${rec.id} target is not a contest candidate`);
    if (rec.endorserType === "politician") {
      const pol = state.politicians[rec.endorserId];
      if (!pol) return worldErr(`endorsement ${rec.id} politician missing`);
      if (rec.status === "active" && (!pol.alive || pol.retired)) {
        return worldErr(`endorsement ${rec.id} active politician endorser is inactive`);
      }
    } else if (rec.endorserType === "faction") {
      const def = world.factionDefinitions[rec.endorserId];
      if (!def || def.partyId !== contest.partyId) {
        return worldErr(`endorsement ${rec.id} faction does not belong to contest party`);
      }
    } else {
      const org = world.provincialPartyOrganizations[rec.endorserId];
      if (!org || org.partyId !== contest.partyId) {
        return worldErr(`endorsement ${rec.id} provincial organization does not resolve`);
      }
      if (!world.provinceIds.includes(org.provinceId)) {
        return worldErr(`endorsement ${rec.id} organization province unknown`);
      }
    }
    if (rec.status === "active") {
      if (!isUnresolvedContestStatus(contest.status)) {
        return worldErr(`endorsement ${rec.id} still active after contest closed`);
      }
      if (!isCurrentlyActiveCandidate(contest, entry.status)) {
        return worldErr(`endorsement ${rec.id} active target is not an active candidate`);
      }
      const fail = politicianEligibleForContest(world, state, contest, rec.targetId);
      if (fail) return worldErr(`endorsement ${rec.id} target is ineligible`);
    }
  }
  return null;
}
