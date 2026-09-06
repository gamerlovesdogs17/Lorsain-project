import { isIsoDate } from "../calendar.js";
import { parseCanonicalAllocatedId } from "../ids.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import {
  BILL_STATUSES,
  COMMITTEE_IDS,
  emptyLegislatureRuntime,
  isBillStatus,
  isCommitteeId,
  isLegislativeVoteChoice,
  isLegislativeVoteStage,
  pendingVoteKey,
  type AmendmentState,
  type BillState,
  type CommitteeState,
  type EnactedLawRecord,
  type LegislatureRuntime,
  type LegislativeVoteRecord,
  type PolicyItem,
  type ProvisionEnactmentRecord,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v);
}

function parsePolicyItems(raw: unknown, path: string): PolicyItem[] | string {
  if (!Array.isArray(raw)) return `${path} policyItems`;
  const out: PolicyItem[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.issueId !== "string") return `${path} policyItems`;
    if (typeof item.direction !== "number" || typeof item.magnitude !== "number") {
      return `${path} policyItems`;
    }
    out.push({
      issueId: item.issueId,
      ...(typeof item.provisionId === "string" ? { provisionId: item.provisionId } : {}),
      ...(typeof item.optionId === "string" ? { optionId: item.optionId } : {}),
      direction: item.direction,
      magnitude: item.magnitude,
      fiscalImpact: typeof item.fiscalImpact === "number" ? item.fiscalImpact : null,
      ...(isRecord(item.dimensionEffects)
        ? {
            dimensionEffects: Object.fromEntries(
              Object.entries(item.dimensionEffects).filter(
                (entry): entry is [string, number] =>
                  typeof entry[1] === "number" && Number.isFinite(entry[1]),
              ),
            ),
          }
        : {}),
    });
  }
  return out;
}

export function parseLegislatureRuntime(raw: unknown): LegislatureRuntime | string {
  if (raw == null) return emptyLegislatureRuntime();
  if (!isRecord(raw)) return "legislatureRuntime must be an object";
  const runtime = emptyLegislatureRuntime();
  if (typeof raw.sessionLabel === "string") runtime.sessionLabel = raw.sessionLabel;
  if (raw.lastMonthProcessed != null) {
    if (typeof raw.lastMonthProcessed !== "string" || !isIsoDate(raw.lastMonthProcessed)) {
      return "legislatureRuntime.lastMonthProcessed";
    }
    runtime.lastMonthProcessed = raw.lastMonthProcessed;
  }
  if (Array.isArray(raw.floorQueue) && raw.floorQueue.every((x) => typeof x === "string")) {
    runtime.floorQueue = raw.floorQueue as string[];
  }
  if (isRecord(raw.committees)) {
    for (const [id, rec] of Object.entries(raw.committees)) {
      if (!isCommitteeId(id) || !isRecord(rec)) continue;
      if (!Array.isArray(rec.memberIds) || !rec.memberIds.every((x) => typeof x === "string"))
        continue;
      runtime.committees[id] = {
        id,
        name: typeof rec.name === "string" ? rec.name : id,
        dimension: typeof rec.dimension === "string" ? rec.dimension : "",
        memberIds: rec.memberIds as string[],
        chairId: typeof rec.chairId === "string" ? rec.chairId : null,
      } satisfies CommitteeState;
    }
  }
  if (isRecord(raw.bills)) {
    for (const [id, rec] of Object.entries(raw.bills)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      if (parseCanonicalAllocatedId("BILL", id) == null) continue;
      if (typeof rec.sponsorId !== "string") continue;
      if (typeof rec.status !== "string" || !isBillStatus(rec.status)) continue;
      const items = parsePolicyItems(rec.policyItems, `bills.${id}`);
      if (typeof items === "string") continue;
      const bill: BillState = {
        id,
        sponsorId: rec.sponsorId,
        cosponsorIds: Array.isArray(rec.cosponsorIds)
          ? rec.cosponsorIds.filter((x): x is string => typeof x === "string")
          : [],
        introducedDate:
          typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
            ? rec.introducedDate
            : null,
        title: typeof rec.title === "string" ? rec.title : id,
        summary: typeof rec.summary === "string" ? rec.summary : "",
        policyItems: items,
        assignedCommitteeId:
          typeof rec.assignedCommitteeId === "string" && isCommitteeId(rec.assignedCommitteeId)
            ? rec.assignedCommitteeId
            : null,
        status: rec.status,
        amendmentIds: Array.isArray(rec.amendmentIds)
          ? rec.amendmentIds.filter((x): x is string => typeof x === "string")
          : [],
        committeeVoteId: typeof rec.committeeVoteId === "string" ? rec.committeeVoteId : null,
        floorVoteId: typeof rec.floorVoteId === "string" ? rec.floorVoteId : null,
        presidentialDisposition:
          rec.presidentialDisposition === "signed" ||
          rec.presidentialDisposition === "returned" ||
          rec.presidentialDisposition === "pending"
            ? rec.presidentialDisposition
            : "none",
        repassageVoteId: typeof rec.repassageVoteId === "string" ? rec.repassageVoteId : null,
        enactedDate:
          typeof rec.enactedDate === "string" && isIsoDate(rec.enactedDate)
            ? rec.enactedDate
            : null,
        enactedLawId: typeof rec.enactedLawId === "string" ? rec.enactedLawId : null,
        stageReadyDate:
          typeof rec.stageReadyDate === "string" && isIsoDate(rec.stageReadyDate)
            ? rec.stageReadyDate
            : typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
              ? rec.introducedDate
              : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as BillState["metadata"]) : {},
        version: isInt(rec.version) && rec.version >= 1 ? rec.version : 1,
        versionHistory: Array.isArray(rec.versionHistory)
          ? (rec.versionHistory as BillState["versionHistory"])
          : [
              {
                version: 1,
                date:
                  typeof rec.introducedDate === "string" && isIsoDate(rec.introducedDate)
                    ? rec.introducedDate
                    : "2000-01-01",
                reason: "introduced",
                amendmentId: null,
                policyItems: items.map((item) => ({ ...item })),
              },
            ],
      };
      runtime.bills[id] = bill;
    }
  }
  if (isRecord(raw.amendments)) {
    for (const [id, rec] of Object.entries(raw.amendments)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const items = parsePolicyItems(rec.policyItems, `amendments.${id}`);
      if (typeof items === "string") continue;
      runtime.amendments[id] = {
        id,
        billId: typeof rec.billId === "string" ? rec.billId : "",
        sponsorId: typeof rec.sponsorId === "string" ? rec.sponsorId : "",
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        policyItems: items,
        status:
          rec.status === "adopted" || rec.status === "rejected" || rec.status === "withdrawn"
            ? rec.status
            : "proposed",
        metadata: isRecord(rec.metadata) ? (rec.metadata as AmendmentState["metadata"]) : {},
        targetProvisionIds: Array.isArray(rec.targetProvisionIds)
          ? rec.targetProvisionIds.filter((value): value is string => typeof value === "string")
          : items.map((item) => item.provisionId ?? item.issueId),
      };
    }
  }
  if (isRecord(raw.legislativeVotes)) {
    for (const [id, rec] of Object.entries(raw.legislativeVotes)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const votes: LegislativeVoteRecord["votes"] = {};
      if (isRecord(rec.votes)) {
        for (const [pid, choice] of Object.entries(rec.votes)) {
          if (typeof choice === "string" && isLegislativeVoteChoice(choice)) votes[pid] = choice;
        }
      }
      const partyIdsAtVote: Record<string, string | null> = {};
      if (isRecord(rec.partyIdsAtVote)) {
        for (const [pid, partyId] of Object.entries(rec.partyIdsAtVote)) {
          if (typeof partyId === "string" || partyId == null)
            partyIdsAtVote[pid] = partyId as string | null;
        }
      }
      const factionIdsAtVote: Record<string, string | null> = {};
      if (isRecord(rec.factionIdsAtVote)) {
        for (const [pid, factionId] of Object.entries(rec.factionIdsAtVote)) {
          if (typeof factionId === "string" || factionId == null)
            factionIdsAtVote[pid] = factionId as string | null;
        }
      }
      runtime.legislativeVotes[id] = {
        id,
        billId: typeof rec.billId === "string" ? rec.billId : "",
        stage: rec.stage === "committee" || rec.stage === "repassage" ? rec.stage : "floor",
        date: typeof rec.date === "string" && isIsoDate(rec.date) ? rec.date : "2000-01-01",
        committeeId:
          typeof rec.committeeId === "string" && isCommitteeId(rec.committeeId)
            ? rec.committeeId
            : null,
        votes,
        partyIdsAtVote,
        factionIdsAtVote,
        yes: isInt(rec.yes) ? rec.yes : 0,
        no: isInt(rec.no) ? rec.no : 0,
        abstain: isInt(rec.abstain) ? rec.abstain : 0,
        passed: rec.passed === true,
        threshold:
          rec.threshold === "absolute_majority" ? "absolute_majority" : "simple_majority_cast",
        metadata: isRecord(rec.metadata) ? (rec.metadata as LegislativeVoteRecord["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.enactedLaws)) {
    for (const [id, rec] of Object.entries(raw.enactedLaws)) {
      if (!isRecord(rec) || rec.id !== id) continue;
      const items = parsePolicyItems(rec.policyItems, `laws.${id}`);
      if (typeof items === "string") continue;
      runtime.enactedLaws[id] = {
        id,
        billId: typeof rec.billId === "string" ? rec.billId : "",
        title: typeof rec.title === "string" ? rec.title : id,
        policyItems: items,
        amendmentIds: Array.isArray(rec.amendmentIds)
          ? rec.amendmentIds.filter((x): x is string => typeof x === "string")
          : [],
        floorVoteId: typeof rec.floorVoteId === "string" ? rec.floorVoteId : null,
        repassageVoteId: typeof rec.repassageVoteId === "string" ? rec.repassageVoteId : null,
        presidentialDisposition:
          rec.presidentialDisposition === "signed" || rec.presidentialDisposition === "returned"
            ? rec.presidentialDisposition
            : "none",
        enactedDate:
          typeof rec.enactedDate === "string" && isIsoDate(rec.enactedDate)
            ? rec.enactedDate
            : "2000-01-01",
        sponsorId: typeof rec.sponsorId === "string" ? rec.sponsorId : "",
        eventIds: Array.isArray(rec.eventIds)
          ? rec.eventIds.filter((x): x is string => typeof x === "string")
          : [],
        operative: rec.operative !== false,
        invalidatedByDecisionId:
          typeof rec.invalidatedByDecisionId === "string" ? rec.invalidatedByDecisionId : null,
        metadata: isRecord(rec.metadata) ? (rec.metadata as EnactedLawRecord["metadata"]) : {},
      };
    }
  }
  if (isRecord(raw.provisionHistory)) {
    for (const [provisionId, entries] of Object.entries(raw.provisionHistory)) {
      if (!Array.isArray(entries)) continue;
      const stack: ProvisionEnactmentRecord[] = [];
      for (const entry of entries) {
        if (!isRecord(entry)) continue;
        if (typeof entry.lawId !== "string" || typeof entry.optionId !== "string") continue;
        if (typeof entry.enactedDate !== "string" || !isIsoDate(entry.enactedDate)) continue;
        stack.push({
          lawId: entry.lawId,
          optionId: entry.optionId,
          enactedDate: entry.enactedDate,
          previousOptionId:
            typeof entry.previousOptionId === "string" ? entry.previousOptionId : null,
        });
      }
      if (stack.length) runtime.provisionHistory[provisionId] = stack;
    }
  }
  if (isRecord(raw.pendingPlayerVotes)) {
    for (const [key, rec] of Object.entries(raw.pendingPlayerVotes)) {
      if (!isRecord(rec)) continue;
      if (typeof rec.billId !== "string") continue;
      if (typeof rec.stage !== "string" || !isLegislativeVoteStage(rec.stage)) continue;
      if (typeof rec.choice !== "string" || !isLegislativeVoteChoice(rec.choice)) continue;
      const amendmentId = typeof rec.amendmentId === "string" ? rec.amendmentId : null;
      const storedKey = pendingVoteKey(rec.billId, rec.stage, amendmentId);
      runtime.pendingPlayerVotes[typeof key === "string" ? key : storedKey] = {
        billId: rec.billId,
        stage: rec.stage,
        choice: rec.choice,
        amendmentId,
      };
    }
  }
  if (isRecord(raw.partyRecommendations)) {
    runtime.partyRecommendations =
      raw.partyRecommendations as LegislatureRuntime["partyRecommendations"];
  }
  if (isRecord(raw.factionRecommendations)) {
    runtime.factionRecommendations =
      raw.factionRecommendations as LegislatureRuntime["factionRecommendations"];
  }
  if (isRecord(raw.caucusLeadership)) {
    runtime.caucusLeadership = raw.caucusLeadership as LegislatureRuntime["caucusLeadership"];
  }
  if (isRecord(raw.caucusContests)) {
    runtime.caucusContests = raw.caucusContests as LegislatureRuntime["caucusContests"];
  }
  void BILL_STATUSES;
  void COMMITTEE_IDS;
  return runtime;
}

export function legislatureCounterError(
  runtime: LegislatureRuntime,
  counters: {
    nextBillId: number;
    nextAmendmentId: number;
    nextLegislativeVoteId: number;
    nextLawId: number;
  },
): string | null {
  const maxBill = Object.keys(runtime.bills).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("BILL", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextBillId <= maxBill) return "nextBillId does not exceed allocated BILL ids";
  const maxAmd = Object.keys(runtime.amendments).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("AMD", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextAmendmentId <= maxAmd)
    return "nextAmendmentId does not exceed allocated AMD ids";
  const maxVote = Object.keys(runtime.legislativeVotes).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("LVOTE", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextLegislativeVoteId <= maxVote) {
    return "nextLegislativeVoteId does not exceed allocated LVOTE ids";
  }
  const maxLaw = Object.keys(runtime.enactedLaws).reduce((m, id) => {
    const n = parseCanonicalAllocatedId("LAW", id);
    return n != null && n > m ? n : m;
  }, 0);
  if (counters.nextLawId <= maxLaw) return "nextLawId does not exceed allocated LAW ids";
  return null;
}

export function validateLegislatureAgainstWorld(
  _state: SimState,
  _world: KernelWorld,
): CommandError | null {
  return null;
}
