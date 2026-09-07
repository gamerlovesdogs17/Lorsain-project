import type { PrecedentRecord } from "../courts/types.js";
import type { SimState } from "../types.js";
import { ensureHistory15Runtime } from "./state.js";
import type { PrecedentLink, PrecedentLinkRelation } from "./types.js";

function linkKey(from: string, to: string, relation: string): string {
  return `${from}|${to}|${relation}`;
}

const CHAIN_RELATIONS = new Set<PrecedentLinkRelation>([
  "follows",
  "distinguishes",
  "relies_on",
  "limits",
  "overturns",
]);

/**
 * Idempotent prune helper. Does NOT infer links from similar questions/outcomes.
 * Explicit links are written only when a court decision records precedentTreatments.
 */
export function syncPrecedentLinks(state: SimState): void {
  const runtime = ensureHistory15Runtime(state);
  if (runtime.precedentLinks.length > 400) {
    runtime.precedentLinks = runtime.precedentLinks.slice(-400);
  }
}

/**
 * Record explicit precedent treatments onto history15.precedentLinks (idempotent).
 * Never fabricates similarity-based links.
 */
export function recordExplicitPrecedentLinks(
  state: SimState,
  fromDecisionId: string,
  treatments: Array<{ priorDecisionId: string; relation: PrecedentLinkRelation }>,
): void {
  if (!treatments.length) return;
  const runtime = ensureHistory15Runtime(state);
  const existing = new Set(
    runtime.precedentLinks.map((l) => linkKey(l.fromDecisionId, l.toDecisionId, l.relation)),
  );
  for (const t of treatments) {
    if (!t.priorDecisionId || !CHAIN_RELATIONS.has(t.relation)) continue;
    const key = linkKey(fromDecisionId, t.priorDecisionId, t.relation);
    if (existing.has(key)) continue;
    runtime.precedentLinks.push({
      fromDecisionId,
      toDecisionId: t.priorDecisionId,
      relation: t.relation,
    });
    existing.add(key);
  }
  if (runtime.precedentLinks.length > 400) {
    runtime.precedentLinks = runtime.precedentLinks.slice(-400);
  }
}

function explicitLinksForDecision(state: SimState, decisionId: string): PrecedentLink[] {
  const runtime = ensureHistory15Runtime(state);
  const fromRuntime = runtime.precedentLinks.filter(
    (l) => l.fromDecisionId === decisionId && CHAIN_RELATIONS.has(l.relation),
  );
  const decision = state.constitutionalRuntime?.courtDecisions?.[decisionId];
  const fromDecision: PrecedentLink[] = [];
  if (decision?.precedentTreatments) {
    for (const t of decision.precedentTreatments) {
      if (!CHAIN_RELATIONS.has(t.relation)) continue;
      fromDecision.push({
        fromDecisionId: decisionId,
        toDecisionId: t.priorDecisionId,
        relation: t.relation,
      });
    }
  }
  const seen = new Set(
    fromRuntime.map((l) => linkKey(l.fromDecisionId, l.toDecisionId, l.relation)),
  );
  const merged = [...fromRuntime];
  for (const l of fromDecision) {
    const key = linkKey(l.fromDecisionId, l.toDecisionId, l.relation);
    if (seen.has(key)) continue;
    merged.push(l);
    seen.add(key);
  }
  return merged;
}

/**
 * Ordered precedent chain for a decision: itself plus linked priors, walking
 * backward through explicit precedentLinks / decision.precedentTreatments only.
 * NEVER infers from shared caseType/question/outcome.
 * If no explicit links exist for this decision, returns [].
 */
export function courtPrecedentChain(state: SimState, decisionId: string): PrecedentRecord[] {
  const byId = state.constitutionalRuntime?.precedents ?? {};
  const start = byId[decisionId];
  if (!start) return [];

  const outgoing = explicitLinksForDecision(state, decisionId);
  if (outgoing.length === 0) return [];

  const out: PrecedentRecord[] = [start];
  const seen = new Set<string>([decisionId]);
  let current = decisionId;

  for (let depth = 0; depth < 12; depth++) {
    const links = explicitLinksForDecision(state, current);
    const link = links.find(
      (l) =>
        l.fromDecisionId === current &&
        CHAIN_RELATIONS.has(l.relation) &&
        !seen.has(l.toDecisionId),
    );
    if (!link) break;
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
