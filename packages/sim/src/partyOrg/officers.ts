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
 *     – Chair  ← partyStates[partyId].leaderId
 *     – Vice Chair / Treasurer ← selectOfficer under PartyRules selection methods
 */

import type { KernelWorld, SimState } from "../types.js";
import { ensureNationalCommittees, seedNationalCommittee } from "./committee.js";
import { getPartyRules } from "./rules.js";
import { ensurePartyOrgRuntime } from "./state.js";
import type { NationalOfficeRole, OfficerSelectionMethod } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function partyActivePoliticians(state: SimState, partyId: string): string[] {
  return Object.entries(state.politicians)
    .filter(([, pol]) => pol.partyId === partyId && pol.alive && !pol.retired)
    .map(([id]) => id);
}

function affinityTo(state: SimState, electorId: string, candidateId: string): number {
  return state.relationships[electorId]?.[candidateId]?.affinity ?? 0;
}

function pickByAffinityToAnchor(
  state: SimState,
  candidates: string[],
  anchorId: string | null,
): string | null {
  if (candidates.length === 0) return null;
  if (!anchorId) return candidates[0] ?? null;
  let best = candidates[0]!;
  let bestAff = affinityTo(state, anchorId, best);
  // Prefer candidates the anchor likes (affinity from anchor → candidate),
  // falling back to candidate → anchor if needed.
  for (let i = 0; i < candidates.length; i++) {
    const cid = candidates[i]!;
    const aff = affinityTo(state, anchorId, cid) * 0.6 + affinityTo(state, cid, anchorId) * 0.4;
    if (aff > bestAff || (aff === bestAff && cid < best)) {
      bestAff = aff;
      best = cid;
    }
  }
  return best;
}

function committeePluralityPick(
  state: SimState,
  electors: string[],
  candidates: string[],
): string | null {
  if (candidates.length === 0) return null;
  const tally: Record<string, number> = {};
  for (const cid of candidates) tally[cid] = 0;
  for (const electorId of electors) {
    let best: string | null = null;
    let bestAff = -Infinity;
    for (const cid of candidates) {
      const aff = affinityTo(state, electorId, cid);
      if (aff > bestAff || (aff === bestAff && best !== null && cid < best)) {
        bestAff = aff;
        best = cid;
      }
    }
    if (best) tally[best] = (tally[best] ?? 0) + 1;
  }
  let winner = candidates[0]!;
  for (const cid of candidates) {
    const v = tally[cid] ?? 0;
    const best = tally[winner] ?? 0;
    if (v > best || (v === best && cid < winner)) winner = cid;
  }
  return winner;
}

/**
 * Lightweight officer selection under a PartyRules selection method.
 * Returns null when no eligible candidate exists.
 */
export function selectOfficer(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  role: Exclude<NationalOfficeRole, "chair" | "national_committee_member">,
  method: OfficerSelectionMethod,
): string | null {
  const runtime = ensurePartyOrgRuntime(state);
  const officers = runtime.officers[partyId] ?? {};
  const chairId = officers.chair?.politicianId ?? null;
  const occupied = new Set(
    Object.values(officers)
      .filter(Boolean)
      .map((o) => o!.politicianId),
  );
  // Vacating the role under selection: allow re-pick excluding other roles.
  if (officers[role]) occupied.delete(officers[role]!.politicianId);

  const candidates = partyActivePoliticians(state, partyId).filter(
    (id) => id !== chairId && !occupied.has(id),
  );
  if (candidates.length === 0) return null;

  switch (method) {
    case "chair_appointment":
    case "chair_appointment_confirmed":
    case "chair_ticket":
      return pickByAffinityToAnchor(state, candidates, chairId);

    case "committee": {
      const electors = seedNationalCommittee(world, state, partyId);
      return committeePluralityPick(state, electors, candidates);
    }

    case "membership": {
      // Approximate membership ballot: all active party members vote by affinity.
      const electors = partyActivePoliticians(state, partyId);
      return committeePluralityPick(state, electors, candidates);
    }

    default:
      return candidates[0] ?? null;
  }
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

    const rules = getPartyRules(state, world, partyId);
    const roleMethods: Array<{
      role: "vice_chair" | "treasurer";
      method: OfficerSelectionMethod;
    }> = [
      { role: "vice_chair", method: rules.viceChairSelection },
      { role: "treasurer", method: rules.treasurerSelection },
    ];

    for (const { role, method } of roleMethods) {
      if (officers[role]) continue;
      const selected = selectOfficer(state, world, partyId, role, method);
      if (!selected) continue;
      officers[role] = {
        role,
        politicianId: selected,
        partyId,
        assumedDate: state.currentDate,
      };
    }
  }

  ensureNationalCommittees(world, state);
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
