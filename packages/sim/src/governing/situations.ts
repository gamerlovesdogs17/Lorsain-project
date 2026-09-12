import { currentProvisionOption } from "../legislature/provisions.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { contentCooldownEligible, recordContentCooldown, readContentCooldownRegistry } from "../content/cooldown.js";
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
        (complaints?.id.includes("civilian") || complaints?.id.includes("independent")) ===
          true &&
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
