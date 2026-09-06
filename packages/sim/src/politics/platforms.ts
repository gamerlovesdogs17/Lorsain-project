import { recordPartyPlatform } from "../parties/platforms.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";

/**
 * Post-election platform review trigger (not random drift only).
 * Calls existing recordPartyPlatform on major seat loss.
 */
export function processPlatformReviewMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  void world;
  const events: SimEvent[] = [];
  const latest = Object.values(state.elections)
    .filter(
      (election) =>
        election.type === "assembly" &&
        election.status === "resolved" &&
        election.assembly &&
        election.date.slice(0, 7) === state.currentDate.slice(0, 7),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  if (!latest?.assembly) return events;

  for (const partyId of Object.keys(state.partyStates).sort()) {
    const previous = latest.assembly.previousPartySeatTotals[partyId] ?? 0;
    const current = latest.assembly.partySeatTotals[partyId] ?? 0;
    const loss = previous - current;
    if (loss < 8) continue;
    const party = state.partyStates[partyId];
    if (!party?.publicPlatform) continue;
    const already = party.publicPlatform.history.some(
      (entry) =>
        entry.date === state.currentDate &&
        (entry.reason === "electoral_defeat" || entry.reason === "annual_conference"),
    );
    if (already) continue;

    // Nudge platform slightly toward mean member positions via recording a review snapshot.
    recordPartyPlatform(state, partyId, "electoral_defeat");
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_PLATFORM_REVIEW",
        importance: 0.55,
        visibility: "public",
        actorIds: party.leaderId ? [party.leaderId] : [],
        entityIds: [partyId, latest.id],
        payload: {
          partyId,
          electionId: latest.id,
          seatLoss: loss,
          reason: "electoral_defeat",
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
