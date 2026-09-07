import { padId } from "../scheduler.js";
import type { SimState } from "../types.js";
import { ensureHistory15Runtime } from "./state.js";
import type { ConstitutionalEra } from "./types.js";

function currentStructures(state: SimState): {
  electoralSystem: string;
  executiveStructure: string;
  legislatureStructure: string;
} {
  const order = state.provincialRuntime?.constitutionalOrder;
  return {
    electoralSystem: order?.presidentialElection
      ? `${order.presidentialElection}/${order.assemblyElection ?? "unknown"}`
      : "founding_default",
    executiveStructure: order?.executiveAuthority ?? "presidential_republic",
    legislatureStructure: order?.assemblyElection ?? "national_assembly",
  };
}

/** Seed a Founding era at scenario start when constitutionalEras is empty. */
export function ensureFoundingConstitutionalEra(state: SimState): ConstitutionalEra {
  const runtime = ensureHistory15Runtime(state);
  if (runtime.constitutionalEras.length > 0) {
    return runtime.constitutionalEras[0]!;
  }
  const structures = currentStructures(state);
  const era: ConstitutionalEra = {
    id: "ERA_FOUNDING",
    label: "Founding",
    startDate: state.scenarioStartDate,
    endDate: null,
    keyAmendments: [],
    ...structures,
  };
  runtime.constitutionalEras.push(era);
  return era;
}

/**
 * Detect era starts from constitutional amendments / major structure events.
 * Closes the open era and opens a new one when structures change or a major
 * amendment passes.
 */
export function syncConstitutionalEras(state: SimState): void {
  const runtime = ensureHistory15Runtime(state);
  ensureFoundingConstitutionalEra(state);

  const open = runtime.constitutionalEras.find((e) => e.endDate == null);
  if (!open) return;

  const structures = currentStructures(state);
  const structureChanged =
    open.electoralSystem !== structures.electoralSystem ||
    open.executiveStructure !== structures.executiveStructure ||
    open.legislatureStructure !== structures.legislatureStructure;

  const recent = state.history.slice(-80);
  const amendmentEvents = recent.filter(
    (ev) =>
      ev.type === "AMENDMENT_VOTE_PASSED" ||
      ev.type === "CONSTITUTIONAL_AMENDMENT_ENACTED" ||
      ev.type === "CONSTITUTION_AMENDED",
  );
  const newAmendmentIds: string[] = [];
  for (const ev of amendmentEvents) {
    const id =
      (typeof ev.payload?.amendmentId === "string" && ev.payload.amendmentId) ||
      (typeof ev.payload?.clauseId === "string" && ev.payload.clauseId) ||
      ev.id;
    if (
      !open.keyAmendments.includes(id) &&
      !runtime.constitutionalEras.some((e) => e.keyAmendments.includes(id))
    ) {
      // Only treat as era-triggering if after current era start
      if (ev.date >= open.startDate) newAmendmentIds.push(id);
    }
  }

  if (!structureChanged && newAmendmentIds.length === 0) {
    // Keep open era structures fresh without splitting
    open.electoralSystem = structures.electoralSystem;
    open.executiveStructure = structures.executiveStructure;
    open.legislatureStructure = structures.legislatureStructure;
    return;
  }

  if (!structureChanged && newAmendmentIds.length > 0) {
    open.keyAmendments = [...open.keyAmendments, ...newAmendmentIds].slice(-24);
    return;
  }

  // Structure change → close era and open a new one
  open.endDate = state.currentDate;
  const n = runtime.constitutionalEras.length + 1;
  runtime.constitutionalEras.push({
    id: padId("ERA", n),
    label: `Constitutional order ${n}`,
    startDate: state.currentDate,
    endDate: null,
    keyAmendments: newAmendmentIds.slice(0, 8),
    ...structures,
  });
}
