/**
 * Constitutional question and doctrine label catalogs (Phase 17B wave 2).
 */

import type { CourtCaseType } from "./types.js";

export const JUDICIAL_DOCTRINE_LABELS: Record<string, readonly string[]> = {
  law_review: [
    "proportionality standard",
    "enumerated powers doctrine",
    "rights-limitation test",
    "delegated authority boundary",
  ],
  regulation_review: [
    "non-delegation principle",
    "major-questions guardrail",
    "procedural regularity standard",
    "substantive reasonableness review",
  ],
  emergency_review: [
    "necessity and temporariness test",
    "institutional balance doctrine",
    "rights derogation limit",
  ],
  federal_provincial_competence: [
    "double aspect analysis",
    "paramountcy framework",
    "interjurisdictional immunity",
    "cooperative federalism presumption",
  ],
  impeachment_judgment: [
    "high office accountability standard",
    "evidentiary sufficiency test",
  ],
  rights_limitation_review: [
    "privacy proportionality test",
    "minimal impairment standard",
    "charter rights derogation limit",
    "surveillance necessity threshold",
  ],
  election_administration: [
    "voter enfranchisement standard",
    "electoral fairness doctrine",
    "administrative neutrality test",
    "ballot-access reasonableness review",
  ],
};

export function resolveConstitutionalRule(args: {
  caseType: CourtCaseType;
  issueId?: string;
  provisionId?: string;
  challengedKind?: string;
}): string {
  if (args.caseType === "EMERGENCY_REVIEW") return "emergency_review";
  if (args.caseType === "FEDERAL_PROVINCIAL_DISPUTE") return "federal_provincial_competence";
  if (args.caseType === "REGULATION_REVIEW") return "regulation_review";
  if (args.caseType === "ELECTION_CONSTITUTIONAL_DISPUTE") return "election_administration";
  if (args.caseType === "IMPEACHMENT_JUDGMENT") return "impeachment_judgment";
  if (args.challengedKind === "emergency") return "emergency_review";

  const prov = (args.provisionId ?? "").toUpperCase();
  if (
    args.issueId === "ISS_LIBERTY" ||
    prov.includes("DATA") ||
    prov.includes("SURVEILLANCE") ||
    prov.includes("PRIVACY")
  ) {
    return "rights_limitation_review";
  }
  if (args.issueId === "ISS_REFORM" && prov.includes("ELECTION")) return "election_administration";
  if (args.issueId === "ISS_HOUSING") return "federal_provincial_competence";
  if (args.issueId === "ISS_IMMIGRATION") return "rights_limitation_review";
  if (args.issueId === "ISS_CLIMATE") return "federal_provincial_competence";
  return "law_review";
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickJudicialDoctrineLabel(constitutionalRule: string, seed: string): string | null {
  const pool = JUDICIAL_DOCTRINE_LABELS[constitutionalRule];
  if (!pool || pool.length === 0) return null;
  const idx = stableHash(`${constitutionalRule}:${seed}`) % pool.length;
  return pool[idx] ?? null;
}

const LAW_REVIEW_QUESTIONS: Record<string, readonly string[]> = {
  ISS_LABOR: [
    "Whether the statute respects constitutionally protected collective bargaining",
    "Whether the wage mandate exceeds federal labour-competence limits",
    "Whether the bill's penalty regime violates due-process guarantees",
  ],
  ISS_CLIMATE: [
    "Whether the carbon mechanism respects provincial resource jurisdiction",
    "Whether the transition schedule breaches property-rights protections",
    "Whether the statute delegates standard-setting power unlawfully",
  ],
  ISS_LIBERTY: [
    "Whether the surveillance provision fails a rights-limitation test",
    "Whether the data-retention rule is disproportionate to its stated aim",
    "Whether the bill's search powers violate constitutional privacy guarantees",
  ],
  ISS_REFORM: [
    "Whether the ethics regime intrudes on parliamentary privilege",
    "Whether the transparency mandate exceeds ordinary legislative authority",
    "Whether the appointment override breaches separation-of-powers rules",
  ],
  ISS_DEFENSE: [
    "Whether the procurement carve-out bypasses assembly appropriation rules",
    "Whether the deployment clause grants emergency authority without limits",
    "Whether the statute conflicts with treaty-based force constraints",
  ],
  ISS_IMMIGRATION: [
    "Whether the border measure violates non-refoulement commitments",
    "Whether provincial settlement conditions exceed federal immigration power",
    "Whether the detention standard satisfies constitutional liberty protections",
  ],
  ISS_HOUSING: [
    "Whether rent controls impair constitutionally protected property interests",
    "Whether the expropriation pathway satisfies just-compensation requirements",
    "Whether the housing mandate encroaches on provincial land-use authority",
  ],
};

export function pickLawReviewQuestion(
  lawTitle: string,
  issueId: string | undefined,
  lawId: string,
): string {
  const pool = issueId ? LAW_REVIEW_QUESTIONS[issueId] : undefined;
  if (pool && pool.length > 0) {
    const idx = stableHash(`${lawId}:law_q`) % pool.length;
    return pool[idx]!.replace(/\{title\}/g, lawTitle);
  }
  const generic = [
    `Whether ${lawTitle} respects the division of legislative authority`,
    `Whether ${lawTitle} violates constitutionally protected rights`,
    `Whether ${lawTitle} exceeds delegated regulatory authority`,
    `Whether ${lawTitle} fails the proportionality standard for rights limitations`,
  ];
  const idx = stableHash(`${lawId}:generic_q`) % generic.length;
  return generic[idx]!;
}

export function pickRegulationReviewQuestion(regulationTitle: string, regId: string): string {
  const variants = [
    `Whether ${regulationTitle} exceeds lawful executive rule-making authority`,
    `Whether ${regulationTitle} conflicts with primary legislation`,
    `Whether ${regulationTitle} imposes penalties without clear statutory authorization`,
    `Whether ${regulationTitle} breaches procedural fairness requirements`,
  ];
  const idx = stableHash(`${regId}:reg_q`) % variants.length;
  return variants[idx]!;
}
