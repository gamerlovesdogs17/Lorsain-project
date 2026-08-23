import {
  parseIsoDate,
  presidentialAssumptionDate,
  regularElectionDate,
  type IsoDate,
} from "../calendar.js";
import { enqueueScheduled, padId, pushHistory } from "../scheduler.js";
import {
  activeTermsForPolitician,
  assumeOffice,
  canAssumeOffice,
  endTerm,
  occupyingTerms,
  presidentOfficeId,
} from "../offices.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePresidentialNominationContests } from "../parties/state.js";
import { ensurePlannedPresidentialElection } from "./state.js";
import type { DomainResolutionRecord } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function payloadElectionId(payload: { electionId?: unknown } | undefined): string | null {
  return typeof payload?.electionId === "string" && payload.electionId.length > 0
    ? payload.electionId
    : null;
}

export function createDomainResolution(
  state: SimState,
  rec: Omit<DomainResolutionRecord, "id">,
): DomainResolutionRecord {
  const id = padId("DRES", state.counters.nextDomainResolutionId++);
  const full: DomainResolutionRecord = { ...rec, id };
  state.domainResolutions[id] = full;
  return full;
}

export function resolutionForScheduledEvent(
  state: SimState,
  scheduledEventId: string,
): DomainResolutionRecord | undefined {
  return Object.values(state.domainResolutions).find(
    (r) => r.sourceScheduledEventId === scheduledEventId,
  );
}

export function applyPresidentialAssumption(
  state: SimState,
  world: KernelWorld,
  args: { date: IsoDate; scheduledEventId: string; commandId: string },
): { events: SimEvent[] } | { error: CommandError } {
  const electId = state.presidential.certifiedPresidentElectId;
  if (!electId) {
    return { error: reject("NO_PRESIDENT_ELECT", "no certified president-elect") };
  }
  const elect = state.politicians[electId];
  if (!elect?.alive || elect.retired) {
    return {
      error: reject(
        "PRESIDENT_ELECT_UNABLE_TO_ASSUME",
        `${electId} cannot assume the presidency; constitution does not define a substitute`,
      ),
    };
  }
  const src = state.scheduler.events.find((e) => e.id === args.scheduledEventId);
  const sourceElectionId = payloadElectionId(src?.payload) ?? payloadElectionId(undefined);
  if (!sourceElectionId) {
    return { error: reject("MISSING_ELECTION_ID", "assumption event lacks electionId") };
  }
  const sourceElection = state.elections[sourceElectionId];
  if (!sourceElection || sourceElection.status !== "resolved") {
    return { error: reject("INVALID_ELECTION", sourceElectionId) };
  }
  const officeId = presidentOfficeId(world);
  const events: SimEvent[] = [];
  for (const t of occupyingTerms(state, officeId)) {
    const ended = endTerm(state, t.id, args.date, "presidential_assumption");
    if (ended) {
      events.push(
        pushHistory(state, {
          date: args.date,
          type: "OFFICE_TERM_ENDED",
          importance: 0.8,
          visibility: "public",
          actorIds: [t.holderId],
          entityIds: [t.officeId],
          payload: { reason: "presidential_assumption" },
          sourceScheduledEventId: args.scheduledEventId,
          sourceCommandId: args.commandId,
        }),
      );
    }
  }
  const presidentOffice = world.offices[officeId];
  const incompatible = new Set(presidentOffice?.incompatibleWithKinds ?? []);
  for (const t of activeTermsForPolitician(state, electId)) {
    const kind = world.offices[t.officeId]?.kind;
    if (!kind || !incompatible.has(kind)) continue;
    const ended = endTerm(state, t.id, args.date, "incompatible_with_presidency");
    if (ended) {
      events.push(
        pushHistory(state, {
          date: args.date,
          type: "OFFICE_TERM_ENDED",
          importance: 0.7,
          visibility: "public",
          actorIds: [t.holderId],
          entityIds: [t.officeId],
          payload: { reason: "incompatible_with_presidency" },
          sourceScheduledEventId: args.scheduledEventId,
          sourceCommandId: args.commandId,
        }),
      );
    }
  }
  const nextElectionYear = parseIsoDate(state.presidential.nextRegularElectionDate).year;
  const assumedFrom = state.presidential.nextRegularElectionDate;
  const nextYear = nextElectionYear + world.presidentialCalendar.intervalYears;
  const nextElection = regularElectionDate(world.presidentialCalendar, nextYear);
  const termEnd = presidentialAssumptionDate(nextElection, world.presidentialCalendar);
  const assumed = assumeOffice(state, world, {
    officeId,
    holderId: electId,
    date: args.date,
    accessionReason: "elected_assumption",
    holdingKind: "substantive",
    endDate: termEnd,
    startKnown: true,
    sourceElectionId,
  });
  if ("error" in assumed) return { error: assumed.error };
  events.push(
    pushHistory(state, {
      date: args.date,
      type: "PRESIDENTIAL_ASSUMPTION",
      importance: 1,
      visibility: "public",
      actorIds: [electId],
      entityIds: [officeId],
      payload: {
        termId: assumed.term.id,
        previousElectionDate: assumedFrom,
        electionId: sourceElectionId,
      },
      sourceScheduledEventId: args.scheduledEventId,
      sourceCommandId: args.commandId,
    }),
  );
  state.presidential.certifiedPresidentElectId = null;
  state.presidential.nextRegularElectionDate = nextElection;
  const nextState = ensurePlannedPresidentialElection(state, world, nextElection);
  ensurePresidentialNominationContests(state, world, nextState);
  const exists = state.scheduler.events.some(
    (e) =>
      e.eventType === "PRESIDENTIAL_ELECTION_DUE" &&
      e.dueDate === nextElection &&
      payloadElectionId(e.payload) === nextState.id,
  );
  if (!exists) {
    enqueueScheduled(state, {
      dueDate: nextElection,
      eventType: "PRESIDENTIAL_ELECTION_DUE",
      payload: { electionId: nextState.id },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_PRESIDENTIAL_REGULAR",
    });
  }
  createDomainResolution(state, {
    sourceScheduledEventId: args.scheduledEventId,
    domainType: "presidential_assumption",
    date: args.date,
    electionId: sourceElectionId,
    resultEventId: events[events.length - 1]!.id,
    archiveElectionId: sourceElectionId,
    metadata: {},
  });
  return { events };
}

export function canAssumeOfficeCapacityFree(
  state: SimState,
  world: KernelWorld,
  holderId: string,
): CommandError | null {
  return canAssumeOffice(state, world, presidentOfficeId(world), holderId, "substantive", {
    ignoreOfficeCapacity: true,
  });
}
