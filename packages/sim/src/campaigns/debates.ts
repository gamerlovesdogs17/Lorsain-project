import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { parseIsoDate } from "../calendar.js";
import { pushHistory } from "../scheduler.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import { DEBATE, STANDING_DELTA } from "./policy.js";
import { allocateDebateId } from "./state.js";
import { applyStandingDelta, ownSkill } from "./effects.js";
import type { CampaignType, DebateState } from "./types.js";

// ---------------------------------------------------------------------------
// Phase 11.4 — Debate narrative flavor
// ---------------------------------------------------------------------------

/**
 * Notable moment strings drawn when a debate is resolved.
 * Index is chosen deterministically from the spread score so wider wins
 * produce more emphatic moments. Does not affect who wins.
 */
const DEBATE_NOTABLE_MOMENTS: string[] = [
  "Exchange on economic policy drew sustained applause",
  "Candidate's crisp healthcare answer shifted viewer dials",
  "Pointed defense on foreign policy credentials dominated post-debate coverage",
  "Back-and-forth on fiscal discipline lingered in commentary",
  "Closing statement landed as the strongest of the night",
  "Moderator clash overshadowed the substantive exchange",
  "Memorable one-liner spread rapidly through social channels",
  "Detailed infrastructure plan earned rare cross-aisle praise",
];

/**
 * Issue-id → emphasis label registry. Fallback: generic "policy contrast".
 */
const DEBATE_ISSUE_EMPHASES: Record<string, string> = {
  ISS_ECONOMY: "economic policy",
  ISS_HEALTHCARE: "healthcare access",
  ISS_CLIMATE: "climate and energy",
  ISS_FOREIGN: "foreign policy",
  ISS_LABOR: "workers' rights",
  ISS_HOUSING: "housing affordability",
  ISS_TRADE: "trade competitiveness",
  ISS_SECURITY: "national security",
  ISS_EDUCATION: "education funding",
  ISS_WELFARE: "social welfare",
};

/**
 * Pick a notable moment string deterministically from spread magnitude and
 * a secondary rng draw. No state mutation.
 */
function pickNotableMoment(spread: number, rng: RngService): string {
  // Wider wins → higher-drama moments (latter half of the array).
  const drama = Math.floor(Math.min(1, Math.max(0, spread)) * (DEBATE_NOTABLE_MOMENTS.length - 1));
  // Add a secondary jitter so identical spreads still vary.
  const jitter = Math.floor(rng.float01("campaigns") * 2);
  const idx = Math.min(DEBATE_NOTABLE_MOMENTS.length - 1, drama + jitter);
  return DEBATE_NOTABLE_MOMENTS[idx]!;
}

/**
 * Pick an issue emphasis label from the world's issue list deterministically.
 */
function pickDebateEmphasis(world: KernelWorld, winnerId: string, rng: RngService): string {
  // Bias toward an issue by using the winner's id as a hash seed for stability.
  const ids = world.issueIds.slice().sort();
  if (ids.length === 0) return "policy contrast";
  const seed =
    winnerId.split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) | 0) >>> 0, 0) % ids.length;
  const picked = ids[(seed + Math.floor(rng.float01("campaigns") * 2)) % ids.length]!;
  return DEBATE_ISSUE_EMPHASES[picked] ?? "policy contrast";
}

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function gauss01(rng: RngService): number {
  const u1 = Math.max(1e-12, rng.float01("campaigns"));
  const u2 = rng.float01("campaigns");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function shouldHoldDebate(date: string, type: CampaignType): boolean {
  const month = parseIsoDate(date).month;
  if (type === "presidential_nomination") {
    return (DEBATE.nominationMonths as readonly number[]).includes(month);
  }
  if (type === "presidential_general") {
    return (DEBATE.generalMonths as readonly number[]).includes(month);
  }
  return false;
}

export function holdDebate(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    campaignType: CampaignType;
    contestId: string | null;
    electionId: string | null;
    participantIds: string[];
    commandId: string | null;
  },
): { debate: DebateState; events: SimEvent[] } | { error: CommandError } {
  const ids = [...new Set(args.participantIds)].sort();
  if (ids.length < 2) return { error: reject("INSUFFICIENT_CANDIDATES", "debate needs two") };
  const scores: Record<string, number> = {};
  for (const id of ids) {
    const campaign = Object.values(state.campaignRuntime.campaigns).find(
      (c) =>
        c.politicianId === id &&
        c.type === args.campaignType &&
        (c.status === "active" || c.status === "exploring"),
    );
    const prep = campaign?.debatePrep ?? 0;
    const media = ownSkill(world, state, id, "media");
    const standing = candidateStandingOrDefault(world, state, id);
    const score =
      prep * DEBATE.prepWeight +
      media * DEBATE.mediaWeight +
      ((standing.favorability + 1) / 2) * DEBATE.standingWeight +
      gauss01(rng) * DEBATE.noiseAmp;
    scores[id] = score;
    if (campaign) campaign.debatePrep = Math.max(0, campaign.debatePrep * 0.35);
  }
  const ranked = [...ids].sort((a, b) =>
    scores[b]! - scores[a]! ? scores[b]! - scores[a]! : a < b ? -1 : 1,
  );
  const winnerId = ranked[0]!;
  const debate: DebateState = {
    id: allocateDebateId(state),
    date: state.currentDate,
    campaignType: args.campaignType,
    contestId: args.contestId,
    electionId: args.electionId,
    participantIds: ids,
    scores,
    winnerId,
    status: "held",
    metadata: {},
  };
  state.campaignRuntime.debates[debate.id] = debate;
  const spread = (scores[winnerId] ?? 0) - (scores[ranked[ranked.length - 1]!] ?? 0);
  const mag = STANDING_DELTA.debate * (0.55 + Math.min(1, Math.max(0, spread)));
  applyStandingDelta(world, state, winnerId, {
    favorability: mag * 0.7,
    momentum: mag * 0.5,
    enthusiasm: mag * 0.4,
  });
  for (const id of ids) {
    if (id === winnerId) continue;
    applyStandingDelta(world, state, id, { momentum: -mag * 0.15 });
  }

  // Phase 11.4: flavor strings that describe the debate without changing math.
  const notableMoment = pickNotableMoment(spread, rng);
  const emphasis = pickDebateEmphasis(world, winnerId, rng);

  const events = [
    pushHistory(state, {
      date: state.currentDate,
      type: "DEBATE_HELD",
      importance: 0.7,
      visibility: "public",
      actorIds: ids,
      entityIds: [debate.id],
      payload: {
        debateId: debate.id,
        winnerId,
        scores,
        contestId: args.contestId,
        electionId: args.electionId,
        notableMoment,
        emphasis,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];
  return { debate, events };
}
