import { describe, expect, it } from "vitest";
import { addMonths } from "./calendar.js";
import { campaignOrganize, campaignVisit } from "./campaigns/actions.js";
import { applyOrganizationMaintenance } from "./campaigns/monthly.js";
import { createCampaignRecord } from "./campaigns/state.js";
import { createSimulation } from "./engine.js";
import { processEconomyMonth } from "./economy/monthly.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { policyItemForProvision } from "./legislature/provisions.js";
import { createRngService } from "./rng.js";
import { kernelOffice, syntheticWorld } from "./synthetic-world.js";

function startingHolder(world: ReturnType<typeof loadTerenaWorld>, kind: string): string {
  const term = world.startingTerms.find((candidate) => world.offices[candidate.officeId]?.kind === kind);
  if (!term) throw new Error(`No starting ${kind}`);
  return term.holderId;
}

describe("Phase 11.2 economic geography", () => {
  it("starts from canonical uneven values and preserves meaningful regional differences for four years", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const first = createSimulation({ world, playerPoliticianId: player, seed: "P112-ECON-TEST" }).serializeSave().simulation;
    const second = createSimulation({ world, playerPoliticianId: player, seed: "P112-ECON-TEST" }).serializeSave().simulation;
    const startNational = Object.values(first.economyRuntime.national).filter((value): value is number => typeof value === "number");
    const startProvince = Object.values(first.economyRuntime.provinces).map((row) => row.conditionsIndex);
    const startSector = Object.values(first.economyRuntime.sectors).map((row) => row.conditionsIndex);
    expect(new Set(startNational.map((value) => value.toFixed(1))).size).toBeGreaterThan(3);
    expect(Math.max(...startProvince) - Math.min(...startProvince)).toBeGreaterThan(10);
    expect(Math.max(...startSector) - Math.min(...startSector)).toBeGreaterThan(8);
    const rngA = createRngService("P112-ECON-TEST");
    const rngB = createRngService("P112-ECON-TEST");
    for (let month = 1; month <= 48; month++) {
      first.currentDate = addMonths(first.scenarioStartDate, month);
      second.currentDate = addMonths(second.scenarioStartDate, month);
      processEconomyMonth(first, world, rngA, `A${month}`);
      processEconomyMonth(second, world, rngB, `B${month}`);
    }
    expect(second.economyRuntime).toEqual(first.economyRuntime);
    const finalProvince = Object.values(first.economyRuntime.provinces).map((row) => row.conditionsIndex);
    expect(Math.max(...finalProvince) - Math.min(...finalProvince)).toBeGreaterThan(6);
    expect(first.economyRuntime.history).toHaveLength(49);
    expect((["outputIndex", "employmentIndex", "priceIndex", "realWageIndex", "housingIndex", "confidenceIndex"] as const)
      .every((key) => first.economyRuntime.national[key] > 40 && first.economyRuntime.national[key] < 160)).toBe(true);
  });

  it("makes trade-exposed provinces react more strongly to a trade disruption", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const control = createSimulation({ world, playerPoliticianId: player, seed: "P112-TRADE" }).serializeSave().simulation;
    const stressed = structuredClone(control);
    stressed.economyRuntime.sectors.trade!.conditionsIndex = 75;
    control.currentDate = addMonths(control.currentDate, 1);
    stressed.currentDate = addMonths(stressed.currentDate, 1);
    processEconomyMonth(control, world, createRngService("P112-TRADE"), "CONTROL");
    processEconomyMonth(stressed, world, createRngService("P112-TRADE"), "STRESS");
    const exposedImpact =
      stressed.economyRuntime.provinces.P20!.conditionsIndex -
      control.economyRuntime.provinces.P20!.conditionsIndex;
    const shelteredImpact =
      stressed.economyRuntime.provinces.FDV!.conditionsIndex -
      control.economyRuntime.provinces.FDV!.conditionsIndex;
    expect(exposedImpact).toBeLessThan(shelteredImpact);
    expect(Math.abs(exposedImpact)).toBeGreaterThan(Math.abs(shelteredImpact) * 3);
  });
});

describe("Phase 11.2 campaign geography", () => {
  it("distributes national work beyond the first four IDs and retains decaying local infrastructure", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "president");
    const state = createSimulation({ world, playerPoliticianId: player, seed: "P112-GEO-TEST" }).serializeSave().simulation;
    const campaign = createCampaignRecord(state, world, { politicianId: player, type: "presidential_general", electionId: "ELEC_PRES_2028" });
    campaign.actionPointsRemaining = 20;
    const rng = createRngService("P112-GEO-TEST");
    const visit = campaignVisit(world, state, rng, { campaignId: campaign.id, actorId: player, geography: { kind: "national", id: null } }, null);
    expect("error" in visit).toBe(false);
    const ids = Object.keys(world.constituencyElectorate).sort();
    expect(ids.slice(4).every((id) => (campaign.organizationByConstituency[id] ?? 0) > 0)).toBe(true);
    expect(world.provinceIds.every((id) => (campaign.organizationByProvince[id] ?? 0) > 0)).toBe(true);
    const provinceId = world.provinceIds.at(-1)!;
    const beforeProvince = campaign.organizationByProvince[provinceId] ?? 0;
    const organized = campaignOrganize(world, state, { campaignId: campaign.id, actorId: player, geography: { kind: "province", id: provinceId } }, null);
    expect("error" in organized).toBe(false);
    expect(campaign.organizationByProvince[provinceId]).toBeGreaterThan(beforeProvince);
    const constituencyId = ids[Math.floor(ids.length / 2)]!;
    campaign.actionPointsRemaining = 20;
    campaignOrganize(world, state, { campaignId: campaign.id, actorId: player, geography: { kind: "constituency", id: constituencyId } }, null);
    const peak = campaign.organizationByConstituency[constituencyId]!;
    for (let month = 0; month < 12; month++) applyOrganizationMaintenance(campaign);
    expect(campaign.organizationByConstituency[constituencyId]).toBeLessThan(peak);
    expect(campaign.organizationByConstituency[constituencyId]).toBeGreaterThan(0);
  });
});

describe("Phase 11.2 concrete legislation", () => {
  it("accepts one to three named provisions, generates public copy, and rejects a fourth", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const sim = createSimulation({ world, playerPoliticianId: player, seed: "P112-LAW-TEST" });
    const item = policyItemForProvision("PROV_REPRODUCTIVE_LAW", "high")!;
    const result = sim.executeCommand({ type: "INTRODUCE_BILL", policyItems: [item] });
    expect(result.ok).toBe(true);
    const bill = Object.values(sim.getSnapshot().legislatureRuntime.bills).find((candidate) => candidate.sponsorId === player)!;
    expect(bill.title).toBe("Reproductive Health Protection Bill");
    expect(bill.summary).toContain("Guarantees lawful abortion access");
    expect(bill.title).not.toMatch(/NPC|ISS_|moderate on/i);
    const tooMany = [
      policyItemForProvision("PROV_BARGAINING_SCOPE", "high")!,
      policyItemForProvision("PROV_CHILD_BENEFIT", "high")!,
      policyItemForProvision("PROV_HOUSING_APPROVALS", "high")!,
      policyItemForProvision("PROV_CLEAN_POWER", "high")!,
    ];
    const rejected = sim.executeCommand({ type: "INTRODUCE_BILL", policyItems: tooMany });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("INVALID_BILL");
  });
});

describe("Phase 11.2 role authority", () => {
  it("processes a nonblocking office expiry on the exact turn target date", () => {
    const world = syntheticWorld("P112-EXACT-EXPIRY");
    world.offices.OFFICE_COURT_TEST = kernelOffice({
      id: "OFFICE_COURT_TEST",
      kind: "constitutional_court_justice",
      title: "Test court seat",
      noPartyMembershipWhileServing: true,
    });
    world.startingTerms.push({
      officeId: "OFFICE_COURT_TEST",
      holderId: "P2",
      startDate: "1999-02-01",
      startKnown: true,
      endDate: "2000-02-01",
      accessionReason: "appointed",
      status: "active",
      holdingKind: "substantive",
      sourceElectionId: null,
      endedDate: null,
      endedReason: null,
    });
    world.initialScheduled.push({
      dueDate: "2000-02-01",
      eventType: "OFFICE_TERM_END_DUE",
      payload: { officeId: "OFFICE_COURT_TEST", holderId: "P2", autoEnd: true },
      priority: 10,
      blocking: false,
      requiresResolution: false,
      source: "OFFICE_COURT_TEST",
    });
    const sim = createSimulation({ world, playerPoliticianId: "P1" });
    const advanced = sim.executeCommand({ type: "ADVANCE_TURN" });
    expect(advanced.ok).toBe(true);
    expect(sim.getSnapshot().currentDate).toBe("2000-02-01");
    const term = Object.values(sim.getSnapshot().officeTerms).find((candidate) => candidate.officeId === "OFFICE_COURT_TEST");
    expect(term?.status).toBe("ended");
    expect(term?.endedReason).toBe("term_expired");
  });

  it("gives Ministers and Mayors one explicit bounded role action per month", () => {
    const world = loadTerenaWorld();
    const minister = createSimulation({
      world,
      playerPoliticianId: startingHolder(world, "minister"),
      seed: "P112-MINISTER",
    });
    expect(minister.executeCommand({ type: "MINISTER_ADVISE_PRIORITY", issueId: world.issueIds[0]! }).ok).toBe(true);
    const repeatedAdvice = minister.executeCommand({ type: "MINISTER_ADVISE_PRIORITY", issueId: world.issueIds[1]! });
    expect(repeatedAdvice.ok).toBe(false);
    if (!repeatedAdvice.ok) expect(repeatedAdvice.error.code).toBe("MONTHLY_ROLE_ACTION_USED");

    const mayor = createSimulation({
      world,
      playerPoliticianId: startingHolder(world, "mayor"),
      seed: "P112-MAYOR",
    });
    expect(mayor.executeCommand({ type: "MAYOR_SET_CIVIC_PRIORITY", priority: "housing" }).ok).toBe(true);
    const repeatedPriority = mayor.executeCommand({ type: "MAYOR_SET_CIVIC_PRIORITY", priority: "transport" });
    expect(repeatedPriority.ok).toBe(false);
    if (!repeatedPriority.ok) expect(repeatedPriority.error.code).toBe("MONTHLY_ROLE_ACTION_USED");
  });

  it("rejects provincial executive commands for every non-governor starting role", () => {
    const world = loadTerenaWorld();
    const governor = startingHolder(world, "governor");
    const provinceId = world.startingTerms
      .map((term) => ({ term, office: world.offices[term.officeId] }))
      .find((row) => row.term.holderId === governor && row.office?.kind === "governor")!.office!.provinceId!;
    for (const kind of ["president", "assembly_member", "mayor", "minister", "constitutional_court_justice"] as const) {
      const player = startingHolder(world, kind);
      const sim = createSimulation({ world, playerPoliticianId: player, seed: `P112-AUTH-${kind}` });
      const result = sim.executeCommand({ type: "GOVERNOR_SET_PRIORITY", provinceId, priority: "schools" });
      expect(result.ok, kind).toBe(false);
    }
    const active = new Set(world.startingTerms.map((term) => term.holderId));
    const roster = createSimulation({ world, playerPoliticianId: governor, seed: "P112-AUTH-ROSTER" }).getSnapshot().politicians;
    const former = Object.keys(roster).find((id) => !active.has(id))!;
    const formerSim = createSimulation({ world, playerPoliticianId: former, seed: "P112-AUTH-FORMER" });
    expect(formerSim.executeCommand({ type: "GOVERNOR_SET_PRIORITY", provinceId, priority: "schools" }).ok).toBe(false);
  });
});
