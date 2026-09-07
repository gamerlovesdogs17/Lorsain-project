import type { SimState } from "../types.js";
import {
  emptyPartyOrgRuntime,
  CHAIR_ELECTION_STAGES,
  LEADERSHIP_ELECTION_METHODS,
  NATIONAL_OFFICE_ROLES,
  PARTY_DISCIPLINE_KINDS,
  VOTING_SYSTEMS,
  type ChairCandidateProgram,
  type ChairElectionStage,
  type PartyOrgRuntime,
  type PendingCommitteeVote,
  type PendingPartyAction,
  type VotingSystem,
} from "./types.js";
import { PENDING_PARTY_ACTION_STATUSES } from "./types.js";

// ---------------------------------------------------------------------------
// Ensure / lazy-init
// ---------------------------------------------------------------------------

export function ensurePartyOrgRuntime(state: SimState): PartyOrgRuntime {
  if (!state.partyOrgRuntime) {
    state.partyOrgRuntime = emptyPartyOrgRuntime();
  } else {
    const rt = state.partyOrgRuntime;
    if (!rt.nationalCommittee) rt.nationalCommittee = {};
    if (!rt.issueEmphasis) rt.issueEmphasis = {};
    if (!rt.platformPlanks) rt.platformPlanks = {};
    if (!rt.pendingCommitteeVotes) rt.pendingCommitteeVotes = {};
    if (typeof rt.nextPendingCommitteeId !== "number" || rt.nextPendingCommitteeId < 1) {
      rt.nextPendingCommitteeId = 1;
    }
    if (!rt.pendingActions) rt.pendingActions = {};
    if (typeof rt.nextPendingActionId !== "number" || rt.nextPendingActionId < 1) {
      rt.nextPendingActionId = 1;
    }
  }
  return state.partyOrgRuntime;
}

// ---------------------------------------------------------------------------
// Defensive parse (called by save.ts on restore)
// ---------------------------------------------------------------------------

export function parsePartyOrgRuntime(raw: unknown): PartyOrgRuntime | string {
  if (raw == null) return emptyPartyOrgRuntime();
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "partyOrgRuntime must be an object";
  }
  const obj = raw as Record<string, unknown>;
  const base = emptyPartyOrgRuntime();

  if (obj.officers && typeof obj.officers === "object" && !Array.isArray(obj.officers)) {
    // Shallow-validate: only copy roles we know
    const raw_officers = obj.officers as Record<string, unknown>;
    for (const [partyId, roleMap] of Object.entries(raw_officers)) {
      if (!roleMap || typeof roleMap !== "object" || Array.isArray(roleMap)) continue;
      const src = roleMap as Record<string, unknown>;
      const dst: PartyOrgRuntime["officers"][string] = {};
      for (const role of NATIONAL_OFFICE_ROLES) {
        const off = src[role];
        if (!off || typeof off !== "object" || Array.isArray(off)) continue;
        const o = off as Record<string, unknown>;
        if (typeof o.politicianId !== "string" || typeof o.assumedDate !== "string") continue;
        dst[role] = {
          role,
          politicianId: o.politicianId,
          partyId: typeof o.partyId === "string" ? o.partyId : partyId,
          assumedDate: o.assumedDate as string,
        };
      }
      base.officers[partyId] = dst;
    }
  }

  if (obj.priorities && typeof obj.priorities === "object" && !Array.isArray(obj.priorities)) {
    const raw_prio = obj.priorities as Record<string, unknown>;
    for (const [partyId, arr] of Object.entries(raw_prio)) {
      if (Array.isArray(arr)) {
        base.priorities[partyId] = arr.filter((x): x is string => typeof x === "string");
      }
    }
  }

  if (obj.positions && typeof obj.positions === "object" && !Array.isArray(obj.positions)) {
    const raw_pos = obj.positions as Record<string, unknown>;
    for (const [partyId, issueMap] of Object.entries(raw_pos)) {
      if (!issueMap || typeof issueMap !== "object" || Array.isArray(issueMap)) continue;
      const dst: Record<string, "support" | "oppose" | "neutral"> = {};
      for (const [issueId, stance] of Object.entries(issueMap as Record<string, unknown>)) {
        if (stance === "support" || stance === "oppose" || stance === "neutral") {
          dst[issueId] = stance;
        }
      }
      base.positions[partyId] = dst;
    }
  }

  if (
    obj.campaignStrategies &&
    typeof obj.campaignStrategies === "object" &&
    !Array.isArray(obj.campaignStrategies)
  ) {
    const raw_cs = obj.campaignStrategies as Record<string, unknown>;
    for (const [partyId, strat] of Object.entries(raw_cs)) {
      if (typeof strat === "string") base.campaignStrategies[partyId] = strat;
    }
  }

  if (
    obj.coalitionTalks &&
    typeof obj.coalitionTalks === "object" &&
    !Array.isArray(obj.coalitionTalks)
  ) {
    base.coalitionTalks = obj.coalitionTalks as PartyOrgRuntime["coalitionTalks"];
  }

  if (
    obj.disciplineActions &&
    typeof obj.disciplineActions === "object" &&
    !Array.isArray(obj.disciplineActions)
  ) {
    const raw_da = obj.disciplineActions as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_da)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const kind =
        typeof r.kind === "string" && (PARTY_DISCIPLINE_KINDS as readonly string[]).includes(r.kind)
          ? (r.kind as PartyOrgRuntime["disciplineActions"][string]["kind"])
          : "warning";
      const status =
        r.status === "pending" || r.status === "applied" || r.status === "dismissed"
          ? r.status
          : "pending";
      base.disciplineActions[id] = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        targetId: typeof r.targetId === "string" ? r.targetId : "",
        kind,
        recommendedByActorId:
          typeof r.recommendedByActorId === "string" ? r.recommendedByActorId : "",
        date: typeof r.date === "string" ? r.date : "2000-01-01",
        status,
      };
    }
  }

  if (
    obj.chairElections &&
    typeof obj.chairElections === "object" &&
    !Array.isArray(obj.chairElections)
  ) {
    const raw_ce = obj.chairElections as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_ce)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const method =
        typeof r.method === "string" &&
        (LEADERSHIP_ELECTION_METHODS as readonly string[]).includes(r.method)
          ? (r.method as PartyOrgRuntime["chairElections"][string]["method"])
          : "committee";
      const status =
        r.status === "open" || r.status === "resolved" || r.status === "cancelled"
          ? r.status
          : "open";
      const stage =
        typeof r.stage === "string" &&
        (CHAIR_ELECTION_STAGES as readonly string[]).includes(r.stage)
          ? (r.stage as ChairElectionStage)
          : status === "resolved"
            ? "aftermath"
            : "opening";
      const votingSystem =
        typeof r.votingSystem === "string" &&
        (VOTING_SYSTEMS as readonly string[]).includes(r.votingSystem)
          ? (r.votingSystem as VotingSystem)
          : undefined;
      const programs: Record<string, ChairCandidateProgram> = {};
      if (r.programs && typeof r.programs === "object" && !Array.isArray(r.programs)) {
        for (const [cid, prog] of Object.entries(r.programs as Record<string, unknown>)) {
          if (!prog || typeof prog !== "object" || Array.isArray(prog)) continue;
          const p = prog as Record<string, unknown>;
          programs[cid] = {
            platformDirection: typeof p.platformDirection === "string" ? p.platformDirection : "",
            coalitionStrategy: typeof p.coalitionStrategy === "string" ? p.coalitionStrategy : "",
            campaignStrategy: typeof p.campaignStrategy === "string" ? p.campaignStrategy : "",
            priorityIssue: typeof p.priorityIssue === "string" ? p.priorityIssue : "",
            unityStrategy: typeof p.unityStrategy === "string" ? p.unityStrategy : "",
          };
        }
      }
      const tally =
        r.tally && typeof r.tally === "object" && !Array.isArray(r.tally)
          ? (r.tally as Record<string, number>)
          : undefined;
      base.chairElections[id] = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        openedDate: typeof r.openedDate === "string" ? r.openedDate : "2000-01-01",
        status,
        candidates: Array.isArray(r.candidates)
          ? r.candidates.filter((x): x is string => typeof x === "string")
          : [],
        winnerId: typeof r.winnerId === "string" ? r.winnerId : null,
        resolvedDate: typeof r.resolvedDate === "string" ? r.resolvedDate : null,
        method,
        stage,
        triggerReason: typeof r.triggerReason === "string" ? r.triggerReason : "scheduled",
        programs,
        ...(tally ? { tally } : {}),
        ...(votingSystem ? { votingSystem } : {}),
      };
    }
  }

  if (
    obj.partyEndorsements &&
    typeof obj.partyEndorsements === "object" &&
    !Array.isArray(obj.partyEndorsements)
  ) {
    base.partyEndorsements = obj.partyEndorsements as PartyOrgRuntime["partyEndorsements"];
  }

  if (
    obj.supportAllocations &&
    typeof obj.supportAllocations === "object" &&
    !Array.isArray(obj.supportAllocations)
  ) {
    base.supportAllocations = obj.supportAllocations as PartyOrgRuntime["supportAllocations"];
  }

  if (
    obj.nationalCommittee &&
    typeof obj.nationalCommittee === "object" &&
    !Array.isArray(obj.nationalCommittee)
  ) {
    const raw_nc = obj.nationalCommittee as Record<string, unknown>;
    for (const [partyId, arr] of Object.entries(raw_nc)) {
      if (Array.isArray(arr)) {
        base.nationalCommittee[partyId] = arr.filter((x): x is string => typeof x === "string");
      }
    }
  }

  if (
    obj.provincialOrganizations &&
    typeof obj.provincialOrganizations === "object" &&
    !Array.isArray(obj.provincialOrganizations)
  ) {
    const raw_po = obj.provincialOrganizations as Record<string, unknown>;
    const dst: NonNullable<PartyOrgRuntime["provincialOrganizations"]> = {};
    for (const [orgId, rec] of Object.entries(raw_po)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      if (typeof r.partyId !== "string" || typeof r.provinceId !== "string") continue;
      dst[orgId] = {
        partyId: r.partyId,
        provinceId: r.provinceId,
        chairId: typeof r.chairId === "string" ? r.chairId : null,
        assemblyLeaderId: typeof r.assemblyLeaderId === "string" ? r.assemblyLeaderId : null,
      };
    }
    base.provincialOrganizations = dst;
  }

  if (
    obj.issueEmphasis &&
    typeof obj.issueEmphasis === "object" &&
    !Array.isArray(obj.issueEmphasis)
  ) {
    const raw_ie = obj.issueEmphasis as Record<string, unknown>;
    for (const [partyId, issueMap] of Object.entries(raw_ie)) {
      if (!issueMap || typeof issueMap !== "object" || Array.isArray(issueMap)) continue;
      const dst: Record<string, "high" | "medium" | "low"> = {};
      for (const [issueId, level] of Object.entries(issueMap as Record<string, unknown>)) {
        if (level === "high" || level === "medium" || level === "low") dst[issueId] = level;
      }
      base.issueEmphasis[partyId] = dst;
    }
  }

  if (
    obj.platformPlanks &&
    typeof obj.platformPlanks === "object" &&
    !Array.isArray(obj.platformPlanks)
  ) {
    const raw_pp = obj.platformPlanks as Record<string, unknown>;
    for (const [partyId, issueMap] of Object.entries(raw_pp)) {
      if (!issueMap || typeof issueMap !== "object" || Array.isArray(issueMap)) continue;
      const dst: Record<string, string> = {};
      for (const [issueId, optionId] of Object.entries(issueMap as Record<string, unknown>)) {
        if (typeof optionId === "string") dst[issueId] = optionId;
      }
      base.platformPlanks[partyId] = dst;
    }
  }

  if (
    obj.pendingCommitteeVotes &&
    typeof obj.pendingCommitteeVotes === "object" &&
    !Array.isArray(obj.pendingCommitteeVotes)
  ) {
    const raw_pcv = obj.pendingCommitteeVotes as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_pcv)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const status =
        r.status === "pending" || r.status === "resolved" || r.status === "cancelled"
          ? r.status
          : "pending";
      const playerChoice =
        r.playerChoice === "yes" || r.playerChoice === "no" || r.playerChoice === "abstain"
          ? r.playerChoice
          : null;
      const pending: PendingCommitteeVote = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        proposalKind: typeof r.proposalKind === "string" ? r.proposalKind : "",
        proposalPayload:
          r.proposalPayload &&
          typeof r.proposalPayload === "object" &&
          !Array.isArray(r.proposalPayload)
            ? (r.proposalPayload as PendingCommitteeVote["proposalPayload"])
            : {},
        npcYes: typeof r.npcYes === "number" ? r.npcYes : 0,
        npcNo: typeof r.npcNo === "number" ? r.npcNo : 0,
        npcAbstain: typeof r.npcAbstain === "number" ? r.npcAbstain : 0,
        playerChoice,
        deferredCommand:
          r.deferredCommand &&
          typeof r.deferredCommand === "object" &&
          !Array.isArray(r.deferredCommand)
            ? (r.deferredCommand as PendingCommitteeVote["deferredCommand"])
            : null,
        pendingActionId: typeof r.pendingActionId === "string" ? r.pendingActionId : null,
        status,
        createdDate: typeof r.createdDate === "string" ? r.createdDate : "2000-01-01",
      };
      base.pendingCommitteeVotes[id] = pending;
    }
  }

  if (
    obj.pendingActions &&
    typeof obj.pendingActions === "object" &&
    !Array.isArray(obj.pendingActions)
  ) {
    const raw_pa = obj.pendingActions as Record<string, unknown>;
    for (const [id, rec] of Object.entries(raw_pa)) {
      if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const status =
        typeof r.status === "string" &&
        (PENDING_PARTY_ACTION_STATUSES as readonly string[]).includes(r.status)
          ? (r.status as PendingPartyAction["status"])
          : "awaiting_committee";
      const action: PendingPartyAction = {
        id,
        partyId: typeof r.partyId === "string" ? r.partyId : "",
        actionType: typeof r.actionType === "string" ? r.actionType : "",
        payload:
          r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
            ? (r.payload as PendingPartyAction["payload"])
            : {},
        createdBy: typeof r.createdBy === "string" ? r.createdBy : "",
        committeeVoteId: typeof r.committeeVoteId === "string" ? r.committeeVoteId : null,
        status,
        createdDate: typeof r.createdDate === "string" ? r.createdDate : "2000-01-01",
        executedDate: typeof r.executedDate === "string" ? r.executedDate : null,
      };
      base.pendingActions[id] = action;
    }
  }

  if (typeof obj.nextPendingCommitteeId === "number" && obj.nextPendingCommitteeId > 0) {
    base.nextPendingCommitteeId = obj.nextPendingCommitteeId;
  }
  if (typeof obj.nextPendingActionId === "number" && obj.nextPendingActionId > 0) {
    base.nextPendingActionId = obj.nextPendingActionId;
  }
  if (typeof obj.nextElectionId === "number" && obj.nextElectionId > 0) {
    base.nextElectionId = obj.nextElectionId;
  }
  if (typeof obj.nextDisciplineId === "number" && obj.nextDisciplineId > 0) {
    base.nextDisciplineId = obj.nextDisciplineId;
  }
  if (typeof obj.lastOrgMonth === "string" || obj.lastOrgMonth === null) {
    base.lastOrgMonth = (obj.lastOrgMonth as string | null) ?? null;
  }
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    base.metadata = obj.metadata as PartyOrgRuntime["metadata"];
  }

  return base;
}
