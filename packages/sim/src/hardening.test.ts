import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { parseSaveFile, type ContentMigration } from "./save.js";
import { syntheticWorld, kernelOffice } from "./synthetic-world.js";
import { validateKernelWorld } from "./validate-world.js";
import type { Command, KernelWorld, SaveFile } from "./types.js";

function goodSave(): SaveFile {
  const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
  return sim.serializeSave();
}

function cloneSave(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(goodSave())) as Record<string, unknown>;
}

describe("save parser regressions", () => {
  it("accepts a freshly serialized save", () => {
    const parsed = parseSaveFile(goodSave(), "0.3.1-predev");
    expect(parsed.ok).toBe(true);
  });

  it("rejects invalid currentDate", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).currentDate = "garbage";
    const r = parseSaveFile(raw);
    expect(r.ok).toBe(false);
  });

  it("rejects null counters", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).counters = null;
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects wrong officeTerms type", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).officeTerms = "oops";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects mismatched root/simulation contentVersion", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).contentVersion = "nope";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects mismatched root/simulation scenarioId", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).scenarioId = "OTHER";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects malformed simulation RNG", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).rng = { algo: "nope" };
    const r = parseSaveFile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MALFORMED_SAVE");
  });

  it("rejects root/simulation RNG mismatch", () => {
    const raw = cloneSave();
    const sim = raw.simulation as Record<string, unknown>;
    raw.rng = jsonClone(sim.rng);
    (raw.rng as { masterSeed: string }).masterSeed = "DIFFERENT";
    const r = parseSaveFile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_RNG");
  });

  it("rejects malformed scheduler", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).scheduler = { events: "nope" };
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects invalid office status", () => {
    const raw = cloneSave();
    const sim = raw.simulation as {
      officeTerms: Record<string, Record<string, unknown>>;
    };
    const first = Object.values(sim.officeTerms)[0]!;
    first.status = "wandering";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects invalid activeTurnTarget", () => {
    const raw = cloneSave();
    (raw.simulation as Record<string, unknown>).activeTurnTarget = "not-a-date";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects player ID missing from politician state", () => {
    const raw = cloneSave();
    (raw.simulation as { politicians: Record<string, unknown> }).politicians = {
      OTHER: {
        id: "OTHER",
        alive: true,
        retired: false,
        partyId: null,
        factionId: null,
      },
    };
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects non-JSON history payload", () => {
    const raw = cloneSave();
    const sim = raw.simulation as { history: unknown[] };
    sim.history = [
      {
        id: "EVT000001",
        date: "2000-01-01",
        turn: 0,
        type: "X",
        importance: 0,
        visibility: "system",
        actorIds: [],
        entityIds: [],
        payload: { n: Number.NaN },
        sourceScheduledEventId: null,
        sourceCommandId: null,
      },
    ];
    (raw.simulation as { counters: { nextEventId: number } }).counters.nextEventId = 2;
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects pending scheduler events in the past", () => {
    const raw = cloneSave();
    const sim = raw.simulation as {
      currentDate: string;
      scheduler: { events: Array<Record<string, unknown>> };
      counters: { nextScheduledId: number; schedulerSequence: number };
    };
    sim.scheduler.events.push({
      id: "SEV000099",
      dueDate: "1999-01-01",
      eventType: "OLD",
      payload: {},
      priority: 1,
      sequence: 99,
      blocking: false,
      requiresResolution: false,
      source: null,
      status: "pending",
    });
    sim.counters.nextScheduledId = 100;
    sim.counters.schedulerSequence = 100;
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("applies a real content migration before accepting the save", () => {
    const raw = cloneSave();
    raw.contentVersion = "0.3.0-predev";
    (raw.simulation as Record<string, unknown>).contentVersion = "0.3.0-predev";
    const migrations: ContentMigration[] = [
      {
        fromContentVersion: "0.3.0-predev",
        toContentVersion: "0.3.1-predev",
        migrate: (input) => {
          const obj = jsonClone(input) as Record<string, unknown>;
          obj.contentVersion = "0.3.1-predev";
          (obj.simulation as Record<string, unknown>).contentVersion = "0.3.1-predev";
          return obj;
        },
      },
    ];
    const r = parseSaveFile(raw, "0.3.1-predev", { contentMigrations: migrations });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save.contentVersion).toBe("0.3.1-predev");
  });

  it("rejects a content migration that does not produce a valid save", () => {
    const raw = cloneSave();
    raw.contentVersion = "0.3.0-predev";
    (raw.simulation as Record<string, unknown>).contentVersion = "0.3.0-predev";
    const migrations: ContentMigration[] = [
      {
        fromContentVersion: "0.3.0-predev",
        toContentVersion: "0.3.1-predev",
        migrate: () => ({ contentVersion: "0.3.1-predev" }),
      },
    ];
    const r = parseSaveFile(raw, "0.3.1-predev", { contentMigrations: migrations });
    expect(r.ok).toBe(false);
  });
});

describe("rejected commands do not mutate state", () => {
  it("parameterized rejection fixtures leave the hash unchanged", () => {
    const world = syntheticWorld();
    world.offices.OFFICE_SPEAKER = kernelOffice({
      id: "OFFICE_SPEAKER",
      kind: "speaker",
      requiresHolderKinds: [],
    });
    world.successionOfficeIds = ["OFFICE_SPEAKER"];
    world.politicians.push({
      id: "P3",
      alive: false,
      retired: false,
      partyId: null,
      factionId: null,
    });
    world.startingTerms.push({
      officeId: "OFFICE_SPEAKER",
      holderId: "P2",
      startDate: null,
      startKnown: false,
      endDate: null,
      accessionReason: "preexisting",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    sim.executeCommand({ type: "DEV_SET_ALIVE", politicianId: "P2", alive: false });
    const fixtures: Command[] = [
      { type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" },
      { type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation", presidentElectId: "NOPE" },
      { type: "DEV_ASSUME_OFFICE", officeId: "OFFICE_PRESIDENT", holderId: "P2" },
      { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_MISSING", reason: "x" },
      {
        type: "DEV_SCHEDULE_EVENT",
        dueDate: "1999-01-15",
        eventType: "OLD",
      },
      { type: "DEV_RESUME_TERM", termId: "TERM_MISSING" },
      { type: "RESUME_TURN" },
    ];
    for (const cmd of fixtures) {
      const before = sim.hashState();
      const beforeCounters = jsonClone(sim.getSnapshot().counters);
      const r = sim.executeCommand(cmd);
      expect(r.ok).toBe(false);
      expect(sim.hashState()).toBe(before);
      expect(sim.getSnapshot().counters).toEqual(beforeCounters);
    }
  });
});

describe("JSON payload rejection", () => {
  it("rejects BigInt payloads before serialize", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const before = sim.hashState();
    const r = sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "2000-01-15",
      eventType: "X",
      payload: { x: 1n as unknown as number } as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NON_JSON_PAYLOAD");
    expect(sim.hashState()).toBe(before);
    expect(() => sim.serializeSave()).not.toThrow();
  });
});

describe("suspend / resume office lifecycle", () => {
  it("active -> suspended -> active keeps the same term id", () => {
    const vacancyWorld = syntheticWorld();
    vacancyWorld.offices.OFFICE_SPEAKER = kernelOffice({
      id: "OFFICE_SPEAKER",
      kind: "speaker",
      suspendWhenActingPresident: true,
      incompatibleWithKinds: ["president"],
    });
    vacancyWorld.successionOfficeIds = ["OFFICE_SPEAKER"];
    vacancyWorld.startingTerms.push({
      officeId: "OFFICE_SPEAKER",
      holderId: "P2",
      startDate: null,
      startKnown: false,
      endDate: null,
      accessionReason: "preexisting",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
    const v = createSimulation({ world: vacancyWorld, playerPoliticianId: "P1" });
    expect(
      v.executeCommand({ type: "INJECT_PRESIDENTIAL_VACANCY", reason: "resignation" }).ok,
    ).toBe(true);
    const speaker = Object.values(v.getSnapshot().officeTerms).find(
      (t) => t.officeId === "OFFICE_SPEAKER",
    )!;
    expect(speaker.status).toBe("suspended");
    const speakerId = speaker.id;
    const resumed = v.executeCommand({ type: "DEV_RESUME_TERM", termId: speakerId });
    expect(resumed.ok).toBe(true);
    expect(v.getSnapshot().officeTerms[speakerId]?.status).toBe("active");
    expect(v.getSnapshot().officeTerms[speakerId]?.id).toBe(speakerId);
  });

  it("ended term cannot be resumed", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const id = Object.keys(sim.getSnapshot().officeTerms)[0]!;
    expect(
      sim.executeCommand({ type: "DEV_VACATE_OFFICE", officeId: "OFFICE_PRESIDENT", reason: "x" })
        .ok,
    ).toBe(true);
    const r = sim.executeCommand({ type: "DEV_RESUME_TERM", termId: id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TERM_ENDED");
  });
});

function preexistingTerm(officeId: string, holderId: string): KernelWorld["startingTerms"][number] {
  return {
    officeId,
    holderId,
    startDate: null,
    startKnown: false,
    endDate: null,
    accessionReason: "preexisting",
    status: "active",
    holdingKind: "substantive",
    sourceElectionId: null,
    endedDate: null,
    endedReason: null,
  };
}

function extraTerm(raw: Record<string, unknown>, id: string, patch: Record<string, unknown>): void {
  const sim = raw.simulation as {
    officeTerms: Record<string, Record<string, unknown>>;
    counters: { nextTermId: number };
  };
  const proto = Object.values(sim.officeTerms)[0]!;
  sim.officeTerms[id] = { ...proto, id, ...patch };
  const n = Number(id.replace(/^TERM/, ""));
  if (Number.isFinite(n)) sim.counters.nextTermId = Math.max(sim.counters.nextTermId, n + 1);
}

function expectRestoreRejected(raw: unknown, world: KernelWorld, code: string): void {
  const parsed = parseSaveFile(raw);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(() => restoreSimulation(parsed.save, world)).toThrow(new RegExp(code));
}

function pausedPresentationRaw(): Record<string, unknown> {
  const world = jsonClone(syntheticWorld());
  world.scenarioStartDate = "2028-01-01";
  world.initialScheduled = [
    {
      dueDate: "2028-10-14",
      eventType: "BLOCKING_TEST",
      payload: {},
      priority: 0,
      blocking: true,
      requiresResolution: false,
      source: "test",
    },
  ];
  const sim = createSimulation({ world, playerPoliticianId: "P1" });
  for (let i = 0; i < 9; i++) sim.executeCommand({ type: "ADVANCE_TURN" });
  sim.executeCommand({ type: "ADVANCE_TURN" });
  return JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
}

describe("initial KernelWorld validation", () => {
  it("rejects duplicate politician ids", () => {
    const world = syntheticWorld();
    world.politicians.push({
      id: "P1",
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
    });
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("INVALID_WORLD");
    expect(() => createSimulation({ world, playerPoliticianId: "P1" })).toThrow();
  });

  it("rejects inverted starting term dates", () => {
    const world = syntheticWorld();
    world.startingTerms[0] = {
      ...world.startingTerms[0]!,
      startKnown: true,
      startDate: "2001-01-01",
      endDate: "2000-01-01",
    };
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("INVALID_WORLD");
    expect(err?.message).toMatch(/endDate is before startDate/);
    expect(() => createSimulation({ world, playerPoliticianId: "P1" })).toThrow();
  });

  it("rejects an occupying term that ended before scenario start", () => {
    const world = syntheticWorld();
    world.startingTerms[0] = {
      ...world.startingTerms[0]!,
      startKnown: true,
      startDate: "1998-01-01",
      endDate: "1999-06-01",
    };
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("INVALID_WORLD");
    expect(err?.message).toMatch(/ended before scenario start/);
  });

  it("does not invent a startDate for a preexisting unknown-start office", () => {
    const world = syntheticWorld();
    world.startingTerms[0] = {
      ...world.startingTerms[0]!,
      startKnown: false,
      startDate: "1999-01-01",
    };
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("INVALID_WORLD");
    expect(err?.message).toMatch(/must not invent a startDate/);
  });
});

describe("restored-save world-relative validation", () => {
  it("rejects a fake office id that passed structural parsing", () => {
    const world = syntheticWorld();
    const raw = cloneSave();
    extraTerm(raw, "TERM000001", { officeId: "FAKE_OFFICE" });
    expectRestoreRejected(raw, world, "UNKNOWN_OFFICE");
  });

  it("rejects a ghost holder that passed structural parsing", () => {
    const world = syntheticWorld();
    const raw = cloneSave();
    extraTerm(raw, "TERM000001", { holderId: "GHOST" });
    expectRestoreRejected(raw, world, "UNKNOWN_POLITICIAN");
  });

  it("rejects two substantive presidents even when capacity is raised", () => {
    const world = syntheticWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_PRESIDENT",
      holderId: "P2",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "active",
      holdingKind: "substantive",
      endedDate: null,
      endedReason: null,
    });
    const restoreWorld = jsonClone(world);
    restoreWorld.offices.OFFICE_PRESIDENT = {
      ...restoreWorld.offices.OFFICE_PRESIDENT!,
      capacity: 2,
    };
    expectRestoreRejected(raw, restoreWorld, "TWO_PRESIDENTS");
  });

  it("rejects an over-capacity occupying office", () => {
    const world = syntheticWorld();
    const raw = JSON.parse(JSON.stringify(goodSave())) as Record<string, unknown>;
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_PRESIDENT",
      holderId: "P2",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "active",
      holdingKind: "substantive",
      endedDate: null,
      endedReason: null,
    });
    expectRestoreRejected(raw, world, "CAPACITY");
  });

  it("does not count ended terms toward capacity", () => {
    const world = syntheticWorld();
    const raw = JSON.parse(JSON.stringify(goodSave())) as Record<string, unknown>;
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_PRESIDENT",
      holderId: "P2",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "ended",
      holdingKind: "substantive",
      endedDate: "2000-01-01",
      endedReason: "resigned",
    });
    const parsed = parseSaveFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(() => restoreSimulation(parsed.save, world)).not.toThrow();
  });

  it("rejects incompatible occupying offices", () => {
    const world = syntheticWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_ASM",
      holderId: "P1",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "active",
      holdingKind: "substantive",
      endedDate: null,
      endedReason: null,
    });
    const restoreWorld = jsonClone(world);
    restoreWorld.offices.OFFICE_ASM = kernelOffice({
      id: "OFFICE_ASM",
      kind: "assembly_member",
      capacity: 9,
      incompatibleWithKinds: ["president"],
    });
    expectRestoreRejected(raw, restoreWorld, "INCOMPATIBLE");
  });

  it("rejects a no-party-membership office violation", () => {
    const world = syntheticWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
    const simState = raw.simulation as { politicians: Record<string, { partyId: string | null }> };
    simState.politicians.P2.partyId = "PARTY_X";
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_COURT",
      holderId: "P2",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "active",
      holdingKind: "substantive",
      endedDate: null,
      endedReason: null,
    });
    const restoreWorld = jsonClone(world);
    restoreWorld.offices.OFFICE_COURT = kernelOffice({
      id: "OFFICE_COURT",
      kind: "constitutional_court_justice",
      noPartyMembershipWhileServing: true,
    });
    expectRestoreRejected(raw, restoreWorld, "PARTY_MEMBERSHIP");
  });

  it("allows a procedural politician who is not in static starting content", () => {
    const world = syntheticWorld();
    const raw = JSON.parse(JSON.stringify(goodSave())) as Record<string, unknown>;
    const simState = raw.simulation as { politicians: Record<string, unknown> };
    simState.politicians.PROC1 = {
      id: "PROC1",
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
    };
    const parsed = parseSaveFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(() => restoreSimulation(parsed.save, world)).not.toThrow();
  });
});

describe("requiresResolution implies blocking", () => {
  it("rejects DEV_SCHEDULE_EVENT resolution=true/blocking=false without mutation", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    const before = sim.hashState();
    const beforeCounters = jsonClone(sim.getSnapshot().counters);
    const r = sim.executeCommand({
      type: "DEV_SCHEDULE_EVENT",
      dueDate: "2000-01-15",
      eventType: "NEEDS_DOMAIN",
      blocking: false,
      requiresResolution: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RESOLUTION_EVENT_MUST_BLOCK");
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(beforeCounters);
  });

  it("rejects a malformed save with resolution=true/blocking=false", () => {
    const raw = cloneSave();
    const sim = raw.simulation as { scheduler: { events: Array<Record<string, unknown>> } };
    sim.scheduler.events[0]!.requiresResolution = true;
    sim.scheduler.events[0]!.blocking = false;
    const r = parseSaveFile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RESOLUTION_EVENT_MUST_BLOCK");
  });

  it("rejects a malformed initial world with resolution=true/blocking=false", () => {
    const world = syntheticWorld();
    world.initialScheduled[0] = {
      ...world.initialScheduled[0]!,
      requiresResolution: true,
      blocking: false,
    };
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("RESOLUTION_EVENT_MUST_BLOCK");
    expect(() => createSimulation({ world, playerPoliticianId: "P1" })).toThrow(
      /RESOLUTION_EVENT_MUST_BLOCK/,
    );
  });

  it("accepts a presidential election event with resolution and blocking", () => {
    const world = syntheticWorld();
    world.initialScheduled.push({
      dueDate: "2000-10-14",
      eventType: "PRESIDENTIAL_ELECTION_DUE",
      payload: {},
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_PRESIDENTIAL_REGULAR",
    });
    expect(validateKernelWorld(world)).toBeNull();
    expect(() => createSimulation({ world, playerPoliticianId: "P1" })).not.toThrow();
  });
});

describe("pending interrupt must match its scheduled event", () => {
  it("rejects mismatched interrupt code", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as { pendingInterrupt: Record<string, unknown> };
    sim.pendingInterrupt.code = "OTHER_EVENT";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects mismatched interrupt date", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as { pendingInterrupt: Record<string, unknown> };
    sim.pendingInterrupt.date = "2028-10-15";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects mismatched interrupt requiresResolution", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as {
      pendingInterrupt: Record<string, unknown>;
      scheduler: { events: Array<Record<string, unknown>> };
    };
    const src = sim.scheduler.events.find((e) => e.id === sim.pendingInterrupt.scheduledEventId)!;
    src.requiresResolution = true;
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects a pending source event", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as {
      pendingInterrupt: Record<string, unknown>;
      scheduler: { events: Array<Record<string, unknown>> };
    };
    const src = sim.scheduler.events.find((e) => e.id === sim.pendingInterrupt.scheduledEventId)!;
    src.status = "pending";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects a cancelled source event", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as {
      pendingInterrupt: Record<string, unknown>;
      scheduler: { events: Array<Record<string, unknown>> };
    };
    const src = sim.scheduler.events.find((e) => e.id === sim.pendingInterrupt.scheduledEventId)!;
    src.status = "cancelled";
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it("rejects a non-blocking source event", () => {
    const raw = pausedPresentationRaw();
    const sim = raw.simulation as {
      pendingInterrupt: Record<string, unknown>;
      scheduler: { events: Array<Record<string, unknown>> };
    };
    const src = sim.scheduler.events.find((e) => e.id === sim.pendingInterrupt.scheduledEventId)!;
    src.blocking = false;
    expect(parseSaveFile(raw).ok).toBe(false);
  });
});

describe("save parser string-id arrays", () => {
  it("rejects non-string actorIds and entityIds", () => {
    const sim = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    expect(sim.executeCommand({ type: "ADVANCE_TURN" }).ok).toBe(true);
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
    const state = raw.simulation as { history: Array<Record<string, unknown>> };
    state.history[0]!.actorIds = [123];
    expect(parseSaveFile(raw).ok).toBe(false);
    state.history[0]!.actorIds = [];
    state.history[0]!.entityIds = [{ id: "x" }];
    expect(parseSaveFile(raw).ok).toBe(false);
  });
});

describe("duplicate same-office holder", () => {
  it("rejects two substantive occupying terms for the same office in KernelWorld", () => {
    const world = syntheticWorld();
    world.offices.OFFICE_ASM = kernelOffice({
      id: "OFFICE_ASM",
      kind: "assembly_member",
      capacity: 9,
    });
    world.startingTerms.push(
      preexistingTerm("OFFICE_ASM", "P2"),
      preexistingTerm("OFFICE_ASM", "P2"),
    );
    const err = validateKernelWorld(world);
    expect(err?.code).toBe("INVALID_WORLD");
    expect(err?.message).toMatch(/multiple substantive slots/);
  });

  it("rejects two substantive occupying terms for the same office on restore", () => {
    const world = syntheticWorld();
    world.offices.OFFICE_ASM = kernelOffice({
      id: "OFFICE_ASM",
      kind: "assembly_member",
      capacity: 9,
    });
    world.startingTerms.push(preexistingTerm("OFFICE_ASM", "P2"));
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const raw = JSON.parse(JSON.stringify(sim.serializeSave())) as Record<string, unknown>;
    extraTerm(raw, "TERM000099", {
      officeId: "OFFICE_ASM",
      holderId: "P2",
      startKnown: false,
      startDate: null,
      endDate: null,
      status: "active",
      holdingKind: "substantive",
      endedDate: null,
      endedReason: null,
    });
    expectRestoreRejected(raw, world, "DUPLICATE_OFFICE_HOLDER");
  });

  it("rejects assumeOffice of a second substantive slot in the same office", () => {
    const world = syntheticWorld();
    world.offices.OFFICE_ASM = kernelOffice({
      id: "OFFICE_ASM",
      kind: "assembly_member",
      capacity: 9,
    });
    world.startingTerms.push(preexistingTerm("OFFICE_ASM", "P2"));
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const r = sim.executeCommand({
      type: "DEV_ASSUME_OFFICE",
      officeId: "OFFICE_ASM",
      holderId: "P2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("DUPLICATE_OFFICE_HOLDER");
  });

  it("allows the same politician to hold assembly and speaker together", () => {
    const world = syntheticWorld();
    world.offices.OFFICE_ASM = kernelOffice({
      id: "OFFICE_ASM",
      kind: "assembly_member",
      capacity: 9,
    });
    world.offices.OFFICE_SPEAKER = kernelOffice({
      id: "OFFICE_SPEAKER",
      kind: "speaker",
      requiresHolderKinds: ["assembly_member"],
      mayCoexistWithKinds: ["assembly_member"],
    });
    world.startingTerms.push(
      preexistingTerm("OFFICE_ASM", "P2"),
      preexistingTerm("OFFICE_SPEAKER", "P2"),
    );
    expect(validateKernelWorld(world)).toBeNull();
    expect(() => createSimulation({ world, playerPoliticianId: "P1" })).not.toThrow();
  });
});
