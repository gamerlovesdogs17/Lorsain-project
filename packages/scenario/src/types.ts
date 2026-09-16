import type { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";

export type ScenarioValidationSeverity = "error" | "warning" | "suggestion";

export type ScenarioValidationIssue = {
  path: string;
  code: string;
  severity: ScenarioValidationSeverity;
  message: string;
  fixHint?: string;
};

export type ScenarioValidationReport = {
  errors: ScenarioValidationIssue[];
  warnings: ScenarioValidationIssue[];
  suggestions: ScenarioValidationIssue[];
};

export type ThresholdPresetId =
  "simple_majority" | "three_fifths" | "two_thirds" | "three_quarters" | "custom";

export type GovernmentFormId = "presidential" | "parliamentary" | "semi";

export type AssemblySystemId = "stv" | "fptp" | "closed_list_pr" | "mixed_member";

export type ScenarioPartyCaucusSection = {
  id: string;
  name: string;
  leaderId?: string;
  supportShare?: number;
};

export type ScenarioPartySection = {
  id: string;
  name: string;
  abbreviation: string;
  /** @deprecated use ideologyLabel — kept for Alphaven fixture compat */
  ideology?: string;
  ideologyLabel?: string;
  leaderId: string;
  color?: string | null;
  seatCount?: number;
  platformSummary?: string;
  caucuses?: ScenarioPartyCaucusSection[];
};

export type ScenarioProvinceSection = {
  id: string;
  name: string;
  population?: number;
  economy?: string;
  urbanization?: string;
  characteristics?: string[];
};

export type ScenarioConstituencySection = {
  id: string;
  name: string;
  provinceId: string;
  seats: number;
  population?: number;
};

export type ScenarioPoliticianSection = {
  id: string;
  name: string;
  partyId?: string | null;
  provinceId?: string | null;
  birthYear?: number;
  background?: string;
  traits?: string[];
  ideology?: string;
  office?: string;
};

export type ScenarioCabinetEntry = {
  ministryId: string;
  holderId: string;
};

export type ScenarioGovernmentSection = {
  presidentId?: string | null;
  headOfGovernmentId?: string | null;
  cabinet?: ScenarioCabinetEntry[];
  coalitionPartyIds?: string[];
};

export type ScenarioConstitutionSection = {
  governmentForm?: GovernmentFormId;
  assemblySeats?: number;
  assemblyAbsoluteMajority?: number;
  assemblyAbsoluteMajorityPreset?: ThresholdPresetId;
  courtJudges?: number;
  courtTermYears?: number;
  ministerialCensureFraction?: number;
  ministerialCensurePreset?: ThresholdPresetId;
  regulationReviewDays?: number;
};

export type ScenarioElectionsSection = {
  assemblySystem?: AssemblySystemId;
  presidentialMode?: string;
  nominationRuleLabels?: Record<string, string>;
  nextAssemblyElectionDate?: string;
  nextPresidentialElectionDate?: string;
  /** Optional cycle length when next dates are calendar-derived (custom mini worlds). */
  presidentialIntervalYears?: number;
  assemblyIntervalYears?: number;
};

export type ScenarioLawSection = {
  id: string;
  title: string;
  policyItems?: string[];
  catalogRef?: string;
};

export type ScenarioOrganizationSection = {
  id: string;
  name: string;
  type: string;
  issues: string[];
  scope?: string;
};

export type ScenarioForeignCountrySection = {
  id: string;
  name: string;
  region?: string;
  relation?: number;
  leaderName?: string;
};

export type ScenarioForeignRelationSection = {
  a: string;
  b: string;
  diplomatic?: number;
  trade?: number;
  security?: number;
};

export type ScenarioForeignTreatySection = {
  id: string;
  title: string;
  kind?: string;
  partyCountryIds?: string[];
};

export type ScenarioForeignCrisisSection = {
  id: string;
  title: string;
  stage?: string;
  involvedCountryIds?: string[];
};

export type ScenarioForeignSection = {
  countries?: ScenarioForeignCountrySection[];
  relations?: ScenarioForeignRelationSection[];
  treaties?: ScenarioForeignTreatySection[];
  crises?: ScenarioForeignCrisisSection[];
};

export type ScenarioContentPackRef = {
  packId: string;
  version: string;
};

export type ScenarioContentSections = {
  overview?: {
    tagline?: string;
    foundingYear?: number;
  };
  constitution?: ScenarioConstitutionSection;
  geography?: {
    provinces?: ScenarioProvinceSection[];
    constituencies?: ScenarioConstituencySection[];
  };
  parties?: ScenarioPartySection[];
  people?: {
    politicians?: ScenarioPoliticianSection[];
  };
  government?: ScenarioGovernmentSection;
  elections?: ScenarioElectionsSection;
  laws?: {
    startingLaws?: ScenarioLawSection[];
  };
  organizations?: ScenarioOrganizationSection[];
  /** @deprecated use foreign.countries */
  foreignCountries?: ScenarioForeignCountrySection[];
  foreign?: ScenarioForeignSection;
  contentPacks?: ScenarioContentPackRef[];
  world?: {
    assemblySeats?: number;
    courtJudges?: number;
    jurisdictionId?: string;
  };
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

export type QuickBuildElectoralPreset = "stv" | "fptp" | "mixed_member" | "closed_list_pr";

export type QuickBuildInput = {
  countryName: string;
  startDate: string;
  governmentForm: GovernmentFormId;
  assemblySeats: number;
  provinceCount: number;
  partyCount: number;
  electoralPreset: QuickBuildElectoralPreset;
  generationSeed: string;
  scenarioId?: string;
  name?: string;
  author?: string;
};
