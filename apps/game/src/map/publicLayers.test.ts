import { describe, expect, it } from "vitest";
import type { CampaignState, KernelWorld, PollRecord, SimState } from "@lorsain/sim";
import { latestGeographicPoll, publicForecast, publicPolling } from "./publicLayers.js";

const campaign = { id: "CAMPAIGN_TEST", electionId: "ELEC_TEST", type: "presidential" } as unknown as CampaignState;
const world = { offices: {}, constituencyElectorate: {} } as unknown as KernelWorld;

function poll(id: string, date: string, provinceId: string, a: number, b: number): PollRecord {
  return {
    id,
    pollsterId: "POLLSTER_TEST",
    electionId: "ELEC_TEST",
    fieldStart: date,
    fieldEnd: date,
    publicationDate: date,
    geographyKind: "province",
    provinceId,
    constituencyId: null,
    method: "telephone",
    sampleSize: 1000,
    marginOfError: 0.03,
    firstPreference: [
      { politicianId: "A", partyId: "PARTY_A", share: a },
      { politicianId: "B", partyId: "PARTY_B", share: b },
    ],
    candidateSnapshot: [{ politicianId: "A", partyId: "PARTY_A" }, { politicianId: "B", partyId: "PARTY_B" }],
    houseEffectApplied: {},
    metadata: {},
  } as PollRecord;
}

describe("public campaign map layers", () => {
  it("uses the latest direct province poll and never a latent-support field", () => {
    const state = {
      currentDate: "2032-10-01",
      polls: {
        OLD: poll("OLD", "2032-08-01", "P01", 0.42, 0.58),
        NEW: poll("NEW", "2032-09-01", "P01", 0.56, 0.44),
      },
      elections: {},
      provincialRuntime: { elections: {}, assemblyElections: {} },
      officeTerms: {},
      politicians: {},
    } as unknown as SimState;
    expect(latestGeographicPoll(state, "ELEC_TEST", "province", "P01")?.id).toBe("NEW");
    const datum = publicPolling(state, campaign, "province", "P01");
    expect(datum.truth).toBe("poll");
    expect(datum.leaderPartyId).toBe("PARTY_A");
    expect(JSON.stringify(datum)).not.toMatch(/latent|supportBy/);
  });

  it("keeps unpolled geography neutral when no public historical basis exists", () => {
    const state = {
      currentDate: "2032-10-01",
      polls: {},
      elections: {},
      provincialRuntime: { elections: {}, assemblyElections: {}, provinces: {} },
      officeTerms: {},
      politicians: {},
    } as unknown as SimState;
    expect(publicPolling(state, campaign, "province", "P21").truth).toBe("no_data");
    expect(publicForecast(world, state, campaign, "province", "P21")).toMatchObject({ truth: "no_data", leaderPartyId: null });
  });
});
