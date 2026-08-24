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
  officesAreIncompatible,
  occupyingTerms,
  presidentOfficeId,
} from "../offices.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePresidentialNominationContests } from "../parties/state.js";
import { ensurePlannedPresidentialElection } from "./state.js";
import type { DomainResolutionRecord } from "./types.js";
import { applyPresidentialVacancy } from "../succession.js";
import { withdrawAssemblyCandidacy } from "./assembly-cycle.js";

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
  const isSpecialElection = sourceElection.metadata.specialElection === true;
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
  for (const t of activeTermsForPolitician(state, electId)) {
    const currentOffice = world.offices[t.officeId];
    if (!presidentOffice || !currentOffice || !officesAreIncompatible(presidentOffice, currentOffice)) {
      continue;
    }
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
  const assumedFrom = sourceElection.date;
  const nextElection = isSpecialElection
    ? typeof sourceElection.metadata.regularTermElectionDate === "string"
      ? sourceElection.metadata.regularTermElectionDate
      : state.presidential.nextRegularElectionDate
    : regularElectionDate(
        world.presidentialCalendar,
        parseIsoDate(state.presidential.nextRegularElectionDate).year + world.presidentialCalendar.intervalYears,
      );
  const termEnd = presidentialAssumptionDate(nextElection, world.presidentialCalendar);
  const assumed = assumeOffice(state, world, {
    officeId,
    holderId: electId,
    date: args.date,
    accessionReason: isSpecialElection ? "special_election_assumption" : "elected_assumption",
    holdingKind: "substantive",
    endDate: termEnd,
    startKnown: true,
    sourceElectionId,
  });
  if ("error" in assumed) return { error: assumed.error };
  for (const futureElection of Object.values(state.elections)) {
    if (
      futureElection.type !== "assembly" ||
      futureElection.status === "resolved" ||
      futureElection.status === "cancelled" ||
      futureElection.assembly?.candidacies[electId]?.status !== "filed"
    ) {
      continue;
    }
    const candidacy = futureElection.assembly.candidacies[electId]!;
    withdrawAssemblyCandidacy(state, futureElection.id, electId);
    events.push(
      pushHistory(state, {
        date: args.date,
        type: "ASSEMBLY_CANDIDACY_WITHDRAWN",
        importance: 0.65,
        visibility: "public",
        actorIds: [electId],
        entityIds: [futureElection.id, candidacy.constituencyId],
        payload: {
          electionId: futureElection.id,
          constituencyId: candidacy.constituencyId,
          reason: "assumed_presidency",
        },
        sourceScheduledEventId: args.scheduledEventId,
        sourceCommandId: args.commandId,
      }),
    );
  }
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
        specialElection: isSpecialElection,
      },
      sourceScheduledEventId: args.scheduledEventId,
      sourceCommandId: args.commandId,
    }),
  );
  state.presidential.certifiedPresidentElectId = null;
  state.presidential.nextRegularElectionDate = nextElection;
  if (!isSpecialElection) {
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
  }
  createDomainResolution(state, {
    sourceScheduledEventId: args.scheduledEventId,
    domainType: "presidential_assumption",
    date: args.date,
    electionId: sourceElectionId,
    resultEventId: events[events.length - 1]!.id,
    archiveElectionId: sourceElectionId,
    metadata: { specialElection: isSpecialElection },
  });
  return { events };
}

/**
 * A deceased or retired President-elect is not replaced by a runner-up. The
 * outgoing term ends, the lawful successor acts, and voters choose a President
 * for the remainder of the regular term in a special election.
 */
export function resolveUnablePresidentElect(
  state: SimState,
  world: KernelWorld,
  args: { scheduledEventId: string; commandId: string },
): { events: SimEvent[] } | { error: CommandError } {
  const src = state.scheduler.events.find((event) => event.id === args.scheduledEventId);
  const sourceElectionId = payloadElectionId(src?.payload);
  const sourceElection = sourceElectionId ? state.elections[sourceElectionId] : null;
  if (!sourceElection || sourceElection.type !== "presidential" || sourceElection.status !== "resolved") {
    return { error: reject("INVALID_ELECTION", sourceElectionId ?? "missing") };
  }
  const electId = state.presidential.certifiedPresidentElectId;
  const elect = electId ? state.politicians[electId] : null;
  if (elect?.alive && !elect.retired) {
    return { error: reject("PRESIDENT_ELECT_AVAILABLE", electId ?? "missing") };
  }

  const nextRegularElection = regularElectionDate(
    world.presidentialCalendar,
    parseIsoDate(sourceElection.date).year + world.presidentialCalendar.intervalYears,
  );
  state.presidential.certifiedPresidentElectId = null;
  state.presidential.nextRegularElectionDate = nextRegularElection;
  const nextState = ensurePlannedPresidentialElection(state, world, nextRegularElection);
  ensurePresidentialNominationContests(state, world, nextState);
  if (
    !state.scheduler.events.some(
      (event) =>
        event.eventType === "PRESIDENTIAL_ELECTION_DUE" &&
        event.dueDate === nextRegularElection &&
        payloadElectionId(event.payload) === nextState.id,
    )
  ) {
    enqueueScheduled(state, {
      dueDate: nextRegularElection,
      eventType: "PRESIDENTIAL_ELECTION_DUE",
      payload: { electionId: nextState.id },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_PRESIDENTIAL_REGULAR",
    });
  }
  const vacancy = applyPresidentialVacancy(state, world, {
    reason: "president_elect_unable_to_assume",
    date: state.currentDate,
    commandId: args.commandId,
  });
  if (vacancy.error) return { error: vacancy.error };
  const resolved = pushHistory(state, {
    date: state.currentDate,
    type: "PRESIDENT_ELECT_VACANCY_RESOLVED",
    importance: 1,
    visibility: "public",
    actorIds: electId ? [electId] : [],
    entityIds: [sourceElection.id],
    payload: { sourceElectionId: sourceElection.id, nextRegularElection, specialElectionRequired: true },
    sourceScheduledEventId: args.scheduledEventId,
    sourceCommandId: args.commandId,
  });
  createDomainResolution(state, {
    sourceScheduledEventId: args.scheduledEventId,
    domainType: "presidential_assumption",
    date: state.currentDate,
    electionId: sourceElection.id,
    resultEventId: resolved.id,
    archiveElectionId: sourceElection.id,
    metadata: { presidentElectUnable: true },
  });
  return { events: [...vacancy.events, resolved] };
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
