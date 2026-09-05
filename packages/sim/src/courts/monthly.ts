import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { currentAssemblyMemberIds, currentPresidentialAuthorityId } from "../legislature/state.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import {
  courtStageRipe,
  fileConstitutionalCase,
  nominateConstitutionalJudge,
  openVacancyNominations,
  recordConfirmationVote,
  recordImpeachmentVote,
  recordJudicialDecision,
  recordRecallReferralVote,
  resolveNationalRecall,
  similarPrecedent,
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
import { currentGovernorId } from "../provinces/state.js";

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
  mps: string[],
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
  judges: string[],
): SimEvent[] {
  const events: SimEvent[] = [];
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
  const precedent = similarPrecedent(state, courtCase);
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
    votes[id] = chooseJudicialVote(world, state, id, courtCase, rng, precedent);
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
  mps: string[],
): SimEvent[] {
  const events: SimEvent[] = [];
  const impeach = Object.values(state.constitutionalRuntime.impeachments)
    .filter((p) => p.status === "assembly_pending" && courtStageRipe(state, p.stageReadyDate))
    .sort(
      (a, b) =>
        a.stageReadyDate.localeCompare(b.stageReadyDate) ||
        a.introducedDate.localeCompare(b.introducedDate) ||
        a.id.localeCompare(b.id),
    )[0];
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
    .sort(
      (a, b) =>
        a.stageReadyDate.localeCompare(b.stageReadyDate) ||
        a.introducedDate.localeCompare(b.introducedDate) ||
        a.id.localeCompare(b.id),
    )[0];
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
  mps: string[],
): SimEvent[] {
  const events: SimEvent[] = [];
  const existingCases = Object.values(state.constitutionalRuntime.courtCases);
  const reviewedTargets = new Set(
    existingCases.map((courtCase) => `${courtCase.challengedKind}:${courtCase.challengedId}`),
  );
  let activeCases = existingCases.reduce(
    (count, courtCase) =>
      count + (courtCase.status === "filed" || courtCase.status === "pending" ? 1 : 0),
    0,
  );
  for (const bill of Object.values(state.provincialRuntime.bills).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (bill.status !== "signed" && bill.status !== "override_passed") continue;
    if (stableCourtDisputeHash(bill.id) % 100 >= 8) continue;
    if (reviewedTargets.has(`provincial_law:${bill.id}`) || activeCases >= MAX_ACTIVE_COURT_CASES)
      continue;
    const governorId = currentGovernorId(world, state, bill.provinceId);
    const presidentId = currentPresidentialAuthorityId(world, state);
    if (!governorId || !presidentId || governorId === state.playerPoliticianId) continue;
    const filed = fileConstitutionalCase(
      world,
      state,
      {
        actorId: governorId,
        caseType: "FEDERAL_PROVINCIAL_DISPUTE",
        challengedKind: "provincial_law",
        challengedId: bill.id,
        respondentId: presidentId,
        constitutionalQuestion: provincialDisputeQuestion(bill.id, bill.title, bill.subject),
        constitutionalRule: "federal_provincial_competence",
        meritsLean: ((stableCourtDisputeHash(`${bill.id}:merits`) % 101) - 50) / 100,
      },
      commandId,
    );
    if (!("error" in filed)) {
      events.push(...filed.events);
      reviewedTargets.add(`provincial_law:${bill.id}`);
      activeCases += 1;
    }
  }
  for (const emergency of Object.values(state.executiveRuntime.emergencies)) {
    if (emergency.status !== "active") continue;
    if (emergency.metadata.courtReviewRequired !== true) continue;
    if (reviewedTargets.has(`emergency:${emergency.id}`)) continue;
    const eligibleEmergencyPetitioners = mps.filter((id) => id !== state.playerPoliticianId);
    const petitioner =
      eligibleEmergencyPetitioners.length > 0
        ? eligibleEmergencyPetitioners[
            rng.uint32("npc-decisions") % eligibleEmergencyPetitioners.length
          ]!
        : emergency.declaredBy;
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
    if (!("error" in filed)) {
      events.push(...filed.events);
      reviewedTargets.add(`emergency:${emergency.id}`);
      activeCases += 1;
    }
  }
  if (activeCases >= MAX_ACTIVE_COURT_CASES) return events;
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((l) => l.operative !== false)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const law = laws[0];
  const eligiblePetitioners = mps.filter((id) => id !== state.playerPoliticianId);
  const petitioner =
    eligiblePetitioners.length > 0
      ? eligiblePetitioners[rng.uint32("npc-decisions") % eligiblePetitioners.length]
      : undefined;
  if (law && petitioner && npcShouldFileLawReview(world, state, petitioner, rng)) {
    if (!reviewedTargets.has(`law:${law.id}`)) {
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
      if (!("error" in filed)) {
        events.push(...filed.events);
        reviewedTargets.add(`law:${law.id}`);
        activeCases += 1;
      }
    }
  }
  if (activeCases >= MAX_ACTIVE_COURT_CASES) return events;
  const regs = Object.values(state.executiveRuntime.regulations)
    .filter((r) => r.status === "active")
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  const reg = regs[0];
  if (reg && petitioner && rng.float01("npc-decisions") < 0.05) {
    if (!reviewedTargets.has(`regulation:${reg.id}`)) {
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

function stableCourtDisputeHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function provincialDisputeQuestion(billId: string, billTitle: string, subject: string): string {
  const v = stableCourtDisputeHash(`${billId}:question`) % 3;
  const qs: Record<string, [string, string, string]> = {
    policing_public_safety: [
      `Whether ${billTitle} encroaches on federal jurisdiction over criminal law`,
      `Whether ${billTitle} exceeds provincial authority over policing and public order`,
      `Whether ${billTitle} conflicts with the federal criminal code framework`,
    ],
    environmental_regulation: [
      `Whether ${billTitle} conflicts with national environmental standards`,
      `Whether ${billTitle} impermissibly regulates matters of national environmental concern`,
      `Whether ${billTitle} intrudes on federal jurisdiction over inter-provincial environmental matters`,
    ],
    labor_standards: [
      `Whether ${billTitle} overlaps with federal labor relations jurisdiction`,
      `Whether ${billTitle} exceeds the province's authority over labor standards`,
      `Whether ${billTitle} conflicts with federally protected collective bargaining rights`,
    ],
    agricultural_support: [
      `Whether ${billTitle} constitutes an impermissible subsidy under the trade framework`,
      `Whether ${billTitle} encroaches on federal authority over inter-provincial trade`,
      `Whether ${billTitle} conflicts with federal agricultural marketing regulations`,
    ],
    utilities_infrastructure: [
      `Whether ${billTitle} intrudes on federally regulated utility sectors`,
      `Whether ${billTitle} exceeds provincial authority over inter-provincial infrastructure`,
      `Whether ${billTitle} imposes discriminatory terms on federally regulated services`,
    ],
    economic_development: [
      `Whether ${billTitle} creates trade barriers inconsistent with federal economic union provisions`,
      `Whether ${billTitle} exceeds provincial economic development authority`,
      `Whether ${billTitle} discriminates against out-of-province businesses contrary to the constitution`,
    ],
    social_services: [
      `Whether ${billTitle} encroaches on federal jurisdiction over social insurance programs`,
      `Whether ${billTitle} imposes conditions inconsistent with national social standards`,
      `Whether ${billTitle} exceeds provincial authority over social welfare administration`,
    ],
    transport_service: [
      `Whether ${billTitle} conflicts with federal jurisdiction over inter-provincial transport`,
      `Whether ${billTitle} exceeds provincial transport regulatory authority`,
      `Whether ${billTitle} imposes terms inconsistent with federal transport safety standards`,
    ],
    housing_delivery: [
      `Whether ${billTitle} encroaches on federal housing and property rights jurisdiction`,
      `Whether ${billTitle} imposes obligations inconsistent with federal land use authority`,
      `Whether ${billTitle} conflicts with constitutionally protected property rights`,
    ],
    school_capacity: [
      `Whether ${billTitle} exceeds provincial education authority in relation to federal standards`,
      `Whether ${billTitle} encroaches on constitutionally protected education rights`,
      `Whether ${billTitle} conflicts with national education framework provisions`,
    ],
    hospital_access: [
      `Whether ${billTitle} conflicts with federal health authority and national standards`,
      `Whether ${billTitle} imposes conditions inconsistent with the federal health framework`,
      `Whether ${billTitle} exceeds provincial jurisdiction over health service delivery`,
    ],
    local_administration: [
      `Whether ${billTitle} exceeds provincial authority over municipal governance`,
      `Whether ${billTitle} conflicts with constitutional protections for local administration`,
      `Whether ${billTitle} imposes obligations inconsistent with municipal autonomy principles`,
    ],
  };
  const variants = qs[subject];
  if (variants) return variants[v]!;
  return `Whether ${billTitle} remains within provincial authority`;
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
  const profile = (
    globalThis as typeof globalThis & { __lorsainStageTimings?: Record<string, number[]> }
  ).__lorsainStageTimings;
  const timed = <T>(stage: string, work: () => T): T => {
    if (!profile) return work();
    const started = performance.now();
    const result = work();
    (profile[stage] ??= []).push(performance.now() - started);
    return result;
  };
  const mps = timed("courts.current_assembly", () => currentAssemblyMemberIds(world, state));
  const judges = timed("courts.current_bench", () => currentCourtJudgeIds(world, state));
  events.push(
    ...timed("courts.nominations", () => nominationWork(state, world, rng, commandId, mps)),
  );
  events.push(
    ...timed("courts.proceedings", () => assemblyProceedings(state, world, rng, commandId, mps)),
  );
  events.push(
    ...timed("courts.case_generation", () => generateCases(state, world, rng, commandId, mps)),
  );
  events.push(...timed("courts.docket", () => docketWork(state, world, rng, commandId, judges)));
  state.constitutionalRuntime.lastMonthProcessed = month;
  return events;
}
