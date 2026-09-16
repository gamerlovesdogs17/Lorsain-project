import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_ELECTION_OPTIONS,
  AMENDMENT_PROCESS_OPTIONS,
  CABINET_FORMATION_OPTIONS,
  CIVIL_LIBERTY_OPTIONS,
  EMERGENCY_POWER_OPTIONS,
  ENTRENCHMENT_OPTIONS,
  EXECUTIVE_AUTHORITY_OPTIONS,
  JUDICIAL_REVIEW_OPTIONS,
  PARTY_IDEOLOGY_FAMILIES,
  PARTY_SYSTEM_OPTIONS,
  PRESIDENTIAL_ELECTION_OPTIONS,
  PROVINCIAL_COMPETENCE_OPTIONS,
  TREATY_APPROVAL_OPTIONS,
  exportScenarioJson,
  generateQuickBuildDocument,
  importScenarioJson,
  optionIds,
} from "@lorsain/scenario";
import {
  ASSEMBLY_ELECTION_MODES,
  AMENDMENT_PROCESS_MODES,
  CIVIL_LIBERTY_MODES,
  EMERGENCY_POWER_MODES,
  ENTRENCHMENT_MODES,
  EXECUTIVE_AUTHORITY_MODES,
  JUDICIAL_REVIEW_MODES,
  PARTY_SYSTEM_MODES,
  PRESIDENTIAL_ELECTION_MODES,
  PROVINCIAL_COMPETENCE_MODES,
  TREATY_APPROVAL_MODES,
} from "./provinces/constitutionalOrder.js";
import { buildKernelWorldFromScenarioDocument } from "./scenario/kernelBridge.js";
import { createSimulation } from "./engine.js";

function sorted(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

describe("Phase 19 Studio catalogs vs engine modes", () => {
  it("Studio option IDs match engine constitutionalOrder modes 1:1", () => {
    expect(sorted(optionIds(PARTY_SYSTEM_OPTIONS))).toEqual(sorted(PARTY_SYSTEM_MODES));
    expect(sorted(optionIds(PRESIDENTIAL_ELECTION_OPTIONS))).toEqual(
      sorted(PRESIDENTIAL_ELECTION_MODES),
    );
    expect(sorted(optionIds(ASSEMBLY_ELECTION_OPTIONS))).toEqual(sorted(ASSEMBLY_ELECTION_MODES));
    expect(sorted(optionIds(JUDICIAL_REVIEW_OPTIONS))).toEqual(sorted(JUDICIAL_REVIEW_MODES));
    expect(sorted(optionIds(PROVINCIAL_COMPETENCE_OPTIONS))).toEqual(
      sorted(PROVINCIAL_COMPETENCE_MODES),
    );
    expect(sorted(optionIds(EMERGENCY_POWER_OPTIONS))).toEqual(sorted(EMERGENCY_POWER_MODES));
    expect(sorted(optionIds(TREATY_APPROVAL_OPTIONS))).toEqual(sorted(TREATY_APPROVAL_MODES));
    expect(sorted(optionIds(AMENDMENT_PROCESS_OPTIONS))).toEqual(sorted(AMENDMENT_PROCESS_MODES));
    expect(sorted(optionIds(ENTRENCHMENT_OPTIONS))).toEqual(sorted(ENTRENCHMENT_MODES));
    expect(sorted(optionIds(CIVIL_LIBERTY_OPTIONS))).toEqual(sorted(CIVIL_LIBERTY_MODES));
    expect(sorted(optionIds(EXECUTIVE_AUTHORITY_OPTIONS))).toEqual(
      sorted(EXECUTIVE_AUTHORITY_MODES),
    );
    expect(sorted(optionIds(CABINET_FORMATION_OPTIONS))).toEqual(
      sorted(["presidential_choice", "assembly_confidence", "party_slate"]),
    );
    expect(PARTY_IDEOLOGY_FAMILIES.every((f) => f.label.trim().length > 0)).toBe(true);
  });
});

describe("Phase 19 option world initialization", () => {
  it("selected constitutional/electoral options reach KernelWorld + runtime", () => {
    const doc = generateQuickBuildDocument({
      countryName: "Initland",
      startDate: "2032-03-01",
      govForm: "semi_presidential",
      assemblySeats: 60,
      provinceCount: 3,
      partyCount: 3,
      electoralPresetId: "fptp",
      generationSeed: "p19-option-init",
    });
    doc.contentSections.constitution = {
      ...doc.contentSections.constitution,
      partySystem: "restricted_registration",
      presidentialElection: "plurality",
      assemblyElection: "closed_list_pr",
      judicialReview: "legislative_finality",
      provincialCompetence: "enumerated_provincial",
      emergencyPowers: "assembly_declared_only",
      treatyApproval: "assembly_and_provinces",
      amendmentProcess: "assembly_three_quarters_only",
      entrenchment: "hard_core",
      civilLiberties: "security_qualified_liberties",
      executiveAuthority: "strengthened_executive",
      cabinetFormation: "party_slate",
    };
    doc.contentSections.elections = {
      ...doc.contentSections.elections,
      presidentialElection: "plurality",
      assemblySystem: "closed_list_pr",
    };
    if (doc.contentSections.parties?.[0]) {
      doc.contentSections.parties[0] = {
        ...doc.contentSections.parties[0],
        ideologyFamily: "labour",
        ideology: "labour",
        ideologyLabel: "Workers League",
      };
    }

    const exported = exportScenarioJson(doc);
    const imported = importScenarioJson(exported);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const world = buildKernelWorldFromScenarioDocument(imported.document);
    expect(world.initialConstitutionalOrder?.presidentialElection).toBe("plurality");
    expect(world.initialConstitutionalOrder?.assemblyElection).toBe("closed_list_pr");
    expect(world.initialConstitutionalOrder?.partySystem).toBe("restricted_registration");
    expect(world.initialConstitutionalOrder?.cabinetFormation).toBe("party_slate");
    expect(world.initialConstitutionalOrder?.judicialReview).toBe("legislative_finality");
    expect(world.partyPublicIdeology[doc.contentSections.parties![0]!.id]?.economic).toBeTypeOf(
      "number",
    );

    const people = imported.document.contentSections.people?.politicians ?? [];
    const playerId =
      people.find((p) => p.playable)?.id ?? people[0]?.id ?? Object.keys(world.politicians)[0];
    expect(playerId).toBeTruthy();
    const sim = createSimulation({
      world,
      playerPoliticianId: playerId!,
      seed: "p19-option-init",
    });
    const order = sim.getSnapshot().provincialRuntime.constitutionalOrder;
    expect(order.presidentialElection).toBe("plurality");
    expect(order.assemblyElection).toBe("closed_list_pr");
    expect(order.partySystem).toBe("restricted_registration");
    expect(order.judicialReview).toBe("legislative_finality");
    expect(order.provincialCompetence).toBe("enumerated_provincial");
    expect(order.emergencyPowers).toBe("assembly_declared_only");
    expect(order.treatyApproval).toBe("assembly_and_provinces");
    expect(order.amendmentProcess).toBe("assembly_three_quarters_only");
    expect(order.entrenchment).toBe("hard_core");
    expect(order.civilLiberties).toBe("security_qualified_liberties");
    expect(order.executiveAuthority).toBe("strengthened_executive");
    expect(order.cabinetFormation).toBe("party_slate");
  });
});
