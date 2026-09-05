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
  PROV_UNEMPLOYMENT_INSURANCE: {
    eight_week_benefits: { confidenceIndex: -0.08, fiscalPressure: -0.06, realWageIndex: -0.12 },
    eighteen_week_benefits: { confidenceIndex: 0.06, fiscalPressure: 0.05, realWageIndex: 0.08 },
    twenty_six_week_benefits: { confidenceIndex: 0.12, fiscalPressure: 0.1, realWageIndex: 0.14 },
    forty_week_benefits: { confidenceIndex: 0.18, fiscalPressure: 0.16, realWageIndex: 0.2 },
  },
  PROV_PAID_LEAVE: {
    eight_week_insurance: { realWageIndex: -0.05, fiscalPressure: -0.08, confidenceIndex: -0.04 },
    sixteen_week_insurance: { realWageIndex: 0.1, fiscalPressure: 0.08, confidenceIndex: 0.06 },
    twenty_six_week_insurance: { realWageIndex: 0.16, fiscalPressure: 0.12, confidenceIndex: 0.1 },
    shared_parental_year: { realWageIndex: 0.22, fiscalPressure: 0.2, confidenceIndex: 0.14 },
  },
  PROV_INCOME_TAX: {
    top_rate_30: { fiscalPressure: -0.14, outputIndex: 0.12, confidenceIndex: 0.06 },
    top_rate_42: { fiscalPressure: 0.1, outputIndex: -0.08, confidenceIndex: -0.04 },
    top_rate_45: { fiscalPressure: 0.14, outputIndex: -0.12, confidenceIndex: -0.06 },
  },
  PROV_CORPORATE_TAX: {
    rate_15_territorial: { fiscalPressure: -0.18, outputIndex: 0.16, confidenceIndex: 0.1 },
    rate_25_minimum: { fiscalPressure: 0.12, outputIndex: -0.1, confidenceIndex: -0.05 },
  },
  PROV_CARBON_PRICE: {
    levy_25: { priceIndex: -0.08, outputIndex: 0.06, fiscalPressure: -0.05 },
    levy_65: { priceIndex: 0.12, outputIndex: -0.1, fiscalPressure: 0.08 },
    levy_95: { priceIndex: 0.18, outputIndex: -0.16, fiscalPressure: 0.12 },
  },
  PROV_MINIMUM_WAGE: {
    wage_floor_12: { realWageIndex: -0.1, employmentIndex: 0.06, outputIndex: 0.04 },
    wage_floor_18: { realWageIndex: 0.08, employmentIndex: -0.04, outputIndex: -0.06 },
    wage_floor_22: { realWageIndex: 0.16, employmentIndex: -0.08, outputIndex: -0.1 },
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
  return null;
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
  if (item.provisionId && item.optionId) {
    const table = PROVISION_OPTION_EFFECTS[item.provisionId]?.[item.optionId];
    if (table) return { ...table };
  }

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
