import {
  addDays,
  compareIsoDate,
  daysBetween,
  presidentialAssumptionDate,
  type IsoDate,
} from "./calendar.js";
import {
  activeTermsForPolitician,
  assumeOffice,
  canAssumeOffice,
  currentHolderIds,
  endTerm,
  occupyingTerms,
  shouldSuspendWhenActingPresident,
  suspendTerm,
} from "./offices.js";
import { enqueueScheduled, pushHistory } from "./scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "./types.js";

function unavailable(state: SimState, id: string): boolean {
  const p = state.politicians[id];
  return !p || !p.alive || p.retired;
}

export function pickActingPresident(
  state: SimState,
  world: KernelWorld,
): { politicianId: string; fromOfficeId: string } | null {
  for (const officeId of world.successionOfficeIds) {
    for (const holderId of currentHolderIds(state, officeId, "substantive")) {
      if (!unavailable(state, holderId)) {
        return { politicianId: holderId, fromOfficeId: officeId };
      }
    }
  }
  return null;
}

export function planPresidentialVacancy(
  state: SimState,
  world: KernelWorld,
  args: { reason: string; date: IsoDate; presidentElectId?: string },
):
  | {
      actingId: string;
      fromOffice: string;
      presTerms: ReturnType<typeof occupyingTerms>;
    }
  | { error: CommandError } {
  const presTerms = occupyingTerms(state, "OFFICE_PRESIDENT");
  if (presTerms.length === 0) {
    return { error: { code: "NO_PRESIDENT", message: "No presidential term to vacate" } };
  }
  if (args.presidentElectId) {
    if (!state.politicians[args.presidentElectId]) {
      return {
        error: { code: "UNKNOWN_POLITICIAN", message: args.presidentElectId },
      };
    }
  }
  const elect = args.presidentElectId ?? state.presidential.certifiedPresidentElectId;
  const assumption = presidentialAssumptionDate(
    state.presidential.nextRegularElectionDate,
    world.presidentialCalendar,
  );
  const beforeAssumption = compareIsoDate(args.date, assumption) < 0;

  let actingId: string | null = null;
  let fromOffice: string | null = null;
  if (elect && beforeAssumption) {
    if (unavailable(state, elect)) {
      return {
        error: {
          code: "UNAVAILABLE_PRESIDENT_ELECT",
          message: `${elect} cannot serve as acting president`,
        },
      };
    }
    actingId = elect;
    fromOffice = "president_elect";
  } else {
    const picked = pickActingPresident(state, world);
    if (picked) {
      actingId = picked.politicianId;
      fromOffice = picked.fromOfficeId;
    }
  }
  if (!actingId || !fromOffice) {
    return { error: { code: "NO_SUCCESSOR", message: "No available acting successor" } };
  }
  const assumeErr = canAssumeOffice(state, world, "OFFICE_PRESIDENT", actingId, "acting", {
    ignoreOfficeCapacity: true,
  });
  if (assumeErr) return { error: assumeErr };
  return { actingId, fromOffice, presTerms };
}

export function applyPresidentialVacancy(
  state: SimState,
  world: KernelWorld,
  args: { reason: string; date: IsoDate; commandId: string; presidentElectId?: string },
): { events: SimEvent[]; error?: CommandError } {
  const plan = planPresidentialVacancy(state, world, args);
  if ("error" in plan) return { events: [], error: plan.error };

  const events: SimEvent[] = [];
  const { actingId, fromOffice, presTerms } = plan;

  if (args.presidentElectId) {
    state.presidential.certifiedPresidentElectId = args.presidentElectId;
  }

  for (const t of presTerms) {
    const ended = endTerm(state, t.id, args.date, args.reason);
    if (ended) {
      events.push(
        pushHistory(state, {
          date: args.date,
          type: "OFFICE_TERM_ENDED",
          importance: 0.9,
          visibility: "public",
          actorIds: [ended.holderId],
          entityIds: [ended.officeId, ended.id],
          payload: { reason: args.reason, holdingKind: ended.holdingKind },
          sourceScheduledEventId: null,
          sourceCommandId: args.commandId,
        }),
      );
    }
  }

  for (const t of activeTermsForPolitician(state, actingId)) {
    const office = world.offices[t.officeId];
    if (!office || !shouldSuspendWhenActingPresident(office)) continue;
    const suspended = suspendTerm(state, t.id);
    if ("error" in suspended) continue;
    events.push(
      pushHistory(state, {
        date: args.date,
        type: "OFFICE_DUTIES_SUSPENDED",
        importance: 0.6,
        visibility: "public",
        actorIds: [actingId],
        entityIds: [t.officeId, t.id],
        payload: { reason: "acting_president", fromOffice },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  }

  const assumed = assumeOffice(state, world, {
    officeId: "OFFICE_PRESIDENT",
    holderId: actingId,
    date: args.date,
    accessionReason:
      fromOffice === "president_elect" ? "president_elect_acting" : "succession_acting",
    holdingKind: "acting",
    endDate: null,
    startKnown: true,
    sourceElectionId: null,
  });
  if ("error" in assumed) return { events, error: assumed.error };

  events.push(
    pushHistory(state, {
      date: args.date,
      type: "ACTING_PRESIDENT_ASSUMED",
      importance: 0.95,
      visibility: "public",
      actorIds: [actingId],
      entityIds: ["OFFICE_PRESIDENT", assumed.term.id],
      payload: {
        fromOffice,
        electedTermConsumed: false,
        withinDays: fromOffice === "president_elect" ? world.presidentElectActingWithinDays : 0,
      },
      sourceScheduledEventId: null,
      sourceCommandId: args.commandId,
    }),
  );

  const daysLeft = daysBetween(args.date, state.presidential.nextRegularElectionDate);
  if (daysLeft > world.specialElectionMoreThanDays) {
    const deadline = addDays(args.date, world.specialElectionWithinDays);
    events.push(
      pushHistory(state, {
        date: args.date,
        type: "SPECIAL_PRESIDENTIAL_ELECTION_REQUIRED",
        importance: 0.9,
        visibility: "public",
        actorIds: [],
        entityIds: ["OFFICE_PRESIDENT"],
        payload: {
          vacancyDate: args.date,
          deadline,
          mustOccurWithinDays: world.specialElectionWithinDays,
          remainderOfRegularTerm: true,
          calendarDoesNotReset: true,
          notes:
            "Deadline only. The election domain chooses the lawful election date on or before this deadline.",
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
    const queued = enqueueScheduled(state, {
      dueDate: deadline,
      eventType: "SPECIAL_PRESIDENTIAL_ELECTION_DEADLINE",
      payload: { vacancyDate: args.date, deadline },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "RULE_PRESIDENTIAL_VACANCY",
    });
    if ("error" in queued) return { events, error: queued.error };
  } else {
    events.push(
      pushHistory(state, {
        date: args.date,
        type: "SPECIAL_PRESIDENTIAL_ELECTION_NOT_REQUIRED",
        importance: 0.7,
        visibility: "public",
        actorIds: [],
        entityIds: ["OFFICE_PRESIDENT"],
        payload: {
          daysUntilRegularElection: daysLeft,
          threshold: world.specialElectionMoreThanDays,
        },
        sourceScheduledEventId: null,
        sourceCommandId: args.commandId,
      }),
    );
  }

  return { events };
}
