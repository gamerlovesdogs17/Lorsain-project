import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation, type Simulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { SAVE_SCHEMA_VERSION, type Command, type KernelWorld } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { kernelOffice } from "./synthetic-world.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "./terena-party-input.js";
import { occupyingTerms, officesOfKind, endTerm } from "./offices.js";
import { parseSaveFile } from "./save.js";
import {
  currentAssemblyMemberIds,
  currentPresidentId,
  currentPresidentialAuthorityId,
} from "./legislature/state.js";
import { collectPlayerActionableDecisions } from "./player-decisions.js";
import {
  availableImpeachmentBases,
  confirmationYesNeeded,
  createConstitutionalGrounds,
  currentCourtJudgeIds,
  deriveCourtBench,
  emptyConstitutionalRuntime,
  impeachmentYesNeeded,
  judicialEligibilityError,
  recallReferralYesNeeded,
  recordConfirmationVote,
  recordImpeachmentVote,
  recordJudicialDecision,
  recordRecallReferralVote,
  tallyJudicialDisposition,
  resolveNationalRecall,
  chooseConfirmationVote,
  chooseImpeachmentVote,
  materializeLegalCandidates,
} from "./courts/index.js";
import type { ImpeachmentGrounds, JudicialVoteChoice } from "./courts/types.js";
import { createRngService } from "./rng.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

function withImpeachmentBasis(
  sim: Simulation,
  world: KernelWorld,
  args?: {
    grounds?: ImpeachmentGrounds;
    evidenceStrength?: number;
    severity?: number;
    public?: boolean;
    targetId?: string;
  },
): { sim: Simulation; basisId: string } {
  const snap = jsonClone(sim.getSnapshot());
  const rec = createConstitutionalGrounds(snap, {
    targetPoliticianId: args?.targetId ?? currentPresidentialAuthorityId(world, snap) ?? "P1",
    grounds: args?.grounds ?? "serious_constitutional_abuse",
    sourceKind: "synthetic_test",
    sourceId: "SYNTHETIC-BASIS",
    evidenceStrength: args?.evidenceStrength ?? 0.72,
    severity: args?.severity ?? 0.66,
    ...(args?.public === false ? { public: false } : {}),
  });
  return {
    sim: restoreSimulation(
      {
        schemaVersion: 8,
        contentVersion: snap.contentVersion,
        scenarioId: snap.scenarioId,
        simulation: snap,
      },
      world,
    ),
    basisId: rec.id,
  };
}

function advance(sim: Simulation, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (r.interrupt) {
      if (r.interrupt.requiresResolution) {
        throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
      }
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
  }
}

function courtHarness(): KernelWorld {
  const world = legislativeHarnessWorld("COURT-HARNESS");
  const politicians = [...world.politicians];
  const terms = [...world.startingTerms];
  for (let i = 0; i < 9; i++) {
    const officeId = `OFFICE_COURT_SEAT_${i}`;
    const holderId = `J${String(i + 1).padStart(2, "0")}`;
    world.offices[officeId] = kernelOffice({
      id: officeId,
      kind: "constitutional_court_justice",
      title: i === 0 ? "Chief Justice" : `Justice ${i}`,
      seatIndex: i,
      noPartyMembershipWhileServing: true,
      incompatibleWithKinds: ["president", "assembly_member", "minister", "military"],
    });
    politicians.push({ id: holderId, alive: true, retired: false, partyId: null, factionId: null });
    terms.push({
      officeId,
      holderId,
      startDate: "2016-01-01",
      startKnown: true,
      endDate: `203${i}-06-01`,
      accessionReason: "appointment",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
    world.agentProfiles[holderId] = syntheticAgentProfile(holderId, {
      roleTypes: ["constitutional_court_justice"],
      ideology: {
        economic: i < 4 ? 0.55 : i > 5 ? -0.55 : 0.05,
        social: i < 4 ? 0.4 : -0.2,
        authority: i < 5 ? 0.3 : -0.25,
        green: 0,
        nationalism: 0,
        globalism: 0,
      },
      traits: {
        ambition: 0.3,
        integrity: 0.7,
        ego: 0.4,
        riskTolerance: 0.3,
        sociability: 0.4,
        pragmatism: 0.45 + i * 0.03,
        institutionalism: i === 8 ? 0.92 : 0.55,
        partyLoyalty: 0.15,
        factionLoyalty: 0.1,
      },
    });
  }
  for (const id of ["NOM1", "NOM2", "MIL1"]) {
    politicians.push({
      id,
      alive: true,
      retired: false,
      partyId: id === "NOM1" ? null : "PARTY_A",
      factionId: null,
    });
    world.agentProfiles[id] = syntheticAgentProfile(id, {
      roleTypes: id === "MIL1" ? ["military"] : ["senior_lawyer"],
    });
  }
  politicians.push({ id: "CIT1", alive: true, retired: false, partyId: null, factionId: null });
  world.agentProfiles.CIT1 = syntheticAgentProfile("CIT1", { roleTypes: ["private_citizen"] });
  world.agentProfiles.CIT1.skills.legislation = 0.2;
  world.agentProfiles.CIT1.skills.negotiation = 0.2;
  world.agentProfiles.CIT1.traits.institutionalism = 0.2;
  world.offices.OFFICE_MIL = kernelOffice({
    id: "OFFICE_MIL",
    kind: "military",
    title: "General",
    incompatibleWithKinds: ["constitutional_court_justice"],
  });
  terms.push({
    officeId: "OFFICE_MIL",
    holderId: "MIL1",
    startDate: null,
    startKnown: false,
    endDate: null,
    accessionReason: "scenario_start",
    status: "active",
    holdingKind: "substantive",
    sourceElectionId: null,
    endedDate: null,
    endedReason: null,
  });
  world.politicians = politicians;
  world.startingTerms = terms;
  world.successionOfficeIds = ["OFFICE_SPEAKER"];
  for (const profile of Object.values(world.agentProfiles)) {
    const salience = { ...profile.issueSalience };
    for (const issueId of world.issueIds) {
      if (typeof salience[issueId] !== "number") salience[issueId] = 0.4;
    }
    profile.issueSalience = salience;
  }
  return world;
}

function loadTerenaWorld(): KernelWorld {
  const bundle = loadContentBundleFromRepo(repoRoot);
  const input = {
    contentVersion: bundle.manifest.content_version,
    scenario: jsonClone(bundle.content.scenario),
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    offices: bundle.content.terena_offices.offices,
    constitution: jsonClone(bundle.content.terena_constitution),
    administrations: bundle.content.terena_presidential_administrations.administrations,
    ...terenaPartyFields({
      parties: bundle.content.terena_parties.parties,
      nominationRules: bundle.content.terena_nomination_rules.rules,
      provinceFeatures: bundle.content.terena_provinces.features,
      constituencyFeatures: bundle.content.terena_constituencies.features,
    }),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle),
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

describe("Phase 8 courts kernel", () => {
  it("uses schemaVersion 8 and empty constitutional runtime at new game", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-EMPTY" });
    const snap = sim.getSnapshot();
    expect(snap.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(snap.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(snap.constitutionalRuntime).toEqual(emptyConstitutionalRuntime());
    expect(deriveCourtBench(world, snap)).toHaveLength(9);
    expect(deriveCourtBench(world, snap).every((s) => s.holderId != null)).toBe(true);
  });

  it("migrates v7 saves to empty court runtime without fabricating cases", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-MIG" });
    const save = sim.serializeSave() as unknown as Record<string, unknown>;
    save.schemaVersion = 7;
    const simRaw = save.simulation as Record<string, unknown>;
    simRaw.schemaVersion = 7;
    delete simRaw.constitutionalRuntime;
    const counters = simRaw.counters as Record<string, unknown>;
    delete counters.nextCaseId;
    delete counters.nextCourtNominationId;
    delete counters.nextCourtDecisionId;
    delete counters.nextImpeachmentId;
    delete counters.nextRecallId;
    delete counters.nextConstitutionalGroundsId;
    const parsed = parseSaveFile(save);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(parsed.save.simulation.constitutionalRuntime.courtCases).toEqual({});
    expect(
      restoreSimulation(parsed.save, world).getSnapshot().constitutionalRuntime.courtCases,
    ).toEqual({});
  });

  it("opens a vacancy, lets a player President nominate, and confirms or rejects", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-NOM" });
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_8", reason: "test" });
    advance(sim, 1);
    const awaiting = Object.values(sim.getSnapshot().constitutionalRuntime.nominations).find(
      (n) => n.status === "awaiting_nomination",
    );
    expect(awaiting).toBeTruthy();
    expect(awaiting?.nomineeId).toBeNull();
    expectOk(sim, {
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_8",
      nomineeId: "NOM1",
    });
    expect(sim.getSnapshot().history.some((e) => e.type === "JUDGE_NOMINATED")).toBe(true);
    const nom = Object.values(sim.getSnapshot().constitutionalRuntime.nominations).find(
      (n) => n.status === "pending_confirmation",
    )!;
    const mps = currentAssemblyMemberIds(world, sim.getSnapshot());
    const needed = confirmationYesNeeded(world);
    const failVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) failVotes[id] = i < needed - 1 ? "yes" : "no";
    const failed = recordConfirmationVote(
      world,
      jsonClone(sim.getSnapshot()),
      { nominationId: nom.id, votes: failVotes },
      null,
    );
    expect("error" in failed).toBe(false);
    if (!("error" in failed)) {
      expect(failed.events.some((e) => e.type === "JUDGE_REJECTED")).toBe(true);
    }
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) passVotes[id] = i < needed ? "yes" : "no";
    const passed = recordConfirmationVote(
      world,
      jsonClone(sim.getSnapshot()),
      { nominationId: nom.id, votes: passVotes },
      null,
    );
    expect("error" in passed).toBe(false);
    if (!("error" in passed)) {
      expect(passed.events.some((e) => e.type === "JUDGE_CONFIRMED")).toBe(true);
    }
  });

  it("rejects military and already-serving judges as nominees", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-ELIG" });
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_7", reason: "test" });
    advance(sim, 1);
    const mil = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_7",
      nomineeId: "MIL1",
    });
    expect(mil.ok).toBe(false);
    const sitting = currentCourtJudgeIds(world, sim.getSnapshot())[0]!;
    const dup = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_7",
      nomineeId: sitting,
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("ALREADY_JUDGE");
  });

  it("rejects a private citizen without a qualifying public legal record", () => {
    const world = courtHarness();
    world.agentProfiles.CIT1!.skills.legislation = 1;
    world.agentProfiles.CIT1!.skills.negotiation = 1;
    world.agentProfiles.CIT1!.traits.institutionalism = 1;
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-LEGAL-BAR" });
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_7", reason: "test" });
    advance(sim, 1);
    const result = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_7",
      nomineeId: "CIT1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LEGAL_QUALIFICATION_REQUIRED");
  });

  it("materializes named legal professionals instead of weakening the qualification bar", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P8-LEGAL-RENEWAL" });
    const state = jsonClone(sim.getSnapshot());
    const generated = materializeLegalCandidates(world, state, 8);
    expect(Object.keys(state.constitutionalRuntime.legalCareerPool).length).toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThan(0);
    for (const id of generated) {
      expect(state.politicians[id]?.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(state.politicians[id]?.description).not.toMatch(/moderate on|public-law record/i);
      expect(judicialEligibilityError(world, state, id, officesOfKind(world, "constitutional_court_justice")[0]!.id)).toBeNull();
    }
  });

  it("rejects former justices when court terms are nonrenewable", () => {
    const world = courtHarness();
    expect(world.courtConstitution.renewable).toBe(false);
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-NONREN" });
    const former = currentCourtJudgeIds(world, sim.getSnapshot()).find((id) => id === "J09")!;
    expect(former).toBe("J09");
    expectOk(sim, {
      type: "DEV_VACATE_OFFICE",
      officeId: "OFFICE_COURT_SEAT_8",
      reason: "term_end",
    });
    const endedTerms = Object.values(sim.getSnapshot().officeTerms).filter(
      (t) => t.holderId === former && t.status === "ended",
    );
    expect(endedTerms.length).toBeGreaterThan(0);
    advance(sim, 1);
    const sameSeat = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_8",
      nomineeId: former,
    });
    expect(sameSeat.ok).toBe(false);
    if (!sameSeat.ok) expect(sameSeat.error.code).toBe("COURT_TERM_NONRENEWABLE");
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_4", reason: "test" });
    advance(sim, 1);
    const otherSeat = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_4",
      nomineeId: former,
    });
    expect(otherSeat.ok).toBe(false);
    if (!otherSeat.ok) expect(otherSeat.error.code).toBe("COURT_TERM_NONRENEWABLE");
    expect(
      judicialEligibilityError(world, sim.getSnapshot(), "NOM1", "OFFICE_COURT_SEAT_8"),
    ).toBeNull();
    expectOk(sim, {
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_8",
      nomineeId: "NOM1",
    });
  });

  it("allows a former justice only when courtConstitution.renewable is true", () => {
    const world = courtHarness();
    world.courtConstitution = { ...world.courtConstitution, renewable: true };
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-RENEW" });
    expectOk(sim, {
      type: "DEV_VACATE_OFFICE",
      officeId: "OFFICE_COURT_SEAT_8",
      reason: "term_end",
    });
    advance(sim, 1);
    expectOk(sim, {
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: "OFFICE_COURT_SEAT_8",
      nomineeId: "J09",
    });
  });

  it("does not auto-nominate for a player President", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "P1", seed: "P8-AUTON" });
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_6", reason: "test" });
    const before = sim.hashState();
    advance(sim, 1);
    const noms = Object.values(sim.getSnapshot().constitutionalRuntime.nominations);
    expect(noms.every((n) => n.nomineeId == null)).toBe(true);
    expect(sim.hashState()).not.toBe(before);
  });

  it("reviews laws and regulations without deleting history", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-LAW" });
    expectOk(sim, {
      type: "INTRODUCE_BILL",
      title: "Rail Act",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.8, fiscalImpact: null }],
    });
    const withLaw = jsonClone(sim.getSnapshot());
    withLaw.legislatureRuntime.enactedLaws.LAW000001 = {
      id: "LAW000001",
      billId: "BILL000001",
      title: "Rail Act",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.8, fiscalImpact: null }],
      amendmentIds: [],
      floorVoteId: null,
      repassageVoteId: null,
      presidentialDisposition: "signed",
      enactedDate: "2020-01-01",
      sponsorId: "MP02",
      eventIds: [],
      operative: true,
      invalidatedByDecisionId: null,
      metadata: {},
    };
    withLaw.counters.nextLawId = Math.max(withLaw.counters.nextLawId, 2);
    const live = restoreSimulation(
      {
        schemaVersion: 8,
        contentVersion: withLaw.contentVersion,
        scenarioId: withLaw.scenarioId,
        simulation: withLaw,
      },
      world,
    );
    expectOk(live, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedKind: "law",
      challengedId: "LAW000001",
      constitutionalQuestion: "Whether the Rail Act is constitutionally valid",
      constitutionalRule: "law_review",
      meritsLean: 0.8,
    });
    const caseId = Object.keys(live.getSnapshot().constitutionalRuntime.courtCases)[0]!;
    const judges = currentCourtJudgeIds(world, live.getSnapshot());
    const votes: Record<string, JudicialVoteChoice> = {};
    for (const [i, id] of judges.entries()) votes[id] = i < 5 ? "invalidate" : "uphold";
    const out = recordJudicialDecision(
      world,
      jsonClone(live.getSnapshot()),
      { caseId, votes },
      null,
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.events.some((e) => e.type === "COURT_DECISION")).toBe(true);
    expect(out.events.some((e) => e.type === "LAW_INVALIDATED")).toBe(true);
    const law = jsonClone(live.getSnapshot());
    const applied = recordJudicialDecision(world, law, { caseId, votes }, null);
    expect("error" in applied).toBe(false);
    const opinion = Object.values(law.constitutionalRuntime.courtDecisions)[0]!;
    expect(typeof opinion.metadata.majorityAuthorId).toBe("string");
    expect(typeof opinion.metadata.holding).toBe("string");
    expect(typeof opinion.metadata.majorityRationale).toBe("string");
    expect(opinion.metadata.constitutionalProvision).toBe("law review");
    expect(law.legislatureRuntime.enactedLaws.LAW000001?.operative).toBe(false);
    expect(law.legislatureRuntime.enactedLaws.LAW000001).toBeTruthy();
    const tallied = tallyJudicialDisposition(votes);
    expect(tallied.disposition).toBe("INVALIDATE");
    expect(`${tallied.invalidate}-${tallied.uphold}`).toBe("5-4");
  });

  it("can produce a 9-0 uphold and a cross-ideological vote", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-90" });
    expectOk(sim, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedKind: "law",
      challengedId: "none",
      constitutionalQuestion: "Whether a modest clerical statute is valid",
      constitutionalRule: "law_review",
      meritsLean: -0.85,
    });
    advance(sim, 2);
    const decided = Object.values(sim.getSnapshot().constitutionalRuntime.courtDecisions)[0];
    expect(decided).toBeTruthy();
    expect(decided?.disposition).toBe("UPHOLD");
    const votes = Object.values(decided?.votes ?? {});
    expect(votes.filter((v) => v === "uphold").length).toBeGreaterThanOrEqual(5);
  });

  it("handles emergency review, impeachment thresholds, recall, and succession", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-FLOW" });
    const snap = jsonClone(sim.getSnapshot());
    snap.counters.nextEmergencyId = Math.max(snap.counters.nextEmergencyId, 2);
    snap.executiveRuntime.emergencies.EMG000001 = {
      id: "EMG000001",
      declaredBy: "P1",
      declaredDate: snap.currentDate,
      expiresDate: "2020-01-15",
      status: "active",
      extensionCount: 0,
      metadata: { courtReviewRequired: true },
    };
    const restored = restoreSimulation(
      {
        schemaVersion: 8,
        contentVersion: snap.contentVersion,
        scenarioId: snap.scenarioId,
        simulation: snap,
      },
      world,
    );
    advance(restored, 1);
    const emergencyReview = Object.values(
      restored.getSnapshot().constitutionalRuntime.courtCases,
    ).find((c) => c.caseType === "EMERGENCY_REVIEW");
    expect(emergencyReview).toBeTruthy();
    expect(emergencyReview?.petitionerId).not.toBe(restored.getSnapshot().playerPoliticianId);

    const seeded = withImpeachmentBasis(sim, world);
    expectOk(seeded.sim, {
      type: "INTRODUCE_IMPEACHMENT",
      basisId: seeded.basisId,
    });
    expect(seeded.sim.getSnapshot().history.some((e) => e.type === "IMPEACHMENT_INTRODUCED")).toBe(
      true,
    );
    const proceeding = Object.values(
      seeded.sim.getSnapshot().constitutionalRuntime.impeachments,
    )[0]!;
    const mps = currentAssemblyMemberIds(world, seeded.sim.getSnapshot());
    const needed = impeachmentYesNeeded(world);
    const failVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) failVotes[id] = i < needed - 1 ? "yes" : "no";
    const failed = recordImpeachmentVote(
      world,
      jsonClone(seeded.sim.getSnapshot()),
      { proceedingId: proceeding.id, votes: failVotes },
      null,
    );
    expect("error" in failed).toBe(false);
    if (!("error" in failed)) {
      expect(failed.events.some((e) => e.type === "IMPEACHMENT_REJECTED")).toBe(true);
    }
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) passVotes[id] = i < needed ? "yes" : "no";
    const passed = recordImpeachmentVote(
      world,
      jsonClone(seeded.sim.getSnapshot()),
      { proceedingId: proceeding.id, votes: passVotes },
      null,
    );
    expect("error" in passed).toBe(false);
    if (!("error" in passed)) {
      expect(passed.events.some((e) => e.type === "PRESIDENT_IMPEACHED")).toBe(true);
    }

    expectOk(seeded.sim, { type: "INTRODUCE_RECALL_REFERRAL" });
    const recall = Object.values(seeded.sim.getSnapshot().constitutionalRuntime.recalls)[0]!;
    const recNeed = recallReferralYesNeeded(world);
    const recFail: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) recFail[id] = i < recNeed - 1 ? "yes" : "no";
    const recFailed = recordRecallReferralVote(
      world,
      jsonClone(seeded.sim.getSnapshot()),
      { proceedingId: recall.id, votes: recFail },
      null,
    );
    expect("error" in recFailed).toBe(false);
    const recPass: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) recPass[id] = i < recNeed ? "yes" : "no";
    const recPassed = recordRecallReferralVote(
      world,
      jsonClone(seeded.sim.getSnapshot()),
      { proceedingId: recall.id, votes: recPass },
      null,
    );
    expect("error" in recPassed).toBe(false);
    if (!("error" in recPassed)) {
      expect(recPassed.events.some((e) => e.type === "RECALL_REFERRED")).toBe(true);
    }
  });

  it("never auto-casts player confirmation, impeachment, recall, or judicial votes", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-PLAYER" });
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: "OFFICE_COURT_SEAT_5", reason: "test" });
    advance(sim, 1);
    const nom = Object.values(sim.getSnapshot().constitutionalRuntime.nominations).find(
      (n) => n.status === "pending_confirmation" || n.status === "awaiting_nomination",
    );
    if (nom?.status === "pending_confirmation") {
      const decisions = collectPlayerActionableDecisions(world, sim.getSnapshot());
      expect(decisions.some((d) => d.kind === "confirmation_vote")).toBe(true);
      advance(sim, 1);
      const after = sim.getSnapshot().constitutionalRuntime.nominations[nom.id];
      if (after && (after.status === "confirmed" || after.status === "rejected")) {
        expect(after.votes.MP02).toBe("abstain");
      }
    }
    expectOk(sim, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedId: "none",
      constitutionalQuestion: "Player judge case",
      constitutionalRule: "law_review",
      meritsLean: 0,
    });
    const judgeSim = createSimulation({ world, playerPoliticianId: "J01", seed: "P8-JUDGE" });
    expectOk(judgeSim, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedId: "none",
      constitutionalQuestion: "Player must vote",
      constitutionalRule: "law_review",
      meritsLean: 0.2,
    });
    const caseId = Object.keys(judgeSim.getSnapshot().constitutionalRuntime.courtCases)[0]!;
    expect(
      collectPlayerActionableDecisions(world, judgeSim.getSnapshot()).some(
        (d) => d.kind === "judicial_vote" && d.caseId === caseId,
      ),
    ).toBe(true);
    advance(judgeSim, 2);
    const decided = Object.values(judgeSim.getSnapshot().constitutionalRuntime.courtDecisions)[0];
    expect(decided?.votes.J01).toBe("nonparticipation");
  });

  it("reproduces the same court continuation from a save", () => {
    const world = courtHarness();
    const a = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-DET" });
    const b = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-DET" });
    const cmd: Command = {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedId: "x",
      constitutionalQuestion: "determinism",
      constitutionalRule: "law_review",
      meritsLean: 0.1,
    };
    expectOk(a, cmd);
    expectOk(b, cmd);
    expect(b.hashState()).toBe(a.hashState());
    const save = a.serializeSave();
    const restored = restoreSimulation(save, world);
    expect(restored.hashState()).toBe(a.hashState());
    advance(a, 2);
    advance(restored, 2);
    expect(restored.hashState()).toBe(a.hashState());
    const c = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-DET" });
    expectOk(c, cmd);
    advance(c, 2);
    expect(c.hashState()).toBe(a.hashState());
  });

  it("reviews a regulation independently of Assembly annulment", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-REG" });
    const withReg = jsonClone(sim.getSnapshot());
    withReg.executiveRuntime.regulations.REG000001 = {
      id: "REG000001",
      issuerId: "P1",
      date: withReg.currentDate,
      ministryOfficeId: "OFFICE_PRESIDENT",
      policyItems: [{ issueId: "ISS_TAX", direction: 1, magnitude: 0.7, fiscalImpact: null }],
      major: true,
      reviewDeadline: "2020-03-01",
      status: "active",
      metadata: {},
    };
    withReg.counters.nextRegulationId = Math.max(withReg.counters.nextRegulationId, 2);
    const live = restoreSimulation(
      {
        schemaVersion: 8,
        contentVersion: withReg.contentVersion,
        scenarioId: withReg.scenarioId,
        simulation: withReg,
      },
      world,
    );
    expectOk(live, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "REGULATION_REVIEW",
      challengedKind: "regulation",
      challengedId: "REG000001",
      constitutionalQuestion: "Whether the regulation exceeds executive authority",
      constitutionalRule: "regulation_review",
      meritsLean: 0.6,
    });
    const caseId = Object.keys(live.getSnapshot().constitutionalRuntime.courtCases)[0]!;
    const judges = currentCourtJudgeIds(world, live.getSnapshot());
    const votes: Record<string, JudicialVoteChoice> = {};
    for (const [i, id] of judges.entries()) votes[id] = i < 5 ? "invalidate" : "uphold";
    const applied = jsonClone(live.getSnapshot());
    const out = recordJudicialDecision(world, applied, { caseId, votes }, null);
    expect("error" in out).toBe(false);
    expect(applied.executiveRuntime.regulations.REG000001?.status).toBe("invalidated");
    expect(applied.executiveRuntime.regulations.REG000001).toBeTruthy();
  });

  it("lets the Court sustain or reject presidential removal after 280 yes", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-IMP-COURT" });
    const seeded = withImpeachmentBasis(sim, world);
    expectOk(seeded.sim, {
      type: "INTRODUCE_IMPEACHMENT",
      basisId: seeded.basisId,
    });
    const proceeding = Object.values(
      seeded.sim.getSnapshot().constitutionalRuntime.impeachments,
    )[0]!;
    const mps = currentAssemblyMemberIds(world, seeded.sim.getSnapshot());
    const needed = impeachmentYesNeeded(world);
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) passVotes[id] = i < needed ? "yes" : "no";
    const passed = recordImpeachmentVote(
      world,
      jsonClone(seeded.sim.getSnapshot()),
      { proceedingId: proceeding.id, votes: passVotes },
      null,
    );
    expect("error" in passed).toBe(false);
    if ("error" in passed) return;
    const afterPass = jsonClone(seeded.sim.getSnapshot());
    const livePass = recordImpeachmentVote(
      world,
      afterPass,
      { proceedingId: proceeding.id, votes: passVotes },
      "CMD",
    );
    expect("error" in livePass).toBe(false);
    const caseId = afterPass.constitutionalRuntime.impeachments[proceeding.id]?.caseId;
    expect(caseId).toBeTruthy();
    const judges = currentCourtJudgeIds(world, afterPass);
    const upholdVotes: Record<string, JudicialVoteChoice> = {};
    for (const id of judges) upholdVotes[id] = "uphold";
    const rejectRemoval = jsonClone(afterPass);
    const rejected = recordJudicialDecision(
      world,
      rejectRemoval,
      { caseId: caseId!, votes: upholdVotes },
      "CMD",
    );
    expect("error" in rejected).toBe(false);
    expect(rejectRemoval.constitutionalRuntime.impeachments[proceeding.id]?.status).toBe(
      "rejected_by_court",
    );
    expect(currentPresidentId(world, rejectRemoval)).toBe("P1");
    const invalidateVotes: Record<string, JudicialVoteChoice> = {};
    for (const [i, id] of judges.entries()) invalidateVotes[id] = i < 5 ? "invalidate" : "uphold";
    const removeState = jsonClone(afterPass);
    const removed = recordJudicialDecision(
      world,
      removeState,
      { caseId: caseId!, votes: invalidateVotes },
      "CMD",
    );
    expect("error" in removed).toBe(false);
    if (!("error" in removed)) {
      expect(removed.events.some((e) => e.type === "PRESIDENT_REMOVED")).toBe(true);
    }
    expect(currentPresidentId(world, removeState)).not.toBe("P1");
    expect(currentPresidentialAuthorityId(world, removeState)).toBe("MP01");
  });

  it("schedules a national recall and uses existing succession on success", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-RECALL-NAT" });
    expectOk(sim, { type: "INTRODUCE_RECALL_REFERRAL" });
    const recall = Object.values(sim.getSnapshot().constitutionalRuntime.recalls)[0]!;
    const mps = currentAssemblyMemberIds(world, sim.getSnapshot());
    const recNeed = recallReferralYesNeeded(world);
    const recPass: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) recPass[id] = i < recNeed ? "yes" : "no";
    const referred = jsonClone(sim.getSnapshot());
    const recOut = recordRecallReferralVote(
      world,
      referred,
      { proceedingId: recall.id, votes: recPass },
      "CMD",
    );
    expect("error" in recOut).toBe(false);
    const rec = referred.constitutionalRuntime.recalls[recall.id]!;
    expect(rec.status).toBe("vote_scheduled");
    expect(rec.nationalVoteDate).toBeTruthy();
    rec.nationalVoteDate = referred.currentDate;
    referred.candidateStanding.P1 = {
      politicianId: "P1",
      nameRecognition: 0.8,
      favorability: 0.9,
      enthusiasm: 0.4,
      momentum: 0,
    };
    const failed = jsonClone(referred);
    const failOut = resolveNationalRecall(world, failed, recall.id, "CMD");
    expect("error" in failOut).toBe(false);
    if (!("error" in failOut)) {
      expect(failOut.events.some((e) => e.type === "RECALL_FAILED")).toBe(true);
    }
    expect(currentPresidentId(world, failed)).toBe("P1");
    referred.candidateStanding.P1 = {
      politicianId: "P1",
      nameRecognition: 0.8,
      favorability: -0.9,
      enthusiasm: 0.1,
      momentum: 0,
    };
    const succeeded = jsonClone(referred);
    const winOut = resolveNationalRecall(world, succeeded, recall.id, "CMD");
    expect("error" in winOut).toBe(false);
    if (!("error" in winOut)) {
      expect(winOut.events.some((e) => e.type === "RECALL_SUCCEEDED")).toBe(true);
    }
    expect(currentPresidentId(world, succeeded)).not.toBe("P1");
    expect(currentPresidentialAuthorityId(world, succeeded)).toBe("MP01");
  });
});

describe("Phase 8 authorized-assembly thresholds", () => {
  it("lets a legally qualified nominee assemble the required cross-party confirmation vote", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P8-CONFIRM-VIABLE" });
    const state = jsonClone(sim.getSnapshot());
    const seat = officesOfKind(world, "constitutional_court_justice")[0]!;
    const sitting = occupyingTerms(state, seat.id)[0];
    if (sitting) endTerm(state, sitting.id, state.currentDate, "test");
    materializeLegalCandidates(world, state);
    const nomineeId = Object.keys(state.politicians)
      .sort()
      .find((id) => id !== state.playerPoliticianId && !judicialEligibilityError(world, state, id, seat.id));
    expect(nomineeId).toBeTruthy();
    if (!nomineeId) return;
    const rng = createRngService("P8-CONFIRM-VIABLE");
    const votes = currentAssemblyMemberIds(world, state).map((id) =>
      chooseConfirmationVote(world, state, id, nomineeId, rng),
    );
    expect(votes.filter((vote) => vote === "yes").length).toBeGreaterThanOrEqual(
      confirmationYesNeeded(world),
    );
  });

  it("keeps 252/280 thresholds with 419 sitting MPs", () => {
    const world = loadTerenaWorld();
    expect(world.courtConstitution.confirmationFraction).toBe(0.6);
    expect(world.courtConstitution.renewable).toBe(false);
    expect(confirmationYesNeeded(world)).toBe(252);
    expect(recallReferralYesNeeded(world)).toBe(252);
    expect(impeachmentYesNeeded(world)).toBe(280);
    expect(world.contentVersion).toBe("0.3.1-predev");
    const sim = createSimulation({ world, playerPoliticianId: "NPC002", seed: "P8-252" });
    const state = jsonClone(sim.getSnapshot());
    const assemblyOffices = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
    const mps = currentAssemblyMemberIds(world, state);
    expect(mps).toHaveLength(420);
    const vacateId = mps.find((id) => id !== "NPC002")!;
    const term = Object.values(state.officeTerms).find(
      (t) =>
        t.holderId === vacateId &&
        assemblyOffices.has(t.officeId) &&
        (t.status === "active" || t.status === "suspended"),
    )!;
    endTerm(state, term.id, state.currentDate, "test");
    const remaining = currentAssemblyMemberIds(world, state);
    expect(remaining).toHaveLength(419);
    expect(deriveCourtBench(world, state).filter((s) => s.holderId).length).toBe(9);
    const courtOffice = officesOfKind(world, "constitutional_court_justice")[0]!;
    const courtTerm = occupyingTerms(state, courtOffice.id)[0];
    if (courtTerm) endTerm(state, courtTerm.id, state.currentDate, "test");
    const nomineeId =
      remaining.find((id) => id !== "NPC002" && !currentCourtJudgeIds(world, state).includes(id)) ??
      remaining[5]!;
    world.agentProfiles[nomineeId] = syntheticAgentProfile(nomineeId, {
      roleTypes: ["senior_lawyer"],
    });
    state.counters.nextCourtNominationId = 2;
    state.constitutionalRuntime.nominations.CNOM000001 = {
      id: "CNOM000001",
      seatOfficeId: courtOffice.id,
      nomineeId,
      nominatorId: "NPC001",
      nominatedDate: state.currentDate,
      status: "pending_confirmation",
      stageReadyDate: "2027-12-01",
      votes: {},
      yes: 0,
      no: 0,
      abstain: 0,
      voteId: null,
      metadata: {},
    };
    const failVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) failVotes[id] = i < 251 ? "yes" : "no";
    const failed = recordConfirmationVote(
      world,
      jsonClone(state),
      { nominationId: "CNOM000001", votes: failVotes },
      null,
    );
    expect("error" in failed).toBe(false);
    if (!("error" in failed))
      expect(failed.events.some((e) => e.type === "JUDGE_REJECTED")).toBe(true);
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) passVotes[id] = i < 252 ? "yes" : "no";
    const passed = recordConfirmationVote(
      world,
      jsonClone(state),
      { nominationId: "CNOM000001", votes: passVotes },
      null,
    );
    expect("error" in passed).toBe(false);
    if (!("error" in passed))
      expect(passed.events.some((e) => e.type === "JUDGE_CONFIRMED")).toBe(true);

    state.constitutionalRuntime.impeachments.IMPEACH000001 = {
      id: "IMPEACH000001",
      targetId: occupyingTerms(state, "OFFICE_PRESIDENT")[0]!.holderId,
      sponsorId: remaining[0]!,
      grounds: "serious_constitutional_abuse",
      basisId: null,
      evidenceStrength: 0.55,
      severity: 0.5,
      introducedDate: state.currentDate,
      status: "assembly_pending",
      stageReadyDate: "2027-12-01",
      votes: {},
      yes: 0,
      no: 0,
      abstain: 0,
      caseId: null,
      metadata: {},
    };
    const impFail: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) impFail[id] = i < 279 ? "yes" : "no";
    const impFailed = recordImpeachmentVote(
      world,
      jsonClone(state),
      { proceedingId: "IMPEACH000001", votes: impFail },
      null,
    );
    expect("error" in impFailed).toBe(false);
    if (!("error" in impFailed)) {
      expect(impFailed.events.some((e) => e.type === "IMPEACHMENT_REJECTED")).toBe(true);
    }
    const impPass: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) impPass[id] = i < 280 ? "yes" : "no";
    const impPassed = recordImpeachmentVote(
      world,
      jsonClone(state),
      { proceedingId: "IMPEACH000001", votes: impPass },
      null,
    );
    expect("error" in impPassed).toBe(false);
    if (!("error" in impPassed)) {
      expect(impPassed.events.some((e) => e.type === "PRESIDENT_IMPEACHED")).toBe(true);
    }

    state.constitutionalRuntime.recalls.RECALL000001 = {
      id: "RECALL000001",
      targetId: occupyingTerms(state, "OFFICE_PRESIDENT")[0]!.holderId,
      sponsorId: remaining[0]!,
      introducedDate: state.currentDate,
      status: "referral_pending",
      stageReadyDate: "2027-12-01",
      votes: {},
      yes: 0,
      no: 0,
      abstain: 0,
      nationalVoteDate: null,
      nationalYesShare: null,
      metadata: {},
    };
    const recFail: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) recFail[id] = i < 251 ? "yes" : "no";
    const recFailed = recordRecallReferralVote(
      world,
      jsonClone(state),
      { proceedingId: "RECALL000001", votes: recFail },
      null,
    );
    expect("error" in recFailed).toBe(false);
    const recPass: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of remaining.entries()) recPass[id] = i < 252 ? "yes" : "no";
    const recPassed = recordRecallReferralVote(
      world,
      jsonClone(state),
      { proceedingId: "RECALL000001", votes: recPass },
      null,
    );
    expect("error" in recPassed).toBe(false);
    if (!("error" in recPassed)) {
      expect(recPassed.events.some((e) => e.type === "RECALL_REFERRED")).toBe(true);
    }
  });
});

describe("Phase 8 nonrenewable terms and impeachment basis", () => {
  it("blocks the first canonical justice from returning after the 2029-06-01 vacancy", () => {
    const world = loadTerenaWorld();
    expect(world.courtConstitution.renewable).toBe(false);
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "P8-2029" });
    const expiring = Object.values(sim.getSnapshot().officeTerms).find(
      (t) =>
        world.offices[t.officeId]?.kind === "constitutional_court_justice" &&
        t.endDate === "2029-06-01" &&
        t.status === "active",
    );
    expect(expiring).toBeTruthy();
    const former = expiring!.holderId;
    const seat = expiring!.officeId;
    expectOk(sim, { type: "DEV_VACATE_OFFICE", officeId: seat, reason: "term_end" });
    expect(
      Object.values(sim.getSnapshot().officeTerms).some(
        (t) => t.holderId === former && t.status === "ended",
      ),
    ).toBe(true);
    advance(sim, 1);
    const again = sim.executeCommand({
      type: "NOMINATE_CONSTITUTIONAL_JUDGE",
      seatOfficeId: seat,
      nomineeId: former,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("COURT_TERM_NONRENEWABLE");
  });

  it("rejects impeachment without an actionable public basis targeting the President", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-NO-BASIS" });
    expect(availableImpeachmentBases(world, sim.getSnapshot())).toHaveLength(0);
    const missing = sim.executeCommand({
      type: "INTRODUCE_IMPEACHMENT",
      basisId: "CGND000001",
    });
    expect(missing.ok).toBe(false);
    const hidden = withImpeachmentBasis(sim, world, { public: false });
    expect(availableImpeachmentBases(world, hidden.sim.getSnapshot())).toHaveLength(0);
    const hiddenAttempt = hidden.sim.executeCommand({
      type: "INTRODUCE_IMPEACHMENT",
      basisId: hidden.basisId,
    });
    expect(hiddenAttempt.ok).toBe(false);
    const wrongTarget = withImpeachmentBasis(sim, world, { targetId: "MP01" });
    const wrong = wrongTarget.sim.executeCommand({
      type: "INTRODUCE_IMPEACHMENT",
      basisId: wrongTarget.basisId,
    });
    expect(wrong.ok).toBe(false);
  });

  it("consumes a synthetic basis and copies evidence onto the proceeding", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-BASIS" });
    const seeded = withImpeachmentBasis(sim, world, {
      grounds: "grave_unlawful_exercise_of_office",
      evidenceStrength: 0.81,
      severity: 0.74,
    });
    expect(availableImpeachmentBases(world, seeded.sim.getSnapshot())).toHaveLength(1);
    expectOk(seeded.sim, { type: "INTRODUCE_IMPEACHMENT", basisId: seeded.basisId });
    const proceeding = Object.values(
      seeded.sim.getSnapshot().constitutionalRuntime.impeachments,
    )[0]!;
    expect(proceeding.targetId).toBe("P1");
    expect(proceeding.grounds).toBe("grave_unlawful_exercise_of_office");
    expect(proceeding.evidenceStrength).toBe(0.81);
    expect(proceeding.severity).toBe(0.74);
    expect(seeded.sim.getSnapshot().constitutionalRuntime.grounds[seeded.basisId]?.status).toBe(
      "consumed",
    );
    const reuse = seeded.sim.executeCommand({
      type: "INTRODUCE_IMPEACHMENT",
      basisId: seeded.basisId,
    });
    expect(reuse.ok).toBe(false);
    expect(availableImpeachmentBases(world, seeded.sim.getSnapshot())).toHaveLength(0);
  });

  it("does not treat a treason label as manufactured evidence", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-LABEL" });
    const snap = sim.getSnapshot();
    const mps = currentAssemblyMemberIds(world, snap).filter((id) => id !== "MP02");
    const weakTreason = {
      id: "IMPEACH000001",
      targetId: "P1",
      sponsorId: "MP02",
      grounds: "treason" as const,
      basisId: "CGND000001",
      evidenceStrength: 0.12,
      severity: 0.18,
      introducedDate: snap.currentDate,
      status: "assembly_pending" as const,
      stageReadyDate: snap.currentDate,
      votes: {},
      yes: 0,
      no: 0,
      abstain: 0,
      caseId: null,
      metadata: {},
    };
    const weakAbuse = { ...weakTreason, grounds: "serious_constitutional_abuse" as const };
    const strongAbuse = {
      ...weakAbuse,
      grounds: "serious_constitutional_abuse" as const,
      evidenceStrength: 0.86,
      severity: 0.8,
    };
    const countYes = (proceeding: typeof weakTreason, seed: string): number => {
      const rng = createRngService(seed);
      let yes = 0;
      for (const id of mps) {
        if (chooseImpeachmentVote(world, snap, id, proceeding, rng) === "yes") yes += 1;
      }
      return yes;
    };
    const treasonYes = countYes(weakTreason, "P8-LABEL-VOTE");
    const abuseYes = countYes(weakAbuse, "P8-LABEL-VOTE");
    const strongYes = countYes(strongAbuse, "P8-LABEL-VOTE");
    expect(Math.abs(treasonYes - abuseYes)).toBeLessThanOrEqual(12);
    expect(strongYes).toBeGreaterThan(treasonYes);
  });

  it("derives Court impeachment merits from evidence rather than the grounds label", () => {
    const world = courtHarness();
    const weak = withImpeachmentBasis(
      createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-MERITS-W" }),
      world,
      { grounds: "treason", evidenceStrength: 0.1, severity: 0.12 },
    );
    expectOk(weak.sim, { type: "INTRODUCE_IMPEACHMENT", basisId: weak.basisId });
    const strong = withImpeachmentBasis(
      createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-MERITS-S" }),
      world,
      {
        grounds: "serious_constitutional_abuse",
        evidenceStrength: 0.9,
        severity: 0.85,
      },
    );
    expectOk(strong.sim, { type: "INTRODUCE_IMPEACHMENT", basisId: strong.basisId });
    const mps = currentAssemblyMemberIds(world, weak.sim.getSnapshot());
    const needed = impeachmentYesNeeded(world);
    const passVotes: Record<string, "yes" | "no" | "abstain"> = {};
    for (const [i, id] of mps.entries()) passVotes[id] = i < needed ? "yes" : "no";
    const weakState = jsonClone(weak.sim.getSnapshot());
    const strongState = jsonClone(strong.sim.getSnapshot());
    const weakId = Object.keys(weakState.constitutionalRuntime.impeachments)[0]!;
    const strongId = Object.keys(strongState.constitutionalRuntime.impeachments)[0]!;
    recordImpeachmentVote(world, weakState, { proceedingId: weakId, votes: passVotes }, "CMD");
    recordImpeachmentVote(world, strongState, { proceedingId: strongId, votes: passVotes }, "CMD");
    const weakCase = Object.values(weakState.constitutionalRuntime.courtCases)[0]!;
    const strongCase = Object.values(strongState.constitutionalRuntime.courtCases)[0]!;
    expect(strongCase.meritsLean).toBeGreaterThan(weakCase.meritsLean);
    expect(weakCase.meritsLean).toBeLessThan(0.2);
    expect(strongCase.meritsLean).toBeGreaterThan(0.4);
  });

  it("records a public basis when the Court invalidates a presidential emergency", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-EMG-BASIS" });
    const snap = jsonClone(sim.getSnapshot());
    snap.counters.nextEmergencyId = Math.max(snap.counters.nextEmergencyId, 2);
    snap.executiveRuntime.emergencies.EMG000001 = {
      id: "EMG000001",
      declaredBy: "P1",
      declaredDate: snap.currentDate,
      expiresDate: "2020-01-15",
      status: "active",
      extensionCount: 0,
      metadata: { courtReviewRequired: true },
    };
    const live = restoreSimulation(
      {
        schemaVersion: 8,
        contentVersion: snap.contentVersion,
        scenarioId: snap.scenarioId,
        simulation: snap,
      },
      world,
    );
    expectOk(live, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "EMERGENCY_REVIEW",
      challengedKind: "emergency",
      challengedId: "EMG000001",
      constitutionalQuestion: "Whether the emergency remains valid",
      constitutionalRule: "emergency_review",
      meritsLean: 0.8,
    });
    const caseId = Object.keys(live.getSnapshot().constitutionalRuntime.courtCases)[0]!;
    const judges = currentCourtJudgeIds(world, live.getSnapshot());
    const votes: Record<string, JudicialVoteChoice> = {};
    for (const [i, id] of judges.entries()) votes[id] = i < 5 ? "invalidate" : "uphold";
    const applied = jsonClone(live.getSnapshot());
    const out = recordJudicialDecision(world, applied, { caseId, votes }, "CMD");
    expect("error" in out).toBe(false);
    const bases = availableImpeachmentBases(world, applied);
    expect(bases.length).toBeGreaterThan(0);
    expect(bases[0]?.targetPoliticianId).toBe("P1");
    expect(bases[0]?.sourceKind).toBe("invalidated_emergency");
  });
});

describe("Phase 8 judicial realism and performance", () => {
  it("shows ideology without party robots and allows 5-4 plus precedent influence", () => {
    const world = courtHarness();
    let nineOh = 0;
    let fiveFour = 0;
    let crossover = 0;
    let invalidate = 0;
    for (let s = 0; s < 24; s++) {
      const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: `P8-REAL-${s}` });
      expectOk(sim, {
        type: "FILE_CONSTITUTIONAL_CASE",
        caseType: "LAW_REVIEW",
        challengedId: `x${s}`,
        constitutionalQuestion: "realism",
        constitutionalRule: s % 2 === 0 ? "law_review" : "alt_rule",
        meritsLean: (s % 7) / 7 - 0.45,
      });
      advance(sim, 2);
      const d = Object.values(sim.getSnapshot().constitutionalRuntime.courtDecisions)[0];
      if (!d) continue;
      if (d.invalidate === 0 && d.uphold >= 8) nineOh += 1;
      if (Math.abs(d.uphold - d.invalidate) <= 1 && d.uphold + d.invalidate >= 8) fiveFour += 1;
      if (d.disposition === "INVALIDATE") invalidate += 1;
      const parties = new Set(
        Object.keys(d.votes).map((id) => sim.getSnapshot().politicians[id]?.partyId ?? "none"),
      );
      if (parties.size <= 1 && d.uphold > 0 && d.invalidate > 0) crossover += 1;
    }
    expect(nineOh).toBeGreaterThan(0);
    expect(fiveFour + nineOh).toBeGreaterThan(2);
    expect(invalidate).toBeLessThan(20);
    expect(crossover).toBeGreaterThanOrEqual(0);
  });

  it("keeps a 9-judge month cheap relative to a legislative month budget", () => {
    const world = courtHarness();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "P8-PERF" });
    const t0 = performance.now();
    expectOk(sim, {
      type: "FILE_CONSTITUTIONAL_CASE",
      caseType: "LAW_REVIEW",
      challengedId: "perf",
      constitutionalQuestion: "perf",
      constitutionalRule: "law_review",
      meritsLean: 0,
    });
    advance(sim, 2);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(4000);
  });
});
