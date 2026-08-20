import type { CanonicalWorldCountry } from "./types.js";
import { TERENA_WORLD_ID } from "./types.js";
import type { BilateralRelation } from "./types.js";
import { emptyBilateralRelation } from "./types.js";
import { bilateralTradeTies } from "./trade.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampRelation(n: number): number {
  return Math.max(-100, Math.min(100, n));
}

function alignmentGeneralDelta(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  const shared = a.alignmentIds.filter((id) => b.alignmentIds.includes(id));
  if (shared.includes("INT_DC")) return 18;
  if (shared.includes("INT_CSC")) return 14;
  if (shared.includes("INT_NAF")) return 6;
  const aCsc = a.alignmentIds.includes("INT_CSC");
  const bCsc = b.alignmentIds.includes("INT_CSC");
  const aDc = a.alignmentIds.includes("INT_DC");
  const bDc = b.alignmentIds.includes("INT_DC");
  if ((aCsc && bDc) || (aDc && bCsc)) return -28;
  return 0;
}

function neighborGeneralDelta(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  if (!a.neighborIds.includes(b.id)) return 0;
  return 8;
}

function terenaBaseline(a: CanonicalWorldCountry, b: CanonicalWorldCountry): number {
  if (a.id === TERENA_WORLD_ID && b.id !== TERENA_WORLD_ID) {
    return b.relationWithTerena;
  }
  if (b.id === TERENA_WORLD_ID && a.id !== TERENA_WORLD_ID) {
    return a.relationWithTerena;
  }
  return 0;
}

export function deriveInitialBilateralRelation(
  a: CanonicalWorldCountry,
  b: CanonicalWorldCountry,
): BilateralRelation {
  const base = emptyBilateralRelation();
  let general = terenaBaseline(a, b);
  if (general === 0 && a.id !== TERENA_WORLD_ID && b.id !== TERENA_WORLD_ID) {
    general =
      alignmentGeneralDelta(a, b) +
      neighborGeneralDelta(a, b) +
      Math.round((a.relationWithTerena + b.relationWithTerena) * 0.08);
  }
  base.general = clampRelation(general);
  base.trust = clamp01(0.45 + base.general / 220);
  base.securityTension = clamp01(
    0.12 +
      (base.general < 0 ? Math.abs(base.general) / 200 : 0) +
      (a.neighborIds.includes(b.id) && base.general < 10 ? 0.08 : 0),
  );
  base.economicTies = bilateralTradeTies(a, b);
  return base;
}

export function adjustRelation(
  rel: BilateralRelation,
  deltas: {
    general?: number;
    trust?: number;
    securityTension?: number;
    economicTies?: number;
  },
): void {
  if (deltas.general != null) rel.general = clampRelation(rel.general + deltas.general);
  if (deltas.trust != null) rel.trust = clamp01(rel.trust + deltas.trust);
  if (deltas.securityTension != null) {
    rel.securityTension = clamp01(rel.securityTension + deltas.securityTension);
  }
  if (deltas.economicTies != null) {
    rel.economicTies = clamp01(rel.economicTies + deltas.economicTies);
  }
}

export function outreachRelationDelta(powerTier: string): {
  general: number;
  trust: number;
} {
  const t = powerTier.toLowerCase();
  const scale = t === "superpower" || t === "great power" ? 0.6 : 1;
  return { general: Math.round(3 * scale), trust: 0.04 * scale };
}

export function sanctionsRelationDelta(severity: number): {
  general: number;
  trust: number;
  economicTies: number;
} {
  return {
    general: Math.round(-6 - severity * 10),
    trust: -0.08 - severity * 0.06,
    economicTies: -0.12 - severity * 0.15,
  };
}
