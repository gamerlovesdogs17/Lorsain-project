import type { ScenarioDocument, ScenarioPartySection } from "@lorsain/scenario";
import { fractionFromPreset } from "@lorsain/scenario";
import { parseIsoDate, regularElectionDate, type IsoDate } from "../calendar.js";
import { syntheticAgentProfile } from "../agents/profile.js";
import { applyInstitutionalPublicIdeology } from "../elections/public-ideology.js";
import { presidentialElectionIdForDate } from "../elections/state.js";
import { kernelOffice } from "../synthetic-world.js";
import { resolveMiniWorldElectionSchedule } from "./miniWorldCalendars.js";
import type { PartyDefinition } from "../parties/types.js";
import type { KernelWorld } from "../types.js";

function partyDef(p: ScenarioPartySection): PartyDefinition {
  return {
    partyId: p.id,
    name: p.name,
    short: p.abbreviation || p.id,
    organizationType: "membership_party",
    nominationRuleId: `${p.id}_NOM`,
    factionIds: p.caucuses?.length ? p.caucuses.map((c) => c.id) : [`${p.id}_MAIN`],
    canonicalFactionShares: p.caucuses?.length
      ? Object.fromEntries(p.caucuses.map((c) => [c.id, c.supportShare ?? 1 / p.caucuses!.length]))
      : { [`${p.id}_MAIN`]: 1 },
    color: p.color ?? null,
  };
}

function roleTypesForPolitician(
  id: string,
  ctx: {
    presidentId: string;
    speakerId: string;
    governorIds: Set<string>;
    asmIds: Set<string>;
    courtIds: Set<string>;
    ministerIds: Set<string>;
  },
): string[] {
  if (id === ctx.presidentId) return ["president"];
  if (id === ctx.speakerId) return ["speaker"];
  if (ctx.governorIds.has(id)) return ["governor"];
  if (ctx.ministerIds.has(id)) return ["minister"];
  if (ctx.asmIds.has(id)) return ["assembly_member"];
  if (ctx.courtIds.has(id)) return ["constitutional_court_justice"];
  return [];
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
    doc.contentSections.constitution?.courtJudges ?? doc.contentSections.world?.courtJudges ?? 5;
  const absoluteMajority =
    doc.contentSections.constitution?.assemblyAbsoluteMajority ?? Math.floor(assemblySeats / 2) + 1;

  const provinceRows = doc.contentSections.geography?.provinces ?? [];
  const provinces =
    provinceRows.length > 0 ? provinceRows.map((p) => p.id) : ["PRV_ALPHA", "PRV_BETA"];

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

  const roster = doc.contentSections.people?.politicians ?? [];
  const gov = doc.contentSections.government;
  const presidentId =
    gov?.presidentId ??
    (doc.contentSections.constitution?.governmentForm === "parliamentary"
      ? (parties.find((p) => p.id !== parties[0]?.id)?.leaderId ?? parties[0]?.leaderId)
      : parties[0]?.leaderId) ??
    "NPC_PRES";
  const headOfGov = gov?.headOfGovernmentId ?? null;
  const speakerId =
    headOfGov && doc.contentSections.constitution?.governmentForm !== "presidential"
      ? headOfGov
      : (parties[1]?.leaderId ?? parties[0]?.leaderId ?? "NPC_SPK");

  const electionSchedule = resolveMiniWorldElectionSchedule(doc);
  const deferFirstElection = (cal: typeof electionSchedule.presidentialCalendar): IsoDate => {
    // Prefer the first on-cycle year at least ~2 years after start so:
    // - 12-month custom QA stays election-quiet
    // - 5-year Extended can still resolve a presidential cycle
    const startYear = parseIsoDate(start).year;
    let year = startYear + 2;
    while ((year - cal.anchorYear) % cal.intervalYears !== 0) year += 1;
    return regularElectionDate(cal, year);
  };
  const nextPres =
    (doc.contentSections.elections?.nextPresidentialElectionDate as IsoDate | undefined) ??
    deferFirstElection(electionSchedule.presidentialCalendar);
  const nextAsm =
    (doc.contentSections.elections?.nextAssemblyElectionDate as IsoDate | undefined) ??
    deferFirstElection(electionSchedule.assemblyCalendar);
  const nextPresidentialElectionId = presidentialElectionIdForDate(nextPres);
  const { presidentialCalendar, assemblyCalendar } = electionSchedule;

  const offices: KernelWorld["offices"] = {
    OFFICE_PRESIDENT: kernelOffice({
      id: "OFFICE_PRESIDENT",
      kind: "president",
      title: `President of ${doc.countryName}`,
      jurisdictionId: jurisdiction,
      actingAllowed: true,
      incompatibleWithKinds: [
        "assembly_member",
        "governor",
        "minister",
        "constitutional_court_justice",
      ],
    }),
    OFFICE_SPEAKER: kernelOffice({
      id: "OFFICE_SPEAKER",
      kind: "speaker",
      title: "Speaker of the Assembly",
      jurisdictionId: jurisdiction,
    }),
  };

  const constituencyRows = doc.contentSections.geography?.constituencies ?? [];
  const constituencies =
    constituencyRows.length > 0
      ? constituencyRows.map((c) => ({ id: c.id, seats: c.seats, provinceId: c.provinceId }))
      : [
          {
            id: "C_NORTH",
            seats: Math.max(1, Math.floor(assemblySeats / 2)),
            provinceId: provinces[0] ?? "PRV_ALPHA",
          },
          {
            id: "C_SOUTH",
            seats: assemblySeats - Math.max(1, Math.floor(assemblySeats / 2)),
            provinceId: provinces[1] ?? provinces[0] ?? "PRV_BETA",
          },
        ];

  for (const row of constituencies) {
    offices[`OFFICE_ASM_${row.id}`] = kernelOffice({
      id: `OFFICE_ASM_${row.id}`,
      kind: "assembly_member",
      title: "Assembly Member",
      jurisdictionId: jurisdiction,
      constituencyId: row.id,
      capacity: row.seats,
      incompatibleWithKinds: ["president", "governor", "constitutional_court_justice"],
    });
  }

  for (const [i, provinceId] of provinces.entries()) {
    offices[`OFFICE_GOV_${provinceId}`] = kernelOffice({
      id: `OFFICE_GOV_${provinceId}`,
      kind: "governor",
      title: `Governor of ${provinceRows[i]?.name ?? provinceId}`,
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

  const cabinet = gov?.cabinet ?? [];
  for (const entry of cabinet) {
    const officeId = `OFFICE_${entry.ministryId}`;
    offices[officeId] = kernelOffice({
      id: officeId,
      kind: "minister",
      title: entry.ministryId.replace(/^MIN_/, "").replace(/_/g, " "),
      jurisdictionId: jurisdiction,
      portfolio: entry.ministryId,
      incompatibleWithKinds: ["president", "constitutional_court_justice"],
    });
  }

  const asmIds = new Set<string>();
  const courtIds = new Set<string>();
  const governorIds = new Set<string>();
  const ministerIds = new Set(cabinet.map((c) => c.holderId));

  for (const p of roster.filter((x) => x.office === "assembly_member")) asmIds.add(p.id);
  for (const p of roster.filter((x) => x.office === "constitutional_court_justice"))
    courtIds.add(p.id);
  for (const p of roster.filter((x) => x.office === "governor")) governorIds.add(p.id);

  let asmSynthetic = 0;
  if (asmIds.size < assemblySeats) {
    for (let i = asmIds.size; i < assemblySeats; i++) {
      asmIds.add(`NPC_ASM_${String(i + 1).padStart(3, "0")}`);
      asmSynthetic += 1;
    }
  }
  if (courtIds.size < courtJudges) {
    for (let i = courtIds.size; i < courtJudges; i++) {
      courtIds.add(`NPC_CRT_${String(i + 1).padStart(2, "0")}`);
    }
  }
  for (const provinceId of provinces) {
    const fromRoster = roster.find(
      (p) => p.office === "governor" && p.provinceId === provinceId,
    )?.id;
    governorIds.add(fromRoster ?? `NPC_GOV_${provinceId}`);
  }

  const politicianIds = new Set<string>();
  for (const p of parties) politicianIds.add(p.leaderId);
  politicianIds.add(presidentId);
  politicianIds.add(speakerId);
  for (const id of asmIds) politicianIds.add(id);
  for (const id of courtIds) politicianIds.add(id);
  for (const id of governorIds) politicianIds.add(id);
  for (const id of ministerIds) politicianIds.add(id);
  for (const p of roster) politicianIds.add(p.id);

  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const politicians = [...politicianIds].sort().map((id, idx) => {
    const row = rosterById.get(id);
    return {
      id,
      alive: true,
      retired: false,
      partyId: row?.partyId ?? parties[idx % parties.length]?.id ?? null,
      factionId: null as string | null,
    };
  });

  const roleCtx = {
    presidentId,
    speakerId,
    governorIds,
    asmIds,
    courtIds,
    ministerIds,
  };

  const issueIdsSet = new Set<string>(["ISS_GOVERNANCE"]);
  for (const law of doc.contentSections.laws?.startingLaws ?? []) {
    for (const item of law.policyItems ?? []) issueIdsSet.add(item);
  }
  for (const org of doc.contentSections.organizations ?? []) {
    for (const item of org.issues) issueIdsSet.add(item);
  }

  const issueIds = [...issueIdsSet];
  const agentProfiles: KernelWorld["agentProfiles"] = {};
  const baselineIssueSalience = (): Record<string, number> => {
    const salience: Record<string, number> = {};
    for (const id of issueIds) salience[id] = id === "ISS_GOVERNANCE" ? 0.5 : 0.35;
    return salience;
  };

  for (const p of politicians) {
    agentProfiles[p.id] = syntheticAgentProfile(p.id, {
      issueSalience: baselineIssueSalience(),
      roleTypes: roleTypesForPolitician(p.id, roleCtx),
    });
  }

  const partyDefinitions = Object.fromEntries(parties.map((p) => [p.id, partyDef(p)]));
  const factionDefinitions: KernelWorld["factionDefinitions"] = {};
  for (const p of parties) {
    if (p.caucuses?.length) {
      for (const c of p.caucuses) {
        factionDefinitions[c.id] = {
          factionId: c.id,
          partyId: p.id,
          name: c.name,
          share: c.supportShare ?? 1 / p.caucuses.length,
        };
      }
    } else {
      factionDefinitions[`${p.id}_MAIN`] = {
        factionId: `${p.id}_MAIN`,
        partyId: p.id,
        name: "Main",
        share: 1,
      };
    }
  }
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
  const asmIdList = [...asmIds].sort();
  for (const row of constituencies) {
    const officeId = `OFFICE_ASM_${row.id}`;
    const cap = offices[officeId]?.capacity ?? 0;
    for (let s = 0; s < cap; s++) {
      const holderId = asmIdList[asmIdx] ?? `NPC_ASM_${String(asmIdx + 1).padStart(3, "0")}`;
      asmIdx += 1;
      startingTerms.push({
        officeId,
        holderId,
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

  const courtIdList = [...courtIds].sort();
  for (let seat = 0; seat < courtJudges; seat++) {
    startingTerms.push({
      officeId: `OFFICE_COURT_${seat + 1}`,
      holderId: courtIdList[seat] ?? `NPC_CRT_${String(seat + 1).padStart(2, "0")}`,
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

  for (const provinceId of provinces) {
    const govId = [...governorIds].find((id) => id.includes(provinceId)) ?? `NPC_GOV_${provinceId}`;
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
        partyId: parties[provinces.indexOf(provinceId) % parties.length]?.id ?? null,
        factionId: null,
      });
      agentProfiles[govId] = syntheticAgentProfile(govId, {
        issueSalience: baselineIssueSalience(),
        roleTypes: ["governor"],
      });
    }
  }

  for (const entry of cabinet) {
    startingTerms.push({
      officeId: `OFFICE_${entry.ministryId}`,
      holderId: entry.holderId,
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

  const foreign =
    doc.contentSections.foreign?.countries ?? doc.contentSections.foreignCountries ?? [];
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

  const interestOrganizations = Object.fromEntries(
    (doc.contentSections.organizations ?? []).map((o) => [
      o.id,
      {
        id: o.id,
        name: o.name,
        type: o.type,
        lean: "neutral",
        strength: 0.5,
        issues: o.issues,
        leanPartyIds: [],
      },
    ]),
  );

  const constituencyProvinceShares: KernelWorld["constituencyProvinceShares"] = {};
  for (const row of constituencies) {
    constituencyProvinceShares[row.id] = [{ provinceId: row.provinceId, share: 1 }];
  }

  const politicianHomeProvince: KernelWorld["politicianHomeProvince"] = {};
  for (const p of politicians) {
    const row = rosterById.get(p.id);
    if (row?.provinceId) {
      politicianHomeProvince[p.id] = row.provinceId;
    }
  }
  for (const [i, p] of politicians.entries()) {
    if (!politicianHomeProvince[p.id]) {
      politicianHomeProvince[p.id] = provinces[i % provinces.length] ?? provinces[0] ?? "PRV_ALPHA";
    }
  }

  const censureFraction = fractionFromPreset(
    doc.contentSections.constitution?.ministerialCensurePreset,
    doc.contentSections.constitution?.ministerialCensureFraction,
    0.55,
  );

  const issueDimensions = Object.fromEntries(issueIds.map((id) => [id, "institutional"]));

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
    presidentialCalendar,
    assemblyCalendar,
    nextRegularPresidentialElectionDate: nextPres,
    nextRegularAssemblyElectionDate: nextAsm,
    politicians,
    startingTerms,
    initialScheduled: [
      {
        dueDate: nextPres,
        eventType: "PRESIDENTIAL_ELECTION_DUE",
        payload: { electionId: nextPresidentialElectionId },
        priority: 0,
        blocking: true,
        requiresResolution: true,
        source: "CALENDAR_PRESIDENTIAL_REGULAR",
      },
    ],
    electedTermCounts: { [presidentId]: 1 },
    agentProfiles,
    issueIds,
    partyDefinitions,
    factionDefinitions,
    nominationRules,
    independentAggregatePartyId: "PARTY_IND",
    startingPartyLeaders: Object.fromEntries(parties.map((p) => [p.id, p.leaderId])),
    startingFactionChairs: Object.fromEntries(
      parties.flatMap((p) =>
        p.caucuses?.length
          ? p.caucuses.map((c) => [c.id, c.leaderId ?? p.leaderId] as const)
          : [[`${p.id}_MAIN`, p.leaderId] as const],
      ),
    ),
    provinceIds: [...provinces],
    politicianHomeProvince,
    constituencyProvinceShares,
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
    issueDimensions,
    partyPublicIdeology: {},
    factionPublicIdeology: {},
    legislativeConstitution: {
      assemblySeatCount: assemblySeats,
      assemblyAbsoluteMajority: absoluteMajority,
    },
    executiveConstitution: {
      assemblyCensureFraction: censureFraction,
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
    interestOrganizations,
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
      const fc = foreign.find((f) => f.id === country.id);
      const id = `WLD${String(seq++).padStart(4, "0")}`;
      world.worldLeaders[id] = {
        id,
        countryId: country.id,
        name: fc?.leaderName ?? `${country.name} Executive`,
        title: "Head of State",
        sinceYear: year - 2,
        governmentForm: country.government,
      };
      world.worldLeadersByCountryId[country.id] = id;
    }
  }

  void asmSynthetic;
  applyInstitutionalPublicIdeology(world);
  return world;
}
