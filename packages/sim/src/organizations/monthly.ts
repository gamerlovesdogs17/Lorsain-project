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

function orgIssueFit(
  world: KernelWorld,
  orgId: string,
  issueId: string,
): number {
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
    if (type.includes("manufactur") || type.includes("farm") || type.includes("maritime")) return -0.25;
  }
  if (issueId === "ISS_HOUSING" && type.includes("municipal")) return 0.45;
  if (issueId === "ISS_TRADE") {
    if (type.includes("maritime") || type.includes("farm") || type.includes("manufactur")) return 0.4;
  }
  return 0.25;
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
    actor.billPressure = actor.billPressure.filter((p) =>
      activeBills.some((b) => b.id === p.billId),
    );
    if (actor.cooldownUntil && actor.cooldownUntil > state.currentDate) continue;
    if (rng.float01("npc-decisions") > 0.42 + canon.strength * 0.2) continue;
    const relevant = activeBills
      .filter((b) => b.policyItems.some((i) => canon.issues.includes(i.issueId)))
      .slice(0, 4);
    if (relevant.length > 0) {
      const bill = relevant[0]!;
      const item = bill.policyItems.find((i) => canon.issues.includes(i.issueId)) ?? bill.policyItems[0]!;
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
      if (campaign && !actor.endorsements.some((e) => e.politicianId === campaign.politicianId)) {
        actor.endorsements.push({
          politicianId: campaign.politicianId,
          campaignId: campaign.id,
          date: state.currentDate,
          public: true,
        });
        const standing = ensureCandidateStanding(world, state, campaign.politicianId);
        standing.favorability = clampUnit(standing.favorability + 0.012 * canon.strength);
        standing.enthusiasm = Math.min(1, standing.enthusiasm + 0.01 * canon.strength);
        campaign.cashOnHand = Math.min(50_000_000, campaign.cashOnHand + Math.round(8000 * canon.strength));
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

  const foreignEvents = state.history.filter(
    (e) =>
      e.date === state.currentDate &&
      e.visibility === "public" &&
      (e.type.includes("SANCTION") ||
        e.type.includes("INTERNATIONAL_CONFLICT") ||
        e.type === "FOREIGN_CRISIS_ESCALATED"),
  );
  for (const ev of foreignEvents.slice(0, 2)) {
    for (const [orgId, actor] of Object.entries(state.organizationRuntime.actors)) {
      const canon = world.interestOrganizations[orgId];
      if (!canon) continue;
      const type = canon.type.toLowerCase();
      if (!type.includes("advocacy") && !type.includes("business") && !type.includes("maritime")) {
        continue;
      }
      if (ev.type.includes("SANCTION") && type.includes("business")) {
        note(actor, state.currentDate, "foreign", "Business groups warn on sanctions fallout");
      } else if (ev.type.includes("CONFLICT") && type.includes("advocacy")) {
        note(actor, state.currentDate, "foreign", "Advocates call for de-escalation abroad");
      }
    }
  }

  state.organizationRuntime.lastMonthProcessed = month;
  return events;
}
