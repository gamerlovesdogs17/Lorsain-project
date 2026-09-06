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
  /**
   * Rolling cooldown keys (exact / structural / event-wording), prefixed `x:` `s:` `w:`.
   * Cap ~60 entries so ~20 recent stories stay out of local repetition.
   */
  recentHeadlineFingerprints?: string[];
};

export function emptyMediaRuntime(): MediaRuntime {
  return { stories: {}, lingering: [], lastMonthProcessed: null };
}

const FINGERPRINT_STOP =
  /\b(act|the|a|an|of|in|on|to|for|and|as|by|with|from|over|into|amid|after)\b/g;

/** Normalize a headline string to an exact-match fingerprint. */
export function headlineFingerprint(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(FINGERPRINT_STOP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Structure fingerprint: dates/years/numbers collapsed so near-template clones collide
 * even when proper nouns or fiscal years differ.
 */
export function structuralHeadlineKey(headline: string): string {
  return headlineFingerprint(headline)
    .replace(/\b20\d{2}(-\d{2}-\d{2})?\b/g, "#")
    .replace(/\bfy\s*\d{2,4}\b/g, "#")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/** Event-family stem used to catch thin wrappers around the same event wording. */
export function eventTypeStem(eventType: string): string {
  return eventType.toLowerCase().split("_").filter(Boolean).slice(0, 2).join(" ");
}

/**
 * Event-wording key: if the headline is mostly a paraphrase of the event type stem,
 * collapse to that stem so catch-all templates cannot rotate synonyms in-window.
 */
export function eventWordingKey(eventType: string, headline: string): string {
  const stem = eventTypeStem(eventType);
  const fp = headlineFingerprint(headline);
  const stemParts = stem.split(" ").filter(Boolean);
  const wrapsStem = stemParts.length > 0 && stemParts.every((part) => fp.includes(part));
  if (wrapsStem) return `stem:${stem}`;
  return `stem:${stem}|${structuralHeadlineKey(headline)}`;
}

/** Cooldown keys recorded after publishing a headline. */
export function headlineCooldownKeys(eventType: string, headline: string): string[] {
  return [
    `x:${headlineFingerprint(headline)}`,
    `s:${structuralHeadlineKey(headline)}`,
    `w:${eventWordingKey(eventType, headline)}`,
  ];
}

export function headlineOnCooldown(
  recentKeys: readonly string[],
  eventType: string,
  headline: string,
): boolean {
  return headlineCooldownKeys(eventType, headline).some((key) => recentKeys.includes(key));
}

export const HEADLINE_COOLDOWN_CAP = 60;
