import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Stub for future scenario format migrations (V1→V2). V1 documents pass through unchanged.
 */
export function migrateScenario(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const version = raw.formatVersion;
  if (version === SCENARIO_FORMAT_VERSION) return raw;
  if (version == null && raw.format === SCENARIO_FORMAT) {
    return { ...raw, formatVersion: SCENARIO_FORMAT_VERSION };
  }
  if (version === 0) {
    return migrateScenario({ ...raw, formatVersion: 1 });
  }
  throw new Error(
    `No scenario migration from formatVersion ${String(version)} to ${SCENARIO_FORMAT_VERSION}`,
  );
}
