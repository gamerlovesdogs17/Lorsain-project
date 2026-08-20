import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { JsonObject } from "../json.js";
import { pushHistory } from "../scheduler.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import {
  MAX_DIPLOMATIC_ACTIONS_PER_MONTH,
  TERENA_WORLD_ID,
  type MilitaryPostureLevel,
  type TreatyKind,
  isMilitaryPostureLevel,
  isTreatyKind,
} from "./types.js";
import { allocateDiplomaticActionId, getBilateralRelation } from "./state.js";
import { adjustRelation, outreachRelationDelta } from "./relations.js";
import { imposeSanctions, liftSanctions } from "./sanctions.js";
import { proposeTreaty } from "./treaties.js";
import { deescalateCrisis } from "./crises.js";
import { queueTradeNegotiationEffect } from "./economy-bridge.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function requirePresident(
  world: KernelWorld,
  state: SimState,
  actorId: string,
): CommandError | null {
  const authority = currentPresidentialAuthorityId(world, state);
  if (authority !== actorId) return reject("NOT_PRESIDENT", actorId);
  return null;
}

function bumpDiplomaticCapacity(state: SimState): CommandError | null {
  if (state.foreignAffairsRuntime.diplomaticActionsThisMonth >= MAX_DIPLOMATIC_ACTIONS_PER_MONTH) {
    return reject("DIPLOMATIC_CAPACITY", "Monthly diplomatic action limit reached (2/month)");
  }
  state.foreignAffairsRuntime.diplomaticActionsThisMonth += 1;
  return null;
}

function recordPlayerAction(
  state: SimState,
  args: {
    actorCountryId: string;
    targetCountryId: string | null;
    kind: import("./types.js").DiplomaticActionKind;
    commandId: string | null;
    metadata?: JsonObject;
  },
): string {
  const id = allocateDiplomaticActionId(state);
  state.foreignAffairsRuntime.diplomaticActions[id] = {
    id,
    date: state.currentDate,
    actorCountryId: args.actorCountryId,
    targetCountryId: args.targetCountryId,
    kind: args.kind,
    initiator: "player",
    metadata: args.metadata ?? {},
  };
  return id;
}

function validateTarget(state: SimState, targetId: string): CommandError | null {
  if (targetId === TERENA_WORLD_ID) return reject("INVALID_TARGET", "Cannot target Terena");
  if (!state.foreignAffairsRuntime.countries[targetId]) {
    return reject("UNKNOWN_COUNTRY", targetId);
  }
  return null;
}

function playerOnly(actorId: string, state: SimState): CommandError | null {
  if (actorId !== state.playerPoliticianId) {
    return reject("PLAYER_AUTONOMY", "Player president actions are never auto-committed");
  }
  return null;
}

export function diplomaticOutreach(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, args.targetCountryId);
  if (!rel) return { error: reject("NO_RELATION", args.targetCountryId) };
  const delta = outreachRelationDelta(world.worldCountries[TERENA_WORLD_ID]?.powerTier ?? "major power");
  adjustRelation(rel, { ...delta, general: delta.general + 2 });
  rel.lastUpdated = state.currentDate;
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "outreach",
    commandId,
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "DIPLOMATIC_OUTREACH",
        importance: 0.55,
        visibility: "public",
        actorIds: [args.actorId, TERENA_WORLD_ID],
        entityIds: [args.targetCountryId],
        payload: { targetCountryId: args.targetCountryId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function diplomaticSummit(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, args.targetCountryId);
  if (!rel) return { error: reject("NO_RELATION", args.targetCountryId) };
  adjustRelation(rel, { general: 8, trust: 0.1, securityTension: -0.05 });
  rel.lastUpdated = state.currentDate;
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "summit",
    commandId,
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "DIPLOMATIC_SUMMIT",
        importance: 0.75,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.targetCountryId],
        payload: { targetCountryId: args.targetCountryId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function playerProposeTreaty(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string; kind: TreatyKind; title?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  if (!isTreatyKind(args.kind)) return { error: reject("INVALID_TREATY", args.kind) };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const title =
    args.title ??
    `Terena–${world.worldCountries[args.targetCountryId]?.name ?? args.targetCountryId} ${args.kind.replace(/_/g, " ")}`;
  const out = proposeTreaty(
    state,
    {
      proposerId: TERENA_WORLD_ID,
      kind: args.kind,
      title,
      memberIds: [TERENA_WORLD_ID, args.targetCountryId],
      requiresRatification: args.kind !== "trade",
    },
    commandId,
  );
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "treaty_proposal",
    commandId,
    metadata: { treatyId: out.treaty.id },
  });
  return { events: out.events };
}

export function negotiateTrade(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, args.targetCountryId);
  if (!rel) return { error: reject("NO_RELATION", args.targetCountryId) };
  adjustRelation(rel, { general: 5, economicTies: 0.1 });
  rel.lastUpdated = state.currentDate;
  queueTradeNegotiationEffect(state, args.targetCountryId);
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "trade_negotiation",
    commandId,
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "TRADE_NEGOTIATION",
        importance: 0.6,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.targetCountryId],
        payload: { targetCountryId: args.targetCountryId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function playerImposeSanctions(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string; severity?: number },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const out = imposeSanctions(
    state,
    {
      imposerId: TERENA_WORLD_ID,
      targetId: args.targetCountryId,
      severity: args.severity ?? 0.45,
    },
    commandId,
  );
  if ("error" in out) return { error: reject(out.error.code, out.error.message) };
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "sanctions",
    commandId,
  });
  return { events: out.events };
}

export function playerLiftSanctions(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const out = liftSanctions(
    state,
    { imposerId: TERENA_WORLD_ID, targetId: args.targetCountryId },
    commandId,
  );
  if ("error" in out) return { error: reject(out.error.code, out.error.message) };
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "lift_sanctions",
    commandId,
  });
  return { events: out.events };
}

export function allianceConsultation(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; institutionId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const institutionId = args.institutionId ?? "INT_DC";
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: null,
    kind: "alliance_consultation",
    commandId,
    metadata: { institutionId },
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ALLIANCE_CONSULTATION",
        importance: 0.65,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [institutionId],
        payload: { institutionId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function adjustMilitaryPosture(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; posture: MilitaryPostureLevel },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  if (!isMilitaryPostureLevel(args.posture)) {
    return { error: reject("INVALID_POSTURE", args.posture) };
  }
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const runtime = state.foreignAffairsRuntime.countries[TERENA_WORLD_ID];
  if (!runtime) return { error: reject("TERENA_MISSING", TERENA_WORLD_ID) };
  runtime.posture = args.posture;
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: null,
    kind: "posture_change",
    commandId,
    metadata: { posture: args.posture },
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "TERENA_POSTURE_CHANGED",
        importance: 0.7,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [TERENA_WORLD_ID],
        payload: { posture: args.posture },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function mediateCrisis(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; crisisId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const crisis = state.foreignAffairsRuntime.crises[args.crisisId];
  if (!crisis || crisis.stage === "settled") {
    return { error: reject("UNKNOWN_CRISIS", args.crisisId) };
  }
  deescalateCrisis(crisis, state.currentDate);
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: null,
    kind: "mediation",
    commandId,
    metadata: { crisisId: args.crisisId },
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "CRISIS_MEDIATION",
        importance: 0.8,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.crisisId],
        payload: { crisisId: args.crisisId, stage: crisis.stage },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function issueDiplomaticWarning(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetCountryId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const autonomy = playerOnly(args.actorId, state);
  if (autonomy) return { error: autonomy };
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const cap = bumpDiplomaticCapacity(state);
  if (cap) return { error: cap };
  const targetErr = validateTarget(state, args.targetCountryId);
  if (targetErr) return { error: targetErr };
  const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, args.targetCountryId);
  if (!rel) return { error: reject("NO_RELATION", args.targetCountryId) };
  adjustRelation(rel, { general: -4, securityTension: 0.08, trust: -0.05 });
  rel.lastUpdated = state.currentDate;
  recordPlayerAction(state, {
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: "warning",
    commandId,
  });
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "DIPLOMATIC_WARNING",
        importance: 0.68,
        visibility: "public",
        actorIds: [args.actorId],
        entityIds: [args.targetCountryId],
        payload: { targetCountryId: args.targetCountryId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function castTreatyRatificationVote(
  state: SimState,
  args: { actorId: string; treatyId: string; choice: "yes" | "no" | "abstain" },
): { error: CommandError } | { ok: true } {
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", args.actorId) };
  }
  const treaty = state.foreignAffairsRuntime.treaties[args.treatyId];
  if (!treaty || treaty.ratificationStatus !== "pending") {
    return { error: reject("NO_PENDING_TREATY", args.treatyId) };
  }
  state.foreignAffairsRuntime.pendingPlayerTreatyVotes[args.treatyId] = {
    treatyId: args.treatyId,
    choice: args.choice,
  };
  return { ok: true };
}
