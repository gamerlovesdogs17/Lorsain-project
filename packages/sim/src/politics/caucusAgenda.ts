import { getAgentProfile } from "../agents/profile.js";
import { partyPlatformFit, partyPlatformIssueForBillItem } from "../parties/platforms.js";
import { assemblyCaucus } from "../parties/queries.js";
import { endorseCandidate } from "../parties/endorsements.js";
import { isCurrentlyActiveCandidate } from "../parties/lifecycle.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { activeCoalition } from "./coalitions.js";
import { AS_MAX_PRIORITY_BILLS_PER_CAUCUS } from "./types.js";
import type { PartyPlatformIssue } from "../parties/types.js";

/**
 * Set CaucusLeadershipState agenda from ideology/platform/coalition (bounded).
 * Optional fields: leadershipCandidateId, platformDemand, coalitionPreference.
 */
export function processCaucusAgendaMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const coalition = activeCoalition(state);
  const activeBills = Object.values(state.legislatureRuntime.bills)
    .filter((b) =>
      [
        "introduced",
        "committee",
        "committee_passed",
        "floor_scheduled",
        "returned_by_president",
        "repassage_scheduled",
      ].includes(b.status),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const [partyId, leadership] of Object.entries(
    state.legislatureRuntime.caucusLeadership,
  ).sort(([a], [b]) => a.localeCompare(b))) {
    const caucus = assemblyCaucus(world, state, partyId);
    if (caucus.length === 0) {
      leadership.priorityBillIds = [];
      leadership.leadershipCandidateId = null;
      continue;
    }

    const prev = leadership.priorityBillIds.slice().sort().join(",");
    const prevLeader = String(leadership.leadershipCandidateId ?? "");
    const prevDemand = String(leadership.platformDemand ?? "");

    if (coalition?.partyIds.includes(partyId)) {
      leadership.coalitionPreference = coalition.partyIds.slice();
      leadership.platformDemand =
        (coalition.policyPriorities[0] as PartyPlatformIssue | undefined) ??
        leadership.platformDemand ??
        null;
    }

    const scored = activeBills
      .map((bill) => {
        const platformFit = partyPlatformFit(state, partyId, bill);
        const sponsorParty = state.politicians[bill.sponsorId]?.partyId;
        const samePartyBoost = sponsorParty === partyId ? 0.2 : 0;
        const floorLeader = leadership.floorLeaderId
          ? getAgentProfile(world, state, leadership.floorLeaderId)
          : null;
        let ideologyFit = 0;
        if (floorLeader && bill.policyItems.length > 0) {
          ideologyFit =
            bill.policyItems.reduce((sum, item) => {
              const issue = partyPlatformIssueForBillItem(item.issueId, item.provisionId);
              const axis =
                issue === "environment"
                  ? "green"
                  : issue === "social_policy"
                    ? "social"
                    : issue === "foreign_policy"
                      ? "globalism"
                      : issue === "institutional_reform"
                        ? "authority"
                        : "economic";
              return sum + (floorLeader.ideology[axis] ?? 0) * item.direction * item.magnitude;
            }, 0) / bill.policyItems.length;
        }
        let coalitionBoost = 0;
        if (coalition?.partyIds.includes(partyId) && bill.policyItems.length > 0) {
          for (const item of bill.policyItems) {
            const issue = partyPlatformIssueForBillItem(item.issueId, item.provisionId);
            if (coalition.policyPriorities.includes(issue)) coalitionBoost += 0.18;
          }
        }
        if (
          leadership.platformDemand &&
          bill.policyItems.some(
            (item) =>
              partyPlatformIssueForBillItem(item.issueId, item.provisionId) ===
              leadership.platformDemand,
          )
        ) {
          coalitionBoost += 0.12;
        }
        return {
          id: bill.id,
          score: platformFit + samePartyBoost + ideologyFit * 0.35 + coalitionBoost,
        };
      })
      .filter((row) => row.score > 0.05)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, AS_MAX_PRIORITY_BILLS_PER_CAUCUS)
      .map((row) => row.id);

    leadership.priorityBillIds = scored;

    // Pressure leadership endorsements when an open party leadership contest exists.
    const contest = Object.values(state.partyContests)
      .filter(
        (c) =>
          c.type === "party_leadership" &&
          c.partyId === partyId &&
          (c.status === "open" || c.status === "voting" || c.status === "qualification"),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (contest) {
      const candidates = Object.values(contest.entries)
        .filter((e) => isCurrentlyActiveCandidate(contest, e.status))
        .map((e) => e.politicianId)
        .sort();
      if (candidates.length > 0) {
        const preferred =
          leadership.floorLeaderId && candidates.includes(leadership.floorLeaderId)
            ? leadership.floorLeaderId
            : candidates[0]!;
        leadership.leadershipCandidateId = preferred;
        const endorser = leadership.whipId ?? leadership.floorLeaderId;
        if (endorser && endorser !== preferred && endorser !== state.playerPoliticianId) {
          const endorsed = endorseCandidate(
            state,
            world,
            {
              contestId: contest.id,
              endorserId: endorser,
              targetId: preferred,
              endorserType: "politician",
            },
            commandId,
          );
          if (!("error" in endorsed)) events.push(...endorsed.events);
        }
      }
    }

    const next = scored.slice().sort().join(",");
    const nextLeader = String(leadership.leadershipCandidateId ?? "");
    const nextDemand = String(leadership.platformDemand ?? "");
    // Emit only on material agenda change (avoid per-party monthly spam).
    if (
      (prev !== next || prevLeader !== nextLeader || prevDemand !== nextDemand) &&
      (scored.length > 0 || nextLeader !== "" || nextDemand !== "")
    ) {
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CAUCUS_AGENDA_SET",
          importance: 0.35,
          visibility: "public",
          actorIds: leadership.floorLeaderId ? [leadership.floorLeaderId] : [],
          entityIds: [partyId, ...scored],
          payload: {
            partyId,
            priorityBillIds: scored,
            leadershipCandidateId: leadership.leadershipCandidateId ?? null,
            platformDemand: leadership.platformDemand ?? null,
            coalitionPreference: leadership.coalitionPreference ?? null,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }

  return events;
}
