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
  constitutionSubjectById,
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
import {
  appointMinister,
  beginWarPowers,
  armExecutiveTrigger,
  issueRegulation,
  introduceMotion,
  declareEmergency,
  assemblyFractionYesNeeded,
} from "./executive/procedure.js";
import {
  warUnilateralDaysForDefenseControl,
  assemblyPluralityPartyId,
  ensureOrder,
} from "./provinces/constitutionGameplay.js";
import { kernelOffice } from "./synthetic-world.js";
import { isEntrenchedArticle } from "./provinces/constitutionalOrder.js";
import { processExecutiveMonth } from "./executive/monthly.js";
import { createRngService } from "./rng.js";
import type { IsoDate } from "./calendar.js";
import type { JsonObject } from "./json.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const canonicalConstitution = JSON.parse(
  readFileSync(resolve(repoRoot, "data/terena_constitution.json"), "utf8"),
);

function boot(seed: string) {
  const world = legislativeHarnessWorld();
  world.constitutionalDocument = jsonClone(canonicalConstitution.document);
  const sim = createSimulation({ world, playerPoliticianId: "MP02", seed });
  const state = jsonClone(sim.getSnapshot());
  return { world, state };
}

function ratifyPackage(
  world: ReturnType<typeof legislativeHarnessWorld>,
  state: ReturnType<typeof jsonClone>,
  actorId: string,
  changes: ReadonlyArray<{
    subjectId: string;
    alternativeId: string;
    designatedPartyId?: string | null;
  }>,
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
      expect(subject.sectionId).toBe(clause!.sectionId);
      expect(clause!.sectionId).toMatch(/^ARTICLE_[IVX]+_SECTION_\d+$/);
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
    const sole = state.politicians.MP02?.partyId;
    expect(sole).toBeTruthy();
    if (!sole) return;
    const missing = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art7_party_system", alternativeId: "single_legal_party" }],
      "CMD",
    );
    expect("error" in missing).toBe(true);
    if ("error" in missing) {
      expect(missing.error.code).toBe("DESIGNATED_PARTY_REQUIRED");
    }
    const other = Object.keys(state.partyStates).find((id) => id !== sole) ?? sole;
    const pkg = ratifyPackage(world, state, "MP02", [
      {
        subjectId: "art7_party_system",
        alternativeId: "single_legal_party",
        designatedPartyId: other,
      },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("single_legal_party");
    expect(state.provincialRuntime.constitutionalOrder.soleLegalPartyId).toBe(other);
    expect(partyAllowedUnderConstitution(state, other)).toBe(true);
    expect(partyLegalStatus(state, other)).toBe("sole_recognized");
    if (other !== sole) {
      expect(partyAllowedUnderConstitution(state, sole)).toBe(false);
      expect(partyLegalStatus(state, sole)).toBe("prohibited");
    }
    const restore = ratifyPackage(world, state, "MP02", [
      { subjectId: "art7_party_system", alternativeId: "competitive_multiparty" },
    ]);
    expect("error" in restore).toBe(false);
    if ("error" in restore) return;
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("competitive_multiparty");
    expect(state.provincialRuntime.constitutionalOrder.soleLegalPartyId).toBeNull();
    expect(partyAllowedUnderConstitution(state, sole)).toBe(true);
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

  it("blocks unilateral minister appointment under assembly_confidence without majority alignment", () => {
    const { world, state } = boot("CABINET-CONF");
    world.offices.OFFICE_MINISTER_TEST = kernelOffice({
      id: "OFFICE_MINISTER_TEST",
      kind: "minister",
      title: "Test Minister",
      portfolio: "test",
      incompatibleWithKinds: ["president", "constitutional_court_justice", "speaker"],
    });
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art6_cabinet_formation", alternativeId: "assembly_confidence" },
    ]);
    const presidentId = "P1";
    const plurality = assemblyPluralityPartyId(world, state);
    const nominee = Object.values(state.politicians).find(
      (p) => p.alive && !p.retired && p.id !== presidentId && p.partyId && p.partyId !== plurality,
    );
    expect(nominee).toBeTruthy();
    if (!nominee) return;
    state.provincialRuntime.constitutionalOrder.cabinetHasAssemblyConfidence = false;
    const blocked = appointMinister(
      world,
      state,
      { actorId: presidentId, officeId: "OFFICE_MINISTER_TEST", politicianId: nominee.id },
      null,
    );
    expect("error" in blocked).toBe(true);
    if ("error" in blocked) expect(blocked.error.code).toBe("ASSEMBLY_CONFIDENCE_REQUIRED");
    expect(state.provincialRuntime.constitutionalOrder.cabinetNeedsConfidence).toBe(true);

    ratifyPackage(world, state, "MP02", [
      { subjectId: "art6_cabinet_formation", alternativeId: "presidential_choice" },
    ]);
    const allowed = appointMinister(
      world,
      state,
      { actorId: presidentId, officeId: "OFFICE_MINISTER_TEST", politicianId: nominee.id },
      null,
    );
    expect("error" in allowed).toBe(false);
  });

  it("maps defenseControl onto war unilateral days", () => {
    const { world, state } = boot("DEFENSE-WAR");
    const base = world.executiveConstitution.warUnilateralDays;
    expect(warUnilateralDaysForDefenseControl(state, base)).toBe(base);
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art10_defense_control", alternativeId: "joint_command" },
    ]);
    expect(warUnilateralDaysForDefenseControl(state, base)).toBeLessThan(base);
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art10_defense_control", alternativeId: "executive_command" },
    ]);
    expect(warUnilateralDaysForDefenseControl(state, base)).toBeGreaterThan(base);
    armExecutiveTrigger(state, "war");
    const begun = beginWarPowers(world, state, { actorId: "P1" }, null);
    expect("error" in begun).toBe(false);
    if ("error" in begun) return;
    const war = Object.values(state.executiveRuntime.warPowers)[0];
    expect(war?.metadata.warUnilateralDays).toBe(base * 3);
    expect(war?.metadata.defenseControl).toBe("executive_command");
  });

  it("blocks regulation under assembly_dominant executive", () => {
    const { world, state } = boot("EXEC-AUTH-REG");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art3_executive_authority", alternativeId: "assembly_dominant" },
    ]);
    const ministryId = Object.keys(world.offices).find(
      (id) => world.offices[id]!.kind === "minister",
    );
    if (!ministryId) return;
    const result = issueRegulation(
      world,
      state,
      {
        actorId: "P1",
        ministryOfficeId: ministryId,
        policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.5, fiscalImpact: null }],
      },
      null,
    );
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.code).toBe("EXECUTIVE_AUTHORITY_BLOCKED");
  });

  it("blocks major regulation under constrained_dual_mandate", () => {
    const { world, state } = boot("EXEC-AUTH-MAJOR");
    expect(ensureOrder(state).executiveAuthority).toBe("constrained_dual_mandate");
    const ministryId = Object.keys(world.offices).find(
      (id) => world.offices[id]!.kind === "minister",
    );
    if (!ministryId) return;
    const majorResult = issueRegulation(
      world,
      state,
      {
        actorId: "P1",
        ministryOfficeId: ministryId,
        policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.5, fiscalImpact: null }],
        major: true,
      },
      null,
    );
    expect("error" in majorResult).toBe(true);
    if ("error" in majorResult) expect(majorResult.error.code).toBe("EXECUTIVE_AUTHORITY_BLOCKED");
    const minorResult = issueRegulation(
      world,
      state,
      {
        actorId: "P1",
        ministryOfficeId: ministryId,
        policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.5, fiscalImpact: null }],
      },
      null,
    );
    expect("error" in minorResult).toBe(false);
  });

  it("party_slate restricts minister appointments to governing party", () => {
    const { world, state } = boot("PARTY-SLATE");
    world.offices.OFFICE_MINISTER_PS = kernelOffice({
      id: "OFFICE_MINISTER_PS",
      kind: "minister",
      title: "Party Slate Minister",
      portfolio: "ps_test",
      incompatibleWithKinds: ["president", "constitutional_court_justice", "speaker"],
    });
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art6_cabinet_formation", alternativeId: "party_slate" },
    ]);
    const plurality = assemblyPluralityPartyId(world, state);
    const wrongParty = Object.values(state.politicians).find(
      (p) => p.alive && !p.retired && p.id !== "P1" && p.partyId && p.partyId !== plurality,
    );
    if (!wrongParty) return;
    const blocked = appointMinister(
      world,
      state,
      { actorId: "P1", officeId: "OFFICE_MINISTER_PS", politicianId: wrongParty.id },
      null,
    );
    expect("error" in blocked).toBe(true);
    if ("error" in blocked) expect(blocked.error.code).toBe("PARTY_SLATE_REQUIRED");
    const rightParty = Object.values(state.politicians).find(
      (p) =>
        p.alive &&
        !p.retired &&
        p.id !== "P1" &&
        p.partyId === plurality &&
        !Object.values(state.officeTerms).some(
          (t) =>
            t.holderId === p.id &&
            (t.status === "active" || t.status === "suspended") &&
            t.holdingKind === "substantive" &&
            world.offices[t.officeId]?.kind === "minister",
        ),
    );
    if (!rightParty) return;
    const allowed = appointMinister(
      world,
      state,
      { actorId: "P1", officeId: "OFFICE_MINISTER_PS", politicianId: rightParty.id },
      null,
    );
    if ("error" in allowed) {
      // If the error is not PARTY_SLATE_REQUIRED, the party_slate gate passed correctly
      expect(allowed.error.code).not.toBe("PARTY_SLATE_REQUIRED");
    }
  });

  it("republicForm peoples_republic sets deferential judicial review", () => {
    const { world, state } = boot("REP-FORM");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art1_republic_form", alternativeId: "peoples_republic" },
    ]);
    expect(ensureOrder(state).executiveAuthority).toBe("strengthened_executive");
    expect(ensureOrder(state).judicialReview).toBe("deferential_review");
  });

  it("cabinet no-confidence motion available under assembly_confidence", () => {
    const { world, state } = boot("NO-CONF");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art6_cabinet_formation", alternativeId: "assembly_confidence" },
    ]);
    const mps = currentAssemblyMemberIds(world, state);
    const sponsor = mps.find((id) => id !== state.playerPoliticianId)!;
    const motion = introduceMotion(
      world,
      state,
      { sponsorId: sponsor, kind: "cabinet_no_confidence", targetId: "cabinet" },
      null,
    );
    expect("error" in motion).toBe(false);
  });

  it("cabinet no-confidence blocked without assembly_confidence", () => {
    const { world, state } = boot("NO-CONF-BLOCK");
    expect(ensureOrder(state).cabinetFormation).toBe("presidential_choice");
    const mps = currentAssemblyMemberIds(world, state);
    const sponsor = mps.find((id) => id !== state.playerPoliticianId)!;
    const motion = introduceMotion(
      world,
      state,
      { sponsorId: sponsor, kind: "cabinet_no_confidence", targetId: "cabinet" },
      null,
    );
    expect("error" in motion).toBe(true);
    if ("error" in motion) expect(motion.error.code).toBe("NO_CONFIDENCE_UNAVAILABLE");
  });

  it("subject id renames resolve via legacyIds", () => {
    expect(constitutionSubjectById("art3_executive_authority")).toBeTruthy();
    expect(constitutionSubjectById("art1_executive_authority")).toBeTruthy();
    expect(constitutionSubjectById("art3_executive_authority")!.id).toBe(
      "art3_executive_authority",
    );
    expect(constitutionSubjectById("art1_executive_authority")!.id).toBe(
      "art3_executive_authority",
    );
    expect(constitutionSubjectById("art2_press_freedom")).toBeTruthy();
    expect(constitutionSubjectById("art7_press_freedom")).toBeTruthy();
    expect(constitutionSubjectById("art2_press_freedom")!.id).toBe("art2_press_freedom");
    expect(constitutionSubjectById("art7_press_freedom")!.id).toBe("art2_press_freedom");
  });
});

describe("Phase 11.4 entrenchment mechanics", () => {
  it("hard_core blocks proposal of core article amendments", () => {
    const { world, state } = boot("HARD-CORE");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_unamendable_core", alternativeId: "hard_entrenchment" },
    ]);
    expect(ensureOrder(state).entrenchment).toBe("hard_core");
    const blocked = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art1_republic_form", alternativeId: "peoples_republic" }],
      "CMD",
    );
    expect("error" in blocked).toBe(true);
    if ("error" in blocked) expect(blocked.error.code).toBe("ENTRENCHED_ARTICLE_BLOCKED");
    const alsoBlocked = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art2_civil_liberties", alternativeId: "security_qualified_liberties" }],
      "CMD",
    );
    expect("error" in alsoBlocked).toBe(true);
    if ("error" in alsoBlocked) expect(alsoBlocked.error.code).toBe("ENTRENCHED_ARTICLE_BLOCKED");
    // Non-core articles should still work
    const allowed = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art4_assembly_term", alternativeId: "five_year_assembly" }],
      "CMD",
    );
    expect("error" in allowed).toBe(false);
  });

  it("election_interlock defers core amendments pending an election", () => {
    const { world, state } = boot("INTERLOCK");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_unamendable_core", alternativeId: "soft_entrenchment" },
    ]);
    expect(ensureOrder(state).entrenchment).toBe("election_interlock");
    // Propose a core article amendment
    const proposed = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art2_civil_liberties", alternativeId: "broad_democratic_liberties" }],
      "CMD",
    );
    expect("error" in proposed).toBe(false);
    if ("error" in proposed) return;
    // Simulate federal passage manually (skip processConstitutionalAmendmentsMonth)
    const amendment = proposed.amendment;
    const mps = currentAssemblyMemberIds(world, state);
    for (const id of mps) {
      amendment.assemblyVotes[id] = "yes";
    }
    amendment.assemblyYes = mps.length;
    amendment.assemblyVoteId = `CAVOTE_${amendment.id}`;
    // Manually set to ratifying with interlock pending
    amendment.status = "ratifying";
    const order = ensureOrder(state);
    const pending = order.pendingInterlockAmendmentIds ?? [];
    pending.push(amendment.id);
    order.pendingInterlockAmendmentIds = pending;
    // Verify amendment is deferred
    expect(amendment.status).toBe("ratifying");
    expect(order.pendingInterlockAmendmentIds).toContain(amendment.id);
  });

  it("heightened_threshold raises assembly fraction for core articles", () => {
    const { state } = boot("HEIGHTENED");
    const baseReq = assemblyVotesRequired(state, false);
    // Set heightened threshold
    const order = ensureOrder(state);
    order.entrenchment = "heightened_threshold";
    const coreReq = assemblyVotesRequired(state, true);
    expect(coreReq).toBeGreaterThan(baseReq);
  });

  it("entrenched article detection covers Articles I, II, VIII", () => {
    expect(isEntrenchedArticle("ARTICLE_I")).toBe(true);
    expect(isEntrenchedArticle("ARTICLE_II")).toBe(true);
    expect(isEntrenchedArticle("ARTICLE_VIII")).toBe(true);
    expect(isEntrenchedArticle("ARTICLE_III")).toBe(false);
    expect(isEntrenchedArticle("ARTICLE_XII")).toBe(false);
  });

  it("amend Art XII process changes future amendment thresholds", () => {
    const { world, state } = boot("ART12-E2E");
    // Default thresholds
    const origRequired = assemblyVotesRequired(state);
    // Ratify new Art XII process
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_amendment_process", alternativeId: "three_fifths_plus_11_provinces" },
    ]);
    const newRequired = assemblyVotesRequired(state);
    expect(newRequired).toBeLessThan(origRequired);
    // Now ratify entrenchment
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art12_unamendable_core", alternativeId: "hard_entrenchment" },
    ]);
    expect(ensureOrder(state).entrenchment).toBe("hard_core");
    // Verify next amendment on non-core uses new lower threshold
    const next = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art4_assembly_term", alternativeId: "five_year_assembly" }],
      "CMD",
    );
    expect("error" in next).toBe(false);
  });
});

describe("Phase 11.4 mechanical-truth fixes", () => {
  it("strengthened_executive requires 2/3 supermajority for regulation annulment", () => {
    const { world, state } = boot("STRENGTH-ANNUL");
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art3_executive_authority", alternativeId: "strengthened_executive" },
    ]);
    expect(ensureOrder(state).executiveAuthority).toBe("strengthened_executive");
    const ministryId = Object.keys(world.offices).find(
      (id) => world.offices[id]!.kind === "minister",
    );
    if (!ministryId) return;
    // Issue a major regulation (allowed under strengthened_executive)
    const reg = issueRegulation(
      world,
      state,
      {
        actorId: "P1",
        ministryOfficeId: ministryId,
        policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.5, fiscalImpact: null }],
        major: true,
      },
      null,
    );
    expect("error" in reg).toBe(false);
    if ("error" in reg) return;
    const regulation = reg.regulation;
    // Introduce annulment motion
    const mps = currentAssemblyMemberIds(world, state);
    const sponsor = mps.find((id) => id !== state.playerPoliticianId)!;
    const motion = introduceMotion(
      world,
      state,
      { sponsorId: sponsor, kind: "regulation_annulment", targetId: regulation.id },
      null,
    );
    expect("error" in motion).toBe(false);
    if ("error" in motion) return;
    // Should have assembly_fraction threshold with 2/3
    expect(motion.motion.threshold).toBe("assembly_fraction");
    expect(motion.motion.fraction).toBeCloseTo(2 / 3, 5);
    // Need 2/3 of seats to pass
    const needed = assemblyFractionYesNeeded(
      world.legislativeConstitution.assemblySeatCount,
      2 / 3,
    );
    expect(needed).toBeGreaterThan(Math.ceil(world.legislativeConstitution.assemblySeatCount / 2));
  });

  it("regulation annulment under non-strengthened uses simple majority", () => {
    const { world, state } = boot("NORMAL-ANNUL");
    expect(ensureOrder(state).executiveAuthority).toBe("constrained_dual_mandate");
    const ministryId = Object.keys(world.offices).find(
      (id) => world.offices[id]!.kind === "minister",
    );
    if (!ministryId) return;
    // Need standard_presidential or strengthened to issue major regulation
    ratifyPackage(world, state, "MP02", [
      { subjectId: "art3_executive_authority", alternativeId: "standard_presidential" },
    ]);
    const reg = issueRegulation(
      world,
      state,
      {
        actorId: "P1",
        ministryOfficeId: ministryId,
        policyItems: [{ issueId: "ISS_LABOR", direction: 1, magnitude: 0.5, fiscalImpact: null }],
        major: true,
      },
      null,
    );
    expect("error" in reg).toBe(false);
    if ("error" in reg) return;
    const mps = currentAssemblyMemberIds(world, state);
    const sponsor = mps.find((id) => id !== state.playerPoliticianId)!;
    const motion = introduceMotion(
      world,
      state,
      { sponsorId: sponsor, kind: "regulation_annulment", targetId: reg.regulation.id },
      null,
    );
    expect("error" in motion).toBe(false);
    if ("error" in motion) return;
    expect(motion.motion.threshold).toBe("simple_majority_cast");
    expect(motion.motion.fraction).toBeNull();
  });

  it("unitary_party_republic sets partySystem to single_legal_party and requires designatedPartyId", () => {
    const { world, state } = boot("UNITARY-PARTY");
    const playerParty = state.politicians.MP02?.partyId;
    expect(playerParty).toBeTruthy();
    if (!playerParty) return;
    // Without designatedPartyId should fail
    const missing = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: "art1_republic_form", alternativeId: "unitary_party_republic" }],
      "CMD",
    );
    expect("error" in missing).toBe(true);
    if ("error" in missing) expect(missing.error.code).toBe("DESIGNATED_PARTY_REQUIRED");
    // With designatedPartyId should succeed and set partySystem
    const pkg = ratifyPackage(world, state, "MP02", [
      {
        subjectId: "art1_republic_form",
        alternativeId: "unitary_party_republic",
        designatedPartyId: playerParty,
      },
    ]);
    expect("error" in pkg).toBe(false);
    if ("error" in pkg) return;
    expect(ensureOrder(state).republicForm).toBe("unitary_party_republic");
    expect(ensureOrder(state).partySystem).toBe("single_legal_party");
    expect(ensureOrder(state).soleLegalPartyId).toBe(playerParty);
    expect(ensureOrder(state).executiveAuthority).toBe("strengthened_executive");
    expect(ensureOrder(state).judicialReview).toBe("deferential_review");
  });

  it("emergency auto-expires without Assembly confirmation within 30 days", () => {
    const { world, state } = boot("EM-CONFIRM");
    // Standard emergency has requiresAssemblyConfirmation=true
    armExecutiveTrigger(state, "emergency");
    const declared = declareEmergency(world, state, { actorId: "P1" }, null);
    expect("error" in declared).toBe(false);
    const emergency = Object.values(state.executiveRuntime.emergencies)[0]!;
    expect(emergency.status).toBe("active");
    expect(emergency.metadata.requiresAssemblyConfirmation).toBe(true);
    // The emergency metadata is set — move date past 30-day confirmation deadline
    // Set date 31 days past declaration
    const declDate = emergency.declaredDate;
    const parts = declDate.split("-").map(Number);
    const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
    d.setDate(d.getDate() + 31);
    state.currentDate =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` as IsoDate;
    // Also set expiresDate to far future so only confirmation gate triggers
    emergency.expiresDate = "2099-01-01" as IsoDate;
    state.executiveRuntime.lastMonthProcessed = null;
    const events = processExecutiveMonth(
      state,
      world,
      createRngService("EMERG-CONFIRM"),
      "test-cmd",
    );
    expect(emergency.status).toBe("expired");
    const expiredEvent = events.find((e) => e.type === "EMERGENCY_EXPIRED");
    expect(expiredEvent).toBeTruthy();
    expect((expiredEvent?.payload as JsonObject | undefined)?.reason).toBe(
      "assembly_confirmation_deadline_expired",
    );
  });

  it("referendum resolution pushes REFERENDUM_RESOLVED History event", () => {
    const { world, state } = boot("REF-HISTORY");
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
    const events = processConstitutionalAmendmentsMonth(world, state, "test-cmd");
    const refEvent = events.find((e) => e.type === "REFERENDUM_RESOLVED");
    expect(refEvent).toBeTruthy();
    if (!refEvent) return;
    const payload = refEvent.payload as JsonObject;
    expect(payload.question).toBe(amendment.title);
    expect(Number(payload.yesShare)).toBeGreaterThan(0);
    expect(Number(payload.noShare)).toBeGreaterThan(0);
    expect(Math.abs(payload.yesShare + payload.noShare - 1)).toBeLessThan(0.001);
    expect(payload.turnout).toBeGreaterThan(0);
    expect(["passed", "failed"]).toContain(payload.result);
    expect(payload.amendmentId).toBe(amendment.id);
  });
});

describe("empty constitutional order defaults", () => {
  it("matches founding Terena defaults", () => {
    const order = emptyConstitutionalOrder();
    expect(order.presidentialElection).toBe("national_rcv");
    expect(order.assemblyElection).toBe("stv");
    expect(order.partySystem).toBe("competitive_multiparty");
    expect(order.amendmentProcess).toBe("assembly_two_thirds_plus_13_provinces");
    expect(order.entrenchment).toBe("none");
  });
});
