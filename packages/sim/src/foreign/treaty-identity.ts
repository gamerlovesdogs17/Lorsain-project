import { addMonths } from "../calendar.js";
import type { IsoDate } from "../calendar.js";
import type { ForeignAffairsRuntime, TreatyKind, TreatyRecord, TreatyStatus } from "./types.js";

const BLOCKING_STATUSES: TreatyStatus[] = [
  "proposed",
  "counterparty_pending",
  "ratification_pending",
  "active",
  "suspended",
];

export function treatyIdentityKey(kind: TreatyKind, memberIds: string[]): string {
  return `${kind}|${[...memberIds].sort().join("|")}`;
}

export function findTreatyByIdentity(
  runtime: ForeignAffairsRuntime,
  kind: TreatyKind,
  memberIds: string[],
  statuses: TreatyStatus[] = BLOCKING_STATUSES,
): TreatyRecord | null {
  const key = treatyIdentityKey(kind, memberIds);
  for (const treaty of Object.values(runtime.treaties)) {
    if (treaty.kind !== kind) continue;
    if (!statuses.includes(treaty.status)) continue;
    if (treatyIdentityKey(treaty.kind, treaty.memberIds) === key) return treaty;
  }
  return null;
}

export function canProposeTreaty(
  runtime: ForeignAffairsRuntime,
  kind: TreatyKind,
  memberIds: string[],
  date: IsoDate,
): { ok: true } | { ok: false; reason: string } {
  const existing = findTreatyByIdentity(runtime, kind, memberIds);
  if (existing) {
    if (existing.status === "active" || existing.status === "suspended") {
      return { ok: false, reason: "active_agreement_exists" };
    }
    if (
      existing.status === "counterparty_pending" ||
      existing.status === "ratification_pending" ||
      existing.status === "proposed"
    ) {
      return { ok: false, reason: "pending_agreement_exists" };
    }
  }
  const key = treatyIdentityKey(kind, memberIds);
  const cooldownUntil = runtime.treatyProposalCooldowns[key];
  if (cooldownUntil && cooldownUntil > date) {
    return { ok: false, reason: "cooldown_active" };
  }
  return { ok: true };
}

export function recordTreatyRejectionCooldown(
  runtime: ForeignAffairsRuntime,
  treaty: TreatyRecord,
  date: IsoDate,
  months = 18,
): void {
  const key = treatyIdentityKey(treaty.kind, treaty.memberIds);
  runtime.treatyProposalCooldowns[key] = addMonths(date, months);
}

export function activeTreatiesForPair(
  runtime: ForeignAffairsRuntime,
  aId: string,
  bId: string,
): TreatyRecord[] {
  const members = new Set([aId, bId]);
  return Object.values(runtime.treaties).filter(
    (t) =>
      t.status === "active" &&
      t.memberIds.length === 2 &&
      members.has(t.memberIds[0]!) &&
      members.has(t.memberIds[1]!),
  );
}
