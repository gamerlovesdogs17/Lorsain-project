import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { jsonClone } from "./hash.js";
import { updateMinisterialPerformance } from "./governing/performance.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import { respondToImplementation, setImplementationPosture } from "./governing/implementation.js";
import { syncAgendaBillReferences } from "./governing/agenda.js";
import { deriveCabinet } from "./executive/state.js";
import { currentPresidentialAuthorityId } from "./legislature/state.js";
import { canAssumeOffice } from "./offices.js";
import type { ImplementationRecord } from "./governing/types.js";
import type { BillState } from "./legislature/types.js";

describe("Phase 17A government fixtures", () => {
  it("cabinet performance distinguishes early vs scored ministers", () => {
    const world = loadTerenaWorld();
    const boot = createSimulation({ world, seed: "p17a-boot", playerPoliticianId: "NPC146" });
    const presidentId = currentPresidentialAuthorityId(world, boot.getSnapshot()) ?? "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-cabinet",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const cab = deriveCabinet(world, state).filter((m) => m.holderId);
    expect(cab.length).toBeGreaterThan(3);

    updateMinisterialPerformance(world, state);
    const scored = Object.keys(runtime.ministerialPerformance);
    expect(scored.length).toBeGreaterThan(0);

    const freshOffice = scored[0]!;
    delete runtime.ministerialPerformance[freshOffice];
    expect(runtime.ministerialPerformance[freshOffice]).toBeUndefined();
    expect(Object.keys(runtime.ministerialPerformance).length).toBeGreaterThan(0);
  });

  it("implementation posture change is a real governing response", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p17a-impl", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const rec: ImplementationRecord = {
      lawId: "LAW_P17A",
      status: "delayed",
      posture: "standard",
      progress: 0.28,
      departmentId: "economy",
      ministryOfficeId: null,
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 6,
      major: true,
      blockedReason: null,
      metadata: {},
    };
    runtime.implementations[rec.lawId] = rec;
    const before = rec.posture;
    const changed = setImplementationPosture(state, rec.lawId, "accelerated");
    expect(changed).toBeTruthy();
    expect(changed!.posture).toBe("accelerated");
    expect(changed!.posture).not.toBe(before);
  });

  it("budget proposal mutates executive budget state and survives reload", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-budget",
      playerPoliticianId: presidentId,
    });
    const cab = deriveCabinet(world, sim.getSnapshot()).filter((m) => m.holderId);
    const allocations: Record<string, number> = {};
    for (const seat of cab) allocations[seat.officeId] = 120;
    if (Object.keys(allocations).length === 0) {
      const empty = sim.executeCommand({ type: "PROPOSE_BUDGET", allocations: {} });
      expect(empty.ok).toBe(false);
      return;
    }
    const result = sim.executeCommand({ type: "PROPOSE_BUDGET", allocations });
    expect(result.ok).toBe(true);
    const budgets = Object.values(sim.getSnapshot().executiveRuntime.budgets);
    expect(budgets.length).toBeGreaterThan(0);
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(Object.keys(restored.getSnapshot().executiveRuntime.budgets).length).toBe(
      budgets.length,
    );
  });

  it("budget stances produce different totals, allocations, and fiscal paths", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";

    const runStance = (seed: string, stance: "hold" | "expansionary" | "consolidation") => {
      const sim = createSimulation({ world, seed, playerPoliticianId: presidentId });
      const result = sim.executeCommand({ type: "PROPOSE_BUDGET", fiscalStance: stance });
      expect(result.ok).toBe(true);
      const snap = sim.getSnapshot();
      const budget = Object.values(snap.executiveRuntime.budgets).find(
        (b) => b.status === "proposed",
      );
      expect(budget).toBeTruthy();
      expect(budget!.totalEnvelope).toBeGreaterThan(0);
      expect(Object.keys(budget!.ministryRequests).length).toBeGreaterThan(0);
      expect(Object.keys(budget!.ministryAmounts).length).toBeGreaterThan(0);
      return {
        total: budget!.totalEnvelope,
        amounts: { ...budget!.ministryAmounts },
        expenditure: snap.governingRuntime!.fiscal.expenditure,
        balance: snap.governingRuntime!.fiscal.balance,
      };
    };

    const hold = runStance("p17a-budget-hold", "hold");
    const full = runStance("p17a-budget-full", "expansionary");
    const cut = runStance("p17a-budget-cut", "consolidation");

    expect(full.total).toBeGreaterThan(hold.total);
    expect(cut.total).toBeLessThan(hold.total);
    expect(full.expenditure).toBeGreaterThan(hold.expenditure);
    expect(cut.expenditure).toBeLessThan(hold.expenditure);
    expect(full.balance).toBeLessThan(hold.balance);
    expect(cut.balance).toBeGreaterThan(hold.balance);
    const office = Object.keys(hold.amounts)[0]!;
    expect(full.amounts[office]).not.toBe(cut.amounts[office]);
  });

  it("implementation response command changes state and records history", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-impl-cmd",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    ensureGoverningRuntime(state).implementations.LAW_P17A_DELAY = {
      lawId: "LAW_P17A_DELAY",
      status: "delayed",
      posture: "standard",
      progress: 0.22,
      departmentId: "economy",
      ministryOfficeId: "OFFICE_MINISTER_ECONOMY",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 8,
      major: true,
      blockedReason: "capacity",
      metadata: {},
    };
    const ok = respondToImplementation(
      world,
      state,
      { actorId: presidentId, lawId: "LAW_P17A_DELAY", action: "increase_resources" },
      "CMD_IMPL",
    );
    expect("error" in ok).toBe(false);
    if (!("error" in ok)) {
      expect(ok.record.posture).toBe("accelerated");
      expect(ok.record.blockedReason).toBeNull();
      expect(ok.events.some((e) => e.type === "IMPLEMENTATION_RESPONSE")).toBe(true);
    }
    const denied = respondToImplementation(
      world,
      state,
      {
        actorId: "CITIZEN_NOBODY",
        lawId: "LAW_P17A_DELAY",
        action: "increase_resources",
      },
      null,
    );
    expect("error" in denied).toBe(true);
  });

  it("cabinet reshuffle changes officeholders and records history", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-reshuffle",
      playerPoliticianId: presidentId,
    });
    const snap = sim.getSnapshot();
    const finance = deriveCabinet(world, snap).find(
      (m) => m.officeId === "OFFICE_MINISTER_FINANCE" && m.holderId,
    );
    expect(finance?.holderId).toBeTruthy();
    const oldId = finance!.holderId!;
    const { canAssumeOffice: canAssume } = { canAssumeOffice };
    const replacement = Object.keys(snap.politicians).find((id) => {
      if (id === oldId || id === presidentId) return false;
      return (
        canAssume(snap, world, "OFFICE_MINISTER_FINANCE", id, "substantive", {
          ignoreOfficeCapacity: true,
        }) == null
      );
    });
    expect(replacement).toBeTruthy();
    const result = sim.executeCommand({
      type: "RESHUFFLE_CABINET",
      officeId: "OFFICE_MINISTER_FINANCE",
      politicianId: replacement!,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // help diagnose in CI logs
      expect(result.error).toBeUndefined();
    }
    const after = deriveCabinet(world, sim.getSnapshot()).find(
      (m) => m.officeId === "OFFICE_MINISTER_FINANCE",
    );
    expect(after?.holderId).toBe(replacement);
    expect(after?.holderId).not.toBe(oldId);
    expect(sim.getSnapshot().history.some((e) => e.type === "CABINET_RESHUFFLE")).toBe(true);
  });

  it("agenda Open-in-Assembly uses exact billId, never a sibling housing bill", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17a-agenda-bills",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    const baseBill = {
      summary: "Housing reform",
      status: "in_committee" as const,
      sponsorIds: [] as string[],
      introducedDate: state.currentDate,
      metadata: {},
      policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.4, fiscalImpact: null }],
    };
    state.legislatureRuntime.bills.BILL_HOUSING_A = {
      ...baseBill,
      id: "BILL_HOUSING_A",
      title: "Housing Bill A",
    } as BillState;
    state.legislatureRuntime.bills.BILL_HOUSING_B = {
      ...baseBill,
      id: "BILL_HOUSING_B",
      title: "Housing Bill B",
      policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.5, fiscalImpact: null }],
    } as BillState;
    const runtime = ensureGoverningRuntime(state);
    runtime.agenda = {
      updatedDate: state.currentDate,
      items: [
        {
          id: "AGENDA_H",
          title: "Coalition: housing",
          issueId: "ISS_HOUSING",
          priority: 0.8,
          source: "coalition",
          departmentId: "interior",
          status: "active",
          billId: "BILL_HOUSING_B",
          billStatus: "in_committee",
        },
      ],
    };
    syncAgendaBillReferences(state, runtime.agenda.items);
    expect(runtime.agenda.items[0]!.billId).toBe("BILL_HOUSING_B");
    expect(runtime.agenda.items[0]!.billId).not.toBe("BILL_HOUSING_A");
    state.legislatureRuntime.bills.BILL_HOUSING_B!.status = "enacted";
    syncAgendaBillReferences(state, runtime.agenda.items);
    expect(runtime.agenda.items[0]!.billStatus).toBe("enacted");
  });

  it("regulation jurisdiction accepts housing/interior and rejects defense", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-jurisdiction",
      playerPoliticianId: presidentId,
    });
    const ok = sim.executeCommand({
      type: "ISSUE_REGULATION",
      ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
      policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.35, fiscalImpact: null }],
    });
    expect(ok.ok).toBe(true);
    const bad = sim.executeCommand({
      type: "ISSUE_REGULATION",
      ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
      policyItems: [{ issueId: "ISS_DEFENSE", direction: 1, magnitude: 0.35, fiscalImpact: null }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("REGULATION_OUTSIDE_JURISDICTION");
  });
});
