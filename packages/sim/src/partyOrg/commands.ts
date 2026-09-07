/**
 * partyOrg/commands.ts
 *
 * Shared command handlers for party-organisation actions.
 * Both NPC AI and the player invoke the SAME functions — the UI layer (not yet
 * built) will simply wrap the same call with a confirmation step.
 *
 * Every handler returns  { ok: true }  or  { ok: false, error: { code, message } }.
 *
 * Auth model
 * ----------
 * • The actor (`actorId`) must hold the Chair role for the party.
 * • If the Chair seat is vacant, the Vice Chair may substitute.
 * • For "major" actions (coalition talks, candidate endorsement, resource
 *   allocation, discipline) a national-committee stub check is also performed
 *   when `partyRules.nationalCommitteeApprovalRequired` is true.  This stub
 *   always approves — it records intent and emits an event.  Full quorum logic
 *   is a future enhancement.
 */

import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePartyOrgRuntime } from "./state.js";
import { getPartyRules } from "./rules.js";

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

type OkResult = { ok: true };
type ErrResult = { ok: false; error: { code: string; message: string } };
type CommandOutcome = OkResult | ErrResult;

function ok(): OkResult {
  return { ok: true };
}
function err(code: string, message: string): ErrResult {
  return { ok: false, error: { code, message } };
}

/**
 * Checks that `actorId` holds the Chair (or, if vacant, Vice Chair) for
 * `partyId`.  Returns an error result if not authorised.
 */
function requireChairAuth(state: SimState, partyId: string, actorId: string): ErrResult | null {
  const runtime = ensurePartyOrgRuntime(state);
  const officers = runtime.officers[partyId];
  if (!officers) {
    return err("NOT_PARTY_OFFICER", `No officers seeded for party ${partyId}.`);
  }
  const chair = officers.chair;
  const viceChair = officers.vice_chair;

  // Primary: chair
  if (chair && chair.politicianId === actorId) return null;
  // Fallback: vice chair when chair seat is vacant
  if (!chair && viceChair && viceChair.politicianId === actorId) return null;

  return err(
    "NOT_PARTY_CHAIR",
    `Politician ${actorId} does not hold the Chair (or Vice Chair fallback) for party ${partyId}.`,
  );
}

/**
 * Stub: national-committee approval for major actions.
 * When rules require committee approval, emits a PARTY_COMMITTEE_APPROVAL_STUB
 * history event (always passes — full quorum logic is a future phase).
 */
function stubCommitteeApproval(
  state: SimState,
  partyId: string,
  actorId: string,
  actionKind: string,
  commandId: string,
  events: SimEvent[],
): void {
  const rules = getPartyRules(state, { partyDefinitions: {} } as KernelWorld, partyId);
  if (!rules.nationalCommitteeApprovalRequired) return;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_COMMITTEE_APPROVAL_STUB",
      importance: 0.3,
      visibility: "system",
      actorIds: [actorId],
      entityIds: [partyId],
      payload: { partyId, actionKind, approved: true },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
}

// ---------------------------------------------------------------------------
// Exported command handlers
// ---------------------------------------------------------------------------

/**
 * Set the ordered priority list for a party.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function setPartyPriorities(
  state: SimState,
  _world: KernelWorld,
  args: { actorId: string; partyId: string; priorities: string[]; commandId: string },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  runtime.priorities[args.partyId] = args.priorities.slice(0, 10);

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_PRIORITIES_SET",
      importance: 0.5,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [args.partyId],
      payload: { partyId: args.partyId, priorities: runtime.priorities[args.partyId] ?? [] },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Set an official party stance on an issue.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function setPartyOfficialPosition(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    issueId: string;
    stance: "support" | "oppose" | "neutral";
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  if (!runtime.positions[args.partyId]) runtime.positions[args.partyId] = {};
  runtime.positions[args.partyId]![args.issueId] = args.stance;

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_POSITION_SET",
      importance: 0.4,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [args.partyId],
      payload: { partyId: args.partyId, issueId: args.issueId, stance: args.stance },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Set the active campaign strategy descriptor for a party.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function setCampaignStrategy(
  state: SimState,
  _world: KernelWorld,
  args: { actorId: string; partyId: string; strategy: string; commandId: string },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  runtime.campaignStrategies[args.partyId] = args.strategy;

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CAMPAIGN_STRATEGY_SET",
      importance: 0.4,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [args.partyId],
      payload: { partyId: args.partyId, strategy: args.strategy },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Endorse a candidate on behalf of the party in a general or provincial contest.
 * Major action — subject to committee approval stub when rules require it.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function endorseCandidate(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    contestId: string;
    candidateId: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  stubCommitteeApproval(
    state,
    args.partyId,
    args.actorId,
    "endorse_candidate",
    args.commandId,
    events,
  );

  runtime.partyEndorsements[args.contestId] = {
    partyId: args.partyId,
    candidateId: args.candidateId,
    actorId: args.actorId,
    date: state.currentDate,
  };

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_CANDIDATE_ENDORSED",
      importance: 0.6,
      visibility: "public",
      actorIds: [args.actorId, args.candidateId],
      entityIds: [args.partyId, args.contestId],
      payload: {
        partyId: args.partyId,
        contestId: args.contestId,
        candidateId: args.candidateId,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Allocate party support resources across targets (contests, regions, etc.).
 * Values are 0–1 shares; they are clamped and stored as-is (caller decides meaning).
 * Major action — subject to committee approval stub when rules require it.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function allocatePartySupport(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    allocations: Record<string, number>;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  stubCommitteeApproval(
    state,
    args.partyId,
    args.actorId,
    "allocate_support",
    args.commandId,
    events,
  );

  const clamped: Record<string, number> = {};
  for (const [key, val] of Object.entries(args.allocations)) {
    clamped[key] = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0));
  }
  runtime.supportAllocations[args.partyId] = clamped;

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_SUPPORT_ALLOCATED",
      importance: 0.4,
      visibility: "system",
      actorIds: [args.actorId],
      entityIds: [args.partyId],
      payload: { partyId: args.partyId, allocations: clamped },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Authorise (or update) coalition talks with a partner party, optionally with
 * red-line conditions.
 * Major action — subject to committee approval stub when rules require it.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function authorizeCoalitionTalks(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    partnerPartyId: string;
    /** Defaults to true; pass false to rescind a prior authorisation. */
    authorize?: boolean;
    redLines?: string[];
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  if (args.partyId === args.partnerPartyId) {
    return err("SAME_PARTY", "A party cannot open coalition talks with itself.");
  }

  const authorize = args.authorize ?? true;
  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  stubCommitteeApproval(
    state,
    args.partyId,
    args.actorId,
    "authorize_coalition_talks",
    args.commandId,
    events,
  );

  if (!runtime.coalitionTalks[args.partyId]) runtime.coalitionTalks[args.partyId] = {};
  runtime.coalitionTalks[args.partyId]![args.partnerPartyId] = {
    authorized: authorize,
    redLines: args.redLines ?? [],
  };

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: authorize ? "PARTY_COALITION_TALKS_AUTHORIZED" : "PARTY_COALITION_TALKS_RESCINDED",
      importance: 0.65,
      visibility: "public",
      actorIds: [args.actorId],
      entityIds: [args.partyId, args.partnerPartyId],
      payload: {
        partyId: args.partyId,
        partnerPartyId: args.partnerPartyId,
        authorized: authorize,
        redLines: args.redLines ?? [],
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}

/**
 * Recommend a disciplinary action against a party member.
 * Major action — subject to committee approval stub when rules require it.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function recommendDiscipline(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    targetId: string;
    kind: "warning" | "censure" | "suspend_support";
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  if (args.actorId === args.targetId) {
    return err("SELF_DISCIPLINE", "The chair cannot recommend discipline against themselves.");
  }

  const runtime = ensurePartyOrgRuntime(state);
  const events: SimEvent[] = [];

  stubCommitteeApproval(
    state,
    args.partyId,
    args.actorId,
    `discipline_${args.kind}`,
    args.commandId,
    events,
  );

  const id = `PDISC${String(runtime.nextDisciplineId++).padStart(6, "0")}`;
  runtime.disciplineActions[id] = {
    id,
    partyId: args.partyId,
    targetId: args.targetId,
    kind: args.kind,
    recommendedByActorId: args.actorId,
    date: state.currentDate,
    status: "pending",
  };

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_DISCIPLINE_RECOMMENDED",
      importance: 0.55,
      visibility: "public",
      actorIds: [args.actorId, args.targetId],
      entityIds: [args.partyId],
      payload: {
        id,
        partyId: args.partyId,
        targetId: args.targetId,
        kind: args.kind,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  return ok();
}
