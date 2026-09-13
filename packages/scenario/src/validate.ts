import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";
import { parseScenarioDocument } from "./parse.js";
import type {
  ScenarioDocument,
  ScenarioValidationIssue,
  ScenarioValidationReport,
} from "./types.js";

const KNOWN_ROOT_KEYS = new Set([
  "format",
  "formatVersion",
  "scenarioId",
  "name",
  "description",
  "startDate",
  "author",
  "countryName",
  "gameVersion",
  "contentSections",
  "contentEmbed",
]);

function push(
  bucket: ScenarioValidationIssue[],
  issue: ScenarioValidationIssue,
): void {
  bucket.push(issue);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateStructure(raw: Record<string, unknown>): ScenarioValidationReport {
  const errors: ScenarioValidationIssue[] = [];
  const warnings: ScenarioValidationIssue[] = [];
  const suggestions: ScenarioValidationIssue[] = [];

  for (const key of Object.keys(raw)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      push(warnings, {
        path: key,
        code: "UNKNOWN_ROOT_FIELD",
        severity: "warning",
        message: `Unknown top-level field "${key}" will be preserved on roundtrip but ignored by v1 loaders.`,
      });
    }
  }

  if (raw.format !== SCENARIO_FORMAT) {
    push(errors, {
      path: "format",
      code: "BAD_FORMAT",
      severity: "error",
      message: `format must be "${SCENARIO_FORMAT}"`,
    });
  }
  if (raw.formatVersion !== SCENARIO_FORMAT_VERSION) {
    push(errors, {
      path: "formatVersion",
      code: "BAD_FORMAT_VERSION",
      severity: "error",
      message: `formatVersion must be ${SCENARIO_FORMAT_VERSION} (use migrateScenario for older versions)`,
    });
  }
  if (typeof raw.scenarioId !== "string" || !/^[A-Z0-9_]+$/.test(raw.scenarioId)) {
    push(errors, {
      path: "scenarioId",
      code: "BAD_SCENARIO_ID",
      severity: "error",
      message: "scenarioId must be a non-empty uppercase identifier (A-Z, 0-9, underscore)",
    });
  }
  if (raw.scenarioId === "TERENA_2028") {
    push(suggestions, {
      path: "scenarioId",
      code: "RESERVED_TERENA_ID",
      severity: "suggestion",
      message: "Terena is bundled separately; custom scenarios should use a distinct scenarioId.",
    });
  }
  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    push(errors, {
      path: "name",
      code: "MISSING_NAME",
      severity: "error",
      message: "name is required",
    });
  }
  if (typeof raw.countryName !== "string" || raw.countryName.trim().length === 0) {
    push(errors, {
      path: "countryName",
      code: "MISSING_COUNTRY",
      severity: "error",
      message: "countryName is required",
    });
  }
  if (typeof raw.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate)) {
    push(errors, {
      path: "startDate",
      code: "BAD_START_DATE",
      severity: "error",
      message: "startDate must be ISO YYYY-MM-DD",
    });
  }
  if (!isRecord(raw.contentSections)) {
    push(errors, {
      path: "contentSections",
      code: "MISSING_SECTIONS",
      severity: "error",
      message: "contentSections object is required",
    });
  }
  if (!isRecord(raw.contentEmbed)) {
    push(errors, {
      path: "contentEmbed",
      code: "MISSING_EMBED",
      severity: "error",
      message: "contentEmbed describes how simulation content is loaded",
    });
  } else {
    const kind = raw.contentEmbed.kind;
    if (kind === "kernel_input" && !isRecord(raw.contentEmbed.kernelInput)) {
      push(errors, {
        path: "contentEmbed.kernelInput",
        code: "MISSING_KERNEL_INPUT",
        severity: "error",
        message: "kernel_input embed requires kernelInput object",
      });
    }
    if (kind === "content_bundle_ref") {
      push(warnings, {
        path: "contentEmbed",
        code: "BUNDLE_REF_UNRESOLVED",
        severity: "warning",
        message: "content_bundle_ref requires a host-provided ContentBundle at play time",
      });
    }
  }

  return { errors, warnings, suggestions };
}

function validateSemantic(doc: ScenarioDocument): ScenarioValidationReport {
  const errors: ScenarioValidationIssue[] = [];
  const warnings: ScenarioValidationIssue[] = [];
  const suggestions: ScenarioValidationIssue[] = [];

  const parties = doc.contentSections.parties ?? [];
  const partyIds = new Set<string>();
  for (const [i, party] of parties.entries()) {
    const base = `contentSections.parties[${i}]`;
    if (!party.id) {
      push(errors, {
        path: `${base}.id`,
        code: "PARTY_ID",
        severity: "error",
        message: "party id is required",
      });
    } else if (partyIds.has(party.id)) {
      push(errors, {
        path: `${base}.id`,
        code: "DUPLICATE_PARTY",
        severity: "error",
        message: `duplicate party id ${party.id}`,
      });
    } else {
      partyIds.add(party.id);
    }
    if (!party.name.trim()) {
      push(errors, {
        path: `${base}.name`,
        code: "PARTY_NAME",
        severity: "error",
        message: "party name is required",
      });
    }
    if (!party.leaderId.trim()) {
      push(warnings, {
        path: `${base}.leaderId`,
        code: "PARTY_LEADER",
        severity: "warning",
        message: "leaderId is empty; party leadership may be vacant at start",
      });
    }
  }

  const asm =
    doc.contentSections.constitution?.assemblySeats ??
    doc.contentSections.world?.assemblySeats;
  if (asm != null && (!Number.isInteger(asm) || asm < 1)) {
    push(errors, {
      path: "contentSections.world.assemblySeats",
      code: "BAD_ASSEMBLY_SIZE",
      severity: "error",
      message: "assembly seat count must be a positive integer",
    });
  }
  const court =
    doc.contentSections.constitution?.courtJudges ?? doc.contentSections.world?.courtJudges;
  if (court != null && (!Number.isInteger(court) || court < 0)) {
    push(errors, {
      path: "contentSections.world.courtJudges",
      code: "BAD_COURT_SIZE",
      severity: "error",
      message: "court judge count must be a non-negative integer",
    });
  }

  const provinces = doc.contentSections.geography?.provinces ?? [];
  if (provinces.length === 0 && doc.contentEmbed.kind === "mini_playable_v1") {
    push(warnings, {
      path: "contentSections.geography.provinces",
      code: "NO_PROVINCES",
      severity: "warning",
      message: "No provinces listed; mini_playable_v1 will synthesize a minimal geography",
    });
  }

  if (!doc.description?.trim()) {
    push(suggestions, {
      path: "description",
      code: "ADD_DESCRIPTION",
      severity: "suggestion",
      message: "Add a short description for the scenario browser and import summary",
    });
  }

  return { errors, warnings, suggestions };
}

export function validateScenario(raw: unknown): ScenarioValidationReport {
  if (!isRecord(raw)) {
    return {
      errors: [
        {
          path: "",
          code: "NOT_OBJECT",
          severity: "error",
          message: "Scenario document must be a JSON object",
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }
  const structural = validateStructure(raw);
  if (structural.errors.length > 0) {
    return {
      errors: structural.errors,
      warnings: structural.warnings,
      suggestions: structural.suggestions,
    };
  }
  let doc: ScenarioDocument;
  try {
    doc = parseScenarioDocument(raw);
  } catch (e) {
    return {
      errors: [
        {
          path: "",
          code: "PARSE_FAILED",
          severity: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
      warnings: structural.warnings,
      suggestions: structural.suggestions,
    };
  }
  const semantic = validateSemantic(doc);
  return {
    errors: [...structural.errors, ...semantic.errors],
    warnings: [...structural.warnings, ...semantic.warnings],
    suggestions: [...structural.suggestions, ...semantic.suggestions],
  };
}

export function scenarioHasBlockingErrors(report: ScenarioValidationReport): boolean {
  return report.errors.length > 0;
}
