import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { TERENA_WORLD_ID } from "./types.js";
import { getBilateralRelation } from "./state.js";
import { deterrenceModifier } from "./treaty-effects.js";

export function processInstitutionsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const runtime = state.foreignAffairsRuntime;

  for (const conflict of Object.values(runtime.conflicts)) {
    if (conflict.endedDate) continue;
    const victimId = conflict.belligerentIds.find((id) => id !== conflict.aggressorId);
    if (!victimId || !conflict.aggressorId) continue;

    const victim = runtime.countries[victimId];
    if (!victim?.institutionIds.includes("INT_DC")) continue;

    const dcTreaty = Object.values(runtime.treaties).find(
      (t) =>
        t.status === "active" &&
        t.kind === "collective_security" &&
        t.metadata.institutionId === "INT_DC",
    );
    if (!dcTreaty) continue;

    const deterrence = deterrenceModifier(runtime, conflict.aggressorId, victimId);
    if (rng.float01("foreign-affairs") > 0.15 + deterrence) continue;

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ALLIANCE_CONSULTATION",
        importance: 0.78,
        visibility: "public",
        actorIds: dcTreaty.memberIds.filter((m) => m !== conflict.aggressorId),
        entityIds: ["INT_DC", conflict.id],
        payload: {
          institutionId: "INT_DC",
          article: 6,
          conflictId: conflict.id,
          aggressorId: conflict.aggressorId,
          victimId,
          deterrence,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  void world;
  return events;
}

export function dcMemberIds(runtime: SimState["foreignAffairsRuntime"]): string[] {
  const treaty = Object.values(runtime.treaties).find(
    (t) =>
      t.status === "active" &&
      t.kind === "collective_security" &&
      t.metadata.institutionId === "INT_DC",
  );
  return treaty?.memberIds.filter((m) => m !== TERENA_WORLD_ID) ?? [];
}

export function bilateralDcTension(
  runtime: SimState["foreignAffairsRuntime"],
  aId: string,
  bId: string,
): number {
  const rel = getBilateralRelation(runtime, aId, bId);
  return rel?.securityTension ?? 0.15;
}
