import { parseIsoDate, type IsoDate } from "../calendar.js";
import type { KernelWorld } from "../types.js";
import type { CampaignState } from "./types.js";

export type GotvActivation = { date: IsoDate; magnitude: number };

export function campaignMonthDistance(from: IsoDate, to: IsoDate): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  return (end.year - start.year) * 12 + end.month - start.month;
}

export function gotvActivations(campaign: CampaignState): Record<string, GotvActivation> {
  const raw = campaign.metadata.gotvActivations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, GotvActivation> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.date !== "string" || typeof row.magnitude !== "number" || !Number.isFinite(row.magnitude)) continue;
    out[key] = { date: row.date, magnitude: Math.max(0, Math.min(0.25, row.magnitude)) };
  }
  return out;
}

function liveMagnitude(activation: GotvActivation | undefined, onDate: IsoDate): number {
  if (!activation) return 0;
  const lag = campaignMonthDistance(activation.date, onDate);
  return lag >= 0 && lag <= 2 ? activation.magnitude : 0;
}

export function provinceGotvBoost(
  campaign: CampaignState,
  provinceId: string,
  onDate: IsoDate,
): number {
  return liveMagnitude(gotvActivations(campaign)[`province:${provinceId}`], onDate);
}

export function constituencyGotvBoost(
  world: KernelWorld,
  campaign: CampaignState,
  constituencyId: string,
  onDate: IsoDate,
): number {
  const activations = gotvActivations(campaign);
  const direct = liveMagnitude(activations[`constituency:${constituencyId}`], onDate);
  const provincial = (world.constituencyElectorate[constituencyId]?.provincePopulationShares ?? [])
    .reduce(
      (sum, share) =>
        sum + share.share * liveMagnitude(activations[`province:${share.provinceId}`], onDate),
      0,
    );
  return Math.min(0.25, direct + provincial * 0.7);
}
