import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { addMonths } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import { clampUnit } from "../elections/policy.js";
import { seedOrganizationRuntime } from "./types.js";
import type { OrganizationStance } from "./types.js";

function note(
  actor: { recentActions: Array<{ date: string; kind: string; summary: string }> },
  date: string,
  kind: string,
  summary: string,
): void {
  actor.recentActions.unshift({ date, kind, summary });
  if (actor.recentActions.length > 6) actor.recentActions.length = 6;
}

export function orgIssueFit(world: KernelWorld, orgId: string, issueId: string): number {
  const canon = world.interestOrganizations[orgId];
  if (!canon) return 0;
  if (!canon.issues.includes(issueId)) return 0;
  const type = canon.type.toLowerCase();
  if (issueId === "ISS_LABOR" || issueId === "ISS_WELFARE") {
    if (type.includes("union")) return 0.8;
    if (type.includes("business") || type.includes("manufactur")) return -0.55;
  }
  if (issueId === "ISS_CLIMATE") {
    if (type.includes("climate") || type.includes("advocacy")) return 0.7;
    if (type.includes("manufactur") || type.includes("farm") || type.includes("maritime"))
      return -0.25;
  }
  if (issueId === "ISS_HOUSING" && type.includes("municipal")) return 0.45;
  if (issueId === "ISS_TRADE") {
    if (type.includes("maritime") || type.includes("farm") || type.includes("manufactur"))
      return 0.4;
  }
  return 0.25;
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function recordOrganizationPolicyBehavior(
  world: KernelWorld,
  state: SimState,
  args: {
    politicianId: string;
    policyItems: Array<{ issueId: string; direction: number }>;
    behavior: "sponsor" | "vote" | "sign" | "veto";
    voteChoice?: "yes" | "no" | "abstain";
  },
): void {
  for (const [orgId, actor] of Object.entries(state.organizationRuntime.actors)) {
    const fits = args.policyItems
      .map((item) => orgIssueFit(world, orgId, item.issueId) * item.direction)
      .filter((fit) => Math.abs(fit) >= 0.12);
    if (fits.length === 0) continue;
    const policySignal = fits.reduce((sum, fit) => sum + fit, 0) / fits.length;
    const behaviorDirection =
      args.behavior === "veto" || args.voteChoice === "no"
        ? -1
        : args.voteChoice === "abstain"
          ? 0
          : 1;
    if (behaviorDirection === 0) continue;
    const alignment = policySignal * behaviorDirection;
    const weight = args.behavior === "vote" ? 0.06 : args.behavior === "sponsor" ? 0.045 : 0.05;
    const edge = actor.relationships[args.politicianId] ?? {
      affinity: 0,
      trust: 0,
      policyAlignment: 0,
      lastUpdatedDate: null,
      lastReason: null,
    };
    edge.policyAlignment = clampSigned(edge.policyAlignment + alignment * weight);
    edge.affinity = clampSigned(edge.affinity + alignment * weight * 0.45);
    edge.trust = clampSigned(edge.trust + (alignment >= 0 ? 1 : -1) * weight * 0.35);
    edge.lastUpdatedDate = state.currentDate;
    edge.lastReason =
      args.behavior === "vote"
        ? `${args.voteChoice === "yes" ? "Supported" : "Opposed"} priority legislation`
        : args.behavior === "sponsor"
          ? "Sponsored priority legislation"
          : args.behavior === "sign"
            ? "Signed priority legislation"
            : "Vetoed priority legislation";
    actor.relationships[args.politicianId] = edge;
  }
}

export function organizationPressureForBill(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  billId: string,
): number {
  let acc = 0;
  for (const actor of Object.values(state.organizationRuntime.actors)) {
    const hit = actor.billPressure.find((p) => p.billId === billId);
    if (!hit) continue;
    const rel = actor.relationships[politicianId]?.affinity ?? 0;
    const sign = hit.stance === "support" ? 1 : hit.stance === "oppose" ? -1 : 0;
    acc += sign * hit.strength * (0.45 + rel * 0.25) * 0.1;
  }
  void world;
  return Math.max(-0.12, Math.min(0.12, acc));
}

export function processOrganizationsMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.organizationRuntime.lastMonthProcessed === month) return [];
  if (Object.keys(state.organizationRuntime.actors).length === 0) {
    const seeded = seedOrganizationRuntime(world.interestOrganizations);
    state.organizationRuntime.actors = seeded.actors;
  }
  state.organizationRuntime.meetingsThisMonth = 0;
  const events: SimEvent[] = [];
  const activeBills = Object.values(state.legislatureRuntime.bills)
    .filter(
      (b) =>
        b.status === "committee" ||
        b.status === "floor_scheduled" ||
        b.status === "sent_to_president",
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const campaigns = Object.values(state.campaignRuntime.campaigns)
    .filter((c) => c.status === "active" || c.status === "exploring")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const confidence = state.economyRuntime.national.confidenceIndex;

  for (const orgId of Object.keys(world.interestOrganizations).sort()) {
    const canon = world.interestOrganizations[orgId]!;
    const actor = state.organizationRuntime.actors[orgId];
    if (!actor) continue;
    for (const endorsement of actor.endorsements) {
      if ((endorsement.status ?? "active") !== "active") continue;
      const campaign = endorsement.campaignId
        ? state.campaignRuntime.campaigns[endorsement.campaignId]
        : null;
      const relationship = actor.relationships[endorsement.politicianId];
      const campaignEnded = campaign != null && !["active", "exploring"].includes(campaign.status);
      const relationshipCollapsed =
        (relationship?.policyAlignment ?? 0) <= -0.45 || (relationship?.trust ?? 0) <= -0.4;
      if (!campaignEnded && !relationshipCollapsed) continue;
      endorsement.status = "withdrawn";
      endorsement.withdrawnDate = state.currentDate;
      const reason = relationshipCollapsed
        ? "Withdrew an endorsement after a sustained policy break"
        : "Closed an endorsement after the campaign ended";
      note(actor, state.currentDate, "endorsement_withdrawn", reason);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "ORGANIZATION_ENDORSEMENT_WITHDRAWN",
          importance: relationshipCollapsed ? 0.58 : 0.3,
          visibility: "public",
          actorIds: [endorsement.politicianId],
          entityIds: [orgId, ...(endorsement.campaignId ? [endorsement.campaignId] : [])],
          payload: {
            organizationId: orgId,
            politicianId: endorsement.politicianId,
            campaignId: endorsement.campaignId,
            reason: relationshipCollapsed ? "policy_break" : "campaign_ended",
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
    actor.billPressure = actor.billPressure.filter((p) =>
      activeBills.some((b) => b.id === p.billId),
    );
    if (actor.cooldownUntil && actor.cooldownUntil > state.currentDate) continue;
    if (rng.float01("npc-decisions") > 0.42 + canon.strength * 0.2) continue;
    const relevant = activeBills
      .filter((b) => b.policyItems.some((i) => canon.issues.includes(i.issueId)))
      .sort((a, b) => {
        const priority = (status: string) =>
          status === "sent_to_president" ? 3 : status === "floor_scheduled" ? 2 : 1;
        const fit = (bill: typeof a) =>
          Math.max(
            ...bill.policyItems
              .filter((item) => canon.issues.includes(item.issueId))
              .map((item) => Math.abs(orgIssueFit(world, orgId, item.issueId) * item.direction)),
            0,
          );
        return (
          priority(b.status) - priority(a.status) ||
          fit(b) - fit(a) ||
          (b.introducedDate ?? "").localeCompare(a.introducedDate ?? "") ||
          a.id.localeCompare(b.id)
        );
      })
      .slice(0, 4);
    if (relevant.length > 0) {
      const bill = relevant[0]!;
      const item =
        bill.policyItems.find((i) => canon.issues.includes(i.issueId)) ?? bill.policyItems[0]!;
      const fit = orgIssueFit(world, orgId, item.issueId) * item.direction;
      const stance: OrganizationStance = fit > 0.12 ? "support" : fit < -0.12 ? "oppose" : "watch";
      const strength = Math.min(1, canon.strength * (0.5 + Math.abs(fit) * 0.4));
      actor.billPressure = actor.billPressure.filter((p) => p.billId !== bill.id);
      actor.billPressure.push({ billId: bill.id, stance, strength });
      note(
        actor,
        state.currentDate,
        "lobby",
        stance === "watch"
          ? `Monitoring ${bill.title}`
          : `${stance === "support" ? "Supporting" : "Opposing"} ${bill.title}`,
      );
      actor.lastActionMonth = month;
      actor.cooldownUntil = addMonths(state.currentDate, 1);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "ORGANIZATION_ACTION",
          importance: 0.4 + canon.strength * 0.2,
          visibility: "public",
          actorIds: [],
          entityIds: [orgId, bill.id],
          payload: { organizationId: orgId, billId: bill.id, stance, kind: "lobby" },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
      continue;
    }
    if (campaigns.length > 0 && rng.float01("npc-decisions") < 0.22 * canon.strength) {
      const campaign = campaigns.find((c) => {
        const party = state.politicians[c.politicianId]?.partyId;
        return party != null && canon.leanPartyIds.includes(party);
      });
      if (
        campaign &&
        !actor.endorsements.some(
          (e) => e.politicianId === campaign.politicianId && (e.status ?? "active") === "active",
        )
      ) {
        actor.endorsements.push({
          politicianId: campaign.politicianId,
          campaignId: campaign.id,
          date: state.currentDate,
          public: true,
          status: "active",
          withdrawnDate: null,
        });
        const standing = ensureCandidateStanding(world, state, campaign.politicianId);
        standing.favorability = clampUnit(standing.favorability + 0.012 * canon.strength);
        standing.enthusiasm = Math.min(1, standing.enthusiasm + 0.01 * canon.strength);
        campaign.cashOnHand = Math.min(
          50_000_000,
          campaign.cashOnHand + Math.round(8000 * canon.strength),
        );
        note(actor, state.currentDate, "endorse", `Endorsed a campaign`);
        actor.cooldownUntil = addMonths(state.currentDate, 2);
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "ORGANIZATION_ENDORSEMENT",
            importance: 0.55,
            visibility: "public",
            actorIds: [campaign.politicianId],
            entityIds: [orgId, campaign.id],
            payload: { organizationId: orgId, politicianId: campaign.politicianId },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
    }
    if (confidence < 96 && rng.float01("npc-decisions") < 0.2) {
      note(actor, state.currentDate, "economy", "Raised concern about economic conditions");
      actor.cooldownUntil = addMonths(state.currentDate, 1);
    }
  }

  // Same-month foreign reactions are applied after foreign affairs via
  // processOrganizationForeignReactions. Do not scan history here — foreign events
  // have not been generated yet in the turn order.

  state.organizationRuntime.lastMonthProcessed = month;
  return events;
}
