import { padId } from "../scheduler.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { CAMPAIGN_ACTION_POINTS } from "./policy.js";
import { actionPointMax, monthStart } from "./effects.js";
import type { CampaignState, CampaignType, CampaignRuntime } from "./types.js";
import { emptyCampaignRuntime } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function campaignRuntime(state: SimState): CampaignRuntime {
  return state.campaignRuntime;
}

export function activeCampaigns(state: SimState): CampaignState[] {
  return Object.values(state.campaignRuntime.campaigns)
    .filter((c) => c.status === "active" || c.status === "exploring")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function campaignsForPolitician(state: SimState, politicianId: string): CampaignState[] {
  return Object.values(state.campaignRuntime.campaigns)
    .filter((c) => c.politicianId === politicianId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function activeCampaignFor(
  state: SimState,
  politicianId: string,
  type?: CampaignType,
): CampaignState | undefined {
  return Object.values(state.campaignRuntime.campaigns)
    .filter(
      (c) =>
        c.politicianId === politicianId &&
        (c.status === "active" || c.status === "exploring") &&
        (type ? c.type === type : true),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
}

export function allocateCampaignId(state: SimState): string {
  return padId("CAMP", state.counters.nextCampaignId++);
}

export function allocateDebateId(state: SimState): string {
  return padId("DEBATE", state.counters.nextDebateId++);
}

export function createCampaignRecord(
  state: SimState,
  world: KernelWorld,
  partial: Pick<CampaignState, "politicianId" | "type"> & Partial<CampaignState>,
): CampaignState {
  const id = partial.id ?? allocateCampaignId(state);
  const max = actionPointMax(world, state, partial.politicianId);
  const rec: CampaignState = {
    id,
    politicianId: partial.politicianId,
    type: partial.type,
    contestId: partial.contestId ?? null,
    electionId: partial.electionId ?? null,
    constituencyId: partial.constituencyId ?? null,
    status: partial.status ?? "active",
    launchedDate: partial.launchedDate ?? state.currentDate,
    endedDate: partial.endedDate ?? null,
    predecessorCampaignId: partial.predecessorCampaignId ?? null,
    cashOnHand: partial.cashOnHand ?? 0,
    totalRaised: partial.totalRaised ?? 0,
    totalSpent: partial.totalSpent ?? 0,
    fundraisingCapacity: partial.fundraisingCapacity ?? 0.2,
    fieldOrganization: partial.fieldOrganization ?? 0.12,
    mediaCapacity: partial.mediaCapacity ?? 0.12,
    organizationByConstituency: { ...(partial.organizationByConstituency ?? {}) },
    recentEffects: [...(partial.recentEffects ?? [])],
    debatePrep: partial.debatePrep ?? 0,
    actionPointsRemaining: partial.actionPointsRemaining ?? max,
    actionPointsMax: partial.actionPointsMax ?? max,
    actionPointsMonth: partial.actionPointsMonth ?? monthStart(state.currentDate),
    strategy: partial.strategy ?? {
      fundraising: 0.25,
      field: 0.25,
      media: 0.25,
      attack: 0.25,
    },
    metadata: { ...(partial.metadata ?? {}) },
  };
  state.campaignRuntime.campaigns[id] = rec;
  return rec;
}

export function ensureActionPoints(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): void {
  const month = monthStart(state.currentDate);
  if (campaign.actionPointsMonth !== month) {
    campaign.actionPointsMax = actionPointMax(world, state, campaign.politicianId);
    campaign.actionPointsRemaining = campaign.actionPointsMax;
    campaign.actionPointsMonth = month;
  }
}

export function spendActionPoint(campaign: CampaignState): CommandError | null {
  if (campaign.actionPointsRemaining < 1) {
    return reject(
      "NO_ACTION_POINTS",
      `${campaign.id} has no remaining campaign actions this month`,
    );
  }
  campaign.actionPointsRemaining -= 1;
  return null;
}

export function spendCash(campaign: CampaignState, amount: number): CommandError | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return reject("INVALID_SPEND", "spend must be a positive integer");
  }
  if (campaign.cashOnHand < amount) {
    return reject("INSUFFICIENT_FUNDS", `${campaign.id} cannot spend ${amount}`);
  }
  campaign.cashOnHand -= amount;
  campaign.totalSpent += amount;
  return null;
}

export function addCash(campaign: CampaignState, amount: number): void {
  const n = Math.max(0, Math.round(amount));
  campaign.cashOnHand += n;
  campaign.totalRaised += n;
}

export { emptyCampaignRuntime, CAMPAIGN_ACTION_POINTS };
