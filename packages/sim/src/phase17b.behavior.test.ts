import { describe, expect, it } from "vitest";
import { resolveConstitutionalRule, pickJudicialDoctrineLabel } from "./courts/legalContent.js";
import { matchOrgLobbyCampaignTemplate } from "./partyOrg/catalog.js";
import { provinceTradeShockDelta, isExportHeavyProvince } from "./provinces/tradeShock.js";
import type { ProvinceEconomicProfile } from "./economy/types.js";
import {
  crisisEscalationProfile,
  crisisRecommendedDiplomaticActions,
} from "./foreign/crisis-packages.js";
import {
  treatyRatificationVotePenalty,
  treatyRatificationAssemblyFractionOverride,
  TRADE_TREATY_VARIANTS,
} from "./foreign/treaty-variants.js";
import type { TreatyRecord } from "./foreign/types.js";
import { validatePhase17bContentCatalogs } from "./content/validate17b.js";

const exportHeavyProfile: ProvinceEconomicProfile = {
  provinceId: "P_EXPORT",
  starting: { conditionsIndex: 100, employmentIndex: 100, housingIndex: 100 },
  sectorExposure: {
    trade: 0.55,
    manufacturing: 0.25,
    services: 0.05,
    labor: 0,
    agriculture: 0.1,
    housing: 0.05,
  },
  sensitivity: { growth: 1, inflation: 0.8, housing: 0.7, trade: 1.2 },
  annualStructuralTrend: { conditions: 0, employment: 0, housing: 0 },
  character: "export hub",
};

const serviceHeavyProfile: ProvinceEconomicProfile = {
  provinceId: "P_SERVICE",
  starting: { conditionsIndex: 100, employmentIndex: 100, housingIndex: 100 },
  sectorExposure: {
    trade: 0.05,
    manufacturing: 0.05,
    services: 0.65,
    labor: 0.1,
    agriculture: 0,
    housing: 0.15,
  },
  sensitivity: { growth: 0.9, inflation: 0.9, housing: 1, trade: 0.75 },
  annualStructuralTrend: { conditions: 0, employment: 0, housing: 0 },
  character: "metro services",
};

describe("Phase 17B.2 — mechanical content behavior", () => {
  it("maps housing vs privacy laws to different constitutional rules", () => {
    const housing = resolveConstitutionalRule({
      caseType: "LAW_REVIEW",
      issueId: "ISS_HOUSING",
      challengedKind: "law",
    });
    const privacy = resolveConstitutionalRule({
      caseType: "LAW_REVIEW",
      issueId: "ISS_LIBERTY",
      provisionId: "PROV_CROSS_BORDER_DATA",
      challengedKind: "law",
    });
    expect(housing).toBe("federal_provincial_competence");
    expect(privacy).toBe("rights_limitation_review");
    expect(housing).not.toBe(privacy);
    const housingDoctrine = pickJudicialDoctrineLabel(housing, "case_housing");
    const privacyDoctrine = pickJudicialDoctrineLabel(privacy, "case_privacy");
    expect(housingDoctrine).not.toBe(privacyDoctrine);
  });

  it("gives union vs business different labor-bill lobby mechanics", () => {
    const provisions = ["PROV_UNION_RECOGNITION"];
    const union = matchOrgLobbyCampaignTemplate(
      "national trade union federation",
      "ISS_LABOR",
      "support",
      provisions,
    );
    const business = matchOrgLobbyCampaignTemplate(
      "business chamber federation",
      "ISS_LABOR",
      "oppose",
      provisions,
    );
    expect(union?.id).toBe("union_floor_whip");
    expect(business?.id).toBe("business_labor_compliance_push");
    expect(union?.preferAmendment).not.toBe(business?.preferAmendment);
    expect(union?.billPressureBonus).not.toBe(business?.billPressureBonus);
  });

  it("applies trade shocks more severely to export-heavy provinces", () => {
    expect(isExportHeavyProvince(exportHeavyProfile)).toBe(true);
    expect(isExportHeavyProvince(serviceHeavyProfile)).toBe(false);
    const shock = -2;
    const exportHit = provinceTradeShockDelta(exportHeavyProfile, shock);
    const serviceHit = provinceTradeShockDelta(serviceHeavyProfile, shock);
    expect(Math.abs(exportHit.employmentIndex)).toBeGreaterThan(
      Math.abs(serviceHit.employmentIndex),
    );
  });

  it("differentiates trade vs security crisis packages", () => {
    const trade = crisisEscalationProfile("trade dispute");
    const security = crisisEscalationProfile("military posturing");
    expect(trade.packageId).not.toBe(security.packageId);
    expect(trade.mediationDeescalateSteps).toBeGreaterThan(security.mediationDeescalateSteps);
    expect(crisisRecommendedDiplomaticActions("trade dispute")).toContain("trade_negotiation");
    expect(crisisRecommendedDiplomaticActions("military posturing")).toContain("posture_change");
    expect(crisisRecommendedDiplomaticActions("military posturing")).not.toContain(
      "trade_negotiation",
    );
  });

  it("consumes treaty ratification friction on the assembly path", () => {
    const lowFriction = TRADE_TREATY_VARIANTS.find((v) => v.id === "standard_market_access")!;
    const highFriction = TRADE_TREATY_VARIANTS.find((v) => v.id === "sanctions_carve_out_trade")!;
    const lowTreaty = {
      id: "T1",
      kind: "trade",
      metadata: { ratificationFriction: lowFriction.ratificationFriction },
    } as TreatyRecord;
    const highTreaty = {
      id: "T2",
      kind: "trade",
      metadata: { ratificationFriction: highFriction.ratificationFriction },
    } as TreatyRecord;
    expect(treatyRatificationVotePenalty(highTreaty)).toBeGreaterThan(
      treatyRatificationVotePenalty(lowTreaty),
    );
    expect(treatyRatificationAssemblyFractionOverride(highTreaty, 0)).toBeGreaterThan(
      treatyRatificationAssemblyFractionOverride(lowTreaty, 0),
    );
  });

  it("passes Phase 17B catalog validation", () => {
    expect(validatePhase17bContentCatalogs()).toEqual([]);
  });
});
