/**
 * Human-facing option catalogs for Scenario Studio.
 * IDs must match packages/sim constitutionalOrder / election modes.
 * Studio and schema validation import from here — do not duplicate enum lists in UI.
 */

export type OptionMeta = {
  id: string;
  label: string;
  shortDescription: string;
};

function catalog<const T extends readonly OptionMeta[]>(items: T): T {
  return items;
}

export const PARTY_SYSTEM_OPTIONS = catalog([
  {
    id: "competitive_multiparty",
    label: "Competitive multiparty",
    shortDescription: "Multiple Parties compete freely for office.",
  },
  {
    id: "restricted_registration",
    label: "Restricted registration",
    shortDescription: "Parties may register only under tighter legal rules.",
  },
  {
    id: "single_legal_party",
    label: "Single legal Party",
    shortDescription: "Only one Party may legally contest national politics.",
  },
  {
    id: "nonpartisan_candidates",
    label: "Nonpartisan candidates",
    shortDescription: "Candidates stand without formal Party labels.",
  },
] as const);

export const PRESIDENTIAL_ELECTION_OPTIONS = catalog([
  {
    id: "national_rcv",
    label: "National ranked-choice",
    shortDescription: "Voters rank candidates; IRV/RCV decides the winner.",
  },
  {
    id: "plurality",
    label: "Plurality",
    shortDescription: "Most first-preference votes wins.",
  },
  {
    id: "majority_runoff",
    label: "Majority runoff",
    shortDescription: "Top two advance if nobody wins a majority.",
  },
  {
    id: "assembly_selection",
    label: "Selected by Assembly",
    shortDescription: "The Assembly chooses the head of state.",
  },
] as const);

export const ASSEMBLY_ELECTION_OPTIONS = catalog([
  {
    id: "stv",
    label: "Preferential (STV)",
    shortDescription: "Multi-member preferential constituencies.",
  },
  {
    id: "closed_list_pr",
    label: "Proportional list",
    shortDescription: "Closed Party lists allocate seats by share.",
  },
  {
    id: "fptp",
    label: "Constituency plurality",
    shortDescription: "Single-member districts; plurality wins.",
  },
  {
    id: "mixed_member",
    label: "Mixed member",
    shortDescription: "Constituency seats plus compensatory list seats.",
  },
] as const);

export const JUDICIAL_REVIEW_OPTIONS = catalog([
  {
    id: "strong_review",
    label: "Strong review",
    shortDescription: "Court may invalidate laws vigorously.",
  },
  {
    id: "standard_review",
    label: "Standard review",
    shortDescription: "Ordinary constitutional review of legislation.",
  },
  {
    id: "deferential_review",
    label: "Deferential review",
    shortDescription: "Court rarely overturns political branches.",
  },
  {
    id: "legislative_finality",
    label: "Legislative finality",
    shortDescription: "Assembly has the last word on constitutionality.",
  },
] as const);

export const PROVINCIAL_COMPETENCE_OPTIONS = catalog([
  {
    id: "enumerated_provincial",
    label: "Enumerated provincial",
    shortDescription: "Provinces hold only listed powers.",
  },
  {
    id: "concurrent_powers",
    label: "Concurrent powers",
    shortDescription: "Shared national–provincial competence.",
  },
  {
    id: "national_supremacy",
    label: "National supremacy",
    shortDescription: "National law prevails broadly.",
  },
  {
    id: "strong_devolution",
    label: "Strong devolution",
    shortDescription: "Provinces retain substantial autonomy.",
  },
] as const);

export const EMERGENCY_POWER_OPTIONS = catalog([
  {
    id: "narrow_assembly_supervised",
    label: "Narrow, Assembly-supervised",
    shortDescription: "Limited emergency powers under Assembly oversight.",
  },
  {
    id: "standard_emergency",
    label: "Standard emergency",
    shortDescription: "Conventional executive emergency authority.",
  },
  {
    id: "broad_executive_emergency",
    label: "Broad executive emergency",
    shortDescription: "Wide unilateral emergency powers.",
  },
  {
    id: "assembly_declared_only",
    label: "Assembly-declared only",
    shortDescription: "Emergencies require Assembly declaration.",
  },
] as const);

export const TREATY_APPROVAL_OPTIONS = catalog([
  {
    id: "assembly_ratification",
    label: "Assembly ratification",
    shortDescription: "Treaties need Assembly approval.",
  },
  {
    id: "assembly_and_provinces",
    label: "Assembly and provinces",
    shortDescription: "National and provincial consent required.",
  },
  {
    id: "executive_alone",
    label: "Executive alone",
    shortDescription: "Executive may conclude treaties without Assembly.",
  },
  {
    id: "supermajority_assembly",
    label: "Assembly supermajority",
    shortDescription: "Treaties need a supermajority in the Assembly.",
  },
] as const);

export const AMENDMENT_PROCESS_OPTIONS = catalog([
  {
    id: "assembly_two_thirds_plus_13_provinces",
    label: "Two-thirds Assembly + provincial ratification",
    shortDescription: "Two-thirds Assembly and ratification by 13 provinces.",
  },
  {
    id: "assembly_three_fifths_plus_11_provinces",
    label: "Three-fifths Assembly + provincial ratification",
    shortDescription: "Three-fifths Assembly and ratification by 11 provinces.",
  },
  {
    id: "assembly_simple_plus_referendum",
    label: "Simple majority + referendum",
    shortDescription: "Assembly majority plus national referendum.",
  },
  {
    id: "assembly_three_quarters_only",
    label: "Three-quarters Assembly only",
    shortDescription: "Three-quarters Assembly; no provincial stage.",
  },
] as const);

export const ENTRENCHMENT_OPTIONS = catalog([
  {
    id: "none",
    label: "None",
    shortDescription: "No special entrenchment of core articles.",
  },
  {
    id: "heightened_threshold",
    label: "Heightened threshold",
    shortDescription: "Core articles need a higher Assembly threshold.",
  },
  {
    id: "election_interlock",
    label: "Election interlock",
    shortDescription: "Core changes need an intervening election.",
  },
  {
    id: "referendum_core",
    label: "Referendum core",
    shortDescription: "Core articles require popular approval.",
  },
  {
    id: "hard_core",
    label: "Hard core",
    shortDescription: "Some core provisions are effectively unamendable in practice.",
  },
] as const);

export const CIVIL_LIBERTY_OPTIONS = catalog([
  {
    id: "broad_democratic_liberties",
    label: "Broad democratic liberties",
    shortDescription: "Wide protection for speech, association, and rights.",
  },
  {
    id: "standard_charter",
    label: "Standard charter",
    shortDescription: "Ordinary rights charter with balanced limits.",
  },
  {
    id: "security_qualified_liberties",
    label: "Security-qualified liberties",
    shortDescription: "Rights yield more readily to security claims.",
  },
  {
    id: "restricted_political_expression",
    label: "Restricted political expression",
    shortDescription: "Political speech and organization are tightly limited.",
  },
] as const);

export const EXECUTIVE_AUTHORITY_OPTIONS = catalog([
  {
    id: "constrained_dual_mandate",
    label: "Constrained dual mandate",
    shortDescription: "Shared executive power with checks.",
  },
  {
    id: "standard_presidential",
    label: "Standard presidential",
    shortDescription: "Ordinary presidential executive authority.",
  },
  {
    id: "strengthened_executive",
    label: "Strengthened executive",
    shortDescription: "Expanded unilateral executive capacity.",
  },
  {
    id: "assembly_dominant",
    label: "Assembly-dominant",
    shortDescription: "Executive is largely subordinate to the Assembly.",
  },
] as const);

export const CABINET_FORMATION_OPTIONS = catalog([
  {
    id: "presidential_choice",
    label: "Presidential choice",
    shortDescription: "President selects ministers.",
  },
  {
    id: "assembly_confidence",
    label: "Assembly confidence",
    shortDescription: "Cabinet depends on Assembly confidence.",
  },
  {
    id: "party_slate",
    label: "Party slate",
    shortDescription: "Governing Parties present a Cabinet slate.",
  },
] as const);

export const REPUBLIC_FORM_OPTIONS = catalog([
  {
    id: "democratic_republic",
    label: "Democratic republic",
    shortDescription: "Competitive democratic republic.",
  },
  {
    id: "peoples_republic",
    label: "People's republic",
    shortDescription: "People's-republic framing of the state.",
  },
  {
    id: "unitary_party_republic",
    label: "Unitary Party republic",
    shortDescription: "State organized around a unitary Party model.",
  },
] as const);

export const CITIZENSHIP_GUARD_OPTIONS = catalog([
  {
    id: "equal_citizenship",
    label: "Equal citizenship",
    shortDescription: "Equal civic status.",
  },
  {
    id: "duty_conditioned_citizenship",
    label: "Duty-conditioned citizenship",
    shortDescription: "Civic rights tied more closely to duties.",
  },
] as const);

export const PRESS_FREEDOM_OPTIONS = catalog([
  {
    id: "free_press",
    label: "Free press",
    shortDescription: "Independent press.",
  },
  {
    id: "licensed_press",
    label: "Licensed press",
    shortDescription: "Press operates under licensing rules.",
  },
  {
    id: "state_media_priority",
    label: "State media priority",
    shortDescription: "State media is privileged.",
  },
] as const);

export const LOCAL_GOVERNMENT_OPTIONS = catalog([
  {
    id: "provincial_primary",
    label: "Provincial primary",
    shortDescription: "Local government mainly under provinces.",
  },
  {
    id: "shared",
    label: "Shared",
    shortDescription: "Shared national–provincial local oversight.",
  },
  {
    id: "nationally_directed",
    label: "Nationally directed",
    shortDescription: "National direction of local government.",
  },
] as const);

export const DEFENSE_CONTROL_OPTIONS = catalog([
  {
    id: "civil_supremacy",
    label: "Civil supremacy",
    shortDescription: "Civilian control of the armed forces.",
  },
  {
    id: "joint_command",
    label: "Joint command",
    shortDescription: "Shared civil–military command arrangements.",
  },
  {
    id: "executive_command",
    label: "Executive command",
    shortDescription: "Strong executive command of defense.",
  },
] as const);

/**
 * Mechanical Party ideology families used by scenario generation / baselines.
 * Maps to issue-position baselines — not free-text flavor.
 */
export const PARTY_IDEOLOGY_FAMILIES = catalog([
  {
    id: "centre",
    label: "Centre",
    shortDescription: "Centrist catch-all profile.",
  },
  {
    id: "liberal",
    label: "Liberal",
    shortDescription: "Market-liberal / civil-liberal profile.",
  },
  {
    id: "conservative",
    label: "Conservative",
    shortDescription: "Conservative institutional profile.",
  },
  {
    id: "social-democratic",
    label: "Social democratic",
    shortDescription: "Social-democratic redistribution and welfare profile.",
  },
  {
    id: "green",
    label: "Green",
    shortDescription: "Environmental and quality-of-life profile.",
  },
  {
    id: "nationalist",
    label: "Nationalist",
    shortDescription: "National identity and sovereignty profile.",
  },
  {
    id: "market-reform",
    label: "Market reform",
    shortDescription: "Market liberalization and deregulation profile.",
  },
  {
    id: "labour",
    label: "Labour",
    shortDescription: "Organised-labour and workplace profile.",
  },
] as const);

export const ORGANIZATION_TYPE_OPTIONS = catalog([
  { id: "labor", label: "Labor", shortDescription: "Trade unions and worker groups." },
  { id: "business", label: "Business", shortDescription: "Employer and industry groups." },
  {
    id: "environmental",
    label: "Environmental",
    shortDescription: "Environment and climate groups.",
  },
  {
    id: "civil_rights",
    label: "Civil rights",
    shortDescription: "Civil rights and liberties groups.",
  },
  {
    id: "professional",
    label: "Professional",
    shortDescription: "Professional associations.",
  },
  { id: "agriculture", label: "Agriculture", shortDescription: "Farm and rural groups." },
  { id: "technology", label: "Technology", shortDescription: "Tech sector groups." },
  { id: "civic", label: "Civic", shortDescription: "General civic associations." },
] as const);

export const PERSON_BACKGROUND_OPTIONS = catalog([
  { id: "politics", label: "Politics", shortDescription: "Career politician." },
  { id: "law", label: "Law", shortDescription: "Legal career." },
  { id: "business", label: "Business", shortDescription: "Business background." },
  { id: "academia", label: "Academia", shortDescription: "Academic background." },
  { id: "military", label: "Military", shortDescription: "Military service." },
  { id: "media", label: "Media", shortDescription: "Journalism or media." },
  { id: "labor", label: "Labor", shortDescription: "Union or labor organizing." },
  { id: "civil_service", label: "Civil service", shortDescription: "Bureaucracy." },
  { id: "medicine", label: "Medicine", shortDescription: "Health professions." },
  { id: "agriculture", label: "Agriculture", shortDescription: "Farming or agribusiness." },
] as const);

export const DIPLOMATIC_RELATION_OPTIONS = catalog([
  { id: "friendly", label: "Friendly", shortDescription: "Warm bilateral relationship." },
  { id: "neutral", label: "Neutral", shortDescription: "Ordinary diplomatic distance." },
  { id: "tense", label: "Tense", shortDescription: "Strained relationship." },
] as const);

/** Starting-law / policy catalog entries for Scenario Studio picker (IDs stored as catalogRef). */
export const LAW_CATALOG_OPTIONS = catalog([
  {
    id: "interim_budget_framework",
    label: "Interim budget framework",
    shortDescription: "Baseline fiscal framework for the opening year.",
  },
  {
    id: "raise_minimum_wage",
    label: "Minimum wage schedule",
    shortDescription: "Staged national minimum wage increases.",
  },
  {
    id: "universal_primary_care",
    label: "Universal primary care",
    shortDescription: "Phase toward universal primary-care coverage.",
  },
  {
    id: "clean_power_standard",
    label: "Clean power standard",
    shortDescription: "Electricity decarbonization with firm dates.",
  },
  {
    id: "upzone_transit",
    label: "Transit corridor housing",
    shortDescription: "Upzone near transit to unlock housing supply.",
  },
  {
    id: "progressive_brackets",
    label: "Progressive income tax",
    shortDescription: "Restore progressivity in upper brackets.",
  },
  {
    id: "sectoral_bargaining",
    label: "Sectoral bargaining",
    shortDescription: "Enable sectoral collective bargaining frameworks.",
  },
  {
    id: "nature_restoration",
    label: "Nature restoration",
    shortDescription: "Large-scale restoration and flood buffers.",
  },
] as const);

export function optionIds(list: readonly OptionMeta[]): string[] {
  return list.map((o) => o.id);
}

export function isOptionId(list: readonly OptionMeta[], id: string): boolean {
  return list.some((o) => o.id === id);
}

export function labelForOption(list: readonly OptionMeta[], id: string | undefined | null): string {
  if (!id) return "";
  return list.find((o) => o.id === id)?.label ?? id;
}
