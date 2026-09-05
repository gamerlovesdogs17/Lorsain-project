/**
 * Campaign situations registry — Phase 11.4 flavor content.
 *
 * Titles are state-based interpretations or generic framing only.
 * They must NOT invent concrete events (debates, endorsements, rallies,
 * dark-money ads, doubled capacity) that the simulation did not record.
 */
import type { RngService } from "../rng.js";
import type { CampaignState } from "./types.js";

export type SituationContext = {
  cashOnHand: number;
  monthsToElection: number | null;
  momentum: number;
  fieldOrganization: number;
};

export type CampaignSituationTemplate = {
  id: string;
  titles: string[];
  whenApplicable: (ctx: SituationContext) => boolean;
  eventType: "CAMPAIGN_MESSAGE" | "CAMPAIGN_ATTACK";
  importance: number;
  standingDelta?: { favorability?: number; momentum?: number };
};

export const CAMPAIGN_SITUATIONS: CampaignSituationTemplate[] = [
  {
    id: "controversy",
    titles: [
      "Campaign faces mounting press scrutiny",
      "Public standing softens amid campaign pressure",
      "Message discipline becomes a campaign priority",
      "Opponents highlight recent campaign weakness",
    ],
    whenApplicable: ({ momentum }) => momentum < -0.04,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.55,
    standingDelta: { momentum: -0.03 },
  },
  {
    id: "endorsement_fight",
    titles: [
      "Organizational support remains contested in the race",
      "Interest groups watch the campaign closely",
      "Candidate courts institutional backers",
      "Pressure grows for clearer organizational allegiances",
    ],
    whenApplicable: ({ monthsToElection }) =>
      monthsToElection != null && monthsToElection >= 3 && monthsToElection <= 10,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.45,
  },
  {
    id: "volunteer_surge",
    titles: [
      "Field organization shows measurable strength",
      "Ground game capacity supports wider outreach",
      "Organized volunteers bolster the campaign footprint",
      "Local organization remains a campaign asset",
    ],
    whenApplicable: ({ fieldOrganization }) => fieldOrganization >= 0.34,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.4,
    standingDelta: { momentum: 0.02 },
  },
  {
    id: "fundraising_shortfall",
    titles: [
      "Cash on hand constrains campaign options",
      "Budget pressure limits paid outreach",
      "Fundraising pace falls behind campaign needs",
      "Spending choices tighten under cash constraints",
    ],
    whenApplicable: ({ cashOnHand }) => cashOnHand < 15_000,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.5,
    standingDelta: { momentum: -0.02 },
  },
  {
    id: "momentum_lift",
    titles: [
      "Campaign momentum improves in public standing",
      "Recent campaign activity lifts perceived trajectory",
      "Favorable stretch strengthens campaign confidence",
      "Standing indicators move in the campaign's favor",
    ],
    whenApplicable: ({ momentum }) => momentum > 0.04,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.5,
    standingDelta: { favorability: 0.01 },
  },
  {
    id: "opposition_attack",
    titles: [
      "Rivals intensify contrast messaging",
      "Opposition pressure rises as the race tightens",
      "Competing campaigns sharpen public criticism",
      "Negative framing becomes more prominent in the race",
    ],
    whenApplicable: ({ monthsToElection }) => monthsToElection != null && monthsToElection >= 2,
    eventType: "CAMPAIGN_ATTACK",
    importance: 0.52,
    standingDelta: { momentum: -0.02 },
  },
  {
    id: "gotv_push",
    titles: [
      "Campaign emphasizes late-stage voter contact",
      "Field effort concentrates on turnout-prone areas",
      "Organization shifts toward closing-month outreach",
      "Ground game focuses on high-priority precincts",
    ],
    whenApplicable: ({ monthsToElection }) =>
      monthsToElection != null && monthsToElection <= 2 && monthsToElection >= 1,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.48,
    standingDelta: { momentum: 0.02 },
  },
  {
    id: "final_stretch",
    titles: [
      "Campaign enters the closing stretch of the cycle",
      "Final months intensify schedule and spending choices",
      "Election month approaches with active campaigning",
      "Closing period concentrates remaining campaign resources",
    ],
    whenApplicable: ({ monthsToElection, cashOnHand }) =>
      monthsToElection != null && monthsToElection < 1 && cashOnHand > 5_000,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.6,
    standingDelta: { momentum: 0.03 },
  },
];

export function pickCampaignSituation(
  _campaign: CampaignState,
  ctx: SituationContext,
  rng: RngService,
): CampaignSituationTemplate | null {
  if (rng.float01("campaigns") > 0.08) return null;
  const applicable = CAMPAIGN_SITUATIONS.filter((s) => s.whenApplicable(ctx));
  if (applicable.length === 0) return null;
  const idx = Math.floor(rng.float01("campaigns") * applicable.length);
  return applicable[idx] ?? null;
}

export function pickSituationTitle(situation: CampaignSituationTemplate, rng: RngService): string {
  const idx = Math.floor(rng.float01("campaigns") * situation.titles.length);
  return situation.titles[idx] ?? situation.titles[0]!;
}
