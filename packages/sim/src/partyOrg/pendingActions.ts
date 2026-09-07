/**
 * Unified deferred National Committee actions.
 *
 * Major party-org commands create a PendingPartyAction before/with the committee
 * vote. On pass, executePendingPartyAction applies the payload exactly once.
 * On reject, the action is marked rejected and never applied.
 */
import { pushHistory } from "../scheduler.js";
import type { JsonObject } from "../json.js";
import type { KernelWorld, SimState } from "../types.js";
import {
  ALLOCATION_BUCKETS,
  PLATFORM_POLICY_OPTIONS,
  normalizeSupportAllocations,
} from "./catalog.js";
import { ensurePartyOrgRuntime } from "./state.js";
import type { PendingPartyAction, PartyDisciplineKind } from "./types.js";
import { PARTY_DISCIPLINE_KINDS } from "./types.js";

type OkResult = { ok: true };
type ErrResult = { ok: false; error: { code: string; message: string } };
type Outcome = OkResult | ErrResult;

function ok(): OkResult {
  return { ok: true };
}
function err(code: string, message: string): ErrResult {
  return { ok: false, error: { code, message } };
}

export function createPendingPartyAction(
  state: SimState,
  args: {
    partyId: string;
    actionType: string;
    payload: JsonObject;
    createdBy: string;
    committeeVoteId?: string | null;
  },
): PendingPartyAction {
  const runtime = ensurePartyOrgRuntime(state);
  const id = `PPACT${String(runtime.nextPendingActionId++).padStart(5, "0")}`;
  const action: PendingPartyAction = {
    id,
    partyId: args.partyId,
    actionType: args.actionType,
    payload: args.payload,
    createdBy: args.createdBy,
    committeeVoteId: args.committeeVoteId ?? null,
    status: "awaiting_committee",
    createdDate: state.currentDate,
    executedDate: null,
  };
  runtime.pendingActions[id] = action;
  return action;
}

export function findPendingActionByVoteId(
  state: SimState,
  voteId: string,
): PendingPartyAction | null {
  const runtime = ensurePartyOrgRuntime(state);
  for (const action of Object.values(runtime.pendingActions)) {
    if (action.committeeVoteId === voteId) return action;
  }
  return null;
}

export function markPendingPartyActionRejected(state: SimState, actionId: string): void {
  const runtime = ensurePartyOrgRuntime(state);
  const action = runtime.pendingActions[actionId];
  if (!action) return;
  if (action.status === "executed" || action.status === "cancelled") return;
  action.status = "rejected";
}

/**
 * Apply a deferred pending action exactly once. Safe to call when already executed.
 */
export function executePendingPartyAction(
  state: SimState,
  _world: KernelWorld,
  actionId: string,
  commandId: string,
): Outcome {
  const runtime = ensurePartyOrgRuntime(state);
  const action = runtime.pendingActions[actionId];
  if (!action) {
    return err("PENDING_ACTION_NOT_FOUND", `No pending party action ${actionId}.`);
  }
  if (action.status === "executed") return ok();
  if (action.status === "rejected" || action.status === "cancelled") {
    return err("PENDING_ACTION_NOT_EXECUTABLE", `Pending action ${actionId} is ${action.status}.`);
  }

  action.status = "approved";
  const actorId = action.createdBy;
  const payload = action.payload;

  switch (action.actionType) {
    case "platform_plank": {
      const issueId = typeof payload.issueId === "string" ? payload.issueId : "";
      const optionId = typeof payload.optionId === "string" ? payload.optionId : "";
      const options = PLATFORM_POLICY_OPTIONS[issueId];
      if (!options || !options.some((o) => o.id === optionId)) {
        return err("INVALID_PLANK", `Unknown platform option ${optionId} for issue ${issueId}.`);
      }
      if (!runtime.platformPlanks[action.partyId]) runtime.platformPlanks[action.partyId] = {};
      runtime.platformPlanks[action.partyId]![issueId] = optionId;
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_PLATFORM_PLANK_SET",
        importance: 0.5,
        visibility: "public",
        actorIds: [actorId],
        entityIds: [action.partyId],
        payload: { partyId: action.partyId, issueId, optionId, pendingActionId: action.id },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      break;
    }
    case "allocate_support": {
      const raw =
        payload.allocations &&
        typeof payload.allocations === "object" &&
        !Array.isArray(payload.allocations)
          ? (payload.allocations as Record<string, number>)
          : {};
      const clamped: Record<string, number> = {};
      for (const [key, val] of Object.entries(raw)) {
        clamped[key] = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0));
      }
      const hasKnownBucket = Object.keys(ALLOCATION_BUCKETS).some((k) => k in clamped);
      runtime.supportAllocations[action.partyId] = hasKnownBucket
        ? normalizeSupportAllocations(clamped)
        : clamped;
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_SUPPORT_ALLOCATED",
        importance: 0.4,
        visibility: "system",
        actorIds: [actorId],
        entityIds: [action.partyId],
        payload: {
          partyId: action.partyId,
          allocations: runtime.supportAllocations[action.partyId] ?? {},
          pendingActionId: action.id,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      break;
    }
    case "authorize_coalition": {
      const partnerPartyId =
        typeof payload.partnerPartyId === "string" ? payload.partnerPartyId : "";
      const authorize = payload.authorize !== false;
      const redLines = Array.isArray(payload.redLines)
        ? payload.redLines.filter((x): x is string => typeof x === "string")
        : [];
      if (!partnerPartyId || partnerPartyId === action.partyId) {
        return err("SAME_PARTY", "Invalid coalition partner.");
      }
      if (!runtime.coalitionTalks[action.partyId]) runtime.coalitionTalks[action.partyId] = {};
      runtime.coalitionTalks[action.partyId]![partnerPartyId] = { authorized: authorize, redLines };
      pushHistory(state, {
        date: state.currentDate,
        type: authorize ? "PARTY_COALITION_TALKS_AUTHORIZED" : "PARTY_COALITION_TALKS_RESCINDED",
        importance: 0.65,
        visibility: "public",
        actorIds: [actorId],
        entityIds: [action.partyId, partnerPartyId],
        payload: {
          partyId: action.partyId,
          partnerPartyId,
          authorized: authorize,
          redLines,
          pendingActionId: action.id,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      break;
    }
    case "endorse_candidate": {
      const contestId = typeof payload.contestId === "string" ? payload.contestId : "";
      const candidateId = typeof payload.candidateId === "string" ? payload.candidateId : "";
      if (!contestId || !candidateId) {
        return err("INVALID_ENDORSEMENT", "contestId and candidateId required.");
      }
      runtime.partyEndorsements[contestId] = {
        partyId: action.partyId,
        candidateId,
        actorId,
        date: state.currentDate,
      };
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_CANDIDATE_ENDORSED",
        importance: 0.6,
        visibility: "public",
        actorIds: [actorId, candidateId],
        entityIds: [action.partyId, contestId],
        payload: {
          partyId: action.partyId,
          contestId,
          candidateId,
          pendingActionId: action.id,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      break;
    }
    case "recommend_discipline": {
      const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
      const kindRaw = typeof payload.kind === "string" ? payload.kind : "warning";
      const kind = (PARTY_DISCIPLINE_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as PartyDisciplineKind)
        : "warning";
      if (!targetId || targetId === actorId) {
        return err("SELF_DISCIPLINE", "Invalid discipline target.");
      }
      const id = `PDISC${String(runtime.nextDisciplineId++).padStart(6, "0")}`;
      runtime.disciplineActions[id] = {
        id,
        partyId: action.partyId,
        targetId,
        kind,
        recommendedByActorId: actorId,
        date: state.currentDate,
        status: "pending",
      };
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_DISCIPLINE_RECOMMENDED",
        importance: 0.55,
        visibility: "public",
        actorIds: [actorId, targetId],
        entityIds: [action.partyId],
        payload: {
          id,
          partyId: action.partyId,
          targetId,
          kind,
          pendingActionId: action.id,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      });
      break;
    }
    default:
      return err("UNKNOWN_PENDING_ACTION", `Unsupported actionType ${action.actionType}.`);
  }

  action.status = "executed";
  action.executedDate = state.currentDate;
  return ok();
}
