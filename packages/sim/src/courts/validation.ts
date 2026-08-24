import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import { isLegislativeVoteChoice } from "../legislature/types.js";
import {
  emptyConstitutionalRuntime,
  isCourtCaseType,
  isGroundsSourceKind,
  isImpeachmentGrounds,
  isJudicialVoteChoice,
  type ConstitutionalGroundsRecord,
  type ConstitutionalRuntime,
  type CourtCase,
  type CourtDecision,
  type CourtNomination,
  type ImpeachmentProceeding,
  type PrecedentRecord,
  type RecallProceeding,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

export function parseConstitutionalRuntime(raw: unknown): ConstitutionalRuntime | string {
  if (raw == null) return emptyConstitutionalRuntime();
  if (!isRecord(raw)) return "constitutionalRuntime must be an object";
  const runtime = emptyConstitutionalRuntime();
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "constitutionalRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  if (isRecord(raw.courtCases)) {
    for (const [id, rec] of Object.entries(raw.courtCases)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("CASE", id) == null) continue;
      if (typeof rec.caseType !== "string" || !isCourtCaseType(rec.caseType)) continue;
      const votes: CourtCase["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isJudicialVoteChoice(choice)) votes[pid] = choice;
        }
      }
      const courtCase: CourtCase = {
        id,
        filedDate:
          typeof rec.filedDate === "string" && isIsoDate(rec.filedDate)
            ? rec.filedDate
            : "2000-01-01",
        caseType: rec.caseType,
        petitionerId: typeof rec.petitionerId === "string" ? rec.petitionerId : "",
        respondentId: typeof rec.respondentId === "string" ? rec.respondentId : "",
        challengedKind:
          rec.challengedKind === "regulation" ||
          rec.challengedKind === "emergency" ||
          rec.challengedKind === "war_power" ||
          rec.challengedKind === "appointment" ||
          rec.challengedKind === "election" ||
          rec.challengedKind === "impeachment" ||
          rec.challengedKind === "executive_action" ||
          rec.challengedKind === "provincial_law"
            ? rec.challengedKind
            : "law",
        challengedId: typeof rec.challengedId === "string" ? rec.challengedId : "",
        constitutionalQuestion:
          typeof rec.constitutionalQuestion === "string" ? rec.constitutionalQuestion : "",
        constitutionalRule:
          typeof rec.constitutionalRule === "string" ? rec.constitutionalRule : "",
        meritsLean: typeof rec.meritsLean === "number" ? rec.meritsLean : 0,
        status:
          rec.status === "filed" || rec.status === "decided" || rec.status === "dismissed"
            ? rec.status
            : "pending",
        participatingJudgeIds: Array.isArray(rec.participatingJudgeIds)
          ? rec.participatingJudgeIds.filter((x): x is string => typeof x === "string")
          : [],
        votes,
        disposition:
          rec.disposition === "INVALIDATE" || rec.disposition === "UPHOLD" ? rec.disposition : null,
        decisionId: typeof rec.decisionId === "string" ? rec.decisionId : null,
        decisionDate:
          typeof rec.decisionDate === "string" && isIsoDate(rec.decisionDate)
            ? rec.decisionDate
            : null,
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : "2000-01-01",
        expedited: rec.expedited === true,
        eventIds: Array.isArray(rec.eventIds)
          ? rec.eventIds.filter((x): x is string => typeof x === "string")
          : [],
        metadata: isRecord(rec.metadata) ? (rec.metadata as CourtCase["metadata"]) : {},
      };
      runtime.courtCases[id] = courtCase;
    }
  }
  if (isRecord(raw.courtDecisions)) {
    for (const [id, rec] of Object.entries(raw.courtDecisions)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("CDEC", id) == null) continue;
      const votes: CourtDecision["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isJudicialVoteChoice(choice)) votes[pid] = choice;
        }
      }
      runtime.courtDecisions[id] = {
        id,
        caseId: typeof rec.caseId === "string" ? rec.caseId : "",
        decisionDate:
          typeof rec.decisionDate === "string" && isIsoDate(rec.decisionDate)
            ? rec.decisionDate
            : "2000-01-01",
        disposition: rec.disposition === "INVALIDATE" ? "INVALIDATE" : "UPHOLD",
        uphold: isInt(rec.uphold) ? rec.uphold : 0,
        invalidate: isInt(rec.invalidate) ? rec.invalidate : 0,
        nonparticipation: isInt(rec.nonparticipation) ? rec.nonparticipation : 0,
        votes,
        constitutionalQuestion:
          typeof rec.constitutionalQuestion === "string" ? rec.constitutionalQuestion : "",
        constitutionalRule:
          typeof rec.constitutionalRule === "string" ? rec.constitutionalRule : "",
        caseType:
          typeof rec.caseType === "string" && isCourtCaseType(rec.caseType)
            ? rec.caseType
            : "LAW_REVIEW",
        metadata: isRecord(rec.metadata) ? (rec.metadata as CourtDecision["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.nominations)) {
    for (const [id, rec] of Object.entries(raw.nominations)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("CNOM", id) == null) continue;
      const votes: CourtNomination["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isLegislativeVoteChoice(choice)) votes[pid] = choice;
        }
      }
      runtime.nominations[id] = {
        id,
        seatOfficeId: typeof rec.seatOfficeId === "string" ? rec.seatOfficeId : "",
        nomineeId: typeof rec.nomineeId === "string" ? rec.nomineeId : null,
        nominatorId: typeof rec.nominatorId === "string" ? rec.nominatorId : null,
        nominatedDate:
          typeof rec.nominatedDate === "string" && isIsoDate(rec.nominatedDate)
            ? rec.nominatedDate
            : null,
        status:
          rec.status === "pending_confirmation" ||
          rec.status === "confirmed" ||
          rec.status === "rejected" ||
          rec.status === "withdrawn"
            ? rec.status
            : "awaiting_nomination",
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : "2000-01-01",
        votes,
        yes: isInt(rec.yes) ? rec.yes : 0,
        no: isInt(rec.no) ? rec.no : 0,
        abstain: isInt(rec.abstain) ? rec.abstain : 0,
        voteId: typeof rec.voteId === "string" ? rec.voteId : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as CourtNomination["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.impeachments)) {
    for (const [id, rec] of Object.entries(raw.impeachments)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("IMPEACH", id) == null) continue;
      const votes: ImpeachmentProceeding["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isLegislativeVoteChoice(choice)) votes[pid] = choice;
        }
      }
      runtime.impeachments[id] = {
        id,
        targetId: typeof rec.targetId === "string" ? rec.targetId : "",
        sponsorId: typeof rec.sponsorId === "string" ? rec.sponsorId : "",
        grounds:
          typeof rec.grounds === "string" && isImpeachmentGrounds(rec.grounds)
            ? rec.grounds
            : "serious_constitutional_abuse",
        introducedDate:
          typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
            ? rec.introducedDate
            : "2000-01-01",
        status:
          rec.status === "assembly_failed" ||
          rec.status === "court_pending" ||
          rec.status === "removed" ||
          rec.status === "rejected_by_court" ||
          rec.status === "introduced"
            ? rec.status
            : "assembly_pending",
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : "2000-01-01",
        votes,
        yes: isInt(rec.yes) ? rec.yes : 0,
        no: isInt(rec.no) ? rec.no : 0,
        abstain: isInt(rec.abstain) ? rec.abstain : 0,
        caseId: typeof rec.caseId === "string" ? rec.caseId : null,
        basisId: typeof rec.basisId === "string" ? rec.basisId : null,
        evidenceStrength: typeof rec.evidenceStrength === "number" ? rec.evidenceStrength : 0,
        severity: typeof rec.severity === "number" ? rec.severity : 0,
        metadata: isRecord(rec.metadata) ? (rec.metadata as ImpeachmentProceeding["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.recalls)) {
    for (const [id, rec] of Object.entries(raw.recalls)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("RECALL", id) == null) continue;
      const votes: RecallProceeding["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isLegislativeVoteChoice(choice)) votes[pid] = choice;
        }
      }
      runtime.recalls[id] = {
        id,
        targetId: typeof rec.targetId === "string" ? rec.targetId : "",
        sponsorId: typeof rec.sponsorId === "string" ? rec.sponsorId : "",
        introducedDate:
          typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
            ? rec.introducedDate
            : "2000-01-01",
        status:
          rec.status === "referral_failed" ||
          rec.status === "vote_scheduled" ||
          rec.status === "succeeded" ||
          rec.status === "failed" ||
          rec.status === "introduced"
            ? rec.status
            : "referral_pending",
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : "2000-01-01",
        votes,
        yes: isInt(rec.yes) ? rec.yes : 0,
        no: isInt(rec.no) ? rec.no : 0,
        abstain: isInt(rec.abstain) ? rec.abstain : 0,
        nationalVoteDate:
          typeof rec.nationalVoteDate === "string" && isIsoDate(rec.nationalVoteDate)
            ? rec.nationalVoteDate
            : null,
        nationalYesShare: typeof rec.nationalYesShare === "number" ? rec.nationalYesShare : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as RecallProceeding["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.precedents)) {
    for (const [id, rec] of Object.entries(raw.precedents)) {
      if (!isRecord(rec)) continue;
      if (typeof rec.decisionId !== "string") continue;
      const p: PrecedentRecord = {
        decisionId: rec.decisionId,
        caseId: typeof rec.caseId === "string" ? rec.caseId : "",
        caseType:
          typeof rec.caseType === "string" && isCourtCaseType(rec.caseType)
            ? rec.caseType
            : "LAW_REVIEW",
        constitutionalQuestion:
          typeof rec.constitutionalQuestion === "string" ? rec.constitutionalQuestion : "",
        constitutionalRule:
          typeof rec.constitutionalRule === "string" ? rec.constitutionalRule : "",
        disposition: rec.disposition === "INVALIDATE" ? "INVALIDATE" : "UPHOLD",
        decisionDate:
          typeof rec.decisionDate === "string" && isIsoDate(rec.decisionDate)
            ? rec.decisionDate
            : "2000-01-01",
        uphold: isInt(rec.uphold) ? rec.uphold : 0,
        invalidate: isInt(rec.invalidate) ? rec.invalidate : 0,
      };
      runtime.precedents[id] = p;
    }
  }
  if (isRecord(raw.grounds)) {
    for (const [id, rec] of Object.entries(raw.grounds)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("CGND", id) == null) continue;
      if (typeof rec.grounds !== "string" || !isImpeachmentGrounds(rec.grounds)) continue;
      if (typeof rec.sourceKind !== "string" || !isGroundsSourceKind(rec.sourceKind)) continue;
      const ground: ConstitutionalGroundsRecord = {
        id,
        targetPoliticianId:
          typeof rec.targetPoliticianId === "string" ? rec.targetPoliticianId : "",
        grounds: rec.grounds,
        sourceKind: rec.sourceKind,
        sourceId: typeof rec.sourceId === "string" ? rec.sourceId : "",
        createdDate:
          typeof rec.createdDate === "string" && isIsoDate(rec.createdDate)
            ? rec.createdDate
            : "2000-01-01",
        evidenceStrength: typeof rec.evidenceStrength === "number" ? rec.evidenceStrength : 0,
        severity: typeof rec.severity === "number" ? rec.severity : 0,
        public: rec.public === true,
        status:
          rec.status === "consumed" || rec.status === "invalidated" ? rec.status : "available",
        metadata: isRecord(rec.metadata)
          ? (rec.metadata as ConstitutionalGroundsRecord["metadata"])
          : {},
      };
      runtime.grounds[id] = ground;
    }
  }
  if (isRecord(raw.pendingPlayerVotes)) {
    for (const [id, rec] of Object.entries(raw.pendingPlayerVotes)) {
      if (!isRecord(rec)) continue;
      if (typeof rec.targetId !== "string" || typeof rec.choice !== "string") continue;
      if (
        rec.kind !== "confirmation" &&
        rec.kind !== "judicial" &&
        rec.kind !== "impeachment" &&
        rec.kind !== "recall"
      ) {
        continue;
      }
      runtime.pendingPlayerVotes[id] = {
        kind: rec.kind,
        targetId: rec.targetId,
        choice: rec.choice,
      };
    }
  }
  return runtime;
}

export function constitutionalCounterError(
  runtime: ConstitutionalRuntime,
  counters: {
    nextCaseId: number;
    nextCourtNominationId: number;
    nextCourtDecisionId: number;
    nextImpeachmentId: number;
    nextRecallId: number;
    nextConstitutionalGroundsId: number;
  },
): string | null {
  const maxCase = Object.keys(runtime.courtCases).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("CASE", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextCaseId <= maxCase) return "counters.nextCaseId";
  const maxNom = Object.keys(runtime.nominations).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("CNOM", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextCourtNominationId <= maxNom) return "counters.nextCourtNominationId";
  const maxDec = Object.keys(runtime.courtDecisions).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("CDEC", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextCourtDecisionId <= maxDec) return "counters.nextCourtDecisionId";
  const maxImp = Object.keys(runtime.impeachments).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("IMPEACH", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextImpeachmentId <= maxImp) return "counters.nextImpeachmentId";
  const maxRec = Object.keys(runtime.recalls).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("RECALL", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextRecallId <= maxRec) return "counters.nextRecallId";
  const maxGrounds = Object.keys(runtime.grounds).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("CGND", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextConstitutionalGroundsId <= maxGrounds) {
    return "counters.nextConstitutionalGroundsId";
  }
  return null;
}
