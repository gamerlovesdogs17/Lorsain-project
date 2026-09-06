import { getAgentProfile } from "../agents/profile.js";
import { recordPartyPlatform, partyPlatformIssueForBillItem } from "../parties/platforms.js";
import { partyMembers } from "../parties/queries.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function axisPosition(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  issue: PartyPlatformIssue,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return 0;
  if (["economy", "taxes", "labor", "housing"].includes(issue)) return profile.ideology.economic;
  if (issue === "social_policy") return profile.ideology.social;
  if (issue === "environment") return profile.ideology.green;
  if (issue === "foreign_policy") return profile.ideology.globalism;
  return -profile.ideology.authority;
}

function meanOf(
  ids: string[],
  world: KernelWorld,
  state: SimState,
  issue: PartyPlatformIssue,
): number {
  const values = ids
    .map((id) => axisPosition(world, state, id, issue))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Post-election platform review: nudge public positions toward median members /
 * constituency winners, then snapshot via recordPartyPlatform.
 */
export function processPlatformReviewMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
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

  const winnerIds = new Set<string>();
  for (const result of Object.values(latest.assembly.constituencyResults ?? {})) {
    for (const id of result.electedIds) winnerIds.add(id);
  }

  for (const partyId of Object.keys(state.partyStates).sort()) {
    const previous = latest.assembly.previousPartySeatTotals[partyId] ?? 0;
    const current = latest.assembly.partySeatTotals[partyId] ?? 0;
    const loss = previous - current;
    if (loss < 8) continue;
    const party = state.partyStates[partyId];
    if (!party?.publicPlatform) continue;
    if (party.status === "defunct") continue;
    const already = party.publicPlatform.history.some(
      (entry) =>
        entry.date === state.currentDate &&
        (entry.reason === "electoral_defeat" || entry.reason === "annual_conference"),
    );
    if (already) continue;

    const members = partyMembers(state, partyId);
    const partyWinners = [...winnerIds].filter((id) => state.politicians[id]?.partyId === partyId);
    const nudgeBefore: Record<string, number> = {};
    for (const issue of PARTY_PLATFORM_ISSUES) {
      const currentPos = party.publicPlatform.positions[issue] ?? 0;
      nudgeBefore[issue] = currentPos;
      const memberMedian = meanOf(members, world, state, issue);
      const winnerMean =
        partyWinners.length > 0 ? meanOf(partyWinners, world, state, issue) : memberMedian;
      // Blend member/winner signal with a moderation pull toward 0 after defeat.
      const target = memberMedian * 0.4 + winnerMean * 0.35 + 0 * 0.25;
      let step = (target - currentPos) * 0.5;
      if (Math.abs(step) < 0.04) {
        // Ensure a visible correction after major seat loss.
        step = currentPos > 0 ? -0.06 : currentPos < 0 ? 0.06 : memberMedian >= 0 ? 0.05 : -0.05;
      }
      step = Math.max(-0.2, Math.min(0.2, step));
      party.publicPlatform.positions[issue] = clamp(currentPos + step);
    }
    party.publicPlatform.updatedDate = state.currentDate;
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
          nudgedFrom: nudgeBefore,
          nudgedTo: { ...party.publicPlatform.positions },
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  void partyPlatformIssueForBillItem;
  return events;
}
