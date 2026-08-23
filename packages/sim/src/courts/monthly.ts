import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { currentAssemblyMemberIds, currentPresidentialAuthorityId } from "../legislature/state.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import {
  activeCaseload,
  courtStageRipe,
  fileConstitutionalCase,
  nominateConstitutionalJudge,
  openVacancyNominations,
  recordConfirmationVote,
  recordImpeachmentVote,
  recordJudicialDecision,
  recordRecallReferralVote,
  resolveNationalRecall,
  takePendingCourtVote,
} from "./procedure.js";
import {
  chooseConfirmationVote,
  chooseImpeachmentVote,
  chooseJudgeNominee,
  chooseJudicialVote,
  chooseRecallReferralVote,
  npcShouldFileLawReview,
} from "./decisions.js";
import { currentCourtJudgeIds } from "./state.js";
import type { JudicialVoteChoice } from "./types.js";
import { MAX_ACTIVE_COURT_CASES } from "./types.js";

function tallyAssembly(
  mps: string[],
  playerId: string,
  pending: string | null,
  choose: (id: string) => LegislativeVoteChoice,
): Record<string, LegislativeVoteChoice> {
  const votes: Record<string, LegislativeVoteChoice> = {};
  for (const id of mps) {
    if (id === playerId) {
      votes[id] =
        pending === "yes" || pending === "no" || pending === "abstain" ? pending : "abstain";
      continue;
    }
    votes[id] = choose(id);
  }
  return votes;
}

function nominationWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  events.push(...openVacancyNominations(world, state, commandId));
  const president = currentPresidentialAuthorityId(world, state);
  if (president && president !== state.playerPoliticianId) {
    const awaiting = Object.values(state.constitutionalRuntime.nominations)
      .filter((n) => n.status === "awaiting_nomination")
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const slot = awaiting[0];
    if (slot) {
      const nominee = chooseJudgeNominee(world, state, president, slot.seatOfficeId, rng);
      if (nominee) {
        const out = nominateConstitutionalJudge(
          world,
          state,
          { actorId: president, nomineeId: nominee, seatOfficeId: slot.seatOfficeId },
          commandId,
        );
        if (!("error" in out)) events.push(...out.events);
      }
    }
  }
  const mps = currentAssemblyMemberIds(world, state);
  const ripe = Object.values(state.constitutionalRuntime.nominations)
    .filter(
      (n) =>
        n.status === "pending_confirmation" &&
        n.nomineeId &&
        courtStageRipe(state, n.stageReadyDate),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const nom = ripe[0];
  if (nom && nom.nomineeId && mps.length > 0) {
    const pending = mps.includes(state.playerPoliticianId)
      ? takePendingCourtVote(state, "confirmation", nom.id)
      : null;
    const votes = tallyAssembly(mps, state.playerPoliticianId, pending, (id) =>
      chooseConfirmationVote(world, state, id, nom.nomineeId!, rng),
    );
    const out = recordConfirmationVote(world, state, { nominationId: nom.id, votes }, commandId);
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

function docketWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const judges = currentCourtJudgeIds(world, state);
  const pending = Object.values(state.constitutionalRuntime.courtCases)
    .filter((c) => c.status === "pending" && courtStageRipe(state, c.stageReadyDate))
    .sort((a, b) => {
      if (a.expedited !== b.expedited) return a.expedited ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  const courtCase = pending[0];
  if (!courtCase || judges.length === 0) return events;
  const playerPending = judges.includes(state.playerPoliticianId)
    ? takePendingCourtVote(state, "judicial", courtCase.id)
    : null;
  const votes: Record<string, JudicialVoteChoice> = {};
  for (const id of judges) {
    if (id === state.playerPoliticianId) {
      votes[id] =
        playerPending === "uphold" ||
        playerPending === "invalidate" ||
        playerPending === "nonparticipation"
          ? playerPending
          : "nonparticipation";
      continue;
    }
    votes[id] = chooseJudicialVote(world, state, id, courtCase, rng);
  }
  const out = recordJudicialDecision(world, state, { caseId: courtCase.id, votes }, commandId);
  if (!("error" in out)) events.push(...out.events);
  return events;
}

function assemblyProceedings(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  const impeach = Object.values(state.constitutionalRuntime.impeachments)
    .filter((p) => p.status === "assembly_pending" && courtStageRipe(state, p.stageReadyDate))
    .sort((a, b) => a.stageReadyDate.localeCompare(b.stageReadyDate) || a.introducedDate.localeCompare(b.introducedDate) || a.id.localeCompare(b.id))[0];
  if (impeach && mps.length > 0) {
    const pending = mps.includes(state.playerPoliticianId)
      ? takePendingCourtVote(state, "impeachment", impeach.id)
      : null;
    const votes = tallyAssembly(mps, state.playerPoliticianId, pending, (id) =>
      chooseImpeachmentVote(world, state, id, impeach, rng),
    );
    const out = recordImpeachmentVote(world, state, { proceedingId: impeach.id, votes }, commandId);
    if (!("error" in out)) events.push(...out.events);
  }
  const recall = Object.values(state.constitutionalRuntime.recalls)
    .filter((p) => p.status === "referral_pending" && courtStageRipe(state, p.stageReadyDate))
    .sort((a, b) => a.stageReadyDate.localeCompare(b.stageReadyDate) || a.introducedDate.localeCompare(b.introducedDate) || a.id.localeCompare(b.id))[0];
  if (recall && mps.length > 0) {
    const pending = mps.includes(state.playerPoliticianId)
      ? takePendingCourtVote(state, "recall", recall.id)
      : null;
    const votes = tallyAssembly(mps, state.playerPoliticianId, pending, (id) =>
      chooseRecallReferralVote(world, state, id, recall.targetId, rng),
    );
    const out = recordRecallReferralVote(
      world,
      state,
      { proceedingId: recall.id, votes },
      commandId,
    );
    if (!("error" in out)) events.push(...out.events);
  }
  for (const rec of Object.values(state.constitutionalRuntime.recalls).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  )) {
    if (rec.status !== "vote_scheduled" || !rec.nationalVoteDate) continue;
    if (rec.nationalVoteDate > state.currentDate) continue;
    const out = resolveNationalRecall(world, state, rec.id, commandId);
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

function generateCases(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const emergency of Object.values(state.executiveRuntime.emergencies)) {
    if (emergency.status !== "active") continue;
    if (emergency.metadata.courtReviewRequired !== true) continue;
    const exists = Object.values(state.constitutionalRuntime.courtCases).some(
      (c) => c.caseType === "EMERGENCY_REVIEW" && c.challengedId === emergency.id,
    );
    if (exists) continue;
    const petitioner =
      currentAssemblyMemberIds(world, state).find((id) => id !== state.playerPoliticianId) ??
      emergency.declaredBy;
    const filed = fileConstitutionalCase(
      world,
      state,
      {
        actorId: petitioner,
        caseType: "EMERGENCY_REVIEW",
        challengedKind: "emergency",
        challengedId: emergency.id,
        respondentId: emergency.declaredBy,
        constitutionalQuestion: "Whether the emergency declaration remains constitutionally valid",
        constitutionalRule: "emergency_review",
        meritsLean: -0.15,
        expedited: true,
      },
      commandId,
    );
    if (!("error" in filed)) events.push(...filed.events);
  }
  if (activeCaseload(state) >= MAX_ACTIVE_COURT_CASES) return events;
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((l) => l.operative !== false)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const law = laws[0];
  const mps = currentAssemblyMemberIds(world, state).filter(
    (id) => id !== state.playerPoliticianId,
  );
  const petitioner = mps.length > 0
    ? mps[rng.uint32("npc-decisions") % mps.length]
    : undefined;
  if (law && petitioner && npcShouldFileLawReview(world, state, petitioner, rng)) {
    const already = Object.values(state.constitutionalRuntime.courtCases).some(
      (c) => c.challengedKind === "law" && c.challengedId === law.id,
    );
    if (!already) {
      const filed = fileConstitutionalCase(
        world,
        state,
        {
          actorId: petitioner,
          caseType: "LAW_REVIEW",
          challengedKind: "law",
          challengedId: law.id,
          respondentId: law.sponsorId,
          constitutionalQuestion: `Whether ${law.title} is constitutionally valid`,
          constitutionalRule: "law_review",
          meritsLean: (law.policyItems[0]?.magnitude ?? 0.3) - 0.55,
        },
        commandId,
      );
      if (!("error" in filed)) events.push(...filed.events);
    }
  }
  if (activeCaseload(state) >= MAX_ACTIVE_COURT_CASES) return events;
  const regs = Object.values(state.executiveRuntime.regulations)
    .filter((r) => r.status === "active")
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const reg = regs[0];
  if (reg && petitioner && rng.float01("npc-decisions") < 0.05) {
    const already = Object.values(state.constitutionalRuntime.courtCases).some(
      (c) => c.challengedKind === "regulation" && c.challengedId === reg.id,
    );
    if (!already) {
      const filed = fileConstitutionalCase(
        world,
        state,
        {
          actorId: petitioner,
          caseType: "REGULATION_REVIEW",
          challengedKind: "regulation",
          challengedId: reg.id,
          respondentId: reg.issuerId,
          constitutionalQuestion: "Whether the regulation exceeds lawful executive authority",
          constitutionalRule: "regulation_review",
          meritsLean: reg.major ? 0.12 : -0.25,
        },
        commandId,
      );
      if (!("error" in filed)) events.push(...filed.events);
    }
  }
  return events;
}

export function processCourtsMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.constitutionalRuntime.lastMonthProcessed === month) return [];
  const events: SimEvent[] = [];
  events.push(...nominationWork(state, world, rng, commandId));
  events.push(...assemblyProceedings(state, world, rng, commandId));
  events.push(...generateCases(state, world, rng, commandId));
  events.push(...docketWork(state, world, rng, commandId));
  state.constitutionalRuntime.lastMonthProcessed = month;
  return events;
}
