import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import {
  emptyMediaRuntime,
  MEDIA_CATEGORIES,
  type MediaRuntime,
  type MediaStory,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseMediaRuntime(raw: unknown): MediaRuntime | string {
  if (raw == null) return emptyMediaRuntime();
  if (!isRecord(raw)) return "mediaRuntime must be an object";
  const runtime = emptyMediaRuntime();
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "mediaRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  if (isRecord(raw.stories)) {
    for (const [id, rec] of Object.entries(raw.stories)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("NEWS", id) == null) continue;
      const story: MediaStory = {
        id,
        outletId: typeof rec.outletId === "string" ? rec.outletId : "",
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        sourceEventIds: Array.isArray(rec.sourceEventIds)
          ? rec.sourceEventIds.filter((x): x is string => typeof x === "string")
          : [],
        subjectIds: Array.isArray(rec.subjectIds)
          ? rec.subjectIds.filter((x): x is string => typeof x === "string")
          : [],
        issueIds: Array.isArray(rec.issueIds)
          ? rec.issueIds.filter((x): x is string => typeof x === "string")
          : [],
        category:
          typeof rec.category === "string" &&
          (MEDIA_CATEGORIES as readonly string[]).includes(rec.category)
            ? (rec.category as MediaStory["category"])
            : "politics",
        importance: typeof rec.importance === "number" ? rec.importance : 0.4,
        framing:
          rec.framing === "critical" ||
          rec.framing === "sympathetic" ||
          rec.framing === "sensational"
            ? rec.framing
            : "restrained",
        headlineKey:
          typeof rec.headlineKey === "string" ? rec.headlineKey : "Political developments",
        summaryKey: typeof rec.summaryKey === "string" ? rec.summaryKey : "politics",
        factEventType: typeof rec.factEventType === "string" ? rec.factEventType : "",
        publicEffects: isRecord(rec.publicEffects)
          ? (rec.publicEffects as MediaStory["publicEffects"])
          : {},
      };
      runtime.stories[id] = story;
    }
  }
  if (Array.isArray(raw.recentHeadlineFingerprints)) {
    runtime.recentHeadlineFingerprints = raw.recentHeadlineFingerprints
      .filter((x): x is string => typeof x === "string")
      .slice(0, 24);
  }
  if (Array.isArray(raw.lingering)) {
    for (const rec of raw.lingering) {
      if (!isRecord(rec)) continue;
      runtime.lingering.push({
        storyId: typeof rec.storyId === "string" ? rec.storyId : "",
        remainingMonths: typeof rec.remainingMonths === "number" ? rec.remainingMonths : 1,
        politicianId: typeof rec.politicianId === "string" ? rec.politicianId : null,
        favorabilityDelta: typeof rec.favorabilityDelta === "number" ? rec.favorabilityDelta : 0,
        momentumDelta: typeof rec.momentumDelta === "number" ? rec.momentumDelta : 0,
        issueId: typeof rec.issueId === "string" ? rec.issueId : null,
        salienceDelta: typeof rec.salienceDelta === "number" ? rec.salienceDelta : 0,
      });
    }
  }
  return runtime;
}

export function mediaCounterError(
  runtime: MediaRuntime,
  counters: { nextMediaStoryId: number },
): string | null {
  const max = Object.keys(runtime.stories).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("NEWS", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextMediaStoryId <= max) return "counters.nextMediaStoryId";
  return null;
}
