import type { PrecedentRecord } from "../courts/types.js";
import type { SimState } from "../types.js";

/**
 * Court precedent chains for Phase 15 encyclopedia.
 *
 * PrecedentRecord currently stores caseType / constitutionalQuestion / disposition
 * but has no explicit cite / citedBy / followsPrecedent fields.
 * TODO(phase15): when court cases gain cite/precedent link fields, build light
 * chains here (decision → prior similar precedent) for History UI.
 */
export function courtPrecedentChain(_state: SimState, _decisionId: string): PrecedentRecord[] {
  // No cite/precedent graph fields on CourtCase / PrecedentRecord yet — skip.
  return [];
}

/** Soft lookup of similar-type precedents by case type (not a cite graph). */
export function precedentsByCaseType(state: SimState, caseType: string): PrecedentRecord[] {
  return Object.values(state.constitutionalRuntime.precedents)
    .filter((p) => p.caseType === caseType)
    .sort((a, b) => a.decisionDate.localeCompare(b.decisionDate));
}
