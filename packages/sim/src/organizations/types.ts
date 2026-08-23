import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

export type CanonicalInterestOrganization = {
  id: string;
  name: string;
  type: string;
  lean: string;
  strength: number;
  issues: string[];
  leanPartyIds: string[];
};

export type OrganizationStance = "support" | "oppose" | "watch";

export type OrganizationBillPressure = {
  billId: string;
  stance: OrganizationStance;
  strength: number;
};

export type OrganizationEndorsement = {
  politicianId: string;
  campaignId: string | null;
  date: IsoDate;
  public: true;
};

export type OrganizationActorState = {
  id: string;
  influence: number;
  resources: number;
  publicPositions: Record<string, number>;
  relationships: Record<string, { affinity: number }>;
  billPressure: OrganizationBillPressure[];
  endorsements: OrganizationEndorsement[];
  cooldownUntil: IsoDate | null;
  lastActionMonth: IsoDate | null;
  recentActions: Array<{ date: IsoDate; kind: string; summary: string }>;
};

export type OrganizationRuntime = {
  actors: Record<string, OrganizationActorState>;
  meetingsThisMonth: number;
  lastMonthProcessed: IsoDate | null;
  metadata: JsonObject;
};

export const MAX_ORG_MEETINGS_PER_MONTH = 2;

export function emptyOrganizationRuntime(): OrganizationRuntime {
  return {
    actors: {},
    meetingsThisMonth: 0,
    lastMonthProcessed: null,
    metadata: {},
  };
}

export function seedOrganizationRuntime(
  orgs: Record<string, CanonicalInterestOrganization>,
): OrganizationRuntime {
  const runtime = emptyOrganizationRuntime();
  for (const org of Object.values(orgs).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const positions: Record<string, number> = {};
    for (const issueId of org.issues) positions[issueId] = org.type.includes("union") ? 0.55 : 0.35;
    runtime.actors[org.id] = {
      id: org.id,
      influence: org.strength,
      resources: org.strength * 0.6,
      publicPositions: positions,
      relationships: {},
      billPressure: [],
      endorsements: [],
      cooldownUntil: null,
      lastActionMonth: null,
      recentActions: [],
    };
  }
  return runtime;
}
