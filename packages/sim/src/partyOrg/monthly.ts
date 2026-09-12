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
 *   3. Open a chair election for vacant seats or expired terms.
 *   4. Auto-resolve open chair elections after ~2 months (NPC candidates if needed).
 */

import { addMonths, compareIsoDate } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import {
  declareChairCandidacy,
  openPartyChairElection,
  resolveChairElection,
} from "./elections.js";
import { ensureDefaultOfficers } from "./officers.js";
import { getPartyRules } from "./rules.js";
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
  ["growth_and_jobs", "tax_fairness", "field_infrastructure"],
  ["healthcare_access", "housing_affordability", "membership_growth"],
  ["institutional_renewal", "foreign_credibility", "defense_modernization"],
  ["green_transition", "digital_rights", "labor_standards"],
  ["provincial_fairness", "rural_connectivity", "candidate_recruitment"],
  ["caucus_cohesion", "message_discipline", "immigration_integration"],
];

const CHAIR_ELECTION_AUTO_RESOLVE_MONTHS = 2;

function hasOpenChairElection(
  runtime: ReturnType<typeof ensurePartyOrgRuntime>,
  partyId: string,
): boolean {
  return Object.values(runtime.chairElections).some(
    (e) => e.partyId === partyId && e.status === "open",
  );
}

function termExpired(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  assumedDate: string,
): boolean {
  const rules = getPartyRules(state, world, partyId);
  if (rules.termMonths <= 0) return false;
  const termEnd = addMonths(assumedDate, rules.termMonths);
  return compareIsoDate(monthStart(state.currentDate), monthStart(termEnd)) >= 0;
}

function seedNpcCandidates(
  state: SimState,
  world: KernelWorld,
  electionId: string,
  partyId: string,
  commandId: string,
): void {
  const pool = Object.entries(state.politicians)
    .filter(
      ([id, p]) =>
        p.partyId === partyId && p.alive && !p.retired && id !== state.playerPoliticianId,
    )
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 4);
  for (const politicianId of pool) {
    declareChairCandidacy(state, world, { electionId, politicianId, commandId });
  }
}

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

  // ── 3. Open elections for vacant or term-expired chair seats ───────────────
  for (const partyId of Object.keys(state.partyStates)) {
    if (hasOpenChairElection(runtime, partyId)) continue;

    const chair = runtime.officers[partyId]?.chair;
    const vacant = !chair;
    const expired = chair ? termExpired(state, world, partyId, chair.assumedDate) : false;
    if (!vacant && !expired) continue;

    const result = openPartyChairElection(state, world, { partyId, commandId });
    if (result.ok) {
      const lastEvent = state.history[state.history.length - 1];
      if (lastEvent?.type === "PARTY_CHAIR_ELECTION_OPENED") {
        events.push(lastEvent);
      }
    }
  }

  // ── 4. Auto-resolve open chair elections after ~2 months ───────────────────
  for (const election of Object.values(runtime.chairElections).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (election.status !== "open") continue;
    const resolveAfter = addMonths(election.openedDate, CHAIR_ELECTION_AUTO_RESOLVE_MONTHS);
    if (compareIsoDate(monthStart(state.currentDate), monthStart(resolveAfter)) < 0) continue;

    if (election.candidates.length === 0) {
      seedNpcCandidates(state, world, election.id, election.partyId, commandId);
    }
    if (election.candidates.length === 0) continue;

    const resolved = resolveChairElection(state, world, {
      electionId: election.id,
      commandId,
    });
    if (resolved.ok) {
      const lastEvent = state.history[state.history.length - 1];
      if (lastEvent?.type === "PARTY_CHAIR_ELECTED") {
        events.push(lastEvent);
      }
    }
  }

  runtime.lastOrgMonth = month;
  return events;
}
