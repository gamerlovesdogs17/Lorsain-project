import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";
import { parseScenarioDocument } from "./parse.js";
import type {
  ScenarioDocument,
  ScenarioForeignCountrySection,
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

const SUPPORTED_ASSEMBLY_SYSTEMS = new Set(["stv", "fptp", "closed_list_pr", "mixed_member"]);

function push(bucket: ScenarioValidationIssue[], issue: ScenarioValidationIssue): void {
  bucket.push(issue);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function foreignCountriesList(doc: ScenarioDocument): ScenarioForeignCountrySection[] {
  return (
    doc.contentSections.foreign?.countries ??
    doc.contentSections.foreignCountries ??
    []
  );
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
      fixHint: "Run migrateScenario() or set formatVersion to 1",
    });
  }
  if (typeof raw.scenarioId !== "string" || !/^[A-Z0-9_]+$/.test(raw.scenarioId)) {
    push(errors, {
      path: "scenarioId",
      code: "BAD_SCENARIO_ID",
      severity: "error",
      message: "scenarioId must be a non-empty uppercase identifier (A-Z, 0-9, underscore)",
      fixHint: "Use e.g. MY_COUNTRY_2027",
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
      fixHint: "Use a calendar date like 2027-03-01",
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

  const politicianIds = new Set(
    (doc.contentSections.people?.politicians ?? []).map((p) => p.id).filter(Boolean),
  );
  const provinceIds = new Set(
    (doc.contentSections.geography?.provinces ?? []).map((p) => p.id).filter(Boolean),
  );

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
        fixHint: "Give each party a unique id",
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
        fixHint: "Set leaderId to a politician id from contentSections.people.politicians",
      });
    } else if (politicianIds.size > 0 && !politicianIds.has(party.leaderId)) {
      push(warnings, {
        path: `${base}.leaderId`,
        code: "LEADER_NOT_IN_ROSTER",
        severity: "warning",
        message: `leaderId ${party.leaderId} is not listed in people.politicians`,
        fixHint: "Add the leader to people.politicians or pick an existing id",
      });
    }
    if (party.seatCount != null && party.seatCount < 0) {
      push(errors, {
        path: `${base}.seatCount`,
        code: "BAD_PARTY_SEATS",
        severity: "error",
        message: "seatCount cannot be negative",
      });
    }
  }

  for (const [i, pol] of (doc.contentSections.people?.politicians ?? []).entries()) {
    const base = `contentSections.people.politicians[${i}]`;
    if (pol.partyId && partyIds.size > 0 && !partyIds.has(pol.partyId)) {
      push(warnings, {
        path: `${base}.partyId`,
        code: "ORPHAN_PARTY_REF",
        severity: "warning",
        message: `partyId ${pol.partyId} does not match any party`,
        fixHint: "Fix the id or add a party with this id",
      });
    }
    if (pol.provinceId && provinceIds.size > 0 && !provinceIds.has(pol.provinceId)) {
      push(warnings, {
        path: `${base}.provinceId`,
        code: "ORPHAN_PROVINCE_REF",
        severity: "warning",
        message: `provinceId ${pol.provinceId} is not in geography.provinces`,
      });
    }
  }

  const asm =
    doc.contentSections.constitution?.assemblySeats ?? doc.contentSections.world?.assemblySeats;
  if (asm == null && doc.contentEmbed.kind === "mini_playable_v1") {
    push(warnings, {
      path: "contentSections.constitution.assemblySeats",
      code: "ASSEMBLY_SIZE_UNKNOWN",
      severity: "warning",
      message: "No assembly seat count; mini world builder will default to 24",
      fixHint: "Set contentSections.constitution.assemblySeats",
    });
  }
  if (asm != null && (!Number.isInteger(asm) || asm < 1)) {
    push(errors, {
      path: "contentSections.constitution.assemblySeats",
      code: "BAD_ASSEMBLY_SIZE",
      severity: "error",
      message: "assembly seat count must be a positive integer",
    });
  }
  const court =
    doc.contentSections.constitution?.courtJudges ?? doc.contentSections.world?.courtJudges;
  if (court != null && (!Number.isInteger(court) || court < 0)) {
    push(errors, {
      path: "contentSections.constitution.courtJudges",
      code: "BAD_COURT_SIZE",
      severity: "error",
      message: "court judge count must be a non-negative integer",
    });
  }

  const constituencies = doc.contentSections.geography?.constituencies ?? [];
  if (constituencies.length > 0 && asm != null) {
    const sum = constituencies.reduce((a, c) => a + (c.seats ?? 0), 0);
    if (sum !== asm) {
      push(errors, {
        path: "contentSections.geography.constituencies",
        code: "CONSTITUENCY_SEAT_MISMATCH",
        severity: "error",
        message: `Constituency seats sum to ${sum} but assembly has ${asm} seats`,
        fixHint: "Adjust constituency seats so they total assemblySeats",
      });
    }
    for (const [i, c] of constituencies.entries()) {
      if (c.provinceId && provinceIds.size > 0 && !provinceIds.has(c.provinceId)) {
        push(warnings, {
          path: `contentSections.geography.constituencies[${i}].provinceId`,
          code: "CONSTITUENCY_PROVINCE",
          severity: "warning",
          message: `Constituency ${c.id} references unknown province ${c.provinceId}`,
        });
      }
      if (!Number.isInteger(c.seats) || c.seats < 1) {
        push(errors, {
          path: `contentSections.geography.constituencies[${i}].seats`,
          code: "BAD_CONSTITUENCY_SEATS",
          severity: "error",
          message: "Each constituency needs at least one seat",
        });
      }
    }
  } else if (asm != null && asm > 0 && constituencies.length === 0) {
    push(suggestions, {
      path: "contentSections.geography.constituencies",
      code: "ADD_CONSTITUENCIES",
      severity: "suggestion",
      message: "Define constituencies for studio editing; mini builder can synthesize them if omitted",
    });
  }

  if (parties.length > 0) {
    const seatSum = parties.reduce((a, p) => a + (p.seatCount ?? 0), 0);
    if (asm != null && parties.some((p) => p.seatCount != null) && seatSum !== asm) {
      push(warnings, {
        path: "contentSections.parties",
        code: "PARTY_SEAT_MISMATCH",
        severity: "warning",
        message: `Party seatCount fields sum to ${seatSum} but assembly has ${asm} seats`,
        fixHint: "Align party seatCount with constituency allocation or remove seatCount hints",
      });
    }
  }

  const gov = doc.contentSections.government;
  if (gov?.cabinet && gov.cabinet.length === 0) {
    push(warnings, {
      path: "contentSections.government.cabinet",
      code: "EMPTY_CABINET",
      severity: "warning",
      message: "Cabinet array is empty; executive ministries will be vacant at start",
      fixHint: "Add ministryId/holderId pairs for core ministries",
    });
  }
  if (gov?.presidentId && politicianIds.size > 0 && !politicianIds.has(gov.presidentId)) {
    push(warnings, {
      path: "contentSections.government.presidentId",
      code: "PRESIDENT_NOT_IN_ROSTER",
      severity: "warning",
      message: "presidentId is not in people.politicians",
    });
  }
  if (
    gov?.headOfGovernmentId &&
    politicianIds.size > 0 &&
    !politicianIds.has(gov.headOfGovernmentId)
  ) {
    push(warnings, {
      path: "contentSections.government.headOfGovernmentId",
      code: "HOG_NOT_IN_ROSTER",
      severity: "warning",
      message: "headOfGovernmentId is not in people.politicians",
    });
  }
  for (const [i, entry] of (gov?.cabinet ?? []).entries()) {
    if (politicianIds.size > 0 && !politicianIds.has(entry.holderId)) {
      push(warnings, {
        path: `contentSections.government.cabinet[${i}].holderId`,
        code: "MINISTER_NOT_IN_ROSTER",
        severity: "warning",
        message: `Minister holder ${entry.holderId} is not in people.politicians`,
      });
    }
  }
  for (const [i, pid] of (gov?.coalitionPartyIds ?? []).entries()) {
    if (!partyIds.has(pid)) {
      push(warnings, {
        path: `contentSections.government.coalitionPartyIds[${i}]`,
        code: "COALITION_ORPHAN_PARTY",
        severity: "warning",
        message: `Coalition references unknown party ${pid}`,
      });
    }
  }

  const assemblySystem = doc.contentSections.elections?.assemblySystem;
  if (assemblySystem && !SUPPORTED_ASSEMBLY_SYSTEMS.has(assemblySystem)) {
    push(errors, {
      path: "contentSections.elections.assemblySystem",
      code: "UNSUPPORTED_ASSEMBLY_SYSTEM",
      severity: "error",
      message: `Assembly system "${assemblySystem}" is not supported by the sim kernel`,
      fixHint: "Use stv, fptp, closed_list_pr, or mixed_member",
    });
  }

  for (const [i, pack] of (doc.contentSections.contentPacks ?? []).entries()) {
    if (!pack.packId?.trim()) {
      push(errors, {
        path: `contentSections.contentPacks[${i}].packId`,
        code: "CONTENT_PACK_ID",
        severity: "error",
        message: "content pack reference requires packId",
      });
    }
    if (!pack.version?.trim()) {
      push(warnings, {
        path: `contentSections.contentPacks[${i}].version`,
        code: "CONTENT_PACK_VERSION",
        severity: "warning",
        message: "content pack reference should include a version for reproducible loads",
        fixHint: "Set version to match the installed pack manifest",
      });
    }
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

  const foreignIds = new Set(foreignCountriesList(doc).map((c) => c.id));
  for (const [i, rel] of (doc.contentSections.foreign?.relations ?? []).entries()) {
    if (foreignIds.size > 0 && (!foreignIds.has(rel.a) || !foreignIds.has(rel.b))) {
      push(warnings, {
        path: `contentSections.foreign.relations[${i}]`,
        code: "RELATION_UNKNOWN_COUNTRY",
        severity: "warning",
        message: "Relation references a country id not listed in foreign.countries",
      });
    }
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

export function validateScenario(
  raw: unknown,
  options?: { installedContentPackIds?: Set<string> },
): ScenarioValidationReport {
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
  if (options?.installedContentPackIds) {
    for (const [i, pack] of (doc.contentSections.contentPacks ?? []).entries()) {
      if (pack.packId && !options.installedContentPackIds.has(pack.packId)) {
        push(semantic.warnings, {
          path: `contentSections.contentPacks[${i}].packId`,
          code: "CONTENT_PACK_MISSING",
          severity: "warning",
          message: `Referenced content pack "${pack.packId}" is not installed`,
          fixHint: "Install the pack or remove the reference",
        });
      }
    }
  }
  return {
    errors: [...structural.errors, ...semantic.errors],
    warnings: [...structural.warnings, ...semantic.warnings],
    suggestions: [...structural.suggestions, ...semantic.suggestions],
  };
}

export function scenarioHasBlockingErrors(report: ScenarioValidationReport): boolean {
  return report.errors.length > 0;
}
