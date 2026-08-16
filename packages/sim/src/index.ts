export {
  STREAM_NAMES,
  type StreamName,
  type SerializedRngState,
  type RngService,
  type Xoshiro128State,
  createRngService,
  restoreRngService,
  parseSerializedRngState,
  cyrb128,
  deriveStreamState,
  hashSeedToUint32,
  splitmix32,
  assertValidSerializedRng,
} from "./rng.js";

export {
  type IsoDate,
  type Weekday,
  type WeekdayName,
  type RegularElectionCalendar,
  isLeapYear,
  daysInMonth,
  parseIsoDate,
  isIsoDate,
  formatIsoDate,
  compareIsoDate,
  addDays,
  addMonths,
  addYears,
  daysBetween,
  startOfMonth,
  startOfNextMonth,
  dayOfWeek,
  weekdayName,
  nthWeekdayOfMonth,
  regularElectionDate,
  TERENA_PRESIDENTIAL_CALENDAR,
  TERENA_ASSEMBLY_CALENDAR,
  presidentialAssumptionDate,
  assemblyAssumptionDate,
  officeAssumptionDate,
} from "./calendar.js";

export { hashCanonical, canonicalize, canonicalJson } from "./hash.js";
export { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
export {
  parseSaveFile,
  migrateSaveV1ToV2,
  migrateSaveV2ToV3,
  migrateSaveV3ToV4,
  CONTENT_MIGRATIONS,
  SCHEMA_MIGRATIONS,
} from "./save.js";
export { SAVE_SCHEMA_VERSION } from "./types.js";
export { buildTerenaKernelWorld, KernelContentError, type TerenaKernelInput } from "./world.js";
export {
  occupyingTerms,
  currentHolderIds,
  canAssumeOffice,
  canResumeTerm,
  officesOfKind,
  activeTermsForPolitician,
  resumeTerm,
  suspendTerm,
} from "./offices.js";
export { compareScheduled } from "./scheduler.js";
export { pickActingPresident } from "./succession.js";
export { validateKernelWorld, validateStateAgainstWorld } from "./validate-world.js";
export type { JsonValue, JsonObject, JsonPrimitive } from "./json.js";
export {
  getAgentProfile,
  applyRelationshipChange,
  getRelationship,
  countRelationshipEdges,
  recordPoliticalMemory,
  effectiveSalience,
  recordObservation,
  getBelief,
  reviewGoals,
  generateGoalDrafts,
  seedInitialGoals,
  buildDecisionActorContext,
  evaluateOption,
  evaluateDecision,
  chooseDecision,
  emptySignals,
  breakdownSumsToTotal,
  syntheticAgentProfile,
  type AgentProfile,
  type DecisionActorContext,
  type DecisionOption,
  type UtilityBreakdown,
} from "./agents/index.js";
export {
  partyMembers,
  factionMembers,
  assemblyCaucus,
  factionAssemblyCaucus,
  publicPartyCulture,
  chooseEndorsement,
  chooseMembershipAction,
} from "./parties/index.js";
export type {
  Command,
  CommandResult,
  DomainInterrupt,
  PendingInterrupt,
  KernelWorld,
  KernelOffice,
  SaveFile,
  SimEvent,
  SimState,
  OfficeTerm,
  ScheduledEvent,
  CreateSimulationOptions,
} from "./types.js";
export type { HostToWorkerMessage, WorkerToHostMessage } from "./worker-protocol.js";
