/**
 * partyOrg/officers.ts
 *
 * Seeds and queries national party officers.
 *
 * Design notes
 * ────────────
 * • Chair ≠ Assembly Leader.  The Assembly caucus leadership lives in
 *   legislature/caucus (and is managed by politics/caucusAgenda.ts).  This
 *   module manages the extra-parliamentary national party apparatus.
 * • On first run (migration or new game) `ensureDefaultOfficers` seeds:
 *     – Chair  ← partyStates[partyId].leaderId   (the existing "leader" concept
 *                acts as de-facto chair for parties that haven't been extended)
 *     – Vice Chair / Treasurer ← first two eligible active MPs / politicians
 *       in the party who aren't already the Chair
 */

import type { KernelWorld, SimState } from "../types.js";
import type { NationalOfficeRole } from "./types.js";
import { ensurePartyOrgRuntime } from "./state.js";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Collect politician IDs who are active members of `partyId` and currently
 * alive + not retired, ordered by entry order (stable across calls).
 */
function partyActivePoliticians(state: SimState, partyId: string): string[] {
  return Object.entries(state.politicians)
    .filter(([, pol]) => pol.partyId === partyId && pol.alive && !pol.retired)
    .map(([id]) => id);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seeds missing officers for every party present in `state.partyStates`.
 *
 * Safe to call multiple times — only fills vacant slots, never overwrites an
 * existing officer.  Called by `processPartyOrgMonth` and on engine restore.
 */
export function ensureDefaultOfficers(world: KernelWorld, state: SimState): void {
  const runtime = ensurePartyOrgRuntime(state);

  // ── Provincial party organisation foundation ─────────────────────────────
  // Seed lightly from the canonical world roster; leadership seats default to
  // vacant.  Never overwrites an existing record.
  if (world.provincialPartyOrganizations) {
    if (!runtime.provincialOrganizations) runtime.provincialOrganizations = {};
    const provincialOrgs = runtime.provincialOrganizations;
    for (const [orgId, org] of Object.entries(world.provincialPartyOrganizations)) {
      if (!org || provincialOrgs[orgId]) continue;
      provincialOrgs[orgId] = {
        partyId: org.partyId,
        provinceId: org.provinceId,
        chairId: null,
        assemblyLeaderId: null,
      };
    }
  }

  for (const partyId of Object.keys(state.partyStates)) {
    const partyState = state.partyStates[partyId];
    if (!partyState) continue;

    if (!runtime.officers[partyId]) runtime.officers[partyId] = {};
    const officers = runtime.officers[partyId]!;

    // ── Chair: seed from partyStates.leaderId ────────────────────────────
    if (!officers.chair && partyState.leaderId) {
      const pol = state.politicians[partyState.leaderId];
      if (pol?.alive && !pol.retired) {
        officers.chair = {
          role: "chair",
          politicianId: partyState.leaderId,
          partyId,
          assumedDate: state.currentDate,
        };
      }
    }

    // ── Vice Chair / Treasurer: first two eligible active members ─────────
    const chairId = officers.chair?.politicianId ?? null;
    const existingOfficerIds = new Set(
      Object.values(officers)
        .filter(Boolean)
        .map((o) => o!.politicianId),
    );

    const candidates = partyActivePoliticians(state, partyId).filter(
      (id) => id !== chairId && !existingOfficerIds.has(id),
    );

    const rolesToFill: NationalOfficeRole[] = ["vice_chair", "treasurer"];
    let candidateIdx = 0;
    for (const role of rolesToFill) {
      if (officers[role]) continue; // already filled
      while (candidateIdx < candidates.length) {
        const candidateId = candidates[candidateIdx++]!;
        officers[role] = {
          role,
          politicianId: candidateId,
          partyId,
          assumedDate: state.currentDate,
        };
        break;
      }
    }
  }
}

/**
 * Returns a snapshot of currently filled officer roles for a party.
 * Absent roles (vacant seats) are excluded from the returned array.
 */
export function listOfficers(
  state: SimState,
  partyId: string,
): Array<{ role: NationalOfficeRole; politicianId: string; assumedDate: string }> {
  const runtime = state.partyOrgRuntime;
  if (!runtime) return [];
  const officers = runtime.officers[partyId];
  if (!officers) return [];
  const result: Array<{ role: NationalOfficeRole; politicianId: string; assumedDate: string }> = [];
  for (const role of ["chair", "vice_chair", "treasurer", "national_committee_member"] as const) {
    const off = officers[role];
    if (off) {
      result.push({ role, politicianId: off.politicianId, assumedDate: off.assumedDate });
    }
  }
  return result;
}
