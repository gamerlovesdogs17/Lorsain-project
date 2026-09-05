import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { MAX_ORG_MEETINGS_PER_MONTH, type OrganizationActorState } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function bumpMeetings(state: SimState): CommandError | null {
  if (state.organizationRuntime.meetingsThisMonth >= MAX_ORG_MEETINGS_PER_MONTH) {
    return reject("ORG_MEETING_LIMIT", "Monthly organization interaction budget is exhausted");
  }
  state.organizationRuntime.meetingsThisMonth += 1;
  return null;
}

function actorOrError(
  state: SimState,
  organizationId: string,
): { actor: OrganizationActorState } | { error: CommandError } {
  const actor = state.organizationRuntime.actors[organizationId];
  if (!actor) return { error: reject("UNKNOWN_ORGANIZATION", organizationId) };
  return { actor };
}

export function meetOrganization(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; organizationId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", args.actorId) };
  }
  const found = actorOrError(state, args.organizationId);
  if ("error" in found) return { error: found.error };
  const limit = bumpMeetings(state);
  if (limit) return { error: limit };
  const rel = found.actor.relationships[args.actorId] ?? {
    affinity: 0,
    trust: 0,
    policyAlignment: 0,
    lastUpdatedDate: null,
    lastReason: null,
  };
  rel.affinity = Math.max(-1, Math.min(1, rel.affinity + 0.015));
  rel.trust = Math.max(-1, Math.min(1, rel.trust + 0.012));
  rel.lastUpdatedDate = state.currentDate;
  rel.lastReason = "Direct meeting";
  found.actor.relationships[args.actorId] = rel;
  found.actor.recentActions.unshift({
    date: state.currentDate,
    kind: "meeting",
    summary: "Met with a politician",
  });
  void world;
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ORGANIZATION_MEETING",
        importance: 0.4,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.organizationId],
        payload: { organizationId: args.organizationId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function seekOrganizationEndorsement(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; organizationId: string; campaignId: string },
  commandId: string | null,
  rngFloat: number,
): { events: SimEvent[] } | { error: CommandError } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", args.actorId) };
  }
  const found = actorOrError(state, args.organizationId);
  if ("error" in found) return { error: found.error };
  const campaign = state.campaignRuntime.campaigns[args.campaignId];
  if (!campaign || campaign.politicianId !== args.actorId) {
    return { error: reject("UNKNOWN_CAMPAIGN", args.campaignId) };
  }
  if (
    found.actor.endorsements.some(
      (endorsement) =>
        endorsement.politicianId === args.actorId &&
        endorsement.campaignId === args.campaignId &&
        (endorsement.status ?? "active") === "active",
    )
  ) {
    return {
      error: reject(
        "ENDORSEMENT_ALREADY_ACTIVE",
        "This organization already endorses the campaign",
      ),
    };
  }
  const limit = bumpMeetings(state);
  if (limit) return { error: limit };
  const canon = world.interestOrganizations[args.organizationId];
  if (!canon) return { error: reject("UNKNOWN_ORGANIZATION", args.organizationId) };
  const party = state.politicians[args.actorId]?.partyId;
  const aligned = party != null && canon.leanPartyIds.includes(party);
  const rel = found.actor.relationships[args.actorId]?.affinity ?? 0;
  const chance = (aligned ? 0.45 : 0.12) + canon.strength * 0.15 + rel * 0.1;
  if (rngFloat > chance) {
    found.actor.recentActions.unshift({
      date: state.currentDate,
      kind: "endorse",
      summary: "Declined to endorse",
    });
    return {
      events: [
        pushHistory(state, {
          date: state.currentDate,
          type: "ORGANIZATION_ENDORSEMENT_DECLINED",
          importance: 0.35,
          visibility: "public",
          actorIds: [args.actorId],
          entityIds: [args.organizationId],
          payload: { organizationId: args.organizationId, campaignId: args.campaignId },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      ],
    };
  }
  found.actor.endorsements.push({
    politicianId: args.actorId,
    campaignId: args.campaignId,
    date: state.currentDate,
    public: true,
    status: "active",
    withdrawnDate: null,
  });
  const endorsedRelationship = found.actor.relationships[args.actorId] ?? {
    affinity: 0,
    trust: 0,
    policyAlignment: 0,
    lastUpdatedDate: null,
    lastReason: null,
  };
  endorsedRelationship.affinity = Math.min(1, endorsedRelationship.affinity + 0.03);
  endorsedRelationship.trust = Math.min(1, endorsedRelationship.trust + 0.04);
  endorsedRelationship.lastUpdatedDate = state.currentDate;
  endorsedRelationship.lastReason = "Campaign endorsement";
  found.actor.relationships[args.actorId] = endorsedRelationship;
  const standing = ensureCandidateStanding(world, state, args.actorId);
  standing.favorability = clampUnit(standing.favorability + 0.015 * canon.strength);
  standing.enthusiasm = Math.min(1, standing.enthusiasm + 0.012 * canon.strength);
  campaign.cashOnHand = Math.min(
    50_000_000,
    campaign.cashOnHand + Math.round(10000 * canon.strength),
  );
  found.actor.recentActions.unshift({
    date: state.currentDate,
    kind: "endorse",
    summary: "Issued a campaign endorsement",
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ORGANIZATION_ENDORSEMENT",
        importance: 0.6,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.organizationId, args.campaignId],
        payload: { organizationId: args.organizationId, campaignId: args.campaignId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function askOrganizationBillSupport(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; organizationId: string; billId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", args.actorId) };
  }
  const found = actorOrError(state, args.organizationId);
  if ("error" in found) return { error: found.error };
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  const limit = bumpMeetings(state);
  if (limit) return { error: limit };
  const canon = world.interestOrganizations[args.organizationId];
  const issue = bill.policyItems[0]?.issueId;
  const relevant = issue != null && canon?.issues.includes(issue);
  const stance = relevant ? "support" : "watch";
  found.actor.billPressure = found.actor.billPressure.filter((p) => p.billId !== bill.id);
  found.actor.billPressure.push({
    billId: bill.id,
    stance,
    strength: relevant ? Math.min(1, (canon?.strength ?? 0.4) * 0.7) : 0.15,
  });
  found.actor.recentActions.unshift({
    date: state.currentDate,
    kind: "lobby",
    summary: relevant ? `Agreed to consider ${bill.title}` : `Noted ${bill.title}`,
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ORGANIZATION_ACTION",
        importance: 0.4,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.organizationId, bill.id],
        payload: { organizationId: args.organizationId, billId: bill.id, stance, kind: "request" },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function discussOrganizationPolicy(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; organizationId: string; issueId: string; direction: number },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", args.actorId) };
  }
  const found = actorOrError(state, args.organizationId);
  if ("error" in found) return { error: found.error };
  const limit = bumpMeetings(state);
  if (limit) return { error: limit };
  const cur = found.actor.publicPositions[args.issueId] ?? 0;
  const next = Math.max(-1, Math.min(1, cur + Math.max(-1, Math.min(1, args.direction)) * 0.08));
  found.actor.publicPositions[args.issueId] = next;
  void monthStart;
  void world;
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ORGANIZATION_POLICY_TALK",
        importance: 0.3,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.organizationId],
        payload: { organizationId: args.organizationId, issueId: args.issueId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}
