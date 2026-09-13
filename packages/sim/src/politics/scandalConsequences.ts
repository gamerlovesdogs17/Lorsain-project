import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { endTerm, occupyingTerms, activeTermsForPolitician, suspendTerm } from "../offices.js";
import type { ScandalGovernmentResponse, ScandalPartyResponse, ScandalRecord } from "./scandals.js";

function ministerOfficesForPolitician(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string[] {
  const offices: string[] = [];
  if (!world?.offices) return offices;
  for (const term of activeTermsForPolitician(state, politicianId)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const kind = world.offices[term.officeId]?.kind;
    if (kind === "minister") offices.push(term.officeId);
  }
  return [...new Set(offices)].sort();
}

/** End ministerial terms for a scandal resignation / removal. */
export function applyScandalMinisterialExit(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  reason: string,
  commandId: string,
  scandalId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const presidentId = currentPresidentialAuthorityId(world, state);
  for (const officeId of ministerOfficesForPolitician(world, state, politicianId)) {
    for (const term of occupyingTerms(state, officeId)) {
      if (term.holderId !== politicianId) continue;
      if (term.status !== "active" && term.status !== "suspended") continue;
      const ended = endTerm(state, term.id, state.currentDate, reason);
      if (!ended) continue;
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "MINISTER_DISMISSED",
          importance: 0.82,
          visibility: "public",
          actorIds: [presidentId ?? politicianId, politicianId].filter(Boolean) as string[],
          entityIds: [officeId, ended.id, scandalId],
          payload: {
            officeId,
            holderId: politicianId,
            reason,
            scandalId,
            source: "scandal_consequence",
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

/** Honest weaker status: duties restricted via suspension of ministerial term. */
export function applyScandalDutiesRestricted(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  commandId: string,
  scandalId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const officeId of ministerOfficesForPolitician(world, state, politicianId)) {
    for (const term of occupyingTerms(state, officeId)) {
      if (term.holderId !== politicianId || term.status !== "active") continue;
      const out = suspendTerm(state, term.id);
      if ("error" in out) continue;
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "MINISTER_DUTIES_RESTRICTED",
          importance: 0.62,
          visibility: "public",
          actorIds: [politicianId],
          entityIds: [officeId, term.id, scandalId],
          payload: {
            officeId,
            holderId: politicianId,
            scandalId,
            status: "duties_restricted",
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

/**
 * Apply officeholding consequences once when responses / outcomes warrant it.
 * Idempotent via record.metadata.consequencesApplied.
 */
export function applyScandalOfficeConsequences(
  world: KernelWorld,
  state: SimState,
  record: ScandalRecord,
  commandId: string,
): SimEvent[] {
  if (record.metadata.consequencesApplied === true) return [];
  const events: SimEvent[] = [];
  const targetId = record.targetPoliticianId;

  const shouldExit =
    record.targetResponse === "resign" ||
    record.governmentResponse === "remove_minister" ||
    (record.governmentResponse === "request_resignation" &&
      (record.outcome === "substantiated" ||
        record.outcome === "partially_substantiated" ||
        record.resignationPressure >= 0.78));

  if (shouldExit) {
    const reason =
      record.targetResponse === "resign" ? "scandal_resignation" : "scandal_presidential_removal";
    const exited = applyScandalMinisterialExit(
      world,
      state,
      targetId,
      reason,
      commandId,
      record.id,
    );
    if (exited.length > 0) {
      record.metadata.consequencesApplied = true;
      record.metadata.officeExitReason = reason;
      events.push(...exited);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "POLITICAL_SCANDAL_RESIGNATION",
          importance: 0.78,
          visibility: "public",
          actorIds: [targetId],
          entityIds: [record.id],
          payload: {
            scandalId: record.id,
            scandalTypeId: record.typeId,
            governmentResponse: record.governmentResponse,
            partyResponse: record.partyResponse,
            targetResponse: record.targetResponse,
            outcome: record.outcome,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
      return events;
    }
  }

  if (
    record.governmentResponse === "restrict_duties" &&
    record.metadata.dutiesRestricted !== true
  ) {
    const restricted = applyScandalDutiesRestricted(world, state, targetId, commandId, record.id);
    if (restricted.length > 0) {
      record.metadata.dutiesRestricted = true;
      events.push(...restricted);
    }
  }

  // Party "suspend_role" is Party-facing — store on record; do not invent ministerial suspension.
  if (record.partyResponse === "suspend_role") {
    record.metadata.partyRoleUnderReview = true;
  }

  return events;
}

export function chooseGovernmentResponse(
  party: ScandalPartyResponse | null,
  evidence: number,
  pressure: number,
  severityPath: string,
  rngFloat: number,
): ScandalGovernmentResponse {
  // Distinct from Party: PM may remove while Party defends, or wait while Party demands resignation.
  if (pressure > 0.8 && evidence > 0.62) {
    if (rngFloat < 0.45) return "remove_minister";
    if (rngFloat < 0.75) return "request_resignation";
    return "restrict_duties";
  }
  if (severityPath === "prosecutorial" && evidence > 0.55) {
    return rngFloat < 0.4 ? "restrict_duties" : "wait_for_investigation";
  }
  if (evidence < 0.32) {
    // Weak case: often retain even if Party is nervous.
    if (party === "request_resignation")
      return rngFloat < 0.55 ? "retain" : "wait_for_investigation";
    return "retain";
  }
  if (party === "defend" && evidence > 0.58 && pressure > 0.55) {
    // Split: Party defends, government protects coalition by distancing.
    return rngFloat < 0.5 ? "request_resignation" : "restrict_duties";
  }
  if (party === "request_resignation" && evidence < 0.5) {
    return "wait_for_investigation";
  }
  if (rngFloat < 0.3) return "wait_for_investigation";
  if (rngFloat < 0.55) return "retain";
  if (rngFloat < 0.75) return "request_resignation";
  return "restrict_duties";
}
