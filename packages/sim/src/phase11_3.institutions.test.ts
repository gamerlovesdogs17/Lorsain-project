import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  recruitFederalAssemblyClass,
  provincialAssemblySeatCount,
} from "./provinces/assemblies.js";
import { migrateSaveV12ToV13, migrateSaveV13ToV14, migrateSaveV14ToV15, migrateSaveV15ToV16, parseSaveFile } from "./save.js";
import { addMonths } from "./calendar.js";
import {
  processConstitutionalAmendmentsMonth,
  proposeConstitutionalAmendment,
  constitutionalSupportScore,
} from "./provinces/constitutional.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import {
  LEGISLATIVE_PROVISIONS,
  defaultProvisionOptionId,
  policyItemForProvision,
} from "./legislature/provisions.js";
import { evaluatePresidentialEligibility } from "./parties/eligibility.js";
import { hashCanonical } from "./hash.js";
import { processCaucusLeadershipMonth } from "./legislature/caucus.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import { processPoliticalLifecycleMonth } from "./political-lifecycle.js";
import { auditGeneratedPersonQuality } from "./agents/generated-quality.js";
import { PARTY_PLATFORM_ISSUES } from "./parties/types.js";
import { constituencyPressureForBill, publicConstituencyPressures } from "./legislature/constituency.js";
import type { BillState } from "./legislature/types.js";

function startingHolder(world: ReturnType<typeof loadTerenaWorld>, kind: string): string {
  const term = world.startingTerms.find((candidate) => world.offices[candidate.officeId]?.kind === kind);
  if (!term) throw new Error(`No starting ${kind}`);
  return term.holderId;
}

describe("Phase 11.3 Provincial Assemblies and recruitment", () => {
  it("renews the NPC political class deterministically without choosing the player's exit", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "governor");
    const save = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P113-POLITICAL-LIFECYCLE",
    }).serializeSave();
    const state = save.simulation;
    const deceasedId = "P113_ELDER_DECEASED";
    const retiredId = "P113_ELDER_RETIREE";
    state.politicians[deceasedId] = {
      id: deceasedId,
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
      homeProvinceId: world.provinceIds[0],
      displayName: "Mara Teston",
      description: "A retired administrator used to exercise the deterministic lifecycle.",
    };
    state.politicians[retiredId] = {
      id: retiredId,
      alive: true,
      retired: false,
      partyId: null,
      factionId: null,
      homeProvinceId: world.provinceIds[0],
      displayName: "Iven Teston",
      description: "A veteran organizer used to exercise the deterministic lifecycle.",
    };
    state.generatedAgentProfiles[deceasedId] = syntheticAgentProfile(deceasedId, {
      birthDate: "1928-01-01",
      issueSalience: Object.fromEntries(world.issueIds.map((issueId) => [issueId, 0.5])),
    });
    state.generatedAgentProfiles[retiredId] = syntheticAgentProfile(retiredId, {
      birthDate: "1948-01-01",
      traits: { retirementInclination: 1 },
      issueSalience: Object.fromEntries(world.issueIds.map((issueId) => [issueId, 0.5])),
    });

    const playerBefore = { ...state.politicians[player]! };
    const events = processPoliticalLifecycleMonth(state, world, null);
    expect(state.politicians[deceasedId]!.alive).toBe(false);
    expect(state.politicians[retiredId]!.retired).toBe(true);
    expect(state.politicians[player]).toEqual(playerBefore);
    expect(events.filter((event) => event.type === "POLITICIAN_DIED" && event.actorIds.includes(deceasedId))).toHaveLength(1);
    expect(events.filter((event) => event.type === "POLITICIAN_RETIRED" && event.actorIds.includes(retiredId))).toHaveLength(1);
    expect(events.filter((event) => event.type === "POLITICAL_LIFECYCLE_REVIEWED")).toHaveLength(1);
    expect(processPoliticalLifecycleMonth(state, world, null)).toEqual([]);

    const restored = restoreSimulation(save, world);
    expect(restored.hashState()).toBe(hashCanonical(state));
  });

  it("uses policy-specific provision option identifiers while loading legacy aliases", () => {
    expect(LEGISLATIVE_PROVISIONS).toHaveLength(50);
    expect(LEGISLATIVE_PROVISIONS.flatMap((definition) => definition.options)).toHaveLength(161);
    expect(new Set(LEGISLATIVE_PROVISIONS.map((definition) => definition.options.length))).toEqual(new Set([3, 4, 5]));
    for (const definition of LEGISLATIVE_PROVISIONS) {
      expect(definition.options.length).toBeGreaterThanOrEqual(2);
      expect(definition.options.filter((option) => option.current)).toHaveLength(1);
      expect(definition.options.every((option) => option.affectedGroups.length > 0)).toBe(true);
      expect(definition.options.some((option) => ["low", "current", "high"].includes(option.id))).toBe(false);
      expect(defaultProvisionOptionId(definition.id)).not.toBe("");
    }
    expect(LEGISLATIVE_PROVISIONS.some((definition) => definition.options.length === 5)).toBe(true);
    expect(LEGISLATIVE_PROVISIONS.flatMap((definition) => definition.options).some((option) => Object.keys(option.dimensionEffects ?? {}).length > 1)).toBe(true);
    expect(policyItemForProvision("PROV_REPRODUCTIVE_LAW", "national_protection")?.optionId).toBe("national_protection");
    expect(policyItemForProvision("PROV_REPRODUCTIVE_LAW", "high")?.optionId).toBe("national_protection");
  });

  it("seeds twenty-one population-scaled chambers and a named renewable political class", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "governor");
    const snap = createSimulation({ world, playerPoliticianId: player, seed: "P113-PROVINCES" }).getSnapshot();
    expect(Object.keys(snap.provincialRuntime.assemblies)).toHaveLength(21);
    const sizes = Object.values(snap.provincialRuntime.assemblies).map((row) => row.seatCount);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(65);
    expect(new Set(sizes).size).toBeGreaterThan(4);
    for (const provinceId of world.provinceIds) {
      const assembly = snap.provincialRuntime.assemblies[provinceId]!;
      expect(assembly.seatCount).toBe(provincialAssemblySeatCount(world, provinceId));
      expect(assembly.memberIds).toHaveLength(assembly.seatCount);
      expect(Object.values(assembly.partySeats).reduce((sum, value) => sum + value, 0)).toBe(assembly.seatCount);
      expect(assembly.presidingOfficerId && assembly.memberIds.includes(assembly.presidingOfficerId)).toBe(true);
      expect(Object.keys(assembly.partyLeadership).sort()).toEqual(
        Object.entries(assembly.partySeats).filter(([, seats]) => seats > 0).map(([partyId]) => partyId).sort(),
      );
      for (const leadership of Object.values(assembly.partyLeadership)) {
        expect(leadership.floorLeaderId && assembly.memberIds.includes(leadership.floorLeaderId)).toBe(true);
        expect(leadership.whipId && assembly.memberIds.includes(leadership.whipId)).toBe(true);
        expect(leadership.whipId).not.toBe(leadership.floorLeaderId);
      }
    }
    const legislators = Object.values(snap.provincialRuntime.legislators);
    expect(legislators.length).toBeGreaterThan(sizes.reduce((sum, value) => sum + value, 0));
    expect(new Set(legislators.map((row) => row.displayName)).size).toBe(legislators.length);
    expect(legislators.every((row) => !/PLEG_|moderate on/i.test(`${row.displayName} ${row.description}`))).toBe(true);
    const quality = auditGeneratedPersonQuality(world, snap);
    expect(quality.errors).toEqual([]);
    expect(quality.largestFirstNameShare).toBeLessThan(0.04);
    expect(quality.largestFamilyNameShare).toBeLessThan(0.04);
  });

  it("promotes pre-existing provincial legislators before a federal filing allocation", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const sim = createSimulation({ world, playerPoliticianId: player, seed: "P113-PIPELINE" });
    const save = sim.serializeSave();
    const state = save.simulation;
    const beforeLegislators = Object.keys(state.provincialRuntime.legislators).length;
    const promoted = recruitFederalAssemblyClass(world, state, "ELEC_ASM_PIPELINE_TEST");
    expect(promoted.length).toBeGreaterThan(0);
    expect(Object.keys(state.provincialRuntime.legislators)).toHaveLength(beforeLegislators);
    for (const id of promoted) {
      const politician = state.politicians[id]!;
      expect(politician.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(politician.homeProvinceId).toBeTruthy();
      expect(state.generatedAgentProfiles[id]?.roleTypes).toContain("provincial_legislator");
      expect(Object.keys(state.generatedAgentProfiles[id]!.issueSalience).sort()).toEqual(
        world.issueIds.slice().sort(),
      );
    }
    const beforeRestore = hashCanonical(state);
    const restored = restoreSimulation(save, world);
    expect(restored.hashState()).toBe(beforeRestore);
    expect(promoted.every((id) => restored.getSnapshot().politicians[id]?.displayName)).toBe(true);
  });

  it("migrates schema 12 saves and deterministically seeds the new institutions on restore", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const current = createSimulation({ world, playerPoliticianId: player, seed: "P113-MIGRATE" }).serializeSave();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 12;
    const simulation = legacy.simulation as Record<string, unknown>;
    simulation.schemaVersion = 12;
    const provincial = simulation.provincialRuntime as Record<string, unknown>;
    for (const key of ["assemblies", "legislators", "assemblyElections", "bills", "votes", "promotions", "constitutionalRules", "constitutionalAmendments"]) delete provincial[key];
    const migrated = migrateSaveV12ToV13(legacy);
    const parsed = parseSaveFile(migrated, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const a = restoreSimulation(parsed.save, world);
    const b = restoreSimulation(parsed.save, world);
    expect(a.hashState()).toBe(b.hashState());
    expect(Object.keys(a.getSnapshot().provincialRuntime.assemblies)).toHaveLength(21);
  });

  it("migrates schema 13 structural fields without fabricating political history", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const current = createSimulation({ world, playerPoliticianId: player, seed: "P113-MIGRATE-14" }).serializeSave();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 13;
    const simulation = legacy.simulation as Record<string, unknown>;
    simulation.schemaVersion = 13;

    const historyBefore = hashCanonical(simulation.history);
    const electionsBefore = hashCanonical(simulation.elections);
    const officeTermsBefore = hashCanonical(simulation.officeTerms);
    const provincial = simulation.provincialRuntime as Record<string, unknown>;
    const legislators = provincial.legislators as Record<string, Record<string, unknown>>;
    const firstLegislator = legislators[Object.keys(legislators).sort()[0]!]!;
    for (const key of ["serviceTerms", "electionIds", "sponsoredBillIds", "cosponsoredBillIds"]) {
      delete firstLegislator[key];
    }

    const migrated = migrateSaveV13ToV14(legacy) as Record<string, unknown>;
    const migratedSimulation = migrated.simulation as Record<string, unknown>;
    const migratedProvincial = migratedSimulation.provincialRuntime as Record<string, unknown>;
    const migratedLegislators = migratedProvincial.legislators as Record<string, Record<string, unknown>>;
    const migratedFirstLegislator = migratedLegislators[Object.keys(migratedLegislators).sort()[0]!]!;
    expect(migrated.schemaVersion).toBe(14);
    expect(migratedSimulation.schemaVersion).toBe(14);
    expect(migratedFirstLegislator.serviceTerms).toEqual(
      typeof firstLegislator.serviceStartDate === "string"
        ? [{ startDate: firstLegislator.serviceStartDate, endDate: firstLegislator.serviceEndDate ?? null, electionId: null }]
        : [],
    );
    expect(migratedFirstLegislator.electionIds).toEqual([]);
    expect(migratedFirstLegislator.sponsoredBillIds).toEqual([]);
    expect(migratedFirstLegislator.cosponsoredBillIds).toEqual([]);
    expect(hashCanonical(migratedSimulation.history)).toBe(historyBefore);
    expect(hashCanonical(migratedSimulation.elections)).toBe(electionsBefore);
    expect(hashCanonical(migratedSimulation.officeTerms)).toBe(officeTermsBefore);

    const parsed = parseSaveFile(migrated, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restoredA = restoreSimulation(parsed.save, world);
    const restoredB = restoreSimulation(parsed.save, world);
    expect(restoredA.hashState()).toBe(restoredB.hashState());
  });

  it("migrates schema 14 gubernatorial structure without inventing history", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const current = createSimulation({ world, playerPoliticianId: player, seed: "P113-MIGRATE-15" }).serializeSave();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 14;
    const simulation = legacy.simulation as Record<string, unknown>;
    simulation.schemaVersion = 14;
    const historyBefore = hashCanonical(simulation.history);
    const provincial = simulation.provincialRuntime as Record<string, unknown>;
    delete provincial.governorVacancies;
    const elections = provincial.elections as Record<string, Record<string, unknown>>;
    for (const election of Object.values(elections)) delete election.incumbentDecision;
    const migrated = migrateSaveV14ToV15(legacy) as Record<string, unknown>;
    const migratedSimulation = migrated.simulation as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(15);
    expect(migratedSimulation.schemaVersion).toBe(15);
    expect(hashCanonical(migratedSimulation.history)).toBe(historyBefore);
    expect((migratedSimulation.provincialRuntime as Record<string, unknown>).governorVacancies).toEqual({});
    const parsed = parseSaveFile(migrated, world.contentVersion);
    expect(parsed.ok).toBe(true);
  });

  it("migrates schema 15 party platforms without fabricating a published history", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const current = createSimulation({ world, playerPoliticianId: player, seed: "P113-MIGRATE-16" }).serializeSave();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 15;
    const simulation = legacy.simulation as Record<string, unknown>;
    simulation.schemaVersion = 15;
    const partyStates = simulation.partyStates as Record<string, Record<string, unknown>>;
    for (const party of Object.values(partyStates)) delete party.publicPlatform;
    const historyBefore = hashCanonical(simulation.history);

    const migrated = migrateSaveV15ToV16(legacy) as Record<string, unknown>;
    const migratedSimulation = migrated.simulation as Record<string, unknown>;
    const migratedParties = migratedSimulation.partyStates as Record<string, Record<string, unknown>>;
    expect(migrated.schemaVersion).toBe(16);
    expect(migratedSimulation.schemaVersion).toBe(16);
    expect(hashCanonical(migratedSimulation.history)).toBe(historyBefore);
    for (const party of Object.values(migratedParties)) {
      const platform = party.publicPlatform as { updatedDate: string; positions: Record<string, number>; history: unknown[] };
      expect(platform.updatedDate).toBe(simulation.currentDate);
      expect(platform.history).toEqual([]);
      expect(Object.keys(platform.positions).sort()).toEqual(PARTY_PLATFORM_ISSUES.slice().sort());
      expect(Object.values(platform.positions)).toEqual(PARTY_PLATFORM_ISSUES.map(() => 0));
    }
    const parsed = parseSaveFile(migrated, world.contentVersion);
    expect(parsed.ok).toBe(true);
  });

  it("moves public party platforms gradually and keeps publication history bounded", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const sim = createSimulation({ world, playerPoliticianId: player, seed: "P113-PLATFORM-MOTION" });
    const before = structuredClone(sim.getSnapshot().partyStates);
    const turn = sim.executeCommand({ type: "ADVANCE_TURN" });
    expect(turn.ok).toBe(true);
    const after = sim.getSnapshot().partyStates;
    for (const [partyId, party] of Object.entries(after)) {
      expect(party.publicPlatform).toBeTruthy();
      for (const issue of PARTY_PLATFORM_ISSUES) {
        const delta = Math.abs(
          party.publicPlatform!.positions[issue] - before[partyId]!.publicPlatform!.positions[issue],
        );
        expect(delta).toBeLessThanOrEqual(0.012000001);
      }
      expect(party.publicPlatform!.history.length).toBeLessThanOrEqual(12);
    }
  });

  it("derives public constituency pressures from regional conditions and applies only a bounded vote incentive", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({ world, playerPoliticianId: player, seed: "P113-CONSTITUENCY-PRESSURE" }).serializeSave().simulation;
    const constituencyId = Object.keys(world.constituencyProvinceShares).sort()[0]!;
    const provinceId = world.constituencyProvinceShares[constituencyId]!
      .slice()
      .sort((a, b) => b.share - a.share || a.provinceId.localeCompare(b.provinceId))[0]!.provinceId;
    state.economyRuntime.provinces[provinceId]!.employmentIndex = 92;
    state.economyRuntime.provinces[provinceId]!.housingIndex = 93;
    const bill = {
      policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 1, fiscalImpact: null }],
    } as BillState;
    const pressures = publicConstituencyPressures(world, state, constituencyId);
    expect(pressures.some((pressure) => pressure.kind === "employment" && pressure.level === "urgent")).toBe(true);
    expect(pressures.some((pressure) => pressure.kind === "housing" && pressure.level === "urgent")).toBe(true);
    const incentive = constituencyPressureForBill(world, state, constituencyId, bill);
    expect(incentive).toBeGreaterThan(0);
    expect(incentive).toBeLessThanOrEqual(0.18);
    expect(constituencyPressureForBill(world, state, constituencyId, { ...bill, policyItems: [{ ...bill.policyItems[0]!, direction: -1 }] })).toBeLessThan(0);
  });

  it("requires 280 federal votes and 13 Provincial Assemblies before changing a real rule", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({ world, playerPoliticianId: player, seed: "P113-AMENDMENT" }).serializeSave().simulation;
    const failedState = structuredClone(state);
    const failedProposal = proposeConstitutionalAmendment(
      world,
      failedState,
      player,
      "presidential_term_limit",
      1,
      "CMD_TEST_FAIL",
    );
    expect("error" in failedProposal).toBe(false);
    if (!("error" in failedProposal)) {
      for (const [index, id] of currentAssemblyMemberIds(world, failedState).entries()) {
        failedProposal.amendment.assemblyVotes[id] = index < 279 ? "yes" : "no";
      }
      failedState.currentDate = addMonths(failedState.currentDate, 1);
      processConstitutionalAmendmentsMonth(world, failedState, "CMD_TEST_FAIL");
      expect(failedProposal.amendment.assemblyYes).toBe(279);
      expect(failedProposal.amendment.status).toBe("assembly_failed");
      expect(failedState.provincialRuntime.constitutionalRules.presidential_term_limit?.value).toBe(2);
    }
    const proposed = proposeConstitutionalAmendment(
      world,
      state,
      player,
      "presidential_term_limit",
      1,
      "CMD_TEST",
    );
    expect("error" in proposed).toBe(false);
    if ("error" in proposed) return;
    const members = currentAssemblyMemberIds(world, state);
    for (const [index, id] of members.entries()) {
      proposed.amendment.assemblyVotes[id] = index < 280 ? "yes" : "no";
    }
    for (const provinceId of world.provinceIds) {
      for (const memberId of state.provincialRuntime.assemblies[provinceId]!.memberIds) {
        const key = `pending:${proposed.amendment.id}:${provinceId}:${memberId}`;
        state.provincialRuntime.votes[key] = {
          id: key,
          provinceId,
          subjectKind: "constitutional_ratification",
          subjectId: proposed.amendment.id,
          date: state.currentDate,
          votes: { [memberId]: "yes" },
          yes: 1,
          no: 0,
          abstain: 0,
          passed: false,
        };
      }
    }
    state.currentDate = addMonths(state.currentDate, 1);
    processConstitutionalAmendmentsMonth(world, state, "CMD_TEST");
    expect(proposed.amendment.assemblyYes).toBe(280);
    expect(proposed.amendment.status).toBe("ratifying");
    expect(proposed.amendment.ratificationDeadline).toBeNull();
    expect(Object.keys(proposed.amendment.provincialVoteIds)).not.toEqual(world.provinceIds.slice(0, 3));
    for (let month = 0; month < 5; month += 1) {
      state.currentDate = addMonths(state.currentDate, 1);
      processConstitutionalAmendmentsMonth(world, state, "CMD_TEST");
    }
    expect(proposed.amendment.status).toBe("ratified");
    expect(proposed.amendment.ratifiedProvinceIds.length).toBeGreaterThanOrEqual(13);
    expect(state.provincialRuntime.constitutionalRules.presidential_term_limit?.value).toBe(1);
    state.presidential.electedTermCountByPolitician[player] = 1;
    expect(evaluatePresidentialEligibility(world, state, player).reasons[0]).toContain("1 of 1");
  });

  it("forms amendment-specific coalitions instead of reusing one constitutional vote pattern", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({ world, playerPoliticianId: player, seed: "P113-AMENDMENT-COALITIONS" }).serializeSave().simulation;
    const president = startingHolder(world, "president");
    const presidentParty = state.politicians[president]!.partyId;
    const members = currentAssemblyMemberIds(world, state);
    const aligned = members.find((id) => state.politicians[id]?.partyId === presidentParty && id !== player)!;
    const opposition = members.find((id) => state.politicians[id]?.partyId !== presidentParty)!;
    const termProposal = proposeConstitutionalAmendment(world, state, aligned, "presidential_term_limit", 3, null);
    const courtProposal = proposeConstitutionalAmendment(world, state, aligned, "court_term_years", 15, null);
    expect("error" in termProposal).toBe(false);
    expect("error" in courtProposal).toBe(false);
    if ("error" in termProposal || "error" in courtProposal) return;
    const presidentialGap = constitutionalSupportScore(world, state, termProposal.amendment, aligned) -
      constitutionalSupportScore(world, state, termProposal.amendment, opposition);
    const courtGap = constitutionalSupportScore(world, state, courtProposal.amendment, aligned) -
      constitutionalSupportScore(world, state, courtProposal.amendment, opposition);
    expect(presidentialGap).toBeGreaterThan(courtGap + 0.12);
  });

  it("rejects constitutional proposal authority outside the National Assembly", () => {
    const world = loadTerenaWorld();
    const governor = startingHolder(world, "governor");
    const state = createSimulation({ world, playerPoliticianId: governor, seed: "P113-AMEND-AUTH" }).serializeSave().simulation;
    const result = proposeConstitutionalAmendment(
      world,
      state,
      governor,
      "court_term_years",
      9,
      "CMD_TEST",
    );
    expect("error" in result && result.error.code).toBe("NOT_ASSEMBLY_MEMBER");
  });

  it("lets a serving player legislator explicitly contest provincial leadership and archives the ballot", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const save = createSimulation({ world, playerPoliticianId: player, seed: "P113-PROV-LEAD" }).serializeSave();
    const state = save.simulation;
    const partyId = state.politicians[player]!.partyId!;
    const provinceId = state.politicians[player]!.homeProvinceId ?? world.politicianHomeProvince[player]!;
    const assembly = state.provincialRuntime.assemblies[provinceId]!;
    const replacedId = assembly.memberIds.find(
      (id) => state.provincialRuntime.legislators[id]?.partyId === partyId,
    )!;
    const replaced = state.provincialRuntime.legislators[replacedId]!;
    state.provincialRuntime.legislators[player] = {
      ...replaced,
      id: player,
      displayName: state.politicians[player]!.displayName ?? player,
      description: state.politicians[player]!.description ?? "A serving Provincial Assembly member.",
      source: "player",
      fullPoliticianId: player,
    };
    assembly.memberIds[assembly.memberIds.indexOf(replacedId)] = player;
    const sim = restoreSimulation(save, world);
    const result = sim.executeCommand({
      type: "SEEK_PROVINCIAL_LEADERSHIP",
      provinceId,
      role: "floor_leader",
    });
    expect(result.ok).toBe(true);
    const after = sim.getSnapshot().provincialRuntime.assemblies[provinceId]!;
    const record = after.leadershipHistory.at(-1)!;
    expect(record.trigger).toBe("player_challenge");
    expect(record.role).toBe("floor_leader");
    expect(record.candidateIds).toContain(player);
    expect(Object.values(record.ballots).reduce((sum, votes) => sum + votes, 0)).toBe(
      assembly.memberIds.filter((id) => state.provincialRuntime.legislators[id]?.partyId === partyId).length,
    );
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(restored.hashState()).toBe(sim.hashState());
  });

  it("opens federal caucus contests only for real triggers and requires an explicit player campaign", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const save = createSimulation({ world, playerPoliticianId: player, seed: "P113-CAUCUS-CAMPAIGN" }).serializeSave();
    const state = save.simulation;
    const partyId = state.politicians[player]!.partyId!;
    const leadership = state.legislatureRuntime.caucusLeadership[partyId]!;
    leadership.floorLeaderId = null;
    const events = processCaucusLeadershipMonth(world, state, null);
    const open = Object.values(state.legislatureRuntime.caucusContests).find(
      (contest) => contest.partyId === partyId && contest.status === "open",
    )!;
    expect(open.role).toBe("floor_leader");
    expect(open.trigger).toBe("vacancy");
    expect(open.candidateIds).not.toContain(player);
    expect(events.some((event) => event.type === "CAUCUS_LEADERSHIP_ELECTION_OPENED")).toBe(true);
    expect(Object.values(state.legislatureRuntime.caucusContests).some(
      (contest) => contest.partyId === partyId && contest.role === "whip" && contest.status === "open",
    )).toBe(false);

    const sim = restoreSimulation(save, world);
    expect(sim.executeCommand({ type: "DECLARE_CAUCUS_LEADERSHIP_CANDIDACY", contestId: open.id }).ok).toBe(true);
    expect(sim.getSnapshot().legislatureRuntime.caucusContests[open.id]!.platforms[player]).toBeUndefined();
    expect(sim.executeCommand({
      type: "CAMPAIGN_CAUCUS_LEADERSHIP",
      contestId: open.id,
      emphasis: "party_unity",
    }).ok).toBe(true);
    const campaigned = sim.getSnapshot().legislatureRuntime.caucusContests[open.id]!;
    expect(campaigned.platforms[player]).toBe("party_unity");
    expect(campaigned.endorsements[player]!.length).toBeGreaterThan(0);
    const beforeRepeat = sim.hashState();
    expect(sim.executeCommand({
      type: "CAMPAIGN_CAUCUS_LEADERSHIP",
      contestId: open.id,
      emphasis: "electoral_recovery",
    }).ok).toBe(false);
    expect(sim.hashState()).toBe(beforeRepeat);
  });

  it("enforces new institutional authority in the command layer for every featured role", () => {
    const world = loadTerenaWorld();
    const governorTerm = world.startingTerms.find(
      (term) => world.offices[term.officeId]?.kind === "governor",
    )!;
    const provinceId = world.offices[governorTerm.officeId]!.provinceId!;
    const governor = createSimulation({
      world,
      playerPoliticianId: governorTerm.holderId,
      seed: "P113-AUTH-GOV",
    });
    expect(
      governor.executeCommand({
        type: "GOVERNOR_PROPOSE_PROVINCIAL_BILL",
        provinceId,
        subject: "housing_delivery",
      }).ok,
    ).toBe(true);

    const mpId = startingHolder(world, "assembly_member");
    const mp = createSimulation({ world, playerPoliticianId: mpId, seed: "P113-AUTH-MP" });
    expect(
      mp.executeCommand({
        type: "PROPOSE_CONSTITUTIONAL_AMENDMENT",
        ruleId: "court_term_years",
        proposedValue: 9,
      }).ok,
    ).toBe(true);

    const invalidRoles = [
      { kind: "president", id: startingHolder(world, "president") },
      { kind: "assembly_member", id: mpId },
      { kind: "speaker", id: startingHolder(world, "speaker") },
      { kind: "mayor", id: startingHolder(world, "mayor") },
      { kind: "minister", id: startingHolder(world, "minister") },
      { kind: "constitutional_court_justice", id: startingHolder(world, "constitutional_court_justice") },
    ];
    for (const [index, role] of invalidRoles.entries()) {
      const sim = createSimulation({
        world,
        playerPoliticianId: role.id,
        seed: `P113-AUTH-ROLE-${index}`,
      });
      const beforeGovernor = sim.hashState();
      expect(
        sim.executeCommand({
          type: "GOVERNOR_PROPOSE_PROVINCIAL_BILL",
          provinceId,
          subject: "transport_service",
        }).ok,
      ).toBe(false);
      expect(sim.hashState()).toBe(beforeGovernor);

      if (role.kind !== "assembly_member" && role.kind !== "speaker") {
        const beforeAmendment = sim.hashState();
        expect(
          sim.executeCommand({
            type: "PROPOSE_CONSTITUTIONAL_AMENDMENT",
            ruleId: "court_term_years",
            proposedValue: 9,
          }).ok,
        ).toBe(false);
        expect(sim.hashState()).toBe(beforeAmendment);
      }
      const beforeLeadership = sim.hashState();
      expect(
        sim.executeCommand({
          type: "SEEK_PROVINCIAL_LEADERSHIP",
          provinceId,
          role: "speaker",
        }).ok,
      ).toBe(false);
      expect(sim.hashState()).toBe(beforeLeadership);
    }

    const formerSource = createSimulation({
      world,
      playerPoliticianId: governorTerm.holderId,
      seed: "P113-AUTH-FORMER",
    }).serializeSave();
    for (const term of Object.values(formerSource.simulation.officeTerms)) {
      if (term.holderId !== formerSource.simulation.playerPoliticianId || term.status !== "active") continue;
      term.status = "ended";
      term.endDate = formerSource.simulation.currentDate;
      term.endedDate = formerSource.simulation.currentDate;
      term.endedReason = "test_former_officeholder";
    }
    const former = restoreSimulation(formerSource, world);
    const formerHash = former.hashState();
    expect(
      former.executeCommand({
        type: "GOVERNOR_PROPOSE_PROVINCIAL_BILL",
        provinceId,
        subject: "transport_service",
      }).ok,
    ).toBe(false);
    expect(former.hashState()).toBe(formerHash);
    expect(
      former.executeCommand({
        type: "PROPOSE_CONSTITUTIONAL_AMENDMENT",
        ruleId: "court_term_years",
        proposedValue: 9,
      }).ok,
    ).toBe(false);
    expect(former.hashState()).toBe(formerHash);
  });
});
