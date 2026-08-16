import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { applyRelationshipChange } from "../agents/relationships.js";
import { jsonSafetyError } from "../json.js";
import { padId, pushHistory } from "../scheduler.js";
import {
  endEndorsementsForTarget,
  isCurrentlyActiveCandidate,
  isLiveEndorsement,
  isUnresolvedContestStatus,
  politicianEligibleForContest,
} from "./lifecycle.js";
import { resolveProvincialOrganization } from "./organizations.js";
import { ENDORSEMENT_RELATIONSHIP_DELTA } from "./policy.js";
import type { EndorsementRecord, EndorserType } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

const SINGLE_WINNER_TYPES = new Set([
  "presidential_nomination",
  "party_leadership",
  "faction_chair",
]);

export function activeEndorsementsForContest(
  state: SimState,
  contestId: string,
): EndorsementRecord[] {
  const contest = state.partyContests[contestId];
  if (!contest || !isUnresolvedContestStatus(contest.status)) return [];
  return Object.values(state.endorsements)
    .filter((e) => e.contestId === contestId && isLiveEndorsement(state, e))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function activeEndorsementByEndorser(
  state: SimState,
  contestId: string,
  endorserType: EndorserType,
  endorserId: string,
): EndorsementRecord | null {
  const found = Object.values(state.endorsements).find(
    (e) =>
      e.contestId === contestId &&
      e.endorserType === endorserType &&
      e.endorserId === endorserId &&
      e.status === "active",
  );
  return found ?? null;
}

function validateEndorser(
  world: KernelWorld,
  state: SimState,
  contestPartyId: string,
  endorserType: EndorserType,
  endorserId: string,
): CommandError | null {
  if (endorserType === "politician") {
    const pol = state.politicians[endorserId];
    if (!pol) return reject("UNKNOWN_POLITICIAN", endorserId);
    if (!pol.alive) return reject("POLITICIAN_DEAD", endorserId);
    if (pol.retired) return reject("RETIRED", `${endorserId} is retired`);
    return null;
  }
  if (endorserType === "faction") {
    const def = world.factionDefinitions[endorserId];
    const fac = state.factionStates[endorserId];
    if (!def || !fac) return reject("INVALID_FACTION", endorserId);
    if (def.partyId !== contestPartyId || fac.partyId !== contestPartyId) {
      return reject("INVALID_ENDORSEMENT", "faction does not belong to contest party");
    }
    if (fac.status !== "active") {
      return reject("INVALID_FACTION", `${endorserId} is not an active faction`);
    }
    return null;
  }
  const org = resolveProvincialOrganization(world, endorserId);
  if (!org) return reject("INVALID_ORGANIZATION", endorserId);
  if (org.partyId !== contestPartyId) {
    return reject("INVALID_ENDORSEMENT", "organization does not belong to contest party");
  }
  if (org.status !== "active") {
    return reject("INVALID_ORGANIZATION", `${endorserId} is not an active provincial organization`);
  }
  if (!world.provinceIds.includes(org.provinceId)) {
    return reject("INVALID_ORGANIZATION", `province ${org.provinceId} does not resolve`);
  }
  return null;
}

export function endorseCandidate(
  state: SimState,
  world: KernelWorld,
  args: {
    endorserType: EndorserType;
    endorserId: string;
    targetId: string;
    contestId: string;
    public?: boolean;
  },
  commandId: string | null,
): { endorsement: EndorsementRecord; events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[args.contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", args.contestId) };
  if (contest.status === "resolved" || contest.status === "cancelled") {
    return { error: reject("INVALID_CONTEST", "contest is not open for endorsements") };
  }
  const entry = contest.entries[args.targetId];
  if (
    !entry ||
    !isCurrentlyActiveCandidate(contest, entry.status) ||
    entry.status === "potential" ||
    entry.status === "exploring"
  ) {
    return { error: reject("INVALID_CONTEST", "endorsement target is not a valid candidate") };
  }
  const ineligible = politicianEligibleForContest(world, state, contest, args.targetId);
  if (ineligible) return { error: reject(ineligible.code, ineligible.message) };
  const endorserErr = validateEndorser(
    world,
    state,
    contest.partyId,
    args.endorserType,
    args.endorserId,
  );
  if (endorserErr) return { error: endorserErr };
  if (args.endorserType === "politician" && args.endorserId === args.targetId) {
    return { error: reject("INVALID_ENDORSEMENT", "cannot endorse self") };
  }

  if (SINGLE_WINNER_TYPES.has(contest.type)) {
    const existing = activeEndorsementByEndorser(
      state,
      args.contestId,
      args.endorserType,
      args.endorserId,
    );
    if (existing && existing.targetId === args.targetId) {
      return {
        error: reject(
          "ALREADY_ENDORSED_CANDIDATE",
          `${args.endorserId} already endorses ${args.targetId}`,
        ),
      };
    }
  }

  const events: SimEvent[] = [];
  if (SINGLE_WINNER_TYPES.has(contest.type)) {
    for (const existing of Object.values(state.endorsements)) {
      if (
        existing.endorserType === args.endorserType &&
        existing.endorserId === args.endorserId &&
        existing.contestId === args.contestId &&
        existing.status === "active"
      ) {
        existing.status = "superseded";
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "ENDORSEMENT_SWITCHED",
            importance: 0.45,
            visibility: "public",
            actorIds:
              args.endorserType === "politician"
                ? [args.endorserId, existing.targetId]
                : [existing.targetId],
            entityIds: [args.contestId],
            payload: { previousEndorsementId: existing.id, previousTargetId: existing.targetId },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
    }
  }

  const id = padId("END", state.counters.nextEndorsementId++);
  const endorsement: EndorsementRecord = {
    id,
    endorserType: args.endorserType,
    endorserId: args.endorserId,
    targetId: args.targetId,
    contestId: args.contestId,
    date: state.currentDate,
    status: "active",
    public: args.public !== false,
    metadata: {},
  };
  const jsonErr = jsonSafetyError(endorsement.metadata, "endorsement.metadata");
  if (jsonErr) return { error: reject("NON_JSON_PAYLOAD", jsonErr) };
  state.endorsements[id] = endorsement;
  if (args.endorserType === "politician") {
    recordPoliticalMemory(
      state,
      world,
      {
        ownerId: args.endorserId,
        subjectIds: [args.targetId],
        kind: "favor",
        valence: 0.25,
        salience: 0.45,
        durability: "normal",
        tags: ["endorsement"],
        metadata: { contestId: args.contestId, endorsementId: id },
      },
      state.currentDate,
    );
    applyRelationshipChange(
      state,
      args.endorserId,
      args.targetId,
      ENDORSEMENT_RELATIONSHIP_DELTA,
      state.currentDate,
    );
  }
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "ENDORSEMENT_MADE",
      importance: 0.5,
      visibility: endorsement.public ? "public" : "system",
      actorIds:
        args.endorserType === "politician" ? [args.endorserId, args.targetId] : [args.targetId],
      entityIds: [args.contestId],
      payload: {
        endorsementId: id,
        endorserType: args.endorserType,
        endorserId: args.endorserId,
        targetId: args.targetId,
        contestId: args.contestId,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { endorsement, events };
}

export function withdrawEndorsement(
  state: SimState,
  endorsementId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const rec = state.endorsements[endorsementId];
  if (!rec) return { error: reject("INVALID_ENDORSEMENT", endorsementId) };
  if (rec.status !== "active") return { error: reject("INVALID_ENDORSEMENT", "not active") };
  rec.status = "withdrawn";
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ENDORSEMENT_WITHDRAWN",
        importance: 0.4,
        visibility: "public",
        actorIds:
          rec.endorserType === "politician" ? [rec.endorserId, rec.targetId] : [rec.targetId],
        entityIds: [rec.contestId],
        payload: { endorsementId, contestId: rec.contestId, targetId: rec.targetId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function withdrawCandidacyEndorsements(
  state: SimState,
  contestId: string,
  politicianId: string,
  events: SimEvent[],
  commandId: string | null,
): void {
  endEndorsementsForTarget(state, contestId, politicianId, events, commandId, "withdrawn");
}
