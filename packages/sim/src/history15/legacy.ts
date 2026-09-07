import type { SimState } from "../types.js";
import { ensureHistory15Runtime } from "./state.js";
import type { PoliticianLegacy } from "./types.js";

/**
 * On retirement/death events, write politicianLegacies from officeTerms + history.
 */
export function syncPoliticianLegacies(state: SimState): void {
  const runtime = ensureHistory15Runtime(state);
  const recent = state.history.slice(-120);
  for (const ev of recent) {
    if (ev.type !== "POLITICIAN_RETIRED" && ev.type !== "POLITICIAN_DIED") continue;
    const politicianId =
      ev.actorIds[0] ??
      (typeof ev.payload?.politicianId === "string" ? ev.payload.politicianId : null);
    if (!politicianId || runtime.politicianLegacies[politicianId]) continue;

    const offices = new Set<string>();
    for (const term of Object.values(state.officeTerms)) {
      if (term.holderId !== politicianId) continue;
      offices.add(term.officeId);
    }

    const partyLeadership: string[] = [];
    for (const tenure of runtime.tenures) {
      if (tenure.chairId === politicianId) {
        partyLeadership.push(`${tenure.partyId}:${tenure.start}`);
      }
    }
    for (const party of Object.values(state.partyStates)) {
      if (party.leaderId === politicianId) {
        partyLeadership.push(`leader:${party.partyId}`);
      }
    }

    const majorLaws: string[] = [];
    const elections: string[] = [];
    const notes: string[] = [];
    for (const h of state.history) {
      if (!h.actorIds.includes(politicianId) && !h.entityIds.includes(politicianId)) continue;
      if (h.type === "LAW_ENACTED") {
        const lawId =
          (typeof h.payload?.lawId === "string" && h.payload.lawId) ||
          h.entityIds.find((id) => id.startsWith("LAW")) ||
          h.id;
        majorLaws.push(lawId);
      }
      if (
        h.type === "PRESIDENTIAL_ELECTION_RESULT" ||
        h.type === "ASSEMBLY_ELECTION_RESULT" ||
        h.type.includes("ELECTION")
      ) {
        elections.push(h.id);
      }
      if (h.type === "PARTY_CHAIR_ELECTED" || h.type === "PARTY_LEADER_SET") {
        notes.push(h.type);
      }
    }

    const legacy: PoliticianLegacy = {
      politicianId,
      closedDate: ev.date,
      offices: [...offices].sort().slice(0, 40),
      partyLeadership: [...new Set(partyLeadership)].slice(0, 20),
      majorLaws: [...new Set(majorLaws)].slice(0, 24),
      elections: [...new Set(elections)].slice(0, 24),
      notes: [...new Set(notes)].slice(0, 16),
    };
    runtime.politicianLegacies[politicianId] = legacy;
  }
}

/** Explicit helper for tests / call sites that already know a retirement happened. */
export function recordPoliticianLegacy(
  state: SimState,
  politicianId: string,
  closedDate?: string,
): PoliticianLegacy | null {
  const runtime = ensureHistory15Runtime(state);
  if (runtime.politicianLegacies[politicianId]) {
    return runtime.politicianLegacies[politicianId]!;
  }
  const pol = state.politicians[politicianId];
  if (!pol) return null;
  // Seed a synthetic history event path by writing directly
  const offices = Object.values(state.officeTerms)
    .filter((t) => t.holderId === politicianId)
    .map((t) => t.officeId)
    .sort();
  const legacy: PoliticianLegacy = {
    politicianId,
    closedDate: closedDate ?? state.currentDate,
    offices: [...new Set(offices)].slice(0, 40),
    partyLeadership: [],
    majorLaws: [],
    elections: [],
    notes: pol.retired ? ["retired"] : !pol.alive ? ["deceased"] : ["closed"],
  };
  runtime.politicianLegacies[politicianId] = legacy;
  return legacy;
}
