import { addMonths } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { assemblyCaucus } from "../parties/queries.js";
import type { CaucusLeadershipContest, CaucusLeadershipState, RecommendationStance } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function leadershipScore(world: KernelWorld, state: SimState, id: string, role: CaucusLeadershipContest["role"]): number {
  const profile = getAgentProfile(world, state, id);
  if (!profile) return 0;
  return role === "floor_leader"
    ? profile.skills.legislation * 0.34 + profile.skills.negotiation * 0.25 + profile.skills.media * 0.12 + profile.traits.ambition * 0.17 + profile.traits.partyLoyalty * 0.12
    : profile.skills.legislation * 0.22 + profile.skills.negotiation * 0.27 + profile.traits.partyLoyalty * 0.3 + profile.traits.pragmatism * 0.21;
}

function nextCaucusElectionDate(date: string): string {
  return addMonths(date, 48);
}

function selectInitialOfficer(world: KernelWorld, state: SimState, partyId: string, role: CaucusLeadershipContest["role"], exclude: string | null): string | null {
  return assemblyCaucus(world, state, partyId)
    .filter((id) => id !== state.playerPoliticianId && id !== exclude)
    .sort((a, b) => leadershipScore(world, state, b, role) - leadershipScore(world, state, a, role) || a.localeCompare(b))[0] ?? null;
}

export function seedCaucusLeadership(world: KernelWorld, state: SimState): void {
  const represented = new Set(
    Object.values(state.officeTerms)
      .filter((term) => term.status === "active" && world.offices[term.officeId]?.kind === "assembly_member")
      .map((term) => state.politicians[term.holderId]?.partyId)
      .filter((id): id is string => Boolean(id)),
  );
  for (const partyId of [...represented].sort()) {
    if (state.legislatureRuntime.caucusLeadership[partyId]) continue;
    const floorLeaderId = selectInitialOfficer(world, state, partyId, "floor_leader", null);
    const whipId = selectInitialOfficer(world, state, partyId, "whip", floorLeaderId);
    state.legislatureRuntime.caucusLeadership[partyId] = {
      partyId,
      floorLeaderId,
      whipId,
      selectedDate: state.currentDate,
      nextElectionDate: nextCaucusElectionDate(state.currentDate),
      priorityBillIds: [],
    };
  }
  for (const partyId of Object.keys(state.legislatureRuntime.caucusLeadership)) {
    if (!represented.has(partyId)) delete state.legislatureRuntime.caucusLeadership[partyId];
  }
}

function contestId(partyId: string, role: CaucusLeadershipContest["role"], date: string): string {
  return `CAUCUS_${partyId}_${role}_${date.slice(0, 7).replace("-", "")}`;
}

function platformFor(
  id: string,
  role: CaucusLeadershipContest["role"],
): "legislative_agenda" | "party_unity" | "electoral_recovery" {
  const choices = role === "floor_leader"
    ? (["legislative_agenda", "party_unity", "electoral_recovery"] as const)
    : (["party_unity", "legislative_agenda", "electoral_recovery"] as const);
  return choices[stableHash(`${id}:${role}:platform`) % choices.length]!;
}

function seedContestCampaigns(
  world: KernelWorld,
  state: SimState,
  contest: CaucusLeadershipContest,
): void {
  const caucus = assemblyCaucus(world, state, contest.partyId);
  for (const candidateId of contest.candidateIds) {
    contest.platforms[candidateId] = platformFor(candidateId, contest.role);
    contest.endorsements[candidateId] = caucus
      .filter((id) => id !== candidateId && !contest.candidateIds.includes(id))
      .sort((a, b) => {
        const candidateFaction = state.politicians[candidateId]?.factionId;
        const sameA = candidateFaction && state.politicians[a]?.factionId === candidateFaction ? 1 : 0;
        const sameB = candidateFaction && state.politicians[b]?.factionId === candidateFaction ? 1 : 0;
        return sameB - sameA || leadershipScore(world, state, b, contest.role) - leadershipScore(world, state, a, contest.role) || a.localeCompare(b);
      })
      .slice(0, 2);
  }
}

function openContest(
  world: KernelWorld,
  state: SimState,
  leadership: CaucusLeadershipState,
  role: CaucusLeadershipContest["role"],
  trigger: CaucusLeadershipContest["trigger"],
): CaucusLeadershipContest | null {
  const id = contestId(leadership.partyId, role, state.currentDate);
  if (state.legislatureRuntime.caucusContests[id]) return null;
  const candidateIds = assemblyCaucus(world, state, leadership.partyId)
    .filter((candidateId) => candidateId !== state.playerPoliticianId)
    .sort((a, b) => leadershipScore(world, state, b, role) - leadershipScore(world, state, a, role) || a.localeCompare(b))
    .slice(0, 4);
  if (candidateIds.length === 0) return null;
  const contest: CaucusLeadershipContest = {
    id,
    partyId: leadership.partyId,
    role,
    status: "open",
    openedDate: state.currentDate,
    closeDate: addMonths(state.currentDate, 1),
    candidateIds,
    playerDecision: null,
    votes: {},
    winnerId: null,
    trigger,
    platforms: {},
    endorsements: {},
  };
  seedContestCampaigns(world, state, contest);
  state.legislatureRuntime.caucusContests[id] = contest;
  return contest;
}

function resolveContest(world: KernelWorld, state: SimState, contest: CaucusLeadershipContest): void {
  const electors = assemblyCaucus(world, state, contest.partyId);
  const totals: Record<string, number> = Object.fromEntries(contest.candidateIds.map((id) => [id, 0]));
  for (const electorId of electors) {
    const ranked = contest.candidateIds.slice().sort((a, b) => {
      const score = (candidateId: string): number => {
        const profile = getAgentProfile(world, state, candidateId);
        const sameFaction = state.politicians[electorId]?.factionId &&
          state.politicians[electorId]?.factionId === state.politicians[candidateId]?.factionId ? 0.08 : 0;
        const endorsement = contest.endorsements[candidateId]?.includes(electorId) ? 0.14 : 0;
        const platform = contest.platforms[candidateId];
        const platformFit = platform === "party_unity"
          ? (profile?.traits.partyLoyalty ?? 0.5) * 0.1
          : platform === "electoral_recovery"
            ? ((profile?.skills.campaigning ?? 0.5) + (profile?.skills.media ?? 0.5)) * 0.05
            : ((profile?.skills.legislation ?? 0.5) + (profile?.skills.negotiation ?? 0.5)) * 0.05;
        const noise = (stableHash(`${contest.id}:${electorId}:${candidateId}:noise`) % 1001) / 40000;
        return leadershipScore(world, state, candidateId, contest.role) + sameFaction + endorsement + platformFit + noise;
      };
      const as = score(a);
      const bs = score(b);
      return bs - as || a.localeCompare(b);
    });
    const choice = ranked[0];
    if (!choice) continue;
    contest.votes[electorId] = choice;
    totals[choice] = (totals[choice] ?? 0) + 1;
  }
  contest.winnerId = contest.candidateIds.slice().sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a.localeCompare(b))[0] ?? null;
  contest.status = "resolved";
  const leadership = state.legislatureRuntime.caucusLeadership[contest.partyId];
  if (leadership) {
    if (contest.role === "floor_leader") leadership.floorLeaderId = contest.winnerId;
    else leadership.whipId = contest.winnerId;
    leadership.selectedDate = state.currentDate;
    leadership.nextElectionDate = nextCaucusElectionDate(state.currentDate);
  }
}

export function processCaucusLeadershipMonth(world: KernelWorld, state: SimState, commandId: string | null): SimEvent[] {
  seedCaucusLeadership(world, state);
  const events: SimEvent[] = [];
  for (const leadership of Object.values(state.legislatureRuntime.caucusLeadership).sort((a, b) => a.partyId.localeCompare(b.partyId))) {
    const caucus = new Set(assemblyCaucus(world, state, leadership.partyId));
    const latestGeneral = Object.values(state.elections)
      .filter((election) => election.type === "assembly" && election.status === "resolved")
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    const afterGeneral = latestGeneral != null && (!leadership.selectedDate || latestGeneral.date > leadership.selectedDate);
    const vacancy = !leadership.floorLeaderId || !leadership.whipId ||
      !caucus.has(leadership.floorLeaderId) || !caucus.has(leadership.whipId);
    const cohesion = state.partyStates[leadership.partyId]?.cohesion ?? 0.65;
    const challengeEligible = leadership.selectedDate != null &&
      state.currentDate >= addMonths(leadership.selectedDate, 18) && cohesion < 0.5 &&
      stableHash(`${leadership.partyId}:${state.currentDate.slice(0, 7)}:challenge`) % 100 < 2;
    const reviewDue = state.currentDate >= leadership.nextElectionDate;
    const reviewTriggered = reviewDue && (cohesion < 0.62 || stableHash(`${leadership.partyId}:${state.currentDate.slice(0, 4)}:review`) % 100 < 20);
    const trigger: CaucusLeadershipContest["trigger"] | null = afterGeneral
      ? "general_election"
      : vacancy
        ? "vacancy"
        : challengeEligible
          ? "challenge"
          : reviewTriggered
            ? "scheduled_review"
            : null;
    if (!trigger) {
      if (reviewDue) leadership.nextElectionDate = nextCaucusElectionDate(state.currentDate);
      continue;
    }
    const roles = trigger === "vacancy"
      ? ([
          ...(!leadership.floorLeaderId || !caucus.has(leadership.floorLeaderId) ? ["floor_leader" as const] : []),
          ...(!leadership.whipId || !caucus.has(leadership.whipId) ? ["whip" as const] : []),
        ])
      : (["floor_leader", "whip"] as const);
    for (const role of roles) {
      const open = Object.values(state.legislatureRuntime.caucusContests).some((contest) => contest.partyId === leadership.partyId && contest.role === role && contest.status === "open");
      if (!open) {
        const contest = openContest(world, state, leadership, role, trigger);
        if (contest) events.push(pushHistory(state, { date: state.currentDate, type: "CAUCUS_LEADERSHIP_ELECTION_OPENED", importance: 0.46, visibility: "public", actorIds: [], entityIds: [contest.id, contest.partyId], payload: { contestId: contest.id, partyId: contest.partyId, role, trigger }, sourceScheduledEventId: null, sourceCommandId: commandId }));
      }
    }
  }
  for (const contest of Object.values(state.legislatureRuntime.caucusContests).sort((a, b) => a.id.localeCompare(b.id))) {
    if (contest.status !== "open" || state.currentDate < contest.closeDate) continue;
    if (contest.playerDecision == null) contest.playerDecision = "declined";
    resolveContest(world, state, contest);
    events.push(pushHistory(state, { date: state.currentDate, type: "CAUCUS_LEADERSHIP_ELECTION_RESOLVED", importance: 0.58, visibility: "public", actorIds: contest.winnerId ? [contest.winnerId] : [], entityIds: [contest.id, contest.partyId], payload: { contestId: contest.id, partyId: contest.partyId, role: contest.role, winnerId: contest.winnerId }, sourceScheduledEventId: null, sourceCommandId: commandId }));
  }
  return events;
}

export function declareCaucusLeadershipCandidacy(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  contestIdValue: string,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (actorId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "The player may only enter their own caucus contest") };
  const contest = state.legislatureRuntime.caucusContests[contestIdValue];
  if (!contest || contest.status !== "open") return { error: reject("INVALID_CONTEST", contestIdValue) };
  if (!assemblyCaucus(world, state, contest.partyId).includes(actorId)) return { error: reject("NOT_CAUCUS_MEMBER", actorId) };
  if (contest.playerDecision != null) return { error: reject("DECISION_ALREADY_MADE", contestIdValue) };
  contest.playerDecision = "declared";
  contest.candidateIds = [...new Set([...contest.candidateIds, actorId])].sort();
  contest.endorsements[actorId] ??= [];
  return { events: [pushHistory(state, { date: state.currentDate, type: "CAUCUS_LEADERSHIP_CANDIDACY_DECLARED", importance: 0.48, visibility: "public", actorIds: [actorId], entityIds: [contest.id, contest.partyId], payload: { contestId: contest.id, partyId: contest.partyId, role: contest.role }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

export function campaignCaucusLeadership(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  contestIdValue: string,
  emphasis: "legislative_agenda" | "party_unity" | "electoral_recovery",
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (actorId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "The player may only campaign for their own caucus candidacy") };
  const contest = state.legislatureRuntime.caucusContests[contestIdValue];
  if (!contest || contest.status !== "open") return { error: reject("INVALID_CONTEST", contestIdValue) };
  if (!contest.candidateIds.includes(actorId) || contest.playerDecision !== "declared") {
    return { error: reject("NOT_A_CANDIDATE", actorId) };
  }
  if (contest.platforms[actorId]) return { error: reject("CAUCUS_CAMPAIGN_USED", contestIdValue) };
  contest.platforms[actorId] = emphasis;
  const profile = getAgentProfile(world, state, actorId);
  const caucus = assemblyCaucus(world, state, contest.partyId);
  contest.endorsements[actorId] = caucus
    .filter((id) => id !== actorId && !contest.candidateIds.includes(id))
    .sort((a, b) => {
      const sameA = state.politicians[a]?.factionId && state.politicians[a]?.factionId === state.politicians[actorId]?.factionId ? 1 : 0;
      const sameB = state.politicians[b]?.factionId && state.politicians[b]?.factionId === state.politicians[actorId]?.factionId ? 1 : 0;
      return sameB - sameA || leadershipScore(world, state, b, contest.role) - leadershipScore(world, state, a, contest.role) || a.localeCompare(b);
    })
    .slice(0, 1 + Math.round(profile?.skills.negotiation ?? 0.5));
  return { events: [pushHistory(state, { date: state.currentDate, type: "CAUCUS_LEADERSHIP_CAMPAIGN", importance: 0.38, visibility: "public", actorIds: [actorId, ...contest.endorsements[actorId]], entityIds: [contest.id, contest.partyId], payload: { contestId: contest.id, partyId: contest.partyId, role: contest.role, emphasis, endorsements: contest.endorsements[actorId] }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}

export function setCaucusBillPosition(
  state: SimState,
  actorId: string,
  billId: string,
  stance: RecommendationStance,
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const partyId = state.politicians[actorId]?.partyId;
  if (!partyId) return { error: reject("NOT_CAUCUS_MEMBER", actorId) };
  const leadership = state.legislatureRuntime.caucusLeadership[partyId];
  if (!leadership || (leadership.floorLeaderId !== actorId && leadership.whipId !== actorId)) return { error: reject("NOT_CAUCUS_LEADER", actorId) };
  const bill = state.legislatureRuntime.bills[billId];
  if (!bill) return { error: reject("UNKNOWN_BILL", billId) };
  state.legislatureRuntime.partyRecommendations[`${partyId}:${billId}`] = { partyId, billId, stance, setById: actorId, date: state.currentDate, source: "caucus_leadership" };
  if (leadership.floorLeaderId === actorId && !leadership.priorityBillIds.includes(billId)) leadership.priorityBillIds = [billId, ...leadership.priorityBillIds].slice(0, 5);
  return { events: [pushHistory(state, { date: state.currentDate, type: "CAUCUS_BILL_POSITION_SET", importance: 0.44, visibility: "public", actorIds: [actorId], entityIds: [partyId, billId], payload: { partyId, billId, stance }, sourceScheduledEventId: null, sourceCommandId: commandId })] };
}
