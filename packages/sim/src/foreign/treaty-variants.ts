import type { BilateralRelation, TreatyKind, TreatyRecord } from "./types.js";

export type TradeTreatyVariant = {
  id: string;
  titleSuffix: string;
  /** Counterparty acceptance bias (−1 harder … +1 easier). */
  acceptanceBias: number;
  domesticReaction: "trade" | "sanctions" | "rights" | "migration";
  /** Ratification friction for Terena assembly. */
  ratificationFriction: number;
};

export const TRADE_TREATY_VARIANTS: readonly TradeTreatyVariant[] = [
  {
    id: "standard_market_access",
    titleSuffix: "Market Access Agreement",
    acceptanceBias: 0.1,
    domesticReaction: "trade",
    ratificationFriction: 0.35,
  },
  {
    id: "quota_managed_trade",
    titleSuffix: "Managed Quota Accord",
    acceptanceBias: -0.15,
    domesticReaction: "trade",
    ratificationFriction: 0.55,
  },
  {
    id: "labor_side_letter_trade",
    titleSuffix: "Trade and Labor Standards Pact",
    acceptanceBias: -0.05,
    domesticReaction: "rights",
    ratificationFriction: 0.48,
  },
  {
    id: "digital_services_chapter",
    titleSuffix: "Digital Trade Framework",
    acceptanceBias: 0,
    domesticReaction: "trade",
    ratificationFriction: 0.42,
  },
  {
    id: "sanctions_carve_out_trade",
    titleSuffix: "Humanitarian Trade Carve-Out",
    acceptanceBias: 0.2,
    domesticReaction: "sanctions",
    ratificationFriction: 0.6,
  },
  {
    id: "agricultural_safeguard_trade",
    titleSuffix: "Agricultural Safeguard Accord",
    acceptanceBias: -0.25,
    domesticReaction: "trade",
    ratificationFriction: 0.52,
  },
] as const;

export function pickTradeTreatyVariant(
  rel: BilateralRelation | null,
  variantIndex: number,
): TradeTreatyVariant {
  if (!rel) return TRADE_TREATY_VARIANTS[0]!;
  const pool =
    rel.general < -25
      ? TRADE_TREATY_VARIANTS.filter((v) => v.id.includes("safeguard") || v.id.includes("quota"))
      : rel.trust > 0.55
        ? TRADE_TREATY_VARIANTS.filter(
            (v) => v.id.includes("digital") || v.id.includes("standard"),
          )
        : TRADE_TREATY_VARIANTS;
  return pool[Math.abs(variantIndex) % pool.length] ?? TRADE_TREATY_VARIANTS[0]!;
}

export function applyTradeTreatyVariantMetadata(
  treaty: TreatyRecord,
  partnerName: string,
  rel: BilateralRelation | null,
  variantIndex: number,
): void {
  if (treaty.kind !== "trade") return;
  const variant = pickTradeTreatyVariant(rel, variantIndex);
  treaty.metadata = {
    ...treaty.metadata,
    variantId: variant.id,
    domesticReaction: variant.domesticReaction,
    ratificationFriction: variant.ratificationFriction,
    acceptanceBias: variant.acceptanceBias,
  };
  if (!treaty.title.includes(variant.titleSuffix)) {
    treaty.title = `${partnerName}–Terena ${variant.titleSuffix}`;
  }
}

export function treatyVariantDomesticReaction(treaty: TreatyRecord): string | null {
  const v = treaty.metadata.variantId;
  const reaction = treaty.metadata.domesticReaction;
  if (typeof reaction === "string") return reaction;
  if (typeof v === "string" && v.includes("labor")) return "rights";
  if (typeof v === "string" && v.includes("sanctions")) return "sanctions";
  return treaty.kind === "trade" ? "trade" : null;
}

export function isTradeKind(kind: TreatyKind): boolean {
  return kind === "trade";
}
