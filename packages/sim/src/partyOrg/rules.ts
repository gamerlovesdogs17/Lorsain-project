import type { KernelWorld, SimState } from "../types.js";
import type { LeadershipElectionMethod, NominationMethodForOffice, PartyRules } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic integer hash of a string — no randomness, same value every
 * call with the same input. Used to vary party archetypes by identity.
 */
function shortHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Default rules factory
// ---------------------------------------------------------------------------

/**
 * Derives default PartyRules for a party from its identity.
 *
 * Three governance archetypes keyed by `hash(partyShort + partyId) % 3`:
 *   0 – centralized  : committee chair election, committee nomination, approval required, 24-month term
 *   1 – membership   : membership ballot, self-nomination, no approval, 48-month term
 *   2 – convention   : convention-delegates election, committee nomination, approval required, 36-month term
 *
 * @param partyId   Canonical party identifier
 * @param partyShort  Short display name / ticker (optional — used to add variation)
 */
export function defaultPartyRules(partyId: string, partyShort?: string): PartyRules {
  const seed = shortHash((partyShort ?? "") + partyId);
  const archetype = seed % 3;

  let chairElectionMethod: LeadershipElectionMethod;
  let nominationMethodForChair: NominationMethodForOffice;
  let nationalCommitteeApprovalRequired: boolean;
  let termMonths: number;

  switch (archetype) {
    case 0: // centralized
      chairElectionMethod = "committee";
      nominationMethodForChair = "committee_nomination";
      nationalCommitteeApprovalRequired = true;
      termMonths = 24;
      break;
    case 1: // membership-driven
      chairElectionMethod = "membership";
      nominationMethodForChair = "self_nomination";
      nationalCommitteeApprovalRequired = false;
      termMonths = 48;
      break;
    default: // convention-based
      chairElectionMethod = "convention_delegates";
      nominationMethodForChair = "committee_nomination";
      nationalCommitteeApprovalRequired = true;
      termMonths = 36;
      break;
  }

  return {
    partyId,
    chairElectionMethod,
    nationalCommitteeApprovalRequired,
    nominationMethodForChair,
    termMonths,
  };
}

// ---------------------------------------------------------------------------
// Runtime accessor
// ---------------------------------------------------------------------------

/**
 * Returns effective PartyRules for `partyId`.
 *
 * Checks for a per-party rules override stored in `partyOrgRuntime.metadata`
 * under the key `rules_<partyId>` (allows scenario-specific overrides);
 * otherwise falls back to `defaultPartyRules` derived from the party's
 * canonical short name in `world.partyDefinitions`.
 */
export function getPartyRules(state: SimState, world: KernelWorld, partyId: string): PartyRules {
  const override = state.partyOrgRuntime?.metadata?.[`rules_${partyId}`];
  if (override && typeof override === "object" && !Array.isArray(override)) {
    return override as PartyRules;
  }
  const partyDef = world.partyDefinitions[partyId];
  return defaultPartyRules(partyId, partyDef?.short);
}
