/**
 * partyOrg.committee.test.ts
 *
 * National Committee seeding bounds and rejection path for major actions.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { allocatePartySupport } from "./partyOrg/commands.js";
import { conductCommitteeVote, seedNationalCommittee } from "./partyOrg/committee.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { defaultPartyRules } from "./partyOrg/rules.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { recomputeCaucusShares } from "./caucus/shares.js";
import type { SimState } from "./types.js";

function setup(seed = "partyorg-committee") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensurePartyOrgRuntime(state);
  ensureDefaultOfficers(world, state);
  ensureCaucusRuntime(state);
  recomputeCaucusShares(world, state);
  return { world, sim, state };
}

function partyWithEnoughMembers(state: SimState): string {
  let bestId = "";
  let bestCount = 0;
  for (const partyId of Object.keys(state.partyStates)) {
    const n = Object.values(state.politicians).filter(
      (p) => p.partyId === partyId && p.alive && !p.retired,
    ).length;
    if (n > bestCount) {
      bestCount = n;
      bestId = partyId;
    }
  }
  if (!bestId || bestCount < 12) {
    throw new Error(`Expected a party with ≥12 members, best had ${bestCount}`);
  }
  return bestId;
}

describe("partyOrg national committee", () => {
  it("membership size is bounded 12–24", () => {
    const { world, state } = setup("committee-size");
    const partyId = partyWithEnoughMembers(state);
    // Force reseed
    state.partyOrgRuntime!.nationalCommittee[partyId] = [];
    const roster = seedNationalCommittee(world, state, partyId);
    expect(roster.length).toBeGreaterThanOrEqual(12);
    expect(roster.length).toBeLessThanOrEqual(24);
    expect(new Set(roster).size).toBe(roster.length);
    for (const id of roster) {
      expect(state.politicians[id]?.partyId).toBe(partyId);
    }
  });

  it("committee can reject a major action", () => {
    const { world, state } = setup("committee-reject");
    const partyId = partyWithEnoughMembers(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: true,
    };

    const chairId = runtime.officers[partyId]?.chair?.politicianId;
    expect(chairId).toBeTruthy();

    // Clear and seed, then stack hostility
    runtime.nationalCommittee[partyId] = [];
    const roster = seedNationalCommittee(world, state, partyId);
    expect(roster.length).toBeGreaterThanOrEqual(12);

    for (const memberId of roster) {
      if (memberId === chairId) continue;
      if (!state.relationships[memberId]) state.relationships[memberId] = {};
      state.relationships[memberId]![chairId!] = {
        sourceId: memberId,
        targetId: chairId!,
        affinity: -0.95,
        trust: -0.5,
        respect: -0.4,
        lastUpdatedDate: state.currentDate,
        interactionCount: 1,
      };
      const factionId = state.politicians[memberId]?.factionId;
      if (factionId && state.caucusRuntime?.caucuses[factionId]) {
        state.caucusRuntime.caucuses[factionId]!.stanceTowardChair = "oppositional";
      }
    }

    const vote = conductCommitteeVote(state, world, {
      partyId,
      proposalKind: "allocate_support",
      proposalPayload: { allocations: { national: 1 } },
      commandId: "CMD_VOTE_REJECT",
    });
    expect(vote.passed).toBe(false);
    expect(vote.no).toBeGreaterThan(vote.yes);

    const hist = state.history.filter((e) => e.type === "PARTY_COMMITTEE_VOTE");
    expect(hist.some((e) => e.payload.passed === false)).toBe(true);

    const result = allocatePartySupport(state, world, {
      actorId: chairId!,
      partyId,
      allocations: { national: 0.8 },
      commandId: "CMD_ALLOC_REJECT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("COMMITTEE_REJECTED");
  });
});
