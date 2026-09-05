import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { JsonObject } from "../json.js";
import { addDays } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { assumeOffice, canAssumeOffice, endTerm, occupyingTerms } from "../offices.js";
import { currentAssemblyMemberIds, currentSpeakerId } from "../legislature/state.js";
import { getAgentProfile } from "../agents/profile.js";
import type { LegislativeVoteChoice, PolicyItem } from "../legislature/types.js";
import {
  allocateBudgetId,
  allocateEmergencyId,
  allocateMotionId,
  allocateRegulationId,
  allocateWarPowerId,
  currentMinisterHolderId,
  currentPresidentialAuthorityId,
  ministerOfficeIds,
  seedMinistriesIfNeeded,
} from "./state.js";
import type { AssemblyMotion, MotionKind, RegulationState } from "./types.js";
import { emergencyDeclarationAllowed } from "../provinces/constitutionGameplay.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

/** Integer percent of authorized seats. 55% of 420 is 231, not IEEE ceil(420*0.55)=232. */
export function assemblyFractionYesNeeded(seats: number, fraction: number): number {
  const parts = Math.round(fraction * 100);
  return Math.ceil((seats * parts) / 100);
}

function event(
  state: SimState,
  type: string,
  actorIds: string[],
  entityIds: string[],
  payload: JsonObject,
  commandId: string | null,
  importance = 0.6,
): SimEvent {
  return pushHistory(state, {
    date: state.currentDate,
    type,
    importance,
    visibility: "public",
    actorIds,
    entityIds,
    payload,
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
}

function requirePresident(
  world: KernelWorld,
  state: SimState,
  actorId: string,
): CommandError | null {
  const authority = currentPresidentialAuthorityId(world, state);
  if (authority !== actorId) return reject("NOT_PRESIDENT", actorId);
  return null;
}

export function appointMinister(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; officeId: string; politicianId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  const office = world.offices[args.officeId];
  if (!office || office.kind !== "minister") {
    return { error: reject("NOT_MINISTER_OFFICE", args.officeId) };
  }
  const holder = state.politicians[args.politicianId];
  if (!holder) return { error: reject("UNKNOWN_POLITICIAN", args.politicianId) };
  const existingPortfolio = Object.values(state.officeTerms).find((term) => {
    const heldOffice = world.offices[term.officeId];
    return (
      term.holderId === args.politicianId &&
      (term.status === "active" || term.status === "suspended") &&
      term.holdingKind === "substantive" &&
      heldOffice?.kind === "minister"
    );
  })?.officeId;
  if (existingPortfolio) {
    return {
      error: reject(
        "ALREADY_MINISTER",
        `${args.politicianId} already holds ${existingPortfolio}; one person may hold only one portfolio`,
      ),
    };
  }
  // Validate before dismissing the incumbent so a rejected appointment cannot
  // create a vacancy as a side effect.
  const assumptionError = canAssumeOffice(
    state,
    world,
    args.officeId,
    args.politicianId,
    "substantive",
    { ignoreOfficeCapacity: true },
  );
  if (assumptionError) return { error: assumptionError };
  const events: SimEvent[] = [];
  for (const term of occupyingTerms(state, args.officeId)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const ended = endTerm(state, term.id, state.currentDate, "minister_replaced");
    if (ended) {
      events.push(
        event(
          state,
          "MINISTER_TERM_ENDED",
          [ended.holderId, args.actorId],
          [args.officeId, ended.id],
          { reason: "minister_replaced", officeId: args.officeId },
          commandId,
          0.7,
        ),
      );
    }
  }
  const assumed = assumeOffice(state, world, {
    officeId: args.officeId,
    holderId: args.politicianId,
    date: state.currentDate,
    accessionReason: "presidential_appointment",
    holdingKind: "substantive",
    endDate: null,
    startKnown: true,
    sourceElectionId: null,
  });
  if ("error" in assumed) return assumed;
  seedMinistriesIfNeeded(world, state);
  events.push(
    event(
      state,
      "MINISTER_APPOINTED",
      [args.actorId, args.politicianId],
      [args.officeId, assumed.term.id],
      { officeId: args.officeId, holderId: args.politicianId },
      commandId,
      0.85,
    ),
  );
  return { events };
}

export function dismissMinister(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; officeId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  const office = world.offices[args.officeId];
  if (!office || office.kind !== "minister") {
    return { error: reject("NOT_MINISTER_OFFICE", args.officeId) };
  }
  const holderId = currentMinisterHolderId(world, state, args.officeId);
  if (!holderId) return { error: reject("NO_MINISTER", args.officeId) };
  const events: SimEvent[] = [];
  for (const term of occupyingTerms(state, args.officeId)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const ended = endTerm(state, term.id, state.currentDate, "presidential_dismissal");
    if (ended) {
      events.push(
        event(
          state,
          "MINISTER_DISMISSED",
          [args.actorId, ended.holderId],
          [args.officeId, ended.id],
          { officeId: args.officeId, holderId: ended.holderId },
          commandId,
          0.85,
        ),
      );
    }
  }
  return { events };
}

export function issueRegulation(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    ministryOfficeId: string;
    policyItems: readonly PolicyItem[];
    major?: boolean;
  },
  commandId: string | null,
): { regulation: RegulationState; events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  const office = world.offices[args.ministryOfficeId];
  if (!office || office.kind !== "minister") {
    return { error: reject("NOT_MINISTER_OFFICE", args.ministryOfficeId) };
  }
  if (args.policyItems.length < 1) {
    return { error: reject("INVALID_REGULATION", "needs a policy item") };
  }
  const items: PolicyItem[] = args.policyItems.map((p) => ({
    issueId: p.issueId,
    direction: p.direction < 0 ? -1 : p.direction > 0 ? 1 : 0,
    magnitude: Math.max(0, Math.min(1, p.magnitude)),
    fiscalImpact: p.fiscalImpact ?? null,
  }));
  const major = args.major === true;
  const regulation: RegulationState = {
    id: allocateRegulationId(state),
    issuerId: args.actorId,
    date: state.currentDate,
    ministryOfficeId: args.ministryOfficeId,
    policyItems: items,
    major,
    reviewDeadline: addDays(state.currentDate, world.executiveConstitution.regulationReviewDays),
    status: "active",
    metadata: {},
  };
  state.executiveRuntime.regulations[regulation.id] = regulation;
  return {
    regulation,
    events: [
      event(
        state,
        "REGULATION_ISSUED",
        [args.actorId],
        [regulation.id, args.ministryOfficeId],
        { regulationId: regulation.id, major, ministryOfficeId: args.ministryOfficeId },
        commandId,
        0.7,
      ),
    ],
  };
}

export function introduceMotion(
  world: KernelWorld,
  state: SimState,
  args: {
    sponsorId: string;
    kind: MotionKind;
    targetId: string;
    metadata?: JsonObject;
  },
  commandId: string | null,
): { motion: AssemblyMotion; events: SimEvent[] } | { error: CommandError } {
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.sponsorId)) return { error: reject("NOT_AN_MP", args.sponsorId) };
  if (args.kind === "ministerial_censure") {
    const office = world.offices[args.targetId];
    if (!office || office.kind !== "minister") {
      return { error: reject("NOT_MINISTER_OFFICE", args.targetId) };
    }
    if (!currentMinisterHolderId(world, state, args.targetId)) {
      return { error: reject("NO_MINISTER", args.targetId) };
    }
  }
  if (args.kind === "regulation_annulment") {
    const regulation = state.executiveRuntime.regulations[args.targetId];
    if (!regulation || regulation.status !== "active") {
      return { error: reject("UNKNOWN_REGULATION", args.targetId) };
    }
    if (!regulation.major) {
      return { error: reject("NOT_MAJOR_REGULATION", args.targetId) };
    }
    if (state.currentDate > regulation.reviewDeadline) {
      return { error: reject("REVIEW_WINDOW_CLOSED", args.targetId) };
    }
  }
  if (args.kind === "budget_approval") {
    const budget = state.executiveRuntime.budgets[args.targetId];
    if (!budget || budget.status !== "proposed") {
      return { error: reject("INVALID_BUDGET", args.targetId) };
    }
  }
  if (args.kind === "emergency_extension" || args.kind === "emergency_termination") {
    const emergency = state.executiveRuntime.emergencies[args.targetId];
    if (!emergency || emergency.status !== "active") {
      return { error: reject("UNKNOWN_EMERGENCY", args.targetId) };
    }
  }
  if (args.kind === "war_authorization") {
    const war = state.executiveRuntime.warPowers[args.targetId];
    if (!war || (war.status !== "unilateral" && war.status !== "expired")) {
      return { error: reject("UNKNOWN_WAR_POWER", args.targetId) };
    }
  }
  const fraction =
    args.kind === "ministerial_censure"
      ? world.executiveConstitution.assemblyCensureFraction
      : null;
  const motion: AssemblyMotion = {
    id: allocateMotionId(state),
    kind: args.kind,
    sponsorId: args.sponsorId,
    targetId: args.targetId,
    introducedDate: state.currentDate,
    scheduledDate: null,
    status: "scheduled",
    voteId: null,
    threshold: args.kind === "ministerial_censure" ? "assembly_fraction" : "simple_majority_cast",
    fraction,
    result: null,
    stageReadyDate: state.currentDate,
    metadata: { ...(args.metadata ?? {}) },
  };
  state.executiveRuntime.motions[motion.id] = motion;
  return {
    motion,
    events: [
      event(
        state,
        "ASSEMBLY_MOTION_INTRODUCED",
        [args.sponsorId],
        [motion.id, args.targetId],
        {
          motionId: motion.id,
          kind: args.kind,
          targetId: args.targetId,
          constitutionalReferral: args.metadata?.constitutionalReferral === true,
        },
        commandId,
        0.65,
      ),
    ],
  };
}

/**
 * After unilateral war powers begin, the Assembly must consider authorization.
 * The Speaker is the institutional procedural sponsor — not the President (who is not an MP)
 * and not a discretionary private MP action. If the player is Speaker, metadata marks this
 * as a constitutional referral so it is not treated as their personal political initiative.
 */
export function scheduleWarAuthorizationReferral(
  world: KernelWorld,
  state: SimState,
  warPowerId: string,
  commandId: string | null,
): { motion: AssemblyMotion; events: SimEvent[] } | { error: CommandError } {
  const war = state.executiveRuntime.warPowers[warPowerId];
  if (!war) return { error: reject("UNKNOWN_WAR_POWER", warPowerId) };
  const existing = Object.values(state.executiveRuntime.motions).find(
    (m) =>
      m.kind === "war_authorization" &&
      m.targetId === warPowerId &&
      (m.status === "scheduled" || m.status === "introduced"),
  );
  if (existing) {
    return { motion: existing, events: [] };
  }
  const mps = currentAssemblyMemberIds(world, state);
  if (mps.length === 0) return { error: reject("NO_ASSEMBLY", "no sitting Assembly members") };
  const speaker = currentSpeakerId(world, state);
  const institutionalSponsor = mps
    .filter((id) => id !== state.playerPoliticianId)
    .sort((a, b) => {
      const ap = getAgentProfile(world, state, a);
      const bp = getAgentProfile(world, state, b);
      const as = (ap?.skills.legislation ?? 0) * 0.6 + (ap?.traits.institutionalism ?? 0) * 0.4;
      const bs = (bp?.skills.legislation ?? 0) * 0.6 + (bp?.traits.institutionalism ?? 0) * 0.4;
      return bs - as || a.localeCompare(b);
    })[0];
  const sponsorId = speaker && mps.includes(speaker) ? speaker : (institutionalSponsor ?? mps[0]!);
  return introduceMotion(
    world,
    state,
    {
      sponsorId,
      kind: "war_authorization",
      targetId: warPowerId,
      metadata: {
        constitutionalReferral: true,
        proceduralSponsorOffice: speaker === sponsorId ? "speaker" : "assembly_fallback",
      },
    },
    commandId,
  );
}

export function pendingWarAuthorizationMotion(
  state: SimState,
  warPowerId: string,
): AssemblyMotion | null {
  return (
    Object.values(state.executiveRuntime.motions).find(
      (m) =>
        m.kind === "war_authorization" &&
        m.targetId === warPowerId &&
        (m.status === "scheduled" || m.status === "introduced"),
    ) ?? null
  );
}

export function castMotionVote(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; motionId: string; choice: LegislativeVoteChoice },
): { error: CommandError } | { ok: true } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "only the player casts this command") };
  }
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.actorId)) return { error: reject("NOT_AN_MP", args.actorId) };
  const motion = state.executiveRuntime.motions[args.motionId];
  if (!motion) return { error: reject("UNKNOWN_MOTION", args.motionId) };
  if (motion.status !== "scheduled" && motion.status !== "introduced") {
    return { error: reject("INVALID_MOTION", motion.status) };
  }
  state.executiveRuntime.pendingPlayerMotionVotes[args.motionId] = {
    motionId: args.motionId,
    choice: args.choice,
  };
  return { ok: true };
}

export function takePendingMotionVote(
  state: SimState,
  motionId: string,
): LegislativeVoteChoice | null {
  const pending = state.executiveRuntime.pendingPlayerMotionVotes[motionId];
  delete state.executiveRuntime.pendingPlayerMotionVotes[motionId];
  return pending?.choice ?? null;
}

export function recordMotionVote(
  world: KernelWorld,
  state: SimState,
  args: { motionId: string; votes: Record<string, LegislativeVoteChoice> },
  commandId: string | null,
): { events: SimEvent[]; passed: boolean } | { error: CommandError } {
  const motion = state.executiveRuntime.motions[args.motionId];
  if (!motion) return { error: reject("UNKNOWN_MOTION", args.motionId) };
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(args.votes)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  let passed = false;
  if (motion.threshold === "assembly_fraction") {
    const needed = assemblyFractionYesNeeded(
      world.legislativeConstitution.assemblySeatCount,
      motion.fraction ?? 0.55,
    );
    passed = yes >= needed;
  } else {
    passed = yes + no > 0 && yes > no;
  }
  motion.status = passed ? "passed" : "failed";
  motion.result = passed ? "passed" : "failed";
  const events = [
    event(
      state,
      passed ? "ASSEMBLY_MOTION_PASSED" : "ASSEMBLY_MOTION_FAILED",
      [motion.sponsorId],
      [motion.id, motion.targetId],
      { motionId: motion.id, kind: motion.kind, yes, no, abstain, passed },
      commandId,
      0.75,
    ),
  ];
  if (passed) events.push(...applyMotionEffect(world, state, motion, commandId));
  return { events, passed };
}

function applyMotionEffect(
  world: KernelWorld,
  state: SimState,
  motion: AssemblyMotion,
  commandId: string | null,
): SimEvent[] {
  if (motion.kind === "ministerial_censure") {
    const events: SimEvent[] = [];
    for (const term of occupyingTerms(state, motion.targetId)) {
      if (term.status !== "active" && term.status !== "suspended") continue;
      const ended = endTerm(state, term.id, state.currentDate, "ministerial_censure");
      if (ended) {
        events.push(
          event(
            state,
            "MINISTER_CENSURED",
            [ended.holderId],
            [motion.targetId, ended.id, motion.id],
            { officeId: motion.targetId, holderId: ended.holderId },
            commandId,
            0.9,
          ),
        );
      }
    }
    return events;
  }
  if (motion.kind === "regulation_annulment") {
    const regulation = state.executiveRuntime.regulations[motion.targetId];
    if (regulation) regulation.status = "annulled";
    return [
      event(
        state,
        "REGULATION_ANNULLED",
        [motion.sponsorId],
        [motion.targetId, motion.id],
        { regulationId: motion.targetId },
        commandId,
        0.8,
      ),
    ];
  }
  if (motion.kind === "budget_approval") {
    const budget = state.executiveRuntime.budgets[motion.targetId];
    if (budget) {
      budget.status = "approved";
      budget.assemblyDecision = "approved";
    }
    return [
      event(
        state,
        "BUDGET_APPROVED",
        [motion.sponsorId],
        [motion.targetId, motion.id],
        { budgetId: motion.targetId },
        commandId,
        0.85,
      ),
    ];
  }
  if (motion.kind === "emergency_termination") {
    const emergency = state.executiveRuntime.emergencies[motion.targetId];
    if (emergency) emergency.status = "terminated";
    return [
      event(
        state,
        "EMERGENCY_TERMINATED",
        [motion.sponsorId],
        [motion.targetId, motion.id],
        { emergencyId: motion.targetId },
        commandId,
        0.85,
      ),
    ];
  }
  if (motion.kind === "emergency_extension") {
    const emergency = state.executiveRuntime.emergencies[motion.targetId];
    if (emergency && emergency.status === "active") {
      emergency.expiresDate = addDays(
        emergency.expiresDate,
        world.executiveConstitution.emergencyExtensionDays,
      );
      emergency.extensionCount += 1;
    }
    return [
      event(
        state,
        "EMERGENCY_EXTENDED",
        [motion.sponsorId],
        [motion.targetId, motion.id],
        { emergencyId: motion.targetId },
        commandId,
        0.8,
      ),
    ];
  }
  if (motion.kind === "war_authorization") {
    const war = state.executiveRuntime.warPowers[motion.targetId];
    if (war) {
      war.status = "authorized";
      war.authorized = true;
    }
    return [
      event(
        state,
        "WAR_AUTHORIZED",
        [motion.sponsorId],
        [motion.targetId, motion.id],
        { warPowerId: motion.targetId },
        commandId,
        0.95,
      ),
    ];
  }
  return [];
}

export function proposeBudget(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; allocations: Record<string, number> },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  const year = Number(state.currentDate.slice(0, 4));
  const ministries = ministerOfficeIds(world);
  const allocations: Record<string, number> = {};
  let sum = 0;
  for (const id of ministries) {
    const v = Math.max(0, args.allocations[id] ?? 0);
    allocations[id] = v;
    sum += v;
  }
  if (sum <= 0) {
    const even = 1 / Math.max(1, ministries.length);
    for (const id of ministries) allocations[id] = even;
  } else {
    for (const id of ministries) allocations[id] = allocations[id]! / sum;
  }
  const budget = {
    id: allocateBudgetId(state),
    fiscalYear: year,
    proposalDate: state.currentDate,
    allocations,
    status: "proposed" as const,
    assemblyDecision: "pending" as const,
    continuingSource: null,
    metadata: {},
  };
  state.executiveRuntime.budgets[budget.id] = budget;
  return {
    events: [
      event(
        state,
        "BUDGET_PROPOSED",
        [args.actorId],
        [budget.id],
        { budgetId: budget.id, fiscalYear: year },
        commandId,
        0.75,
      ),
    ],
  };
}

export function declareEmergency(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  if (!state.executiveRuntime.emergencyTrigger) {
    return { error: reject("NO_EMERGENCY_TRIGGER", "no legitimate emergency trigger") };
  }
  const gate = emergencyDeclarationAllowed(state, true);
  if (!gate.allowed) {
    return { error: reject("EMERGENCY_CONSTITUTIONALLY_BARRED", gate.reason ?? "not allowed") };
  }
  const emergency = {
    id: allocateEmergencyId(state),
    declaredBy: args.actorId,
    declaredDate: state.currentDate,
    expiresDate: addDays(state.currentDate, gate.initialDays),
    status: "active" as const,
    extensionCount: 0,
    metadata: {
      courtReviewRequired: gate.courtReviewRequired,
      requiresAssemblyConfirmation: gate.requiresAssemblyConfirmation,
      emergencyMode: state.provincialRuntime.constitutionalOrder?.emergencyPowers ?? null,
    },
  };
  state.executiveRuntime.emergencies[emergency.id] = emergency;
  state.executiveRuntime.emergencyTrigger = false;
  return {
    events: [
      event(
        state,
        "EMERGENCY_DECLARED",
        [args.actorId],
        [emergency.id],
        {
          emergencyId: emergency.id,
          expiresDate: emergency.expiresDate,
          courtReviewRequired: gate.courtReviewRequired,
          requiresAssemblyConfirmation: gate.requiresAssemblyConfirmation,
        },
        commandId,
        0.95,
      ),
    ],
  };
}

export function beginWarPowers(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const err = requirePresident(world, state, args.actorId);
  if (err) return { error: err };
  if (!state.executiveRuntime.warTrigger) {
    return { error: reject("NO_WAR_TRIGGER", "no legitimate war-power trigger") };
  }
  const war = {
    id: allocateWarPowerId(state),
    startedBy: args.actorId,
    startDate: state.currentDate,
    unilateralUntil: addDays(state.currentDate, world.executiveConstitution.warUnilateralDays),
    status: "unilateral" as const,
    authorized: false,
    metadata: {},
  };
  state.executiveRuntime.warPowers[war.id] = war;
  state.executiveRuntime.warTrigger = false;
  return {
    events: [
      event(
        state,
        "WAR_POWERS_BEGUN",
        [args.actorId],
        [war.id],
        { warPowerId: war.id, unilateralUntil: war.unilateralUntil },
        commandId,
        0.95,
      ),
    ],
  };
}

export function armExecutiveTrigger(state: SimState, kind: "emergency" | "war"): void {
  if (kind === "emergency") state.executiveRuntime.emergencyTrigger = true;
  else state.executiveRuntime.warTrigger = true;
}

export function equalMinistryAllocations(world: KernelWorld): Record<string, number> {
  const ids = ministerOfficeIds(world);
  const even = ids.length === 0 ? 0 : 1 / ids.length;
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = even;
  return out;
}

export function seedContinuingBudget(world: KernelWorld, state: SimState): void {
  if (Object.keys(state.executiveRuntime.budgets).length > 0) return;
  if (ministerOfficeIds(world).length === 0) return;
  const year = Number(state.currentDate.slice(0, 4));
  const id = allocateBudgetId(state);
  state.executiveRuntime.budgets[id] = {
    id,
    fiscalYear: year,
    proposalDate: null,
    allocations: equalMinistryAllocations(world),
    status: "continuing",
    assemblyDecision: "none",
    continuingSource: "prior_lawful_budget",
    metadata: {},
  };
}

export function motionIsRipe(state: SimState, motion: AssemblyMotion): boolean {
  return monthStart(motion.stageReadyDate) < monthStart(state.currentDate);
}
