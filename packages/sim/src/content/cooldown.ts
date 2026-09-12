import { addMonths, compareIsoDate, type IsoDate } from "../calendar.js";

/** templateId → date the template last fired (month start or event date). */
export type ContentCooldownRegistry = Record<string, IsoDate>;

const REGISTRY_KEY = "contentCooldowns";

export function readContentCooldownRegistry(metadata: Record<string, unknown>): ContentCooldownRegistry {
  const raw = metadata[REGISTRY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ContentCooldownRegistry = {};
  for (const [id, date] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof date === "string" && date.length >= 10) out[id] = date;
  }
  return out;
}

export function writeContentCooldownRegistry(
  metadata: Record<string, unknown>,
  registry: ContentCooldownRegistry,
): void {
  metadata[REGISTRY_KEY] = { ...registry };
}

/** True when `minMonths` have elapsed since the template last fired (or never fired). */
export function contentCooldownEligible(
  registry: ContentCooldownRegistry,
  templateId: string,
  currentDate: IsoDate,
  minMonths: number,
): boolean {
  const last = registry[templateId];
  if (!last) return true;
  return compareIsoDate(addMonths(last, minMonths), currentDate) <= 0;
}

export function recordContentCooldown(
  metadata: Record<string, unknown>,
  templateId: string,
  date: IsoDate,
): void {
  const registry = readContentCooldownRegistry(metadata);
  registry[templateId] = date;
  writeContentCooldownRegistry(metadata, registry);
}
