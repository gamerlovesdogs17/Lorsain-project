import type { KernelWorld, SimState } from "../types.js";
import type { PolicyItem } from "./types.js";
import type { ConstitutionalOrderState } from "../provinces/constitutionalOrder.js";
import { optionForPolicyItem } from "./provisions.js";

export type BillConstitutionalityStatus =
  | "no_obvious_conflict"
  | "potential_rights_issue"
  | "potential_competence_issue"
  | "constitutionally_unavailable";

export type BillConstitutionalityAssessment = {
  status: BillConstitutionalityStatus;
  /** Short machine code for rejection paths. */
  code?: string;
  message?: string;
  /** Per-item soft warnings keyed by provisionId or issueId. */
  itemWarnings: Record<string, string>;
};

type OptionRule = {
  provisionId: string;
  optionId: string;
  status: BillConstitutionalityStatus;
  code?: string;
  when: (order: ConstitutionalOrderState) => boolean;
  message: string;
};

const OPTION_RULES: readonly OptionRule[] = [
  {
    provisionId: "PROV_ELECTION_ADMIN",
    optionId: "sole_party_registration",
    status: "constitutionally_unavailable",
    code: "CONSTITUTIONALLY_UNAVAILABLE",
    when: (order) => order.partySystem === "competitive_multiparty",
    message:
      "Ordinary law cannot establish a single-party registration regime while the constitution requires competitive multiparty politics.",
  },
  {
    provisionId: "PROV_ELECTORAL_FORMULA",
    optionId: "open_multiparty_stv",
    status: "constitutionally_unavailable",
    code: "CONSTITUTIONALLY_UNAVAILABLE",
    when: (order) => order.partySystem === "single_legal_party",
    message:
      "Multiparty electoral administration is unavailable while the constitution recognizes only one legal party.",
  },
  {
    provisionId: "PROV_DONOR_DISCLOSURE",
    optionId: "rapid_disclosure",
    status: "potential_rights_issue",
    when: (order) =>
      order.civilLiberties === "restricted_political_expression" ||
      order.civilLiberties === "security_qualified_liberties",
    message:
      "Expanded campaign disclosure may intersect with constitutionally qualified political-expression rules.",
  },
  {
    provisionId: "PROV_SURVEILLANCE_WARRANT",
    optionId: "emergency_access_window",
    status: "potential_rights_issue",
    when: (order) =>
      order.civilLiberties === "restricted_political_expression" ||
      order.civilLiberties === "security_qualified_liberties",
    message:
      "Emergency communications access may raise civil-liberties concerns under the present constitutional charter.",
  },
  {
    provisionId: "PROV_REVENUE_DISCRETION",
    optionId: "broader_local_authority",
    status: "potential_competence_issue",
    when: (order) => order.provincialCompetence === "national_supremacy",
    message:
      "Broader provincial revenue powers may conflict with a constitution assigning national supremacy over finance.",
  },
  {
    provisionId: "PROV_HOUSING_APPROVALS",
    optionId: "national_zoning_override",
    status: "potential_competence_issue",
    when: (order) => order.provincialCompetence === "strong_devolution",
    message:
      "National zoning override may challenge a constitution with strong provincial planning competence.",
  },
  {
    provisionId: "PROV_REPRODUCTIVE_LAW",
    optionId: "national_protection",
    status: "potential_rights_issue",
    when: (order) => order.civilLiberties === "restricted_political_expression",
    message:
      "National reproductive-health guarantees may intersect with restricted political-expression protections.",
  },
];

const PROVINCIAL_COMPETENCE_SUBJECTS = new Set([
  "PROV_REVENUE_DISCRETION",
  "PROV_HOUSING_APPROVALS",
  "PROV_TRANSIT_ZONING",
  "PROV_PUBLIC_HOUSING",
  "PROV_RENT_POLICY",
  "PROV_FARMLAND_POLICY",
  "PROV_WATER_ENFORCEMENT",
]);

/** A5: Subjects that interact with localGovernment order (housing / local authority bills). */
const LOCAL_GOVERNMENT_SUBJECTS = new Set([
  "PROV_HOUSING_APPROVALS",
  "PROV_TRANSIT_ZONING",
  "PROV_PUBLIC_HOUSING",
  "PROV_RENT_POLICY",
]);

const LIBERTY_SENSITIVE_ISSUES = new Set(["ISS_LIBERTY", "ISS_REFORM", "ISS_POLICING"]);

function worstStatus(
  a: BillConstitutionalityStatus,
  b: BillConstitutionalityStatus,
): BillConstitutionalityStatus {
  const rank: Record<BillConstitutionalityStatus, number> = {
    no_obvious_conflict: 0,
    potential_rights_issue: 1,
    potential_competence_issue: 1,
    constitutionally_unavailable: 2,
  };
  return rank[b] > rank[a] ? b : a;
}

export function assessBillConstitutionality(
  state: SimState,
  _world: KernelWorld,
  policyItems: readonly PolicyItem[],
): BillConstitutionalityAssessment {
  const order = state.provincialRuntime.constitutionalOrder;
  let status: BillConstitutionalityStatus = "no_obvious_conflict";
  let code: string | undefined;
  let message: string | undefined;
  const itemWarnings: Record<string, string> = {};

  for (const item of policyItems) {
    const key = item.provisionId ?? item.issueId;
    const option = optionForPolicyItem(item);
    if (item.provisionId && item.optionId) {
      for (const rule of OPTION_RULES) {
        if (rule.provisionId !== item.provisionId || rule.optionId !== item.optionId) continue;
        if (!rule.when(order)) continue;
        status = worstStatus(status, rule.status);
        if (rule.status === "constitutionally_unavailable") {
          code = rule.code ?? "CONSTITUTIONALLY_UNAVAILABLE";
          message = rule.message;
        } else {
          itemWarnings[key] = rule.message;
        }
      }
    }

    if (
      item.provisionId &&
      PROVINCIAL_COMPETENCE_SUBJECTS.has(item.provisionId) &&
      order.provincialCompetence === "national_supremacy" &&
      option &&
      option.direction > 0.4
    ) {
      status = worstStatus(status, "potential_competence_issue");
      itemWarnings[key] ??=
        "This provincial-policy choice may exceed ordinary-law competence under national supremacy.";
    }

    if (
      LIBERTY_SENSITIVE_ISSUES.has(item.issueId) &&
      (order.civilLiberties === "restricted_political_expression" ||
        order.civilLiberties === "security_qualified_liberties") &&
      option &&
      option.direction < -0.4
    ) {
      status = worstStatus(status, "potential_rights_issue");
      itemWarnings[key] ??=
        "This measure loosens safeguards in an area covered by qualified civil-liberties protections.";
    }

    // A5: localGovernment — national legislation on local/housing subjects may conflict
    // with provincial_primary local government authority
    if (
      item.provisionId &&
      LOCAL_GOVERNMENT_SUBJECTS.has(item.provisionId) &&
      order.localGovernment === "provincial_primary" &&
      option &&
      Math.abs(option.direction) > 0.3
    ) {
      status = worstStatus(status, "potential_competence_issue");
      itemWarnings[key] ??=
        "National legislation on local government subjects may exceed competence when provinces hold primary local authority.";
    }
    if (
      item.provisionId &&
      LOCAL_GOVERNMENT_SUBJECTS.has(item.provisionId) &&
      order.localGovernment === "nationally_directed" &&
      option &&
      option.direction > 0.4
    ) {
      // nationally_directed means national has full control — expanding local autonomy is consistent
      // No warning needed
    }
  }

  const out: BillConstitutionalityAssessment = { status, itemWarnings };
  if (code) out.code = code;
  if (message) out.message = message;
  return out;
}

/** Hard rejection helper for introduceBill when status is constitutionally_unavailable. */
export function constitutionalityRejection(
  assessment: BillConstitutionalityAssessment,
): { code: string; message: string } | null {
  if (assessment.status !== "constitutionally_unavailable") return null;
  return {
    code: assessment.code ?? "CONSTITUTIONALLY_UNAVAILABLE",
    message:
      assessment.message ??
      "This bill conflicts with the current constitutional order and cannot be introduced as ordinary law.",
  };
}
