import type { KernelWorld, SimState } from "../types.js";
import { deriveCabinet } from "../executive/state.js";
import { clampUnit, departmentCapacity } from "./capacity.js";
import { departmentFromOfficeId } from "./departments.js";
import { ensureGoverningRuntime } from "./state.js";
import type { MinisterialPerformance } from "./types.js";
import { TERENA_WORLD_ID } from "../foreign/types.js";

/**
 * Ministerial performance from department capacity + implementation record.
 * Foreign minister also absorbs a light crisis/sanctions accountability factor
 * from live FA runtime (Phase 16 cabinet feed).
 * Bounded score for reshuffle / accountability hooks (Phase 12 feed).
 */
export function updateMinisterialPerformance(
  world: KernelWorld,
  state: SimState,
): MinisterialPerformance[] {
  const runtime = ensureGoverningRuntime(state);
  const cabinet = deriveCabinet(world, state);
  const out: MinisterialPerformance[] = [];

  const activeCrises = Object.values(state.foreignAffairsRuntime.crises ?? {}).filter(
    (c) => c.stage === "active" || c.stage === "incident",
  ).length;
  const activeSanctions = Object.values(state.foreignAffairsRuntime.sanctions ?? {}).filter(
    (s) => s.active && s.imposerId === TERENA_WORLD_ID,
  ).length;

  for (const seat of cabinet) {
    const departmentId = departmentFromOfficeId(seat.officeId);
    if (!departmentId) continue;
    const capacityFactor = departmentCapacity(state, departmentId);
    const owned = Object.values(runtime.implementations).filter(
      (r) => r.departmentId === departmentId,
    );
    let implementationFactor = 0.55;
    if (owned.length > 0) {
      const avgProgress =
        owned.reduce((s, r) => s + (r.status === "blocked" ? 0 : r.progress), 0) / owned.length;
      const blockedShare =
        owned.filter((r) => r.status === "blocked" || r.status === "delayed").length / owned.length;
      implementationFactor = clampUnit(avgProgress * 0.85 + (1 - blockedShare) * 0.15);
    }
    let score = clampUnit(capacityFactor * 0.45 + implementationFactor * 0.55);
    if (departmentId === "foreign") {
      const crisisDrag = Math.min(0.12, activeCrises * 0.03 + activeSanctions * 0.015);
      score = clampUnit(score - crisisDrag);
    }
    const rec: MinisterialPerformance = {
      officeId: seat.officeId,
      departmentId,
      score,
      capacityFactor,
      implementationFactor,
      updatedDate: state.currentDate,
    };
    runtime.ministerialPerformance[seat.officeId] = rec;
    out.push(rec);
  }
  return out;
}
