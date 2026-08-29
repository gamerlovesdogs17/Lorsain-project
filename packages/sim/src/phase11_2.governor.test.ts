import { describe, expect, it } from "vitest";
import {
  createSimulation,
  officesOfKind,
  occupyingTerms,
  restoreSimulation,
} from "./index.js";
import { loadTerenaWorld } from "./integration/harness.js";
import type { Simulation } from "./engine.js";
import { deriveProvincialPartyPositions, evaluateGovernorDisposition } from "./provinces/politics.js";

function expectOk(sim: Simulation, command: Parameters<Simulation["executeCommand"]>[0]) {
  const result = sim.executeCommand(command);
  expect(result.ok).toBe(true);
  return result;
}

function advance(sim: Simulation, months: number): void {
  for (let index = 0; index < months; index++) {
    const result = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!result.ok) throw new Error(result.error.message);
    if (result.interrupt?.code === "PRESIDENTIAL_ELECTION_DUE") {
      expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
      expectOk(sim, { type: "RESUME_TURN" });
    } else if (result.interrupt && !result.interrupt.requiresResolution) {
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
    }
  }
}

describe("Phase 11.2 provincial government", () => {
  it("gives a governor bounded provincial authority and rejects other roles", () => {
    const world = loadTerenaWorld();
    const governorOffice = officesOfKind(world, "governor")[0]!;
    const governorId = world.startingTerms.find((term) => term.officeId === governorOffice.id)!.holderId;
    const governor = createSimulation({ world, playerPoliticianId: governorId, seed: "P112-GOV-AUTH" });
    const provinceId = governorOffice.provinceId!;
    expectOk(governor, {
      type: "GOVERNOR_SET_PRIORITY",
      provinceId,
      priority: "hospitals",
    });
    expect(governor.getSnapshot().provincialRuntime.provinces[provinceId]!.administrativePriority).toBe(
      "hospitals",
    );
    expectOk(governor, {
      type: "GOVERNOR_DIRECT_INVESTMENT",
      provinceId,
      focus: "housing",
    });
    const presidentId = occupyingTerms(governor.getSnapshot(), "OFFICE_PRESIDENT")[0]!.holderId;
    const president = createSimulation({ world, playerPoliticianId: presidentId, seed: "P112-NOT-GOV" });
    const invalid = president.executeCommand({
      type: "GOVERNOR_SET_PRIORITY",
      provinceId,
      priority: "schools",
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("NOT_PROVINCIAL_GOVERNOR");
  });

  it("keeps a player governor out until explicit filing and preserves the race across reload", () => {
    const world = loadTerenaWorld();
    const governorOffice = officesOfKind(world, "governor")[0]!;
    const governorId = world.startingTerms.find((term) => term.officeId === governorOffice.id)!.holderId;
    const sim = createSimulation({ world, playerPoliticianId: governorId, seed: "P112-GOV-FILE" });
    advance(sim, 15);
    const election = Object.values(sim.getSnapshot().provincialRuntime.elections).find(
      (candidate) => candidate.provinceId === governorOffice.provinceId && candidate.status === "filing_open",
    )!;
    expect(election).toBeTruthy();
    expect(election.candidates[governorId]).toBeUndefined();
    expect(election.playerDecision).toBeNull();
    expectOk(sim, {
      type: "FILE_GUBERNATORIAL_CANDIDACY",
      electionId: election.id,
      provinceId: election.provinceId,
    });
    expectOk(sim, {
      type: "DECLARE_CAMPAIGN",
      politicianId: governorId,
      campaignType: "gubernatorial",
      electionId: election.id,
    });
    const restored = restoreSimulation(sim.serializeSave(), world);
    expect(restored.hashState()).toBe(sim.hashState());
    const savedElection = restored.getSnapshot().provincialRuntime.elections[election.id]!;
    expect(savedElection.candidates[governorId]?.source).toBe("player");
    expect(
      Object.values(restored.getSnapshot().campaignRuntime.campaigns).filter(
        (campaign) => campaign.politicianId === governorId && campaign.electionId === election.id,
      ),
    ).toHaveLength(1);
  });

  it("resolves all province races once and creates the next four-year cycle", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, playerPoliticianId: "NPC001", seed: "P112-GOV-CYCLE" });
    advance(sim, 23);
    const firstCycle = Object.values(sim.getSnapshot().provincialRuntime.elections).filter(
      (election) => election.date === "2029-10-01",
    );
    expect(firstCycle).toHaveLength(21);
    expect(firstCycle.every((election) => election.status === "assumed")).toBe(true);
    expect(
      Object.values(sim.getSnapshot().provincialRuntime.elections).filter(
        (election) => election.date === "2033-10-01",
      ),
    ).toHaveLength(21);
  });

  it("makes the same NPC Governor sign an aligned provincial bill and veto a hostile reversal", () => {
    const world = loadTerenaWorld();
    const governorOffice = officesOfKind(world, "governor")[0]!;
    const governorId = world.startingTerms.find((term) => term.officeId === governorOffice.id)!.holderId;
    const sim = createSimulation({ world, playerPoliticianId: governorId, seed: "P113-GOV-DISPOSITION" });
    expectOk(sim, { type: "GOVERNOR_PROPOSE_PROVINCIAL_BILL", provinceId: governorOffice.provinceId!, subject: "hospital_access" });
    const state = sim.serializeSave().simulation;
    const alignedBill = Object.values(state.provincialRuntime.bills)[0]!;
    const assembly = state.provincialRuntime.assemblies[governorOffice.provinceId!]!;
    alignedBill.partyPositions = deriveProvincialPartyPositions(world, state, assembly, alignedBill);
    const governorParty = state.politicians[governorId]!.partyId;
    const oppositionSponsor = assembly.memberIds.find((id) => state.provincialRuntime.legislators[id]?.partyId !== governorParty)!;
    const hostileBill = { ...alignedBill, id: `${alignedBill.id}_HOSTILE`, sponsorId: oppositionSponsor, policyDirection: (alignedBill.policyDirection === 1 ? -1 : 1) as -1 | 1, cosponsorIds: [] };
    hostileBill.partyPositions = deriveProvincialPartyPositions(world, state, assembly, hostileBill);
    const aligned = evaluateGovernorDisposition(world, state, governorId, alignedBill);
    const hostile = evaluateGovernorDisposition(world, state, governorId, hostileBill);
    expect(aligned.decision).toBe("sign");
    expect(hostile.decision).toBe("veto");
    expect(aligned.score - hostile.score).toBeGreaterThan(0.35);
  });
});
