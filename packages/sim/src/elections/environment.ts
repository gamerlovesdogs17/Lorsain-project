import type { CommandError, KernelWorld, SimState } from "../types.js";
import { ENVIRONMENT_SHIFT } from "./policy.js";
import { isElectoralAggregatePartyId } from "./support.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function finiteShift(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= ENVIRONMENT_SHIFT.min &&
    v <= ENVIRONMENT_SHIFT.max
  );
}

export function electoralEnvironmentPatchError(
  world: KernelWorld,
  state: SimState,
  patch: {
    nationalPartyShift?: Record<string, number>;
    constituencyId?: string;
    constituencyPartyShift?: Record<string, number>;
    issueClimateShift?: Record<string, number>;
  },
): CommandError | null {
  if (patch.nationalPartyShift) {
    if (typeof patch.nationalPartyShift !== "object" || Array.isArray(patch.nationalPartyShift)) {
      return reject("INVALID_ENVIRONMENT", "nationalPartyShift must be an object");
    }
    for (const [partyId, v] of Object.entries(patch.nationalPartyShift)) {
      if (!isElectoralAggregatePartyId(world, state, partyId)) {
        return reject("UNKNOWN_ELECTORAL_PARTY", partyId);
      }
      if (!finiteShift(v)) {
        return reject("INVALID_ENVIRONMENT", `nationalPartyShift.${partyId} out of range`);
      }
    }
  }
  if (patch.constituencyPartyShift) {
    if (!patch.constituencyId || !world.constituencyElectorate[patch.constituencyId]) {
      return reject("INVALID_GEOGRAPHY", String(patch.constituencyId));
    }
    if (
      typeof patch.constituencyPartyShift !== "object" ||
      Array.isArray(patch.constituencyPartyShift)
    ) {
      return reject("INVALID_ENVIRONMENT", "constituencyPartyShift must be an object");
    }
    for (const [partyId, v] of Object.entries(patch.constituencyPartyShift)) {
      if (!isElectoralAggregatePartyId(world, state, partyId)) {
        return reject("UNKNOWN_ELECTORAL_PARTY", partyId);
      }
      if (!finiteShift(v)) {
        return reject("INVALID_ENVIRONMENT", `constituencyPartyShift.${partyId} out of range`);
      }
    }
  }
  if (patch.issueClimateShift) {
    if (typeof patch.issueClimateShift !== "object" || Array.isArray(patch.issueClimateShift)) {
      return reject("INVALID_ENVIRONMENT", "issueClimateShift must be an object");
    }
    for (const [issueId, v] of Object.entries(patch.issueClimateShift)) {
      if (world.issueIds.length > 0 && !world.issueIds.includes(issueId)) {
        return reject("UNKNOWN_ISSUE", issueId);
      }
      if (!finiteShift(v)) {
        return reject("INVALID_ENVIRONMENT", `issueClimateShift.${issueId} out of range`);
      }
    }
  }
  return null;
}

export function applyElectoralEnvironmentPatch(
  state: SimState,
  patch: {
    nationalPartyShift?: Record<string, number>;
    constituencyId?: string;
    constituencyPartyShift?: Record<string, number>;
    issueClimateShift?: Record<string, number>;
  },
): void {
  if (patch.nationalPartyShift) {
    for (const [k, v] of Object.entries(patch.nationalPartyShift)) {
      state.electoralEnvironment.nationalPartyShift[k] = v;
    }
  }
  if (patch.constituencyId && patch.constituencyPartyShift) {
    state.electoralEnvironment.constituencyPartyShift[patch.constituencyId] = {
      ...(state.electoralEnvironment.constituencyPartyShift[patch.constituencyId] ?? {}),
      ...patch.constituencyPartyShift,
    };
  }
  if (patch.issueClimateShift) {
    for (const [k, v] of Object.entries(patch.issueClimateShift)) {
      state.electoralEnvironment.issueClimateShift[k] = v;
    }
  }
}
