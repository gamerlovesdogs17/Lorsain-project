import type { SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { allocateSanctionId } from "./state.js";
import { adjustRelation, sanctionsRelationDelta } from "./relations.js";
import { getBilateralRelation } from "./state.js";
import type { SanctionRecord } from "./types.js";
import { queueSanctionTradeEffect } from "./economy-bridge.js";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function imposeSanctions(
  state: SimState,
  args: { imposerId: string; targetId: string; severity: number; scope?: import("./types.js").SanctionScope },
  commandId: string | null,
): { sanction: SanctionRecord; events: SimEvent[] } | { error: { code: string; message: string } } {
  const severity = clamp01(args.severity);
  if (severity <= 0) {
    return { error: { code: "INVALID_SEVERITY", message: "Sanction severity must be positive" } };
  }
  const target = state.foreignAffairsRuntime.countries[args.targetId];
  const imposer = state.foreignAffairsRuntime.countries[args.imposerId];
  if (!target || !imposer) {
    return { error: { code: "UNKNOWN_COUNTRY", message: "Invalid imposer or target country" } };
  }
  const existing = Object.values(state.foreignAffairsRuntime.sanctions).find(
    (s) => s.active && s.imposerId === args.imposerId && s.targetId === args.targetId,
  );
  if (existing) {
    return { error: { code: "SANCTION_EXISTS", message: "Active sanctions already in place" } };
  }
  const id = allocateSanctionId(state);
  const economicWeight = clamp01(severity * (imposer.tradeExposure + 0.15));
  const scope = args.scope ?? "targeted";
  const sanction: SanctionRecord = {
    id,
    imposerId: args.imposerId,
    targetId: args.targetId,
    imposedDate: state.currentDate,
    liftedDate: null,
    severity,
    economicWeight,
    scope,
    active: true,
    metadata: {},
  };
  state.foreignAffairsRuntime.sanctions[id] = sanction;
  target.activeSanctionIds.push(id);
  const rel = getBilateralRelation(state.foreignAffairsRuntime, args.imposerId, args.targetId);
  if (rel) {
    adjustRelation(rel, sanctionsRelationDelta(severity));
    rel.lastUpdated = state.currentDate;
  }
  queueSanctionTradeEffect(state, sanction);
  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "SANCTIONS_IMPOSED",
      importance: 0.72,
      visibility: "public",
      actorIds: [args.imposerId],
      entityIds: [args.targetId, id],
      payload: { imposerId: args.imposerId, targetId: args.targetId, severity, scope, sanctionId: id },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
  return { sanction, events };
}

export function liftSanctions(
  state: SimState,
  args: { imposerId: string; targetId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: { code: string; message: string } } {
  const sanction = Object.values(state.foreignAffairsRuntime.sanctions).find(
    (s) => s.active && s.imposerId === args.imposerId && s.targetId === args.targetId,
  );
  if (!sanction) {
    return { error: { code: "NO_SANCTION", message: "No active sanctions to lift" } };
  }
  sanction.active = false;
  sanction.liftedDate = state.currentDate;
  const target = state.foreignAffairsRuntime.countries[args.targetId];
  if (target) {
    target.activeSanctionIds = target.activeSanctionIds.filter((sid) => sid !== sanction.id);
  }
  const rel = getBilateralRelation(state.foreignAffairsRuntime, args.imposerId, args.targetId);
  if (rel) {
    adjustRelation(rel, { general: 4, trust: 0.05, economicTies: 0.06 });
    rel.lastUpdated = state.currentDate;
  }
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "SANCTIONS_LIFTED",
        importance: 0.6,
        visibility: "public",
        actorIds: [args.imposerId],
        entityIds: [args.targetId, sanction.id],
        payload: { imposerId: args.imposerId, targetId: args.targetId, sanctionId: sanction.id },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function aggregateSanctionPressure(
  runtime: SimState["foreignAffairsRuntime"],
  targetId: string,
): number {
  let pressure = 0;
  for (const sid of runtime.countries[targetId]?.activeSanctionIds ?? []) {
    const s = runtime.sanctions[sid];
    if (s?.active) pressure += s.severity * s.economicWeight;
  }
  return clamp01(pressure);
}
