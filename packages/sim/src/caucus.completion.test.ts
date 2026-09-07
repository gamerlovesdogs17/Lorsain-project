/**
 * caucus.completion.test.ts — Caucuses 2.0 completion smoke tests.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import type { SimState } from "./types.js";
import {
  activeCaucusesForParty,
  countActiveCaucuses,
  dissolveCaucus,
  formCaucus,
  proposeCaucusMerger,
  recomputeCaucusShares,
  splitCaucus,
} from "./caucus/index.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { caucusPrimaryEndorsementBonus, rankCandidatesForGroup } from "./parties/selectorates.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { partyMembers } from "./parties/queries.js";
import type { PartyContest } from "./parties/types.js";

function setup(seed = "caucus-completion") {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensureDefaultOfficers(world, state);
  ensureCaucusRuntime(state);
  recomputeCaucusShares(world, state);
  return { world, sim, state };
}

function partyWithMultipleCaucuses(state: SimState): {
  partyId: string;
  factionIds: string[];
} {
  const byParty: Record<string, string[]> = {};
  for (const row of Object.values(state.caucusRuntime?.caucuses ?? {})) {
    if (row.ancestry.dissolved) continue;
    (byParty[row.partyId] ??= []).push(row.factionId);
  }
  for (const [partyId, factionIds] of Object.entries(byParty)) {
    if (factionIds.length >= 2) {
      return { partyId, factionIds: factionIds.sort() };
    }
  }
  throw new Error("Expected a party with at least two caucuses");
}

describe("caucus completion", () => {
  it("active count excludes dissolved", () => {
    const { world, state } = setup("active-count");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);
    const before = countActiveCaucuses(state, partyId);
    expect(before).toBe(activeCaucusesForParty(state, partyId).length);

    const absorbId = factionIds[0]!;
    const intoId = factionIds[1]!;
    const actorId =
      state.caucusRuntime!.caucuses[absorbId]!.leaderId ?? state.factionStates[absorbId]!.chairId!;
    // Force compatible merge by lowering threshold
    const result = proposeCaucusMerger(state, world, {
      actorId,
      absorbFactionId: absorbId,
      intoFactionId: intoId,
      commandId: "CMD000001",
      minCompatibility: 0,
    });
    expect(result.ok).toBe(true);
    expect(state.caucusRuntime!.caucuses[absorbId]!.ancestry.dissolved).not.toBeNull();
    expect(countActiveCaucuses(state, partyId)).toBe(before - 1);
    expect(activeCaucusesForParty(state, partyId).every((c) => !c.ancestry.dissolved)).toBe(true);
  });

  it("partyMemberSupport sums ~1 with unaligned", () => {
    const { world, state } = setup("pms-sum");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);
    recomputeCaucusShares(world, state);

    let sum = state.caucusRuntime!.unalignedByParty[partyId]?.partyMemberSupport ?? 0;
    for (const fid of factionIds) {
      const row = state.caucusRuntime!.caucuses[fid]!;
      if (row.ancestry.dissolved) continue;
      expect(row.partyMemberSupport).toBeGreaterThan(0);
      sum += row.partyMemberSupport;
    }
    expect(sum).toBeGreaterThan(0.98);
    expect(sum).toBeLessThan(1.02);
  });

  it("primary endorsement affects ranking/score", () => {
    const { world, state } = setup("endorse-rank");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);
    const factionId = factionIds[0]!;
    const row = state.caucusRuntime!.caucuses[factionId]!;
    const candidates = partyMembers(state, partyId).slice(0, 3);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const endorsed = candidates[0]!;
    const other = candidates[1]!;

    row.endorsedPrimaryCandidateId = endorsed;
    row.partyMemberSupport = 0.4;
    recomputeCaucusShares(world, state);
    // Keep endorsement support from being zeroed by rebalance of zeros-only seed path
    row.partyMemberSupport = Math.max(row.partyMemberSupport, 0.35);
    row.endorsedPrimaryCandidateId = endorsed;

    const bonus = caucusPrimaryEndorsementBonus(state, partyId, endorsed);
    expect(bonus).toBeGreaterThan(0.05);
    expect(bonus).toBeLessThanOrEqual(0.2);
    expect(caucusPrimaryEndorsementBonus(state, partyId, other)).toBe(0);

    const contest: PartyContest = {
      id: "TEST_PRIMARY",
      type: "presidential_nomination",
      partyId,
      factionId: null,
      ruleId: "test",
      status: "open",
      createdDate: state.currentDate,
      openedDate: state.currentDate,
      resolvedDate: null,
      entries: Object.fromEntries(
        candidates.map((id) => [
          id,
          {
            politicianId: id,
            status: "declared" as const,
            declaredDate: state.currentDate,
            qualificationEvidence: {
              memberNominationRequirementSatisfied: true,
              provincialSupportRequirementSatisfied: true,
            },
            seedPresidentialStatus: null,
          },
        ]),
      ),
      winnerId: null,
      selectorSummary: [],
      countInput: null,
      countArchive: null,
      metadata: {},
    };

    const ranked = rankCandidatesForGroup(
      world,
      state,
      contest,
      {
        id: "members:mod",
        kind: "members",
        partyId,
        factionId: null,
        provinceId: null,
        tendency: "moderate",
        weight: "1/1",
      },
      candidates,
    );
    expect(ranked[0]).toBe(endorsed);
  });

  it("formation / dissolution / merge / split smoke", () => {
    const { world, state } = setup("lifecycle-smoke");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);

    // Free some unaligned politicians for formation
    const members = partyMembers(state, partyId);
    for (const id of members.slice(0, 5)) {
      state.politicians[id]!.factionId = null;
    }
    recomputeCaucusShares(world, state);
    const unaligned = members.slice(0, 4);
    const form = formCaucus(state, world, {
      actorId: unaligned[0]!,
      partyId,
      politicianIds: unaligned,
      name: "Test Reform Caucus",
      commandId: "CMD000010",
    });
    expect(form.ok).toBe(true);
    if (!form.ok || !form.factionId) throw new Error("form failed");
    const newId = form.factionId;
    expect(state.dynamicFactions[newId] ?? world.factionDefinitions[newId]).toBeTruthy();
    expect(state.caucusRuntime!.caucuses[newId]?.ancestry.dissolved).toBeNull();

    // Split an oversized caucus if possible
    const big = [...factionIds]
      .map((fid) => state.caucusRuntime!.caucuses[fid]!)
      .filter((c) => !c.ancestry.dissolved)
      .sort((a, b) => b.membershipShare - a.membershipShare)[0];
    if (big) {
      const facMembers = Object.values(state.politicians)
        .filter((p) => p.factionId === big.factionId && p.alive && !p.retired)
        .map((p) => p.id);
      if (facMembers.length >= 5) {
        const actor = big.leaderId ?? facMembers[0]!;
        const split = splitCaucus(state, world, {
          actorId: actor,
          factionId: big.factionId,
          politicianIds: facMembers.slice(-2),
          commandId: "CMD000011",
        });
        expect(split.ok).toBe(true);
      }
    }

    // Dissolve the formed caucus
    const dissolve = dissolveCaucus(state, world, {
      actorId: unaligned[0]!,
      factionId: newId,
      commandId: "CMD000012",
      reason: "test",
    });
    expect(dissolve.ok).toBe(true);
    expect(state.caucusRuntime!.caucuses[newId]!.ancestry.dissolved).not.toBeNull();
  });
});
