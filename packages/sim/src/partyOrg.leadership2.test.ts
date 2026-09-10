/**
 * partyOrg.leadership2.test.ts
 *
 * Deeper leadership catalogs / electorate / voting / committee pending coverage.
 */

import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { recomputeCaucusShares } from "./caucus/shares.js";
import { normalizePartyPriorities, PARTY_PRIORITY_CATALOG } from "./partyOrg/catalog.js";
import { allocatePartySupport, setPartyPriorities } from "./partyOrg/commands.js";
import {
  castNationalCommitteeVote,
  conductCommitteeVote,
  requireCommitteeApproval,
  seedNationalCommittee,
} from "./partyOrg/committee.js";
import {
  buildElectorIds,
  declareChairCandidacy,
  electorWeight,
  openPartyChairElection,
  resolveChairElection,
  unalignedBlocElectorId,
} from "./partyOrg/elections.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { defaultPartyRules } from "./partyOrg/rules.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import type { SimState } from "./types.js";

function setup(seed = "partyorg-leadership2") {
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

describe("partyOrg leadership2: committee electorate", () => {
  it("committee electorate uses nationalCommittee roster", () => {
    const { world, state } = setup("electorate-committee");
    const partyId = partyWithEnoughMembers(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.nationalCommittee[partyId] = [];
    const roster = seedNationalCommittee(world, state, partyId);
    expect(roster.length).toBeGreaterThanOrEqual(12);

    // Force a distinctive roster order/membership
    const custom = roster.slice().reverse();
    runtime.nationalCommittee[partyId] = custom;

    const electors = buildElectorIds(state, world, partyId, "committee");
    expect(electors).toEqual(custom);
    expect(electors.length).toBe(custom.length);
    // Must not collapse to officers-only
    const officers = Object.values(runtime.officers[partyId] ?? {})
      .filter(Boolean)
      .map((o) => o!.politicianId);
    expect(electors.length).toBeGreaterThan(officers.length);
  });
});

describe("partyOrg leadership2: priorities catalog", () => {
  it("normalizes priorities to max 5 catalog ids", () => {
    const ids = Object.keys(PARTY_PRIORITY_CATALOG);
    expect(ids.length).toBeGreaterThanOrEqual(16);

    const normalized = normalizePartyPriorities([
      ids[0]!,
      "not_a_real_priority",
      ids[0]!,
      ids[1]!,
      ids[2]!,
      ids[3]!,
      ids[4]!,
      ids[5]!,
      ids[6]!,
    ]);
    expect(normalized).toEqual([ids[0], ids[1], ids[2], ids[3], ids[4]]);
    expect(normalized.length).toBe(5);

    const { world, state } = setup("priorities-normalize");
    const partyId = partyWithEnoughMembers(state);
    const chairId = state.partyOrgRuntime!.officers[partyId]?.chair?.politicianId;
    expect(chairId).toBeTruthy();

    const result = setPartyPriorities(state, world, {
      actorId: chairId!,
      partyId,
      priorities: ["bogus", ids[0]!, ids[1]!, ids[2]!, ids[3]!, ids[4]!, ids[5]!],
      commandId: "CMD_PRIO_NORM",
    });
    expect(result.ok).toBe(true);
    expect(state.partyOrgRuntime!.priorities[partyId]).toEqual([
      ids[0],
      ids[1],
      ids[2],
      ids[3],
      ids[4],
    ]);
  });
});

describe("partyOrg leadership2: runoff / RCV", () => {
  it("runoff/RCV path with 3 candidates produces a winner", () => {
    const { world, state } = setup("election-rcv");
    const partyId = partyWithEnoughMembers(state);
    const runtime = ensurePartyOrgRuntime(state);

    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      chairElectionMethod: "committee",
      votingSystem: "ranked_choice",
      nationalCommitteeApprovalRequired: false,
    };

    const opened = openPartyChairElection(state, world, {
      partyId,
      commandId: "CMD_OPEN_RCV",
      triggerReason: "challenge",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const election = runtime.chairElections[opened.electionId]!;
    expect(election.stage).toBe("opening");
    expect(election.triggerReason).toBe("challenge");
    expect(election.votingSystem).toBe("ranked_choice");

    const candidates = Object.entries(state.politicians)
      .filter(([, p]) => p.partyId === partyId && p.alive && !p.retired)
      .map(([id]) => id)
      .slice(0, 3);
    expect(candidates.length).toBe(3);

    for (const polId of candidates) {
      declareChairCandidacy(state, world, {
        electionId: opened.electionId,
        politicianId: polId,
        commandId: "CMD_CAND_RCV",
      });
    }
    expect(election.candidates.length).toBe(3);
    expect(election.stage).toBe("nominations");
    for (const cid of candidates) {
      expect(election.programs[cid]).toBeDefined();
    }

    // Spread affinities so IRV / runoff has meaningful rankings
    const electors = buildElectorIds(state, world, partyId, "committee");
    for (let i = 0; i < electors.length; i++) {
      const electorId = electors[i]!;
      if (!state.relationships[electorId]) state.relationships[electorId] = {};
      const preferred = candidates[i % 3]!;
      for (const cid of candidates) {
        state.relationships[electorId]![cid] = {
          sourceId: electorId,
          targetId: cid,
          affinity: cid === preferred ? 0.9 : cid === candidates[(i + 1) % 3]! ? 0.2 : -0.4,
          trust: 0,
          respect: 0,
          lastUpdatedDate: state.currentDate,
          interactionCount: 1,
        };
      }
    }

    const resolved = resolveChairElection(state, world, {
      electionId: opened.electionId,
      commandId: "CMD_RESOLVE_RCV",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(candidates).toContain(resolved.winnerId);
    expect(election.status).toBe("resolved");
    expect(election.stage).toBe("aftermath");
    expect(election.tally).toBeDefined();
    expect(runtime.officers[partyId]?.chair?.politicianId).toBe(resolved.winnerId);

    // Also exercise runoff on a fresh election after resolving
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      chairElectionMethod: "committee",
      votingSystem: "runoff",
    };
    // Clear open guard by ensuring prior is resolved
    const opened2 = openPartyChairElection(state, world, {
      partyId,
      commandId: "CMD_OPEN_RUNOFF",
    });
    expect(opened2.ok).toBe(true);
    if (!opened2.ok) return;
    for (const polId of candidates) {
      declareChairCandidacy(state, world, {
        electionId: opened2.electionId,
        politicianId: polId,
        commandId: "CMD_CAND_RUNOFF",
      });
    }
    const resolved2 = resolveChairElection(state, world, {
      electionId: opened2.electionId,
      commandId: "CMD_RESOLVE_RUNOFF",
    });
    expect(resolved2.ok).toBe(true);
    if (resolved2.ok) expect(candidates).toContain(resolved2.winnerId);
  });
});

describe("partyOrg leadership2: player committee vote pending", () => {
  it("does not auto-cast the player; pending until castNationalCommitteeVote", () => {
    const { world, state } = setup("committee-pending-player");
    const partyId = partyWithEnoughMembers(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: true,
    };

    runtime.nationalCommittee[partyId] = [];
    const roster = seedNationalCommittee(world, state, partyId);
    // Ensure the player is on the committee
    if (!roster.includes(state.playerPoliticianId)) {
      runtime.nationalCommittee[partyId] = [...roster.slice(0, -1), state.playerPoliticianId];
    }

    const chairId = runtime.officers[partyId]?.chair?.politicianId;
    expect(chairId).toBeTruthy();

    const vote = conductCommitteeVote(state, world, {
      partyId,
      proposalKind: "allocate_support",
      proposalPayload: { allocations: { assembly: 1 } },
      commandId: "CMD_PENDING_VOTE",
    });
    expect(vote.pendingPlayer).toBe(true);
    expect(vote.pendingVoteId).toBeTruthy();
    expect(vote.passed).toBe(false);
    expect(vote.yes + vote.no + vote.abstain).toBe(
      (runtime.nationalCommittee[partyId] ?? []).filter((id) => id !== state.playerPoliticianId)
        .length,
    );

    const pending = runtime.pendingCommitteeVotes[vote.pendingVoteId!]!;
    expect(pending).toBeDefined();
    expect(pending.playerChoice).toBeNull();
    expect(pending.status).toBe("pending");

    const gated = requireCommitteeApproval(state, world, {
      partyId,
      proposalKind: "allocate_support",
      proposalPayload: { allocations: { assembly: 0.5 } },
      commandId: "CMD_PENDING_REQ",
    });
    expect(gated.ok).toBe(false);
    if (!gated.ok) expect(gated.error.code).toBe("COMMITTEE_PENDING_PLAYER");

    const cast = castNationalCommitteeVote(state, world, {
      voteId: vote.pendingVoteId!,
      choice: "yes",
      commandId: "CMD_CAST_YES",
    });
    expect(cast.ok).toBe(true);
    if (cast.ok) {
      expect(pending.playerChoice).toBe("yes");
      expect(pending.status).toBe("resolved");
      expect(typeof cast.passed).toBe("boolean");
    }

    // Direct allocate while another pending may still gate if player remains member
    // Use a party rules override that does not require approval to confirm command path still works.
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: false,
    };
    const alloc = allocatePartySupport(state, world, {
      actorId: chairId!,
      partyId,
      allocations: { assembly: 0.4, presidential: 0.6 },
      commandId: "CMD_ALLOC_OK",
    });
    expect(alloc.ok).toBe(true);
  });
});

describe("partyOrg leadership2: membership weights use partyMemberSupport", () => {
  it("aggregate membership weight favors high partyMemberSupport over high membershipShare", () => {
    const { world, state } = setup("membership-weight-pms");
    const partyId = partyWithEnoughMembers(state);
    const caucusRuntime = ensureCaucusRuntime(state);

    const byFaction = new Map<string, string[]>();
    for (const [id, pol] of Object.entries(state.politicians)) {
      if (pol.partyId !== partyId || !pol.alive || pol.retired || !pol.factionId) continue;
      const list = byFaction.get(pol.factionId) ?? [];
      list.push(id);
      byFaction.set(pol.factionId, list);
    }
    const factions = [...byFaction.entries()]
      .filter(([fid, ids]) => ids.length >= 1 && caucusRuntime.caucuses[fid])
      .sort((a, b) => a[0].localeCompare(b[0]));
    expect(factions.length).toBeGreaterThanOrEqual(2);

    const [factionA] = factions[0]!;
    const [factionB] = factions[1]!;
    const caucusA = caucusRuntime.caucuses[factionA]!;
    const caucusB = caucusRuntime.caucuses[factionB]!;

    // Elite share favors A; mass-member support favors B.
    caucusA.membershipShare = 0.75;
    caucusA.partyMemberSupport = 0.12;
    caucusB.membershipShare = 0.08;
    caucusB.partyMemberSupport = 0.68;

    const electors = buildElectorIds(state, world, partyId, "membership");
    let weightA = 0;
    let weightB = 0;
    for (const electorId of electors) {
      const w = electorWeight(state, partyId, electorId, electors, "membership");
      const fid = state.politicians[electorId]?.factionId;
      if (fid === factionA) weightA += w;
      if (fid === factionB) weightB += w;
    }

    expect(weightA).toBeCloseTo(0.12, 5);
    expect(weightB).toBeCloseTo(0.68, 5);
    expect(weightB).toBeGreaterThan(weightA);
  });

  it("unaligned mass bloc participates with zero unaligned politicians", () => {
    const { world, state } = setup("membership-unaligned-bloc");
    const partyId = partyWithEnoughMembers(state);
    const caucusRuntime = ensureCaucusRuntime(state);
    const runtime = ensurePartyOrgRuntime(state);

    const byFaction = new Map<string, string[]>();
    for (const [id, pol] of Object.entries(state.politicians)) {
      if (pol.partyId !== partyId || !pol.alive || pol.retired) continue;
      // Force every party politician into a caucus — zero unaligned elites.
      if (!pol.factionId) {
        const anyFaction = Object.keys(caucusRuntime.caucuses).find(
          (fid) => caucusRuntime.caucuses[fid]?.partyId === partyId,
        );
        if (anyFaction) pol.factionId = anyFaction;
      }
      if (!pol.factionId) continue;
      const list = byFaction.get(pol.factionId) ?? [];
      list.push(id);
      byFaction.set(pol.factionId, list);
    }

    const factions = [...byFaction.entries()]
      .filter(([fid]) => caucusRuntime.caucuses[fid]?.partyId === partyId)
      .sort((a, b) => a[0].localeCompare(b[0]));
    expect(factions.length).toBeGreaterThanOrEqual(3);

    const [factionA, membersA] = factions[0]!;
    const [factionB, membersB] = factions[1]!;
    const [factionC, membersC] = factions[2]!;

    // Zero out other caucuses' mass support so totals are exactly the three blocs + unaligned.
    for (const [fid, row] of Object.entries(caucusRuntime.caucuses)) {
      if (row.partyId !== partyId) continue;
      if (fid === factionA || fid === factionB || fid === factionC) continue;
      row.partyMemberSupport = 0;
      row.membershipShare = 0;
    }

    caucusRuntime.caucuses[factionA]!.partyMemberSupport = 0.35;
    caucusRuntime.caucuses[factionB]!.partyMemberSupport = 0.27;
    caucusRuntime.caucuses[factionC]!.partyMemberSupport = 0.2;
    caucusRuntime.unalignedByParty[partyId] = {
      membershipShare: 0,
      partyMemberSupport: 0.18,
      assemblyShare: 0,
      institutionalInfluence: 0,
    };

    // Confirm no unaligned politician proxies remain.
    const realUnaligned = Object.values(state.politicians).filter(
      (p) => p.partyId === partyId && p.alive && !p.retired && !p.factionId,
    );
    expect(realUnaligned.length).toBe(0);

    const electors = buildElectorIds(state, world, partyId, "membership");
    const blocId = unalignedBlocElectorId(partyId);
    expect(electors).toContain(blocId);

    let totalWeight = 0;
    let unalignedWeight = 0;
    for (const electorId of electors) {
      const w = electorWeight(state, partyId, electorId, electors, "membership");
      totalWeight += w;
      if (electorId === blocId) unalignedWeight += w;
    }
    expect(unalignedWeight).toBeCloseTo(0.18, 5);
    expect(Math.abs(totalWeight - 1)).toBeLessThanOrEqual(0.02);

    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      chairElectionMethod: "membership",
      votingSystem: "plurality",
      nationalCommitteeApprovalRequired: false,
    };

    const candPool = [...membersA, ...membersB, ...membersC]
      .slice()
      .sort((a, b) => a.localeCompare(b));
    const cand1 = candPool[0]!;
    const cand2 = candPool[1]!;
    expect(cand1).not.toBe(cand2);

    const setFactionAffinities = (st: SimState) => {
      const prefer = (electorIds: string[], preferred: string, other: string) => {
        for (const electorId of electorIds) {
          if (!st.relationships[electorId]) st.relationships[electorId] = {};
          st.relationships[electorId]![preferred] = {
            sourceId: electorId,
            targetId: preferred,
            affinity: 0.95,
            trust: 0,
            respect: 0,
            lastUpdatedDate: st.currentDate,
            interactionCount: 1,
          };
          st.relationships[electorId]![other] = {
            sourceId: electorId,
            targetId: other,
            affinity: -0.4,
            trust: 0,
            respect: 0,
            lastUpdatedDate: st.currentDate,
            interactionCount: 1,
          };
        }
      };
      // A (0.35) → cand1; B+C (0.47) → cand2; unaligned 0.18 is pivotal.
      prefer(membersA, cand1, cand2);
      prefer([...membersB, ...membersC], cand2, cand1);
    };

    const runWithUnalignedPreference = (preferred: string, other: string) => {
      const st = jsonClone(state) as SimState;
      ensurePartyOrgRuntime(st);
      ensureCaucusRuntime(st);
      setFactionAffinities(st);
      if (!st.relationships[blocId]) st.relationships[blocId] = {};
      st.relationships[blocId]![preferred] = {
        sourceId: blocId,
        targetId: preferred,
        affinity: 1,
        trust: 0,
        respect: 0,
        lastUpdatedDate: st.currentDate,
        interactionCount: 1,
      };
      st.relationships[blocId]![other] = {
        sourceId: blocId,
        targetId: other,
        affinity: -1,
        trust: 0,
        respect: 0,
        lastUpdatedDate: st.currentDate,
        interactionCount: 1,
      };

      const opened = openPartyChairElection(st, world, {
        partyId,
        commandId: `CMD_OPEN_UNALIGNED_${preferred}`,
        triggerReason: "challenge",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return null;
      declareChairCandidacy(st, world, {
        electionId: opened.electionId,
        politicianId: cand1,
        commandId: "CMD_CAND1",
      });
      declareChairCandidacy(st, world, {
        electionId: opened.electionId,
        politicianId: cand2,
        commandId: "CMD_CAND2",
      });
      const resolved = resolveChairElection(st, world, {
        electionId: opened.electionId,
        commandId: `CMD_RESOLVE_UNALIGNED_${preferred}`,
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return null;
      return resolved.winnerId;
    };

    const winnerPrefer1 = runWithUnalignedPreference(cand1, cand2);
    const winnerPrefer2 = runWithUnalignedPreference(cand2, cand1);
    expect(winnerPrefer1).toBe(cand1);
    expect(winnerPrefer2).toBe(cand2);
    expect(winnerPrefer1).not.toBe(winnerPrefer2);
  });
});
