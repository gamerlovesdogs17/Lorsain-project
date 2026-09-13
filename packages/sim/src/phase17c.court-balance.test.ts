import { describe, expect, it } from "vitest";
import { chooseJudicialVote } from "./courts/decisions.js";
import { fileConstitutionalCase, recordJudicialDecision } from "./courts/procedure.js";
import { currentCourtJudgeIds } from "./courts/state.js";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import { createRngService } from "./rng.js";

function seedOperativeLaw(state: ReturnType<typeof jsonClone>, sponsorId: string): string {
  const lawId = "LAW_P17C_FIXTURE";
  state.legislatureRuntime.enactedLaws[lawId] = {
    id: lawId,
    billId: "BILL_P17C_FIXTURE",
    title: "Fixture Review Act",
    sponsorId,
    enactedDate: state.currentDate,
    operative: true,
    policyItems: [{ issueId: "civil_liberties", magnitude: 0.7, provisionId: "prov_fixture" }],
    amendmentIds: [],
    floorVoteId: null,
    repassageVoteId: null,
    presidentialDisposition: "signed",
    eventIds: [],
    invalidatedByDecisionId: null,
    metadata: {},
  };
  return lawId;
}

describe("Phase 17C — Court review strength", () => {
  it("weak challenge usually produces uphold votes", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17c-court-weak",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    const judges = currentCourtJudgeIds(world, state).filter((id) => id !== "NPC146");
    const petitioner =
      Object.values(state.politicians).find((p) => p.alive && !judges.includes(p.id))?.id ??
      "NPC146";
    const lawId = seedOperativeLaw(state, petitioner);
    const filed = fileConstitutionalCase(
      world,
      state,
      {
        actorId: petitioner,
        caseType: "LAW_REVIEW",
        challengedKind: "law",
        challengedId: lawId,
        respondentId: petitioner,
        constitutionalQuestion: "Whether a routine technical amendment exceeds legislative power",
        constitutionalRule: "legislative_competence",
        meritsLean: -0.55,
      },
      "CMD_WEAK",
    );
    expect("error" in filed).toBe(false);
    if ("error" in filed) return;
    const courtCase = state.constitutionalRuntime.courtCases[filed.caseId]!;
    const rng = createRngService("p17c-court-weak-votes");
    let invalidate = 0;
    for (const id of judges) {
      if (chooseJudicialVote(world, state, id, courtCase, rng) === "invalidate") invalidate += 1;
    }
    expect(invalidate).toBeLessThanOrEqual(2);
  });

  it("strong constitutional violation can invalidate", () => {
    const world = loadTerenaWorld();
    const sim = createSimulation({
      world,
      seed: "p17c-court-strong",
      playerPoliticianId: "NPC146",
    });
    const state = jsonClone(sim.getSnapshot());
    const judges = currentCourtJudgeIds(world, state).filter((id) => id !== "NPC146");
    const petitioner =
      Object.values(state.politicians).find((p) => p.alive && !judges.includes(p.id))?.id ??
      "NPC002";
    const lawId = seedOperativeLaw(state, petitioner);
    const filed = fileConstitutionalCase(
      world,
      state,
      {
        actorId: petitioner,
        caseType: "LAW_REVIEW",
        challengedKind: "law",
        challengedId: lawId,
        respondentId: petitioner,
        constitutionalQuestion:
          "Whether the contested statute plainly exceeds enumerated legislative power",
        constitutionalRule: "enumerated_powers",
        meritsLean: 0.82,
      },
      "CMD_STRONG",
    );
    expect("error" in filed).toBe(false);
    if ("error" in filed) return;
    const courtCase = state.constitutionalRuntime.courtCases[filed.caseId]!;
    const rng = createRngService("p17c-court-strong-votes");
    const votes: Record<string, "uphold" | "invalidate" | "nonparticipation"> = {};
    let invalidate = 0;
    for (const id of judges) {
      const choice = chooseJudicialVote(world, state, id, courtCase, rng);
      votes[id] = choice;
      if (choice === "invalidate") invalidate += 1;
    }
    expect(invalidate).toBeGreaterThanOrEqual(5);
    const decided = recordJudicialDecision(
      world,
      state,
      { caseId: filed.caseId, votes },
      "CMD_DECIDE",
      rng,
    );
    expect("error" in decided).toBe(false);
    expect(courtCase.disposition).toBe("INVALIDATE");
    const decision = Object.values(state.constitutionalRuntime.courtDecisions).find(
      (d) => d.caseId === filed.caseId,
    );
    expect(decision?.constitutionalRule).toBe("enumerated_powers");
  });
});
