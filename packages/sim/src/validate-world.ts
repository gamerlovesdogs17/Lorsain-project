import { compareIsoDate, isIsoDate } from "./calendar.js";
import { validateOfficeTermSet } from "./offices.js";
import { resolutionEventMustBlock } from "./scheduler.js";
import type { CommandError, KernelWorld, OfficeTerm, SimState } from "./types.js";

function asInvalidWorld(err: CommandError): CommandError {
  return { code: "INVALID_WORLD", message: err.message };
}

export function validateKernelWorld(world: KernelWorld): CommandError | null {
  const politicianIds = new Set<string>();
  for (const p of world.politicians) {
    if (!p.id) return { code: "INVALID_WORLD", message: "Politician missing id" };
    if (politicianIds.has(p.id)) {
      return { code: "INVALID_WORLD", message: `Duplicate politician id ${p.id}` };
    }
    politicianIds.add(p.id);
    if (typeof p.alive !== "boolean" || typeof p.retired !== "boolean") {
      return { code: "INVALID_WORLD", message: `Politician ${p.id} has invalid flags` };
    }
  }
  const officeIds = new Set(Object.keys(world.offices));
  for (const [id, office] of Object.entries(world.offices)) {
    if (office.id !== id) {
      return { code: "INVALID_WORLD", message: `Office record key ${id} != id ${office.id}` };
    }
    if (office.capacity < 1) {
      return { code: "INVALID_WORLD", message: `Office ${id} capacity must be positive` };
    }
  }
  for (const oid of world.successionOfficeIds) {
    if (!officeIds.has(oid)) {
      return { code: "INVALID_WORLD", message: `Succession office ${oid} does not exist` };
    }
  }
  if (!isIsoDate(world.scenarioStartDate)) {
    return { code: "INVALID_WORLD", message: "Invalid scenarioStartDate" };
  }
  const termErr = validateOfficeTermSet({
    terms: world.startingTerms,
    offices: world.offices,
    politician: (id) => world.politicians.find((p) => p.id === id),
    asOfDate: world.scenarioStartDate,
    domainResolutionBlocked: false,
    mode: "starting",
  });
  if (termErr) return asInvalidWorld(termErr);
  for (const ev of world.initialScheduled) {
    if (!isIsoDate(ev.dueDate)) {
      return { code: "INVALID_WORLD", message: `Invalid scheduled dueDate ${String(ev.dueDate)}` };
    }
    if (compareIsoDate(ev.dueDate, world.scenarioStartDate) < 0) {
      return {
        code: "INVALID_WORLD",
        message: `Initial scheduled ${ev.eventType} is before scenario start`,
      };
    }
    const resolutionErr = resolutionEventMustBlock(ev.blocking, ev.requiresResolution);
    if (resolutionErr) return resolutionErr;
  }
  return null;
}

/**
 * World-relative legality for a parsed SimState. Does not require runtime
 * politicians to exist in static KernelWorld starting content.
 */
export function validateStateAgainstWorld(
  state: SimState,
  world: KernelWorld,
): CommandError | null {
  if (state.scenarioStartDate !== world.scenarioStartDate) {
    return {
      code: "SCENARIO_START_MISMATCH",
      message: `Save scenarioStartDate ${state.scenarioStartDate} != world ${world.scenarioStartDate}`,
    };
  }
  if (!state.politicians[state.playerPoliticianId]) {
    return {
      code: "INVALID_SAVE_WORLD",
      message: `playerPoliticianId ${state.playerPoliticianId} is not a runtime politician`,
    };
  }
  if (state.presidential.nextRegularElectionDate !== world.nextRegularPresidentialElectionDate) {
    return {
      code: "PRESIDENTIAL_CYCLE_MISMATCH",
      message: `nextRegularElectionDate ${state.presidential.nextRegularElectionDate} != world ${world.nextRegularPresidentialElectionDate}`,
    };
  }
  for (const id of Object.keys(state.presidential.electedTermCountByPolitician)) {
    if (!state.politicians[id] && !(id in world.electedTermCounts)) {
      return {
        code: "UNKNOWN_POLITICIAN",
        message: `elected term count for unknown politician ${id}`,
      };
    }
  }
  if (state.pendingInterrupt && state.pendingInterrupt.date !== state.currentDate) {
    return {
      code: "INVALID_SAVE_WORLD",
      message: "pendingInterrupt.date must equal currentDate",
    };
  }
  for (const ev of state.scheduler.events) {
    const resolutionErr = resolutionEventMustBlock(ev.blocking, ev.requiresResolution);
    if (resolutionErr) return resolutionErr;
    if (ev.status === "pending" && compareIsoDate(ev.dueDate, state.currentDate) < 0) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `pending event ${ev.id} is in the past`,
      };
    }
    if (ev.status === "processed" && compareIsoDate(ev.dueDate, state.currentDate) > 0) {
      return {
        code: "INVALID_SAVE_WORLD",
        message: `processed event ${ev.id} is in the future`,
      };
    }
    if (ev.requiresResolution && ev.status === "processed") {
      const pending = state.pendingInterrupt;
      if (
        !pending ||
        pending.kind !== "BLOCKING_DOMAIN" ||
        pending.scheduledEventId !== ev.id ||
        pending.resolutionStatus !== "unresolved"
      ) {
        return {
          code: "UNRESOLVED_DOMAIN_EVENT",
          message: `processed resolution event ${ev.id} must have an unresolved BLOCKING_DOMAIN interrupt`,
        };
      }
    }
  }
  const termErr = validateOfficeTermSet({
    terms: Object.values(state.officeTerms),
    offices: world.offices,
    politician: (id) => state.politicians[id],
    asOfDate: state.currentDate,
    domainResolutionBlocked: state.pendingInterrupt?.requiresResolution === true,
    mode: "runtime",
  });
  if (termErr) return termErr;
  return null;
}

export function uniqueAllocatedTermIds(state: {
  officeTerms: Record<string, { id: string }>;
}): CommandError | null {
  const seen = new Set<string>();
  for (const [key, t] of Object.entries(state.officeTerms)) {
    if (t.id !== key) {
      return { code: "INVALID_WORLD", message: `Term key ${key} != id ${t.id}` };
    }
    if (seen.has(t.id)) {
      return { code: "INVALID_WORLD", message: `Duplicate term id ${t.id}` };
    }
    seen.add(t.id);
  }
  return null;
}

/** Used by tests; capacity after allocation. Ended terms do not count. */
export function assertNoCapacityBreach(
  world: KernelWorld,
  terms: OfficeTerm[],
): CommandError | null {
  const counts = new Map<string, number>();
  for (const t of terms) {
    if (t.status === "ended") continue;
    counts.set(t.officeId, (counts.get(t.officeId) ?? 0) + 1);
    const cap = world.offices[t.officeId]?.capacity;
    if (cap != null && (counts.get(t.officeId) ?? 0) > cap) {
      return { code: "INVALID_WORLD", message: `${t.officeId} over capacity` };
    }
  }
  return null;
}
