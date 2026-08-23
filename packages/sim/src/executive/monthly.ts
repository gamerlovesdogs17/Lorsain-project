import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { pushHistory } from "../scheduler.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { chooseLegislativeVote } from "../legislature/decisions.js";
import type { BillState, LegislativeVoteChoice } from "../legislature/types.js";
import {
  appointMinister,
  equalMinistryAllocations,
  introduceMotion,
  issueRegulation,
  motionIsRipe,
  proposeBudget,
  recordMotionVote,
  seedContinuingBudget,
  takePendingMotionVote,
} from "./procedure.js";
import {
  currentMinisterHolderId,
  currentPresidentialAuthorityId,
  ministerOfficeIds,
  seedMinistriesIfNeeded,
} from "./state.js";
import { chooseMinisterAppointment, chooseRegulationIssue } from "./decisions.js";
import type { AssemblyMotion } from "./types.js";

function expireClerical(state: SimState, commandId: string): SimEvent[] {
  const events: SimEvent[] = [];
  for (const emergency of Object.values(state.executiveRuntime.emergencies)) {
    if (emergency.status === "active" && emergency.expiresDate < state.currentDate) {
      emergency.status = "expired";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "EMERGENCY_EXPIRED",
          importance: 0.55,
          visibility: "public",
          actorIds: [emergency.declaredBy],
          entityIds: [emergency.id],
          payload: { emergencyId: emergency.id },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  for (const war of Object.values(state.executiveRuntime.warPowers)) {
    if (war.status === "unilateral" && war.unilateralUntil < state.currentDate && !war.authorized) {
      const pendingAuth = Object.values(state.executiveRuntime.motions).some(
        (m) =>
          m.kind === "war_authorization" &&
          m.targetId === war.id &&
          (m.status === "scheduled" || m.status === "introduced"),
      );
      // Do not expire while a legitimate Assembly authorization referral is pending.
      if (pendingAuth) continue;
      war.status = "expired";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "WAR_POWERS_EXPIRED",
          importance: 0.7,
          visibility: "public",
          actorIds: [war.startedBy],
          entityIds: [war.id],
          payload: { warPowerId: war.id },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}

function applyContinuity(world: KernelWorld, state: SimState, commandId: string): SimEvent[] {
  const year = Number(state.currentDate.slice(0, 4));
  const month = Number(state.currentDate.slice(5, 7));
  const events: SimEvent[] = [];
  const forYear = Object.values(state.executiveRuntime.budgets).filter(
    (b) => b.fiscalYear === year,
  );
  if (month >= 3 && forYear.every((b) => b.status === "proposed" || b.status === "continuing")) {
    const proposed = forYear.find((b) => b.status === "proposed");
    if (proposed && proposed.assemblyDecision === "pending") {
      proposed.status = "continuing";
      proposed.assemblyDecision = "none";
      proposed.continuingSource = proposed.id;
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "BUDGET_CONTINUES",
          importance: 0.6,
          visibility: "public",
          actorIds: [],
          entityIds: [proposed.id],
          payload: { budgetId: proposed.id, fiscalYear: year },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  void world;
  return events;
}

function npcPresidentWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const president = currentPresidentialAuthorityId(world, state);
  if (!president || president === state.playerPoliticianId) return events;
  const vacant = ministerOfficeIds(world).filter(
    (id) => currentMinisterHolderId(world, state, id) == null,
  );
  if (vacant.length > 0) {
    const orderedVacancies = vacant.sort();
    const officeId = orderedVacancies[Math.floor(rng.float01("legislature") * orderedVacancies.length)]!;
    const pick = chooseMinisterAppointment(world, state, president, officeId, rng);
    if (pick) {
      const out = appointMinister(
        world,
        state,
        { actorId: president, officeId, politicianId: pick },
        commandId,
      );
      if (!("error" in out)) events.push(...out.events);
    }
  }
  const year = Number(state.currentDate.slice(0, 4));
  const month = Number(state.currentDate.slice(5, 7));
  const hasProposal = Object.values(state.executiveRuntime.budgets).some(
    (b) => b.fiscalYear === year && (b.status === "proposed" || b.status === "approved"),
  );
  if (month === 1 && !hasProposal) {
    const out = proposeBudget(
      world,
      state,
      { actorId: president, allocations: equalMinistryAllocations(world) },
      commandId,
    );
    if (!("error" in out)) events.push(...out.events);
  }
  const reg = chooseRegulationIssue(world, state, president, rng);
  if (reg) {
    const out = issueRegulation(
      world,
      state,
      {
        actorId: president,
        ministryOfficeId: reg.ministryOfficeId,
        policyItems: [reg.item],
        major: false,
      },
      commandId,
    );
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

function syntheticBillForMotion(world: KernelWorld, motion: AssemblyMotion): BillState {
  const issueId = world.issueIds[0] ?? "ISS_TAX";
  return {
    id: motion.id,
    sponsorId: motion.sponsorId,
    cosponsorIds: [],
    introducedDate: motion.introducedDate,
    title: motion.kind,
    summary: motion.kind,
    policyItems: [{ issueId, direction: 0, magnitude: 0.2, fiscalImpact: null }],
    assignedCommitteeId: null,
    status: "floor_scheduled",
    amendmentIds: [],
    committeeVoteId: null,
    floorVoteId: null,
    presidentialDisposition: "none",
    repassageVoteId: null,
    enactedDate: null,
    enactedLawId: null,
    stageReadyDate: motion.stageReadyDate,
    metadata: { motionKind: motion.kind },
  };
}

function motionWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  if (mps.length === 0) return events;
  const ripe = Object.values(state.executiveRuntime.motions)
    .filter((m) => m.status === "scheduled" && motionIsRipe(state, m))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const motion = ripe[0];
  if (!motion) return events;
  const pending = mps.includes(state.playerPoliticianId)
    ? takePendingMotionVote(state, motion.id)
    : null;
  const votes: Record<string, LegislativeVoteChoice> = {};
  const synthetic = syntheticBillForMotion(world, motion);
  for (const id of mps) {
    if (id === state.playerPoliticianId) {
      votes[id] = pending ?? "abstain";
      continue;
    }
    votes[id] = chooseLegislativeVote(world, state, id, synthetic, rng);
  }
  const out = recordMotionVote(world, state, { motionId: motion.id, votes }, commandId);
  if (!("error" in out)) events.push(...out.events);
  return events;
}

function npcCensureProbe(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  if (rng.float01("legislature") > 0.08) return [];
  const mps = currentAssemblyMemberIds(world, state).filter(
    (id) => id !== state.playerPoliticianId,
  );
  if (mps.length === 0) return [];
  const cabinet = ministerOfficeIds(world)
    .map((id) => ({ id, holder: currentMinisterHolderId(world, state, id) }))
    .filter((x) => x.holder);
  if (cabinet.length === 0) return [];
  const target = cabinet[Math.floor(rng.float01("legislature") * cabinet.length)]!;
  const sponsor = mps[Math.floor(rng.float01("legislature") * mps.length)]!;
  const existing = Object.values(state.executiveRuntime.motions).some(
    (m) => m.kind === "ministerial_censure" && m.targetId === target.id && m.status === "scheduled",
  );
  if (existing) return [];
  const out = introduceMotion(
    world,
    state,
    { sponsorId: sponsor, kind: "ministerial_censure", targetId: target.id },
    commandId,
  );
  if ("error" in out) return [];
  return out.events;
}

export function processExecutiveMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  if (
    ministerOfficeIds(world).length === 0 &&
    currentAssemblyMemberIds(world, state).length === 0
  ) {
    return [];
  }
  const month = monthStart(state.currentDate);
  if (state.executiveRuntime.lastMonthProcessed === month) return [];
  seedMinistriesIfNeeded(world, state);
  seedContinuingBudget(world, state);
  const events: SimEvent[] = [];
  events.push(...expireClerical(state, commandId));
  events.push(...applyContinuity(world, state, commandId));
  events.push(...npcPresidentWork(state, world, rng, commandId));
  events.push(...npcCensureProbe(state, world, rng, commandId));
  events.push(...motionWork(state, world, rng, commandId));
  state.executiveRuntime.lastMonthProcessed = month;
  return events;
}
