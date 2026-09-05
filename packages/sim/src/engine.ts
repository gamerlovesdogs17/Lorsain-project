import { addMonths, compareIsoDate, isIsoDate, type IsoDate } from "./calendar.js";
import { emptyAgentRuntime } from "./agents/validation.js";
import { recordObservation } from "./agents/beliefs.js";
import { needsInitialGoals, reviewGoals, seedInitialGoals } from "./agents/goals.js";
import { recordPoliticalMemory } from "./agents/memories.js";
import { applyRelationshipChange } from "./agents/relationships.js";
import { changeFaction, changePartyMembership } from "./parties/membership.js";
import { applyPoliticianExit, processPoliticalLifecycleMonth } from "./political-lifecycle.js";
import { endorseCandidate, withdrawEndorsement } from "./parties/endorsements.js";
import {
  createPartyContest,
  cancelPartyContest,
  declareCandidacy,
  openPartyContest,
  resolvePartyContest,
  setQualificationEvidence,
  withdrawCandidacy,
} from "./parties/contests.js";
import { splitFaction } from "./parties/split.js";
import { processPartyInstitutionsMonth } from "./parties/monthly.js";
import {
  emptyPartyRuntime,
  needsPartyInstitutionSeed,
  seedPartyInstitutions,
} from "./parties/state.js";
import { deepFreeze, hashCanonical, jsonClone } from "./hash.js";
import { isJsonObject, jsonSafetyError, type JsonObject } from "./json.js";
import { assumeOffice, presidentOfficeId, resumeTerm, vacateOffice } from "./offices.js";
import {
  STREAM_NAMES,
  createRngService,
  restoreRngService,
  type RngService,
  type StreamName,
} from "./rng.js";
import {
  enqueueScheduled,
  nextPendingBefore,
  padId,
  pushHistory,
  sortScheduler,
} from "./scheduler.js";
import { parseSaveFile } from "./save.js";
import { applyPresidentialVacancy, planPresidentialVacancy } from "./succession.js";
import {
  emptyElectoralRuntimeState,
  needsElectoralSeed,
  seedCanonicalElections,
} from "./elections/state.js";
import { createPoll } from "./elections/polls.js";
import {
  ensureCandidateStanding,
  seedStartingPublicStanding,
  setCandidateStanding,
  standingMutationError,
} from "./elections/standing.js";
import {
  finalizePresidentialField,
  resolvePresidentialElection,
  syncNominationWinnerToElection,
} from "./elections/presidential.js";
import { addElectionCandidate } from "./elections/field.js";
import {
  applyElectoralEnvironmentPatch,
  electoralEnvironmentPatchError,
} from "./elections/environment.js";
import {
  applyPresidentialAssumption,
  createDomainResolution,
  payloadElectionId,
  resolveUnablePresidentElect,
} from "./elections/resolution.js";
import { applyAssemblyAssumption, resolveAssemblyElection } from "./elections/assembly-national.js";
import { declineAssemblyCandidacy, fileAssemblyCandidacy } from "./elections/assembly-cycle.js";
import { emptyIdeology } from "./agents/profile.js";
import { IDEOLOGY_AXES } from "./agents/types.js";
import { emptyCampaignRuntime } from "./campaigns/types.js";
import {
  campaignAdvertise,
  campaignAttack,
  campaignFundraise,
  campaignGotv,
  campaignMessage,
  campaignOrganize,
  campaignPrepareDebate,
  campaignSeekEndorsement,
  campaignSeekNominationSupport,
  campaignVisit,
  closeAssemblyCampaigns,
  closeGeneralCampaigns,
  declareCampaign,
  ensureCampaignForDeclaredCandidacy,
  transitionNominationToGeneral,
  reconcileCampaignsAfterCandidacyWithdrawal,
  withdrawCampaign,
} from "./campaigns/actions.js";
import { processCampaignMonth } from "./campaigns/monthly.js";
import { ensureActionPoints } from "./campaigns/state.js";
import {
  emptyLegislatureRuntime,
  isLegislativeVoteChoice,
  isLegislativeVoteStage,
} from "./legislature/types.js";
import { processLegislatureMonth } from "./legislature/monthly.js";
import {
  cosponsorBill,
  delayBill,
  introduceBill,
  proposeAmendment,
  returnBill,
  scheduleBill,
  signBill,
  castPlayerVote,
} from "./legislature/procedure.js";
import { upsertRecommendations } from "./legislature/recommendations.js";
import { seedCommitteesIfNeeded } from "./legislature/state.js";
import { reconcileAssemblyVacancies } from "./legislature/vacancies.js";
import {
  campaignCaucusLeadership,
  declareCaucusLeadershipCandidacy,
  seedCaucusLeadership,
  setCaucusBillPosition,
} from "./legislature/caucus.js";
import { emptyExecutiveRuntime, isMotionKind } from "./executive/types.js";
import { processExecutiveMonth } from "./executive/monthly.js";
import {
  appointMinister,
  beginWarPowers,
  castMotionVote,
  declareEmergency,
  dismissMinister,
  introduceMotion,
  issueRegulation,
  proposeBudget,
  scheduleWarAuthorizationReferral,
} from "./executive/procedure.js";
import { seedMinistriesIfNeeded } from "./executive/state.js";
import {
  emptyConstitutionalRuntime,
  isCourtCaseType,
  isJudicialVoteChoice,
} from "./courts/types.js";
import { processCourtsMonth } from "./courts/monthly.js";
import { processEconomyMonth } from "./economy/monthly.js";
import { baselineEconomyRuntime, economyRuntimeFromScenario } from "./economy/types.js";
import { processProvincialMonth } from "./provinces/monthly.js";
import { seedProvincialRuntime } from "./provinces/state.js";
import { emptyProvincialRuntime } from "./provinces/types.js";
import {
  declineGubernatorialCandidacy,
  fileGubernatorialCandidacy,
} from "./provinces/elections.js";
import {
  adviseMinistryPriority,
  directProvincialInvestment,
  respondProvincialPressure,
  setMayorCivicPriority,
  setProvincialPriority,
  takeProvincialFederalPosition,
} from "./provinces/procedure.js";
import {
  declineProvincialAssemblyCandidacy,
  castProvincialBillVote,
  fileProvincialAssemblyCandidacy,
  governorProposeProvincialBill,
  governorProvincialBillDisposition,
  seekProvincialLeadership,
} from "./provinces/assemblies.js";
import {
  castConstitutionalAssemblyVote,
  castConstitutionalRatificationVote,
  proposeConstitutionalAmendment,
  proposeConstitutionalTextAmendment,
} from "./provinces/constitutional.js";
import { processOrganizationsMonth } from "./organizations/monthly.js";
import {
  askOrganizationBillSupport,
  discussOrganizationPolicy,
  meetOrganization,
  seekOrganizationEndorsement,
} from "./organizations/procedure.js";
import { seedOrganizationRuntime } from "./organizations/types.js";
import { processMediaMonth } from "./media/monthly.js";
import { emptyMediaRuntime } from "./media/types.js";
import { emptyForeignAffairsRuntime } from "./foreign/types.js";
import { processForeignAffairsMonth } from "./foreign/monthly.js";
import { processOrganizationForeignReactions } from "./foreign/organization-foreign-bridge.js";
import { advanceForeignCalibrationMonths as advanceForeignCalibrationMonthsHarness } from "./foreign/calibration-harness.js";
import { seedForeignAffairsRuntime } from "./foreign/baseline.js";
import { needsForeignAffairsSeed } from "./foreign/state.js";
import {
  adjustMilitaryPosture,
  allianceConsultation,
  castTreatyRatificationVote,
  diplomaticOutreach,
  diplomaticSummit,
  issueDiplomaticWarning,
  mediateCrisis,
  negotiateTrade,
  playerImposeSanctions,
  playerLiftSanctions,
  playerProposeTreaty,
  respondIncomingDiplomacy,
} from "./foreign/procedure.js";
import {
  linkWarPowerToConflict,
  resolveWarTriggerConflictId,
} from "./foreign/war-powers-bridge.js";
import { isMilitaryPostureLevel, isTreatyKind } from "./foreign/types.js";
import {
  castConfirmationVote,
  castImpeachmentVote,
  castJudicialVote,
  castRecallReferralVote,
  fileConstitutionalCase,
  introduceImpeachment,
  introduceRecallReferral,
  nominateConstitutionalJudge,
} from "./courts/procedure.js";
import {
  SAVE_SCHEMA_VERSION,
  type Command,
  type CommandResult,
  type CreateSimulationOptions,
  type KernelWorld,
  type PendingInterrupt,
  type SaveFile,
  type ScheduledEvent,
  type SimEvent,
  type SimState,
} from "./types.js";
import {
  uniqueAllocatedTermIds,
  validateKernelWorld,
  validateStateAgainstWorld,
} from "./validate-world.js";

export type Simulation = {
  executeCommand(command: Command): CommandResult;
  serializeSave(): SaveFile;
  getSnapshot(): SimState;
  /** Small immutable reading for profiling/calibration loops; never advances RNG. */
  getTelemetrySnapshot(): {
    currentDate: string;
    national: {
      outputIndex: number;
      employmentIndex: number;
      priceIndex: number;
      realWageIndex: number;
      housingIndex: number;
      confidenceIndex: number;
    };
    provinceConditions: Record<string, number>;
  };
  hashState(): string;
  world(): KernelWorld;
  /** Calibration-only foreign month driver; bypasses domestic scheduled interrupts. */
  advanceForeignCalibrationMonths(months: number): number;
};

function freezeWorld(world: KernelWorld): KernelWorld {
  return deepFreeze(jsonClone(world));
}

function turnTarget(state: SimState): IsoDate {
  return addMonths(state.scenarioStartDate, state.completedTurns + 1);
}

function isScheduled(v: ScheduledEvent | { error: { code: string } }): v is ScheduledEvent {
  return !("error" in v);
}

function newState(opts: CreateSimulationOptions, world: KernelWorld, rng: RngService): SimState {
  const politicians: SimState["politicians"] = {};
  for (const p of world.politicians) politicians[p.id] = { ...p };
  const state: SimState = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion: world.contentVersion,
    scenarioId: world.scenarioId,
    scenarioStartDate: world.scenarioStartDate,
    currentDate: world.scenarioStartDate,
    completedTurns: 0,
    activeTurnTarget: null,
    rng: rng.serialize(),
    playerPoliticianId: opts.playerPoliticianId,
    politicians,
    officeTerms: {},
    scheduler: { events: [] },
    pendingInterrupt: null,
    history: [],
    counters: {
      nextEventId: 1,
      nextScheduledId: 1,
      nextTermId: 1,
      schedulerSequence: 1,
      nextCommandId: 1,
      nextMemoryId: 1,
      nextGoalId: 1,
      nextEndorsementId: 1,
      nextPartyContestId: 1,
      nextDynamicPartyId: 1,
      nextPollId: 1,
      nextElectionId: 1,
      nextDomainResolutionId: 1,
      nextCampaignId: 1,
      nextDebateId: 1,
      nextBillId: 1,
      nextAmendmentId: 1,
      nextLegislativeVoteId: 1,
      nextLawId: 1,
      nextRegulationId: 1,
      nextMotionId: 1,
      nextEmergencyId: 1,
      nextWarPowerId: 1,
      nextBudgetId: 1,
      nextCaseId: 1,
      nextCourtNominationId: 1,
      nextCourtDecisionId: 1,
      nextImpeachmentId: 1,
      nextRecallId: 1,
      nextConstitutionalGroundsId: 1,
      nextLaggedEffectId: 1,
      nextEconomicShockId: 1,
      nextOrgActionId: 1,
      nextMediaStoryId: 1,
      nextTreatyId: 1,
      nextSanctionId: 1,
      nextCrisisId: 1,
      nextConflictId: 1,
      nextForeignLeaderId: 1,
      nextDiplomaticActionId: 1,
      nextTreatyRatificationId: 1,
      nextIncomingDiplomacyId: 1,
    },
    presidential: {
      nextRegularElectionDate: world.nextRegularPresidentialElectionDate,
      electedTermCountByPolitician: { ...world.electedTermCounts },
      certifiedPresidentElectId: null,
    },
    ...emptyAgentRuntime(),
    ...emptyPartyRuntime(),
    ...emptyElectoralRuntimeState(),
    campaignRuntime: emptyCampaignRuntime(),
    legislatureRuntime: emptyLegislatureRuntime(),
    executiveRuntime: emptyExecutiveRuntime(),
    constitutionalRuntime: emptyConstitutionalRuntime(),
    economyRuntime: world.economyScenario
      ? economyRuntimeFromScenario(world.economyScenario)
      : baselineEconomyRuntime(world.provinceIds, world.scenarioStartDate),
    provincialRuntime: emptyProvincialRuntime(),
    organizationRuntime: seedOrganizationRuntime(world.interestOrganizations),
    mediaRuntime: emptyMediaRuntime(),
    foreignAffairsRuntime: emptyForeignAffairsRuntime(),
  };
  for (const t of world.startingTerms) {
    const id = padId("TERM", state.counters.nextTermId++);
    state.officeTerms[id] = { ...t, id };
  }
  state.provincialRuntime = seedProvincialRuntime(world, state);
  for (const ev of world.initialScheduled) {
    const queued = enqueueScheduled(state, ev);
    if (!isScheduled(queued)) {
      throw new Error(queued.error.message);
    }
  }
  seedCanonicalElections(state, world);
  seedPartyInstitutions(state, world);
  seedStartingPublicStanding(world, state);
  seedInitialGoals(state, world);
  seedCommitteesIfNeeded(world, state);
  seedCaucusLeadership(world, state);
  seedMinistriesIfNeeded(world, state);
  seedForeignAffairsRuntime(world, state);
  return state;
}

function makeInterrupt(ev: ScheduledEvent): PendingInterrupt {
  return {
    kind: ev.requiresResolution ? "BLOCKING_DOMAIN" : "PRESENTATION",
    code: ev.eventType,
    date: ev.dueDate,
    scheduledEventId: ev.id,
    message: ev.requiresResolution
      ? `Unresolved domain event ${ev.eventType} on ${ev.dueDate}`
      : `Presentation pause ${ev.eventType} on ${ev.dueDate}`,
    requiresResolution: ev.requiresResolution,
    resolutionStatus: "unresolved",
  };
}

function applyScheduled(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  ev: NonNullable<ReturnType<typeof nextPendingBefore>>,
  commandId: string,
): { events: SimEvent[]; interrupt: PendingInterrupt | null } {
  ev.status = "processed";
  state.currentDate = ev.dueDate;
  const events: SimEvent[] = [];
  if (ev.eventType === "SYNTHETIC_STOCHASTIC") {
    const draw = rng.uint32("flavor");
    events.push(
      pushHistory(state, {
        date: ev.dueDate,
        type: "SYNTHETIC_STOCHASTIC",
        importance: 0.2,
        visibility: "system",
        actorIds: [],
        entityIds: [],
        payload: { draw },
        sourceScheduledEventId: ev.id,
        sourceCommandId: commandId,
      }),
    );
    return { events, interrupt: null };
  }
  if (ev.eventType === "OFFICE_TERM_END_DUE" && ev.payload.autoEnd === true) {
    const officeId = String(ev.payload.officeId);
    const vacated = vacateOffice(state, world, officeId, ev.dueDate, "term_expired");
    const ended = "error" in vacated ? [] : vacated.ended;
    events.push(
      pushHistory(state, {
        date: ev.dueDate,
        type: "OFFICE_TERM_EXPIRED",
        importance: 0.5,
        visibility: "public",
        actorIds: ended.map((t) => t.holderId),
        entityIds: [officeId],
        payload: { count: ended.length },
        sourceScheduledEventId: ev.id,
        sourceCommandId: commandId,
      }),
    );
    return { events, interrupt: null };
  }
  if (ev.eventType === "PRESIDENTIAL_ASSUMPTION_DUE") {
    const out = applyPresidentialAssumption(state, world, {
      date: ev.dueDate,
      scheduledEventId: ev.id,
      commandId,
    });
    if ("error" in out) {
      events.push(
        pushHistory(state, {
          date: ev.dueDate,
          type: "PRESIDENT_ELECT_UNABLE_TO_ASSUME",
          importance: 1,
          visibility: "public",
          actorIds: [],
          entityIds: [presidentOfficeId(world)],
          payload: { code: out.error.code, message: out.error.message },
          sourceScheduledEventId: ev.id,
          sourceCommandId: commandId,
        }),
      );
      const interrupt = makeInterrupt(ev);
      interrupt.message = out.error.message;
      state.pendingInterrupt = interrupt;
      return { events, interrupt };
    }
    events.push(...out.events);
    return { events, interrupt: null };
  }
  if (ev.eventType === "ASSEMBLY_ASSUMPTION_DUE") {
    const out = applyAssemblyAssumption(state, world, {
      date: ev.dueDate,
      scheduledEventId: ev.id,
      commandId,
    });
    if ("error" in out) {
      events.push(
        pushHistory(state, {
          date: ev.dueDate,
          type: "ASSEMBLY_ASSUMPTION_FAILED",
          importance: 1,
          visibility: "public",
          actorIds: [],
          entityIds: [],
          payload: { code: out.error.code, message: out.error.message },
          sourceScheduledEventId: ev.id,
          sourceCommandId: commandId,
        }),
      );
      const interrupt = makeInterrupt(ev);
      interrupt.message = out.error.message;
      state.pendingInterrupt = interrupt;
      return { events, interrupt };
    }
    events.push(...out.events);
    return { events, interrupt: null };
  }
  events.push(
    pushHistory(state, {
      date: ev.dueDate,
      type: ev.eventType,
      importance: ev.blocking ? 1 : 0.4,
      visibility: "public",
      actorIds: [],
      entityIds: [],
      payload: ev.payload,
      sourceScheduledEventId: ev.id,
      sourceCommandId: commandId,
    }),
  );
  if (ev.blocking) {
    const interrupt = makeInterrupt(ev);
    state.pendingInterrupt = interrupt;
    return { events, interrupt };
  }
  return { events, interrupt: null };
}

/** Month order: lifecycle → economy/provinces/parties → organizations → campaign/legislature/executive/courts → scheduled events → media last. */
function runTowardTarget(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  target: IsoDate,
  commandId: string,
  includeTargetEvents = false,
): { events: SimEvent[]; interrupt: PendingInterrupt | null } {
  const events: SimEvent[] = [];
  const profile = (
    globalThis as typeof globalThis & { __lorsainStageTimings?: Record<string, number[]> }
  ).__lorsainStageTimings;
  const timed = <T>(stage: string, fn: () => T): T => {
    if (!profile) return fn();
    const started = performance.now();
    const result = fn();
    (profile[stage] ??= []).push(performance.now() - started);
    return result;
  };
  events.push(
    ...timed("political_lifecycle", () => processPoliticalLifecycleMonth(state, world, commandId)),
  );
  events.push(...timed("economy", () => processEconomyMonth(state, world, rng, commandId)));
  events.push(...timed("provincial", () => processProvincialMonth(state, world, rng, commandId)));
  events.push(...timed("party", () => processPartyInstitutionsMonth(world, state, rng, commandId)));
  events.push(
    ...timed("organizations", () => processOrganizationsMonth(state, world, rng, commandId)),
  );
  events.push(...timed("campaign", () => processCampaignMonth(state, world, rng, commandId)));
  events.push(...timed("legislature", () => processLegislatureMonth(state, world, rng, commandId)));
  events.push(...timed("executive", () => processExecutiveMonth(state, world, rng, commandId)));
  events.push(...timed("courts", () => processCourtsMonth(state, world, rng, commandId)));
  sortScheduler(state);
  while (true) {
    // Non-blocking events become effective on their due date.  In particular,
    // an auto-vacating office term cannot be carried into a save stamped with
    // that same date and only cleaned up on the following turn.  Blocking
    // events retain the existing stop-on-date/resume behavior.
    const next = nextPendingBefore(state, target, true);
    if (!next) break;
    if (!includeTargetEvents && next.blocking && compareIsoDate(next.dueDate, target) === 0) {
      break;
    }
    const out = applyScheduled(state, world, rng, next, commandId);
    events.push(...out.events);
    if (out.interrupt) return { events, interrupt: out.interrupt };
  }
  // Scheduled assumptions, successions, and vacancies can change Assembly
  // membership after the legislature's monthly pass. Reconcile in the same
  // turn so a save restored on this date is observationally identical.
  events.push(
    ...timed("assembly_vacancies", () => reconcileAssemblyVacancies(state, world, commandId)),
  );
  timed("institution_reconciliation", () => seedCommitteesIfNeeded(world, state));
  const foreignEvents = timed("foreign", () =>
    processForeignAffairsMonth(state, world, rng, commandId),
  );
  events.push(...foreignEvents);
  events.push(
    ...timed("organization_foreign", () =>
      processOrganizationForeignReactions(state, world, commandId, foreignEvents),
    ),
  );
  events.push(...timed("media", () => processMediaMonth(state, world, rng, commandId)));
  state.currentDate = target;
  state.completedTurns += 1;
  state.activeTurnTarget = null;
  state.pendingInterrupt = null;
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.status === "active" || campaign.status === "exploring") {
      ensureActionPoints(world, state, campaign);
    }
  }
  events.push(
    pushHistory(state, {
      date: target,
      type: "TURN_COMPLETED",
      importance: 0.1,
      visibility: "system",
      actorIds: [],
      entityIds: [],
      payload: { completedTurns: state.completedTurns, target },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return { events, interrupt: null };
}

function syncRng(state: SimState, rng: RngService): void {
  state.rng = rng.serialize();
}

function playerOwnsCampaign(state: SimState, campaignId: string): CommandResult | null {
  const campaign = state.campaignRuntime.campaigns[campaignId];
  if (!campaign) {
    return { ok: false, error: { code: "UNKNOWN_CAMPAIGN", message: campaignId } };
  }
  if (campaign.politicianId !== state.playerPoliticianId) {
    return {
      ok: false,
      error: { code: "PLAYER_AUTONOMY", message: "player may only command their own campaign" },
    };
  }
  return null;
}

export function createSimulation(opts: CreateSimulationOptions): Simulation {
  const worldErr = validateKernelWorld(opts.world);
  if (worldErr) throw new Error(`${worldErr.code}: ${worldErr.message}`);
  if (!opts.world.politicians.some((p) => p.id === opts.playerPoliticianId)) {
    throw new Error(`playerPoliticianId ${opts.playerPoliticianId} is not in kernel world`);
  }
  const world = freezeWorld(opts.world);
  const seed = opts.seed ?? world.canonicalSeed;
  const rng = createRngService(seed);
  const state = newState(opts, world, rng);
  const idErr = uniqueAllocatedTermIds(state);
  if (idErr) throw new Error(`${idErr.code}: ${idErr.message}`);
  const stateErr = validateStateAgainstWorld(state, world);
  if (stateErr) throw new Error(`${stateErr.code}: ${stateErr.message}`);
  return bind(state, world, rng);
}

export function restoreSimulation(save: SaveFile, world: KernelWorld): Simulation {
  const worldErr = validateKernelWorld(world);
  if (worldErr) throw new Error(`${worldErr.code}: ${worldErr.message}`);
  const frozen = freezeWorld(world);
  if (save.scenarioId !== frozen.scenarioId) {
    throw new Error(`Save scenario ${save.scenarioId} != world ${frozen.scenarioId}`);
  }
  const parsed = parseSaveFile(save, frozen.contentVersion);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const rng = restoreRngService(parsed.save.simulation.rng);
  const state = jsonClone(parsed.save.simulation);
  state.rng = rng.serialize();
  if (needsElectoralSeed(state, frozen)) seedCanonicalElections(state, frozen);
  if (needsPartyInstitutionSeed(state, frozen)) seedPartyInstitutions(state, frozen);
  if (Object.keys(state.candidateStanding).length === 0) {
    seedStartingPublicStanding(frozen, state);
  }
  if (needsInitialGoals(state)) seedInitialGoals(state, frozen);
  seedCommitteesIfNeeded(frozen, state);
  seedCaucusLeadership(frozen, state);
  seedMinistriesIfNeeded(frozen, state);
  if (Object.keys(state.organizationRuntime.actors).length === 0) {
    state.organizationRuntime.actors = seedOrganizationRuntime(frozen.interestOrganizations).actors;
  }
  if (Object.keys(state.economyRuntime.provinces).length === 0) {
    const seeded = frozen.economyScenario
      ? economyRuntimeFromScenario(frozen.economyScenario)
      : baselineEconomyRuntime(frozen.provinceIds, state.currentDate);
    state.economyRuntime.provinces = seeded.provinces;
    state.economyRuntime.provinceHistory = seeded.provinceHistory;
  }
  state.provincialRuntime = seedProvincialRuntime(frozen, state, state.provincialRuntime);
  if (needsForeignAffairsSeed(state)) seedForeignAffairsRuntime(frozen, state);
  const stateErr = validateStateAgainstWorld(state, frozen);
  if (stateErr) throw new Error(`${stateErr.code}: ${stateErr.message}`);
  return bind(state, frozen, rng);
}

function bind(state: SimState, world: KernelWorld, rng: RngService): Simulation {
  const executeCommand = (command: Command): CommandResult => {
    const fail = (code: string, message: string): CommandResult => ({
      ok: false,
      error: { code, message },
    });
    const nextCommandId = (): string => padId("CMD", state.counters.nextCommandId++);

    if (command.type === "ADVANCE_TURN") {
      if (state.pendingInterrupt) {
        return fail(
          "INTERRUPT_PENDING",
          "Use RESUME_TURN after the interrupt is acknowledged or resolved",
        );
      }
      const commandId = nextCommandId();
      const target = turnTarget(state);
      state.activeTurnTarget = target;
      const out = runTowardTarget(state, world, rng, target, commandId);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: out.interrupt };
    }

    if (command.type === "ACKNOWLEDGE_INTERRUPT") {
      const pending = state.pendingInterrupt;
      if (!pending) return fail("NOT_PAUSED", "No pending interrupt to acknowledge");
      if (pending.requiresResolution) {
        return fail(
          "DOMAIN_RESOLUTION_REQUIRED",
          `${pending.code} must be resolved by its domain system before the turn can continue`,
        );
      }
      if (pending.resolutionStatus !== "unresolved") {
        return fail("ALREADY_ACKNOWLEDGED", "Interrupt is already acknowledged");
      }
      const commandId = nextCommandId();
      pending.resolutionStatus = "acknowledged";
      return { ok: true, commandId, events: [], interrupt: pending };
    }

    if (command.type === "RESUME_TURN") {
      const pending = state.pendingInterrupt;
      if (!state.activeTurnTarget && !pending) {
        return fail("NOT_PAUSED", "No paused turn to resume");
      }
      if (pending?.requiresResolution && pending.resolutionStatus !== "resolved") {
        return fail(
          "DOMAIN_RESOLUTION_REQUIRED",
          `${pending.code} must be resolved by its domain system before the turn can continue`,
        );
      }
      if (pending && !pending.requiresResolution && pending.resolutionStatus === "unresolved") {
        return fail("ACK_REQUIRED", "Acknowledge the presentation interrupt before RESUME_TURN");
      }
      const commandId = nextCommandId();
      if (pending && pending.resolutionStatus !== "unresolved") {
        state.pendingInterrupt = null;
      }
      const target = state.activeTurnTarget ?? turnTarget(state);
      state.activeTurnTarget = target;
      const out = runTowardTarget(state, world, rng, target, commandId, true);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: out.interrupt };
    }

    if (command.type === "INJECT_PRESIDENTIAL_VACANCY") {
      const plan = planPresidentialVacancy(state, world, {
        reason: command.reason,
        date: state.currentDate,
        ...(command.presidentElectId ? { presidentElectId: command.presidentElectId } : {}),
      });
      if ("error" in plan) return fail(plan.error.code, plan.error.message);
      const commandId = nextCommandId();
      const out = applyPresidentialVacancy(state, world, {
        reason: command.reason,
        date: state.currentDate,
        commandId,
        ...(command.presidentElectId ? { presidentElectId: command.presidentElectId } : {}),
      });
      if (out.error) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: state.pendingInterrupt };
    }

    if (command.type === "DEV_DRAW_RNG") {
      if (!(STREAM_NAMES as readonly string[]).includes(command.stream)) {
        return fail("UNKNOWN_STREAM", String(command.stream));
      }
      const commandId = nextCommandId();
      const value = rng.uint32(command.stream as StreamName);
      syncRng(state, rng);
      return {
        ok: true,
        commandId,
        events: [
          pushHistory(state, {
            date: state.currentDate,
            type: "DEV_RNG_DRAW",
            importance: 0,
            visibility: "system",
            actorIds: [],
            entityIds: [],
            payload: { stream: command.stream, value },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ],
        interrupt: null,
      };
    }

    if (command.type === "DEV_SCHEDULE_EVENT") {
      if (!isIsoDate(command.dueDate)) return fail("BAD_DATE", `Invalid date ${command.dueDate}`);
      const payload = command.payload ?? {};
      const jsonErr = jsonSafetyError(payload, "payload");
      if (jsonErr || !isJsonObject(payload)) {
        return fail("NON_JSON_PAYLOAD", jsonErr ?? "payload must be a JSON object");
      }
      if (command.requiresResolution === true && command.blocking !== true) {
        return fail(
          "RESOLUTION_EVENT_MUST_BLOCK",
          "requiresResolution events must also be blocking",
        );
      }
      if (command.dueDate < state.currentDate) {
        return fail(
          "SCHEDULE_DATE_IN_PAST",
          `Cannot schedule on ${command.dueDate} before ${state.currentDate}`,
        );
      }
      const commandId = nextCommandId();
      const queued = enqueueScheduled(state, {
        dueDate: command.dueDate,
        eventType: command.eventType,
        payload,
        priority: command.priority ?? 100,
        blocking: command.blocking === true,
        requiresResolution: command.requiresResolution === true,
        source: "DEV_SCHEDULE_EVENT",
      });
      if (!isScheduled(queued)) return fail(queued.error.code, queued.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_SET_ALIVE") {
      const p = state.politicians[command.politicianId];
      if (!p) return fail("UNKNOWN_POLITICIAN", command.politicianId);
      const commandId = nextCommandId();
      let events: SimEvent[];
      if (command.alive) {
        p.alive = true;
        events = [];
      } else {
        events = applyPoliticianExit(state, world, command.politicianId, "death", commandId);
      }
      return { ok: true, commandId, events, interrupt: null };
    }

    if (command.type === "DEV_SET_RETIRED") {
      const p = state.politicians[command.politicianId];
      if (!p) return fail("UNKNOWN_POLITICIAN", command.politicianId);
      const commandId = nextCommandId();
      let events: SimEvent[];
      if (command.retired) {
        events = applyPoliticianExit(state, world, command.politicianId, "retirement", commandId);
      } else {
        p.retired = false;
        events = [];
      }
      return { ok: true, commandId, events, interrupt: null };
    }

    if (command.type === "DEV_VACATE_OFFICE") {
      const vacated = vacateOffice(
        state,
        world,
        command.officeId,
        state.currentDate,
        command.reason,
      );
      if ("error" in vacated) return fail(vacated.error.code, vacated.error.message);
      const commandId = nextCommandId();
      return {
        ok: true,
        commandId,
        events: vacated.ended.map((t) =>
          pushHistory(state, {
            date: state.currentDate,
            type: "OFFICE_TERM_ENDED",
            importance: 0.5,
            visibility: "public",
            actorIds: [t.holderId],
            entityIds: [t.officeId],
            payload: { reason: command.reason },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ),
        interrupt: null,
      };
    }

    if (command.type === "DEV_CERTIFY_PRESIDENT_ELECT") {
      if (!state.politicians[command.politicianId]) {
        return fail("UNKNOWN_POLITICIAN", command.politicianId);
      }
      const commandId = nextCommandId();
      state.presidential.certifiedPresidentElectId = command.politicianId;
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_ASSUME_OFFICE") {
      const assumed = assumeOffice(state, world, {
        officeId: command.officeId,
        holderId: command.holderId,
        date: state.currentDate,
        accessionReason: command.accessionReason ?? "dev",
        holdingKind: command.holdingKind ?? "substantive",
        endDate: null,
        startKnown: true,
        sourceElectionId: null,
      });
      if ("error" in assumed) return fail(assumed.error.code, assumed.error.message);
      const commandId = nextCommandId();
      return {
        ok: true,
        commandId,
        events: [
          pushHistory(state, {
            date: state.currentDate,
            type: "OFFICE_ASSUMED",
            importance: 0.4,
            visibility: "public",
            actorIds: [command.holderId],
            entityIds: [command.officeId, assumed.term.id],
            payload: { holdingKind: assumed.term.holdingKind },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ],
        interrupt: null,
      };
    }

    if (command.type === "DEV_RESUME_TERM") {
      const resumed = resumeTerm(state, world, command.termId);
      if ("error" in resumed) return fail(resumed.error.code, resumed.error.message);
      const commandId = nextCommandId();
      return {
        ok: true,
        commandId,
        events: [
          pushHistory(state, {
            date: state.currentDate,
            type: "OFFICE_TERM_RESUMED",
            importance: 0.4,
            visibility: "public",
            actorIds: [resumed.holderId],
            entityIds: [resumed.officeId, resumed.id],
            payload: {},
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ],
        interrupt: null,
      };
    }

    if (command.type === "DEV_RECORD_INTERACTION") {
      if (!state.politicians[command.sourceId]) {
        return fail("UNKNOWN_POLITICIAN", command.sourceId);
      }
      if (!state.politicians[command.targetId]) {
        return fail("UNKNOWN_POLITICIAN", command.targetId);
      }
      if (command.sourceId === command.targetId) {
        return fail("INVALID_RELATIONSHIP", "sourceId must not equal targetId");
      }
      const delta = command.delta ?? {};
      const relPreview = applyRelationshipChange(
        jsonClone(state),
        command.sourceId,
        command.targetId,
        delta,
        state.currentDate,
      );
      if ("error" in relPreview) return fail(relPreview.error.code, relPreview.error.message);
      if (command.memory) {
        const memPreview = recordPoliticalMemory(
          jsonClone(state),
          world,
          {
            ownerId: command.sourceId,
            subjectIds: command.memory.subjectIds ?? [command.targetId],
            kind: command.memory.kind,
            valence: command.memory.valence,
            salience: command.memory.salience,
            durability: command.memory.durability,
            tags: command.memory.tags,
            sourceEventId: command.memory.sourceEventId,
            relationshipEffects: command.memory.relationshipEffects,
            metadata: command.memory.metadata,
          },
          state.currentDate,
        );
        if ("error" in memPreview) return fail(memPreview.error.code, memPreview.error.message);
      }
      const commandId = nextCommandId();
      const events: SimEvent[] = [];
      const rel = applyRelationshipChange(
        state,
        command.sourceId,
        command.targetId,
        delta,
        state.currentDate,
      );
      if ("error" in rel) return fail(rel.error.code, rel.error.message);
      if (rel.edge) {
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "RELATIONSHIP_CHANGED",
            importance: 0.2,
            visibility: "system",
            actorIds: [command.sourceId, command.targetId],
            entityIds: [command.sourceId, command.targetId],
            payload: {
              affinity: rel.edge.affinity,
              trust: rel.edge.trust,
              respect: rel.edge.respect,
            },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      if (command.memory) {
        const recorded = recordPoliticalMemory(
          state,
          world,
          {
            ownerId: command.sourceId,
            subjectIds: command.memory.subjectIds ?? [command.targetId],
            kind: command.memory.kind,
            valence: command.memory.valence,
            salience: command.memory.salience,
            durability: command.memory.durability,
            tags: command.memory.tags,
            sourceEventId: command.memory.sourceEventId,
            relationshipEffects: command.memory.relationshipEffects,
            metadata: command.memory.metadata,
          },
          state.currentDate,
        );
        if ("error" in recorded) return fail(recorded.error.code, recorded.error.message);
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "MEMORY_RECORDED",
            importance: 0.25,
            visibility: "system",
            actorIds: [command.sourceId],
            entityIds: recorded.memory.subjectIds,
            payload: { memoryId: recorded.memory.id, kind: recorded.memory.kind },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      return { ok: true, commandId, events, interrupt: null };
    }

    if (command.type === "DEV_RECORD_OBSERVATION") {
      const preview = recordObservation(
        jsonClone(state),
        {
          observerId: command.observerId,
          targetId: command.targetId,
          topic: command.topic,
          dimension: command.dimension,
          observed: command.observed,
          observationConfidence: command.observationConfidence,
          sourceReliability: command.sourceReliability,
          source: command.source ?? null,
        },
        state.currentDate,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      if (!preview.changed) {
        return fail("NO_INFORMATION", "observation quality is zero; no belief was written");
      }
      const commandId = nextCommandId();
      const out = recordObservation(
        state,
        {
          observerId: command.observerId,
          targetId: command.targetId,
          topic: command.topic,
          dimension: command.dimension,
          observed: command.observed,
          observationConfidence: command.observationConfidence,
          sourceReliability: command.sourceReliability,
          source: command.source ?? null,
        },
        state.currentDate,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      if (!out.changed) {
        return fail("NO_INFORMATION", "observation quality is zero; no belief was written");
      }
      return {
        ok: true,
        commandId,
        events: [
          pushHistory(state, {
            date: state.currentDate,
            type: "BELIEF_UPDATED",
            importance: 0.2,
            visibility: "system",
            actorIds: [command.observerId],
            entityIds: [command.targetId],
            payload: {
              topic: out.belief.topic,
              dimension: out.belief.dimension,
              estimate: out.belief.estimate,
              confidence: out.belief.confidence,
            },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ],
        interrupt: null,
      };
    }

    if (command.type === "DEV_REVIEW_AGENT_GOALS") {
      const ids = command.politicianId
        ? [command.politicianId]
        : Object.keys(state.politicians).sort();
      for (const id of ids) {
        const preview = reviewGoals(jsonClone(state), world, id, state.currentDate);
        if ("error" in preview) return fail(preview.error.code, preview.error.message);
      }
      const commandId = nextCommandId();
      const reviewed: string[] = [];
      for (const id of ids) {
        const out = reviewGoals(state, world, id, state.currentDate);
        if ("error" in out) return fail(out.error.code, out.error.message);
        reviewed.push(id);
      }
      return {
        ok: true,
        commandId,
        events: [
          pushHistory(state, {
            date: state.currentDate,
            type: "GOALS_REVIEWED",
            importance: 0.15,
            visibility: "system",
            actorIds: reviewed,
            entityIds: reviewed,
            payload: { count: reviewed.length },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        ],
        interrupt: null,
      };
    }

    if (
      command.type === "CHANGE_PARTY_MEMBERSHIP" ||
      command.type === "DEV_CHANGE_PARTY_MEMBERSHIP"
    ) {
      if (
        command.type === "CHANGE_PARTY_MEMBERSHIP" &&
        command.politicianId !== state.playerPoliticianId
      ) {
        return fail("PLAYER_AUTHORITY", "the player may only change their own party membership");
      }
      const preview = changePartyMembership(
        jsonClone(state),
        world,
        command.politicianId,
        command.partyId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = changePartyMembership(
        state,
        world,
        command.politicianId,
        command.partyId,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "GOVERNOR_PROPOSE_PROVINCIAL_BILL") {
      const preview = governorProposeProvincialBill(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.provinceId,
        command.subject,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = governorProposeProvincialBill(
        world,
        state,
        state.playerPoliticianId,
        command.provinceId,
        command.subject,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_PROVINCIAL_BILL_VOTE") {
      const preview = castProvincialBillVote(
        jsonClone(state),
        state.playerPoliticianId,
        command.billId,
        command.choice,
      );
      if (preview.error) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castProvincialBillVote(
        state,
        state.playerPoliticianId,
        command.billId,
        command.choice,
      );
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "SEEK_PROVINCIAL_LEADERSHIP") {
      const preview = seekProvincialLeadership(
        jsonClone(state),
        state.playerPoliticianId,
        command.provinceId,
        command.role,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = seekProvincialLeadership(
        state,
        state.playerPoliticianId,
        command.provinceId,
        command.role,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CHANGE_FACTION" || command.type === "DEV_CHANGE_FACTION") {
      if (command.type === "CHANGE_FACTION" && command.politicianId !== state.playerPoliticianId) {
        return fail("PLAYER_AUTHORITY", "the player may only change their own caucus membership");
      }
      const preview = changeFaction(
        jsonClone(state),
        world,
        command.politicianId,
        command.factionId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = changeFaction(state, world, command.politicianId, command.factionId, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (
      command.type === "DECLARE_PARTY_CONTEST_CANDIDACY" ||
      command.type === "DEV_DECLARE_PARTY_CONTEST_CANDIDACY"
    ) {
      if (
        command.type === "DECLARE_PARTY_CONTEST_CANDIDACY" &&
        command.politicianId !== state.playerPoliticianId
      ) {
        return fail(
          "PLAYER_AUTHORITY",
          "the player cannot declare candidacy for another politician",
        );
      }
      const preview = declareCandidacy(
        jsonClone(state),
        world,
        command.contestId,
        command.politicianId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declareCandidacy(
        state,
        world,
        command.contestId,
        command.politicianId,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      const launched = ensureCampaignForDeclaredCandidacy(
        state,
        world,
        command.contestId,
        command.politicianId,
        commandId,
      );
      return { ok: true, commandId, events: [...out.events, ...launched], interrupt: null };
    }

    if (
      command.type === "WITHDRAW_PARTY_CONTEST_CANDIDACY" ||
      command.type === "DEV_WITHDRAW_PARTY_CONTEST_CANDIDACY"
    ) {
      if (
        command.type === "WITHDRAW_PARTY_CONTEST_CANDIDACY" &&
        command.politicianId !== state.playerPoliticianId
      ) {
        return fail(
          "PLAYER_AUTHORITY",
          "the player cannot withdraw another politician's candidacy",
        );
      }
      const preview = withdrawCandidacy(
        jsonClone(state),
        command.contestId,
        command.politicianId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = withdrawCandidacy(state, command.contestId, command.politicianId, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      const campaignEvents = reconcileCampaignsAfterCandidacyWithdrawal(
        state,
        command.contestId,
        command.politicianId,
        commandId,
      );
      return { ok: true, commandId, events: [...out.events, ...campaignEvents], interrupt: null };
    }

    if (
      command.type === "ENDORSE_PARTY_CONTEST_CANDIDATE" ||
      command.type === "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE"
    ) {
      if (
        command.type === "ENDORSE_PARTY_CONTEST_CANDIDATE" &&
        ((command.endorserType ?? "politician") !== "politician" ||
          command.endorserId !== state.playerPoliticianId)
      ) {
        return fail("PLAYER_AUTHORITY", "the player may only make their own personal endorsement");
      }
      const endorseArgs = {
        endorserType: command.endorserType ?? "politician",
        endorserId: command.endorserId,
        targetId: command.targetId,
        contestId: command.contestId,
      };
      const preview = endorseCandidate(jsonClone(state), world, endorseArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = endorseCandidate(state, world, endorseArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "WITHDRAW_ENDORSEMENT" || command.type === "DEV_WITHDRAW_ENDORSEMENT") {
      const endorsement = state.endorsements[command.endorsementId];
      if (
        command.type === "WITHDRAW_ENDORSEMENT" &&
        (!endorsement ||
          endorsement.endorserType !== "politician" ||
          endorsement.endorserId !== state.playerPoliticianId)
      ) {
        return fail(
          "PLAYER_AUTHORITY",
          "the player may only withdraw their own personal endorsement",
        );
      }
      const preview = withdrawEndorsement(jsonClone(state), command.endorsementId, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = withdrawEndorsement(state, command.endorsementId, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DEV_CREATE_PARTY_CONTEST") {
      const metadata: JsonObject =
        command.selectorMethod != null ? { selectorMethod: command.selectorMethod } : {};
      if (command.memberWeight != null) metadata.memberWeight = command.memberWeight;
      if (command.affiliateUnionDelegateWeight != null) {
        metadata.affiliateUnionDelegateWeight = command.affiliateUnionDelegateWeight;
      }
      const createArgs = {
        type: command.contestType,
        partyId: command.partyId,
        factionId: command.factionId ?? null,
        metadata,
        ...(command.ruleId != null ? { ruleId: command.ruleId } : {}),
      };
      const preview = createPartyContest(jsonClone(state), world, createArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = createPartyContest(state, world, createArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DEV_OPEN_PARTY_CONTEST") {
      const preview = openPartyContest(jsonClone(state), command.contestId, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = openPartyContest(state, command.contestId, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DEV_RESOLVE_PARTY_CONTEST") {
      const previewRng = restoreRngService(state.rng);
      const preview = resolvePartyContest(
        jsonClone(state),
        world,
        command.contestId,
        previewRng,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = resolvePartyContest(state, world, command.contestId, rng, commandId);
      syncRng(state, rng);
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncNominationWinnerToElection(state, command.contestId);
      const transitioned = transitionNominationToGeneral(
        state,
        world,
        command.contestId,
        commandId,
      );
      return { ok: true, commandId, events: [...out.events, ...transitioned], interrupt: null };
    }

    if (command.type === "DEV_CANCEL_PARTY_CONTEST") {
      const preview = cancelPartyContest(jsonClone(state), command.contestId, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = cancelPartyContest(state, command.contestId, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DEV_SET_CONTEST_QUALIFICATION") {
      const preview = setQualificationEvidence(
        jsonClone(state),
        command.contestId,
        command.politicianId,
        command.evidence,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = setQualificationEvidence(
        state,
        command.contestId,
        command.politicianId,
        command.evidence,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_SPLIT_FACTION") {
      const preview = splitFaction(
        jsonClone(state),
        world,
        {
          factionId: command.factionId,
          newPartyName: command.newPartyName,
          newPartyShort: command.newPartyShort,
          politicianIds: command.politicianIds,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = splitFaction(
        state,
        world,
        {
          factionId: command.factionId,
          newPartyName: command.newPartyName,
          newPartyShort: command.newPartyShort,
          politicianIds: command.politicianIds,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "FINALIZE_ELECTION_FIELD") {
      const preview = finalizePresidentialField(jsonClone(state), world, command.electionId);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = finalizePresidentialField(state, world, command.electionId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "RESOLVE_PRESIDENTIAL_ELECTION") {
      const pending = state.pendingInterrupt;
      if (!pending || pending.code !== "PRESIDENTIAL_ELECTION_DUE") {
        return fail(
          "DOMAIN_RESOLUTION_REQUIRED",
          "pending interrupt is not PRESIDENTIAL_ELECTION_DUE",
        );
      }
      const src = state.scheduler.events.find((e) => e.id === pending.scheduledEventId);
      const fromEvent = payloadElectionId(src?.payload);
      if (!fromEvent) {
        return fail("MISSING_ELECTION_ID", "PRESIDENTIAL_ELECTION_DUE lacks payload.electionId");
      }
      if (command.electionId && command.electionId !== fromEvent) {
        return fail("ELECTION_ID_MISMATCH", `${command.electionId} != ${fromEvent}`);
      }
      const electionId = fromEvent;
      const previewRng = restoreRngService(state.rng);
      const preview = resolvePresidentialElection(jsonClone(state), world, previewRng, {
        electionId,
        scheduledEventId: pending.scheduledEventId,
        commandId: "CMD000000",
      });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = resolvePresidentialElection(state, world, rng, {
        electionId,
        scheduledEventId: pending.scheduledEventId,
        commandId,
      });
      if ("error" in out) return fail(out.error.code, out.error.message);
      createDomainResolution(state, {
        sourceScheduledEventId: pending.scheduledEventId,
        domainType: "presidential_election",
        date: state.currentDate,
        electionId,
        resultEventId: out.events[0]!.id,
        archiveElectionId: electionId,
        metadata: {},
      });
      pending.resolutionStatus = "resolved";
      closeGeneralCampaigns(state, electionId, out.election.winnerIds[0] ?? "");
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: pending };
    }

    if (command.type === "RESOLVE_ASSEMBLY_ELECTION") {
      const pending = state.pendingInterrupt;
      if (!pending || pending.code !== "ASSEMBLY_ELECTION_DUE") {
        return fail("DOMAIN_RESOLUTION_REQUIRED", "pending interrupt is not ASSEMBLY_ELECTION_DUE");
      }
      const src = state.scheduler.events.find((e) => e.id === pending.scheduledEventId);
      const fromEvent = payloadElectionId(src?.payload);
      if (!fromEvent) {
        return fail("MISSING_ELECTION_ID", "ASSEMBLY_ELECTION_DUE lacks payload.electionId");
      }
      if (command.electionId && command.electionId !== fromEvent) {
        return fail("ELECTION_ID_MISMATCH", `${command.electionId} != ${fromEvent}`);
      }
      const electionId = fromEvent;
      const previewRng = restoreRngService(state.rng);
      const preview = resolveAssemblyElection(jsonClone(state), world, previewRng, {
        electionId,
        scheduledEventId: pending.scheduledEventId,
        commandId: "CMD000000",
      });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = resolveAssemblyElection(state, world, rng, {
        electionId,
        scheduledEventId: pending.scheduledEventId,
        commandId,
      });
      if ("error" in out) return fail(out.error.code, out.error.message);
      createDomainResolution(state, {
        sourceScheduledEventId: pending.scheduledEventId,
        domainType: "assembly_election",
        date: state.currentDate,
        electionId,
        resultEventId: out.events[0]!.id,
        archiveElectionId: electionId,
        metadata: { phase: "count" },
      });
      pending.resolutionStatus = "resolved";
      closeAssemblyCampaigns(state, electionId, out.election.winnerIds);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: pending };
    }

    if (command.type === "RESOLVE_PRESIDENTIAL_ASSUMPTION") {
      const pending = state.pendingInterrupt;
      if (!pending || pending.code !== "PRESIDENTIAL_ASSUMPTION_DUE") {
        return fail("DOMAIN_RESOLUTION_REQUIRED", "no president-elect assumption block");
      }
      const electId = state.presidential.certifiedPresidentElectId;
      const elect = electId ? state.politicians[electId] : null;
      const useUnableResolution = !elect?.alive || elect.retired;
      const preview = useUnableResolution
        ? resolveUnablePresidentElect(jsonClone(state), world, {
            scheduledEventId: pending.scheduledEventId,
            commandId: "CMD000000",
          })
        : applyPresidentialAssumption(jsonClone(state), world, {
            date: state.currentDate,
            scheduledEventId: pending.scheduledEventId,
            commandId: "CMD000000",
          });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = useUnableResolution
        ? resolveUnablePresidentElect(state, world, {
            scheduledEventId: pending.scheduledEventId,
            commandId,
          })
        : applyPresidentialAssumption(state, world, {
            date: state.currentDate,
            scheduledEventId: pending.scheduledEventId,
            commandId,
          });
      if ("error" in out) return fail(out.error.code, out.error.message);
      pending.resolutionStatus = "resolved";
      return { ok: true, commandId, events: out.events, interrupt: pending };
    }

    if (command.type === "DEV_CREATE_POLL") {
      const election = command.electionId ? state.elections[command.electionId] : undefined;
      const candidateIds = command.candidateIds;
      const partyByCandidate: Record<string, string | null> = {};
      for (const id of candidateIds) {
        partyByCandidate[id] =
          election?.candidates[id]?.partyId ?? state.politicians[id]?.partyId ?? null;
      }
      const previewRng = restoreRngService(state.rng);
      const preview = createPoll(world, jsonClone(state), previewRng, {
        pollsterId: command.pollsterId,
        electionId: command.electionId ?? null,
        geographyKind: command.geographyKind,
        provinceId: command.provinceId ?? null,
        constituencyId: command.constituencyId ?? null,
        candidateIds,
        partyByCandidate,
        fieldStart: state.currentDate,
        fieldEnd: state.currentDate,
        publicationDate: state.currentDate,
        ...(command.sampleSize != null ? { sampleSize: command.sampleSize } : {}),
      });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = createPoll(world, state, rng, {
        pollsterId: command.pollsterId,
        electionId: command.electionId ?? null,
        geographyKind: command.geographyKind,
        provinceId: command.provinceId ?? null,
        constituencyId: command.constituencyId ?? null,
        candidateIds,
        partyByCandidate,
        fieldStart: state.currentDate,
        fieldEnd: state.currentDate,
        publicationDate: state.currentDate,
        ...(command.sampleSize != null ? { sampleSize: command.sampleSize } : {}),
      });
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_SET_CANDIDATE_STANDING") {
      if (!state.politicians[command.politicianId]) {
        return fail("UNKNOWN_POLITICIAN", command.politicianId);
      }
      const standingErr = standingMutationError(command);
      if (standingErr) return fail(standingErr.code, standingErr.message);
      const commandId = nextCommandId();
      ensureCandidateStanding(world, state, command.politicianId);
      const out = setCandidateStanding(state, command.politicianId, command);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_SET_ELECTORAL_ENVIRONMENT") {
      const envErr = electoralEnvironmentPatchError(world, state, command);
      if (envErr) return fail(envErr.code, envErr.message);
      const commandId = nextCommandId();
      applyElectoralEnvironmentPatch(state, command);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "DEV_ADD_ELECTION_CANDIDATE") {
      const pol = state.politicians[command.politicianId];
      if (!pol) return fail("UNKNOWN_POLITICIAN", command.politicianId);
      const ideology =
        command.publicIdeology == null
          ? null
          : {
              ...emptyIdeology(),
              ...Object.fromEntries(
                IDEOLOGY_AXES.filter((a) => typeof command.publicIdeology?.[a] === "number").map(
                  (a) => [a, command.publicIdeology![a] as number],
                ),
              ),
            };
      if (command.publicIdeology != null) {
        for (const axis of IDEOLOGY_AXES) {
          const v = ideology?.[axis];
          if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) {
            return fail("INVALID_PUBLIC_IDEOLOGY", `${command.politicianId}.${axis}`);
          }
        }
      }
      const partyId = command.partyId !== undefined ? command.partyId : pol.partyId;
      const candidate = {
        politicianId: command.politicianId,
        partyId,
        sourceContestId: command.sourceContestId ?? null,
        filedDate: state.currentDate,
        publicIdeology: ideology,
        withdrawn: false,
        independentQualified: command.independentQualified === true,
      };
      const preview = addElectionCandidate(jsonClone(state), world, command.electionId, candidate);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = addElectionCandidate(state, world, command.electionId, candidate);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "FILE_ASSEMBLY_CANDIDACY") {
      const previewState = jsonClone(state);
      const previewFiled = fileAssemblyCandidacy(
        previewState,
        world,
        {
          electionId: command.electionId,
          politicianId: state.playerPoliticianId,
          constituencyId: command.constituencyId,
        },
        null,
      );
      if ("error" in previewFiled) {
        return fail(previewFiled.error.code, previewFiled.error.message);
      }
      const previewCampaign = declareCampaign(
        previewState,
        world,
        {
          politicianId: state.playerPoliticianId,
          type: "assembly",
          electionId: command.electionId,
          constituencyId: command.constituencyId,
        },
        null,
      );
      if ("error" in previewCampaign) {
        return fail(previewCampaign.error.code, previewCampaign.error.message);
      }
      const commandId = nextCommandId();
      const filed = fileAssemblyCandidacy(
        state,
        world,
        {
          electionId: command.electionId,
          politicianId: state.playerPoliticianId,
          constituencyId: command.constituencyId,
        },
        commandId,
      );
      if ("error" in filed) return fail(filed.error.code, filed.error.message);
      const campaign = declareCampaign(
        state,
        world,
        {
          politicianId: state.playerPoliticianId,
          type: "assembly",
          electionId: command.electionId,
          constituencyId: command.constituencyId,
        },
        commandId,
      );
      if ("error" in campaign) return fail(campaign.error.code, campaign.error.message);
      return {
        ok: true,
        commandId,
        events: [...filed.events, ...campaign.events],
        interrupt: null,
      };
    }

    if (command.type === "DECLINE_ASSEMBLY_CANDIDACY") {
      const preview = declineAssemblyCandidacy(
        jsonClone(state),
        world,
        { electionId: command.electionId, politicianId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declineAssemblyCandidacy(
        state,
        world,
        { electionId: command.electionId, politicianId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DECLARE_CAMPAIGN") {
      if (command.politicianId !== state.playerPoliticianId) {
        return fail("PLAYER_AUTONOMY", "player may only declare their own campaign");
      }
      const preview = declareCampaign(
        jsonClone(state),
        world,
        {
          politicianId: command.politicianId,
          type: command.campaignType,
          contestId: command.contestId ?? null,
          electionId: command.electionId ?? null,
          constituencyId: command.constituencyId ?? null,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declareCampaign(
        state,
        world,
        {
          politicianId: command.politicianId,
          type: command.campaignType,
          contestId: command.contestId ?? null,
          electionId: command.electionId ?? null,
          constituencyId: command.constituencyId ?? null,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_FUNDRAISE") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const previewRng = restoreRngService(state.rng);
      const preview = campaignFundraise(
        world,
        jsonClone(state),
        previewRng,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignFundraise(
        world,
        state,
        rng,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_VISIT") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const geography = {
        kind: command.geographyKind,
        id: command.geographyId ?? null,
      };
      const previewRng = restoreRngService(state.rng);
      const preview = campaignVisit(
        world,
        jsonClone(state),
        previewRng,
        { campaignId: command.campaignId, geography, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignVisit(
        world,
        state,
        rng,
        { campaignId: command.campaignId, geography, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_ORGANIZE") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const preview = campaignOrganize(
        world,
        jsonClone(state),
        {
          campaignId: command.campaignId,
          ...(command.constituencyId ? { constituencyId: command.constituencyId } : {}),
          ...(command.geographyKind
            ? {
                geography: {
                  kind: command.geographyKind,
                  id: command.geographyId ?? command.constituencyId ?? null,
                },
              }
            : {}),
          actorId: state.playerPoliticianId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignOrganize(
        world,
        state,
        {
          campaignId: command.campaignId,
          ...(command.constituencyId ? { constituencyId: command.constituencyId } : {}),
          ...(command.geographyKind
            ? {
                geography: {
                  kind: command.geographyKind,
                  id: command.geographyId ?? command.constituencyId ?? null,
                },
              }
            : {}),
          actorId: state.playerPoliticianId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_ADVERTISE") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const args = {
        campaignId: command.campaignId,
        spend: command.spend,
        messageType: command.messageType,
        geography: {
          kind: command.geographyKind ?? "national",
          id: command.geographyId ?? null,
        },
        targetPoliticianId: command.targetPoliticianId ?? null,
        issueId: command.issueId ?? null,
        actorId: state.playerPoliticianId,
      };
      const previewRng = restoreRngService(state.rng);
      const preview = campaignAdvertise(world, jsonClone(state), previewRng, args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignAdvertise(world, state, rng, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_MESSAGE") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const previewRng = restoreRngService(state.rng);
      const preview = campaignMessage(
        world,
        jsonClone(state),
        previewRng,
        {
          campaignId: command.campaignId,
          issueId: command.issueId ?? null,
          actorId: state.playerPoliticianId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignMessage(
        world,
        state,
        rng,
        {
          campaignId: command.campaignId,
          issueId: command.issueId ?? null,
          actorId: state.playerPoliticianId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_ATTACK") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const previewRng = restoreRngService(state.rng);
      const preview = campaignAttack(
        world,
        jsonClone(state),
        previewRng,
        {
          campaignId: command.campaignId,
          targetPoliticianId: command.targetPoliticianId,
          issueId: command.issueId ?? null,
          actorId: state.playerPoliticianId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignAttack(
        world,
        state,
        rng,
        {
          campaignId: command.campaignId,
          targetPoliticianId: command.targetPoliticianId,
          issueId: command.issueId ?? null,
          actorId: state.playerPoliticianId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_SEEK_ENDORSEMENT") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const previewRng = restoreRngService(state.rng);
      const preview = campaignSeekEndorsement(
        world,
        jsonClone(state),
        previewRng,
        {
          campaignId: command.campaignId,
          ...(command.endorserId != null ? { endorserId: command.endorserId } : {}),
          actorId: state.playerPoliticianId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignSeekEndorsement(
        world,
        state,
        rng,
        {
          campaignId: command.campaignId,
          ...(command.endorserId != null ? { endorserId: command.endorserId } : {}),
          actorId: state.playerPoliticianId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_SEEK_NOMINATION_SUPPORT") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const previewRng = restoreRngService(state.rng);
      const preview = campaignSeekNominationSupport(
        world,
        jsonClone(state),
        previewRng,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignSeekNominationSupport(
        world,
        state,
        rng,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      syncRng(state, rng);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_PREPARE_DEBATE") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const preview = campaignPrepareDebate(
        world,
        jsonClone(state),
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignPrepareDebate(
        world,
        state,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_GOTV") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const args = {
        campaignId: command.campaignId,
        geography: { kind: command.geographyKind, id: command.geographyId } as const,
        actorId: state.playerPoliticianId,
      };
      const preview = campaignGotv(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignGotv(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "WITHDRAW_CAMPAIGN") {
      const owned = playerOwnsCampaign(state, command.campaignId);
      if (owned) return owned;
      const preview = withdrawCampaign(
        world,
        jsonClone(state),
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = withdrawCampaign(
        world,
        state,
        { campaignId: command.campaignId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "FILE_GUBERNATORIAL_CANDIDACY") {
      const args = {
        politicianId: state.playerPoliticianId,
        electionId: command.electionId,
        provinceId: command.provinceId,
      };
      const preview = fileGubernatorialCandidacy(jsonClone(state), world, args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = fileGubernatorialCandidacy(state, world, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DECLINE_GUBERNATORIAL_CANDIDACY") {
      const args = { politicianId: state.playerPoliticianId, electionId: command.electionId };
      const preview = declineGubernatorialCandidacy(jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declineGubernatorialCandidacy(state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "FILE_PROVINCIAL_ASSEMBLY_CANDIDACY") {
      const previewState = jsonClone(state);
      const preview = fileProvincialAssemblyCandidacy(
        world,
        previewState,
        state.playerPoliticianId,
        command.electionId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const previewCampaign = declareCampaign(
        previewState,
        world,
        {
          politicianId: state.playerPoliticianId,
          type: "provincial_assembly",
          electionId: command.electionId,
        },
        null,
      );
      if ("error" in previewCampaign)
        return fail(previewCampaign.error.code, previewCampaign.error.message);
      const commandId = nextCommandId();
      const out = fileProvincialAssemblyCandidacy(
        world,
        state,
        state.playerPoliticianId,
        command.electionId,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      const campaign = declareCampaign(
        state,
        world,
        {
          politicianId: state.playerPoliticianId,
          type: "provincial_assembly",
          electionId: command.electionId,
        },
        commandId,
      );
      if ("error" in campaign) return fail(campaign.error.code, campaign.error.message);
      return { ok: true, commandId, events: [...out.events, ...campaign.events], interrupt: null };
    }

    if (command.type === "DECLINE_PROVINCIAL_ASSEMBLY_CANDIDACY") {
      const preview = declineProvincialAssemblyCandidacy(
        jsonClone(state),
        state.playerPoliticianId,
        command.electionId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declineProvincialAssemblyCandidacy(
        state,
        state.playerPoliticianId,
        command.electionId,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "GOVERNOR_SET_PRIORITY") {
      const args = {
        actorId: state.playerPoliticianId,
        provinceId: command.provinceId,
        priority: command.priority,
      };
      const preview = setProvincialPriority(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = setProvincialPriority(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "GOVERNOR_DIRECT_INVESTMENT") {
      const args = {
        actorId: state.playerPoliticianId,
        provinceId: command.provinceId,
        focus: command.focus,
      };
      const preview = directProvincialInvestment(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = directProvincialInvestment(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "GOVERNOR_TAKE_FEDERAL_POSITION") {
      const args = {
        actorId: state.playerPoliticianId,
        provinceId: command.provinceId,
        issueId: command.issueId,
        direction: command.direction,
      };
      const preview = takeProvincialFederalPosition(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = takeProvincialFederalPosition(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "GOVERNOR_RESPOND_TO_PRESSURE") {
      const args = {
        actorId: state.playerPoliticianId,
        provinceId: command.provinceId,
        pressureId: command.pressureId,
        response: command.response,
      };
      const preview = respondProvincialPressure(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = respondProvincialPressure(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (
      command.type === "GOVERNOR_SIGN_PROVINCIAL_BILL" ||
      command.type === "GOVERNOR_VETO_PROVINCIAL_BILL"
    ) {
      const disposition = command.type === "GOVERNOR_SIGN_PROVINCIAL_BILL" ? "sign" : "veto";
      const preview = governorProvincialBillDisposition(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.billId,
        disposition,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = governorProvincialBillDisposition(
        world,
        state,
        state.playerPoliticianId,
        command.billId,
        disposition,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "MINISTER_ADVISE_PRIORITY") {
      const args = { actorId: state.playerPoliticianId, issueId: command.issueId };
      const preview = adviseMinistryPriority(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = adviseMinistryPriority(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "MAYOR_SET_CIVIC_PRIORITY") {
      const args = { actorId: state.playerPoliticianId, priority: command.priority };
      const preview = setMayorCivicPriority(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = setMayorCivicPriority(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "INTRODUCE_BILL") {
      const args = {
        sponsorId: state.playerPoliticianId,
        policyItems: command.policyItems,
        ...(command.title != null ? { title: command.title } : {}),
        ...(command.summary != null ? { summary: command.summary } : {}),
        ...(command.cosponsorIds != null ? { cosponsorIds: command.cosponsorIds } : {}),
      };
      const preview = introduceBill(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = introduceBill(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      upsertRecommendations(world, state, out.bill);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "COSPONSOR_BILL") {
      const preview = cosponsorBill(
        world,
        jsonClone(state),
        { billId: command.billId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = cosponsorBill(
        world,
        state,
        { billId: command.billId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "PROPOSE_AMENDMENT") {
      const preview = proposeAmendment(
        world,
        jsonClone(state),
        {
          billId: command.billId,
          sponsorId: state.playerPoliticianId,
          policyItems: command.policyItems,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = proposeAmendment(
        world,
        state,
        {
          billId: command.billId,
          sponsorId: state.playerPoliticianId,
          policyItems: command.policyItems,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_LEGISLATIVE_VOTE") {
      if (!isLegislativeVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      if (!isLegislativeVoteStage(command.stage)) {
        return fail("INVALID_STAGE", command.stage);
      }
      const voteArgs = {
        billId: command.billId,
        actorId: state.playerPoliticianId,
        choice: command.choice,
        stage: command.stage,
        amendmentId: command.amendmentId ?? null,
      };
      const preview = castPlayerVote(world, jsonClone(state), voteArgs);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castPlayerVote(world, state, voteArgs);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "SIGN_BILL") {
      const preview = signBill(
        world,
        jsonClone(state),
        { billId: command.billId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = signBill(
        world,
        state,
        { billId: command.billId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "RETURN_BILL") {
      const preview = returnBill(
        world,
        jsonClone(state),
        { billId: command.billId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = returnBill(
        world,
        state,
        { billId: command.billId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "SCHEDULE_BILL") {
      const preview = scheduleBill(
        world,
        jsonClone(state),
        { billId: command.billId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = scheduleBill(
        world,
        state,
        { billId: command.billId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DELAY_BILL") {
      const preview = delayBill(
        world,
        jsonClone(state),
        { billId: command.billId, actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = delayBill(
        world,
        state,
        { billId: command.billId, actorId: state.playerPoliticianId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DECLARE_CAUCUS_LEADERSHIP_CANDIDACY") {
      const preview = declareCaucusLeadershipCandidacy(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.contestId,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declareCaucusLeadershipCandidacy(
        world,
        state,
        state.playerPoliticianId,
        command.contestId,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAMPAIGN_CAUCUS_LEADERSHIP") {
      const preview = campaignCaucusLeadership(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.contestId,
        command.emphasis,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = campaignCaucusLeadership(
        world,
        state,
        state.playerPoliticianId,
        command.contestId,
        command.emphasis,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "SET_CAUCUS_BILL_POSITION") {
      const preview = setCaucusBillPosition(
        jsonClone(state),
        state.playerPoliticianId,
        command.billId,
        command.stance,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = setCaucusBillPosition(
        state,
        state.playerPoliticianId,
        command.billId,
        command.stance,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "PROPOSE_CONSTITUTIONAL_AMENDMENT") {
      const preview = proposeConstitutionalAmendment(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.ruleId,
        command.proposedValue,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = proposeConstitutionalAmendment(
        world,
        state,
        state.playerPoliticianId,
        command.ruleId,
        command.proposedValue,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "PROPOSE_CONSTITUTIONAL_TEXT_AMENDMENT") {
      const preview = proposeConstitutionalTextAmendment(
        world,
        jsonClone(state),
        state.playerPoliticianId,
        command.clauseId,
        command.proposedText,
        command.intent,
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = proposeConstitutionalTextAmendment(
        world,
        state,
        state.playerPoliticianId,
        command.clauseId,
        command.proposedText,
        command.intent,
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_CONSTITUTIONAL_AMENDMENT_VOTE") {
      const commandId = nextCommandId();
      const out = castConstitutionalAssemblyVote(
        world,
        state,
        state.playerPoliticianId,
        command.amendmentId,
        command.choice,
      );
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "CAST_CONSTITUTIONAL_RATIFICATION_VOTE") {
      const commandId = nextCommandId();
      const out = castConstitutionalRatificationVote(
        state,
        state.playerPoliticianId,
        command.amendmentId,
        command.choice,
      );
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "APPOINT_MINISTER") {
      const preview = appointMinister(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          officeId: command.officeId,
          politicianId: command.politicianId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = appointMinister(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          officeId: command.officeId,
          politicianId: command.politicianId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DISMISS_MINISTER") {
      const preview = dismissMinister(
        world,
        jsonClone(state),
        { actorId: state.playerPoliticianId, officeId: command.officeId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = dismissMinister(
        world,
        state,
        { actorId: state.playerPoliticianId, officeId: command.officeId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ISSUE_REGULATION") {
      const preview = issueRegulation(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          ministryOfficeId: command.ministryOfficeId,
          policyItems: command.policyItems,
          major: command.major === true,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = issueRegulation(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          ministryOfficeId: command.ministryOfficeId,
          policyItems: command.policyItems,
          major: command.major === true,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "INTRODUCE_MOTION") {
      if (!isMotionKind(command.kind)) return fail("INVALID_MOTION", command.kind);
      const preview = introduceMotion(
        world,
        jsonClone(state),
        { sponsorId: state.playerPoliticianId, kind: command.kind, targetId: command.targetId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = introduceMotion(
        world,
        state,
        { sponsorId: state.playerPoliticianId, kind: command.kind, targetId: command.targetId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_MOTION_VOTE") {
      if (!isLegislativeVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      const preview = castMotionVote(world, jsonClone(state), {
        actorId: state.playerPoliticianId,
        motionId: command.motionId,
        choice: command.choice,
      });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castMotionVote(world, state, {
        actorId: state.playerPoliticianId,
        motionId: command.motionId,
        choice: command.choice,
      });
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "PROPOSE_BUDGET") {
      const preview = proposeBudget(
        world,
        jsonClone(state),
        { actorId: state.playerPoliticianId, allocations: command.allocations },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = proposeBudget(
        world,
        state,
        { actorId: state.playerPoliticianId, allocations: command.allocations },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DECLARE_EMERGENCY") {
      const preview = declareEmergency(
        world,
        jsonClone(state),
        { actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = declareEmergency(world, state, { actorId: state.playerPoliticianId }, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "BEGIN_WAR_POWERS") {
      const preview = beginWarPowers(
        world,
        jsonClone(state),
        { actorId: state.playerPoliticianId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = beginWarPowers(world, state, { actorId: state.playerPoliticianId }, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      const events = [...out.events];
      const warEvent = events.find((e) => e.type === "WAR_POWERS_BEGUN");
      const warPowerId =
        warEvent && typeof warEvent.payload.warPowerId === "string"
          ? warEvent.payload.warPowerId
          : null;
      const conflictId = resolveWarTriggerConflictId(state);
      if (warPowerId && conflictId) {
        linkWarPowerToConflict(state, conflictId, warPowerId);
      }
      if (warPowerId) {
        const motionOut = scheduleWarAuthorizationReferral(world, state, warPowerId, commandId);
        if (!("error" in motionOut)) events.push(...motionOut.events);
      }
      return { ok: true, commandId, events, interrupt: null };
    }

    if (command.type === "NOMINATE_CONSTITUTIONAL_JUDGE") {
      const preview = nominateConstitutionalJudge(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          nomineeId: command.nomineeId,
          seatOfficeId: command.seatOfficeId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = nominateConstitutionalJudge(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          nomineeId: command.nomineeId,
          seatOfficeId: command.seatOfficeId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_CONFIRMATION_VOTE") {
      if (!isLegislativeVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      const preview = castConfirmationVote(world, jsonClone(state), {
        actorId: state.playerPoliticianId,
        nominationId: command.nominationId,
        choice: command.choice,
      });
      if (preview.error) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castConfirmationVote(world, state, {
        actorId: state.playerPoliticianId,
        nominationId: command.nominationId,
        choice: command.choice,
      });
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "CAST_JUDICIAL_VOTE") {
      if (!isJudicialVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      const preview = castJudicialVote(world, jsonClone(state), {
        actorId: state.playerPoliticianId,
        caseId: command.caseId,
        choice: command.choice,
      });
      if (preview.error) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castJudicialVote(world, state, {
        actorId: state.playerPoliticianId,
        caseId: command.caseId,
        choice: command.choice,
      });
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "INTRODUCE_IMPEACHMENT") {
      const preview = introduceImpeachment(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          basisId: command.basisId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = introduceImpeachment(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          basisId: command.basisId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_IMPEACHMENT_VOTE") {
      if (!isLegislativeVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      const preview = castImpeachmentVote(world, jsonClone(state), {
        actorId: state.playerPoliticianId,
        proceedingId: command.proceedingId,
        choice: command.choice,
      });
      if (preview.error) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castImpeachmentVote(world, state, {
        actorId: state.playerPoliticianId,
        proceedingId: command.proceedingId,
        choice: command.choice,
      });
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "INTRODUCE_RECALL_REFERRAL") {
      const recallArgs = { actorId: state.playerPoliticianId };
      const preview = introduceRecallReferral(world, jsonClone(state), recallArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = introduceRecallReferral(world, state, recallArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_RECALL_REFERRAL_VOTE") {
      if (!isLegislativeVoteChoice(command.choice)) {
        return fail("INVALID_VOTE", command.choice);
      }
      const preview = castRecallReferralVote(world, jsonClone(state), {
        actorId: state.playerPoliticianId,
        proceedingId: command.proceedingId,
        choice: command.choice,
      });
      if (preview.error) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castRecallReferralVote(world, state, {
        actorId: state.playerPoliticianId,
        proceedingId: command.proceedingId,
        choice: command.choice,
      });
      if (out.error) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "FILE_CONSTITUTIONAL_CASE") {
      if (!isCourtCaseType(command.caseType)) {
        return fail("INVALID_CASE_TYPE", command.caseType);
      }
      const preview = fileConstitutionalCase(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          caseType: command.caseType,
          challengedKind: command.challengedKind ?? "law",
          challengedId: command.challengedId,
          respondentId: command.respondentId ?? state.playerPoliticianId,
          constitutionalQuestion: command.constitutionalQuestion,
          constitutionalRule: command.constitutionalRule,
          meritsLean: command.meritsLean ?? 0,
          expedited: command.expedited === true,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = fileConstitutionalCase(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          caseType: command.caseType,
          challengedKind: command.challengedKind ?? "law",
          challengedId: command.challengedId,
          respondentId: command.respondentId ?? state.playerPoliticianId,
          constitutionalQuestion: command.constitutionalQuestion,
          constitutionalRule: command.constitutionalRule,
          meritsLean: command.meritsLean ?? 0,
          expedited: command.expedited === true,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "MEET_ORGANIZATION") {
      const preview = meetOrganization(
        world,
        jsonClone(state),
        { actorId: state.playerPoliticianId, organizationId: command.organizationId },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = meetOrganization(
        world,
        state,
        { actorId: state.playerPoliticianId, organizationId: command.organizationId },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "SEEK_ORGANIZATION_ENDORSEMENT") {
      const args = {
        actorId: state.playerPoliticianId,
        organizationId: command.organizationId,
        campaignId: command.campaignId,
      };
      const preview = seekOrganizationEndorsement(world, jsonClone(state), args, null, 0);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const roll = rng.float01("npc-decisions");
      const commandId = nextCommandId();
      const out = seekOrganizationEndorsement(world, state, args, commandId, roll);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ASK_ORGANIZATION_BILL_SUPPORT") {
      const args = {
        actorId: state.playerPoliticianId,
        organizationId: command.organizationId,
        billId: command.billId,
      };
      const preview = askOrganizationBillSupport(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = askOrganizationBillSupport(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DISCUSS_ORGANIZATION_POLICY") {
      const args = {
        actorId: state.playerPoliticianId,
        organizationId: command.organizationId,
        issueId: command.issueId,
        direction: command.direction,
      };
      const preview = discussOrganizationPolicy(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = discussOrganizationPolicy(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DIPLOMATIC_OUTREACH") {
      const preview = diplomaticOutreach(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = diplomaticOutreach(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "DIPLOMATIC_SUMMIT") {
      const preview = diplomaticSummit(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = diplomaticSummit(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "PROPOSE_TREATY") {
      if (!isTreatyKind(command.kind)) return fail("INVALID_TREATY", command.kind);
      const treatyArgs = {
        actorId: state.playerPoliticianId,
        targetCountryId: command.targetCountryId,
        kind: command.kind,
        ...(command.title != null ? { title: command.title } : {}),
      };
      const preview = playerProposeTreaty(world, jsonClone(state), treatyArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = playerProposeTreaty(world, state, treatyArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "NEGOTIATE_TRADE") {
      const preview = negotiateTrade(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = negotiateTrade(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "IMPOSE_SANCTIONS") {
      const sanctionArgs = {
        actorId: state.playerPoliticianId,
        targetCountryId: command.targetCountryId,
        ...(command.severity != null ? { severity: command.severity } : {}),
      };
      const preview = playerImposeSanctions(world, jsonClone(state), sanctionArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = playerImposeSanctions(world, state, sanctionArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "LIFT_SANCTIONS") {
      const preview = playerLiftSanctions(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = playerLiftSanctions(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ALLIANCE_CONSULTATION") {
      const consultArgs = {
        actorId: state.playerPoliticianId,
        ...(command.institutionId != null ? { institutionId: command.institutionId } : {}),
      };
      const preview = allianceConsultation(world, jsonClone(state), consultArgs, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = allianceConsultation(world, state, consultArgs, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ADJUST_MILITARY_POSTURE") {
      if (!isMilitaryPostureLevel(command.posture)) {
        return fail("INVALID_POSTURE", command.posture);
      }
      const preview = adjustMilitaryPosture(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          posture: command.posture,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = adjustMilitaryPosture(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          posture: command.posture,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "MEDIATE_CRISIS") {
      const preview = mediateCrisis(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          crisisId: command.crisisId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = mediateCrisis(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          crisisId: command.crisisId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ISSUE_DIPLOMATIC_WARNING") {
      const preview = issueDiplomaticWarning(
        world,
        jsonClone(state),
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        null,
      );
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = issueDiplomaticWarning(
        world,
        state,
        {
          actorId: state.playerPoliticianId,
          targetCountryId: command.targetCountryId,
        },
        commandId,
      );
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "CAST_TREATY_RATIFICATION_VOTE") {
      const preview = castTreatyRatificationVote(jsonClone(state), {
        actorId: state.playerPoliticianId,
        treatyId: command.treatyId,
        choice: command.choice,
      });
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = castTreatyRatificationVote(state, {
        actorId: state.playerPoliticianId,
        treatyId: command.treatyId,
        choice: command.choice,
      });
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: [], interrupt: null };
    }

    if (command.type === "RESPOND_INCOMING_DIPLOMACY") {
      const args = {
        actorId: state.playerPoliticianId,
        pendingId: command.pendingId,
        response: command.response,
      };
      const preview = respondIncomingDiplomacy(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = respondIncomingDiplomacy(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "ACCEPT_INCOMING_TREATY") {
      const args = {
        actorId: state.playerPoliticianId,
        pendingId: command.pendingId,
        response: "accept" as const,
      };
      const preview = respondIncomingDiplomacy(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = respondIncomingDiplomacy(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    if (command.type === "REJECT_INCOMING_TREATY") {
      const args = {
        actorId: state.playerPoliticianId,
        pendingId: command.pendingId,
        response: "reject" as const,
      };
      const preview = respondIncomingDiplomacy(world, jsonClone(state), args, null);
      if ("error" in preview) return fail(preview.error.code, preview.error.message);
      const commandId = nextCommandId();
      const out = respondIncomingDiplomacy(world, state, args, commandId);
      if ("error" in out) return fail(out.error.code, out.error.message);
      return { ok: true, commandId, events: out.events, interrupt: null };
    }

    return fail("UNKNOWN_COMMAND", "Unsupported command");
  };

  return {
    executeCommand,
    serializeSave(): SaveFile {
      syncRng(state, rng);
      return jsonClone({
        schemaVersion: SAVE_SCHEMA_VERSION,
        contentVersion: state.contentVersion,
        scenarioId: state.scenarioId,
        simulation: state,
      });
    },
    getSnapshot(): SimState {
      syncRng(state, rng);
      return deepFreeze(jsonClone(state));
    },
    getTelemetrySnapshot() {
      return {
        currentDate: state.currentDate,
        national: {
          outputIndex: state.economyRuntime.national.outputIndex,
          employmentIndex: state.economyRuntime.national.employmentIndex,
          priceIndex: state.economyRuntime.national.priceIndex,
          realWageIndex: state.economyRuntime.national.realWageIndex,
          housingIndex: state.economyRuntime.national.housingIndex,
          confidenceIndex: state.economyRuntime.national.confidenceIndex,
        },
        provinceConditions: Object.fromEntries(
          Object.entries(state.economyRuntime.provinces).map(([id, row]) => [
            id,
            row.conditionsIndex,
          ]),
        ),
      };
    },
    hashState(): string {
      syncRng(state, rng);
      return hashCanonical(state);
    },
    world(): KernelWorld {
      return world;
    },
    advanceForeignCalibrationMonths(months: number): number {
      const count = advanceForeignCalibrationMonthsHarness(state, world, rng, months);
      syncRng(state, rng);
      return count;
    },
  };
}
