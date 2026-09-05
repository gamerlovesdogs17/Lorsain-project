import type { IrvResult, StvResult, TieResolutionMethod } from "@lorsain/election-math";
import { isIsoDate, type IsoDate } from "../calendar.js";
import type { ElectionCertification } from "./types.js";

const AUTOMATIC_RECOUNT_MARGIN = 0.005;
const CERTIFICATION_STATUSES = new Set(["pending", "certified", "certified_after_recount"]);
const CERTIFICATION_AUTHORITIES = new Set([
  "national_electoral_commission",
  "provincial_electoral_commission",
]);
const RECOUNT_STATUSES = new Set(["not_required", "automatic_exact_recount_completed"]);
const TIE_METHODS = new Set(["previous_count_totals", "first_preferences", "legal_lot"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function parseElectionCertification(
  raw: unknown,
): ElectionCertification | undefined | string {
  if (raw == null) return undefined;
  if (!isRecord(raw)) return "certification";
  if (!CERTIFICATION_STATUSES.has(String(raw.status))) return "certification.status";
  if (!CERTIFICATION_AUTHORITIES.has(String(raw.authority))) return "certification.authority";
  if (raw.certifiedDate != null && !isIsoDate(raw.certifiedDate))
    return "certification.certifiedDate";
  if (!RECOUNT_STATUSES.has(String(raw.recount))) return "certification.recount";
  if (raw.recountReason != null && typeof raw.recountReason !== "string")
    return "certification.recountReason";
  if (
    raw.margin != null &&
    (typeof raw.margin !== "number" ||
      !Number.isFinite(raw.margin) ||
      raw.margin < 0 ||
      raw.margin > 1)
  )
    return "certification.margin";
  if (
    !Array.isArray(raw.tieBreakMethods) ||
    raw.tieBreakMethods.some((method) => !TIE_METHODS.has(String(method)))
  )
    return "certification.tieBreakMethods";
  return {
    status: raw.status as ElectionCertification["status"],
    authority: raw.authority as ElectionCertification["authority"],
    certifiedDate: raw.certifiedDate == null ? null : (raw.certifiedDate as IsoDate),
    recount: raw.recount as ElectionCertification["recount"],
    recountReason: raw.recountReason == null ? null : String(raw.recountReason),
    margin: raw.margin == null ? null : Number(raw.margin),
    tieBreakMethods: raw.tieBreakMethods as ElectionCertification["tieBreakMethods"],
  };
}

function rationalNumber(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split("/");
  const top = Number(numerator);
  const bottom = denominator == null ? 1 : Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : 0;
}

function orderedTieMethods(
  methods: Iterable<TieResolutionMethod>,
): ElectionCertification["tieBreakMethods"] {
  const seen = new Set(methods);
  return (["previous_count_totals", "first_preferences", "legal_lot"] as const).filter((method) =>
    seen.has(method),
  );
}

export function countTieMethods(
  archives: Array<IrvResult | StvResult>,
): ElectionCertification["tieBreakMethods"] {
  const methods: TieResolutionMethod[] = [];
  for (const archive of archives) {
    const steps = archive.method === "irv" ? archive.rounds : archive.steps;
    for (const step of steps) if (step.tieResolution) methods.push(step.tieResolution.method);
  }
  return orderedTieMethods(methods);
}

export function irvFinalMargin(result: IrvResult): number | null {
  const final = result.rounds.at(-1);
  if (!final) return null;
  const totals = Object.entries(final.totalsBefore)
    .map(([id, value]) => ({ id, votes: rationalNumber(value) }))
    .sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id));
  if (totals.length < 2) return null;
  const total = rationalNumber(result.totalValid);
  return total > 0 ? Math.max(0, totals[0]!.votes - totals[1]!.votes) / total : null;
}

export function certifyCount(args: {
  date: IsoDate;
  authority: ElectionCertification["authority"];
  archives: Array<IrvResult | StvResult>;
  margin?: number | null;
}): ElectionCertification {
  const margin =
    args.margin ??
    (args.archives.length === 1 && args.archives[0]?.method === "irv"
      ? irvFinalMargin(args.archives[0])
      : null);
  const recount = margin != null && margin <= AUTOMATIC_RECOUNT_MARGIN;
  return {
    status: recount ? "certified_after_recount" : "certified",
    authority: args.authority,
    certifiedDate: args.date,
    recount: recount ? "automatic_exact_recount_completed" : "not_required",
    recountReason: recount
      ? `Final margin was at or below ${(AUTOMATIC_RECOUNT_MARGIN * 100).toFixed(1)}%. The archived exact count was rerun before certification.`
      : null,
    margin,
    tieBreakMethods: countTieMethods(args.archives),
  };
}

export function certifyShareResult(args: {
  date: IsoDate;
  authority: ElectionCertification["authority"];
  shares: number[];
  legalLotUsed?: boolean;
}): ElectionCertification {
  const ranked = args.shares.slice().sort((a, b) => b - a);
  const margin = ranked.length >= 2 ? Math.max(0, ranked[0]! - ranked[1]!) : null;
  const recount = margin != null && margin <= AUTOMATIC_RECOUNT_MARGIN;
  return {
    status: recount ? "certified_after_recount" : "certified",
    authority: args.authority,
    certifiedDate: args.date,
    recount: recount ? "automatic_exact_recount_completed" : "not_required",
    recountReason: recount
      ? `Top shares were within ${(AUTOMATIC_RECOUNT_MARGIN * 100).toFixed(1)}%. Totals were reconciled before certification.`
      : null,
    margin,
    tieBreakMethods: args.legalLotUsed ? ["legal_lot"] : [],
  };
}
