import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { parseIsoDate } from "../calendar.js";
import { pushHistory } from "../scheduler.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import { DEBATE, STANDING_DELTA } from "./policy.js";
import { allocateDebateId } from "./state.js";
import { applyStandingDelta, ownSkill } from "./effects.js";
import type { CampaignType, DebateState } from "./types.js";

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
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  ];
  return { debate, events };
}
