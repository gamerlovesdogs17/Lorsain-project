import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { createRngService } from "./rng.js";
import {
  ensureOfficeNominationContests,
  officeNominationContestsForElection,
  officeNominationCycleMetadata,
  openOfficeNominationContests,
  resolveOfficeNominationContests,
} from "./parties/officeNominations.js";
import { partyNominationMethod } from "./campaigns/nominations.js";
import type { SimState } from "./types.js";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function labourPartyId(state: SimState): string {
  return state.politicians[state.playerPoliticianId]?.partyId ?? "PARTY_LAB";
}

describe("Phase 14 office nominations", () => {
  it("creates gubernatorial nomination contests keyed by party/election/office", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p14-nom-a", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    const election = Object.values(state.provincialRuntime.elections).sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0];
    expect(election).toBeTruthy();

    const { contests, events } = ensureOfficeNominationContests(state, world, {
      officeKind: "gubernatorial",
      electionId: election!.id,
      electionDate: election!.date,
      provinceId: election!.provinceId,
      partyIds: ["PARTY_LAB", "PARTY_NU"],
      maxCandidatesPerParty: 3,
      commandId: "test",
    });

    expect(contests.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "PARTY_CONTEST_CREATED")).toBe(true);

    for (const contest of contests) {
      expect(contest.type).toBe("gubernatorial_nomination");
      const meta = officeNominationCycleMetadata(contest);
      expect(meta?.electionId).toBe(election!.id);
      expect(meta?.officeKind).toBe("gubernatorial");
      expect(meta?.partyId).toBe(contest.partyId);
      expect(Object.keys(contest.entries).length).toBeGreaterThan(0);
      expect(partyNominationMethod(world, contest.partyId, state)).not.toBe("none");
    }

    const again = ensureOfficeNominationContests(state, world, {
      officeKind: "gubernatorial",
      electionId: election!.id,
      electionDate: election!.date,
      provinceId: election!.provinceId,
    });
    expect(again.contests.length).toBe(contests.length);
    expect(again.events.length).toBe(0);
  });

  it("opens and resolves contests with plurality/RCV and syncs winner metadata", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p14-nom-b", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    const rng = createRngService("p14-nom-b-resolve");
    const election = Object.values(state.provincialRuntime.elections).sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0]!;
    election.status = "filing_open";

    ensureOfficeNominationContests(state, world, {
      officeKind: "gubernatorial",
      electionId: election.id,
      electionDate: election.date,
      provinceId: election.provinceId,
      partyIds: [labourPartyId(state)],
      maxCandidatesPerParty: 4,
      commandId: "test",
    });

    const openEvents = openOfficeNominationContests(state, election.id, "gubernatorial", "test");
    expect(openEvents.some((e) => e.type === "PARTY_CONTEST_OPENED")).toBe(true);

    const resolveEvents = resolveOfficeNominationContests(
      state,
      world,
      rng,
      election.id,
      "gubernatorial",
      "test",
    );
    expect(resolveEvents.some((e) => e.type === "PARTY_CONTEST_RESOLVED")).toBe(true);

    const resolved = officeNominationContestsForElection(state, election.id, "gubernatorial");
    expect(resolved.every((c) => c.status === "resolved")).toBe(true);
    expect(resolved.every((c) => c.winnerId != null)).toBe(true);

    for (const contest of resolved) {
      const winner = contest.winnerId!;
      const cand = election.candidates[winner];
      expect(cand).toBeTruthy();
      expect(cand!.sourceContestId).toBe(contest.id);
      expect(cand!.partyId).toBe(contest.partyId);

      const campaign = Object.values(state.campaignRuntime.campaigns).find(
        (c) => c.politicianId === winner && c.contestId === contest.id,
      );
      expect(campaign).toBeTruthy();
      expect(campaign!.metadata.nominationWinner).toBe(true);
      expect(campaign!.metadata.nominationMethod).toBeTruthy();
    }

    expect(resolveEvents.some((e) => e.type === "OFFICE_NOMINATION_WINNER_SYNCED")).toBe(true);
  });

  it("creates and resolves assembly nomination contests", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p14-nom-c", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    const rng = createRngService("p14-nom-c-resolve");

    let election = Object.values(state.elections).find((e) => e.type === "assembly");
    if (!election) {
      const id = "ELEC_ASM_TEST_NOM";
      state.elections[id] = {
        id,
        type: "assembly",
        date: "2030-05-01",
        status: "field_open",
        geographyKind: "national",
        constituencyId: null,
        seats: 120,
        fieldFinalized: false,
        candidates: {},
        partiesWithoutNominee: [],
        turnout: null,
        countInput: null,
        countArchive: null,
        winnerIds: [],
        resultEventId: null,
        assembly: {
          filingStatus: "open",
          filingOpenDate: state.currentDate,
          filingDeadlineDate: "2030-04-01",
          decisions: {},
          candidacies: {},
          constituencyFields: {},
          constituencyResults: {},
          partySeatTotals: {},
        },
        metadata: {},
      };
      election = state.elections[id]!;
    } else {
      election.status = "field_open";
      election.fieldFinalized = false;
      if (election.assembly) election.assembly.filingStatus = "open";
    }

    const { contests } = ensureOfficeNominationContests(state, world, {
      officeKind: "assembly",
      electionId: election.id,
      electionDate: election.date,
      partyIds: ["PARTY_LAB"],
      maxCandidatesPerParty: 3,
      commandId: "test",
    });
    expect(contests.length).toBe(1);
    expect(contests[0]!.type).toBe("assembly_nomination");

    resolveOfficeNominationContests(state, world, rng, election.id, "assembly", "test");
    const done = officeNominationContestsForElection(state, election.id, "assembly")[0]!;
    expect(done.status).toBe("resolved");
    expect(done.winnerId).toBeTruthy();
    expect(election.candidates[done.winnerId!]?.sourceContestId).toBe(done.id);
  });

  it("sync withdraws co-partisan auto-filings so nomination winner is sole candidate", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({ world, seed: "p14-nom-d", playerPoliticianId: "NPC146" });
    const state = jsonClone(sim.getSnapshot() as SimState);
    const rng = createRngService("p14-nom-d-resolve");
    const election = Object.values(state.provincialRuntime.elections).sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0]!;
    election.status = "filing_open";
    const partyId = labourPartyId(state);

    // Seed a co-partisan NPC filing that should be withdrawn after nomination.
    const coPartisan = Object.keys(state.politicians)
      .filter(
        (id) =>
          state.politicians[id]?.partyId === partyId &&
          id !== state.playerPoliticianId &&
          state.politicians[id]?.alive &&
          !state.politicians[id]?.retired,
      )
      .sort()[0]!;
    election.candidates[coPartisan] = {
      politicianId: coPartisan,
      partyId,
      filedDate: state.currentDate,
      incumbent: false,
      source: "npc",
      withdrawn: false,
    };

    ensureOfficeNominationContests(state, world, {
      officeKind: "gubernatorial",
      electionId: election.id,
      electionDate: election.date,
      provinceId: election.provinceId,
      partyIds: [partyId],
      maxCandidatesPerParty: 4,
      commandId: "test",
    });
    resolveOfficeNominationContests(state, world, rng, election.id, "gubernatorial", "test");
    const contest = officeNominationContestsForElection(state, election.id, "gubernatorial")[0]!;
    expect(contest.status).toBe("resolved");
    expect(contest.winnerId).toBeTruthy();
    const winner = contest.winnerId!;
    expect(election.candidates[winner]?.withdrawn).toBe(false);
    expect(election.candidates[winner]?.sourceContestId).toBe(contest.id);
    if (coPartisan !== winner) {
      expect(election.candidates[coPartisan]?.withdrawn).toBe(true);
    }
    const activeCoPartisans = Object.values(election.candidates).filter(
      (c) => c.partyId === partyId && !c.withdrawn,
    );
    expect(activeCoPartisans.length).toBe(1);
    expect(activeCoPartisans[0]!.politicianId).toBe(winner);
  });
});
