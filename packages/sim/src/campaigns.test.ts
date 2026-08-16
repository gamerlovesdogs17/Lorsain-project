import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { restoreRngService } from "./rng.js";
import { buildDecisionActorContext } from "./agents/context.js";
import { candidateStandingOrDefault } from "./elections/standing.js";
import { miniElectorateWorld } from "./mini-electorate-world.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld } from "./types.js";
import { chooseCampaignAction, campaignDecisionOptions } from "./campaigns/decisions.js";
import { campaignFundraise } from "./campaigns/actions.js";
import { holdDebate } from "./campaigns/debates.js";
import { contestPollAverage } from "./elections/polls.js";
import { publicElectabilitySignal } from "./elections/electability.js";

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function playerCampaign(sim: Simulation) {
  const snap = sim.getSnapshot();
  const camp = Object.values(snap.campaignRuntime.campaigns).find(
    (c) =>
      c.politicianId === snap.playerPoliticianId &&
      (c.status === "active" || c.status === "exploring"),
  );
  if (!camp) throw new Error("player campaign missing");
  return camp;
}

function labourNominationRule(world: KernelWorld) {
  world.nominationRules.RULE_LAB = {
    ruleId: "RULE_LAB",
    partyId: "PARTY_LAB",
    method: "closed_member_rcv",
    memberWeight: 1,
    affiliateUnionDelegateWeight: null,
    assemblyCaucusEndorsementFraction: 0,
    provincialOrganizationEndorsementsMin: null,
    memberNominationsRequired: false,
    memberNominationThresholdRequired: false,
    provincialNominationSupportRequired: false,
    supporterRegistrationRequired: false,
  };
  world.partyDefinitions.PARTY_LAB = {
    ...world.partyDefinitions.PARTY_LAB!,
    nominationRuleId: "RULE_LAB",
  };
}

function nuNominationRule(world: KernelWorld) {
  world.nominationRules.RULE_NU = {
    ruleId: "RULE_NU",
    partyId: "PARTY_NU",
    method: "closed_member_rcv",
    memberWeight: 1,
    affiliateUnionDelegateWeight: null,
    assemblyCaucusEndorsementFraction: 0,
    provincialOrganizationEndorsementsMin: null,
    memberNominationsRequired: false,
    memberNominationThresholdRequired: false,
    provincialNominationSupportRequired: false,
    supporterRegistrationRequired: false,
  };
  world.partyDefinitions.PARTY_NU = {
    ...world.partyDefinitions.PARTY_NU!,
    nominationRuleId: "RULE_NU",
  };
}

function declarePlayerAssembly(sim: Simulation) {
  expectOk(sim, {
    type: "DECLARE_CAMPAIGN",
    politicianId: sim.getSnapshot().playerPoliticianId,
    campaignType: "assembly",
    constituencyId: "C001",
  });
}

describe("Phase 5 campaign finance and actions", () => {
  it("starts with no campaigns and schemaVersion 5", () => {
    const sim = createSimulation({ world: miniElectorateWorld(), playerPoliticianId: "P1" });
    const snap = sim.getSnapshot();
    expect(snap.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Object.keys(snap.campaignRuntime.campaigns)).toEqual([]);
    expect(snap.counters.nextCampaignId).toBe(1);
  });

  it("fundraising increases cash and spending decreases it; zero ad spend rejects unchanged", () => {
    const sim = createSimulation({ world: miniElectorateWorld(), playerPoliticianId: "P1" });
    declarePlayerAssembly(sim);
    const before = playerCampaign(sim).cashOnHand;
    expectOk(sim, { type: "CAMPAIGN_FUNDRAISE", campaignId: playerCampaign(sim).id });
    const raised = playerCampaign(sim);
    expect(raised.cashOnHand).toBeGreaterThan(before);
    expect(raised.totalRaised).toBe(raised.cashOnHand);
    const hash = sim.hashState();
    const rng = jsonClone(sim.getSnapshot().rng);
    const zero = sim.executeCommand({
      type: "CAMPAIGN_ADVERTISE",
      campaignId: raised.id,
      spend: 0,
      messageType: "positive",
    });
    expect(zero.ok).toBe(false);
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().rng).toEqual(rng);
    const cash = playerCampaign(sim).cashOnHand;
    expectOk(sim, {
      type: "CAMPAIGN_ADVERTISE",
      campaignId: playerCampaign(sim).id,
      spend: 5_000,
      messageType: "positive",
    });
    expect(playerCampaign(sim).cashOnHand).toBe(cash - 5_000);
    expect(playerCampaign(sim).totalSpent).toBe(5_000);
  });

  it("higher ad spend generally produces a larger effect with diminishing returns", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-AD-SPEND" });
    declarePlayerAssembly(sim);
    for (let i = 0; i < 6 && playerCampaign(sim).cashOnHand < 18_000; i++) {
      if (playerCampaign(sim).actionPointsRemaining < 1) expectOk(sim, { type: "ADVANCE_TURN" });
      expectOk(sim, { type: "CAMPAIGN_FUNDRAISE", campaignId: playerCampaign(sim).id });
    }
    expect(playerCampaign(sim).cashOnHand).toBeGreaterThanOrEqual(18_000);
    const save = sim.serializeSave();
    const low = restoreSimulation(jsonClone(save), world);
    const high = restoreSimulation(jsonClone(save), world);
    const lowOut = expectOk(low, {
      type: "CAMPAIGN_ADVERTISE",
      campaignId: playerCampaign(low).id,
      spend: 5_000,
      messageType: "positive",
    });
    const highOut = expectOk(high, {
      type: "CAMPAIGN_ADVERTISE",
      campaignId: playerCampaign(high).id,
      spend: 15_000,
      messageType: "positive",
    });
    const lowMag = Number(lowOut.events.find((e) => e.type === "AD_CAMPAIGN")?.payload.effect);
    const highMag = Number(highOut.events.find((e) => e.type === "AD_CAMPAIGN")?.payload.effect);
    expect(highMag).toBeGreaterThan(lowMag);
    expect(highMag / lowMag).toBeLessThan(8);
  });

  it("repeated same-geography visits have smaller marginal impact", () => {
    const sim = createSimulation({
      world: miniElectorateWorld(),
      playerPoliticianId: "P1",
      seed: "P5-VISIT-DIM",
    });
    declarePlayerAssembly(sim);
    const first = expectOk(sim, {
      type: "CAMPAIGN_VISIT",
      campaignId: playerCampaign(sim).id,
      geographyKind: "constituency",
      geographyId: "C001",
    });
    const second = expectOk(sim, {
      type: "CAMPAIGN_VISIT",
      campaignId: playerCampaign(sim).id,
      geographyKind: "constituency",
      geographyId: "C001",
    });
    const m1 = Number(first.events.find((e) => e.type === "CAMPAIGN_VISIT")?.payload.effect);
    const m2 = Number(second.events.find((e) => e.type === "CAMPAIGN_VISIT")?.payload.effect);
    expect(m2).toBeLessThan(m1);
  });

  it("field organization increases local strength and a positive message does not lower own favorability", () => {
    const sim = createSimulation({ world: miniElectorateWorld(), playerPoliticianId: "P1" });
    declarePlayerAssembly(sim);
    const fav0 = candidateStandingOrDefault(sim.world(), sim.getSnapshot(), "P1").favorability;
    expectOk(sim, {
      type: "CAMPAIGN_ORGANIZE",
      campaignId: playerCampaign(sim).id,
      constituencyId: "C001",
    });
    expect(playerCampaign(sim).organizationByConstituency.C001 ?? 0).toBeGreaterThan(0);
    expectOk(sim, {
      type: "CAMPAIGN_MESSAGE",
      campaignId: playerCampaign(sim).id,
      issueId: "ISS_REFORM",
    });
    const fav1 = candidateStandingOrDefault(sim.world(), sim.getSnapshot(), "P1").favorability;
    expect(fav1).toBeGreaterThanOrEqual(fav0);
  });

  it("successful attacks lower the target more than backfires, and debate prep improves expected performance", () => {
    const world = miniElectorateWorld();
    labourNominationRule(world);
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-ATTACK" });
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "presidential_nomination",
      partyId: "PARTY_LAB",
    });
    const contestId = Object.keys(sim.getSnapshot().partyContests)[0]!;
    expectOk(sim, { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P1" });
    expectOk(sim, { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const camp = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (c) => c.politicianId === "P1" && c.status === "active",
    )!;
    const targetFav0 = candidateStandingOrDefault(world, sim.getSnapshot(), "P3").favorability;
    const attackerFav0 = candidateStandingOrDefault(world, sim.getSnapshot(), "P1").favorability;
    const attack = expectOk(sim, {
      type: "CAMPAIGN_ATTACK",
      campaignId: camp.id,
      targetPoliticianId: "P3",
    });
    const backfire =
      attack.events.find((e) => e.type === "CAMPAIGN_ATTACK")?.payload.backfire === true;
    const targetFav1 = candidateStandingOrDefault(world, sim.getSnapshot(), "P3").favorability;
    const attackerFav1 = candidateStandingOrDefault(world, sim.getSnapshot(), "P1").favorability;
    if (backfire) {
      expect(attackerFav1).toBeLessThan(attackerFav0);
    } else {
      expect(targetFav1).toBeLessThan(targetFav0);
    }

    const prepSim = createSimulation({
      world: miniElectorateWorld(),
      playerPoliticianId: "P1",
      seed: "P5-DEBATE",
    });
    declarePlayerAssembly(prepSim);
    expectOk(prepSim, { type: "CAMPAIGN_PREPARE_DEBATE", campaignId: playerCampaign(prepSim).id });
    expect(playerCampaign(prepSim).debatePrep).toBeGreaterThan(0);
    const preparedState = jsonClone(prepSim.getSnapshot());
    const unprepState = jsonClone(prepSim.getSnapshot());
    const campId = playerCampaign(prepSim).id;
    unprepState.campaignRuntime.campaigns[campId]!.debatePrep = 0;
    const rngA = restoreRngService(preparedState.rng);
    const rngB = restoreRngService(unprepState.rng);
    const heldA = holdDebate(prepSim.world(), preparedState, rngA, {
      campaignType: "assembly",
      contestId: null,
      electionId: null,
      participantIds: ["P1", "P2"],
      commandId: null,
    });
    const heldB = holdDebate(prepSim.world(), unprepState, rngB, {
      campaignType: "assembly",
      contestId: null,
      electionId: null,
      participantIds: ["P1", "P2"],
      commandId: null,
    });
    if ("error" in heldA || "error" in heldB) throw new Error("debate failed");
    expect(heldA.debate.scores.P1 ?? 0).toBeGreaterThan(heldB.debate.scores.P1 ?? 0);
  });

  it("rejects attacks and contrast ads against a politician outside the same race", () => {
    const world = miniElectorateWorld();
    labourNominationRule(world);
    nuNominationRule(world);
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-RACE" });
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "presidential_nomination",
      partyId: "PARTY_LAB",
    });
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "presidential_nomination",
      partyId: "PARTY_NU",
    });
    const lab = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.partyId === "PARTY_LAB",
    )!;
    const nu = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.partyId === "PARTY_NU",
    )!;
    expectOk(sim, {
      type: "DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: lab.id,
      politicianId: "P1",
    });
    expectOk(sim, {
      type: "DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: nu.id,
      politicianId: "P2",
    });
    const camp = Object.values(sim.getSnapshot().campaignRuntime.campaigns).find(
      (c) => c.politicianId === "P1",
    )!;
    const hash = sim.hashState();
    const rng = jsonClone(sim.getSnapshot().rng);
    expect(
      sim.executeCommand({
        type: "CAMPAIGN_ATTACK",
        campaignId: camp.id,
        targetPoliticianId: "P2",
      }).ok,
    ).toBe(false);
    expect(
      sim.executeCommand({
        type: "CAMPAIGN_ADVERTISE",
        campaignId: camp.id,
        spend: 1_000,
        messageType: "contrast",
        targetPoliticianId: "P2",
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().rng).toEqual(rng);
  });

  it("withdrawing stops further player campaign actions on that record", () => {
    const sim = createSimulation({ world: miniElectorateWorld(), playerPoliticianId: "P1" });
    declarePlayerAssembly(sim);
    const id = playerCampaign(sim).id;
    expectOk(sim, { type: "WITHDRAW_CAMPAIGN", campaignId: id });
    expect(sim.getSnapshot().campaignRuntime.campaigns[id]?.status).toBe("withdrawn");
    const hash = sim.hashState();
    expect(sim.executeCommand({ type: "CAMPAIGN_FUNDRAISE", campaignId: id }).ok).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("never autonomously campaigns for playerPoliticianId", () => {
    const sim = createSimulation({
      world: miniElectorateWorld(),
      playerPoliticianId: "P1",
      seed: "P5-PLAYER",
    });
    declarePlayerAssembly(sim);
    const before = sim
      .getSnapshot()
      .history.filter((e) =>
        [
          "FUNDRAISING_PUSH",
          "CAMPAIGN_VISIT",
          "AD_CAMPAIGN",
          "CAMPAIGN_ATTACK",
          "CAMPAIGN_WITHDRAWN",
        ].includes(e.type),
      ).length;
    expectOk(sim, { type: "ADVANCE_TURN" });
    const after = sim
      .getSnapshot()
      .history.filter(
        (e) =>
          e.actorIds.includes("P1") &&
          [
            "FUNDRAISING_PUSH",
            "CAMPAIGN_VISIT",
            "AD_CAMPAIGN",
            "CAMPAIGN_ATTACK",
            "CAMPAIGN_MESSAGE",
            "ENDORSEMENT_RECEIVED",
            "CAMPAIGN_WITHDRAWN",
            "DEBATE_PREPARED",
          ].includes(e.type),
      );
    expect(after.length).toBe(before);
  });

  it("NPC campaign options do not read another candidate's hidden profile", () => {
    const world = miniElectorateWorld();
    labourNominationRule(world);
    const sim = createSimulation({ world, playerPoliticianId: "P4", seed: "P5-HIDDEN" });
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "presidential_nomination",
      partyId: "PARTY_LAB",
    });
    const contestId = Object.keys(sim.getSnapshot().partyContests)[0]!;
    expectOk(sim, { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P1" });
    expectOk(sim, { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const snap = sim.getSnapshot();
    const camp = Object.values(snap.campaignRuntime.campaigns).find(
      (c) => c.politicianId === "P3",
    )!;
    const opts = campaignDecisionOptions(world, snap, camp);
    const ctx = buildDecisionActorContext(
      world,
      snap,
      camp.politicianId,
      opts.flatMap((o) => o.targetIds),
    );
    expect(ctx.profile.politicianId).toBe("P3");
    for (const targetId of opts.flatMap((o) => o.targetIds)) {
      expect(ctx.publicFactsById[targetId]?.id).toBe(targetId);
      expect("skills" in (ctx.publicFactsById[targetId] ?? {})).toBe(false);
    }
    const choiceWorld = jsonClone(world) as KernelWorld;
    choiceWorld.agentProfiles.P1 = {
      ...choiceWorld.agentProfiles.P1!,
      skills: {
        ...choiceWorld.agentProfiles.P1!.skills,
        fundraising: 1,
        campaigning: 1,
        media: 1,
      },
      ideology: {
        economic: 1,
        social: -1,
        authority: 1,
        green: -1,
        nationalism: 1,
        globalism: -1,
      },
    };
    const rngA = restoreRngService(snap.rng);
    const rngB = restoreRngService(snap.rng);
    const a = chooseCampaignAction(world, snap, camp, rngA);
    const b = chooseCampaignAction(choiceWorld, jsonClone(snap), camp, rngB);
    expect(a?.optionId).toBe(b?.optionId);
    expect(a).not.toBeNull();
  });

  it("materializes presidentialStatus standing once and does not reapply it", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const seeded = sim.getSnapshot().candidateStanding.P1;
    expect(seeded).toBeDefined();
    expect(seeded!.nameRecognition).toBeGreaterThan(0.5);
    expectOk(sim, {
      type: "DEV_SET_CANDIDATE_STANDING",
      politicianId: "P1",
      nameRecognition: 0.11,
      favorability: -0.2,
    });
    const later = candidateStandingOrDefault(world, sim.getSnapshot(), "P1");
    expect(later.nameRecognition).toBeCloseTo(0.11);
    expect(later.favorability).toBeCloseTo(-0.2);
    expect(sim.getSnapshot().candidateStanding.P2).toBeUndefined();
    const unseeded = candidateStandingOrDefault(world, sim.getSnapshot(), "P2");
    expect(unseeded.nameRecognition).toBeLessThan(0.5);
  });

  it("save/restore mid-campaign continues identically, including v4→v5 migration", () => {
    const world = miniElectorateWorld();
    const a = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-SAVE" });
    declarePlayerAssembly(a);
    expectOk(a, { type: "CAMPAIGN_FUNDRAISE", campaignId: playerCampaign(a).id });
    const mid = a.serializeSave();
    const b = restoreSimulation(mid, world);
    expect(b.hashState()).toBe(a.hashState());
    expectOk(a, {
      type: "CAMPAIGN_VISIT",
      campaignId: playerCampaign(a).id,
      geographyKind: "national",
    });
    expectOk(b, {
      type: "CAMPAIGN_VISIT",
      campaignId: playerCampaign(b).id,
      geographyKind: "national",
    });
    expect(a.hashState()).toBe(b.hashState());

    const fresh = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-SAVE" });
    const v4 = jsonClone(fresh.serializeSave()) as unknown as Record<string, unknown>;
    v4.schemaVersion = 4;
    const sim = v4.simulation as Record<string, unknown>;
    sim.schemaVersion = 4;
    delete sim.campaignRuntime;
    const counters = sim.counters as Record<string, unknown>;
    delete counters.nextCampaignId;
    delete counters.nextDebateId;
    const parsed = parseSaveFile(v4, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(5);
    expect(parsed.save.simulation.campaignRuntime.campaigns).toEqual({});
    expect(parsed.save.simulation.counters.nextCampaignId).toBe(1);
  });
});

describe("Phase 5 nomination poll isolation", () => {
  it("uses only the same contest's polls for nomination electability", () => {
    const world = miniElectorateWorld();
    labourNominationRule(world);
    nuNominationRule(world);
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const state = jsonClone(sim.getSnapshot());
    const poll = (
      id: string,
      contestId: string,
      shares: Array<{ politicianId: string; share: number }>,
    ) => {
      state.polls[id] = {
        id,
        pollsterId: "POLL_TEST",
        electionId: null,
        geographyKind: "national",
        constituencyId: null,
        fieldStart: state.currentDate,
        fieldEnd: state.currentDate,
        publicationDate: state.currentDate,
        sampleSize: 500,
        method: "online_panel",
        candidateSnapshot: shares.map((s) => ({
          politicianId: s.politicianId,
          partyId: state.politicians[s.politicianId]?.partyId ?? null,
        })),
        firstPreference: shares.map((s) => ({
          politicianId: s.politicianId,
          partyId: state.politicians[s.politicianId]?.partyId ?? null,
          share: s.share,
        })),
        marginOfError: 0.03,
        houseEffectApplied: {},
        metadata: { contestId, quality: 0.8, purpose: "nomination" },
      };
    };
    poll("POLL_A", "CONTEST_A", [
      { politicianId: "P1", share: 0.8 },
      { politicianId: "P3", share: 0.2 },
    ]);
    poll("POLL_B", "CONTEST_B", [
      { politicianId: "P1", share: 0.05 },
      { politicianId: "P2", share: 0.95 },
    ]);
    expect(contestPollAverage(state, state.currentDate, "CONTEST_A").P1).toBeCloseTo(0.8, 5);
    expect(contestPollAverage(state, state.currentDate, "CONTEST_B").P1).toBeCloseTo(0.05, 5);
    const a = publicElectabilitySignal(world, state, "P1", "presidential_nomination", "CONTEST_A");
    const b = publicElectabilitySignal(world, state, "P1", "presidential_nomination", "CONTEST_B");
    expect(a).toBeGreaterThan(b);
  });
});

describe("Phase 5 rejected commands leave RNG unchanged", () => {
  it("does not consume RNG when fundraising on an unknown campaign", () => {
    const sim = createSimulation({ world: miniElectorateWorld(), playerPoliticianId: "P1" });
    const hash = sim.hashState();
    expect(sim.executeCommand({ type: "CAMPAIGN_FUNDRAISE", campaignId: "CAMP000001" }).ok).toBe(
      false,
    );
    expect(sim.hashState()).toBe(hash);
  });

  it("direct fundraise is deterministic for the campaigns stream", () => {
    const world = miniElectorateWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P5-DET" });
    declarePlayerAssembly(sim);
    const state = jsonClone(sim.getSnapshot());
    const rng = restoreRngService(state.rng);
    const out = campaignFundraise(world, state, rng, { campaignId: playerCampaign(sim).id }, null);
    if ("error" in out) throw new Error(out.error.message);
    const state2 = jsonClone(sim.getSnapshot());
    const rng2 = restoreRngService(state2.rng);
    const out2 = campaignFundraise(
      world,
      state2,
      rng2,
      { campaignId: playerCampaign(sim).id },
      null,
    );
    if ("error" in out2) throw new Error(out2.error.message);
    expect(out.raised).toBe(out2.raised);
  });
});
