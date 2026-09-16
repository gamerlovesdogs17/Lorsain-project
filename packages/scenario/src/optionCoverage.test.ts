import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_ELECTION_OPTIONS,
  PRESIDENTIAL_ELECTION_OPTIONS,
  PARTY_SYSTEM_OPTIONS,
  JUDICIAL_REVIEW_OPTIONS,
  PROVINCIAL_COMPETENCE_OPTIONS,
  EMERGENCY_POWER_OPTIONS,
  TREATY_APPROVAL_OPTIONS,
  AMENDMENT_PROCESS_OPTIONS,
  ENTRENCHMENT_OPTIONS,
  CIVIL_LIBERTY_OPTIONS,
  EXECUTIVE_AUTHORITY_OPTIONS,
  CABINET_FORMATION_OPTIONS,
  PARTY_IDEOLOGY_FAMILIES,
  isOptionId,
  optionIds,
  generateQuickBuildDocument,
  exportScenarioJson,
  importScenarioJson,
} from "./index.js";

describe("Phase 19 option catalog coverage", () => {
  it("every catalog entry has a human label and stable id", () => {
    for (const list of [
      PARTY_SYSTEM_OPTIONS,
      PRESIDENTIAL_ELECTION_OPTIONS,
      ASSEMBLY_ELECTION_OPTIONS,
      JUDICIAL_REVIEW_OPTIONS,
      PROVINCIAL_COMPETENCE_OPTIONS,
      EMERGENCY_POWER_OPTIONS,
      TREATY_APPROVAL_OPTIONS,
      AMENDMENT_PROCESS_OPTIONS,
      ENTRENCHMENT_OPTIONS,
      CIVIL_LIBERTY_OPTIONS,
      EXECUTIVE_AUTHORITY_OPTIONS,
      CABINET_FORMATION_OPTIONS,
      PARTY_IDEOLOGY_FAMILIES,
    ]) {
      expect(list.length).toBeGreaterThan(0);
      for (const o of list) {
        expect(o.label.trim().length).toBeGreaterThan(0);
        expect(o.id.includes(" ")).toBe(false);
      }
    }
  });

  it("rejects arbitrary mechanical ideology strings", () => {
    expect(isOptionId(PARTY_IDEOLOGY_FAMILIES, "social-democratic")).toBe(true);
    expect(isOptionId(PARTY_IDEOLOGY_FAMILIES, "Democratic Labour")).toBe(false);
    expect(isOptionId(PARTY_IDEOLOGY_FAMILIES, "totally-made-up")).toBe(false);
  });

  it("exposes full presidential and assembly election sets", () => {
    expect(optionIds(PRESIDENTIAL_ELECTION_OPTIONS).sort()).toEqual(
      ["assembly_selection", "majority_runoff", "national_rcv", "plurality"].sort(),
    );
    expect(optionIds(ASSEMBLY_ELECTION_OPTIONS).sort()).toEqual(
      ["closed_list_pr", "fptp", "mixed_member", "stv"].sort(),
    );
    expect(optionIds(PARTY_SYSTEM_OPTIONS).sort()).toEqual(
      [
        "competitive_multiparty",
        "nonpartisan_candidates",
        "restricted_registration",
        "single_legal_party",
      ].sort(),
    );
  });

  it("roundtrips constitutional election options through JSON", () => {
    const doc = generateQuickBuildDocument({
      countryName: "Optionland",
      startDate: "2031-01-01",
      govForm: "parliamentary",
      assemblySeats: 48,
      provinceCount: 3,
      partyCount: 3,
      electoralPresetId: "closed_list_pr",
      generationSeed: "p19-option-roundtrip",
    });
    doc.contentSections.constitution = {
      ...doc.contentSections.constitution,
      partySystem: "restricted_registration",
      presidentialElection: "majority_runoff",
      assemblyElection: "mixed_member",
      judicialReview: "strong_review",
      provincialCompetence: "strong_devolution",
      emergencyPowers: "narrow_assembly_supervised",
      treatyApproval: "supermajority_assembly",
      amendmentProcess: "assembly_simple_plus_referendum",
      entrenchment: "referendum_core",
      civilLiberties: "broad_democratic_liberties",
      executiveAuthority: "assembly_dominant",
      cabinetFormation: "assembly_confidence",
    };
    doc.contentSections.elections = {
      ...doc.contentSections.elections,
      presidentialElection: "majority_runoff",
      assemblySystem: "mixed_member",
    };
    if (doc.contentSections.parties?.[0]) {
      doc.contentSections.parties[0] = {
        ...doc.contentSections.parties[0],
        ideologyFamily: "green",
        ideology: "green",
        ideologyLabel: "Green Alliance",
      };
    }

    const exported = exportScenarioJson(doc);
    const imported = importScenarioJson(exported);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const c = imported.document.contentSections.constitution!;
    expect(c.partySystem).toBe("restricted_registration");
    expect(c.presidentialElection).toBe("majority_runoff");
    expect(c.assemblyElection).toBe("mixed_member");
    expect(c.judicialReview).toBe("strong_review");
    expect(c.cabinetFormation).toBe("assembly_confidence");
    expect(imported.document.contentSections.parties?.[0]?.ideologyFamily).toBe("green");
    expect(imported.document.contentSections.parties?.[0]?.ideologyLabel).toBe("Green Alliance");
  });
});
