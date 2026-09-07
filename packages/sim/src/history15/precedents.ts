import type { IsoDate } from "../calendar.js";
import { compareIsoDate } from "../calendar.js";
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

/** Relations that treat the prior as controlling authority. */
const CONTROLLING_RELATIONS = new Set<PrecedentLinkRelation>(["follows", "relies_on", "limits"]);

function allExplicitLinks(state: SimState): PrecedentLink[] {
  const runtime = ensureHistory15Runtime(state);
  const out: PrecedentLink[] = [];
  const seen = new Set<string>();
  for (const l of runtime.precedentLinks) {
    if (!CHAIN_RELATIONS.has(l.relation)) continue;
    const key = linkKey(l.fromDecisionId, l.toDecisionId, l.relation);
    if (seen.has(key)) continue;
    out.push(l);
    seen.add(key);
  }
  for (const decision of Object.values(state.constitutionalRuntime?.courtDecisions ?? {})) {
    if (!decision.precedentTreatments) continue;
    for (const t of decision.precedentTreatments) {
      if (!CHAIN_RELATIONS.has(t.relation)) continue;
      const key = linkKey(decision.id, t.priorDecisionId, t.relation);
      if (seen.has(key)) continue;
      out.push({
        fromDecisionId: decision.id,
        toDecisionId: t.priorDecisionId,
        relation: t.relation,
      });
      seen.add(key);
    }
  }
  return out;
}

/**
 * Precedents currently under an effective overturn.
 * If the overturning decision is itself overturned, the prior is restored.
 */
export function overturnedPrecedentIds(state: SimState): Set<string> {
  const overturnEdges = allExplicitLinks(state).filter((l) => l.relation === "overturns");
  if (overturnEdges.length === 0) return new Set();

  let overturned = new Set(overturnEdges.map((e) => e.toDecisionId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...overturned]) {
      const liveOverturner = overturnEdges.some(
        (e) => e.toDecisionId === id && !overturned.has(e.fromDecisionId),
      );
      if (!liveOverturner) {
        overturned.delete(id);
        changed = true;
      }
    }
  }
  return overturned;
}

export function isOverturnedPrecedent(state: SimState, decisionId: string): boolean {
  return overturnedPrecedentIds(state).has(decisionId);
}

/**
 * Controlling authority: not overturned (or restored after the overturner fell).
 * Distinguishes/overturns cites are not "controlling" treatments of the prior.
 */
export function isControllingPrecedent(state: SimState, decisionId: string): boolean {
  if (!state.constitutionalRuntime?.precedents?.[decisionId]) return false;
  return !isOverturnedPrecedent(state, decisionId);
}

/** True if following edges from `start` can reach `target` (cycle if target→start and start reaches target). */
export function precedentReachable(
  state: SimState,
  startDecisionId: string,
  targetDecisionId: string,
  extraEdge?: { from: string; to: string },
): boolean {
  if (startDecisionId === targetDecisionId) return true;
  const adj = new Map<string, string[]>();
  for (const l of allExplicitLinks(state)) {
    const list = adj.get(l.fromDecisionId) ?? [];
    list.push(l.toDecisionId);
    adj.set(l.fromDecisionId, list);
  }
  if (extraEdge) {
    const list = adj.get(extraEdge.from) ?? [];
    list.push(extraEdge.to);
    adj.set(extraEdge.from, list);
  }
  const seen = new Set<string>();
  const stack = [startDecisionId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === targetDecisionId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return false;
}

export function wouldCreatePrecedentCycle(
  state: SimState,
  fromDecisionId: string,
  toDecisionId: string,
): boolean {
  if (fromDecisionId === toDecisionId) return true;
  // Cycle iff prior already reaches the new decision (or would via existing graph).
  return precedentReachable(state, toDecisionId, fromDecisionId, {
    from: fromDecisionId,
    to: toDecisionId,
  });
}

export type PrecedentTreatmentRejectReason =
  | "self_reference"
  | "unknown_prior"
  | "future_cite"
  | "duplicate"
  | "cycle"
  | "overturned_controlling"
  | "invalid_relation";

/**
 * Consistency checks for a single proposed cite edge.
 * - no self-reference
 * - no cycles
 * - no future case cites (prior must be strictly earlier than from / asOf)
 * - no duplicate edges
 * - overturned priors are not accepted as controlling without restore
 */
export function validatePrecedentTreatment(
  state: SimState,
  fromDecisionId: string,
  priorDecisionId: string,
  relation: PrecedentLinkRelation,
  asOfDate?: IsoDate,
): { ok: true } | { ok: false; reason: PrecedentTreatmentRejectReason } {
  if (!CHAIN_RELATIONS.has(relation)) return { ok: false, reason: "invalid_relation" };
  if (!priorDecisionId || priorDecisionId === fromDecisionId) {
    return { ok: false, reason: "self_reference" };
  }
  const priors = state.constitutionalRuntime?.precedents ?? {};
  const prior = priors[priorDecisionId];
  if (!prior) return { ok: false, reason: "unknown_prior" };

  const fromDecision = state.constitutionalRuntime?.courtDecisions?.[fromDecisionId];
  const fromDate =
    fromDecision?.decisionDate ??
    priors[fromDecisionId]?.decisionDate ??
    asOfDate ??
    state.currentDate;
  if (compareIsoDate(prior.decisionDate, fromDate) >= 0) {
    return { ok: false, reason: "future_cite" };
  }

  const runtime = ensureHistory15Runtime(state);
  const key = linkKey(fromDecisionId, priorDecisionId, relation);
  if (
    runtime.precedentLinks.some(
      (l) => linkKey(l.fromDecisionId, l.toDecisionId, l.relation) === key,
    )
  ) {
    return { ok: false, reason: "duplicate" };
  }

  if (wouldCreatePrecedentCycle(state, fromDecisionId, priorDecisionId)) {
    return { ok: false, reason: "cycle" };
  }

  if (CONTROLLING_RELATIONS.has(relation) && isOverturnedPrecedent(state, priorDecisionId)) {
    return { ok: false, reason: "overturned_controlling" };
  }

  return { ok: true };
}

export function filterValidPrecedentTreatments(
  state: SimState,
  fromDecisionId: string,
  treatments: Array<{ priorDecisionId: string; relation: PrecedentLinkRelation }>,
  asOfDate?: IsoDate,
): Array<{ priorDecisionId: string; relation: PrecedentLinkRelation }> {
  const out: Array<{ priorDecisionId: string; relation: PrecedentLinkRelation }> = [];
  const seenPair = new Set<string>();
  for (const t of treatments) {
    const pair = `${t.priorDecisionId}|${t.relation}`;
    if (seenPair.has(pair)) continue;
    const check = validatePrecedentTreatment(
      state,
      fromDecisionId,
      t.priorDecisionId,
      t.relation,
      asOfDate,
    );
    if (!check.ok) continue;
    seenPair.add(pair);
    out.push(t);
  }
  return out;
}

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
 * Never fabricates similarity-based links. Applies consistency filters.
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
  const accepted = filterValidPrecedentTreatments(state, fromDecisionId, treatments);
  for (const t of accepted) {
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
