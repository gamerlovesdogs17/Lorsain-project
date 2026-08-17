import { padId } from "../scheduler.js";
import { officesOfKind, occupyingTerms } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { emptyExecutiveRuntime, type MinistryAdminState } from "./types.js";
import type { ExecutiveRuntime } from "./types.js";

export { currentPresidentialAuthorityId } from "../legislature/state.js";

export function ministerOfficeIds(world: KernelWorld): string[] {
  return officesOfKind(world, "minister")
    .map((o) => o.id)
    .sort();
}

export function currentMinisterHolderId(
  world: KernelWorld,
  state: SimState,
  officeId: string,
): string | null {
  const office = world.offices[officeId];
  if (!office || office.kind !== "minister") return null;
  const terms = occupyingTerms(state, officeId).filter(
    (t) => t.status === "active" && t.holdingKind === "substantive",
  );
  return terms[0]?.holderId ?? null;
}

export function deriveCabinet(
  world: KernelWorld,
  state: SimState,
): Array<{ officeId: string; title: string; portfolio: string | null; holderId: string | null }> {
  return ministerOfficeIds(world).map((officeId) => {
    const office = world.offices[officeId]!;
    return {
      officeId,
      title: office.title,
      portfolio: office.portfolio,
      holderId: currentMinisterHolderId(world, state, officeId),
    };
  });
}

export function seedMinistriesIfNeeded(world: KernelWorld, state: SimState): void {
  for (const officeId of ministerOfficeIds(world)) {
    if (state.executiveRuntime.ministries[officeId]) continue;
    const rec: MinistryAdminState = {
      officeId,
      administrativeCapacity: 0.55,
      currentPriorities: [],
    };
    state.executiveRuntime.ministries[officeId] = rec;
  }
}

export function allocateRegulationId(state: SimState): string {
  return padId("REG", state.counters.nextRegulationId++);
}

export function allocateMotionId(state: SimState): string {
  return padId("MOT", state.counters.nextMotionId++);
}

export function allocateEmergencyId(state: SimState): string {
  return padId("EMG", state.counters.nextEmergencyId++);
}

export function allocateWarPowerId(state: SimState): string {
  return padId("WAR", state.counters.nextWarPowerId++);
}

export function allocateBudgetId(state: SimState): string {
  return padId("BUD", state.counters.nextBudgetId++);
}

export function ensureExecutiveRuntime(state: SimState): ExecutiveRuntime {
  if (!state.executiveRuntime) state.executiveRuntime = emptyExecutiveRuntime();
  return state.executiveRuntime;
}
