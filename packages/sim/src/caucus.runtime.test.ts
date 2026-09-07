/**
 * caucus.runtime.test.ts — Caucuses 2.0 shares, endorse, alliance, merge/split bounds.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import type { SimState } from "./types.js";
import {
  endorseChairCandidate,
  formCaucusAlliance,
  processCaucusMonth,
  proposeCaucusMerger,
  recomputeCaucusShares,
  scoreCaucusMergeCompatibility,
} from "./caucus/index.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { factionMembers } from "./parties/queries.js";

function setup(seed = "caucus-runtime") {
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

describe("caucus runtime: shares", () => {
  it("membership + unaligned roughly sum to 1 per party", () => {
    const { world, state } = setup("shares-sum");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);

    let sum = state.caucusRuntime!.unalignedByParty[partyId]?.membershipShare ?? 0;
    for (const fid of factionIds) {
      sum += state.caucusRuntime!.caucuses[fid]!.membershipShare;
    }
    expect(sum).toBeGreaterThan(0.98);
    expect(sum).toBeLessThan(1.02);

    // Recompute is idempotent
    recomputeCaucusShares(world, state);
    let sum2 = state.caucusRuntime!.unalignedByParty[partyId]?.membershipShare ?? 0;
    for (const fid of factionIds) {
      sum2 += state.caucusRuntime!.caucuses[fid]!.membershipShare;
    }
    expect(sum2).toBeCloseTo(sum, 5);
  });

  it("syncs leaderId from faction chair", () => {
    const { state } = setup("leader-sync");
    const { factionIds } = partyWithMultipleCaucuses(state);
    const fid = factionIds[0]!;
    const chair = state.factionStates[fid]?.chairId;
    expect(state.caucusRuntime!.caucuses[fid]!.leaderId).toBe(chair ?? null);
  });
});

describe("caucus runtime: endorse", () => {
  it("records chair endorsement for the caucus", () => {
    const { world, state } = setup("endorse-chair");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);
    const factionId = factionIds[0]!;
    const row = state.caucusRuntime!.caucuses[factionId]!;
    const actorId = row.leaderId ?? state.factionStates[factionId]!.chairId!;
    expect(actorId).toBeTruthy();

    const candidateId = Object.entries(state.politicians).find(
      ([id, p]) => p.partyId === partyId && p.alive && !p.retired && id !== actorId,
    )?.[0];
    expect(candidateId).toBeTruthy();

    const result = endorseChairCandidate(state, world, {
      actorId: actorId!,
      factionId,
      candidateId: candidateId!,
      commandId: "CMD000001",
    });
    expect(result.ok).toBe(true);
    expect(state.caucusRuntime!.caucuses[factionId]!.endorsedChairCandidateId).toBe(candidateId);
  });
});

describe("caucus runtime: alliance", () => {
  it("forms a same-party alliance", () => {
    const { world, state } = setup("alliance");
    const { factionIds } = partyWithMultipleCaucuses(state);
    const a = factionIds[0]!;
    const b = factionIds[1]!;
    const actorId = state.caucusRuntime!.caucuses[a]!.leaderId ?? state.factionStates[a]!.chairId!;

    const result = formCaucusAlliance(state, world, {
      actorId: actorId!,
      factionId: a,
      otherFactionId: b,
      kind: "alliance",
      commandId: "CMD000002",
    });
    expect(result.ok).toBe(true);
    expect(state.caucusRuntime!.caucuses[a]!.alliances[b]?.kind).toBe("alliance");
    expect(state.caucusRuntime!.caucuses[b]!.alliances[a]?.kind).toBe("alliance");
  });
});

describe("caucus runtime: merge/split bounded", () => {
  it("merge dissolves absorb caucus and moves members", () => {
    const { world, state } = setup("merge");
    const { partyId, factionIds } = partyWithMultipleCaucuses(state);

    // Pick smallest as absorb, largest as into
    const ranked = [...factionIds].sort(
      (x, y) =>
        (state.caucusRuntime!.caucuses[x]!.membershipShare ?? 0) -
        (state.caucusRuntime!.caucuses[y]!.membershipShare ?? 0),
    );
    const absorbId = ranked[0]!;
    const intoId = ranked[ranked.length - 1]!;
    const beforeMembers = factionMembers(state, absorbId).length;
    expect(beforeMembers).toBeGreaterThan(0);

    // Force high compatibility via alliance + lower threshold
    const actorId =
      state.caucusRuntime!.caucuses[absorbId]!.leaderId ?? state.factionStates[absorbId]!.chairId!;
    formCaucusAlliance(state, world, {
      actorId: actorId!,
      factionId: absorbId,
      otherFactionId: intoId,
      kind: "alliance",
      commandId: "CMD000003",
    });

    const score = scoreCaucusMergeCompatibility(world, state, absorbId, intoId);
    expect(score).toBeGreaterThan(0);

    const result = proposeCaucusMerger(state, world, {
      actorId: actorId!,
      absorbFactionId: absorbId,
      intoFactionId: intoId,
      commandId: "CMD000004",
      minCompatibility: Math.min(0.2, score),
    });
    expect(result.ok).toBe(true);
    expect(state.caucusRuntime!.caucuses[absorbId]!.ancestry.dissolved).toBeTruthy();
    expect(state.caucusRuntime!.caucuses[absorbId]!.ancestry.successor).toBe(intoId);
    expect(factionMembers(state, absorbId).length).toBe(0);
    expect(factionMembers(state, intoId).length).toBeGreaterThanOrEqual(beforeMembers);

    // Active caucus count for party does not explode
    const active = Object.values(state.caucusRuntime!.caucuses).filter(
      (c) => c.partyId === partyId && !c.ancestry.dissolved,
    );
    expect(active.length).toBeLessThanOrEqual(factionIds.length);
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it("monthly process stays bounded (no caucus explosion)", () => {
    const { world, state } = setup("monthly-bound");
    const before = Object.values(state.caucusRuntime!.caucuses).filter(
      (c) => !c.ancestry.dissolved,
    ).length;

    // Run several months with distinct lastCaucusMonth resets
    for (let i = 0; i < 8; i++) {
      state.caucusRuntime!.lastCaucusMonth = null;
      // Advance date by months via string hack for monthStart uniqueness
      const y = 2024 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      state.currentDate = `${y}-${String(m).padStart(2, "0")}-01`;
      processCaucusMonth(world, state, `CMD_M${i}`);
    }

    const after = Object.values(state.caucusRuntime!.caucuses).filter(
      (c) => !c.ancestry.dissolved,
    ).length;
    // Soft splits go to unaligned; revives only restore prior dissolved — never dozens of new ids
    expect(after).toBeLessThanOrEqual(before + 2);
    expect(after).toBeGreaterThan(0);
  });
});
