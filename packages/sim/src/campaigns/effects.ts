import type { IsoDate } from "../calendar.js";
import { parseIsoDate, formatIsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import { getAgentProfile } from "../agents/profile.js";
import { activeTermsForPolitician } from "../offices.js";
import { candidateStandingOrDefault, ensureCandidateStanding } from "../elections/standing.js";
import { clamp01, clampUnit } from "../elections/policy.js";
import { DIMINISHING, MOMENTUM, PUBLIC_EFFECT_CLAMP, STANDING_DELTA } from "./policy.js";
import type { CampaignEffect, CampaignState } from "./types.js";

export function monthStart(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate(year, month, 1);
}

export function clampPublicDelta(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-PUBLIC_EFFECT_CLAMP, Math.min(PUBLIC_EFFECT_CLAMP, n));
}

export function diminishingScale(campaign: CampaignState, key: string, date: IsoDate): number {
  const month = monthStart(date);
  let hits = 0;
  for (const e of campaign.recentEffects) {
    if (e.kind !== key) continue;
    const { year: ey, month: em } = parseIsoDate(e.date);
    const { year: cy, month: cm } = parseIsoDate(month);
    const lag = (cy - ey) * 12 + (cm - em);
    if (lag >= 0 && lag < DIMINISHING.sameKeyMonths) hits += 1;
  }
  return Math.pow(DIMINISHING.halfLife, hits);
}

export function pushEffect(campaign: CampaignState, effect: CampaignEffect): void {
  campaign.recentEffects = [...campaign.recentEffects, effect].slice(-DIMINISHING.recentLimit);
}

export function applyStandingDelta(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  patch: {
    nameRecognition?: number;
    favorability?: number;
    enthusiasm?: number;
    momentum?: number;
  },
): void {
  const cur = ensureCandidateStanding(world, state, politicianId);
  if (patch.nameRecognition)
    cur.nameRecognition = clamp01(cur.nameRecognition + clampPublicDelta(patch.nameRecognition));
  if (patch.favorability)
    cur.favorability = clampUnit(cur.favorability + clampPublicDelta(patch.favorability));
  if (patch.enthusiasm)
    cur.enthusiasm = clamp01(cur.enthusiasm + clampPublicDelta(patch.enthusiasm));
  if (patch.momentum) cur.momentum = clampUnit(cur.momentum + clampPublicDelta(patch.momentum));
}

export function decayMomentum(world: KernelWorld, state: SimState, politicianId: string): void {
  const cur = candidateStandingOrDefault(world, state, politicianId);
  if (cur.momentum === 0 && !state.candidateStanding[politicianId]) return;
  const live = ensureCandidateStanding(world, state, politicianId);
  live.momentum = clampUnit(live.momentum * MOMENTUM.monthlyDecay);
}

export function officeProminence(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): number {
  const terms = activeTermsForPolitician(state, politicianId);
  let p = 0;
  for (const t of terms) {
    const kind = world.offices[t.officeId]?.kind;
    if (kind === "president") p = Math.max(p, 1);
    else if (kind === "minister") p = Math.max(p, 0.55);
    else if (kind === "governor") p = Math.max(p, 0.45);
    else if (kind === "assembly_member") p = Math.max(p, 0.22);
  }
  return p;
}

export function ownSkill(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  skill: "fundraising" | "campaigning" | "media",
): number {
  return getAgentProfile(world, state, politicianId)?.skills[skill] ?? 0.4;
}

export function ownTrait(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  trait: "ambition" | "riskTolerance" | "ego" | "pragmatism" | "institutionalism" | "partyLoyalty",
): number {
  return getAgentProfile(world, state, politicianId)?.traits[trait] ?? 0.5;
}

export function actionPointMax(world: KernelWorld, state: SimState, politicianId: string): number {
  const bonus = officeProminence(world, state, politicianId) >= 0.5 ? 1 : 0;
  return Math.min(3, 2 + bonus);
}

export function standingPublicScore(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): number {
  const s = candidateStandingOrDefault(world, state, politicianId);
  return s.nameRecognition * 0.35 + ((s.favorability + 1) / 2) * 0.45 + s.enthusiasm * 0.2;
}

export { STANDING_DELTA };
