/**
 * Constitutional order — live gameplay state derived from enacted amendments.
 * Separate from numeric RuntimeConstitutionalRule legacy fields; both are kept
 * in sync where they overlap (terms, veto, court tenure).
 */
import type { IsoDate } from "../calendar.js";

export const PARTY_SYSTEM_MODES = [
  "competitive_multiparty",
  "restricted_registration",
  "single_legal_party",
  "nonpartisan_candidates",
] as const;
export type PartySystemMode = (typeof PARTY_SYSTEM_MODES)[number];

export const PRESIDENTIAL_ELECTION_MODES = [
  "national_rcv",
  "plurality",
  "majority_runoff",
  "assembly_selection",
] as const;
export type PresidentialElectionMode = (typeof PRESIDENTIAL_ELECTION_MODES)[number];

export const ASSEMBLY_ELECTION_MODES = ["stv", "closed_list_pr", "mixed_member", "fptp"] as const;
export type AssemblyElectionMode = (typeof ASSEMBLY_ELECTION_MODES)[number];

export const JUDICIAL_REVIEW_MODES = [
  "strong_review",
  "standard_review",
  "deferential_review",
  "legislative_finality",
] as const;
export type JudicialReviewMode = (typeof JUDICIAL_REVIEW_MODES)[number];

export const PROVINCIAL_COMPETENCE_MODES = [
  "enumerated_provincial",
  "concurrent_powers",
  "national_supremacy",
  "strong_devolution",
] as const;
export type ProvincialCompetenceMode = (typeof PROVINCIAL_COMPETENCE_MODES)[number];

export const EMERGENCY_POWER_MODES = [
  "narrow_assembly_supervised",
  "standard_emergency",
  "broad_executive_emergency",
  "assembly_declared_only",
] as const;
export type EmergencyPowerMode = (typeof EMERGENCY_POWER_MODES)[number];

export const TREATY_APPROVAL_MODES = [
  "assembly_ratification",
  "assembly_and_provinces",
  "executive_alone",
  "supermajority_assembly",
] as const;
export type TreatyApprovalMode = (typeof TREATY_APPROVAL_MODES)[number];

export const AMENDMENT_PROCESS_MODES = [
  "assembly_two_thirds_plus_13_provinces",
  "assembly_three_fifths_plus_11_provinces",
  "assembly_simple_plus_referendum",
  "assembly_three_quarters_only",
] as const;
export type AmendmentProcessMode = (typeof AMENDMENT_PROCESS_MODES)[number];

export const CIVIL_LIBERTY_MODES = [
  "broad_democratic_liberties",
  "standard_charter",
  "security_qualified_liberties",
  "restricted_political_expression",
] as const;
export type CivilLibertyMode = (typeof CIVIL_LIBERTY_MODES)[number];

export const EXECUTIVE_AUTHORITY_MODES = [
  "constrained_dual_mandate",
  "standard_presidential",
  "strengthened_executive",
  "assembly_dominant",
] as const;
export type ExecutiveAuthorityMode = (typeof EXECUTIVE_AUTHORITY_MODES)[number];

export type ConstitutionalOrderState = {
  partySystem: PartySystemMode;
  /** When partySystem is single_legal_party, the sole legal party id (or null until designated). */
  soleLegalPartyId: string | null;
  presidentialElection: PresidentialElectionMode;
  assemblyElection: AssemblyElectionMode;
  judicialReview: JudicialReviewMode;
  provincialCompetence: ProvincialCompetenceMode;
  emergencyPowers: EmergencyPowerMode;
  treatyApproval: TreatyApprovalMode;
  amendmentProcess: AmendmentProcessMode;
  civilLiberties: CivilLibertyMode;
  executiveAuthority: ExecutiveAuthorityMode;
  republicForm: "democratic_republic" | "peoples_republic" | "unitary_party_republic";
  citizenshipGuard: "equal_citizenship" | "duty_conditioned_citizenship";
  cabinetFormation: "presidential_choice" | "assembly_confidence" | "party_slate";
  pressFreedom: "free_press" | "licensed_press" | "state_media_priority";
  localGovernment: "provincial_primary" | "shared" | "nationally_directed";
  defenseControl: "civil_supremacy" | "joint_command" | "executive_command";
  /** Enacted clause text overrides keyed by clause id. */
  clauseTexts: Record<string, string>;
  lastAmendedDate: IsoDate | null;
};

export function emptyConstitutionalOrder(): ConstitutionalOrderState {
  return {
    partySystem: "competitive_multiparty",
    soleLegalPartyId: null,
    presidentialElection: "national_rcv",
    assemblyElection: "stv",
    judicialReview: "standard_review",
    provincialCompetence: "concurrent_powers",
    emergencyPowers: "standard_emergency",
    treatyApproval: "assembly_ratification",
    amendmentProcess: "assembly_two_thirds_plus_13_provinces",
    civilLiberties: "standard_charter",
    executiveAuthority: "constrained_dual_mandate",
    republicForm: "democratic_republic",
    citizenshipGuard: "equal_citizenship",
    cabinetFormation: "presidential_choice",
    pressFreedom: "free_press",
    localGovernment: "provincial_primary",
    defenseControl: "civil_supremacy",
    clauseTexts: {},
    lastAmendedDate: null,
  };
}

export type ConstitutionalMetricEffects = {
  institutionalStability?: number;
  politicalCompetition?: number;
  civilLiberty?: number;
  executiveCapacity?: number;
  provincialAutonomy?: number;
  judicialIndependence?: number;
  governmentLegitimacy?: number;
};

export function amendmentThresholds(order: ConstitutionalOrderState): {
  assemblyFraction: number;
  provincesRequired: number;
  referendumRequired: boolean;
} {
  switch (order.amendmentProcess) {
    case "assembly_three_fifths_plus_11_provinces":
      return { assemblyFraction: 0.6, provincesRequired: 11, referendumRequired: false };
    case "assembly_simple_plus_referendum":
      return { assemblyFraction: 0.5, provincesRequired: 0, referendumRequired: true };
    case "assembly_three_quarters_only":
      return { assemblyFraction: 0.75, provincesRequired: 0, referendumRequired: false };
    case "assembly_two_thirds_plus_13_provinces":
    default:
      return { assemblyFraction: 2 / 3, provincesRequired: 13, referendumRequired: false };
  }
}
