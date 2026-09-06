import { getAgentProfile } from "../agents/profile.js";
import { partyPlatformFit, partyPlatformIssueForBillItem } from "../parties/platforms.js";
import { assemblyCaucus } from "../parties/queries.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { AS_MAX_PRIORITY_BILLS_PER_CAUCUS } from "./types.js";

/**
 * Set CaucusLeadershipState.priorityBillIds from caucus ideology/platform monthly (bounded).
 */
export function processCaucusAgendaMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
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
      continue;
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
        return {
          id: bill.id,
          score: platformFit + samePartyBoost + ideologyFit * 0.35,
        };
      })
      .filter((row) => row.score > 0.05)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, AS_MAX_PRIORITY_BILLS_PER_CAUCUS)
      .map((row) => row.id);

    const prev = leadership.priorityBillIds.slice().sort().join(",");
    leadership.priorityBillIds = scored;
    const next = scored.slice().sort().join(",");
    if (prev !== next && scored.length > 0) {
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CAUCUS_AGENDA_SET",
          importance: 0.35,
          visibility: "public",
          actorIds: leadership.floorLeaderId ? [leadership.floorLeaderId] : [],
          entityIds: [partyId, ...scored],
          payload: { partyId, priorityBillIds: scored },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }

  return events;
}
