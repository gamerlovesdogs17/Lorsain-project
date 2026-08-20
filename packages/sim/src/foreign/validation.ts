import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import {
  emptyForeignAffairsRuntime,
  isCrisisStage,
  isMilitaryPostureLevel,
  isStrategicGoalId,
  isTreatyKind,
  type ForeignAffairsRuntime,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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
        leaderId: typeof rec.leaderId === "string" ? rec.leaderId : "",
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
          : emptyForeignAffairsRuntime().countries[id]?.capabilities ?? {
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
          rec.status === "active" ||
          rec.status === "proposed" ||
          rec.status === "suspended" ||
          rec.status === "terminated"
            ? rec.status
            : "proposed",
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
        status: rec.status === "passed" || rec.status === "failed" ? rec.status : "pending",
      };
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
            rec.kind === "treaty_proposal" ||
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
  return null;
}
