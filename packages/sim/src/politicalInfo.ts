/** Shared qualitative political-information labels (no hidden internals). */

export function formatShareEstimate(share0to1: number, opts?: { exact?: boolean }): string {
  const share = Number.isFinite(share0to1) ? Math.max(0, Math.min(1, share0to1)) : 0;
  if (opts?.exact) return `${(share * 100).toFixed(1)}%`;
  const pct = share * 100;
  if (pct >= 55) return "a clear majority";
  if (pct >= 50) return "majority";
  if (pct >= 45) return "nearly half";
  if (pct >= 38) return "around two-fifths";
  if (pct >= 30) return "around one-third";
  if (pct >= 24) return "roughly one quarter";
  if (pct >= 18) return "20–30%";
  if (pct >= 12) return "around one-fifth";
  if (pct >= 8) return "about one-tenth";
  if (pct >= 4) return "a small share";
  return "marginal";
}

export function formatLeadershipSecurity(level: string): string {
  return level.replace(/_/g, " ");
}

export function formatInfluenceBand(
  share0to1: number,
): "Marginal" | "Limited" | "Moderate" | "Strong" | "Dominant" {
  const share = Number.isFinite(share0to1) ? Math.max(0, Math.min(1, share0to1)) : 0;
  if (share >= 0.5) return "Dominant";
  if (share >= 0.3) return "Strong";
  if (share >= 0.15) return "Moderate";
  if (share >= 0.05) return "Limited";
  return "Marginal";
}

export function formatWhipLean(
  scoreOrCategory: number | string,
): "Likely yes" | "Lean yes" | "Unclear" | "Lean no" | "Likely no" {
  if (typeof scoreOrCategory === "string") {
    const key = scoreOrCategory.toLowerCase().replace(/\s+/g, "_");
    if (key === "likely_yes" || key === "likely yes") return "Likely yes";
    if (key === "lean_yes" || key === "lean yes") return "Lean yes";
    if (key === "lean_no" || key === "lean no") return "Lean no";
    if (key === "likely_no" || key === "likely no") return "Likely no";
    if (key === "unclear" || key === "toss_up" || key === "uncertain") return "Unclear";
  }
  const score = typeof scoreOrCategory === "number" ? scoreOrCategory : 0;
  if (score >= 0.35) return "Likely yes";
  if (score >= 0.12) return "Lean yes";
  if (score <= -0.35) return "Likely no";
  if (score <= -0.12) return "Lean no";
  return "Unclear";
}

export function formatTensionBand(value: number): "Low" | "Elevated" | "Serious" | "Severe" {
  const n = Number.isFinite(value) ? value : 0;
  const normalized = n > 1 ? n / 100 : n;
  if (normalized >= 0.75) return "Severe";
  if (normalized >= 0.5) return "Serious";
  if (normalized >= 0.25) return "Elevated";
  return "Low";
}

export function formatRelationBand(
  scoreOrCategory: number | string,
): "close ally" | "friendly" | "cooperative" | "cool" | "strained" | "hostile" {
  if (typeof scoreOrCategory === "string") {
    const key = scoreOrCategory.toLowerCase().replace(/_/g, " ");
    if (
      key === "close ally" ||
      key === "friendly" ||
      key === "cooperative" ||
      key === "cool" ||
      key === "strained" ||
      key === "hostile"
    ) {
      return key;
    }
  }
  const score = typeof scoreOrCategory === "number" ? scoreOrCategory : 0;
  if (score >= 0.7) return "close ally";
  if (score >= 0.4) return "friendly";
  if (score >= 0.15) return "cooperative";
  if (score >= -0.15) return "cool";
  if (score >= -0.45) return "strained";
  return "hostile";
}

export function explainVoteQualitative(factors: { labels: string[] }): string {
  const labels = factors.labels.map((label) => label.trim()).filter(Boolean);
  if (labels.length === 0) return "Likely concerns are not yet clear from public signals.";
  if (labels.length === 1) return `Likely concerns include ${labels[0]}.`;
  if (labels.length === 2) return `Likely concerns include ${labels[0]} and ${labels[1]}.`;
  const head = labels.slice(0, -1).join(", ");
  return `Likely concerns include ${head}, and ${labels[labels.length - 1]}.`;
}

export function canShowExactInternals(debugMode: boolean): boolean {
  return Boolean(debugMode);
}
