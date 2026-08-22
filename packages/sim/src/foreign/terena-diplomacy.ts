import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { currentPresidentialAuthorityId } from "../executive/state.js";
import { pushHistory } from "../scheduler.js";
import { TERENA_WORLD_ID } from "./types.js";
import { getBilateralRelation, allocateDiplomaticActionId } from "./state.js";
import { adjustRelation, outreachRelationDelta } from "./relations.js";
import { imposeSanctions } from "./sanctions.js";
import { proposeTreaty } from "./treaties.js";
import { MAX_DIPLOMATIC_ACTIONS_PER_MONTH } from "./types.js";

function terenaNpcPresidentId(world: KernelWorld, state: SimState): string | null {
  const authority = currentPresidentialAuthorityId(world, state);
  if (!authority || authority === state.playerPoliticianId) return null;
  return authority;
}

function recordNpcAction(
  state: SimState,
  args: {
    targetCountryId: string | null;
    kind: import("./types.js").DiplomaticActionKind;
    commandId: string;
  },
): void {
  const id = allocateDiplomaticActionId(state);
  state.foreignAffairsRuntime.diplomaticActions[id] = {
    id,
    date: state.currentDate,
    actorCountryId: TERENA_WORLD_ID,
    targetCountryId: args.targetCountryId,
    kind: args.kind,
    initiator: "ai",
    metadata: { npcPresident: true },
  };
}

export function processNpcTerenaDiplomacy(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const npcPresident = terenaNpcPresidentId(world, state);
  if (!npcPresident) return [];

  if (state.foreignAffairsRuntime.diplomaticActionsThisMonth >= MAX_DIPLOMATIC_ACTIONS_PER_MONTH) {
    return [];
  }

  const events: SimEvent[] = [];
  const candidates = Object.keys(world.worldCountries)
    .filter((id) => id !== TERENA_WORLD_ID)
    .sort()
    .filter((id) => {
      const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, id);
      return rel && Math.abs(rel.general) > 10;
    });

  if (candidates.length === 0) return [];

  const idx = Math.floor(rng.float01("foreign-affairs") * candidates.length);
  const targetId = candidates[idx]!;
  const rel = getBilateralRelation(state.foreignAffairsRuntime, TERENA_WORLD_ID, targetId)!;
  const roll = rng.float01("foreign-affairs");

  state.foreignAffairsRuntime.diplomaticActionsThisMonth += 1;

  if (roll < 0.4 && rel.general > 0) {
    const delta = outreachRelationDelta(world.worldCountries[TERENA_WORLD_ID]?.powerTier ?? "major power");
    adjustRelation(rel, { ...delta, general: delta.general + 2 });
    rel.lastUpdated = state.currentDate;
    recordNpcAction(state, { targetCountryId: targetId, kind: "outreach", commandId });
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "DIPLOMATIC_OUTREACH",
        importance: 0.5,
        visibility: "public",
        actorIds: [npcPresident, TERENA_WORLD_ID],
        entityIds: [targetId],
        payload: { targetCountryId: targetId, npcPresident: true },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  } else if (roll < 0.55 && rel.general < -15) {
    const out = imposeSanctions(
      state,
      { imposerId: TERENA_WORLD_ID, targetId, severity: 0.35, scope: "targeted" },
      commandId,
    );
    if ("events" in out) {
      recordNpcAction(state, { targetCountryId: targetId, kind: "sanctions", commandId });
      events.push(...out.events);
    }
  } else if (roll < 0.7 && rel.general > 25) {
    const out = proposeTreaty(
      state,
      {
        proposerId: TERENA_WORLD_ID,
        kind: "trade",
        title: `Terena–${world.worldCountries[targetId]?.name ?? targetId} Trade Accord`,
        memberIds: [TERENA_WORLD_ID, targetId],
        requiresRatification: false,
      },
      commandId,
    );
    if (!("error" in out)) {
      recordNpcAction(state, { targetCountryId: targetId, kind: "treaty_proposal", commandId });
      events.push(...out.events);
    }
  } else if (rel.securityTension > 0.45) {
    adjustRelation(rel, { general: -3, securityTension: 0.05 });
    rel.lastUpdated = state.currentDate;
    recordNpcAction(state, { targetCountryId: targetId, kind: "warning", commandId });
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "DIPLOMATIC_WARNING",
        importance: 0.55,
        visibility: "public",
        actorIds: [npcPresident],
        entityIds: [targetId],
        payload: { targetCountryId: targetId, npcPresident: true },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
