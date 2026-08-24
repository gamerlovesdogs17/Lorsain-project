import { addMonths, compareIsoDate } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { createPartyContest, declareCandidacy, openPartyContest, resolvePartyContest } from "./contests.js";
import { factionMembers, partyMembers } from "./queries.js";
import type { PartyContest, PartyContestType } from "./types.js";

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sufferedSevereAssemblyDefeat(state: SimState, partyId: string): boolean {
  const latest = Object.values(state.elections)
    .filter((election) => election.type === "assembly" && election.status === "resolved" && election.assembly)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest?.assembly) return false;
  return (latest.assembly.previousPartySeatTotals[partyId] ?? 0) - (latest.assembly.partySeatTotals[partyId] ?? 0) >= 15;
}

function buildCandidateScores(world: KernelWorld, state: SimState): Map<string, number> {
  const federalMembers = new Set<string>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.status === "active" && world.offices[term.officeId]?.kind === "assembly_member") {
      federalMembers.add(term.holderId);
    }
  }
  const provincialCareer = new Set(
    Object.values(state.provincialRuntime.legislators)
      .filter((row) => row.fullPoliticianId && row.serviceEndDate == null)
      .map((row) => row.fullPoliticianId!),
  );
  const scores = new Map<string, number>();
  for (const id of Object.keys(state.politicians)) {
    const profile = getAgentProfile(world, state, id);
    if (!profile) {
      scores.set(id, 0);
      continue;
    }
    scores.set(
      id,
      profile.traits.ambition * 0.3 +
        profile.skills.legislation * 0.23 +
        profile.skills.campaigning * 0.15 +
        profile.skills.negotiation * 0.14 +
        profile.traits.partyLoyalty * 0.1 +
        (federalMembers.has(id) ? 0.06 : 0) +
        (provincialCareer.has(id) ? 0.02 : 0),
    );
  }
  return scores;
}

function unresolvedFor(
  state: SimState,
  type: PartyContestType,
  partyId: string,
  factionId: string | null,
): PartyContest | null {
  return (
    Object.values(state.partyContests).find(
      (contest) =>
        contest.type === type &&
        contest.partyId === partyId &&
        contest.factionId === factionId &&
        !["resolved", "cancelled"].includes(contest.status),
    ) ?? null
  );
}

function latestCycleYear(
  state: SimState,
  type: PartyContestType,
  partyId: string,
  factionId: string | null,
): number | null {
  const years = Object.values(state.partyContests)
    .filter((contest) => contest.type === type && contest.partyId === partyId && contest.factionId === factionId)
    .map((contest) => contest.metadata.institutionalCycleYear)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value));
  return years.length > 0 ? Math.max(...years) : null;
}

function openRecurringContest(
  world: KernelWorld,
  state: SimState,
  args: { type: "party_leadership" | "faction_chair"; partyId: string; factionId: string | null; cycleYear: number },
  commandId: string,
  candidateScores: Map<string, number>,
): SimEvent[] {
  const created = createPartyContest(
    state,
    world,
    {
      type: args.type,
      partyId: args.partyId,
      factionId: args.factionId,
      metadata: {
        selectorMethod: "member_rcv",
        institutionalCycleYear: args.cycleYear,
        scheduledCloseDate: addMonths(state.currentDate, 2),
      },
    },
    commandId,
  );
  if ("error" in created) return [];
  const events = [...created.events];
  const pool = (args.type === "faction_chair" && args.factionId
    ? factionMembers(state, args.factionId)
    : partyMembers(state, args.partyId))
    .filter((id) => id !== state.playerPoliticianId)
    .filter((id) => state.politicians[id]?.alive && !state.politicians[id]?.retired)
    .sort((a, b) => (candidateScores.get(b) ?? 0) - (candidateScores.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, 4);
  for (const id of pool) {
    const declared = declareCandidacy(state, world, created.contest.id, id, commandId);
    if (!("error" in declared)) events.push(...declared.events);
  }
  const opened = openPartyContest(state, created.contest.id, commandId);
  if (!("error" in opened)) events.push(...opened.events);
  return events;
}

/** Recurring public leadership elections; the player is never auto-entered. */
export function processPartyInstitutionsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const year = Number(state.currentDate.slice(0, 4));
  const month = state.currentDate.slice(5, 7);
  let candidateScores: Map<string, number> | null = null;
  const scores = () => (candidateScores ??= buildCandidateScores(world, state));
  for (const partyId of Object.keys(state.partyStates).sort()) {
    const party = state.partyStates[partyId]!;
    const leader = party.leaderId ? state.politicians[party.leaderId] : null;
    if (party.leaderId && (!leader?.alive || leader.retired)) party.leaderId = null;
    const vacant = party.leaderId == null;
    const reviewDue = month === "01" && year >= 2029 && (year - 2029) % 4 === 0;
    const challenged = reviewDue && (party.cohesion < 0.58 || sufferedSevereAssemblyDefeat(state, partyId) || stableHash(`${partyId}:${year}:leadership-review`) % 100 < 34);
    const latest = latestCycleYear(state, "party_leadership", partyId, null);
    if ((vacant || challenged) && latest !== year && !unresolvedFor(state, "party_leadership", partyId, null)) {
      events.push(...openRecurringContest(world, state, { type: "party_leadership", partyId, factionId: null, cycleYear: year }, commandId, scores()));
    }
  }
  for (const factionId of Object.keys(state.factionStates).sort()) {
    const faction = state.factionStates[factionId]!;
    if (faction.status === "split_origin") continue;
    const chair = faction.chairId ? state.politicians[faction.chairId] : null;
    if (faction.chairId && (!chair?.alive || chair.retired)) faction.chairId = null;
    const vacant = faction.chairId == null;
    const reviewDue = month === "07" && year >= 2029 && (year - 2029) % 4 === 0;
    const challenged = reviewDue && (faction.cohesion < 0.55 || stableHash(`${factionId}:${year}:chair-review`) % 100 < 32);
    const latest = latestCycleYear(state, "faction_chair", faction.partyId, factionId);
    if ((vacant || challenged) && latest !== year && !unresolvedFor(state, "faction_chair", faction.partyId, factionId)) {
      events.push(...openRecurringContest(world, state, { type: "faction_chair", partyId: faction.partyId, factionId, cycleYear: year }, commandId, scores()));
    }
  }
  for (const contest of Object.values(state.partyContests).sort((a, b) => a.id.localeCompare(b.id))) {
    if (contest.type === "presidential_nomination" || contest.status !== "open") continue;
    const close = contest.metadata.scheduledCloseDate;
    if (typeof close !== "string" || compareIsoDate(state.currentDate, close) < 0) continue;
    const active = Object.values(contest.entries).filter((entry) => entry.status === "declared" || entry.status === "qualified");
    if (active.length === 0) continue;
    const resolved = resolvePartyContest(state, world, contest.id, rng, commandId);
    if (!("error" in resolved)) events.push(...resolved.events);
  }
  return events;
}
