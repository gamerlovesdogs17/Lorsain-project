import type { CommandError, KernelWorld, SimState } from "../types.js";
import {
  CAMPAIGN_GEOGRAPHY_KINDS,
  CAMPAIGN_MESSAGE_TYPES,
  type CampaignGeography,
  type CampaignMessageType,
  type CampaignState,
} from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

/** Same nomination contest, same general election, or same assembly constituency race. */
export function sameCampaignRace(a: CampaignState, b: CampaignState): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "presidential_nomination") {
    return a.contestId != null && a.contestId === b.contestId;
  }
  if (a.type === "presidential_general") {
    return a.electionId != null && a.electionId === b.electionId;
  }
  if (a.electionId && b.electionId && a.electionId === b.electionId) {
    if (a.constituencyId && b.constituencyId) return a.constituencyId === b.constituencyId;
    return a.constituencyId == null && b.constituencyId == null;
  }
  return a.constituencyId != null && a.constituencyId === b.constituencyId;
}

export function activeRaceCampaigns(state: SimState, campaign: CampaignState): CampaignState[] {
  return Object.values(state.campaignRuntime.campaigns)
    .filter(
      (c) =>
        c.id !== campaign.id &&
        (c.status === "active" || c.status === "exploring") &&
        c.politicianId !== campaign.politicianId &&
        sameCampaignRace(c, campaign),
    )
    .sort((a, b) => (a.politicianId < b.politicianId ? -1 : 1));
}

export function isAliveRaceRival(
  state: SimState,
  campaign: CampaignState,
  politicianId: string,
): boolean {
  if (politicianId === campaign.politicianId) return false;
  const pol = state.politicians[politicianId];
  if (!pol?.alive || pol.retired) return false;
  return activeRaceCampaigns(state, campaign).some((c) => c.politicianId === politicianId);
}

export function campaignGeographyError(
  world: KernelWorld,
  geography: CampaignGeography,
): CommandError | null {
  if (!(CAMPAIGN_GEOGRAPHY_KINDS as readonly string[]).includes(geography.kind)) {
    return reject("INVALID_GEOGRAPHY", `unknown geography kind ${geography.kind}`);
  }
  if (geography.kind === "national") return null;
  if (!geography.id) return reject("INVALID_GEOGRAPHY", `${geography.kind} requires an id`);
  if (geography.kind === "province" && !world.provinceIds.includes(geography.id)) {
    return reject("INVALID_GEOGRAPHY", geography.id);
  }
  if (geography.kind === "constituency" && !world.constituencyElectorate[geography.id]) {
    return reject("INVALID_GEOGRAPHY", geography.id);
  }
  return null;
}

export function campaignMessageTypeError(messageType: string): CommandError | null {
  if (!(CAMPAIGN_MESSAGE_TYPES as readonly string[]).includes(messageType)) {
    return reject("INVALID_MESSAGE_TYPE", messageType);
  }
  return null;
}

export function advertiseTargetError(
  state: SimState,
  campaign: CampaignState,
  messageType: CampaignMessageType,
  targetPoliticianId: string | null | undefined,
): CommandError | null {
  if (messageType !== "negative" && messageType !== "contrast") {
    return null;
  }
  if (!targetPoliticianId) {
    return reject("INVALID_TARGET", `${messageType} ads require a race rival`);
  }
  if (!isAliveRaceRival(state, campaign, targetPoliticianId)) {
    return reject("INVALID_TARGET", `${targetPoliticianId} is not a rival in this race`);
  }
  return null;
}
