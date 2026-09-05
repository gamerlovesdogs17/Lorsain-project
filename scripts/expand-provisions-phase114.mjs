/**
 * One-shot expansion patch for Phase 11.4 provisions.
 * Run: node scripts/expand-provisions-phase114.mjs
 */
import fs from "fs";

const path = "packages/sim/src/legislature/provisions.ts";
let src = fs.readFileSync(path, "utf8");

/** Insert new option() blocks immediately before the founding option in each provision. */
const INSERT_BEFORE_FOUNDING = {
  PROV_REPRODUCTIVE_LAW: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_RESIDENCY_PATH: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_POLICE_COMPLAINTS: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_REVENUE_DISCRETION: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_EMERGENCY_RENEWAL: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_DONOR_DISCLOSURE: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_CONCORD_PROCUREMENT: [
    `      option(
        "national_vendor_priority",
        "National vendor priority",
        "Requires national firms to receive preference in Concord procurement bids.",
        "Defense Vendor Priority Bill",
        {
          direction: -0.25,
          magnitude: 0.42,
          fiscalImpact: -0.02,
          affectedGroups: groupsForIssue("ISS_CONCORD"),
          controlHint: "binary",
        },
      ),`,
    `      option(
        "multilateral_framework",
        "Multilateral framework",
        "Authorizes standing multilateral procurement with Concord allies.",
        "Allied Procurement Framework Bill",
        {
          direction: 0.35,
          magnitude: 0.55,
          fiscalImpact: 0.05,
          affectedGroups: groupsForIssue("ISS_CONCORD"),
          controlHint: "categorical",
        },
      ),`,
  ],
  PROV_VASKARA_SANCTIONS: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_READINESS_FUND: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_PRIMARY_CARE: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
  PROV_TUITION_SUPPORT: [
    `      option(
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
      ),`,
    `      option(
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
      ),`,
  ],
};

/** Replace entire option blocks for numeric-heavy provisions. */
const REPLACEMENTS = [
  {
    start: '  variableProvision(\n    "PROV_UNEMPLOYMENT_INSURANCE",',
    end: "  ),\n  variableProvision(\n    \"PROV_UNION_RECOGNITION\",",
    body: `  variableProvision(
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
        "keep_current_duration",
        "Twelve-week insured period",
        "Retains twelve weeks of earnings-related insured benefits.",
        "Employment Insurance Continuity Bill",
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
    "PROV_UNION_RECOGNITION",`,
  },
  {
    start: '  variableProvision(\n    "PROV_INCOME_TAX",',
    end: "  ),\n  variableProvision(\n    \"PROV_UNEMPLOYMENT_INSURANCE\",",
    body: `  variableProvision(
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
        "keep_current_schedule",
        "37% top marginal rate",
        "Retains the current progressive schedule with a thirty-seven percent top rate.",
        "Income Tax Continuity Bill",
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
    "PROV_UNEMPLOYMENT_INSURANCE",`,
  },
  {
    start: '  variableProvision(\n    "PROV_CARBON_PRICE",',
    end: "  ),\n  variableProvision(\n    \"PROV_SURVEILLANCE_WARRANT\",",
    body: `  variableProvision(
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
        "keep_current_levy",
        "45 per tonne levy",
        "Retains the current forty-five currency unit levy and rebate schedule.",
        "Carbon Pricing Continuity Bill",
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
    "PROV_SURVEILLANCE_WARRANT",`,
  },
  {
    start: '  variableProvision(\n    "PROV_PAID_LEAVE",',
    end: "  ),\n  variableProvision(\n    \"PROV_RENT_POLICY\",",
    body: `  variableProvision(
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
        "Family Leave Continuity Bill",
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
    "PROV_RENT_POLICY",`,
  },
  {
    start: '  variableProvision(\n    "PROV_MINIMUM_WAGE",',
    end: "  ),\n  variableProvision(\n    \"PROV_PLATFORM_WORK\",",
    body: `  variableProvision(
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
        "Minimum Wage Continuity Bill",
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
    "PROV_PLATFORM_WORK",`,
  },
  {
    start: '  variableProvision(\n    "PROV_CORPORATE_TAX",',
    end: "  ),\n  variableProvision(\n    \"PROV_ELECTRICITY_MARKET\",",
    body: `  variableProvision(
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
        "Corporate Tax Continuity Bill",
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
    "PROV_ELECTRICITY_MARKET",`,
  },
  {
    start: '  variableProvision(\n    "PROV_ELECTION_ADMIN",',
    end: "  ),\n  variableProvision(\n    \"PROV_SCHOOL_MEALS\",",
    body: `  variableProvision(
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
        "keep_shared_administration",
        "National standards, provincial staffing",
        "Retains national standards with provincial staffing.",
        "Election Administration Continuity Bill",
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
    "PROV_SCHOOL_MEALS",`,
  },
  {
    start: '  variableProvision(\n    "PROV_ELECTORAL_FORMULA",',
    end: "  ),\n  variableProvision(\n    \"PROV_FIREARMS_LICENSING\",",
    body: `  variableProvision(
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
        "Electoral System Continuity Bill",
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
    "PROV_FIREARMS_LICENSING",`,
  },
];

for (const { start, end, body } of REPLACEMENTS) {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i);
  if (i < 0 || j < 0) {
    console.error("Replacement failed:", start.slice(0, 50), i, j);
    process.exit(1);
  }
  src = src.slice(0, i) + body + src.slice(j);
}

function insertBeforeFounding(provisionId, blocks) {
  const marker = `variableProvision(\n    "${provisionId}"`;
  const start = src.indexOf(marker);
  if (start < 0) {
    console.error("Provision not found:", provisionId);
    process.exit(1);
  }
  const foundingIdx = src.indexOf("founding: true", start);
  if (foundingIdx < 0) {
    console.error("Founding not found:", provisionId);
    process.exit(1);
  }
  const optionStart = src.lastIndexOf("option(", foundingIdx);
  const insertAt = optionStart;
  src = src.slice(0, insertAt) + blocks.join("\n") + "\n" + src.slice(insertAt);
}

for (const [provisionId, blocks] of Object.entries(INSERT_BEFORE_FOUNDING)) {
  insertBeforeFounding(provisionId, blocks);
}

// Remaining two-option provisions get one middle option each
const MIDDLE_INSERTS = {
  PROV_UNION_RECOGNITION: `      option(
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
      ),`,
  PROV_STRIKE_NOTICE: `      option(
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
      ),`,
  PROV_PUBLIC_HOUSING: `      option(
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
      ),`,
  PROV_TRANSIT_ZONING: `      option(
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
      ),`,
  PROV_INFRASTRUCTURE_BANK: `      option(
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
      ),`,
  PROV_FARM_STABILIZATION: `      option(
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
      ),`,
  PROV_SURVEILLANCE_WARRANT: `      option(
        "warrant_within_twenty_four_hours",
        "Warrant within twenty-four hours",
        "Requires a warrant within twenty-four hours after any emergency access.",
        "Surveillance Warrant Timing Bill",
        {
          direction: 0.25,
          magnitude: 0.45,
          fiscalImpact: 0.01,
          affectedGroups: groupsForIssue("ISS_LIBERTY"),
          parameterValue: 24,
          controlHint: "numeric",
        },
      ),`,
  PROV_SENTENCING: `      option(
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
      ),`,
  PROV_SCHOOL_MEALS: `      option(
        "middle_income_expansion",
        "Middle-income expansion",
        "Extends subsidized meals to households up to 150% of median income.",
        "School Meals Expansion Bill",
        {
          direction: 0.35,
          magnitude: 0.48,
          fiscalImpact: 0.08,
          affectedGroups: groupsForIssue("ISS_WELFARE"),
          parameterValue: 150,
          controlHint: "threshold",
        },
      ),`,
  PROV_HOSPITAL_GOVERNANCE: `      option(
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
      ),`,
  PROV_VOCATIONAL_TRAINING: `      option(
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
      ),`,
  PROV_PLATFORM_WORK: `      option(
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
      ),`,
  PROV_RENT_POLICY: `      option(
        "vacancy_rent_adjustment",
        "Vacancy rent adjustment",
        "Allows rent adjustments between tenancies in high-pressure areas with notice rules.",
        "Vacancy Rent Adjustment Bill",
        {
          direction: 0.25,
          magnitude: 0.45,
          fiscalImpact: 0.02,
          affectedGroups: groupsForIssue("ISS_HOUSING"),
          controlHint: "binary",
        },
      ),`,
  PROV_LAND_VALUE_TAX: `      option(
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
      ),`,
  PROV_NUCLEAR_POLICY: `      option(
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
      ),`,
  PROV_WATER_ENFORCEMENT: `      option(
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
      ),`,
  PROV_BROADBAND: `      option(
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
      ),`,
  PROV_FIREARMS_LICENSING: `      option(
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
      ),`,
  PROV_FARMLAND_POLICY: `      option(
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
      ),`,
};

for (const [provisionId, block] of Object.entries(MIDDLE_INSERTS)) {
  insertBeforeFounding(provisionId, [block]);
}

fs.writeFileSync(path, src);
console.log("Patched provisions.ts");
