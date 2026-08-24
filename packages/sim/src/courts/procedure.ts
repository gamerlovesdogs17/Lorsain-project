import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { JsonObject } from "../json.js";
import { addDays, addYears, compareIsoDate, type IsoDate } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import { enqueueScheduled, pushHistory } from "../scheduler.js";
import {
  activeTermsForPolitician,
  assumeOffice,
  canAssumeOffice,
  endTerm,
  occupyingTerms,
  officesAreIncompatible,
} from "../offices.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { currentPresidentialAuthorityId } from "../legislature/state.js";
import { changePartyMembership } from "../parties/membership.js";
import { applyPresidentialVacancy } from "../succession.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import { getAgentProfile } from "../agents/profile.js";
import {
  allocateCaseId,
  allocateConstitutionalGroundsId,
  allocateDecisionId,
  allocateImpeachmentId,
  allocateNominationId,
  allocateRecallId,
  confirmationYesNeeded,
  currentCourtJudgeIds,
  deriveCourtBench,
  impeachmentYesNeeded,
  recallReferralYesNeeded,
  vacantCourtSeatIds,
} from "./state.js";
import type {
  ConstitutionalGroundsRecord,
  CourtCase,
  CourtCaseType,
  CourtDisposition,
  CourtNomination,
  GroundsSourceKind,
  ImpeachmentGrounds,
  JudicialVoteChoice,
  PrecedentRecord,
} from "./types.js";
import { MAX_ACTIVE_COURT_CASES } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function event(
  state: SimState,
  type: string,
  actorIds: string[],
  entityIds: string[],
  payload: JsonObject,
  commandId: string | null,
  importance = 0.7,
): SimEvent {
  return pushHistory(state, {
    date: state.currentDate,
    type,
    importance,
    visibility: "public",
    actorIds,
    entityIds,
    payload,
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
}

export function courtStageRipe(state: SimState, ready: IsoDate): boolean {
  return compareIsoDate(monthStart(ready), monthStart(state.currentDate)) < 0;
}

function pendingKey(kind: string, targetId: string): string {
  return `${kind}:${targetId}`;
}

export function takePendingCourtVote(
  state: SimState,
  kind: "confirmation" | "judicial" | "impeachment" | "recall",
  targetId: string,
): string | null {
  const key = pendingKey(kind, targetId);
  const rec = state.constitutionalRuntime.pendingPlayerVotes[key];
  if (!rec) return null;
  delete state.constitutionalRuntime.pendingPlayerVotes[key];
  return rec.choice;
}

function storePlayerVote(
  state: SimState,
  kind: "confirmation" | "judicial" | "impeachment" | "recall",
  targetId: string,
  choice: string,
): void {
  state.constitutionalRuntime.pendingPlayerVotes[pendingKey(kind, targetId)] = {
    kind,
    targetId,
    choice,
  };
}

function requirePresident(
  world: KernelWorld,
  state: SimState,
  actorId: string,
): CommandError | null {
  if (currentPresidentialAuthorityId(world, state) !== actorId) {
    return reject("NOT_PRESIDENT", actorId);
  }
  return null;
}

function requireMp(world: KernelWorld, state: SimState, actorId: string): CommandError | null {
  if (!currentAssemblyMemberIds(world, state).includes(actorId)) {
    return reject("NOT_MP", actorId);
  }
  return null;
}

export function judicialEligibilityError(
  world: KernelWorld,
  state: SimState,
  nomineeId: string,
  seatOfficeId: string,
): CommandError | null {
  const pol = state.politicians[nomineeId];
  if (!pol) return reject("UNKNOWN_POLITICIAN", nomineeId);
  if (!pol.alive) return reject("POLITICIAN_DEAD", nomineeId);
  if (pol.retired) return reject("POLITICIAN_RETIRED", nomineeId);
  const office = world.offices[seatOfficeId];
  if (!office || office.kind !== "constitutional_court_justice") {
    return reject("NOT_COURT_SEAT", seatOfficeId);
  }
  if (occupyingTerms(state, seatOfficeId).some((t) => t.holderId === nomineeId)) {
    return reject("ALREADY_SEATED", nomineeId);
  }
  const held = activeTermsForPolitician(state, nomineeId);
  for (const term of held) {
    const other = world.offices[term.officeId];
    if (other?.kind === "military") {
      return reject("MILITARY_INCOMPATIBLE", nomineeId);
    }
    if (other?.kind === "constitutional_court_justice") {
      return reject("ALREADY_JUDGE", nomineeId);
    }
  }
  if (
    world.courtConstitution.renewable === false &&
    hasEverHeldSubstantiveCourtTerm(world, state, nomineeId)
  ) {
    return reject("COURT_TERM_NONRENEWABLE", nomineeId);
  }
  const profile = getAgentProfile(world, state, nomineeId);
  if (!profile) return reject("LEGAL_QUALIFICATION_REQUIRED", nomineeId);
  const explicitLegalBackground = profile.roleTypes.some((role) =>
    [
      "constitutional_court_justice",
      "judge",
      "appellate_judge",
      "prosecutor",
      "public_defender",
      "constitutional_lawyer",
      "legal_academic",
      "senior_lawyer",
    ].includes(role),
  );
  const publicLawQualification =
    profile.skills.legislation * 0.5 +
    profile.traits.institutionalism * 0.35 +
    profile.skills.negotiation * 0.15;
  const birthYear = profile.birthDate ? Number(profile.birthDate.slice(0, 4)) : null;
  const age = birthYear ? Number(state.currentDate.slice(0, 4)) - birthYear : null;
  if (age != null && age < 35) return reject("INSUFFICIENT_LEGAL_EXPERIENCE", `${nomineeId} is under 35`);
  if (!explicitLegalBackground && publicLawQualification < 0.62) {
    return reject("LEGAL_QUALIFICATION_REQUIRED", `${nomineeId} lacks a qualifying public legal record`);
  }
  return null;
}

function hasEverHeldSubstantiveCourtTerm(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): boolean {
  for (const term of Object.values(state.officeTerms)) {
    if (term.holderId !== politicianId) continue;
    if (term.holdingKind !== "substantive") continue;
    if (world.offices[term.officeId]?.kind === "constitutional_court_justice") return true;
  }
  return false;
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampLean(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

export function availableImpeachmentBases(
  world: KernelWorld,
  state: SimState,
): ConstitutionalGroundsRecord[] {
  const president = currentPresidentialAuthorityId(world, state);
  if (!president) return [];
  return Object.values(state.constitutionalRuntime.grounds)
    .filter((g) => g.status === "available" && g.public && g.targetPoliticianId === president)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function createConstitutionalGrounds(
  state: SimState,
  args: {
    targetPoliticianId: string;
    grounds: ImpeachmentGrounds;
    sourceKind: GroundsSourceKind;
    sourceId: string;
    evidenceStrength: number;
    severity: number;
    public?: boolean;
    metadata?: JsonObject;
  },
): ConstitutionalGroundsRecord {
  const id = allocateConstitutionalGroundsId(state);
  const rec: ConstitutionalGroundsRecord = {
    id,
    targetPoliticianId: args.targetPoliticianId,
    grounds: args.grounds,
    sourceKind: args.sourceKind,
    sourceId: args.sourceId,
    createdDate: state.currentDate,
    evidenceStrength: clampUnit(args.evidenceStrength),
    severity: clampUnit(args.severity),
    public: args.public !== false,
    status: "available",
    metadata: args.metadata ?? {},
  };
  state.constitutionalRuntime.grounds[id] = rec;
  return rec;
}

function prepareCourtAssumption(
  world: KernelWorld,
  state: SimState,
  nomineeId: string,
  seatOfficeId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const elig = judicialEligibilityError(world, state, nomineeId, seatOfficeId);
  if (elig) return { error: elig };
  const events: SimEvent[] = [];
  const target = world.offices[seatOfficeId]!;
  for (const term of activeTermsForPolitician(state, nomineeId)) {
    const other = world.offices[term.officeId];
    if (!other) continue;
    if (other.kind === "military" || other.kind === "constitutional_court_justice") continue;
    if (officesAreIncompatible(target, other)) {
      const ended = endTerm(state, term.id, state.currentDate, "court_incompatibility");
      if (ended) {
        events.push(
          event(
            state,
            "OFFICE_VACATED",
            [nomineeId],
            [term.officeId, ended.id],
            { reason: "court_incompatibility", officeId: term.officeId },
            commandId,
            0.55,
          ),
        );
      }
    }
  }
  const holder = state.politicians[nomineeId]!;
  if (target.noPartyMembershipWhileServing && holder.partyId != null) {
    const left = changePartyMembership(state, world, nomineeId, null, commandId);
    if ("error" in left) return { error: left.error };
    events.push(...left.events);
  }
  const assumeErr = canAssumeOffice(state, world, seatOfficeId, nomineeId, "substantive");
  if (assumeErr) return { error: assumeErr };
  return { events };
}

export function openVacancyNominations(
  world: KernelWorld,
  state: SimState,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  const open = new Set(
    Object.values(state.constitutionalRuntime.nominations)
      .filter((n) => n.status === "awaiting_nomination" || n.status === "pending_confirmation")
      .map((n) => n.seatOfficeId),
  );
  for (const seatOfficeId of vacantCourtSeatIds(world, state)) {
    if (open.has(seatOfficeId)) continue;
    const id = allocateNominationId(state);
    const rec: CourtNomination = {
      id,
      seatOfficeId,
      nomineeId: null,
      nominatorId: null,
      nominatedDate: null,
      status: "awaiting_nomination",
      stageReadyDate: state.currentDate,
      votes: {},
      yes: 0,
      no: 0,
      abstain: 0,
      voteId: null,
      metadata: {},
    };
    state.constitutionalRuntime.nominations[id] = rec;
    events.push(
      event(
        state,
        "COURT_VACANCY",
        [],
        [seatOfficeId, id],
        { seatOfficeId, nominationId: id },
        commandId,
        0.8,
      ),
    );
  }
  return events;
}

export function nominateConstitutionalJudge(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; nomineeId: string; seatOfficeId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const pres = requirePresident(world, state, args.actorId);
  if (pres) return { error: pres };
  const elig = judicialEligibilityError(world, state, args.nomineeId, args.seatOfficeId);
  if (elig) return { error: elig };
  if (occupyingTerms(state, args.seatOfficeId).length > 0) {
    return { error: reject("SEAT_OCCUPIED", args.seatOfficeId) };
  }
  let nomination = Object.values(state.constitutionalRuntime.nominations).find(
    (n) => n.seatOfficeId === args.seatOfficeId && n.status === "awaiting_nomination",
  );
  if (!nomination) {
    openVacancyNominations(world, state, commandId);
    nomination = Object.values(state.constitutionalRuntime.nominations).find(
      (n) => n.seatOfficeId === args.seatOfficeId && n.status === "awaiting_nomination",
    );
  }
  if (!nomination) return { error: reject("NO_VACANCY", args.seatOfficeId) };
  nomination.nomineeId = args.nomineeId;
  nomination.nominatorId = args.actorId;
  nomination.nominatedDate = state.currentDate;
  nomination.status = "pending_confirmation";
  nomination.stageReadyDate = state.currentDate;
  nomination.votes = {};
  return {
    events: [
      event(
        state,
        "JUDGE_NOMINATED",
        [args.actorId, args.nomineeId],
        [nomination.id, args.seatOfficeId],
        {
          nominationId: nomination.id,
          nomineeId: args.nomineeId,
          seatOfficeId: args.seatOfficeId,
        },
        commandId,
        0.85,
      ),
    ],
  };
}

export function castConfirmationVote(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; nominationId: string; choice: LegislativeVoteChoice },
): { error?: CommandError } {
  const mp = requireMp(world, state, args.actorId);
  if (mp) return { error: mp };
  const nom = state.constitutionalRuntime.nominations[args.nominationId];
  if (!nom || nom.status !== "pending_confirmation") {
    return { error: reject("UNKNOWN_NOMINATION", args.nominationId) };
  }
  if (args.actorId !== state.playerPoliticianId) {
    return {
      error: reject("PLAYER_AUTONOMY", "only the player stores a pending confirmation vote"),
    };
  }
  storePlayerVote(state, "confirmation", args.nominationId, args.choice);
  return {};
}

export function recordConfirmationVote(
  world: KernelWorld,
  state: SimState,
  args: { nominationId: string; votes: Record<string, LegislativeVoteChoice> },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const nom = state.constitutionalRuntime.nominations[args.nominationId];
  if (!nom || nom.status !== "pending_confirmation" || !nom.nomineeId) {
    return { error: reject("UNKNOWN_NOMINATION", args.nominationId) };
  }
  const needed = confirmationYesNeeded(world);
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(args.votes)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  nom.votes = { ...args.votes };
  nom.yes = yes;
  nom.no = no;
  nom.abstain = abstain;
  const passed = yes >= needed;
  const events: SimEvent[] = [];
  if (!passed) {
    nom.status = "rejected";
    events.push(
      event(
        state,
        "JUDGE_REJECTED",
        nom.nominatorId ? [nom.nominatorId, nom.nomineeId] : [nom.nomineeId],
        [nom.id, nom.seatOfficeId],
        { nominationId: nom.id, yes, no, abstain, needed },
        commandId,
        0.85,
      ),
    );
    return { events };
  }
  const prepared = prepareCourtAssumption(world, state, nom.nomineeId, nom.seatOfficeId, commandId);
  if ("error" in prepared) {
    nom.status = "rejected";
    events.push(
      event(
        state,
        "JUDGE_REJECTED",
        [nom.nomineeId],
        [nom.id],
        { nominationId: nom.id, reason: prepared.error.code },
        commandId,
        0.7,
      ),
    );
    return { events };
  }
  events.push(...prepared.events);
  const termYears =
    state.provincialRuntime.constitutionalRules.court_term_years?.value ??
    world.courtConstitution.termYears;
  const endDate = addYears(state.currentDate, termYears);
  const assumed = assumeOffice(state, world, {
    officeId: nom.seatOfficeId,
    holderId: nom.nomineeId,
    date: state.currentDate,
    accessionReason: "assembly_confirmation",
    holdingKind: "substantive",
    endDate,
    startKnown: true,
    sourceElectionId: null,
  });
  if ("error" in assumed) {
    nom.status = "rejected";
    return { error: assumed.error };
  }
  nom.status = "confirmed";
  enqueueScheduled(state, {
    dueDate: endDate,
    eventType: "OFFICE_TERM_END_DUE",
    payload: { officeId: nom.seatOfficeId, autoEnd: true },
    priority: 20,
    blocking: false,
    requiresResolution: false,
    source: "COURT_APPOINTMENT",
  });
  events.push(
    event(
      state,
      "JUDGE_CONFIRMED",
      nom.nominatorId ? [nom.nominatorId, nom.nomineeId] : [nom.nomineeId],
      [nom.id, nom.seatOfficeId, assumed.term.id],
      { nominationId: nom.id, yes, no, abstain, needed, termId: assumed.term.id },
      commandId,
      0.95,
    ),
  );
  return { events };
}

export type FileCaseArgs = {
  actorId: string;
  caseType: CourtCaseType;
  challengedKind: CourtCase["challengedKind"];
  challengedId: string;
  respondentId: string;
  constitutionalQuestion: string;
  constitutionalRule: string;
  meritsLean: number;
  expedited?: boolean;
};

export function activeCaseload(state: SimState): number {
  return Object.values(state.constitutionalRuntime.courtCases).filter(
    (c) => c.status === "filed" || c.status === "pending",
  ).length;
}

export function fileConstitutionalCase(
  world: KernelWorld,
  state: SimState,
  args: FileCaseArgs,
  commandId: string | null,
): { events: SimEvent[]; caseId: string } | { error: CommandError } {
  const actor = state.politicians[args.actorId];
  if (!actor || !actor.alive) return { error: reject("UNKNOWN_POLITICIAN", args.actorId) };
  if (activeCaseload(state) >= MAX_ACTIVE_COURT_CASES && args.caseType !== "IMPEACHMENT_JUDGMENT") {
    return { error: reject("CASELOAD", "Constitutional Court caseload is full") };
  }
  const judges = currentCourtJudgeIds(world, state);
  const id = allocateCaseId(state);
  const rec: CourtCase = {
    id,
    filedDate: state.currentDate,
    caseType: args.caseType,
    petitionerId: args.actorId,
    respondentId: args.respondentId,
    challengedKind: args.challengedKind,
    challengedId: args.challengedId,
    constitutionalQuestion: args.constitutionalQuestion,
    constitutionalRule: args.constitutionalRule,
    meritsLean: Math.max(-1, Math.min(1, args.meritsLean)),
    status: "pending",
    participatingJudgeIds: judges,
    votes: {},
    disposition: null,
    decisionId: null,
    decisionDate: null,
    stageReadyDate: state.currentDate,
    expedited: args.expedited === true,
    eventIds: [],
    metadata: {},
  };
  state.constitutionalRuntime.courtCases[id] = rec;
  const ev = event(
    state,
    "CASE_FILED",
    [args.actorId],
    [id, args.challengedId],
    {
      caseId: id,
      caseType: args.caseType,
      challengedId: args.challengedId,
      constitutionalQuestion: args.constitutionalQuestion,
    },
    commandId,
    args.expedited ? 0.9 : 0.7,
  );
  rec.eventIds.push(ev.id);
  return { events: [ev], caseId: id };
}

export function castJudicialVote(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; caseId: string; choice: JudicialVoteChoice },
): { error?: CommandError } {
  if (!currentCourtJudgeIds(world, state).includes(args.actorId)) {
    return { error: reject("NOT_JUDGE", args.actorId) };
  }
  const courtCase = state.constitutionalRuntime.courtCases[args.caseId];
  if (!courtCase || courtCase.status !== "pending") {
    return { error: reject("UNKNOWN_CASE", args.caseId) };
  }
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "only the player stores a pending judicial vote") };
  }
  storePlayerVote(state, "judicial", args.caseId, args.choice);
  return {};
}

export function similarPrecedent(state: SimState, courtCase: CourtCase): PrecedentRecord | null {
  const matches = Object.values(state.constitutionalRuntime.precedents)
    .filter(
      (p) =>
        p.caseType === courtCase.caseType && p.constitutionalRule === courtCase.constitutionalRule,
    )
    .sort((a, b) => (a.decisionDate < b.decisionDate ? 1 : -1));
  return matches[0] ?? null;
}

export function tallyJudicialDisposition(votes: Record<string, JudicialVoteChoice>): {
  uphold: number;
  invalidate: number;
  nonparticipation: number;
  disposition: CourtDisposition;
} {
  let uphold = 0;
  let invalidate = 0;
  let nonparticipation = 0;
  for (const choice of Object.values(votes)) {
    if (choice === "uphold") uphold += 1;
    else if (choice === "invalidate") invalidate += 1;
    else nonparticipation += 1;
  }
  const disposition: CourtDisposition = invalidate > uphold ? "INVALIDATE" : "UPHOLD";
  return { uphold, invalidate, nonparticipation, disposition };
}

function applyDisposition(
  world: KernelWorld,
  state: SimState,
  courtCase: CourtCase,
  disposition: CourtDisposition,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (disposition !== "INVALIDATE") return events;
  if (courtCase.challengedKind === "law") {
    const law = state.legislatureRuntime.enactedLaws[courtCase.challengedId];
    if (law) {
      law.operative = false;
      law.invalidatedByDecisionId = courtCase.decisionId;
      events.push(
        event(
          state,
          "LAW_INVALIDATED",
          [],
          [law.id, courtCase.id],
          { lawId: law.id, caseId: courtCase.id, title: law.title },
          commandId,
          0.95,
        ),
      );
    }
  } else if (courtCase.challengedKind === "regulation") {
    const reg = state.executiveRuntime.regulations[courtCase.challengedId];
    if (reg && reg.status === "active") {
      reg.status = "invalidated";
      events.push(
        event(
          state,
          "REGULATION_INVALIDATED",
          [],
          [reg.id, courtCase.id],
          { regulationId: reg.id, caseId: courtCase.id },
          commandId,
          0.9,
        ),
      );
    }
  } else if (courtCase.challengedKind === "emergency") {
    const emergency = state.executiveRuntime.emergencies[courtCase.challengedId];
    if (emergency && emergency.status === "active") {
      emergency.status = "terminated";
      events.push(
        event(
          state,
          "EMERGENCY_INVALIDATED",
          [],
          [emergency.id, courtCase.id],
          { emergencyId: emergency.id, caseId: courtCase.id },
          commandId,
          0.95,
        ),
      );
    }
  } else if (courtCase.challengedKind === "war_power") {
    const war = state.executiveRuntime.warPowers[courtCase.challengedId];
    if (war && (war.status === "unilateral" || war.status === "authorized")) {
      war.status = "expired";
      events.push(
        event(
          state,
          "WAR_POWER_INVALIDATED",
          [],
          [war.id, courtCase.id],
          { warPowerId: war.id, caseId: courtCase.id },
          commandId,
          0.95,
        ),
      );
    }
  } else if (courtCase.challengedKind === "provincial_law") {
    const bill = state.provincialRuntime.bills[courtCase.challengedId];
    if (bill && (bill.status === "signed" || bill.status === "override_passed")) {
      bill.status = "invalidated";
      events.push(
        event(
          state,
          "PROVINCIAL_LAW_INVALIDATED",
          [],
          [bill.id, bill.provinceId, courtCase.id],
          { billId: bill.id, provinceId: bill.provinceId, caseId: courtCase.id, title: bill.title },
          commandId,
          0.88,
        ),
      );
    }
  }
  maybeRecordImpeachmentBasisFromInvalidation(world, state, courtCase);
  return events;
}

function maybeRecordImpeachmentBasisFromInvalidation(
  world: KernelWorld,
  state: SimState,
  courtCase: CourtCase,
): void {
  if (courtCase.caseType === "IMPEACHMENT_JUDGMENT") return;
  if (courtCase.challengedKind === "law" || courtCase.challengedKind === "election") return;
  const president = currentPresidentialAuthorityId(world, state);
  if (!president) return;
  const already = Object.values(state.constitutionalRuntime.grounds).some(
    (g) => g.sourceId === courtCase.id && g.status !== "invalidated",
  );
  if (already) return;
  let actorId: string | null = null;
  let sourceKind: GroundsSourceKind = "court_finding";
  let grounds: ImpeachmentGrounds = "serious_constitutional_abuse";
  let evidenceStrength = 0.55;
  let severity = 0.55;
  if (courtCase.challengedKind === "emergency") {
    actorId =
      state.executiveRuntime.emergencies[courtCase.challengedId]?.declaredBy ??
      courtCase.respondentId;
    sourceKind = "invalidated_emergency";
    grounds = "serious_constitutional_abuse";
    evidenceStrength = 0.62;
    severity = 0.7;
  } else if (courtCase.challengedKind === "war_power") {
    actorId =
      state.executiveRuntime.warPowers[courtCase.challengedId]?.startedBy ?? courtCase.respondentId;
    sourceKind = "unconstitutional_war_power";
    grounds = "grave_unlawful_exercise_of_office";
    evidenceStrength = 0.68;
    severity = 0.78;
  } else if (courtCase.challengedKind === "executive_action") {
    actorId = courtCase.respondentId;
    sourceKind = "unconstitutional_executive";
    grounds = "grave_unlawful_exercise_of_office";
    evidenceStrength = 0.58;
    severity = 0.65;
  } else if (courtCase.challengedKind === "regulation") {
    const reg = state.executiveRuntime.regulations[courtCase.challengedId];
    if (!reg?.major) return;
    actorId = reg.issuerId;
    sourceKind = "court_finding";
    grounds = "grave_unlawful_exercise_of_office";
    evidenceStrength = 0.48;
    severity = 0.5;
  } else {
    return;
  }
  if (actorId !== president) return;
  createConstitutionalGrounds(state, {
    targetPoliticianId: president,
    grounds,
    sourceKind,
    sourceId: courtCase.id,
    evidenceStrength,
    severity,
    public: true,
    metadata: {
      challengedKind: courtCase.challengedKind,
      challengedId: courtCase.challengedId,
    },
  });
}

export function recordJudicialDecision(
  world: KernelWorld,
  state: SimState,
  args: { caseId: string; votes: Record<string, JudicialVoteChoice> },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const courtCase = state.constitutionalRuntime.courtCases[args.caseId];
  if (!courtCase || courtCase.status !== "pending") {
    return { error: reject("UNKNOWN_CASE", args.caseId) };
  }
  const tallied = tallyJudicialDisposition(args.votes);
  const decisionId = allocateDecisionId(state);
  courtCase.votes = { ...args.votes };
  courtCase.disposition = tallied.disposition;
  courtCase.decisionId = decisionId;
  courtCase.decisionDate = state.currentDate;
  courtCase.status = "decided";
  const majorityVote: JudicialVoteChoice =
    tallied.disposition === "UPHOLD" ? "uphold" : "invalidate";
  const dissentVote: JudicialVoteChoice =
    majorityVote === "uphold" ? "invalidate" : "uphold";
  const benchOrder = deriveCourtBench(world, state)
    .map((seat) => seat.holderId)
    .filter((id): id is string => id != null);
  const majorityAuthorId = benchOrder.find((id) => args.votes[id] === majorityVote) ?? null;
  const dissentAuthorId = benchOrder.find((id) => args.votes[id] === dissentVote) ?? null;
  const holding =
    tallied.disposition === "UPHOLD"
      ? "The challenged act remains in force."
      : "The challenged act is constitutionally invalid.";
  const majorityRationale =
    tallied.disposition === "UPHOLD"
      ? `The challenged authority is consistent with ${courtCase.constitutionalRule.replace(/_/g, " ")}.`
      : `The challenged authority exceeds the limits imposed by ${courtCase.constitutionalRule.replace(/_/g, " ")}.`;
  const majorityOpinion = `${holding} ${majorityRationale}`;
  const dissentingOpinion = dissentAuthorId
    ? tallied.disposition === "UPHOLD"
      ? "The dissent would invalidate the challenged act because the asserted authority exceeds the constitutional limit."
      : "The dissent would uphold the challenged act and defer to the responsible elected institution."
    : null;
  const decision = {
    id: decisionId,
    caseId: courtCase.id,
    decisionDate: state.currentDate,
    disposition: tallied.disposition,
    uphold: tallied.uphold,
    invalidate: tallied.invalidate,
    nonparticipation: tallied.nonparticipation,
    votes: { ...args.votes },
    constitutionalQuestion: courtCase.constitutionalQuestion,
    constitutionalRule: courtCase.constitutionalRule,
    caseType: courtCase.caseType,
    metadata: {
      majorityOpinion,
      majorityAuthorId,
      holding,
      majorityRationale,
      constitutionalProvision: courtCase.constitutionalRule.replace(/_/g, " "),
      ...(dissentingOpinion
        ? { dissentingOpinion, dissentAuthorId, dissentRationale: dissentingOpinion }
        : {}),
    },
  };
  state.constitutionalRuntime.courtDecisions[decisionId] = decision;
  state.constitutionalRuntime.precedents[decisionId] = {
    decisionId,
    caseId: courtCase.id,
    caseType: courtCase.caseType,
    constitutionalQuestion: courtCase.constitutionalQuestion,
    constitutionalRule: courtCase.constitutionalRule,
    disposition: tallied.disposition,
    decisionDate: state.currentDate,
    uphold: tallied.uphold,
    invalidate: tallied.invalidate,
  };
  const events: SimEvent[] = [
    event(
      state,
      "COURT_DECISION",
      Object.keys(args.votes).sort(),
      [courtCase.id, decisionId],
      {
        caseId: courtCase.id,
        decisionId,
        disposition: tallied.disposition,
        uphold: tallied.uphold,
        invalidate: tallied.invalidate,
        nonparticipation: tallied.nonparticipation,
        constitutionalQuestion: courtCase.constitutionalQuestion,
        caseType: courtCase.caseType,
      },
      commandId,
      0.95,
    ),
  ];
  events.push(...applyDisposition(world, state, courtCase, tallied.disposition, commandId));
  if (courtCase.caseType === "IMPEACHMENT_JUDGMENT") {
    const proceeding = Object.values(state.constitutionalRuntime.impeachments).find(
      (p) => p.caseId === courtCase.id,
    );
    if (proceeding) {
      if (tallied.disposition === "INVALIDATE") {
        proceeding.status = "removed";
        const vacated = applyPresidentialVacancy(state, world, {
          reason: "impeachment_removal",
          date: state.currentDate,
          commandId: commandId ?? "COURT",
        });
        if ("error" in vacated) return { error: vacated.error };
        events.push(...vacated.events);
        events.push(
          event(
            state,
            "PRESIDENT_REMOVED",
            [proceeding.targetId],
            [proceeding.id, courtCase.id],
            { proceedingId: proceeding.id, grounds: proceeding.grounds },
            commandId,
            1,
          ),
        );
      } else {
        proceeding.status = "rejected_by_court";
        events.push(
          event(
            state,
            "IMPEACHMENT_REJECTED",
            [proceeding.targetId],
            [proceeding.id, courtCase.id],
            { proceedingId: proceeding.id, stage: "court" },
            commandId,
            0.9,
          ),
        );
      }
    }
  }
  return { events };
}

export function introduceImpeachment(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; basisId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const mp = requireMp(world, state, args.actorId);
  if (mp) return { error: mp };
  const basis = state.constitutionalRuntime.grounds[args.basisId];
  if (!basis) return { error: reject("UNKNOWN_BASIS", args.basisId) };
  if (basis.status !== "available") return { error: reject("BASIS_NOT_ACTIONABLE", args.basisId) };
  if (!basis.public) return { error: reject("BASIS_NOT_PUBLIC", args.basisId) };
  const president = currentPresidentialAuthorityId(world, state);
  if (!president || basis.targetPoliticianId !== president) {
    return { error: reject("NOT_PRESIDENT_TARGET", basis.targetPoliticianId) };
  }
  const open = Object.values(state.constitutionalRuntime.impeachments).some(
    (p) =>
      p.targetId === basis.targetPoliticianId &&
      (p.status === "introduced" ||
        p.status === "assembly_pending" ||
        p.status === "court_pending"),
  );
  if (open) return { error: reject("IMPEACHMENT_OPEN", basis.targetPoliticianId) };
  basis.status = "consumed";
  const id = allocateImpeachmentId(state);
  state.constitutionalRuntime.impeachments[id] = {
    id,
    targetId: basis.targetPoliticianId,
    sponsorId: args.actorId,
    grounds: basis.grounds,
    basisId: basis.id,
    evidenceStrength: basis.evidenceStrength,
    severity: basis.severity,
    introducedDate: state.currentDate,
    status: "assembly_pending",
    stageReadyDate: state.currentDate,
    votes: {},
    yes: 0,
    no: 0,
    abstain: 0,
    caseId: null,
    metadata: { sourceKind: basis.sourceKind, sourceId: basis.sourceId },
  };
  return {
    events: [
      event(
        state,
        "IMPEACHMENT_INTRODUCED",
        [args.actorId, basis.targetPoliticianId],
        [id, basis.id],
        {
          proceedingId: id,
          basisId: basis.id,
          grounds: basis.grounds,
          evidenceStrength: basis.evidenceStrength,
          severity: basis.severity,
        },
        commandId,
        0.95,
      ),
    ],
  };
}

export function castImpeachmentVote(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; proceedingId: string; choice: LegislativeVoteChoice },
): { error?: CommandError } {
  const mp = requireMp(world, state, args.actorId);
  if (mp) return { error: mp };
  const rec = state.constitutionalRuntime.impeachments[args.proceedingId];
  if (!rec || rec.status !== "assembly_pending") {
    return { error: reject("UNKNOWN_IMPEACHMENT", args.proceedingId) };
  }
  if (args.actorId !== state.playerPoliticianId) {
    return {
      error: reject("PLAYER_AUTONOMY", "only the player stores a pending impeachment vote"),
    };
  }
  storePlayerVote(state, "impeachment", args.proceedingId, args.choice);
  return {};
}

export function recordImpeachmentVote(
  world: KernelWorld,
  state: SimState,
  args: { proceedingId: string; votes: Record<string, LegislativeVoteChoice> },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const rec = state.constitutionalRuntime.impeachments[args.proceedingId];
  if (!rec || rec.status !== "assembly_pending") {
    return { error: reject("UNKNOWN_IMPEACHMENT", args.proceedingId) };
  }
  const needed = impeachmentYesNeeded(world);
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(args.votes)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  rec.votes = { ...args.votes };
  rec.yes = yes;
  rec.no = no;
  rec.abstain = abstain;
  if (yes < needed) {
    rec.status = "assembly_failed";
    return {
      events: [
        event(
          state,
          "IMPEACHMENT_REJECTED",
          [rec.targetId],
          [rec.id],
          { proceedingId: rec.id, yes, no, abstain, needed, stage: "assembly" },
          commandId,
          0.85,
        ),
      ],
    };
  }
  rec.status = "court_pending";
  const similar = similarPrecedent(state, {
    id: rec.id,
    filedDate: rec.introducedDate,
    caseType: "IMPEACHMENT_JUDGMENT",
    petitionerId: rec.sponsorId,
    respondentId: rec.targetId,
    challengedKind: "impeachment",
    challengedId: rec.id,
    constitutionalQuestion: `Whether the President should be removed for ${rec.grounds.replace(/_/g, " ")}`,
    constitutionalRule: "impeachment_judgment",
    meritsLean: 0,
    status: "pending",
    participatingJudgeIds: [],
    votes: {},
    disposition: null,
    decisionId: null,
    decisionDate: null,
    stageReadyDate: rec.stageReadyDate,
    expedited: true,
    eventIds: [],
    metadata: {},
  });
  let meritsLean = rec.evidenceStrength * 0.5 + rec.severity * 0.32 - 0.12;
  if (similar) meritsLean += similar.disposition === "INVALIDATE" ? 0.12 : -0.12;
  const filed = fileConstitutionalCase(
    world,
    state,
    {
      actorId: rec.sponsorId,
      caseType: "IMPEACHMENT_JUDGMENT",
      challengedKind: "impeachment",
      challengedId: rec.id,
      respondentId: rec.targetId,
      constitutionalQuestion: `Whether the President should be removed for ${rec.grounds.replace(/_/g, " ")}`,
      constitutionalRule: "impeachment_judgment",
      meritsLean: clampLean(meritsLean),
      expedited: true,
    },
    commandId,
  );
  if ("error" in filed) return { error: filed.error };
  rec.caseId = filed.caseId;
  return {
    events: [
      event(
        state,
        "PRESIDENT_IMPEACHED",
        [rec.targetId],
        [rec.id, filed.caseId],
        { proceedingId: rec.id, yes, no, abstain, needed, caseId: filed.caseId },
        commandId,
        1,
      ),
      ...filed.events,
    ],
  };
}

export function introduceRecallReferral(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; targetId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const mp = requireMp(world, state, args.actorId);
  if (mp) return { error: mp };
  const president = currentPresidentialAuthorityId(world, state);
  const targetId = args.targetId ?? president;
  if (!targetId || targetId !== president)
    return { error: reject("NOT_PRESIDENT_TARGET", targetId ?? "") };
  const open = Object.values(state.constitutionalRuntime.recalls).some(
    (p) =>
      p.targetId === targetId && (p.status === "referral_pending" || p.status === "vote_scheduled"),
  );
  if (open) return { error: reject("RECALL_OPEN", targetId) };
  const id = allocateRecallId(state);
  state.constitutionalRuntime.recalls[id] = {
    id,
    targetId,
    sponsorId: args.actorId,
    introducedDate: state.currentDate,
    status: "referral_pending",
    stageReadyDate: state.currentDate,
    votes: {},
    yes: 0,
    no: 0,
    abstain: 0,
    nationalVoteDate: null,
    nationalYesShare: null,
    metadata: {},
  };
  return {
    events: [
      event(
        state,
        "RECALL_INTRODUCED",
        [args.actorId, targetId],
        [id],
        { proceedingId: id, stage: "introduced" },
        commandId,
        0.8,
      ),
    ],
  };
}

export function castRecallReferralVote(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; proceedingId: string; choice: LegislativeVoteChoice },
): { error?: CommandError } {
  const mp = requireMp(world, state, args.actorId);
  if (mp) return { error: mp };
  const rec = state.constitutionalRuntime.recalls[args.proceedingId];
  if (!rec || rec.status !== "referral_pending") {
    return { error: reject("UNKNOWN_RECALL", args.proceedingId) };
  }
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "only the player stores a pending recall vote") };
  }
  storePlayerVote(state, "recall", args.proceedingId, args.choice);
  return {};
}

export function recordRecallReferralVote(
  world: KernelWorld,
  state: SimState,
  args: { proceedingId: string; votes: Record<string, LegislativeVoteChoice> },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const rec = state.constitutionalRuntime.recalls[args.proceedingId];
  if (!rec || rec.status !== "referral_pending") {
    return { error: reject("UNKNOWN_RECALL", args.proceedingId) };
  }
  const needed = recallReferralYesNeeded(world);
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(args.votes)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  rec.votes = { ...args.votes };
  rec.yes = yes;
  rec.no = no;
  rec.abstain = abstain;
  if (yes < needed) {
    rec.status = "referral_failed";
    return {
      events: [
        event(
          state,
          "RECALL_FAILED",
          [rec.targetId],
          [rec.id],
          { proceedingId: rec.id, stage: "referral", yes, no, abstain, needed },
          commandId,
          0.8,
        ),
      ],
    };
  }
  rec.status = "vote_scheduled";
  rec.nationalVoteDate = addDays(state.currentDate, world.courtConstitution.recallVoteDays);
  return {
    events: [
      event(
        state,
        "RECALL_REFERRED",
        [rec.targetId],
        [rec.id],
        {
          proceedingId: rec.id,
          stage: "national_vote",
          yes,
          no,
          abstain,
          needed,
          nationalVoteDate: rec.nationalVoteDate,
        },
        commandId,
        0.9,
      ),
    ],
  };
}

export function nationalRecallYesShare(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
): number {
  const standing = state.candidateStanding[presidentId];
  const favorability = standing?.favorability ?? 0;
  const partyId = state.politicians[presidentId]?.partyId ?? null;
  const pub = partyId ? world.partyPublicIdeology[partyId] : null;
  const blocs = Object.values(world.voterBlocs);
  if (blocs.length === 0) {
    return Math.max(0.05, Math.min(0.95, 0.5 - favorability * 0.35));
  }
  let yes = 0;
  let total = 0;
  for (const bloc of blocs) {
    let gap = 0;
    if (pub) {
      gap += Math.abs((bloc.ideology.economic ?? 0) - (pub.economic ?? 0));
      gap += Math.abs((bloc.ideology.social ?? 0) - (pub.social ?? 0));
      gap += Math.abs((bloc.ideology.authority ?? 0) - (pub.authority ?? 0));
      gap /= 3;
    }
    const habit = partyId ? (bloc.partyHabit[partyId] ?? 0) : 0;
    const pYes = Math.max(
      0.05,
      Math.min(0.95, 0.48 - favorability * 0.28 + gap * 0.22 - habit * 0.12),
    );
    const w = bloc.weight * (bloc.turnoutPropensity || 1);
    yes += w * pYes;
    total += w;
  }
  return total > 0 ? yes / total : 0.5;
}

export function resolveNationalRecall(
  world: KernelWorld,
  state: SimState,
  proceedingId: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const rec = state.constitutionalRuntime.recalls[proceedingId];
  if (!rec || rec.status !== "vote_scheduled" || !rec.nationalVoteDate) {
    return { error: reject("UNKNOWN_RECALL", proceedingId) };
  }
  if (compareIsoDate(state.currentDate, rec.nationalVoteDate) < 0) {
    return { error: reject("RECALL_NOT_RIPE", proceedingId) };
  }
  const share = nationalRecallYesShare(world, state, rec.targetId);
  rec.nationalYesShare = share;
  const events: SimEvent[] = [];
  if (share > 0.5) {
    rec.status = "succeeded";
    const vacated = applyPresidentialVacancy(state, world, {
      reason: "national_recall",
      date: state.currentDate,
      commandId: commandId ?? "COURT",
    });
    if ("error" in vacated) return { error: vacated.error };
    events.push(...vacated.events);
    events.push(
      event(
        state,
        "RECALL_SUCCEEDED",
        [rec.targetId],
        [rec.id],
        { proceedingId: rec.id, yesShare: share },
        commandId,
        1,
      ),
    );
  } else {
    rec.status = "failed";
    events.push(
      event(
        state,
        "RECALL_FAILED",
        [rec.targetId],
        [rec.id],
        { proceedingId: rec.id, stage: "national_vote", yesShare: share },
        commandId,
        0.85,
      ),
    );
  }
  return { events };
}

export function caseTitle(courtCase: CourtCase): string {
  const kind = courtCase.caseType.replace(/_/g, " ").toLowerCase();
  return `${kind}: ${courtCase.constitutionalQuestion}`;
}
