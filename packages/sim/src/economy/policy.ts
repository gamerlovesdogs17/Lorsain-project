import type { PolicyItem } from "../legislature/types.js";
import { optionForPolicyItem, provisionForPolicyItem } from "../legislature/provisions.js";
import type { EconomyLagKind, NationalEconomyIndices } from "./types.js";

export const INDEX_FLOOR = 40;
export const INDEX_CEIL = 160;
export const HISTORY_MONTHS = 120;
export const MAX_MONTHLY_INDEX_MOVE = 1.8;

export function clampIndex(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.max(INDEX_FLOOR, Math.min(INDEX_CEIL, n));
}

export function clampFiscal(n: number): number {
  if (!Number.isFinite(n)) return 0.35;
  return Math.max(0, Math.min(1, n));
}

export function lagMonths(kind: EconomyLagKind): number {
  if (kind === "short") return 1;
  if (kind === "medium") return 3;
  return 8;
}

export function lagKindForIssue(issueId: string): EconomyLagKind {
  if (issueId === "ISS_HOUSING" || issueId === "ISS_CLIMATE") return "longer";
  if (issueId === "ISS_LABOR" || issueId === "ISS_TRADE") return "medium";
  return "short";
}

type SpecificEffectTable = Partial<NationalEconomyIndices>;

/** Option-specific monthly index deltas when provisionId+optionId are known. */
const PROVISION_OPTION_EFFECTS: Record<string, Record<string, SpecificEffectTable>> = {
  // ── ISS_LABOR ──────────────────────────────────────────────────────
  PROV_UNEMPLOYMENT_INSURANCE: {
    eight_week_benefits: { confidenceIndex: -0.08, fiscalPressure: -0.06, realWageIndex: -0.12 },
    eighteen_week_benefits: { confidenceIndex: 0.06, fiscalPressure: 0.05, realWageIndex: 0.08 },
    twenty_six_week_benefits: { confidenceIndex: 0.12, fiscalPressure: 0.1, realWageIndex: 0.14 },
    forty_week_benefits: { confidenceIndex: 0.18, fiscalPressure: 0.16, realWageIndex: 0.2 },
  },
  PROV_PAID_LEAVE: {
    employer_leave: { realWageIndex: -0.1, fiscalPressure: -0.1, confidenceIndex: -0.06 },
    eight_week_insurance: { realWageIndex: -0.05, fiscalPressure: -0.08, confidenceIndex: -0.04 },
    sixteen_week_insurance: { realWageIndex: 0.1, fiscalPressure: 0.08, confidenceIndex: 0.06 },
    twenty_six_week_insurance: { realWageIndex: 0.16, fiscalPressure: 0.12, confidenceIndex: 0.1 },
    shared_parental_year: { realWageIndex: 0.22, fiscalPressure: 0.2, confidenceIndex: 0.14 },
  },
  PROV_MINIMUM_WAGE: {
    province_minimums: { realWageIndex: -0.14, employmentIndex: 0.08, outputIndex: 0.06 },
    wage_floor_12: { realWageIndex: -0.1, employmentIndex: 0.06, outputIndex: 0.04 },
    wage_indexation: { realWageIndex: 0.08, employmentIndex: -0.04, outputIndex: -0.06 },
    living_wage_floor: { realWageIndex: 0.16, employmentIndex: -0.08, outputIndex: -0.1 },
  },
  PROV_BARGAINING_SCOPE: {
    no_statutory_framework: { realWageIndex: -0.14, employmentIndex: 0.06, outputIndex: 0.08, confidenceIndex: -0.04 },
    workplace_agreements_only: { realWageIndex: -0.08, employmentIndex: 0.04, outputIndex: 0.04, confidenceIndex: -0.02 },
    enterprise_wide: { realWageIndex: 0.06, employmentIndex: -0.02, outputIndex: -0.04, confidenceIndex: 0.04 },
    voluntary_sector_councils: { realWageIndex: 0.1, employmentIndex: -0.04, outputIndex: -0.06, confidenceIndex: 0.06 },
    binding_sector_councils: { realWageIndex: 0.14, employmentIndex: -0.06, outputIndex: -0.1, confidenceIndex: 0.08 },
    national_wage_council: { realWageIndex: 0.18, employmentIndex: -0.1, outputIndex: -0.14, confidenceIndex: 0.1 },
  },
  PROV_UNION_RECOGNITION: {
    voluntary_recognition: { realWageIndex: -0.1, employmentIndex: 0.04, confidenceIndex: -0.06 },
    card_check_threshold: { realWageIndex: 0.06, employmentIndex: -0.02, confidenceIndex: 0.04 },
    majority_sign_up: { realWageIndex: 0.12, employmentIndex: -0.06, confidenceIndex: 0.06 },
  },
  PROV_STRIKE_NOTICE: {
    cooling_off_and_ballot: { outputIndex: 0.06, employmentIndex: 0.02, confidenceIndex: -0.04 },
    fourteen_day_notice: { outputIndex: 0.03, employmentIndex: 0.01, confidenceIndex: -0.02 },
    rolling_notice_window: { outputIndex: -0.06, employmentIndex: -0.02, realWageIndex: 0.06 },
  },
  PROV_PLATFORM_WORK: {
    independent_contractor_safe_harbor: { employmentIndex: 0.06, realWageIndex: -0.08, outputIndex: 0.04 },
    hybrid_status_framework: { employmentIndex: 0.02, realWageIndex: 0.04, fiscalPressure: 0.02 },
    employee_presumption: { employmentIndex: -0.04, realWageIndex: 0.1, fiscalPressure: 0.04 },
  },
  PROV_VOCATIONAL_TRAINING: {
    employer_led_credentials: { employmentIndex: 0.04, outputIndex: 0.04, fiscalPressure: -0.04 },
    national_skills_credential: { employmentIndex: 0.06, outputIndex: 0.04, fiscalPressure: 0.04 },
    public_training_guarantee: { employmentIndex: 0.1, outputIndex: 0.06, fiscalPressure: 0.1 },
  },

  // ── ISS_WELFARE ────────────────────────────────────────────────────
  PROV_INCOME_TAX: {
    top_rate_30: { fiscalPressure: -0.14, outputIndex: 0.12, confidenceIndex: 0.06 },
    broader_base_lower_top: { fiscalPressure: -0.08, outputIndex: 0.06, confidenceIndex: 0.04 },
    millionaire_surtax: { fiscalPressure: 0.1, outputIndex: -0.08, confidenceIndex: -0.04 },
    top_rate_45: { fiscalPressure: 0.14, outputIndex: -0.12, confidenceIndex: -0.06 },
  },
  PROV_CORPORATE_TAX: {
    rate_15_territorial: { fiscalPressure: -0.18, outputIndex: 0.16, confidenceIndex: 0.1 },
    investment_allowance: { fiscalPressure: -0.08, outputIndex: 0.08, confidenceIndex: 0.04 },
    minimum_effective_tax: { fiscalPressure: 0.12, outputIndex: -0.1, confidenceIndex: -0.05 },
    rate_28_progressive: { fiscalPressure: 0.16, outputIndex: -0.14, confidenceIndex: -0.08 },
  },
  PROV_CHILD_BENEFIT: {
    narrow_eligibility: { fiscalPressure: -0.06, confidenceIndex: -0.06, realWageIndex: -0.04 },
    expanded_middle: { fiscalPressure: 0.06, confidenceIndex: 0.06, realWageIndex: 0.04 },
    near_universal: { fiscalPressure: 0.1, confidenceIndex: 0.08, realWageIndex: 0.06 },
    universal_benefit: { fiscalPressure: 0.14, confidenceIndex: 0.1, realWageIndex: 0.08 },
  },
  PROV_PRIMARY_CARE: {
    visit_fee_schedule: { fiscalPressure: -0.06, confidenceIndex: -0.06, realWageIndex: -0.04 },
    means_tested_copay: { fiscalPressure: -0.04, confidenceIndex: -0.03, realWageIndex: -0.02 },
    zero_copay_rural: { fiscalPressure: 0.04, confidenceIndex: 0.04, realWageIndex: 0.02 },
    capitation_and_clinics: { fiscalPressure: 0.1, confidenceIndex: 0.06, realWageIndex: 0.04 },
  },
  PROV_TUITION_SUPPORT: {
    higher_tuition_cap: { fiscalPressure: -0.06, confidenceIndex: -0.04, employmentIndex: 0.02 },
    income_contingent_loans: { fiscalPressure: -0.03, confidenceIndex: 0.02, employmentIndex: 0.02 },
    means_tested_stipend: { fiscalPressure: 0.06, confidenceIndex: 0.04, employmentIndex: 0.04 },
    tuition_free_first_degree: { fiscalPressure: 0.12, confidenceIndex: 0.06, employmentIndex: 0.06 },
  },
  PROV_SCHOOL_MEALS: {
    narrow_income_test: { fiscalPressure: -0.04, confidenceIndex: -0.04 },
    universal_school_meals: { fiscalPressure: 0.08, confidenceIndex: 0.06 },
  },
  PROV_HEALTH_INSURANCE_MODEL: {
    regulated_private_insurance: { fiscalPressure: -0.1, confidenceIndex: -0.06, outputIndex: 0.04 },
    nonprofit_insurance_funds: { fiscalPressure: 0.02, confidenceIndex: 0.02 },
    national_health_service: { fiscalPressure: 0.14, confidenceIndex: 0.08, employmentIndex: 0.04 },
  },
  PROV_MEDICINE_PRICING: {
    market_pricing: { priceIndex: 0.06, fiscalPressure: -0.06, confidenceIndex: -0.04 },
    reference_pricing: { priceIndex: -0.04, fiscalPressure: -0.02, confidenceIndex: 0.02 },
    single_public_purchaser: { priceIndex: -0.08, fiscalPressure: 0.04, confidenceIndex: 0.04 },
  },
  PROV_HOSPITAL_GOVERNANCE: {
    contracted_hospital_networks: { fiscalPressure: -0.03, outputIndex: 0.02, confidenceIndex: -0.04 },
    national_quality_standards: { fiscalPressure: 0.02, confidenceIndex: 0.04 },
    integrated_regional_authorities: { fiscalPressure: 0.06, confidenceIndex: 0.04, employmentIndex: 0.02 },
  },
  PROV_CHILDCARE_MODEL: {
    tax_credit: { fiscalPressure: -0.02, employmentIndex: 0.02, confidenceIndex: -0.02 },
    universal_fee_cap: { fiscalPressure: 0.08, employmentIndex: 0.06, confidenceIndex: 0.06 },
    public_childcare_network: { fiscalPressure: 0.14, employmentIndex: 0.08, confidenceIndex: 0.08 },
  },
  PROV_INHERITANCE_TAX: {
    repeal_estate_tax: { fiscalPressure: -0.1, confidenceIndex: -0.04, outputIndex: 0.04 },
    family_business_exemption: { fiscalPressure: -0.04, confidenceIndex: 0.02, outputIndex: 0.02 },
    progressive_estate_rates: { fiscalPressure: 0.08, confidenceIndex: 0.02, outputIndex: -0.02 },
  },

  // ── ISS_OWNERSHIP ──────────────────────────────────────────────────
  PROV_RAIL_OWNERSHIP: {
    private_infrastructure: { outputIndex: 0.06, fiscalPressure: -0.1, employmentIndex: -0.04, confidenceIndex: -0.06 },
    private_concessions: { outputIndex: 0.04, fiscalPressure: -0.06, employmentIndex: -0.02, confidenceIndex: -0.02 },
    open_access_private: { outputIndex: 0.02, fiscalPressure: -0.03, confidenceIndex: 0.02 },
    public_with_competition: { outputIndex: -0.02, fiscalPressure: 0.04, employmentIndex: 0.02 },
    public_operator: { outputIndex: -0.04, fiscalPressure: 0.08, employmentIndex: 0.04, confidenceIndex: 0.04 },
    integrated_public_authority: { outputIndex: -0.08, fiscalPressure: 0.12, employmentIndex: 0.06, confidenceIndex: 0.06 },
  },
  PROV_INFRASTRUCTURE_BANK: {
    private_project_finance: { outputIndex: 0.04, fiscalPressure: -0.04, employmentIndex: -0.02 },
    regional_finance_pools: { outputIndex: 0.04, fiscalPressure: 0.04, employmentIndex: 0.04 },
    public_infrastructure_bank: { outputIndex: 0.08, fiscalPressure: 0.1, employmentIndex: 0.06 },
  },
  PROV_ELECTRICITY_MARKET: {
    competitive_retail_market: { priceIndex: -0.06, outputIndex: 0.04, fiscalPressure: -0.04 },
    regulated_private_utilities: { priceIndex: -0.02, outputIndex: 0.02, fiscalPressure: -0.06 },
    public_grid_operator: { priceIndex: 0.02, fiscalPressure: 0.06, employmentIndex: 0.04 },
    public_generation_authority: { priceIndex: 0.04, fiscalPressure: 0.12, employmentIndex: 0.06 },
  },
  PROV_BROADBAND: {
    market_only_buildout: { outputIndex: -0.02, fiscalPressure: -0.06, employmentIndex: -0.02 },
    middle_mile_cooperative: { outputIndex: 0.04, fiscalPressure: 0.04, employmentIndex: 0.04 },
    public_open_access_network: { outputIndex: 0.08, fiscalPressure: 0.12, employmentIndex: 0.06 },
  },

  // ── ISS_TRADE ──────────────────────────────────────────────────────
  PROV_STRATEGIC_TARIFFS: {
    end_safeguard_power: { priceIndex: -0.08, outputIndex: 0.04, employmentIndex: -0.04 },
    injury_only_safeguards: { priceIndex: -0.04, outputIndex: 0.02, employmentIndex: -0.02 },
    strategic_list_safeguards: { priceIndex: 0.06, outputIndex: -0.04, employmentIndex: 0.04 },
    broaden_safeguards: { priceIndex: 0.1, outputIndex: -0.08, employmentIndex: 0.06 },
  },
  PROV_FARM_STABILIZATION: {
    market_insurance_only: { priceIndex: -0.04, fiscalPressure: -0.04, outputIndex: 0.02 },
    price_floor_insurance: { priceIndex: 0.02, fiscalPressure: 0.03, confidenceIndex: 0.02 },
    stabilization_payments: { priceIndex: 0.06, fiscalPressure: 0.08, confidenceIndex: 0.04 },
  },
  PROV_FARMLAND_POLICY: {
    open_land_market: { outputIndex: 0.04, priceIndex: -0.02, confidenceIndex: -0.04 },
    foreign_ownership_cap: { outputIndex: -0.02, confidenceIndex: 0.04 },
    working_farm_protection: { outputIndex: -0.04, confidenceIndex: 0.06, fiscalPressure: 0.04 },
  },

  // ── ISS_HOUSING ────────────────────────────────────────────────────
  PROV_HOUSING_APPROVALS: {
    province_discretion: { housingIndex: -0.08, confidenceIndex: -0.04, outputIndex: -0.02 },
    provincial_targets: { housingIndex: -0.04, confidenceIndex: 0.02 },
    supply_deadlines: { housingIndex: 0.1, outputIndex: 0.06, confidenceIndex: 0.04 },
    national_zoning_override: { housingIndex: 0.16, outputIndex: 0.08, confidenceIndex: 0.06, fiscalPressure: 0.06 },
  },
  PROV_PUBLIC_HOUSING: {
    voucher_shift: { housingIndex: -0.06, fiscalPressure: -0.04, confidenceIndex: -0.04 },
    capital_maintenance_only: { housingIndex: -0.04, fiscalPressure: -0.02 },
    build_to_rent_program: { housingIndex: 0.12, fiscalPressure: 0.12, confidenceIndex: 0.04 },
  },
  PROV_TRANSIT_ZONING: {
    end_density_grants: { housingIndex: -0.06, outputIndex: -0.02, fiscalPressure: -0.02 },
    mandatory_density_bonus: { housingIndex: 0.06, outputIndex: 0.04, fiscalPressure: 0.04 },
    priority_density_grants: { housingIndex: 0.1, outputIndex: 0.06, fiscalPressure: 0.06 },
  },
  PROV_RENT_POLICY: {
    market_rents: { housingIndex: -0.08, priceIndex: 0.06, confidenceIndex: -0.06 },
    national_rent_stabilization: {
      housingIndex: 0.1,
      priceIndex: -0.06,
      confidenceIndex: 0.04,
      fiscalPressure: 0.04,
    },
  },
  PROV_LAND_VALUE_TAX: {
    gradual_land_shift: { housingIndex: 0.06, outputIndex: 0.04, fiscalPressure: -0.02 },
    split_rate_tax: { housingIndex: 0.04, outputIndex: 0.02 },
    land_value_tax: { housingIndex: 0.08, outputIndex: 0.06, fiscalPressure: -0.04 },
  },

  // ── ISS_CLIMATE ────────────────────────────────────────────────────
  PROV_CARBON_PRICE: {
    repeal_industrial_levy: { priceIndex: -0.12, outputIndex: 0.08, fiscalPressure: -0.06 },
    levy_25: { priceIndex: -0.08, outputIndex: 0.06, fiscalPressure: -0.05 },
    levy_65: { priceIndex: 0.12, outputIndex: -0.1, fiscalPressure: 0.08 },
    levy_95: { priceIndex: 0.18, outputIndex: -0.16, fiscalPressure: 0.12 },
  },
  PROV_CLEAN_POWER: {
    reliability_deferral: { outputIndex: 0.06, priceIndex: -0.08, employmentIndex: -0.02 },
    technology_neutral_standard: { outputIndex: 0.02, priceIndex: -0.02, employmentIndex: 0.02 },
    accelerate_clean_power: { outputIndex: -0.08, priceIndex: 0.1, employmentIndex: 0.04, fiscalPressure: 0.06 },
    zero_carbon_grid_mandate: { outputIndex: -0.14, priceIndex: 0.16, employmentIndex: 0.06, fiscalPressure: 0.12 },
  },
  PROV_NUCLEAR_POLICY: {
    managed_phaseout: { outputIndex: -0.04, priceIndex: 0.06, fiscalPressure: 0.06 },
    life_extension_refurbishment: { outputIndex: 0.04, priceIndex: -0.04, fiscalPressure: 0.06 },
    standardized_new_build: { outputIndex: 0.06, priceIndex: -0.06, fiscalPressure: 0.12 },
  },
  PROV_WATER_ENFORCEMENT: {
    province_only_enforcement: { outputIndex: 0.03, fiscalPressure: -0.03, confidenceIndex: -0.04 },
    industry_self_monitoring: { outputIndex: 0.02, fiscalPressure: -0.01 },
    national_enforcement_office: { outputIndex: -0.04, fiscalPressure: 0.06, confidenceIndex: 0.04 },
  },

  // ── ISS_LIBERTY ────────────────────────────────────────────────────
  PROV_REPRODUCTIVE_LAW: {
    province_discretion: { confidenceIndex: -0.06 },
    early_statutory_limit: { confidenceIndex: -0.04 },
    extended_statutory_limit: { confidenceIndex: 0.04, fiscalPressure: 0.02 },
    national_protection: { confidenceIndex: 0.06, fiscalPressure: 0.02 },
  },
  PROV_SURVEILLANCE_WARRANT: {
    emergency_access_window: { confidenceIndex: -0.06 },
    stricter_warrant_test: { confidenceIndex: 0.06 },
  },

  // ── ISS_IMMIGRATION ────────────────────────────────────────────────
  PROV_RESIDENCY_PATH: {
    points_and_sponsorship: { employmentIndex: 0.04, fiscalPressure: -0.02, confidenceIndex: -0.04 },
    humanitarian_track: { employmentIndex: 0.02, fiscalPressure: 0.03, confidenceIndex: 0.04 },
    ten_year_residence: { employmentIndex: -0.04, confidenceIndex: -0.02, fiscalPressure: -0.02 },
    earned_settlement_track: { employmentIndex: 0.06, confidenceIndex: 0.04, fiscalPressure: 0.02 },
  },
  PROV_ASYLUM_PROCESS: {
    safe_country_summary_process: { employmentIndex: -0.02, fiscalPressure: -0.03, confidenceIndex: -0.04 },
    independent_case_agency: { confidenceIndex: 0.03, fiscalPressure: 0.04 },
    right_to_work_after_six_months: { employmentIndex: 0.04, confidenceIndex: 0.04, fiscalPressure: 0.02 },
  },

  // ── ISS_POLICING ───────────────────────────────────────────────────
  PROV_POLICE_COMPLAINTS: {
    independent_review: { confidenceIndex: 0.06, fiscalPressure: 0.04 },
    national_standards_only: { confidenceIndex: 0.03, fiscalPressure: 0.01 },
    civilian_review_boards: { confidenceIndex: 0.04, fiscalPressure: 0.03 },
    internal_review: { confidenceIndex: -0.06, fiscalPressure: -0.02 },
  },
  PROV_SENTENCING: {
    expanded_rehabilitation: { fiscalPressure: 0.04, confidenceIndex: 0.04 },
    drug_treatment_alternative: { fiscalPressure: 0.02, confidenceIndex: 0.02 },
    mandatory_minimum_term: { fiscalPressure: -0.03, confidenceIndex: -0.04 },
  },
  PROV_FIREARMS_LICENSING: {
    basic_background_check: { confidenceIndex: -0.06, fiscalPressure: -0.02 },
    renewal_every_five_years: { confidenceIndex: 0.03, fiscalPressure: 0.01 },
    permit_and_registration: { confidenceIndex: 0.04, fiscalPressure: 0.04 },
  },

  // ── ISS_DECENT ─────────────────────────────────────────────────────
  PROV_REVENUE_DISCRETION: {
    national_uniformity: { fiscalPressure: -0.04, confidenceIndex: -0.02, outputIndex: 0.02 },
    fixed_surcharge_band: { fiscalPressure: -0.02, confidenceIndex: 0.02 },
    municipal_revenue_share: { fiscalPressure: 0.02, confidenceIndex: 0.04, outputIndex: 0.02 },
    broader_local_authority: { fiscalPressure: 0.04, outputIndex: 0.04, confidenceIndex: 0.02 },
  },

  // ── ISS_EXEC ───────────────────────────────────────────────────────
  PROV_EMERGENCY_RENEWAL: {
    standing_oversight_panel: { confidenceIndex: 0.06 },
    forty_eight_hour_renewal: { confidenceIndex: 0.04 },
    thirty_day_initial_window: { confidenceIndex: -0.03 },
    cabinet_continuity_window: { confidenceIndex: -0.06 },
  },

  // ── ISS_REFORM ─────────────────────────────────────────────────────
  PROV_DONOR_DISCLOSURE: {
    annual_disclosure: { confidenceIndex: -0.06 },
    threshold_only_filing: { confidenceIndex: -0.03 },
    real_time_small_donor: { confidenceIndex: 0.04 },
    rapid_disclosure: { confidenceIndex: 0.06 },
  },
  PROV_ELECTION_ADMIN: {
    province_run_standards: { confidenceIndex: -0.04, fiscalPressure: -0.02 },
    sole_party_registration: { confidenceIndex: -0.14 },
    independent_national_service: { confidenceIndex: 0.06, fiscalPressure: 0.04 },
    multiparty_registration_commission: { confidenceIndex: 0.08, fiscalPressure: 0.03 },
  },
  PROV_ELECTORAL_FORMULA: {
    closed_party_lists: { confidenceIndex: -0.04 },
    mixed_member_system: { confidenceIndex: 0.04, fiscalPressure: 0.04 },
    open_multiparty_stv: { confidenceIndex: 0.04, fiscalPressure: 0.04 },
    national_compensatory_seats: { confidenceIndex: 0.06, fiscalPressure: 0.06 },
  },

  // ── ISS_CONCORD ────────────────────────────────────────────────────
  PROV_CONCORD_PROCUREMENT: {
    domestic_preference: { outputIndex: 0.02, fiscalPressure: -0.02, priceIndex: 0.04 },
    joint_procurement: { outputIndex: -0.04, fiscalPressure: 0.04, confidenceIndex: 0.06 },
  },

  // ── ISS_VASKARA ────────────────────────────────────────────────────
  PROV_VASKARA_SANCTIONS: {
    officials_only_list: { outputIndex: 0.02, priceIndex: -0.02, confidenceIndex: -0.04 },
    sectoral_trade_restrictions: { outputIndex: -0.04, priceIndex: 0.04, confidenceIndex: 0.02 },
    assembly_approval_required: { confidenceIndex: 0.04 },
    strategic_exporter_list: { outputIndex: -0.06, priceIndex: 0.06, confidenceIndex: 0.04 },
  },

  // ── ISS_DEFENSE ────────────────────────────────────────────────────
  PROV_READINESS_FUND: {
    deferred_maintenance_freeze: { fiscalPressure: -0.08, employmentIndex: -0.04, confidenceIndex: -0.06 },
    maintenance_only_budget: { fiscalPressure: -0.04, employmentIndex: -0.02, confidenceIndex: -0.03 },
    rapid_reaction_brigade: { fiscalPressure: 0.06, employmentIndex: 0.04, confidenceIndex: 0.04 },
    reserves_and_stockpile_plan: { fiscalPressure: 0.1, employmentIndex: 0.06, confidenceIndex: 0.06 },
  },
};

function parameterScaledDelta(
  provisionId: string,
  parameterValue: number,
  baseline: number,
): SpecificEffectTable | null {
  const span = Math.max(1, Math.abs(parameterValue - baseline));
  const sign = Math.sign(parameterValue - baseline);
  if (sign === 0) return null;

  if (provisionId === "PROV_UNEMPLOYMENT_INSURANCE" || provisionId === "PROV_PAID_LEAVE") {
    const scale = (span / baseline) * 0.55;
    return {
      fiscalPressure: sign * scale * 0.14,
      confidenceIndex: sign * scale * 0.12,
      realWageIndex: sign * scale * 0.1,
    };
  }
  if (provisionId === "PROV_INCOME_TAX" || provisionId === "PROV_CORPORATE_TAX") {
    const scale = (span / baseline) * 0.5;
    return {
      fiscalPressure: -sign * scale * 0.16,
      outputIndex: sign * scale * 0.12,
      confidenceIndex: sign * scale * 0.05,
    };
  }
  if (provisionId === "PROV_CARBON_PRICE") {
    const scale = (span / baseline) * 0.45;
    return {
      priceIndex: sign * scale * 0.14,
      outputIndex: -sign * scale * 0.1,
      fiscalPressure: sign * scale * 0.08,
    };
  }
  if (provisionId === "PROV_MINIMUM_WAGE") {
    const scale = (span / baseline) * 0.48;
    return {
      realWageIndex: sign * scale * 0.18,
      employmentIndex: -sign * scale * 0.08,
      outputIndex: -sign * scale * 0.06,
    };
  }
  if (provisionId === "PROV_CHILD_BENEFIT") {
    const scale = (span / 140) * 0.4;
    return {
      fiscalPressure: sign * scale * 0.12,
      confidenceIndex: sign * scale * 0.1,
      realWageIndex: sign * scale * 0.06,
    };
  }
  // Generic fallback: any provision with founding parameterValue gets a mild
  // confidence + fiscal effect proportional to the deviation from baseline.
  const scale = Math.min(1, (span / Math.max(1, baseline)) * 0.4);
  return {
    confidenceIndex: sign * scale * 0.06,
    fiscalPressure: sign * scale * 0.04,
  };
}

function foundingParameterValue(provisionId: string): number | null {
  const definition = provisionForPolicyItem({
    issueId: "",
    provisionId,
    direction: 0,
    magnitude: 0,
    fiscalImpact: null,
  });
  return definition?.options.find((row) => row.founding)?.parameterValue ?? null;
}

/** Proposal-specific deltas from option tables or parameterValue scaling. */
export function proposalSpecificIndexDelta(item: PolicyItem): Partial<NationalEconomyIndices> | null {
  // Prefer actual parameter values when present so numeric law uses the enacted figure.
  const option = optionForPolicyItem(item);
  if (option?.parameterValue != null && item.provisionId) {
    const baseline =
      foundingParameterValue(item.provisionId) ??
      provisionForPolicyItem(item)?.options.find((row) => row.founding)?.parameterValue ??
      null;
    if (baseline != null) {
      const scaled = parameterScaledDelta(item.provisionId, option.parameterValue, baseline);
      if (scaled) return scaled;
    }
  }

  if (item.provisionId && item.optionId) {
    const table = PROVISION_OPTION_EFFECTS[item.provisionId]?.[item.optionId];
    if (table) return { ...table };
  }

  return null;
}

/** Tradeoff deltas per unit of direction*magnitude, applied as one month's slice. */
export function directionMagnitudeIndexDelta(item: PolicyItem): Partial<NationalEconomyIndices> {
  const u = item.direction * item.magnitude * 0.55;
  const out: Partial<NationalEconomyIndices> = {};
  if (item.issueId === "ISS_LABOR") {
    out.realWageIndex = u * 0.7;
    out.employmentIndex = u * 0.25;
    out.outputIndex = -u * 0.35;
    out.priceIndex = u * 0.2;
    out.confidenceIndex = u * 0.1;
  } else if (item.issueId === "ISS_WELFARE") {
    out.realWageIndex = u * 0.35;
    out.confidenceIndex = u * 0.45;
    out.fiscalPressure = u * 0.08;
    out.outputIndex = -u * 0.15;
    out.priceIndex = u * 0.12;
  } else if (item.issueId === "ISS_OWNERSHIP") {
    out.outputIndex = u * 0.2;
    out.employmentIndex = -u * 0.12;
    out.confidenceIndex = u * 0.08;
    out.realWageIndex = -u * 0.18;
  } else if (item.issueId === "ISS_TRADE") {
    out.outputIndex = u * 0.4;
    out.priceIndex = u * 0.35;
    out.employmentIndex = u * 0.15;
    out.confidenceIndex = -Math.abs(u) * 0.08;
  } else if (item.issueId === "ISS_HOUSING") {
    out.housingIndex = u * 0.7;
    out.priceIndex = -u * 0.15;
    out.confidenceIndex = u * 0.2;
    out.outputIndex = u * 0.08;
  } else if (item.issueId === "ISS_CLIMATE") {
    out.outputIndex = -u * 0.22;
    out.priceIndex = u * 0.18;
    out.employmentIndex = u * 0.12;
    out.confidenceIndex = u * 0.1;
    out.housingIndex = u * 0.06;
  } else {
    out.confidenceIndex = u * 0.08;
    out.outputIndex = u * 0.05;
  }
  if (item.fiscalImpact != null) {
    out.fiscalPressure = (out.fiscalPressure ?? 0) + item.fiscalImpact * 0.04;
  }
  return out;
}

export function policyIndexDelta(item: PolicyItem): Partial<NationalEconomyIndices> {
  const specific = proposalSpecificIndexDelta(item);
  if (specific) {
    const out = { ...specific };
    if (item.fiscalImpact != null) {
      out.fiscalPressure = (out.fiscalPressure ?? 0) + item.fiscalImpact * 0.04;
    }
    return out;
  }
  return directionMagnitudeIndexDelta(item);
}

export function addIndexDelta(
  national: NationalEconomyIndices,
  delta: Partial<NationalEconomyIndices>,
  scale: number,
): void {
  const cap = MAX_MONTHLY_INDEX_MOVE;
  const apply = (key: keyof NationalEconomyIndices, clampFn: (n: number) => number) => {
    const d = delta[key];
    if (typeof d !== "number" || !Number.isFinite(d)) return;
    const move = Math.max(-cap, Math.min(cap, d * scale));
    national[key] = clampFn(national[key] + move);
  };
  apply("outputIndex", clampIndex);
  apply("employmentIndex", clampIndex);
  apply("priceIndex", clampIndex);
  apply("realWageIndex", clampIndex);
  apply("housingIndex", clampIndex);
  apply("confidenceIndex", clampIndex);
  apply("fiscalPressure", clampFiscal);
}
