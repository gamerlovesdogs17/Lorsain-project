/**
 * partyOrg/monthly.ts
 *
 * Monthly orchestrator for the party-organisation module.
 *
 * Engine placement: after `processPartyInstitutionsMonth` and
 * `processPoliticalAgencyMonth`, before `processGoverningMonth`.
 * (See engine.ts wiring comment.)
 *
 * Each month this does:
 *   1. Ensure default officers are seeded for all parties.
 *   2. For NPC-controlled parties: rare (≈10% chance per party) priority update.
 *   3. Open a chair election for any party whose chair seat is vacant and has no
 *      open election already.
 */

import { monthStart } from "../campaigns/effects.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { openPartyChairElection } from "./elections.js";
import { ensureDefaultOfficers } from "./officers.js";
import { ensurePartyOrgRuntime } from "./state.js";
import { setPartyPriorities } from "./commands.js";

/** Rough sample of NPC priority updates — not connected to RNG service because
 *  monthly is not passed `rng`.  Uses a simple date-seeded deterministic roll. */
function deterministicRoll(partyId: string, dateStr: string): number {
  let h = 0;
  const s = partyId + dateStr;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 100) / 100;
}

const NPC_PRIORITY_TEMPLATES: string[][] = [
  ["economic_growth", "fiscal_balance", "trade"],
  ["social_services", "housing", "healthcare"],
  ["law_and_order", "national_security", "border_control"],
  ["education", "innovation", "environment"],
  ["regional_development", "infrastructure", "agriculture"],
];

export function processPartyOrgMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePartyOrgRuntime(state);
  const month = monthStart(state.currentDate);
  if (runtime.lastOrgMonth === month) return [];

  const events: SimEvent[] = [];

  // ── 1. Seed officers for all parties ──────────────────────────────────────
  ensureDefaultOfficers(world, state);

  // ── 2. NPC chair priority updates (rare) ──────────────────────────────────
  for (const partyId of Object.keys(state.partyStates)) {
    const partyState = state.partyStates[partyId];
    if (!partyState) continue;

    const chairId = runtime.officers[partyId]?.chair?.politicianId ?? null;
    if (!chairId) continue;

    // Only update NPC-controlled chairs (skip player's own party chair if player is it)
    if (chairId === state.playerPoliticianId) continue;

    // ≈10% chance per party-month to refresh priorities
    if (deterministicRoll(partyId, month) > 0.1) continue;

    const roll2 = deterministicRoll(partyId + "_tmpl", month);
    const templateIdx = Math.floor(roll2 * NPC_PRIORITY_TEMPLATES.length);
    const template = NPC_PRIORITY_TEMPLATES[templateIdx] ?? NPC_PRIORITY_TEMPLATES[0]!;

    setPartyPriorities(state, world, {
      actorId: chairId,
      partyId,
      priorities: template,
      commandId,
    });
  }

  // ── 3. Open elections for vacant chair seats ───────────────────────────────
  for (const partyId of Object.keys(state.partyStates)) {
    const officers = runtime.officers[partyId];
    if (officers?.chair) continue; // chair present — nothing to do

    // Check no election already open
    const openElection = Object.values(runtime.chairElections).find(
      (e) => e.partyId === partyId && e.status === "open",
    );
    if (openElection) continue;

    const result = openPartyChairElection(state, world, { partyId, commandId });
    if (result.ok) {
      // Push the opened event into our return array (pushHistory already recorded it)
      // We capture it via the history delta — find the last pushed event
      const lastEvent = state.history[state.history.length - 1];
      if (lastEvent?.type === "PARTY_CHAIR_ELECTION_OPENED") {
        events.push(lastEvent);
      }
    }
  }

  runtime.lastOrgMonth = month;
  return events;
}
