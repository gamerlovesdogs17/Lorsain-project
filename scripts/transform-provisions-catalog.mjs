/**
 * Transform legislative provisions catalog:
 * - rename current→founding
 * - replace Keep* labels with founding descriptive labels from currentLawLabel
 * - expand selected provisions with additional categorical options
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/sim/src/legislature/provisions.ts";
let src = readFileSync(path, "utf8");

// Type + helper renames
src = src.replace(/current: boolean;/g, "founding: boolean;");
src = src.replace(
  /current\?: boolean;/g,
  "founding?: boolean;\n    controlHint?: \"categorical\" | \"numeric\" | \"binary\" | \"threshold\";",
);
src = src.replace(/current: args\.current === true,/g, "founding: args.founding === true,");
src = src.replace(
  /options\.length < 2 \|\| options\.filter\(\(option\) => option\.current\)\.length !== 1/g,
  "options.length < 2 || options.filter((option) => option.founding).length !== 1",
);
src = src.replace(
  /\$\{id\} must define at least two alternatives and exactly one current-law option/g,
  "${id} must define at least two alternatives and exactly one founding baseline option",
);
src = src.replace(/current: true/g, "founding: true");
src = src.replace(/option\.current/g, "option.founding");
src = src.replace(/candidate\.current/g, "candidate.founding");
src = src.replace(/a\.current/g, "a.founding");
src = src.replace(/b\.current/g, "b.founding");
src = src.replace(/!candidate\.current/g, "!candidate.founding");

// Replace Keep labels: option("id", "Keep …", …) → use the provision's currentLawLabel
// Process provision blocks
src = src.replace(
  /variableProvision\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([\s\S]*?)\]\s*,?\s*\)/g,
  (full, id, issueId, category, currentLawLabel, optionsBody) => {
    let body = optionsBody.replace(
      /option\(\s*"([^"]+)",\s*"(Keep [^"]+|Current [^"]*)",\s*"([^"]*)",\s*"([^"]*)",/g,
      (_m, optId, _keepLabel, change, billTitle) => {
        return `option(\n        "${optId}",\n        ${JSON.stringify(currentLawLabel)},\n        ${JSON.stringify(change)},\n        ${JSON.stringify(billTitle)},`;
      },
    );
    // Also catch keep_* ids that still say Keep in label after partial transforms
    body = body.replace(
      /option\(\s*"(keep_[^"]+|[^"]*continuity[^"]*)",\s*"Keep [^"]*",/g,
      (m, optId) => `option(\n        "${optId}",\n        ${JSON.stringify(currentLawLabel)},`,
    );
    return `variableProvision(\n    "${id}",\n    "${issueId}",\n    "${category}",\n    "${currentLawLabel}",\n    [${body}]\n  )`;
  },
);

// Expand bargaining scope with richer alternatives
const bargainingOld = /variableProvision\(\s*"PROV_BARGAINING_SCOPE"[\s\S]*?\n  \),/;
const bargainingNew = `variableProvision(
    "PROV_BARGAINING_SCOPE",
    "ISS_LABOR",
    "Collective bargaining coverage",
    "Workplace bargaining with voluntary sector agreements",
    [
      option(
        "no_statutory_framework",
        "No statutory bargaining framework",
        "Removes statutory recognition procedures and leaves bargaining to private contract.",
        "Bargaining Deregulation Bill",
        {
          direction: -1,
          magnitude: 0.72,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: -0.55, authority: 0.2 },
        },
      ),
      option(
        "workplace_agreements_only",
        "Workplace recognition framework",
        "Limits statutory recognition to individual workplaces.",
        "Workplace Bargaining Bill",
        {
          direction: -0.55,
          magnitude: 0.52,
          fiscalImpact: -0.04,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: -0.35 },
        },
      ),
      option(
        "keep_current_coverage",
        "Workplace bargaining with voluntary sector agreements",
        "Leaves existing workplace and voluntary sector agreements in force.",
        "Collective Bargaining Continuity Bill",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: 0.05 },
        },
      ),
      option(
        "enterprise_wide",
        "Enterprise-wide bargaining",
        "Requires recognition across an employer's full enterprise where thresholds are met.",
        "Enterprise Bargaining Bill",
        {
          direction: 0.35,
          magnitude: 0.48,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: 0.3 },
        },
      ),
      option(
        "voluntary_sector_councils",
        "Voluntary sector bargaining councils",
        "Enables sector councils that bind only consenting employers and unions.",
        "Sector Councils Bill",
        {
          direction: 0.55,
          magnitude: 0.5,
          fiscalImpact: 0.06,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: 0.4 },
        },
      ),
      option(
        "binding_sector_councils",
        "Binding sector bargaining councils",
        "Creates sector councils whose agreements cover workplaces in the sector by law.",
        "Binding Sector Bargaining Bill",
        {
          direction: 0.85,
          magnitude: 0.7,
          fiscalImpact: 0.1,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: 0.65, authority: 0.25 },
        },
      ),
      option(
        "national_wage_council",
        "National wage and bargaining council",
        "Establishes a national council setting minimum sectoral wage floors and bargaining rules.",
        "National Wage Council Bill",
        {
          direction: 1,
          magnitude: 0.78,
          fiscalImpact: 0.14,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          dimensionEffects: { economic: 0.8, authority: 0.35 },
        },
      ),
    ],
  ),`;

if (bargainingOld.test(src)) {
  src = src.replace(bargainingOld, bargainingNew);
} else {
  console.warn("PROV_BARGAINING_SCOPE block not found for expansion");
}

const railOld = /variableProvision\(\s*"PROV_RAIL_OWNERSHIP"[\s\S]*?\n  \),/;
const railNew = `variableProvision(
    "PROV_RAIL_OWNERSHIP",
    "ISS_OWNERSHIP",
    "National rail ownership",
    "Mixed public infrastructure and private train operations",
    [
      option(
        "private_infrastructure",
        "Private ownership and infrastructure",
        "Transfers track and stations to private owners under a regulatory licence.",
        "Rail Privatisation Bill",
        {
          direction: -1,
          magnitude: 0.78,
          fiscalImpact: -0.2,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: -0.7 },
        },
      ),
      option(
        "private_concessions",
        "Private concessions on public infrastructure",
        "Keeps public track while awarding long-term private passenger concessions.",
        "Passenger Rail Concessions Bill",
        {
          direction: -0.55,
          magnitude: 0.62,
          fiscalImpact: -0.12,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: -0.4 },
        },
      ),
      option(
        "open_access_private",
        "Open-access private operators",
        "Allows competing private operators on public infrastructure under open-access rules.",
        "Open Access Rail Bill",
        {
          direction: -0.25,
          magnitude: 0.45,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: -0.2 },
        },
      ),
      option(
        "keep_mixed_system",
        "Mixed public infrastructure and private train operations",
        "Retains public infrastructure and private train operations.",
        "Rail Operations Continuity Bill",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: 0 },
        },
      ),
      option(
        "public_with_competition",
        "Public operator with private competition",
        "Creates a public passenger operator while allowing private competitors on the same network.",
        "Competitive Public Rail Bill",
        {
          direction: 0.45,
          magnitude: 0.55,
          fiscalImpact: 0.1,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: 0.35 },
        },
      ),
      option(
        "public_operator",
        "Exclusive public passenger operator",
        "Creates one public operator for interprovincial passenger rail.",
        "National Passenger Rail Bill",
        {
          direction: 0.75,
          magnitude: 0.68,
          fiscalImpact: 0.18,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: 0.55 },
        },
      ),
      option(
        "integrated_public_authority",
        "Integrated public rail authority",
        "Unifies track, stations and passenger services under a single public rail authority.",
        "Integrated Rail Authority Bill",
        {
          direction: 1,
          magnitude: 0.8,
          fiscalImpact: 0.24,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          dimensionEffects: { economic: 0.75, authority: 0.2 },
        },
      ),
    ],
  ),`;

if (railOld.test(src)) {
  src = src.replace(railOld, railNew);
} else {
  console.warn("PROV_RAIL_OWNERSHIP block not found for expansion");
}

// Expand child benefit with numeric-style discrete values
const childOld = /variableProvision\(\s*"PROV_CHILD_BENEFIT_ELIGIBILITY"[\s\S]*?\n  \),/;
const childNew = `variableProvision(
    "PROV_CHILD_BENEFIT_ELIGIBILITY",
    "ISS_WELFARE",
    "Child benefit eligibility",
    "Income-tested benefit for low- and middle-income households",
    [
      option(
        "narrow_eligibility",
        "Low-income households only",
        "Limits the child benefit to low-income households.",
        "Child Benefit Targeting Bill",
        {
          direction: -0.7,
          magnitude: 0.57,
          fiscalImpact: -0.12,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          dimensionEffects: { economic: -0.45, social: -0.2 },
          parameterValue: 80,
          controlHint: "threshold",
        },
      ),
      option(
        "keep_income_test",
        "Income-tested benefit for low- and middle-income households",
        "Retains the present income-tested child benefit.",
        "Family Support Continuity Bill",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          dimensionEffects: { economic: 0.05 },
          parameterValue: 140,
          controlHint: "threshold",
        },
      ),
      option(
        "expanded_middle",
        "Eligibility to 180% of median income",
        "Extends the child benefit to households up to 180% of median income.",
        "Expanded Family Support Bill",
        {
          direction: 0.45,
          magnitude: 0.5,
          fiscalImpact: 0.12,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          dimensionEffects: { economic: 0.35, social: 0.25 },
          parameterValue: 180,
          controlHint: "threshold",
        },
      ),
      option(
        "near_universal",
        "Eligibility to 250% of median income",
        "Extends the child benefit nearly universally while retaining a high-income taper.",
        "Broad Child Benefit Bill",
        {
          direction: 0.75,
          magnitude: 0.58,
          fiscalImpact: 0.18,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          dimensionEffects: { economic: 0.55, social: 0.4 },
          parameterValue: 250,
          controlHint: "threshold",
        },
      ),
      option(
        "universal_benefit",
        "Universal child benefit",
        "Pays the child benefit to every household with eligible children.",
        "Universal Child Benefit Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.22,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          dimensionEffects: { economic: 0.7, social: 0.55 },
          parameterValue: 999,
          controlHint: "threshold",
        },
      ),
    ],
  ),`;

if (childOld.test(src)) {
  src = src.replace(childOld, childNew);
} else {
  console.warn("PROV_CHILD_BENEFIT_ELIGIBILITY block not found");
}

// Append helper exports before end if not present
if (!src.includes("export function proposalOptionsFor")) {
  src += `

export function foundingOptionId(provisionId: string): string | null {
  const definition = legislativeProvision(provisionId);
  return definition?.options.find((option) => option.founding)?.id ?? null;
}

/** Options that may appear as legislative proposals (excludes founding baseline). */
export function proposalOptionsFor(
  provisionId: string,
): readonly LegislativeProvisionOption[] {
  const definition = legislativeProvision(provisionId);
  if (!definition) return [];
  return definition.options.filter((option) => !option.founding);
}

export function isNoOpProvisionChoice(
  state: SimState,
  provisionId: string,
  optionId: string,
): boolean {
  const current = currentProvisionOption(state, provisionId);
  return current?.id === optionId;
}
`;
}

writeFileSync(path, src);
console.log("transformed", path);
