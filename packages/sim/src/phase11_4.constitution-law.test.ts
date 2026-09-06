import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { migrateSaveV18ToV19, parseSaveFile } from "./save.js";
import { SAVE_SCHEMA_VERSION } from "./types.js";
import { legislativeHarnessWorld } from "./legislature/harness.js";
import {
  LEGISLATIVE_PROVISIONS,
  currentProvisionOption,
  foundingOptionId,
  isNoOpProvisionChoice,
  proposalOptionsFor,
} from "./legislature/provisions.js";
import { introduceBill } from "./legislature/procedure.js";
import {
  CONSTITUTION_CHANGE_SUBJECTS,
  constitutionAlternative,
  constitutionSubjectById,
  subjectsCoveringAllArticles,
} from "./provinces/constitutionChanges.js";
import {
  applyRatifiedAmendmentEffects,
  currentConstitutionalClauseText,
  proposeConstitutionalPackage,
  proposeConstitutionalTextAmendment,
} from "./provinces/constitutional.js";
import { diffConstitutionalText } from "./provinces/constitutionAlternatives.js";
import { partyAllowedUnderConstitution } from "./parties/state.js";
import { jsonClone } from "./hash.js";

describe("Phase 11.4 constitution correction model", () => {
  it("covers every Article with amendable subjects that change text and effects", () => {
    expect(subjectsCoveringAllArticles()).toBe(true);
    for (const subject of CONSTITUTION_CHANGE_SUBJECTS) {
      expect(subject.alternatives.length).toBeGreaterThan(1);
      const founding = subject.alternatives.find((alt) => alt.id === subject.foundingAlternativeId);
      expect(founding).toBeTruthy();
      for (const alt of subject.alternatives) {
        expect(alt.proposedClauseText.trim().length).toBeGreaterThan(20);
        expect(alt.mechanicalEffects.length).toBeGreaterThan(0);
        expect(Object.keys(alt.metricEffects).length).toBeGreaterThan(0);
        expect(alt.label).not.toMatch(/good|bad|better|worse|moderate|extreme/i);
      }
      const changeAlts = subject.alternatives.filter(
        (alt) => alt.id !== subject.foundingAlternativeId,
      );
      expect(changeAlts.length).toBeGreaterThan(0);
      for (const alt of changeAlts) {
        expect(alt.proposedClauseText).not.toBe(founding!.proposedClauseText);
      }
    }
  });

  it("rejects free-text amendments and accepts structured packages with redline preview", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "CONST-PKG" });
    const state = jsonClone(sim.getSnapshot());
    const rejected = proposeConstitutionalTextAmendment(
      world,
      state,
      "MP02",
      "ART_VII_S2_C1",
      "A long enough free-text rewrite that should no longer be accepted by the engine.",
      "reform_elections",
      null,
    );
    expect("error" in rejected).toBe(true);
    if ("error" in rejected) {
      expect(rejected.error.code).toBe("STRUCTURED_CONSTITUTIONAL_AMENDMENT_REQUIRED");
    }

    const subject = constitutionSubjectById("art7_party_system")!;
    const alt = constitutionAlternative("art7_party_system", "single_legal_party")!;
    const baseline =
      currentConstitutionalClauseText(world, state, subject.targetClauseId) ??
      subject.alternatives.find((row) => row.id === subject.foundingAlternativeId)!
        .proposedClauseText;
    const segments = diffConstitutionalText(baseline, alt.proposedClauseText);
    expect(segments.some((segment) => segment.kind === "add" || segment.kind === "del")).toBe(
      true,
    );

    const proposed = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: subject.id, alternativeId: alt.id }],
      "CMD_TEST",
    );
    expect("error" in proposed).toBe(true);
    if ("error" in proposed) {
      expect(proposed.error.code).toBe("DESIGNATED_PARTY_REQUIRED");
    }
    const designated =
      state.politicians.MP02?.partyId ?? Object.keys(state.partyStates)[0] ?? null;
    expect(designated).toBeTruthy();
    const proposedOk = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: subject.id, alternativeId: alt.id, designatedPartyId: designated }],
      "CMD_TEST",
    );
    expect("error" in proposedOk).toBe(false);
    if ("error" in proposedOk) throw new Error(proposedOk.error.message);
    expect(proposedOk.amendment.packageChanges?.length).toBe(1);
    expect(proposedOk.amendment.packageChanges?.[0]?.designatedPartyId).toBe(designated);
    expect(proposedOk.amendment.runtimeEffect).toBe("modeled_rule");
  });

  it("enacts one-party constitutional order and later restores multiparty politics", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "ONE-PARTY" });
    const state = jsonClone(sim.getSnapshot());
    const partySubject = constitutionSubjectById("art7_party_system")!;
    const oneParty = constitutionAlternative(partySubject.id, "single_legal_party");
    expect(oneParty?.orderPatch?.partySystem).toBe("single_legal_party");

    const designated = state.politicians.MP02?.partyId ?? Object.keys(state.partyStates)[0]!;
    const proposed = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [
        {
          subjectId: partySubject.id,
          alternativeId: "single_legal_party",
          designatedPartyId: designated,
        },
      ],
      "CMD1",
    );
    expect("error" in proposed).toBe(false);
    if ("error" in proposed) throw new Error(proposed.error.message);
    proposed.amendment.status = "ratified";
    proposed.amendment.enactedDate = state.currentDate;
    applyRatifiedAmendmentEffects(state, proposed.amendment);
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe("single_legal_party");
    const sole = state.provincialRuntime.constitutionalOrder.soleLegalPartyId;
    expect(sole).toBe(designated);
    const otherParty = Object.keys(state.partyStates).find((id) => id !== sole);
    expect(partyAllowedUnderConstitution(state, sole)).toBe(true);
    if (otherParty) expect(partyAllowedUnderConstitution(state, otherParty)).toBe(false);

    for (const amendment of Object.values(state.provincialRuntime.constitutionalAmendments)) {
      if (amendment.status === "proposed" || amendment.status === "ratifying") {
        amendment.status = "assembly_failed";
      }
    }
    const restoreId = partySubject.foundingAlternativeId;
    const restore2 = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: partySubject.id, alternativeId: restoreId }],
      "CMD3",
    );
    expect("error" in restore2).toBe(false);
    if ("error" in restore2) throw new Error(restore2.error.message);
    restore2.amendment.status = "ratified";
    restore2.amendment.enactedDate = state.currentDate;
    applyRatifiedAmendmentEffects(state, restore2.amendment);
    expect(state.provincialRuntime.constitutionalOrder.partySystem).toBe(
      "competitive_multiparty",
    );
  });

  it("uses amended clause text as the next redline baseline", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "BASELINE" });
    const state = jsonClone(sim.getSnapshot());
    const subject = CONSTITUTION_CHANGE_SUBJECTS.find((row) => row.articleId === "ARTICLE_III")!;
    const first = subject.alternatives.find((alt) => alt.id !== subject.foundingAlternativeId)!;
    const second = subject.alternatives.find(
      (alt) => alt.id !== subject.foundingAlternativeId && alt.id !== first.id,
    )!;
    const firstPkg = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: subject.id, alternativeId: first.id }],
      "C1",
    );
    expect("error" in firstPkg).toBe(false);
    if ("error" in firstPkg) throw new Error(firstPkg.error.message);
    firstPkg.amendment.status = "ratified";
    firstPkg.amendment.enactedDate = state.currentDate;
    applyRatifiedAmendmentEffects(state, firstPkg.amendment);
    expect(currentConstitutionalClauseText(world, state, subject.targetClauseId)).toBe(
      first.proposedClauseText,
    );
    for (const amendment of Object.values(state.provincialRuntime.constitutionalAmendments)) {
      if (amendment.status === "proposed" || amendment.status === "ratifying") {
        amendment.status = "assembly_failed";
      }
    }
    const secondPkg = proposeConstitutionalPackage(
      world,
      state,
      "MP02",
      [{ subjectId: subject.id, alternativeId: second.id }],
      "C2",
    );
    expect("error" in secondPkg).toBe(false);
    if ("error" in secondPkg) throw new Error(secondPkg.error.message);
    const change = secondPkg.amendment.packageChanges![0]!;
    expect(change.currentText).toBe(first.proposedClauseText);
    expect(change.proposedText).toBe(second.proposedClauseText);
  });

  it("migrates schema 18 saves to 19 with constitutionalOrder", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "MIG19" });
    const save = sim.serializeSave() as unknown as Record<string, unknown>;
    save.schemaVersion = 18;
    (save.simulation as Record<string, unknown>).schemaVersion = 18;
    delete (save.simulation as { provincialRuntime: Record<string, unknown> }).provincialRuntime
      .constitutionalOrder;
    const migrated = migrateSaveV18ToV19(save) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(19);
    const order = (
      (migrated.simulation as Record<string, unknown>).provincialRuntime as Record<string, unknown>
    ).constitutionalOrder as Record<string, unknown>;
    expect(order.partySystem).toBe("competitive_multiparty");
    expect(parseSaveFile(migrated, world.contentVersion).ok).toBe(true);
    expect(SAVE_SCHEMA_VERSION).toBe(19);
  });
});

describe("Phase 11.4 legislative policy-state model", () => {
  it("does not require current:true and excludes founding/no-op proposals", () => {
    expect(LEGISLATIVE_PROVISIONS.some((definition) => /current:\s*true/.test(JSON.stringify(definition)))).toBe(
      false,
    );
    for (const definition of LEGISLATIVE_PROVISIONS) {
      expect(definition.options.some((option) => option.founding)).toBe(true);
      expect(definition.options.every((option) => !/^Keep\b/i.test(option.label))).toBe(true);
      const proposals = proposalOptionsFor(definition.id);
      expect(proposals.every((option) => !option.founding)).toBe(true);
      expect(proposals.length).toBeGreaterThan(0);
    }
    const counts = LEGISLATIVE_PROVISIONS.map((definition) => proposalOptionsFor(definition.id).length);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(5);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("derives current law from state and rejects no-op bill provisions", () => {
    const world = legislativeHarnessWorld();
    const sim = createSimulation({ world, playerPoliticianId: "MP02", seed: "LAW-STATE" });
    const state = jsonClone(sim.getSnapshot());
    const definition =
      LEGISLATIVE_PROVISIONS.find((row) => row.issueId === "ISS_TAX") ??
      LEGISLATIVE_PROVISIONS.find((row) => world.issueDimensions[row.issueId])!;
    const founding = foundingOptionId(definition.id)!;
    expect(currentProvisionOption(state, definition.id)?.id).toBe(founding);
    expect(isNoOpProvisionChoice(state, definition.id, founding)).toBe(true);
    const proposal = proposalOptionsFor(definition.id)[0]!;
    const introduced = introduceBill(
      world,
      state,
      {
        sponsorId: "MP02",
        title: "Test Reform Act",
        summary: "Changes current law.",
        policyItems: [
          {
            issueId: definition.issueId,
            provisionId: definition.id,
            optionId: proposal.id,
            direction: proposal.direction,
            magnitude: proposal.magnitude,
            fiscalImpact: proposal.fiscalImpact,
          },
        ],
      },
      "CMD_LAW",
    );
    expect("error" in introduced).toBe(false);
  });
});
