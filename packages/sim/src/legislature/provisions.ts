import type { SimState } from "../types.js";
import { policyIndexDelta } from "../economy/policy.js";
import type { NationalEconomyIndices } from "../economy/types.js";
import type { PolicyItem, ProvisionEnactmentRecord } from "./types.js";
import type { IdeologyAxis } from "../agents/types.js";
import type { IsoDate } from "../calendar.js";

export type LegislativeProvisionOption = {
  id: string;
  label: string;
  change: string;
  billTitle: string;
  /**
   * Legacy scalar used only as a fallback AI distance hint when dimensionEffects
   * are absent. Prefer multi-axis dimensionEffects for new options.
   */
  direction: number;
  magnitude: number;
  fiscalImpact: number | null;
  /** Founding / baseline legal state — never a bill proposal by itself. */
  founding: boolean;
  affectedGroups: readonly string[];
  dimensionEffects?: Partial<Record<IdeologyAxis, number>>;
  /** Discrete parameter for numeric/threshold-style controls. */
  parameterValue?: number;
  controlHint?: "categorical" | "numeric" | "binary" | "threshold" | "percentage" | "duration";
};

export type LegislativeProvisionDefinition = {
  id: string;
  issueId: string;
  category: string;
  currentLawLabel: string;
  options: readonly LegislativeProvisionOption[];
};

const ISSUE_GROUPS: Record<string, readonly string[]> = {
  ISS_LABOR: ["Workers", "Employers", "Trade unions"],
  ISS_WELFARE: ["Households", "Public services", "Taxpayers"],
  ISS_OWNERSHIP: ["Consumers", "Public operators", "Private firms"],
  ISS_TRADE: ["Producers", "Importers", "Consumers"],
  ISS_HOUSING: ["Renters", "Homeowners", "Local governments"],
  ISS_CLIMATE: ["Energy users", "Industry", "Communities"],
  ISS_LIBERTY: ["Individuals", "Courts", "Public authorities"],
  ISS_IMMIGRATION: ["Migrants", "Employers", "Local services"],
  ISS_POLICING: ["Communities", "Police", "Courts"],
  ISS_DECENT: ["Provinces", "Municipalities", "National government"],
  ISS_EXEC: ["Executive", "Assembly", "Public"],
  ISS_REFORM: ["Voters", "Candidates", "Election authorities"],
  ISS_DEFENSE: ["Armed forces", "Industry", "Taxpayers"],
};

function groupsForIssue(issueId: string): readonly string[] {
  return ISSUE_GROUPS[issueId] ?? ["Households", "Public services", "Taxpayers"];
}

function variableProvision(
  id: string,
  issueId: string,
  category: string,
  currentLawLabel: string,
  options: readonly LegislativeProvisionOption[],
): LegislativeProvisionDefinition {
  if (options.length < 2 || options.filter((option) => option.founding).length !== 1) {
    throw new Error(
      `${id} must define at least two alternatives and exactly one founding baseline option`,
    );
  }
  return { id, issueId, category, currentLawLabel, options };
}

function option(
  id: string,
  label: string,
  change: string,
  billTitle: string,
  args: {
    direction: number;
    magnitude?: number;
    fiscalImpact?: number | null;
    founding?: boolean;
    affectedGroups?: readonly string[];
    dimensionEffects?: Partial<Record<IdeologyAxis, number>>;
    parameterValue?: number;
    controlHint?: "categorical" | "numeric" | "binary" | "threshold" | "percentage" | "duration";
  },
): LegislativeProvisionOption {
  return {
    id,
    label,
    change,
    billTitle,
    direction: Math.max(-1, Math.min(1, args.direction)),
    magnitude: args.magnitude ?? 0.65,
    fiscalImpact: args.fiscalImpact ?? null,
    founding: args.founding === true,
    affectedGroups: args.affectedGroups ?? [],
    ...(args.dimensionEffects ? { dimensionEffects: args.dimensionEffects } : {}),
    ...(args.parameterValue != null ? { parameterValue: args.parameterValue } : {}),
    ...(args.controlHint ? { controlHint: args.controlHint } : {}),
  };
}

/** Concrete, public legislative choices. Ideological issues remain evaluation dimensions, not bill text. */
export const LEGISLATIVE_PROVISIONS: readonly LegislativeProvisionDefinition[] = [
  variableProvision(
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
        "founding_workplace_bargaining",
        "Workplace bargaining with voluntary sector agreements",
        "Leaves existing workplace and voluntary sector agreements in force.",
        "Collective Bargaining Code",
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
  ),
  variableProvision(
    "PROV_CHILD_BENEFIT",
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
        "founding_income_tested_benefit",
        "Income-tested benefit for low- and middle-income households",
        "Retains the present income-tested child benefit.",
        "Family Support Code",
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
  ),
  variableProvision(
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
        "founding_mixed_rail",
        "Mixed public infrastructure and private train operations",
        "Retains public infrastructure and private train operations.",
        "Rail Operations Code",
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
  ),
  variableProvision(
    "PROV_STRATEGIC_TARIFFS",
    "ISS_TRADE",
    "Strategic import safeguards",
    "Cabinet may impose temporary safeguards after an injury finding",
    [
      option(
        "end_safeguard_power",
        "End safeguard power",
        "Repeals the temporary safeguard process for industrial imports.",
        "Open Markets Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: -0.08,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          dimensionEffects: { economic: -0.7, globalism: 0.45 },
        },
      ),
      option(
        "injury_only_safeguards",
        "Injury-only temporary safeguards",
        "Allows temporary duties only after a published injury finding and with a two-year sunset.",
        "Injury Safeguards Bill",
        {
          direction: -0.35,
          magnitude: 0.45,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          dimensionEffects: { economic: -0.25, globalism: 0.15 },
        },
      ),
      option(
        "founding_injury_safeguards",
        "Cabinet may impose temporary safeguards after an injury finding",
        "Retains temporary safeguards after an independent injury finding.",
        "Trade Safeguards Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          dimensionEffects: { economic: 0.05 },
        },
      ),
      option(
        "strategic_list_safeguards",
        "Strategic industry list safeguards",
        "Authorizes safeguards for a published strategic-industry list without waiting for severe injury.",
        "Strategic List Safeguards Bill",
        {
          direction: 0.55,
          magnitude: 0.58,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          dimensionEffects: { economic: 0.35, authority: 0.25, globalism: -0.3 },
        },
      ),
      option(
        "broaden_safeguards",
        "Broaden safeguards",
        "Allows safeguards for designated strategic industries before severe injury occurs.",
        "Strategic Industries Safeguards Bill",
        {
          direction: 1,
          magnitude: 0.7,
          fiscalImpact: 0.12,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          dimensionEffects: { economic: 0.55, authority: 0.35, globalism: -0.45 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_HOUSING_APPROVALS",
    "ISS_HOUSING",
    "Housing approval rules",
    "Provinces set approval rules within national safety law",
    [
      option(
        "province_discretion",
        "Province discretion",
        "Removes national housing-supply deadlines and leaves approvals to provinces.",
        "Provincial Planning Freedom Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.05,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          dimensionEffects: { economic: -0.2, authority: -0.45 },
        },
      ),
      option(
        "provincial_targets",
        "Provincial housing targets without deadlines",
        "Sets provincial housing-output targets but leaves approval timing to local law.",
        "Housing Targets Bill",
        {
          direction: -0.35,
          magnitude: 0.4,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          dimensionEffects: { economic: 0.15, authority: -0.15 },
        },
      ),
      option(
        "founding_provincial_approvals",
        "Provinces set approval rules within national safety law",
        "Retains provincial approvals under national safety law.",
        "Planning Administration Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          dimensionEffects: { economic: 0.05 },
        },
      ),
      option(
        "supply_deadlines",
        "Supply deadlines",
        "Requires large cities to decide qualifying housing applications within fixed deadlines.",
        "Housing Approvals and Supply Bill",
        {
          direction: 0.55,
          magnitude: 0.74,
          fiscalImpact: 0.16,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          dimensionEffects: { economic: 0.45, authority: 0.35 },
        },
      ),
      option(
        "national_zoning_override",
        "National zoning override for transit corridors",
        "Lets the national housing office approve transit-corridor projects that stall under provincial rules.",
        "Transit Corridor Housing Bill",
        {
          direction: 1,
          magnitude: 0.82,
          fiscalImpact: 0.22,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          dimensionEffects: { economic: 0.55, authority: 0.6 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_CLEAN_POWER",
    "ISS_CLIMATE",
    "Electricity clean-power standard",
    "Utilities follow a gradual national clean-power schedule",
    [
      option(
        "reliability_deferral",
        "Reliability deferral",
        "Suspends the next clean-power requirement for four years while prioritizing grid reliability investments.",
        "Energy Reliability Deferral Bill",
        {
          direction: -1,
          magnitude: 0.6,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          dimensionEffects: { economic: -0.25, social: -0.35 },
        },
      ),
      option(
        "technology_neutral_standard",
        "Technology-neutral low-carbon standard",
        "Counts nuclear, hydro, and carbon capture toward the national clean-power schedule.",
        "Technology-Neutral Power Bill",
        {
          direction: -0.25,
          magnitude: 0.48,
          fiscalImpact: 0.05,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          dimensionEffects: { economic: 0.1, social: 0.2 },
        },
      ),
      option(
        "founding_clean_power_schedule",
        "Utilities follow a gradual national clean-power schedule",
        "Retains the existing clean-power schedule.",
        "Clean Power Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          dimensionEffects: { social: 0.15 },
        },
      ),
      option(
        "accelerate_clean_power",
        "Accelerate clean-power schedule",
        "Advances the national clean-power targets by eight years with higher noncompliance penalties.",
        "Accelerated Clean Power Bill",
        {
          direction: 0.7,
          magnitude: 0.75,
          fiscalImpact: 0.2,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          dimensionEffects: { economic: 0.25, social: 0.55, authority: 0.3 },
        },
      ),
      option(
        "zero_carbon_grid_mandate",
        "Zero-carbon grid mandate",
        "Requires a zero-carbon electricity supply for the interconnected grid by a fixed statutory year.",
        "Zero-Carbon Grid Bill",
        {
          direction: 1,
          magnitude: 0.9,
          fiscalImpact: 0.35,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          dimensionEffects: { economic: 0.35, social: 0.75, authority: 0.45 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_REPRODUCTIVE_LAW",
    "ISS_LIBERTY",
    "Reproductive health law",
    "National law permits abortion within a statutory time limit",
    [
      option(
        "province_discretion",
        "Province discretion",
        "Allows each province to set abortion law, subject to emergency-care protections.",
        "Provincial Reproductive Law Bill",
        {
          direction: -1,
          magnitude: 0.62,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
        },
      ),
            option(
        "early_statutory_limit",
        "Early statutory limit",
        "Shortens the national time limit while preserving medical exceptions.",
        "Reproductive Health Limit Bill",
        {
          direction: -0.45,
          magnitude: 0.48,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
          controlHint: "categorical",
        },
      ),
      option(
        "extended_statutory_limit",
        "Extended statutory limit",
        "Extends the national statutory time limit with provider conscience protections.",
        "Reproductive Health Extension Bill",
        {
          direction: 0.45,
          magnitude: 0.52,
          fiscalImpact: 0.03,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_statutory_limit",
        "National law permits abortion within a statutory time limit",
        "Retains the existing national time limit and medical exceptions.",
        "Reproductive Health Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: null,
          founding: true,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
        },
      ),
      option(
        "national_protection",
        "National protection",
        "Guarantees lawful abortion access through the national statutory limit in every province.",
        "Reproductive Health Protection Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.05,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_RESIDENCY_PATH",
    "ISS_IMMIGRATION",
    "Permanent residency eligibility",
    "Five-year lawful-residence route with language and civic requirements",
    [
      option(
        "points_and_sponsorship",
        "Points and sponsorship",
        "Replaces the residence clock with a points table plus employer or family sponsorship.",
        "Skilled Residency Points Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: -0.03,
          affectedGroups: groupsForIssue("ISS_IMMIGRATION"),
        },
      ),
            option(
        "humanitarian_track",
        "Humanitarian settlement track",
        "Creates a two-year route for designated humanitarian arrivals meeting language requirements.",
        "Humanitarian Settlement Bill",
        {
          direction: 0.35,
          magnitude: 0.44,
          fiscalImpact: 0.06,
          affectedGroups: groupsForIssue("ISS_IMMIGRATION"),
          controlHint: "categorical",
        },
      ),
      option(
        "ten_year_residence",
        "Ten-year residence route",
        "Requires ten years of lawful residence before permanent residency eligibility.",
        "Extended Residency Bill",
        {
          direction: -0.35,
          magnitude: 0.5,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_IMMIGRATION"),
          parameterValue: 10,
          controlHint: "numeric",
        },
      ),
option(
        "founding_five_year_residency",
        "Five-year lawful-residence route with language and civic requirements",
        "Retains the present five-year route and civic requirements.",
        "Residency Law Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_IMMIGRATION"),
        },
      ),
      option(
        "earned_settlement_track",
        "Earned settlement track",
        "Creates a three-year settlement track for applicants meeting continuous work, language and civic tests.",
        "Earned Settlement Bill",
        {
          direction: 1,
          magnitude: 0.66,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_IMMIGRATION"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_POLICE_COMPLAINTS",
    "ISS_POLICING",
    "Police misconduct review",
    "Provincial bodies investigate complaints under national minimum standards",
    [
      option(
        "independent_review",
        "Independent review",
        "Creates an independent national inspector with power to reopen serious cases.",
        "Independent Police Review Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: 0.09,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
            option(
        "national_standards_only",
        "National standards only",
        "Sets national complaint standards but leaves investigations with provincial bodies.",
        "Police Complaint Standards Bill",
        {
          direction: -0.25,
          magnitude: 0.38,
          fiscalImpact: 0.02,
          affectedGroups: groupsForIssue("ISS_POLICING"),
          controlHint: "binary",
        },
      ),
      option(
        "civilian_review_boards",
        "Civilian review boards",
        "Requires civilian-majority review boards for serious misconduct findings.",
        "Civilian Police Review Bill",
        {
          direction: 0.35,
          magnitude: 0.55,
          fiscalImpact: 0.06,
          affectedGroups: groupsForIssue("ISS_POLICING"),
          controlHint: "binary",
        },
      ),
option(
        "founding_provincial_review",
        "Provincial bodies investigate complaints under national minimum standards",
        "Retains provincial review bodies and national minimum standards.",
        "Police Review Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
      option(
        "internal_review",
        "Internal review",
        "Returns ordinary misconduct investigations to police internal-affairs units.",
        "Police Discipline Bill",
        {
          direction: 1,
          magnitude: 0.7,
          fiscalImpact: -0.04,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_REVENUE_DISCRETION",
    "ISS_DECENT",
    "Provincial revenue authority",
    "Provinces may levy a limited property surcharge",
    [
      option(
        "national_uniformity",
        "National uniformity",
        "Repeals the provincial property surcharge and replaces it with a national transfer formula.",
        "National Revenue Uniformity Bill",
        {
          direction: -1,
          magnitude: 0.57,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_DECENT"),
        },
      ),
            option(
        "fixed_surcharge_band",
        "Fixed surcharge band",
        "Sets a narrow statutory band for the provincial property surcharge.",
        "Provincial Surcharge Band Bill",
        {
          direction: -0.25,
          magnitude: 0.4,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_DECENT"),
          parameterValue: 1.5,
          controlHint: "numeric",
        },
      ),
      option(
        "municipal_revenue_share",
        "Municipal revenue share",
        "Shares surcharge revenue with municipalities for local services.",
        "Local Revenue Sharing Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.05,
          affectedGroups: groupsForIssue("ISS_DECENT"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_limited_surcharge",
        "Provinces may levy a limited property surcharge",
        "Retains the present provincial property-surcharge authority.",
        "Provincial Revenue Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_DECENT"),
        },
      ),
      option(
        "broader_local_authority",
        "Broader local authority",
        "Allows provinces to vary the surcharge within a wider statutory band.",
        "Provincial Revenue Powers Bill",
        {
          direction: 1,
          magnitude: 0.74,
          fiscalImpact: 0.03,
          affectedGroups: groupsForIssue("ISS_DECENT"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_EMERGENCY_RENEWAL",
    "ISS_EXEC",
    "Emergency-power renewal",
    "Assembly approval is required after the initial emergency period",
    [
      option(
        "standing_oversight_panel",
        "Standing oversight panel",
        "Creates a multiparty Assembly panel that must renew emergency powers every seven days.",
        "Emergency Oversight Panel Bill",
        {
          direction: -1,
          magnitude: 0.62,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_EXEC"),
        },
      ),
            option(
        "forty_eight_hour_renewal",
        "Forty-eight-hour renewal",
        "Requires Assembly renewal every forty-eight hours during declared emergencies.",
        "Emergency Renewal Bill",
        {
          direction: -0.35,
          magnitude: 0.48,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_EXEC"),
          parameterValue: 48,
          controlHint: "numeric",
        },
      ),
      option(
        "thirty_day_initial_window",
        "Thirty-day initial window",
        "Allows a thirty-day initial emergency window before the first Assembly vote.",
        "Emergency Powers Window Bill",
        {
          direction: 0.35,
          magnitude: 0.5,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_EXEC"),
          parameterValue: 30,
          controlHint: "numeric",
        },
      ),
option(
        "founding_assembly_renewal",
        "Assembly approval is required after the initial emergency period",
        "Retains the existing Assembly renewal deadline.",
        "Emergency Powers Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: null,
          founding: true,
          affectedGroups: groupsForIssue("ISS_EXEC"),
        },
      ),
      option(
        "cabinet_continuity_window",
        "Cabinet continuity window",
        "Allows Cabinet to maintain designated emergency measures for a longer initial window before a floor vote.",
        "Emergency Continuity Window Act",
        {
          direction: 1,
          magnitude: 0.58,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_EXEC"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_DONOR_DISCLOSURE",
    "ISS_REFORM",
    "Campaign donor disclosure",
    "Large donations are published during the campaign",
    [
      option(
        "annual_disclosure",
        "Annual disclosure",
        "Moves large-donor publication to one annual filing after the election.",
        "Campaign Reporting Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_REFORM"),
        },
      ),
            option(
        "threshold_only_filing",
        "Threshold-only filing",
        "Requires disclosure only for donations above a higher statutory threshold.",
        "Campaign Threshold Bill",
        {
          direction: -0.35,
          magnitude: 0.45,
          fiscalImpact: -0.01,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          parameterValue: 5000,
          controlHint: "threshold",
        },
      ),
      option(
        "real_time_small_donor",
        "Real-time small-donor reporting",
        "Publishes small recurring donations within seventy-two hours.",
        "Small Donor Transparency Bill",
        {
          direction: 0.35,
          magnitude: 0.48,
          fiscalImpact: 0.02,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "binary",
        },
      ),
option(
        "founding_campaign_disclosure",
        "Large donations are published during the campaign",
        "Retains campaign-period publication of large donations.",
        "Campaign Disclosure Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_REFORM"),
        },
      ),
      option(
        "rapid_disclosure",
        "Rapid disclosure",
        "Requires publication of large donations within five working days.",
        "Rapid Campaign Disclosure Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_REFORM"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_CONCORD_PROCUREMENT",
    "ISS_CONCORD",
    "Concord defense procurement",
    "Lorsain may join projects after separate Cabinet approval",
    [
      option(
        "domestic_preference",
        "Domestic preference",
        "Requires a domestic-source preference for major defense procurement.",
        "Defense Procurement Preference Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.04,
          affectedGroups: groupsForIssue("ISS_CONCORD"),
          controlHint: "binary",
        },
      ),
      option(
        "founding_cabinet_review",
        "Lorsain may join projects after separate Cabinet approval",
        "Retains project-by-project participation after Cabinet review.",
        "Defense Cooperation Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_CONCORD"),
        },
      ),
      option(
        "joint_procurement",
        "Joint procurement",
        "Authorizes a standing framework for joint Concord procurement.",
        "Concord Joint Procurement Bill",
        {
          direction: 1,
          magnitude: 0.66,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_CONCORD"),
          controlHint: "binary",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_VASKARA_SANCTIONS",
    "ISS_VASKARA",
    "Vaskara sanctions authority",
    "Targeted sanctions require a published executive finding",
    [
      option(
        "officials_only_list",
        "Officials-only list",
        "Limits new sanctions to named security officials and military suppliers.",
        "Targeted Sanctions Limitation Bill",
        {
          direction: -1,
          magnitude: 0.57,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_VASKARA"),
        },
      ),
            option(
        "sectoral_trade_restrictions",
        "Sectoral trade restrictions",
        "Adds sectoral import restrictions after a published security finding.",
        "Sectoral Sanctions Bill",
        {
          direction: 0.25,
          magnitude: 0.48,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_VASKARA"),
          controlHint: "categorical",
        },
      ),
      option(
        "assembly_approval_required",
        "Assembly approval required",
        "Requires Assembly approval before new sanctions lists take effect.",
        "Sanctions Oversight Bill",
        {
          direction: -0.35,
          magnitude: 0.5,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_VASKARA"),
          controlHint: "binary",
        },
      ),
option(
        "founding_executive_finding",
        "Targeted sanctions require a published executive finding",
        "Retains targeted sanctions after a published executive finding.",
        "Sanctions Procedure Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: null,
          founding: true,
          affectedGroups: groupsForIssue("ISS_VASKARA"),
        },
      ),
      option(
        "strategic_exporter_list",
        "Strategic exporter list",
        "Adds state banks and strategic exporters to the available sanctions list.",
        "Vaskara Strategic Sanctions Bill",
        {
          direction: 1,
          magnitude: 0.7,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_VASKARA"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_READINESS_FUND",
    "ISS_DEFENSE",
    "Defense readiness appropriation",
    "Readiness funding follows the enacted annual budget",
    [
      option(
        "deferred_maintenance_freeze",
        "Deferred maintenance freeze",
        "Freezes new equipment orders and limits spending to sustainment of existing stocks for two years.",
        "Defense Sustainment Freeze Bill",
        {
          direction: -1,
          magnitude: 0.62,
          fiscalImpact: -0.16,
          affectedGroups: groupsForIssue("ISS_DEFENSE"),
        },
      ),
            option(
        "maintenance_only_budget",
        "Maintenance-only budget",
        "Limits readiness spending to depot maintenance for eighteen months.",
        "Defense Maintenance Bill",
        {
          direction: -0.35,
          magnitude: 0.45,
          fiscalImpact: -0.1,
          affectedGroups: groupsForIssue("ISS_DEFENSE"),
          controlHint: "categorical",
        },
      ),
      option(
        "rapid_reaction_brigade",
        "Rapid-reaction brigade",
        "Funds a dedicated rapid-reaction brigade and pre-positioned equipment.",
        "Rapid Reaction Forces Bill",
        {
          direction: 0.35,
          magnitude: 0.58,
          fiscalImpact: 0.16,
          affectedGroups: groupsForIssue("ISS_DEFENSE"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_annual_budget",
        "Readiness funding follows the enacted annual budget",
        "Retains the current equipment-readiness appropriation.",
        "Defense Readiness Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_DEFENSE"),
        },
      ),
      option(
        "reserves_and_stockpile_plan",
        "Reserves and stockpile plan",
        "Funds a four-year plan for maintenance, trained reserves and munitions stockpiles.",
        "Defense Stockpile and Reserves Bill",
        {
          direction: 1,
          magnitude: 0.74,
          fiscalImpact: 0.24,
          affectedGroups: groupsForIssue("ISS_DEFENSE"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_PRIMARY_CARE",
    "ISS_WELFARE",
    "Primary care coverage",
    "National insurance covers essential primary care with limited copayments",
    [
      option(
        "visit_fee_schedule",
        "Visit fee schedule",
        "Introduces a published fee schedule for routine visits while preserving hardship exemptions.",
        "Primary Care Fee Schedule Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: -0.12,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
            option(
        "means_tested_copay",
        "Means-tested copay",
        "Sets higher routine copays above an income threshold with hardship waivers.",
        "Primary Care Copay Bill",
        {
          direction: -0.35,
          magnitude: 0.45,
          fiscalImpact: -0.08,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 25,
          controlHint: "numeric",
        },
      ),
      option(
        "zero_copay_rural",
        "Zero copay in rural clinics",
        "Removes routine copays at designated rural primary-care clinics.",
        "Rural Primary Care Bill",
        {
          direction: 0.35,
          magnitude: 0.5,
          fiscalImpact: 0.1,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "binary",
        },
      ),
option(
        "founding_limited_copayments",
        "National insurance covers essential primary care with limited copayments",
        "Retains existing primary-care benefits and copayments.",
        "Primary Care Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
      option(
        "capitation_and_clinics",
        "Capitation and clinics",
        "Pays clinics by enrolled patients and removes routine visit fees, with rural clinic grants.",
        "Primary Care Capitation Bill",
        {
          direction: 1,
          magnitude: 0.58,
          fiscalImpact: 0.24,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_TUITION_SUPPORT",
    "ISS_WELFARE",
    "Public university tuition",
    "Students pay capped tuition with income-tested grants",
    [
      option(
        "higher_tuition_cap",
        "Higher tuition cap",
        "Raises the tuition cap and narrows income-tested grants.",
        "University Finance Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.15,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
            option(
        "income_contingent_loans",
        "Income-contingent loans",
        "Replaces upfront tuition with income-contingent repayment after graduation.",
        "Income Contingent Tuition Bill",
        {
          direction: -0.25,
          magnitude: 0.42,
          fiscalImpact: -0.08,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "categorical",
        },
      ),
      option(
        "means_tested_stipend",
        "Means-tested living stipend",
        "Adds a living stipend for low-income undergraduates at public universities.",
        "Student Stipend Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.14,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "threshold",
        },
      ),
option(
        "founding_capped_tuition",
        "Students pay capped tuition with income-tested grants",
        "Retains the current tuition cap and grant rules.",
        "Higher Education Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
      option(
        "tuition_free_first_degree",
        "Tuition-free first degree",
        "Funds a tuition-free first undergraduate degree at public universities.",
        "Public University Access Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.28,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_INCOME_TAX",
    "ISS_WELFARE",
    "Top income-tax rate",
    "A progressive national schedule with a 37% top marginal rate",
    [
      option(
        "top_rate_30",
        "30% top marginal rate",
        "Lowers the top marginal rate to thirty percent while closing major deductions.",
        "Income Tax Base Broadening Bill",
        {
          direction: -0.75,
          magnitude: 0.6,
          fiscalImpact: -0.22,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 30,
          controlHint: "numeric",
        },
      ),
      option(
        "broader_base_lower_top",
        "33% top marginal rate",
        "Sets a thirty-three percent top rate with a broader income base.",
        "Income Tax Schedule Bill",
        {
          direction: -0.35,
          magnitude: 0.48,
          fiscalImpact: -0.12,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 33,
          controlHint: "numeric",
        },
      ),
      option(
        "founding_progressive_schedule",
        "37% top marginal rate",
        "Retains the current progressive schedule with a thirty-seven percent top rate.",
        "Income Tax Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 37,
          controlHint: "numeric",
        },
      ),
      option(
        "millionaire_surtax",
        "42% top marginal rate",
        "Raises the top marginal rate to forty-two percent on the highest income band.",
        "High Income Surtax Bill",
        {
          direction: 0.55,
          magnitude: 0.62,
          fiscalImpact: 0.16,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 42,
          controlHint: "numeric",
        },
      ),
      option(
        "top_rate_45",
        "45% top marginal rate",
        "Sets a forty-five percent top rate and publishes quarterly revenue estimates.",
        "Progressive Income Tax Bill",
        {
          direction: 0.85,
          magnitude: 0.7,
          fiscalImpact: 0.22,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 45,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_UNEMPLOYMENT_INSURANCE",
    "ISS_WELFARE",
    "Unemployment insurance duration",
    "Benefits are earnings-related for twelve insured weeks",
    [
      option(
        "eight_week_benefits",
        "Eight-week insured period",
        "Shortens the standard insured benefit period to eight weeks.",
        "Employment Insurance Targeting Bill",
        {
          direction: -0.55,
          magnitude: 0.58,
          fiscalImpact: -0.14,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 8,
          controlHint: "numeric",
        },
      ),
      option(
        "founding_twelve_week_duration",
        "Twelve-week insured period",
        "Retains twelve weeks of earnings-related insured benefits.",
        "Employment Insurance Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 12,
          controlHint: "numeric",
        },
      ),
      option(
        "eighteen_week_benefits",
        "Eighteen-week insured period",
        "Extends the insured benefit period to eighteen weeks.",
        "Employment Security Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.1,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 18,
          controlHint: "numeric",
        },
      ),
      option(
        "twenty_six_week_benefits",
        "Twenty-six-week insured period",
        "Extends insured benefits to twenty-six weeks with active job-search requirements.",
        "Extended Employment Insurance Bill",
        {
          direction: 0.55,
          magnitude: 0.62,
          fiscalImpact: 0.16,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 26,
          controlHint: "numeric",
        },
      ),
      option(
        "forty_week_benefits",
        "Forty-week downturn period",
        "Provides up to forty weeks when provincial unemployment exceeds a published threshold.",
        "Downturn Employment Security Bill",
        {
          direction: 0.85,
          magnitude: 0.72,
          fiscalImpact: 0.24,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 40,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_UNION_RECOGNITION",
    "ISS_LABOR",
    "Union recognition",
    "Recognition normally follows a supervised workplace ballot",
    [
      option(
        "voluntary_recognition",
        "Voluntary recognition",
        "Allows an employer to recognize a union without a statutory process.",
        "Voluntary Recognition Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
            option(
        "card_check_threshold",
        "Card-check threshold",
        "Requires recognition when sixty percent of workers sign union authorization cards.",
        "Card Check Recognition Bill",
        {
          direction: 0.35,
          magnitude: 0.55,
          fiscalImpact: 0.02,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          parameterValue: 60,
          controlHint: "threshold",
        },
      ),
option(
        "mandatory_ballot",
        "Mandatory ballot",
        "Retains the supervised workplace ballot for recognition.",
        "Union Recognition Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: null,
          founding: true,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
      option(
        "majority_sign_up",
        "Majority sign-up",
        "Requires recognition when a verified majority signs union cards.",
        "Majority Sign-Up Bill",
        {
          direction: 1,
          magnitude: 0.74,
          fiscalImpact: 0.03,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_STRIKE_NOTICE",
    "ISS_LABOR",
    "Strike notice",
    "Unions must give seven days' notice before protected action",
    [
      option(
        "cooling_off_and_ballot",
        "Cooling-off and ballot",
        "Requires a supervised ballot plus a fourteen-day cooling-off period before protected action.",
        "Industrial Action Procedure Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
            option(
        "fourteen_day_notice",
        "Fourteen-day notice",
        "Requires fourteen days' notice before protected industrial action.",
        "Extended Strike Notice Bill",
        {
          direction: -0.25,
          magnitude: 0.42,
          fiscalImpact: -0.01,
          affectedGroups: groupsForIssue("ISS_LABOR"),
          parameterValue: 14,
          controlHint: "numeric",
        },
      ),
option(
        "founding_seven_day_notice",
        "Unions must give seven days' notice before protected action",
        "Retains the seven-day notice requirement.",
        "Strike Notice Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
      option(
        "rolling_notice_window",
        "Rolling notice window",
        "Allows a three-day rolling notice window once a lawful ballot has authorized action for ninety days.",
        "Protected Action Flexibility Bill",
        {
          direction: 1,
          magnitude: 0.58,
          fiscalImpact: 0.03,
          affectedGroups: groupsForIssue("ISS_LABOR"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_PUBLIC_HOUSING",
    "ISS_HOUSING",
    "Public housing fund",
    "The national fund co-finances provincial social housing",
    [
      option(
        "voucher_shift",
        "Voucher shift",
        "Converts part of capital grants into portable rental vouchers for three years.",
        "Housing Voucher Priority Bill",
        {
          direction: -1,
          magnitude: 0.57,
          fiscalImpact: -0.1,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
            option(
        "capital_maintenance_only",
        "Capital maintenance only",
        "Limits new social-housing starts to maintenance of existing stock for three years.",
        "Housing Maintenance Bill",
        {
          direction: -0.25,
          magnitude: 0.4,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_provincial_cofinance",
        "The national fund co-finances provincial social housing",
        "Retains current public-housing capital grants.",
        "Public Housing Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
      option(
        "build_to_rent_program",
        "Build-to-rent program",
        "Funds a five-year provincial build-to-rent program with public equity stakes.",
        "Public Build-to-Rent Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.3,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_TRANSIT_ZONING",
    "ISS_HOUSING",
    "Transit-oriented development grants",
    "Cities may seek grants for housing near major transit",
    [
      option(
        "end_density_grants",
        "End density grants",
        "Ends national grants tied to housing density near transit stations.",
        "Local Planning Bill",
        {
          direction: -1,
          magnitude: 0.62,
          fiscalImpact: -0.04,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
            option(
        "mandatory_density_bonus",
        "Mandatory density bonus",
        "Requires cities near major transit to grant density bonuses for qualifying projects.",
        "Transit Density Bonus Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          controlHint: "binary",
        },
      ),
option(
        "founding_voluntary_transit_grants",
        "Cities may seek grants for housing near major transit",
        "Retains voluntary grants for transit-oriented housing plans.",
        "Transit Housing Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
      option(
        "priority_density_grants",
        "Priority density grants",
        "Prioritizes infrastructure grants for cities permitting more homes near transit.",
        "Transit-Oriented Housing Bill",
        {
          direction: 1,
          magnitude: 0.66,
          fiscalImpact: 0.16,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_INFRASTRUCTURE_BANK",
    "ISS_OWNERSHIP",
    "National infrastructure finance",
    "Large projects use ordinary appropriations and private lending",
    [
      option(
        "private_project_finance",
        "Private project finance",
        "Requires qualifying infrastructure projects to seek private finance first.",
        "Infrastructure Finance Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: -0.08,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
        },
      ),
            option(
        "regional_finance_pools",
        "Regional finance pools",
        "Creates regional pools co-financing transport and water with provincial matching.",
        "Regional Infrastructure Finance Bill",
        {
          direction: 0.25,
          magnitude: 0.48,
          fiscalImpact: 0.1,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_ordinary_appropriations",
        "Large projects use ordinary appropriations and private lending",
        "Retains ordinary appropriations and project lending.",
        "Infrastructure Finance Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
        },
      ),
      option(
        "public_infrastructure_bank",
        "Public infrastructure bank",
        "Creates a public bank for long-term transport, water and energy loans.",
        "National Infrastructure Bank Bill",
        {
          direction: 1,
          magnitude: 0.7,
          fiscalImpact: 0.22,
          affectedGroups: groupsForIssue("ISS_OWNERSHIP"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_FARM_STABILIZATION",
    "ISS_TRADE",
    "Farm income stabilization",
    "Emergency farm support requires a declared market disruption",
    [
      option(
        "market_insurance_only",
        "Market insurance only",
        "Replaces emergency price support with privately delivered crop insurance.",
        "Agricultural Risk Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.08,
          affectedGroups: groupsForIssue("ISS_TRADE"),
        },
      ),
            option(
        "price_floor_insurance",
        "Price-floor insurance",
        "Combines private crop insurance with a published price-floor backstop.",
        "Farm Price Insurance Bill",
        {
          direction: 0.25,
          magnitude: 0.48,
          fiscalImpact: 0.06,
          affectedGroups: groupsForIssue("ISS_TRADE"),
          controlHint: "categorical",
        },
      ),
option(
        "founding_emergency_support",
        "Emergency farm support requires a declared market disruption",
        "Retains support after a declared market disruption.",
        "Farm Support Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_TRADE"),
        },
      ),
      option(
        "stabilization_payments",
        "Stabilization payments",
        "Creates temporary payments when designated farm prices fall below a published benchmark.",
        "Farm Income Stabilization Bill",
        {
          direction: 1,
          magnitude: 0.74,
          fiscalImpact: 0.18,
          affectedGroups: groupsForIssue("ISS_TRADE"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_CARBON_PRICE",
    "ISS_CLIMATE",
    "Industrial carbon price",
    "Large emitters pay a nationally administered levy of 45 currency units per tonne",
    [
      option(
        "repeal_industrial_levy",
        "No industrial levy",
        "Repeals the carbon levy for large industrial emitters.",
        "Industrial Energy Cost Bill",
        {
          direction: -1,
          magnitude: 0.57,
          fiscalImpact: -0.1,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          parameterValue: 0,
          controlHint: "numeric",
        },
      ),
      option(
        "levy_25",
        "25 per tonne levy",
        "Sets a twenty-five currency unit levy on large industrial emitters.",
        "Moderate Carbon Levy Bill",
        {
          direction: -0.35,
          magnitude: 0.45,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          parameterValue: 25,
          controlHint: "numeric",
        },
      ),
      option(
        "founding_forty_five_levy",
        "45 per tonne levy",
        "Retains the current forty-five currency unit levy and rebate schedule.",
        "Carbon Pricing Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          parameterValue: 45,
          controlHint: "numeric",
        },
      ),
      option(
        "levy_65",
        "65 per tonne levy",
        "Raises the levy to sixty-five currency units with expanded household rebates.",
        "Carbon Levy and Rebate Bill",
        {
          direction: 0.55,
          magnitude: 0.58,
          fiscalImpact: 0.14,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          parameterValue: 65,
          controlHint: "numeric",
        },
      ),
      option(
        "levy_95",
        "95 per tonne levy",
        "Sets a ninety-five currency unit levy with industry transition grants.",
        "Accelerated Carbon Pricing Bill",
        {
          direction: 0.85,
          magnitude: 0.72,
          fiscalImpact: 0.2,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          parameterValue: 95,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_SURVEILLANCE_WARRANT",
    "ISS_LIBERTY",
    "Digital surveillance warrants",
    "Police need a judicial warrant to obtain private communications",
    [
      option(
        "emergency_access_window",
        "Emergency access window",
        "Allows temporary access before a warrant in narrowly defined emergencies.",
        "Emergency Communications Access Bill",
        {
          direction: -1,
          magnitude: 0.62,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
          controlHint: "binary",
        },
      ),
      option(
        "founding_judicial_warrant",
        "Police need a judicial warrant to obtain private communications",
        "Retains the prior judicial-warrant requirement.",
        "Communications Privacy Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: null,
          founding: true,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
        },
      ),
      option(
        "stricter_warrant_test",
        "Stricter warrant test",
        "Requires a heightened necessity finding for bulk or location surveillance.",
        "Digital Privacy Safeguards Bill",
        {
          direction: 1,
          magnitude: 0.62,
          fiscalImpact: 0.03,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
          controlHint: "binary",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_SENTENCING",
    "ISS_POLICING",
    "Serious repeat-offense sentencing",
    "Judges apply statutory ranges with stated reasons for departure",
    [
      option(
        "expanded_rehabilitation",
        "Expanded rehabilitation",
        "Expands treatment and supervised-release alternatives within statutory ranges.",
        "Sentencing Rehabilitation Bill",
        {
          direction: -1,
          magnitude: 0.67,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
      option(
        "drug_treatment_alternative",
        "Drug-treatment alternative",
        "Expands court-ordered treatment as an alternative to custody for qualifying offenses.",
        "Treatment Sentencing Bill",
        {
          direction: -0.35,
          magnitude: 0.48,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_POLICING"),
          controlHint: "categorical",
        },
      ),
      option(
        "founding_judicial_ranges",
        "Judges apply statutory ranges with stated reasons for departure",
        "Retains current sentencing ranges and reasoned departures.",
        "Sentencing Code",
        {
          direction: 0,
          magnitude: 0.06,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
      option(
        "mandatory_minimum_term",
        "Mandatory minimum term",
        "Sets a minimum custodial term for defined serious repeat offenses.",
        "Repeat Offender Sentencing Bill",
        {
          direction: 1,
          magnitude: 0.66,
          fiscalImpact: -0.06,
          affectedGroups: groupsForIssue("ISS_POLICING"),
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_ELECTION_ADMIN",
    "ISS_REFORM",
    "National election administration",
    "A national commission sets standards while provinces staff polling",
    [
      option(
        "province_run_standards",
        "Province-run standards",
        "Returns polling standards and administration to provincial election offices.",
        "Provincial Elections Administration Bill",
        {
          direction: -1,
          magnitude: 0.52,
          fiscalImpact: -0.04,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "categorical",
        },
      ),
      option(
        "sole_party_registration",
        "Single-party registration",
        "Restricts ballot registration to one nationally designated political organization.",
        "Single Party Registration Bill",
        {
          direction: 0.85,
          magnitude: 0.78,
          fiscalImpact: null,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "binary",
        },
      ),
      option(
        "founding_shared_administration",
        "National standards, provincial staffing",
        "Retains national standards with provincial staffing.",
        "Election Administration Code",
        {
          direction: 0,
          magnitude: 0.08,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "categorical",
        },
      ),
      option(
        "independent_national_service",
        "Independent national service",
        "Creates an independent national service to administer federal polling directly.",
        "Independent Elections Service Bill",
        {
          direction: 0.55,
          magnitude: 0.62,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "categorical",
        },
      ),
      option(
        "multiparty_registration_commission",
        "Multiparty registration commission",
        "Creates an independent commission registering all qualifying political parties.",
        "Multiparty Registration Bill",
        {
          direction: 0.75,
          magnitude: 0.68,
          fiscalImpact: 0.06,
          affectedGroups: groupsForIssue("ISS_REFORM"),
          controlHint: "binary",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_SCHOOL_MEALS",
    "ISS_WELFARE",
    "School meal eligibility",
    "Subsidized meals are available through an income test",
    [
      option(
        "narrow_income_test",
        "Narrow income test",
        "Limits subsidized school meals to the lowest income band.",
        "School Meals Targeting Bill",
        {
          direction: -1,
          magnitude: 0.57,
          fiscalImpact: -0.07,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "binary",
        },
      ),
      option(
        "founding_income_tested_meals",
        "Subsidized meals are available through an income test",
        "Retains current school-meal eligibility.",
        "School Meals Code",
        {
          direction: 0,
          magnitude: 0.1,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
        },
      ),
      option(
        "universal_school_meals",
        "Universal school meals",
        "Funds a meal for every pupil in participating public schools.",
        "Universal School Meals Bill",
        {
          direction: 1,
          magnitude: 0.74,
          fiscalImpact: 0.15,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "binary",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_HEALTH_INSURANCE_MODEL",
    "ISS_WELFARE",
    "Healthcare financing model",
    "National insurance funds essential care through public and contracted providers",
    [
      option(
        "regulated_private_insurance",
        "Regulated private insurance",
        "Replaces national insurance with mandatory regulated private plans and income-tested subsidies.",
        "Health Insurance Choice Bill",
        {
          direction: -0.8,
          fiscalImpact: -0.18,
          affectedGroups: ["Patients", "Insurers", "Employers"],
          dimensionEffects: { economic: -0.75, authority: -0.25 },
        },
      ),
      option(
        "nonprofit_insurance_funds",
        "Nonprofit insurance funds",
        "Creates competing nonprofit sickness funds under one national benefit schedule.",
        "Nonprofit Health Funds Bill",
        {
          direction: -0.25,
          fiscalImpact: 0.04,
          affectedGroups: ["Patients", "Nonprofit funds", "Providers"],
          dimensionEffects: { economic: -0.15, authority: 0.15 },
        },
      ),
      option(
        "national_insurance",
        "National insurance",
        "Retains national insurance with public and contracted providers.",
        "Health Insurance Code",
        {
          direction: 0.15,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Patients", "Providers", "Taxpayers"],
          dimensionEffects: { economic: 0.2, authority: 0.1 },
        },
      ),
      option(
        "national_health_service",
        "National health service",
        "Moves core hospitals and primary care into one publicly operated national service.",
        "National Health Service Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.34,
          affectedGroups: ["Patients", "Health workers", "Taxpayers"],
          dimensionEffects: { economic: 0.9, authority: 0.5 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_MEDICINE_PRICING",
    "ISS_WELFARE",
    "Prescription medicine purchasing",
    "Insurers reimburse medicines after national price negotiation",
    [
      option(
        "market_pricing",
        "Market pricing",
        "Ends national price negotiation and permits insurers to set separate formularies.",
        "Medicines Market Bill",
        {
          direction: -0.8,
          fiscalImpact: -0.1,
          affectedGroups: ["Patients", "Drug makers", "Insurers"],
        },
      ),
      option(
        "reference_pricing",
        "International reference pricing",
        "Caps reimbursement using prices in comparable countries.",
        "Fair Medicines Pricing Bill",
        {
          direction: 0.25,
          fiscalImpact: -0.05,
          affectedGroups: ["Patients", "Drug makers", "Insurers"],
          dimensionEffects: { economic: 0.2, globalism: 0.35 },
        },
      ),
      option(
        "negotiated_prices",
        "National negotiation",
        "Retains national negotiation with separate insurer reimbursement.",
        "Medicines Purchasing Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Patients", "Drug makers", "Insurers"],
        },
      ),
      option(
        "single_public_purchaser",
        "Single public purchaser",
        "Creates one public purchaser for covered prescription medicines.",
        "National Medicines Purchasing Bill",
        {
          direction: 0.85,
          fiscalImpact: 0.08,
          affectedGroups: ["Patients", "Pharmacies", "Drug makers"],
          dimensionEffects: { economic: 0.85, authority: 0.35 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_HOSPITAL_GOVERNANCE",
    "ISS_WELFARE",
    "Hospital governance",
    "Public hospital boards operate within national funding standards",
    [
      option(
        "contracted_hospital_networks",
        "Contracted hospital networks",
        "Allows provinces to contract regional hospital systems to nonprofit or private operators.",
        "Hospital Networks Bill",
        {
          direction: -0.6,
          fiscalImpact: -0.05,
          affectedGroups: ["Patients", "Hospital staff", "Provincial governments"],
          dimensionEffects: { economic: -0.45, authority: -0.3 },
        },
      ),
            option(
        "national_quality_standards",
        "National quality standards",
        "Sets national quality metrics while retaining local public hospital boards.",
        "Hospital Quality Standards Bill",
        {
          direction: 0.25,
          magnitude: 0.42,
          fiscalImpact: 0.04,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          controlHint: "binary",
        },
      ),
option(
        "public_hospital_boards",
        "Public hospital boards",
        "Retains locally governed public hospital boards under national standards.",
        "Hospital Governance Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Patients", "Hospital boards", "Provinces"],
        },
      ),
      option(
        "integrated_regional_authorities",
        "Regional health authorities",
        "Combines hospitals and community care under elected regional health authorities.",
        "Regional Health Authorities Bill",
        {
          direction: 0.55,
          fiscalImpact: 0.14,
          affectedGroups: ["Patients", "Health workers", "Regional authorities"],
          dimensionEffects: { economic: 0.35, authority: -0.25 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_CHILDCARE_MODEL",
    "ISS_WELFARE",
    "Early-childhood care",
    "Income-tested childcare subsidies support licensed providers",
    [
      option(
        "tax_credit",
        "Childcare tax credit",
        "Replaces direct subsidies with a refundable household tax credit.",
        "Childcare Tax Credit Bill",
        {
          direction: -0.45,
          fiscalImpact: -0.03,
          affectedGroups: ["Parents", "Childcare providers", "Taxpayers"],
        },
      ),
      option(
        "income_tested_subsidy",
        "Income-tested subsidy",
        "Retains income-tested support for licensed childcare.",
        "Childcare Support Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Parents", "Childcare providers", "Taxpayers"],
        },
      ),
      option(
        "universal_fee_cap",
        "Universal fee cap",
        "Caps fees for licensed childcare and reimburses providers for eligible places.",
        "Affordable Childcare Bill",
        {
          direction: 0.55,
          fiscalImpact: 0.2,
          affectedGroups: ["Parents", "Children", "Childcare providers"],
        },
      ),
      option(
        "public_childcare_network",
        "Public childcare network",
        "Builds a national network of publicly operated early-childhood centers.",
        "Early Childhood Service Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.38,
          affectedGroups: ["Parents", "Children", "Childcare workers"],
          dimensionEffects: { economic: 0.85, authority: 0.4 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_VOCATIONAL_TRAINING",
    "ISS_LABOR",
    "Vocational training governance",
    "Employers, unions and colleges share apprenticeship standards",
    [
      option(
        "employer_led_credentials",
        "Employer-led credentials",
        "Lets accredited employer groups set occupational credentials and training hours.",
        "Skills Accreditation Bill",
        {
          direction: -0.55,
          fiscalImpact: -0.06,
          affectedGroups: ["Apprentices", "Employers", "Colleges"],
        },
      ),
            option(
        "national_skills_credential",
        "National skills credential",
        "Creates portable national credentials recognized across provinces.",
        "National Skills Credential Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.08,
          affectedGroups: ["Apprentices", "Employers", "Colleges"],
          controlHint: "categorical",
        },
      ),
option(
        "tripartite_apprenticeships",
        "Tripartite apprenticeships",
        "Retains joint employer, union and college apprenticeship standards.",
        "Apprenticeship Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Apprentices", "Employers", "Trade unions"],
        },
      ),
      option(
        "public_training_guarantee",
        "Public training guarantee",
        "Guarantees a funded training place to young adults not in work or education.",
        "Training Guarantee Bill",
        {
          direction: 0.75,
          fiscalImpact: 0.24,
          affectedGroups: ["Young adults", "Colleges", "Employers"],
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_MINIMUM_WAGE",
    "ISS_LABOR",
    "Minimum-wage setting",
    "An independent commission recommends a national floor of 15 currency units per hour",
    [
      option(
        "province_minimums",
        "Provincial minimums",
        "Ends the national floor and leaves minimum wages to Provincial Assemblies.",
        "Provincial Wage Standards Bill",
        {
          direction: -0.65,
          fiscalImpact: -0.02,
          affectedGroups: ["Low-wage workers", "Employers", "Provinces"],
          dimensionEffects: { economic: -0.4, authority: -0.6 },
          parameterValue: 0,
          controlHint: "numeric",
        },
      ),
      option(
        "wage_floor_12",
        "12 per hour floor",
        "Sets a twelve currency unit national hourly minimum with annual review.",
        "Minimum Wage Reduction Bill",
        {
          direction: -0.35,
          magnitude: 0.48,
          fiscalImpact: -0.04,
          affectedGroups: ["Low-wage workers", "Employers", "Consumers"],
          parameterValue: 12,
          controlHint: "numeric",
        },
      ),
      option(
        "commission_recommendation",
        "15 per hour commission floor",
        "Retains annual recommendations from the independent wage commission at fifteen units.",
        "Minimum Wage Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Low-wage workers", "Employers", "Wage commission"],
          parameterValue: 15,
          controlHint: "numeric",
        },
      ),
      option(
        "wage_indexation",
        "18 per hour indexed floor",
        "Indexes the national minimum toward eighteen currency units using median wages.",
        "Fair Wage Indexation Bill",
        {
          direction: 0.55,
          fiscalImpact: 0.04,
          affectedGroups: ["Low-wage workers", "Employers", "Consumers"],
          parameterValue: 18,
          controlHint: "numeric",
        },
      ),
      option(
        "living_wage_floor",
        "22 per hour living-wage floor",
        "Raises the floor toward twenty-two currency units using a published living-cost benchmark.",
        "Living Wage Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.1,
          affectedGroups: ["Low-wage workers", "Employers", "Households"],
          parameterValue: 22,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_PLATFORM_WORK",
    "ISS_LABOR",
    "Platform-worker status",
    "Status is decided case by case under the ordinary employment test",
    [
      option(
        "independent_contractor_safe_harbor",
        "Contractor safe harbor",
        "Treats platform workers as contractors when written flexibility conditions are met.",
        "Independent Platform Work Bill",
        {
          direction: -0.75,
          fiscalImpact: -0.04,
          affectedGroups: ["Platform workers", "Digital platforms", "Consumers"],
        },
      ),
            option(
        "hybrid_status_framework",
        "Hybrid status framework",
        "Creates a statutory hybrid status with portable benefits for platform workers.",
        "Platform Worker Status Bill",
        {
          direction: 0.25,
          magnitude: 0.45,
          fiscalImpact: 0.02,
          affectedGroups: ["Platform workers", "Digital platforms", "Consumers"],
          controlHint: "categorical",
        },
      ),
option(
        "case_by_case_test",
        "Case-by-case test",
        "Retains the ordinary employment-status test for platform work.",
        "Platform Work Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Platform workers", "Digital platforms", "Courts"],
        },
      ),
      option(
        "employee_presumption",
        "Employee presumption",
        "Presumes employee status unless a platform proves genuine independent enterprise.",
        "Platform Worker Protections Bill",
        {
          direction: 0.8,
          fiscalImpact: 0.05,
          affectedGroups: ["Platform workers", "Digital platforms", "Labor inspectors"],
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_PAID_LEAVE",
    "ISS_LABOR",
    "Paid family leave",
    "Twelve weeks of earnings-related leave are financed through social insurance",
    [
      option(
        "employer_leave",
        "Employer-funded leave",
        "Replaces social insurance with a minimum employer-funded leave duty.",
        "Family Leave Responsibility Bill",
        {
          direction: -0.55,
          fiscalImpact: -0.12,
          affectedGroups: ["Parents", "Employers", "Workers"],
          parameterValue: 0,
          controlHint: "numeric",
        },
      ),
      option(
        "eight_week_insurance",
        "Eight-week insurance",
        "Provides eight weeks of earnings-related social-insurance leave.",
        "Family Leave Reduction Bill",
        {
          direction: -0.25,
          magnitude: 0.42,
          fiscalImpact: -0.08,
          affectedGroups: ["Parents", "Employers", "Workers"],
          parameterValue: 8,
          controlHint: "numeric",
        },
      ),
      option(
        "twelve_week_insurance",
        "Twelve-week insurance",
        "Retains twelve weeks of earnings-related social-insurance leave.",
        "Family Leave Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Parents", "Employers", "Workers"],
          parameterValue: 12,
          controlHint: "numeric",
        },
      ),
      option(
        "sixteen_week_insurance",
        "Sixteen-week insurance",
        "Extends insured family leave to sixteen weeks.",
        "Family Leave Extension Bill",
        {
          direction: 0.5,
          fiscalImpact: 0.14,
          affectedGroups: ["Parents", "Children", "Employers"],
          parameterValue: 16,
          controlHint: "numeric",
        },
      ),
      option(
        "twenty_six_week_insurance",
        "Twenty-six-week insurance",
        "Extends insured leave to twenty-six weeks with a reserved parent period.",
        "Extended Parental Leave Bill",
        {
          direction: 0.75,
          fiscalImpact: 0.22,
          affectedGroups: ["Parents", "Children", "Employers"],
          parameterValue: 26,
          controlHint: "numeric",
        },
      ),
      option(
        "shared_parental_year",
        "Shared parental year",
        "Creates a fifty-two-week shared leave with reserved periods for each parent.",
        "Shared Parental Leave Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.32,
          affectedGroups: ["Parents", "Children", "Employers"],
          parameterValue: 52,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_RENT_POLICY",
    "ISS_HOUSING",
    "Rent stabilization",
    "Cities may cap annual increases in designated high-pressure areas",
    [
      option(
        "market_rents",
        "Market rents",
        "Repeals local rent-increase caps while preserving notice and habitability rules.",
        "Rental Market Bill",
        {
          direction: -0.8,
          fiscalImpact: -0.03,
          affectedGroups: ["Renters", "Landlords", "Cities"],
          controlHint: "binary",
        },
      ),
      option(
        "pressure_area_caps",
        "High-pressure area caps",
        "Retains local caps in designated high-pressure housing areas.",
        "Rent Stabilization Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Renters", "Landlords", "Cities"],
        },
      ),
      option(
        "national_rent_stabilization",
        "National stabilization rule",
        "Limits annual increases for existing tenancies nationwide, with renovation exemptions.",
        "National Rent Stabilization Bill",
        {
          direction: 0.8,
          fiscalImpact: 0.08,
          affectedGroups: ["Renters", "Landlords", "Housing agencies"],
          controlHint: "binary",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_LAND_VALUE_TAX",
    "ISS_HOUSING",
    "Land taxation",
    "Local property tax applies to assessed land and buildings",
    [
            option(
        "gradual_land_shift",
        "Gradual land-value shift",
        "Phases in higher land taxation over ten years while reducing building charges.",
        "Gradual Land Tax Shift Bill",
        {
          direction: 0.45,
          magnitude: 0.52,
          fiscalImpact: -0.04,
          affectedGroups: ["Property owners", "Municipalities", "Developers"],
          parameterValue: 10,
          controlHint: "numeric",
        },
      ),
option(
        "building_value_tax",
        "Property-value tax",
        "Retains taxation of both land and buildings under local assessment.",
        "Property Tax Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Property owners", "Municipalities", "Developers"],
        },
      ),
      option(
        "split_rate_tax",
        "Split-rate tax",
        "Taxes land at a higher rate than buildings to discourage vacant and underused sites.",
        "Productive Land Tax Bill",
        {
          direction: 0.35,
          fiscalImpact: -0.03,
          affectedGroups: ["Landowners", "Developers", "Municipalities"],
          dimensionEffects: { economic: 0.25, authority: -0.1 },
        },
      ),
      option(
        "land_value_tax",
        "Land-value tax",
        "Replaces the building-value charge with a tax on unimproved site value.",
        "Land Value Tax Bill",
        {
          direction: 0.65,
          fiscalImpact: -0.08,
          affectedGroups: ["Landowners", "Developers", "Municipalities"],
          dimensionEffects: { economic: 0.45, authority: -0.15 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_INHERITANCE_TAX",
    "ISS_WELFARE",
    "Inheritance taxation",
    "Large estates pay tax above a protected family allowance",
    [
      option(
        "repeal_estate_tax",
        "Repeal estate tax",
        "Repeals inheritance tax and retains ordinary capital-gains rules on inherited assets.",
        "Estate Tax Repeal Bill",
        {
          direction: -0.9,
          fiscalImpact: -0.22,
          affectedGroups: ["Heirs", "Large estates", "Taxpayers"],
        },
      ),
      option(
        "family_business_exemption",
        "Family-business exemption",
        "Exempts qualifying operating businesses while retaining tax on other large estates.",
        "Family Enterprise Succession Bill",
        {
          direction: -0.35,
          fiscalImpact: -0.1,
          affectedGroups: ["Family businesses", "Heirs", "Taxpayers"],
        },
      ),
      option(
        "protected_allowance",
        "Protected allowance",
        "Retains the current protected allowance and progressive estate rates.",
        "Inheritance Tax Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Heirs", "Large estates", "Taxpayers"],
        },
      ),
      option(
        "progressive_estate_rates",
        "Higher large-estate rates",
        "Adds higher bands for the largest estates and closes trust-avoidance rules.",
        "Large Estates Contribution Bill",
        {
          direction: 0.8,
          fiscalImpact: -0.18,
          affectedGroups: ["Large estates", "Heirs", "Public services"],
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_CORPORATE_TAX",
    "ISS_WELFARE",
    "Corporate tax base",
    "A national rate of 21% applies after investment and loss deductions",
    [
      option(
        "rate_15_territorial",
        "15% territorial rate",
        "Cuts the rate to fifteen percent and exempts most qualifying foreign profits.",
        "Competitive Corporate Tax Bill",
        {
          direction: -0.85,
          fiscalImpact: -0.25,
          affectedGroups: ["Companies", "Investors", "Taxpayers"],
          dimensionEffects: { economic: -0.75, globalism: 0.35 },
          parameterValue: 15,
          controlHint: "numeric",
        },
      ),
      option(
        "investment_allowance",
        "18% with investment allowance",
        "Keeps an eighteen percent rate but accelerates deductions for domestic capital investment.",
        "Business Investment Allowance Bill",
        {
          direction: -0.25,
          fiscalImpact: -0.12,
          affectedGroups: ["Companies", "Workers", "Investors"],
          parameterValue: 18,
          controlHint: "numeric",
        },
      ),
      option(
        "current_tax_base",
        "21% national rate",
        "Retains the twenty-one percent national rate and current deduction rules.",
        "Corporate Tax Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Companies", "Investors", "Taxpayers"],
          parameterValue: 21,
          controlHint: "numeric",
        },
      ),
      option(
        "minimum_effective_tax",
        "25% minimum effective tax",
        "Sets a twenty-five percent minimum effective rate for large corporate groups.",
        "Corporate Minimum Tax Bill",
        {
          direction: 0.75,
          fiscalImpact: -0.18,
          affectedGroups: ["Large companies", "Taxpayers", "Public services"],
          dimensionEffects: { economic: 0.65, globalism: -0.15 },
          parameterValue: 25,
          controlHint: "numeric",
        },
      ),
      option(
        "rate_28_progressive",
        "28% progressive corporate rate",
        "Adds a twenty-eight percent band for the largest corporate groups after deductions.",
        "Large Corporate Contribution Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.08,
          affectedGroups: ["Large companies", "Investors", "Public services"],
          parameterValue: 28,
          controlHint: "numeric",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_ELECTRICITY_MARKET",
    "ISS_OWNERSHIP",
    "Electricity market structure",
    "Regulated utilities buy power from public and private generators",
    [
      option(
        "competitive_retail_market",
        "Competitive retail market",
        "Allows households to choose competing electricity retailers using regulated networks.",
        "Electricity Choice Bill",
        {
          direction: -0.85,
          fiscalImpact: -0.08,
          affectedGroups: ["Households", "Utilities", "Generators"],
          dimensionEffects: { economic: -0.8, authority: -0.25 },
        },
      ),
      option(
        "regulated_private_utilities",
        "Regulated private utilities",
        "Moves distribution utilities into long-term regulated private franchises.",
        "Electricity Franchises Bill",
        {
          direction: -0.45,
          fiscalImpact: -0.12,
          affectedGroups: ["Households", "Utilities", "Investors"],
        },
      ),
      option(
        "mixed_regulated_system",
        "Mixed regulated system",
        "Retains regulated utilities and mixed public-private generation.",
        "Electricity Market Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Households", "Utilities", "Generators"],
        },
      ),
      option(
        "public_grid_operator",
        "Public grid operator",
        "Creates a public system operator while retaining independent generators.",
        "National Grid Operator Bill",
        {
          direction: 0.45,
          fiscalImpact: 0.14,
          affectedGroups: ["Households", "Grid workers", "Generators"],
          dimensionEffects: { economic: 0.45, authority: 0.35 },
        },
      ),
      option(
        "public_generation_authority",
        "Public generation authority",
        "Establishes a public authority to own new strategic generation and storage.",
        "Public Power Authority Bill",
        {
          direction: 0.9,
          fiscalImpact: 0.32,
          affectedGroups: ["Households", "Energy workers", "Taxpayers"],
          dimensionEffects: { economic: 0.9, authority: 0.45, green: 0.3 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_NUCLEAR_POLICY",
    "ISS_CLIMATE",
    "Nuclear energy policy",
    "Existing reactors may operate while new projects require separate legislation",
    [
      option(
        "managed_phaseout",
        "Managed phaseout",
        "Closes existing reactors at the end of their licensed lives and prohibits replacement plants.",
        "Nuclear Phaseout Bill",
        {
          direction: -0.35,
          fiscalImpact: 0.12,
          affectedGroups: ["Energy workers", "Electricity users", "Host communities"],
          dimensionEffects: { green: 0.55, authority: 0.15 },
        },
      ),
            option(
        "life_extension_refurbishment",
        "Life-extension refurbishment",
        "Authorizes refurbishment of existing reactors to extend licensed operating lives.",
        "Nuclear Refurbishment Bill",
        {
          direction: 0.25,
          magnitude: 0.45,
          fiscalImpact: 0.14,
          affectedGroups: ["Electricity users", "Energy workers", "Host communities"],
          controlHint: "categorical",
        },
      ),
option(
        "case_by_case_authorization",
        "Case-by-case authorization",
        "Retains separate legislative approval for each new nuclear project.",
        "Nuclear Energy Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Electricity users", "Regulators", "Host communities"],
        },
      ),
      option(
        "standardized_new_build",
        "Standardized new build",
        "Creates a licensing and finance framework for a fleet of standardized reactors.",
        "Nuclear Generation Bill",
        {
          direction: 0.65,
          fiscalImpact: 0.3,
          affectedGroups: ["Electricity users", "Energy workers", "Taxpayers"],
          dimensionEffects: { green: 0.35, authority: 0.45, economic: 0.2 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_WATER_ENFORCEMENT",
    "ISS_CLIMATE",
    "Water-pollution enforcement",
    "Provincial inspectors enforce national discharge standards",
    [
      option(
        "province_only_enforcement",
        "Provincial enforcement",
        "Repeals national intervention powers and leaves inspections to provinces.",
        "Provincial Water Administration Bill",
        {
          direction: -0.6,
          fiscalImpact: -0.06,
          affectedGroups: ["Provinces", "Industry", "Water users"],
          dimensionEffects: { green: -0.45, authority: -0.6 },
        },
      ),
            option(
        "industry_self_monitoring",
        "Industry self-monitoring",
        "Requires major dischargers to publish self-monitoring with random national audits.",
        "Water Self-Monitoring Bill",
        {
          direction: -0.25,
          magnitude: 0.4,
          fiscalImpact: -0.03,
          affectedGroups: groupsForIssue("ISS_CLIMATE"),
          controlHint: "binary",
        },
      ),
option(
        "shared_enforcement",
        "Shared enforcement",
        "Retains provincial inspection under national discharge standards.",
        "Water Standards Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Provinces", "Industry", "Water users"],
        },
      ),
      option(
        "national_enforcement_office",
        "National enforcement office",
        "Creates a national office able to inspect major dischargers and levy civil penalties.",
        "Clean Water Enforcement Bill",
        {
          direction: 0.8,
          fiscalImpact: 0.12,
          affectedGroups: ["Water users", "Industry", "Environmental agencies"],
          dimensionEffects: { green: 0.8, authority: 0.5 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_BROADBAND",
    "ISS_OWNERSHIP",
    "Broadband infrastructure",
    "Private networks receive targeted rural buildout grants",
    [
      option(
        "market_only_buildout",
        "Market-led buildout",
        "Ends national buildout grants and relies on commercial network investment.",
        "Broadband Market Bill",
        {
          direction: -0.75,
          fiscalImpact: -0.14,
          affectedGroups: ["Rural households", "Network firms", "Taxpayers"],
        },
      ),
            option(
        "middle_mile_cooperative",
        "Middle-mile cooperative",
        "Funds nonprofit middle-mile fiber cooperatives serving underserved regions.",
        "Middle Mile Broadband Bill",
        {
          direction: 0.35,
          magnitude: 0.52,
          fiscalImpact: 0.12,
          affectedGroups: ["Rural households", "Network firms", "Local governments"],
          controlHint: "categorical",
        },
      ),
option(
        "targeted_rural_grants",
        "Targeted rural grants",
        "Retains grants for unserved rural and remote communities.",
        "Broadband Access Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Rural households", "Network firms", "Local governments"],
        },
      ),
      option(
        "public_open_access_network",
        "Public open-access network",
        "Builds public fiber infrastructure leased on equal terms to retail providers.",
        "National Open Network Bill",
        {
          direction: 0.85,
          fiscalImpact: 0.3,
          affectedGroups: ["Households", "Network workers", "Retail providers"],
          dimensionEffects: { economic: 0.75, authority: 0.35 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_ASYLUM_PROCESS",
    "ISS_IMMIGRATION",
    "Asylum procedure",
    "Applicants receive an interview, legal review and appeal while claims are processed",
    [
      option(
        "safe_country_summary_process",
        "Safe-country summary process",
        "Uses a shortened procedure for applicants from designated safe countries, with judicial review.",
        "Safe Country Procedure Bill",
        {
          direction: -0.7,
          fiscalImpact: -0.06,
          affectedGroups: ["Asylum seekers", "Border officials", "Courts"],
          dimensionEffects: { social: -0.55, authority: 0.45, globalism: -0.4 },
        },
      ),
      option(
        "standard_review",
        "Standard review",
        "Retains an interview, legal review and appeal during processing.",
        "Asylum Procedure Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Asylum seekers", "Caseworkers", "Courts"],
        },
      ),
      option(
        "independent_case_agency",
        "Independent case agency",
        "Transfers initial decisions to an independent agency with published timeliness standards.",
        "Independent Asylum Decisions Bill",
        {
          direction: 0.3,
          fiscalImpact: 0.08,
          affectedGroups: ["Asylum seekers", "Caseworkers", "Courts"],
          dimensionEffects: { social: 0.2, authority: -0.25 },
        },
      ),
      option(
        "right_to_work_after_six_months",
        "Work rights after six months",
        "Allows applicants to work when a first decision has not been made within six months.",
        "Asylum Applicant Work Rights Bill",
        {
          direction: 0.65,
          fiscalImpact: 0.03,
          affectedGroups: ["Asylum seekers", "Employers", "Local services"],
          dimensionEffects: { social: 0.45, economic: -0.1, globalism: 0.35 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_ELECTORAL_FORMULA",
    "ISS_REFORM",
    "Assembly electoral formula",
    "Multi-member constituencies elect members by single transferable vote",
    [
      option(
        "closed_party_lists",
        "Closed provincial lists",
        "Replaces constituency STV with closed provincial party lists.",
        "Provincial List Elections Bill",
        {
          direction: -0.2,
          fiscalImpact: -0.03,
          affectedGroups: ["Voters", "Political parties", "Election officials"],
          dimensionEffects: { authority: 0.55, social: -0.1 },
          controlHint: "categorical",
        },
      ),
      option(
        "mixed_member_system",
        "Mixed-member system",
        "Elects half the Assembly locally and uses party lists to restore proportionality.",
        "Mixed Member Representation Bill",
        {
          direction: 0.25,
          fiscalImpact: 0.1,
          affectedGroups: ["Voters", "Candidates", "Political parties"],
          dimensionEffects: { authority: -0.2, social: 0.15 },
          controlHint: "categorical",
        },
      ),
      option(
        "single_transferable_vote",
        "Single transferable vote",
        "Retains multi-member constituency elections by transferable vote.",
        "Electoral System Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Voters", "Candidates", "Election officials"],
          controlHint: "categorical",
        },
      ),
      option(
        "open_multiparty_stv",
        "Open multiparty STV",
        "Requires open candidate lists and multiparty registration under STV constituencies.",
        "Open Multiparty Elections Bill",
        {
          direction: 0.45,
          fiscalImpact: 0.08,
          affectedGroups: ["Voters", "Political parties", "Election officials"],
          dimensionEffects: { authority: -0.35, social: 0.25 },
          controlHint: "binary",
        },
      ),
      option(
        "national_compensatory_seats",
        "National compensatory seats",
        "Keeps constituency STV and adds a small national tier to correct severe disproportionality.",
        "Fair Representation Bill",
        {
          direction: 0.55,
          fiscalImpact: 0.12,
          affectedGroups: ["Voters", "Political parties", "Election officials"],
          dimensionEffects: { authority: -0.4, social: 0.2 },
          controlHint: "categorical",
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_FIREARMS_LICENSING",
    "ISS_POLICING",
    "Civilian firearms licensing",
    "Applicants pass background, training and safe-storage checks",
    [
      option(
        "basic_background_check",
        "Basic background check",
        "Removes mandatory training and renewals while retaining criminal-record checks.",
        "Firearms Licensing Reform Bill",
        {
          direction: -0.75,
          fiscalImpact: -0.04,
          affectedGroups: ["Firearms owners", "Police", "Communities"],
          dimensionEffects: { social: -0.45, authority: -0.55 },
        },
      ),
            option(
        "renewal_every_five_years",
        "Five-year renewal",
        "Requires license renewal and storage inspection every five years.",
        "Firearms Renewal Bill",
        {
          direction: 0.35,
          magnitude: 0.48,
          fiscalImpact: 0.03,
          affectedGroups: ["Firearms owners", "Police", "Communities"],
          parameterValue: 5,
          controlHint: "numeric",
        },
      ),
option(
        "training_and_storage_license",
        "Training and storage license",
        "Retains background, training, renewal and safe-storage requirements.",
        "Firearms Licensing Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Firearms owners", "Police", "Communities"],
        },
      ),
      option(
        "permit_and_registration",
        "Permit and registration",
        "Adds registration and a demonstrated-need permit for restricted firearms.",
        "Firearms Safety Bill",
        {
          direction: 0.8,
          fiscalImpact: 0.08,
          affectedGroups: ["Firearms owners", "Police", "Communities"],
          dimensionEffects: { social: 0.45, authority: 0.65 },
        },
      ),
    ]
  ),
  variableProvision(
    "PROV_FARMLAND_POLICY",
    "ISS_TRADE",
    "Agricultural land policy",
    "Provinces regulate conversion and foreign purchase of designated farmland",
    [
      option(
        "open_land_market",
        "Open land market",
        "Repeals national restrictions on large foreign purchases and leaves conversion rules to provinces.",
        "Agricultural Land Market Bill",
        {
          direction: -0.7,
          fiscalImpact: -0.03,
          affectedGroups: ["Farmers", "Landowners", "Investors"],
          dimensionEffects: { economic: -0.5, globalism: 0.55, authority: -0.35 },
        },
      ),
            option(
        "foreign_ownership_cap",
        "Foreign ownership cap",
        "Caps foreign ownership of designated farmland at fifteen percent of provincial acreage.",
        "Farmland Foreign Ownership Bill",
        {
          direction: 0.35,
          magnitude: 0.5,
          fiscalImpact: 0.02,
          affectedGroups: ["Farmers", "Provinces", "Investors"],
          parameterValue: 15,
          controlHint: "threshold",
        },
      ),
option(
        "provincial_land_controls",
        "Provincial land controls",
        "Retains provincial conversion rules and national review of large foreign purchases.",
        "Farmland Policy Code",
        {
          direction: 0,
          magnitude: 0.2,
          fiscalImpact: 0,
          founding: true,
          affectedGroups: ["Farmers", "Provinces", "Investors"],
        },
      ),
      option(
        "working_farm_protection",
        "Working-farm protection",
        "Creates a national conservation covenant and right of first refusal for working farmers.",
        "Working Farmland Protection Bill",
        {
          direction: 0.7,
          fiscalImpact: 0.12,
          affectedGroups: ["Farmers", "Rural communities", "Landowners"],
          dimensionEffects: { economic: 0.35, nationalism: 0.4, green: 0.3 },
        },
      ),
    ]
  ),
] as const;

export function legislativeProvision(id: string): LegislativeProvisionDefinition | null {
  return LEGISLATIVE_PROVISIONS.find((item) => item.id === id) ?? null;
}

export function legislativeProvisionOption(
  provisionId: string,
  optionId: string,
): LegislativeProvisionOption | null {
  const definition = legislativeProvision(provisionId);
  if (!definition) return null;
  const direct = definition.options.find((option) => option.id === optionId);
  if (direct) return direct;
  // Schema-13 development saves may contain the former universal option IDs.
  // Read them as aliases, but every newly persisted choice uses its legal name.
  if (optionId === "current")
    return definition.options.find((candidate) => candidate.founding) ?? null;
  if (optionId === "low")
    return (
      definition.options
        .slice()
        .sort((a, b) => a.direction - b.direction || a.id.localeCompare(b.id))[0] ?? null
    );
  if (optionId === "high")
    return (
      definition.options
        .slice()
        .sort((a, b) => b.direction - a.direction || a.id.localeCompare(b.id))[0] ?? null
    );
  // Phase 11.4: keep_current_* → founding_* migration aliases for old saves.
  if (optionId.startsWith("keep_")) {
    const founding = definition.options.find((candidate) => candidate.founding);
    if (founding) return founding;
  }
  return null;
}

export function defaultProvisionOptionId(provisionId: string): string {
  const definition = legislativeProvision(provisionId);
  return (
    definition?.options.find((candidate) => !candidate.founding)?.id ??
    definition?.options[0]?.id ??
    ""
  );
}

export function policyItemForProvision(provisionId: string, optionId: string): PolicyItem | null {
  const definition = legislativeProvision(provisionId);
  const option = legislativeProvisionOption(provisionId, optionId);
  if (!definition || !option) return null;
  return {
    issueId: definition.issueId,
    provisionId,
    optionId: option.id,
    direction: option.direction,
    magnitude: option.magnitude,
    fiscalImpact: option.fiscalImpact,
    ...(option.dimensionEffects ? { dimensionEffects: { ...option.dimensionEffects } } : {}),
  };
}

export function provisionForPolicyItem(item: PolicyItem): LegislativeProvisionDefinition | null {
  if (item.provisionId) return legislativeProvision(item.provisionId);
  return LEGISLATIVE_PROVISIONS.find((definition) => definition.issueId === item.issueId) ?? null;
}

export function optionForPolicyItem(item: PolicyItem): LegislativeProvisionOption | null {
  const definition = provisionForPolicyItem(item);
  if (!definition) return null;
  if (item.optionId) return legislativeProvisionOption(definition.id, item.optionId);
  return (
    definition.options
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.direction - item.direction) - Math.abs(b.direction - item.direction) ||
          Number(a.founding) - Number(b.founding) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export function currentProvisionOption(
  state: SimState,
  provisionId: string,
): LegislativeProvisionOption | null {
  const top = provisionHistory(state, provisionId).at(-1);
  if (top) {
    return legislativeProvisionOption(provisionId, top.optionId);
  }
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((law) => law.operative)
    .sort((a, b) => b.enactedDate.localeCompare(a.enactedDate) || b.id.localeCompare(a.id));
  for (const law of laws) {
    const item = law.policyItems.find((candidate) => candidate.provisionId === provisionId);
    if (item) return optionForPolicyItem(item);
  }
  return legislativeProvision(provisionId)?.options.find((option) => option.founding) ?? null;
}

/** Enactment stack for a provision (oldest → newest). Empty means founding baseline. */
export function provisionHistory(
  state: SimState,
  provisionId: string,
): readonly ProvisionEnactmentRecord[] {
  return state.legislatureRuntime.provisionHistory[provisionId] ?? [];
}

export type CurrentLawSource = {
  provisionId: string;
  optionId: string;
  optionLabel: string;
  lawId: string | null;
  lawTitle: string | null;
  enactedDate: IsoDate | null;
  previousOptionId: string | null;
  previousOptionLabel: string | null;
  founding: boolean;
};

/** Source Act / prior rule metadata for Lawbook display. */
export function currentLawSource(state: SimState, provisionId: string): CurrentLawSource {
  const history = provisionHistory(state, provisionId);
  const top = history.at(-1);
  const foundingId = foundingOptionId(provisionId);
  const current = currentProvisionOption(state, provisionId);
  const optionId = top?.optionId ?? current?.id ?? foundingId ?? "";
  const option = optionId ? legislativeProvisionOption(provisionId, optionId) : null;
  const previousOptionId = top?.previousOptionId ?? null;
  const previousOption = previousOptionId
    ? legislativeProvisionOption(provisionId, previousOptionId)
    : null;
  const law = top ? (state.legislatureRuntime.enactedLaws[top.lawId] ?? null) : null;
  return {
    provisionId,
    optionId,
    optionLabel: option?.label ?? current?.label ?? "Founding statutory position",
    lawId: top?.lawId ?? null,
    lawTitle: law?.title ?? null,
    enactedDate: top?.enactedDate ?? null,
    previousOptionId,
    previousOptionLabel: previousOption?.label ?? null,
    founding: !top,
  };
}

/** Option that would be restored if the current top Act for this provision were repealed. */
export function previousProvisionOptionId(state: SimState, provisionId: string): string | null {
  const history = provisionHistory(state, provisionId);
  const top = history.at(-1);
  if (!top) return foundingOptionId(provisionId);
  if (top.previousOptionId) return top.previousOptionId;
  const prior = history.at(-2);
  return prior?.optionId ?? foundingOptionId(provisionId);
}

/**
 * Option restored when a specific Act is repealed for this provision.
 * Returns null when that Act did not set the provision or is not the current top
 * (current law stays with a later Act — omit from repeal draft).
 */
export function restoreOptionForRepealedAct(
  state: SimState,
  provisionId: string,
  targetLawId: string,
): string | null {
  const history = provisionHistory(state, provisionId);
  const top = history.at(-1);
  if (!top || top.lawId !== targetLawId) return null;
  return top.previousOptionId ?? foundingOptionId(provisionId);
}

export function estimatedProvisionEffects(item: PolicyItem): Partial<NationalEconomyIndices> {
  return policyIndexDelta(item);
}

export function naturalBillCopy(
  state: SimState,
  items: readonly PolicyItem[],
): { title: string; summary: string } {
  const resolved = items.flatMap((item) => {
    const definition = provisionForPolicyItem(item);
    const option = optionForPolicyItem(item);
    return definition && option ? [{ definition, option }] : [];
  });
  const first = resolved[0];
  let title = first?.option.billTitle ?? "Public Administration Bill";
  if (resolved.length > 1) {
    const category = resolved[0]!.definition.category.replace(
      / (rules|law|eligibility|coverage|authority)$/i,
      "",
    );
    const second = resolved[1]!.definition.category.replace(
      / (rules|law|eligibility|coverage|authority)$/i,
      "",
    );
    title = `${category} and ${second} Bill`;
  }
  const used = new Set([
    ...Object.values(state.legislatureRuntime.bills).map((bill) => bill.title),
    ...Object.values(state.legislatureRuntime.enactedLaws).map((law) => law.title),
  ]);
  if (used.has(title)) {
    const stem = title.replace(/ (Act|Bill)$/i, "");
    title = `${stem} Amendment Bill`;
    if (used.has(title)) title = `${stem} Further Amendment Bill`;
    if (used.has(title)) {
      let number = 2;
      do {
        title = `${stem} (No. ${number}) Bill`;
        number += 1;
      } while (used.has(title));
    }
  }
  return {
    title,
    summary: resolved.map(({ option }) => option.change).join(" "),
  };
}

export function concretePolicyItem(item: PolicyItem): PolicyItem {
  if (item.provisionId && item.optionId) return { ...item };
  const definition = provisionForPolicyItem(item);
  if (!definition) return { ...item };
  const option = definition.options
    .slice()
    .sort(
      (a, b) =>
        Math.abs(a.direction - item.direction) - Math.abs(b.direction - item.direction) ||
        Number(a.founding) - Number(b.founding) ||
        a.id.localeCompare(b.id),
    )[0]!;
  return policyItemForProvision(definition.id, option.id) ?? { ...item };
}


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
