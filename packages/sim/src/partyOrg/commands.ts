/**
 * partyOrg/commands.ts
 *
 * Shared command handlers for party-organisation actions.
 * Both NPC AI and the player invoke the SAME functions — the UI layer
 * wraps the same call with a confirmation step.
 *
 * Every handler returns  { ok: true }  or  { ok: false, error: { code, message } }.
 *
 * Auth model
 * ----------
 * • The actor (`actorId`) must hold the Chair role for the party.
 * • If the Chair seat is vacant, the Vice Chair may substitute.
 * • For "major" actions (coalition talks, candidate endorsement, resource
 *   allocation, discipline) a national-committee vote is required when
 *   `partyRules.nationalCommitteeApprovalRequired` is true.
 */

import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import {
  ALLOCATION_BUCKETS,
  ISSUE_EMPHASIS_LEVELS,
  PLATFORM_POLICY_OPTIONS,
  normalizePartyPriorities,
  normalizeSupportAllocations,
  type IssueEmphasisLevel,
} from "./catalog.js";
import { requireCommitteeApproval } from "./committee.js";
import { ensurePartyOrgRuntime } from "./state.js";

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

  if (chair && chair.politicianId === actorId) return null;
  if (!chair && viceChair && viceChair.politicianId === actorId) return null;

  return err(
    "NOT_PARTY_CHAIR",
    `Politician ${actorId} does not hold the Chair (or Vice Chair fallback) for party ${partyId}.`,
  );
}

function requireTreasurerOrChairAuth(
  state: SimState,
  partyId: string,
  actorId: string,
): ErrResult | null {
  const chairErr = requireChairAuth(state, partyId, actorId);
  if (!chairErr) return null;
  const runtime = ensurePartyOrgRuntime(state);
  const treasurer = runtime.officers[partyId]?.treasurer;
  if (treasurer && treasurer.politicianId === actorId) return null;
  return err(
    "NOT_PARTY_TREASURER",
    `Politician ${actorId} is not Chair/Vice Chair/Treasurer for party ${partyId}.`,
  );
}

// ---------------------------------------------------------------------------
// Exported command handlers
// ---------------------------------------------------------------------------

/**
 * Set the ordered priority list for a party (max 5 catalog ids).
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

  runtime.priorities[args.partyId] = normalizePartyPriorities(args.priorities);

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
 * Set messaging emphasis for a platform issue.
 * Requires: actor is Chair (or Vice Chair substituting).
 */
export function setIssueEmphasis(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    issueId: string;
    level: IssueEmphasisLevel;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  if (!(ISSUE_EMPHASIS_LEVELS as readonly string[]).includes(args.level)) {
    return err("INVALID_EMPHASIS", `Emphasis level must be high|medium|low.`);
  }

  const runtime = ensurePartyOrgRuntime(state);
  if (!runtime.issueEmphasis[args.partyId]) runtime.issueEmphasis[args.partyId] = {};
  runtime.issueEmphasis[args.partyId]![args.issueId] = args.level;

  pushHistory(state, {
    date: state.currentDate,
    type: "PARTY_ISSUE_EMPHASIS_SET",
    importance: 0.35,
    visibility: "system",
    actorIds: [args.actorId],
    entityIds: [args.partyId],
    payload: { partyId: args.partyId, issueId: args.issueId, level: args.level },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

/**
 * Propose / set a platform plank option for an issue.
 * Major action — subject to committee approval when rules require it.
 */
export function proposePlatformPlank(
  state: SimState,
  world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    issueId: string;
    optionId: string;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const options = PLATFORM_POLICY_OPTIONS[args.issueId];
  if (!options || !options.some((o) => o.id === args.optionId)) {
    return err(
      "INVALID_PLANK",
      `Unknown platform option ${args.optionId} for issue ${args.issueId}.`,
    );
  }

  const committee = requireCommitteeApproval(state, world, {
    partyId: args.partyId,
    proposalKind: "platform_plank",
    proposalPayload: { issueId: args.issueId, optionId: args.optionId },
    commandId: args.commandId,
    deferredCommand: {
      type: "PROPOSE_PLATFORM_PLANK",
      partyId: args.partyId,
      issueId: args.issueId,
      optionId: args.optionId,
    },
  });
  if (!committee.ok) return committee;

  const runtime = ensurePartyOrgRuntime(state);
  if (!runtime.platformPlanks[args.partyId]) runtime.platformPlanks[args.partyId] = {};
  runtime.platformPlanks[args.partyId]![args.issueId] = args.optionId;

  pushHistory(state, {
    date: state.currentDate,
    type: "PARTY_PLATFORM_PLANK_SET",
    importance: 0.5,
    visibility: "public",
    actorIds: [args.actorId],
    entityIds: [args.partyId],
    payload: { partyId: args.partyId, issueId: args.issueId, optionId: args.optionId },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

/**
 * Set an official party stance on a live question (bill, amendment, floor motion).
 *
 * Prefer issueIds that look like bill/amendment ids when possible. Platform issue
 * keys (labor, housing, …) remain accepted for compatibility with older callers;
 * durable platform planks should use proposePlatformPlank instead.
 *
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
 * Major action — subject to committee approval when rules require it.
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

  const committee = requireCommitteeApproval(state, world, {
    partyId: args.partyId,
    proposalKind: "endorse_candidate",
    proposalPayload: { contestId: args.contestId, candidateId: args.candidateId },
    commandId: args.commandId,
  });
  if (!committee.ok) return committee;

  const runtime = ensurePartyOrgRuntime(state);

  runtime.partyEndorsements[args.contestId] = {
    partyId: args.partyId,
    candidateId: args.candidateId,
    actorId: args.actorId,
    date: state.currentDate,
  };

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
  });

  return ok();
}

/**
 * Allocate party support resources across targets (contests, regions, etc.).
 * Known ALLOCATION_BUCKETS keys are renormalized to sum ~1.
 * Major action — subject to committee approval when rules require it.
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

  const committee = requireCommitteeApproval(state, world, {
    partyId: args.partyId,
    proposalKind: "allocate_support",
    proposalPayload: { allocations: args.allocations },
    commandId: args.commandId,
  });
  if (!committee.ok) return committee;

  const runtime = ensurePartyOrgRuntime(state);

  const clamped: Record<string, number> = {};
  for (const [key, val] of Object.entries(args.allocations)) {
    clamped[key] = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0));
  }
  const hasKnownBucket = Object.keys(ALLOCATION_BUCKETS).some((k) => k in clamped);
  runtime.supportAllocations[args.partyId] = hasKnownBucket
    ? normalizeSupportAllocations(clamped)
    : clamped;

  pushHistory(state, {
    date: state.currentDate,
    type: "PARTY_SUPPORT_ALLOCATED",
    importance: 0.4,
    visibility: "system",
    actorIds: [args.actorId],
    entityIds: [args.partyId],
    payload: {
      partyId: args.partyId,
      allocations: runtime.supportAllocations[args.partyId] ?? {},
    },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

/**
 * Treasurer helper: recommend a balanced budget across allocation buckets.
 * Does not commit allocations — writes a recommendation into metadata and history.
 * Requires: Chair/Vice Chair or Treasurer.
 */
export function recommendPartyBudget(
  state: SimState,
  _world: KernelWorld,
  args: {
    actorId: string;
    partyId: string;
    allocations?: Record<string, number>;
    commandId: string;
  },
): CommandOutcome {
  const authErr = requireTreasurerOrChairAuth(state, args.partyId, args.actorId);
  if (authErr) return authErr;

  const runtime = ensurePartyOrgRuntime(state);
  const recommended = normalizeSupportAllocations(
    args.allocations ?? {
      presidential: 0.25,
      assembly: 0.3,
      gubernatorial: 0.15,
      field_organization: 0.2,
      party_infrastructure: 0.1,
    },
  );

  runtime.metadata[`budget_recommend_${args.partyId}`] = recommended;

  pushHistory(state, {
    date: state.currentDate,
    type: "PARTY_BUDGET_RECOMMENDED",
    importance: 0.35,
    visibility: "system",
    actorIds: [args.actorId],
    entityIds: [args.partyId],
    payload: { partyId: args.partyId, allocations: recommended },
    sourceScheduledEventId: null,
    sourceCommandId: args.commandId,
  });

  return ok();
}

/**
 * Authorise (or update) coalition talks with a partner party, optionally with
 * red-line conditions.
 * Major action — subject to committee approval when rules require it.
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

  const committee = requireCommitteeApproval(state, world, {
    partyId: args.partyId,
    proposalKind: "authorize_coalition_talks",
    proposalPayload: {
      partnerPartyId: args.partnerPartyId,
      authorize,
      redLines: args.redLines ?? [],
    },
    commandId: args.commandId,
  });
  if (!committee.ok) return committee;

  const runtime = ensurePartyOrgRuntime(state);

  if (!runtime.coalitionTalks[args.partyId]) runtime.coalitionTalks[args.partyId] = {};
  runtime.coalitionTalks[args.partyId]![args.partnerPartyId] = {
    authorized: authorize,
    redLines: args.redLines ?? [],
  };

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
  });

  return ok();
}

/**
 * Recommend a disciplinary action against a party member.
 * Major action — subject to committee approval when rules require it.
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

  const committee = requireCommitteeApproval(state, world, {
    partyId: args.partyId,
    proposalKind: `discipline_${args.kind}`,
    proposalPayload: { targetId: args.targetId, kind: args.kind },
    commandId: args.commandId,
  });
  if (!committee.ok) return committee;

  const runtime = ensurePartyOrgRuntime(state);

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
  });

  return ok();
}
