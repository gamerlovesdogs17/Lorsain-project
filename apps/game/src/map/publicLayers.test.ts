import { describe, expect, it } from "vitest";
import type { CampaignState, KernelWorld, PollRecord, SimState } from "@lorsain/sim";
import {
  latestGeographicPoll,
  publicForecast,
  publicPolling,
  previousPublicResult,
} from "./publicLayers.js";

const campaign = {
  id: "CAMPAIGN_TEST",
  electionId: "ELEC_TEST",
  type: "presidential",
  politicianId: "POL_A",
  contestId: "CONTEST_TEST",
  organizationByProvince: {},
  organizationByConstituency: {},
  fieldOrganization: 0,
  recentEffects: [],
} as unknown as CampaignState;

const world = {
  offices: {},
  constituencyElectorate: {
    C01: { seats: 3, provincePopulationShares: [{ provinceId: "P01", share: 1 }] },
  },
  partyDefinitions: {},
  factionDefinitions: {},
  provincialPartyOrganizations: {},
  interestOrganizations: {},
} as unknown as KernelWorld;

function emptyEconomy() {
  return {
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
    provinces: {
      P01: { conditionsIndex: 100, employmentIndex: 100, housingIndex: 100 },
    },
    provinceHistory: { P01: [] },
    sectors: {},
    sectorHistory: {},
  };
}

function baseState(over: Record<string, unknown> = {}): SimState {
  return {
    currentDate: "2032-10-01",
    polls: {},
    elections: {},
    provincialRuntime: { elections: {}, assemblyElections: {}, provinces: {} },
    officeTerms: {},
    politicians: {
      POL_A: { partyId: "PARTY_A", alive: true, retired: false },
      POL_B: { partyId: "PARTY_B", alive: true, retired: false },
    },
    candidateStanding: {},
    endorsements: {},
    organizationRuntime: {
      actors: {},
      meetingsThisMonth: 0,
      lastMonthProcessed: null,
      metadata: {},
    },
    economyRuntime: emptyEconomy(),
    ...over,
  } as unknown as SimState;
}

function poll(
  id: string,
  date: string,
  geography: { kind: "province" | "constituency" | "national"; id?: string },
  a: number,
  b: number,
): PollRecord {
  return {
    id,
    pollsterId: "POLLSTER_TEST",
    electionId: "ELEC_TEST",
    fieldStart: date,
    fieldEnd: date,
    publicationDate: date,
    geographyKind: geography.kind,
    provinceId: geography.kind === "province" ? (geography.id ?? null) : null,
    constituencyId: geography.kind === "constituency" ? (geography.id ?? null) : null,
    method: "telephone",
    sampleSize: 1000,
    marginOfError: 0.03,
    firstPreference: [
      { politicianId: "POL_A", partyId: "PARTY_A", share: a },
      { politicianId: "POL_B", partyId: "PARTY_B", share: b },
    ],
    candidateSnapshot: [
      { politicianId: "POL_A", partyId: "PARTY_A" },
      { politicianId: "POL_B", partyId: "PARTY_B" },
    ],
    houseEffectApplied: {},
    metadata: {},
  } as PollRecord;
}

function assemblyCampaign(over: Partial<CampaignState> = {}): CampaignState {
  return {
    ...campaign,
    type: "assembly",
    ...over,
  } as CampaignState;
}

describe("public campaign map layers", () => {
  it("uses the latest direct province poll and never a latent-support field", () => {
    const state = baseState({
      polls: {
        OLD: poll("OLD", "2032-08-01", { kind: "province", id: "P01" }, 0.42, 0.58),
        NEW: poll("NEW", "2032-09-01", { kind: "province", id: "P01" }, 0.56, 0.44),
      },
    });
    expect(latestGeographicPoll(state, "ELEC_TEST", "province", "P01")?.id).toBe("NEW");
    const datum = publicPolling(state, campaign, "province", "P01");
    expect(datum.truth).toBe("poll");
    expect(datum.confidence).toBe("direct");
    expect(datum.leaderPartyId).toBe("PARTY_A");
    expect(JSON.stringify(datum)).not.toMatch(/latent|supportBy/);
  });

  it("keeps unpolled geography neutral when no public historical basis exists", () => {
    const state = baseState();
    expect(publicPolling(state, campaign, "province", "P21").truth).toBe("no_data");
    expect(publicForecast(world, state, campaign, "province", "P21")).toMatchObject({
      truth: "no_data",
      leaderPartyId: null,
      confidence: "none",
    });
  });

  it("keeps Polling, Forecast, and Previous semantically distinct", () => {
    const state = baseState({
      polls: {
        LOCAL: poll("LOCAL", "2032-09-20", { kind: "constituency", id: "C01" }, 0.58, 0.42),
      },
      elections: {
        ELEC_OLD: {
          id: "ELEC_OLD",
          type: "assembly",
          status: "resolved",
          date: "2030-06-01",
          assembly: {
            constituencyResults: {
              C01: {
                electedIds: ["POL_B", "POL_B2", "POL_B3"],
                partyByCandidate: {
                  POL_B: "PARTY_B",
                  POL_B2: "PARTY_B",
                  POL_B3: "PARTY_B",
                },
              },
            },
          },
        },
      },
    });
    const c = assemblyCampaign();
    const polling = publicPolling(state, c, "constituency", "C01");
    const forecast = publicForecast(world, state, c, "constituency", "C01");
    const previous = previousPublicResult(world, state, c, "constituency", "C01");
    expect(polling.truth).toBe("poll");
    expect(forecast.truth).toBe("forecast");
    expect(previous.truth).toBe("historical");
    expect(forecast.detail).toMatch(/Model estimate/);
    expect(forecast.detail).not.toMatch(/^Direct /);
    expect(polling.confidence).toBe("direct");
    expect(["high", "medium", "low"]).toContain(forecast.confidence);
  });

  it("lets a local poll overturn a previous certified lean", () => {
    const previousOnly = baseState({
      elections: {
        ELEC_OLD: {
          id: "ELEC_OLD",
          type: "assembly",
          status: "resolved",
          date: "2030-06-01",
          assembly: {
            constituencyResults: {
              C01: {
                electedIds: ["POL_B", "POL_B2", "POL_B3"],
                partyByCandidate: {
                  POL_B: "PARTY_B",
                  POL_B2: "PARTY_B",
                  POL_B3: "PARTY_B",
                },
              },
            },
          },
        },
      },
    });
    const withPoll = baseState({
      ...previousOnly,
      polls: {
        LOCAL: poll("LOCAL", "2032-09-20", { kind: "constituency", id: "C01" }, 0.62, 0.38),
      },
    });
    const c = assemblyCampaign();
    const fromPrevious = publicForecast(world, previousOnly, c, "constituency", "C01");
    const fromPoll = publicForecast(world, withPoll, c, "constituency", "C01");
    expect(fromPrevious.leaderPartyId).toBe("PARTY_B");
    expect(fromPrevious.confidence).toBe("low");
    expect(fromPoll.leaderPartyId).toBe("PARTY_A");
    expect(
      fromPoll.projectedSeats?.some((row) => row.partyId === "PARTY_A" && row.seats >= 2),
    ).toBe(true);
  });

  it("shifts the forecast when public candidate standing differs", () => {
    const stateWeak = baseState({
      polls: {
        NAT: poll("NAT", "2032-09-01", { kind: "national" }, 0.5, 0.5),
      },
      candidateStanding: {
        POL_A: {
          politicianId: "POL_A",
          nameRecognition: 0.35,
          favorability: 0.2,
          enthusiasm: 0.2,
          momentum: -0.1,
        },
      },
    });
    const stateStrong = baseState({
      polls: {
        NAT: poll("NAT", "2032-09-01", { kind: "national" }, 0.5, 0.5),
      },
      candidateStanding: {
        POL_A: {
          politicianId: "POL_A",
          nameRecognition: 0.85,
          favorability: 0.82,
          enthusiasm: 0.7,
          momentum: 0.45,
        },
      },
    });
    const weak = publicForecast(world, stateWeak, campaign, "province", "P01");
    const strong = publicForecast(world, stateStrong, campaign, "province", "P01");
    expect(strong.detail).toMatch(/standing/);
    expect(weak.leaderPartyId).not.toBe("PARTY_A");
    expect(strong.leaderPartyId).toBe("PARTY_A");
  });

  it("shifts the forecast when Ground Game organization is readable", () => {
    const bare = assemblyCampaign({
      organizationByConstituency: { C01: 0 },
      fieldOrganization: 0,
    });
    const organized = assemblyCampaign({
      organizationByConstituency: { C01: 0.72 },
      fieldOrganization: 0.4,
    });
    const state = baseState({
      polls: {
        // Slight B edge nationally; readable Ground Game can flip the local forecast.
        NAT: poll("NAT", "2032-09-01", { kind: "national" }, 0.48, 0.52),
      },
      elections: {
        ELEC_OLD: {
          id: "ELEC_OLD",
          type: "assembly",
          status: "resolved",
          date: "2030-06-01",
          assembly: {
            constituencyResults: {
              C01: {
                electedIds: ["POL_A", "POL_B"],
                partyByCandidate: {
                  POL_A: "PARTY_A",
                  POL_B: "PARTY_B",
                },
              },
            },
          },
        },
      },
    });
    const withoutOrg = publicForecast(world, state, bare, "constituency", "C01");
    const withOrg = publicForecast(world, state, organized, "constituency", "C01");
    expect(withOrg.detail).toMatch(/Ground Game/);
    expect(withoutOrg.leaderPartyId).toBe("PARTY_B");
    expect(withOrg.leaderPartyId).toBe("PARTY_A");
  });

  it("lowers confidence when the only local poll is stale", () => {
    const fresh = baseState({
      polls: {
        LOCAL: poll("LOCAL", "2032-09-20", { kind: "province", id: "P01" }, 0.57, 0.43),
      },
    });
    const stale = baseState({
      polls: {
        LOCAL: poll("LOCAL", "2032-03-01", { kind: "province", id: "P01" }, 0.57, 0.43),
      },
    });
    const freshForecast = publicForecast(world, fresh, campaign, "province", "P01");
    const staleForecast = publicForecast(world, stale, campaign, "province", "P01");
    expect(freshForecast.confidence).toBe("high");
    expect(freshForecast.detail).toMatch(/direct local poll/);
    expect(staleForecast.confidence).toBe("low");
    expect(staleForecast.detail).toMatch(/stale local poll/);
  });
});
