import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { add, eq, parseRational, serializeCountResult, ZERO } from "@lorsain/election-math";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { parseSaveFile } from "./save.js";
import { kernelOffice, syntheticWorld } from "./synthetic-world.js";
import { syntheticAgentProfile, publicPoliticianFacts } from "./agents/profile.js";
import { createRngService } from "./rng.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "./world.js";
import {
  compactAssemblyElectionFromRaw,
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "./terena-party-input.js";
import {
  assemblyCaucus,
  buildProvincialPartyOrganizations,
  chooseEndorsement,
  chooseMembershipAction,
  factionAssemblyCaucus,
  factionMembers,
  labourSelectorate,
  memberFactionSelectorate,
  partyMembers,
  provincialOrgId,
  replayContestCount,
  selectorateForRule,
  civicSupporterSelectorate,
  regionalProvincialSelectorate,
  pmMemberSelectorate,
  evaluatePresidentialEligibility,
} from "./parties/index.js";
import type { KernelWorld, SaveFile } from "./types.js";
import { SAVE_SCHEMA_VERSION } from "./types.js";
import type { NominationRuleDefinition } from "./parties/types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function loadTerenaWorld(withElection = false) {
  const bundle = loadContentBundleFromRepo(repoRoot);
  let assemblyElection;
  if (withElection) {
    const raw = JSON.parse(
      readFileSync(resolve(repoRoot, "data/terena_election_assembly_2026.json"), "utf8"),
    ) as Parameters<typeof compactAssemblyElectionFromRaw>[0];
    assemblyElection = compactAssemblyElectionFromRaw(raw);
  }
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
      ...(assemblyElection ? { assemblyElection } : {}),
    }),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle),
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

function rule(
  partial: Pick<NominationRuleDefinition, "ruleId" | "partyId" | "method"> &
    Partial<NominationRuleDefinition>,
): NominationRuleDefinition {
  return {
    memberWeight: null,
    affiliateUnionDelegateWeight: null,
    assemblyCaucusEndorsementFraction: null,
    provincialOrganizationEndorsementsMin: null,
    memberNominationsRequired: false,
    memberNominationThresholdRequired: false,
    provincialNominationSupportRequired: false,
    supporterRegistrationRequired: false,
    ...partial,
  };
}

function addPolitician(
  world: KernelWorld,
  id: string,
  partyId: string | null,
  factionId: string | null,
  extra?: Parameters<typeof syntheticAgentProfile>[1],
): void {
  world.politicians.push({ id, alive: true, retired: false, partyId, factionId });
  world.agentProfiles[id] = syntheticAgentProfile(id, extra);
}

function addAssemblySeat(world: KernelWorld, holderId: string): void {
  const id = `OFFICE_ASM_${holderId}`;
  world.offices[id] = kernelOffice({ id, kind: "assembly_member" });
  world.startingTerms.push({
    officeId: id,
    holderId,
    startDate: "2000-01-01",
    startKnown: true,
    endDate: null,
    accessionReason: "test",
    status: "active",
    holdingKind: "substantive",
    sourceElectionId: null,
    endedDate: null,
    endedReason: null,
  });
}

function partyMiniWorld(seed = "PARTY-MINI"): KernelWorld {
  const world = syntheticWorld(seed);
  world.partyDefinitions = {
    PARTY_LAB: {
      partyId: "PARTY_LAB",
      name: "Labour",
      short: "LAB",
      organizationType: "membership_party",
      nominationRuleId: "labour_member_union_rcv",
      factionIds: ["FAC_LAB_A", "FAC_LAB_B"],
      canonicalFactionShares: { FAC_LAB_A: 0.62, FAC_LAB_B: 0.38 },
    },
    PARTY_NU: {
      partyId: "PARTY_NU",
      name: "National Union",
      short: "NU",
      organizationType: "membership_party",
      nominationRuleId: "national_union_closed_rcv",
      factionIds: ["FAC_NU_A", "FAC_NU_B"],
      canonicalFactionShares: { FAC_NU_A: 0.55, FAC_NU_B: 0.45 },
    },
    PARTY_CR: {
      partyId: "PARTY_CR",
      name: "Civic Reform",
      short: "CR",
      organizationType: "membership_party",
      nominationRuleId: "civic_open_supporter_rcv",
      factionIds: ["FAC_CR_A"],
      canonicalFactionShares: { FAC_CR_A: 1 },
    },
    PARTY_GRN: {
      partyId: "PARTY_GRN",
      name: "Greens",
      short: "GRN",
      organizationType: "membership_party",
      nominationRuleId: "green_transferable_convention",
      factionIds: ["FAC_GRN_A"],
      canonicalFactionShares: { FAC_GRN_A: 1 },
    },
    PARTY_RL: {
      partyId: "PARTY_RL",
      name: "Regional League",
      short: "RL",
      organizationType: "membership_party",
      nominationRuleId: "regional_weighted_delegates",
      factionIds: ["FAC_RL_A"],
      canonicalFactionShares: { FAC_RL_A: 1 },
    },
    PARTY_PM: {
      partyId: "PARTY_PM",
      name: "People’s Movement",
      short: "PM",
      organizationType: "membership_party",
      nominationRuleId: "people_direct_member_ballot",
      factionIds: ["FAC_PM_A", "FAC_PM_B"],
      canonicalFactionShares: { FAC_PM_A: 0.58, FAC_PM_B: 0.42 },
    },
  };
  world.factionDefinitions = {
    FAC_LAB_A: { factionId: "FAC_LAB_A", partyId: "PARTY_LAB", name: "Lab A", share: 0.62 },
    FAC_LAB_B: { factionId: "FAC_LAB_B", partyId: "PARTY_LAB", name: "Lab B", share: 0.38 },
    FAC_NU_A: { factionId: "FAC_NU_A", partyId: "PARTY_NU", name: "NU A", share: 0.55 },
    FAC_NU_B: { factionId: "FAC_NU_B", partyId: "PARTY_NU", name: "NU B", share: 0.45 },
    FAC_CR_A: { factionId: "FAC_CR_A", partyId: "PARTY_CR", name: "CR A", share: 1 },
    FAC_GRN_A: { factionId: "FAC_GRN_A", partyId: "PARTY_GRN", name: "GRN A", share: 1 },
    FAC_RL_A: { factionId: "FAC_RL_A", partyId: "PARTY_RL", name: "RL A", share: 1 },
    FAC_PM_A: { factionId: "FAC_PM_A", partyId: "PARTY_PM", name: "PM A", share: 0.58 },
    FAC_PM_B: { factionId: "FAC_PM_B", partyId: "PARTY_PM", name: "PM B", share: 0.42 },
  };
  world.nominationRules = {
    labour_member_union_rcv: rule({
      ruleId: "labour_member_union_rcv",
      partyId: "PARTY_LAB",
      method: "weighted_ranked_choice",
      memberWeight: 0.8,
      affiliateUnionDelegateWeight: 0.2,
      memberNominationsRequired: true,
    }),
    national_union_closed_rcv: rule({
      ruleId: "national_union_closed_rcv",
      partyId: "PARTY_NU",
      method: "closed_member_rcv",
      assemblyCaucusEndorsementFraction: 0.15,
    }),
    civic_open_supporter_rcv: rule({
      ruleId: "civic_open_supporter_rcv",
      partyId: "PARTY_CR",
      method: "registered_supporter_rcv",
      supporterRegistrationRequired: true,
    }),
    green_transferable_convention: rule({
      ruleId: "green_transferable_convention",
      partyId: "PARTY_GRN",
      method: "transferable_convention",
      memberNominationThresholdRequired: true,
    }),
    regional_weighted_delegates: rule({
      ruleId: "regional_weighted_delegates",
      partyId: "PARTY_RL",
      method: "weighted_provincial_delegates",
      provincialNominationSupportRequired: true,
    }),
    people_direct_member_ballot: rule({
      ruleId: "people_direct_member_ballot",
      partyId: "PARTY_PM",
      method: "direct_member_rcv",
      provincialOrganizationEndorsementsMin: 4,
    }),
  };
  world.startingPartyLeaders = {
    PARTY_LAB: "P3",
    PARTY_NU: "P5",
    PARTY_CR: "P12",
    PARTY_GRN: "P13",
    PARTY_RL: "P14",
    PARTY_PM: "P15",
  };
  world.startingFactionChairs = {
    FAC_LAB_A: "P3",
    FAC_LAB_B: "P4",
    FAC_NU_A: "P5",
    FAC_NU_B: "P6",
    FAC_CR_A: "P12",
    FAC_GRN_A: "P13",
    FAC_RL_A: "P14",
    FAC_PM_A: "P15",
    FAC_PM_B: "P16",
  };
  world.provinceIds = ["P01", "P02", "P03", "P04"];
  world.provincialPartyOrganizations = buildProvincialPartyOrganizations(
    Object.keys(world.partyDefinitions),
    world.provinceIds,
  );
  world.politicianHomeProvince = {
    P14: "P01",
    P17: "P02",
    P18: "P03",
  };
  world.partyProvinceBaseline = {
    PARTY_RL: { P01: "4/10", P02: "3/10", P03: "2/10", P04: "1/10" },
  };

  addPolitician(world, "P3", "PARTY_LAB", "FAC_LAB_A", {
    roleTypes: ["party_leader", "faction_chair"],
    presidentialStatus: "frontrunner",
    traits: { ambition: 0.8, partyLoyalty: 0.7, factionLoyalty: 0.7 },
  });
  addPolitician(world, "P4", "PARTY_LAB", "FAC_LAB_B", {
    roleTypes: ["faction_chair"],
    presidentialStatus: "possible",
    traits: { ambition: 0.7, partyLoyalty: 0.6, factionLoyalty: 0.8 },
  });
  addPolitician(world, "P5", "PARTY_NU", "FAC_NU_A", {
    roleTypes: ["party_leader", "faction_chair", "assembly_member"],
    presidentialStatus: "likely",
  });
  addPolitician(world, "P6", "PARTY_NU", "FAC_NU_B", {
    roleTypes: ["faction_chair", "assembly_member"],
  });
  for (const id of ["P7", "P8", "P9", "P10", "P11"]) {
    addPolitician(world, id, "PARTY_NU", id === "P11" ? "FAC_NU_B" : "FAC_NU_A", {
      roleTypes: ["assembly_member"],
    });
  }
  addPolitician(world, "P12", "PARTY_CR", "FAC_CR_A", {
    roleTypes: ["party_leader", "faction_chair"],
    presidentialStatus: "exploring",
  });
  addPolitician(world, "P13", "PARTY_GRN", "FAC_GRN_A", {
    roleTypes: ["party_leader", "faction_chair"],
  });
  addPolitician(world, "P14", "PARTY_RL", "FAC_RL_A", {
    roleTypes: ["party_leader", "faction_chair"],
  });
  addPolitician(world, "P15", "PARTY_PM", "FAC_PM_A", {
    roleTypes: ["party_leader", "faction_chair"],
  });
  addPolitician(world, "P16", "PARTY_PM", "FAC_PM_B", { roleTypes: ["faction_chair"] });
  addPolitician(world, "P17", "PARTY_RL", "FAC_RL_A");
  addPolitician(world, "P18", "PARTY_RL", "FAC_RL_A");
  addPolitician(world, "P19", "PARTY_LAB", "FAC_LAB_A");
  addPolitician(world, "P20", "PARTY_CR", "FAC_CR_A");

  for (const id of ["P5", "P6", "P7", "P8", "P9", "P10", "P11"]) addAssemblySeat(world, id);
  return world;
}

function simFor(world: KernelWorld = partyMiniWorld(), playerPoliticianId = "P1") {
  return createSimulation({ world, playerPoliticianId });
}

function createdContestId(sim: ReturnType<typeof createSimulation>, partyId: string): string {
  const before = new Set(Object.keys(sim.getSnapshot().partyContests));
  const r = sim.executeCommand({
    type: "DEV_CREATE_PARTY_CONTEST",
    contestType: "presidential_nomination",
    partyId,
  });
  expect(r.ok).toBe(true);
  const id = Object.keys(sim.getSnapshot().partyContests).find((k) => !before.has(k));
  expect(id).toBeTruthy();
  return id!;
}

function expectOk(
  sim: ReturnType<typeof createSimulation>,
  command: Parameters<typeof sim.executeCommand>[0],
) {
  const r = sim.executeCommand(command);
  expect(r.ok).toBe(true);
  return r;
}

function stripToV2(save: SaveFile): Record<string, unknown> {
  const raw = jsonClone(save) as unknown as Record<string, unknown>;
  raw.schemaVersion = 2;
  const sim = raw.simulation as Record<string, unknown>;
  sim.schemaVersion = 2;
  delete sim.partyStates;
  delete sim.factionStates;
  delete sim.endorsements;
  delete sim.partyContests;
  delete sim.dynamicParties;
  const counters = sim.counters as Record<string, unknown>;
  delete counters.nextEndorsementId;
  delete counters.nextPartyContestId;
  delete counters.nextDynamicPartyId;
  delete counters.nextCampaignId;
  delete counters.nextDebateId;
  delete counters.nextBillId;
  delete counters.nextAmendmentId;
  delete counters.nextLegislativeVoteId;
  delete counters.nextLawId;
  delete sim.campaignRuntime;
  delete sim.legislatureRuntime;
  return raw;
}

describe("TERENA_2028 starting party institutions", () => {
  it("seeds 6 parties, 15 factions, no PARTY_IND state, and valid memberships", () => {
    const world = loadTerenaWorld(true);
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    expect(Object.keys(world.partyDefinitions).sort()).toEqual([
      "PARTY_CR",
      "PARTY_GRN",
      "PARTY_LAB",
      "PARTY_NU",
      "PARTY_PM",
      "PARTY_RL",
    ]);
    expect(Object.keys(world.factionDefinitions).length).toBe(15);
    expect(Object.keys(snap.partyStates).length).toBe(6);
    expect(Object.keys(snap.factionStates).length).toBe(15);
    expect(snap.partyStates.PARTY_IND).toBeUndefined();
    expect(world.independentAggregatePartyId).toBe("PARTY_IND");
    expect(Object.values(snap.politicians).some((p) => p.partyId === "PARTY_IND")).toBe(false);
    expect(Object.values(snap.partyStates).every((p) => p.leaderId)).toBe(true);
    expect(Object.values(snap.factionStates).every((f) => f.chairId)).toBe(true);
    expect(snap.partyStates.PARTY_LAB?.leaderId).toBe("NPC012");
    expect(snap.partyStates.PARTY_NU?.leaderId).toBe("NPC004");
    expect(snap.partyStates.PARTY_CR?.leaderId).toBe("NPC018");
    expect(snap.partyStates.PARTY_GRN?.leaderId).toBe("NPC006");
    expect(snap.partyStates.PARTY_RL?.leaderId).toBe("NPC007");
    expect(snap.partyStates.PARTY_PM?.leaderId).toBe("NPC008");
    expect(Object.keys(snap.partyContests).length).toBe(6);
    expect(
      Object.values(snap.partyContests).every(
        (c) => c.status === "planned" && c.type === "presidential_nomination",
      ),
    ).toBe(true);
    expect(Object.values(snap.partyContests).some((c) => c.entries.NPC001)).toBe(false);
    for (const p of Object.values(snap.politicians)) {
      if (p.factionId) expect(p.partyId).not.toBeNull();
      if (p.partyId) expect(world.partyDefinitions[p.partyId]).toBeTruthy();
    }
    expect(Object.keys(world.partyProvinceBaseline).length).toBeGreaterThan(0);
    expect(Object.keys(snap.goals).length).toBeGreaterThan(500);
  });

  it("derives party and faction membership and caucus counts from PoliticianRuntime", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC002" });
    const snap = sim.getSnapshot();
    const memberReport: Record<string, number> = {};
    const mpReport: Record<string, number> = {};
    for (const partyId of Object.keys(snap.partyStates).sort()) {
      memberReport[partyId] = partyMembers(snap, partyId).length;
      mpReport[partyId] = assemblyCaucus(world, snap, partyId).length;
    }
    expect(Object.values(memberReport).reduce((a, b) => a + b, 0)).toBeGreaterThan(400);
    expect(mpReport.PARTY_LAB).toBe(128);
    expect(mpReport.PARTY_NU).toBe(110);
    expect(mpReport.PARTY_CR).toBe(69);
    expect(mpReport.PARTY_GRN).toBe(41);
    expect(mpReport.PARTY_RL).toBe(35);
    expect(mpReport.PARTY_PM).toBe(29);
    const facMps = Object.keys(snap.factionStates).map((id) => ({
      id,
      mps: factionAssemblyCaucus(world, snap, id).length,
      members: factionMembers(snap, id).length,
    }));
    expect(facMps.every((f) => f.members >= 0)).toBe(true);
    expect(facMps.reduce((n, f) => n + f.mps, 0)).toBe(128 + 110 + 69 + 41 + 35 + 29);
  });
});

describe("membership and leadership", () => {
  it("allows in-party faction switch and rejects cross-party faction and PARTY_IND", () => {
    const sim = simFor();
    const before = sim.hashState();
    expect(
      sim.executeCommand({ type: "DEV_CHANGE_FACTION", politicianId: "P19", factionId: "FAC_NU_A" })
        .ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(before);
    expectOk(sim, { type: "DEV_CHANGE_FACTION", politicianId: "P19", factionId: "FAC_LAB_B" });
    expect(sim.getSnapshot().politicians.P19?.factionId).toBe("FAC_LAB_B");
    const rejectInd = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_CHANGE_PARTY_MEMBERSHIP",
        politicianId: "P19",
        partyId: "PARTY_IND",
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(rejectInd);
    expectOk(sim, {
      type: "DEV_CHANGE_PARTY_MEMBERSHIP",
      politicianId: "P19",
      partyId: "PARTY_CR",
    });
    expect(sim.getSnapshot().politicians.P19?.partyId).toBe("PARTY_CR");
    expect(sim.getSnapshot().politicians.P19?.factionId).toBeNull();
    expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P19", partyId: null });
    expect(sim.getSnapshot().politicians.P19?.partyId).toBeNull();
    expect(sim.getSnapshot().politicians.P19?.factionId).toBeNull();
  });

  it("vacates leadership when the leader leaves and updates public facts and goals", () => {
    const sim = simFor();
    const factsBefore = publicPoliticianFacts(sim.world(), sim.getSnapshot(), "P3");
    expect(factsBefore?.partyLeaderOf).toBe("PARTY_LAB");
    expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P3", partyId: "PARTY_CR" });
    const snap = sim.getSnapshot();
    expect(snap.partyStates.PARTY_LAB?.leaderId).toBeNull();
    expect(snap.partyStates.PARTY_LAB?.status).toBe("leadership_vacant");
    expect(snap.history.some((e) => e.type === "PARTY_LEADERSHIP_VACANT")).toBe(true);
    expect(snap.history.some((e) => e.type === "PARTY_LEADERSHIP_CONTEST_REQUIRED")).toBe(true);
    const facts = publicPoliticianFacts(sim.world(), snap, "P3");
    expect(facts?.partyLeaderOf).toBeNull();
    expect(facts?.partyId).toBe("PARTY_CR");
  });

  it("vacates faction chair on leave and on death", () => {
    const sim = simFor();
    expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P4", partyId: null });
    expect(sim.getSnapshot().factionStates.FAC_LAB_B?.chairId).toBeNull();
    const sim2 = simFor();
    expectOk(sim2, { type: "DEV_SET_ALIVE", politicianId: "P12", alive: false });
    expect(sim2.getSnapshot().partyStates.PARTY_CR?.leaderId).toBeNull();
    expect(sim2.getSnapshot().factionStates.FAC_CR_A?.chairId).toBeNull();
  });
});

describe("endorsements", () => {
  it("enforces player authority for party membership, candidacy, and endorsements", () => {
    const sim = simFor(partyMiniWorld(), "P19");
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P4",
    });

    for (const command of [
      { type: "CHANGE_PARTY_MEMBERSHIP", politicianId: "P3", partyId: null },
      { type: "CHANGE_FACTION", politicianId: "P3", factionId: null },
      { type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P7" },
      { type: "WITHDRAW_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" },
      { type: "ENDORSE_PARTY_CONTEST_CANDIDATE", contestId, endorserId: "P7", targetId: "P3" },
    ] as const) {
      const hash = sim.hashState();
      const result = sim.executeCommand(command);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("PLAYER_AUTHORITY");
      expect(sim.hashState()).toBe(hash);
    }

    expectOk(sim, {
      type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    const own = Object.values(sim.getSnapshot().endorsements).find(
      (endorsement) => endorsement.endorserId === "P19" && endorsement.status === "active",
    );
    expect(own).toBeDefined();
    expectOk(sim, { type: "WITHDRAW_ENDORSEMENT", endorsementId: own!.id });

    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "FAC_LAB_A",
      targetId: "P4",
      endorserType: "faction",
    });
    const other = Object.values(sim.getSnapshot().endorsements).find(
      (endorsement) => endorsement.endorserId === "FAC_LAB_A" && endorsement.status === "active",
    );
    const hash = sim.hashState();
    const forbiddenWithdrawal = sim.executeCommand({
      type: "WITHDRAW_ENDORSEMENT",
      endorsementId: other!.id,
    });
    expect(forbiddenWithdrawal.ok).toBe(false);
    if (!forbiddenWithdrawal.ok) expect(forbiddenWithdrawal.error.code).toBe("PLAYER_AUTHORITY");
    expect(sim.hashState()).toBe(hash);
  });

  it("creates, switches, withdraws, and rejects invalid targets without mutating on reject", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P4",
    });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    const first = Object.values(sim.getSnapshot().endorsements).find(
      (e) => e.endorserId === "P19" && e.status === "active",
    );
    expect(first?.targetId).toBe("P3");
    expect(sim.getSnapshot().history.some((e) => e.type === "ENDORSEMENT_MADE")).toBe(true);
    expect(Object.keys(sim.getSnapshot().memories).length).toBeGreaterThan(0);
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P4",
    });
    expect(sim.getSnapshot().endorsements[first!.id]?.status).toBe("superseded");
    const second = Object.values(sim.getSnapshot().endorsements).find(
      (e) => e.endorserId === "P19" && e.status === "active",
    );
    expect(second?.targetId).toBe("P4");
    expectOk(sim, { type: "DEV_WITHDRAW_ENDORSEMENT", endorsementId: second!.id });
    expect(sim.getSnapshot().endorsements[second!.id]?.status).toBe("withdrawn");
    const hash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: "P19",
        targetId: "P12",
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
    const save = sim.serializeSave();
    expect(restoreSimulation(save, sim.world()).hashState()).toBe(hash);
  });

  it("rejects endorsement by an active same-race rival and allows it after withdrawal", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P4",
    });
    const blocked = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P3",
      targetId: "P4",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("ACTIVE_RIVAL");
    expectOk(sim, {
      type: "DEV_WITHDRAW_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P3",
      targetId: "P4",
    });
    const rec = Object.values(sim.getSnapshot().endorsements).find(
      (e) => e.endorserId === "P3" && e.status === "active",
    );
    expect(rec?.targetId).toBe("P4");
  });
});

function nominate(
  sim: ReturnType<typeof createSimulation>,
  partyId: string,
  candidates: string[],
  extra?: (contestId: string) => void,
) {
  const contestId = createdContestId(sim, partyId);
  for (const id of candidates) {
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: id });
  }
  extra?.(contestId);
  expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
  const resolved = sim.executeCommand({ type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
  expect(resolved.ok).toBe(true);
  const contest = sim.getSnapshot().partyContests[contestId]!;
  expect(contest.status).toBe("resolved");
  expect(contest.winnerId).toBeTruthy();
  expect(contest.countArchive?.method).toBe("irv");
  return contest;
}

describe("six nomination methods", () => {
  it("Labour weighted member+union RCV uses faction groups and countIrv", () => {
    const sim = simFor();
    const groups = labourSelectorate(sim.world(), sim.getSnapshot(), "PARTY_LAB");
    expect(groups.some((g) => g.kind === "members")).toBe(true);
    expect(groups.some((g) => g.kind === "union_delegates")).toBe(true);
    const contest = nominate(sim, "PARTY_LAB", ["P3", "P4"], (contestId) => {
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P3",
        evidence: { memberNominationRequirementSatisfied: true },
      });
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P4",
        evidence: { memberNominationRequirementSatisfied: true },
      });
    });
    expect(contest.selectorSummary.length).toBeGreaterThan(2);
    expect(contest.countArchive?.elected).toBe(contest.winnerId);
  });

  it("National Union requires 15% of current caucus then member RCV", () => {
    const sim = simFor();
    expect(memberFactionSelectorate(sim.world(), sim.getSnapshot(), "PARTY_NU").length).toBe(6);
    const contestId = createdContestId(sim, "PARTY_NU");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P5" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P6" });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    const caucus = assemblyCaucus(sim.world(), sim.getSnapshot(), "PARTY_NU");
    expect(caucus.length).toBe(7);
    const needed = Math.ceil(0.15 * caucus.length);
    expect(needed).toBe(2);
    const failHash = sim.hashState();
    expect(sim.executeCommand({ type: "DEV_RESOLVE_PARTY_CONTEST", contestId }).ok).toBe(false);
    expect(sim.hashState()).toBe(failHash);
    for (const endorser of ["P7", "P8"]) {
      expectOk(sim, {
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: endorser,
        targetId: "P5",
      });
    }
    for (const endorser of ["P9", "P10"]) {
      expectOk(sim, {
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: endorser,
        targetId: "P6",
      });
    }
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expect(sim.getSnapshot().partyContests[contestId]?.winnerId).toBeTruthy();
  });

  it("Civic Reform uses supporter RCV selectorate", () => {
    const sim = simFor();
    const groups = civicSupporterSelectorate(sim.world(), sim.getSnapshot(), "PARTY_CR");
    expect(groups.some((g) => g.id === "cr-open")).toBe(true);
    const contest = nominate(sim, "PARTY_CR", ["P12", "P20"]);
    expect(contest.selectorSummary.length).toBe(groups.length);
    expect("supporterRegistrationSatisfied" in contest.entries.P12!.qualificationEvidence).toBe(
      false,
    );
  });

  it("Greens convention RCV qualifies via member-nomination evidence", () => {
    const world = partyMiniWorld();
    addPolitician(world, "P21", "PARTY_GRN", "FAC_GRN_A");
    const sim = simFor(world);
    const contest = nominate(sim, "PARTY_GRN", ["P13", "P21"], (contestId) => {
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P13",
        evidence: { memberNominationRequirementSatisfied: true },
      });
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P21",
        evidence: { memberNominationRequirementSatisfied: true },
      });
    });
    expect(contest.winnerId).toBeTruthy();
  });

  it("Regional League weights provincial delegates with a floor", () => {
    const sim = simFor();
    const groups = regionalProvincialSelectorate(sim.world(), sim.getSnapshot(), "PARTY_RL");
    expect(groups.every((g) => g.kind === "provincial_delegates")).toBe(true);
    expect(groups.length).toBe(4);
    const contest = nominate(sim, "PARTY_RL", ["P14", "P17"], (contestId) => {
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P14",
        evidence: { provincialSupportRequirementSatisfied: true },
      });
      expectOk(sim, {
        type: "DEV_SET_CONTEST_QUALIFICATION",
        contestId,
        politicianId: "P17",
        evidence: { provincialSupportRequirementSatisfied: true },
      });
    });
    expect(contest.selectorSummary.length).toBe(4);
  });

  it("People’s Movement requires four provincial-organization endorsements", () => {
    const sim = simFor();
    expect(pmMemberSelectorate(sim.world(), sim.getSnapshot(), "PARTY_PM").length).toBe(6);
    const contestId = createdContestId(sim, "PARTY_PM");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P15" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P16" });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    const failHash = sim.hashState();
    expect(sim.executeCommand({ type: "DEV_RESOLVE_PARTY_CONTEST", contestId }).ok).toBe(false);
    expect(sim.hashState()).toBe(failHash);
    for (const prov of ["P01", "P02", "P03", "P04"]) {
      expectOk(sim, {
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: provincialOrgId("PARTY_PM", prov),
        targetId: "P15",
        endorserType: "provincial_organization",
      });
    }
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expect(sim.getSnapshot().partyContests[contestId]?.winnerId).toBe("P15");
  });

  it("reordering declare input does not change the IRV archive", () => {
    const run = (order: string[]) => {
      const sim = simFor(partyMiniWorld("REORDER"));
      const contest = nominate(sim, "PARTY_LAB", order, (contestId) => {
        for (const id of order) {
          expectOk(sim, {
            type: "DEV_SET_CONTEST_QUALIFICATION",
            contestId,
            politicianId: id,
            evidence: { memberNominationRequirementSatisfied: true },
          });
        }
      });
      return contest.countArchive;
    };
    const a = run(["P3", "P4"]);
    const b = run(["P4", "P3"]);
    expect(serializeCountResult(a)).toBe(serializeCountResult(b));
  });

  it("saves an opened contest and restores the same archive after resolve", () => {
    const sim = simFor(partyMiniWorld("REPLAY"));
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_SET_CONTEST_QUALIFICATION",
      contestId,
      politicianId: "P3",
      evidence: { memberNominationRequirementSatisfied: true },
    });
    expectOk(sim, {
      type: "DEV_SET_CONTEST_QUALIFICATION",
      contestId,
      politicianId: "P4",
      evidence: { memberNominationRequirementSatisfied: true },
    });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    const opened = sim.serializeSave();
    const restored = restoreSimulation(opened, sim.world());
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expectOk(restored, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expect(serializeCountResult(sim.getSnapshot().partyContests[contestId]?.countArchive)).toBe(
      serializeCountResult(restored.getSnapshot().partyContests[contestId]?.countArchive),
    );
    const archive = sim.getSnapshot().partyContests[contestId]!;
    expect(archive.countInput).toBeTruthy();
    expect(archive.countArchive).toBeTruthy();
    const replayed = replayContestCount(archive);
    expect(serializeCountResult(replayed)).toBe(serializeCountResult(archive.countArchive));
  });
});

describe("leadership contests, splits, knowledge, player, save", () => {
  it("resolves a generic leadership contest and installs the winner", () => {
    const sim = simFor();
    const r = sim.executeCommand({
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "member_rcv",
    });
    expect(r.ok).toBe(true);
    const contestId = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!.id;
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    const winner = sim.getSnapshot().partyContests[contestId]?.winnerId;
    expect(sim.getSnapshot().partyStates.PARTY_LAB?.leaderId).toBe(winner);
  });

  it("splits a faction into a dynamic party and rejects invalid movers", () => {
    const sim = simFor();
    const hash = sim.hashState();
    expect(
      sim.executeCommand({
        type: "DEV_SPLIT_FACTION",
        factionId: "FAC_LAB_B",
        newPartyName: "Breakaway",
        newPartyShort: "BRK",
        politicianIds: ["P5"],
      }).ok,
    ).toBe(false);
    expect(sim.hashState()).toBe(hash);
    expectOk(sim, {
      type: "DEV_SPLIT_FACTION",
      factionId: "FAC_LAB_B",
      newPartyName: "Breakaway",
      newPartyShort: "BRK",
      politicianIds: ["P4"],
    });
    const snap = sim.getSnapshot();
    const dynId = Object.keys(snap.dynamicParties)[0]!;
    expect(snap.politicians.P4?.partyId).toBe(dynId);
    expect(snap.politicians.P4?.factionId).toBeNull();
    expect(snap.factionStates.FAC_LAB_B?.status).toBe("split_origin");
    expect(snap.factionStates.FAC_LAB_B?.chairId).toBeNull();
    expect(snap.partyStates[dynId]?.leaderId).toBeNull();
    expect(snap.partyStates[dynId]?.status).toBe("leadership_vacant");
  });

  it("does not change endorsement choice when only a hidden trait changes", () => {
    const w1 = partyMiniWorld("KNOW");
    const w2 = jsonClone(w1);
    w2.agentProfiles.P3 = syntheticAgentProfile("P3", {
      ...w1.agentProfiles.P3,
      traits: { ...w1.agentProfiles.P3!.traits, ambition: 0.99 },
    });
    const s1 = createSimulation({ world: w1, playerPoliticianId: "P1", seed: "KNOW" });
    const s2 = createSimulation({ world: w2, playerPoliticianId: "P1", seed: "KNOW" });
    const c1 = createdContestId(s1, "PARTY_LAB");
    const c2 = createdContestId(s2, "PARTY_LAB");
    expect(c1).toBe(c2);
    for (const sim of [s1, s2]) {
      expectOk(sim, {
        type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
        contestId: c1,
        politicianId: "P3",
      });
      expectOk(sim, {
        type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
        contestId: c1,
        politicianId: "P4",
      });
    }
    const a = chooseEndorsement(
      w1,
      s1.getSnapshot(),
      "P19",
      c1,
      ["P3", "P4"],
      createRngService("dec"),
    );
    const b = chooseEndorsement(
      w2,
      s2.getSnapshot(),
      "P19",
      c1,
      ["P3", "P4"],
      createRngService("dec"),
    );
    expect(a).toBe(b);
  });

  it("does not auto-declare, withdraw, endorse, or defect the player", () => {
    const world = partyMiniWorld();
    const sim = createSimulation({ world, playerPoliticianId: "P3" });
    const contestId = createdContestId(sim, "PARTY_LAB");
    const contest = sim.getSnapshot().partyContests[contestId]!;
    expect(contest.entries.P3).toBeUndefined();
    const before = contest.entries.P3?.status;
    for (let i = 0; i < 6; i++) {
      const r = sim.executeCommand({ type: "ADVANCE_TURN" });
      expect(r.ok).toBe(true);
      if (r.ok && r.interrupt) {
        expect(sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" }).ok).toBe(true);
        expect(sim.executeCommand({ type: "RESUME_TURN" }).ok).toBe(true);
      }
    }
    expect(sim.getSnapshot().partyContests[contest.id]?.entries.P3?.status).toBe(before);
    expect(
      chooseEndorsement(
        sim.world(),
        sim.getSnapshot(),
        "P3",
        contest.id,
        ["P4"],
        createRngService("p"),
      ),
    ).toBeNull();
    expect(
      chooseMembershipAction(sim.world(), sim.getSnapshot(), "P3", createRngService("p")),
    ).toBeNull();
  });

  it("migrates v2 saves into v3 party institutions and round-trips v3 hashes", () => {
    const world = partyMiniWorld("MIG");
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const hash = sim.hashState();
    expect(sim.serializeSave().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(restoreSimulation(sim.serializeSave(), world).hashState()).toBe(hash);
    const parsed = parseSaveFile(stripToV2(sim.serializeSave()), "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(restoreSimulation(parsed.save, world).hashState()).toBe(hash);
  });

  it("selectorateForRule covers each canonical method", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    const contest = sim.getSnapshot().partyContests[contestId]!;
    expect(selectorateForRule(sim.world(), sim.getSnapshot(), contest).length).toBeGreaterThan(0);
  });
});

function expectRoundTrip(sim: ReturnType<typeof createSimulation>): void {
  const hash = sim.hashState();
  expect(restoreSimulation(sim.serializeSave(), sim.world()).hashState()).toBe(hash);
}

function parsedSave(raw: unknown) {
  return parseSaveFile(raw, "0.3.1-predev");
}

describe("Phase 3 hardening: endorsements and organizations", () => {
  it("rejects fake and wrong-party provincial organizations", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_PM");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P15" });
    const hash = sim.hashState();
    const fake = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "FAKE1",
      targetId: "P15",
      endorserType: "provincial_organization",
    });
    expect(fake.ok).toBe(false);
    if (!fake.ok) expect(fake.error.code).toBe("INVALID_ORGANIZATION");
    const wrong = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: provincialOrgId("PARTY_LAB", "P01"),
      targetId: "P15",
      endorserType: "provincial_organization",
    });
    expect(wrong.ok).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("does not let one provincial organization multiply the PM gate", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_PM");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P15" });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    for (let i = 0; i < 4; i++) {
      const r = sim.executeCommand({
        type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
        contestId,
        endorserId: provincialOrgId("PARTY_PM", "P01"),
        targetId: "P15",
        endorserType: "provincial_organization",
      });
      if (i === 0) expect(r.ok).toBe(true);
      else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("ALREADY_ENDORSED_CANDIDATE");
      }
    }
    expect(sim.executeCommand({ type: "DEV_RESOLVE_PARTY_CONTEST", contestId }).ok).toBe(false);
  });

  it("rejects a wrong-party institutional faction endorsement", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const hash = sim.hashState();
    const r = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "FAC_NU_A",
      targetId: "P3",
      endorserType: "faction",
    });
    expect(r.ok).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("rejects duplicate same-target politician endorsements without mutation", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    const hash = sim.hashState();
    const rng = sim.getSnapshot().rng;
    const memories = Object.keys(sim.getSnapshot().memories).length;
    const r = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ALREADY_ENDORSED_CANDIDATE");
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().rng).toEqual(rng);
    expect(Object.keys(sim.getSnapshot().memories).length).toBe(memories);
  });

  it("switches a politician endorsement to a different target once", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P4",
    });
    const active = Object.values(sim.getSnapshot().endorsements).filter(
      (e) => e.endorserId === "P19" && e.status === "active",
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.targetId).toBe("P4");
    expectRoundTrip(sim);
  });

  it("does not stack same-target faction institutional endorsements", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "FAC_LAB_A",
      targetId: "P3",
      endorserType: "faction",
    });
    const hash = sim.hashState();
    const again = sim.executeCommand({
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "FAC_LAB_A",
      targetId: "P3",
      endorserType: "faction",
    });
    expect(again.ok).toBe(false);
    expect(sim.hashState()).toBe(hash);
  });

  it("ends active endorsements when the target withdraws or dies", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P4",
    });
    expectOk(sim, {
      type: "DEV_WITHDRAW_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P4",
    });
    expect(
      Object.values(sim.getSnapshot().endorsements).every(
        (e) => e.targetId !== "P4" || e.status !== "active",
      ),
    ).toBe(true);
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: "P3", alive: false });
    expect(
      Object.values(sim.getSnapshot().endorsements).every(
        (e) => e.targetId !== "P3" || e.status !== "active",
      ),
    ).toBe(true);
    expectRoundTrip(sim);
  });

  it("ends a public endorsement when the endorser leaves the contest party", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    const endorsement = Object.values(sim.getSnapshot().endorsements).find(
      (row) => row.endorserId === "P19",
    )!;
    expectOk(sim, {
      type: "DEV_CHANGE_PARTY_MEMBERSHIP",
      politicianId: "P19",
      partyId: "PARTY_CR",
    });
    const ended = sim.getSnapshot().endorsements[endorsement.id]!;
    expect(ended.status).toBe("ended");
    expect(ended.metadata.endReason).toBe("endorser_party_switch");
    expect(ended.metadata.statusDate).toBe(sim.getSnapshot().currentDate);
    expect(
      sim
        .getSnapshot()
        .history.some(
          (event) =>
            event.type === "ENDORSEMENT_ENDED" && event.payload.endorsementId === endorsement.id,
        ),
    ).toBe(true);
    expectRoundTrip(sim);
  });
});

describe("Phase 3 hardening: leadership, chairs, lifecycle, eligibility, save", () => {
  it("does not inherit the presidential nomination rule for generic leadership", () => {
    const sim = simFor();
    expect(
      sim.executeCommand({
        type: "DEV_CREATE_PARTY_CONTEST",
        contestType: "party_leadership",
        partyId: "PARTY_LAB",
      }).ok,
    ).toBe(false);
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "member_rcv",
    });
    const contest = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!;
    expect(contest.ruleId).toBe("");
    expect(contest.metadata.selectorMethod).toBe("member_rcv");
    const groups = selectorateForRule(sim.world(), sim.getSnapshot(), contest);
    expect(groups.every((g) => g.kind === "members")).toBe(true);
    expect(groups.some((g) => g.kind === "union_delegates")).toBe(false);
  });

  it("requires a valid factionId for faction-chair contests and faction-scoped selectors", () => {
    const sim = simFor();
    expect(
      sim.executeCommand({
        type: "DEV_CREATE_PARTY_CONTEST",
        contestType: "faction_chair",
        partyId: "PARTY_LAB",
        selectorMethod: "member_rcv",
      }).ok,
    ).toBe(false);
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "faction_chair",
      partyId: "PARTY_LAB",
      factionId: "FAC_LAB_A",
      selectorMethod: "member_rcv",
    });
    const contest = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "faction_chair",
    )!;
    expect(
      sim.executeCommand({
        type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
        contestId: contest.id,
        politicianId: "P4",
      }).ok,
    ).toBe(false);
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: contest.id,
      politicianId: "P3",
    });
    const groups = selectorateForRule(sim.world(), sim.getSnapshot(), contest);
    expect(groups.every((g) => g.factionId === "FAC_LAB_A")).toBe(true);
  });

  it("withdraws incompatible candidacies on party, independent, death, retirement, and faction switch", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P19" });
    expectOk(sim, {
      type: "DEV_CHANGE_PARTY_MEMBERSHIP",
      politicianId: "P19",
      partyId: "PARTY_CR",
    });
    expect(sim.getSnapshot().partyContests[contestId]?.entries.P19?.status).toBe("withdrawn");
    expectRoundTrip(sim);

    const sim2 = simFor();
    const c2 = createdContestId(sim2, "PARTY_LAB");
    expectOk(sim2, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: c2,
      politicianId: "P19",
    });
    expectOk(sim2, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P19", partyId: null });
    expect(sim2.getSnapshot().partyContests[c2]?.entries.P19?.status).toBe("withdrawn");
    expectRoundTrip(sim2);

    const sim3 = simFor();
    const c3 = createdContestId(sim3, "PARTY_GRN");
    expectOk(sim3, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: c3,
      politicianId: "P13",
    });
    expectOk(sim3, { type: "DEV_SET_ALIVE", politicianId: "P13", alive: false });
    expect(sim3.getSnapshot().partyContests[c3]?.entries.P13?.status).toBe("withdrawn");
    expectRoundTrip(sim3);

    const sim4 = simFor();
    const c4 = createdContestId(sim4, "PARTY_GRN");
    expectOk(sim4, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: c4,
      politicianId: "P13",
    });
    expectOk(sim4, { type: "DEV_SET_RETIRED", politicianId: "P13", retired: true });
    expect(sim4.getSnapshot().partyContests[c4]?.entries.P13?.status).toBe("withdrawn");
    expectRoundTrip(sim4);

    const sim5 = simFor();
    expectOk(sim5, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "faction_chair",
      partyId: "PARTY_LAB",
      factionId: "FAC_LAB_A",
      selectorMethod: "member_rcv",
    });
    const chair = Object.values(sim5.getSnapshot().partyContests).find(
      (c) => c.type === "faction_chair",
    )!;
    expectOk(sim5, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: chair.id,
      politicianId: "P19",
    });
    expectOk(sim5, { type: "DEV_CHANGE_FACTION", politicianId: "P19", factionId: "FAC_LAB_B" });
    expect(sim5.getSnapshot().partyContests[chair.id]?.entries.P19?.status).toBe("withdrawn");
    expectRoundTrip(sim5);
  });

  it("does not let a dead candidate qualify, count, or win", () => {
    const world = partyMiniWorld();
    addPolitician(world, "P21", "PARTY_GRN", "FAC_GRN_A");
    const sim = simFor(world);
    const contestId = createdContestId(sim, "PARTY_GRN");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P13" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P21" });
    expectOk(sim, {
      type: "DEV_SET_CONTEST_QUALIFICATION",
      contestId,
      politicianId: "P13",
      evidence: { memberNominationRequirementSatisfied: true },
    });
    expectOk(sim, {
      type: "DEV_SET_CONTEST_QUALIFICATION",
      contestId,
      politicianId: "P21",
      evidence: { memberNominationRequirementSatisfied: true },
    });
    expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: "P13", alive: false });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expect(sim.getSnapshot().partyContests[contestId]?.winnerId).toBe("P21");
    expectRoundTrip(sim);
  });

  it("rejects Mara Velic and under-35 candidates, and allows MP/governor/minister while blocking court", () => {
    const terena = loadTerenaWorld();
    const tsim = createSimulation({ world: terena, playerPoliticianId: "NPC002" });
    const civic = Object.values(tsim.getSnapshot().partyContests).find(
      (c) => c.partyId === "PARTY_CR" && c.type === "presidential_nomination",
    )!;
    const mara = tsim.executeCommand({
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: civic.id,
      politicianId: "NPC001",
    });
    expect(mara.ok).toBe(false);
    if (!mara.ok) expect(mara.error.code).toBe("PRESIDENTIALLY_INELIGIBLE");
    const labour = Object.values(tsim.getSnapshot().partyContests).find(
      (c) => c.partyId === "PARTY_LAB",
    )!;
    expectOk(tsim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: labour.id,
      politicianId: "NPC003",
    });
    expectOk(tsim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: civic.id,
      politicianId: "NPC005",
    });
    expectOk(tsim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: labour.id,
      politicianId: "NPC002",
    });

    const world = partyMiniWorld();
    addPolitician(world, "PYOUNG", "PARTY_CR", "FAC_CR_A", { birthDate: "2000-01-01" });
    addPolitician(world, "PJUDGE", "PARTY_CR", "FAC_CR_A");
    world.offices.OFFICE_CC = kernelOffice({
      id: "OFFICE_CC",
      kind: "constitutional_court_justice",
    });
    world.startingTerms.push({
      officeId: "OFFICE_CC",
      holderId: "PJUDGE",
      startDate: "2000-01-01",
      startKnown: true,
      endDate: null,
      accessionReason: "test",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
    const sim = simFor(world);
    const cr = createdContestId(sim, "PARTY_CR");
    const young = sim.executeCommand({
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: cr,
      politicianId: "PYOUNG",
    });
    expect(young.ok).toBe(false);
    const judge = sim.executeCommand({
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: cr,
      politicianId: "PJUDGE",
    });
    expect(judge.ok).toBe(false);
    expectOk(sim, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: cr,
      politicianId: "P12",
    });
  });

  it("replays archived ballots after later political change", () => {
    const sim = simFor(partyMiniWorld("REPLAY-HIST"));
    const contest = nominate(sim, "PARTY_LAB", ["P3", "P4"], (contestId) => {
      for (const id of ["P3", "P4"]) {
        expectOk(sim, {
          type: "DEV_SET_CONTEST_QUALIFICATION",
          contestId,
          politicianId: id,
          evidence: { memberNominationRequirementSatisfied: true },
        });
      }
    });
    const archived = jsonClone(contest);
    expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: "P4", partyId: null });
    expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: "P3", alive: false });
    const replayed = replayContestCount(archived);
    expect(serializeCountResult(replayed)).toBe(serializeCountResult(archived.countArchive));
    expect(replayed.elected).toBe(archived.winnerId);
  });

  it("rejects malformed saves for parties, factions, selectors, archives, and evidence", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    const base = jsonClone(sim.serializeSave()) as unknown as {
      simulation: Record<string, unknown>;
    };
    const simRec = () => jsonClone(base) as unknown as { simulation: Record<string, unknown> };

    const missingParty = simRec();
    delete (missingParty.simulation.partyStates as Record<string, unknown>).PARTY_LAB;
    expect(() => restoreSimulation(missingParty as never, sim.world())).toThrow();

    const extraFac = simRec();
    (extraFac.simulation.factionStates as Record<string, unknown>).FAC_GHOST = {
      factionId: "FAC_GHOST",
      partyId: "PARTY_LAB",
      chairId: "P3",
      status: "active",
      cohesion: 0.5,
    };
    expect(parsedSave(extraFac).ok).toBe(true);
    expect(() => restoreSimulation(extraFac as never, sim.world())).toThrow();

    const vacantLeader = simRec();
    (vacantLeader.simulation.partyStates as Record<string, unknown>).PARTY_LAB = {
      ...(vacantLeader.simulation.partyStates as Record<string, unknown>).PARTY_LAB,
      status: "leadership_vacant",
      leaderId: "P3",
    };
    expect(parsedSave(vacantLeader).ok).toBe(false);

    const vacantChair = simRec();
    (vacantChair.simulation.factionStates as Record<string, unknown>).FAC_LAB_A = {
      ...(vacantChair.simulation.factionStates as Record<string, unknown>).FAC_LAB_A,
      status: "chair_vacant",
      chairId: "P3",
    };
    expect(parsedSave(vacantChair).ok).toBe(false);

    const activeNoChair = simRec();
    (activeNoChair.simulation.factionStates as Record<string, unknown>).FAC_LAB_A = {
      ...(activeNoChair.simulation.factionStates as Record<string, unknown>).FAC_LAB_A,
      status: "active",
      chairId: null,
    };
    expect(parsedSave(activeNoChair).ok).toBe(false);

    const dyn = simRec();
    dyn.simulation.dynamicParties = {
      DPARTY0001: {
        partyId: "DPARTY0001",
        name: "Ghost",
        short: "GH",
        originPartyId: "GHOST",
        originFactionId: "GHOSTF",
        nominationRuleId: "GHOSTRULE",
        createdDate: "2000-01-01",
      },
    };
    (dyn.simulation.counters as Record<string, number>).nextDynamicPartyId = 2;
    dyn.simulation.partyStates = {
      ...(dyn.simulation.partyStates as object),
      DPARTY0001: {
        partyId: "DPARTY0001",
        leaderId: null,
        status: "leadership_vacant",
        cohesion: 0.5,
      },
    };
    const dynParsed = parsedSave(dyn);
    expect(dynParsed.ok).toBe(true);
    if (dynParsed.ok) expect(() => restoreSimulation(dynParsed.save, sim.world())).toThrow();

    const banana = simRec();
    const contests = banana.simulation.partyContests as Record<string, Record<string, unknown>>;
    contests[contestId]!.selectorSummary = [
      {
        id: "g1",
        kind: "banana",
        partyId: "PARTY_LAB",
        factionId: null,
        provinceId: null,
        tendency: null,
        weight: "1/1",
      },
    ];
    expect(parsedSave(banana).ok).toBe(false);

    const badWeight = simRec();
    const contestsW = badWeight.simulation.partyContests as Record<string, Record<string, unknown>>;
    contestsW[contestId]!.selectorSummary = [
      {
        id: "g1",
        kind: "members",
        partyId: "PARTY_LAB",
        factionId: null,
        provinceId: null,
        tendency: null,
        weight: "-5/1",
      },
    ];
    expect(parsedSave(badWeight).ok).toBe(false);

    const shallow = simRec();
    const contestsA = shallow.simulation.partyContests as Record<string, Record<string, unknown>>;
    contestsA[contestId]!.status = "resolved";
    contestsA[contestId]!.openedDate = "2000-01-01";
    contestsA[contestId]!.resolvedDate = "2000-01-01";
    contestsA[contestId]!.winnerId = "P3";
    contestsA[contestId]!.countArchive = { elected: "P3" };
    contestsA[contestId]!.countInput = { candidateIds: ["P3"], ballots: [] };
    expect(parsedSave(shallow).ok).toBe(false);

    const evidence = simRec();
    const contestsE = evidence.simulation.partyContests as Record<string, Record<string, unknown>>;
    const entries = contestsE[contestId]!.entries as Record<string, Record<string, unknown>>;
    const first = Object.keys(entries)[0];
    if (first) {
      entries[first]!.qualificationEvidence = { memberNominationRequirementSatisfied: "yes" };
      expect(parsedSave(evidence).ok).toBe(false);
    }

    const chrono = simRec();
    const contestsC = chrono.simulation.partyContests as Record<string, Record<string, unknown>>;
    contestsC[contestId]!.openedDate = "1999-01-01";
    expect(parsedSave(chrono).ok).toBe(false);

    const deadWinner = jsonClone(sim.serializeSave()) as unknown as {
      simulation: {
        politicians: Record<string, { alive: boolean }>;
        partyContests: Record<
          string,
          { status: string; winnerId: string | null; entries: Record<string, { status: string }> }
        >;
      };
    };
    const opened = simFor();
    const cid = createdContestId(opened, "PARTY_GRN");
    expectOk(opened, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: cid,
      politicianId: "P13",
    });
    const tamper = jsonClone(opened.serializeSave()) as unknown as {
      simulation: {
        politicians: Record<string, { alive: boolean }>;
        partyContests: Record<
          string,
          {
            status: string;
            openedDate: string | null;
            resolvedDate: string | null;
            winnerId: string | null;
            entries: Record<string, { status: string }>;
            countArchive: unknown;
            countInput: unknown;
          }
        >;
      };
    };
    tamper.simulation.politicians.P13!.alive = false;
    tamper.simulation.partyContests[cid]!.status = "resolved";
    tamper.simulation.partyContests[cid]!.openedDate = "2000-01-01";
    tamper.simulation.partyContests[cid]!.resolvedDate = "2000-01-01";
    tamper.simulation.partyContests[cid]!.winnerId = "P13";
    tamper.simulation.partyContests[cid]!.entries.P13!.status = "winner";
    tamper.simulation.partyContests[cid]!.countArchive = { elected: "P13" };
    tamper.simulation.partyContests[cid]!.countInput = {
      candidateIds: ["P13"],
      ballots: [{ id: "g", weight: "1/1", rankings: ["P13"] }],
    };
    expect(parsedSave(tamper).ok).toBe(false);
    void deadWinner;
  });
});

function resolveLabLeadership(
  sim: ReturnType<typeof createSimulation>,
  candidates: string[] = ["P3", "P4"],
): string {
  expectOk(sim, {
    type: "DEV_CREATE_PARTY_CONTEST",
    contestType: "party_leadership",
    partyId: "PARTY_LAB",
    selectorMethod: "member_rcv",
  });
  const contestId = Object.values(sim.getSnapshot().partyContests).find(
    (c) => c.type === "party_leadership",
  )!.id;
  for (const id of candidates) {
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: id });
  }
  expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
  expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
  return contestId;
}

describe("Phase 3 history and lifecycle integrity", () => {
  it("keeps resolved contests valid after later death, retirement, party, and faction changes", () => {
    const run = (
      after: (sim: ReturnType<typeof createSimulation>, winner: string, loser: string) => void,
    ) => {
      const sim = simFor(partyMiniWorld("HIST"));
      const contestId = resolveLabLeadership(sim);
      const contest = sim.getSnapshot().partyContests[contestId]!;
      const winner = contest.winnerId!;
      const loser = ["P3", "P4"].find((id) => id !== winner)!;
      const replayHash = serializeCountResult(replayContestCount(contest));
      after(sim, winner, loser);
      expectRoundTrip(sim);
      expect(
        serializeCountResult(replayContestCount(sim.getSnapshot().partyContests[contestId]!)),
      ).toBe(replayHash);
      expect(sim.getSnapshot().partyContests[contestId]?.partyId).toBe("PARTY_LAB");
    };
    run((sim, winner) =>
      expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: winner, alive: false }),
    );
    run((sim, winner) =>
      expectOk(sim, { type: "DEV_SET_RETIRED", politicianId: winner, retired: true }),
    );
    run((sim, winner) =>
      expectOk(sim, {
        type: "DEV_CHANGE_PARTY_MEMBERSHIP",
        politicianId: winner,
        partyId: "PARTY_CR",
      }),
    );
    run((sim, _, loser) =>
      expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: loser, alive: false }),
    );
    run((sim, _, loser) =>
      expectOk(sim, { type: "DEV_SET_RETIRED", politicianId: loser, retired: true }),
    );
    run((sim, _, loser) =>
      expectOk(sim, { type: "DEV_CHANGE_PARTY_MEMBERSHIP", politicianId: loser, partyId: null }),
    );
    run((sim, _, loser) => {
      const other =
        sim.getSnapshot().politicians[loser]?.factionId === "FAC_LAB_A" ? "FAC_LAB_B" : "FAC_LAB_A";
      expectOk(sim, { type: "DEV_CHANGE_FACTION", politicianId: loser, factionId: other });
    });
  });

  it("finalizes the IRV runner-up and closes endorsements on resolve", () => {
    const sim = simFor();
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "member_rcv",
    });
    const contestId = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!.id;
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    const contest = sim.getSnapshot().partyContests[contestId]!;
    const winner = contest.winnerId!;
    const loser = ["P3", "P4"].find((id) => id !== winner)!;
    expect(contest.entries[winner]?.status).toBe("winner");
    expect(contest.entries[loser]?.status).toBe("eliminated");
    expect(Object.values(contest.entries).filter((e) => e.status === "winner")).toHaveLength(1);
    expect(
      Object.values(contest.entries).some(
        (e) => e.status === "qualified" || e.status === "declared",
      ),
    ).toBe(false);
    const recs = Object.values(sim.getSnapshot().endorsements).filter(
      (e) => e.contestId === contestId,
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((e) => e.status === "ended")).toBe(true);
    expect(recs.every((e) => e.metadata.endReason === "contest_resolved")).toBe(true);
    expectOk(sim, {
      type: "DEV_CHANGE_PARTY_MEMBERSHIP",
      politicianId: "P19",
      partyId: "PARTY_CR",
    });
    expectRoundTrip(sim);
    expectOk(sim, { type: "DEV_SET_ALIVE", politicianId: "P19", alive: false });
    expectRoundTrip(sim);
  });

  it("ends endorsements on cancel and rejects unfinished contests that carry count archives", () => {
    const sim = simFor();
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "member_rcv",
    });
    const contestId = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!.id;
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
    });
    expectOk(sim, { type: "DEV_CANCEL_PARTY_CONTEST", contestId });
    const recs = Object.values(sim.getSnapshot().endorsements).filter(
      (e) => e.contestId === contestId,
    );
    expect(
      recs.every((e) => e.status === "ended" && e.metadata.endReason === "contest_cancelled"),
    ).toBe(true);
    expect(sim.getSnapshot().partyContests[contestId]?.winnerId).toBeNull();
    expectRoundTrip(sim);

    const opened = simFor();
    const openId = createdContestId(opened, "PARTY_LAB");
    const raw = jsonClone(opened.serializeSave()) as unknown as {
      simulation: { partyContests: Record<string, Record<string, unknown>> };
    };
    raw.simulation.partyContests[openId]!.status = "open";
    raw.simulation.partyContests[openId]!.openedDate = "2000-01-01";
    raw.simulation.partyContests[openId]!.countInput = {
      candidateIds: ["P3"],
      ballots: [{ id: "g", weight: "1/1", rankings: ["P3"] }],
    };
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[openId]!.status = "qualification";
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[openId]!.status = "voting";
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[openId]!.status = "cancelled";
    raw.simulation.partyContests[openId]!.winnerId = "P3";
    expect(parsedSave(raw).ok).toBe(false);
  });

  it("rejects empty selectorates without mutation and does not fabricate a solo ballot", () => {
    const caucus = simFor();
    expectOk(caucus, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "caucus_rcv",
    });
    const caucusId = Object.values(caucus.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!.id;
    expectOk(caucus, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: caucusId,
      politicianId: "P3",
    });
    expectOk(caucus, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: caucusId,
      politicianId: "P4",
    });
    expectOk(caucus, { type: "DEV_OPEN_PARTY_CONTEST", contestId: caucusId });
    const caucusHash = caucus.hashState();
    const caucusFail = caucus.executeCommand({
      type: "DEV_RESOLVE_PARTY_CONTEST",
      contestId: caucusId,
    });
    expect(caucusFail.ok).toBe(false);
    if (!caucusFail.ok) expect(caucusFail.error.code).toBe("EMPTY_SELECTORATE");
    expect(caucus.hashState()).toBe(caucusHash);
    expect(caucus.getSnapshot().partyContests[caucusId]?.status).toBe("open");
    expect(caucus.getSnapshot().partyContests[caucusId]?.countInput).toBeNull();

    const emptyParty = simFor();
    expectOk(emptyParty, {
      type: "DEV_SPLIT_FACTION",
      factionId: "FAC_LAB_B",
      newPartyName: "Breakaway",
      newPartyShort: "BRK",
      politicianIds: ["P4"],
    });
    const dynId = Object.keys(emptyParty.getSnapshot().dynamicParties)[0]!;
    expectOk(emptyParty, {
      type: "DEV_CHANGE_PARTY_MEMBERSHIP",
      politicianId: "P4",
      partyId: null,
    });
    expectOk(emptyParty, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: dynId,
      selectorMethod: "member_rcv",
    });
    const emptyId = Object.values(emptyParty.getSnapshot().partyContests).find(
      (c) => c.partyId === dynId,
    )!.id;
    expectOk(emptyParty, { type: "DEV_OPEN_PARTY_CONTEST", contestId: emptyId });
    const emptyHash = emptyParty.hashState();
    const emptyFail = emptyParty.executeCommand({
      type: "DEV_RESOLVE_PARTY_CONTEST",
      contestId: emptyId,
    });
    expect(emptyFail.ok).toBe(false);
    if (!emptyFail.ok) expect(emptyFail.error.code).toBe("EMPTY_SELECTORATE");
    expect(emptyParty.hashState()).toBe(emptyHash);

    const chair = simFor();
    expectOk(chair, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "faction_chair",
      partyId: "PARTY_LAB",
      factionId: "FAC_LAB_A",
      selectorMethod: "caucus_rcv",
    });
    const chairId = Object.values(chair.getSnapshot().partyContests).find(
      (c) => c.type === "faction_chair",
    )!.id;
    expectOk(chair, {
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId: chairId,
      politicianId: "P3",
    });
    expectOk(chair, { type: "DEV_OPEN_PARTY_CONTEST", contestId: chairId });
    const chairHash = chair.hashState();
    const chairFail = chair.executeCommand({
      type: "DEV_RESOLVE_PARTY_CONTEST",
      contestId: chairId,
    });
    expect(chairFail.ok).toBe(false);
    if (!chairFail.ok) expect(chairFail.error.code).toBe("EMPTY_SELECTORATE");
    expect(chair.hashState()).toBe(chairHash);
  });

  it("rejects duplicate declaration and withdrawal without mutation", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const declaredDate = sim.getSnapshot().partyContests[contestId]!.entries.P3!.declaredDate;
    expectOk(sim, {
      type: "DEV_SET_CONTEST_QUALIFICATION",
      contestId,
      politicianId: "P3",
      evidence: { memberNominationRequirementSatisfied: true },
    });
    const hash = sim.hashState();
    const again = sim.executeCommand({
      type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("ALREADY_DECLARED");
    expect(sim.hashState()).toBe(hash);
    expect(sim.getSnapshot().partyContests[contestId]!.entries.P3!.declaredDate).toBe(declaredDate);
    expect(sim.getSnapshot().partyContests[contestId]!.entries.P3!.status).toBe("declared");

    expectOk(sim, { type: "DEV_WITHDRAW_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const afterWithdraw = sim.hashState();
    const events = sim
      .getSnapshot()
      .history.filter((e) => e.type === "PARTY_CONTEST_CANDIDACY_WITHDRAWN");
    const dup = sim.executeCommand({
      type: "DEV_WITHDRAW_PARTY_CONTEST_CANDIDACY",
      contestId,
      politicianId: "P3",
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("ALREADY_WITHDRAWN");
    expect(sim.hashState()).toBe(afterWithdraw);
    expect(
      sim.getSnapshot().history.filter((e) => e.type === "PARTY_CONTEST_CANDIDACY_WITHDRAWN"),
    ).toHaveLength(events.length);
  });

  it("compacts identical selector rankings while preserving total selector weight", () => {
    const sim = simFor();
    const contestId = resolveLabLeadership(sim);
    const contest = sim.getSnapshot().partyContests[contestId]!;
    const selectorWeight = contest.selectorSummary.reduce(
      (sum, group) => add(sum, parseRational(group.weight)),
      ZERO,
    );
    const ballotWeight = contest.countInput!.ballots.reduce(
      (sum, ballot) => add(sum, parseRational(ballot.weight)),
      ZERO,
    );
    expect(eq(selectorWeight, ballotWeight)).toBe(true);
    expect(contest.countInput!.ballots.length).toBeLessThanOrEqual(contest.selectorSummary.length);
    const raw = jsonClone(sim.serializeSave()) as unknown as {
      simulation: { partyContests: Record<string, { selectorSummary: Array<{ weight: string }> }> };
    };
    raw.simulation.partyContests[contestId]!.selectorSummary[0]!.weight = "999/1";
    expect(parsedSave(raw).ok).toBe(false);
  });

  it("keeps a partial split faction functioning and preserves old resolved contests after a split", () => {
    const sim = simFor();
    const contestId = resolveLabLeadership(sim, ["P3", "P19"]);
    const replayHash = serializeCountResult(
      replayContestCount(sim.getSnapshot().partyContests[contestId]!),
    );
    expectOk(sim, {
      type: "DEV_SPLIT_FACTION",
      factionId: "FAC_LAB_A",
      newPartyName: "Labour Left",
      newPartyShort: "LL",
      politicianIds: ["P19"],
    });
    expect(sim.getSnapshot().factionStates.FAC_LAB_A?.status).toBe("active");
    expect(sim.getSnapshot().factionStates.FAC_LAB_A?.chairId).toBe("P3");
    expectRoundTrip(sim);
    expect(
      serializeCountResult(replayContestCount(sim.getSnapshot().partyContests[contestId]!)),
    ).toBe(replayHash);

    const chairLeave = simFor();
    expectOk(chairLeave, {
      type: "DEV_SPLIT_FACTION",
      factionId: "FAC_LAB_A",
      newPartyName: "Chair Out",
      newPartyShort: "CO",
      politicianIds: ["P3"],
    });
    expect(chairLeave.getSnapshot().factionStates.FAC_LAB_A?.status).toBe("chair_vacant");
    expect(chairLeave.getSnapshot().factionStates.FAC_LAB_A?.chairId).toBeNull();
    expect(factionMembers(chairLeave.getSnapshot(), "FAC_LAB_A").includes("P19")).toBe(true);
    expectRoundTrip(chairLeave);
  });

  it("uses the runtime presidential election date for the age rule", () => {
    const world = partyMiniWorld();
    addPolitician(world, "PYOUNG", "PARTY_CR", "FAC_CR_A", { birthDate: "2000-01-01" });
    const sim = simFor(world);
    const snap = sim.getSnapshot();
    expect(evaluatePresidentialEligibility(world, snap, "PYOUNG").eligible).toBe(false);
    expect(evaluatePresidentialEligibility(world, snap, "PYOUNG", "2018-10-13").eligible).toBe(
      false,
    );
    expect(evaluatePresidentialEligibility(world, snap, "PYOUNG", "2036-10-11").eligible).toBe(
      true,
    );
    const later = jsonClone(snap);
    later.presidential.nextRegularElectionDate = "2036-10-11";
    expect(evaluatePresidentialEligibility(world, later, "PYOUNG").eligible).toBe(true);
  });
});

describe("Phase 3 preflight A1–A4", () => {
  it("A1: v2 migration does not resurrect a dead canonical leader or chair", () => {
    const world = partyMiniWorld("MIG-DEAD");
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    expect(sim.getSnapshot().partyStates.PARTY_LAB?.leaderId).toBe("P3");
    expect(sim.getSnapshot().factionStates.FAC_LAB_A?.chairId).toBe("P3");
    const v2 = stripToV2(sim.serializeSave());
    const politicians = (v2.simulation as { politicians: Record<string, { alive: boolean }> })
      .politicians;
    politicians.P3.alive = false;
    const parsed = parseSaveFile(v2, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreSimulation(parsed.save, world);
    const snap = restored.getSnapshot();
    expect(snap.partyStates.PARTY_LAB?.leaderId).toBeNull();
    expect(snap.partyStates.PARTY_LAB?.status).toBe("leadership_vacant");
    expect(snap.factionStates.FAC_LAB_A?.chairId).toBeNull();
    expect(snap.factionStates.FAC_LAB_A?.status).toBe("chair_vacant");
    expect(
      Object.values(snap.partyContests).some(
        (c) => c.type === "party_leadership" || c.type === "faction_chair",
      ),
    ).toBe(false);
  });

  it("A1: retired or wrong-party canonical officeholders are not seeded active", () => {
    const world = partyMiniWorld("MIG-RET");
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const v2 = stripToV2(sim.serializeSave());
    const politicians = (
      v2.simulation as {
        politicians: Record<
          string,
          { retired: boolean; partyId: string | null; factionId: string | null }
        >;
      }
    ).politicians;
    politicians.P3.retired = true;
    politicians.P12.partyId = "PARTY_LAB";
    politicians.P12.factionId = null;
    const parsed = parseSaveFile(v2, "0.3.1-predev");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const snap = restoreSimulation(parsed.save, world).getSnapshot();
    expect(snap.partyStates.PARTY_LAB?.status).toBe("leadership_vacant");
    expect(snap.partyStates.PARTY_CR?.status).toBe("leadership_vacant");
    expect(snap.partyStates.PARTY_CR?.leaderId).toBeNull();
  });

  it("A2: rejects declaredDate after a resolved contest date", () => {
    const sim = simFor();
    const contestId = resolveLabLeadership(sim, ["P3", "P19"]);
    expectOk(sim, { type: "ADVANCE_TURN" });
    const snap = sim.getSnapshot();
    if (snap.pendingInterrupt) {
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
    const raw = jsonClone(sim.serializeSave()) as {
      simulation: {
        currentDate: string;
        partyContests: Record<
          string,
          { resolvedDate: string; entries: Record<string, { declaredDate: string | null }> }
        >;
      };
    };
    const contest = raw.simulation.partyContests[contestId]!;
    contest.entries.P3!.declaredDate = raw.simulation.currentDate;
    expect(contest.entries.P3!.declaredDate > contest.resolvedDate).toBe(true);
    expect(parsedSave(raw).ok).toBe(false);
  });

  it("A2: rejects an endorsement dated after the resolved contest", () => {
    const sim = simFor();
    expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_LAB",
      selectorMethod: "member_rcv",
    });
    const contestId = Object.values(sim.getSnapshot().partyContests).find(
      (c) => c.type === "party_leadership",
    )!.id;
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P4" });
    expectOk(sim, {
      type: "DEV_ENDORSE_PARTY_CONTEST_CANDIDATE",
      contestId,
      endorserId: "P19",
      targetId: "P3",
      endorserType: "politician",
    });
    expectOk(sim, { type: "DEV_OPEN_PARTY_CONTEST", contestId });
    expectOk(sim, { type: "DEV_RESOLVE_PARTY_CONTEST", contestId });
    expectOk(sim, { type: "ADVANCE_TURN" });
    const snap = sim.getSnapshot();
    if (snap.pendingInterrupt) {
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
    const raw = jsonClone(sim.serializeSave()) as {
      simulation: {
        currentDate: string;
        endorsements: Record<string, { date: string }>;
      };
    };
    const endId = Object.keys(raw.simulation.endorsements)[0]!;
    raw.simulation.endorsements[endId]!.date = raw.simulation.currentDate;
    expect(parsedSave(raw).ok).toBe(false);
  });

  it("A3: rejects non-string seedPresidentialStatus values", () => {
    const sim = simFor();
    const contestId = createdContestId(sim, "PARTY_LAB");
    expectOk(sim, { type: "DEV_DECLARE_PARTY_CONTEST_CANDIDACY", contestId, politicianId: "P3" });
    const raw = jsonClone(sim.serializeSave()) as {
      simulation: {
        partyContests: Record<string, { entries: Record<string, Record<string, unknown>> }>;
      };
    };
    const pid = "P3";
    raw.simulation.partyContests[contestId]!.entries[pid]!.seedPresidentialStatus = {
      status: "frontrunner",
    };
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[contestId]!.entries[pid]!.seedPresidentialStatus = 123;
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[contestId]!.entries[pid]!.seedPresidentialStatus = [];
    expect(parsedSave(raw).ok).toBe(false);
    raw.simulation.partyContests[contestId]!.entries[pid]!.seedPresidentialStatus = "frontrunner";
    expect(parsedSave(raw).ok).toBe(true);
  });

  it("A4: generic weighted_ranked_choice does not invent Labour 80/20", () => {
    const sim = simFor();
    const missing = sim.executeCommand({
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_NU",
      selectorMethod: "weighted_ranked_choice",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("SELECTOR_CONFIGURATION_REQUIRED");
    const created = expectOk(sim, {
      type: "DEV_CREATE_PARTY_CONTEST",
      contestType: "party_leadership",
      partyId: "PARTY_NU",
      selectorMethod: "weighted_ranked_choice",
      memberWeight: 0.7,
      affiliateUnionDelegateWeight: 0.3,
    });
    const contestId = created.ok ? String(created.events[0]?.payload.contestId ?? "") : "";
    const contest = sim.getSnapshot().partyContests[contestId]!;
    const groups = selectorateForRule(sim.world(), sim.getSnapshot(), contest);
    const member = groups.filter((g) => g.kind === "members");
    const union = groups.filter((g) => g.kind === "union_delegates");
    expect(member.length).toBeGreaterThan(0);
    expect(union.length).toBeGreaterThan(0);
    const labour = labourSelectorate(sim.world(), sim.getSnapshot(), "PARTY_LAB");
    const labourMemberW = labour
      .filter((g) => g.kind === "members")
      .reduce((a, g) => a + Number(g.weight.split("/")[0]) / Number(g.weight.split("/")[1]), 0);
    const nuMemberW = member.reduce(
      (a, g) => a + Number(g.weight.split("/")[0]) / Number(g.weight.split("/")[1]),
      0,
    );
    expect(Math.abs(nuMemberW - 0.7)).toBeLessThan(1e-9);
    expect(Math.abs(labourMemberW - 0.8)).toBeLessThan(1e-9);
  });
});
