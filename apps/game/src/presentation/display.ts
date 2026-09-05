import type { PendingInterrupt } from "@lorsain/sim";
import type { PlayerActionableDecision } from "@lorsain/sim";

/** Bilateral relation label on the −100…100 diplomatic scale (not politician affinity). */
export { relationPublicLabel } from "../presentation.js";

/** Player-facing number formatting — never expose exact rational strings like 6205093/1. */
export function formatPublicNumber(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "bigint") return value.toLocaleString("en-US");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    if (Number.isInteger(value)) return value.toLocaleString("en-US");
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const rational = /^(-?\d+)\/(\d+)$/.exec(trimmed);
    if (rational) {
      const num = BigInt(rational[1]!);
      const den = BigInt(rational[2]!);
      if (den === 0n) return "—";
      if (den === 1n) return num.toLocaleString("en-US");
      const asNumber = Number(num) / Number(den);
      if (!Number.isFinite(asNumber)) return "—";
      if (Math.abs(asNumber - Math.round(asNumber)) < 0.005) {
        return Math.round(asNumber).toLocaleString("en-US");
      }
      return asNumber.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }
    const n = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(n)) {
      return formatPublicNumber(n);
    }
    return trimmed;
  }
  return String(value);
}

/** Format vote share as a percentage for election displays. */
export function formatPublicPercent(share: number | undefined | null, digits = 1): string {
  if (share == null || !Number.isFinite(share)) return "—";
  return `${(share * 100).toFixed(digits)}%`;
}

/** Presentation-only index movement. Zero after rounding is shown as unchanged. */
export function formatIndexDelta(delta: number, digits = 1): string {
  if (!Number.isFinite(delta)) return "—";
  const rounded = Number(delta.toFixed(digits));
  if (rounded === 0) return `— ${Math.abs(rounded).toFixed(digits)}`;
  const arrow = rounded > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(rounded).toFixed(digits)}`;
}

const INTERRUPT_LABELS: Record<string, (date?: string) => string> = {
  PRESIDENTIAL_ELECTION_DUE: (date) => {
    const year = date?.slice(0, 4);
    return year
      ? `The ${year} presidential election must be resolved before time can advance.`
      : "The presidential election must be resolved before time can advance.";
  },
  ASSEMBLY_ELECTION_DUE: (date) => {
    const year = date?.slice(0, 4);
    return year
      ? `The ${year} Assembly election must be resolved before time can advance.`
      : "The Assembly election must be resolved before time can advance.";
  },
  ASSEMBLY_ASSUMPTION_DUE: () => "The new Assembly must be seated before time can advance.",
  SPECIAL_PRESIDENTIAL_ELECTION_DEADLINE: () =>
    "A special presidential election must be resolved before time can advance.",
  OFFICE_TERM_END_DUE: () => "An office term must be processed before time can advance.",
  PRESIDENTIAL_ASSUMPTION_DUE: () =>
    "The presidential assumption ceremony must be completed before time can advance.",
};

/** Human-readable interrupt copy — never expose internal event codes to players. */
export function interruptDisplay(interrupt: Pick<PendingInterrupt, "code" | "date">): string {
  const fn = INTERRUPT_LABELS[interrupt.code];
  if (fn) return fn(interrupt.date);
  if (interrupt.date) {
    return `A required event on ${interrupt.date} must be resolved before time can advance.`;
  }
  return "A required event must be resolved before time can advance.";
}

/** Returns true if a string looks like an internal simulation code (SCREAMING_SNAKE). */
export function looksLikeInternalCode(text: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(text.trim());
}

export function decisionDisplayLabel(
  decision: PlayerActionableDecision,
  interrupt: PendingInterrupt | null,
): string {
  if (decision.kind === "interrupt" && interrupt) {
    return interruptDisplay(interrupt);
  }
  if (looksLikeInternalCode(decision.label)) {
    return "Action required before the month can close.";
  }
  return decision.label;
}

export function relationshipPublicLabel(affinity: number | null | undefined): string {
  if (affinity == null) return "No recorded contact";
  if (affinity >= 0.55) return "Friendly";
  if (affinity >= 0.25) return "Cordial";
  if (affinity >= 0.05) return "Professional";
  if (affinity >= -0.05) return "Neutral";
  if (affinity >= -0.25) return "Strained";
  if (affinity >= -0.55) return "Cool";
  return "Hostile";
}

export const BILL_PROGRESS_STAGES = [
  { id: "introduced", label: "Introduced" },
  { id: "committee", label: "Committee" },
  { id: "floor_scheduled", label: "Floor" },
  { id: "passed", label: "Passed" },
  { id: "sent_to_president", label: "Executive" },
  { id: "enacted", label: "Enacted" },
] as const;

export function billProgressIndex(status: string): number {
  const map: Record<string, number> = {
    draft: 0,
    introduced: 0,
    committee: 1,
    floor_scheduled: 2,
    floor_passed: 3,
    repassage_scheduled: 3,
    sent_to_president: 4,
    enacted: 5,
    failed: 2,
    withdrawn: 0,
    returned: 4,
  };
  return map[status] ?? 0;
}
