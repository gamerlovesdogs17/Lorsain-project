import { addMonths, compareIsoDate, type IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import {
  finalizePresidentialField,
  syncNominationWinnerToElection,
} from "../elections/presidential.js";
import { applyQualification, countableCandidateIds } from "../parties/nominations.js";
import {
  populateRuntimePresidentialCandidateFields,
  presidentialNominationContestsForElection,
} from "../parties/state.js";
import {
  cancelPartyContest,
  openPartyContest,
  resolvePartyContest,
  withdrawCandidacy,
} from "../parties/contests.js";
import {
  reconcileCampaignsAfterCandidacyWithdrawal,
  transitionNominationToGeneral,
} from "./actions.js";
import { monthStart } from "./effects.js";

/** Operational nomination calendar offsets from the presidential election date. Not constitutional canon. */
export const NOMINATION_CALENDAR = {
  openMonthsBeforeElection: 9,
  qualifyMonthsBeforeElection: 2,
  resolveMonthsBeforeElection: 2,
  fieldFinalizeMonthsBeforeElection: 1,
} as const;

export type NominationCalendarDates = {
  open: IsoDate;
  qualify: IsoDate;
  resolve: IsoDate;
  fieldFinalize: IsoDate;
};

export function presidentialElectionDate(state: SimState): IsoDate | null {
  return currentPresidentialElection(state)?.date ?? null;
}

export function currentPresidentialElection(state: SimState) {
  return (
    Object.values(state.elections)
      .filter(
        (e) =>
          e.type === "presidential" &&
          e.status !== "resolved" &&
          e.status !== "cancelled" &&
          compareIsoDate(e.date, state.currentDate) >= 0,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function nominationCalendarDates(electionDate: IsoDate): NominationCalendarDates {
  return {
    open: monthStart(addMonths(electionDate, -NOMINATION_CALENDAR.openMonthsBeforeElection)),
    qualify: monthStart(addMonths(electionDate, -NOMINATION_CALENDAR.qualifyMonthsBeforeElection)),
    resolve: monthStart(addMonths(electionDate, -NOMINATION_CALENDAR.resolveMonthsBeforeElection)),
    fieldFinalize: monthStart(
      addMonths(electionDate, -NOMINATION_CALENDAR.fieldFinalizeMonthsBeforeElection),
    ),
  };
}

export function monthReached(current: IsoDate, gate: IsoDate): boolean {
  return compareIsoDate(monthStart(current), gate) >= 0;
}

function nominationContests(state: SimState, electionId: string) {
  return presidentialNominationContestsForElection(state, electionId);
}

function closeNominationCampaigns(state: SimState, contestId: string): void {
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.contestId !== contestId || campaign.type !== "presidential_nomination") continue;
    if (campaign.status !== "active" && campaign.status !== "exploring") continue;
    campaign.status = "lost";
    campaign.endedDate = state.currentDate;
  }
}

function failUnqualifiedDeclared(
  state: SimState,
  contestId: string,
  commandId: string,
): SimEvent[] {
  const contest = state.partyContests[contestId];
  if (!contest) return [];
  const events: SimEvent[] = [];
  const ids = Object.values(contest.entries)
    .filter((e) => e.status === "declared")
    .map((e) => e.politicianId)
    .sort();
  for (const politicianId of ids) {
    const withdrawn = withdrawCandidacy(state, contestId, politicianId, commandId);
    if (!("error" in withdrawn)) events.push(...withdrawn.events);
    events.push(
      ...reconcileCampaignsAfterCandidacyWithdrawal(state, contestId, politicianId, commandId),
    );
  }
  return events;
}

function allNominationProcessesTerminal(state: SimState, electionId: string): boolean {
  const contests = nominationContests(state, electionId);
  return contests.length > 0 && contests.every(
    (c) => c.status === "resolved" || c.status === "cancelled",
  );
}

export function openDueNominationContests(
  state: SimState,
  world: KernelWorld,
  commandId: string,
): SimEvent[] {
  const electionDate = presidentialElectionDate(state);
  const election = currentPresidentialElection(state);
  if (!electionDate || !election) return [];
  const cal = nominationCalendarDates(electionDate);
  if (!monthReached(state.currentDate, cal.open)) return [];
  populateRuntimePresidentialCandidateFields(state, world, election);
  const events: SimEvent[] = [];
  for (const contest of nominationContests(state, election.id)) {
    if (contest.status !== "planned") continue;
    const out = openPartyContest(state, contest.id, commandId);
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

export function closeQualificationIfDue(
  state: SimState,
  world: KernelWorld,
  commandId: string,
): SimEvent[] {
  const electionDate = presidentialElectionDate(state);
  const election = currentPresidentialElection(state);
  if (!electionDate || !election) return [];
  const cal = nominationCalendarDates(electionDate);
  if (!monthReached(state.currentDate, cal.qualify)) return [];
  const events: SimEvent[] = [];
  for (const contest of nominationContests(state, election.id)) {
    if (contest.status === "resolved" || contest.status === "cancelled") continue;
    if (contest.status === "planned") continue;
    const qErr = applyQualification(world, state, contest);
    if (qErr) continue;
    events.push(...failUnqualifiedDeclared(state, contest.id, commandId));
  }
  return events;
}

export function resolveDueNominationContests(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const electionDate = presidentialElectionDate(state);
  const election = currentPresidentialElection(state);
  if (!electionDate || !election) return [];
  const cal = nominationCalendarDates(electionDate);
  if (!monthReached(state.currentDate, cal.resolve)) return [];
  const events: SimEvent[] = [];
  for (const contest of nominationContests(state, election.id)) {
    const live = state.partyContests[contest.id];
    if (!live || live.status === "resolved" || live.status === "cancelled") continue;
    if (live.status === "planned") {
      const opened = openPartyContest(state, live.id, commandId);
      if (!("error" in opened)) events.push(...opened.events);
    }
    const current = state.partyContests[contest.id];
    if (!current || current.status === "resolved" || current.status === "cancelled") continue;
    const qErr = applyQualification(world, state, current);
    if (qErr) {
      const cancelled = cancelPartyContest(state, current.id, commandId);
      if (!("error" in cancelled)) events.push(...cancelled.events);
      closeNominationCampaigns(state, current.id);
      continue;
    }
    const qualified = countableCandidateIds(world, state, current);
    if (qualified.length < 1) {
      const cancelled = cancelPartyContest(state, current.id, commandId);
      if (!("error" in cancelled)) events.push(...cancelled.events);
      closeNominationCampaigns(state, current.id);
      continue;
    }
    const resolved = resolvePartyContest(state, world, current.id, rng, commandId);
    if ("error" in resolved) {
      const cancelled = cancelPartyContest(state, current.id, commandId);
      if (!("error" in cancelled)) events.push(...cancelled.events);
      closeNominationCampaigns(state, current.id);
      continue;
    }
    events.push(...resolved.events);
    syncNominationWinnerToElection(state, current.id);
    events.push(...transitionNominationToGeneral(state, world, current.id, commandId));
  }
  return events;
}

export function finalizePresidentialFieldIfDue(state: SimState, world: KernelWorld): SimEvent[] {
  const electionDate = presidentialElectionDate(state);
  const election = currentPresidentialElection(state);
  if (!electionDate || !election) return [];
  const cal = nominationCalendarDates(electionDate);
  if (!monthReached(state.currentDate, cal.fieldFinalize)) return [];
  if (!allNominationProcessesTerminal(state, election.id)) return [];
  if (!election || election.fieldFinalized) return [];
  finalizePresidentialField(state, world, election.id);
  return [];
}

export function processNominationCalendar(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  events.push(...closeQualificationIfDue(state, world, commandId));
  events.push(...resolveDueNominationContests(state, world, rng, commandId));
  events.push(...finalizePresidentialFieldIfDue(state, world));
  return events;
}
