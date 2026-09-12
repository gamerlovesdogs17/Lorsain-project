import { describe, expect, it } from "vitest";
import { addMonths } from "./calendar.js";
import {
  contentCooldownEligible,
  readContentCooldownRegistry,
  recordContentCooldown,
} from "./content/cooldown.js";
import { LEGISLATIVE_PROVISIONS, legislativeProvision } from "./legislature/provisions.js";
import { SCANDAL_TYPES } from "./politics/scandals.js";
import { EXECUTIVE_SITUATIONS } from "./governing/situations.js";
import { TRADE_TREATY_VARIANTS } from "./foreign/treaty-variants.js";
import { crisisEscalationProfile } from "./foreign/crisis-packages.js";
import {
  CAUCUS_PRESSURE_TEMPLATES,
  listPartyPriorities,
  ORG_LOBBY_CAMPAIGN_TEMPLATES,
  PARTY_PRIORITY_CATALOG,
} from "./partyOrg/catalog.js";
import { CAMPAIGN_SITUATIONS } from "./campaigns/situations.js";
import { JUDICIAL_DOCTRINE_LABELS, pickLawReviewQuestion } from "./courts/legalContent.js";
import { CONSTITUTION_CHANGE_SUBJECTS } from "./provinces/constitutionChanges.js";

const NEW_PROVISION_IDS = [
  "PROV_CROSS_BORDER_DATA",
  "PROV_TEMP_WORKER",
  "PROV_CONSUMER_FINANCE",
  "PROV_BODY_CAMERA",
  "PROV_GAS_BRIDGE",
  "PROV_ALGORITHM_AUDIT",
  "PROV_DEPOSIT_INSURANCE",
  "PROV_COMMUNITY_POLICING",
] as const;

describe("Phase 17B — wave 1 content", () => {
  it("registers new provision families with founding baselines", () => {
    for (const id of NEW_PROVISION_IDS) {
      const def = legislativeProvision(id);
      expect(def, id).not.toBeNull();
      expect(def!.options.filter((o) => o.founding).length).toBe(1);
      expect(def!.options.length).toBeGreaterThanOrEqual(4);
    }
    expect(LEGISLATIVE_PROVISIONS.length).toBeGreaterThanOrEqual(58);
  });

  it("content cooldown helper blocks until minMonths elapse", () => {
    const metadata: Record<string, unknown> = {};
    recordContentCooldown(metadata, "tpl_a", "2030-03-01");
    const registry = readContentCooldownRegistry(metadata);
    expect(contentCooldownEligible(registry, "tpl_a", "2030-05-01", 3)).toBe(false);
    expect(contentCooldownEligible(registry, "tpl_a", addMonths("2030-03-01", 3), 3)).toBe(true);
    expect(contentCooldownEligible(registry, "tpl_b", "2030-05-01", 6)).toBe(true);
  });

  it("includes scandal and executive situation catalogs", () => {
    expect(SCANDAL_TYPES.length).toBeGreaterThanOrEqual(6);
    expect(EXECUTIVE_SITUATIONS.length).toBeGreaterThanOrEqual(8);
  });

  it("defines distinct foreign crisis and trade packages", () => {
    expect(TRADE_TREATY_VARIANTS.length).toBeGreaterThanOrEqual(6);
    const trade = crisisEscalationProfile("trade dispute");
    const cyber = crisisEscalationProfile("cyber and espionage dispute");
    expect(trade.packageId).not.toBe(cyber.packageId);
    expect(trade.activeConflictThreshold).not.toBe(cyber.activeConflictThreshold);
  });
});

describe("Phase 17B — wave 2 content", () => {
  it("registers party, org, and caucus catalogs", () => {
    expect(PARTY_PRIORITY_CATALOG.provincial_fairness).toBeDefined();
    expect(PARTY_PRIORITY_CATALOG.digital_rights).toBeDefined();
    expect(listPartyPriorities().length).toBeGreaterThanOrEqual(22);
    expect(ORG_LOBBY_CAMPAIGN_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(CAUCUS_PRESSURE_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    const orgIds = new Set(ORG_LOBBY_CAMPAIGN_TEMPLATES.map((t) => t.id));
    expect(orgIds.size).toBe(ORG_LOBBY_CAMPAIGN_TEMPLATES.length);
  });

  it("adds campaign situations and court question variety", () => {
    expect(CAMPAIGN_SITUATIONS.some((s) => s.id === "foreign_policy_spotlight")).toBe(true);
    expect(CAMPAIGN_SITUATIONS.some((s) => s.id === "constitutional_reform_debate")).toBe(true);
    expect(CAMPAIGN_SITUATIONS.length).toBeGreaterThanOrEqual(13);
    expect(Object.keys(JUDICIAL_DOCTRINE_LABELS).length).toBeGreaterThanOrEqual(4);
    const q = pickLawReviewQuestion("Test Act", "ISS_LIBERTY", "LAW_TEST_1");
    expect(q).toMatch(/Whether|whether/);
    expect(q).not.toBe("Whether Test Act is constitutionally valid");
  });

  it("includes metro charter constitutional alternative", () => {
    const localGov = CONSTITUTION_CHANGE_SUBJECTS.find((s) => s.id === "art9_local_government");
    expect(localGov?.alternatives.some((a) => a.id === "metro_charter_cities")).toBe(true);
  });
});
