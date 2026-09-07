/**
 * partyOrg.deferred.test.ts
 *
 * Unified PendingPartyAction: approve executes once; reject does not; cast after pending.
 */
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { jsonClone } from "./hash.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  allocatePartySupport,
  endorseCandidate,
  proposePlatformPlank,
} from "./partyOrg/commands.js";
import { PLATFORM_POLICY_OPTIONS } from "./partyOrg/catalog.js";
import { castNationalCommitteeVote, seedNationalCommittee } from "./partyOrg/committee.js";
import { executePendingPartyAction, findPendingActionByVoteId } from "./partyOrg/pendingActions.js";
import { ensureDefaultOfficers } from "./partyOrg/officers.js";
import { defaultPartyRules } from "./partyOrg/rules.js";
import { ensurePartyOrgRuntime } from "./partyOrg/state.js";
import { ensureCaucusRuntime } from "./caucus/state.js";
import { recomputeCaucusShares } from "./caucus/shares.js";
import type { SimState } from "./types.js";

function setup(seed: string) {
  const world = loadTerenaWorld();
  const sim = createSimulation({ world, seed, playerPoliticianId: "NPC146" });
  const state = jsonClone(sim.getSnapshot()) as SimState;
  ensurePartyOrgRuntime(state);
  ensureDefaultOfficers(world, state);
  ensureCaucusRuntime(state);
  recomputeCaucusShares(world, state);
  return { world, state };
}

function partyWithChair(state: SimState): { partyId: string; chairId: string } {
  const runtime = ensurePartyOrgRuntime(state);
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const chairId = runtime.officers[partyId]?.chair?.politicianId;
    if (!chairId) continue;
    const members = Object.values(state.politicians).filter(
      (p) => p.partyId === partyId && p.alive && !p.retired,
    ).length;
    if (members >= 12) return { partyId, chairId };
  }
  throw new Error("No suitable party with chair");
}

function putPlayerOnCommittee(
  state: SimState,
  partyId: string,
  world: Parameters<typeof seedNationalCommittee>[0],
) {
  const runtime = ensurePartyOrgRuntime(state);
  runtime.nationalCommittee[partyId] = [];
  const roster = seedNationalCommittee(world, state, partyId);
  runtime.nationalCommittee[partyId] = [
    state.playerPoliticianId,
    ...roster.filter((id) => id !== state.playerPoliticianId),
  ].slice(0, 24);
  state.politicians[state.playerPoliticianId]!.partyId = partyId;
}

describe("partyOrg deferred pending actions", () => {
  it("approve executes deferred allocate_support exactly once", () => {
    const { world, state } = setup("deferred-approve");
    const { partyId, chairId } = partyWithChair(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: true,
    };
    putPlayerOnCommittee(state, partyId, world);

    const pending = allocatePartySupport(state, world, {
      actorId: chairId,
      partyId,
      allocations: { presidential: 0.4, assembly: 0.6 },
      commandId: "CMD_ALLOC",
    });
    expect(pending.ok).toBe(false);
    if (pending.ok) return;
    expect(pending.error.code).toBe("COMMITTEE_PENDING_PLAYER");

    const actions = Object.values(runtime.pendingActions);
    expect(actions.length).toBe(1);
    const action = actions[0]!;
    expect(action.actionType).toBe("allocate_support");
    expect(action.status).toBe("awaiting_committee");
    expect(action.committeeVoteId).toBeTruthy();
    expect(runtime.supportAllocations[partyId]).toBeUndefined();

    const cast = castNationalCommitteeVote(state, world, {
      voteId: action.committeeVoteId!,
      choice: "yes",
      commandId: "CMD_CAST",
    });
    expect(cast.ok).toBe(true);
    if (!cast.ok) return;
    expect(cast.passed).toBe(true);
    expect(action.status).toBe("executed");
    expect(action.executedDate).toBe(state.currentDate);
    expect(runtime.supportAllocations[partyId]).toBeTruthy();

    const again = executePendingPartyAction(state, world, action.id, "CMD_AGAIN");
    expect(again.ok).toBe(true);
    expect(action.status).toBe("executed");
  });

  it("reject does not execute deferred platform plank", () => {
    const { world, state } = setup("deferred-reject");
    const { partyId, chairId } = partyWithChair(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: true,
    };
    putPlayerOnCommittee(state, partyId, world);

    for (const memberId of runtime.nationalCommittee[partyId]!) {
      if (memberId === chairId || memberId === state.playerPoliticianId) continue;
      if (!state.relationships[memberId]) state.relationships[memberId] = {};
      state.relationships[memberId]![chairId] = {
        sourceId: memberId,
        targetId: chairId,
        affinity: -0.95,
        trust: -0.5,
        respect: -0.4,
        lastUpdatedDate: state.currentDate,
        interactionCount: 1,
      };
    }

    const laborOpts = PLATFORM_POLICY_OPTIONS.labor;
    expect(laborOpts?.length).toBeGreaterThan(0);

    const proposed = proposePlatformPlank(state, world, {
      actorId: chairId,
      partyId,
      issueId: "labor",
      optionId: laborOpts![0]!.id,
      commandId: "CMD_PLANK",
    });
    expect(proposed.ok).toBe(false);
    if (proposed.ok) return;
    expect(proposed.error.code).toBe("COMMITTEE_PENDING_PLAYER");

    const action = Object.values(runtime.pendingActions).find(
      (a) => a.actionType === "platform_plank" && a.status === "awaiting_committee",
    );
    expect(action).toBeTruthy();
    const voteId = action!.committeeVoteId!;
    expect(findPendingActionByVoteId(state, voteId)?.id).toBe(action!.id);

    // Force NPC tally so player "no" cannot be overturned by friendly NPCs.
    const pendingVote = runtime.pendingCommitteeVotes[voteId]!;
    pendingVote.npcYes = 1;
    pendingVote.npcNo = 10;
    pendingVote.npcAbstain = 0;

    const cast = castNationalCommitteeVote(state, world, {
      voteId,
      choice: "no",
      commandId: "CMD_CAST_NO",
    });
    expect(cast.ok).toBe(true);
    if (!cast.ok) return;
    expect(cast.passed).toBe(false);
    expect(action!.status).toBe("rejected");
    expect(runtime.platformPlanks[partyId]?.labor).toBeUndefined();
  });

  it("cast after pending endorses candidate", () => {
    const { world, state } = setup("deferred-endorse");
    const { partyId, chairId } = partyWithChair(state);
    const runtime = ensurePartyOrgRuntime(state);
    runtime.metadata[`rules_${partyId}`] = {
      ...defaultPartyRules(partyId),
      nationalCommitteeApprovalRequired: true,
    };
    putPlayerOnCommittee(state, partyId, world);

    for (const memberId of runtime.nationalCommittee[partyId]!) {
      if (memberId === chairId || memberId === state.playerPoliticianId) continue;
      if (!state.relationships[memberId]) state.relationships[memberId] = {};
      state.relationships[memberId]![chairId] = {
        sourceId: memberId,
        targetId: chairId,
        affinity: 0.9,
        trust: 0.6,
        respect: 0.5,
        lastUpdatedDate: state.currentDate,
        interactionCount: 1,
      };
    }

    const pending = endorseCandidate(state, world, {
      actorId: chairId,
      partyId,
      contestId: "CONTEST_TEST",
      candidateId: chairId,
      commandId: "CMD_END",
    });
    expect(pending.ok).toBe(false);
    if (pending.ok) return;
    expect(pending.error.code).toBe("COMMITTEE_PENDING_PLAYER");
    expect(runtime.partyEndorsements.CONTEST_TEST).toBeUndefined();

    const action = Object.values(runtime.pendingActions).find(
      (a) => a.actionType === "endorse_candidate",
    )!;
    const cast = castNationalCommitteeVote(state, world, {
      voteId: action.committeeVoteId!,
      choice: "yes",
      commandId: "CMD_CAST_END",
    });
    expect(cast.ok).toBe(true);
    if (!cast.ok) return;
    expect(cast.passed).toBe(true);
    expect(action.status).toBe("executed");
    expect(runtime.partyEndorsements.CONTEST_TEST?.candidateId).toBe(chairId);
  });
});
