import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import {
  emptyCampaignRuntime,
  isCampaignStatus,
  isCampaignType,
  type CampaignRuntime,
  type CampaignState,
  type DebateState,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function finite01(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function parseCampaignRuntime(raw: unknown): CampaignRuntime | string {
  if (raw == null) return emptyCampaignRuntime();
  if (!isRecord(raw)) return "campaignRuntime must be an object";
  const campaignsRaw = isRecord(raw.campaigns) ? raw.campaigns : {};
  const debatesRaw = isRecord(raw.debates) ? raw.debates : {};
  const campaigns: Record<string, CampaignState> = {};
  for (const [id, rec] of Object.entries(campaignsRaw)) {
    const parsed = parseCampaign(id, rec);
    if (typeof parsed === "string") return parsed;
    campaigns[id] = parsed;
  }
  const debates: Record<string, DebateState> = {};
  for (const [id, rec] of Object.entries(debatesRaw)) {
    const parsed = parseDebate(id, rec);
    if (typeof parsed === "string") return parsed;
    debates[id] = parsed;
  }
  let lastMonthProcessed: string | null = null;
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "campaignRuntime.lastMonthProcessed";
    }
    lastMonthProcessed = raw.lastMonthProcessed;
  }
  return { campaigns, debates, lastMonthProcessed };
}

function parseCampaign(id: string, raw: unknown): CampaignState | string {
  if (!isRecord(raw)) return `campaigns.${id}`;
  if (raw.id !== id) return `campaigns.${id} id mismatch`;
  if (parseCanonicalAllocatedId("CAMP", id) == null) return `campaigns.${id} id`;
  if (typeof raw.politicianId !== "string") return `campaigns.${id} politicianId`;
  if (typeof raw.type !== "string" || !isCampaignType(raw.type)) return `campaigns.${id} type`;
  if (typeof raw.status !== "string" || !isCampaignStatus(raw.status))
    return `campaigns.${id} status`;
  if (!isIsoDate(raw.launchedDate)) return `campaigns.${id} launchedDate`;
  if (raw.endedDate != null && !isIsoDate(raw.endedDate)) return `campaigns.${id} endedDate`;
  if (!isInt(raw.cashOnHand) || raw.cashOnHand < 0) return `campaigns.${id} cashOnHand`;
  if (!isInt(raw.totalRaised) || raw.totalRaised < 0) return `campaigns.${id} totalRaised`;
  if (!isInt(raw.totalSpent) || raw.totalSpent < 0) return `campaigns.${id} totalSpent`;
  if (
    !finite01(raw.fundraisingCapacity) ||
    !finite01(raw.fieldOrganization) ||
    !finite01(raw.mediaCapacity)
  ) {
    return `campaigns.${id} capacities`;
  }
  if (!isInt(raw.actionPointsRemaining) || raw.actionPointsRemaining < 0) {
    return `campaigns.${id} actionPointsRemaining`;
  }
  if (!isInt(raw.actionPointsMax) || raw.actionPointsMax < 1)
    return `campaigns.${id} actionPointsMax`;
  const org: Record<string, number> = {};
  if (raw.organizationByConstituency != null) {
    if (!isRecord(raw.organizationByConstituency)) return `campaigns.${id} organization`;
    for (const [k, v] of Object.entries(raw.organizationByConstituency)) {
      if (!finite01(v)) return `campaigns.${id} organization.${k}`;
      org[k] = v;
    }
  }
  const recentEffects = Array.isArray(raw.recentEffects) ? raw.recentEffects : [];
  const effects = [];
  for (const e of recentEffects) {
    if (!isRecord(e) || typeof e.kind !== "string" || !isIsoDate(e.date)) continue;
    if (typeof e.magnitude !== "number" || !Number.isFinite(e.magnitude)) continue;
    effects.push({
      date: e.date,
      kind: e.kind,
      geographyId: typeof e.geographyId === "string" ? e.geographyId : null,
      targetId: typeof e.targetId === "string" ? e.targetId : null,
      magnitude: e.magnitude,
    });
  }
  const strategyRaw = isRecord(raw.strategy) ? raw.strategy : {};
  return {
    id,
    politicianId: raw.politicianId,
    type: raw.type,
    contestId: typeof raw.contestId === "string" ? raw.contestId : null,
    electionId: typeof raw.electionId === "string" ? raw.electionId : null,
    constituencyId: typeof raw.constituencyId === "string" ? raw.constituencyId : null,
    status: raw.status,
    launchedDate: raw.launchedDate,
    endedDate: raw.endedDate == null ? null : raw.endedDate,
    predecessorCampaignId:
      typeof raw.predecessorCampaignId === "string" ? raw.predecessorCampaignId : null,
    cashOnHand: raw.cashOnHand,
    totalRaised: raw.totalRaised,
    totalSpent: raw.totalSpent,
    fundraisingCapacity: raw.fundraisingCapacity,
    fieldOrganization: raw.fieldOrganization,
    mediaCapacity: raw.mediaCapacity,
    organizationByConstituency: org,
    recentEffects: effects,
    debatePrep: finite01(raw.debatePrep) ? raw.debatePrep : 0,
    actionPointsRemaining: raw.actionPointsRemaining,
    actionPointsMax: raw.actionPointsMax,
    actionPointsMonth:
      raw.actionPointsMonth == null || !isIsoDate(raw.actionPointsMonth)
        ? null
        : raw.actionPointsMonth,
    strategy: {
      fundraising: finite01(strategyRaw.fundraising) ? strategyRaw.fundraising : 0.25,
      field: finite01(strategyRaw.field) ? strategyRaw.field : 0.25,
      media: finite01(strategyRaw.media) ? strategyRaw.media : 0.25,
      attack: finite01(strategyRaw.attack) ? strategyRaw.attack : 0.25,
    },
    metadata: isRecord(raw.metadata) ? (raw.metadata as CampaignState["metadata"]) : {},
  };
}

function parseDebate(id: string, raw: unknown): DebateState | string {
  if (!isRecord(raw)) return `debates.${id}`;
  if (raw.id !== id) return `debates.${id} id mismatch`;
  if (parseCanonicalAllocatedId("DEBATE", id) == null) return `debates.${id} id`;
  if (!isIsoDate(raw.date)) return `debates.${id} date`;
  if (typeof raw.campaignType !== "string" || !isCampaignType(raw.campaignType)) {
    return `debates.${id} campaignType`;
  }
  if (
    !Array.isArray(raw.participantIds) ||
    !raw.participantIds.every((x) => typeof x === "string")
  ) {
    return `debates.${id} participantIds`;
  }
  const scores: Record<string, number> = {};
  if (isRecord(raw.scores)) {
    for (const [k, v] of Object.entries(raw.scores)) {
      if (typeof v === "number" && Number.isFinite(v)) scores[k] = v;
    }
  }
  return {
    id,
    date: raw.date,
    campaignType: raw.campaignType,
    contestId: typeof raw.contestId === "string" ? raw.contestId : null,
    electionId: typeof raw.electionId === "string" ? raw.electionId : null,
    participantIds: raw.participantIds,
    scores,
    winnerId: typeof raw.winnerId === "string" ? raw.winnerId : null,
    status: raw.status === "scheduled" ? "scheduled" : "held",
    metadata: isRecord(raw.metadata) ? (raw.metadata as DebateState["metadata"]) : {},
  };
}

export function campaignCounterError(
  parsed: CampaignRuntime,
  counters: { nextCampaignId: number; nextDebateId: number },
): string | null {
  let maxC = 0;
  for (const id of Object.keys(parsed.campaigns)) {
    maxC = Math.max(maxC, parseCanonicalAllocatedId("CAMP", id) ?? 0);
  }
  if (counters.nextCampaignId <= maxC) return "nextCampaignId does not exceed allocated CAMP ids";
  let maxD = 0;
  for (const id of Object.keys(parsed.debates)) {
    maxD = Math.max(maxD, parseCanonicalAllocatedId("DEBATE", id) ?? 0);
  }
  if (counters.nextDebateId <= maxD) return "nextDebateId does not exceed allocated DEBATE ids";
  return null;
}

export function validateCampaignsAgainstWorld(
  state: SimState,
  _world: KernelWorld,
): CommandError | null {
  for (const c of Object.values(state.campaignRuntime.campaigns)) {
    if (!state.politicians[c.politicianId]) {
      return { code: "UNKNOWN_POLITICIAN", message: `campaign ${c.id} politician` };
    }
    if (c.contestId && !state.partyContests[c.contestId]) {
      return { code: "INVALID_CONTEST", message: `campaign ${c.id} contest` };
    }
    if (c.electionId && !state.elections[c.electionId]) {
      return { code: "INVALID_ELECTION", message: `campaign ${c.id} election` };
    }
  }
  return null;
}
