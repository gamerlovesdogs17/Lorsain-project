import { kernelOffice, syntheticWorld } from "../synthetic-world.js";
import { syntheticAgentProfile } from "../agents/profile.js";
import { regularElectionDate } from "../calendar.js";
import type { KernelWorld } from "../types.js";

/** Small Assembly world with no election interrupts, for 48-month legislative harnesses. */
export function legislativeHarnessWorld(seed = "LEGIS-HARNESS"): KernelWorld {
  const world = syntheticWorld(seed);
  world.scenarioStartDate = "2020-01-01";
  world.nextRegularPresidentialElectionDate = regularElectionDate(world.presidentialCalendar, 2043);
  world.nextRegularAssemblyElectionDate = regularElectionDate(world.assemblyCalendar, 2042);
  world.initialScheduled = [];
  world.issueIds = [
    "ISS_REFORM",
    "ISS_TAX",
    "ISS_WELFARE",
    "ISS_RIGHTS",
    "ISS_COURTS",
    "ISS_ALLIANCE",
  ];
  world.issueDimensions = {
    ISS_REFORM: "institutional",
    ISS_TAX: "economic",
    ISS_WELFARE: "economic-social",
    ISS_RIGHTS: "social",
    ISS_COURTS: "institutional",
    ISS_ALLIANCE: "foreign",
  };
  world.partyDefinitions = {
    PARTY_A: {
      partyId: "PARTY_A",
      name: "A",
      short: "A",
      organizationType: "membership_party",
      nominationRuleId: "none",
      factionIds: ["FAC_A1", "FAC_A2"],
      canonicalFactionShares: { FAC_A1: 0.6, FAC_A2: 0.4 },
    },
    PARTY_B: {
      partyId: "PARTY_B",
      name: "B",
      short: "B",
      organizationType: "membership_party",
      nominationRuleId: "none",
      factionIds: ["FAC_B1"],
      canonicalFactionShares: { FAC_B1: 1 },
    },
    PARTY_C: {
      partyId: "PARTY_C",
      name: "C",
      short: "C",
      organizationType: "membership_party",
      nominationRuleId: "none",
      factionIds: ["FAC_C1"],
      canonicalFactionShares: { FAC_C1: 1 },
    },
  };
  world.factionDefinitions = {
    FAC_A1: { factionId: "FAC_A1", partyId: "PARTY_A", name: "A1", share: 0.6 },
    FAC_A2: { factionId: "FAC_A2", partyId: "PARTY_A", name: "A2", share: 0.4 },
    FAC_B1: { factionId: "FAC_B1", partyId: "PARTY_B", name: "B1", share: 1 },
    FAC_C1: { factionId: "FAC_C1", partyId: "PARTY_C", name: "C1", share: 1 },
  };
  world.nominationRules = {};
  world.offices.OFFICE_SPEAKER = kernelOffice({
    id: "OFFICE_SPEAKER",
    kind: "speaker",
    requiresHolderKinds: ["assembly_member"],
  });
  const politicians = [...world.politicians];
  const terms = [...world.startingTerms];
  const parties = ["PARTY_A", "PARTY_B", "PARTY_C"] as const;
  const factions = {
    PARTY_A: ["FAC_A1", "FAC_A2"],
    PARTY_B: ["FAC_B1"],
    PARTY_C: ["FAC_C1"],
  } as const;
  for (let i = 1; i <= 36; i++) {
    const id = `MP${String(i).padStart(2, "0")}`;
    const partyId = parties[(i - 1) % 3]!;
    const facs = factions[partyId];
    const factionId = facs[(i - 1) % facs.length]!;
    politicians.push({ id, alive: true, retired: false, partyId, factionId });
    const officeId = `OFFICE_ASM_${id}`;
    world.offices[officeId] = kernelOffice({
      id: officeId,
      kind: "assembly_member",
      constituencyId: null,
    });
    terms.push({
      officeId,
      holderId: id,
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
    const economic =
      (partyId === "PARTY_A" ? 0.55 : partyId === "PARTY_B" ? -0.45 : 0.1) +
      (factionId.endsWith("2") ? -0.35 : 0.08) +
      ((i % 5) - 2) * 0.12;
    const social =
      (partyId === "PARTY_C" ? 0.6 : partyId === "PARTY_B" ? -0.4 : 0.05) +
      (factionId.endsWith("2") ? 0.25 : -0.12) +
      ((i % 7) - 3) * 0.08;
    const authority = (partyId === "PARTY_B" ? 0.45 : -0.1) + ((i % 4) - 1) * 0.1;
    const globalism =
      (partyId === "PARTY_C" ? 0.5 : partyId === "PARTY_A" ? 0.15 : -0.35) + ((i % 3) - 1) * 0.15;
    world.agentProfiles[id] = syntheticAgentProfile(id, {
      roleTypes: ["assembly_member"],
      ideology: {
        economic: Math.max(-1, Math.min(1, economic)),
        social: Math.max(-1, Math.min(1, social)),
        authority: Math.max(-1, Math.min(1, authority)),
        green: 0,
        nationalism: Math.max(-1, Math.min(1, -globalism)),
        globalism: Math.max(-1, Math.min(1, globalism)),
      },
      traits: {
        ambition: 0.45 + (i % 5) * 0.08,
        integrity: 0.5,
        ego: 0.4,
        riskTolerance: 0.4,
        sociability: 0.5,
        pragmatism: 0.35 + (i % 4) * 0.1,
        institutionalism: 0.4,
        partyLoyalty: 0.35 + (i % 6) * 0.1,
        factionLoyalty: factionId.endsWith("2") ? 0.7 : 0.4,
        retirementInclination: 0.1,
      },
      skills: {
        campaigning: 0.4,
        fundraising: 0.4,
        legislation: 0.4 + (i % 3) * 0.15,
        administration: 0.4,
        media: 0.4,
        negotiation: 0.4 + (i % 4) * 0.1,
      },
    });
  }
  terms.push({
    officeId: "OFFICE_SPEAKER",
    holderId: "MP01",
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
  world.agentProfiles.P1 = syntheticAgentProfile("P1", {
    roleTypes: ["president"],
    aiTier: "rich",
    ideology: {
      economic: -0.65,
      social: 0.15,
      authority: -0.2,
      green: 0.1,
      nationalism: 0.05,
      globalism: 0.25,
    },
  });
  world.politicians = politicians;
  world.startingTerms = terms;
  world.startingPartyLeaders = { PARTY_A: "MP01", PARTY_B: "MP02", PARTY_C: "MP03" };
  world.startingFactionChairs = { FAC_A1: "MP01", FAC_A2: "MP04", FAC_B1: "MP02", FAC_C1: "MP03" };
  world.legislativeConstitution = { assemblySeatCount: 36, assemblyAbsoluteMajority: 19 };
  for (const profile of Object.values(world.agentProfiles)) {
    const salience = { ...profile.issueSalience };
    for (const issueId of world.issueIds) {
      if (typeof salience[issueId] !== "number") salience[issueId] = 0.4;
    }
    profile.issueSalience = salience;
  }
  return world;
}
