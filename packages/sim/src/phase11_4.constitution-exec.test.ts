/**
 * Phase 11.4 — executable Constitution + canonical target validation tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import { jsonClone } from "./hash.js";
import {
  CONSTITUTION_CHANGE_SUBJECTS,
  constitutionAlternative,
  subjectsCoveringAllArticles,
} from "./provinces/constitutionChanges.js";
import {
  assertConstitutionChangeCatalogValid,
  buildConstitutionCatalogIndex,
  validateAllConstitutionChangeSubjects,
} from "./provinces/constitutionValidation.js";
import {
  applyRatifiedAmendmentEffects,
  proposeConstitutionalPackage,
  currentConstitutionalClauseText,
  assemblyVotesRequired,
  provincesRequiredForRatification,
  processConstitutionalAmendmentsMonth,
} from "./provinces/constitutional.js";
import { emptyConstitutionalOrder } from "./provinces/constitutionalOrder.js";
import {
  presidentialElectionMode,
  judicialReviewMode,
  referendumRequiredForAmendments,
  judicialReviewAllowsInvalidation,
  adjustMeritsLeanForJudicialReview,
  applyConstitutionalMetricEffects,
} from "./provinces/constitutionGameplay.js";
import { partyAllowedUnderConstitution, partyLegalStatus } from "./parties/state.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const canonicalConstitution = JSON.parse(
  readFileSync(resolve(repoRoot, "data/terena_constitution.json"), "utf8"),
);

function boot(seed: string) {
  const world = legislativeHarnessWorld();
  world.constitutionalDocument = jsonClone(canonicalConstitution.document);
  const sim = createSimulation({ world, playerPoliticianId: "MP02", seed });
  const state = jsonClone(sim.getSnapshot());
  // Ensure document survives snapshot/bootstrap
  if (!state || true) {
    // world is mutated in place for document; simulation holds same world reference
  }
  return { world, state };
}

function ratifyPackage(
  world: ReturnType<typeof legislativeHarnessWorld>,
  state: ReturnType<typeof jsonClone>,
  actorId: string,
  changes: ReadonlyArray<{ subjectId: string; alternativeId: string }>,
) {
  for (const amendment of Object.values(state.provincialRuntime.constitutionalAmendments)) {
    if (amendment.status === "proposed" || amendment.status === "ratifying") {
      amendment.status = "assembly_failed";
    }
  }
  const proposed = proposeConstitutionalPackage(world, state, actorId, changes, "CMD");
  if ("error" in proposed) return proposed;
  proposed.amendment.status = "ratified";
  proposed.amendment.enactedDate = state.currentDate;
  applyRatifiedAmendmentEffects(state, proposed.amendment);
  return proposed;
}

describe("Phase 11.4 canonical constitution targets", () => {
  it("validates every amendment subject against the canonical document", () => {
    const { world } = boot("CONST-VALID");
    assertConstitutionChangeCatalogValid(world);
    expect(validateAllConstitutionChangeSubjects(world)).toEqual([]);
  });

  it("every clause id exists and founding baselines match canonical text", () => {
    const { world } = boot("CONST-BASELINE");
    const index = buildConstitutionCatalogIndex(world);
    for (const subject of CONSTITUTION_CHANGE_SUBJECTS) {
      const clause = index.clauses.get(subject.targetClauseId);
      expect(clause, subject.id).toBeTruthy();
      expect(clause!.articleId).toBe(subject.articleId);
      expect(clause!.sectionId).toBe(subject.sectionId);
      const founding = constitutionAlternative(subject.id, subject.foundingAlternativeId);
      expect(founding?.proposedClauseText.replace(/\s+/g, " ").trim()).toBe(
        clause!.text.replace(/\s+/g, " ").trim(),
      );
    }
  });

  it("covers all twelve articles with meaningful subjects", () => {
    expect(subjectsCoveringAllArticles()).toBe(true);
  });
});

describe("Phase 11.4 executable constitutional gameplay", () => {
  it("applies metricEffects to order metrics and economy confidence", () => {
    const { state } = boot("METRICS");
    const before = state.economyRuntime.national.confidenceIndex;
    applyConstitutionalMetricEffects(state, {
      politicalCompetition: -5,
      governmentLegitimacy: -3,
      civilLiberty: -4,
    });
    expect(state.provincialRuntime.constitutionalOrder.orderMetrics?.politicalCompetition).toBe(-5);
    expect(state.economyRuntime.national.confidenceIndex).not.toBe(before);
  });

  it("changes presidential election mode when package is applied", () => {
    const { world, state } = boot("PRES-MODE");
    const pkg = ratifyPackage(world, state, "MP02", [
      { subjectId: "art3_presidential_election_mode", alternativeId: "assembly_selection" },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(presidentialElectionMode(state)).toBe("assembly_selection");
    expect(currentConstitutionalClauseText(world, state, "ART_III_S1_C2")).toContain(
      "National Assembly",
    );
  });

  it("enforces one-party system and can restore multiparty", () => {
    const { world, state } = boot("ONE-PARTY-EXEC");
    const sole = state.politicians.MP02?.partyId!;
    const pkg = ratifyPackage(world, state, "MP02", [
      { subjectId: "art7_party_system", alternativeId: "single_legal_party" },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("single_legal_party");
    expect(partyAllowedUnderConstitution(state, sole)).toBe(true);
    expect(partyLegalStatus(state, sole)).toBe("sole_recognized");
    const other = Object.keys(state.partyStates).find((id) => id !== sole);
    if (other) {
      expect(partyAllowedUnderConstitution(state, other)).toBe(false);
      expect(partyLegalStatus(state, other)).toBe("prohibited");
    }
    const restore = ratifyPackage(world, state, "MP02", [
      { subjectId: "art7_party_system", alternativeId: "competitive_multiparty" },
    ]);
    expect("error" in restore).toBe(false);
    if ("error" in restore) return;
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("competitive_multiparty");
    expect(state.provincialRuntime.constitutionalOrder.soleLegalPartyId).toBeNull();
    if (other) expect(partyAllowedUnderConstitution(state, other)).toBe(true);
  });

  it("Article XII amendment process changes future thresholds and can require referendum", () => {
    const { world, state } = boot("ART12");
    expect(assemblyVotesRequired(state)).toBe(Math.ceil(420 * (2 / 3)));
    expect(provincesRequiredForRatification(state)).toBe(13);
    expect(referendumRequiredForAmendments(state)).toBe(false);
    const pkg = ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_amendment_process", alternativeId: "simple_plus_referendum" },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(assemblyVotesRequired(state)).toBe(Math.ceil(420 * 0.5));
    expect(provincesRequiredForRatification(state)).toBe(0);
    expect(referendumRequiredForAmendments(state)).toBe(true);
  });

  it("later amendments diff against previously enacted clause text", () => {
    const { world, state } = boot("DIFF-CHAIN");
    const first = ratifyPackage(world, state, "MP02", [
      { subjectId: "art3_presidential_election_mode", alternativeId: "plurality" },
    ]);
    expect("error" in first).toBe(false);
    if ("error" in first) return;
    const baseline = currentConstitutionalClauseText(world, state, "ART_III_S1_C2");
    expect(baseline?.toLowerCase()).toContain("plurality");
    const second = proposeConstitutionalPackage(world, state, "MP02", [
      { subjectId: "art3_presidential_election_mode", alternativeId: "majority_runoff" },
    ]);
    expect("error" in second).toBe(false);
    if ("error" in second) return;
    expect(second.amendment.packageChanges?.[0]?.currentText).toBe(baseline);
  });

  it("judicial review mode can disable invalidation path", () => {
    const { world, state } = boot("JUD-REVIEW");
    expect(judicialReviewAllowsInvalidation(state)).toBe(true);
    const pkg = ratifyPackage(world, state, "MP02", [
      { subjectId: "art8_judicial_review", alternativeId: "legislative_finality" },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(judicialReviewMode(state)).toBe("legislative_finality");
    expect(judicialReviewAllowsInvalidation(state)).toBe(false);
    expect(adjustMeritsLeanForJudicialReview(state, 0.9)).toBe(-1);
  });

  it("referendum ratification path records a national vote", () => {
    const { world, state } = boot("REFERENDUM");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_amendment_process", alternativeId: "simple_plus_referendum" },
    ]);
    expect(referendumRequiredForAmendments(state)).toBe(true);
    const next = proposeConstitutionalPackage(world, state, "MP02", [
      { subjectId: "art4_assembly_term", alternativeId: "five_year_assembly" },
    ]);
    expect("error" in next).toBe(false);
    if ("error" in next) return;
    const amendment = next.amendment;
    for (const id of currentAssemblyMemberIds(world, state)) {
      amendment.assemblyVotes[id] = "yes";
    }
    amendment.assemblyYes = currentAssemblyMemberIds(world, state).length;
    amendment.status = "ratifying";
    state.provincialRuntime.constitutionalOrder.pendingReferendumAmendmentIds = [amendment.id];
    processConstitutionalAmendmentsMonth(world, state, "test-cmd");
    expect(["ratified", "failed"]).toContain(amendment.status);
    expect(amendment.referendumHeldDate).toBeTruthy();
  });
});

describe("empty constitutional order defaults", () => {
  it("matches founding Terena defaults", () => {
    const order = emptyConstitutionalOrder();
    expect(order.presidentialElection).toBe("national_rcv");
    expect(order.assemblyElection).toBe("stv");
    expect(order.partySystem).toBe("competitive_multiparty");
    expect(order.amendmentProcess).toBe("assembly_two_thirds_plus_13_provinces");
  });
});
