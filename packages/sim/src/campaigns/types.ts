import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

export const CAMPAIGN_TYPES = [
  "presidential_nomination",
  "presidential_general",
  "assembly",
  "gubernatorial",
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  "exploring",
  "active",
  "withdrawn",
  "won",
  "lost",
  "ended",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_MESSAGE_TYPES = ["positive", "contrast", "negative"] as const;
export type CampaignMessageType = (typeof CAMPAIGN_MESSAGE_TYPES)[number];

export const CAMPAIGN_GEOGRAPHY_KINDS = ["national", "province", "constituency"] as const;
export type CampaignGeographyKind = (typeof CAMPAIGN_GEOGRAPHY_KINDS)[number];

export type CampaignGeography = {
  kind: CampaignGeographyKind;
  id: string | null;
};

export type CampaignEffect = {
  date: IsoDate;
  kind: string;
  geographyId: string | null;
  targetId: string | null;
  magnitude: number;
};

export type CampaignState = {
  id: string;
  politicianId: string;
  type: CampaignType;
  contestId: string | null;
  electionId: string | null;
  constituencyId: string | null;
  status: CampaignStatus;
  launchedDate: IsoDate;
  endedDate: IsoDate | null;
  predecessorCampaignId: string | null;
  cashOnHand: number;
  totalRaised: number;
  totalSpent: number;
  fundraisingCapacity: number;
  fieldOrganization: number;
  mediaCapacity: number;
  organizationByProvince: Record<string, number>;
  organizationByConstituency: Record<string, number>;
  recentEffects: CampaignEffect[];
  debatePrep: number;
  actionPointsRemaining: number;
  actionPointsMax: number;
  actionPointsMonth: IsoDate | null;
  strategy: {
    fundraising: number;
    field: number;
    media: number;
    attack: number;
  };
  metadata: JsonObject;
};

export type DebateState = {
  id: string;
  date: IsoDate;
  campaignType: CampaignType;
  contestId: string | null;
  electionId: string | null;
  participantIds: string[];
  scores: Record<string, number>;
  winnerId: string | null;
  status: "scheduled" | "held";
  metadata: JsonObject;
};

export type CampaignRuntime = {
  campaigns: Record<string, CampaignState>;
  debates: Record<string, DebateState>;
  lastMonthProcessed: IsoDate | null;
};

export function isCampaignType(v: string): v is CampaignType {
  return (CAMPAIGN_TYPES as readonly string[]).includes(v);
}

export function isCampaignStatus(v: string): v is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

export function isCampaignMessageType(v: string): v is CampaignMessageType {
  return (CAMPAIGN_MESSAGE_TYPES as readonly string[]).includes(v);
}

export function emptyCampaignRuntime(): CampaignRuntime {
  return { campaigns: {}, debates: {}, lastMonthProcessed: null };
}
