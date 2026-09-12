import { currentProvisionOption } from "../legislature/provisions.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import {
  contentCooldownEligible,
  recordContentCooldown,
  readContentCooldownRegistry,
} from "../content/cooldown.js";
import { ensureGoverningRuntime } from "./state.js";
import type { DepartmentId } from "./types.js";
import { clampUnit } from "./capacity.js";

export type ExecutiveSituationTemplate = {
  id: string;
  departmentId: DepartmentId;
  minMonthsBetween: number;
  importance: number;
  titles: readonly string[];
  when: (world: KernelWorld, state: SimState) => boolean;
  apply?: (state: SimState) => void;
};

function implDelayedOnIssue(state: SimState, issueId: string): boolean {
  const runtime = ensureGoverningRuntime(state);
  return Object.values(runtime.implementations).some(
    (r) =>
      (r.status === "delayed" || r.status === "blocked") &&
      state.legislatureRuntime.enactedLaws[r.lawId]?.policyItems.some((i) => i.issueId === issueId),
  );
}

export const EXECUTIVE_SITUATIONS: readonly ExecutiveSituationTemplate[] = [
  {
    id: "sit_energy_grid_congestion",
    departmentId: "energy",
    minMonthsBetween: 8,
    importance: 0.52,
    titles: [
      "Grid congestion complicates clean-power rollout",
      "Energy ministry warns of transmission bottlenecks",
      "Regional grid stress slows climate delivery",
    ],
    when: (_world, state) => {
      const carbon = currentProvisionOption(state, "PROV_CARBON_PRICE");
      const market = currentProvisionOption(state, "PROV_ELECTRICITY_MARKET");
      const runtime = ensureGoverningRuntime(state);
      return Boolean(
        (carbon?.id.includes("levy_65") || carbon?.id.includes("levy_95")) &&
        (market?.id.includes("competitive") || market?.id.includes("market")) &&
        runtime.services.infrastructureQuality < 0.5,
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.strain = clampUnit(runtime.capacity.strain + 0.04);
    },
  },
  {
    id: "sit_asylum_case_backlog",
    departmentId: "interior",
    minMonthsBetween: 10,
    importance: 0.5,
    titles: [
      "Asylum casework backlog draws provincial criticism",
      "Interior faces pressure over asylum processing delays",
      "Border provinces cite asylum administration strain",
    ],
    when: (_world, state) => {
      const asylum = currentProvisionOption(state, "PROV_ASYLUM_PROCESS");
      return Boolean(
        asylum?.id.includes("safe_country") &&
        (implDelayedOnIssue(state, "ISS_IMMIGRATION") ||
          ensureGoverningRuntime(state).services.administrativeDelivery < 0.42),
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.03,
      );
    },
  },
  {
    id: "sit_consumer_credit_complaints",
    departmentId: "economy",
    minMonthsBetween: 12,
    importance: 0.48,
    titles: [
      "Consumer finance complaints spike after rule changes",
      "Economy ministry reviews lending supervision gaps",
      "Household debt stories dominate oversight hearings",
    ],
    when: (_world, state) => {
      const finance = currentProvisionOption(state, "PROV_CONSUMER_FINANCE");
      return (
        finance != null &&
        !finance.founding &&
        finance.id.includes("market_disclosure") &&
        ensureGoverningRuntime(state).capacity.departments.economy < 0.45
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.025,
      );
      runtime.capacity.departments.economy = clampUnit(runtime.capacity.departments.economy - 0.03);
    },
  },
  {
    id: "sit_police_oversight_hearing",
    departmentId: "justice",
    minMonthsBetween: 9,
    importance: 0.55,
    titles: [
      "Justice minister faces police oversight hearing",
      "Complaint review standards enter a public dispute",
      "Civil-rights groups press for stronger police accountability",
    ],
    when: (_world, state) => {
      const complaints = currentProvisionOption(state, "PROV_POLICE_COMPLAINTS");
      const cameras = currentProvisionOption(state, "PROV_BODY_CAMERA");
      return (
        (complaints?.id.includes("civilian") || complaints?.id.includes("independent")) === true &&
        cameras?.id.includes("mandatory") === true &&
        ensureGoverningRuntime(state).services.publicSafety < 0.48
      );
    },
  },
  {
    id: "sit_data_privacy_breach_response",
    departmentId: "interior",
    minMonthsBetween: 14,
    importance: 0.58,
    titles: [
      "Data breach response tests cross-border privacy rules",
      "Interior coordinates agency response to privacy incident",
      "Digital privacy standards face a live stress test",
    ],
    when: (_world, state) => {
      const data = currentProvisionOption(state, "PROV_CROSS_BORDER_DATA");
      const algo = currentProvisionOption(state, "PROV_ALGORITHM_AUDIT");
      return Boolean(
        (data?.id.includes("consent") || data?.id.includes("federal")) === true &&
        (algo?.id.includes("registry") || algo?.id.includes("audit")) &&
        ensureGoverningRuntime(state).capacity.departments.interior < 0.5,
      );
    },
  },
  {
    id: "sit_gas_bridge_climate_tension",
    departmentId: "energy",
    minMonthsBetween: 11,
    importance: 0.54,
    titles: [
      "Gas-bridge policy splits climate and industry briefs",
      "Energy ministry mediates fossil transition disputes",
      "Industrial users warn on parallel climate mandates",
    ],
    when: (_world, state) => {
      const gas = currentProvisionOption(state, "PROV_GAS_BRIDGE");
      const carbon = currentProvisionOption(state, "PROV_CARBON_PRICE");
      return gas?.id.includes("extend") === true && carbon?.id.includes("levy_95") === true;
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.strain = clampUnit(runtime.capacity.strain + 0.05);
    },
  },
  {
    id: "sit_deposit_insurance_stress",
    departmentId: "finance",
    minMonthsBetween: 18,
    importance: 0.6,
    titles: [
      "Deposit insurance fund faces a capital review",
      "Finance ministry opens talks on mutualized deposit backstop",
      "Banking stability tools enter a public stress scenario",
    ],
    when: (_world, state) => {
      const dep = currentProvisionOption(state, "PROV_DEPOSIT_INSURANCE");
      const runtime = ensureGoverningRuntime(state);
      return (
        (dep?.id.includes("universal") || dep?.id.includes("mutualized")) === true &&
        runtime.fiscal.balance < -8
      );
    },
  },
  {
    id: "sit_temp_worker_enforcement",
    departmentId: "labour",
    minMonthsBetween: 10,
    importance: 0.47,
    titles: [
      "Temporary worker enforcement blitz announced",
      "Labour ministry inspects sponsor compliance after rule shift",
      "Employer groups contest new temporary migration conditions",
    ],
    when: (_world, state) => {
      const temp = currentProvisionOption(state, "PROV_TEMP_WORKER");
      return (
        temp?.id.includes("annual_cap") === true || temp?.id.includes("open_sectoral") === true
      );
    },
  },
  {
    id: "sit_provincial_algorithm_sandbox",
    departmentId: "economy",
    minMonthsBetween: 13,
    importance: 0.46,
    titles: [
      "Provincial AI sandboxes clash with national audit plans",
      "Economy brief warns of overlapping tech regulation",
      "Innovation policy dispute opens across governments",
    ],
    when: (_world, state) => {
      const algo = currentProvisionOption(state, "PROV_ALGORITHM_AUDIT");
      return algo?.id.includes("provincial") === true;
    },
  },
  {
    id: "sit_health_impl_capacity",
    departmentId: "health",
    minMonthsBetween: 7,
    importance: 0.44,
    titles: [
      "Health delivery strain follows major care reforms",
      "Health ministry requests implementation reinforcements",
      "Hospital networks cite rollout capacity limits",
    ],
    when: (_world, state) =>
      implDelayedOnIssue(state, "ISS_WELFARE") &&
      ensureGoverningRuntime(state).services.healthcareAccess < 0.4,
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.healthcareAccess = clampUnit(runtime.services.healthcareAccess - 0.02);
    },
  },
  {
    id: "sit_tariff_revenue_shortfall",
    departmentId: "finance",
    minMonthsBetween: 14,
    importance: 0.57,
    titles: [
      "Tariff receipts miss budget forecasts after trade rule changes",
      "Finance warns strategic tariff settings are squeezing revenue",
      "Customs intake falls short of fiscal planning assumptions",
    ],
    when: (_world, state) => {
      const tariffs = currentProvisionOption(state, "PROV_STRATEGIC_TARIFFS");
      const runtime = ensureGoverningRuntime(state);
      return (
        tariffs != null &&
        !tariffs.founding &&
        tariffs.id.includes("protective") &&
        runtime.fiscal.balance < -5
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.fiscal.revenue = Math.max(0, runtime.fiscal.revenue * 0.985);
      runtime.capacity.departments.finance = clampUnit(runtime.capacity.departments.finance - 0.03);
    },
  },
  {
    id: "sit_union_recognition_strike_risk",
    departmentId: "labour",
    minMonthsBetween: 9,
    importance: 0.53,
    titles: [
      "Labour relations board flags recognition disputes after reforms",
      "Union certification backlog raises strike-risk warnings",
      "Employers and unions clash over new recognition standards",
    ],
    when: (_world, state) => {
      const union = currentProvisionOption(state, "PROV_UNION_RECOGNITION");
      const strike = currentProvisionOption(state, "PROV_STRIKE_NOTICE");
      return (
        union?.id.includes("card_check") === true &&
        strike?.id.includes("mandatory") === true &&
        ensureGoverningRuntime(state).capacity.departments.labour < 0.48
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.strain = clampUnit(runtime.capacity.strain + 0.06);
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.02,
      );
    },
  },
  {
    id: "sit_primary_care_waitlists",
    departmentId: "health",
    minMonthsBetween: 8,
    importance: 0.51,
    titles: [
      "Primary-care enrollment surge overwhelms regional clinics",
      "Health ministry opens emergency waitlist triage",
      "GP access gaps widen after coverage expansion",
    ],
    when: (_world, state) => {
      const care = currentProvisionOption(state, "PROV_PRIMARY_CARE");
      return (
        care?.id.includes("universal") === true &&
        ensureGoverningRuntime(state).services.healthcareAccess < 0.45
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.healthcareAccess = clampUnit(runtime.services.healthcareAccess - 0.04);
      runtime.capacity.departments.health = clampUnit(runtime.capacity.departments.health - 0.03);
    },
  },
  {
    id: "sit_tuition_cap_campus_strain",
    departmentId: "education",
    minMonthsBetween: 11,
    importance: 0.49,
    titles: [
      "Universities warn tuition caps are compressing faculty hiring",
      "Education brief cites campus capacity pressure after fee reforms",
      "Student intake rises faster than provincial teaching grants",
    ],
    when: (_world, state) => {
      const tuition = currentProvisionOption(state, "PROV_TUITION_SUPPORT");
      return (
        tuition?.id.includes("cap") === true &&
        ensureGoverningRuntime(state).capacity.departments.education < 0.5
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.departments.education = clampUnit(
        runtime.capacity.departments.education - 0.04,
      );
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.015,
      );
    },
  },
  {
    id: "sit_community_policing_rollout",
    departmentId: "interior",
    minMonthsBetween: 10,
    importance: 0.5,
    titles: [
      "Community policing pilots strain municipal coordination",
      "Interior mediates local pushback on neighborhood officer models",
      "Provincial police boards request clearer community mandate rules",
    ],
    when: (_world, state) => {
      const policing = currentProvisionOption(state, "PROV_COMMUNITY_POLICING");
      return (
        policing?.id.includes("neighborhood") === true ||
        policing?.id.includes("community") === true
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.publicSafety = clampUnit(runtime.services.publicSafety + 0.02);
      runtime.capacity.departments.interior = clampUnit(
        runtime.capacity.departments.interior - 0.03,
      );
    },
  },
  {
    id: "sit_sentencing_overcrowding",
    departmentId: "justice",
    minMonthsBetween: 12,
    importance: 0.54,
    titles: [
      "Sentencing reforms coincide with provincial prison overcrowding",
      "Justice ministry faces custody capacity warnings",
      "Courts cite detention backlogs after penalty guideline changes",
    ],
    when: (_world, state) => {
      const sentencing = currentProvisionOption(state, "PROV_SENTENCING");
      return (
        sentencing?.id.includes("mandatory_minimum") === true &&
        ensureGoverningRuntime(state).services.publicSafety < 0.42
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.departments.justice = clampUnit(runtime.capacity.departments.justice - 0.05);
      runtime.capacity.strain = clampUnit(runtime.capacity.strain + 0.03);
    },
  },
  {
    id: "sit_rail_ownership_dispute",
    departmentId: "transport",
    minMonthsBetween: 13,
    importance: 0.48,
    titles: [
      "Rail ownership rules trigger freight priority disputes",
      "Transport ministry arbitrates corridor access complaints",
      "Passenger operators warn mixed-ownership model slows upgrades",
    ],
    when: (_world, state) => {
      const rail = currentProvisionOption(state, "PROV_RAIL_OWNERSHIP");
      return rail?.id.includes("mixed") === true || rail?.id.includes("public") === true;
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.infrastructureQuality = clampUnit(
        runtime.services.infrastructureQuality - 0.03,
      );
      runtime.capacity.departments.transport = clampUnit(
        runtime.capacity.departments.transport - 0.02,
      );
    },
  },
  {
    id: "sit_readiness_fund_overspend",
    departmentId: "defense",
    minMonthsBetween: 16,
    importance: 0.55,
    titles: [
      "Readiness fund draws exceed planned modernization envelope",
      "Defense comptroller opens review of procurement acceleration",
      "Service chiefs warn maintenance accounts are being cannibalized",
    ],
    when: (_world, state) => {
      const readiness = currentProvisionOption(state, "PROV_READINESS_FUND");
      const runtime = ensureGoverningRuntime(state);
      return readiness?.id.includes("accelerated") === true && runtime.fiscal.balance < -6;
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.fiscal.expenditure = runtime.fiscal.expenditure * 1.008;
      runtime.capacity.departments.defense = clampUnit(runtime.capacity.departments.defense - 0.04);
    },
  },
  {
    id: "sit_farm_stabilization_payouts",
    departmentId: "agriculture",
    minMonthsBetween: 10,
    importance: 0.46,
    titles: [
      "Farm stabilization payouts spike after commodity price swings",
      "Agriculture ministry requests supplemental stabilization authority",
      "Producer groups press for faster income-support delivery",
    ],
    when: (_world, state) => {
      const farm = currentProvisionOption(state, "PROV_FARM_STABILIZATION");
      return farm != null && !farm.founding && farm.id.includes("income");
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.fiscal.expenditure = runtime.fiscal.expenditure * 1.006;
      runtime.capacity.departments.agriculture = clampUnit(
        runtime.capacity.departments.agriculture - 0.03,
      );
    },
  },
  {
    id: "sit_income_tax_compliance_blitz",
    departmentId: "finance",
    minMonthsBetween: 15,
    importance: 0.47,
    titles: [
      "Revenue agency launches compliance blitz after bracket reforms",
      "Finance steers audit capacity toward high-income reporting gaps",
      "Tax administration backlog slows refund processing",
    ],
    when: (_world, state) => {
      const tax = currentProvisionOption(state, "PROV_INCOME_TAX");
      return tax?.id.includes("progressive") === true || tax?.id.includes("bracket") === true;
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.025,
      );
      runtime.fiscal.revenue = runtime.fiscal.revenue * 1.004;
    },
  },
  {
    id: "sit_surveillance_warrant_backlog",
    departmentId: "justice",
    minMonthsBetween: 11,
    importance: 0.56,
    titles: [
      "Judicial warrant backlog delays surveillance authorizations",
      "Justice reviews emergency surveillance renewal requests",
      "Privacy commissioners cite warrant-processing delays",
    ],
    when: (_world, state) => {
      const warrant = currentProvisionOption(state, "PROV_SURVEILLANCE_WARRANT");
      const data = currentProvisionOption(state, "PROV_CROSS_BORDER_DATA");
      return Boolean(
        warrant?.id.includes("judicial") === true &&
        (data?.id.includes("consent") === true || data?.id.includes("federal") === true),
      );
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.departments.justice = clampUnit(runtime.capacity.departments.justice - 0.04);
      runtime.services.publicSafety = clampUnit(runtime.services.publicSafety - 0.02);
    },
  },
  {
    id: "sit_election_admin_capacity",
    departmentId: "interior",
    minMonthsBetween: 18,
    importance: 0.59,
    titles: [
      "Election administration reforms strain local returning offices",
      "Interior coordinates ballot-system upgrades under tight timelines",
      "Party agents dispute new election audit procedures",
    ],
    when: (_world, state) => {
      const admin = currentProvisionOption(state, "PROV_ELECTION_ADMIN");
      return admin != null && !admin.founding && admin.id.includes("modernize");
    },
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.departments.interior = clampUnit(
        runtime.capacity.departments.interior - 0.05,
      );
      runtime.services.administrativeDelivery = clampUnit(
        runtime.services.administrativeDelivery - 0.035,
      );
    },
  },
  {
    id: "sit_competition_enforcement_capacity",
    departmentId: "economy",
    minMonthsBetween: 12,
    importance: 0.45,
    titles: [
      "Market concentration cases outpace competition bureau staffing",
      "Economy ministry reprioritizes merger review timelines",
      "SME groups warn delayed enforcement leaves dominant firms unchecked",
    ],
    when: (_world, state) => implDelayedOnIssue(state, "ISS_TRADE"),
    apply: (state) => {
      const runtime = ensureGoverningRuntime(state);
      runtime.capacity.departments.economy = clampUnit(runtime.capacity.departments.economy - 0.04);
    },
  },
];

/** Monthly pass: at most one situation, gated by cooldown + eligibility. */
export function processExecutiveSituations(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensureGoverningRuntime(state);
  const registry = readContentCooldownRegistry(runtime.metadata);
  const month = Number(state.currentDate.slice(5, 7));
  if (![2, 5, 8, 11].includes(month)) return [];

  const eligible = EXECUTIVE_SITUATIONS.filter(
    (s) =>
      s.when(world, state) &&
      contentCooldownEligible(registry, s.id, state.currentDate, s.minMonthsBetween),
  ).sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return [];

  const pick = eligible[month % eligible.length]!;
  recordContentCooldown(runtime.metadata, pick.id, state.currentDate);
  pick.apply?.(state);

  const title = pick.titles[month % pick.titles.length] ?? pick.titles[0]!;
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "GOVERNMENT_EXECUTIVE_SITUATION",
      importance: pick.importance,
      visibility: "public",
      actorIds: [],
      entityIds: [pick.id],
      payload: {
        situationId: pick.id,
        departmentId: pick.departmentId,
        title,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}
