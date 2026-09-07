import { addMonths } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { reviewGoals } from "../agents/goals.js";
import { applyPoliticianExit } from "../political-lifecycle.js";
import { declareCandidacy } from "../parties/contests.js";
import { ensureCampaignForDeclaredCandidacy } from "../campaigns/actions.js";
import { fileAssemblyCandidacy } from "../elections/assembly-cycle.js";
import { fileGubernatorialCandidacy } from "../provinces/elections.js";
import { activeTermsForPolitician, officesOfKind, occupyingTerms } from "../offices.js";
import { pushHistory } from "../scheduler.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import {
  AS_CAREER_COOLDOWN_MONTHS,
  AS_MAX_CAREER_ACTIONS_PER_MONTH,
  type CareerAmbitionKind,
  type CareerAmbitionRecord,
  type CareerAmbitionStage,
} from "./types.js";

function officeRank(kind: string): number {
  const order = [
    "president",
    "speaker",
    "governor",
    "minister",
    "mayor",
    "constitutional_court_justice",
    "assembly_member",
  ];
  const idx = order.indexOf(kind);
  return idx < 0 ? 99 : idx;
}

function primaryKind(world: KernelWorld, state: SimState, politicianId: string): string | null {
  const terms = activeTermsForPolitician(state, politicianId);
  let best: string | null = null;
  let bestRank = 999;
  for (const term of terms) {
    const kind = world.offices[term.officeId]?.kind;
    if (!kind) continue;
    const rank = officeRank(kind);
    if (rank < bestRank) {
      bestRank = rank;
      best = kind;
    }
  }
  return best;
}

function openLeadershipContests(state: SimState, partyId: string): string[] {
  return Object.values(state.partyContests)
    .filter(
      (c) =>
        c.type === "party_leadership" &&
        c.partyId === partyId &&
        (c.status === "open" || c.status === "planned" || c.status === "qualification"),
    )
    .map((c) => c.id)
    .sort();
}

function openPresidentialNomination(state: SimState, partyId: string): string | null {
  return (
    Object.values(state.partyContests)
      .filter(
        (c) =>
          c.type === "presidential_nomination" &&
          c.partyId === partyId &&
          (c.status === "open" || c.status === "planned" || c.status === "qualification"),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null
  );
}

function openAssemblyFiling(
  state: SimState,
  constituencyId: string | null,
): { electionId: string; constituencyId: string } | null {
  for (const election of Object.values(state.elections).sort((a, b) => a.id.localeCompare(b.id))) {
    if (election.type !== "assembly" || !election.assembly) continue;
    if (election.status === "resolved" || election.status === "cancelled") continue;
    if (election.assembly.filingStatus !== "open") continue;
    const cid =
      constituencyId ??
      Object.values(election.assembly.candidacies).find((c) => c.status === "filed")
        ?.constituencyId ??
      null;
    if (!cid) continue;
    return { electionId: election.id, constituencyId: cid };
  }
  return null;
}

function vacantMinisterOffices(world: KernelWorld, state: SimState): string[] {
  return officesOfKind(world, "minister")
    .filter((o) => occupyingTerms(state, o.id).length === 0)
    .map((o) => o.id)
    .sort();
}

function setGoalTargetOffice(
  state: SimState,
  politicianId: string,
  targetOfficeId: string | null,
  targetOfficeKind: string | null,
): void {
  for (const goal of Object.values(state.goals)) {
    if (goal.ownerId !== politicianId || goal.status !== "active") continue;
    if (goal.type === "seek_office" || goal.type === "career_advancement") {
      if (targetOfficeId) goal.targetOfficeId = targetOfficeId;
      if (targetOfficeKind) goal.targetOfficeKind = targetOfficeKind;
    }
  }
}

function advanceStage(
  current: CareerAmbitionStage | undefined,
  next: CareerAmbitionStage,
): CareerAmbitionStage {
  const order: CareerAmbitionStage[] = [
    "considering",
    "exploring",
    "candidate",
    "campaigning",
    "won",
    "lost",
    "withdrew",
  ];
  if (!current) return next;
  if (["won", "lost", "withdrew"].includes(next)) return next;
  return order.indexOf(next) >= order.indexOf(current) ? next : current;
}

function decideKind(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  rng: RngService,
): {
  kind: CareerAmbitionKind;
  stage: CareerAmbitionStage;
  targetOfficeId: string | null;
  targetContestId: string | null;
  targetElectionId: string | null;
  notes: string;
} {
  const profile = getAgentProfile(world, state, politicianId);
  const runtime = state.politicians[politicianId];
  if (!profile || !runtime || !runtime.alive || runtime.retired) {
    return {
      kind: "hold_course",
      stage: "considering",
      targetOfficeId: null,
      targetContestId: null,
      targetElectionId: null,
      notes: "inactive",
    };
  }
  const ambition = profile.traits.ambition;
  const retirement = profile.traits.retirementInclination;
  const held = primaryKind(world, state, politicianId);
  const age =
    profile.birthDate != null
      ? Number(state.currentDate.slice(0, 4)) - Number(profile.birthDate.slice(0, 4))
      : 50;

  const goals = Object.values(state.goals).filter(
    (g) => g.ownerId === politicianId && g.status === "active",
  );
  const wantsAdvance = goals.some(
    (g) =>
      g.type === "career_advancement" ||
      g.type === "seek_office" ||
      g.type === "increase_influence",
  );
  const wantsRetire = goals.some((g) => g.type === "retirement") || retirement >= 0.82;

  if (
    wantsRetire ||
    (age >= 72 && retirement >= 0.55 && rng.float01("npc-decisions") < retirement * 0.35)
  ) {
    const retireThreshold = retirement >= 0.95 ? 1 : 0.55 + retirement * 0.3;
    if (held && (retirement >= 0.95 || rng.float01("npc-decisions") < retireThreshold)) {
      return {
        kind: "retire",
        stage: "withdrew",
        targetOfficeId: null,
        targetContestId: null,
        targetElectionId: null,
        notes: "retirement_inclination",
      };
    }
  }

  if (runtime.partyId) {
    const contests = openLeadershipContests(state, runtime.partyId);
    const isLeader = state.partyStates[runtime.partyId]?.leaderId === politicianId;
    if (
      !isLeader &&
      contests.length > 0 &&
      ambition >= 0.55 &&
      (wantsAdvance || ambition >= 0.7) &&
      rng.float01("npc-decisions") < ambition * 0.55
    ) {
      return {
        kind: "contest_leadership",
        stage: "candidate",
        targetOfficeId: null,
        targetContestId: contests[0]!,
        targetElectionId: null,
        notes: "open_leadership_contest",
      };
    }
  }

  const vacant = vacantMinisterOffices(world, state);
  if (
    vacant.length > 0 &&
    ambition >= 0.4 &&
    held !== "president" &&
    held !== "minister" &&
    rng.float01("npc-decisions") < ambition * 0.4 + 0.1
  ) {
    return {
      kind: "accept_cabinet",
      stage: "exploring",
      targetOfficeId: vacant[0]!,
      targetContestId: null,
      targetElectionId: null,
      notes: "cabinet_vacancy",
    };
  }

  const openSeats = Object.values(ensurePoliticsRuntime(state).openSeatContests).filter(
    (s) =>
      (s.status === "open" || s.status === "recruited") &&
      s.category !== "countback" &&
      (s.partyId == null || s.partyId === runtime.partyId),
  );
  const presNom = runtime.partyId ? openPresidentialNomination(state, runtime.partyId) : null;
  const govOpen = Object.values(state.provincialRuntime.elections ?? {})
    .filter((e) => e.status === "filing_open")
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const seekChance =
    ambition * 0.45 +
    (wantsAdvance ? 0.2 : 0) +
    (openSeats.length > 0 ? 0.25 : 0) +
    (presNom && ambition >= 0.65 ? 0.15 : 0) +
    (govOpen && ambition >= 0.55 ? 0.12 : 0) -
    retirement * 0.25;
  if (seekChance >= 0.35 && rng.float01("npc-decisions") < Math.min(0.85, seekChance)) {
    const seat = openSeats.sort((a, b) => a.id.localeCompare(b.id))[0];
    if (presNom && ambition >= 0.7 && (!seat || rng.float01("npc-decisions") < 0.45)) {
      return {
        kind: "seek_higher_office",
        stage: "exploring",
        targetOfficeId: officesOfKind(world, "president")[0]?.id ?? null,
        targetContestId: presNom,
        targetElectionId: null,
        notes: "presidential_nomination_open",
      };
    }
    if (govOpen && ambition >= 0.6 && (!seat || rng.float01("npc-decisions") < 0.35)) {
      const office = officesOfKind(world, "governor").find(
        (o) => o.provinceId === govOpen.provinceId,
      );
      return {
        kind: "seek_higher_office",
        stage: "exploring",
        targetOfficeId: office?.id ?? null,
        targetContestId: null,
        targetElectionId: govOpen.id,
        notes: "gubernatorial_filing_open",
      };
    }
    return {
      kind: "seek_higher_office",
      stage: "exploring",
      targetOfficeId: seat?.officeId ?? null,
      targetContestId: null,
      targetElectionId: seat?.electionId ?? null,
      notes: seat ? "open_seat_opportunity" : "ambition",
    };
  }

  return {
    kind: "hold_course",
    stage: "considering",
    targetOfficeId: null,
    targetContestId: null,
    targetElectionId: null,
    notes: "steady",
  };
}

function recordAmbition(state: SimState, record: CareerAmbitionRecord): void {
  const runtime = ensurePoliticsRuntime(state);
  const prev = runtime.careerAmbitions[record.politicianId];
  runtime.careerAmbitions[record.politicianId] = {
    ...record,
    stage: advanceStage(prev?.stage, record.stage),
    willingCabinet: record.willingCabinet || prev?.willingCabinet === true,
  };
}

export function isWillingCabinet(state: SimState, politicianId: string): boolean {
  return ensurePoliticsRuntime(state).careerAmbitions[politicianId]?.willingCabinet === true;
}

function executeSeekHigherOffice(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  decision: {
    targetOfficeId: string | null;
    targetContestId: string | null;
    targetElectionId: string | null;
    notes: string;
  },
  commandId: string,
): {
  events: SimEvent[];
  stage: CareerAmbitionStage;
  targetOfficeId: string | null;
  targetElectionId: string | null;
  notes: string;
} {
  const events: SimEvent[] = [];
  let stage: CareerAmbitionStage = "exploring";
  let targetOfficeId = decision.targetOfficeId;
  let targetElectionId = decision.targetElectionId;
  let notes = decision.notes;

  if (decision.targetContestId) {
    const declared = declareCandidacy(
      state,
      world,
      decision.targetContestId,
      politicianId,
      commandId,
    );
    if (!("error" in declared)) {
      events.push(...declared.events);
      // Mirror player DECLARE_PARTY_CONTEST_CANDIDACY: filing must launch a
      // nomination campaign so NPC qualification actions can run. Career agency
      // runs before processCampaignMonth; without this, declared candidates are
      // skipped by npcDeclarations and never seek endorsement/support milestones.
      events.push(
        ...ensureCampaignForDeclaredCandidacy(
          state,
          world,
          decision.targetContestId,
          politicianId,
          commandId,
        ),
      );
      stage = "candidate";
      notes = "filed_presidential_nomination";
    }
  } else if (
    decision.targetElectionId?.startsWith("ELEC_GOV_") ||
    decision.notes === "gubernatorial_filing_open"
  ) {
    const election =
      state.provincialRuntime.elections[decision.targetElectionId ?? ""] ??
      Object.values(state.provincialRuntime.elections).find((e) => e.status === "filing_open");
    if (election) {
      const filed = fileGubernatorialCandidacy(
        state,
        world,
        {
          politicianId,
          electionId: election.id,
          provinceId: election.provinceId,
        },
        commandId,
      );
      if (!("error" in filed)) {
        events.push(...filed.events);
        stage = "candidate";
        targetElectionId = election.id;
        notes = "filed_gubernatorial_candidacy";
        targetOfficeId =
          officesOfKind(world, "governor").find((o) => o.provinceId === election.provinceId)?.id ??
          targetOfficeId;
      }
    }
  } else {
    const seat = Object.values(ensurePoliticsRuntime(state).openSeatContests)
      .filter(
        (s) =>
          s.status === "open" ||
          s.status === "recruited" ||
          (decision.targetOfficeId != null && s.officeId === decision.targetOfficeId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const constituencyId =
      seat?.constituencyId ??
      (decision.targetOfficeId
        ? (world.offices[decision.targetOfficeId]?.constituencyId ?? null)
        : null);
    const filing =
      (seat?.electionId && constituencyId
        ? { electionId: seat.electionId, constituencyId }
        : null) ?? openAssemblyFiling(state, constituencyId);
    if (filing) {
      const filed = fileAssemblyCandidacy(
        state,
        world,
        {
          electionId: filing.electionId,
          constituencyId: filing.constituencyId,
          politicianId,
        },
        commandId,
      );
      if (!("error" in filed)) {
        events.push(...filed.events);
        stage = "candidate";
        targetElectionId = filing.electionId;
        notes = "filed_assembly_candidacy";
        if (!targetOfficeId && seat) targetOfficeId = seat.officeId;
      } else {
        notes = `assembly_filing_blocked:${filed.error.code}`;
      }
    } else {
      stage = "considering";
      notes = "no_filing_window";
    }
  }

  const officeKind = targetOfficeId ? (world.offices[targetOfficeId]?.kind ?? null) : null;
  setGoalTargetOffice(state, politicianId, targetOfficeId, officeKind);
  return { events, stage, targetOfficeId, targetElectionId, notes };
}

/**
 * Monthly career decisions for a bounded set of NPC politicians.
 * Uses goals + ambition traits + opportunity (open offices, contests, elections).
 */
export function processCareerDecisionsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];

  // Advance existing candidacies toward campaigning / terminal outcomes.
  for (const record of Object.values(runtime.careerAmbitions).sort((a, b) =>
    a.politicianId.localeCompare(b.politicianId),
  )) {
    if (record.kind !== "seek_higher_office" && record.kind !== "contest_leadership") continue;
    if (["won", "lost", "withdrew"].includes(record.stage)) continue;
    if (record.stage === "candidate") {
      record.stage = "campaigning";
    }
    if (record.targetContestId) {
      const contest = state.partyContests[record.targetContestId];
      if (contest?.status === "resolved") {
        record.stage = contest.winnerId === record.politicianId ? "won" : "lost";
      } else if (contest?.status === "cancelled") {
        record.stage = "withdrew";
      }
    }
    if (record.targetElectionId) {
      const national = state.elections[record.targetElectionId];
      if (national?.status === "resolved") {
        record.stage = national.winnerIds.includes(record.politicianId) ? "won" : "lost";
      }
      const gov = state.provincialRuntime.elections[record.targetElectionId];
      if (gov?.status === "resolved" || gov?.status === "assumed") {
        record.stage = gov.winnerId === record.politicianId ? "won" : "lost";
      }
    }
  }

  const candidates = Object.values(state.politicians)
    .filter(
      (p) =>
        p.alive &&
        !p.retired &&
        p.id !== state.playerPoliticianId &&
        ((getAgentProfile(world, state, p.id)?.traits.ambition ?? 0) >= 0.35 ||
          (getAgentProfile(world, state, p.id)?.traits.retirementInclination ?? 0) >= 0.8),
    )
    .sort((a, b) => {
      const pa = getAgentProfile(world, state, a.id);
      const pb = getAgentProfile(world, state, b.id);
      const retireBoostA = (pa?.traits.retirementInclination ?? 0) >= 0.9 ? 2 : 0;
      const retireBoostB = (pb?.traits.retirementInclination ?? 0) >= 0.9 ? 2 : 0;
      const aa = (pa?.traits.ambition ?? 0) + retireBoostA;
      const bb = (pb?.traits.ambition ?? 0) + retireBoostB;
      return bb - aa || a.id.localeCompare(b.id);
    });

  for (const pol of candidates) {
    if (runtime.activityThisMonth.careerActions >= AS_MAX_CAREER_ACTIONS_PER_MONTH) break;
    const existing = runtime.careerAmbitions[pol.id];
    if (existing?.cooldownUntil && existing.cooldownUntil > state.currentDate) continue;
    if (existing && ["candidate", "campaigning"].includes(existing.stage)) continue;

    const decision = decideKind(world, state, pol.id, rng);
    if (decision.kind === "hold_course") continue;

    let stage = decision.stage;
    let targetOfficeId = decision.targetOfficeId;
    const targetContestId = decision.targetContestId;
    let targetElectionId = decision.targetElectionId;
    let notes = decision.notes;
    let willingCabinet = existing?.willingCabinet === true;

    if (decision.kind === "retire") {
      const record: CareerAmbitionRecord = {
        politicianId: pol.id,
        kind: "retire",
        stage: "withdrew",
        targetOfficeId: null,
        targetContestId: null,
        targetElectionId: null,
        willingCabinet: false,
        decidedDate: state.currentDate,
        cooldownUntil: addMonths(state.currentDate, AS_CAREER_COOLDOWN_MONTHS),
        notes: decision.notes,
      };
      recordAmbition(state, record);
      runtime.activityThisMonth.careerActions += 1;
      events.push(...applyPoliticianExit(state, world, pol.id, "retirement", commandId));
      recordPoliticalMemory(
        state,
        world,
        {
          ownerId: pol.id,
          subjectIds: [pol.id],
          kind: "generic",
          valence: -0.1,
          salience: 0.7,
          durability: "durable",
          tags: ["career", "retirement"],
          metadata: { source: "phase12_career" },
        },
        state.currentDate,
      );
      continue;
    }

    if (decision.kind === "contest_leadership" && decision.targetContestId) {
      const declared = declareCandidacy(state, world, decision.targetContestId, pol.id, commandId);
      if (!("error" in declared)) {
        events.push(...declared.events);
        stage = "candidate";
        recordPoliticalMemory(
          state,
          world,
          {
            ownerId: pol.id,
            subjectIds: [pol.id],
            kind: "generic",
            valence: 0.35,
            salience: 0.65,
            durability: "normal",
            tags: ["career", "leadership_challenge"],
            metadata: { contestId: decision.targetContestId, source: "phase12_career" },
          },
          state.currentDate,
        );
      }
    }

    if (decision.kind === "accept_cabinet") {
      willingCabinet = true;
      stage = "exploring";
      notes = "willing_cabinet";
      setGoalTargetOffice(state, pol.id, decision.targetOfficeId, "minister");
      reviewGoals(state, world, pol.id, state.currentDate);
    }

    if (decision.kind === "seek_higher_office") {
      reviewGoals(state, world, pol.id, state.currentDate);
      const executed = executeSeekHigherOffice(world, state, pol.id, decision, commandId);
      events.push(...executed.events);
      stage = executed.stage;
      targetOfficeId = executed.targetOfficeId;
      targetElectionId = executed.targetElectionId;
      notes = executed.notes;
    }

    const record: CareerAmbitionRecord = {
      politicianId: pol.id,
      kind: decision.kind,
      stage,
      targetOfficeId,
      targetContestId,
      targetElectionId,
      willingCabinet,
      decidedDate: state.currentDate,
      cooldownUntil: addMonths(state.currentDate, AS_CAREER_COOLDOWN_MONTHS),
      notes,
    };
    recordAmbition(state, record);
    runtime.activityThisMonth.careerActions += 1;

    if (decision.kind === "seek_higher_office" || decision.kind === "accept_cabinet") {
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "POLITICIAN_CAREER_DECISION",
          importance: 0.45,
          visibility: "public",
          actorIds: [pol.id],
          entityIds: [
            pol.id,
            ...(targetOfficeId ? [targetOfficeId] : []),
            ...(targetContestId ? [targetContestId] : []),
            ...(targetElectionId ? [targetElectionId] : []),
          ],
          payload: {
            kind: decision.kind,
            stage,
            notes,
            targetOfficeId,
            targetContestId,
            targetElectionId,
            willingCabinet,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
      recordPoliticalMemory(
        state,
        world,
        {
          ownerId: pol.id,
          subjectIds: [pol.id],
          kind: "generic",
          valence: 0.25,
          salience: 0.55,
          durability: "normal",
          tags: ["career", decision.kind, stage],
          metadata: {
            source: "phase12_career",
            targetOfficeId,
            stage,
          },
        },
        state.currentDate,
      );
    }
  }

  return events;
}
