import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  recruitFederalAssemblyClass,
  provincialAssemblySeatCount,
} from "./provinces/assemblies.js";
import { migrateSaveV12ToV13, parseSaveFile } from "./save.js";
import { addMonths } from "./calendar.js";
import {
  processConstitutionalAmendmentsMonth,
  proposeConstitutionalAmendment,
} from "./provinces/constitutional.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import {
  LEGISLATIVE_PROVISIONS,
  defaultProvisionOptionId,
  policyItemForProvision,
} from "./legislature/provisions.js";
import { evaluatePresidentialEligibility } from "./parties/eligibility.js";
import { hashCanonical } from "./hash.js";

function startingHolder(world: ReturnType<typeof loadTerenaWorld>, kind: string): string {
  const term = world.startingTerms.find((candidate) => world.offices[candidate.officeId]?.kind === kind);
  if (!term) throw new Error(`No starting ${kind}`);
  return term.holderId;
}

describe("Phase 11.3 Provincial Assemblies and recruitment", () => {
  it("uses policy-specific provision option identifiers while loading legacy aliases", () => {
    expect(LEGISLATIVE_PROVISIONS).toHaveLength(30);
    expect(LEGISLATIVE_PROVISIONS.flatMap((definition) => definition.options)).toHaveLength(90);
    for (const definition of LEGISLATIVE_PROVISIONS) {
      expect(definition.options).toHaveLength(3);
      expect(definition.options.some((option) => ["low", "current", "high"].includes(option.id))).toBe(false);
      expect(defaultProvisionOptionId(definition.id)).not.toBe("");
    }
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

      if (role.kind !== "assembly_member") {
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
