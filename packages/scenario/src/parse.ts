import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";
import type { ScenarioContentEmbed, ScenarioContentSections, ScenarioDocument } from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function parseContentSections(raw: unknown): ScenarioContentSections {
  if (!isRecord(raw)) return {};
  const out: ScenarioContentSections = {};
  if (isRecord(raw.overview)) {
    out.overview = {
      ...(typeof raw.overview.tagline === "string" ? { tagline: raw.overview.tagline } : {}),
      ...(typeof raw.overview.foundingYear === "number"
        ? { foundingYear: raw.overview.foundingYear }
        : {}),
    };
  }
  if (isRecord(raw.constitution)) {
    const c = raw.constitution;
    out.constitution = {
      ...(typeof c.assemblySeats === "number" ? { assemblySeats: c.assemblySeats } : {}),
      ...(typeof c.assemblyAbsoluteMajority === "number"
        ? { assemblyAbsoluteMajority: c.assemblyAbsoluteMajority }
        : {}),
      ...(typeof c.courtJudges === "number" ? { courtJudges: c.courtJudges } : {}),
      ...(typeof c.courtTermYears === "number" ? { courtTermYears: c.courtTermYears } : {}),
      ...(typeof c.ministerialCensureFraction === "number"
        ? { ministerialCensureFraction: c.ministerialCensureFraction }
        : {}),
      ...(typeof c.regulationReviewDays === "number"
        ? { regulationReviewDays: c.regulationReviewDays }
        : {}),
    };
  }
  if (Array.isArray(raw.parties)) {
    out.parties = raw.parties.filter(isRecord).map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      abbreviation: String(p.abbreviation ?? p.short ?? ""),
      ideology: String(p.ideology ?? ""),
      leaderId: String(p.leaderId ?? p.leader_id ?? ""),
      ...(p.color === null || typeof p.color === "string"
        ? { color: p.color as string | null }
        : {}),
    }));
  }
  if (isRecord(raw.geography) && Array.isArray(raw.geography.provinces)) {
    out.geography = {
      provinces: raw.geography.provinces.filter(isRecord).map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
      })),
    };
  }
  if (isRecord(raw.world)) {
    out.world = {
      ...(typeof raw.world.assemblySeats === "number"
        ? { assemblySeats: raw.world.assemblySeats }
        : {}),
      ...(typeof raw.world.courtJudges === "number" ? { courtJudges: raw.world.courtJudges } : {}),
      ...(typeof raw.world.jurisdictionId === "string"
        ? { jurisdictionId: raw.world.jurisdictionId }
        : {}),
    };
  }
  if (Array.isArray(raw.foreignCountries)) {
    out.foreignCountries = raw.foreignCountries.filter(isRecord).map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      ...(typeof c.region === "string" ? { region: c.region } : {}),
      ...(typeof c.relation === "number" ? { relation: c.relation } : {}),
    }));
  }
  return out;
}

function parseContentEmbed(raw: unknown): ScenarioContentEmbed {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    return { kind: "mini_playable_v1" };
  }
  if (raw.kind === "kernel_input" && isRecord(raw.kernelInput)) {
    return { kind: "kernel_input", kernelInput: raw.kernelInput };
  }
  if (raw.kind === "content_bundle_ref") {
    return {
      kind: "content_bundle_ref",
      ...(typeof raw.bundleLabel === "string" ? { bundleLabel: raw.bundleLabel } : {}),
    };
  }
  return { kind: "mini_playable_v1" };
}

export function parseScenarioDocument(raw: unknown): ScenarioDocument {
  if (!isRecord(raw)) {
    throw new Error("Scenario document must be a JSON object");
  }
  const format = raw.format;
  if (format !== SCENARIO_FORMAT) {
    throw new Error(`Unsupported scenario format ${String(format)}`);
  }
  const formatVersion = raw.formatVersion;
  if (formatVersion !== SCENARIO_FORMAT_VERSION) {
    throw new Error(`Unsupported scenario formatVersion ${String(formatVersion)}`);
  }
  if (typeof raw.scenarioId !== "string" || raw.scenarioId.length === 0) {
    throw new Error("scenarioId is required");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error("name is required");
  }
  if (!isIsoDate(raw.startDate)) {
    throw new Error("startDate must be YYYY-MM-DD");
  }
  if (typeof raw.countryName !== "string" || raw.countryName.length === 0) {
    throw new Error("countryName is required");
  }
  const doc: ScenarioDocument = {
    format: SCENARIO_FORMAT,
    formatVersion: SCENARIO_FORMAT_VERSION,
    scenarioId: raw.scenarioId,
    name: raw.name,
    startDate: raw.startDate,
    countryName: raw.countryName,
    contentSections: parseContentSections(raw.contentSections),
    contentEmbed: parseContentEmbed(raw.contentEmbed),
  };
  if (typeof raw.description === "string") doc.description = raw.description;
  if (typeof raw.author === "string") doc.author = raw.author;
  if (typeof raw.gameVersion === "string") doc.gameVersion = raw.gameVersion;
  return doc;
}

export function serializeScenarioDocument(doc: ScenarioDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
