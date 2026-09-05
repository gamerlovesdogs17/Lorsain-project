import { getAgentProfile } from "../agents/profile.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import type { KernelWorld, SimState } from "../types.js";

export const PARLIAMENTARY_DISCIPLINE_LABELS = [
  "Loose",
  "Moderate",
  "Strong",
  "Very Strong",
] as const;
export type ParliamentaryDisciplineLabel = (typeof PARLIAMENTARY_DISCIPLINE_LABELS)[number];

export type ParliamentaryDiscipline = {
  partyId: string;
  score: number;
  label: ParliamentaryDisciplineLabel;
  publicReasons: string[];
};

const disciplineCache = new WeakMap<SimState, Map<string, ParliamentaryDiscipline>>();

function labelFor(score: number): ParliamentaryDisciplineLabel {
  if (score < 0.42) return "Loose";
  if (score < 0.6) return "Moderate";
  if (score < 0.78) return "Strong";
  return "Very Strong";
}

/** Public-facing category derived from evolving institutions, never a hidden command probability. */
export function parliamentaryDiscipline(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): ParliamentaryDiscipline {
  const party = state.partyStates[partyId];
  const cache = disciplineCache.get(state) ?? new Map<string, ParliamentaryDiscipline>();
  disciplineCache.set(state, cache);
  const cacheKey = `${state.currentDate}:${partyId}:${party?.leaderId ?? "vacant"}:${party?.cohesion ?? 0}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const leader = party?.leaderId ? getAgentProfile(world, state, party.leaderId) : null;
  const leaderStanding = party?.leaderId
    ? candidateStandingOrDefault(world, state, party.leaderId).favorability
    : -0.5;
  const leaderStrength = leader
    ? (leader.skills.negotiation + leader.traits.institutionalism + leader.traits.partyLoyalty) / 3
    : 0.25;
  const factions = Object.values(state.factionStates).filter(
    (row) => row.partyId === partyId && row.status === "active",
  );
  const factionStability =
    factions.length > 0
      ? factions.reduce((sum, row) => sum + row.cohesion, 0) / factions.length
      : 0.5;
  const openLeadershipContest = Object.values(state.partyContests).some(
    (contest) =>
      contest.partyId === partyId &&
      contest.type === "party_leadership" &&
      contest.status !== "resolved" &&
      contest.status !== "cancelled",
  );
  const latestAssembly = Object.values(state.elections)
    .filter(
      (election) =>
        election.type === "assembly" && election.status === "resolved" && election.assembly,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const seatDelta = latestAssembly?.assembly
    ? (latestAssembly.assembly.partySeatTotals[partyId] ?? 0) -
      (latestAssembly.assembly.previousPartySeatTotals[partyId] ?? 0)
    : 0;
  const score = Math.max(
    0.2,
    Math.min(
      0.92,
      0.12 +
        (party?.cohesion ?? 0.5) * 0.5 +
        leaderStrength * 0.17 +
        factionStability * 0.13 +
        Math.max(-0.05, Math.min(0.05, seatDelta / 300)) +
        Math.max(-0.04, Math.min(0.04, leaderStanding * 0.04)) -
        (openLeadershipContest ? 0.1 : 0),
    ),
  );
  const publicReasons: string[] = [];
  if (openLeadershipContest) publicReasons.push("Leadership is being contested");
  if (factionStability < 0.48) publicReasons.push("Caucuses are divided");
  if (factionStability > 0.7) publicReasons.push("Caucuses are broadly aligned");
  if (seatDelta >= 10) publicReasons.push("Recent electoral gains strengthened leadership");
  if (seatDelta <= -10) publicReasons.push("Recent electoral losses weakened leadership");
  if (leaderStrength >= 0.72) publicReasons.push("Leadership is institutionally strong");
  if (publicReasons.length === 0) publicReasons.push("Party and caucus relations are stable");
  const result = { partyId, score, label: labelFor(score), publicReasons };
  cache.set(cacheKey, result);
  return result;
}
