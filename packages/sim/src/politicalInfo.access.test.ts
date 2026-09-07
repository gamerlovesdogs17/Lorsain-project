/**
 * politicalInfo.access.test.ts — role-based information access tiers.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import {
  canShowExactInternals,
  formatWhipVoteOutlook,
  informationAccessAtLeast,
  mayShowExactAiWeights,
  playerEffectiveInformationAccess,
  playerInformationAccess,
  resolveInformationAccess,
  type InformationAccess,
} from "./politicalInfo.js";
import type { SimState } from "./types.js";

function setup(seed = "political-info-access") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensurePartyOrgRuntime(state);
  ensureDefaultOfficers(world, state);
  return { world, state };
}

function firstPartyWithCaucus(state: SimState): string {
  for (const [partyId, leadership] of Object.entries(state.legislatureRuntime.caucusLeadership)) {
    if (leadership.floorLeaderId || leadership.whipId) return partyId;
  }
  const partyId = Object.keys(state.partyStates)[0];
  if (!partyId) throw new Error("No party in test state");
  return partyId;
}

function otherMember(state: SimState, partyId: string, exclude: Set<string>): string {
  for (const [id, pol] of Object.entries(state.politicians)) {
    if (pol.partyId === partyId && pol.alive && !pol.retired && !exclude.has(id)) return id;
  }
  throw new Error(`No alternate member for ${partyId}`);
}

describe("political information access tiers", () => {
  it("maps offices to public | role | confidential (never debug from role alone)", () => {
    const { world, state } = setup();
    const partyId = firstPartyWithCaucus(state);
    const officers = state.partyOrgRuntime!.officers[partyId] ?? {};
    const chairId = officers.chair?.politicianId;
    const treasurerId = officers.treasurer?.politicianId;
    expect(chairId).toBeTruthy();

    const existing = state.legislatureRuntime.caucusLeadership[partyId];
    const whipId =
      existing?.whipId ??
      otherMember(state, partyId, new Set([chairId!, treasurerId ?? "", "NPC146"]));
    const floorId =
      existing?.floorLeaderId ??
      otherMember(state, partyId, new Set([chairId!, treasurerId ?? "", whipId, "NPC146"]));
    state.legislatureRuntime.caucusLeadership[partyId] = {
      partyId,
      floorLeaderId: floorId,
      whipId,
      selectedDate: existing?.selectedDate ?? state.currentDate,
      nextElectionDate: existing?.nextElectionDate ?? state.currentDate,
      priorityBillIds: existing?.priorityBillIds ?? [],
      whipStrengths: existing?.whipStrengths ?? {},
    };

    const bystander = otherMember(
      state,
      partyId,
      new Set([chairId!, treasurerId ?? "", whipId, floorId]),
    );

    expect(playerInformationAccess(world, state, bystander, "whip_votes")).toBe("public");
    expect(playerInformationAccess(world, state, whipId, "whip_votes")).toBe("role");
    expect(playerInformationAccess(world, state, floorId, "whip_votes")).toBe("role");

    expect(playerInformationAccess(world, state, bystander, "party_org")).toBe("public");
    expect(playerInformationAccess(world, state, chairId!, "party_org")).toBe("role");

    if (treasurerId) {
      expect(playerInformationAccess(world, state, bystander, "treasury")).toBe("public");
      expect(playerInformationAccess(world, state, treasurerId, "treasury")).toBe("confidential");
    }

    expect(playerInformationAccess(world, state, bystander, "diplomacy")).toBe("public");

    for (const domain of [
      "whip_votes",
      "party_org",
      "treasury",
      "ministry",
      "diplomacy",
    ] as const) {
      const access = playerInformationAccess(world, state, whipId, domain);
      expect(access).not.toBe("debug");
    }
  });

  it("debug mode promotes access and alone unlocks exact AI weights", () => {
    const { world, state } = setup("political-info-debug");
    const partyId = firstPartyWithCaucus(state);
    const chairId = state.partyOrgRuntime!.officers[partyId]?.chair?.politicianId;
    expect(chairId).toBeTruthy();

    const roleAccess = playerInformationAccess(world, state, chairId!, "party_org");
    expect(roleAccess).toBe("role");
    expect(resolveInformationAccess(roleAccess, false)).toBe("role");
    expect(resolveInformationAccess(roleAccess, true)).toBe("debug");
    expect(canShowExactInternals(true)).toBe(true);

    expect(mayShowExactAiWeights(roleAccess)).toBe(false);
    expect(mayShowExactAiWeights("confidential")).toBe(false);
    expect(mayShowExactAiWeights("debug")).toBe(true);

    const effective = playerEffectiveInformationAccess(world, state, chairId!, "party_org", true);
    expect(effective).toBe("debug");
  });

  it("whip outlook stays qualitative for role access and exact only in debug", () => {
    const estimate = { likelyYes: 240, likelyNo: 180, uncertain: 40 };
    const publicText = formatWhipVoteOutlook(estimate, "public");
    const roleText = formatWhipVoteOutlook(estimate, "role");
    const debugText = formatWhipVoteOutlook(estimate, "debug");

    expect(publicText).toMatch(/Likely yes|Lean yes|Unclear|Lean no|Likely no/);
    expect(roleText.length).toBeGreaterThan(publicText.length);
    expect(roleText).not.toMatch(/\b240\b/);
    expect(debugText).toContain("240");
    expect(debugText).toContain("180");
  });

  it("ranks access tiers for comparisons", () => {
    const order: InformationAccess[] = ["public", "role", "confidential", "debug"];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(informationAccessAtLeast(order[i]!, order[j]!)).toBe(i >= j);
      }
    }
  });
});
