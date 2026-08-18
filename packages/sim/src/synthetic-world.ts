import type { JsonObject } from "./json.js";
import type { KernelOffice, KernelWorld } from "./types.js";
import { expirationPolicyForKind } from "./offices.js";
import { syntheticAgentProfile } from "./agents/profile.js";
import { applyInstitutionalPublicIdeology } from "./elections/public-ideology.js";

export function kernelOffice(
  partial: Partial<KernelOffice> & Pick<KernelOffice, "id" | "kind">,
): KernelOffice {
  return {
    title: partial.title ?? partial.id,
    jurisdictionId: partial.jurisdictionId ?? "SYN",
    capacity: 1,
    constituencyId: null,
    provinceId: null,
    cityId: null,
    seatIndex: null,
    portfolio: null,
    incompatibleWithKinds: [],
    mayCoexistWithKinds: [],
    requiresHolderKinds: [],
    suspendWhenActingPresident: false,
    noPartyMembershipWhileServing: false,
    actingAllowed: partial.kind === "president",
    expirationPolicy: expirationPolicyForKind(partial.kind),
    ...partial,
  };
}

const empty: JsonObject = {};

export function syntheticWorld(seed = "KERNEL-SYN-01"): KernelWorld {
  const world: KernelWorld = {
    contentVersion: "0.3.1-predev",
    scenarioId: "SYNTHETIC_KERNEL",
    scenarioStartDate: "2000-01-01",
    canonicalSeed: seed,
    offices: {
      OFFICE_PRESIDENT: kernelOffice({
        id: "OFFICE_PRESIDENT",
        kind: "president",
        actingAllowed: true,
        incompatibleWithKinds: ["assembly_member"],
      }),
    },
    successionOfficeIds: ["OFFICE_PRESIDENT"],
    specialElectionMoreThanDays: 180,
    specialElectionWithinDays: 90,
    presidentElectActingWithinDays: 7,
    presidentialCalendar: {
      intervalYears: 5,
      month: 10,
      nthWeekday: 2,
      weekday: "saturday",
      anchorYear: 2018,
      assumptionMonth: 1,
      assumptionDay: 20,
      assumptionYearOffset: 1,
    },
    assemblyCalendar: {
      intervalYears: 4,
      month: 5,
      nthWeekday: 2,
      weekday: "sunday",
      anchorYear: 2026,
      assumptionMonth: 6,
      assumptionDay: 1,
      assumptionYearOffset: 0,
    },
    nextRegularPresidentialElectionDate: "2018-10-13",
    nextRegularAssemblyElectionDate: "2002-05-12",
    politicians: [
      { id: "P1", alive: true, retired: false, partyId: null, factionId: null },
      { id: "P2", alive: true, retired: false, partyId: null, factionId: null },
    ],
    startingTerms: [
      {
        officeId: "OFFICE_PRESIDENT",
        holderId: "P1",
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
    ],
    initialScheduled: [
      {
        dueDate: "2000-06-15",
        eventType: "SYNTHETIC_PING",
        payload: { n: 1 },
        priority: 50,
        blocking: false,
        requiresResolution: false,
        source: "fixture",
      },
      {
        dueDate: "2005-06-01",
        eventType: "SYNTHETIC_STOCHASTIC",
        payload: empty,
        priority: 50,
        blocking: false,
        requiresResolution: false,
        source: "fixture",
      },
    ],
    electedTermCounts: { P1: 1 },
    issueIds: ["ISS_REFORM"],
    agentProfiles: {
      P1: syntheticAgentProfile("P1", { roleTypes: ["president"], aiTier: "rich" }),
      P2: syntheticAgentProfile("P2"),
    },
    partyDefinitions: {},
    factionDefinitions: {},
    nominationRules: {},
    independentAggregatePartyId: "PARTY_IND",
    startingPartyLeaders: {},
    startingFactionChairs: {},
    provinceIds: [],
    politicianHomeProvince: {},
    constituencyProvinceShares: {},
    partyProvinceBaseline: {},
    provincialPartyOrganizations: {},
    presidentialEligibility: {
      minimumAge: 35,
      ageMeasuredOn: "presidential_election_day",
      termLimitElected: 2,
      mustResignOfficeKinds: ["constitutional_court_justice", "military"],
      mayCampaignOfficeKinds: {
        assembly_member: true,
        governor: true,
        minister: true,
        constitutional_court_justice: false,
        military: false,
      },
    },
    voterBlocs: {},
    voterBlocIdsByConstituency: {},
    constituencyElectorate: {},
    pollsters: {},
    issueDimensions: {},
    partyPublicIdeology: {},
    factionPublicIdeology: {},
    legislativeConstitution: { assemblySeatCount: 0, assemblyAbsoluteMajority: 1 },
    executiveConstitution: {
      assemblyCensureFraction: 0.55,
      regulationReviewDays: 60,
      emergencyInitialDays: 14,
      emergencyExtensionDays: 30,
      warUnilateralDays: 30,
    },
    courtConstitution: {
      judges: 9,
      termYears: 12,
      renewable: false,
      confirmationFraction: 0.6,
      recallReferralFraction: 0.6,
      recallVoteDays: 60,
    },
  };
  applyInstitutionalPublicIdeology(world);
  return world;
}
