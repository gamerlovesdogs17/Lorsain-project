/**
 * partyOrg/catalog.ts
 *
 * Static catalogs for party priorities, campaign strategies, platform planks,
 * and support-allocation buckets. UI and command layers share these definitions.
 */

// ---------------------------------------------------------------------------
// Party priorities
// ---------------------------------------------------------------------------

export type PartyPriorityKind = "policy" | "electoral" | "organizational" | "institutional";

export type PartyPriorityDef = {
  id: string;
  kind: PartyPriorityKind;
  label: string;
  description: string;
  effectsHint: string;
  issueId?: string;
};

export const PARTY_PRIORITY_CATALOG: Record<string, PartyPriorityDef> = {
  housing_affordability: {
    id: "housing_affordability",
    kind: "policy",
    label: "Housing affordability",
    description: "Expand supply and curb rents through zoning reform and targeted subsidies.",
    effectsHint: "Raises housing salience; modest urban turnout lift.",
    issueId: "housing",
  },
  labor_standards: {
    id: "labor_standards",
    kind: "policy",
    label: "Labor standards",
    description: "Strengthen wage floors, bargaining rights, and workplace enforcement.",
    effectsHint: "Mobilizes union-leaning blocs; business pushback risk.",
    issueId: "labor",
  },
  tax_fairness: {
    id: "tax_fairness",
    kind: "policy",
    label: "Tax fairness",
    description: "Rebalance the tax code toward progressive revenue and anti-avoidance.",
    effectsHint: "Polarizing; funds other agenda items if enacted.",
    issueId: "taxes",
  },
  healthcare_access: {
    id: "healthcare_access",
    kind: "policy",
    label: "Healthcare access",
    description: "Widen coverage and reduce out-of-pocket costs under social-policy framing.",
    effectsHint: "Broad popular appeal; fiscal cost salience.",
    issueId: "social_policy",
  },
  green_transition: {
    id: "green_transition",
    kind: "policy",
    label: "Green transition",
    description: "Accelerate clean energy, efficiency standards, and just-transition supports.",
    effectsHint: "Youth/urban boost; fossil-region risk.",
    issueId: "environment",
  },
  growth_and_jobs: {
    id: "growth_and_jobs",
    kind: "policy",
    label: "Growth and jobs",
    description: "Prioritize investment, skills, and industrial policy for employment.",
    effectsHint: "Broad electoral frame; competes with fiscal hawks.",
    issueId: "economy",
  },
  institutional_renewal: {
    id: "institutional_renewal",
    kind: "institutional",
    label: "Institutional renewal",
    description: "Modernize ethics, transparency, and legislative procedure.",
    effectsHint: "Anti-corruption brand; elite resistance.",
    issueId: "institutional_reform",
  },
  foreign_credibility: {
    id: "foreign_credibility",
    kind: "policy",
    label: "Foreign credibility",
    description: "Stabilize alliances and trade posture with coherent diplomacy.",
    effectsHint: "Signals competence; low domestic intensity unless crisis.",
    issueId: "foreign_policy",
  },
  base_mobilization: {
    id: "base_mobilization",
    kind: "electoral",
    label: "Base mobilization",
    description: "Concentrate field and messaging on core identifiers and safe seats.",
    effectsHint: "Turnout lift among loyalists; softer swing reach.",
  },
  swing_persuasion: {
    id: "swing_persuasion",
    kind: "electoral",
    label: "Swing persuasion",
    description: "Target undecided and soft partisans with moderated messaging.",
    effectsHint: "Improves competitiveness; base impatience risk.",
  },
  candidate_recruitment: {
    id: "candidate_recruitment",
    kind: "electoral",
    label: "Candidate recruitment",
    description: "Build a deeper bench for assembly, gubernatorial, and list seats.",
    effectsHint: "Medium-term seat gains; short-term org cost.",
  },
  message_discipline: {
    id: "message_discipline",
    kind: "electoral",
    label: "Message discipline",
    description: "Tighten spokespeople and surrogates around a shared frame.",
    effectsHint: "Reduces gaffes; can mute factional voices.",
  },
  membership_growth: {
    id: "membership_growth",
    kind: "organizational",
    label: "Membership growth",
    description: "Expand dues-paying membership and local branch capacity.",
    effectsHint: "Long-run organizational strength; slow payoff.",
  },
  field_infrastructure: {
    id: "field_infrastructure",
    kind: "organizational",
    label: "Field infrastructure",
    description: "Invest in organizers, data, and provincial coordination hubs.",
    effectsHint: "GOTV capacity; budget tradeoff vs advertising.",
  },
  faction_management: {
    id: "faction_management",
    kind: "organizational",
    label: "Faction management",
    description: "Negotiate caucus demands to keep the coalition intact.",
    effectsHint: "Stability vs clarity tradeoff.",
  },
  donor_network: {
    id: "donor_network",
    kind: "organizational",
    label: "Donor network",
    description: "Professionalize fundraising without capturing the platform.",
    effectsHint: "Campaign cash; integrity scrutiny.",
  },
  ethics_and_compliance: {
    id: "ethics_and_compliance",
    kind: "institutional",
    label: "Ethics and compliance",
    description: "Enforce internal codes and reduce scandal exposure.",
    effectsHint: "Reputation insurance; slows improvisation.",
  },
  governing_readiness: {
    id: "governing_readiness",
    kind: "institutional",
    label: "Governing readiness",
    description: "Prepare shadow portfolios, transition plans, and policy pipelines.",
    effectsHint: "Competence signal when near power.",
  },
  provincial_fairness: {
    id: "provincial_fairness",
    kind: "institutional",
    label: "Provincial fairness",
    description: "Rebalance transfers, veto overrides, and joint programs with provinces.",
    effectsHint: "Regional caucuses watch federal–provincial bargains closely.",
    issueId: "institutional_reform",
  },
  defense_modernization: {
    id: "defense_modernization",
    kind: "policy",
    label: "Defense modernization",
    description: "Prioritize readiness, procurement discipline, and alliance burden-sharing.",
    effectsHint: "Security hawks engage; fiscal hawks watch the envelope.",
    issueId: "foreign_policy",
  },
  immigration_integration: {
    id: "immigration_integration",
    kind: "policy",
    label: "Immigration integration",
    description: "Pair border management with settlement services and labour-market pathways.",
    effectsHint: "Border provinces and urban cores react differently.",
    issueId: "social_policy",
  },
  digital_rights: {
    id: "digital_rights",
    kind: "policy",
    label: "Digital rights",
    description: "Set privacy, platform accountability, and public-sector data standards.",
    effectsHint: "Tech sector and civil-liberty blocs both mobilize.",
    issueId: "institutional_reform",
  },
  rural_connectivity: {
    id: "rural_connectivity",
    kind: "policy",
    label: "Rural connectivity",
    description: "Close broadband, transport, and service gaps outside metro corridors.",
    effectsHint: "Resource and agrarian provinces expect visible delivery.",
    issueId: "economy",
  },
  caucus_cohesion: {
    id: "caucus_cohesion",
    kind: "organizational",
    label: "Caucus cohesion",
    description: "Keep assembly blocs aligned on votes, leadership contests, and messaging.",
    effectsHint: "Reduces floor defections; can frustrate regional rebels.",
  },
};

export function listPartyPriorities(): PartyPriorityDef[] {
  return Object.values(PARTY_PRIORITY_CATALOG);
}

export function getPartyPriority(id: string): PartyPriorityDef | undefined {
  return PARTY_PRIORITY_CATALOG[id];
}

/** Keep at most 5 unique catalog ids, preserving first-seen order. */
export function normalizePartyPriorities(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !PARTY_PRIORITY_CATALOG[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 5) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Campaign strategies
// ---------------------------------------------------------------------------

export type CampaignStrategyDef = {
  id: string;
  label: string;
  explanation: string;
  strengths: string;
  tradeoffs: string;
};

export const CAMPAIGN_STRATEGY_CATALOG: Record<string, CampaignStrategyDef> = {
  persuasion: {
    id: "persuasion",
    label: "Persuasion",
    explanation: "Win soft partisans and undecideds with issue framing and surrogate outreach.",
    strengths: "Expands the coalition beyond the base.",
    tradeoffs: "Can dilute activist energy and clear contrasts.",
  },
  base_turnout: {
    id: "base_turnout",
    label: "Base turnout",
    explanation: "Maximize identification and GOTV among core supporters.",
    strengths: "Efficient in polarized contests with high ceiling.",
    tradeoffs: "Weak against strong swing or third-party leakage.",
  },
  attack: {
    id: "attack",
    label: "Attack",
    explanation: "Define opponents early with contrast ads and scrutiny.",
    strengths: "Raises rival negatives and consolidates skeptics.",
    tradeoffs: "Backlash and fatigue if overused.",
  },
  coalition_focus: {
    id: "coalition_focus",
    label: "Coalition focus",
    explanation: "Align messaging and endorsements with partner parties and blocs.",
    strengths: "Improves post-election bargaining and ticket discipline.",
    tradeoffs: "Blurred brand; partner vetoes on planks.",
  },
  governance_record: {
    id: "governance_record",
    label: "Governance record",
    explanation: "Campaign on delivery, competence, and administrative results.",
    strengths: "Rewards incumbency and steady stewardship.",
    tradeoffs: "Vulnerable if delivery lags or scandals dominate.",
  },
  issue_ownership: {
    id: "issue_ownership",
    label: "Issue ownership",
    explanation:
      "Own one salient policy file and repeat it until voters associate you with results.",
    strengths: "Clear contrast when the issue dominates the cycle.",
    tradeoffs: "Vulnerable if the issue fades or delivery underwhelms.",
  },
  regional_ticket: {
    id: "regional_ticket",
    label: "Regional ticket",
    explanation: "Elevate provincial champions and tailor messaging by region.",
    strengths: "Improves gubernatorial and list coordination.",
    tradeoffs: "National brand can fragment across provinces.",
  },
};

export const CAMPAIGN_STRATEGY_IDS = Object.keys(CAMPAIGN_STRATEGY_CATALOG) as Array<
  keyof typeof CAMPAIGN_STRATEGY_CATALOG
>;

export function getCampaignStrategy(id: string): CampaignStrategyDef | undefined {
  return CAMPAIGN_STRATEGY_CATALOG[id];
}

// ---------------------------------------------------------------------------
// Platform planks / issue emphasis
// ---------------------------------------------------------------------------

export const ISSUE_EMPHASIS_LEVELS = ["high", "medium", "low"] as const;
export type IssueEmphasisLevel = (typeof ISSUE_EMPHASIS_LEVELS)[number];

export type PlatformPolicyOption = { id: string; label: string };

export const PLATFORM_POLICY_OPTIONS: Record<string, PlatformPolicyOption[]> = {
  labor: [
    { id: "raise_minimum_wage", label: "Raise the national minimum wage on a staged schedule" },
    { id: "sectoral_bargaining", label: "Enable sectoral collective bargaining frameworks" },
    { id: "gig_worker_protections", label: "Extend basic protections to platform and gig workers" },
    { id: "apprenticeship_expansion", label: "Expand apprenticeships with employer co-funding" },
  ],
  housing: [
    { id: "upzone_transit", label: "Upzone near transit corridors to unlock housing supply" },
    { id: "social_housing_build", label: "Fund a multi-year social and affordable housing build" },
    { id: "rent_stabilization", label: "Adopt targeted rent stabilization in tight markets" },
    { id: "first_time_buyer_aid", label: "Expand first-time buyer assistance with means tests" },
  ],
  taxes: [
    { id: "progressive_brackets", label: "Restore progressivity in upper income brackets" },
    { id: "corporate_base_broaden", label: "Broaden the corporate tax base and close shelters" },
    { id: "property_tax_relief", label: "Relieve property taxes for primary residences" },
    { id: "carbon_dividend", label: "Pair carbon pricing with household dividends" },
  ],
  social_policy: [
    { id: "universal_primary_care", label: "Phase toward universal primary-care coverage" },
    { id: "prescription_caps", label: "Cap out-of-pocket costs for essential medicines" },
    { id: "childcare_slots", label: "Expand publicly supported childcare slots" },
    { id: "mental_health_access", label: "Integrate mental-health services into basic coverage" },
  ],
  environment: [
    { id: "clean_power_standard", label: "Adopt a clean power standard with firm dates" },
    { id: "industrial_decarb", label: "Support industrial decarbonization with conditional aid" },
    { id: "nature_restoration", label: "Fund large-scale nature restoration and flood buffers" },
    { id: "just_transition_fund", label: "Create a just-transition fund for affected regions" },
  ],
  economy: [
    { id: "strategic_investment", label: "Direct strategic investment into productivity sectors" },
    { id: "sme_credit", label: "Expand patient credit facilities for SMEs" },
    { id: "skills_compact", label: "Negotiate a national skills compact with employers" },
    {
      id: "competition_enforcement",
      label: "Tighten competition enforcement in concentrated markets",
    },
  ],
  institutional_reform: [
    { id: "lobbying_transparency", label: "Mandate real-time lobbying and gift disclosure" },
    { id: "ethics_commission", label: "Strengthen an independent ethics commission" },
    { id: "legislative_calendar", label: "Reform the legislative calendar for open debate" },
    { id: "procurement_integrity", label: "Harden procurement integrity and audit trails" },
  ],
  foreign_policy: [
    { id: "alliance_deepening", label: "Deepen alliance consultation and joint exercises" },
    { id: "trade_diversification", label: "Diversify trade partners and supply resilience" },
    {
      id: "development_partnerships",
      label: "Expand development partnerships in priority regions",
    },
    { id: "arms_export_scrutiny", label: "Tighten human-rights scrutiny on arms exports" },
  ],
  immigration: [
    { id: "skills_linked_visas", label: "Expand skills-linked visas with employer accountability" },
    { id: "humanitarian_quota", label: "Raise humanitarian intake with settlement guarantees" },
    { id: "border_digital_system", label: "Modernize border processing with privacy safeguards" },
    { id: "provincial_settlement_pacts", label: "Let provinces opt into settlement compacts" },
  ],
  defense: [
    { id: "readiness_rotation", label: "Fund readiness rotations and maintenance backlogs" },
    {
      id: "domestic_supply_chain",
      label: "Require domestic content in critical defense procurement",
    },
    { id: "cyber_reservists", label: "Stand up cyber reservist units under civilian oversight" },
    { id: "alliance_hosting_limits", label: "Cap foreign basing without assembly consultation" },
  ],
};

// ---------------------------------------------------------------------------
// Organization lobbying / issue campaign frames (sim summaries + media hooks)
// ---------------------------------------------------------------------------

export type OrgLobbyAmendmentPreference =
  "weaken_enforcement" | "delay_implementation" | "expand_scope" | "sunset_clause";

export type OrgLobbyCampaignTemplate = {
  id: string;
  /** Match when org.type includes any token (case-insensitive substring). */
  orgTypeTokens: string[];
  issueIds: string[];
  stance: "support" | "oppose";
  summary: string;
  /** Extra bill-pressure strength when this template matches (archetype leverage). */
  billPressureBonus?: number;
  /** Preferred amendment frame surfaced to legislature/org pressure metadata. */
  preferAmendment?: OrgLobbyAmendmentPreference;
  /** When set, only matches bills carrying one of these provision families. */
  provisionIdPrefixes?: string[];
};

export const ORG_LOBBY_CAMPAIGN_TEMPLATES: OrgLobbyCampaignTemplate[] = [
  {
    id: "union_floor_whip",
    orgTypeTokens: ["union", "labour", "labor"],
    issueIds: ["ISS_LABOR", "ISS_WELFARE"],
    stance: "support",
    summary: "{org} launches a shop-floor pressure campaign backing {target} on {issue}",
    billPressureBonus: 0.14,
    preferAmendment: "expand_scope",
    provisionIdPrefixes: ["PROV_UNION", "PROV_STRIKE", "PROV_TEMP_WORKER"],
  },
  {
    id: "business_regulatory_blitz",
    orgTypeTokens: ["business", "chamber", "industry"],
    issueIds: ["ISS_TRADE", "ISS_CLIMATE"],
    stance: "oppose",
    summary: "{org} funds a regulatory impact blitz targeting {target} over {issue}",
    billPressureBonus: 0.1,
    preferAmendment: "weaken_enforcement",
  },
  {
    id: "business_labor_compliance_push",
    orgTypeTokens: ["business", "chamber", "industry", "manufactur"],
    issueIds: ["ISS_LABOR"],
    stance: "oppose",
    summary: "{org} demands compliance carve-outs from {target} on {issue}",
    billPressureBonus: 0.16,
    preferAmendment: "weaken_enforcement",
    provisionIdPrefixes: ["PROV_UNION", "PROV_STRIKE", "PROV_TEMP_WORKER"],
  },
  {
    id: "environment_coalition_drive",
    orgTypeTokens: ["environment", "green", "conservation"],
    issueIds: ["ISS_CLIMATE", "ISS_LIBERTY"],
    stance: "support",
    summary: "{org} coordinates member groups to elevate {target} on {issue}",
    billPressureBonus: 0.11,
    preferAmendment: "expand_scope",
  },
  {
    id: "veterans_benefits_push",
    orgTypeTokens: ["veteran", "defence", "defense"],
    issueIds: ["ISS_DEFENSE", "ISS_WELFARE"],
    stance: "support",
    summary: "{org} presses {target} to honour defence-benefit commitments on {issue}",
  },
  {
    id: "civil_liberty_watch",
    orgTypeTokens: ["civil", "liberty", "rights"],
    issueIds: ["ISS_LIBERTY", "ISS_POLICING", "ISS_REFORM"],
    stance: "oppose",
    summary: "{org} opens a civil-liberties watch on {target}'s {issue} record",
    billPressureBonus: 0.13,
    preferAmendment: "sunset_clause",
    provisionIdPrefixes: ["PROV_SURVEILLANCE", "PROV_CROSS_BORDER_DATA", "PROV_BODY_CAMERA"],
  },
  {
    id: "municipal_league_lobby",
    orgTypeTokens: ["municipal", "local", "city"],
    issueIds: ["ISS_HOUSING", "ISS_REFORM"],
    stance: "support",
    summary: "{org} lobbies {target} for municipal fiscal room on {issue}",
  },
  {
    id: "farm_coop_price_floor",
    orgTypeTokens: ["farm", "agricult", "rural"],
    issueIds: ["ISS_TRADE", "ISS_OWNERSHIP"],
    stance: "support",
    summary: "{org} mobilizes producers to back {target}'s {issue} stance in the assembly",
    billPressureBonus: 0.12,
    preferAmendment: "delay_implementation",
    provisionIdPrefixes: ["PROV_FARM", "PROV_STRATEGIC_TARIFFS"],
  },
  {
    id: "tech_platform_audit_lobby",
    orgTypeTokens: ["tech", "digital", "software"],
    issueIds: ["ISS_LIBERTY", "ISS_REFORM"],
    stance: "oppose",
    summary: "{org} warns {target} that {issue} rules will chill domestic innovation",
    billPressureBonus: 0.15,
    preferAmendment: "weaken_enforcement",
    provisionIdPrefixes: ["PROV_ALGORITHM", "PROV_CROSS_BORDER_DATA"],
  },
  {
    id: "health_professional_alert",
    orgTypeTokens: ["health", "medical", "nurse"],
    issueIds: ["ISS_WELFARE", "ISS_DECENT"],
    stance: "oppose",
    summary: "{org} issues a professional alert opposing {target} on {issue}",
  },
];

export function matchOrgLobbyCampaignTemplate(
  orgType: string,
  issueId: string,
  stance: "support" | "oppose",
  provisionIds?: string[],
): OrgLobbyCampaignTemplate | undefined {
  const typeLower = orgType.toLowerCase();
  const provisions = provisionIds ?? [];
  const matches = ORG_LOBBY_CAMPAIGN_TEMPLATES.filter(
    (t) =>
      t.stance === stance &&
      t.issueIds.includes(issueId) &&
      t.orgTypeTokens.some((token) => typeLower.includes(token)) &&
      (!t.provisionIdPrefixes ||
        t.provisionIdPrefixes.length === 0 ||
        provisions.some((pid) => t.provisionIdPrefixes!.some((prefix) => pid.startsWith(prefix)))),
  );
  if (matches.length === 0) {
    return ORG_LOBBY_CAMPAIGN_TEMPLATES.find(
      (t) =>
        t.stance === stance &&
        t.issueIds.includes(issueId) &&
        t.orgTypeTokens.some((token) => typeLower.includes(token)) &&
        !t.provisionIdPrefixes?.length,
    );
  }
  return matches.sort(
    (a, b) => (b.billPressureBonus ?? 0) - (a.billPressureBonus ?? 0) || a.id.localeCompare(b.id),
  )[0];
}

export function formatOrgLobbyCampaignSummary(
  template: OrgLobbyCampaignTemplate,
  orgName: string,
  targetPoliticianId: string,
  issueId: string,
): string {
  return template.summary
    .replace(/\{org\}/g, orgName)
    .replace(/\{target\}/g, targetPoliticianId)
    .replace(/\{issue\}/g, issueId);
}

// ---------------------------------------------------------------------------
// Caucus pressure scenes (public whip / agenda friction — narrative only)
// ---------------------------------------------------------------------------

export type CaucusPressureTemplate = {
  id: string;
  title: string;
  description: string;
  /** Requires at least one priority bill on leadership agenda. */
  requiresPriorityBill: boolean;
};

export const CAUCUS_PRESSURE_TEMPLATES: CaucusPressureTemplate[] = [
  {
    id: "whip_count_leak",
    title: "Whip count leaks to the press",
    description: "A partial caucus headcount circulates before a scheduled vote.",
    requiresPriorityBill: true,
  },
  {
    id: "regional_holdout",
    title: "Regional bloc threatens to withhold votes",
    description: "Provincial members demand concessions on a priority bill.",
    requiresPriorityBill: true,
  },
  {
    id: "leadership_unity_push",
    title: "Leadership demands unity on a flagship bill",
    description: "Floor leader schedules a closed-door alignment session.",
    requiresPriorityBill: true,
  },
  {
    id: "platform_red_line",
    title: "Platform committee draws a red line",
    description: "Policy staff warn that amendments would breach the party platform.",
    requiresPriorityBill: true,
  },
  {
    id: "coalition_partner_ultimatum",
    title: "Coalition partner issues an ultimatum",
    description: "A partner party ties support to caucus discipline on one file.",
    requiresPriorityBill: false,
  },
  {
    id: "backbench_petition",
    title: "Backbench petition circulates",
    description: "Dissident members collect signatures to force a caucus debate.",
    requiresPriorityBill: false,
  },
];

// ---------------------------------------------------------------------------
// Support allocation buckets
// ---------------------------------------------------------------------------

export const ALLOCATION_BUCKETS = {
  presidential: { id: "presidential", label: "Presidential / national ticket" },
  assembly: { id: "assembly", label: "Assembly contests" },
  gubernatorial: { id: "gubernatorial", label: "Gubernatorial contests" },
  field_organization: { id: "field_organization", label: "Field organization" },
  party_infrastructure: { id: "party_infrastructure", label: "Party infrastructure" },
} as const;

export type AllocationBucketId = keyof typeof ALLOCATION_BUCKETS;

const ALLOCATION_BUCKET_IDS = Object.keys(ALLOCATION_BUCKETS) as AllocationBucketId[];

/**
 * Renormalize known allocation buckets so their non-negative values sum to ~1.
 * Unknown keys are preserved unchanged. If all known buckets are zero/empty,
 * spreads equal shares across known buckets that were present in the input
 * (or all buckets if none were present).
 */
export function normalizeSupportAllocations(alloc: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...alloc };
  const knownPresent = ALLOCATION_BUCKET_IDS.filter((id) => id in alloc);
  const targets = knownPresent.length > 0 ? knownPresent : ALLOCATION_BUCKET_IDS;

  let sum = 0;
  for (const id of targets) {
    const raw = Number(alloc[id] ?? 0);
    const v = Number.isFinite(raw) && raw > 0 ? raw : 0;
    out[id] = v;
    sum += v;
  }

  if (sum <= 0) {
    const share = 1 / targets.length;
    for (const id of targets) out[id] = share;
    return out;
  }

  for (const id of targets) {
    out[id] = (out[id] ?? 0) / sum;
  }
  return out;
}
