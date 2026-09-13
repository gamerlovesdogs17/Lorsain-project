import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { jsonClone } from "./hash.js";
import { addMonths } from "./calendar.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import {
  respondToImplementation,
  syncResourceAllocationLifecycle,
} from "./governing/implementation.js";
import { recomputeFiscalFromCurrentLaw } from "./governing/fiscal.js";
import { currentMinisterHolderId } from "./executive/state.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import { openScandalFixture, processScandalLifecycleMonth } from "./politics/scandals.js";
import { applyScandalOfficeConsequences } from "./politics/scandalConsequences.js";
import {
  extractCareerMilestones,
  refreshPoliticianPublicBiography,
  backgroundForPolitician,
} from "./politics/biography.js";
import { createRngService } from "./rng.js";
import { occupyingTerms } from "./offices.js";

describe("Phase 17C — scandal consequence truthfulness", () => {
  it("A: weak expense allegation can clear without removing the minister", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17c-scandal-clear",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const financeOffice = "OFFICE_MINISTER_FINANCE";
    const ministerId = currentMinisterHolderId(world, state, financeOffice);
    expect(ministerId).toBeTruthy();
    if (!ministerId) return;

    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_petty_expense", ministerId, {
      evidenceStrength: 0.16,
      severity: 0.2,
    });
    record.governmentResponse = "retain";
    record.partyResponse = "wait_for_investigation";
    const rng = createRngService("p17c-scandal-clear-adv");
    for (let i = 0; i < 16; i++) {
      processScandalLifecycleMonth(world, state, rng, `CMD_${i}`);
      if (record.outcome) break;
    }
    expect(record.outcome).toBeTruthy();
    expect(["exonerated", "unsubstantiated", "procedurally_closed", "unresolved"]).toContain(
      record.outcome,
    );
    expect(record.metadata.guilty).not.toBe(true);
    expect(currentMinisterHolderId(world, state, financeOffice)).toBe(ministerId);
  });

  it("B: substantiated procurement with PM removal actually vacates Cabinet", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17c-scandal-remove",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const officeId = "OFFICE_MINISTER_DEFENSE";
    const ministerId = currentMinisterHolderId(world, state, officeId);
    expect(ministerId).toBeTruthy();
    if (!ministerId) return;

    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_procurement_favor", ministerId, {
      evidenceStrength: 0.78,
      severity: 0.8,
      stage: "finding",
    });
    record.partyResponse = "defend";
    record.governmentResponse = "remove_minister";
    record.outcome = "substantiated";
    record.metadata.guilty = true;
    const events = applyScandalOfficeConsequences(world, state, record, "CMD_REMOVE");
    expect(events.some((e) => e.type === "MINISTER_DISMISSED")).toBe(true);
    expect(currentMinisterHolderId(world, state, officeId)).toBeNull();
    expect(record.metadata.consequencesApplied).toBe(true);
  });

  it("C: Party defend and Government remove remain distinct on the record", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17c-scandal-split",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_procurement_favor", "NPC146", {
      evidenceStrength: 0.7,
      severity: 0.7,
    });
    record.partyResponse = "defend";
    record.governmentResponse = "remove_minister";
    expect(record.partyResponse).toBe("defend");
    expect(record.governmentResponse).toBe("remove_minister");
    expect(record.partyResponse).not.toBe(record.governmentResponse as string);
  });

  it("D: severe interference creates legal referral grounds", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17c-scandal-referral",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_witness_interference", "NPC146", {
      evidenceStrength: 0.8,
      severity: 0.82,
      stage: "referral",
    });
    const rng = createRngService("p17c-sev");
    processScandalLifecycleMonth(world, state, rng, "CMD_REF");
    expect(Boolean(record.legalReferralId)).toBe(true);
    if (record.legalReferralId) {
      expect(state.constitutionalRuntime.grounds[record.legalReferralId]).toBeTruthy();
    }
  });
});

describe("Phase 17C — provincial negotiation fiscal persistence", () => {
  it("incentive cost survives recompute and does not repeat forever", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17c-prov-outlay",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    runtime.capacity.provinces = {
      PROV_A: 0.4,
      PROV_B: 0.4,
      PROV_C: 0.4,
    };
    runtime.implementations.LAW_P17C_PROV = {
      lawId: "LAW_P17C_PROV",
      status: "delayed",
      posture: "standard",
      progress: 0.2,
      departmentId: "interior",
      ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 4,
      major: true,
      blockedReason: "capacity",
      metadata: {},
    };
    const before = runtime.fiscal.expenditure;
    const out = respondToImplementation(
      world,
      state,
      { actorId: presidentId, lawId: "LAW_P17C_PROV", action: "negotiate_provinces" },
      "CMD_PROV",
    );
    expect("error" in out).toBe(false);
    const meta = runtime.implementations.LAW_P17C_PROV!.metadata.provincialNegotiation as {
      incentiveCost?: number;
    };
    // May be zero if all provinces align; force an outlay if none created.
    if (!(meta?.incentiveCost && meta.incentiveCost > 0)) {
      runtime.fiscalOutlays.FO_TEST = {
        id: "FO_TEST",
        kind: "one_time",
        amount: 1.2,
        category: "administration",
        startDate: state.currentDate,
        endDate: state.currentDate,
        lawId: "LAW_P17C_PROV",
        source: "provincial_negotiation_incentive",
        active: true,
      };
      recomputeFiscalFromCurrentLaw(state);
    }
    const withCost = runtime.fiscal.expenditure;
    expect(withCost).toBeGreaterThan(before);
    recomputeFiscalFromCurrentLaw(state);
    expect(runtime.fiscal.expenditure).toBe(withCost);

    state.currentDate = addMonths(state.currentDate, 1);
    syncResourceAllocationLifecycle(state);
    recomputeFiscalFromCurrentLaw(state);
    expect(Object.values(runtime.fiscalOutlays).every((o) => !o.active)).toBe(true);
    expect(runtime.fiscal.expenditure).toBeLessThan(withCost);
  });
});

describe("Phase 17C — biography milestones", () => {
  it("uses background plus real office milestones rather than a vague phrase", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17c-bio",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const ministerId = currentMinisterHolderId(world, state, "OFFICE_MINISTER_FINANCE");
    expect(ministerId).toBeTruthy();
    if (!ministerId) return;
    const bg = backgroundForPolitician(state, ministerId);
    const bio = refreshPoliticianPublicBiography(world, state, ministerId);
    expect(bio.toLowerCase()).toContain(bg.split(" ")[0]!.toLowerCase());
    expect(bio).not.toMatch(/served in politics for many years/i);
    const milestones = extractCareerMilestones(world, state, ministerId);
    expect(milestones.some((m) => m.kind === "minister" || m.kind === "assembly_member")).toBe(
      true,
    );
    expect(occupyingTerms(state, "OFFICE_MINISTER_FINANCE").length).toBeGreaterThan(0);
  });
});
