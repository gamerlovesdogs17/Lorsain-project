import { padId, pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { partyPlatformIssueForBillItem } from "../parties/platforms.js";
import { ensurePoliticsRuntime } from "./state.js";
import { AS_MAX_ORG_CAMPAIGNS_PER_MONTH } from "./types.js";

function scoreKey(orgId: string, politicianId: string, issueId: string): string {
  return `${orgId}|${politicianId}|${issueId}`;
}

/**
 * Org scorecards from voting record; issue-specific campaigns/endorsements.
 */
export function processOrganizationPoliticsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  const orgs = Object.values(world.interestOrganizations ?? {}).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (orgs.length === 0) return events;

  const recentVotes = Object.values(state.legislatureRuntime.legislativeVotes)
    .filter((v) => v.stage === "floor" || v.stage === "repassage")
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 24);

  for (const vote of recentVotes) {
    const bill = state.legislatureRuntime.bills[vote.billId];
    if (!bill || bill.policyItems.length === 0) continue;
    for (const item of bill.policyItems) {
      const platformIssue = partyPlatformIssueForBillItem(item.issueId, item.provisionId);
      for (const org of orgs) {
        if (!org.issues.includes(item.issueId) && !org.issues.includes(platformIssue)) continue;
        const orgLean =
          org.lean === "left" || org.type.includes("union") ? 1 : org.lean === "right" ? -1 : 0;
        const desired =
          item.direction * item.magnitude * (orgLean === 0 ? 1 : orgLean) >= 0 ? "yes" : "no";
        for (const [politicianId, choice] of Object.entries(vote.votes)) {
          if (choice === "abstain") continue;
          const key = scoreKey(org.id, politicianId, item.issueId);
          const existing = runtime.orgScorecards[key] ?? {
            orgId: org.id,
            politicianId,
            issueId: item.issueId,
            score: 0,
            votesCounted: 0,
            lastUpdated: state.currentDate,
          };
          const delta = choice === desired ? 0.08 : -0.08;
          existing.score = Math.max(-1, Math.min(1, existing.score + delta));
          existing.votesCounted += 1;
          existing.lastUpdated = state.currentDate;
          runtime.orgScorecards[key] = existing;
        }
      }
    }
  }

  // Issue campaigns: pick up to AS_MAX_ORG_CAMPAIGNS_PER_MONTH.
  for (const org of orgs) {
    if (runtime.activityThisMonth.orgCampaigns >= AS_MAX_ORG_CAMPAIGNS_PER_MONTH) break;
    if (rng.float01("npc-decisions") > 0.18) continue;
    const actor = state.organizationRuntime.actors[org.id];
    if (!actor) continue;
    const issueId = org.issues.slice().sort()[0];
    if (!issueId) continue;

    const scorecards = Object.values(runtime.orgScorecards)
      .filter((s) => s.orgId === org.id && s.issueId === issueId)
      .sort((a, b) => b.score - a.score || a.politicianId.localeCompare(b.politicianId));
    const ally = scorecards.find((s) => s.score >= 0.25);
    const foe = scorecards
      .slice()
      .sort((a, b) => a.score - b.score || a.politicianId.localeCompare(b.politicianId))
      .find((s) => s.score <= -0.25);

    const endorseAlly = ally && rng.float01("npc-decisions") < 0.55;
    const target = endorseAlly ? ally : foe;
    if (!target) continue;

    const campaignId = padId("ORGCAMP", state.counters.nextOrgActionId++);
    const stance = endorseAlly ? "support" : "oppose";
    runtime.orgCampaigns[campaignId] = {
      id: campaignId,
      orgId: org.id,
      issueId,
      stance,
      targetPoliticianId: target.politicianId,
      startedDate: state.currentDate,
      status: "active",
      summary: `${org.name} ${stance}s ${target.politicianId} on ${issueId}`,
    };
    runtime.activityThisMonth.orgCampaigns += 1;

    if (endorseAlly && ally) {
      const already = actor.endorsements.some(
        (e) => e.politicianId === ally.politicianId && (e.status ?? "active") === "active",
      );
      if (!already) {
        actor.endorsements.push({
          politicianId: ally.politicianId,
          campaignId: null,
          date: state.currentDate,
          public: true,
          status: "active",
          withdrawnDate: null,
        });
      }
    }

    actor.recentActions.push({
      date: state.currentDate,
      kind: "issue_campaign",
      summary: runtime.orgCampaigns[campaignId]!.summary,
    });
    if (actor.recentActions.length > 12)
      actor.recentActions.splice(0, actor.recentActions.length - 12);

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ORG_ISSUE_CAMPAIGN",
        importance: 0.4,
        visibility: "public",
        actorIds: target.politicianId ? [target.politicianId] : [],
        entityIds: [org.id, campaignId],
        payload: {
          orgId: org.id,
          issueId,
          stance,
          politicianId: target.politicianId,
          campaignId,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
