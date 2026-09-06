/**
 * Phase 11.4 — assembly electoral method divergence (FPTP / closed_list_pr / mixed_member / STV).
 *
 * Behavioral tests with deterministic fixtures where party vote shares are skewed.
 * Asserts ACTUAL different seat distributions for each method and verifies MMP
 * compensatory behavior (underrepresented party in constituency seats gets list seats).
 */
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { createRngService } from "./rng.js";
import { jsonClone } from "./hash.js";
import { resolveAssemblyConstituency, computeMmpTopUp, listRankScore } from "./elections/assembly.js";
import { resolveAssemblyElection, ensurePlannedAssemblyElection } from "./elections/assembly-national.js";
import { ensureAssemblyElectionCycle } from "./elections/assembly-cycle.js";
import { miniElectorateWorld } from "./mini-electorate-world.js";
import { emptyConstitutionalOrder } from "./provinces/constitutionalOrder.js";
import type { AssemblyElectionMode } from "./provinces/constitutionalOrder.js";
import { syntheticAgentProfile } from "./agents/profile.js";

// ── Helpers ────────────────────────────────────────────────────────────

/** Run a single-constituency election with the given method and return the result. */
function runConstituencyMethod(method: AssemblyElectionMode, seed: string) {
  const world = miniElectorateWorld();
  world.constituencyElectorate.C001!.seats = 4;
  // Add extra candidates for a 4-seat constituency
  world.politicians.push(
    { id: "P5", alive: true, retired: false, partyId: "PARTY_LAB", factionId: null },
    { id: "P6", alive: true, retired: false, partyId: "PARTY_NU", factionId: null },
    { id: "P7", alive: true, retired: false, partyId: "PARTY_LAB", factionId: null },
    { id: "P8", alive: true, retired: false, partyId: "PARTY_NU", factionId: null },
  );
  for (const id of ["P5", "P6", "P7", "P8"]) {
    world.agentProfiles[id] = syntheticAgentProfile(id, { roleTypes: ["assembly_member"] });
    world.politicianHomeProvince[id] = "P01";
  }
  // Strong LAB lean: 70% LAB, 30% NU
  world.voterBlocs.C001_B01 = {
    ...world.voterBlocs.C001_B01!,
    partyHabit: { PARTY_LAB: 0.7, PARTY_NU: 0.3 },
  };
  const sim = createSimulation({ world, playerPoliticianId: "P1", seed });
  const state = jsonClone(sim.getSnapshot());
  state.provincialRuntime.constitutionalOrder = {
    ...emptyConstitutionalOrder(),
    assemblyElection: method,
  };
  // Skew standing to diversify list orderings
  state.candidateStanding.P1 = {
    politicianId: "P1",
    nameRecognition: 0.15,
    favorability: -0.4,
    enthusiasm: 0.05,
    momentum: -0.2,
  };
  state.candidateStanding.P3 = {
    politicianId: "P3",
    nameRecognition: 0.95,
    favorability: 0.9,
    enthusiasm: 0.85,
    momentum: 0.5,
  };
  state.candidateStanding.P5 = {
    politicianId: "P5",
    nameRecognition: 0.7,
    favorability: 0.5,
    enthusiasm: 0.5,
    momentum: 0.2,
  };
  const out = resolveAssemblyConstituency(world, state, createRngService(seed), {
    constituencyId: "C001",
    candidateIds: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
    partyByCandidate: {
      P1: "PARTY_LAB",
      P2: "PARTY_NU",
      P3: "PARTY_LAB",
      P4: "PARTY_NU",
      P5: "PARTY_LAB",
      P6: "PARTY_NU",
      P7: "PARTY_LAB",
      P8: "PARTY_NU",
    },
  });
  expect("error" in out).toBe(false);
  if ("error" in out) throw new Error(out.error.message);
  return out.election;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Phase 11.4 assembly electoral methods", () => {
  const seed = "ASM-METHOD-FIX-V2";

  describe("FPTP produces plurality-dominated seats", () => {
    it("all seats go to the highest first-pref candidates regardless of party", () => {
      const fptp = runConstituencyMethod("fptp", seed);
      expect(fptp.metadata.assemblyElectoralMethod).toBe("fptp");
      expect(fptp.winnerIds).toHaveLength(4);
      // With 70/30 LAB lean, FPTP should award most seats to LAB candidates
      const labWins = fptp.winnerIds.filter(
        (id) => fptp.candidates[id]?.partyId === "PARTY_LAB",
      ).length;
      expect(labWins).toBeGreaterThanOrEqual(3);
    });
  });

  describe("closed_list_pr allocates seats proportionally by party vote", () => {
    it("gives minority party seats proportional to its vote share", () => {
      const closed = runConstituencyMethod("closed_list_pr", seed);
      expect(closed.metadata.assemblyElectoralMethod).toBe("closed_list_pr");
      expect(closed.winnerIds).toHaveLength(4);
      const labWins = closed.winnerIds.filter(
        (id) => closed.candidates[id]?.partyId === "PARTY_LAB",
      ).length;
      const nuWins = closed.winnerIds.filter(
        (id) => closed.candidates[id]?.partyId === "PARTY_NU",
      ).length;
      // 70/30 split with 4 seats → LAB ~3, NU ~1 by Hare quota
      expect(labWins).toBeGreaterThanOrEqual(2);
      expect(nuWins).toBeGreaterThanOrEqual(1);
      expect(labWins + nuWins).toBe(4);
    });
  });

  describe("STV uses preference transfers", () => {
    it("produces STV archive with transfer steps", () => {
      const stv = runConstituencyMethod("stv", seed);
      expect(stv.metadata.assemblyElectoralMethod).toBe("stv");
      expect(stv.winnerIds).toHaveLength(4);
      expect(stv.countArchive?.method).toBe("stv");
      // STV should have elimination/transfer steps
      expect(stv.countArchive!.steps.length).toBeGreaterThan(0);
    });
  });

  describe("mixed_member constituency tier elects only floor(mag/2) by FPTP", () => {
    it("elects 2 constituency winners for magnitude-4 constituency", () => {
      const mixed = runConstituencyMethod("mixed_member", seed);
      expect(mixed.metadata.assemblyElectoralMethod).toBe("mixed_member");
      // floor(4/2) = 2 constituency-tier seats
      expect(mixed.winnerIds).toHaveLength(2);
      expect(mixed.seats).toBe(2);
    });
  });

  describe("methods produce distinct winner sets", () => {
    it("at least some methods produce different winners", () => {
      const fptp = runConstituencyMethod("fptp", seed);
      const closed = runConstituencyMethod("closed_list_pr", seed);
      const stv = runConstituencyMethod("stv", seed);
      const key = (ids: string[]) => [...ids].sort().join(",");
      const keys = new Set([key(fptp.winnerIds), key(closed.winnerIds), key(stv.winnerIds)]);
      // FPTP/closed-list/STV should produce at least 2 distinct winner sets
      expect(keys.size).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── MMP storage invariant test (national election) ──────────────────

describe("MMP result storage separates list and constituency winners", () => {
  const seed = "MMP-STORAGE-FIX-V1";

  function runNationalMmpElection() {
    const world = miniElectorateWorld();
    // Two constituencies with 4 seats each → floor(4/2)=2 constituency seats each
    world.constituencyElectorate.C001!.seats = 4;
    world.constituencyElectorate.C002 = {
      constituencyId: "C002",
      population: 100000,
      seats: 4,
      provincePopulationShares: [{ provinceId: "P01", share: 1 }],
      turnout2026: {
        totalPopulation: 100000,
        registeredElectorate: 75000,
        ballotsCast: 48000,
        turnoutRate: 0.64,
        invalidOrBlank: 600,
        validVoteValue: 47400,
      },
    };
    world.voterBlocs.C002_B01 = {
      id: "C002_B01",
      constituencyId: "C002",
      archetype: "suburban_professional",
      weight: 1,
      turnoutPropensity: 0.66,
      partyHabit: { PARTY_LAB: 0.4, PARTY_NU: 0.6 },
      ideology: { economic: -0.3, social: 0.2, authority: 0, green: 0.1, nationalism: 0, globalism: 0 },
      issueSalience: { ISS_REFORM: 0.5 },
    };
    world.voterBlocIdsByConstituency.C002 = ["C002_B01"];
    world.offices.OFFICE_ASM_C001 = {
      id: "OFFICE_ASM_C001",
      kind: "assembly_member",
      label: "Assembly Member C001",
      constituencyId: "C001",
      actingAllowed: false,
      incompatibleWithKinds: ["president"],
    };
    world.offices.OFFICE_ASM_C002 = {
      id: "OFFICE_ASM_C002",
      kind: "assembly_member",
      label: "Assembly Member C002",
      constituencyId: "C002",
      actingAllowed: false,
      incompatibleWithKinds: ["president"],
    };
    world.legislativeConstitution = {
      ...world.legislativeConstitution,
      assemblySeatCount: 8,
    };
    // 16 candidates: 8 per constituency
    const extraIds = ["P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16"];
    for (const id of extraIds) {
      const partyId = Number(id.slice(1)) % 2 === 1 ? "PARTY_LAB" : "PARTY_NU";
      world.politicians.push({ id, alive: true, retired: false, partyId, factionId: null });
      world.agentProfiles[id] = syntheticAgentProfile(id, { roleTypes: ["assembly_member"] });
      world.politicianHomeProvince[id] = "P01";
    }

    const sim = createSimulation({ world, playerPoliticianId: "P1", seed });
    const state = jsonClone(sim.getSnapshot());
    state.provincialRuntime.constitutionalOrder = {
      ...emptyConstitutionalOrder(),
      assemblyElection: "mixed_member",
    };

    // Set up a filed national assembly election
    const electionDate = state.currentDate;
    const election = ensurePlannedAssemblyElection(state, world, electionDate);
    const cycle = ensureAssemblyElectionCycle(state, world, election);
    cycle.filingStatus = "closed";
    election.fieldFinalized = true;
    election.status = "field_finalized";

    // File 8 candidates per constituency
    const c1Candidates = ["P1", "P3", "P5", "P7", "P9", "P11", "P13", "P15"];
    const c2Candidates = ["P2", "P4", "P6", "P8", "P10", "P12", "P14", "P16"];
    for (const id of [...c1Candidates, ...c2Candidates]) {
      const pol = world.politicians.find((p) => p.id === id)!;
      const cid = c1Candidates.includes(id) ? "C001" : "C002";
      cycle.candidacies[id] = {
        politicianId: id,
        constituencyId: cid,
        partyId: pol.partyId,
        filedDate: electionDate,
        source: "npc",
        incumbent: false,
        status: "filed",
      };
      election.candidates[id] = {
        politicianId: id,
        partyId: pol.partyId,
        sourceContestId: null,
        filedDate: electionDate,
        publicIdeology: world.agentProfiles[id]?.ideology ?? null,
        withdrawn: false,
        independentQualified: false,
      };
    }
    cycle.constituencyFields.C001 = {
      constituencyId: "C001",
      magnitude: 4,
      candidateIds: c1Candidates,
      finalizedDate: electionDate,
    };
    cycle.constituencyFields.C002 = {
      constituencyId: "C002",
      magnitude: 4,
      candidateIds: c2Candidates,
      finalizedDate: electionDate,
    };

    const rng = createRngService(seed);
    const result = resolveAssemblyElection(state, world, rng, {
      electionId: election.id,
      scheduledEventId: "SE_TEST",
      commandId: "CMD_TEST",
    });
    if ("error" in result) throw new Error(`${result.error.code}: ${result.error.message}`);
    return { state, world, election: result.election, cycle: election.assembly! };
  }

  it("constituency electedIds length = floor(mag/2) per constituency", () => {
    const { cycle } = runNationalMmpElection();
    for (const [_cid, result] of Object.entries(cycle.constituencyResults)) {
      const expectedConstituencySeats = Math.max(1, Math.floor(result.magnitude / 2));
      expect(result.electedIds).toHaveLength(expectedConstituencySeats);
    }
  });

  it("list winners are NOT in any constituency electedIds", () => {
    const { election, cycle } = runNationalMmpElection();
    const listWinners = election.metadata.mmpListWinners as string[];
    expect(Array.isArray(listWinners)).toBe(true);
    expect(listWinners.length).toBeGreaterThan(0);
    for (const result of Object.values(cycle.constituencyResults)) {
      for (const listWinnerId of listWinners) {
        expect(result.electedIds).not.toContain(listWinnerId);
      }
    }
  });

  it("party seat totals = constituency + top-up", () => {
    const { election, cycle } = runNationalMmpElection();
    const meta = election.metadata as Record<string, unknown>;
    const listByParty = meta.mmpListWinnersByParty as Record<string, string[]>;
    expect(listByParty).toBeDefined();
    const constituencyByParty: Record<string, number> = {};
    for (const result of Object.values(cycle.constituencyResults)) {
      for (const id of result.electedIds) {
        const party = result.partyByCandidate[id] ?? "independent";
        constituencyByParty[party] = (constituencyByParty[party] ?? 0) + 1;
      }
    }
    for (const [party, total] of Object.entries(cycle.partySeatTotals)) {
      const constSeats = constituencyByParty[party] ?? 0;
      const listSeats = (listByParty[party] ?? []).length;
      expect(constSeats + listSeats).toBe(total);
    }
  });

  it("election.winnerIds contains all constituency + list winners", () => {
    const { election, cycle } = runNationalMmpElection();
    const listWinners = election.metadata.mmpListWinners as string[];
    const allConstituencyWinners = Object.values(cycle.constituencyResults).flatMap(
      (r) => r.electedIds,
    );
    const expectedAll = new Set([...allConstituencyWinners, ...listWinners]);
    expect(new Set(election.winnerIds)).toEqual(expectedAll);
  });

  it("metadata.constituencyWinners contains constituency-only winners", () => {
    const { election, cycle } = runNationalMmpElection();
    const metaWinners = election.metadata.constituencyWinners as Record<string, string[]>;
    const listWinners = new Set(election.metadata.mmpListWinners as string[]);
    for (const [cid, ids] of Object.entries(metaWinners)) {
      expect(ids.sort()).toEqual([...cycle.constituencyResults[cid]!.electedIds].sort());
      for (const id of ids) {
        expect(listWinners.has(id)).toBe(false);
      }
    }
  });

  it("mmpListWinnersByConstituency maps list winners to home constituencies", () => {
    const { election, cycle } = runNationalMmpElection();
    const byConst = election.metadata.mmpListWinnersByConstituency as Record<string, string[]>;
    const listWinners = election.metadata.mmpListWinners as string[];
    expect(byConst).toBeDefined();
    const allMapped = Object.values(byConst).flat();
    expect(allMapped.sort()).toEqual([...listWinners].sort());
    for (const [cid, ids] of Object.entries(byConst)) {
      for (const id of ids) {
        const candidacy = cycle.candidacies[id];
        expect(candidacy?.constituencyId).toBe(cid);
      }
    }
  });
});

// ── Focused unit tests for computeMmpTopUp ──────────────────────────

describe("computeMmpTopUp", () => {
  it("assigns compensatory top-up seats to underrepresented parties", () => {
    const result = computeMmpTopUp({
      totalChamberSeats: 10,
      nationalPartyVotes: { PARTY_A: 600, PARTY_B: 400 },
      constituencyWinsByParty: { PARTY_A: 4, PARTY_B: 1 },
      listCandidatesByParty: {
        PARTY_A: ["A5", "A6", "A7"],
        PARTY_B: ["B5", "B6", "B7", "B8"],
      },
    });
    // Hare entitlements: A→6, B→4
    expect(result.partyEntitlements.PARTY_A).toBe(6);
    expect(result.partyEntitlements.PARTY_B).toBe(4);
    // A won 4, entitled 6 → top-up 2
    expect(result.topUpWinnersByParty.PARTY_A).toEqual(["A5", "A6"]);
    // B won 1, entitled 4 → top-up 3
    expect(result.topUpWinnersByParty.PARTY_B).toEqual(["B5", "B6", "B7"]);
    expect(result.overhang).toBe(0);
    expect(result.expandedChamberSize).toBe(10);
  });

  it("expands chamber on overhang (party wins more constituency than entitled)", () => {
    const result = computeMmpTopUp({
      totalChamberSeats: 10,
      nationalPartyVotes: { PARTY_A: 400, PARTY_B: 600 },
      constituencyWinsByParty: { PARTY_A: 5, PARTY_B: 1 },
      listCandidatesByParty: {
        PARTY_A: ["A6", "A7"],
        PARTY_B: ["B2", "B3", "B4", "B5", "B6"],
      },
    });
    // Hare entitlements: A→4, B→6
    expect(result.partyEntitlements.PARTY_A).toBe(4);
    expect(result.partyEntitlements.PARTY_B).toBe(6);
    // A won 5 constituency seats but only entitled to 4 → overhang of 1
    // A gets 0 top-up (won more than entitled)
    expect(result.topUpWinnersByParty.PARTY_A).toEqual([]);
    // B won 1, entitled 6 → top-up 5
    expect(result.topUpWinnersByParty.PARTY_B).toEqual(["B2", "B3", "B4", "B5", "B6"]);
    // 6 constituency seats + 5 top-up = 11 > 10 → overhang
    expect(result.overhang).toBe(1);
    expect(result.expandedChamberSize).toBe(11);
  });

  it("handles three parties with proportional allocation", () => {
    const result = computeMmpTopUp({
      totalChamberSeats: 100,
      nationalPartyVotes: { RED: 500, BLUE: 300, GREEN: 200 },
      constituencyWinsByParty: { RED: 40, BLUE: 8, GREEN: 2 },
      listCandidatesByParty: {
        RED: Array.from({ length: 20 }, (_, i) => `R${i}`),
        BLUE: Array.from({ length: 30 }, (_, i) => `B${i}`),
        GREEN: Array.from({ length: 20 }, (_, i) => `G${i}`),
      },
    });
    // Entitlements: RED 50, BLUE 30, GREEN 20
    expect(result.partyEntitlements.RED).toBe(50);
    expect(result.partyEntitlements.BLUE).toBe(30);
    expect(result.partyEntitlements.GREEN).toBe(20);
    // Top-up: RED 10, BLUE 22, GREEN 18
    expect(result.topUpWinnersByParty.RED).toHaveLength(10);
    expect(result.topUpWinnersByParty.BLUE).toHaveLength(22);
    expect(result.topUpWinnersByParty.GREEN).toHaveLength(18);
    expect(result.overhang).toBe(0);
    expect(result.expandedChamberSize).toBe(100);
  });

  it("caps top-up when party has insufficient list candidates", () => {
    const result = computeMmpTopUp({
      totalChamberSeats: 10,
      nationalPartyVotes: { PARTY_A: 300, PARTY_B: 700 },
      constituencyWinsByParty: { PARTY_A: 2, PARTY_B: 3 },
      listCandidatesByParty: {
        PARTY_A: ["A3"],
        PARTY_B: ["B4", "B5", "B6", "B7"],
      },
    });
    // B entitled ~7, won 3, top-up 4
    expect(result.topUpWinnersByParty.PARTY_B).toHaveLength(4);
    // A entitled ~3, won 2, needs 1 but only 1 list candidate
    expect(result.topUpWinnersByParty.PARTY_A).toEqual(["A3"]);
  });

  it("returns empty results for zero parties", () => {
    const result = computeMmpTopUp({
      totalChamberSeats: 10,
      nationalPartyVotes: {},
      constituencyWinsByParty: {},
      listCandidatesByParty: {},
    });
    expect(result.topUpWinnersByParty).toEqual({});
    expect(result.overhang).toBe(0);
    expect(result.expandedChamberSize).toBe(0);
  });
});

// ── listRankScore ────────────────────────────────────────────────────

describe("listRankScore", () => {
  it("ranks high-standing candidates above low-standing", () => {
    const high = listRankScore({
      politicianId: "H",
      nameRecognition: 0.9,
      favorability: 0.8,
      enthusiasm: 0.7,
      momentum: 0.5,
    });
    const low = listRankScore({
      politicianId: "L",
      nameRecognition: 0.1,
      favorability: -0.5,
      enthusiasm: 0.05,
      momentum: -0.2,
    });
    expect(high).toBeGreaterThan(low);
  });
});
