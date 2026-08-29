import type { SimState } from "../types.js";
import { policyIndexDelta } from "../economy/policy.js";
import type { NationalEconomyIndices } from "../economy/types.js";
import type { PolicyItem } from "./types.js";
import type { IdeologyAxis } from "../agents/types.js";

export type LegislativeProvisionOption = {
  id: string;
  label: string;
  change: string;
  billTitle: string;
  direction: number;
  magnitude: number;
  fiscalImpact: number | null;
  current: boolean;
  affectedGroups: readonly string[];
  dimensionEffects?: Partial<Record<IdeologyAxis, number>>;
};

export type LegislativeProvisionDefinition = {
  id: string;
  issueId: string;
  category: string;
  currentLawLabel: string;
  options: readonly LegislativeProvisionOption[];
};

function provision(
  id: string,
  issueId: string,
  category: string,
  currentLawLabel: string,
  low: readonly [string, string, string],
  middle: readonly [string, string, string],
  high: readonly [string, string, string],
  fiscal: readonly [number | null, number | null, number | null] = [null, null, null],
): LegislativeProvisionDefinition {
  const optionId = (label: string): string =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return {
    id,
    issueId,
    category,
    currentLawLabel,
    options: [
      { id: optionId(low[0]), label: low[0], change: low[1], billTitle: low[2], direction: -1, magnitude: 0.65, fiscalImpact: fiscal[0], current: false, affectedGroups: groupsForIssue(issueId) },
      { id: optionId(middle[0]), label: middle[0], change: middle[1], billTitle: middle[2], direction: 0, magnitude: 0.2, fiscalImpact: fiscal[1], current: true, affectedGroups: groupsForIssue(issueId) },
      { id: optionId(high[0]), label: high[0], change: high[1], billTitle: high[2], direction: 1, magnitude: 0.65, fiscalImpact: fiscal[2], current: false, affectedGroups: groupsForIssue(issueId) },
    ],
  };
}

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
  if (options.length < 2 || options.filter((option) => option.current).length !== 1) {
    throw new Error(`${id} must define at least two alternatives and exactly one current-law option`);
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
    current?: boolean;
    affectedGroups?: readonly string[];
    dimensionEffects?: Partial<Record<IdeologyAxis, number>>;
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
    current: args.current === true,
    affectedGroups: args.affectedGroups ?? [],
    ...(args.dimensionEffects ? { dimensionEffects: args.dimensionEffects } : {}),
  };
}

/** Concrete, public legislative choices. Ideological issues remain evaluation dimensions, not bill text. */
export const LEGISLATIVE_PROVISIONS: readonly LegislativeProvisionDefinition[] = [
  provision("PROV_BARGAINING_SCOPE", "ISS_LABOR", "Collective bargaining coverage", "Workplace bargaining with voluntary sector agreements",
    ["Workplace agreements only", "Ends statutory sector-wide bargaining and leaves agreements to individual workplaces.", "Workplace Bargaining Bill"],
    ["Keep current coverage", "Leaves existing workplace and voluntary sector agreements in force.", "Collective Bargaining Continuity Bill"],
    ["Sector bargaining standard", "Creates binding sector bargaining councils for covered industries.", "Sector Bargaining Standards Bill"], [-0.04, 0, 0.08]),
  provision("PROV_CHILD_BENEFIT", "ISS_WELFARE", "Child benefit eligibility", "Income-tested benefit for low- and middle-income households",
    ["Narrow eligibility", "Limits the child benefit to low-income households.", "Child Benefit Targeting Bill"],
    ["Keep income test", "Retains the present income-tested child benefit.", "Family Support Continuity Bill"],
    ["Universal benefit", "Pays the child benefit to every household with eligible children.", "Universal Child Benefit Bill"], [-0.12, 0, 0.22]),
  provision("PROV_RAIL_OWNERSHIP", "ISS_OWNERSHIP", "National rail ownership", "Mixed public infrastructure and private train operations",
    ["Private concessions", "Moves passenger operations to long-term private concessions.", "Passenger Rail Concessions Bill"],
    ["Keep mixed system", "Retains public infrastructure and private train operations.", "Rail Operations Continuity Bill"],
    ["Public operator", "Creates one public operator for interprovincial passenger rail.", "National Passenger Rail Bill"], [-0.12, 0, 0.18]),
  provision("PROV_STRATEGIC_TARIFFS", "ISS_TRADE", "Strategic import safeguards", "Cabinet may impose temporary safeguards after an injury finding",
    ["End safeguard power", "Repeals the temporary safeguard process for industrial imports.", "Open Markets Bill"],
    ["Keep injury test", "Retains temporary safeguards after an independent injury finding.", "Trade Safeguards Continuity Bill"],
    ["Broaden safeguards", "Allows safeguards for designated strategic industries before severe injury occurs.", "Strategic Industries Safeguards Bill"], [-0.08, 0, 0.12]),
  provision("PROV_HOUSING_APPROVALS", "ISS_HOUSING", "Housing approval rules", "Provinces set approval rules within national safety law",
    ["Province discretion", "Removes national housing-supply deadlines and leaves approvals to provinces.", "Provincial Planning Freedom Bill"],
    ["Keep current rules", "Retains provincial approvals under national safety law.", "Planning Administration Continuity Bill"],
    ["Supply deadlines", "Requires large cities to decide qualifying housing applications within fixed deadlines.", "Housing Approvals and Supply Bill"], [-0.05, 0, 0.16]),
  provision("PROV_CLEAN_POWER", "ISS_CLIMATE", "Electricity clean-power standard", "Utilities follow a gradual national clean-power schedule",
    ["Pause the schedule", "Suspends the next clean-power requirement for four years.", "Energy Reliability Pause Bill"],
    ["Keep current schedule", "Retains the current clean-power timetable.", "Clean Power Continuity Bill"],
    ["Advance the schedule", "Moves the next two clean-power deadlines forward and funds grid connections.", "Clean Electricity Acceleration Bill"], [-0.08, 0, 0.2]),
  provision("PROV_REPRODUCTIVE_LAW", "ISS_LIBERTY", "Reproductive health law", "National law permits abortion within a statutory time limit",
    ["Province discretion", "Allows each province to set abortion law, subject to emergency-care protections.", "Provincial Reproductive Law Bill"],
    ["Keep statutory limit", "Retains the existing national time limit and medical exceptions.", "Reproductive Health Continuity Bill"],
    ["National protection", "Guarantees lawful abortion access through the national statutory limit in every province.", "Reproductive Health Protection Bill"], [null, null, 0.05]),
  provision("PROV_RESIDENCY_PATH", "ISS_IMMIGRATION", "Permanent residency eligibility", "Five-year lawful-residence route with language and civic requirements",
    ["Longer residency route", "Raises the qualifying period for permanent residency to eight years.", "Residency Qualification Bill"],
    ["Keep five-year route", "Retains the present five-year route and civic requirements.", "Residency Law Continuity Bill"],
    ["Shorter residency route", "Reduces the qualifying period to three years for applicants meeting work and civic requirements.", "Residency Access Bill"], [-0.03, 0, 0.04]),
  provision("PROV_POLICE_COMPLAINTS", "ISS_POLICING", "Police misconduct review", "Provincial bodies investigate complaints under national minimum standards",
    ["Independent review", "Creates an independent national inspector with power to reopen serious cases.", "Independent Police Review Bill"],
    ["Keep provincial review", "Retains provincial review bodies and national minimum standards.", "Police Review Continuity Bill"],
    ["Internal review", "Returns ordinary misconduct investigations to police internal-affairs units.", "Police Discipline Bill"], [0.09, 0, -0.04]),
  provision("PROV_REVENUE_DISCRETION", "ISS_DECENT", "Provincial revenue authority", "Provinces may levy a limited property surcharge",
    ["National uniformity", "Repeals the provincial property surcharge and replaces it with a national transfer formula.", "National Revenue Uniformity Bill"],
    ["Keep limited surcharge", "Retains the present provincial property-surcharge authority.", "Provincial Revenue Continuity Bill"],
    ["Broader local authority", "Allows provinces to vary the surcharge within a wider statutory band.", "Provincial Revenue Powers Bill"], [-0.06, 0, 0.03]),
  provision("PROV_EMERGENCY_RENEWAL", "ISS_EXEC", "Emergency-power renewal", "Assembly approval is required after the initial emergency period",
    ["Shorter initial period", "Requires Assembly approval after seven days of emergency authority.", "Emergency Powers Safeguards Bill"],
    ["Keep current renewal", "Retains the existing Assembly renewal deadline.", "Emergency Administration Continuity Bill"],
    ["Longer executive period", "Extends the President's initial emergency authority before an Assembly vote.", "Emergency Powers Extension Bill"], [null, null, null]),
  provision("PROV_DONOR_DISCLOSURE", "ISS_REFORM", "Campaign donor disclosure", "Large donations are published during the campaign",
    ["Annual disclosure", "Moves large-donor publication to one annual filing after the election.", "Campaign Reporting Bill"],
    ["Keep current disclosure", "Retains campaign-period publication of large donations.", "Election Disclosure Continuity Bill"],
    ["Rapid disclosure", "Requires publication of large donations within five working days.", "Rapid Campaign Disclosure Bill"], [-0.02, 0, 0.04]),
  provision("PROV_CONCORD_PROCUREMENT", "ISS_CONCORD", "Concord defense procurement", "Lorsain may join projects after separate Cabinet approval",
    ["Domestic preference", "Requires a domestic-source preference for major defense procurement.", "Defense Procurement Preference Bill"],
    ["Keep project review", "Retains project-by-project participation after Cabinet review.", "Defense Cooperation Continuity Bill"],
    ["Joint procurement", "Authorizes a standing framework for joint Concord procurement.", "Concord Joint Procurement Bill"], [-0.04, 0, 0.08]),
  provision("PROV_VASKARA_SANCTIONS", "ISS_VASKARA", "Vaskara sanctions authority", "Targeted sanctions require a published executive finding",
    ["Narrow sanctions", "Limits new sanctions to named security officials and military suppliers.", "Targeted Sanctions Limitation Bill"],
    ["Keep finding process", "Retains targeted sanctions after a published executive finding.", "Sanctions Procedure Continuity Bill"],
    ["Broaden sanctions", "Adds state banks and strategic exporters to the available sanctions list.", "Vaskara Strategic Sanctions Bill"], [null, null, null]),
  provision("PROV_READINESS_FUND", "ISS_DEFENSE", "Defense readiness appropriation", "Readiness funding follows the enacted annual budget",
    ["Reduce readiness fund", "Reduces the equipment-readiness appropriation for the next two fiscal years.", "Defense Savings Bill"],
    ["Keep current funding", "Retains the current equipment-readiness appropriation.", "Readiness Funding Continuity Bill"],
    ["Increase readiness fund", "Adds a four-year appropriation for maintenance, reserves and equipment replacement.", "Defense Readiness Investment Bill"], [-0.16, 0, 0.24]),
  provision("PROV_PRIMARY_CARE", "ISS_WELFARE", "Primary care coverage", "National insurance covers essential primary care with limited copayments",
    ["Higher copayments", "Raises copayments for routine primary-care visits while preserving exemptions.", "Primary Care Contributions Bill"],
    ["Keep current coverage", "Retains existing primary-care benefits and copayments.", "Primary Care Continuity Bill"],
    ["No routine copayment", "Removes routine primary-care copayments and expands rural clinic grants.", "Universal Primary Care Bill"], [-0.12, 0, 0.24]),
  provision("PROV_TUITION_SUPPORT", "ISS_WELFARE", "Public university tuition", "Students pay capped tuition with income-tested grants",
    ["Higher tuition cap", "Raises the tuition cap and narrows income-tested grants.", "University Finance Bill"],
    ["Keep capped tuition", "Retains the current tuition cap and grant rules.", "Higher Education Continuity Bill"],
    ["Tuition-free first degree", "Funds a tuition-free first undergraduate degree at public universities.", "Public University Access Bill"], [-0.15, 0, 0.28]),
  provision("PROV_INCOME_TAX", "ISS_WELFARE", "Top income-tax rate", "A progressive national schedule applies to personal income",
    ["Lower top rate", "Reduces the top personal income-tax rate by four points.", "Income Tax Reduction Bill"],
    ["Keep current schedule", "Retains the current progressive income-tax schedule.", "Income Tax Continuity Bill"],
    ["Higher top rate", "Raises the top rate on the highest income band by four points.", "High Income Contribution Bill"], [-0.2, 0, 0.18]),
  provision("PROV_UNEMPLOYMENT_INSURANCE", "ISS_WELFARE", "Unemployment insurance duration", "Benefits are earnings-related for a fixed insured period",
    ["Shorter insured period", "Shortens the standard insured benefit period by twelve weeks.", "Employment Insurance Targeting Bill"],
    ["Keep current duration", "Retains the present insured benefit period.", "Employment Insurance Continuity Bill"],
    ["Extended downturn benefit", "Adds twelve weeks of benefits when provincial unemployment rises sharply.", "Employment Security Bill"], [-0.11, 0, 0.2]),
  provision("PROV_UNION_RECOGNITION", "ISS_LABOR", "Union recognition", "Recognition normally follows a supervised workplace ballot",
    ["Voluntary recognition", "Allows an employer to recognize a union without a statutory process.", "Voluntary Recognition Bill"],
    ["Mandatory ballot", "Retains the supervised workplace ballot for recognition.", "Union Ballot Continuity Bill"],
    ["Majority sign-up", "Requires recognition when a verified majority signs union cards.", "Majority Sign-Up Bill"], [null, null, 0.03]),
  provision("PROV_STRIKE_NOTICE", "ISS_LABOR", "Strike notice", "Unions must give seven days' notice before protected action",
    ["Fourteen-day notice", "Requires fourteen days' notice before protected industrial action.", "Industrial Action Notice Bill"],
    ["Keep seven days", "Retains the seven-day notice requirement.", "Strike Notice Continuity Bill"],
    ["Three-day notice", "Reduces the notice period for protected action to three days.", "Protected Action Bill"], [-0.02, 0, 0.03]),
  provision("PROV_PUBLIC_HOUSING", "ISS_HOUSING", "Public housing fund", "The national fund co-finances provincial social housing",
    ["Smaller capital fund", "Reduces new national public-housing commitments for three years.", "Housing Fund Restraint Bill"],
    ["Keep current fund", "Retains current public-housing capital grants.", "Public Housing Continuity Bill"],
    ["Expand capital fund", "Funds a five-year expansion of provincial social-housing construction.", "Public Housing Investment Bill"], [-0.1, 0, 0.3]),
  provision("PROV_TRANSIT_ZONING", "ISS_HOUSING", "Transit-oriented development grants", "Cities may seek grants for housing near major transit",
    ["End density grants", "Ends national grants tied to housing density near transit stations.", "Local Planning Bill"],
    ["Keep voluntary grants", "Retains voluntary grants for transit-oriented housing plans.", "Transit Housing Continuity Bill"],
    ["Priority density grants", "Prioritizes infrastructure grants for cities permitting more homes near transit.", "Transit-Oriented Housing Bill"], [-0.04, 0, 0.16]),
  provision("PROV_INFRASTRUCTURE_BANK", "ISS_OWNERSHIP", "National infrastructure finance", "Large projects use ordinary appropriations and private lending",
    ["Private project finance", "Requires qualifying infrastructure projects to seek private finance first.", "Infrastructure Finance Bill"],
    ["Keep current finance", "Retains ordinary appropriations and project lending.", "Infrastructure Finance Continuity Bill"],
    ["Public infrastructure bank", "Creates a public bank for long-term transport, water and energy loans.", "National Infrastructure Bank Bill"], [-0.08, 0, 0.22]),
  provision("PROV_FARM_STABILIZATION", "ISS_TRADE", "Farm income stabilization", "Emergency farm support requires a declared market disruption",
    ["Market insurance only", "Replaces emergency price support with privately delivered crop insurance.", "Agricultural Risk Bill"],
    ["Keep emergency support", "Retains support after a declared market disruption.", "Farm Support Continuity Bill"],
    ["Stabilization payments", "Creates temporary payments when designated farm prices fall below a published benchmark.", "Farm Income Stabilization Bill"], [-0.08, 0, 0.18]),
  provision("PROV_CARBON_PRICE", "ISS_CLIMATE", "Industrial carbon price", "Large emitters pay a nationally administered carbon levy",
    ["Repeal industrial levy", "Repeals the carbon levy for large industrial emitters.", "Industrial Energy Cost Bill"],
    ["Keep current levy", "Retains the current levy and rebate schedule.", "Carbon Pricing Continuity Bill"],
    ["Raise and rebate", "Raises the levy on large emitters and returns part of the revenue to households.", "Carbon Levy and Rebate Bill"], [-0.1, 0, 0.16]),
  provision("PROV_SURVEILLANCE_WARRANT", "ISS_LIBERTY", "Digital surveillance warrants", "Police need a judicial warrant to obtain private communications",
    ["Emergency access window", "Allows temporary access before a warrant in narrowly defined emergencies.", "Emergency Communications Access Bill"],
    ["Keep prior warrant", "Retains the prior judicial-warrant requirement.", "Communications Privacy Continuity Bill"],
    ["Stricter warrant test", "Requires a heightened necessity finding for bulk or location surveillance.", "Digital Privacy Safeguards Bill"], [null, null, 0.03]),
  provision("PROV_SENTENCING", "ISS_POLICING", "Serious repeat-offense sentencing", "Judges apply statutory ranges with stated reasons for departure",
    ["Expanded rehabilitation", "Expands treatment and supervised-release alternatives within statutory ranges.", "Sentencing Rehabilitation Bill"],
    ["Keep judicial ranges", "Retains current sentencing ranges and reasoned departures.", "Sentencing Continuity Bill"],
    ["Mandatory minimum term", "Sets a minimum custodial term for defined serious repeat offenses.", "Repeat Offender Sentencing Bill"], [0.08, 0, -0.06]),
  provision("PROV_ELECTION_ADMIN", "ISS_REFORM", "National election administration", "A national commission sets standards while provinces staff polling",
    ["Province-run standards", "Returns polling standards and administration to provincial election offices.", "Provincial Elections Administration Bill"],
    ["Keep shared administration", "Retains national standards with provincial staffing.", "Election Administration Continuity Bill"],
    ["Independent national service", "Creates an independent national service to administer federal polling directly.", "Independent Elections Service Bill"], [-0.04, 0, 0.1]),
  provision("PROV_SCHOOL_MEALS", "ISS_WELFARE", "School meal eligibility", "Subsidized meals are available through an income test",
    ["Narrow income test", "Limits subsidized school meals to the lowest income band.", "School Meals Targeting Bill"],
    ["Keep income test", "Retains current school-meal eligibility.", "School Meals Continuity Bill"],
    ["Universal school meals", "Funds a meal for every pupil in participating public schools.", "Universal School Meals Bill"], [-0.07, 0, 0.15]),
  variableProvision("PROV_HEALTH_INSURANCE_MODEL", "ISS_WELFARE", "Healthcare financing model", "National insurance funds essential care through public and contracted providers", [
    option("regulated_private_insurance", "Regulated private insurance", "Replaces national insurance with mandatory regulated private plans and income-tested subsidies.", "Health Insurance Choice Bill", { direction: -0.8, fiscalImpact: -0.18, affectedGroups: ["Patients", "Insurers", "Employers"], dimensionEffects: { economic: -0.75, authority: -0.25 } }),
    option("nonprofit_insurance_funds", "Nonprofit insurance funds", "Creates competing nonprofit sickness funds under one national benefit schedule.", "Nonprofit Health Funds Bill", { direction: -0.25, fiscalImpact: 0.04, affectedGroups: ["Patients", "Nonprofit funds", "Providers"], dimensionEffects: { economic: -0.15, authority: 0.15 } }),
    option("national_insurance", "National insurance", "Retains national insurance with public and contracted providers.", "Health Insurance Continuity Bill", { direction: 0.15, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Patients", "Providers", "Taxpayers"], dimensionEffects: { economic: 0.2, authority: 0.1 } }),
    option("national_health_service", "National health service", "Moves core hospitals and primary care into one publicly operated national service.", "National Health Service Bill", { direction: 0.9, fiscalImpact: 0.34, affectedGroups: ["Patients", "Health workers", "Taxpayers"], dimensionEffects: { economic: 0.9, authority: 0.5 } }),
  ]),
  variableProvision("PROV_MEDICINE_PRICING", "ISS_WELFARE", "Prescription medicine purchasing", "Insurers reimburse medicines after national price negotiation", [
    option("market_pricing", "Market pricing", "Ends national price negotiation and permits insurers to set separate formularies.", "Medicines Market Bill", { direction: -0.8, fiscalImpact: -0.1, affectedGroups: ["Patients", "Drug makers", "Insurers"] }),
    option("reference_pricing", "International reference pricing", "Caps reimbursement using prices in comparable countries.", "Fair Medicines Pricing Bill", { direction: 0.25, fiscalImpact: -0.05, affectedGroups: ["Patients", "Drug makers", "Insurers"], dimensionEffects: { economic: 0.2, globalism: 0.35 } }),
    option("negotiated_prices", "National negotiation", "Retains national negotiation with separate insurer reimbursement.", "Medicines Purchasing Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Patients", "Drug makers", "Insurers"] }),
    option("single_public_purchaser", "Single public purchaser", "Creates one public purchaser for covered prescription medicines.", "National Medicines Purchasing Bill", { direction: 0.85, fiscalImpact: 0.08, affectedGroups: ["Patients", "Pharmacies", "Drug makers"], dimensionEffects: { economic: 0.85, authority: 0.35 } }),
  ]),
  variableProvision("PROV_HOSPITAL_GOVERNANCE", "ISS_WELFARE", "Hospital governance", "Public hospital boards operate within national funding standards", [
    option("contracted_hospital_networks", "Contracted hospital networks", "Allows provinces to contract regional hospital systems to nonprofit or private operators.", "Hospital Networks Bill", { direction: -0.6, fiscalImpact: -0.05, affectedGroups: ["Patients", "Hospital staff", "Provincial governments"], dimensionEffects: { economic: -0.45, authority: -0.3 } }),
    option("public_hospital_boards", "Public hospital boards", "Retains locally governed public hospital boards under national standards.", "Hospital Governance Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Patients", "Hospital boards", "Provinces"] }),
    option("integrated_regional_authorities", "Regional health authorities", "Combines hospitals and community care under elected regional health authorities.", "Regional Health Authorities Bill", { direction: 0.55, fiscalImpact: 0.14, affectedGroups: ["Patients", "Health workers", "Regional authorities"], dimensionEffects: { economic: 0.35, authority: -0.25 } }),
  ]),
  variableProvision("PROV_CHILDCARE_MODEL", "ISS_WELFARE", "Early-childhood care", "Income-tested childcare subsidies support licensed providers", [
    option("tax_credit", "Childcare tax credit", "Replaces direct subsidies with a refundable household tax credit.", "Childcare Tax Credit Bill", { direction: -0.45, fiscalImpact: -0.03, affectedGroups: ["Parents", "Childcare providers", "Taxpayers"] }),
    option("income_tested_subsidy", "Income-tested subsidy", "Retains income-tested support for licensed childcare.", "Childcare Support Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Parents", "Childcare providers", "Taxpayers"] }),
    option("universal_fee_cap", "Universal fee cap", "Caps fees for licensed childcare and reimburses providers for eligible places.", "Affordable Childcare Bill", { direction: 0.55, fiscalImpact: 0.2, affectedGroups: ["Parents", "Children", "Childcare providers"] }),
    option("public_childcare_network", "Public childcare network", "Builds a national network of publicly operated early-childhood centers.", "Early Childhood Service Bill", { direction: 0.9, fiscalImpact: 0.38, affectedGroups: ["Parents", "Children", "Childcare workers"], dimensionEffects: { economic: 0.85, authority: 0.4 } }),
  ]),
  variableProvision("PROV_VOCATIONAL_TRAINING", "ISS_LABOR", "Vocational training governance", "Employers, unions and colleges share apprenticeship standards", [
    option("employer_led_credentials", "Employer-led credentials", "Lets accredited employer groups set occupational credentials and training hours.", "Skills Accreditation Bill", { direction: -0.55, fiscalImpact: -0.06, affectedGroups: ["Apprentices", "Employers", "Colleges"] }),
    option("tripartite_apprenticeships", "Tripartite apprenticeships", "Retains joint employer, union and college apprenticeship standards.", "Apprenticeship Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Apprentices", "Employers", "Trade unions"] }),
    option("public_training_guarantee", "Public training guarantee", "Guarantees a funded training place to young adults not in work or education.", "Training Guarantee Bill", { direction: 0.75, fiscalImpact: 0.24, affectedGroups: ["Young adults", "Colleges", "Employers"] }),
  ]),
  variableProvision("PROV_MINIMUM_WAGE", "ISS_LABOR", "Minimum-wage setting", "An independent commission recommends annual adjustments", [
    option("province_minimums", "Provincial minimums", "Ends the national floor and leaves minimum wages to Provincial Assemblies.", "Provincial Wage Standards Bill", { direction: -0.65, fiscalImpact: -0.02, affectedGroups: ["Low-wage workers", "Employers", "Provinces"], dimensionEffects: { economic: -0.4, authority: -0.6 } }),
    option("commission_recommendation", "Commission recommendation", "Retains annual recommendations from the independent wage commission.", "Minimum Wage Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Low-wage workers", "Employers", "Wage commission"] }),
    option("wage_indexation", "Wage indexation", "Indexes the national minimum to median wages with an emergency review clause.", "Fair Wage Indexation Bill", { direction: 0.55, fiscalImpact: 0.04, affectedGroups: ["Low-wage workers", "Employers", "Consumers"] }),
    option("living_wage_floor", "Living-wage floor", "Raises the floor toward a published household living-cost benchmark over three years.", "Living Wage Bill", { direction: 0.9, fiscalImpact: 0.1, affectedGroups: ["Low-wage workers", "Employers", "Households"] }),
  ]),
  variableProvision("PROV_PLATFORM_WORK", "ISS_LABOR", "Platform-worker status", "Status is decided case by case under the ordinary employment test", [
    option("independent_contractor_safe_harbor", "Contractor safe harbor", "Treats platform workers as contractors when written flexibility conditions are met.", "Independent Platform Work Bill", { direction: -0.75, fiscalImpact: -0.04, affectedGroups: ["Platform workers", "Digital platforms", "Consumers"] }),
    option("case_by_case_test", "Case-by-case test", "Retains the ordinary employment-status test for platform work.", "Platform Work Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Platform workers", "Digital platforms", "Courts"] }),
    option("employee_presumption", "Employee presumption", "Presumes employee status unless a platform proves genuine independent enterprise.", "Platform Worker Protections Bill", { direction: 0.8, fiscalImpact: 0.05, affectedGroups: ["Platform workers", "Digital platforms", "Labor inspectors"] }),
  ]),
  variableProvision("PROV_PAID_LEAVE", "ISS_LABOR", "Paid family leave", "Twelve weeks of earnings-related leave are financed through social insurance", [
    option("employer_leave", "Employer-funded leave", "Replaces social insurance with a minimum employer-funded leave duty.", "Family Leave Responsibility Bill", { direction: -0.55, fiscalImpact: -0.12, affectedGroups: ["Parents", "Employers", "Workers"] }),
    option("twelve_week_insurance", "Twelve-week insurance", "Retains twelve weeks of earnings-related social-insurance leave.", "Family Leave Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Parents", "Employers", "Workers"] }),
    option("sixteen_week_insurance", "Sixteen-week insurance", "Extends insured family leave to sixteen weeks.", "Family Leave Extension Bill", { direction: 0.5, fiscalImpact: 0.14, affectedGroups: ["Parents", "Children", "Employers"] }),
    option("shared_parental_year", "Shared parental year", "Creates a year of shared leave with reserved periods for each parent.", "Shared Parental Leave Bill", { direction: 0.9, fiscalImpact: 0.32, affectedGroups: ["Parents", "Children", "Employers"] }),
  ]),
  variableProvision("PROV_RENT_POLICY", "ISS_HOUSING", "Rent stabilization", "Cities may cap annual increases in designated high-pressure areas", [
    option("market_rents", "Market rents", "Repeals local rent-increase caps while preserving notice and habitability rules.", "Rental Market Bill", { direction: -0.8, fiscalImpact: -0.03, affectedGroups: ["Renters", "Landlords", "Cities"] }),
    option("pressure_area_caps", "High-pressure area caps", "Retains local caps in designated high-pressure housing areas.", "Rent Stabilization Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Renters", "Landlords", "Cities"] }),
    option("national_rent_stabilization", "National stabilization rule", "Limits annual increases for existing tenancies nationwide, with renovation exemptions.", "National Rent Stabilization Bill", { direction: 0.8, fiscalImpact: 0.08, affectedGroups: ["Renters", "Landlords", "Housing agencies"] }),
  ]),
  variableProvision("PROV_LAND_VALUE_TAX", "ISS_HOUSING", "Land taxation", "Local property tax applies to assessed land and buildings", [
    option("building_value_tax", "Property-value tax", "Retains taxation of both land and buildings under local assessment.", "Property Tax Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Property owners", "Municipalities", "Developers"] }),
    option("split_rate_tax", "Split-rate tax", "Taxes land at a higher rate than buildings to discourage vacant and underused sites.", "Productive Land Tax Bill", { direction: 0.35, fiscalImpact: -0.03, affectedGroups: ["Landowners", "Developers", "Municipalities"], dimensionEffects: { economic: 0.25, authority: -0.1 } }),
    option("land_value_tax", "Land-value tax", "Replaces the building-value charge with a tax on unimproved site value.", "Land Value Tax Bill", { direction: 0.65, fiscalImpact: -0.08, affectedGroups: ["Landowners", "Developers", "Municipalities"], dimensionEffects: { economic: 0.45, authority: -0.15 } }),
  ]),
  variableProvision("PROV_INHERITANCE_TAX", "ISS_WELFARE", "Inheritance taxation", "Large estates pay tax above a protected family allowance", [
    option("repeal_estate_tax", "Repeal estate tax", "Repeals inheritance tax and retains ordinary capital-gains rules on inherited assets.", "Estate Tax Repeal Bill", { direction: -0.9, fiscalImpact: -0.22, affectedGroups: ["Heirs", "Large estates", "Taxpayers"] }),
    option("family_business_exemption", "Family-business exemption", "Exempts qualifying operating businesses while retaining tax on other large estates.", "Family Enterprise Succession Bill", { direction: -0.35, fiscalImpact: -0.1, affectedGroups: ["Family businesses", "Heirs", "Taxpayers"] }),
    option("protected_allowance", "Protected allowance", "Retains the current protected allowance and progressive estate rates.", "Inheritance Tax Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Heirs", "Large estates", "Taxpayers"] }),
    option("progressive_estate_rates", "Higher large-estate rates", "Adds higher bands for the largest estates and closes trust-avoidance rules.", "Large Estates Contribution Bill", { direction: 0.8, fiscalImpact: -0.18, affectedGroups: ["Large estates", "Heirs", "Public services"] }),
  ]),
  variableProvision("PROV_CORPORATE_TAX", "ISS_WELFARE", "Corporate tax base", "A national rate applies after investment and loss deductions", [
    option("territorial_low_rate", "Territorial low rate", "Cuts the rate and exempts most qualifying foreign profits.", "Competitive Corporate Tax Bill", { direction: -0.85, fiscalImpact: -0.25, affectedGroups: ["Companies", "Investors", "Taxpayers"], dimensionEffects: { economic: -0.75, globalism: 0.35 } }),
    option("investment_allowance", "Investment allowance", "Keeps the rate but accelerates deductions for new domestic capital investment.", "Business Investment Allowance Bill", { direction: -0.25, fiscalImpact: -0.12, affectedGroups: ["Companies", "Workers", "Investors"] }),
    option("current_tax_base", "Current tax base", "Retains the national rate and current deduction rules.", "Corporate Tax Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Companies", "Investors", "Taxpayers"] }),
    option("minimum_effective_tax", "Minimum effective tax", "Sets a minimum effective rate for large corporate groups after deductions.", "Corporate Minimum Tax Bill", { direction: 0.75, fiscalImpact: -0.18, affectedGroups: ["Large companies", "Taxpayers", "Public services"], dimensionEffects: { economic: 0.65, globalism: -0.15 } }),
  ]),
  variableProvision("PROV_ELECTRICITY_MARKET", "ISS_OWNERSHIP", "Electricity market structure", "Regulated utilities buy power from public and private generators", [
    option("competitive_retail_market", "Competitive retail market", "Allows households to choose competing electricity retailers using regulated networks.", "Electricity Choice Bill", { direction: -0.85, fiscalImpact: -0.08, affectedGroups: ["Households", "Utilities", "Generators"], dimensionEffects: { economic: -0.8, authority: -0.25 } }),
    option("regulated_private_utilities", "Regulated private utilities", "Moves distribution utilities into long-term regulated private franchises.", "Electricity Franchises Bill", { direction: -0.45, fiscalImpact: -0.12, affectedGroups: ["Households", "Utilities", "Investors"] }),
    option("mixed_regulated_system", "Mixed regulated system", "Retains regulated utilities and mixed public-private generation.", "Electricity Market Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Households", "Utilities", "Generators"] }),
    option("public_grid_operator", "Public grid operator", "Creates a public system operator while retaining independent generators.", "National Grid Operator Bill", { direction: 0.45, fiscalImpact: 0.14, affectedGroups: ["Households", "Grid workers", "Generators"], dimensionEffects: { economic: 0.45, authority: 0.35 } }),
    option("public_generation_authority", "Public generation authority", "Establishes a public authority to own new strategic generation and storage.", "Public Power Authority Bill", { direction: 0.9, fiscalImpact: 0.32, affectedGroups: ["Households", "Energy workers", "Taxpayers"], dimensionEffects: { economic: 0.9, authority: 0.45, green: 0.3 } }),
  ]),
  variableProvision("PROV_NUCLEAR_POLICY", "ISS_CLIMATE", "Nuclear energy policy", "Existing reactors may operate while new projects require separate legislation", [
    option("managed_phaseout", "Managed phaseout", "Closes existing reactors at the end of their licensed lives and prohibits replacement plants.", "Nuclear Phaseout Bill", { direction: -0.35, fiscalImpact: 0.12, affectedGroups: ["Energy workers", "Electricity users", "Host communities"], dimensionEffects: { green: 0.55, authority: 0.15 } }),
    option("case_by_case_authorization", "Case-by-case authorization", "Retains separate legislative approval for each new nuclear project.", "Nuclear Energy Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Electricity users", "Regulators", "Host communities"] }),
    option("standardized_new_build", "Standardized new build", "Creates a licensing and finance framework for a fleet of standardized reactors.", "Nuclear Generation Bill", { direction: 0.65, fiscalImpact: 0.3, affectedGroups: ["Electricity users", "Energy workers", "Taxpayers"], dimensionEffects: { green: 0.35, authority: 0.45, economic: 0.2 } }),
  ]),
  variableProvision("PROV_WATER_ENFORCEMENT", "ISS_CLIMATE", "Water-pollution enforcement", "Provincial inspectors enforce national discharge standards", [
    option("province_only_enforcement", "Provincial enforcement", "Repeals national intervention powers and leaves inspections to provinces.", "Provincial Water Administration Bill", { direction: -0.6, fiscalImpact: -0.06, affectedGroups: ["Provinces", "Industry", "Water users"], dimensionEffects: { green: -0.45, authority: -0.6 } }),
    option("shared_enforcement", "Shared enforcement", "Retains provincial inspection under national discharge standards.", "Water Standards Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Provinces", "Industry", "Water users"] }),
    option("national_enforcement_office", "National enforcement office", "Creates a national office able to inspect major dischargers and levy civil penalties.", "Clean Water Enforcement Bill", { direction: 0.8, fiscalImpact: 0.12, affectedGroups: ["Water users", "Industry", "Environmental agencies"], dimensionEffects: { green: 0.8, authority: 0.5 } }),
  ]),
  variableProvision("PROV_BROADBAND", "ISS_OWNERSHIP", "Broadband infrastructure", "Private networks receive targeted rural buildout grants", [
    option("market_only_buildout", "Market-led buildout", "Ends national buildout grants and relies on commercial network investment.", "Broadband Market Bill", { direction: -0.75, fiscalImpact: -0.14, affectedGroups: ["Rural households", "Network firms", "Taxpayers"] }),
    option("targeted_rural_grants", "Targeted rural grants", "Retains grants for unserved rural and remote communities.", "Broadband Access Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Rural households", "Network firms", "Local governments"] }),
    option("public_open_access_network", "Public open-access network", "Builds public fiber infrastructure leased on equal terms to retail providers.", "National Open Network Bill", { direction: 0.85, fiscalImpact: 0.3, affectedGroups: ["Households", "Network workers", "Retail providers"], dimensionEffects: { economic: 0.75, authority: 0.35 } }),
  ]),
  variableProvision("PROV_ASYLUM_PROCESS", "ISS_IMMIGRATION", "Asylum procedure", "Applicants receive an interview, legal review and appeal while claims are processed", [
    option("safe_country_summary_process", "Safe-country summary process", "Uses a shortened procedure for applicants from designated safe countries, with judicial review.", "Safe Country Procedure Bill", { direction: -0.7, fiscalImpact: -0.06, affectedGroups: ["Asylum seekers", "Border officials", "Courts"], dimensionEffects: { social: -0.55, authority: 0.45, globalism: -0.4 } }),
    option("standard_review", "Standard review", "Retains an interview, legal review and appeal during processing.", "Asylum Procedure Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Asylum seekers", "Caseworkers", "Courts"] }),
    option("independent_case_agency", "Independent case agency", "Transfers initial decisions to an independent agency with published timeliness standards.", "Independent Asylum Decisions Bill", { direction: 0.3, fiscalImpact: 0.08, affectedGroups: ["Asylum seekers", "Caseworkers", "Courts"], dimensionEffects: { social: 0.2, authority: -0.25 } }),
    option("right_to_work_after_six_months", "Work rights after six months", "Allows applicants to work when a first decision has not been made within six months.", "Asylum Applicant Work Rights Bill", { direction: 0.65, fiscalImpact: 0.03, affectedGroups: ["Asylum seekers", "Employers", "Local services"], dimensionEffects: { social: 0.45, economic: -0.1, globalism: 0.35 } }),
  ]),
  variableProvision("PROV_ELECTORAL_FORMULA", "ISS_REFORM", "Assembly electoral formula", "Multi-member constituencies elect members by single transferable vote", [
    option("closed_party_lists", "Closed provincial lists", "Replaces constituency STV with closed provincial party lists.", "Provincial List Elections Bill", { direction: -0.2, fiscalImpact: -0.03, affectedGroups: ["Voters", "Political parties", "Election officials"], dimensionEffects: { authority: 0.55, social: -0.1 } }),
    option("mixed_member_system", "Mixed-member system", "Elects half the Assembly locally and uses party lists to restore proportionality.", "Mixed Member Representation Bill", { direction: 0.25, fiscalImpact: 0.1, affectedGroups: ["Voters", "Candidates", "Political parties"], dimensionEffects: { authority: -0.2, social: 0.15 } }),
    option("single_transferable_vote", "Single transferable vote", "Retains multi-member constituency elections by transferable vote.", "Electoral System Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Voters", "Candidates", "Election officials"] }),
    option("national_compensatory_seats", "National compensatory seats", "Keeps constituency STV and adds a small national tier to correct severe disproportionality.", "Fair Representation Bill", { direction: 0.55, fiscalImpact: 0.12, affectedGroups: ["Voters", "Political parties", "Election officials"], dimensionEffects: { authority: -0.4, social: 0.2 } }),
  ]),
  variableProvision("PROV_FIREARMS_LICENSING", "ISS_POLICING", "Civilian firearms licensing", "Applicants pass background, training and safe-storage checks", [
    option("basic_background_check", "Basic background check", "Removes mandatory training and renewals while retaining criminal-record checks.", "Firearms Licensing Reform Bill", { direction: -0.75, fiscalImpact: -0.04, affectedGroups: ["Firearms owners", "Police", "Communities"], dimensionEffects: { social: -0.45, authority: -0.55 } }),
    option("training_and_storage_license", "Training and storage license", "Retains background, training, renewal and safe-storage requirements.", "Firearms Licensing Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Firearms owners", "Police", "Communities"] }),
    option("permit_and_registration", "Permit and registration", "Adds registration and a demonstrated-need permit for restricted firearms.", "Firearms Safety Bill", { direction: 0.8, fiscalImpact: 0.08, affectedGroups: ["Firearms owners", "Police", "Communities"], dimensionEffects: { social: 0.45, authority: 0.65 } }),
  ]),
  variableProvision("PROV_FARMLAND_POLICY", "ISS_TRADE", "Agricultural land policy", "Provinces regulate conversion and foreign purchase of designated farmland", [
    option("open_land_market", "Open land market", "Repeals national restrictions on large foreign purchases and leaves conversion rules to provinces.", "Agricultural Land Market Bill", { direction: -0.7, fiscalImpact: -0.03, affectedGroups: ["Farmers", "Landowners", "Investors"], dimensionEffects: { economic: -0.5, globalism: 0.55, authority: -0.35 } }),
    option("provincial_land_controls", "Provincial land controls", "Retains provincial conversion rules and national review of large foreign purchases.", "Farmland Policy Continuity Bill", { direction: 0, magnitude: 0.2, fiscalImpact: 0, current: true, affectedGroups: ["Farmers", "Provinces", "Investors"] }),
    option("working_farm_protection", "Working-farm protection", "Creates a national conservation covenant and right of first refusal for working farmers.", "Working Farmland Protection Bill", { direction: 0.7, fiscalImpact: 0.12, affectedGroups: ["Farmers", "Rural communities", "Landowners"], dimensionEffects: { economic: 0.35, nationalism: 0.4, green: 0.3 } }),
  ]),
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
  if (optionId === "current") return definition.options.find((candidate) => candidate.current) ?? null;
  if (optionId === "low") return definition.options.slice().sort((a, b) => a.direction - b.direction || a.id.localeCompare(b.id))[0] ?? null;
  if (optionId === "high") return definition.options.slice().sort((a, b) => b.direction - a.direction || a.id.localeCompare(b.id))[0] ?? null;
  return null;
}

export function defaultProvisionOptionId(provisionId: string): string {
  const definition = legislativeProvision(provisionId);
  return (
    definition?.options.find((candidate) => !candidate.current)?.id ??
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
  return definition.options.slice().sort((a, b) =>
    Math.abs(a.direction - item.direction) - Math.abs(b.direction - item.direction) ||
    Number(a.current) - Number(b.current) || a.id.localeCompare(b.id)
  )[0] ?? null;
}

export function currentProvisionOption(state: SimState, provisionId: string): LegislativeProvisionOption | null {
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((law) => law.operative)
    .sort((a, b) => b.enactedDate.localeCompare(a.enactedDate) || b.id.localeCompare(a.id));
  for (const law of laws) {
    const item = law.policyItems.find((candidate) => candidate.provisionId === provisionId);
    if (item) return optionForPolicyItem(item);
  }
  return legislativeProvision(provisionId)?.options.find((option) => option.current) ?? null;
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
    const category = resolved[0]!.definition.category.replace(/ (rules|law|eligibility|coverage|authority)$/i, "");
    const second = resolved[1]!.definition.category.replace(/ (rules|law|eligibility|coverage|authority)$/i, "");
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
  const option = definition.options.slice().sort((a, b) =>
    Math.abs(a.direction - item.direction) - Math.abs(b.direction - item.direction) ||
    Number(a.current) - Number(b.current) || a.id.localeCompare(b.id)
  )[0]!;
  return policyItemForProvision(definition.id, option.id) ?? { ...item };
}
