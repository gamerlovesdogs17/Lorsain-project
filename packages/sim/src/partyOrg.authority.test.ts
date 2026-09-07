/**
 * partyOrg.authority.test.ts
 *
 * National Chair is the sole authoritative party leader:
 *  1. setPartyLeader updates chair
 *  2. resolveChairElection keeps leaderId === chair
 *  3. after reconcile, no divergence
 *  4. termMonths triggers open election when assumedDate is old
 */

import { describe, expect, it } from "vitest";
import { addMonths } from "./calendar.js";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { setPartyLeader } from "./parties/leadership.js";
import {
  declareChairCandidacy,
  openPartyChairElection,
  resolveChairElection,
} from "./partyOrg/elections.js";
import { processPartyOrgMonth } from "./partyOrg/monthly.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { defaultPartyRules } from "./partyOrg/rules.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import { assertChairLeaderInvariant, reconcileAllPartyLeaders } from "./partyOrg/sync.js";
import type { SimState } from "./types.js";

function setup(seed = "partyorg-authority") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensurePartyOrgRuntime(state);
  return { world, sim, state };
}

function firstPartyWithLeader(state: SimState): { partyId: string; leaderId: string } {
  for (const [partyId, ps] of Object.entries(state.partyStates)) {
    if (ps.leaderId) return { partyId, leaderId: ps.leaderId };
  }
  throw new Error("No party with a leader found in test state.");
}

function otherPartyMember(state: SimState, partyId: string, excludeId: string): string | null {
  for (const [id, pol] of Object.entries(state.politicians)) {
    if (pol.partyId === partyId && pol.alive && !pol.retired && id !== excludeId) return id;
  }
  return null;
}

describe("partyOrg authority: chair === national leader", () => {
  it("setPartyLeader updates chair", () => {
    const { world, state } = setup("authority-set-leader");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const next = otherPartyMember(state, partyId, leaderId);
    expect(next).toBeTruthy();

    const result = setPartyLeader(state, world, partyId, next!, "CMD_SET_LEADER");
    expect("error" in result).toBe(false);

    const runtime = ensurePartyOrgRuntime(state);
    expect(state.partyStates[partyId]!.leaderId).toBe(next);
    expect(runtime.officers[partyId]?.chair?.politicianId).toBe(next);
  });

  it("resolveChairElection keeps leaderId === chair", () => {
    const { world, state } = setup("authority-resolve-chair");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const challenger = otherPartyMember(state, partyId, leaderId);
    expect(challenger).toBeTruthy();

    // Clear chair so we can open a fresh election cleanly
    const runtime = ensurePartyOrgRuntime(state);
    delete runtime.officers[partyId]!.chair;

    const opened = openPartyChairElection(state, world, {
      partyId,
      commandId: "CMD_OPEN",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    declareChairCandidacy(state, world, {
      electionId: opened.electionId,
      politicianId: challenger!,
      commandId: "CMD_DECLARE",
    });

    const resolved = resolveChairElection(state, world, {
      electionId: opened.electionId,
      commandId: "CMD_RESOLVE",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const chairId = runtime.officers[partyId]?.chair?.politicianId;
    expect(chairId).toBe(resolved.winnerId);
    expect(state.partyStates[partyId]!.leaderId).toBe(chairId);
  });

  it("after reconcile, no divergence", () => {
    const { world, state } = setup("authority-reconcile");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const other = otherPartyMember(state, partyId, leaderId);
    expect(other).toBeTruthy();

    // Force divergence: chair stays as leaderId, leaderId points elsewhere
    const runtime = ensurePartyOrgRuntime(state);
    runtime.officers[partyId]!.chair = {
      role: "chair",
      politicianId: leaderId,
      partyId,
      assumedDate: state.currentDate,
    };
    state.partyStates[partyId]!.leaderId = other!;
    expect(assertChairLeaderInvariant(state)).toContain(partyId);

    reconcileAllPartyLeaders(state, world, "CMD_RECONCILE");
    expect(assertChairLeaderInvariant(state)).toEqual([]);
    expect(state.partyStates[partyId]!.leaderId).toBe(leaderId);
  });

  it("termMonths triggers open election when assumedDate is old", () => {
    const { world, state } = setup("authority-term");
    const { partyId, leaderId } = firstPartyWithLeader(state);
    ensureDefaultOfficers(world, state);

    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      termMonths: 24,
    };
    runtime.officers[partyId]!.chair = {
      role: "chair",
      politicianId: leaderId,
      partyId,
      assumedDate: addMonths(state.currentDate, -25),
    };
    // Allow processPartyOrgMonth to run this month
    runtime.lastOrgMonth = null;

    processPartyOrgMonth(world, state, "CMD_ORG_MONTH");

    const open = Object.values(runtime.chairElections).find(
      (e) => e.partyId === partyId && e.status === "open",
    );
    expect(open).toBeDefined();
  });
});
