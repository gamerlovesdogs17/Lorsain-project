export { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION, SCENARIO_MAX_BYTES } from "./constants.js";
export type {
  ScenarioContentEmbed,
  ScenarioContentSections,
  ScenarioDocument,
  ScenarioDocumentRaw,
  ScenarioForeignCountrySection,
  ScenarioPoliticianSection,
  ScenarioOrganizationSection,
  ScenarioLawSection,
  ScenarioGovernmentSection,
  ScenarioPartySection,
  ScenarioProvinceSection,
  ScenarioConstituencySection,
  ScenarioElectionsSection,
  ScenarioValidationIssue,
  ScenarioValidationReport,
  ScenarioValidationSeverity,
  ThresholdPresetId,
  GovernmentFormId,
  AssemblySystemId,
  QuickBuildInput,
  QuickBuildElectoralPreset,
} from "./types.js";
/** @deprecated alias — use ScenarioPoliticianSection */
export type { ScenarioPoliticianSection as ScenarioPersonSection } from "./types.js";
export { parseScenarioDocument, serializeScenarioDocument } from "./parse.js";
export { validateScenario, scenarioHasBlockingErrors } from "./validate.js";
export { migrateScenario } from "./migrate.js";
export {
  exportScenarioJson,
  importScenarioJson,
  scenarioJsonRoundtrip,
  type ScenarioImportResult,
} from "./importExport.js";
export {
  generateQuickBuildDocument,
  generateForeignWorld,
  generatePoliticians,
  generateLeaders,
  fillCabinet,
  generateConstituencies,
  personDisplay,
  quickBuildScenario,
  type StudioQuickBuildForm,
} from "./generators.js";
export { quickBuildScenario as buildQuickScenario } from "./quickBuild.js";
export {
  THRESHOLD_PRESET_FRACTIONS,
  absoluteMajorityFromPreset,
  fractionFromPreset,
} from "./thresholds.js";
export {
  THRESHOLD_PRESETS,
  thresholdPresetForFraction,
  fractionForThresholdPreset,
  TRAIT_BANDS,
  traitBandForValue,
  valueForTraitBand,
  GOVERNMENT_FORM_PRESETS,
  ELECTORAL_PRESETS,
} from "./humanControls.js";
export {
  CONTENT_PACK_FORMAT,
  CONTENT_PACK_FORMAT_VERSION,
  parseContentPack,
  validateContentPack,
  detectIdCollisionsAcrossPacks,
  detectIdCollisionsAcrossPacks as detectContentPackCollisions,
  exportContentPackJson,
  importContentPackJson,
  type ContentPackDocument,
  type ContentPackValidationReport,
} from "./contentPack.js";
export {
  PARTY_SYSTEM_OPTIONS,
  PRESIDENTIAL_ELECTION_OPTIONS,
  ASSEMBLY_ELECTION_OPTIONS,
  JUDICIAL_REVIEW_OPTIONS,
  PROVINCIAL_COMPETENCE_OPTIONS,
  EMERGENCY_POWER_OPTIONS,
  TREATY_APPROVAL_OPTIONS,
  AMENDMENT_PROCESS_OPTIONS,
  ENTRENCHMENT_OPTIONS,
  CIVIL_LIBERTY_OPTIONS,
  EXECUTIVE_AUTHORITY_OPTIONS,
  CABINET_FORMATION_OPTIONS,
  REPUBLIC_FORM_OPTIONS,
  CITIZENSHIP_GUARD_OPTIONS,
  PRESS_FREEDOM_OPTIONS,
  LOCAL_GOVERNMENT_OPTIONS,
  DEFENSE_CONTROL_OPTIONS,
  PARTY_IDEOLOGY_FAMILIES,
  ORGANIZATION_TYPE_OPTIONS,
  PERSON_BACKGROUND_OPTIONS,
  DIPLOMATIC_RELATION_OPTIONS,
  LAW_CATALOG_OPTIONS,
  optionIds,
  isOptionId,
  labelForOption,
  type OptionMeta,
} from "./optionCatalogs.js";
