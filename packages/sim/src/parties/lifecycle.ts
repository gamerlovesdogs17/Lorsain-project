import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { isIsoDate } from "../calendar.js";
import { pushHistory } from "../scheduler.js";
import { evaluatePresidentialEligibility } from "./eligibility.js";
import type { EndorsementRecord, PartyContest, PartyContestStatus } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export type ContestEligibilityFailure = {
  code: string;
  message: string;
};

export function politicianEligibleForContest(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  politicianId: string,
): ContestEligibilityFailure | null {
  const pol = state.politicians[politicianId];
  if (!pol) return { code: "UNKNOWN_POLITICIAN", message: politicianId };
  if (!pol.alive) return { code: "POLITICIAN_DEAD", message: politicianId };
  if (pol.retired) return { code: "RETIRED", message: `${politicianId} is retired` };
  if (contest.type === "faction_chair") {
    if (!contest.factionId) {
      return { code: "INVALID_CONTEST", message: "faction-chair contest requires factionId" };
    }
    if (pol.factionId !== contest.factionId || pol.partyId !== contest.partyId) {
      return { code: "INVALID_CONTEST", message: "candidate from wrong faction" };
    }
  } else if (pol.partyId !== contest.partyId) {
    return { code: "INVALID_CONTEST", message: "candidate from wrong party" };
  }
  if (contest.type === "presidential_nomination") {
    const contestDate =
      typeof contest.metadata.electionDate === "string" && isIsoDate(contest.metadata.electionDate)
        ? contest.metadata.electionDate
        : undefined;
    const evaln = evaluatePresidentialEligibility(world, state, politicianId, contestDate);
    if (!evaln.eligible) {
      return {
        code: evaln.code ?? "PRESIDENTIALLY_INELIGIBLE",
        message: evaln.reasons.join("; ") || `${politicianId} is not presidentially eligible`,
      };
    }
  }
  return null;
}

export function isUnresolvedContestStatus(status: PartyContestStatus | string): boolean {
  return (
    status === "planned" || status === "open" || status === "qualification" || status === "voting"
  );
}

export function isActiveContestCandidateStatus(status: string): boolean {
  return (
    status === "potential" ||
    status === "exploring" ||
    status === "declared" ||
    status === "qualified"
  );
}

/** Current candidacy: active-like entry status AND an unresolved contest. */
export function isCurrentlyActiveCandidate(contest: PartyContest, status: string): boolean {
  return isUnresolvedContestStatus(contest.status) && isActiveContestCandidateStatus(status);
}

/** Declared/exploring/qualified in an unresolved contest — not a mere potential listing. */
export function isDeclaredContestCandidate(contest: PartyContest, politicianId: string): boolean {
  const entry = contest.entries[politicianId];
  if (!entry) return false;
  if (entry.status === "potential" || entry.status === "withdrawn") return false;
  if (entry.status === "eliminated" || entry.status === "winner") return false;
  return isCurrentlyActiveCandidate(contest, entry.status);
}

export function isLiveEndorsement(state: SimState, rec: EndorsementRecord): boolean {
  if (rec.status !== "active") return false;
  const contest = state.partyContests[rec.contestId];
  if (!contest || !isUnresolvedContestStatus(contest.status)) return false;
  const entry = contest.entries[rec.targetId];
  return !!entry && isCurrentlyActiveCandidate(contest, entry.status);
}

export function endActiveEndorsementsForContest(
  state: SimState,
  contestId: string,
  events: SimEvent[],
  commandId: string | null,
  reason: string,
): void {
  for (const rec of Object.values(state.endorsements)) {
    if (rec.contestId !== contestId || rec.status !== "active") continue;
    rec.status = "ended";
    rec.metadata = { ...rec.metadata, endReason: reason };
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ENDORSEMENT_ENDED",
        importance: 0.35,
        visibility: "public",
        actorIds:
          rec.endorserType === "politician" ? [rec.endorserId, rec.targetId] : [rec.targetId],
        entityIds: [contestId],
        payload: {
          endorsementId: rec.id,
          contestId,
          targetId: rec.targetId,
          reason,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
}

export function endEndorsementsForTarget(
  state: SimState,
  contestId: string,
  targetId: string,
  events: SimEvent[],
  commandId: string | null,
  reason: string,
): void {
  for (const rec of Object.values(state.endorsements)) {
    if (rec.contestId !== contestId || rec.targetId !== targetId || rec.status !== "active") {
      continue;
    }
    rec.status = "ended";
    rec.metadata = { ...rec.metadata, endReason: reason };
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ENDORSEMENT_ENDED",
        importance: 0.35,
        visibility: "public",
        actorIds:
          rec.endorserType === "politician" ? [rec.endorserId, rec.targetId] : [rec.targetId],
        entityIds: [contestId],
        payload: {
          endorsementId: rec.id,
          contestId,
          targetId,
          reason,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
}

export function endInvalidEndorsements(
  world: KernelWorld,
  state: SimState,
  events: SimEvent[],
  commandId: string | null,
): void {
  for (const rec of Object.values(state.endorsements)) {
    if (rec.status !== "active") continue;
    const contest = state.partyContests[rec.contestId];
    if (!contest || contest.status === "resolved" || contest.status === "cancelled") continue;
    let reason: string | null = null;
    if (rec.endorserType === "politician") {
      const pol = state.politicians[rec.endorserId];
      if (!pol || !pol.alive || pol.retired) reason = "endorser_inactive";
    } else if (rec.endorserType === "faction") {
      const fac = state.factionStates[rec.endorserId];
      const def = world.factionDefinitions[rec.endorserId];
      if (!fac || !def || fac.status !== "active" || def.partyId !== contest.partyId) {
        reason = "faction_endorser_invalid";
      }
    } else if (rec.endorserType === "provincial_organization") {
      const org = world.provincialPartyOrganizations[rec.endorserId];
      if (!org || org.status !== "active" || org.partyId !== contest.partyId) {
        reason = "organization_endorser_invalid";
      }
    }
    const entry = contest.entries[rec.targetId];
    if (!entry || !isCurrentlyActiveCandidate(contest, entry.status)) {
      reason = reason ?? "target_not_active";
    } else if (politicianEligibleForContest(world, state, contest, rec.targetId)) {
      reason = reason ?? "target_ineligible";
    }
    if (!reason) continue;
    rec.status = "ended";
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ENDORSEMENT_ENDED",
        importance: 0.35,
        visibility: "public",
        actorIds:
          rec.endorserType === "politician" ? [rec.endorserId, rec.targetId] : [rec.targetId],
        entityIds: [rec.contestId],
        payload: {
          endorsementId: rec.id,
          contestId: rec.contestId,
          targetId: rec.targetId,
          reason,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
}

export function reconcilePoliticianContestParticipation(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  events: SimEvent[],
  commandId: string | null,
): void {
  for (const contest of Object.values(state.partyContests)) {
    if (contest.status === "resolved" || contest.status === "cancelled") continue;
    const entry = contest.entries[politicianId];
    if (!entry || !isActiveContestCandidateStatus(entry.status)) continue;
    const fail = politicianEligibleForContest(world, state, contest, politicianId);
    if (!fail) continue;
    entry.status = "withdrawn";
    endEndorsementsForTarget(
      state,
      contest.id,
      politicianId,
      events,
      commandId,
      fail.code.toLowerCase(),
    );
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CONTEST_CANDIDACY_ENDED",
        importance: 0.55,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [contest.id],
        payload: {
          contestId: contest.id,
          politicianId,
          reason: fail.code,
          message: fail.message,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
  endInvalidEndorsements(world, state, events, commandId);
}

export function eligibilityReject(fail: ContestEligibilityFailure): CommandError {
  return reject(fail.code, fail.message);
}
