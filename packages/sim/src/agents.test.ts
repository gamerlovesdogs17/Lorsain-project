import { describe, expect, it } from "vitest";
import { addYears } from "./calendar.js";
import { createSimulation, restoreSimulation } from "./engine.js";
import { createRngService } from "./rng.js";
import { parseSaveFile } from "./save.js";
import { jsonClone, hashCanonical } from "./hash.js";
import { syntheticWorld } from "./synthetic-world.js";
import { syntheticAgentProfile, getAgentProfile } from "./agents/profile.js";
import {
  applyRelationshipChange,
  countRelationshipEdges,
  getRelationship,
} from "./agents/relationships.js";
import { effectiveSalience, memoriesOwnedBy, recordPoliticalMemory } from "./agents/memories.js";
import { getBelief, recordObservation } from "./agents/beliefs.js";
import {
  generateGoalDrafts,
  goalsOwnedBy,
  reviewGoals,
  type PoliticianGoal,
} from "./agents/goals.js";
import { buildDecisionActorContext } from "./agents/context.js";
import {
  breakdownSumsToFinal,
  breakdownSumsToTotal,
  chooseDecision,
  DecisionContractError,
  emptySignals,
  evaluateDecision,
  evaluateOption,
  type DecisionOption,
} from "./agents/decisions.js";
import { DECISION_WEIGHTS, RELATIONSHIP_MAX_ABS_DELTA } from "./agents/policy.js";
import type { KernelWorld, SaveFile, SimState } from "./types.js";

function simFor(world: KernelWorld = syntheticWorld(), seed?: string) {
  return createSimulation({ world, playerPoliticianId: "P1", seed });
}

function option(
  id: string,
  signals: Partial<ReturnType<typeof emptySignals>> = {},
  extra: Partial<DecisionOption> = {},
): DecisionOption {
  return {
    optionId: id,
    actionType: "TEST",
    targetIds: extra.targetIds ?? [],
    uncertainty: extra.uncertainty ?? 0,
    signals: emptySignals(signals),
    goalImpacts: extra.goalImpacts ?? {},
    metadata: extra.metadata ?? {},
  };
}

function stripToV1(save: SaveFile): Record<string, unknown> {
  const raw = jsonClone(save) as unknown as Record<string, unknown>;
  raw.schemaVersion = 1;
  const sim = raw.simulation as Record<string, unknown>;
  sim.schemaVersion = 1;
  delete sim.relationships;
  delete sim.memories;
  delete sim.beliefs;
  delete sim.goals;
  delete sim.generatedAgentProfiles;
  delete sim.agentProfileOverrides;
  const counters = sim.counters as Record<string, unknown>;
  delete counters.nextMemoryId;
  delete counters.nextGoalId;
  return raw;
}

describe("relationships", () => {
  it("keeps directional edges independent and bounded", () => {
    const sim = simFor();
    expect(
      sim.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: "P1",
        targetId: "P2",
        delta: { affinity: 0.4, trust: 0.3 },
      }).ok,
    ).toBe(true);
    const snap = sim.getSnapshot();
    expect(getRelationship(snap, "P1", "P2", snap.currentDate).affinity).toBeCloseTo(0.25);
    expect(getRelationship(snap, "P2", "P1", snap.currentDate).affinity).toBe(0);
    expect(countRelationshipEdges(snap)).toBe(1);
    const again = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: { affinity: 0.4 },
    });
    expect(again.ok).toBe(true);
    const snap2 = sim.getSnapshot();
    expect(getRelationship(snap2, "P1", "P2", snap2.currentDate).affinity).toBeLessThanOrEqual(1);
    const third = jsonClone(snap2);
    const bounced = applyRelationshipChange(third, "P1", "P2", { affinity: 9 }, snap2.currentDate);
    if ("error" in bounced || !bounced.edge) throw new Error("expected edge");
    expect(bounced.edge.affinity).toBeLessThanOrEqual(1);
  });

  it("decays deterministically and save/load preserves stored edges", () => {
    const sim = simFor();
    sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: { affinity: 0.25, trust: 0.25, respect: 0.25 },
    });
    const saved = sim.serializeSave();
    const restored = restoreSimulation(saved, syntheticWorld());
    expect(restored.getSnapshot().relationships.P1!.P2).toEqual(
      sim.getSnapshot().relationships.P1!.P2,
    );
    const later = addYears(sim.getSnapshot().currentDate, 3);
    const a = getRelationship(sim.getSnapshot(), "P1", "P2", later);
    const b = getRelationship(sim.getSnapshot(), "P1", "P2", later);
    expect(a).toEqual(b);
    expect(a.affinity).toBeLessThan(0.25);
    expect(Math.abs(a.affinity)).toBeLessThan(Math.abs(a.trust));
  });

  it("repeats the same interaction deterministically and does not store neutrals", () => {
    const run = () => {
      const s = simFor();
      s.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: "P1",
        targetId: "P2",
        delta: { respect: 0.2 },
      });
      return s.hashState();
    };
    expect(run()).toBe(run());
    const fresh = simFor();
    expect(countRelationshipEdges(fresh.getSnapshot())).toBe(0);
    expect(
      fresh.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: "P1",
        targetId: "P2",
        delta: {},
      }).ok,
    ).toBe(true);
    expect(countRelationshipEdges(fresh.getSnapshot())).toBe(0);
  });
});

describe("memories", () => {
  it("allocates MEM ids, decays by durability, and preserves save/load", () => {
    const sim = simFor();
    sim.executeCommand({ type: "ADVANCE_TURN" });
    const eventId = sim.getSnapshot().history[0]!.id;
    const recorded = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: {},
      memory: {
        kind: "betrayal",
        valence: -0.8,
        salience: 0.9,
        durability: "fleeting",
        sourceEventId: eventId,
        relationshipEffects: { trust: -0.2 },
      },
    });
    expect(recorded.ok).toBe(true);
    const mem = Object.values(sim.getSnapshot().memories)[0]!;
    expect(mem.id).toMatch(/^MEM[0-9]+$/);
    expect(mem.ownerId).toBe("P1");
    expect(mem.subjectIds).toContain("P2");
    expect(mem.sourceEventId).toBe(eventId);
    const later = addYears(mem.date, 1);
    const fleeting = effectiveSalience(mem, later);
    const durable = effectiveSalience({ ...mem, durability: "durable" }, later);
    const permanent = effectiveSalience({ ...mem, durability: "permanent" }, later);
    expect(fleeting).toBeLessThan(durable);
    expect(permanent).toBe(mem.salience);
    const restored = restoreSimulation(sim.serializeSave(), syntheticWorld());
    expect(restored.getSnapshot().memories[mem.id]).toEqual(mem);
  });

  it("prunes lowest effective salience first and keeps permanent memories", () => {
    const world = syntheticWorld();
    world.agentProfiles.P2 = syntheticAgentProfile("P2", { aiTier: "light" });
    const sim = simFor(world);
    const state = jsonClone(sim.getSnapshot()) as SimState;
    for (let i = 0; i < 21; i++) {
      const out = recordPoliticalMemory(
        state,
        world,
        {
          ownerId: "P2",
          subjectIds: ["P1"],
          kind: "generic",
          valence: 0.1,
          salience: 0.05 + i * 0.04,
          durability: "normal",
        },
        state.currentDate,
      );
      if ("error" in out) throw new Error(out.error.message);
    }
    expect(memoriesOwnedBy(state, "P2").filter((m) => m.durability !== "permanent").length).toBe(
      20,
    );
    const perm = recordPoliticalMemory(
      state,
      world,
      {
        ownerId: "P2",
        subjectIds: ["P1"],
        kind: "generic",
        valence: 1,
        salience: 0.01,
        durability: "permanent",
      },
      state.currentDate,
    );
    if ("error" in perm) throw new Error(perm.error.message);
    expect(state.memories[perm.memory.id]).toBeDefined();
    const transients = memoriesOwnedBy(state, "P2").filter((m) => m.durability !== "permanent");
    const saliences = transients.map((m) => m.salience).sort((a, b) => a - b);
    expect(saliences[0]).toBeGreaterThan(0.05);
  });
});

describe("beliefs", () => {
  it("creates, updates, and keeps observer-specific imperfect knowledge", () => {
    const sim = simFor();
    const first = sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 0.2,
      observationConfidence: 0.9,
      sourceReliability: 0.9,
    });
    expect(first.ok).toBe(true);
    const weak = createSimulation({ world: syntheticWorld(), playerPoliticianId: "P1" });
    weak.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 0.2,
      observationConfidence: 0.2,
      sourceReliability: 0.2,
    });
    const strongBelief = getBelief(
      sim.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      sim.getSnapshot().currentDate,
    )!;
    const weakBelief = getBelief(
      weak.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      weak.getSnapshot().currentDate,
    )!;
    expect(strongBelief.confidence).toBeGreaterThan(weakBelief.confidence);
    sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 0.2,
      observationConfidence: 0.9,
      sourceReliability: 0.9,
    });
    const repeated = getBelief(
      sim.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      sim.getSnapshot().currentDate,
    )!;
    expect(repeated.confidence).toBeGreaterThan(strongBelief.confidence);
    expect(repeated.estimate).toBeCloseTo(0.2, 5);
    expect(repeated.estimate).not.toBe(sim.world().agentProfiles.P2!.traits.ambition);

    const other = sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P2",
      targetId: "P1",
      topic: "trait",
      dimension: "ambition",
      observed: 0.8,
      observationConfidence: 0.7,
      sourceReliability: 0.8,
    });
    expect(other.ok).toBe(true);
    expect(
      getBelief(sim.getSnapshot(), "P2", "P1", "trait", "ambition", sim.getSnapshot().currentDate)!
        .estimate,
    ).toBe(0.8);
    expect(
      getBelief(sim.getSnapshot(), "P1", "P2", "trait", "ambition", sim.getSnapshot().currentDate)!
        .estimate,
    ).toBeCloseTo(0.2, 5);

    const beforeContra = getBelief(
      sim.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      sim.getSnapshot().currentDate,
    )!;
    sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 0.95,
      observationConfidence: 0.95,
      sourceReliability: 0.95,
    });
    const afterContra = getBelief(
      sim.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      sim.getSnapshot().currentDate,
    )!;
    expect(afterContra.estimate).toBeGreaterThan(beforeContra.estimate);
    const stale = getBelief(
      sim.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      addYears(sim.getSnapshot().currentDate, 20),
    )!;
    expect(stale.confidence).toBeLessThan(afterContra.confidence);
    const restored = restoreSimulation(sim.serializeSave(), syntheticWorld());
    expect(restored.getSnapshot().beliefs.P1!.P2).toEqual(sim.getSnapshot().beliefs.P1!.P2);
  });
});

describe("goals", () => {
  it("generates deterministic starting goals from canonical facts without RNG", () => {
    const ambitious = syntheticWorld("SEED-A");
    ambitious.agentProfiles.P2 = syntheticAgentProfile("P2", {
      traits: { ambition: 0.95, retirementInclination: 0.05 },
    });
    const retired = syntheticWorld("SEED-A");
    retired.agentProfiles.P2 = syntheticAgentProfile("P2", {
      traits: { ambition: 0.2, retirementInclination: 0.9 },
      birthDate: "1938-01-01",
    });
    const faction = syntheticWorld("SEED-A");
    faction.politicians[1]!.factionId = "FAC_TEST";
    faction.agentProfiles.P2 = syntheticAgentProfile("P2", {
      roleTypes: ["faction_chair"],
      traits: { ambition: 0.5, factionLoyalty: 0.9 },
    });
    const issue = syntheticWorld("SEED-A");
    issue.agentProfiles.P2 = syntheticAgentProfile("P2", {
      issueSalience: { ISS_REFORM: 0.95 },
      traits: { ambition: 0.4 },
    });
    const contender = syntheticWorld("SEED-A");
    contender.agentProfiles.P2 = syntheticAgentProfile("P2", {
      presidentialStatus: "frontrunner",
      traits: { ambition: 0.8, retirementInclination: 0.1 },
    });
    const backbencher = syntheticWorld("SEED-A");
    backbencher.agentProfiles.P2 = syntheticAgentProfile("P2", {
      traits: { ambition: 0.2, retirementInclination: 0.2 },
      presidentialStatus: null,
    });

    const drafts = (world: KernelWorld) => {
      const s = simFor(world, "SEED-A");
      return generateGoalDrafts(world, s.getSnapshot(), "P2").map((d) => d.type);
    };
    expect(drafts(ambitious)).toContain("career_advancement");
    expect(drafts(retired)).toContain("retirement");
    expect(drafts(faction)).toContain("advance_faction");
    expect(drafts(issue)).toContain("issue_outcome");
    expect(drafts(contender)).toContain("seek_office");
    expect(drafts(backbencher)).not.toContain("seek_office");

    const a = simFor(syntheticWorld("FUTURE-A"), "FUTURE-A");
    const b = simFor(syntheticWorld("FUTURE-B"), "FUTURE-B");
    expect(hashCanonical(a.getSnapshot().goals)).toBe(hashCanonical(b.getSnapshot().goals));
    const freshRng = createRngService("FUTURE-A");
    expect(a.getSnapshot().rng.streams["npc-decisions"]).toEqual(
      freshRng.serialize().streams["npc-decisions"],
    );
  });
});

describe("decision engine", () => {
  function ctxFor(
    traits: Parameters<typeof syntheticAgentProfile>[1]["traits"],
    targets: string[] = ["P2"],
  ) {
    const world = syntheticWorld();
    world.agentProfiles.P1 = syntheticAgentProfile("P1", {
      roleTypes: ["president"],
      aiTier: "rich",
      traits,
    });
    const sim = simFor(world);
    return {
      sim,
      ctx: buildDecisionActorContext(world, sim.getSnapshot(), "P1", targets),
    };
  }

  it("is deterministic, order-invariant, and explainable", () => {
    const { sim, ctx } = ctxFor({ ambition: 0.5 });
    const opts = [
      option("B", { careerBenefit: 0.4, partyAlignment: 0.2 }),
      option("A", { careerBenefit: 0.1, partyAlignment: 0.8 }),
    ];
    const rng = createRngService(sim.getSnapshot().rng.masterSeed);
    const first = chooseDecision(opts, ctx, rng);
    const rng2 = createRngService(sim.getSnapshot().rng.masterSeed);
    const second = chooseDecision([...opts].reverse(), ctx, rng2);
    expect(first.chosen?.optionId).toBe(second.chosen?.optionId);
    expect(first.ranked.map((r) => r.optionId)).toEqual(second.ranked.map((r) => r.optionId));
    for (const row of first.ranked) {
      expect(breakdownSumsToTotal(row)).toBe(true);
      expect(breakdownSumsToFinal(row)).toBe(true);
    }
  });

  it("weights traits, relationships, and goals as specified", () => {
    const partyHigh = ctxFor({ partyLoyalty: 0.95 }).ctx;
    const partyLow = ctxFor({ partyLoyalty: 0.05 }).ctx;
    const partyOpt = option("P", { partyAlignment: 1 });
    expect(evaluateOption(partyOpt, partyHigh).components.party).toBeGreaterThan(
      evaluateOption(partyOpt, partyLow).components.party,
    );

    const facHigh = ctxFor({ factionLoyalty: 0.95 }).ctx;
    const facLow = ctxFor({ factionLoyalty: 0.05 }).ctx;
    const facOpt = option("F", { factionAlignment: 1 });
    expect(evaluateOption(facOpt, facHigh).components.faction).toBeGreaterThan(
      evaluateOption(facOpt, facLow).components.faction,
    );

    const ambHigh = ctxFor({ ambition: 0.95 }).ctx;
    const ambLow = ctxFor({ ambition: 0.05 }).ctx;
    const careerOpt = option("C", { careerBenefit: 1 });
    expect(evaluateOption(careerOpt, ambHigh).components.career).toBeGreaterThan(
      evaluateOption(careerOpt, ambLow).components.career,
    );

    const intHigh = ctxFor({ integrity: 0.95 }).ctx;
    const intLow = ctxFor({ integrity: 0.05 }).ctx;
    const dirty = option("D", { integrityAlignment: -1 });
    expect(evaluateOption(dirty, intHigh).components.integrity).toBeLessThan(
      evaluateOption(dirty, intLow).components.integrity,
    );

    const instHigh = ctxFor({ institutionalism: 0.95 }).ctx;
    const instLow = ctxFor({ institutionalism: 0.05 }).ctx;
    const improper = option("I", { institutionalAlignment: -1 });
    expect(evaluateOption(improper, instHigh).components.institutionalism).toBeLessThan(
      evaluateOption(improper, instLow).components.institutionalism,
    );

    const riskHigh = ctxFor({ riskTolerance: 0.95 }).ctx;
    const riskLow = ctxFor({ riskTolerance: 0.05 }).ctx;
    const risky = option("R", { risk: 1 });
    expect(evaluateOption(risky, riskHigh).components.risk).toBeGreaterThan(
      evaluateOption(risky, riskLow).components.risk,
    );

    const { sim } = ctxFor({ sociability: 0.8 });
    sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: { trust: -0.25, affinity: -0.25 },
    });
    const hostile = buildDecisionActorContext(sim.world(), sim.getSnapshot(), "P1", ["P2"]);
    const coop = option("REL", { relationshipConsequence: 0 }, { targetIds: ["P2"] });
    const neutralWorld = syntheticWorld();
    const neutralSim = simFor(neutralWorld);
    const neutralCtx = buildDecisionActorContext(neutralWorld, neutralSim.getSnapshot(), "P1", [
      "P2",
    ]);
    expect(evaluateOption(coop, hostile).components.relationship).toBeLessThan(
      evaluateOption(coop, neutralCtx).components.relationship,
    );

    const withGoal = ctxFor({ ambition: 0.5 }).ctx;
    const retain = withGoal.goals.find((g) => g.type === "retain_office");
    expect(retain).toBeDefined();
    const advancing = option("G", {}, { goalImpacts: { [retain!.id]: 1 } });
    const ignore = option("N", {});
    expect(evaluateOption(advancing, withGoal).components.goalProgress).toBeGreaterThan(
      evaluateOption(ignore, withGoal).components.goalProgress,
    );
    expect(evaluateOption(advancing, withGoal).goalContributions.map((c) => c.goalId)).toEqual([
      retain!.id,
    ]);
  });

  it("does not let bounded noise reverse a large utility gap", () => {
    const { ctx } = ctxFor({ ambition: 0.5 }, []);
    const opts = [
      option("WIN", { careerBenefit: 1, pragmaticEffectiveness: 1 }),
      option("LOSE", { careerBenefit: -1, risk: 1 }),
    ];
    for (let i = 0; i < 250; i++) {
      const rng = createRngService(`NOISE-${i}`);
      const chosen = chooseDecision(opts, ctx, rng).chosen;
      expect(chosen?.optionId).toBe("WIN");
    }
  });

  it("does not receive another politician's hidden profile", () => {
    const world = syntheticWorld();
    world.agentProfiles.P2 = syntheticAgentProfile("P2", { traits: { ambition: 0.913 } });
    const sim = simFor(world);
    const ctx = buildDecisionActorContext(world, sim.getSnapshot(), "P1", ["P2"]);
    expect(JSON.stringify(ctx)).not.toContain("0.913");
    expect(ctx.profile.politicianId).toBe("P1");
    expect("agentProfiles" in ctx).toBe(false);
  });
});

describe("player autonomy", () => {
  it("does not autonomously choose political actions for playerPoliticianId", () => {
    const sim = simFor();
    for (let i = 0; i < 24; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        expect(sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
        expect(sim.executeCommand({ type: "RESUME_TURN" }).ok).toBe(true);
      }
    }
    const types = sim.getSnapshot().history.map((e) => e.type);
    expect(types.some((t) => /DECISION|NPC_ACTION|AGENT_ACT/.test(t))).toBe(false);
    expect(goalsOwnedBy(sim.getSnapshot(), "P1").length).toBeGreaterThan(0);
  });
});

describe("save schema v2", () => {
  it("round-trips a new v2 game and migrates v1 saves", () => {
    const world = syntheticWorld();
    const sim = simFor(world);
    const hash = sim.hashState();
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(hash);
    const v1 = stripToV1(sim.serializeSave());
    const parsed = parseSaveFile(v1, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(2);
    const migrated = restoreSimulation(parsed.save, world);
    expect(migrated.hashState()).toBe(hash);

    sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: { trust: 0.2 },
      memory: { kind: "favor", valence: 0.4, salience: 0.5, durability: "normal" },
    });
    sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "skill",
      dimension: "media",
      observed: 0.4,
      observationConfidence: 0.6,
      sourceReliability: 0.7,
    });
    const mid = sim.serializeSave();
    const continued = restoreSimulation(mid, world);
    const cmd = {
      type: "DEV_RECORD_INTERACTION" as const,
      sourceId: "P1",
      targetId: "P2",
      delta: { affinity: 0.1 },
    };
    expect(sim.executeCommand(cmd).ok).toBe(true);
    expect(continued.executeCommand(cmd).ok).toBe(true);
    expect(continued.hashState()).toBe(sim.hashState());
  });

  it("rejects mutating commands without changing state hash", () => {
    const sim = simFor();
    const before = sim.hashState();
    const counters = jsonClone(sim.getSnapshot().counters);
    const rng = jsonClone(sim.getSnapshot().rng);
    const bad = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P1",
      delta: { trust: 0.2 },
    });
    expect(bad.ok).toBe(false);
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
    expect(sim.getSnapshot().rng).toEqual(rng);
    const nanDelta = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: { trust: Number.NaN },
    });
    expect(nanDelta.ok).toBe(false);
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
    expect(sim.getSnapshot().rng).toEqual(rng);
    const badMem = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: {},
      memory: {
        kind: "favor",
        valence: 0.2,
        salience: 0.2,
        durability: "normal",
        relationshipEffects: { trust: "bad" as unknown as number },
      },
    });
    expect(badMem.ok).toBe(false);
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
    const badTags = sim.executeCommand({
      type: "DEV_RECORD_INTERACTION",
      sourceId: "P1",
      targetId: "P2",
      delta: {},
      memory: {
        kind: "favor",
        valence: 0.2,
        salience: 0.2,
        durability: "normal",
        tags: [1 as unknown as string],
      },
    });
    expect(badTags.ok).toBe(false);
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
    const badObs = sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: Number.NaN,
      observationConfidence: 0.5,
      sourceReliability: 0.5,
    });
    expect(badObs.ok).toBe(false);
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
  });
});

describe("Phase 2 hardening: profiles", () => {
  it("does not let a generated profile shadow canonical hidden truth", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    state.generatedAgentProfiles.P1 = syntheticAgentProfile("P1", { traits: { ambition: 0.01 } });
    const resolved = getAgentProfile(sim.world(), state, "P1")!;
    expect(resolved.traits.ambition).toBe(sim.world().agentProfiles.P1!.traits.ambition);
    expect(resolved.traits.ambition).not.toBe(0.01);
  });
});

describe("Phase 2 hardening: relationships", () => {
  it("rejects NaN, Infinity, and non-number deltas without mutation", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = hashCanonical(state);
    for (const delta of [{ trust: Number.NaN }, { affinity: Infinity }, { respect: "bad" }]) {
      const out = applyRelationshipChange(state, "P1", "P2", delta as never, state.currentDate);
      expect("error" in out).toBe(true);
    }
    expect(hashCanonical(state)).toBe(before);
    expect(countRelationshipEdges(state)).toBe(0);
  });

  it("saturates a large finite delta instead of rejecting it", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const out = applyRelationshipChange(state, "P1", "P2", { affinity: 9 }, state.currentDate);
    if ("error" in out || !out.edge) throw new Error("expected edge");
    expect(out.edge.affinity).toBe(RELATIONSHIP_MAX_ABS_DELTA);
  });
});

describe("Phase 2 hardening: memories", () => {
  it("applies a relationship effect once even if subjectIds are duplicated", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const out = recordPoliticalMemory(
      state,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2", "P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.5,
        durability: "normal",
        relationshipEffects: { trust: 0.1 },
      },
      state.currentDate,
    );
    if ("error" in out) throw new Error(out.error.message);
    expect(out.memory.subjectIds).toEqual(["P2"]);
    expect(getRelationship(state, "P1", "P2", state.currentDate).trust).toBeCloseTo(0.1);
    expect(state.relationships.P1!.P2!.interactionCount).toBe(1);
  });

  it("rejects malformed relationshipEffects and tags without allocating MEM ids", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const beforeCounter = state.counters.nextMemoryId;
    const beforeHash = hashCanonical(state);
    const badDelta = recordPoliticalMemory(
      state,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.5,
        durability: "normal",
        relationshipEffects: { banana: 0.5 } as never,
      },
      state.currentDate,
    );
    expect("error" in badDelta).toBe(true);
    const badTags = recordPoliticalMemory(
      state,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.5,
        durability: "normal",
        tags: [1 as unknown as string],
      },
      state.currentDate,
    );
    expect("error" in badTags).toBe(true);
    expect(state.counters.nextMemoryId).toBe(beforeCounter);
    expect(hashCanonical(state)).toBe(beforeHash);
  });
});

describe("Phase 2 hardening: observations", () => {
  it("rejects malformed observation input without writing beliefs", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = hashCanonical(state);
    const future = recordObservation(
      state,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.4,
        observationConfidence: 0.5,
        sourceReliability: 0.5,
      },
      "2099-01-01",
    );
    expect("error" in future).toBe(true);
    const badSource = recordObservation(
      state,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.4,
        observationConfidence: 0.5,
        sourceReliability: 0.5,
        source: 12 as unknown as string,
      },
      state.currentDate,
    );
    expect("error" in badSource).toBe(true);
    expect(hashCanonical(state)).toBe(before);
  });
});

describe("Phase 2 hardening: goals", () => {
  it("ages motivations from the review date, not scenario start", () => {
    const world = syntheticWorld();
    world.agentProfiles.P2 = syntheticAgentProfile("P2", {
      birthDate: "1965-01-01",
      traits: { retirementInclination: 0.2, ambition: 0.2 },
    });
    const sim = simFor(world);
    const ages = ["2000-01-01", "2010-01-01", "2020-01-01", "2030-01-01", "2040-01-01"].map(
      (date) => {
        const drafts = generateGoalDrafts(world, sim.getSnapshot(), "P2", date);
        return {
          date,
          age: drafts.find((d) => d.type === "legacy")?.metadata.age as number | undefined,
          types: drafts.map((d) => d.type),
        };
      },
    );
    expect(ages[0]!.age).toBeUndefined();
    expect(ages[0]!.types).not.toContain("legacy");
    expect(ages[3]!.age).toBe(65);
    expect(ages[4]!.age).toBe(75);
  });

  it("abandons retain_office when the office is lost and keeps it while held", () => {
    const sim = simFor();
    const retain = goalsOwnedBy(sim.getSnapshot(), "P1").find((g) => g.type === "retain_office");
    expect(retain?.status).toBe("active");
    expect(
      sim.executeCommand({
        type: "DEV_VACATE_OFFICE",
        officeId: "OFFICE_PRESIDENT",
        reason: "test",
      }).ok,
    ).toBe(true);
    expect(sim.executeCommand({ type: "DEV_REVIEW_AGENT_GOALS", politicianId: "P1" }).ok).toBe(
      true,
    );
    expect(sim.getSnapshot().goals[retain!.id]!.status).toBe("abandoned");

    const held = simFor();
    const still = goalsOwnedBy(held.getSnapshot(), "P1").find((g) => g.type === "retain_office");
    expect(held.executeCommand({ type: "DEV_REVIEW_AGENT_GOALS", politicianId: "P1" }).ok).toBe(
      true,
    );
    expect(held.getSnapshot().goals[still!.id]!.status).toBe("active");
  });

  it("lets a higher-priority derived goal displace the lowest at the AI-tier cap", () => {
    const world = syntheticWorld();
    world.agentProfiles.P2 = syntheticAgentProfile("P2", {
      aiTier: "light",
      traits: { ambition: 0.4, ego: 0.6, factionLoyalty: 0.2, retirementInclination: 0.3 },
    });
    const sim = simFor(world);
    const before = goalsOwnedBy(sim.getSnapshot(), "P2").filter((g) => g.status === "active");
    expect(before.map((g) => g.type).sort()).toEqual(["career_advancement", "reputation"]);
    const mutableWorld = jsonClone(sim.world());
    mutableWorld.agentProfiles.P2 = syntheticAgentProfile("P2", {
      aiTier: "light",
      roleTypes: ["faction_chair"],
      traits: { ambition: 0.4, ego: 0.6, factionLoyalty: 0.95, retirementInclination: 0.3 },
    });
    const state = jsonClone(sim.getSnapshot()) as SimState;
    state.politicians.P2!.factionId = "FAC_TEST";
    const reviewed = reviewGoals(state, mutableWorld, "P2", state.currentDate);
    if ("error" in reviewed) throw new Error(reviewed.error.message);
    const owned = goalsOwnedBy(state, "P2");
    const active = owned.filter((g) => g.status === "active").map((g) => g.type);
    expect(active).toContain("advance_faction");
    expect(active).toContain("reputation");
    expect(active).not.toContain("career_advancement");
    expect(owned.find((g) => g.type === "career_advancement")?.status).toBe("superseded");
  });

  it("does not regenerate retain/career/seek goals for a retired politician", () => {
    const world = syntheticWorld();
    world.agentProfiles.P2 = syntheticAgentProfile("P2", {
      presidentialStatus: "frontrunner",
      traits: { ambition: 0.9, retirementInclination: 0.1, ego: 0.7 },
    });
    const sim = simFor(world);
    expect(generateGoalDrafts(world, sim.getSnapshot(), "P2").map((d) => d.type)).toEqual(
      expect.arrayContaining(["career_advancement", "seek_office"]),
    );
    const state = jsonClone(sim.getSnapshot()) as SimState;
    state.politicians.P2!.retired = true;
    const types = generateGoalDrafts(world, state, "P2").map((d) => d.type);
    expect(types).not.toContain("retain_office");
    expect(types).not.toContain("career_advancement");
    expect(types).not.toContain("seek_office");
    expect(types).toContain("reputation");
  });
});

describe("Phase 2 hardening: decisions", () => {
  function ctxFor(
    traits: Parameters<typeof syntheticAgentProfile>[1]["traits"] = { ambition: 0.5 },
  ) {
    const world = syntheticWorld();
    world.agentProfiles.P1 = syntheticAgentProfile("P1", {
      roleTypes: ["president"],
      aiTier: "rich",
      traits,
    });
    const sim = simFor(world);
    return {
      sim,
      ctx: buildDecisionActorContext(world, sim.getSnapshot(), "P1", ["P2"]),
    };
  }

  it("rejects NaN, Infinity, and out-of-range signals before consuming RNG", () => {
    const { ctx } = ctxFor();
    const rng = createRngService("DEC-HARDEN");
    const before = rng.serialize();
    for (const signals of [
      { careerBenefit: Number.NaN },
      { partyAlignment: Infinity },
      { ideologicalAlignment: 1.5 },
      { risk: -0.1 },
    ]) {
      expect(() => evaluateDecision([option("BAD", signals)], ctx, rng)).toThrow(
        DecisionContractError,
      );
      expect(rng.serialize()).toEqual(before);
    }
  });

  it("rejects duplicate option IDs with zero RNG consumption", () => {
    const { ctx } = ctxFor();
    const rng = createRngService("DEC-DUP");
    const before = rng.serialize();
    expect(() =>
      evaluateDecision(
        [option("DUP", { careerBenefit: 0.2 }), option("DUP", { careerBenefit: 0.9 })],
        ctx,
        rng,
      ),
    ).toThrow(/duplicate DecisionOption id DUP/);
    expect(rng.serialize()).toEqual(before);
  });

  it("chooses identically for reordered valid unique options and keeps exact breakdown sums", () => {
    const { sim, ctx } = ctxFor();
    const opts = [
      option("B", { careerBenefit: 0.4, partyAlignment: 0.2 }),
      option("A", { careerBenefit: 0.1, partyAlignment: 0.8 }),
    ];
    const first = chooseDecision(opts, ctx, createRngService(sim.getSnapshot().rng.masterSeed));
    const second = chooseDecision(
      [...opts].reverse(),
      ctx,
      createRngService(sim.getSnapshot().rng.masterSeed),
    );
    expect(first.chosen?.optionId).toBe(second.chosen?.optionId);
    expect(first.ranked.map((r) => r.optionId)).toEqual(second.ranked.map((r) => r.optionId));
    for (const row of first.ranked) {
      expect(breakdownSumsToTotal(row)).toBe(true);
      expect(breakdownSumsToFinal(row)).toBe(true);
    }
  });

  it("applies goal impacts to specific active goal IDs, not every goal of that type", () => {
    const { ctx } = ctxFor();
    const g1: PoliticianGoal = {
      id: "GOALISSUEA",
      ownerId: "P1",
      type: "issue_outcome",
      priority: 1,
      status: "active",
      createdDate: ctx.currentDate,
      lastReviewedDate: ctx.currentDate,
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: "ISS_REFORM",
      targetEntityId: null,
      source: "domain_authored",
      metadata: {},
    };
    const g2: PoliticianGoal = { ...g1, id: "GOALISSUEB" };
    const scoped = { ...ctx, goals: [g1, g2] };
    const ev = evaluateOption(option("X", {}, { goalImpacts: { GOALISSUEA: 1 } }), scoped);
    expect(ev.goalContributions).toEqual([
      {
        goalId: "GOALISSUEA",
        impact: 1,
        contribution: DECISION_WEIGHTS.goalScale,
      },
    ]);
    expect(ev.components.goalProgress).toBeCloseTo(DECISION_WEIGHTS.goalScale);
  });

  it("returns ranked rows by finalUtility then optionId", () => {
    const { ctx } = ctxFor();
    const opts = [option("A", { careerBenefit: -1 }), option("B", { careerBenefit: 1 })];
    const out = chooseDecision(opts, ctx);
    expect(out.chosen?.optionId).toBe("B");
    expect(out.ranked[0]?.optionId).toBe("B");
    expect(out.ranked.map((r) => r.optionId)).toEqual(["B", "A"]);
    expect(out.ranked[0]?.finalUtility).toBeGreaterThan(out.ranked[1]!.finalUtility);
    expect(out.chosen?.optionId).toBe(
      [...out.ranked]
        .filter((r) => r.considered)
        .sort((a, b) => {
          if (a.finalUtility !== b.finalUtility) return b.finalUtility - a.finalUtility;
          return a.optionId < b.optionId ? -1 : 1;
        })[0]?.optionId,
    );
  });

  it("tie-breaks equal final utilities with the smaller optionId", () => {
    const { ctx } = ctxFor();
    const out = chooseDecision(
      [option("B", { careerBenefit: 0.5 }), option("A", { careerBenefit: 0.5 })],
      ctx,
    );
    expect(out.ranked.map((r) => r.optionId)).toEqual(["A", "B"]);
    expect(out.chosen?.optionId).toBe("A");
    expect(out.ranked[0]?.finalUtility).toBe(out.ranked[1]?.finalUtility);
  });

  it("assigns the same noise per optionId when the input array is reordered", () => {
    const { ctx } = ctxFor();
    const opts = [
      option("C", { careerBenefit: 0.1 }, { uncertainty: 1 }),
      option("A", { careerBenefit: 0.2 }, { uncertainty: 1 }),
      option("B", { careerBenefit: 0.3 }, { uncertainty: 1 }),
    ];
    const first = chooseDecision(opts, ctx, createRngService("RANK-NOISE"));
    const second = chooseDecision([...opts].reverse(), ctx, createRngService("RANK-NOISE"));
    expect(first.chosen?.optionId).toBe(second.chosen?.optionId);
    expect(first.ranked.map((r) => r.optionId)).toEqual(second.ranked.map((r) => r.optionId));
    for (const row of first.ranked) {
      const match = second.ranked.find((r) => r.optionId === row.optionId)!;
      expect(match.stochasticAdjustment).toBe(row.stochasticAdjustment);
      expect(match.finalUtility).toBe(row.finalUtility);
    }
  });

  it("rejects null and primitive options with DecisionContractError and zero RNG use", () => {
    const { ctx } = ctxFor();
    const rng = createRngService("DEC-NULL");
    const before = rng.serialize();
    expect(() => evaluateDecision([null as never], ctx, rng)).toThrow(DecisionContractError);
    expect(() => evaluateDecision([42 as never], ctx, rng)).toThrow(DecisionContractError);
    expect(() => evaluateDecision(["option" as never], ctx, rng)).toThrow(DecisionContractError);
    expect(() => evaluateDecision([[] as never], ctx, rng)).toThrow(DecisionContractError);
    expect(() => evaluateDecision([undefined as never], ctx, rng)).toThrow(DecisionContractError);
    expect(rng.serialize()).toEqual(before);
  });
});

describe("Phase 2 final: zero-quality observations", () => {
  it("does not create a belief from zero-quality evidence", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const out = recordObservation(
      state,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 1,
        observationConfidence: 0,
        sourceReliability: 0,
      },
      state.currentDate,
    );
    expect(out).toEqual({ changed: false, belief: null });
    expect(state.beliefs).toEqual({});
  });

  it("does not refresh an existing belief when quality is zero", () => {
    const sim = simFor();
    const created = sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 0.4,
      observationConfidence: 0.8,
      sourceReliability: 0.8,
    });
    expect(created.ok).toBe(true);
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = jsonClone(state.beliefs.P1!.P2!["trait:ambition"]!);
    const out = recordObservation(
      state,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 1,
        observationConfidence: 0,
        sourceReliability: 0,
      },
      state.currentDate,
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.changed).toBe(false);
    expect(state.beliefs.P1!.P2!["trait:ambition"]).toEqual(before);
    expect(state.beliefs.P1!.P2!["trait:ambition"]!.evidenceCount).toBe(before.evidenceCount);
    expect(state.beliefs.P1!.P2!["trait:ambition"]!.lastUpdatedDate).toBe(before.lastUpdatedDate);
    expect(state.beliefs.P1!.P2!["trait:ambition"]!.estimate).toBe(before.estimate);
  });

  it("lets weak positive evidence create a belief and stronger evidence raise confidence more", () => {
    const weakWorld = syntheticWorld();
    const strongWorld = syntheticWorld();
    const weak = simFor(weakWorld);
    const strong = simFor(strongWorld);
    expect(
      weak.executeCommand({
        type: "DEV_RECORD_OBSERVATION",
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.3,
        observationConfidence: 0.2,
        sourceReliability: 0.2,
      }).ok,
    ).toBe(true);
    expect(
      strong.executeCommand({
        type: "DEV_RECORD_OBSERVATION",
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.3,
        observationConfidence: 0.9,
        sourceReliability: 0.9,
      }).ok,
    ).toBe(true);
    const weakBelief = getBelief(
      weak.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      weak.getSnapshot().currentDate,
    )!;
    const strongBelief = getBelief(
      strong.getSnapshot(),
      "P1",
      "P2",
      "trait",
      "ambition",
      strong.getSnapshot().currentDate,
    )!;
    expect(weakBelief.estimate).toBe(0.3);
    expect(strongBelief.confidence).toBeGreaterThan(weakBelief.confidence);
  });

  it("rejects zero-quality observations at the command layer without mutation", () => {
    const sim = simFor();
    const before = sim.hashState();
    const counters = jsonClone(sim.getSnapshot().counters);
    const rng = jsonClone(sim.getSnapshot().rng);
    const r = sim.executeCommand({
      type: "DEV_RECORD_OBSERVATION",
      observerId: "P1",
      targetId: "P2",
      topic: "trait",
      dimension: "ambition",
      observed: 1,
      observationConfidence: 0,
      sourceReliability: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_INFORMATION");
    expect(sim.hashState()).toBe(before);
    expect(sim.getSnapshot().counters).toEqual(counters);
    expect(sim.getSnapshot().rng).toEqual(rng);
    expect(sim.getSnapshot().beliefs).toEqual({});
  });
});

describe("Phase 2 final: mutation chronology", () => {
  function advance(sim: ReturnType<typeof simFor>, n: number): void {
    for (let i = 0; i < n; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      if (r.ok && r.interrupt) {
        expect(sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
        expect(sim.executeCommand({ type: "RESUME_TURN" }).ok).toBe(true);
      } else {
        expect(r.ok).toBe(true);
      }
    }
  }

  it("rejects future, pre-scenario, and backdated relationship updates without mutation", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = hashCanonical(state);
    const future = applyRelationshipChange(state, "P1", "P2", { trust: 0.2 }, "2000-06-01");
    expect("error" in future).toBe(true);
    const pre = applyRelationshipChange(state, "P1", "P2", { trust: 0.2 }, "1999-01-01");
    expect("error" in pre).toBe(true);
    expect(hashCanonical(state)).toBe(before);
    expect(countRelationshipEdges(state)).toBe(0);

    advance(sim, 5);
    expect(sim.getSnapshot().currentDate).toBe("2000-06-01");
    expect(
      sim.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: "P1",
        targetId: "P2",
        delta: { trust: 0.2 },
      }).ok,
    ).toBe(true);
    const later = jsonClone(sim.getSnapshot()) as SimState;
    const edgeBefore = jsonClone(later.relationships.P1!.P2!);
    const counters = jsonClone(later.counters);
    const back = applyRelationshipChange(later, "P1", "P2", { trust: 0.1 }, "2000-05-01");
    expect("error" in back).toBe(true);
    expect(later.relationships.P1!.P2).toEqual(edgeBefore);
    expect(later.counters).toEqual(counters);
  });

  it("rejects pre-scenario, future, rewind, and future-event memories before allocating IDs", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const beforeCounter = state.counters.nextMemoryId;
    const beforeHash = hashCanonical(state);
    const pre = recordPoliticalMemory(
      state,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.4,
        durability: "normal",
      },
      "1999-01-01",
    );
    expect("error" in pre).toBe(true);
    const future = recordPoliticalMemory(
      state,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.4,
        durability: "normal",
      },
      "2000-06-01",
    );
    expect("error" in future).toBe(true);
    expect(state.counters.nextMemoryId).toBe(beforeCounter);
    expect(hashCanonical(state)).toBe(beforeHash);

    advance(sim, 5);
    expect(
      sim.executeCommand({
        type: "DEV_RECORD_INTERACTION",
        sourceId: "P1",
        targetId: "P2",
        delta: { trust: 0.2 },
      }).ok,
    ).toBe(true);
    const june = jsonClone(sim.getSnapshot()) as SimState;
    const relDate = june.relationships.P1!.P2!.lastUpdatedDate;
    expect(relDate).toBe("2000-06-01");
    const memCounter = june.counters.nextMemoryId;
    const rewind = recordPoliticalMemory(
      june,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.4,
        durability: "normal",
        relationshipEffects: { trust: 0.1 },
      },
      "2000-05-01",
    );
    expect("error" in rewind).toBe(true);
    expect(june.counters.nextMemoryId).toBe(memCounter);
    expect(june.relationships.P1!.P2!.lastUpdatedDate).toBe(relDate);

    advance(sim, 1);
    const withEvent = jsonClone(sim.getSnapshot()) as SimState;
    const event = withEvent.history.find((e) => e.type !== "RELATIONSHIP_CHANGED");
    expect(event).toBeDefined();
    expect(event!.date > "2000-01-01").toBe(true);
    const eventCounter = withEvent.counters.nextMemoryId;
    const tooEarly = recordPoliticalMemory(
      withEvent,
      sim.world(),
      {
        ownerId: "P1",
        subjectIds: ["P2"],
        kind: "favor",
        valence: 0.2,
        salience: 0.4,
        durability: "normal",
        sourceEventId: event!.id,
      },
      "2000-01-01",
    );
    expect("error" in tooEarly).toBe(true);
    expect(withEvent.counters.nextMemoryId).toBe(eventCounter);
  });

  it("rejects pre-scenario and backdated observations without writing beliefs", () => {
    const sim = simFor();
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = hashCanonical(state);
    const pre = recordObservation(
      state,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.4,
        observationConfidence: 0.5,
        sourceReliability: 0.5,
      },
      "1999-01-01",
    );
    expect("error" in pre).toBe(true);
    expect(hashCanonical(state)).toBe(before);

    advance(sim, 5);
    expect(
      sim.executeCommand({
        type: "DEV_RECORD_OBSERVATION",
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.4,
        observationConfidence: 0.8,
        sourceReliability: 0.8,
      }).ok,
    ).toBe(true);
    const june = jsonClone(sim.getSnapshot()) as SimState;
    const stored = jsonClone(june.beliefs.P1!.P2!["trait:ambition"]!);
    const back = recordObservation(
      june,
      {
        observerId: "P1",
        targetId: "P2",
        topic: "trait",
        dimension: "ambition",
        observed: 0.9,
        observationConfidence: 0.9,
        sourceReliability: 0.9,
      },
      "2000-05-01",
    );
    expect("error" in back).toBe(true);
    expect(june.beliefs.P1!.P2!["trait:ambition"]).toEqual(stored);
  });

  it("allows mutating goal review only on currentDate and keeps hypothetical drafts", () => {
    const sim = simFor();
    expect(sim.executeCommand({ type: "DEV_REVIEW_AGENT_GOALS", politicianId: "P1" }).ok).toBe(
      true,
    );
    const state = jsonClone(sim.getSnapshot()) as SimState;
    const before = hashCanonical(state);
    const counters = jsonClone(state.counters);
    const future = reviewGoals(state, sim.world(), "P1", "2000-06-01");
    expect("error" in future).toBe(true);
    const back = reviewGoals(state, sim.world(), "P1", "1999-12-31");
    expect("error" in back).toBe(true);
    expect(hashCanonical(state)).toBe(before);
    expect(state.counters).toEqual(counters);
    const drafts = generateGoalDrafts(sim.world(), sim.getSnapshot(), "P2", "2040-01-01");
    expect(drafts.find((d) => d.type === "legacy")?.metadata.age).toBe(79);
  });
});
