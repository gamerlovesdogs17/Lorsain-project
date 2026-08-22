import type { IsoDate } from "../calendar.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { adjustRelation } from "./relations.js";
import type { CrisisStage, InternationalCrisis } from "./types.js";
import { isPublicCrisisStage } from "./types.js";
import { beginConflictFromCrisisWithWarTrigger, crisisConflictProbability } from "./conflicts.js";

export function transitionLatent(
  crisis: InternationalCrisis,
  date: IsoDate,
  target: "incident" | "settled",
): CrisisStage {
  crisis.stage = target;
  crisis.lastStageChange = date;
  if (target === "incident") {
    crisis.intensity = Math.min(1, crisis.intensity + 0.1);
  } else {
    crisis.intensity = Math.max(0, crisis.intensity - 0.15);
  }
  return crisis.stage;
}

export function transitionIncident(
  crisis: InternationalCrisis,
  date: IsoDate,
  target: "active" | "deescalating" | "settled",
): CrisisStage {
  crisis.stage = target;
  crisis.lastStageChange = date;
  if (target === "active") {
    crisis.intensity = Math.min(1, crisis.intensity + 0.12);
  } else if (target === "settled") {
    crisis.intensity = Math.max(0, crisis.intensity - 0.2);
  } else {
    crisis.intensity = Math.max(0, crisis.intensity - 0.08);
  }
  return crisis.stage;
}

export function transitionActive(
  crisis: InternationalCrisis,
  date: IsoDate,
  target: "deescalating" | "conflict",
): CrisisStage {
  crisis.stage = target;
  crisis.lastStageChange = date;
  if (target === "conflict") {
    crisis.intensity = Math.min(1, crisis.intensity + 0.18);
  } else {
    crisis.intensity = Math.max(0, crisis.intensity - 0.1);
  }
  return crisis.stage;
}

export function transitionDeescalating(
  crisis: InternationalCrisis,
  date: IsoDate,
  target: "settled" | "active",
): CrisisStage {
  crisis.stage = target;
  crisis.lastStageChange = date;
  if (target === "settled") {
    crisis.intensity = Math.max(0, crisis.intensity - 0.2);
  } else {
    crisis.intensity = Math.min(1, crisis.intensity + 0.08);
  }
  return crisis.stage;
}

export function transitionConflictToCeasefire(
  crisis: InternationalCrisis,
  date: IsoDate,
): CrisisStage {
  crisis.stage = "deescalating";
  crisis.lastStageChange = date;
  crisis.intensity = Math.max(0, crisis.intensity - 0.15);
  return crisis.stage;
}

/** @deprecated Use explicit transition functions instead of ordinal arithmetic. */
export function escalateCrisis(
  crisis: InternationalCrisis,
  date: IsoDate,
  _delta = 1,
): CrisisStage {
  switch (crisis.stage) {
    case "latent":
      return transitionLatent(crisis, date, "incident");
    case "incident":
      return transitionIncident(crisis, date, "active");
    case "active":
      return transitionActive(crisis, date, "conflict");
    case "deescalating":
      return transitionDeescalating(crisis, date, "active");
    default:
      return crisis.stage;
  }
}

/** @deprecated Use explicit transition functions instead. */
export function deescalateCrisis(
  crisis: InternationalCrisis,
  date: IsoDate,
): CrisisStage {
  switch (crisis.stage) {
    case "conflict":
      return transitionConflictToCeasefire(crisis, date);
    case "active":
    case "incident":
      return transitionIncident(crisis, date, "deescalating");
    case "deescalating":
      return transitionDeescalating(crisis, date, "settled");
    case "latent":
      return transitionLatent(crisis, date, "settled");
    default:
      return crisis.stage;
  }
}

function crisisEventType(
  from: CrisisStage,
  to: CrisisStage,
): "FOREIGN_CRISIS_INCIDENT" | "FOREIGN_CRISIS_ESCALATED" | "FOREIGN_CRISIS_DEESCALATED" | "FOREIGN_CRISIS_SETTLED" | null {
  if (from === "latent" && to === "incident") return "FOREIGN_CRISIS_INCIDENT";
  if (to === "settled") return "FOREIGN_CRISIS_SETTLED";
  if (
    (from === "latent" || from === "incident") &&
    (to === "active" || to === "conflict")
  ) {
    return "FOREIGN_CRISIS_ESCALATED";
  }
  if (
    (from === "active" || from === "conflict" || from === "incident") &&
    to === "deescalating"
  ) {
    return "FOREIGN_CRISIS_DEESCALATED";
  }
  if (from === "deescalating" && to === "active") return "FOREIGN_CRISIS_ESCALATED";
  return null;
}

function applyRelationDrift(
  state: SimState,
  crisis: InternationalCrisis,
  stage: CrisisStage,
  date: IsoDate,
): void {
  if (!crisis.focalPairKey) return;
  const rel = state.foreignAffairsRuntime.bilateralRelations[crisis.focalPairKey];
  if (!rel) return;
  const tensionDelta =
    stage === "settled" || stage === "deescalating"
      ? -0.03
      : stage === "conflict"
        ? 0.08
        : 0.02;
  adjustRelation(rel, { securityTension: tensionDelta });
  rel.lastUpdated = date;
}

export function processCrisisLifecycle(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  date: IsoDate,
  commandId: string | null = null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const crisis of Object.values(state.foreignAffairsRuntime.crises)) {
    if (crisis.stage === "settled") continue;
    const prev = crisis.stage;
    const drift = rng.float01("foreign-affairs");

    if (crisis.stage === "latent") {
      if (drift < 0.02) transitionLatent(crisis, date, "incident");
      else if (drift > 0.97) transitionLatent(crisis, date, "settled");
    } else if (crisis.stage === "incident") {
      if (drift < 0.08) transitionIncident(crisis, date, "active");
      else if (drift < 0.14) transitionIncident(crisis, date, "deescalating");
      else if (drift > 0.96) transitionIncident(crisis, date, "settled");
    } else if (crisis.stage === "active") {
      if (drift < 0.06) {
        const conflictP = crisisConflictProbability(world, state, crisis);
        if (rng.float01("foreign-affairs") < conflictP) {
          transitionActive(crisis, date, "conflict");
        } else {
          transitionActive(crisis, date, "deescalating");
        }
      } else if (drift < 0.1) {
        transitionActive(crisis, date, "deescalating");
      }
    } else if (crisis.stage === "deescalating") {
      if (drift < 0.35) transitionDeescalating(crisis, date, "settled");
      else if (drift > 0.98) transitionDeescalating(crisis, date, "active");
    } else if (crisis.stage === "conflict") {
      if (drift < 0.08) transitionConflictToCeasefire(crisis, date);
    }

    applyRelationDrift(state, crisis, crisis.stage, date);

    if (crisis.stage !== prev) {
      const eventType = crisisEventType(prev, crisis.stage);
      if (eventType) {
        events.push(
          pushHistory(state, {
            date,
            type: eventType,
            importance: crisis.stage === "conflict" ? 0.9 : 0.65,
            visibility: isPublicCrisisStage(crisis.stage) ? "public" : "system",
            actorIds: crisis.participantIds,
            entityIds: [crisis.id],
            payload: {
              crisisId: crisis.id,
              fromStage: prev,
              toStage: crisis.stage,
              intensity: crisis.intensity,
              focalPairKey: crisis.focalPairKey,
            },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      if (crisis.stage === "conflict" && prev !== "conflict") {
        const existing = Object.values(state.foreignAffairsRuntime.conflicts).find(
          (c) => c.crisisId === crisis.id && c.endedDate == null,
        );
        if (!existing) {
          const aggressorId =
            (crisis.metadata.aggressorId as string | undefined) ?? crisis.participantIds[0];
          events.push(
            ...beginConflictFromCrisisWithWarTrigger(
              world,
              state,
              crisis,
              date,
              commandId,
              aggressorId,
            ).events,
          );
        }
      }
    }
  }
  return events;
}

export function crisisPairIds(crisis: InternationalCrisis): [string, string] | null {
  if (crisis.participantIds.length < 2) return null;
  const sorted = [...crisis.participantIds].sort();
  return [sorted[0]!, sorted[1]!];
}

export function publicActiveCrises(
  runtime: SimState["foreignAffairsRuntime"],
): InternationalCrisis[] {
  return Object.values(runtime.crises).filter((c) => isPublicCrisisStage(c.stage));
}

export function activeCrises(runtime: SimState["foreignAffairsRuntime"]): InternationalCrisis[] {
  return Object.values(runtime.crises).filter((c) => c.stage !== "settled");
}

export { isPublicCrisisStage };
