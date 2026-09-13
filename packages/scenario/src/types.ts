import type { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";

export type ScenarioValidationSeverity = "error" | "warning" | "suggestion";

export type ScenarioValidationIssue = {
  path: string;
  code: string;
  severity: ScenarioValidationSeverity;
  message: string;
};

export type ScenarioValidationReport = {
  errors: ScenarioValidationIssue[];
  warnings: ScenarioValidationIssue[];
  suggestions: ScenarioValidationIssue[];
};

export type ScenarioPartySection = {
  id: string;
  name: string;
  abbreviation: string;
  ideology: string;
  leaderId: string;
  color?: string | null;
};

export type ScenarioProvincePlaceholder = {
  id: string;
  name: string;
};

export type ScenarioConstitutionSection = {
  assemblySeats?: number;
  assemblyAbsoluteMajority?: number;
  courtJudges?: number;
  courtTermYears?: number;
  ministerialCensureFraction?: number;
  regulationReviewDays?: number;
};

export type ScenarioForeignCountrySection = {
  id: string;
  name: string;
  region?: string;
  relation?: number;
};

export type ScenarioContentSections = {
  overview?: {
    tagline?: string;
    foundingYear?: number;
  };
  constitution?: ScenarioConstitutionSection;
  parties?: ScenarioPartySection[];
  geography?: {
    provinces?: ScenarioProvincePlaceholder[];
  };
  world?: {
    assemblySeats?: number;
    courtJudges?: number;
    jurisdictionId?: string;
  };
  foreignCountries?: ScenarioForeignCountrySection[];
};

export type ScenarioContentEmbed =
  | { kind: "mini_playable_v1" }
  | { kind: "kernel_input"; kernelInput: Record<string, unknown> }
  | { kind: "content_bundle_ref"; bundleLabel?: string };

export type ScenarioDocument = {
  format: typeof SCENARIO_FORMAT;
  formatVersion: typeof SCENARIO_FORMAT_VERSION;
  scenarioId: string;
  name: string;
  description?: string;
  startDate: string;
  author?: string;
  countryName: string;
  gameVersion?: string;
  contentSections: ScenarioContentSections;
  contentEmbed: ScenarioContentEmbed;
};

export type ScenarioDocumentRaw = Record<string, unknown>;
