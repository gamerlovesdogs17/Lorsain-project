import { currentProvisionOption } from "../legislature/provisions.js";
import type { SimState } from "../types.js";
import { ensureGoverningRuntime } from "./state.js";
import type { PolicyInteractionRecord } from "./types.js";

type InteractionRule = {
  id: string;
  kind: PolicyInteractionRecord["kind"];
  label: string;
  provisionA: string;
  optionAIncludes?: string[];
  optionAExcludes?: string[];
  provisionB: string;
  optionBIncludes?: string[];
  optionBExcludes?: string[];
  severity: number;
};

/** Small high-value set — not a full rule engine. */
const INTERACTION_RULES: InteractionRule[] = [
  {
    id: "INT_LABOR_WAGE_BARGAIN",
    kind: "synergy",
    label: "Strong bargaining scope amplifies high minimum wage effects",
    provisionA: "PROV_BARGAINING_SCOPE",
    optionAIncludes: ["sector", "enterprise", "employee_presumption"],
    provisionB: "PROV_MINIMUM_WAGE",
    optionBIncludes: ["living_wage", "wage_indexation", "wage_floor"],
    severity: 0.55,
  },
  {
    id: "INT_BENEFITS_UNEMPLOYMENT",
    kind: "strain",
    label: "Generous benefits raise fiscal strain when unemployment insurance is expansive",
    provisionA: "PROV_UNEMPLOYMENT_INSURANCE",
    optionAIncludes: ["forty", "twenty_six"],
    provisionB: "PROV_CHILD_BENEFIT",
    optionBIncludes: ["universal", "near_universal", "expanded"],
    severity: 0.5,
  },
  {
    id: "INT_TARIFF_EXPORT",
    kind: "strain",
    label: "High tariffs conflict with export-oriented growth posture",
    provisionA: "PROV_STRATEGIC_TARIFFS",
    optionAIncludes: ["levy_65", "levy_95", "95", "65"],
    provisionB: "PROV_CORPORATE_TAX",
    optionBIncludes: ["15", "territorial", "investment_allowance"],
    severity: 0.45,
  },
  {
    id: "INT_ENERGY_GRID",
    kind: "strain",
    label: "Clean-energy buildout strains grid without matching investment",
    provisionA: "PROV_CARBON_PRICE",
    optionAIncludes: ["levy_65", "levy_95"],
    provisionB: "PROV_ELECTRICITY_MARKET",
    optionBIncludes: ["competitive_retail", "market"],
    severity: 0.6,
  },
  {
    id: "INT_RAIL_OWNERSHIP_CONTRADICTION",
    kind: "contradiction",
    label: "Private and exclusive public rail ownership cannot both be current law",
    provisionA: "PROV_RAIL_OWNERSHIP",
    optionAIncludes: ["private", "open_access_private"],
    provisionB: "PROV_RAIL_OWNERSHIP",
    optionBIncludes: ["public_operator", "exclusive_public", "public_with"],
    severity: 0.9,
  },
  {
    id: "INT_HEALTH_FINANCING_CONTRADICTION",
    kind: "contradiction",
    label: "Market-only and national health service financing conflict",
    provisionA: "PROV_PRIMARY_CARE",
    optionAIncludes: ["visit_fee", "market"],
    provisionB: "PROV_PRIMARY_CARE",
    optionBIncludes: ["national_health", "capitation"],
    severity: 0.85,
  },
  {
    id: "INT_GAS_CARBON_CONTRADICTION",
    kind: "contradiction",
    label: "Gas extension clashes with accelerated carbon pricing",
    provisionA: "PROV_GAS_BRIDGE",
    optionAIncludes: ["extend_gas"],
    provisionB: "PROV_CARBON_PRICE",
    optionBIncludes: ["levy_95"],
    severity: 0.82,
  },
  {
    id: "INT_DATA_SURVEILLANCE_STRAIN",
    kind: "strain",
    label: "Strict data consent rules strain emergency surveillance access",
    provisionA: "PROV_CROSS_BORDER_DATA",
    optionAIncludes: ["consent", "portability"],
    provisionB: "PROV_SURVEILLANCE_WARRANT",
    optionBIncludes: ["emergency"],
    severity: 0.52,
  },
  {
    id: "INT_ALGORITHM_AUDIT_SYNERGY",
    kind: "synergy",
    label: "National algorithm registry reinforces stricter digital privacy duties",
    provisionA: "PROV_ALGORITHM_AUDIT",
    optionAIncludes: ["registry", "audit"],
    provisionB: "PROV_CROSS_BORDER_DATA",
    optionBIncludes: ["consent"],
    severity: 0.48,
  },
  {
    id: "INT_ASYLUM_TEMP_STRAIN",
    kind: "strain",
    label: "Restrictive asylum procedures strain open temporary worker flows",
    provisionA: "PROV_ASYLUM_PROCESS",
    optionAIncludes: ["safe_country"],
    provisionB: "PROV_TEMP_WORKER",
    optionBIncludes: ["open_sectoral"],
    severity: 0.46,
  },
  {
    id: "INT_BODY_CAMERA_OVERSIGHT_SYNERGY",
    kind: "synergy",
    label: "Mandatory cameras amplify civilian review credibility",
    provisionA: "PROV_BODY_CAMERA",
    optionAIncludes: ["mandatory"],
    provisionB: "PROV_POLICE_COMPLAINTS",
    optionBIncludes: ["civilian"],
    severity: 0.5,
  },
  {
    id: "INT_CONSUMER_CREDIT_DEPOSIT_STRAIN",
    kind: "strain",
    label: "Public retail lending expands fiscal exposure alongside deposit mutualization",
    provisionA: "PROV_CONSUMER_FINANCE",
    optionAIncludes: ["public_lender"],
    provisionB: "PROV_DEPOSIT_INSURANCE",
    optionBIncludes: ["mutualized"],
    severity: 0.44,
  },
  {
    id: "INT_PROVINCIAL_AI_FEDERAL_CONTRADICTION",
    kind: "contradiction",
    label: "Provincial AI sandboxes conflict with a national audit registry",
    provisionA: "PROV_ALGORITHM_AUDIT",
    optionAIncludes: ["provincial_sandbox"],
    provisionB: "PROV_ALGORITHM_AUDIT",
    optionBIncludes: ["national_audit"],
    severity: 0.88,
  },
  {
    id: "INT_ENERGY_GRID_CLIMATE",
    kind: "strain",
    label: "Gas bridge extensions slow clean-power buildout timelines",
    provisionA: "PROV_GAS_BRIDGE",
    optionAIncludes: ["extend_gas"],
    provisionB: "PROV_CLEAN_POWER",
    optionBIncludes: ["accelerate", "zero_carbon"],
    severity: 0.47,
  },
];

function optionMatches(optionId: string, includes?: string[], excludes?: string[]): boolean {
  if (excludes?.some((frag) => optionId.includes(frag))) return false;
  if (!includes || includes.length === 0) return true;
  return includes.some((frag) => optionId.includes(frag));
}

/**
 * Detect active policy interactions and contradictions from current-law options.
 * Contradiction on the same provision uses history/stack impossibility checks
 * only when two incompatible option fragments would both apply — for single
 * current option, we instead flag cross-provision conflicts and ownership clashes
 * across related provisions when both match their fragments.
 */
export function detectPolicyInteractions(state: SimState): PolicyInteractionRecord[] {
  const runtime = ensureGoverningRuntime(state);
  const found: PolicyInteractionRecord[] = [];

  for (const rule of INTERACTION_RULES) {
    // Same-provision "contradiction" rules are informational templates for drafting;
    // with a single current option they cannot fire. Skip identical provision pairs.
    if (rule.provisionA === rule.provisionB && rule.kind === "contradiction") {
      continue;
    }

    const optA = currentProvisionOption(state, rule.provisionA);
    const optB = currentProvisionOption(state, rule.provisionB);
    if (!optA || !optB) continue;
    if (!optionMatches(optA.id, rule.optionAIncludes, rule.optionAExcludes)) continue;
    if (!optionMatches(optB.id, rule.optionBIncludes, rule.optionBExcludes)) continue;

    const id = rule.id;
    const rec: PolicyInteractionRecord = {
      id,
      kind: rule.kind,
      label: rule.label,
      provisionIds: [rule.provisionA, rule.provisionB],
      issueIds: [],
      severity: rule.severity,
      detectedDate: state.currentDate,
      resolved: false,
    };
    found.push(rec);
    runtime.interactions[id] = rec;
  }

  // Cross-law ownership contradiction: two operative Acts set incompatible rail options.
  const railLaws = Object.values(state.legislatureRuntime.enactedLaws).filter(
    (l) =>
      l.operative &&
      l.policyItems.some(
        (i) =>
          i.provisionId === "PROV_RAIL_OWNERSHIP" &&
          i.optionId &&
          (i.optionId.includes("private") || i.optionId.includes("public")),
      ),
  );
  if (railLaws.length >= 2) {
    const options = new Set(
      railLaws.flatMap((l) =>
        l.policyItems
          .filter((i) => i.provisionId === "PROV_RAIL_OWNERSHIP" && i.optionId)
          .map((i) => i.optionId!),
      ),
    );
    const hasPrivate = [...options].some((o) => o.includes("private"));
    const hasPublic = [...options].some(
      (o) => o.includes("public") && !o.includes("competition") && !o.includes("concessions"),
    );
    if (hasPrivate && hasPublic) {
      const id = "INT_ACTIVE_RAIL_CONTRADICTION";
      const rec: PolicyInteractionRecord = {
        id,
        kind: "contradiction",
        label: "Operative Acts assert incompatible rail ownership rules",
        provisionIds: ["PROV_RAIL_OWNERSHIP"],
        issueIds: ["ISS_OWNERSHIP"],
        severity: 0.95,
        detectedDate: state.currentDate,
        resolved: false,
      };
      found.push(rec);
      runtime.interactions[id] = rec;
    }
  }

  // Clear stale resolved flags for interactions no longer active.
  for (const [id, rec] of Object.entries(runtime.interactions)) {
    if (!found.some((f) => f.id === id) && !rec.resolved) {
      rec.resolved = true;
    }
  }

  return found;
}

export function activeContradictions(state: SimState): PolicyInteractionRecord[] {
  return Object.values(ensureGoverningRuntime(state).interactions).filter(
    (i) => i.kind === "contradiction" && !i.resolved,
  );
}
