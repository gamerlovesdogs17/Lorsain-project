import { describe, expect, it } from "vitest";
import type { CampaignState, PollRecord, SimState } from "@lorsain/sim";
import {
  campaignPollScope,
  latestGeographicPoll,
  latestScopedPublicPoll,
  publicForecast,
  publicPolling,
} from "./publicLayers.js";

function emptyCampaign(partial: Partial<CampaignState> = {}): CampaignState {
  return {
    id: "CAMP_TEST",
    politicianId: "NPC_A",
    type: "presidential_nomination",
    status: "active",
    electionId: null,
    contestId: "CONTEST_LAB_NOM",
    startedDate: "2029-01-01",
    endedDate: null,
    warChest: 1,
    organizationStrength: 0.5,
    organizationByProvince: {},
    organizationByConstituency: {},
    fieldOrganization: 0.2,
    recentEffects: [],
    metadata: {},
    ...partial,
  } as CampaignState;
}

function poll(partial: Record<string, unknown>): PollRecord {
  return partial as unknown as PollRecord;
}

function dualPollState(): SimState {
  return {
    currentDate: "2029-01-01",
    polls: {
      POLL_GEN: poll({
        id: "POLL_GEN",
        publicationDate: "2029-01-01",
        geographyKind: "province",
        provinceId: "PROV_X",
        constituencyId: null,
        electionId: "ELEC_PRES",
        method: "telephone",
        sampleSize: 1000,
        marginOfError: 0.03,
        firstPreference: [
          { partyId: "PARTY_NU", politicianId: null, share: 0.55 },
          { partyId: "PARTY_LABOUR", politicianId: null, share: 0.2 },
        ],
        metadata: {},
      }),
      POLL_PRIM: poll({
        id: "POLL_PRIM",
        publicationDate: "2029-01-01",
        geographyKind: "province",
        provinceId: "PROV_X",
        constituencyId: null,
        electionId: null,
        method: "telephone",
        sampleSize: 800,
        marginOfError: 0.04,
        firstPreference: [
          { partyId: "PARTY_LABOUR", politicianId: "NPC_A", share: 0.7 },
          { partyId: "PARTY_LABOUR", politicianId: "NPC_B", share: 0.2 },
        ],
        metadata: { contestId: "CONTEST_LAB_NOM", purpose: "nomination" },
      }),
      POLL_GEN_NAT: poll({
        id: "POLL_GEN_NAT",
        publicationDate: "2029-01-02",
        geographyKind: "national",
        provinceId: null,
        constituencyId: null,
        electionId: "ELEC_PRES",
        method: "telephone",
        sampleSize: 1200,
        marginOfError: 0.03,
        firstPreference: [
          { partyId: "PARTY_NU", politicianId: "NPC_NU", share: 0.48 },
          { partyId: "PARTY_LABOUR", politicianId: "NPC_A", share: 0.41 },
        ],
        metadata: {},
      }),
      POLL_PRIM_NAT: poll({
        id: "POLL_PRIM_NAT",
        publicationDate: "2029-01-02",
        geographyKind: "national",
        provinceId: null,
        constituencyId: null,
        electionId: null,
        method: "telephone",
        sampleSize: 900,
        marginOfError: 0.04,
        firstPreference: [
          { partyId: "PARTY_LABOUR", politicianId: "NPC_A", share: 0.61 },
          { partyId: "PARTY_LABOUR", politicianId: "NPC_B", share: 0.29 },
        ],
        metadata: { contestId: "CONTEST_LAB_NOM", purpose: "nomination" },
      }),
    },
    elections: {},
    provincialRuntime: { elections: {}, assemblyElections: {}, provinces: {} },
    officeTerms: {},
    politicians: {
      NPC_A: { partyId: "PARTY_LABOUR", alive: true, retired: false },
      NPC_B: { partyId: "PARTY_LABOUR", alive: true, retired: false },
    },
    candidateStanding: {},
    endorsements: {},
    organizationRuntime: {
      actors: {},
      meetingsThisMonth: 0,
      lastMonthProcessed: null,
      metadata: {},
    },
    economyRuntime: {
      national: {
        outputIndex: 100,
        employmentIndex: 100,
        priceIndex: 100,
        realWageIndex: 100,
        housingIndex: 100,
        confidenceIndex: 100,
        fiscalPressure: 0.4,
      },
      history: [],
      provinces: { PROV_X: { conditionsIndex: 100, employmentIndex: 100, housingIndex: 100 } },
      provinceHistory: { PROV_X: [] },
      sectors: {},
      sectorHistory: {},
    },
  } as unknown as SimState;
}

describe("campaign map contest isolation", () => {
  it("primary contestId selects nomination poll not general opposing party", () => {
    const state = dualPollState();

    const primaryPoll = latestGeographicPoll(state, null, "province", "PROV_X", "CONTEST_LAB_NOM");
    expect(primaryPoll?.id).toBe("POLL_PRIM");

    const datum = publicPolling(state, emptyCampaign(), "province", "PROV_X");
    expect(datum.truth).toBe("poll");
    expect(datum.leaderPartyId).toBe("PARTY_LABOUR");
    expect(datum.leaderPartyId).not.toBe("PARTY_NU");
  });

  it("general campaign ignores leftover nomination contestId on the campaign record", () => {
    const state = dualPollState();
    const general = emptyCampaign({
      type: "presidential_general",
      electionId: "ELEC_PRES",
      contestId: "CONTEST_LAB_NOM",
    });
    expect(campaignPollScope(general)).toEqual({
      contestId: null,
      electionId: "ELEC_PRES",
    });

    const datum = publicPolling(state, general, "province", "PROV_X");
    expect(datum.truth).toBe("poll");
    expect(datum.leaderPartyId).toBe("PARTY_NU");

    const scoped = latestScopedPublicPoll(state, { electionId: "ELEC_PRES" });
    expect(scoped?.id).toBe("POLL_GEN_NAT");
    expect(latestScopedPublicPoll(state, { contestId: "CONTEST_LAB_NOM" })?.id).toBe(
      "POLL_PRIM_NAT",
    );
  });

  it("forecast for nomination campaigns does not blend opposing-party general polls", () => {
    const state = dualPollState();
    const world = {
      offices: {},
      constituencyElectorate: {},
      partyDefinitions: {},
      factionDefinitions: {},
      provincialPartyOrganizations: {},
      interestOrganizations: {},
    } as never;

    const forecast = publicForecast(world, state, emptyCampaign(), "province", "PROV_X");
    expect(forecast.truth).toBe("forecast");
    expect(forecast.leaderPartyId).toBe("PARTY_LABOUR");
    expect(forecast.leaderPartyId).not.toBe("PARTY_NU");
  });
});
