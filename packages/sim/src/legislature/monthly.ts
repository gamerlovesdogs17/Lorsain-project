import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { monthStart } from "../campaigns/effects.js";
import { LEGISLATURE } from "./policy.js";
import {
  currentAssemblyMemberIds,
  currentPresidentialAuthorityId,
  currentSpeakerId,
  seedCommitteesIfNeeded,
} from "./state.js";
import { upsertRecommendations } from "./recommendations.js";
import {
  introduceBill,
  proposeAmendment,
  recordAmendmentVote,
  recordVote,
  returnBill,
  signBill,
  stageIsRipe,
  takePendingVotes,
} from "./procedure.js";
import { chooseIntroduce, chooseLegislativeVote, choosePresidentDisposition } from "./decisions.js";
import type {
  AmendmentState,
  BillState,
  LegislativeVoteChoice,
  LegislativeVoteStage,
} from "./types.js";
import { concretePolicyItem } from "./provisions.js";

function activeBillCount(state: SimState): number {
  return Object.values(state.legislatureRuntime.bills).filter((b) =>
    [
      "introduced",
      "committee",
      "committee_passed",
      "floor_scheduled",
      "sent_to_president",
      "returned_by_president",
      "repassage_scheduled",
    ].includes(b.status),
  ).length;
}

function proposedAmendments(state: SimState, bill: BillState): AmendmentState[] {
  return bill.amendmentIds
    .map((id) => state.legislatureRuntime.amendments[id])
    .filter((a): a is AmendmentState => a != null && a.status === "proposed")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function hasUnripeAmendments(state: SimState, bill: BillState): boolean {
  return proposedAmendments(state, bill).some((a) => !stageIsRipe(state, a.date));
}

function amendmentElectors(
  world: KernelWorld,
  state: SimState,
  bill: BillState,
  stage: LegislativeVoteStage,
): string[] {
  if (stage === "committee") {
    const committee = bill.assignedCommitteeId
      ? state.legislatureRuntime.committees[bill.assignedCommitteeId]
      : null;
    return (committee?.memberIds ?? []).filter((id) =>
      currentAssemblyMemberIds(world, state).includes(id),
    );
  }
  return currentAssemblyMemberIds(world, state);
}

function resolveRipeAmendments(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  bill: BillState,
  stage: LegislativeVoteStage,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const ripe = proposedAmendments(state, bill).filter((a) => stageIsRipe(state, a.date));
  const electors = amendmentElectors(world, state, bill, stage);
  for (const amendment of ripe) {
    if (electors.length < 1) continue;
    const pending = electors.includes(state.playerPoliticianId)
      ? takePendingVotes(state, bill.id, stage, amendment.id)
      : {};
    const votes: Record<string, LegislativeVoteChoice> = {};
    const synthetic: BillState = { ...bill, policyItems: amendment.policyItems };
    for (const id of electors) {
      if (id === state.playerPoliticianId) {
        votes[id] = pending[id] ?? "abstain";
        continue;
      }
      votes[id] = chooseLegislativeVote(world, state, id, synthetic, rng);
    }
    const out = recordAmendmentVote(
      world,
      state,
      {
        billId: bill.id,
        amendmentId: amendment.id,
        stage,
        votes,
        committeeId: bill.assignedCommitteeId,
      },
      commandId,
    );
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

function npcIntroductions(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (activeBillCount(state) >= LEGISLATURE.maxActiveBills) return events;
  const mps = currentAssemblyMemberIds(world, state).filter(
    (id) => id !== state.playerPoliticianId,
  );
  if (mps.length === 0) return events;
  const month = monthStart(state.currentDate).slice(5, 7);
  const start = (Number(month) * 7 + state.completedTurns) % Math.max(1, mps.length);
  let intros = 0;
  for (let k = 0; k < mps.length && intros < LEGISLATURE.maxIntrosPerMonth; k++) {
    const id = mps[(start + k) % mps.length]!;
    const item = chooseIntroduce(world, state, id, rng);
    if (!item) continue;
    const out = introduceBill(
      world,
      state,
      { sponsorId: id, policyItems: [concretePolicyItem(item)] },
      commandId,
    );
    if ("error" in out) continue;
    upsertRecommendations(world, state, out.bill);
    events.push(...out.events);
    intros += 1;
    if (activeBillCount(state) >= LEGISLATURE.maxActiveBills) break;
  }
  return events;
}

function maybeNegotiate(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  bill: BillState,
  commandId: string,
): SimEvent[] {
  if (bill.amendmentIds.length > 0) return [];
  if (rng.float01("legislature") > 0.35) return [];
  const item = bill.policyItems[0];
  if (!item || item.magnitude < 0.25) return [];
  const committee = bill.assignedCommitteeId
    ? state.legislatureRuntime.committees[bill.assignedCommitteeId]
    : null;
  const negotiator = (committee?.memberIds ?? []).find(
    (id) => id !== bill.sponsorId && id !== state.playerPoliticianId,
  );
  if (!negotiator) return [];
  const proposed = {
    ...item,
    magnitude: Math.max(0.15, item.magnitude * 0.7),
  };
  const out = proposeAmendment(
    world,
    state,
    { billId: bill.id, sponsorId: negotiator, policyItems: [proposed] },
    commandId,
  );
  if ("error" in out) return [];
  return out.events;
}

function committeeWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const bills = Object.values(state.legislatureRuntime.bills)
    .filter((b) => b.status === "committee")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const bill of bills) {
    if (!stageIsRipe(state, bill.stageReadyDate)) {
      events.push(...maybeNegotiate(state, world, rng, bill, commandId));
    }
  }
  const ripe = bills.filter((b) => stageIsRipe(state, b.stageReadyDate));
  for (const bill of ripe.slice(0, 3)) {
    if (hasUnripeAmendments(state, bill)) continue;
    events.push(...resolveRipeAmendments(state, world, rng, bill, "committee", commandId));
    if (proposedAmendments(state, bill).length > 0) continue;
    const committee = bill.assignedCommitteeId
      ? state.legislatureRuntime.committees[bill.assignedCommitteeId]
      : null;
    const members = (committee?.memberIds ?? []).filter((id) =>
      currentAssemblyMemberIds(world, state).includes(id),
    );
    if (members.length < 1) continue;
    const pending = members.includes(state.playerPoliticianId)
      ? takePendingVotes(state, bill.id, "committee")
      : {};
    const votes: Record<string, LegislativeVoteChoice> = {};
    for (const id of members) {
      if (id === state.playerPoliticianId) {
        votes[id] = pending[id] ?? "abstain";
        continue;
      }
      votes[id] = chooseLegislativeVote(world, state, id, bill, rng);
    }
    const out = recordVote(
      world,
      state,
      { billId: bill.id, stage: "committee", votes, committeeId: bill.assignedCommitteeId },
      commandId,
    );
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

function speakerSchedule(state: SimState, world: KernelWorld): void {
  const speaker = currentSpeakerId(world, state);
  const queue = state.legislatureRuntime.floorQueue.slice();
  const privileged = queue.filter((id) => {
    const bill = state.legislatureRuntime.bills[id];
    return bill?.status === "repassage_scheduled";
  });
  const rest = queue.filter((id) => !privileged.includes(id));
  if (speaker && speaker !== state.playerPoliticianId) {
    const party = state.politicians[speaker]?.partyId;
    rest.sort((a, b) => {
      const ba = state.legislatureRuntime.bills[a];
      const bb = state.legislatureRuntime.bills[b];
      const pa = ba ? state.politicians[ba.sponsorId]?.partyId : null;
      const pb = bb ? state.politicians[bb.sponsorId]?.partyId : null;
      const sa = pa === party ? 0 : 1;
      const sb = pb === party ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a < b ? -1 : 1;
    });
  }
  privileged.sort();
  state.legislatureRuntime.floorQueue = [...privileged, ...rest];
}

function floorWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  speakerSchedule(state, world);
  const nextId = state.legislatureRuntime.floorQueue[0];
  if (!nextId) return events;
  const bill = state.legislatureRuntime.bills[nextId];
  if (!bill) {
    state.legislatureRuntime.floorQueue.shift();
    return events;
  }
  const stage: LegislativeVoteStage = bill.status === "repassage_scheduled" ? "repassage" : "floor";
  if (bill.status !== "floor_scheduled" && bill.status !== "repassage_scheduled") return events;
  if (!stageIsRipe(state, bill.stageReadyDate)) return events;
  if (hasUnripeAmendments(state, bill)) return events;
  events.push(...resolveRipeAmendments(state, world, rng, bill, stage, commandId));
  if (proposedAmendments(state, bill).length > 0) return events;
  const mps = currentAssemblyMemberIds(world, state);
  const pending = mps.includes(state.playerPoliticianId)
    ? takePendingVotes(state, bill.id, stage)
    : {};
  const votes: Record<string, LegislativeVoteChoice> = {};
  for (const id of mps) {
    if (id === state.playerPoliticianId) {
      votes[id] = pending[id] ?? "abstain";
      continue;
    }
    votes[id] = chooseLegislativeVote(world, state, id, bill, rng);
  }
  const out = recordVote(world, state, { billId: bill.id, stage, votes }, commandId);
  if (!("error" in out)) events.push(...out.events);
  state.legislatureRuntime.floorQueue = state.legislatureRuntime.floorQueue.filter(
    (id) => id !== bill.id,
  );
  return events;
}

function presidentialWork(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const president = currentPresidentialAuthorityId(world, state);
  if (!president) return events;
  const bills = Object.values(state.legislatureRuntime.bills)
    .filter((b) => b.status === "sent_to_president")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const bill of bills.slice(0, 2)) {
    if (president === state.playerPoliticianId) continue;
    const choice = choosePresidentDisposition(world, state, president, bill, rng);
    const out =
      choice === "return"
        ? returnBill(world, state, { billId: bill.id, actorId: president }, commandId)
        : signBill(world, state, { billId: bill.id, actorId: president }, commandId);
    if (!("error" in out)) events.push(...out.events);
  }
  return events;
}

export function processLegislatureMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  if (currentAssemblyMemberIds(world, state).length === 0) return [];
  const month = monthStart(state.currentDate);
  if (state.legislatureRuntime.lastMonthProcessed === month) return [];
  seedCommitteesIfNeeded(world, state);
  const events: SimEvent[] = [];
  events.push(...npcIntroductions(state, world, rng, commandId));
  events.push(...committeeWork(state, world, rng, commandId));
  events.push(...floorWork(state, world, rng, commandId));
  events.push(...presidentialWork(state, world, rng, commandId));
  state.legislatureRuntime.lastMonthProcessed = month;
  return events;
}
