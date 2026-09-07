import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { JsonObject } from "../json.js";
import type { IsoDate } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import { recordOrganizationPolicyBehavior } from "../organizations/monthly.js";
import { pushHistory } from "../scheduler.js";
import type {
  AmendmentState,
  BillState,
  CommitteeId,
  EnactedLawRecord,
  LawProvenanceAction,
  LegislativeVoteChoice,
  LegislativeVoteRecord,
  LegislativeVoteStage,
  PolicyItem,
  ProvisionEnactmentRecord,
} from "./types.js";
import { pendingVoteKey } from "./types.js";
import {
  concretePolicyItem,
  foundingOptionId,
  isNoOpProvisionChoice,
  naturalBillCopy,
  previousProvisionOptionId,
  restoreOptionForRepealedAct,
} from "./provisions.js";
import { assessBillConstitutionality, constitutionalityRejection } from "./constitutionality.js";
import { absoluteMajorityNeeded, committeeForDimension, LEGISLATURE } from "./policy.js";
import {
  allocateAmendmentId,
  allocateBillId,
  allocateLawId,
  allocateLegislativeVoteId,
  currentAssemblyMemberIds,
  currentPresidentialAuthorityId,
  currentSpeakerId,
} from "./state.js";

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
  importance = 0.55,
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

export function primaryIssueId(bill: BillState): string | null {
  return bill.policyItems[0]?.issueId ?? null;
}

export function assignCommitteeForBill(world: KernelWorld, bill: BillState): CommitteeId {
  const issueId = primaryIssueId(bill);
  const dim = issueId ? (world.issueDimensions[issueId] ?? "institutional") : "institutional";
  return committeeForDimension(dim);
}

function normalizePolicyItems(
  world: KernelWorld,
  items: readonly PolicyItem[],
): PolicyItem[] | { error: CommandError } {
  if (items.length < 1) return { error: reject("INVALID_BILL", "bill needs a policy item") };
  if (items.length > 8)
    return { error: reject("INVALID_BILL", "a bill may contain at most eight provisions") };
  const out: PolicyItem[] = [];
  for (const item of items) {
    if (!world.issueIds.includes(item.issueId) && Object.keys(world.issueDimensions).length > 0) {
      if (!world.issueDimensions[item.issueId]) {
        return { error: reject("UNKNOWN_ISSUE", item.issueId) };
      }
    }
    const direction = item.direction < 0 ? -1 : item.direction > 0 ? 1 : 0;
    const magnitude = Math.max(0, Math.min(1, item.magnitude));
    const concrete = concretePolicyItem(item);
    out.push({
      issueId: item.issueId,
      ...(concrete.provisionId ? { provisionId: concrete.provisionId } : {}),
      ...(concrete.optionId ? { optionId: concrete.optionId } : {}),
      direction,
      magnitude,
      fiscalImpact: item.fiscalImpact == null ? null : item.fiscalImpact,
      ...(concrete.dimensionEffects
        ? { dimensionEffects: { ...concrete.dimensionEffects } }
        : item.dimensionEffects
          ? { dimensionEffects: { ...item.dimensionEffects } }
          : {}),
    });
  }
  const provisionIds = out.flatMap((item) => (item.provisionId ? [item.provisionId] : []));
  if (new Set(provisionIds).size !== provisionIds.length) {
    return { error: reject("INVALID_BILL", "a policy category may appear only once in a bill") };
  }
  return out;
}

export function introduceBill(
  world: KernelWorld,
  state: SimState,
  args: {
    sponsorId: string;
    policyItems: readonly PolicyItem[];
    title?: string;
    summary?: string;
    cosponsorIds?: readonly string[];
    /** Lawbook Amend / Replace / Repeal provenance linkage. */
    lawAction?: LawProvenanceAction;
    targetLawId?: string;
    metadata?: JsonObject;
  },
  commandId: string | null,
): { bill: BillState; events: SimEvent[] } | { error: CommandError } {
  const sponsor = state.politicians[args.sponsorId];
  if (!sponsor?.alive || sponsor.retired) {
    return { error: reject("INELIGIBLE", args.sponsorId) };
  }
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.sponsorId)) return { error: reject("NOT_AN_MP", args.sponsorId) };
  const items = normalizePolicyItems(world, args.policyItems);
  if ("error" in items) return items;
  const constitutionality = assessBillConstitutionality(state, world, items);
  const constitutionalReject = constitutionalityRejection(constitutionality);
  if (constitutionalReject) {
    return { error: reject(constitutionalReject.code, constitutionalReject.message) };
  }
  for (const item of items) {
    if (
      args.lawAction !== "repeal" &&
      item.provisionId &&
      item.optionId &&
      isNoOpProvisionChoice(state, item.provisionId, item.optionId)
    ) {
      return {
        error: reject(
          "NO_POLICY_CHANGE",
          `${item.provisionId} already matches current law; remove no-op proposals`,
        ),
      };
    }
  }
  const active = Object.values(state.legislatureRuntime.bills).filter((b) =>
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
  if (active >= LEGISLATURE.maxActiveBills) {
    return { error: reject("LEGISLATIVE_CAPACITY", "too many active bills") };
  }
  const cos = [...new Set(args.cosponsorIds ?? [])]
    .filter((id) => id !== args.sponsorId && mps.has(id))
    .sort();
  const copy = naturalBillCopy(state, items);
  const billMetadata: JsonObject = { ...(args.metadata ?? {}) };
  if (args.lawAction) billMetadata.lawAction = args.lawAction;
  if (args.targetLawId) billMetadata.targetLawId = args.targetLawId;
  if (constitutionality.status !== "no_obvious_conflict") {
    billMetadata.constitutionalityStatus = constitutionality.status;
  }
  if (Object.keys(constitutionality.itemWarnings).length > 0) {
    billMetadata.constitutionalityWarnings = constitutionality.itemWarnings;
  }
  if (args.lawAction === "repeal" || args.lawAction === "replace") {
    const targetId = args.targetLawId;
    if (!targetId || !state.legislatureRuntime.enactedLaws[targetId]) {
      return { error: reject("UNKNOWN_LAW", args.targetLawId ?? "missing target law") };
    }
  }
  const bill: BillState = {
    id: allocateBillId(state),
    sponsorId: args.sponsorId,
    cosponsorIds: cos,
    introducedDate: state.currentDate,
    title: args.title?.trim() || copy.title,
    summary: args.summary?.trim() || copy.summary,
    policyItems: items,
    assignedCommitteeId: null,
    status: "committee",
    amendmentIds: [],
    committeeVoteId: null,
    floorVoteId: null,
    presidentialDisposition: "none",
    repassageVoteId: null,
    enactedDate: null,
    enactedLawId: null,
    stageReadyDate: state.currentDate,
    metadata: billMetadata,
    version: 1,
    versionHistory: [
      {
        version: 1,
        date: state.currentDate,
        reason: "introduced",
        amendmentId: null,
        policyItems: items.map((item) => ({ ...item })),
      },
    ],
  };
  bill.assignedCommitteeId = assignCommitteeForBill(world, bill);
  state.legislatureRuntime.bills[bill.id] = bill;
  recordOrganizationPolicyBehavior(world, state, {
    politicianId: bill.sponsorId,
    policyItems: bill.policyItems,
    behavior: "sponsor",
  });
  return {
    bill,
    events: [
      event(
        state,
        "BILL_INTRODUCED",
        [args.sponsorId, ...cos],
        [bill.id],
        {
          billId: bill.id,
          committeeId: bill.assignedCommitteeId,
          issueId: items[0]!.issueId,
        },
        commandId,
        0.65,
      ),
    ],
  };
}

export function proposeAmendment(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; sponsorId: string; policyItems: readonly PolicyItem[] },
  commandId: string | null,
): { amendment: AmendmentState; events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (!["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status)) {
    return { error: reject("INVALID_BILL", `cannot amend ${bill.status}`) };
  }
  if (bill.amendmentIds.length >= LEGISLATURE.maxAmendmentsPerBill) {
    return { error: reject("AMENDMENT_LIMIT", args.billId) };
  }
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.sponsorId)) return { error: reject("NOT_AN_MP", args.sponsorId) };
  const items = normalizePolicyItems(world, args.policyItems);
  if ("error" in items) return items;
  const amendment: AmendmentState = {
    id: allocateAmendmentId(state),
    billId: bill.id,
    sponsorId: args.sponsorId,
    date: state.currentDate,
    policyItems: items,
    status: "proposed",
    metadata: {},
    targetProvisionIds: items.map((item) => item.provisionId ?? item.issueId),
  };
  state.legislatureRuntime.amendments[amendment.id] = amendment;
  bill.amendmentIds = [...bill.amendmentIds, amendment.id];
  return {
    amendment,
    events: [
      event(
        state,
        "AMENDMENT_PROPOSED",
        [args.sponsorId],
        [bill.id, amendment.id],
        { billId: bill.id, amendmentId: amendment.id },
        commandId,
        0.35,
      ),
    ],
  };
}

export function stageIsRipe(state: SimState, readyDate: IsoDate | null): boolean {
  if (!readyDate) return false;
  return monthStart(readyDate) < monthStart(state.currentDate);
}

export function adoptAmendment(
  state: SimState,
  amendmentId: string,
  commandId: string | null,
): SimEvent[] {
  const amendment = state.legislatureRuntime.amendments[amendmentId];
  if (!amendment || amendment.status !== "proposed") return [];
  const bill = state.legislatureRuntime.bills[amendment.billId];
  if (!bill) return [];
  amendment.status = "adopted";
  const next = bill.policyItems.map((item) => ({ ...item }));
  for (const replacement of amendment.policyItems) {
    const index = next.findIndex((item) =>
      replacement.provisionId
        ? item.provisionId === replacement.provisionId
        : item.issueId === replacement.issueId,
    );
    if (index >= 0) next[index] = { ...replacement };
    else if (next.length < 3) next.push({ ...replacement });
  }
  bill.policyItems = next;
  bill.version += 1;
  bill.versionHistory.push({
    version: bill.version,
    date: state.currentDate,
    reason: "amendment_adopted",
    amendmentId: amendment.id,
    policyItems: next.map((item) => ({ ...item })),
  });
  return [
    event(
      state,
      "AMENDMENT_ADOPTED",
      [amendment.sponsorId],
      [bill.id, amendment.id],
      { billId: bill.id, amendmentId: amendment.id },
      commandId,
      0.45,
    ),
  ];
}

export function rejectAmendment(
  state: SimState,
  amendmentId: string,
  commandId: string | null,
): SimEvent[] {
  const amendment = state.legislatureRuntime.amendments[amendmentId];
  if (!amendment || amendment.status !== "proposed") return [];
  const bill = state.legislatureRuntime.bills[amendment.billId];
  if (!bill) return [];
  amendment.status = "rejected";
  return [
    event(
      state,
      "AMENDMENT_REJECTED",
      [amendment.sponsorId],
      [bill.id, amendment.id],
      { billId: bill.id, amendmentId: amendment.id },
      commandId,
      0.4,
    ),
  ];
}

function tallyChoices(votes: Record<string, LegislativeVoteChoice>): {
  yes: number;
  no: number;
  abstain: number;
} {
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(votes)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  return { yes, no, abstain };
}

function affiliationSnapshot(
  state: SimState,
  votes: Record<string, LegislativeVoteChoice>,
): Pick<LegislativeVoteRecord, "partyIdsAtVote" | "factionIdsAtVote"> {
  return {
    partyIdsAtVote: Object.fromEntries(
      Object.keys(votes).map((id) => [id, state.politicians[id]?.partyId ?? null]),
    ),
    factionIdsAtVote: Object.fromEntries(
      Object.keys(votes).map((id) => [id, state.politicians[id]?.factionId ?? null]),
    ),
  };
}

export function recordAmendmentVote(
  world: KernelWorld,
  state: SimState,
  args: {
    billId: string;
    amendmentId: string;
    stage: LegislativeVoteStage;
    votes: Record<string, LegislativeVoteChoice>;
    committeeId?: CommitteeId | null;
  },
  commandId: string | null,
): { vote: LegislativeVoteRecord; events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  const amendment = state.legislatureRuntime.amendments[args.amendmentId];
  if (!amendment || amendment.billId !== bill.id) {
    return { error: reject("UNKNOWN_AMENDMENT", args.amendmentId) };
  }
  if (amendment.status !== "proposed") {
    return { error: reject("INVALID_AMENDMENT", amendment.status) };
  }
  const { yes, no, abstain } = tallyChoices(args.votes);
  const passed = yes + no > 0 && yes > no;
  const vote: LegislativeVoteRecord = {
    id: allocateLegislativeVoteId(state),
    billId: bill.id,
    stage: args.stage,
    date: state.currentDate,
    committeeId: args.committeeId ?? null,
    votes: { ...args.votes },
    ...affiliationSnapshot(state, args.votes),
    yes,
    no,
    abstain,
    passed,
    threshold: "simple_majority_cast",
    metadata: { amendmentId: amendment.id, kind: "amendment" },
  };
  state.legislatureRuntime.legislativeVotes[vote.id] = vote;
  const playerChoice = args.votes[state.playerPoliticianId];
  if (playerChoice) {
    recordOrganizationPolicyBehavior(world, state, {
      politicianId: state.playerPoliticianId,
      policyItems: bill.policyItems,
      behavior: "vote",
      voteChoice: playerChoice,
    });
  }
  amendment.metadata = { ...amendment.metadata, voteId: vote.id };
  const events = passed
    ? adoptAmendment(state, amendment.id, commandId)
    : rejectAmendment(state, amendment.id, commandId);
  events.unshift(
    event(
      state,
      passed ? "AMENDMENT_VOTE_PASSED" : "AMENDMENT_VOTE_FAILED",
      [amendment.sponsorId],
      [bill.id, amendment.id, vote.id],
      { billId: bill.id, amendmentId: amendment.id, voteId: vote.id, yes, no, abstain },
      commandId,
      0.4,
    ),
  );
  return { vote, events };
}

export function recordVote(
  world: KernelWorld,
  state: SimState,
  args: {
    billId: string;
    stage: LegislativeVoteStage;
    votes: Record<string, LegislativeVoteChoice>;
    committeeId?: CommitteeId | null;
  },
  commandId: string | null,
): { vote: LegislativeVoteRecord; events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  const { yes, no, abstain } = tallyChoices(args.votes);
  const threshold = args.stage === "repassage" ? "absolute_majority" : "simple_majority_cast";
  const needed = absoluteMajorityNeeded(world);
  let passed = false;
  if (threshold === "absolute_majority") {
    passed = yes >= needed;
  } else {
    passed = yes + no > 0 && yes > no;
  }
  const vote: LegislativeVoteRecord = {
    id: allocateLegislativeVoteId(state),
    billId: bill.id,
    stage: args.stage,
    date: state.currentDate,
    committeeId: args.committeeId ?? null,
    votes: { ...args.votes },
    ...affiliationSnapshot(state, args.votes),
    yes,
    no,
    abstain,
    passed,
    threshold,
    metadata: {},
  };
  state.legislatureRuntime.legislativeVotes[vote.id] = vote;
  const playerChoice = args.votes[state.playerPoliticianId];
  if (playerChoice) {
    recordOrganizationPolicyBehavior(world, state, {
      politicianId: state.playerPoliticianId,
      policyItems: bill.policyItems,
      behavior: "vote",
      voteChoice: playerChoice,
    });
  }
  const events: SimEvent[] = [];
  if (args.stage === "committee") {
    bill.committeeVoteId = vote.id;
    bill.status = passed ? "committee_passed" : "committee_failed";
    events.push(
      event(
        state,
        passed ? "BILL_COMMITTEE_PASSED" : "BILL_COMMITTEE_FAILED",
        [bill.sponsorId],
        [bill.id, vote.id],
        { billId: bill.id, voteId: vote.id, yes, no, abstain },
        commandId,
      ),
    );
    if (passed) {
      bill.status = "floor_scheduled";
      bill.stageReadyDate = state.currentDate;
      if (!state.legislatureRuntime.floorQueue.includes(bill.id)) {
        state.legislatureRuntime.floorQueue.push(bill.id);
      }
    }
  } else if (args.stage === "floor") {
    bill.floorVoteId = vote.id;
    bill.status = passed ? "floor_passed" : "floor_failed";
    events.push(
      event(
        state,
        passed ? "BILL_FLOOR_PASSED" : "BILL_FLOOR_FAILED",
        [bill.sponsorId],
        [bill.id, vote.id],
        { billId: bill.id, voteId: vote.id, yes, no, abstain },
        commandId,
        0.7,
      ),
    );
    if (passed) {
      bill.status = "sent_to_president";
      bill.presidentialDisposition = "pending";
    }
  } else {
    bill.repassageVoteId = vote.id;
    bill.status = passed ? "repassed" : "repassage_failed";
    events.push(
      event(
        state,
        passed ? "BILL_REPASSED" : "BILL_REPASSAGE_FAILED",
        [bill.sponsorId],
        [bill.id, vote.id],
        {
          billId: bill.id,
          voteId: vote.id,
          yes,
          no,
          abstain,
          needed,
        },
        commandId,
        0.8,
      ),
    );
    if (passed) events.push(...enactLaw(state, bill, commandId));
  }
  return { vote, events };
}

export function signBill(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (bill.status !== "sent_to_president") {
    return { error: reject("INVALID_BILL", bill.status) };
  }
  const president = currentPresidentialAuthorityId(world, state);
  if (president !== args.actorId) return { error: reject("NOT_PRESIDENT", args.actorId) };
  bill.presidentialDisposition = "signed";
  bill.status = "signed";
  recordOrganizationPolicyBehavior(world, state, {
    politicianId: args.actorId,
    policyItems: bill.policyItems,
    behavior: "sign",
  });
  const events = [
    event(state, "BILL_SIGNED", [args.actorId], [bill.id], { billId: bill.id }, commandId, 0.85),
  ];
  events.push(...enactLaw(state, bill, commandId));
  return { events };
}

export function returnBill(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (bill.status !== "sent_to_president") {
    return { error: reject("INVALID_BILL", bill.status) };
  }
  const president = currentPresidentialAuthorityId(world, state);
  if (president !== args.actorId) return { error: reject("NOT_PRESIDENT", args.actorId) };
  bill.presidentialDisposition = "returned";
  bill.status = "repassage_scheduled";
  recordOrganizationPolicyBehavior(world, state, {
    politicianId: args.actorId,
    policyItems: bill.policyItems,
    behavior: "veto",
  });
  bill.stageReadyDate = state.currentDate;
  state.legislatureRuntime.floorQueue = [
    bill.id,
    ...state.legislatureRuntime.floorQueue.filter((id) => id !== bill.id),
  ];
  return {
    events: [
      event(
        state,
        "BILL_RETURNED",
        [args.actorId],
        [bill.id],
        { billId: bill.id },
        commandId,
        0.85,
      ),
    ],
  };
}

function stackFor(state: SimState, provisionId: string): ProvisionEnactmentRecord[] {
  const existing = state.legislatureRuntime.provisionHistory[provisionId];
  if (existing) return existing;
  const created: ProvisionEnactmentRecord[] = [];
  state.legislatureRuntime.provisionHistory[provisionId] = created;
  return created;
}

function markLawNonOperative(state: SimState, lawId: string, successorLawId: string | null): void {
  const law = state.legislatureRuntime.enactedLaws[lawId];
  if (!law || !law.operative) return;
  law.operative = false;
  law.metadata = {
    ...law.metadata,
    supersededByLawId: successorLawId,
    supersededDate: state.currentDate,
  };
}

/** Pop every stack frame written by `lawId` (Act repeal / replace). */
function popActFromProvisionStacks(state: SimState, lawId: string): void {
  const history = state.legislatureRuntime.provisionHistory;
  for (const provisionId of Object.keys(history)) {
    const stack = history[provisionId];
    if (!stack?.length) {
      delete history[provisionId];
      continue;
    }
    const next = stack.filter((entry) => entry.lawId !== lawId);
    if (next.length === 0) delete history[provisionId];
    else history[provisionId] = next;
  }
}

function pushProvisionEnactments(state: SimState, law: EnactedLawRecord): void {
  for (const item of law.policyItems) {
    if (!item.provisionId || !item.optionId) continue;
    const stack = stackFor(state, item.provisionId);
    const previousOptionId = stack.at(-1)?.optionId ?? foundingOptionId(item.provisionId) ?? null;
    if (previousOptionId === item.optionId) continue;
    stack.push({
      lawId: law.id,
      optionId: item.optionId,
      enactedDate: law.enactedDate,
      previousOptionId,
    });
  }
}

function applyLawProvenance(
  state: SimState,
  law: EnactedLawRecord,
  billMetadata: JsonObject,
): void {
  const action = typeof billMetadata.lawAction === "string" ? billMetadata.lawAction : null;
  const targetLawId =
    typeof billMetadata.targetLawId === "string" ? billMetadata.targetLawId : null;

  if (action === "repeal" && targetLawId) {
    markLawNonOperative(state, targetLawId, law.id);
    popActFromProvisionStacks(state, targetLawId);
    law.metadata = {
      ...law.metadata,
      lawAction: "repeal",
      targetLawId,
      restoresPriorRules: true,
    };
    // Repeal restores prior stack entries; do not push the repeal Act as a new setter.
    return;
  }

  if (action === "replace" && targetLawId) {
    markLawNonOperative(state, targetLawId, law.id);
    popActFromProvisionStacks(state, targetLawId);
    law.metadata = {
      ...law.metadata,
      lawAction: "replace",
      targetLawId,
      replacesLawId: targetLawId,
    };
    pushProvisionEnactments(state, law);
    return;
  }

  if (action === "amend" && targetLawId) {
    law.metadata = {
      ...law.metadata,
      lawAction: "amend",
      targetLawId,
      amendsLawId: targetLawId,
    };
  }
  pushProvisionEnactments(state, law);
}

/** Apply provenance stack updates for an already-recorded enacted law. */
export function applyEnactedLawProvenance(
  state: SimState,
  law: EnactedLawRecord,
  billMetadata: JsonObject = {},
): void {
  applyLawProvenance(state, law, billMetadata);
}

function enactLaw(state: SimState, bill: BillState, commandId: string | null): SimEvent[] {
  const law: EnactedLawRecord = {
    id: allocateLawId(state),
    billId: bill.id,
    title: bill.title,
    policyItems: bill.policyItems.map((p) => ({ ...p })),
    amendmentIds: [...bill.amendmentIds],
    floorVoteId: bill.floorVoteId,
    repassageVoteId: bill.repassageVoteId,
    presidentialDisposition: bill.presidentialDisposition,
    enactedDate: state.currentDate,
    sponsorId: bill.sponsorId,
    eventIds: [],
    operative: true,
    invalidatedByDecisionId: null,
    metadata: {},
  };
  const ev = event(
    state,
    "LAW_ENACTED",
    [bill.sponsorId],
    [bill.id, law.id],
    {
      billId: bill.id,
      lawId: law.id,
      ...(typeof bill.metadata.lawAction === "string"
        ? { lawAction: bill.metadata.lawAction }
        : {}),
      ...(typeof bill.metadata.targetLawId === "string"
        ? { targetLawId: bill.metadata.targetLawId }
        : {}),
    },
    commandId,
    0.95,
  );
  law.eventIds = [ev.id];
  state.legislatureRuntime.enactedLaws[law.id] = law;
  applyLawProvenance(state, law, bill.metadata);
  bill.status = "enacted";
  bill.enactedDate = state.currentDate;
  bill.enactedLawId = law.id;
  state.legislatureRuntime.floorQueue = state.legislatureRuntime.floorQueue.filter(
    (id) => id !== bill.id,
  );
  return [ev];
}

/** Restore option that Repeal should propose for a provision of a target Act. */
export function repealRestoreOptionId(
  state: SimState,
  provisionId: string,
  targetLawId?: string,
): string | null {
  if (targetLawId) return restoreOptionForRepealedAct(state, provisionId, targetLawId);
  return previousProvisionOptionId(state, provisionId);
}

export function castPlayerVote(
  world: KernelWorld,
  state: SimState,
  args: {
    billId: string;
    actorId: string;
    choice: LegislativeVoteChoice;
    stage: LegislativeVoteStage;
    amendmentId?: string | null;
  },
): { error: CommandError } | { ok: true } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (args.actorId !== state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "only the player casts this command") };
  }
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.actorId)) return { error: reject("NOT_AN_MP", args.actorId) };
  const amendmentId = args.amendmentId ?? null;
  if (amendmentId) {
    const amendment = state.legislatureRuntime.amendments[amendmentId];
    if (!amendment || amendment.billId !== bill.id) {
      return { error: reject("UNKNOWN_AMENDMENT", amendmentId) };
    }
    if (amendment.status !== "proposed") {
      return { error: reject("INVALID_AMENDMENT", amendment.status) };
    }
  }
  if (args.stage === "committee") {
    if (bill.status !== "committee") {
      return { error: reject("INVALID_STAGE", `committee vote not pending for ${bill.status}`) };
    }
    const committee = bill.assignedCommitteeId
      ? state.legislatureRuntime.committees[bill.assignedCommitteeId]
      : null;
    if (!committee?.memberIds.includes(args.actorId)) {
      return { error: reject("NOT_COMMITTEE_MEMBER", args.actorId) };
    }
  } else if (args.stage === "floor") {
    if (bill.status !== "floor_scheduled") {
      return { error: reject("INVALID_STAGE", `floor vote not pending for ${bill.status}`) };
    }
  } else if (args.stage === "repassage") {
    if (bill.status !== "repassage_scheduled") {
      return { error: reject("INVALID_STAGE", `repassage vote not pending for ${bill.status}`) };
    }
  } else {
    return { error: reject("INVALID_STAGE", args.stage) };
  }
  const key = pendingVoteKey(bill.id, args.stage, amendmentId);
  state.legislatureRuntime.pendingPlayerVotes[key] = {
    billId: bill.id,
    stage: args.stage,
    choice: args.choice,
    amendmentId,
  };
  return { ok: true };
}

export function takePendingVotes(
  state: SimState,
  billId: string,
  stage: LegislativeVoteStage,
  amendmentId: string | null = null,
): Record<string, LegislativeVoteChoice> {
  const key = pendingVoteKey(billId, stage, amendmentId);
  const pending = state.legislatureRuntime.pendingPlayerVotes[key];
  delete state.legislatureRuntime.pendingPlayerVotes[key];
  if (!pending || pending.choice == null) return {};
  return { [state.playerPoliticianId]: pending.choice };
}

export function cosponsorBill(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  const mps = new Set(currentAssemblyMemberIds(world, state));
  if (!mps.has(args.actorId)) return { error: reject("NOT_AN_MP", args.actorId) };
  if (bill.sponsorId === args.actorId) return { error: reject("INVALID_BILL", "already sponsor") };
  if (!bill.cosponsorIds.includes(args.actorId)) {
    bill.cosponsorIds = [...bill.cosponsorIds, args.actorId].sort();
  }
  return {
    events: [
      event(
        state,
        "BILL_COSPONSORED",
        [args.actorId],
        [bill.id],
        { billId: bill.id },
        commandId,
        0.3,
      ),
    ],
  };
}

export function scheduleBill(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const speaker = currentSpeakerId(world, state);
  if (speaker !== args.actorId) return { error: reject("NOT_SPEAKER", args.actorId) };
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (bill.status !== "floor_scheduled" && bill.status !== "repassage_scheduled") {
    return { error: reject("INVALID_BILL", bill.status) };
  }
  state.legislatureRuntime.floorQueue = [
    bill.id,
    ...state.legislatureRuntime.floorQueue.filter((id) => id !== bill.id),
  ];
  return {
    events: [
      event(
        state,
        "BILL_SCHEDULED",
        [args.actorId],
        [bill.id],
        { billId: bill.id },
        commandId,
        0.4,
      ),
    ],
  };
}

export function delayBill(
  world: KernelWorld,
  state: SimState,
  args: { billId: string; actorId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const speaker = currentSpeakerId(world, state);
  if (speaker !== args.actorId) return { error: reject("NOT_SPEAKER", args.actorId) };
  const bill = state.legislatureRuntime.bills[args.billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", args.billId) };
  if (bill.status !== "floor_scheduled" && bill.status !== "repassage_scheduled") {
    return { error: reject("INVALID_BILL", bill.status) };
  }
  const rest = state.legislatureRuntime.floorQueue.filter((id) => id !== bill.id);
  state.legislatureRuntime.floorQueue = [...rest, bill.id];
  return {
    events: [
      event(state, "BILL_DELAYED", [args.actorId], [bill.id], { billId: bill.id }, commandId, 0.35),
    ],
  };
}
