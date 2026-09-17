import { describe, expect, it } from "vitest";
import { chooseJudicialVote } from "./courts/decisions.js";
import { fileConstitutionalCase } from "./courts/procedure.js";
import {
  assertFormalJudicialNonpartisanship,
  benchPublicReputationBalance,
  publicJudicialReputation,
  publicReputationBucket,
  PUBLIC_JUDICIAL_REPUTATION_LABELS,
  TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION,
} from "./courts/publicReputation.js";
import { currentCourtJudgeIds } from "./courts/state.js";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { createRngService } from "./rng.js";

describe("Phase final — Court public reputation", () => {
  it("starting bench is formally nonpartisan and ~5 institutional / ~4 publicly leaning", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      playerPoliticianId: "NPC146",
      seed: "court-rep-1",
    });
    const snap = sim.getSnapshot();

    expect(assertFormalJudicialNonpartisanship(world, snap)).toEqual([]);
    expect(world.issueIds).toContain("ISS_COURTS");

    const balance = benchPublicReputationBalance(world, snap);
    expect(balance.judgeIds.length).toBe(9);
    expect(balance.institutionalOrUnclassified).toBeGreaterThanOrEqual(5);
    expect(balance.publiclyLeaning).toBeGreaterThanOrEqual(4);
    expect(balance.centreLeftLeaning).toBeGreaterThanOrEqual(2);
    expect(balance.conservativeLeaning).toBeGreaterThanOrEqual(2);

    for (const id of Object.keys(TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION)) {
      if (!balance.judgeIds.includes(id)) continue;
      expect(publicJudicialReputation(world, snap, id)).toBe(
        TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION[id],
      );
      const label =
        PUBLIC_JUDICIAL_REPUTATION_LABELS[TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION[id]!];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/-?\d+(\.\d+)?/);
    }

    const buckets = balance.judgeIds.map((id) =>
      publicReputationBucket(publicJudicialReputation(world, snap, id)),
    );
    expect(
      buckets.filter((b) => b === "institutionalist_or_unclear").length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("Court votes use merits/precedent/ideology mix, not Party line", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "court-vote-nonpartisan",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    const judges = currentCourtJudgeIds(world, state).filter((id) => id !== "NPC146");
    for (const id of judges) {
      expect(state.politicians[id]?.partyId ?? null).toBeNull();
    }
    const petitioner =
      Object.values(state.politicians).find(
        (p) => p.alive && p.partyId != null && !judges.includes(p.id),
      )?.id ?? "NPC002";
    // Even if we forcibly stamp a party on a justice, vote choice must ignore Party match.
    const stamped = judges[0]!;
    state.politicians[stamped]!.partyId = state.politicians[petitioner]!.partyId;

    const lawId = "LAW_COURT_NONPARTISAN";
    state.legislatureRuntime.enactedLaws[lawId] = {
      id: lawId,
      billId: "BILL_COURT_NONPARTISAN",
      title: "Nonpartisan Review Act",
      sponsorId: petitioner,
      enactedDate: state.currentDate,
      operative: true,
      policyItems: [{ issueId: "civil_liberties", magnitude: 0.7, provisionId: "prov_np" }],
      amendmentIds: [],
      floorVoteId: null,
      repassageVoteId: null,
      presidentialDisposition: "signed",
      eventIds: [],
      invalidatedByDecisionId: null,
      metadata: {},
    };
    const filed = fileConstitutionalCase(
      world,
      state,
      {
        actorId: petitioner,
        caseType: "LAW_REVIEW",
        challengedKind: "law",
        challengedId: lawId,
        respondentId: petitioner,
        constitutionalQuestion: "Whether routine technical amendment exceeds legislative power",
        constitutionalRule: "legislative_competence",
        meritsLean: -0.55,
      },
      "CMD_NP",
    );
    expect("error" in filed).toBe(false);
    if ("error" in filed) return;
    const courtCase = state.constitutionalRuntime.courtCases[filed.caseId]!;
    const rng = createRngService("court-vote-nonpartisan-votes");
    const withParty = chooseJudicialVote(world, state, stamped, courtCase, rng);
    state.politicians[stamped]!.partyId = null;
    const rng2 = createRngService("court-vote-nonpartisan-votes");
    const withoutParty = chooseJudicialVote(world, state, stamped, courtCase, rng2);
    expect(withParty).toBe(withoutParty);
    expect(["uphold", "invalidate"]).toContain(withParty);
  });
});
