import type { PrecedentRecord } from "../courts/types.js";
import type { SimState } from "../types.js";
import { ensureHistory15Runtime } from "./state.js";
import type { PrecedentLink, PrecedentLinkRelation } from "./types.js";

function linkKey(from: string, to: string, relation: string): string {
  return `${from}|${to}|${relation}`;
}

/**
 * When a new court decision shares caseType / constitutionalQuestion with an
 * earlier precedent, link as "follows" (same disposition) or "distinguishes"
 * (mismatch). Populates history15.precedentLinks (idempotent).
 */
export function syncPrecedentLinks(state: SimState): void {
  const runtime = ensureHistory15Runtime(state);
  const existing = new Set(
    runtime.precedentLinks.map((l) => linkKey(l.fromDecisionId, l.toDecisionId, l.relation)),
  );
  const precedents = Object.values(state.constitutionalRuntime?.precedents ?? {}).sort((a, b) =>
    a.decisionDate.localeCompare(b.decisionDate),
  );

  for (let i = 0; i < precedents.length; i++) {
    const newer = precedents[i]!;
    for (let j = i - 1; j >= 0; j--) {
      const older = precedents[j]!;
      if (older.caseType !== newer.caseType) continue;
      if (older.constitutionalQuestion !== newer.constitutionalQuestion) continue;
      if (older.decisionId === newer.decisionId) continue;

      const relation: PrecedentLinkRelation =
        older.disposition === newer.disposition ? "follows" : "distinguishes";
      const key = linkKey(newer.decisionId, older.decisionId, relation);
      if (existing.has(key)) break;
      runtime.precedentLinks.push({
        fromDecisionId: newer.decisionId,
        toDecisionId: older.decisionId,
        relation,
      });
      existing.add(key);
      break; // light chain: one nearest similar prior
    }
  }

  if (runtime.precedentLinks.length > 400) {
    runtime.precedentLinks = runtime.precedentLinks.slice(-400);
  }
}

/**
 * Ordered precedent chain for a decision: itself plus linked priors (follows /
 * distinguishes / relies_on), walking backward through precedentLinks.
 */
export function courtPrecedentChain(state: SimState, decisionId: string): PrecedentRecord[] {
  const runtime = ensureHistory15Runtime(state);
  const byId = state.constitutionalRuntime?.precedents ?? {};
  const start = byId[decisionId];
  if (!start) return [];

  const out: PrecedentRecord[] = [start];
  const seen = new Set<string>([decisionId]);
  let current = decisionId;

  for (let depth = 0; depth < 12; depth++) {
    const link = runtime.precedentLinks.find(
      (l) =>
        l.fromDecisionId === current &&
        (l.relation === "follows" ||
          l.relation === "distinguishes" ||
          l.relation === "relies_on" ||
          l.relation === "limits" ||
          l.relation === "overturns"),
    );
    if (!link || seen.has(link.toDecisionId)) break;
    const next = byId[link.toDecisionId];
    if (!next) break;
    out.push(next);
    seen.add(link.toDecisionId);
    current = link.toDecisionId;
  }

  return out;
}

/** Soft lookup of similar-type precedents by case type (not a cite graph). */
export function precedentsByCaseType(state: SimState, caseType: string): PrecedentRecord[] {
  return Object.values(state.constitutionalRuntime?.precedents ?? {})
    .filter((p) => p.caseType === caseType)
    .sort((a, b) => a.decisionDate.localeCompare(b.decisionDate));
}

export type { PrecedentLink };
