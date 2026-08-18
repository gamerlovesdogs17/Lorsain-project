import type { KernelWorld, PendingInterrupt, SimState } from "./types.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { pendingVoteKey, type LegislativeVoteStage } from "./legislature/types.js";
import { currentPresidentialAuthorityId } from "./executive/state.js";
import { currentCourtJudgeIds } from "./courts/state.js";

export type PlayerDecisionKind =
  | "interrupt"
  | "sign_bill"
  | "committee_vote"
  | "floor_vote"
  | "repassage_vote"
  | "amendment_vote"
  | "motion_vote"
  | "judicial_vote"
  | "confirmation_vote"
  | "impeachment_vote"
  | "recall_vote";

export type PlayerActionableDecision = {
  key: string;
  kind: PlayerDecisionKind;
  label: string;
  billId?: string;
  amendmentId?: string;
  motionId?: string;
  caseId?: string;
  nominationId?: string;
  proceedingId?: string;
  stage?: LegislativeVoteStage;
};

function playerHasCastLegislative(
  state: SimState,
  billId: string,
  stage: LegislativeVoteStage,
  amendmentId: string | null = null,
): boolean {
  const key = pendingVoteKey(billId, stage, amendmentId);
  return state.legislatureRuntime.pendingPlayerVotes[key]?.choice != null;
}

function playerHasCastMotion(state: SimState, motionId: string): boolean {
  return state.executiveRuntime.pendingPlayerMotionVotes[motionId]?.choice != null;
}

function stageForBillStatus(status: string): LegislativeVoteStage | null {
  if (status === "committee") return "committee";
  if (status === "floor_scheduled") return "floor";
  if (status === "repassage_scheduled") return "repassage";
  return null;
}

export function collectPlayerActionableDecisions(
  world: KernelWorld,
  state: SimState,
): PlayerActionableDecision[] {
  const out: PlayerActionableDecision[] = [];
  const playerId = state.playerPoliticianId;
  const mp = currentAssemblyMemberIds(world, state).includes(playerId);
  const president = currentPresidentialAuthorityId(world, state) === playerId;
  const interrupt: PendingInterrupt | null = state.pendingInterrupt;

  if (interrupt) {
    out.push({
      key: `interrupt:${interrupt.code}`,
      kind: "interrupt",
      label: interrupt.message,
    });
  }

  if (president) {
    for (const bill of Object.values(state.legislatureRuntime.bills).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )) {
      if (bill.status !== "sent_to_president") continue;
      out.push({
        key: `sign:${bill.id}`,
        kind: "sign_bill",
        label: `Sign or return: ${bill.title}`,
        billId: bill.id,
      });
    }
  }

  if (mp) {
    const bills = Object.values(state.legislatureRuntime.bills).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    const committeeBills = bills.filter((b) => {
      if (b.status !== "committee" || !b.assignedCommitteeId) return false;
      return (
        state.legislatureRuntime.committees[b.assignedCommitteeId]?.memberIds.includes(playerId) ??
        false
      );
    });
    const floorBills = bills.filter((b) => b.status === "floor_scheduled");
    const repassBills = bills.filter((b) => b.status === "repassage_scheduled");

    for (const bill of committeeBills) {
      if (playerHasCastLegislative(state, bill.id, "committee")) continue;
      out.push({
        key: `committee:${bill.id}`,
        kind: "committee_vote",
        label: `Committee vote: ${bill.title}`,
        billId: bill.id,
        stage: "committee",
      });
    }
    for (const bill of floorBills) {
      if (playerHasCastLegislative(state, bill.id, "floor")) continue;
      out.push({
        key: `floor:${bill.id}`,
        kind: "floor_vote",
        label: `Floor vote: ${bill.title}`,
        billId: bill.id,
        stage: "floor",
      });
    }
    for (const bill of repassBills) {
      if (playerHasCastLegislative(state, bill.id, "repassage")) continue;
      out.push({
        key: `repassage:${bill.id}`,
        kind: "repassage_vote",
        label: `Repassage vote: ${bill.title}`,
        billId: bill.id,
        stage: "repassage",
      });
    }

    const votableParents = [...committeeBills, ...floorBills, ...repassBills];
    for (const amendment of Object.values(state.legislatureRuntime.amendments).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )) {
      if (amendment.status !== "proposed") continue;
      const parent = votableParents.find((b) => b.id === amendment.billId);
      if (!parent) continue;
      const stage = stageForBillStatus(parent.status);
      if (!stage) continue;
      if (playerHasCastLegislative(state, amendment.billId, stage, amendment.id)) continue;
      out.push({
        key: `amendment:${amendment.id}`,
        kind: "amendment_vote",
        label: `Amendment on ${parent.title}`,
        billId: amendment.billId,
        amendmentId: amendment.id,
        stage,
      });
    }

    for (const motion of Object.values(state.executiveRuntime.motions).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )) {
      if (motion.status !== "scheduled") continue;
      if (playerHasCastMotion(state, motion.id)) continue;
      out.push({
        key: `motion:${motion.id}`,
        kind: "motion_vote",
        label: `Motion: ${motion.kind.replace(/_/g, " ")}`,
        motionId: motion.id,
      });
    }
  }

  if (mp) {
    const noms = Object.values(state.constitutionalRuntime.nominations).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    for (const nom of noms) {
      if (nom.status !== "pending_confirmation") continue;
      if (state.constitutionalRuntime.pendingPlayerVotes[`confirmation:${nom.id}`]) continue;
      out.push({
        key: `confirmation:${nom.id}`,
        kind: "confirmation_vote",
        label: `Confirm judicial nominee`,
        nominationId: nom.id,
      });
    }
    const impeachments = Object.values(state.constitutionalRuntime.impeachments).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    for (const rec of impeachments) {
      if (rec.status !== "assembly_pending") continue;
      if (state.constitutionalRuntime.pendingPlayerVotes[`impeachment:${rec.id}`]) continue;
      out.push({
        key: `impeachment:${rec.id}`,
        kind: "impeachment_vote",
        label: `Impeachment vote`,
        proceedingId: rec.id,
      });
    }
    const recalls = Object.values(state.constitutionalRuntime.recalls).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    for (const rec of recalls) {
      if (rec.status !== "referral_pending") continue;
      if (state.constitutionalRuntime.pendingPlayerVotes[`recall:${rec.id}`]) continue;
      out.push({
        key: `recall:${rec.id}`,
        kind: "recall_vote",
        label: `Recall referral vote`,
        proceedingId: rec.id,
      });
    }
  }

  const judge = currentCourtJudgeIds(world, state).includes(playerId);
  if (judge) {
    const cases = Object.values(state.constitutionalRuntime.courtCases).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    for (const courtCase of cases) {
      if (courtCase.status !== "pending") continue;
      if (state.constitutionalRuntime.pendingPlayerVotes[`judicial:${courtCase.id}`]) continue;
      out.push({
        key: `judicial:${courtCase.id}`,
        kind: "judicial_vote",
        label: `Court case: ${courtCase.constitutionalQuestion}`,
        caseId: courtCase.id,
      });
    }
  }

  return out;
}
