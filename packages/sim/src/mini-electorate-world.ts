import { kernelOffice, syntheticWorld } from "./synthetic-world.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import { applyInstitutionalPublicIdeology } from "./elections/public-ideology.js";
import type { KernelWorld } from "./types.js";

export function miniElectorateWorld(): KernelWorld {
  const world = syntheticWorld("ELEC-MINI");
  world.offices.OFFICE_PRESIDENT = kernelOffice({
    id: "OFFICE_PRESIDENT",
    kind: "president",
    actingAllowed: true,
    incompatibleWithKinds: ["assembly_member", "governor", "minister"],
  });
  world.partyDefinitions = {
    PARTY_LAB: {
      partyId: "PARTY_LAB",
      name: "Labour",
      short: "LAB",
      organizationType: "membership_party",
      nominationRuleId: "none",
      factionIds: [],
      canonicalFactionShares: {},
    },
    PARTY_NU: {
      partyId: "PARTY_NU",
      name: "NU",
      short: "NU",
      organizationType: "membership_party",
      nominationRuleId: "none",
      factionIds: [],
      canonicalFactionShares: {},
    },
  };
  world.provinceIds = ["P01"];
  world.politicianHomeProvince = { P1: "P01", P2: "P01" };
  world.issueDimensions = { ISS_REFORM: "institutional" };
  world.issueIds = ["ISS_REFORM"];
  world.pollsters = {
    POLL_TEST: {
      id: "POLL_TEST",
      name: "Test",
      scope: "national",
      method: "online_panel",
      sampleSizeMin: 400,
      sampleSizeMax: 800,
      quality: 0.7,
      houseEffectsUnit: "vote_share_points",
      houseEffectsCentered: true,
      houseEffectsByParty: { PARTY_LAB: 0.02, PARTY_NU: -0.02 },
      cadence: "weekly",
    },
  };
  world.constituencyElectorate = {
    C001: {
      constituencyId: "C001",
      population: 100000,
      seats: 2,
      provincePopulationShares: [{ provinceId: "P01", share: 1 }],
      turnout2026: {
        totalPopulation: 100000,
        registeredElectorate: 75000,
        ballotsCast: 48000,
        turnoutRate: 0.64,
        invalidOrBlank: 600,
        validVoteValue: 47400,
      },
    },
  };
  world.voterBlocs = {
    C001_B01: {
      id: "C001_B01",
      constituencyId: "C001",
      archetype: "industrial_working_class",
      weight: 1,
      turnoutPropensity: 0.62,
      partyHabit: { PARTY_LAB: 0.7, PARTY_NU: 0.3 },
      ideology: {
        economic: 0.4,
        social: 0.1,
        authority: 0,
        green: -0.1,
        nationalism: 0,
        globalism: 0,
      },
      issueSalience: { ISS_REFORM: 0.8 },
    },
  };
  world.voterBlocIdsByConstituency = { C001: ["C001_B01"] };
  world.politicians = [
    { id: "P1", alive: true, retired: false, partyId: "PARTY_LAB", factionId: null },
    { id: "P2", alive: true, retired: false, partyId: "PARTY_NU", factionId: null },
    { id: "P3", alive: true, retired: false, partyId: "PARTY_LAB", factionId: null },
    { id: "P4", alive: true, retired: false, partyId: "PARTY_NU", factionId: null },
  ];
  world.agentProfiles.P1 = syntheticAgentProfile("P1", {
    roleTypes: ["president"],
    presidentialStatus: "frontrunner",
  });
  world.agentProfiles.P2 = syntheticAgentProfile("P2", { roleTypes: ["assembly_member"] });
  world.agentProfiles.P3 = syntheticAgentProfile("P3", { roleTypes: ["assembly_member"] });
  world.agentProfiles.P4 = syntheticAgentProfile("P4", { roleTypes: ["assembly_member"] });
  world.politicianHomeProvince = { P1: "P01", P2: "P01", P3: "P01", P4: "P01" };
  applyInstitutionalPublicIdeology(world);
  return world;
}
