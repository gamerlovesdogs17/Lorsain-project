import { addMonths, isIsoDate, type IsoDate } from "./calendar.js";
import { emptyAgentRuntime } from "./agents/validation.js";
import { recordObservation } from "./agents/beliefs.js";
import { needsInitialGoals, reviewGoals, seedInitialGoals } from "./agents/goals.js";
import { recordPoliticalMemory } from "./agents/memories.js";
import { applyRelationshipChange } from "./agents/relationships.js";
import { deepFreeze, hashCanonical, jsonClone } from "./hash.js";
import { isJsonObject, jsonSafetyError } from "./json.js";
import { assumeOffice, endTerm, resumeTerm, vacateOffice } from "./offices.js";
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
  hashState(): string;
  world(): KernelWorld;
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
    },
    presidential: {
      nextRegularElectionDate: world.nextRegularPresidentialElectionDate,
      electedTermCountByPolitician: { ...world.electedTermCounts },
      certifiedPresidentElectId: null,
    },
    ...emptyAgentRuntime(),
  };
  for (const t of world.startingTerms) {
    const id = padId("TERM", state.counters.nextTermId++);
    state.officeTerms[id] = { ...t, id };
  }
  for (const ev of world.initialScheduled) {
    const queued = enqueueScheduled(state, ev);
    if (!isScheduled(queued)) {
      throw new Error(queued.error.message);
    }
  }
  seedInitialGoals(state, world);
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

function runTowardTarget(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  target: IsoDate,
  commandId: string,
): { events: SimEvent[]; interrupt: PendingInterrupt | null } {
  const events: SimEvent[] = [];
  sortScheduler(state);
  while (true) {
    const next = nextPendingBefore(state, target);
    if (!next) break;
    const out = applyScheduled(state, world, rng, next, commandId);
    events.push(...out.events);
    if (out.interrupt) return { events, interrupt: out.interrupt };
  }
  state.currentDate = target;
  state.completedTurns += 1;
  state.activeTurnTarget = null;
  state.pendingInterrupt = null;
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
  if (needsInitialGoals(state)) seedInitialGoals(state, frozen);
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
      const out = runTowardTarget(state, world, rng, target, commandId);
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
      p.alive = command.alive;
      const events: SimEvent[] = [];
      if (!command.alive) {
        for (const t of Object.values(state.officeTerms)) {
          if (t.holderId === command.politicianId && t.status !== "ended") {
            endTerm(state, t.id, state.currentDate, "death");
          }
        }
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "POLITICIAN_DIED",
            importance: 1,
            visibility: "public",
            actorIds: [command.politicianId],
            entityIds: [command.politicianId],
            payload: {},
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
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
    hashState(): string {
      syncRng(state, rng);
      return hashCanonical(state);
    },
    world(): KernelWorld {
      return world;
    },
  };
}
