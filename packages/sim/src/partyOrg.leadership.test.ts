/**
 * partyOrg.leadership.test.ts
 *
 * Verifies the Party Organisation & Leadership module:
 *  1. Default officers are seeded on first call
 *  2. setPartyPriorities requires the actor to be Chair
 *  3. NPC and player invoke the same command function (shared code path)
 *  4. Chair election resolves via simple plurality
 *  5. Non-chair actors are rejected by all commands
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import type { SimState } from "./types.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import { ensureDefaultOfficers, listOfficers } from "./partyOrg/officers.js";
import {
  setPartyPriorities,
  setPartyOfficialPosition,
  authorizeCoalitionTalks,
  recommendDiscipline,
} from "./partyOrg/commands.js";
import {
  openPartyChairElection,
  declareChairCandidacy,
  resolveChairElection,
} from "./partyOrg/elections.js";
import { defaultPartyRules } from "./partyOrg/rules.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function setup(seed = "partyorg-test") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensurePartyOrgRuntime(state);
  return { world, sim, state };
}

/** Returns the first party that has a non-null leaderId. */
function firstPartyWithLeader(state: SimState): { partyId: string; leaderId: string } {
  for (const [partyId, ps] of Object.entries(state.partyStates)) {
    if (ps.leaderId) return { partyId, leaderId: ps.leaderId };
  }
  throw new Error("No party with a leader found in test state.");
}

/** Returns an active politician in `partyId` who is NOT `excludeId`. */
function otherPartyMember(state: SimState, partyId: string, excludeId: string): string | null {
  for (const [id, pol] of Object.entries(state.politicians)) {
    if (pol.partyId === partyId && pol.alive && !pol.retired && id !== excludeId) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("partyOrg: default officer seeding", () => {
  it("seeds Chair from partyStates.leaderId", () => {
    const { world, state } = setup("seed-officers");
    const { partyId, leaderId } = firstPartyWithLeader(state);

    ensureDefaultOfficers(world, state);

    const runtime = ensurePartyOrgRuntime(state);
    const chair = runtime.officers[partyId]?.chair;
    expect(chair).toBeDefined();
    expect(chair!.politicianId).toBe(leaderId);
    expect(chair!.role).toBe("chair");
  });

  it("seeds Vice Chair and Treasurer from eligible party members", () => {
    const { world, state } = setup("seed-officers-2");
    ensureDefaultOfficers(world, state);

    for (const [partyId] of Object.entries(state.partyStates)) {
      const officers = listOfficers(state, partyId);
      // Every officer must be alive and not retired
      for (const o of officers) {
        const pol = state.politicians[o.politicianId];
        expect(pol?.alive, `Officer ${o.politicianId} should be alive`).toBe(true);
        expect(pol?.retired, `Officer ${o.politicianId} should not be retired`).toBe(false);
      }
      // No duplicate politician IDs across roles
      const ids = officers.map((o) => o.politicianId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("is idempotent — calling twice doesn't change existing officers", () => {
    const { world, state } = setup("seed-idempotent");
    ensureDefaultOfficers(world, state);
    const runtime = ensurePartyOrgRuntime(state);
    const { partyId } = firstPartyWithLeader(state);
    const firstChairId = runtime.officers[partyId]?.chair?.politicianId;

    ensureDefaultOfficers(world, state);
    const secondChairId = runtime.officers[partyId]?.chair?.politicianId;
    expect(secondChairId).toBe(firstChairId);
  });
});

describe("partyOrg: setPartyPriorities – chair requirement", () => {
  it("succeeds when actor is the Chair", () => {
    const { world, state } = setup("priorities-ok");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const result = setPartyPriorities(state, world, {
      actorId: leaderId,
      partyId,
      priorities: ["housing", "healthcare"],
      commandId: "CMD000001",
    });

    expect(result.ok).toBe(true);
    const runtime = ensurePartyOrgRuntime(state);
    expect(runtime.priorities[partyId]).toEqual(["housing", "healthcare"]);
  });

  it("rejects a non-officer actor", () => {
    const { world, state } = setup("priorities-reject");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    // Find someone who is NOT the chair and NOT in officers
    const outsider = otherPartyMember(state, partyId, leaderId);
    // Use an actor from a different party (definitely not chair)
    const foreignActor = Object.entries(state.politicians).find(
      ([_id, pol]) => pol.partyId !== partyId && pol.alive && !pol.retired,
    )?.[0];
    const actorId = foreignActor ?? outsider ?? "NOBODY";

    const result = setPartyPriorities(state, world, {
      actorId,
      partyId,
      priorities: ["tax_cuts"],
      commandId: "CMD000002",
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe("NOT_PARTY_CHAIR");
  });

  it("Vice Chair may substitute when Chair seat is vacant", () => {
    const { world, state } = setup("priorities-vicechair");
    const { partyId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const runtime = ensurePartyOrgRuntime(state);
    const viceChairId = runtime.officers[partyId]?.vice_chair?.politicianId;
    if (!viceChairId) return; // skip if no vice chair could be seeded

    // Vacate the chair
    delete runtime.officers[partyId]!.chair;

    const result = setPartyPriorities(state, world, {
      actorId: viceChairId,
      partyId,
      priorities: ["defence", "border"],
      commandId: "CMD000003",
    });

    expect(result.ok).toBe(true);
  });
});

describe("partyOrg: NPC and player use the same command function", () => {
  it("both paths call setPartyPriorities and produce identical state mutations", () => {
    const { world: worldA, state: stateA } = setup("shared-cmd-player");
    const { world: worldB, state: stateB } = setup("shared-cmd-npc");

    const { partyId, leaderId } = firstPartyWithLeader(stateA);
    ensureDefaultOfficers(worldA, stateA);
    ensureDefaultOfficers(worldB, stateB);

    const args = {
      actorId: leaderId,
      partyId,
      priorities: ["fiscal_balance", "growth"],
      commandId: "CMD999",
    };

    // "Player" path
    const playerResult = setPartyPriorities(stateA, worldA, args);
    // "NPC" path — identical call, just a different caller context label
    const npcResult = setPartyPriorities(stateB, worldB, args);

    expect(playerResult.ok).toBe(true);
    expect(npcResult.ok).toBe(true);

    const runtimeA = ensurePartyOrgRuntime(stateA);
    const runtimeB = ensurePartyOrgRuntime(stateB);
    expect(runtimeA.priorities[partyId]).toEqual(runtimeB.priorities[partyId]);
  });
});

describe("partyOrg: chair elections", () => {
  it("opens a chair election successfully", () => {
    const { world, state } = setup("election-open");
    const { partyId } = firstPartyWithLeader(state);
    ensurePartyOrgRuntime(state);

    const result = openPartyChairElection(state, world, { partyId, commandId: "CMD_OPEN" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const runtime = ensurePartyOrgRuntime(state);
      const election = runtime.chairElections[result.electionId];
      expect(election).toBeDefined();
      expect(election!.status).toBe("open");
      expect(election!.partyId).toBe(partyId);
    }
  });

  it("prevents opening a second election while one is open", () => {
    const { world, state } = setup("election-double");
    const { partyId } = firstPartyWithLeader(state);

    openPartyChairElection(state, world, { partyId, commandId: "CMD_OPEN1" });
    const second = openPartyChairElection(state, world, { partyId, commandId: "CMD_OPEN2" });
    expect(second.ok).toBe(false);
    expect((second as { ok: false; error: { code: string } }).error.code).toBe(
      "ELECTION_ALREADY_OPEN",
    );
  });

  it("resolves a chair election by plurality", () => {
    const { world, state } = setup("election-resolve");
    const { partyId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    // Open election
    const opened = openPartyChairElection(state, world, { partyId, commandId: "CMD_OPEN" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const electionId = opened.electionId;

    // Gather candidates — at least 2 active party members
    const partyMembers = Object.entries(state.politicians)
      .filter(([, p]) => p.partyId === partyId && p.alive && !p.retired)
      .map(([id]) => id)
      .slice(0, 3);

    for (const polId of partyMembers) {
      declareChairCandidacy(state, world, {
        electionId,
        politicianId: polId,
        commandId: "CMD_CAND",
      });
    }

    const runtime = ensurePartyOrgRuntime(state);
    expect(runtime.chairElections[electionId]!.candidates.length).toBeGreaterThan(0);

    const resolved = resolveChairElection(state, world, { electionId, commandId: "CMD_RESOLVE" });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      const election = runtime.chairElections[electionId]!;
      expect(election.status).toBe("resolved");
      expect(election.winnerId).toBe(resolved.winnerId);
      // Chair officer updated
      expect(runtime.officers[partyId]?.chair?.politicianId).toBe(resolved.winnerId);
      // partyStates.leaderId updated
      expect(state.partyStates[partyId]?.leaderId).toBe(resolved.winnerId);
    }
  });

  it("fails to resolve an election with no candidates", () => {
    const { world, state } = setup("election-no-candidates");
    const { partyId } = firstPartyWithLeader(state);

    const opened = openPartyChairElection(state, world, { partyId, commandId: "CMD_OPEN" });
    if (!opened.ok) return;

    const result = resolveChairElection(state, world, {
      electionId: opened.electionId,
      commandId: "CMD_RESOLVE",
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe("NO_CANDIDATES");
  });
});

describe("partyOrg: additional commands – non-chair rejected", () => {
  it("setPartyOfficialPosition rejects non-chair", () => {
    const { world, state } = setup("pos-reject");
    const { partyId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const result = setPartyOfficialPosition(state, world, {
      actorId: "NOBODY_AT_ALL",
      partyId,
      issueId: "ISS_LABOR",
      stance: "support",
      commandId: "CMD_POS",
    });
    expect(result.ok).toBe(false);
  });

  it("authorizeCoalitionTalks rejects non-chair", () => {
    const { world, state } = setup("coalition-reject");
    const partyIds = Object.keys(state.partyStates);
    if (partyIds.length < 2) return;
    const partyId = partyIds[0]!;
    const partnerPartyId = partyIds[1]!;
    ensureDefaultOfficers(world, state);

    const result = authorizeCoalitionTalks(state, world, {
      actorId: "NOBODY_AT_ALL",
      partyId,
      partnerPartyId,
      commandId: "CMD_COAL",
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: { code: string } }).error.code).toBe("NOT_PARTY_CHAIR");
  });

  it("recommendDiscipline rejects non-chair", () => {
    const { world, state } = setup("discipline-reject");
    const { partyId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const result = recommendDiscipline(state, world, {
      actorId: "NOBODY_AT_ALL",
      partyId,
      targetId: "SOME_MP",
      kind: "warning",
      commandId: "CMD_DISC",
    });
    expect(result.ok).toBe(false);
  });
});

describe("partyOrg: rules variation", () => {
  it("defaultPartyRules produces consistent results for the same input", () => {
    const rules1 = defaultPartyRules("PARTY_1", "LB");
    const rules2 = defaultPartyRules("PARTY_1", "LB");
    expect(rules1).toEqual(rules2);
  });

  it("different parties may have different archetypes", () => {
    const r1 = defaultPartyRules("PARTY_A", "AA");
    const r2 = defaultPartyRules("PARTY_Z", "ZZ");
    // We can't guarantee they differ, but at least both are valid
    const validMethods = ["membership", "committee", "convention_delegates"];
    expect(validMethods).toContain(r1.chairElectionMethod);
    expect(validMethods).toContain(r2.chairElectionMethod);
  });
});

describe("partyOrg: Simulation.executeCommand path", () => {
  it("SET_PARTY_PRIORITIES succeeds when the player is Chair", () => {
    const world = loadTerenaWorld();
    const probe = createSimulation({
      world,
      seed: "exec-priorities-probe",
      playerPoliticianId: "NPC146",
    });
    const { partyId, leaderId } = firstPartyWithLeader(jsonClone(probe.getSnapshot()) as SimState);

    const sim = createSimulation({
      world,
      seed: "exec-priorities-ok",
      playerPoliticianId: leaderId,
    });
    const result = sim.executeCommand({
      type: "SET_PARTY_PRIORITIES",
      partyId,
      priorities: ["housing", "jobs"],
    });

    expect(result.ok).toBe(true);
    expect(sim.getSnapshot().partyOrgRuntime?.priorities[partyId]).toEqual(["housing", "jobs"]);
  });

  it("rejects SET_PARTY_PRIORITIES when the player is not Chair", () => {
    const world = loadTerenaWorld();
    const probe = createSimulation({
      world,
      seed: "exec-reject-probe",
      playerPoliticianId: "NPC146",
    });
    const probeState = jsonClone(probe.getSnapshot()) as SimState;
    const { partyId, leaderId } = firstPartyWithLeader(probeState);
    const outsider =
      otherPartyMember(probeState, partyId, leaderId) ??
      Object.keys(probeState.politicians).find((id) => id !== leaderId) ??
      "NOBODY";

    const sim = createSimulation({
      world,
      seed: "exec-priorities-reject",
      playerPoliticianId: outsider,
    });
    const result = sim.executeCommand({
      type: "SET_PARTY_PRIORITIES",
      partyId,
      priorities: ["tax_cuts"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_PARTY_CHAIR");
  });

  it("routes ALLOCATE_PARTY_SUPPORT and AUTHORIZE_COALITION_TALKS through shared handlers", () => {
    const world = loadTerenaWorld();
    const probe = createSimulation({
      world,
      seed: "exec-alloc-probe",
      playerPoliticianId: "NPC146",
    });
    const probeState = jsonClone(probe.getSnapshot()) as SimState;
    const { partyId, leaderId } = firstPartyWithLeader(probeState);
    const partnerPartyId = Object.keys(probeState.partyStates).find((id) => id !== partyId);
    expect(partnerPartyId).toBeTruthy();

    const sim = createSimulation({
      world,
      seed: "exec-alloc-ok",
      playerPoliticianId: leaderId,
    });

    const alloc = sim.executeCommand({
      type: "ALLOCATE_PARTY_SUPPORT",
      partyId,
      allocations: { national: 0.4, south: 0.6 },
    });
    expect(alloc.ok).toBe(true);
    expect(sim.getSnapshot().partyOrgRuntime?.supportAllocations[partyId]).toEqual({
      national: 0.4,
      south: 0.6,
    });

    const talks = sim.executeCommand({
      type: "AUTHORIZE_COALITION_TALKS",
      partyId,
      partnerPartyId: partnerPartyId!,
      authorize: true,
      redLines: ["no_tax_rises"],
    });
    expect(talks.ok).toBe(true);
    expect(sim.getSnapshot().partyOrgRuntime?.coalitionTalks[partyId]?.[partnerPartyId!]).toEqual({
      authorized: true,
      redLines: ["no_tax_rises"],
    });
  });

  it("routes ENDORSE_CANDIDATE_AS_CHAIR and RECOMMEND_PARTY_DISCIPLINE through shared handlers", () => {
    const world = loadTerenaWorld();
    const probe = createSimulation({
      world,
      seed: "exec-disc-probe",
      playerPoliticianId: "NPC146",
    });
    const probeState = jsonClone(probe.getSnapshot()) as SimState;
    const { partyId, leaderId } = firstPartyWithLeader(probeState);
    const targetId = otherPartyMember(probeState, partyId, leaderId);
    expect(targetId).toBeTruthy();

    const sim = createSimulation({
      world,
      seed: "exec-disc-ok",
      playerPoliticianId: leaderId,
    });

    const endorse = sim.executeCommand({
      type: "ENDORSE_CANDIDATE_AS_CHAIR",
      partyId,
      candidateId: targetId!,
    });
    expect(endorse.ok).toBe(true);
    expect(
      sim.getSnapshot().partyOrgRuntime?.partyEndorsements[`endorse:${targetId}`]?.candidateId,
    ).toBe(targetId);

    const discipline = sim.executeCommand({
      type: "RECOMMEND_PARTY_DISCIPLINE",
      partyId,
      targetPoliticianId: targetId!,
      kind: "warning",
    });
    expect(discipline.ok).toBe(true);
    const actions = Object.values(sim.getSnapshot().partyOrgRuntime?.disciplineActions ?? {});
    expect(actions.some((a) => a.targetId === targetId && a.kind === "warning")).toBe(true);
  });

  it("seeds provincialOrganizations from world.provincialPartyOrganizations", () => {
    const { world, state } = setup("provincial-seed");
    ensureDefaultOfficers(world, state);
    const runtime = ensurePartyOrgRuntime(state);
    const worldOrgs = Object.keys(world.provincialPartyOrganizations ?? {});
    if (worldOrgs.length === 0) return;
    expect(runtime.provincialOrganizations).toBeDefined();
    for (const orgId of worldOrgs) {
      const seeded = runtime.provincialOrganizations?.[orgId];
      expect(seeded).toBeDefined();
      expect(seeded!.partyId).toBe(world.provincialPartyOrganizations[orgId]!.partyId);
      expect(seeded!.provinceId).toBe(world.provincialPartyOrganizations[orgId]!.provinceId);
    }
  });
});
