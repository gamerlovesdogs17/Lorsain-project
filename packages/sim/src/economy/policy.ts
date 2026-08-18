import type { PolicyItem } from "../legislature/types.js";
import type { EconomyLagKind, NationalEconomyIndices } from "./types.js";

export const INDEX_FLOOR = 40;
export const INDEX_CEIL = 160;
export const HISTORY_MONTHS = 24;
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

/** Tradeoff deltas per unit of direction*magnitude, applied as one month's slice. */
export function policyIndexDelta(item: PolicyItem): Partial<NationalEconomyIndices> {
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
