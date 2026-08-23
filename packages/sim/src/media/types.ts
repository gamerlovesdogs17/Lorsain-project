import type { IsoDate } from "../calendar.js";
import type { JsonObject } from "../json.js";

export type CanonicalMediaOutlet = {
  id: string;
  name: string;
  type: string;
  ideology: number;
  factualReputation: number;
  audience: string;
};

export const MEDIA_CATEGORIES = [
  "politics",
  "elections",
  "government",
  "economy",
  "courts",
  "organizations",
  "foreign",
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export type MediaStory = {
  id: string;
  outletId: string;
  date: IsoDate;
  sourceEventIds: string[];
  subjectIds: string[];
  issueIds: string[];
  category: MediaCategory;
  importance: number;
  framing: "restrained" | "critical" | "sympathetic" | "sensational";
  headlineKey: string;
  summaryKey: string;
  factEventType: string;
  publicEffects: JsonObject;
};

export type MediaLingeringEffect = {
  storyId: string;
  remainingMonths: number;
  politicianId: string | null;
  favorabilityDelta: number;
  momentumDelta: number;
  issueId: string | null;
  salienceDelta: number;
};

export type MediaRuntime = {
  stories: Record<string, MediaStory>;
  lingering: MediaLingeringEffect[];
  lastMonthProcessed: IsoDate | null;
};

export function emptyMediaRuntime(): MediaRuntime {
  return { stories: {}, lingering: [], lastMonthProcessed: null };
}
