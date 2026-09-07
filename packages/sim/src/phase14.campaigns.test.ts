import { describe, expect, it } from "vitest";
import { loadTerenaWorld } from "./integration/harness.js";
import { createSimulation } from "./engine.js";
import {
  attachNominationMethodMetadata,
  nominationMethodForCampaign,
  nominationMethodLabel,
  partyNominationMethod,
} from "./campaigns/nominations.js";
import { headlineFor } from "./media/monthly.js";
import type { CampaignState } from "./campaigns/types.js";

describe("Phase 14 campaign nomination helper", () => {
  it("resolves party nomination methods from content rules", () => {
    const world = loadTerenaWorld();
    const labour = partyNominationMethod(world, "PARTY_LAB");
    expect(labour).toBe("weighted_ranked_choice");
    expect(nominationMethodLabel(labour)).toMatch(/member/i);
  });

  it("attaches nominationMethod metadata to gubernatorial campaigns", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "nom-meta", playerPoliticianId: "NPC146" });
    const state = sim.getSnapshot();
    const partyId = state.politicians[state.playerPoliticianId]?.partyId ?? null;
    const method = partyNominationMethod(world, partyId, state);
    const campaign = {
      id: "CAMP_TEST",
      politicianId: state.playerPoliticianId,
      type: "gubernatorial",
      contestId: null,
      electionId: "ELEC_GOV",
      constituencyId: null,
      status: "active",
      launchedDate: state.currentDate,
      endedDate: null,
      predecessorCampaignId: null,
      cashOnHand: 0,
      totalRaised: 0,
      totalSpent: 0,
      fundraisingCapacity: 0.2,
      fieldOrganization: 0.1,
      mediaCapacity: 0.1,
      organizationByProvince: {},
      organizationByConstituency: {},
      recentEffects: [],
      debatePrep: 0,
      actionPointsRemaining: 2,
      actionPointsMax: 2,
      actionPointsMonth: null,
      strategy: { fundraising: 0.25, field: 0.25, media: 0.25, attack: 0.25 },
      metadata: { provinceId: "PROV_01" },
    } as CampaignState;
    const attached = attachNominationMethodMetadata(world, state, campaign);
    expect(attached).toBe(method);
    expect(campaign.metadata.nominationMethod).toBe(method);
    expect(nominationMethodForCampaign(world, state, campaign)).toBe(method);
  });
});

describe("Phase 14 debate news gate", () => {
  it("does not treat DEBATE_PREPARED as a held debate headline", () => {
    const framing = "restrained" as const;
    const prepared = headlineFor("DEBATE_PREPARED", framing, {
      notableMoment: "Candidates pressed housing costs",
    });
    expect(prepared.toLowerCase()).not.toContain("debate");
    const held = headlineFor("DEBATE_HELD", framing, {
      notableMoment: "Candidates pressed housing costs",
    });
    expect(held).toContain("housing");
  });
});
