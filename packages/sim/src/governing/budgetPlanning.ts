import { ensureGoverningRuntime } from "./state.js";
import { departmentFromOfficeId } from "./departments.js";
import type { DepartmentId } from "./types.js";
import type { SpendingCategory } from "./types.js";
import { currentMinisterHolderId, ministerOfficeIds } from "../executive/state.js";
import type { BudgetState, FiscalStance, MinistryBudgetChoice } from "../executive/types.js";
import type { KernelWorld, SimState } from "../types.js";

const DEPT_SPENDING: Record<DepartmentId, SpendingCategory> = {
  finance: "administration",
  labour: "social_protection",
  health: "healthcare",
  education: "education",
  interior: "administration",
  justice: "administration",
  transport: "infrastructure",
  energy: "infrastructure",
  foreign: "administration",
  defense: "defence",
  economy: "other",
  agriculture: "other",
};

export const FISCAL_STANCE_TOTAL_FACTOR: Record<FiscalStance, number> = {
  expansionary: 1.12,
  modest_increase: 1.05,
  hold: 1,
  consolidation: 0.92,
  custom: 1,
};

export const MINISTRY_CHOICE_FACTOR: Record<Exclude<MinistryBudgetChoice, "custom">, number> = {
  full_request: 1,
  partial_request: 0.5,
  hold_baseline: 0,
  cut: -0.1,
};

/** Baseline absolute envelope from current fiscal books (normalized units). */
export function budgetBaselineTotal(state: SimState): number {
  const runtime = ensureGoverningRuntime(state);
  const exp = runtime.fiscal.expenditure;
  return Number.isFinite(exp) && exp > 0 ? exp : 100;
}

/**
 * Authoritative ministry requests for the current fiscal year.
 * Derived from baseline share, capacity shortfall, implementation load, and agenda pressure.
 */
export function computeMinistryBudgetRequests(
  world: KernelWorld,
  state: SimState,
): {
  baselineTotal: number;
  baselineByMinistry: Record<string, number>;
  requestsByMinistry: Record<string, number>;
} {
  const runtime = ensureGoverningRuntime(state);
  const ministries = ministerOfficeIds(world);
  const baselineTotal = budgetBaselineTotal(state);
  const even = ministries.length === 0 ? 0 : baselineTotal / ministries.length;
  const baselineByMinistry: Record<string, number> = {};
  const requestsByMinistry: Record<string, number> = {};

  const approved = Object.values(state.executiveRuntime.budgets).find(
    (b) => b.status === "approved" || b.status === "continuing",
  );
  for (const officeId of ministries) {
    const share = approved?.allocations[officeId];
    const baseline =
      typeof share === "number" && share > 0 && approved ? baselineTotal * share : even;
    baselineByMinistry[officeId] = Math.round(baseline * 10) / 10;

    const dept = departmentFromOfficeId(officeId);
    let pressure = 0.08; // ordinary request uplift
    if (dept) {
      const cap = runtime.capacity.departments[dept] ?? runtime.capacity.national;
      if (cap < 0.5) pressure += (0.5 - cap) * 0.35;
      const implLoad = Object.values(runtime.implementations).filter(
        (r) =>
          r.departmentId === dept && r.status !== "fully_implemented" && r.status !== "blocked",
      ).length;
      pressure += Math.min(0.2, implLoad * 0.04);
      if (runtime.agenda.items.some((i) => i.departmentId === dept && i.status === "active")) {
        pressure += 0.06;
      }
    }
    if (!currentMinisterHolderId(world, state, officeId)) pressure *= 0.5;
    requestsByMinistry[officeId] =
      Math.round(baselineByMinistry[officeId]! * (1 + pressure) * 10) / 10;
  }

  return { baselineTotal, baselineByMinistry, requestsByMinistry };
}

export function amountForMinistryChoice(args: {
  baseline: number;
  request: number;
  choice: MinistryBudgetChoice;
  customAmount?: number;
}): number {
  if (args.choice === "custom" && typeof args.customAmount === "number") {
    return Math.max(0, args.customAmount);
  }
  if (args.choice === "full_request") return Math.max(0, args.request);
  if (args.choice === "partial_request") {
    return Math.max(0, args.baseline + (args.request - args.baseline) * 0.5);
  }
  if (args.choice === "cut") return Math.max(0, args.baseline * 0.9);
  return Math.max(0, args.baseline); // hold_baseline
}

export function buildBudgetProposalAmounts(args: {
  world: KernelWorld;
  state: SimState;
  fiscalStance?: FiscalStance;
  /** Absolute ministry amounts. When omitted, stance seeds from requests/baseline. */
  ministryAmounts?: Record<string, number>;
  ministryChoices?: Record<string, MinistryBudgetChoice>;
}): {
  fiscalStance: FiscalStance;
  baselineTotal: number;
  totalEnvelope: number;
  ministryRequests: Record<string, number>;
  ministryAmounts: Record<string, number>;
  ministryChoices: Record<string, MinistryBudgetChoice>;
  allocations: Record<string, number>;
} {
  const ministries = ministerOfficeIds(args.world);
  const { baselineTotal, baselineByMinistry, requestsByMinistry } = computeMinistryBudgetRequests(
    args.world,
    args.state,
  );
  const fiscalStance = args.fiscalStance ?? "custom";
  const ministryAmounts: Record<string, number> = {};
  const ministryChoices: Record<string, MinistryBudgetChoice> = {};

  if (args.ministryAmounts && Object.keys(args.ministryAmounts).length > 0) {
    for (const id of ministries) {
      const amount = Math.max(0, args.ministryAmounts[id] ?? 0);
      ministryAmounts[id] = Math.round(amount * 10) / 10;
      ministryChoices[id] = args.ministryChoices?.[id] ?? "custom";
    }
  } else {
    const targetTotal = baselineTotal * (FISCAL_STANCE_TOTAL_FACTOR[fiscalStance] ?? 1);
    // Seed from requests scaled so sum ≈ stance total, then honor per-ministry choices.
    const requestSum = Object.values(requestsByMinistry).reduce((s, v) => s + v, 0) || 1;
    for (const id of ministries) {
      const choice = args.ministryChoices?.[id] ?? defaultChoiceForStance(fiscalStance);
      ministryChoices[id] = choice;
      const seededRequest = (requestsByMinistry[id]! / requestSum) * Math.max(targetTotal, 0.1);
      const amount = amountForMinistryChoice({
        baseline: baselineByMinistry[id]!,
        request: seededRequest,
        choice,
        ...(typeof args.ministryAmounts?.[id] === "number"
          ? { customAmount: args.ministryAmounts[id] }
          : {}),
      });
      ministryAmounts[id] = Math.round(amount * 10) / 10;
    }
  }

  let totalEnvelope = Object.values(ministryAmounts).reduce((s, v) => s + v, 0);
  if (totalEnvelope <= 0) {
    const even = baselineTotal / Math.max(1, ministries.length);
    for (const id of ministries) ministryAmounts[id] = Math.round(even * 10) / 10;
    totalEnvelope = baselineTotal;
  }

  const allocations: Record<string, number> = {};
  for (const id of ministries) {
    allocations[id] = totalEnvelope > 0 ? ministryAmounts[id]! / totalEnvelope : 0;
  }

  return {
    fiscalStance,
    baselineTotal,
    totalEnvelope: Math.round(totalEnvelope * 10) / 10,
    ministryRequests: requestsByMinistry,
    ministryAmounts,
    ministryChoices,
    allocations,
  };
}

function defaultChoiceForStance(stance: FiscalStance): MinistryBudgetChoice {
  if (stance === "expansionary") return "full_request";
  if (stance === "modest_increase") return "partial_request";
  if (stance === "consolidation") return "cut";
  return "hold_baseline";
}

/** Apply absolute envelope + ministry distribution to governing fiscal books. */
export function applyBudgetEnvelopeToFiscal(state: SimState, budget: BudgetState): void {
  const runtime = ensureGoverningRuntime(state);
  const amounts = budget.ministryAmounts ?? {};
  const total =
    budget.totalEnvelope > 0
      ? budget.totalEnvelope
      : Object.values(amounts).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
  if (!(total > 0)) return;

  const spending = { ...runtime.fiscal.spendingByCategory };
  for (const k of Object.keys(spending) as SpendingCategory[]) spending[k] = 0;

  let assigned = 0;
  for (const [officeId, amount] of Object.entries(amounts)) {
    if (!(amount > 0)) continue;
    const dept = departmentFromOfficeId(officeId);
    const cat: SpendingCategory = dept ? DEPT_SPENDING[dept] : "other";
    spending[cat] = (spending[cat] ?? 0) + amount;
    assigned += amount;
  }
  if (assigned + 1e-9 < total) {
    spending.other = (spending.other ?? 0) + (total - assigned);
  }

  const prevExpenditure = runtime.fiscal.expenditure;
  runtime.fiscal.spendingByCategory = spending;
  runtime.fiscal.expenditure = Math.round(total * 10) / 10;
  runtime.fiscal.balance =
    Math.round((runtime.fiscal.revenue - runtime.fiscal.expenditure) * 10) / 10;
  // Debt path: larger spending relative to prior books increases debt pressure.
  const delta = runtime.fiscal.expenditure - (prevExpenditure > 0 ? prevExpenditure : total);
  runtime.fiscal.debt = Math.max(
    0,
    Math.round((runtime.fiscal.debt + delta * 0.08 - runtime.fiscal.balance * 0.02) * 10) / 10,
  );
  runtime.fiscal.lastUpdated = state.currentDate;

  // Implementation capacity: cuts strain delivery; expansions ease slightly.
  const scale = prevExpenditure > 0 ? runtime.fiscal.expenditure / prevExpenditure : 1;
  if (scale < 0.97) {
    runtime.capacity.strain = Math.min(1, runtime.capacity.strain + (1 - scale) * 0.4);
    runtime.capacity.national = Math.max(0.15, runtime.capacity.national - (1 - scale) * 0.15);
  } else if (scale > 1.03) {
    runtime.capacity.strain = Math.max(0, runtime.capacity.strain - (scale - 1) * 0.2);
    runtime.capacity.national = Math.min(0.95, runtime.capacity.national + (scale - 1) * 0.08);
  }
}

export function emptyBudgetFiscalFields(): Pick<
  BudgetState,
  | "totalEnvelope"
  | "baselineTotal"
  | "fiscalStance"
  | "ministryRequests"
  | "ministryAmounts"
  | "ministryChoices"
> {
  return {
    totalEnvelope: 0,
    baselineTotal: 0,
    fiscalStance: "hold",
    ministryRequests: {},
    ministryAmounts: {},
    ministryChoices: {},
  };
}
