import { describe, expect, it } from "vitest";
import { serializeCountResult } from "@lorsain/election-math";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { createRngService } from "./rng.js";
import { regularElectionDate } from "./calendar.js";
import { occupyingTerms } from "./offices.js";
import { emptyIdeology } from "./agents/profile.js";
import { CANONICAL_PRESIDENTIAL_ELECTION_ID } from "./elections/types.js";
import type { ElectionCandidate, IdeologyVector } from "./elections/types.js";
import {
  largestRemainder,
  firstPreferenceTotals,
  generateConstituencyBallots,
  integerBallotWeightSum,
} from "./elections/ballots.js";
import { aggregateSupport, blocSupportShares } from "./elections/support.js";
import { createPoll } from "./elections/polls.js";
import { resolveAssemblyConstituency } from "./elections/assembly.js";
import { replayElectionCount } from "./elections/replay.js";
import { miniElectorateWorld } from "./mini-electorate-world.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import type { Command, KernelWorld, SaveFile } from "./types.js";

function expectOk(sim: Simulation, command: Command): void {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
}

function ideology(partial: Partial<IdeologyVector>): IdeologyVector {
  return { ...emptyIdeology(), ...partial };
}

function candidate(
  partial: Omit<ElectionCandidate, "independentQualified" | "withdrawn"> &
    Partial<ElectionCandidate>,
): ElectionCandidate {
  return {
    withdrawn: false,
    independentQualified: false,
    publicIdeology: null,
    sourceContestId: null,
    ...partial,
  };
}

describe("Phase 4 hardening: ballot realization", () => {
  it("allocates 55/45 first preferences instead of argmax 100/0", () => {
    expect(largestRemainder([0.55, 0.45], 100000)).toEqual([55000, 45000]);
    const world = miniElectorateWorld();
    world.voterBlocs.C001_B01 = {
      ...world.voterBlocs.C001_B01!,
      partyHabit: { PARTY_LAB: 0.55, PARTY_NU: 0.45 },
    };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const snap = sim.getSnapshot();
    const shares = blocSupportShares(world, snap, world.voterBlocs.C001_B01!, ["P3", "P4"]);
    expect(shares.P3!).toBeGreaterThan(0.5);
    expect(shares.P4!).toBeGreaterThan(0.35);
    const ballots = generateConstituencyBallots(
      world,
      snap,
      "C001",
      ["P3", "P4"],
      100000,
      undefined,
      null,
    );
    expect(Number(integerBallotWeightSum(ballots))).toBe(100000);
    const first = firstPreferenceTotals(ballots);
    expect(Math.abs((first.P3 ?? 0) - Math.round((shares.P3 ?? 0) * 100000))).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs((first.P4 ?? 0) - Math.round((shares.P4 ?? 0) * 100000))).toBeLessThanOrEqual(
      1,
    );
    expect(first.P3).not.toBe(100000);
    expect(first.P4).toBeGreaterThan(35000);
    expect(first.P3).toBeLessThan(65000);
  });

  it("gives a high-turnout bloc more formal ballots than an equal-size low-turnout bloc", () => {
    const world = miniElectorateWorld();
    world.voterBlocs = {
      C001_A: {
        ...world.voterBlocs.C001_B01!,
        id: "C001_A",
        weight: 0.5,
        turnoutPropensity: 0.8,
        partyHabit: { PARTY_LAB: 1, PARTY_NU: 0 },
      },
      C001_B: {
        ...world.voterBlocs.C001_B01!,
        id: "C001_B",
        weight: 0.5,
        turnoutPropensity: 0.4,
        partyHabit: { PARTY_LAB: 0, PARTY_NU: 1 },
      },
    };
    world.voterBlocIdsByConstituency = { C001: ["C001_A", "C001_B"] };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const ballots = generateConstituencyBallots(
      world,
      sim.getSnapshot(),
      "C001",
      ["P1", "P2"],
      100000,
      undefined,
      null,
    );
    const byBloc: Record<string, number> = { C001_A: 0, C001_B: 0 };
    for (const g of ballots) {
      const bloc = g.id.split(":")[0]!;
      byBloc[bloc] = (byBloc[bloc] ?? 0) + Number(g.weight.split("/")[0]);
    }
    expect(byBloc.C001_A!).toBeGreaterThan(byBloc.C001_B! * 1.5);
    expect(byBloc.C001_A! + byBloc.C001_B!).toBe(100000);
  });

  it("splits same-party first preferences rather than sending a bloc to one candidate", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    expectOk(sim, { type: "DEV_SET_CANDIDATE_STANDING", politicianId: "P1", favorability: 0.4 });
    expectOk(sim, { type: "DEV_SET_CANDIDATE_STANDING", politicianId: "P3", favorability: -0.2 });
    const ballots = generateConstituencyBallots(
      world,
      sim.getSnapshot(),
      "C001",
      ["P1", "P3"],
      50000,
      undefined,
      null,
    );
    const first = firstPreferenceTotals(ballots);
    expect(first.P1 ?? 0).toBeGreaterThan(0);
    expect(first.P3 ?? 0).toBeGreaterThan(0);
    expect(first.P1).not.toBe(50000);
  });

  it("is invariant to candidate input order", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const snap = sim.getSnapshot();
    const a = generateConstituencyBallots(
      world,
      snap,
      "C001",
      ["P1", "P2"],
      20000,
      undefined,
      null,
    );
    const b = generateConstituencyBallots(
      world,
      snap,
      "C001",
      ["P2", "P1"],
      20000,
      undefined,
      null,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("Phase 4 hardening: national weighting / issue / independent / hidden", () => {
  it("weights national support by electorate size", () => {
    const world = miniElectorateWorld();
    world.constituencyElectorate.C002 = {
      ...world.constituencyElectorate.C001!,
      constituencyId: "C002",
      population: 10000,
      turnout2026: {
        ...world.constituencyElectorate.C001!.turnout2026,
        totalPopulation: 10000,
        registeredElectorate: 10000,
      },
    };
    world.constituencyElectorate.C001 = {
      ...world.constituencyElectorate.C001!,
      population: 90000,
      turnout2026: {
        ...world.constituencyElectorate.C001!.turnout2026,
        totalPopulation: 90000,
        registeredElectorate: 90000,
      },
    };
    world.voterBlocs.C002_B01 = {
      ...world.voterBlocs.C001_B01!,
      id: "C002_B01",
      constituencyId: "C002",
      partyHabit: { PARTY_LAB: 0, PARTY_NU: 1 },
    };
    world.voterBlocs.C001_B01 = {
      ...world.voterBlocs.C001_B01!,
      partyHabit: { PARTY_LAB: 1, PARTY_NU: 0 },
    };
    world.voterBlocIdsByConstituency = { C001: ["C001_B01"], C002: ["C002_B01"] };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const scaleA = world.constituencyElectorate.C001!.turnout2026.registeredElectorate;
    const scaleB = world.constituencyElectorate.C002!.turnout2026.registeredElectorate;
    expect(scaleA / (scaleA + scaleB)).toBeCloseTo(0.9, 5);
    const shares = aggregateSupport(
      world,
      sim.getSnapshot(),
      ["C001", "C002"],
      ["P3", "P4"],
      () => 1,
    );
    expect(shares.P3!).toBeGreaterThan(0.7);
    expect(shares.P4!).toBeLessThan(0.3);
    expect(shares.P3!).toBeGreaterThan(shares.P4! * 2);
    const likely = aggregateSupport(
      world,
      sim.getSnapshot(),
      ["C001", "C002"],
      ["P3", "P4"],
      (bloc) => Math.pow(bloc.turnoutPropensity, 1.35),
    );
    expect(likely.P3!).toBeGreaterThan(0.7);
    expect(likely.P4!).toBeLessThan(0.3);
  });

  it("moves relative support when issue climate shifts", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const left = ideology({ authority: 0.85 });
    const right = ideology({ authority: -0.85 });
    const bloc = world.voterBlocs.C001_B01!;
    const before = blocSupportShares(world, sim.getSnapshot(), bloc, ["P3", "P4"], {
      P3: left,
      P4: right,
    });
    expectOk(sim, {
      type: "DEV_SET_ELECTORAL_ENVIRONMENT",
      issueClimateShift: { ISS_REFORM: 0.9 },
    });
    const after = blocSupportShares(world, sim.getSnapshot(), bloc, ["P3", "P4"], {
      P3: left,
      P4: right,
    });
    expect(after.P3!).toBeGreaterThan(before.P3!);
  });

  it("gives PARTY_IND habit to independents without mutating membership", () => {
    const world = miniElectorateWorld();
    world.politicians.push({
      id: "P5",
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
    });
    world.agentProfiles.P5 = syntheticAgentProfile("P5");
    world.voterBlocs.C001_B01 = {
      ...world.voterBlocs.C001_B01!,
      partyHabit: { PARTY_LAB: 0.05, PARTY_NU: 0.05, PARTY_IND: 0.9 },
    };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    expect(sim.getSnapshot().politicians.P5?.partyId).toBeNull();
    const ind = ideology({ economic: 0 });
    const party = ideology({ economic: 0 });
    const shares = blocSupportShares(
      world,
      sim.getSnapshot(),
      world.voterBlocs.C001_B01!,
      ["P2", "P5"],
      {
        P2: party,
        P5: ind,
      },
    );
    expect(shares.P5!).toBeGreaterThan(shares.P2!);
    expect(sim.getSnapshot().politicians.P5?.partyId).toBeNull();
    expect(sim.getSnapshot().partyStates.PARTY_IND).toBeUndefined();
  });

  it("does not leak hidden ideology or skills into support", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const before = blocSupportShares(world, sim.getSnapshot(), world.voterBlocs.C001_B01!, [
      "P1",
      "P2",
    ]);
    const mutated = jsonClone(world);
    mutated.agentProfiles.P1 = {
      ...mutated.agentProfiles.P1!,
      ideology: { ...mutated.agentProfiles.P1!.ideology, economic: -0.99 },
      skills: { ...mutated.agentProfiles.P1!.skills, campaigning: 0.99, media: 0.01 },
      traits: { ...mutated.agentProfiles.P1!.traits, integrity: 0.01, ambition: 0.99 },
    };
    const sim2 = createSimulation({ world: mutated, playerPoliticianId: "P1" });
    const after = blocSupportShares(mutated, sim2.getSnapshot(), mutated.voterBlocs.C001_B01!, [
      "P1",
      "P2",
    ]);
    expect(after.P1).toBe(before.P1);
    expect(sim.getSnapshot().candidateStanding.P1).toBeDefined();
    expect(Object.keys(sim.getSnapshot().candidateStanding)).toEqual(["P1"]);
  });

  it("does not mutate standing during a support query", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    const keys = Object.keys(sim.getSnapshot().candidateStanding).sort();
    expect(keys).toEqual(["P1"]);
    blocSupportShares(world, sim.getSnapshot(), world.voterBlocs.C001_B01!, ["P1", "P2"]);
    expect(sim.hashState()).toBe(hash);
    expect(Object.keys(sim.getSnapshot().candidateStanding).sort()).toEqual(keys);
  });
});

describe("Phase 4 hardening: mutation and field validation", () => {
  it("rejects NaN and Infinity standing without allocating ids or RNG", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    const counters = sim.getSnapshot().counters.nextCommandId;
    const rng = sim.getSnapshot().rng;
    expect(
      sim.executeCommand({
        type: "DEV_SET_CANDIDATE_STANDING",
        politicianId: "P1",
        favorability: Number.NaN,
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_SET_CANDIDATE_STANDING",
        politicianId: "P1",
        nameRecognition: Number.POSITIVE_INFINITY,
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().counters.nextCommandId).toBe(counters);
    expect(sim.getSnapshot().rng).toEqual(rng);
  });

  it("rejects unknown parties, issues, and non-finite environment shifts", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_SET_ELECTORAL_ENVIRONMENT",
        nationalPartyShift: { PARTY_FAKE: 0.1 },
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_SET_ELECTORAL_ENVIRONMENT",
        issueClimateShift: { ISS_NOPE: 0.1 },
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_SET_ELECTORAL_ENVIRONMENT",
        nationalPartyShift: { PARTY_LAB: Number.NaN },
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_SET_ELECTORAL_ENVIRONMENT",
        nationalPartyShift: { PARTY_LAB: Number.POSITIVE_INFINITY },
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("rejects GHOST candidates, missing provenance, PARTY_IND membership, and unqualified independents", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_ADD_ELECTION_CANDIDATE",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        politicianId: "GHOST",
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_ADD_ELECTION_CANDIDATE",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        politicianId: "P1",
        partyId: "PARTY_LAB",
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "DEV_ADD_ELECTION_CANDIDATE",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        politicianId: "P1",
        partyId: "PARTY_IND",
      }).ok,
    ).toBe(false);
    world.politicians.push({
      id: "P5",
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
    });
    world.agentProfiles.P5 = syntheticAgentProfile("P5");
    const sim2 = createSimulation({ world, playerPoliticianId: "P1" });
    expect(
      sim2.executeCommand({
        type: "DEV_ADD_ELECTION_CANDIDATE",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        politicianId: "P5",
        partyId: null,
      }).ok,
    ).toBe(false);
    expect(
      sim2.executeCommand({
        type: "DEV_ADD_ELECTION_CANDIDATE",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        politicianId: "P5",
        partyId: null,
        publicIdeology: ideology({ economic: 0.1 }),
        independentQualified: false,
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("reconciles unresolved candidacy on death and remains restorable", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const save = sim.serializeSave();
    save.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.candidates.P1 = candidate({
      politicianId: "P1",
      partyId: "PARTY_LAB",
      sourceContestId: "CONTEST_FAKE",
      filedDate: save.simulation.currentDate,
    });
    save.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.status = "field_open";
    const live = restoreSimulation(save, world);
    expectOk(live, { type: "DEV_SET_ALIVE", politicianId: "P1", alive: false });
    expect(
      live.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.candidates.P1!.withdrawn,
    ).toBe(true);
    const parsed = parseSaveFile(live.serializeSave(), "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreSimulation(parsed.save, world).hashState()).toBe(live.hashState());
  });
});

describe("Phase 4 hardening: polls", () => {
  it("rejects election-linked polls of empty or non-field candidates", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID,
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().counters.nextPollId).toBe(1);
    expect(
      sim.executeCommand({
        type: "DEV_CREATE_POLL",
        pollsterId: "POLL_TEST",
        geographyKind: "national",
        candidateIds: ["P1", "P2"],
      }).ok,
    ).toBe(true);
  });

  it("rejects unsupported pollster scope and methods", () => {
    const world = miniElectorateWorld();
    world.pollsters.POLL_REG = {
      ...world.pollsters.POLL_TEST!,
      id: "POLL_REG",
      scope: "regional_east",
    };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const rng = createRngService("POLL-SCOPE");
    const badScope = createPoll(world, jsonClone(sim.getSnapshot()), rng, {
      pollsterId: "POLL_REG",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU" },
      fieldStart: sim.getSnapshot().currentDate,
      fieldEnd: sim.getSnapshot().currentDate,
      publicationDate: sim.getSnapshot().currentDate,
      sampleSize: 400,
    });
    expect("error" in badScope).toBe(true);
    const badMethod = createPoll(world, jsonClone(sim.getSnapshot()), rng, {
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU" },
      fieldStart: sim.getSnapshot().currentDate,
      fieldEnd: sim.getSnapshot().currentDate,
      publicationDate: sim.getSnapshot().currentDate,
      sampleSize: 400,
      method: "crystal_ball",
    });
    expect("error" in badMethod).toBe(true);
  });

  it("keeps published polls historical after later politics", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    expectOk(sim, {
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      sampleSize: 500,
    });
    const poll = Object.values(sim.getSnapshot().polls)[0]!;
    expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: "P2", alive: false });
    expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P1", partyId: null });
    expect(sim.getSnapshot().polls[poll.id]).toEqual(poll);
    const parsed = parseSaveFile(sim.serializeSave(), "0.3.1-predev");
    expect(parsed.ok).toBe(true);
  });
});

describe("Phase 4 hardening: assembly", () => {
  it("returns typed errors for unknown or duplicate candidates and does not argmax-sweep 55/45", () => {
    const world = miniElectorateWorld();
    world.voterBlocs.C001_B01 = {
      ...world.voterBlocs.C001_B01!,
      partyHabit: { PARTY_LAB: 0.55, PARTY_NU: 0.45 },
    };
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const rng = createRngService("ASM-HARD");
    const unknown = resolveAssemblyConstituency(world, sim.getSnapshot(), rng, {
      constituencyId: "C001",
      candidateIds: ["GHOST", "P1"],
      partyByCandidate: { GHOST: "PARTY_LAB", P1: "PARTY_LAB" },
    });
    expect("error" in unknown && unknown.error.code === "UNKNOWN_POLITICIAN").toBe(true);
    const dup = resolveAssemblyConstituency(world, sim.getSnapshot(), rng, {
      constituencyId: "C001",
      candidateIds: ["P1", "P1", "P2"],
      partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU" },
    });
    expect("error" in dup).toBe(true);
    const out = resolveAssemblyConstituency(world, sim.getSnapshot(), rng, {
      constituencyId: "C001",
      candidateIds: ["P1", "P2", "P3", "P4"],
      partyByCandidate: { P1: "PARTY_LAB", P2: "PARTY_NU", P3: "PARTY_LAB", P4: "PARTY_NU" },
    });
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.election.winnerIds.length).toBe(2);
    expect(out.election.id).toContain("ELEC_ASM_");
    const first = firstPreferenceTotals(out.election.countInput!.ballots);
    const tot = Object.values(first).reduce((a, b) => a + b, 0);
    const lab = ((first.P1 ?? 0) + (first.P3 ?? 0)) / tot;
    expect(lab).toBeGreaterThan(0.35);
    expect(lab).toBeLessThan(0.75);
    expect(first.P1 ?? 0).toBeGreaterThan(0);
    expect(first.P3 ?? 0).toBeGreaterThan(0);
    expect(serializeCountResult(replayElectionCount(out.election))).toBe(
      serializeCountResult(out.election.countArchive),
    );
  });
});

function twoCycleWorld(): KernelWorld {
  const world = miniElectorateWorld();
  world.scenarioStartDate = "2028-10-01";
  world.nextRegularPresidentialElectionDate = "2028-10-14";
  world.nextRegularAssemblyElectionDate = "2030-05-12";
  world.initialScheduled = [
    {
      dueDate: "2028-10-14",
      eventType: "PRESIDENTIAL_ELECTION_DUE",
      payload: { electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_PRESIDENTIAL_REGULAR",
    },
  ];
  return world;
}

describe("Phase 4 hardening: future presidential cycle and archive tamper", () => {
  it("runs two regular presidential cycles with distinct election IDs", () => {
    const world = twoCycleWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "TWO-CYCLE" });
    const save = sim.serializeSave();
    const el = save.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
    el.status = "field_finalized";
    el.fieldFinalized = true;
    el.candidates.P3 = candidate({
      politicianId: "P3",
      partyId: "PARTY_LAB",
      filedDate: save.simulation.scenarioStartDate,
    });
    el.candidates.P4 = candidate({
      politicianId: "P4",
      partyId: "PARTY_NU",
      filedDate: save.simulation.scenarioStartDate,
    });
    const live = restoreSimulation(save, world);
    const r = live.executeCommand({ type: "ADVANCE_TURN" });
    expect(r.ok).toBe(true);
    expect(live.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expectOk(live, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    const first = live.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
    expect(first.status).toBe("resolved");
    expect(first.winnerIds.length).toBe(1);
    const firstArchive = serializeCountResult(first.countArchive);
    const firstWinner = first.winnerIds[0]!;
    expectOk(live, { type: "RESUME_TURN" });
    for (let i = 0; i < 5; i++) {
      const step = live.executeCommand({ type: "ADVANCE_TURN" });
      expect(step.ok).toBe(true);
      if (step.ok && step.interrupt) {
        if (!step.interrupt.requiresResolution || step.interrupt.resolutionStatus === "resolved") {
          expectOk(live, { type: "RESUME_TURN" });
        }
      }
    }
    expect(live.getSnapshot().currentDate >= "2029-01-20").toBe(true);
    const office = occupyingTerms(live.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.holderId === firstWinner,
    );
    expect(office?.sourceElectionId).toBe(CANONICAL_PRESIDENTIAL_ELECTION_ID);
    const nextDate = regularElectionDate(world.presidentialCalendar, 2033);
    expect(live.getSnapshot().presidential.nextRegularElectionDate).toBe(nextDate);
    const nextId = `ELEC_PRES_2033`;
    expect(live.getSnapshot().elections[nextId]?.status).toBe("planned");
    expect(
      live
        .getSnapshot()
        .scheduler.events.some(
          (e) => e.eventType === "PRESIDENTIAL_ELECTION_DUE" && e.payload.electionId === nextId,
        ),
    ).toBe(true);
    const afterFirst = live.serializeSave();
    const nextEl = afterFirst.simulation.elections[nextId]!;
    nextEl.status = "field_finalized";
    nextEl.fieldFinalized = true;
    nextEl.candidates.P3 = candidate({
      politicianId: "P3",
      partyId: "PARTY_LAB",
      filedDate: afterFirst.simulation.currentDate,
    });
    nextEl.candidates.P4 = candidate({
      politicianId: "P4",
      partyId: "PARTY_NU",
      filedDate: afterFirst.simulation.currentDate,
    });
    const live2 = restoreSimulation(afterFirst, world);
    while (live2.getSnapshot().currentDate < nextDate) {
      const step = live2.executeCommand({ type: "ADVANCE_TURN" });
      expect(step.ok).toBe(true);
      if (step.ok && step.interrupt) {
        if (step.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") break;
        if (!step.interrupt.requiresResolution || step.interrupt.resolutionStatus === "resolved") {
          expectOk(live2, { type: "RESUME_TURN" });
        }
      }
    }
    expect(live2.getSnapshot().pendingInterrupt?.code).toBe("PRESIDENTIAL_ELECTION_DUE");
    expectOk(live2, { type: "RESOLVE_PRESIDENTIAL_ELECTION", electionId: nextId });
    const second = live2.getSnapshot().elections[nextId]!;
    expect(second.status).toBe("resolved");
    expect(second.id).not.toBe(CANONICAL_PRESIDENTIAL_ELECTION_ID);
    expect(
      serializeCountResult(
        live2.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.countArchive,
      ),
    ).toBe(firstArchive);
    expectOk(live2, { type: "RESUME_TURN" });
    for (let i = 0; i < 5; i++) {
      const step = live2.executeCommand({ type: "ADVANCE_TURN" });
      expect(step.ok).toBe(true);
      if (step.ok && step.interrupt) {
        if (!step.interrupt.requiresResolution || step.interrupt.resolutionStatus === "resolved") {
          expectOk(live2, { type: "RESUME_TURN" });
        }
      }
    }
    const secondWinner = second.winnerIds[0]!;
    const term2 = occupyingTerms(live2.getSnapshot(), "OFFICE_PRESIDENT").find(
      (t) => t.status === "active",
    );
    expect(term2?.sourceElectionId).toBe(nextId);
    expect(term2?.sourceElectionId).not.toBe(CANONICAL_PRESIDENTIAL_ELECTION_ID);
    const assumptionDres = Object.values(live2.getSnapshot().domainResolutions).filter(
      (d) => d.domainType === "presidential_assumption",
    );
    expect(assumptionDres.some((d) => d.electionId === nextId)).toBe(true);
    expect(
      live2.getSnapshot().presidential.electedTermCountByPolitician[secondWinner] ?? 0,
    ).toBeGreaterThan(0);
  }, 180_000);

  it("rejects resolved-election and DRES tampers", () => {
    const world = twoCycleWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "TAMPER" });
    const save = sim.serializeSave();
    const el = save.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!;
    el.status = "field_finalized";
    el.fieldFinalized = true;
    el.candidates.P3 = candidate({
      politicianId: "P3",
      partyId: "PARTY_LAB",
      filedDate: save.simulation.scenarioStartDate,
    });
    el.candidates.P4 = candidate({
      politicianId: "P4",
      partyId: "PARTY_NU",
      filedDate: save.simulation.scenarioStartDate,
    });
    const live = restoreSimulation(save, world);
    expectOk(live, { type: "ADVANCE_TURN" });
    expectOk(live, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    const good = live.serializeSave() as SaveFile;
    const loser =
      live.getSnapshot().elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.winnerIds[0] === "P3"
        ? "P4"
        : "P3";
    const rejectRestore = (tampered: SaveFile) => {
      expect(() => restoreSimulation(tampered, world)).toThrow();
    };

    const winnerTamper = jsonClone(good);
    winnerTamper.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.winnerIds = [loser];
    rejectRestore(winnerTamper);

    const resultTamper = jsonClone(good);
    resultTamper.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.resultEventId = null;
    expect(parseSaveFile(resultTamper, "0.3.1-predev").ok).toBe(false);

    const ghost = jsonClone(good);
    ghost.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.candidates.GHOST = candidate({
      politicianId: "GHOST",
      partyId: "PARTY_LAB",
      filedDate: ghost.simulation.scenarioStartDate,
    });
    rejectRestore(ghost);

    const filed = jsonClone(good);
    filed.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.candidates.P3!.filedDate =
      "2099-01-01";
    rejectRestore(filed);

    const turnout = jsonClone(good);
    turnout.simulation.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]!.turnout!.validVoteValue += 50;
    expect(parseSaveFile(turnout, "0.3.1-predev").ok).toBe(false);

    const dres = Object.values(good.simulation.domainResolutions)[0]!;
    const wrongElection = jsonClone(good);
    wrongElection.simulation.domainResolutions[dres.id]!.electionId = "ELEC_ASM_2030";
    rejectRestore(wrongElection);

    const wrongType = jsonClone(good);
    wrongType.simulation.domainResolutions[dres.id]!.domainType = "assembly_election";
    rejectRestore(wrongType);

    const unrelated = jsonClone(good);
    unrelated.simulation.domainResolutions[dres.id]!.resultEventId = good.simulation.history[0]!.id;
    rejectRestore(unrelated);
  }, 60_000);
});

describe("Phase 4 hardening: malformed poll save", () => {
  it("rejects a poll record with bad shares or future publication", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    expectOk(sim, {
      type: "DEV_CREATE_POLL",
      pollsterId: "POLL_TEST",
      geographyKind: "national",
      candidateIds: ["P1", "P2"],
      sampleSize: 400,
    });
    const save = sim.serializeSave();
    const pollId = Object.keys(save.simulation.polls)[0]!;
    save.simulation.polls[pollId]!.firstPreference[0]!.share = 2;
    expect(parseSaveFile(save, "0.3.1-predev").ok).toBe(false);
  });
});
