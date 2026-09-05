import { describe, expect, it } from "vitest";
import { PROVINCIAL_BILL_SUBJECTS } from "./provinces/types.js";
import {
  provinceThemeLabel,
  preferredBillSubjects,
  PROVINCE_THEMES,
  PROVINCE_THEME_IDS,
  provinceThemeId,
} from "./provinces/themes.js";
import { headlineFingerprint, type MediaStory } from "./media/types.js";
import { headlineFor } from "./media/monthly.js";
import { CAMPAIGN_SITUATIONS } from "./campaigns/situations.js";
import { assignCrisisTheme } from "./foreign/crisis-emergence.js";
import type { BilateralRelation, ForeignCountryRuntime } from "./foreign/types.js";

function blankRuntime(over: Partial<ForeignCountryRuntime> = {}): ForeignCountryRuntime {
  return {
    countryId: "A",
    leaderId: null,
    posture: "normal",
    capabilities: {
      economic: 0.5,
      land: 0.5,
      air: 0.5,
      naval: 0.5,
      strategic: 0.5,
      cyber: 0.5,
      logistics: 0.5,
    },
    tradeExposure: 0.3,
    strategicGoals: [],
    institutionIds: [],
    activeSanctionIds: [],
    governmentStability: 0.6,
    economicCapacity: 0.5,
    economicTrend: 0,
    domesticPressure: 0.2,
    metadata: {},
    ...over,
  };
}

describe("Phase 11.4 — Content Expansion", () => {
  describe("PROVINCIAL_BILL_SUBJECTS", () => {
    it("contains at least 12 subjects", () => {
      expect(PROVINCIAL_BILL_SUBJECTS.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe("Province themes", () => {
    it("returns stable labels for known provinces", () => {
      expect(provinceThemeLabel("FDV")).toBe(PROVINCE_THEMES.capital_metro.label);
      expect(provinceThemeId("FDV")).toBe("capital_metro");
      expect(preferredBillSubjects("FDV").length).toBeGreaterThan(0);
      expect(PROVINCE_THEME_IDS.length).toBe(7);
    });
  });

  describe("headlineFor production generator", () => {
    const framing = "restrained" as MediaStory["framing"];

    it("uses campaign situation title when present", () => {
      const headline = headlineFor("CAMPAIGN_MESSAGE", framing, {
        title: "Field organization shows measurable strength",
      });
      expect(headline).toBe("Field organization shows measurable strength");
    });

    it("uses debate notableMoment only for DEBATE_HELD", () => {
      const debate = headlineFor("DEBATE_HELD", framing, {
        notableMoment: "Candidates pressed housing costs",
      });
      expect(debate).toContain("housing");
      const nonDebate = headlineFor("CAMPAIGN_MESSAGE", framing, {});
      expect(nonDebate.toLowerCase()).not.toContain("debate");
    });

    it("produces distinct headlines for different event families", () => {
      const bill = headlineFor("BILL_PASSED", framing, { title: "Homes Delivery Act" });
      const court = headlineFor("COURT_DECISION", framing, {
        caseType: "FEDERAL_PROVINCIAL_DISPUTE",
        disposition: "invalidated",
      });
      const election = headlineFor("PRESIDENTIAL_ELECTION_RESOLVED", framing, {});
      expect(new Set([bill, court, election]).size).toBe(3);
    });

    it("fingerprints normalize Act suffixes", () => {
      expect(headlineFingerprint("Homes Delivery Act")).toBe(headlineFingerprint("homes delivery"));
    });
  });

  describe("Campaign situations truthfulness", () => {
    it("registers situations without inventing concrete unrecorded events", () => {
      expect(CAMPAIGN_SITUATIONS.length).toBeGreaterThanOrEqual(8);
      const banned =
        /\b(debate|viral|dark-money|doubled|election-eve rally|endorsement council)\b/i;
      for (const situation of CAMPAIGN_SITUATIONS) {
        for (const title of situation.titles) {
          expect(title).not.toMatch(banned);
        }
      }
      expect(CAMPAIGN_SITUATIONS.some((s) => s.id === "debate_moment")).toBe(false);
    });
  });

  describe("Crisis theme truthfulness", () => {
    it("does not label non-neighbors as border incidents", () => {
      const theme = assignCrisisTheme(
        blankRuntime(),
        blankRuntime({ countryId: "B" }),
        {
          general: -5,
          trust: 0.4,
          securityTension: 0.2,
          economicTies: 0.1,
          lastUpdated: null,
        } satisfies BilateralRelation,
        false,
        false,
      );
      expect(theme.toLowerCase()).not.toContain("border");
    });

    it("uses sanctions theme when sanctions exist", () => {
      const theme = assignCrisisTheme(
        blankRuntime(),
        blankRuntime({ countryId: "B" }),
        {
          general: -5,
          trust: 0.4,
          securityTension: 0.4,
          economicTies: 0.2,
          lastUpdated: null,
        },
        true,
        true,
      );
      expect(theme.toLowerCase()).toContain("sanction");
    });

    it("uses border tension only for neighbors", () => {
      const theme = assignCrisisTheme(
        blankRuntime(),
        blankRuntime({ countryId: "B" }),
        {
          general: -5,
          trust: 0.4,
          securityTension: 0.2,
          economicTies: 0.1,
          lastUpdated: null,
        },
        true,
        false,
      );
      expect(theme.toLowerCase()).toContain("border");
    });
  });

  describe("SUBJECT_POLICY coverage", () => {
    it("covers every provincial subject", async () => {
      const { provincialPolicy } = await import("./provinces/politics.js");
      for (const subject of PROVINCIAL_BILL_SUBJECTS) {
        expect(provincialPolicy(subject).issueId.length).toBeGreaterThan(0);
      }
    });
  });
});
