import type { SimState } from "@lorsain/sim";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function signedPercent(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

export function publicConditionsLabel(value: number): string {
  if (value >= 104) return "Strong";
  if (value >= 100) return "Firm";
  if (value >= 96) return "Soft";
  return "Weak";
}

export function publicTrendLabel(change: number | null): string {
  if (change == null) return "No prior comparison";
  if (change >= 1.25) return "Improving quickly";
  if (change >= 0.3) return "Improving";
  if (change <= -1.25) return "Weakening quickly";
  if (change <= -0.3) return "Weakening";
  return "Broadly stable";
}

export function housingPressureLabel(value: number): string {
  if (value < 92) return "Severe pressure";
  if (value < 96) return "High pressure";
  if (value < 100) return "Tight";
  if (value < 104) return "Balanced";
  return "Relatively affordable";
}

function confidenceLabel(value: number): string {
  if (value >= 104) return "High";
  if (value >= 100) return "Positive";
  if (value >= 96) return "Cautious";
  return "Low";
}

function fiscalPressureLabel(value: number): string {
  if (value >= 0.72) return "Severe";
  if (value >= 0.55) return "High";
  if (value >= 0.35) return "Manageable";
  return "Low";
}

function percentChange(current: number, comparison: number): number {
  return comparison === 0 ? 0 : ((current / comparison) - 1) * 100;
}

export function nationalPublicEconomy(state: SimState) {
  const runtime = state.economyRuntime;
  const current = runtime.national;
  const previous = runtime.history.length >= 2 ? runtime.history[runtime.history.length - 2]! : null;
  const yearAgo = runtime.history.length >= 13 ? runtime.history[runtime.history.length - 13]! : null;

  return {
    growth: yearAgo
      ? percentChange(current.outputIndex, yearAgo.outputIndex)
      : 1.8 + (current.outputIndex - 100) * 0.12,
    unemployment: clamp(5.9 - (current.employmentIndex - 100) * 0.16, 2.5, 14),
    inflation: yearAgo
      ? percentChange(current.priceIndex, yearAgo.priceIndex)
      : 2.3 + (current.priceIndex - 100) * 0.16,
    realPay: yearAgo
      ? percentChange(current.realWageIndex, yearAgo.realWageIndex)
      : (current.realWageIndex - 100) * 0.22,
    housing: housingPressureLabel(current.housingIndex),
    confidence: confidenceLabel(current.confidenceIndex),
    confidenceTrend: publicTrendLabel(
      previous ? current.confidenceIndex - previous.confidenceIndex : null,
    ),
    fiscalPressure: fiscalPressureLabel(current.fiscalPressure),
    hasYearComparison: yearAgo != null,
  };
}

export function regionalPublicEconomy(state: SimState, provinceId: string) {
  const data = state.economyRuntime.provinces[provinceId];
  if (!data) return null;
  const national = nationalPublicEconomy(state);
  const nationalIndices = state.economyRuntime.national;
  const history = state.economyRuntime.provinceHistory[provinceId] ?? [];
  const previous = history.length >= 2 ? history[history.length - 2]! : null;
  const yearAgo = history.length >= 13 ? history[history.length - 13]! : null;
  const start = history[0] ?? null;
  const monthChange = previous ? data.conditionsIndex - previous.conditionsIndex : null;
  const yearChange = yearAgo ? data.conditionsIndex - yearAgo.conditionsIndex : null;
  const sinceStart = start ? percentChange(data.conditionsIndex, start.conditionsIndex) : 0;
  const unemployment = clamp(
    national.unemployment + (nationalIndices.employmentIndex - data.employmentIndex) * 0.16,
    2.5,
    16,
  );

  return {
    conditions: publicConditionsLabel(data.conditionsIndex),
    laborMarket:
      unemployment <= 4.5 ? "Tight" : unemployment <= 6.5 ? "Steady" : unemployment <= 9 ? "Soft" : "Weak",
    unemployment,
    housing: housingPressureLabel(data.housingIndex),
    monthChange,
    yearChange,
    sinceStart,
    monthTrend: publicTrendLabel(monthChange),
    yearTrend: publicTrendLabel(yearChange),
    summary: `${publicConditionsLabel(data.conditionsIndex)} conditions · ${unemployment.toFixed(1)}% unemployment · ${housingPressureLabel(data.housingIndex).toLowerCase()} housing market`,
  };
}

export function sectorPublicEconomy(state: SimState, sectorId: string) {
  const data = state.economyRuntime.sectors[sectorId];
  if (!data) return null;
  const history = state.economyRuntime.sectorHistory[sectorId] ?? [];
  const yearAgo = history.length >= 13 ? history[history.length - 13]! : null;
  const start = history[0] ?? null;
  const yearChange = yearAgo ? data.conditionsIndex - yearAgo.conditionsIndex : null;
  const sinceStart = start ? percentChange(data.conditionsIndex, start.conditionsIndex) : 0;
  return {
    conditions: publicConditionsLabel(data.conditionsIndex),
    yearTrend: publicTrendLabel(yearChange),
    sinceStart: signedPercent(sinceStart),
  };
}

export function relativeSeries(
  history: Array<{ date: string; value: number }>,
): Array<{ date: string; value: number }> {
  const start = history[0]?.value;
  if (start == null || start === 0) return [];
  return history.map((point) => ({
    date: point.date,
    value: percentChange(point.value, start),
  }));
}
