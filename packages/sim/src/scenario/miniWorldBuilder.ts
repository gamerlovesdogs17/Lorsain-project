import type { ScenarioDocument, ScenarioPartySection } from "@lorsain/scenario";
import {
  regularElectionDate,
  TERENA_ASSEMBLY_CALENDAR,
  TERENA_PRESIDENTIAL_CALENDAR,
  type IsoDate,
} from "../calendar.js";
import { syntheticAgentProfile } from "../agents/profile.js";
import { applyInstitutionalPublicIdeology } from "../elections/public-ideology.js";
import { CANONICAL_ASSEMBLY_ELECTION_ID, CANONICAL_PRESIDENTIAL_ELECTION_ID } from "../elections/types.js";
import { kernelOffice } from "../synthetic-world.js";
import type { PartyDefinition } from "../parties/types.js";
import type { KernelWorld } from "../types.js";

function partyDef(p: ScenarioPartySection): PartyDefinition {
  return {
    partyId: p.id,
    name: p.name,
    short: p.abbreviation || p.id,
    organizationType: "membership_party",
    nominationRuleId: `${p.id}_NOM`,
    factionIds: [`${p.id}_MAIN`],
    canonicalFactionShares: { [`${p.id}_MAIN`]: 1 },
    color: p.color ?? null,
  };
}

/**
 * Builds a small but playable KernelWorld from a validated custom scenario document.
 * Used for QA fixtures and imported custom worlds (not Terena).
 */
export function buildMiniPlayableWorldFromScenario(doc: ScenarioDocument): KernelWorld {
  const start = doc.startDate as IsoDate;
  const jurisdiction = doc.contentSections.world?.jurisdictionId ?? "CUSTOM";
  const assemblySeats =
    doc.contentSections.constitution?.assemblySeats ??
    doc.contentSections.world?.assemblySeats ??
    24;
  const courtJudges =
    doc.contentSections.constitution?.courtJudges ??
    doc.contentSections.world?.courtJudges ??
    5;
  const absoluteMajority =
    doc.contentSections.constitution?.assemblyAbsoluteMajority ??
    Math.floor(assemblySeats / 2) + 1;

  const provinces =
    doc.contentSections.geography?.provinces?.map((p: { id: string }) => p.id) ??
    ["PRV_ALPHA", "PRV_BETA"];
  const parties = doc.contentSections.parties ?? [
    {
      id: "PARTY_A",
      name: "Alpine Unity",
      abbreviation: "AU",
      ideology: "centre",
      leaderId: "NPC_A1",
    },
    {
      id: "PARTY_B",
      name: "Coastal Reform",
      abbreviation: "CR",
      ideology: "reform",
      leaderId: "NPC_B1",
    },
    {
      id: "PARTY_C",
      name: "Highland Left",
      abbreviation: "HL",
      ideology: "labour",
      leaderId: "NPC_C1",
    },
  ];

  const startYear = Number(start.slice(0, 4));
  let presYear = TERENA_PRESIDENTIAL_CALENDAR.anchorYear;
  while (presYear <= startYear) presYear += TERENA_PRESIDENTIAL_CALENDAR.intervalYears;
  const nextPres = regularElectionDate(TERENA_PRESIDENTIAL_CALENDAR, presYear);
  let asmYear = TERENA_ASSEMBLY_CALENDAR.anchorYear;
  while (asmYear <= startYear) asmYear += TERENA_ASSEMBLY_CALENDAR.intervalYears;
  const nextAsm = regularElectionDate(TERENA_ASSEMBLY_CALENDAR, asmYear);

  const presidentId = parties[0]?.leaderId ?? "NPC_PRES";
  const speakerId = parties[1]?.leaderId ?? parties[0]?.leaderId ?? "NPC_SPK";

  const offices: KernelWorld["offices"] = {
    OFFICE_PRESIDENT: kernelOffice({
      id: "OFFICE_PRESIDENT",
      kind: "president",
      title: `President of ${doc.countryName}`,
      jurisdictionId: jurisdiction,
      actingAllowed: true,
      incompatibleWithKinds: ["assembly_member", "governor", "minister", "constitutional_court_justice"],
    }),
    OFFICE_SPEAKER: kernelOffice({
      id: "OFFICE_SPEAKER",
      kind: "speaker",
      title: "Speaker of the Assembly",
      jurisdictionId: jurisdiction,
    }),
  };

  const seatsPerConst = Math.max(1, Math.floor(assemblySeats / 2));
  const constituencies = ["C_NORTH", "C_SOUTH"];
  for (const [idx, constId] of constituencies.entries()) {
    offices[`OFFICE_ASM_${constId}`] = kernelOffice({
      id: `OFFICE_ASM_${constId}`,
      kind: "assembly_member",
      title: "Assembly Member",
      jurisdictionId: jurisdiction,
      constituencyId: constId,
      capacity: idx === 0 ? assemblySeats - seatsPerConst : seatsPerConst,
      incompatibleWithKinds: ["president", "governor", "constitutional_court_justice"],
    });
  }

  for (const [i, provinceId] of provinces.entries()) {
    offices[`OFFICE_GOV_${provinceId}`] = kernelOffice({
      id: `OFFICE_GOV_${provinceId}`,
      kind: "governor",
      title: `Governor of ${doc.contentSections.geography?.provinces?.[i]?.name ?? provinceId}`,
      jurisdictionId: jurisdiction,
      provinceId,
      incompatibleWithKinds: ["president", "assembly_member", "constitutional_court_justice"],
    });
  }

  for (let seat = 1; seat <= courtJudges; seat++) {
    offices[`OFFICE_COURT_${seat}`] = kernelOffice({
      id: `OFFICE_COURT_${seat}`,
      kind: "constitutional_court_justice",
      title: "Constitutional Court Justice",
      jurisdictionId: jurisdiction,
      seatIndex: seat,
      incompatibleWithKinds: ["president", "assembly_member", "governor", "minister"],
    });
  }

  const politicianIds = new Set<string>();
  for (const p of parties) politicianIds.add(p.leaderId);
  politicianIds.add(presidentId);
  politicianIds.add(speakerId);
  for (let i = 0; i < assemblySeats; i++) {
    politicianIds.add(`NPC_ASM_${String(i + 1).padStart(3, "0")}`);
  }
  for (let i = 0; i < courtJudges; i++) {
    politicianIds.add(`NPC_CRT_${String(i + 1).padStart(2, "0")}`);
  }
  for (const [i, provinceId] of provinces.entries()) {
    politicianIds.add(`NPC_GOV_${provinceId}`);
    if (!politicianIds.has(`NPC_GOV_${provinceId}`)) politicianIds.add(`NPC_GOV_${i}`);
  }

  const politicians = [...politicianIds].sort().map((id, idx) => ({
    id,
    alive: true,
    retired: false,
    partyId: parties[idx % parties.length]?.id ?? null,
    factionId: null as string | null,
  }));

  const agentProfiles: KernelWorld["agentProfiles"] = {};
  const defaultSalience = { ISS_GOVERNANCE: 0.5 };
  for (const p of politicians) {
    agentProfiles[p.id] = syntheticAgentProfile(p.id, {
      issueSalience: defaultSalience,
      roleTypes: p.id === presidentId ? ["president"] : p.id.startsWith("NPC_ASM") ? ["assembly_member"] : [],
    });
  }

  const partyDefinitions = Object.fromEntries(parties.map((p) => [p.id, partyDef(p)]));
  const factionDefinitions = Object.fromEntries(
    parties.map((p) => [
      `${p.id}_MAIN`,
      { factionId: `${p.id}_MAIN`, partyId: p.id, name: "Main", share: 1 },
    ]),
  );
  const nominationRules = Object.fromEntries(
    parties.map((p) => [
      `${p.id}_NOM`,
      {
        ruleId: `${p.id}_NOM`,
        partyId: p.id,
        method: "member_rcv" as const,
        memberWeight: 1,
        affiliateUnionDelegateWeight: null,
        assemblyCaucusEndorsementFraction: null,
        provincialOrganizationEndorsementsMin: null,
        memberNominationsRequired: false,
        memberNominationThresholdRequired: false,
        provincialNominationSupportRequired: false,
        supporterRegistrationRequired: false,
        automaticIncumbentRenomination: true,
        emergencySelectionAllowed: true,
        emergencySelectionAuthority: "party_committee" as const,
        emergencySelectionMethod: "committee_emergency" as const,
      },
    ]),
  );

  const startingTerms: KernelWorld["startingTerms"] = [
    {
      officeId: "OFFICE_PRESIDENT",
      holderId: presidentId,
      startDate: null,
      startKnown: false,
      endDate: null,
      accessionReason: "preexisting",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    },
    {
      officeId: "OFFICE_SPEAKER",
      holderId: speakerId,
      startDate: null,
      startKnown: false,
      endDate: null,
      accessionReason: "preexisting",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    },
  ];

  let asmIdx = 0;
  for (const constId of constituencies) {
    const officeId = `OFFICE_ASM_${constId}`;
    const cap = offices[officeId]?.capacity ?? 0;
    for (let s = 0; s < cap; s++) {
      asmIdx += 1;
      startingTerms.push({
        officeId,
        holderId: `NPC_ASM_${String(asmIdx).padStart(3, "0")}`,
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
    }
  }

  for (let seat = 1; seat <= courtJudges; seat++) {
    startingTerms.push({
      officeId: `OFFICE_COURT_${seat}`,
      holderId: `NPC_CRT_${String(seat).padStart(2, "0")}`,
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
  }

  for (const [i, provinceId] of provinces.entries()) {
    const govId = `NPC_GOV_${provinceId}`;
    startingTerms.push({
      officeId: `OFFICE_GOV_${provinceId}`,
      holderId: govId,
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
    if (!politicians.some((p) => p.id === govId)) {
      politicians.push({
        id: govId,
        alive: true,
        retired: false,
        partyId: parties[i % parties.length]?.id ?? null,
        factionId: null,
      });
      agentProfiles[govId] = syntheticAgentProfile(govId, {
        issueSalience: defaultSalience,
        roleTypes: ["governor"],
      });
    }
  }

  const foreign = doc.contentSections.foreignCountries ?? [];
  const worldCountries = Object.fromEntries(
    foreign.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        region: c.region ?? "",
        government: "Republic",
        population: 1_000_000,
        powerTier: "regional",
        alignment: "neutral",
        alignmentIds: [],
        neighborIds: [],
        relationWithTerena: c.relation ?? 0,
        mapPathId: c.id,
      },
    ]),
  );

  const world: KernelWorld = {
    contentVersion: doc.gameVersion ?? "0.3.0-predev",
    scenarioId: doc.scenarioId,
    scenarioName: doc.name,
    scenarioFormatVersion: doc.formatVersion,
    countryName: doc.countryName,
    scenarioStartDate: start,
    canonicalSeed: `${doc.scenarioId}-SEED`,
    offices,
    successionOfficeIds: ["OFFICE_SPEAKER"],
    specialElectionMoreThanDays: 180,
    specialElectionWithinDays: 90,
    presidentElectActingWithinDays: 7,
    presidentialCalendar: TERENA_PRESIDENTIAL_CALENDAR,
    assemblyCalendar: TERENA_ASSEMBLY_CALENDAR,
    nextRegularPresidentialElectionDate: nextPres,
    nextRegularAssemblyElectionDate: nextAsm,
    politicians,
    startingTerms,
    initialScheduled: [
      {
        dueDate: nextPres,
        eventType: "PRESIDENTIAL_ELECTION_DUE",
        payload: { electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID },
        priority: 0,
        blocking: true,
        requiresResolution: true,
        source: "CALENDAR_PRESIDENTIAL_REGULAR",
      },
      {
        dueDate: nextAsm,
        eventType: "ASSEMBLY_ELECTION_DUE",
        payload: { electionId: CANONICAL_ASSEMBLY_ELECTION_ID },
        priority: 0,
        blocking: true,
        requiresResolution: true,
        source: "CALENDAR_ASSEMBLY_REGULAR",
      },
    ],
    electedTermCounts: { [presidentId]: 1 },
    agentProfiles,
    issueIds: ["ISS_GOVERNANCE"],
    partyDefinitions,
    factionDefinitions,
    nominationRules,
    independentAggregatePartyId: "PARTY_IND",
    startingPartyLeaders: Object.fromEntries(parties.map((p) => [p.id, p.leaderId])),
    startingFactionChairs: Object.fromEntries(parties.map((p) => [`${p.id}_MAIN`, p.leaderId])),
    provinceIds: [...provinces],
    politicianHomeProvince: Object.fromEntries(
      politicians.map((p, i) => [p.id, provinces[i % provinces.length] ?? provinces[0] ?? "PRV_ALPHA"]),
    ),
    constituencyProvinceShares: {
      C_NORTH: provinces[0] ? [{ provinceId: provinces[0], share: 1 }] : [],
      C_SOUTH: provinces[1]
        ? [{ provinceId: provinces[1], share: 1 }]
        : provinces[0]
          ? [{ provinceId: provinces[0], share: 1 }]
          : [],
    },
    partyProvinceBaseline: {},
    provincialPartyOrganizations: {},
    presidentialEligibility: {
      minimumAge: 35,
      ageMeasuredOn: "presidential_election_day",
      termLimitElected: 2,
      mustResignOfficeKinds: ["constitutional_court_justice"],
      mayCampaignOfficeKinds: {
        assembly_member: true,
        governor: true,
        minister: true,
        constitutional_court_justice: false,
      },
    },
    voterBlocs: {},
    voterBlocIdsByConstituency: {},
    constituencyElectorate: {},
    pollsters: {},
    issueDimensions: { ISS_GOVERNANCE: "institutional" },
    partyPublicIdeology: {},
    factionPublicIdeology: {},
    legislativeConstitution: {
      assemblySeatCount: assemblySeats,
      assemblyAbsoluteMajority: absoluteMajority,
    },
    executiveConstitution: {
      assemblyCensureFraction:
        doc.contentSections.constitution?.ministerialCensureFraction ?? 0.55,
      regulationReviewDays: doc.contentSections.constitution?.regulationReviewDays ?? 60,
      emergencyInitialDays: 14,
      emergencyExtensionDays: 30,
      warUnilateralDays: 30,
    },
    courtConstitution: {
      judges: courtJudges,
      termYears: doc.contentSections.constitution?.courtTermYears ?? 10,
      renewable: false,
      confirmationFraction: 0.6,
      recallReferralFraction: 0.6,
      recallVoteDays: 60,
    },
    interestOrganizations: {},
    mediaOutlets: {},
    worldCountries,
    worldInstitutions: {},
    worldLeaders: {},
    worldLeadersByCountryId: {},
    terenaWorldCountryId: foreign[0]?.id ?? "W00",
  };

  if (Object.keys(worldCountries).length > 0) {
    const year = Number(start.slice(0, 4)) || 2026;
    let seq = 1;
    for (const country of Object.values(worldCountries).sort((a, b) => a.id.localeCompare(b.id))) {
      const id = `WLD${String(seq++).padStart(4, "0")}`;
      world.worldLeaders[id] = {
        id,
        countryId: country.id,
        name: `${country.name} Executive`,
        title: "Head of State",
        sinceYear: year - 2,
        governmentForm: country.government,
      };
      world.worldLeadersByCountryId[country.id] = id;
    }
  }

  applyInstitutionalPublicIdeology(world);
  return world;
}
