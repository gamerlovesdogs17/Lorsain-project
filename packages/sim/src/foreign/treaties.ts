import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import type { RngService } from "../rng.js";
import {
  allocateTreatyId,
  allocateIncomingDiplomacyId,
  getBilateralRelation,
} from "./state.js";
import { canProposeTreaty, recordTreatyRejectionCooldown } from "./treaty-identity.js";
import {
  advanceTreatyAfterCounterpartyAcceptance,
  processTreatyRatificationVotes,
} from "./treaty-ratification.js";
import {
  TERENA_WORLD_ID,
  type PendingIncomingDiplomacy,
  type TreatyKind,
  type TreatyRecord,
} from "./types.js";
import { isTreatyKind } from "./types.js";
import { publicActiveCrises } from "./crises.js";

export function evaluateCounterpartyAcceptance(
  world: KernelWorld,
  state: SimState,
  treaty: TreatyRecord,
  counterpartyId: string,
  rng: RngService,
): "accepted" | "rejected" {
  const rel = getBilateralRelation(state.foreignAffairsRuntime, treaty.proposerId, counterpartyId);
  const base = rel ? (rel.general + 100) / 200 : 0.5;
  let score = base * 0.5 + (rel?.trust ?? 0.5) * 0.3;

  const counterparty = state.foreignAffairsRuntime.countries[counterpartyId];
  if (counterparty) {
    if (treaty.kind === "trade" && counterparty.strategicGoals.includes("expand_trade")) score += 0.15;
    if (treaty.kind === "mutual_defense" && counterparty.strategicGoals.includes("secure_alliance")) {
      score += 0.12;
    }
    if (treaty.kind === "non_aggression" && counterparty.strategicGoals.includes("regime_stability")) {
      score += 0.08;
    }
    if (counterparty.strategicGoals.includes("neutral_autonomy")) score -= 0.1;
  }

  if (rel && rel.securityTension > 0.5) score -= rel.securityTension * 0.2;

  const crises = publicActiveCrises(state.foreignAffairsRuntime).filter(
    (c) => c.participantIds.includes(treaty.proposerId) && c.participantIds.includes(counterpartyId),
  );
  score -= crises.length * 0.12;

  const roll = rng.float01("foreign-affairs");
  return roll < Math.max(0.08, Math.min(0.92, score)) ? "accepted" : "rejected";
}

function initCounterpartyResponses(
  treaty: TreatyRecord,
  proposerId: string,
): Record<string, "pending" | "accepted" | "rejected"> {
  const responses: Record<string, "pending" | "accepted" | "rejected"> = {};
  for (const memberId of treaty.memberIds) {
    if (memberId !== proposerId) responses[memberId] = "pending";
  }
  return responses;
}

function queueIncomingTreatyForTerenaPresident(
  state: SimState,
  world: KernelWorld,
  treaty: TreatyRecord,
  actorCountryId: string,
): void {
  const president = currentPresidentialAuthorityId(world, state);
  if (president !== state.playerPoliticianId) return;
  const pending: PendingIncomingDiplomacy = {
    id: allocateIncomingDiplomacyId(state),
    kind: "treaty_proposal",
    actorCountryId,
    targetCountryId: TERENA_WORLD_ID,
    treatyId: treaty.id,
    treatyKind: treaty.kind,
    title: treaty.title,
    date: state.currentDate,
    metadata: {},
  };
  state.foreignAffairsRuntime.pendingIncomingDiplomacy.push(pending);
}

export function proposeTreaty(
  state: SimState,
  args: {
    proposerId: string;
    kind: TreatyKind;
    title: string;
    memberIds: string[];
    requiresRatification: boolean;
    skipCounterparty?: boolean;
    skipDuplicateCheck?: boolean;
  },
  commandId: string | null,
): { treaty: TreatyRecord; events: SimEvent[] } | { error: { code: string; message: string } } {
  if (!args.skipDuplicateCheck) {
    const gate = canProposeTreaty(state.foreignAffairsRuntime, args.kind, args.memberIds, state.currentDate);
    if (!gate.ok) return { error: { code: "DUPLICATE_TREATY", message: gate.reason } };
  }
  const id = allocateTreatyId(state);
  const treaty: TreatyRecord = {
    id,
    kind: args.kind,
    title: args.title,
    proposerId: args.proposerId,
    memberIds: [...new Set(args.memberIds)].sort(),
    signedDate: null,
    status: args.skipCounterparty ? "proposed" : "counterparty_pending",
    ratificationStatus: "not_required",
    ratificationVoteId: null,
    counterpartyResponses: initCounterpartyResponses(
      { memberIds: [...new Set(args.memberIds)].sort() } as TreatyRecord,
      args.proposerId,
    ),
    metadata: {},
  };
  state.foreignAffairsRuntime.treaties[id] = treaty;

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: "TREATY_PROPOSED",
      importance: 0.65,
      visibility: "public",
      actorIds: [args.proposerId],
      entityIds: [id],
      payload: { treatyId: id, kind: args.kind, title: args.title, status: treaty.status },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];

  if (args.skipCounterparty && !args.requiresRatification) {
    treaty.status = "active";
    treaty.signedDate = state.currentDate;
  }

  return { treaty, events };
}

export function processCounterpartyTreatyResponses(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const treaty of Object.values(state.foreignAffairsRuntime.treaties).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (treaty.status !== "counterparty_pending") continue;

    let allResolved = true;
    for (const memberId of treaty.memberIds) {
      if (memberId === treaty.proposerId) continue;
      const response = treaty.counterpartyResponses[memberId];
      if (response && response !== "pending") continue;

      if (memberId === TERENA_WORLD_ID) {
        const president = currentPresidentialAuthorityId(world, state);
        if (president === state.playerPoliticianId) {
          queueIncomingTreatyForTerenaPresident(state, world, treaty, treaty.proposerId);
          allResolved = false;
          continue;
        }
      }

      const decision = evaluateCounterpartyAcceptance(world, state, treaty, memberId, rng);
      treaty.counterpartyResponses[memberId] = decision;
      if (decision === "rejected") {
        treaty.status = "rejected";
        recordTreatyRejectionCooldown(state.foreignAffairsRuntime, treaty, state.currentDate);
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "TREATY_REJECTED",
            importance: 0.68,
            visibility: "public",
            actorIds: [memberId],
            entityIds: [treaty.id],
            payload: { treatyId: treaty.id, rejectedBy: memberId },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
        allResolved = false;
        break;
      }
    }

    if (treaty.status !== "counterparty_pending") continue;
    const pendingResponses = Object.entries(treaty.counterpartyResponses).filter(
      ([id, r]) => id !== treaty.proposerId && r === "pending",
    );
    if (pendingResponses.length === 0 && allResolved) {
      events.push(...advanceTreatyAfterCounterpartyAcceptance(state, treaty, commandId));
    }
  }
  return events;
}

export function acceptIncomingTreaty(
  state: SimState,
  pendingId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: { code: string; message: string } } {
  const idx = state.foreignAffairsRuntime.pendingIncomingDiplomacy.findIndex((p) => p.id === pendingId);
  if (idx < 0) return { error: { code: "NOT_FOUND", message: pendingId } };
  const pending = state.foreignAffairsRuntime.pendingIncomingDiplomacy[idx]!;
  if (pending.kind !== "treaty_proposal" || !pending.treatyId) {
    return { error: { code: "INVALID_KIND", message: pending.kind } };
  }
  const treaty = state.foreignAffairsRuntime.treaties[pending.treatyId];
  if (!treaty || treaty.status !== "counterparty_pending") {
    return { error: { code: "INVALID_TREATY", message: pending.treatyId } };
  }
  treaty.counterpartyResponses[TERENA_WORLD_ID] = "accepted";
  state.foreignAffairsRuntime.pendingIncomingDiplomacy.splice(idx, 1);
  const events = advanceTreatyAfterCounterpartyAcceptance(state, treaty, commandId);
  return { events };
}

export function rejectIncomingTreaty(
  state: SimState,
  pendingId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: { code: string; message: string } } {
  const idx = state.foreignAffairsRuntime.pendingIncomingDiplomacy.findIndex((p) => p.id === pendingId);
  if (idx < 0) return { error: { code: "NOT_FOUND", message: pendingId } };
  const pending = state.foreignAffairsRuntime.pendingIncomingDiplomacy[idx]!;
  if (pending.kind !== "treaty_proposal" || !pending.treatyId) {
    return { error: { code: "INVALID_KIND", message: pending.kind } };
  }
  const treaty = state.foreignAffairsRuntime.treaties[pending.treatyId];
  if (!treaty) return { error: { code: "INVALID_TREATY", message: pending.treatyId } };
  treaty.status = "rejected";
  treaty.counterpartyResponses[TERENA_WORLD_ID] = "rejected";
  recordTreatyRejectionCooldown(state.foreignAffairsRuntime, treaty, state.currentDate);
  state.foreignAffairsRuntime.pendingIncomingDiplomacy.splice(idx, 1);
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "TREATY_REJECTED",
        importance: 0.68,
        visibility: "public",
        actorIds: [TERENA_WORLD_ID],
        entityIds: [treaty.id],
        payload: { treatyId: treaty.id, rejectedBy: TERENA_WORLD_ID },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function activateTreaty(state: SimState, treatyId: string, date: IsoDate): void {
  const treaty = state.foreignAffairsRuntime.treaties[treatyId];
  if (!treaty) return;
  treaty.status = "active";
  treaty.signedDate = date;
  treaty.ratificationStatus = "ratified";
}

export { processTreatyRatificationVotes, advanceTreatyAfterCounterpartyAcceptance };

export function parseTreatyKindInput(kind: string): TreatyKind | null {
  return isTreatyKind(kind) ? kind : null;
}
