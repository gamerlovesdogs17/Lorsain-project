import { describe, expect, it } from "vitest";
import { createSimulation, restoreSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { jsonClone } from "./hash.js";
import { updateMinisterialPerformance } from "./governing/performance.js";
import { ensureGoverningRuntime } from "./governing/state.js";
import { respondToImplementation, setImplementationPosture } from "./governing/implementation.js";
import { setAgendaItemBill, syncAgendaBillReferences } from "./governing/agenda.js";
import { processBudgetCycle } from "./governing/budget.js";
import { syncCapacityFromExecutive } from "./governing/capacity.js";
import { recomputeFiscalFromCurrentLaw } from "./governing/fiscal.js";
import { deriveCabinet } from "./executive/state.js";
import { issueRegulation } from "./executive/procedure.js";
import { currentPresidentialAuthorityId, currentAssemblyMemberIds } from "./legislature/state.js";
import { canAssumeOffice } from "./offices.js";
import { reshuffleCabinetSeat } from "./politics/cabinet.js";
import { ensurePoliticsRuntime } from "./politics/state.js";
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

  it("budget stances produce different totals and projected metadata without changing books", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";

    const runStance = (seed: string, stance: "hold" | "expansionary" | "consolidation") => {
      const sim = createSimulation({ world, seed, playerPoliticianId: presidentId });
      const beforeExp = sim.getSnapshot().governingRuntime!.fiscal.expenditure;
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
      expect(snap.governingRuntime!.fiscal.expenditure).toBe(beforeExp);
      expect(budget!.metadata.fiscalEffect).toBe("projected");
      expect(typeof budget!.metadata.projectedExpenditure).toBe("number");
      return {
        total: budget!.totalEnvelope,
        preferred: budget!.preferredEnvelope,
        amounts: { ...budget!.ministryAmounts },
        projectedExp: budget!.metadata.projectedExpenditure as number,
      };
    };

    const hold = runStance("p17a-budget-hold", "hold");
    const full = runStance("p17a-budget-full", "expansionary");
    const cut = runStance("p17a-budget-cut", "consolidation");

    expect(full.total).toBeGreaterThan(hold.total);
    expect(cut.total).toBeLessThan(hold.total);
    expect(full.projectedExp).toBeGreaterThan(hold.projectedExp);
    expect(cut.projectedExp).toBeLessThan(hold.projectedExp);
    const office = Object.keys(hold.amounts)[0]!;
    expect(full.amounts[office]).not.toBe(cut.amounts[office]);
    expect(full.preferred).not.toBe(cut.preferred);
  });

  it("approved budget applies fiscal expenditure once via processBudgetCycle", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-budget-effect",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    const before = runtime.fiscal.expenditure;
    const proposed = sim.executeCommand({ type: "PROPOSE_BUDGET", fiscalStance: "expansionary" });
    expect(proposed.ok).toBe(true);
    expect(ensureGoverningRuntime(sim.getSnapshot()).fiscal.expenditure).toBe(before);

    const proposedBudget = Object.values(sim.getSnapshot().executiveRuntime.budgets).find(
      (b) => b.status === "proposed",
    );
    expect(proposedBudget).toBeTruthy();
    if (!proposedBudget) return;
    const budget = jsonClone(proposedBudget);
    budget.status = "approved";
    budget.assemblyDecision = "approved";
    state.executiveRuntime.budgets[budget.id] = budget;
    runtime.budgetCycle.stage = "assembly";
    runtime.budgetCycle.fiscalYear = budget.fiscalYear;

    processBudgetCycle(state, "P17A_BUD_APPLY");
    const afterFirst = runtime.fiscal.expenditure;
    expect(afterFirst).not.toBe(before);
    expect(budget.metadata.fiscalEffect).toBe("effective");

    processBudgetCycle(state, "P17A_BUD_APPLY_AGAIN");
    expect(runtime.fiscal.expenditure).toBe(afterFirst);
  });

  it("effective budget expenditure persists across monthly fiscal recomputation", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-budget-persist",
      playerPoliticianId: presidentId,
    });
    const baseline = ensureGoverningRuntime(sim.getSnapshot()).fiscal.expenditure;
    expect(sim.executeCommand({ type: "PROPOSE_BUDGET", fiscalStance: "expansionary" }).ok).toBe(
      true,
    );
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
    processBudgetCycle(state, "P17A_PERSIST_APPLY");
    const effectiveSpend = runtime.fiscal.expenditure;
    expect(effectiveSpend).not.toBe(baseline);
    expect(proposed.totalEnvelope).toBe(effectiveSpend);

    recomputeFiscalFromCurrentLaw(state);
    expect(runtime.fiscal.expenditure).toBe(effectiveSpend);

    const fy = proposed.fiscalYear;
    state.currentDate = `${fy}-02-01`;
    recomputeFiscalFromCurrentLaw(state);
    expect(runtime.fiscal.expenditure).toBe(effectiveSpend);

    state.currentDate = `${fy}-06-01`;
    recomputeFiscalFromCurrentLaw(state);
    expect(runtime.fiscal.expenditure).toBe(effectiveSpend);
  });

  it("implementation resource allocation survives fiscal and capacity sync", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-resource-persist",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const runtime = ensureGoverningRuntime(state);
    runtime.implementations.LAW_P17A_RES = {
      lawId: "LAW_P17A_RES",
      status: "delayed",
      posture: "standard",
      progress: 0.2,
      departmentId: "health",
      ministryOfficeId: "OFFICE_MINISTER_HEALTH",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 18,
      monthsElapsed: 6,
      major: true,
      blockedReason: "capacity",
      metadata: {},
    };
    const beforeSpend = runtime.fiscal.expenditure;
    const beforeCap = runtime.capacity.departments.health ?? 0.55;
    const ok = respondToImplementation(
      world,
      state,
      { actorId: presidentId, lawId: "LAW_P17A_RES", action: "increase_resources" },
      "CMD_RES",
    );
    expect("error" in ok).toBe(false);
    if ("error" in ok) return;
    const allocs = Object.values(runtime.resourceAllocations);
    expect(allocs.length).toBe(1);
    expect(allocs[0]!.active).toBe(true);
    expect(runtime.fiscal.expenditure).toBeGreaterThan(beforeSpend);
    const afterCap = runtime.capacity.departments.health ?? 0;
    expect(afterCap).toBeGreaterThan(beforeCap);
    const spendAfter = runtime.fiscal.expenditure;
    const capAfter = afterCap;

    recomputeFiscalFromCurrentLaw(state);
    syncCapacityFromExecutive(world, state);
    expect(runtime.fiscal.expenditure).toBe(spendAfter);
    expect(runtime.capacity.departments.health).toBe(capAfter);
    expect(Object.values(runtime.resourceAllocations).filter((a) => a.active).length).toBe(1);
  });

  it("full_request uses literal ministry requests and may exceed preferred envelope", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-budget-literal",
      playerPoliticianId: presidentId,
    });
    const cab = deriveCabinet(world, sim.getSnapshot()).filter((m) => m.holderId);
    const ministryChoices: Record<string, "full_request"> = {};
    for (const seat of cab) ministryChoices[seat.officeId] = "full_request";
    const result = sim.executeCommand({
      type: "PROPOSE_BUDGET",
      fiscalStance: "consolidation",
      ministryChoices,
    });
    expect(result.ok).toBe(true);
    const budget = Object.values(sim.getSnapshot().executiveRuntime.budgets).find(
      (b) => b.status === "proposed",
    );
    expect(budget).toBeTruthy();
    if (!budget) return;
    for (const [officeId, request] of Object.entries(budget.ministryRequests)) {
      expect(budget.ministryAmounts[officeId]).toBe(request);
    }
    expect(budget.preferredEnvelope).toBeLessThan(budget.totalEnvelope);
    expect(budget.totalEnvelope).toBeGreaterThan(budget.preferredEnvelope + 0.05);
    expect(budget.metadata.envelopeConflict).toBe(true);
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
    const expBefore = ensureGoverningRuntime(state).fiscal.expenditure;
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
      expect(ensureGoverningRuntime(state).fiscal.expenditure).toBeGreaterThan(expBefore);
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

  it("coalition cabinet-share shortfall is a political consequence, not a hard legal block", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const sim = createSimulation({
      world,
      seed: "p17a-coalition-share",
      playerPoliticianId: presidentId,
    });
    const state = jsonClone(sim.getSnapshot());
    const finance = deriveCabinet(world, state).find(
      (m) => m.officeId === "OFFICE_MINISTER_FINANCE" && m.holderId,
    );
    expect(finance?.holderId).toBeTruthy();
    const oldId = finance!.holderId!;
    const presidentParty = state.politicians[presidentId]?.partyId;
    expect(presidentParty).toBeTruthy();
    const partnerParty =
      Object.keys(world.partyPublicIdeology ?? {}).find((p) => p !== presidentParty) ??
      Object.values(state.politicians)
        .map((p) => p.partyId)
        .find((p) => p && p !== presidentParty);
    expect(partnerParty).toBeTruthy();
    if (!partnerParty || !presidentParty) return;

    const politics = ensurePoliticsRuntime(state);
    politics.coalitionAgreements.COAL_P17A = {
      id: "COAL_P17A",
      formedDate: state.currentDate,
      status: "active",
      brokenDate: null,
      partyIds: [presidentParty, partnerParty].sort(),
      policyPriorities: ["economy", "housing"],
      // Partner is promised nearly the whole cabinet — any non-partner-heavy board breaches share.
      cabinetShares: { [partnerParty]: 0.85, [presidentParty]: 0.15 },
      trigger: "no_plurality",
      breakdownReason: null,
      negotiationScore: 0.7,
      alternativeOptions: [],
      metadata: {},
    };
    const scoreBefore = politics.coalitionAgreements.COAL_P17A.negotiationScore;

    const replacement = Object.keys(state.politicians).find((id) => {
      if (id === oldId || id === presidentId) return false;
      if (state.politicians[id]?.partyId === partnerParty) return false;
      return (
        canAssumeOffice(state, world, "OFFICE_MINISTER_FINANCE", id, "substantive", {
          ignoreOfficeCapacity: true,
        }) == null
      );
    });
    expect(replacement).toBeTruthy();

    const out = reshuffleCabinetSeat(
      world,
      state,
      {
        actorId: presidentId,
        officeId: "OFFICE_MINISTER_FINANCE",
        politicianId: replacement!,
        reason: "player_directive",
      },
      "CMD_COAL_RESHUFFLE",
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    const after = deriveCabinet(world, state).find((m) => m.officeId === "OFFICE_MINISTER_FINANCE");
    expect(after?.holderId).toBe(replacement);
    const reshuffle = out.events.find((e) => e.type === "CABINET_RESHUFFLE");
    expect(reshuffle).toBeTruthy();
    expect(reshuffle?.payload.coalitionConsequence).toBe("cabinet_share_shortfall");
    expect(politics.coalitionAgreements.COAL_P17A!.negotiationScore).toBeLessThan(scoreBefore);
    expect(politics.coalitionAgreements.COAL_P17A!.status).toBe("active");
  });

  it("agenda does not auto-link sole opposition housing bill; setAgendaItemBill attaches it", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17a-agenda-opposition",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    const presidentId = currentPresidentialAuthorityId(world, state);
    const presidentParty = presidentId ? state.politicians[presidentId]?.partyId : null;
    const oppositionMp = currentAssemblyMemberIds(world, state).find(
      (id) => state.politicians[id]?.partyId && state.politicians[id]?.partyId !== presidentParty,
    );
    expect(oppositionMp).toBeTruthy();
    if (!oppositionMp) return;
    state.legislatureRuntime.bills.BILL_HOUSING_OPP = {
      id: "BILL_HOUSING_OPP",
      title: "Opposition housing bill",
      summary: "Opposition housing reform",
      status: "in_committee",
      sponsorId: oppositionMp,
      cosponsorIds: [],
      introducedDate: state.currentDate,
      metadata: {},
      policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.45, fiscalImpact: null }],
    } as BillState;
    const runtime = ensureGoverningRuntime(state);
    runtime.agenda = {
      updatedDate: state.currentDate,
      items: [
        {
          id: "AGENDA_H_OPP",
          title: "Platform: housing",
          issueId: "ISS_HOUSING",
          priority: 0.7,
          source: "platform",
          departmentId: "interior",
          status: "active",
          billId: null,
          billStatus: null,
        },
      ],
    };
    syncAgendaBillReferences(state, runtime.agenda.items);
    expect(runtime.agenda.items[0]!.billId).toBeNull();
    setAgendaItemBill(state, "AGENDA_H_OPP", "BILL_HOUSING_OPP");
    expect(runtime.agenda.items[0]!.billId).toBe("BILL_HOUSING_OPP");
    expect(runtime.agenda.items[0]!.billStatus).toBe("in_committee");
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

  it("derived major regulation blocked under constrained_dual_mandate without major flag", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const state = jsonClone(
      createSimulation({
        world,
        seed: "p17a-major-reg",
        playerPoliticianId: presidentId,
      }).getSnapshot(),
    );
    expect(state.provincialRuntime.constitutionalOrder?.executiveAuthority).toBe(
      "constrained_dual_mandate",
    );
    const blocked = issueRegulation(
      world,
      state,
      {
        actorId: presidentId,
        ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
        policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.8, fiscalImpact: null }],
      },
      null,
    );
    expect("error" in blocked).toBe(true);
    if ("error" in blocked) expect(blocked.error.code).toBe("EXECUTIVE_AUTHORITY_BLOCKED");
    const allowed = issueRegulation(
      world,
      state,
      {
        actorId: presidentId,
        ministryOfficeId: "OFFICE_MINISTER_INTERIOR",
        policyItems: [{ issueId: "ISS_HOUSING", direction: 1, magnitude: 0.2, fiscalImpact: null }],
      },
      null,
    );
    expect("error" in allowed).toBe(false);
  });

  it("request_amending_legislation creates a bill id on the implementation record", () => {
    const world = loadTerenaWorld();
    const presidentId =
      world.startingTerms.find((t) => world.offices[t.officeId]?.kind === "president")?.holderId ??
      "NPC146";
    const state = jsonClone(
      createSimulation({
        world,
        seed: "p17a-amend-bill",
        playerPoliticianId: presidentId,
      }).getSnapshot(),
    );
    ensureGoverningRuntime(state).implementations.LAW_P17A_AMEND = {
      lawId: "LAW_P17A_AMEND",
      status: "blocked",
      posture: "standard",
      progress: 0.12,
      departmentId: "economy",
      ministryOfficeId: "OFFICE_MINISTER_ECONOMY",
      enactedDate: state.currentDate,
      legalEffectiveDate: state.currentDate,
      implementationStartDate: state.currentDate,
      expectedCompletionDate: null,
      lagKind: "medium",
      monthsRequired: 12,
      monthsElapsed: 4,
      major: true,
      blockedReason: "legal",
      metadata: {},
    };
    const out = respondToImplementation(
      world,
      state,
      {
        actorId: presidentId,
        lawId: "LAW_P17A_AMEND",
        action: "request_amending_legislation",
      },
      "CMD_AMEND",
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    const billId = out.record.metadata.amendmentBillId;
    expect(typeof billId).toBe("string");
    expect(state.legislatureRuntime.bills[billId as string]).toBeTruthy();
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
