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
import { headlineFor, selectHeadlineWithCooldown } from "./media/monthly.js";
import { ARTICLE_STRUCTURES, articleStructureFor, buildArticleBody } from "./media/articleBody.js";
import { headlineOnCooldown } from "./media/types.js";
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

    it("uses event-specific budget templates instead of raw type wording", () => {
      const a = headlineFor("BUDGET_PROPOSED", framing, { fiscalYear: 2030 }, 0);
      const b = headlineFor("BUDGET_PROPOSED", framing, { fiscalYear: 2030 }, 1, {
        outletName: "Ledger",
      });
      expect(a.toLowerCase()).not.toContain("budget proposed reported");
      expect(b.toLowerCase()).not.toMatch(/^budget proposed\b/);
      expect(a).not.toBe(b);
    });

    it("fingerprints normalize Act suffixes", () => {
      expect(headlineFingerprint("Homes Delivery Act")).toBe(headlineFingerprint("homes delivery"));
    });

    it("cooldown reduces exact duplicate headlines in a recent window", () => {
      let keys: string[] = [];
      const produced: string[] = [];
      const framings: MediaStory["framing"][] = [
        "restrained",
        "critical",
        "sympathetic",
        "sensational",
      ];
      for (let i = 0; i < 24; i += 1) {
        const framingPick = framings[i % framings.length]!;
        const selected = selectHeadlineWithCooldown(
          "BUDGET_PROPOSED",
          framingPick,
          { fiscalYear: 2030 + (i % 3) },
          keys,
          {
            outletName: ["Ledger", "Record", "Direct", "Worker"][i % 4],
            outletId: `MED_${i % 4}`,
            provinceId: i % 2 === 0 ? "P03" : "FDV",
            date: `2030-${String((i % 12) + 1).padStart(2, "0")}-01`,
          },
        );
        produced.push(selected.headline);
        keys = selected.nextKeys;
      }

      const windowSize = 8;
      let windowExactDupes = 0;
      const recent: string[] = [];
      for (const h of produced) {
        const norm = headlineFingerprint(h);
        if (recent.includes(norm)) windowExactDupes += 1;
        recent.push(norm);
        if (recent.length > windowSize) recent.shift();
      }

      // Naive fixed-template generation without cooldown would collide heavily.
      const naive: string[] = [];
      for (let i = 0; i < 24; i += 1) {
        naive.push(headlineFor("BUDGET_PROPOSED", "restrained", { fiscalYear: 2030 }, 0));
      }
      let naiveWindowDupes = 0;
      const naiveRecent: string[] = [];
      for (const h of naive) {
        const norm = headlineFingerprint(h);
        if (naiveRecent.includes(norm)) naiveWindowDupes += 1;
        naiveRecent.push(norm);
        if (naiveRecent.length > windowSize) naiveRecent.shift();
      }

      expect(naiveWindowDupes).toBeGreaterThan(10);
      expect(windowExactDupes).toBeLessThan(naiveWindowDupes);
      expect(windowExactDupes).toBeLessThanOrEqual(2);
      expect(new Set(produced).size).toBeGreaterThan(8);
    });

    it("cooldown blocks structurally identical headlines with different years", () => {
      const first = selectHeadlineWithCooldown(
        "BUDGET_PROPOSED",
        "restrained",
        { fiscalYear: 2030 },
        [],
        { outletName: "Ledger" },
      );
      const twin = headlineFor("BUDGET_PROPOSED", "restrained", { fiscalYear: 2031 }, 0, {
        outletName: "Ledger",
      });
      expect(twin).not.toBe(first.headline);
      expect(headlineOnCooldown(first.nextKeys, "BUDGET_PROPOSED", twin)).toBe(true);
    });

    it("cooldown blocks thin event-wording wrappers of the same stem", () => {
      const withStem = ["w:stem:budget proposed"];
      expect(headlineOnCooldown(withStem, "BUDGET_PROPOSED", "budget proposed reported")).toBe(
        true,
      );
      expect(
        headlineOnCooldown(withStem, "BUDGET_PROPOSED", "Government tables the annual budget"),
      ).toBe(false);
    });
  });

  describe("article body structure diversity", () => {
    it("covers all five structures and keeps prose short", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 40; i += 1) {
        const structure = articleStructureFor({
          id: `NEWS-${String(i).padStart(8, "0")}`,
          outletId: `MED_${i % 3}`,
          category: "government",
          framing: "restrained",
        });
        seen.add(structure);
        const body = buildArticleBody({
          structure,
          headline: "Government tables the annual budget",
          date: "2030-01-01",
          category: "government",
          framing: "restrained",
          provinceHint: "Industrial Corridor",
          facts: ["Fiscal year: 2030"],
        });
        expect(body.length).toBeGreaterThanOrEqual(2);
        expect(body.join(" ").length).toBeLessThan(420);
      }
      expect(seen.size).toBe(ARTICLE_STRUCTURES.length);
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
