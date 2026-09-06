import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import {
  LEGISLATIVE_PROVISIONS,
  policyItemForProvision,
  proposalOptionsFor,
} from "./legislature/provisions.js";
import { introduceBill } from "./legislature/procedure.js";
import { assessBillConstitutionality } from "./legislature/constitutionality.js";
import {
  policyIndexDelta,
  proposalSpecificIndexDelta,
} from "./economy/policy.js";

describe("Phase 11.4 law depth", () => {
  it("uses varied control hints across provisions", () => {
    const hints = new Set<string>();
    for (const definition of LEGISLATIVE_PROVISIONS) {
      for (const option of definition.options) {
        if (option.controlHint) hints.add(option.controlHint);
      }
    }
    expect(hints.has("categorical")).toBe(true);
    expect(hints.has("binary")).toBe(true);
    expect(hints.has("numeric")).toBe(true);
    expect(hints.has("threshold")).toBe(true);
    expect(hints.size).toBeGreaterThanOrEqual(4);
  });

  it("avoids keep-current labels on proposal options", () => {
    for (const definition of LEGISLATIVE_PROVISIONS) {
      for (const option of definition.options) {
        expect(option.label).not.toMatch(/^Keep\b/i);
        expect(option.label).not.toMatch(/keep current/i);
      }
    }
  });

  it("includes numeric duration and rate parameterValue on key labor and tax provisions", () => {
    const ui = policyItemForProvision("PROV_UNEMPLOYMENT_INSURANCE", "eighteen_week_benefits");
    const tax = policyItemForProvision("PROV_INCOME_TAX", "top_rate_45");
    const corp = policyItemForProvision("PROV_CORPORATE_TAX", "minimum_effective_tax");
    expect(ui).toBeTruthy();
    expect(tax).toBeTruthy();
    expect(corp).toBeTruthy();
    const uiOption = proposalOptionsFor("PROV_UNEMPLOYMENT_INSURANCE").find(
      (row) => row.id === "eighteen_week_benefits",
    );
    const taxOption = proposalOptionsFor("PROV_INCOME_TAX").find((row) => row.id === "top_rate_45");
    expect(uiOption?.parameterValue).toBe(18);
    expect(uiOption?.controlHint).toBe("numeric");
    expect(taxOption?.parameterValue).toBe(45);
    expect(taxOption?.controlHint).toBe("numeric");
  });

  it("blocks single-party registration bills under a multiparty constitutional order", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "LAW-CONST" });
    const state = jsonClone(sim.getSnapshot());
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("competitive_multiparty");
    const item = policyItemForProvision("PROV_ELECTION_ADMIN", "sole_party_registration");
    expect(item).toBeTruthy();
    const assessment = assessBillConstitutionality(state, world, [item!]);
    expect(assessment.status).toBe("constitutionally_unavailable");
    const introduced = introduceBill(
      world,
      state,
      { sponsorId: "MP02", policyItems: [item!] },
      "CMD_BLOCK",
    );
    expect("error" in introduced).toBe(true);
    if ("error" in introduced) {
      expect(introduced.error.code).toBe("CONSTITUTIONALLY_UNAVAILABLE");
    }
  });

  it("applies different proposal-specific effects when parameterValue differs at same direction", () => {
    const shorter = policyItemForProvision("PROV_UNEMPLOYMENT_INSURANCE", "eighteen_week_benefits")!;
    const longer = policyItemForProvision("PROV_UNEMPLOYMENT_INSURANCE", "twenty_six_week_benefits")!;
    expect(shorter.direction).toBeGreaterThan(0);
    expect(longer.direction).toBeGreaterThan(0);
    const shorterFx = proposalSpecificIndexDelta(shorter);
    const longerFx = proposalSpecificIndexDelta(longer);
    expect(shorterFx?.fiscalPressure).toBeDefined();
    expect(longerFx?.fiscalPressure).toBeDefined();
    expect(longerFx!.fiscalPressure! > (shorterFx!.fiscalPressure ?? 0)).toBe(true);
    expect(policyIndexDelta(shorter).fiscalPressure).toBeCloseTo(shorterFx!.fiscalPressure! + 0.1 * 0.04, 5);
    expect(policyIndexDelta(longer).fiscalPressure).toBeCloseTo(longerFx!.fiscalPressure! + 0.16 * 0.04, 5);
  });

  it("allows varied proposal option counts with no global minimum quota", () => {
    const counts = LEGISLATIVE_PROVISIONS.map(
      (definition) => proposalOptionsFor(definition.id).length,
    );
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(5);
    // No forced padding: option counts may differ across subjects.
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
});
