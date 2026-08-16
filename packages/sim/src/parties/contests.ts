import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { jsonSafetyError, type JsonObject } from "../json.js";
import { padId, pushHistory } from "../scheduler.js";
import { reviewGoals } from "../agents/goals.js";
import { isJoinablePartyId } from "./queries.js";
import { setFactionChair, setPartyLeader } from "./leadership.js";
import { withdrawCandidacyEndorsements } from "./endorsements.js";
import {
  eligibilityReject,
  endActiveEndorsementsForContest,
  politicianEligibleForContest,
} from "./lifecycle.js";
import { applyQualification, resolveContestCount } from "./nominations.js";
import { selectorateForRule } from "./selectorates.js";
import { emptyQualificationEvidence, isNominationMethod } from "./types.js";
import type { PartyContest, PartyContestType, QualificationEvidence } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

const OPENABLE = new Set(["planned"]);
const RESOLVABLE = new Set(["open", "qualification", "voting"]);

const QUALIFICATION_KEYS = new Set([
  "memberNominationRequirementSatisfied",
  "provincialSupportRequirementSatisfied",
]);

export function createPartyContest(
  state: SimState,
  world: KernelWorld,
  args: {
    type: PartyContestType;
    partyId: string;
    factionId?: string | null;
    ruleId?: string;
    metadata?: JsonObject;
  },
  commandId: string | null,
): { contest: PartyContest; events: SimEvent[] } | { error: CommandError } {
  if (
    !isJoinablePartyId(world, state, args.partyId) &&
    !world.partyDefinitions[args.partyId] &&
    !state.dynamicParties[args.partyId]
  ) {
    return { error: reject("INVALID_PARTY", args.partyId) };
  }
  const def = world.partyDefinitions[args.partyId];
  const dyn = state.dynamicParties[args.partyId];
  const metadata: JsonObject = { ...(args.metadata ?? {}) };
  const jsonErr = jsonSafetyError(metadata, "contest.metadata");
  if (jsonErr) return { error: reject("NON_JSON_PAYLOAD", jsonErr) };

  let ruleId = "";
  if (args.type === "presidential_nomination") {
    ruleId = args.ruleId ?? def?.nominationRuleId ?? dyn?.nominationRuleId ?? "";
    if (!world.nominationRules[ruleId]) {
      return {
        error: reject("INVALID_CONTEST", `nomination rule ${ruleId || "(empty)"} does not resolve`),
      };
    }
    if (world.nominationRules[ruleId]!.partyId !== args.partyId && !dyn) {
      return {
        error: reject("INVALID_CONTEST", "nomination rule does not belong to contest party"),
      };
    }
  } else {
    const methodRaw = metadata.selectorMethod;
    if (typeof methodRaw !== "string" || !isNominationMethod(methodRaw) || methodRaw === "none") {
      return {
        error: reject(
          "SELECTOR_CONFIGURATION_REQUIRED",
          "party leadership and faction-chair contests require an explicit selectorMethod",
        ),
      };
    }
    if (methodRaw === "weighted_ranked_choice") {
      const mw = metadata.memberWeight;
      const uw = metadata.affiliateUnionDelegateWeight;
      if (
        typeof mw !== "number" ||
        typeof uw !== "number" ||
        !Number.isFinite(mw) ||
        !Number.isFinite(uw) ||
        mw < 0 ||
        uw < 0 ||
        mw + uw <= 0
      ) {
        return {
          error: reject(
            "SELECTOR_CONFIGURATION_REQUIRED",
            "generic weighted_ranked_choice requires explicit memberWeight and affiliateUnionDelegateWeight",
          ),
        };
      }
    }
    if (args.ruleId && world.nominationRules[args.ruleId]) {
      return {
        error: reject(
          "INVALID_CONTEST",
          "generic leadership contests must not inherit a presidential nomination rule",
        ),
      };
    }
    ruleId = "";
  }

  if (args.type === "faction_chair") {
    const factionId = args.factionId ?? null;
    if (!factionId) {
      return { error: reject("INVALID_CONTEST", "faction-chair contest requires factionId") };
    }
    const facDef = world.factionDefinitions[factionId];
    const facState = state.factionStates[factionId];
    if (!facDef || !facState) return { error: reject("INVALID_FACTION", factionId) };
    if (facDef.partyId !== args.partyId || facState.partyId !== args.partyId) {
      return { error: reject("INVALID_CONTEST", "faction does not belong to contest party") };
    }
  } else if (args.factionId) {
    return {
      error: reject("INVALID_CONTEST", "factionId is only valid for faction-chair contests"),
    };
  }

  const id = padId("CONTEST", state.counters.nextPartyContestId++);
  const contest: PartyContest = {
    id,
    type: args.type,
    partyId: args.partyId,
    factionId: args.type === "faction_chair" ? (args.factionId ?? null) : null,
    ruleId,
    status: "planned",
    createdDate: state.currentDate,
    openedDate: null,
    resolvedDate: null,
    entries: {},
    winnerId: null,
    selectorSummary: [],
    countInput: null,
    countArchive: null,
    metadata,
  };
  state.partyContests[id] = contest;
  return {
    contest,
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CONTEST_CREATED",
        importance: 0.4,
        visibility: "public",
        actorIds: [],
        entityIds: [args.partyId],
        payload: { contestId: id, contestType: args.type, partyId: args.partyId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function declareCandidacy(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  politicianId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  if (
    contest.status === "resolved" ||
    contest.status === "cancelled" ||
    contest.status === "voting"
  ) {
    return { error: reject("INVALID_CONTEST", "cannot declare in this contest state") };
  }
  const pol = state.politicians[politicianId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", politicianId) };
  const fail = politicianEligibleForContest(world, state, contest, politicianId);
  if (fail) return { error: eligibilityReject(fail) };
  const existing = contest.entries[politicianId];
  if (existing && (existing.status === "declared" || existing.status === "qualified")) {
    return { error: reject("ALREADY_DECLARED", `${politicianId} is already ${existing.status}`) };
  }
  if (existing && existing.status === "withdrawn") {
    return { error: reject("INVALID_CONTEST", "withdrawn candidate cannot re-enter") };
  }
  if (existing && (existing.status === "eliminated" || existing.status === "winner")) {
    return { error: reject("INVALID_CONTEST", "cannot redeclare a finalized candidate") };
  }
  const evidence: QualificationEvidence =
    existing?.qualificationEvidence ?? emptyQualificationEvidence();
  contest.entries[politicianId] = {
    politicianId,
    status: "declared",
    declaredDate: state.currentDate,
    qualificationEvidence: evidence,
    seedPresidentialStatus: existing?.seedPresidentialStatus ?? null,
  };
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CONTEST_CANDIDACY_DECLARED",
        importance: 0.55,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [contestId],
        payload: { contestId, politicianId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function withdrawCandidacy(
  state: SimState,
  contestId: string,
  politicianId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  if (contest.status === "resolved" || contest.status === "cancelled") {
    return { error: reject("INVALID_CONTEST", "contest already closed") };
  }
  const entry = contest.entries[politicianId];
  if (!entry) return { error: reject("INVALID_CONTEST", "not a candidate") };
  if (entry.status === "winner")
    return { error: reject("INVALID_CONTEST", "winner cannot withdraw") };
  if (entry.status === "withdrawn" || entry.status === "eliminated") {
    return { error: reject("ALREADY_WITHDRAWN", `${politicianId} is already ${entry.status}`) };
  }
  entry.status = "withdrawn";
  const events: SimEvent[] = [];
  withdrawCandidacyEndorsements(state, contestId, politicianId, events, commandId);
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CONTEST_CANDIDACY_WITHDRAWN",
      importance: 0.5,
      visibility: "public",
      actorIds: [politicianId],
      entityIds: [contestId],
      payload: { contestId, politicianId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { events };
}

export function setQualificationEvidence(
  state: SimState,
  contestId: string,
  politicianId: string,
  patch: Partial<QualificationEvidence>,
): { error: CommandError } | { ok: true } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  const entry = contest.entries[politicianId];
  if (!entry) return { error: reject("INVALID_CONTEST", "not a candidate") };
  for (const key of Object.keys(patch)) {
    if (!QUALIFICATION_KEYS.has(key)) {
      return { error: reject("INVALID_QUALIFICATION_EVIDENCE", `unknown evidence field ${key}`) };
    }
    const value = patch[key as keyof QualificationEvidence];
    if (typeof value !== "boolean") {
      return { error: reject("INVALID_QUALIFICATION_EVIDENCE", `${key} must be boolean`) };
    }
  }
  entry.qualificationEvidence = { ...entry.qualificationEvidence, ...patch };
  return { ok: true };
}

export function openPartyContest(
  state: SimState,
  contestId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  if (!OPENABLE.has(contest.status)) {
    return { error: reject("INVALID_CONTEST", `cannot open from ${contest.status}`) };
  }
  contest.status = "open";
  contest.openedDate = state.currentDate;
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CONTEST_OPENED",
        importance: 0.5,
        visibility: "public",
        actorIds: [],
        entityIds: [contestId],
        payload: { contestId, partyId: contest.partyId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function cancelPartyContest(
  state: SimState,
  contestId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  if (contest.status === "resolved" || contest.status === "cancelled") {
    return { error: reject("INVALID_CONTEST", "contest already closed") };
  }
  contest.status = "cancelled";
  contest.winnerId = null;
  contest.countInput = null;
  contest.countArchive = null;
  const events: SimEvent[] = [];
  endActiveEndorsementsForContest(state, contestId, events, commandId, "contest_cancelled");
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CONTEST_CANCELLED",
      importance: 0.55,
      visibility: "public",
      actorIds: [],
      entityIds: [contestId],
      payload: { contestId, partyId: contest.partyId },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { events };
}

export function resolvePartyContest(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  rng: RngService,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", contestId) };
  if (!RESOLVABLE.has(contest.status)) {
    return { error: reject("INVALID_CONTEST", `cannot resolve from ${contest.status}`) };
  }
  if (selectorateForRule(world, state, contest).length === 0) {
    return { error: reject("EMPTY_SELECTORATE", "no legitimate selectors") };
  }
  const qErr = applyQualification(world, state, contest);
  if (qErr) return { error: qErr };
  const counted = resolveContestCount(world, state, contest, rng);
  if ("error" in counted) return counted;
  contest.selectorSummary = counted.selectorSummary;
  contest.countInput = counted.countInput;
  contest.countArchive = counted.archive;
  contest.winnerId = counted.archive.elected;
  contest.status = "resolved";
  contest.resolvedDate = state.currentDate;
  const countedIds = new Set(counted.countInput.candidateIds);
  for (const entry of Object.values(contest.entries)) {
    if (entry.politicianId === contest.winnerId) {
      entry.status = "winner";
    } else if (countedIds.has(entry.politicianId)) {
      entry.status = "eliminated";
    } else if (entry.status === "declared" || entry.status === "qualified") {
      entry.status = "withdrawn";
    }
  }
  const events: SimEvent[] = [];
  endActiveEndorsementsForContest(state, contestId, events, commandId, "contest_resolved");
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CONTEST_RESOLVED",
      importance: 0.9,
      visibility: "public",
      actorIds: contest.winnerId ? [contest.winnerId] : [],
      entityIds: [contestId],
      payload: {
        contestId,
        winnerId: contest.winnerId,
        method: counted.archive.method,
        firstPreferences: counted.archive.firstPreferences,
        eliminated: counted.archive.eliminated,
        exhausted: counted.archive.exhausted,
        lots: counted.archive.rounds.map((r) => r.tieResolution?.lot ?? null),
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  if (contest.type === "party_leadership" && contest.winnerId) {
    const lead = setPartyLeader(state, world, contest.partyId, contest.winnerId, commandId);
    if ("error" in lead) return lead;
    events.push(...lead.events);
  }
  if (contest.type === "faction_chair" && contest.winnerId && contest.factionId) {
    const chair = setFactionChair(state, world, contest.factionId, contest.winnerId, commandId);
    if ("error" in chair) return chair;
    events.push(...chair.events);
  }
  if (contest.winnerId) reviewGoals(state, world, contest.winnerId, state.currentDate);
  return { events };
}
