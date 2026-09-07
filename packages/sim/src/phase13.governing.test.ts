import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld, advanceIntegrated } from "./integration/harness.js";
import { migrateSaveV20ToV21, parseSaveFile } from "./save.js";
import { SAVE_SCHEMA_VERSION, type SimState } from "./types.js";
import {
  setDepartmentCapacity,
  setProvinceCapacity,
  effectiveCapacity,
} from "./governing/capacity.js";
import { departmentForLawItems, departmentForProvision } from "./governing/departments.js";
import { recomputeFiscalFromCurrentLaw } from "./governing/fiscal.js";
import { forceBudgetFailure, processBudgetCycle } from "./governing/budget.js";
import { detectPolicyInteractions } from "./governing/interactions.js";
import { updateMinisterialPerformance } from "./governing/performance.js";
import { updatePromiseStatuses } from "./governing/promises.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import { emptyGoverningRuntime } from "./governing/types.js";
import { computeGovernmentRecord, refreshGovernmentRecord } from "./governing/record.js";
import { processGoverningMonth } from "./governing/monthly.js";
import {
  advanceImplementations,
  createImplementationRecord,
  setImplementationPosture,
  syncImplementationsFromLaws,
} from "./governing/implementation.js";
import type { EnactedLawRecord } from "./legislature/types.js";

function worldAndState(seed = "phase13-gov") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensureGoverningRuntime(state);
  return { world, sim, state };
}

function makeLaw(
  state: SimState,
  overrides: Partial<EnactedLawRecord> & { policyItems: EnactedLawRecord["policyItems"] },
): EnactedLawRecord {
  const id =
    overrides.id ?? `LAW_TEST_${Object.keys(state.legislatureRuntime.enactedLaws).length + 1}`;
  const law: EnactedLawRecord = {
    id,
    billId: overrides.billId ?? `BILL_${id}`,
    title: overrides.title ?? "Test Act",
    policyItems: overrides.policyItems,
    amendmentIds: [],
    floorVoteId: null,
    repassageVoteId: null,
    presidentialDisposition: "signed",
    enactedDate: overrides.enactedDate ?? state.currentDate,
    sponsorId: overrides.sponsorId ?? state.playerPoliticianId,
    eventIds: [],
    operative: overrides.operative ?? true,
    invalidatedByDecisionId: null,
    metadata: {},
  };
  state.legislatureRuntime.enactedLaws[id] = law;
  return law;
}

describe("Phase 13 governing foundation", () => {
  it("1. implementation stages progress over months", () => {
    const { state } = worldAndState("phase13-impl");
    const law = makeLaw(state, {
      policyItems: [
        {
          issueId: "ISS_LABOR",
          provisionId: "PROV_MINIMUM_WAGE",
          optionId: "living_wage_floor",
          direction: 1,
          magnitude: 0.4,
          fiscalImpact: 0.1,
        },
      ],
    });
    syncImplementationsFromLaws(state);
    const rec = ensureGoverningRuntime(state).implementations[law.id]!;
    expect(rec.status).toBe("enacted");
    expect(rec.progress).toBe(0);

    for (let i = 0; i < 4; i++) {
      state.currentDate = `${2028 + Math.floor(i / 12)}-${String((i % 12) + 2).padStart(2, "0")}-01`;
      ensureGoverningRuntime(state).lastGoverningMonth = null;
      advanceImplementations(state, "CMD_IMPL");
    }
    const after = ensureGoverningRuntime(state).implementations[law.id]!;
    expect(after.progress).toBeGreaterThan(0);
    expect(
      [
        "preparing",
        "partially_implemented",
        "substantially_implemented",
        "fully_implemented",
      ].includes(after.status),
    ).toBe(true);
  });

  it("2. low capacity slows implementation", () => {
    const { state: fastState } = worldAndState("phase13-cap-fast");
    const { state: slowState } = worldAndState("phase13-cap-slow");
    const items = [
      {
        issueId: "ISS_HOUSING" as const,
        provisionId: "PROV_PUBLIC_HOUSING",
        optionId: "build_to_rent_program",
        direction: 1,
        magnitude: 0.5,
        fiscalImpact: 0.2,
      },
    ];
    const lawFast = makeLaw(fastState, { id: "LAW_FAST", policyItems: items });
    const lawSlow = makeLaw(slowState, { id: "LAW_SLOW", policyItems: items });
    setDepartmentCapacity(fastState, "interior", 0.95);
    setDepartmentCapacity(slowState, "interior", 0.15);
    syncImplementationsFromLaws(fastState);
    syncImplementationsFromLaws(slowState);

    for (let i = 0; i < 6; i++) {
      const date = `2028-${String(i + 2).padStart(2, "0")}-01`;
      fastState.currentDate = date;
      slowState.currentDate = date;
      ensureGoverningRuntime(fastState).lastGoverningMonth = null;
      ensureGoverningRuntime(slowState).lastGoverningMonth = null;
      advanceImplementations(fastState, "CMD_F");
      advanceImplementations(slowState, "CMD_S");
    }

    const fast = ensureGoverningRuntime(fastState).implementations[lawFast.id]!.progress;
    const slow = ensureGoverningRuntime(slowState).implementations[lawSlow.id]!.progress;
    expect(effectiveCapacity(slowState, "interior")).toBeLessThan(
      effectiveCapacity(fastState, "interior"),
    );
    expect(fast).toBeGreaterThan(slow);
  });

  it("3. fiscal updates from current-law policy", () => {
    const { state } = worldAndState("phase13-fiscal");
    const before = recomputeFiscalFromCurrentLaw(state);
    makeLaw(state, {
      id: "LAW_TAX",
      policyItems: [
        {
          issueId: "ISS_WELFARE",
          provisionId: "PROV_CORPORATE_TAX",
          optionId: "rate_28_progressive",
          direction: 1,
          magnitude: 0.4,
          fiscalImpact: 0.2,
        },
      ],
    });
    // Push provision history so currentProvisionOption sees the option.
    state.legislatureRuntime.provisionHistory["PROV_CORPORATE_TAX"] = [
      {
        lawId: "LAW_TAX",
        optionId: "rate_28_progressive",
        enactedDate: state.currentDate,
        previousOptionId: null,
      },
    ];
    syncImplementationsFromLaws(state);
    const impl = ensureGoverningRuntime(state).implementations["LAW_TAX"]!;
    impl.progress = 1;
    impl.status = "fully_implemented";
    const after = recomputeFiscalFromCurrentLaw(state);
    expect(after.revenueBySource.corporate_tax).not.toBe(before.revenueBySource.corporate_tax);
    expect(after.lastUpdated).toBe(state.currentDate);
    expect(after.revenue).toBeGreaterThan(0);
    expect(after.expenditure).toBeGreaterThan(0);
  });

  it("4. budget passage / failure has defined consequence", () => {
    const { state } = worldAndState("phase13-budget");
    const year = Number(state.currentDate.slice(0, 4));
    state.executiveRuntime.budgets["BUD_PASS"] = {
      id: "BUD_PASS",
      fiscalYear: year,
      proposalDate: state.currentDate,
      allocations: { OFFICE_MINISTER_FINANCE: 1 },
      status: "approved",
      assemblyDecision: "approved",
      continuingSource: null,
      metadata: {},
    };
    ensureGoverningRuntime(state).budgetCycle.stage = "assembly";
    const passEvents = processBudgetCycle(state, "CMD_BUD_PASS");
    expect(passEvents.some((e) => e.type === "GOVERNING_BUDGET_PASSED")).toBe(true);
    expect(ensureGoverningRuntime(state).budgetCycle.stage).toBe("passed");

    const { state: failState } = worldAndState("phase13-budget-fail");
    const failEvents = forceBudgetFailure(failState, "political_crisis", "CMD_FAIL");
    expect(failEvents.some((e) => e.type === "GOVERNING_BUDGET_FAILED")).toBe(true);
    expect(ensureGoverningRuntime(failState).budgetCycle.failureConsequence).toBe(
      "political_crisis",
    );
    expect(
      ensureGoverningRuntime(failState).historyNotes.some((n) => n.includes("political crisis")),
    ).toBe(true);

    const contEvents = forceBudgetFailure(failState, "continuing_resolution", "CMD_CR");
    expect(contEvents.some((e) => e.type === "GOVERNING_BUDGET_CONTINUING")).toBe(true);
  });

  it("5. department ownership assigned on laws", () => {
    expect(departmentForProvision("PROV_MINIMUM_WAGE")).toBe("labour");
    expect(departmentForProvision("PROV_INCOME_TAX")).toBe("finance");
    expect(departmentForProvision("PROV_PRIMARY_CARE")).toBe("health");
    const dept = departmentForLawItems([
      {
        issueId: "ISS_LABOR",
        provisionId: "PROV_PAID_LEAVE",
        optionId: "sixteen_week_insurance",
        direction: 1,
        magnitude: 0.3,
        fiscalImpact: 0.1,
      },
      {
        issueId: "ISS_LABOR",
        provisionId: "PROV_MINIMUM_WAGE",
        optionId: "wage_floor_12",
        direction: 1,
        magnitude: 0.2,
        fiscalImpact: 0.05,
      },
    ]);
    expect(dept).toBe("labour");

    const { state } = worldAndState("phase13-dept");
    const law = makeLaw(state, {
      policyItems: [
        {
          issueId: "ISS_CLIMATE",
          provisionId: "PROV_CARBON_PRICE",
          optionId: "levy_65",
          direction: 1,
          magnitude: 0.3,
          fiscalImpact: 0.1,
        },
      ],
    });
    const rec = createImplementationRecord(law);
    expect(rec.departmentId).toBe("energy");
    expect(rec.ministryOfficeId).toBe("OFFICE_MINISTER_ENERGY");
  });

  it("6. policy contradiction / interaction detection", () => {
    const { state } = worldAndState("phase13-interact");
    makeLaw(state, {
      id: "LAW_RAIL_PRIV",
      policyItems: [
        {
          issueId: "ISS_OWNERSHIP",
          provisionId: "PROV_RAIL_OWNERSHIP",
          optionId: "open_access_private",
          direction: -1,
          magnitude: 0.4,
          fiscalImpact: -0.1,
        },
      ],
    });
    makeLaw(state, {
      id: "LAW_RAIL_PUB",
      policyItems: [
        {
          issueId: "ISS_OWNERSHIP",
          provisionId: "PROV_RAIL_OWNERSHIP",
          optionId: "public_operator",
          direction: 1,
          magnitude: 0.4,
          fiscalImpact: 0.1,
        },
      ],
    });
    const found = detectPolicyInteractions(state);
    expect(found.some((i) => i.kind === "contradiction")).toBe(true);
    expect(
      Object.values(ensureGoverningRuntime(state).interactions).some(
        (i) => i.kind === "contradiction",
      ),
    ).toBe(true);
  });

  it("7. save/load governingRuntime round-trip", () => {
    const { world, sim } = worldAndState("phase13-save");
    advanceIntegrated(sim, 3);
    const snap = sim.getSnapshot();
    expect(snap.governingRuntime).toBeTruthy();
    expect(snap.governingRuntime.fiscal.lastUpdated).toBeTruthy();

    const save = sim.serializeSave();
    expect(save.schemaVersion).toBe(22);
    const parsed = parseSaveFile(save, world.contentVersion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.simulation.governingRuntime.fiscal.lastUpdated).toBe(
      snap.governingRuntime.fiscal.lastUpdated,
    );
    expect(parsed.save.simulation.governingRuntime.lastGoverningMonth).toBe(
      snap.governingRuntime.lastGoverningMonth,
    );

    const restored = restoreSimulation(parsed.save, world);
    expect(restored.getSnapshot().governingRuntime.capacity.national).toBeGreaterThan(0);
    expect(restored.getSnapshot().schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it("8. accelerated posture raises strain vs phased", () => {
    const { state: accel } = worldAndState("phase13-strain-a");
    const { state: phased } = worldAndState("phase13-strain-p");
    const items = [
      {
        issueId: "ISS_HOUSING" as const,
        provisionId: "PROV_PUBLIC_HOUSING",
        optionId: "build_to_rent_program",
        direction: 1,
        magnitude: 0.5,
        fiscalImpact: 0.4,
      },
    ];
    const lawA = makeLaw(accel, { id: "LAW_ACCEL", policyItems: items });
    const lawP = makeLaw(phased, { id: "LAW_PHASE", policyItems: items });
    syncImplementationsFromLaws(accel);
    syncImplementationsFromLaws(phased);
    setImplementationPosture(accel, lawA.id, "accelerated");
    setImplementationPosture(phased, lawP.id, "phased");
    expect(ensureGoverningRuntime(accel).capacity.strain).toBeGreaterThan(
      ensureGoverningRuntime(phased).capacity.strain,
    );
  });

  it("9. province capacity damps implementation progress", () => {
    const { state: strong } = worldAndState("phase13-prov-strong");
    const { state: weak } = worldAndState("phase13-prov-weak");
    const items = [
      {
        issueId: "ISS_HOUSING" as const,
        provisionId: "PROV_PUBLIC_HOUSING",
        optionId: "build_to_rent_program",
        direction: 1,
        magnitude: 0.4,
        fiscalImpact: 0.2,
      },
    ];
    const lawS = makeLaw(strong, { id: "LAW_STRONG", policyItems: items });
    const lawW = makeLaw(weak, { id: "LAW_WEAK", policyItems: items });
    syncImplementationsFromLaws(strong);
    syncImplementationsFromLaws(weak);
    ensureGoverningRuntime(strong).implementations[lawS.id]!.metadata.provinceId = "PROV_01";
    ensureGoverningRuntime(weak).implementations[lawW.id]!.metadata.provinceId = "PROV_01";
    setProvinceCapacity(strong, "PROV_01", 0.95);
    setProvinceCapacity(weak, "PROV_01", 0.15);
    setDepartmentCapacity(strong, "interior", 0.7);
    setDepartmentCapacity(weak, "interior", 0.7);
    for (let i = 0; i < 5; i++) {
      strong.currentDate = `2028-${String(i + 2).padStart(2, "0")}-01`;
      weak.currentDate = `2028-${String(i + 2).padStart(2, "0")}-01`;
      ensureGoverningRuntime(strong).lastGoverningMonth = null;
      ensureGoverningRuntime(weak).lastGoverningMonth = null;
      advanceImplementations(strong, "CMD");
      advanceImplementations(weak, "CMD");
    }
    expect(ensureGoverningRuntime(strong).implementations[lawS.id]!.progress).toBeGreaterThan(
      ensureGoverningRuntime(weak).implementations[lawW.id]!.progress,
    );
  });

  it("10. promise status follows enacted law / implementation", () => {
    const { world, state } = worldAndState("phase13-promise");
    const partyId =
      state.politicians[state.playerPoliticianId]?.partyId ??
      Object.keys(state.partyStates).sort()[0]!;
    const promiseId = `PROM_${partyId}_ISS_LABOR_platform`;
    ensureGoverningRuntime(state).promises[promiseId] = {
      id: promiseId,
      partyId,
      issueId: "ISS_LABOR",
      direction: 0.5,
      status: "pending",
      source: "platform",
      relatedLawId: null,
      createdDate: state.currentDate,
      updatedDate: state.currentDate,
      notes: "test",
    };
    const law = makeLaw(state, {
      id: "LAW_LABOR_PROMISE",
      policyItems: [
        {
          issueId: "ISS_LABOR",
          provisionId: "PROV_MINIMUM_WAGE",
          optionId: "living_wage_floor",
          direction: 1,
          magnitude: 0.3,
          fiscalImpact: 0.1,
        },
      ],
    });
    syncImplementationsFromLaws(state);
    updatePromiseStatuses(world, state);
    expect(ensureGoverningRuntime(state).promises[promiseId]!.status).toBe("enacted");
    expect(ensureGoverningRuntime(state).promises[promiseId]!.relatedLawId).toBe(law.id);

    const impl = ensureGoverningRuntime(state).implementations[law.id]!;
    impl.progress = 0.8;
    impl.status = "substantially_implemented";
    updatePromiseStatuses(world, state);
    expect(ensureGoverningRuntime(state).promises[promiseId]!.status).toBe("implemented");
  });

  it("11. ministerial performance reflects capacity and implementation", () => {
    const { world, state } = worldAndState("phase13-minister");
    setDepartmentCapacity(state, "labour", 0.9);
    makeLaw(state, {
      id: "LAW_MIN_PERF",
      policyItems: [
        {
          issueId: "ISS_LABOR",
          provisionId: "PROV_MINIMUM_WAGE",
          optionId: "living_wage_floor",
          direction: 1,
          magnitude: 0.3,
          fiscalImpact: 0.1,
        },
      ],
    });
    syncImplementationsFromLaws(state);
    const labourLaw = Object.values(ensureGoverningRuntime(state).implementations).find(
      (r) => r.departmentId === "labour",
    );
    if (labourLaw) {
      labourLaw.progress = 0.9;
      labourLaw.status = "substantially_implemented";
    }
    const scores = updateMinisterialPerformance(world, state);
    expect(scores.length).toBeGreaterThan(0);
    const labour = scores.find((s) => s.departmentId === "labour");
    expect(labour?.score).toBeGreaterThan(0.5);
  });

  it("12. government record refreshes quarterly with light mood feedback", () => {
    const { world, state } = worldAndState("phase13-record");
    state.currentDate = "2028-04-01";
    ensureGoverningRuntime(state).services.administrativeDelivery = 0.8;
    ensureGoverningRuntime(state).services.healthcareAccess = 0.75;
    ensureGoverningRuntime(state).services.educationQuality = 0.74;
    ensureGoverningRuntime(state).fiscal.balance = 5;

    const events = refreshGovernmentRecord(world, state, "CMD_RECORD");
    expect(events.some((e) => e.type === "GOVERNMENT_RECORD_UPDATED")).toBe(true);
    const record = ensureGoverningRuntime(state).record;
    expect(record).not.toBeNull();
    expect(typeof record!.score).toBe("number");
    expect(record!.score).toBeGreaterThanOrEqual(-1);
    expect(record!.score).toBeLessThanOrEqual(1);
    expect(record!.lawsPassed).toBeGreaterThanOrEqual(0);

    const computed = computeGovernmentRecord(world, state);
    expect(computed.updatedDate).toBe(state.currentDate);

    // Off-quarter months skip.
    state.currentDate = "2028-05-01";
    expect(refreshGovernmentRecord(world, state, "CMD_RECORD2")).toEqual([]);
  });

  it("13. processGoverningMonth wires record refresh", () => {
    const { world, state } = worldAndState("phase13-month-record");
    state.currentDate = "2028-07-01";
    ensureGoverningRuntime(state).lastGoverningMonth = null;
    const events = processGoverningMonth(world, state, "CMD_GOV_MONTH");
    expect(events.some((e) => e.type === "GOVERNMENT_RECORD_UPDATED")).toBe(true);
    expect(ensureGoverningRuntime(state).record).not.toBeNull();
  });

  it("migrateSaveV20ToV21 seeds empty governingRuntime without fabricated history", () => {
    const legacy = {
      schemaVersion: 20,
      contentVersion: "test",
      simulation: {
        schemaVersion: 20,
        politicsRuntime: {},
      },
    };
    const migrated = migrateSaveV20ToV21(legacy) as {
      schemaVersion: number;
      simulation: { governingRuntime: ReturnType<typeof emptyGoverningRuntime> };
    };
    expect(migrated.schemaVersion).toBe(21);
    expect(migrated.simulation.governingRuntime.implementations).toEqual({});
    expect(migrated.simulation.governingRuntime.promises).toEqual({});
    expect(migrated.simulation.governingRuntime.agenda.items).toEqual([]);
    expect(migrated.simulation.governingRuntime.historyNotes).toEqual([]);
    expect(migrated.simulation.governingRuntime.lastGoverningMonth).toBeNull();
    expect(migrated.simulation.governingRuntime.record ?? null).toBeNull();
    expect(migrated.simulation.governingRuntime.capacity.provinces).toEqual({});
    expect(SAVE_SCHEMA_VERSION).toBe(22);
  });
});
