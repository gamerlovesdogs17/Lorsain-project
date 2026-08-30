import type { IdeologyAxis } from "../agents/types.js";
import { getAgentProfile, type IdeologyVector } from "../agents/profile.js";
import { pushHistory } from "../scheduler.js";
import type { BillState } from "../legislature/types.js";
import { legislativeProvision } from "../legislature/provisions.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { partyMembers } from "./queries.js";
import {
  PARTY_PLATFORM_ISSUES,
  type PartyPlatformHistoryEntry,
  type PartyPlatformIssue,
  type PartyPublicPlatform,
} from "./types.js";

const PLATFORM_HISTORY_LIMIT = 12;
const MONTHLY_PLATFORM_STEP = 0.012;
const NEUTRAL_IDEOLOGY: IdeologyVector = {
  economic: 0,
  social: 0,
  authority: 0,
  green: 0,
  nationalism: 0,
  globalism: 0,
};

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function axisForIssue(issue: PartyPlatformIssue): IdeologyAxis {
  if (["economy", "taxes", "labor", "housing"].includes(issue)) return "economic";
  if (issue === "social_policy") return "social";
  if (issue === "environment") return "green";
  if (issue === "foreign_policy") return "globalism";
  return "authority";
}

function positionFromIdeology(ideology: IdeologyVector, issue: PartyPlatformIssue): number {
  const value = ideology[axisForIssue(issue)] ?? 0;
  return issue === "institutional_reform" ? -value : value;
}

function positionsFromIdeology(ideology: IdeologyVector): Record<PartyPlatformIssue, number> {
  return Object.fromEntries(
    PARTY_PLATFORM_ISSUES.map((issue) => [issue, clamp(positionFromIdeology(ideology, issue))]),
  ) as Record<PartyPlatformIssue, number>;
}

function emptyPositions(): Record<PartyPlatformIssue, number> {
  return Object.fromEntries(PARTY_PLATFORM_ISSUES.map((issue) => [issue, 0])) as Record<
    PartyPlatformIssue,
    number
  >;
}

export function seedPublicPartyPlatform(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  includeOpeningRecord = true,
): PartyPublicPlatform {
  const positions = positionsFromIdeology(world.partyPublicIdeology[partyId] ?? NEUTRAL_IDEOLOGY);
  const opening: PartyPlatformHistoryEntry = {
    date: state.currentDate,
    reason: "scenario_opening",
    leaderId: state.partyStates[partyId]?.leaderId ?? null,
    positions: { ...positions },
  };
  return {
    updatedDate: state.currentDate,
    positions,
    history: includeOpeningRecord ? [opening] : [],
  };
}

/** Deterministic structural default for a migrated save before the next monthly update. */
export function neutralPublicPartyPlatform(date: string): PartyPublicPlatform {
  return { updatedDate: date, positions: emptyPositions(), history: [] };
}

function meanMemberPosition(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  issue: PartyPlatformIssue,
): number {
  const members = partyMembers(state, partyId);
  if (members.length === 0) return 0;
  const values = members.flatMap((id) => {
    const profile = getAgentProfile(world, state, id);
    return profile ? [positionFromIdeology(profile.ideology, issue)] : [];
  });
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function factionPosition(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  issue: PartyPlatformIssue,
): number {
  const factions = Object.values(world.factionDefinitions).filter((faction) => faction.partyId === partyId);
  const baseline = world.partyPublicIdeology[partyId] ?? NEUTRAL_IDEOLOGY;
  if (factions.length === 0) return positionFromIdeology(baseline, issue);
  let total = 0;
  let weight = 0;
  for (const faction of factions) {
    const share = Math.max(0, faction.share);
    total += positionFromIdeology(
      world.factionPublicIdeology[faction.factionId] ?? baseline,
      issue,
    ) * share;
    weight += share;
  }
  return weight > 0 ? total / weight : 0;
}

function platformTarget(
  world: KernelWorld,
  state: SimState,
  partyId: string,
  issue: PartyPlatformIssue,
): number {
  const baseline = positionFromIdeology(world.partyPublicIdeology[partyId] ?? NEUTRAL_IDEOLOGY, issue);
  const members = meanMemberPosition(world, state, partyId, issue);
  const faction = factionPosition(world, state, partyId, issue);
  const leaderId = state.partyStates[partyId]?.leaderId;
  const leader = leaderId ? getAgentProfile(world, state, leaderId) : null;
  const leadership = leader ? positionFromIdeology(leader.ideology, issue) : baseline;
  return clamp(baseline * 0.55 + members * 0.2 + faction * 0.1 + leadership * 0.15);
}

export function recordPartyPlatform(
  state: SimState,
  partyId: string,
  reason: PartyPlatformHistoryEntry["reason"],
): void {
  const party = state.partyStates[partyId];
  const platform = party?.publicPlatform;
  if (!party || !platform) return;
  if (platform.history.some((entry) => entry.date === state.currentDate && entry.reason === reason)) return;
  platform.history.push({
    date: state.currentDate,
    reason,
    leaderId: party.leaderId,
    positions: { ...platform.positions },
  });
  if (platform.history.length > PLATFORM_HISTORY_LIMIT) {
    platform.history.splice(0, platform.history.length - PLATFORM_HISTORY_LIMIT);
  }
}

export function updatePublicPartyPlatforms(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const party = state.partyStates[partyId]!;
    party.publicPlatform ??= seedPublicPartyPlatform(world, state, partyId, false);
    for (const issue of PARTY_PLATFORM_ISSUES) {
      const current = party.publicPlatform.positions[issue] ?? 0;
      const target = platformTarget(world, state, partyId, issue);
      const change = Math.max(-MONTHLY_PLATFORM_STEP, Math.min(MONTHLY_PLATFORM_STEP, (target - current) * 0.08));
      party.publicPlatform.positions[issue] = clamp(current + change);
    }
    party.publicPlatform.updatedDate = state.currentDate;
    const year = state.currentDate.slice(0, 4);
    const publish = state.currentDate.slice(5, 7) === "01" &&
      !party.publicPlatform.history.some((entry) => entry.reason === "annual_conference" && entry.date.startsWith(year));
    if (!publish) continue;
    recordPartyPlatform(state, partyId, "annual_conference");
    events.push(pushHistory(state, {
      date: state.currentDate,
      type: "PARTY_PLATFORM_PUBLISHED",
      importance: 0.45,
      visibility: "public",
      actorIds: party.leaderId ? [party.leaderId] : [],
      entityIds: [partyId],
      payload: { partyId, reason: "annual_conference" },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }));
  }
  return events;
}

export function partyPlatformIssueForBillItem(issueId: string, provisionId?: string | null): PartyPlatformIssue {
  const category = provisionId ? legislativeProvision(provisionId)?.category.toLowerCase() ?? "" : "";
  if (issueId === "ISS_LABOR" || category.includes("labor") || category.includes("worker")) return "labor";
  if (issueId === "ISS_HOUSING" || category.includes("housing") || category.includes("rent")) return "housing";
  if (issueId === "ISS_CLIMATE" || category.includes("climate") || category.includes("energy")) return "environment";
  if (category.includes("tax") || category.includes("revenue")) return "taxes";
  if (["ISS_LIBERTY", "ISS_IMMIGRATION", "ISS_POLICING"].includes(issueId)) return "social_policy";
  if (["ISS_DECENT", "ISS_EXEC", "ISS_REFORM"].includes(issueId)) return "institutional_reform";
  if (["ISS_DEFENSE", "ISS_TRADE"].includes(issueId)) return "foreign_policy";
  return "economy";
}

export function partyPlatformFit(state: SimState, partyId: string, bill: BillState): number {
  const positions = state.partyStates[partyId]?.publicPlatform?.positions;
  if (!positions || bill.policyItems.length === 0) return 0;
  const total = bill.policyItems.reduce((sum, item) => {
    const issue = partyPlatformIssueForBillItem(item.issueId, item.provisionId);
    return sum + (positions[issue] ?? 0) * item.direction * item.magnitude;
  }, 0);
  return clamp(total / bill.policyItems.length);
}

export function partyPlatformLabel(issue: PartyPlatformIssue, value: number): string {
  const band = value <= -0.28 ? -1 : value >= 0.28 ? 1 : 0;
  const labels: Record<PartyPlatformIssue, readonly [string, string, string]> = {
    economy: ["Market-led growth", "Mixed-economy stewardship", "Public investment and security"],
    taxes: ["Tax restraint", "Balanced tax mix", "Progressive public revenue"],
    labor: ["Flexible labor rules", "Negotiated workplace balance", "Stronger worker bargaining"],
    housing: ["Private housing supply", "Mixed housing supply", "Public and affordable housing"],
    social_policy: ["Traditional social limits", "Settled-rights approach", "Expanded personal freedoms"],
    environment: ["Development first", "Managed transition", "Accelerated green transition"],
    institutional_reform: ["Executive-centered order", "Institutional stewardship", "Structural democratic reform"],
    foreign_policy: ["National independence", "Pragmatic internationalism", "Multilateral engagement"],
  };
  return labels[issue][band + 1]!;
}
