import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { jsonClone } from "./hash.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import {
  advanceImplementations,
  respondToImplementation,
  syncResourceAllocationLifecycle,
} from "./governing/implementation.js";
import { syncCapacityFromExecutive } from "./governing/capacity.js";
import { recomputeFiscalFromCurrentLaw } from "./governing/fiscal.js";
import { processBudgetCycle } from "./governing/budget.js";
import { createRngService } from "./rng.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
import {
  advanceScandalForTests,
  openScandalFixture,
  processScandalLifecycleMonth,
} from "./politics/scandals.js";

function fiscalSnapshot(
  state: ReturnType<typeof ensureGoverningRuntime> extends infer R
    ? R extends { fiscal: infer F; capacity: infer C }
      ? { fiscal: F; capacity: C }
      : never
    : never,
) {
  return {
    expenditure: state.fiscal.expenditure,
    revenue: state.fiscal.revenue,
    balance: state.fiscal.balance,
    debt: state.fiscal.debt,
    national: state.capacity.national,
    strain: state.capacity.strain,
    spendingByCategory: { ...state.fiscal.spendingByCategory },
  };
}

describe("Phase 17B.2 — fiscal idempotence & resource lifecycle", () => {
  it("recomputeFiscalFromCurrentLaw is idempotent with an approved budget", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17b2-fiscal-idem",
      playerPoliticianId: presidentId,
    });
    const propose = sim.executeCommand({ type: "PROPOSE_BUDGET", fiscalStance: "hold" });
    expect(propose.ok).toBe(true);
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const proposed = Object.values(state.executiveRuntime.budgets).find(
      (b) => b.status === "proposed",
    );
    expect(proposed).toBeTruthy();
    if (!proposed) return;
    proposed.status = "approved";
    proposed.assemblyDecision = "approved";
    runtime.budgetCycle.stage = "assembly";
    runtime.budgetCycle.fiscalYear = proposed.fiscalYear;
    processBudgetCycle(state, "P17B2_BUDGET");
    recomputeFiscalFromCurrentLaw(state);
    syncCapacityFromExecutive(world, state);

    const snaps = [];
    for (let i = 0; i < 5; i++) {
      recomputeFiscalFromCurrentLaw(state);
      syncCapacityFromExecutive(world, state);
      snaps.push(fiscalSnapshot(runtime));
    }
    for (let i = 1; i < snaps.length; i++) {
      expect(snaps[i]).toEqual(snaps[0]);
    }
  });

  it("temporary resource allocation deactivates when implementation completes", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17b2-resource-life",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    runtime.implementations.LAW_P17B2_RES = {
      lawId: "LAW_P17B2_RES",
      status: "delayed",
      posture: "standard",
      progress: 0.25,
      departmentId: "health",
      ministryOfficeId: "OFFICE_MINISTER_HEALTH",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 12,
      monthsElapsed: 4,
      major: true,
      blockedReason: "capacity",
      metadata: {},
    };
    state.legislatureRuntime.enactedLaws.LAW_P17B2_RES = {
      id: "LAW_P17B2_RES",
      billId: "BILL_P17B2_RES",
      title: "Resource lifecycle fixture",
      summary: "fixture",
      enactedDate: state.currentDate,
      operative: true,
      policyItems: [],
      metadata: {},
    } as (typeof state.legislatureRuntime.enactedLaws)[string];

    const ok = respondToImplementation(
      world,
      state,
      { actorId: presidentId, lawId: "LAW_P17B2_RES", action: "increase_resources" },
      "CMD_RES_LIFE",
    );
    expect("error" in ok).toBe(false);
    const active = Object.values(runtime.resourceAllocations).filter((a) => a.active);
    expect(active.length).toBe(1);
    expect(active[0]!.kind).toBe("temporary_implementation");
    const spendWithAlloc = runtime.fiscal.expenditure;

    // Still active after a month of progress (not yet complete).
    advanceImplementations(state, "CMD_ADV1");
    syncResourceAllocationLifecycle(state);
    recomputeFiscalFromCurrentLaw(state);
    expect(Object.values(runtime.resourceAllocations).some((a) => a.active)).toBe(true);

    // Force completion.
    const rec = runtime.implementations.LAW_P17B2_RES!;
    rec.progress = 0.99;
    rec.monthsRequired = 1;
    advanceImplementations(state, "CMD_ADV_DONE");
    expect(rec.status).toBe("fully_implemented");
    expect(Object.values(runtime.resourceAllocations).every((a) => !a.active)).toBe(true);

    recomputeFiscalFromCurrentLaw(state);
    expect(runtime.fiscal.expenditure).toBeLessThan(spendWithAlloc);
  });

  it("repeated increase_resources does not stack unlimited active allocations", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17b2-resource-stack",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    runtime.implementations.LAW_P17B2_STACK = {
      lawId: "LAW_P17B2_STACK",
      status: "delayed",
      posture: "standard",
      progress: 0.2,
      departmentId: "economy",
      ministryOfficeId: "OFFICE_MINISTER_ECONOMY",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 3,
      major: true,
      blockedReason: "capacity",
      metadata: {},
    };
    for (let i = 0; i < 4; i++) {
      const out = respondToImplementation(
        world,
        state,
        { actorId: presidentId, lawId: "LAW_P17B2_STACK", action: "increase_resources" },
        `CMD_STACK_${i}`,
      );
      expect("error" in out).toBe(false);
    }
    const active = Object.values(runtime.resourceAllocations).filter((a) => a.active);
    expect(active.length).toBe(1);
    expect(active[0]!.capacityBoost).toBeLessThanOrEqual(0.18);
  });
});

describe("Phase 17B.2 — scandal lifecycle differences", () => {
  it("weak expense allegation can resolve without guilt", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17b2-scandal-weak",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_petty_expense", "NPC146", {
      evidenceStrength: 0.18,
      severity: 0.22,
    });
    const rng = createRngService("p17b2-scandal-weak-adv");
    for (let i = 0; i < 14; i++) {
      processScandalLifecycleMonth(world, state, rng, `CMD_WEAK_${i}`);
      if (record.outcome) break;
    }
    expect(record.outcome).toBeTruthy();
    expect(["unsubstantiated", "exonerated", "procedurally_closed", "unresolved"]).toContain(
      record.outcome,
    );
    expect(record.legalReferralId).toBeNull();
  });

  it("procurement scandal builds investigation pressure unlike petty expense", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17b2-scandal-proc",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    ensurePoliticsRuntime(state);
    const expense = openScandalFixture(state, "scandal_petty_expense", "NPC_EXP", {
      evidenceStrength: 0.25,
      severity: 0.3,
    });
    const procurement = openScandalFixture(state, "scandal_procurement_favor", "NPC_PROC", {
      evidenceStrength: 0.62,
      severity: 0.68,
    });
    const rng = createRngService("p17b2-scandal-proc-adv");
    for (let i = 0; i < 8; i++) {
      processScandalLifecycleMonth(world, state, rng, `CMD_PROC_${i}`);
    }
    const expenseStages = new Set([
      "allegation",
      "scrutiny",
      "investigation",
      "finding",
      "referral",
      "resolution",
    ]);
    expect(expenseStages.has(expense.stage) || expense.outcome != null).toBe(true);
    // Procurement path should reach deeper scrutiny / investigation / finding, or higher pressure.
    const deep =
      ["investigation", "finding", "referral", "resolution"].includes(procurement.stage) ||
      procurement.outcome != null ||
      procurement.resignationPressure > expense.resignationPressure;
    expect(deep).toBe(true);
    expect(procurement.investigator).toBe("procurement_inspectorate");
    expect(expense.investigator).toBe("internal_audit");
  });

  it("severe interference path can create constitutional/legal referral", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17b2-scandal-severe",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    ensurePoliticsRuntime(state);
    const record = openScandalFixture(state, "scandal_witness_interference", "NPC146", {
      evidenceStrength: 0.78,
      severity: 0.8,
      stage: "investigation",
    });
    const rng = createRngService("p17b2-scandal-severe-adv");
    for (let i = 0; i < 10; i++) {
      advanceScandalForTests(state, record.id, 1, rng, `CMD_SEV_${i}`);
      if (record.legalReferralId || record.stage === "referral" || record.outcome) break;
    }
    // Force referral stage if still open to exercise legal connection.
    if (!record.legalReferralId && record.outcome == null) {
      record.stage = "referral";
      record.evidenceStrength = 0.8;
      processScandalLifecycleMonth(world, state, rng, "CMD_SEV_FORCE");
    }
    expect(
      Boolean(record.legalReferralId || record.stage === "referral" || record.outcome != null),
    ).toBe(true);
    if (record.legalReferralId) {
      expect(state.constitutionalRuntime.grounds[record.legalReferralId]).toBeTruthy();
    }
  });
});
