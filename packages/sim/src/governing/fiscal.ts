import { currentProvisionOption } from "../legislature/provisions.js";
import { optionForPolicyItem, provisionForPolicyItem } from "../legislature/provisions.js";
import type { PolicyItem } from "../legislature/types.js";
import type { SimState } from "../types.js";
import { departmentForPolicyItem } from "./departments.js";
import { ensureGoverningRuntime } from "./state.js";
import {
  emptyRevenueBySource,
  emptySpendingByCategory,
  type FiscalState,
  type RevenueSource,
  type SpendingCategory,
} from "./types.js";

const BASE_REVENUE = 100;

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Map a provision/option pair to fiscal deltas in normalized units. */
export function fiscalEffectFromOption(
  provisionId: string,
  optionId: string,
): {
  revenue: Partial<Record<RevenueSource, number>>;
  spending: Partial<Record<SpendingCategory, number>>;
} {
  const revenue: Partial<Record<RevenueSource, number>> = {};
  const spending: Partial<Record<SpendingCategory, number>> = {};

  if (provisionId === "PROV_INCOME_TAX" || provisionId.includes("INCOME_TAX")) {
    if (optionId.includes("30") || optionId.includes("broader_base")) revenue.income_tax = -4;
    else if (optionId.includes("45") || optionId.includes("surtax")) revenue.income_tax = 6;
    else revenue.income_tax = 0;
  }
  if (provisionId === "PROV_CORPORATE_TAX" || provisionId.includes("CORPORATE")) {
    if (optionId.includes("15") || optionId.includes("allowance")) revenue.corporate_tax = -5;
    else if (optionId.includes("28") || optionId.includes("minimum")) revenue.corporate_tax = 5;
    else revenue.corporate_tax = 0;
  }
  if (provisionId.includes("TARIFF") || provisionId.includes("LEVY")) {
    if (optionId.includes("95") || optionId.includes("65")) revenue.tariffs = 4;
    else if (optionId.includes("repeal") || optionId.includes("25")) revenue.tariffs = -2;
    else revenue.tariffs = 1;
  }
  if (
    provisionId.includes("UNEMPLOYMENT") ||
    provisionId.includes("PAID_LEAVE") ||
    provisionId.includes("CHILD_BENEFIT") ||
    provisionId.includes("WELFARE")
  ) {
    if (
      optionId.includes("forty") ||
      optionId.includes("twenty_six") ||
      optionId.includes("universal") ||
      optionId.includes("shared_parental")
    ) {
      spending.social_protection = 6;
    } else if (
      optionId.includes("eight") ||
      optionId.includes("narrow") ||
      optionId.includes("employer")
    ) {
      spending.social_protection = -3;
    } else spending.social_protection = 2;
  }
  if (
    provisionId.includes("HEALTH") ||
    provisionId.includes("CARE") ||
    provisionId.includes("PRIMARY")
  ) {
    if (
      optionId.includes("national_health") ||
      optionId.includes("capitation") ||
      optionId.includes("zero_copay")
    ) {
      spending.healthcare = 5;
    } else if (optionId.includes("visit_fee") || optionId.includes("market")) {
      spending.healthcare = -3;
    } else spending.healthcare = 1;
  }
  if (
    provisionId.includes("EDUC") ||
    provisionId.includes("SCHOOL") ||
    provisionId.includes("TUITION")
  ) {
    if (
      optionId.includes("free") ||
      optionId.includes("stipend") ||
      optionId.includes("universal")
    ) {
      spending.education = 4;
    } else if (optionId.includes("higher_tuition") || optionId.includes("loan")) {
      spending.education = -2;
    } else spending.education = 1;
  }
  if (
    provisionId.includes("RAIL") ||
    provisionId.includes("INFRA") ||
    provisionId.includes("GRID") ||
    provisionId.includes("HOUSING")
  ) {
    if (
      optionId.includes("public") ||
      optionId.includes("build") ||
      optionId.includes("bank") ||
      optionId.includes("open_access_network")
    ) {
      spending.infrastructure = 5;
    } else if (
      optionId.includes("private") ||
      optionId.includes("market") ||
      optionId.includes("voucher")
    ) {
      spending.infrastructure = -2;
    } else spending.infrastructure = 1;
  }
  if (provisionId.includes("DEFENSE") || provisionId.includes("READINESS")) {
    if (optionId.includes("maintenance")) spending.defence = -2;
    else spending.defence = 2;
  }
  if (provisionId.includes("ESTATE")) {
    if (optionId.includes("repeal")) revenue.other = -3;
    else if (optionId.includes("progressive")) revenue.other = 3;
  }

  return { revenue, spending };
}

function applyPartial(
  target: Record<string, number>,
  partial: Partial<Record<string, number>>,
  scale = 1,
): void {
  for (const [k, v] of Object.entries(partial)) {
    if (typeof v !== "number") continue;
    target[k] = (target[k] ?? 0) + v * scale;
  }
}

function fiscalFromPolicyItem(item: PolicyItem): {
  revenue: Partial<Record<RevenueSource, number>>;
  spending: Partial<Record<SpendingCategory, number>>;
} {
  if (item.provisionId && item.optionId) {
    return fiscalEffectFromOption(item.provisionId, item.optionId);
  }
  const impact = item.fiscalImpact ?? item.magnitude * item.direction * 0.15;
  const dept = departmentForPolicyItem(item);
  const spending: Partial<Record<SpendingCategory, number>> = {};
  const revenue: Partial<Record<RevenueSource, number>> = {};
  if (dept === "finance" || item.issueId === "ISS_TRADE") {
    revenue.other = impact * 4;
  } else if (dept === "health") spending.healthcare = Math.abs(impact) * 4 * Math.sign(impact || 1);
  else if (dept === "education") spending.education = Math.abs(impact) * 4;
  else if (dept === "defense") spending.defence = Math.abs(impact) * 4;
  else if (dept === "labour") spending.social_protection = Math.abs(impact) * 4;
  else if (dept === "transport" || dept === "energy")
    spending.infrastructure = Math.abs(impact) * 4;
  else spending.other = impact * 3;
  return { revenue, spending };
}

/** Rebuild fiscal snapshot from current-law provisions + operative Acts (normalized units). */
export function recomputeFiscalFromCurrentLaw(state: SimState): FiscalState {
  const runtime = ensureGoverningRuntime(state);
  const revenueBySource = emptyRevenueBySource();
  const spendingByCategory = emptySpendingByCategory();

  // Baseline mix
  revenueBySource.income_tax = 32;
  revenueBySource.corporate_tax = 18;
  revenueBySource.consumption_tax = 22;
  revenueBySource.payroll_contributions = 16;
  revenueBySource.tariffs = 6;
  revenueBySource.other = 6;
  spendingByCategory.healthcare = 22;
  spendingByCategory.education = 14;
  spendingByCategory.social_protection = 24;
  spendingByCategory.infrastructure = 12;
  spendingByCategory.defence = 10;
  spendingByCategory.administration = 10;
  spendingByCategory.other = 8;

  // Prefer concrete provision current-law options when available.
  const seenProvisions = new Set<string>();
  for (const law of Object.values(state.legislatureRuntime.enactedLaws)) {
    if (!law.operative) continue;
    const impl = runtime.implementations[law.id];
    const scale = !impl
      ? 0.85
      : impl.status === "fully_implemented"
        ? 1
        : 0.4 + impl.progress * 0.6;
    for (const item of law.policyItems) {
      if (item.provisionId) {
        if (seenProvisions.has(item.provisionId)) continue;
        seenProvisions.add(item.provisionId);
        const current = currentProvisionOption(state, item.provisionId);
        if (current) {
          const fx = fiscalEffectFromOption(item.provisionId, current.id);
          applyPartial(revenueBySource, fx.revenue, scale);
          applyPartial(spendingByCategory, fx.spending, scale);
          continue;
        }
      }
      const fx = fiscalFromPolicyItem(item);
      applyPartial(revenueBySource, fx.revenue, scale);
      applyPartial(spendingByCategory, fx.spending, scale);
    }
  }

  // Also scan known provisions not covered by Acts (founding baseline).
  for (const law of Object.values(state.legislatureRuntime.enactedLaws)) {
    for (const item of law.policyItems) {
      if (!item.provisionId || seenProvisions.has(item.provisionId)) continue;
      const opt =
        optionForPolicyItem(item) ?? provisionForPolicyItem(item)?.options.find((o) => o.founding);
      if (!opt) continue;
      seenProvisions.add(item.provisionId);
      const fx = fiscalEffectFromOption(item.provisionId, opt.id);
      applyPartial(revenueBySource, fx.revenue, 0.5);
      applyPartial(spendingByCategory, fx.spending, 0.5);
    }
  }

  let revenue = 0;
  for (const v of Object.values(revenueBySource)) revenue += v;
  let expenditure = 0;
  for (const v of Object.values(spendingByCategory)) expenditure += v;

  // Normalize around BASE so units stay comparable year to year.
  const revScale =
    revenue > 0
      ? (BASE_REVENUE / Math.max(60, Math.min(160, revenue))) * (revenue / BASE_REVENUE)
      : 1;
  void revScale;
  revenue = clampNonNeg(revenue);
  expenditure = clampNonNeg(expenditure);
  const balance = revenue - expenditure;
  const prevDebt = runtime.fiscal.debt;
  const debt = clampNonNeg(prevDebt - balance * 0.05);

  const year = Number(state.currentDate.slice(0, 4));
  const fiscal: FiscalState = {
    fiscalYear: year,
    revenue: Math.round(revenue * 10) / 10,
    expenditure: Math.round(expenditure * 10) / 10,
    balance: Math.round(balance * 10) / 10,
    debt: Math.round(debt * 10) / 10,
    revenueBySource,
    spendingByCategory,
    lastUpdated: state.currentDate,
  };
  runtime.fiscal = fiscal;
  return fiscal;
}

export function applyBudgetPassageFiscalBoost(state: SimState, approved: boolean): void {
  const runtime = ensureGoverningRuntime(state);
  if (approved) {
    runtime.fiscal.debt = clampNonNeg(runtime.fiscal.debt - 0.5);
    runtime.fiscal.balance =
      Math.round((runtime.fiscal.revenue - runtime.fiscal.expenditure) * 10) / 10;
  } else {
    runtime.fiscal.debt = clampNonNeg(runtime.fiscal.debt + 1.5);
    runtime.fiscal.expenditure = Math.round((runtime.fiscal.expenditure + 0.8) * 10) / 10;
    runtime.fiscal.balance =
      Math.round((runtime.fiscal.revenue - runtime.fiscal.expenditure) * 10) / 10;
  }
  runtime.fiscal.lastUpdated = state.currentDate;
}
