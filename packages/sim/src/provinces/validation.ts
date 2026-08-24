import { isIsoDate } from "../calendar.js";
import {
  emptyProvincialRuntime,
  isProvincialInvestment,
  isProvincialPriority,
  type GubernatorialCandidate,
  type GubernatorialElection,
  type ProvinceGovernanceState,
  type ProvincialActionRecord,
  type ProvincialPressure,
  type ProvincialRuntime,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseProvince(id: string, raw: unknown): ProvinceGovernanceState | string {
  if (!isRecord(raw) || raw.provinceId !== id) return `provincialRuntime.provinces.${id}`;
  if (typeof raw.administrativePriority !== "string" || !isProvincialPriority(raw.administrativePriority)) {
    return `provincialRuntime.provinces.${id}.administrativePriority`;
  }
  if (typeof raw.investmentEmphasis !== "string" || !isProvincialInvestment(raw.investmentEmphasis)) {
    return `provincialRuntime.provinces.${id}.investmentEmphasis`;
  }
  if (!isRecord(raw.investmentMomentum)) return `provincialRuntime.provinces.${id}.investmentMomentum`;
  const momentum = { transport: 0, housing: 0, schools: 0, hospitals: 0 };
  for (const focus of Object.keys(momentum) as Array<keyof typeof momentum>) {
    const value = raw.investmentMomentum[focus];
    if (!finite(value) || value < 0 || value > 1) return `provincialRuntime.provinces.${id}.investmentMomentum.${focus}`;
    momentum[focus] = value;
  }
  if (!finite(raw.politicalCapital) || raw.politicalCapital < 0 || raw.politicalCapital > 1) return `provincialRuntime.provinces.${id}.politicalCapital`;
  if (!finite(raw.publicStanding) || raw.publicStanding < -1 || raw.publicStanding > 1) return `provincialRuntime.provinces.${id}.publicStanding`;
  if (!finite(raw.federalRelationship) || raw.federalRelationship < -1 || raw.federalRelationship > 1) return `provincialRuntime.provinces.${id}.federalRelationship`;
  if (!Number.isInteger(raw.actionPointsRemaining) || Number(raw.actionPointsRemaining) < 0) return `provincialRuntime.provinces.${id}.actionPointsRemaining`;
  if (typeof raw.actionPointsMonth !== "string" || !isIsoDate(raw.actionPointsMonth)) return `provincialRuntime.provinces.${id}.actionPointsMonth`;
  return {
    provinceId: id,
    administrativePriority: raw.administrativePriority,
    investmentEmphasis: raw.investmentEmphasis,
    politicalCapital: raw.politicalCapital,
    publicStanding: raw.publicStanding,
    federalRelationship: raw.federalRelationship,
    actionPointsRemaining: Number(raw.actionPointsRemaining),
    actionPointsMonth: raw.actionPointsMonth,
    investmentMomentum: momentum,
    activePressureId: typeof raw.activePressureId === "string" ? raw.activePressureId : null,
    recentActionIds: Array.isArray(raw.recentActionIds)
      ? raw.recentActionIds.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function parseCandidate(raw: unknown): GubernatorialCandidate | null {
  if (!isRecord(raw) || typeof raw.politicianId !== "string" || !isIsoDate(raw.filedDate)) return null;
  if (raw.source !== "player" && raw.source !== "npc") return null;
  return {
    politicianId: raw.politicianId,
    partyId: typeof raw.partyId === "string" ? raw.partyId : null,
    filedDate: raw.filedDate,
    incumbent: raw.incumbent === true,
    source: raw.source,
    withdrawn: raw.withdrawn === true,
  };
}

function parseElection(id: string, raw: unknown): GubernatorialElection | string {
  if (!isRecord(raw) || raw.id !== id || typeof raw.provinceId !== "string") return `provincialRuntime.elections.${id}`;
  if (![raw.date, raw.filingOpenDate, raw.filingDeadlineDate, raw.assumptionDate].every(isIsoDate)) return `provincialRuntime.elections.${id}.dates`;
  if (!["planned", "filing_open", "field_finalized", "resolved", "assumed"].includes(String(raw.status))) return `provincialRuntime.elections.${id}.status`;
  const candidates: Record<string, GubernatorialCandidate> = {};
  if (isRecord(raw.candidates)) {
    for (const [politicianId, value] of Object.entries(raw.candidates)) {
      const candidate = parseCandidate(value);
      if (!candidate || candidate.politicianId !== politicianId) return `provincialRuntime.elections.${id}.candidates.${politicianId}`;
      candidates[politicianId] = candidate;
    }
  }
  const voteShares: Record<string, number> = {};
  if (isRecord(raw.voteShares)) {
    for (const [politicianId, value] of Object.entries(raw.voteShares)) {
      if (!finite(value) || value < 0 || value > 1) return `provincialRuntime.elections.${id}.voteShares.${politicianId}`;
      voteShares[politicianId] = value;
    }
  }
  return {
    id,
    provinceId: raw.provinceId,
    date: raw.date as string,
    filingOpenDate: raw.filingOpenDate as string,
    filingDeadlineDate: raw.filingDeadlineDate as string,
    assumptionDate: raw.assumptionDate as string,
    status: raw.status as GubernatorialElection["status"],
    incumbentId: typeof raw.incumbentId === "string" ? raw.incumbentId : null,
    candidates,
    playerDecision: raw.playerDecision === "filed" || raw.playerDecision === "declined" ? raw.playerDecision : null,
    winnerId: typeof raw.winnerId === "string" ? raw.winnerId : null,
    voteShares,
    turnoutRate: finite(raw.turnoutRate) ? raw.turnoutRate : null,
    resultEventId: typeof raw.resultEventId === "string" ? raw.resultEventId : null,
  };
}

export function parseProvincialRuntime(raw: unknown): ProvincialRuntime | string {
  if (raw == null) return emptyProvincialRuntime();
  if (!isRecord(raw)) return "provincialRuntime";
  const runtime = emptyProvincialRuntime();
  if (isRecord(raw.provinces)) {
    for (const [id, value] of Object.entries(raw.provinces)) {
      const parsed = parseProvince(id, value);
      if (typeof parsed === "string") return parsed;
      runtime.provinces[id] = parsed;
    }
  }
  if (isRecord(raw.elections)) {
    for (const [id, value] of Object.entries(raw.elections)) {
      const parsed = parseElection(id, value);
      if (typeof parsed === "string") return parsed;
      runtime.elections[id] = parsed;
    }
  }
  if (isRecord(raw.actions)) runtime.actions = raw.actions as Record<string, ProvincialActionRecord>;
  if (isRecord(raw.pressures)) runtime.pressures = raw.pressures as Record<string, ProvincialPressure>;
  if (isRecord(raw.assemblies)) runtime.assemblies = raw.assemblies as ProvincialRuntime["assemblies"];
  if (isRecord(raw.legislators)) runtime.legislators = raw.legislators as ProvincialRuntime["legislators"];
  if (isRecord(raw.assemblyElections)) runtime.assemblyElections = raw.assemblyElections as ProvincialRuntime["assemblyElections"];
  if (isRecord(raw.bills)) runtime.bills = raw.bills as ProvincialRuntime["bills"];
  if (isRecord(raw.votes)) runtime.votes = raw.votes as ProvincialRuntime["votes"];
  if (isRecord(raw.promotions)) runtime.promotions = raw.promotions as ProvincialRuntime["promotions"];
  if (isRecord(raw.constitutionalRules)) runtime.constitutionalRules = raw.constitutionalRules as ProvincialRuntime["constitutionalRules"];
  if (isRecord(raw.constitutionalAmendments)) runtime.constitutionalAmendments = raw.constitutionalAmendments as ProvincialRuntime["constitutionalAmendments"];
  runtime.lastMonthProcessed = typeof raw.lastMonthProcessed === "string" && isIsoDate(raw.lastMonthProcessed) ? raw.lastMonthProcessed : null;
  return runtime;
}
