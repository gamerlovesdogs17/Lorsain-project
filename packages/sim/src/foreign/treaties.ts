import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import { allocateTreatyId, allocateTreatyRatificationId } from "./state.js";
import { padId } from "../scheduler.js";
import type { TreatyKind, TreatyRecord } from "./types.js";
import { isTreatyKind } from "./types.js";

function simpleMajorityNeeded(total: number): number {
  return Math.floor(total / 2) + 1;
}

export function proposeTreaty(
  state: SimState,
  args: {
    proposerId: string;
    kind: TreatyKind;
    title: string;
    memberIds: string[];
    requiresRatification: boolean;
  },
  commandId: string | null,
): { treaty: TreatyRecord; events: SimEvent[] } {
  const id = allocateTreatyId(state);
  const treaty: TreatyRecord = {
    id,
    kind: args.kind,
    title: args.title,
    proposerId: args.proposerId,
    memberIds: [...new Set(args.memberIds)].sort(),
    signedDate: null,
    status: "proposed",
    ratificationStatus: args.requiresRatification ? "pending" : "not_required",
    ratificationVoteId: null,
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
      payload: { treatyId: id, kind: args.kind, title: args.title },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
  if (args.requiresRatification) {
    const voteId = padId("LV", state.counters.nextLegislativeVoteId++);
    const ratId = allocateTreatyRatificationId(state);
    treaty.ratificationVoteId = voteId;
    state.foreignAffairsRuntime.treatyRatifications[ratId] = {
      treatyId: id,
      voteId,
      introducedDate: state.currentDate,
      status: "pending",
    };
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "TREATY_RATIFICATION_PENDING",
        importance: 0.7,
        visibility: "public",
        actorIds: [args.proposerId],
        entityIds: [id, voteId],
        payload: { treatyId: id, voteId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  } else {
    treaty.status = "active";
    treaty.signedDate = state.currentDate;
    treaty.ratificationStatus = "not_required";
  }
  return { treaty, events };
}

export function activateTreaty(state: SimState, treatyId: string, date: IsoDate): void {
  const treaty = state.foreignAffairsRuntime.treaties[treatyId];
  if (!treaty) return;
  treaty.status = "active";
  treaty.signedDate = date;
  treaty.ratificationStatus = "ratified";
}

export function processTreatyRatificationVotes(
  world: KernelWorld,
  state: SimState,
  rng: import("../rng.js").RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  for (const rat of Object.values(state.foreignAffairsRuntime.treatyRatifications)) {
    if (rat.status !== "pending") continue;
    const treaty = state.foreignAffairsRuntime.treaties[rat.treatyId];
    if (!treaty) continue;
    let yes = 0;
    let no = 0;
    for (const mp of mps) {
      if (mp === state.playerPoliticianId) {
        const pending = state.foreignAffairsRuntime.pendingPlayerTreatyVotes[rat.treatyId];
        if (!pending?.choice) continue;
        if (pending.choice === "yes") yes += 1;
        else if (pending.choice === "no") no += 1;
        continue;
      }
      const roll = rng.float01("foreign-affairs");
      const vote: LegislativeVoteChoice = roll < 0.58 ? "yes" : roll < 0.88 ? "no" : "abstain";
      if (vote === "yes") yes += 1;
      else if (vote === "no") no += 1;
    }
    const needed = simpleMajorityNeeded(mps.length);
    if (yes >= needed) {
      rat.status = "passed";
      activateTreaty(state, treaty.id, state.currentDate);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "TREATY_RATIFIED",
          importance: 0.75,
          visibility: "public",
          actorIds: [],
          entityIds: [treaty.id],
          payload: { treatyId: treaty.id, yes, no },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else if (no > mps.length - needed) {
      rat.status = "failed";
      treaty.status = "terminated";
      treaty.ratificationStatus = "rejected";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "TREATY_REJECTED",
          importance: 0.7,
          visibility: "public",
          actorIds: [],
          entityIds: [treaty.id],
          payload: { treatyId: treaty.id, yes, no },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

export function parseTreatyKindInput(kind: string): TreatyKind | null {
  return isTreatyKind(kind) ? kind : null;
}
