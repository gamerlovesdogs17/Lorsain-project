import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import {
  emptyForeignAffairsRuntime,
  isCrisisStage,
  isMilitaryPostureLevel,
  isSanctionScope,
  isStrategicGoalId,
  isTreatyKind,
  isTreatyStatus,
  type ForeignAffairsRuntime,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampTrend(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

function clampRelation(n: number): number {
  return Math.max(-100, Math.min(100, n));
}

function parseBilateral(raw: unknown): ForeignAffairsRuntime["bilateralRelations"][string] | null {
  if (!isRecord(raw)) return null;
  return {
    general: typeof raw.general === "number" ? clampRelation(raw.general) : 0,
    trust: typeof raw.trust === "number" ? clamp01(raw.trust) : 0.5,
    securityTension: typeof raw.securityTension === "number" ? clamp01(raw.securityTension) : 0.15,
    economicTies: typeof raw.economicTies === "number" ? clamp01(raw.economicTies) : 0.2,
    lastUpdated:
      raw.lastUpdated != null && typeof raw.lastUpdated === "string" && isIsoDate(raw.lastUpdated)
        ? raw.lastUpdated
        : null,
  };
}

function parsePendingIncoming(raw: unknown): ForeignAffairsRuntime["pendingIncomingDiplomacy"][number] | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.actorCountryId !== "string") return null;
  const kind = raw.kind === "summit_invite" ? "summit_invite" : "treaty_proposal";
  return {
    id: raw.id,
    kind,
    actorCountryId: raw.actorCountryId,
    targetCountryId: typeof raw.targetCountryId === "string" ? raw.targetCountryId : "",
    treatyId: raw.treatyId != null && typeof raw.treatyId === "string" ? raw.treatyId : null,
    treatyKind:
      typeof raw.treatyKind === "string" && isTreatyKind(raw.treatyKind) ? raw.treatyKind : null,
    title: raw.title != null && typeof raw.title === "string" ? raw.title : null,
    date: typeof raw.date === "string" && isIsoDate(raw.date) ? raw.date : "2000-01-01",
    metadata: isRecord(raw.metadata) ? (raw.metadata as ForeignAffairsRuntime["pendingIncomingDiplomacy"][0]["metadata"]) : {},
  };
}

export function parseForeignAffairsRuntime(raw: unknown): ForeignAffairsRuntime | string {
  if (raw == null) return emptyForeignAffairsRuntime();
  if (!isRecord(raw)) return "foreignAffairsRuntime must be an object";
  const runtime = emptyForeignAffairsRuntime();
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "foreignAffairsRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  runtime.diplomaticActionsThisMonth =
    typeof raw.diplomaticActionsThisMonth === "number"
      ? Math.max(0, raw.diplomaticActionsThisMonth)
      : 0;
  runtime.warTriggerArmedByConflictId =
    raw.warTriggerArmedByConflictId != null && typeof raw.warTriggerArmedByConflictId === "string"
      ? raw.warTriggerArmedByConflictId
      : null;
  runtime.treatyEffectsAppliedMonth =
    raw.treatyEffectsAppliedMonth != null &&
    typeof raw.treatyEffectsAppliedMonth === "string" &&
    isIsoDate(raw.treatyEffectsAppliedMonth)
      ? raw.treatyEffectsAppliedMonth
      : null;
  if (isRecord(raw.treatyEffectsAppliedKeys)) {
    for (const [key, val] of Object.entries(raw.treatyEffectsAppliedKeys)) {
      if (val === true) runtime.treatyEffectsAppliedKeys[key] = true;
    }
  }
  if (isRecord(raw.countries)) {
    for (const [id, rec] of Object.entries(raw.countries)) {
      if (!isRecord(rec)) continue;
      const goals = (Array.isArray(rec.strategicGoals)
        ? rec.strategicGoals.filter((g): g is string => typeof g === "string" && isStrategicGoalId(g))
        : []) as ForeignAffairsRuntime["countries"][string]["strategicGoals"];
      const posture =
        typeof rec.posture === "string" && isMilitaryPostureLevel(rec.posture)
          ? rec.posture
          : "normal";
      runtime.countries[id] = {
        countryId: id,
        leaderId:
          rec.leaderId === null
            ? null
            : typeof rec.leaderId === "string"
              ? rec.leaderId
              : null,
        posture,
        capabilities: isRecord(rec.capabilities)
          ? {
              economic: clamp01(Number(rec.capabilities.economic ?? 0.3)),
              land: clamp01(Number(rec.capabilities.land ?? 0.3)),
              air: clamp01(Number(rec.capabilities.air ?? 0.3)),
              naval: clamp01(Number(rec.capabilities.naval ?? 0.3)),
              strategic: clamp01(Number(rec.capabilities.strategic ?? 0.2)),
              cyber: clamp01(Number(rec.capabilities.cyber ?? 0.2)),
              logistics: clamp01(Number(rec.capabilities.logistics ?? 0.3)),
            }
          : {
              economic: 0.3,
              land: 0.3,
              air: 0.3,
              naval: 0.3,
              strategic: 0.2,
              cyber: 0.2,
              logistics: 0.3,
            },
        tradeExposure: clamp01(Number(rec.tradeExposure ?? 0.2)),
        strategicGoals: goals,
        institutionIds: Array.isArray(rec.institutionIds)
          ? rec.institutionIds.filter((x): x is string => typeof x === "string")
          : [],
        activeSanctionIds: Array.isArray(rec.activeSanctionIds)
          ? rec.activeSanctionIds.filter((x): x is string => typeof x === "string")
          : [],
        governmentStability: clamp01(Number(rec.governmentStability ?? 0.55)),
        economicCapacity: clamp01(Number(rec.economicCapacity ?? 0.45)),
        economicTrend: clampTrend(Number(rec.economicTrend ?? 0)),
        domesticPressure: clamp01(Number(rec.domesticPressure ?? 0.4)),
        metadata: isRecord(rec.metadata) ? (rec.metadata as ForeignAffairsRuntime["countries"][string]["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.bilateralRelations)) {
    for (const [key, rec] of Object.entries(raw.bilateralRelations)) {
      const rel = parseBilateral(rec);
      if (rel) runtime.bilateralRelations[key] = rel;
    }
  }
  if (isRecord(raw.treaties)) {
    for (const [id, rec] of Object.entries(raw.treaties)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("TRT", id) == null) continue;
      const counterpartyResponses: Record<string, "pending" | "accepted" | "rejected"> = {};
      if (isRecord(rec.counterpartyResponses)) {
        for (const [cid, resp] of Object.entries(rec.counterpartyResponses)) {
          if (resp === "pending" || resp === "accepted" || resp === "rejected") {
            counterpartyResponses[cid] = resp;
          }
        }
      }
      runtime.treaties[id] = {
        id,
        kind: typeof rec.kind === "string" && isTreatyKind(rec.kind) ? rec.kind : "trade",
        title: typeof rec.title === "string" ? rec.title : id,
        proposerId: typeof rec.proposerId === "string" ? rec.proposerId : "",
        memberIds: Array.isArray(rec.memberIds)
          ? rec.memberIds.filter((x): x is string => typeof x === "string")
          : [],
        signedDate:
          rec.signedDate != null && typeof rec.signedDate === "string" && isIsoDate(rec.signedDate)
            ? rec.signedDate
            : null,
        status:
          typeof rec.status === "string" && isTreatyStatus(rec.status) ? rec.status : "proposed",
        ratificationStatus:
          rec.ratificationStatus === "pending" ||
          rec.ratificationStatus === "ratified" ||
          rec.ratificationStatus === "rejected" ||
          rec.ratificationStatus === "withdrawn" ||
          rec.ratificationStatus === "not_required"
            ? rec.ratificationStatus
            : "not_required",
        ratificationVoteId:
          rec.ratificationVoteId != null && typeof rec.ratificationVoteId === "string"
            ? rec.ratificationVoteId
            : null,
        counterpartyResponses,
        metadata: isRecord(rec.metadata) ? (rec.metadata as ForeignAffairsRuntime["treaties"][string]["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.sanctions)) {
    for (const [id, rec] of Object.entries(raw.sanctions)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("SAN", id) == null) continue;
      runtime.sanctions[id] = {
        id,
        imposerId: typeof rec.imposerId === "string" ? rec.imposerId : "",
        targetId: typeof rec.targetId === "string" ? rec.targetId : "",
        imposedDate:
          typeof rec.imposedDate === "string" && isIsoDate(rec.imposedDate)
            ? rec.imposedDate
            : "2000-01-01",
        liftedDate:
          rec.liftedDate != null && typeof rec.liftedDate === "string" && isIsoDate(rec.liftedDate)
            ? rec.liftedDate
            : null,
        severity: clamp01(Number(rec.severity ?? 0.3)),
        economicWeight: clamp01(Number(rec.economicWeight ?? 0.2)),
        scope:
          typeof rec.scope === "string" && isSanctionScope(rec.scope) ? rec.scope : "targeted",
        active: rec.active !== false,
        metadata: isRecord(rec.metadata) ? (rec.metadata as ForeignAffairsRuntime["sanctions"][string]["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.crises)) {
    for (const [id, rec] of Object.entries(raw.crises)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("CRI", id) == null) continue;
      runtime.crises[id] = {
        id,
        stage: typeof rec.stage === "string" && isCrisisStage(rec.stage) ? rec.stage : "latent",
        participantIds: Array.isArray(rec.participantIds)
          ? rec.participantIds.filter((x): x is string => typeof x === "string")
          : [],
        focalPairKey: rec.focalPairKey != null && typeof rec.focalPairKey === "string" ? rec.focalPairKey : null,
        startedDate:
          typeof rec.startedDate === "string" && isIsoDate(rec.startedDate)
            ? rec.startedDate
            : "2000-01-01",
        lastStageChange:
          typeof rec.lastStageChange === "string" && isIsoDate(rec.lastStageChange)
            ? rec.lastStageChange
            : "2000-01-01",
        intensity: clamp01(Number(rec.intensity ?? 0.3)),
        metadata: isRecord(rec.metadata) ? (rec.metadata as ForeignAffairsRuntime["crises"][string]["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.conflicts)) {
    for (const [id, rec] of Object.entries(raw.conflicts)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("CNF", id) == null) continue;
      runtime.conflicts[id] = {
        id,
        belligerentIds: Array.isArray(rec.belligerentIds)
          ? rec.belligerentIds.filter((x): x is string => typeof x === "string")
          : [],
        aggressorId:
          rec.aggressorId != null && typeof rec.aggressorId === "string" ? rec.aggressorId : null,
        startedDate:
          typeof rec.startedDate === "string" && isIsoDate(rec.startedDate)
            ? rec.startedDate
            : "2000-01-01",
        endedDate:
          rec.endedDate != null && typeof rec.endedDate === "string" && isIsoDate(rec.endedDate)
            ? rec.endedDate
            : null,
        intensity: clamp01(Number(rec.intensity ?? 0.5)),
        crisisId: rec.crisisId != null && typeof rec.crisisId === "string" ? rec.crisisId : null,
        objectives: Array.isArray(rec.objectives)
          ? rec.objectives.filter((x): x is string => typeof x === "string")
          : [],
        balance: clamp01(Number(rec.balance ?? 0.5)),
        politicalCost: clamp01(Number(rec.politicalCost ?? 0.3)),
        outcome: rec.outcome != null && typeof rec.outcome === "string" ? rec.outcome : null,
        ceasefireDate:
          rec.ceasefireDate != null && typeof rec.ceasefireDate === "string" && isIsoDate(rec.ceasefireDate)
            ? rec.ceasefireDate
            : null,
        warPowerId:
          rec.warPowerId != null && typeof rec.warPowerId === "string" ? rec.warPowerId : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as ForeignAffairsRuntime["conflicts"][string]["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.diplomaticActions)) {
    for (const [id, rec] of Object.entries(raw.diplomaticActions)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("DIP", id) == null) continue;
      runtime.diplomaticActions[id] = {
        id,
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        actorCountryId: typeof rec.actorCountryId === "string" ? rec.actorCountryId : "",
        targetCountryId:
          rec.targetCountryId != null && typeof rec.targetCountryId === "string"
            ? rec.targetCountryId
            : null,
        kind:
          rec.kind === "outreach" ||
          rec.kind === "summit" ||
          rec.kind === "sanctions" ||
          rec.kind === "lift_sanctions" ||
          rec.kind === "posture_change" ||
          rec.kind === "exercises" ||
          rec.kind === "treaty_proposal" ||
          rec.kind === "warning" ||
          rec.kind === "mediation" ||
          rec.kind === "trade_negotiation" ||
          rec.kind === "alliance_consultation"
            ? rec.kind
            : "outreach",
        initiator: rec.initiator === "player" ? "player" : "ai",
        metadata: isRecord(rec.metadata)
          ? (rec.metadata as ForeignAffairsRuntime["diplomaticActions"][string]["metadata"])
          : {},
      };
    }
  }
  if (isRecord(raw.treatyRatifications)) {
    for (const [id, rec] of Object.entries(raw.treatyRatifications)) {
      if (!isRecord(rec) || parseCanonicalAllocatedId("TRV", id) == null) continue;
      runtime.treatyRatifications[id] = {
        treatyId: typeof rec.treatyId === "string" ? rec.treatyId : "",
        voteId: typeof rec.voteId === "string" ? rec.voteId : "",
        introducedDate:
          typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
            ? rec.introducedDate
            : "2000-01-01",
        voteReadyDate:
          typeof rec.voteReadyDate === "string" && isIsoDate(rec.voteReadyDate)
            ? rec.voteReadyDate
            : typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
              ? rec.introducedDate
              : "2000-01-01",
        status: rec.status === "passed" || rec.status === "failed" ? rec.status : "pending",
      };
    }
  }
  if (isRecord(raw.treatyProposalCooldowns)) {
    for (const [key, until] of Object.entries(raw.treatyProposalCooldowns)) {
      if (typeof until === "string" && isIsoDate(until)) {
        runtime.treatyProposalCooldowns[key] = until;
      }
    }
  }
  if (isRecord(raw.institutionRuntime)) {
    const ir = raw.institutionRuntime;
    runtime.institutionRuntime.waActions = typeof ir.waActions === "number" ? ir.waActions : 0;
    runtime.institutionRuntime.cscActions = typeof ir.cscActions === "number" ? ir.cscActions : 0;
    runtime.institutionRuntime.nafMediations =
      typeof ir.nafMediations === "number" ? ir.nafMediations : 0;
    if (isRecord(ir.ltoDisputes)) {
      for (const [id, rec] of Object.entries(ir.ltoDisputes)) {
        if (!isRecord(rec)) continue;
        runtime.institutionRuntime.ltoDisputes[id] = {
          id,
          partyA: typeof rec.partyA === "string" ? rec.partyA : "",
          partyB: typeof rec.partyB === "string" ? rec.partyB : "",
          stage:
            rec.stage === "consultation" ||
            rec.stage === "ruling" ||
            rec.stage === "failed" ||
            rec.stage === "settled"
              ? rec.stage
              : "filed",
          startedDate:
            typeof rec.startedDate === "string" && isIsoDate(rec.startedDate)
              ? rec.startedDate
              : "2000-01-01",
          lastUpdate:
            typeof rec.lastUpdate === "string" && isIsoDate(rec.lastUpdate)
              ? rec.lastUpdate
              : "2000-01-01",
        };
      }
    }
  }
  if (isRecord(raw.pendingPlayerTreatyVotes)) {
    for (const [tid, rec] of Object.entries(raw.pendingPlayerTreatyVotes)) {
      if (!isRecord(rec)) continue;
      runtime.pendingPlayerTreatyVotes[tid] = {
        treatyId: typeof rec.treatyId === "string" ? rec.treatyId : tid,
        choice:
          rec.choice === "yes" || rec.choice === "no" || rec.choice === "abstain"
            ? rec.choice
            : null,
      };
    }
  }
  if (Array.isArray(raw.pendingIncomingDiplomacy)) {
    runtime.pendingIncomingDiplomacy = raw.pendingIncomingDiplomacy
      .map(parsePendingIncoming)
      .filter((p): p is NonNullable<typeof p> => p != null);
  }
  if (Array.isArray(raw.pendingPresidentialActions)) {
    runtime.pendingPresidentialActions = raw.pendingPresidentialActions
      .filter((rec): rec is Record<string, unknown> => isRecord(rec))
      .map((rec) => {
        const action: ForeignAffairsRuntime["pendingPresidentialActions"][number] = {
          kind:
            rec.kind === "outreach" ||
            rec.kind === "summit" ||
            rec.kind === "sanctions" ||
            rec.kind === "lift_sanctions" ||
            rec.kind === "posture_change" ||
            rec.kind === "exercises" ||
            rec.kind === "warning" ||
            rec.kind === "mediation" ||
            rec.kind === "trade_negotiation" ||
            rec.kind === "alliance_consultation"
              ? rec.kind
              : "outreach",
          targetCountryId:
            rec.targetCountryId != null && typeof rec.targetCountryId === "string"
              ? rec.targetCountryId
              : null,
          metadata: isRecord(rec.metadata)
            ? (rec.metadata as ForeignAffairsRuntime["pendingPresidentialActions"][0]["metadata"])
            : {},
        };
        if (typeof rec.treatyKind === "string" && isTreatyKind(rec.treatyKind)) {
          action.treatyKind = rec.treatyKind;
        }
        if (typeof rec.severity === "number") action.severity = rec.severity;
        if (typeof rec.posture === "string" && isMilitaryPostureLevel(rec.posture)) {
          action.posture = rec.posture;
        }
        return action;
      });
  }
  return runtime;
}

export function foreignCounterError(
  runtime: ForeignAffairsRuntime,
  counters: {
    nextTreatyId: number;
    nextSanctionId: number;
    nextCrisisId: number;
    nextConflictId: number;
    nextForeignLeaderId: number;
    nextDiplomaticActionId: number;
    nextTreatyRatificationId: number;
    nextIncomingDiplomacyId?: number;
  },
): string | null {
  const max = (prefix: string, ids: string[]) =>
    ids.reduce((m, id) => {
      const n = parseCanonicalAllocatedId(prefix, id);
      return n != null && n > m ? n : m;
    }, 0);
  if (counters.nextTreatyId <= max("TRT", Object.keys(runtime.treaties))) return "nextTreatyId";
  if (counters.nextSanctionId <= max("SAN", Object.keys(runtime.sanctions))) return "nextSanctionId";
  if (counters.nextCrisisId <= max("CRI", Object.keys(runtime.crises))) return "nextCrisisId";
  if (counters.nextConflictId <= max("CNF", Object.keys(runtime.conflicts))) return "nextConflictId";
  if (counters.nextDiplomaticActionId <= max("DIP", Object.keys(runtime.diplomaticActions))) {
    return "nextDiplomaticActionId";
  }
  if (counters.nextTreatyRatificationId <= max("TRV", Object.keys(runtime.treatyRatifications))) {
    return "nextTreatyRatificationId";
  }
  if (
    counters.nextIncomingDiplomacyId != null &&
    counters.nextIncomingDiplomacyId <= max("IND", runtime.pendingIncomingDiplomacy.map((p) => p.id))
  ) {
    return "nextIncomingDiplomacyId";
  }
  return null;
}
