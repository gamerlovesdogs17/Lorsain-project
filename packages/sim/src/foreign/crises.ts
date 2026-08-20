import type { IsoDate } from "../calendar.js";
import type { RngService } from "../rng.js";
import type { SimState } from "../types.js";
import type { CrisisStage, InternationalCrisis } from "./types.js";
import { adjustRelation } from "./relations.js";

const STAGE_ORDER: CrisisStage[] = [
  "latent",
  "incident",
  "active",
  "deescalating",
  "settled",
  "conflict",
];

function stageIndex(stage: CrisisStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function escalateCrisis(
  crisis: InternationalCrisis,
  date: IsoDate,
  delta = 1,
): CrisisStage {
  const idx = Math.min(STAGE_ORDER.length - 1, stageIndex(crisis.stage) + delta);
  const next = STAGE_ORDER[idx]!;
  if (next !== crisis.stage) {
    crisis.stage = next;
    crisis.lastStageChange = date;
    crisis.intensity = Math.min(1, crisis.intensity + 0.12 * delta);
  }
  return crisis.stage;
}

export function deescalateCrisis(
  crisis: InternationalCrisis,
  date: IsoDate,
): CrisisStage {
  if (crisis.stage === "conflict") {
    crisis.stage = "deescalating";
  } else if (crisis.stage === "active" || crisis.stage === "incident") {
    crisis.stage = "deescalating";
  } else if (crisis.stage === "deescalating") {
    crisis.stage = "settled";
    crisis.intensity = Math.max(0, crisis.intensity - 0.2);
  } else if (crisis.stage === "latent") {
    crisis.stage = "settled";
    crisis.intensity = Math.max(0, crisis.intensity - 0.15);
  }
  crisis.lastStageChange = date;
  return crisis.stage;
}

export function processCrisisLifecycle(
  state: SimState,
  rng: RngService,
  date: IsoDate,
): void {
  for (const crisis of Object.values(state.foreignAffairsRuntime.crises)) {
    if (crisis.stage === "settled") continue;
    const drift = rng.float01("foreign-affairs");
    if (crisis.stage === "latent" && drift < 0.02) {
      escalateCrisis(crisis, date, 1);
    } else if (crisis.stage === "incident" && drift < 0.08) {
      escalateCrisis(crisis, date, 1);
    } else if (crisis.stage === "active" && drift < 0.06) {
      if (rng.float01("foreign-affairs") < 0.15) {
        escalateCrisis(crisis, date, 2);
      } else if (rng.float01("foreign-affairs") < 0.25) {
        deescalateCrisis(crisis, date);
      }
    } else if (crisis.stage === "deescalating" && drift < 0.35) {
      deescalateCrisis(crisis, date);
    }
    const stage = crisis.stage as CrisisStage;
    if (crisis.focalPairKey) {
      const rel = state.foreignAffairsRuntime.bilateralRelations[crisis.focalPairKey];
      if (rel) {
        const tensionDelta =
          stage === "settled" || stage === "deescalating"
            ? -0.03
            : stage === "conflict"
              ? 0.08
              : 0.02;
        adjustRelation(rel, { securityTension: tensionDelta });
        rel.lastUpdated = date;
      }
    }
  }
}

export function crisisPairIds(crisis: InternationalCrisis): [string, string] | null {
  if (crisis.participantIds.length < 2) return null;
  const sorted = [...crisis.participantIds].sort();
  return [sorted[0]!, sorted[1]!];
}

export function activeCrises(runtime: SimState["foreignAffairsRuntime"]): InternationalCrisis[] {
  return Object.values(runtime.crises).filter((c) => c.stage !== "settled");
}
