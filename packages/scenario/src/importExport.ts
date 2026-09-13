import { SCENARIO_MAX_BYTES } from "./constants.js";
import { migrateScenario } from "./migrate.js";
import { parseScenarioDocument, serializeScenarioDocument } from "./parse.js";
import { validateScenario } from "./validate.js";
import type { ScenarioDocument, ScenarioValidationReport } from "./types.js";

export type ScenarioImportResult =
  | {
      ok: true;
      document: ScenarioDocument;
      report: ScenarioValidationReport;
      bytes: number;
    }
  | { ok: false; error: string; report?: ScenarioValidationReport; bytes?: number };

export function importScenarioJson(text: string): ScenarioImportResult {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > SCENARIO_MAX_BYTES) {
    return {
      ok: false,
      error: `Scenario file exceeds ${SCENARIO_MAX_BYTES} byte limit (${bytes} bytes)`,
      bytes,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON", bytes };
  }
  const migrated = migrateScenario(parsed);
  const report = validateScenario(migrated);
  if (report.errors.length > 0) {
    return { ok: false, error: "Scenario validation failed", report, bytes };
  }
  try {
    const document = parseScenarioDocument(migrated);
    return { ok: true, document, report, bytes };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      report,
      bytes,
    };
  }
}

export function exportScenarioJson(doc: ScenarioDocument): string {
  return serializeScenarioDocument(doc);
}

export function scenarioJsonRoundtrip(doc: ScenarioDocument): ScenarioDocument {
  return parseScenarioDocument(JSON.parse(serializeScenarioDocument(doc)) as unknown);
}
