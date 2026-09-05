/**
 * Campaign situations registry — Phase 11.4 flavor content.
 *
 * Each `CampaignSituationTemplate` may fire at most once per NPC campaign per
 * month via `pickCampaignSituation`. Templates use simple campaign-state
 * predicates only; no new engine systems or state are introduced. Event wiring
 * reuses existing CAMPAIGN_MESSAGE / CAMPAIGN_ATTACK history types so saves
 * remain fully backward-compatible.
 */
import type { RngService } from "../rng.js";
import type { CampaignState } from "./types.js";

// ---------------------------------------------------------------------------
// Context struct — built from CampaignState + caller-supplied election info
// ---------------------------------------------------------------------------

export type SituationContext = {
  /** Cash on hand in the current currency unit. */
  cashOnHand: number;
  /**
   * Whole months remaining until the relevant election, or null when the
   * campaign has no linked election date.
   */
  monthsToElection: number | null;
  /**
   * Current momentum value from the candidate's ElectionStanding, if the
   * caller fetched it. Defaults to 0 when unavailable.
   */
  momentum: number;
  /** Normalised field-organization strength [0, 1]. */
  fieldOrganization: number;
};

// ---------------------------------------------------------------------------
// Template type
// ---------------------------------------------------------------------------

export type CampaignSituationTemplate = {
  /** Stable identifier used in payloads and tests. */
  id: string;
  /**
   * Title variant pool. The caller picks one deterministically via
   * `pickSituationTitle`; keep titles short enough for a news-ticker.
   */
  titles: string[];
  /**
   * Pure predicate: return true when the situation may apply to the context.
   * Keep logic simple — no side-effects, no world lookups.
   */
  whenApplicable: (ctx: SituationContext) => boolean;
  /**
   * Maps to an existing history event type so no new engine plumbing is
   * needed.
   */
  eventType: "CAMPAIGN_MESSAGE" | "CAMPAIGN_ATTACK";
  /** History event importance [0, 1]. */
  importance: number;
  /**
   * Optional standing nudge applied by the caller after emitting the event.
   * Values must stay inside the existing clamp envelopes (±0.15 max each).
   */
  standingDelta?: { favorability?: number; momentum?: number };
};

// ---------------------------------------------------------------------------
// Registry — 8 situations
// ---------------------------------------------------------------------------

export const CAMPAIGN_SITUATIONS: CampaignSituationTemplate[] = [
  {
    id: "controversy",
    titles: [
      "Campaign controversy draws media scrutiny",
      "Rival camp seizes on campaign misstep",
      "Gaffe forces rapid damage control",
      "Surrogate remarks spark criticism",
    ],
    whenApplicable: ({ momentum }) => momentum < -0.04,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.55,
    standingDelta: { momentum: -0.03 },
  },
  {
    id: "endorsement_fight",
    titles: [
      "Competing bids for key organizational endorsement",
      "Labor bloc weighs rival campaign pitches",
      "Endorsement council meeting draws crowded room",
      "Advocacy groups split on preferred candidate",
    ],
    whenApplicable: ({ monthsToElection }) =>
      monthsToElection != null && monthsToElection >= 3 && monthsToElection <= 10,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.45,
  },
  {
    id: "volunteer_surge",
    titles: [
      "Volunteer surge energizes field operation",
      "Grassroots momentum lifts ground game",
      "Canvassers flood key precincts after rally",
      "Online sign-up wave doubles door-knock capacity",
    ],
    whenApplicable: ({ fieldOrganization }) => fieldOrganization >= 0.34,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.4,
    standingDelta: { momentum: 0.02 },
  },
  {
    id: "fundraising_shortfall",
    titles: [
      "Fundraising shortfall forces ad-buy cuts",
      "Cash crunch limits outreach in key markets",
      "Campaign trims travel schedule amid budget strain",
      "Donor fatigue sets in as contributions slow",
    ],
    whenApplicable: ({ cashOnHand }) => cashOnHand < 15_000,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.5,
    standingDelta: { momentum: -0.02 },
  },
  {
    id: "debate_moment",
    titles: [
      "Debate exchange reverberates through the race",
      "Memorable debate line shapes coverage for days",
      "Post-debate spin rooms work overtime",
      "Clip from debate goes viral, shifts news cycle",
    ],
    whenApplicable: ({ momentum }) => momentum > 0.04,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.5,
    standingDelta: { favorability: 0.01 },
  },
  {
    id: "opposition_attack",
    titles: [
      "Rivals launch coordinated attack on record",
      "Negative contrast ads blitz key demographics",
      "Opposition research drops ahead of critical stretch",
      "Dark-money effort targets swing voters with contrast messaging",
    ],
    whenApplicable: ({ monthsToElection }) => monthsToElection != null && monthsToElection >= 2,
    eventType: "CAMPAIGN_ATTACK",
    importance: 0.52,
    standingDelta: { momentum: -0.02 },
  },
  {
    id: "gotv_push",
    titles: [
      "GOTV operation mobilizes base voters",
      "Door-knocking blitz targets high-turnout precincts",
      "Phone-bank volunteers hit final-stretch targets",
      "Early-vote chase narrows enthusiasm gap",
    ],
    whenApplicable: ({ monthsToElection }) =>
      monthsToElection != null && monthsToElection <= 2 && monthsToElection >= 1,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.48,
    standingDelta: { momentum: 0.02 },
  },
  {
    id: "final_week_scramble",
    titles: [
      "Campaign sprints through final days on borrowed energy",
      "Candidate logs marathon schedule in closing stretch",
      "Last-minute ad push drains campaign reserves",
      "Election-eve rally draws largest crowd of the cycle",
    ],
    whenApplicable: ({ monthsToElection, cashOnHand }) =>
      monthsToElection != null && monthsToElection < 1 && cashOnHand > 5_000,
    eventType: "CAMPAIGN_MESSAGE",
    importance: 0.6,
    standingDelta: { momentum: 0.03 },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to pick a situation for a campaign this month.
 *
 * Returns null on most calls (base probability ≈ 8%). When a situation fires,
 * returns the first applicable template drawn deterministically via `rng`.
 * Call order: one float01 for the probability gate, one for index selection.
 */
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

/**
 * Pick one title variant from a template. The choice is deterministic given
 * a seeded RNG; callers consume one float01("campaigns") call.
 */
export function pickSituationTitle(situation: CampaignSituationTemplate, rng: RngService): string {
  const idx = Math.floor(rng.float01("campaigns") * situation.titles.length);
  return situation.titles[idx] ?? situation.titles[0]!;
}
