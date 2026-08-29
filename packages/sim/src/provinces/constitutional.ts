import { addMonths, compareIsoDate } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { currentAssemblyMemberIds, currentPresidentId } from "../legislature/state.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type {
  ConstitutionalAmendment,
  ConstitutionalRuleId,
  ProvincialVote,
} from "./types.js";
import { CONSTITUTIONAL_RULE_IDS } from "./types.js";

const LEGAL_VALUES: Record<ConstitutionalRuleId, readonly number[]> = {
  assembly_term_years: [3, 4, 5],
  presidential_term_limit: [1, 2, 3],
  court_term_years: [9, 12, 15],
  veto_override_fraction: [0.6, 2 / 3, 0.75],
};

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function isFederalMp(world: KernelWorld, state: SimState, id: string): boolean {
  return currentAssemblyMemberIds(world, state).includes(id);
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleFor(state: SimState, ruleId: ConstitutionalRuleId): string {
  const label = state.provincialRuntime.constitutionalRules[ruleId]?.label ?? ruleId.replace(/_/g, " ");
  return `${label} Amendment`;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function monthNumber(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function monthsSince(currentDate: string, earlierDate: string): number {
  return monthNumber(currentDate) - monthNumber(earlierDate);
}

function amendmentDirection(state: SimState, ruleId: ConstitutionalRuleId, proposedValue: number): number {
  const current = state.provincialRuntime.constitutionalRules[ruleId]?.value ?? proposedValue;
  const values = LEGAL_VALUES[ruleId];
  const span = Math.max(...values) - Math.min(...values);
  return span === 0 ? 0 : clamp((proposedValue - current) / span, -1, 1);
}

type ProposalContext = {
  score: number;
  trigger: Exclude<ConstitutionalAmendment["proposalTrigger"], "player_sponsorship" | "legacy_proposal">;
};

/** Political demand for a specific rule change. This is pure and consumes no gameplay RNG. */
export function constitutionalProposalImpetus(
  world: KernelWorld,
  state: SimState,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
): ProposalContext {
  const direction = amendmentDirection(state, ruleId, proposedValue);
  const presidentId = currentPresidentId(world, state);
  const presidentStanding = presidentId ? state.candidateStanding[presidentId]?.favorability ?? 0 : 0;
  const presidentTerms = presidentId ? state.presidential.electedTermCountByPolitician[presidentId] ?? 0 : 0;
  const averageCohesion = Object.values(state.partyStates).length > 0
    ? Object.values(state.partyStates).reduce((sum, party) => sum + party.cohesion, 0) / Object.values(state.partyStates).length
    : 0.65;
  const confidenceStress = clamp((96 - state.economyRuntime.national.confidenceIndex) / 18);
  const recentAssemblyElection = Object.values(state.elections).some(
    (election) => election.type === "assembly" && election.status === "resolved" && monthsSince(state.currentDate, election.date) <= 12,
  );
  const recentReturns = Object.values(state.legislatureRuntime.bills).filter(
    (bill) => bill.presidentialDisposition === "returned" && bill.introducedDate && monthsSince(state.currentDate, bill.introducedDate) <= 36,
  ).length;
  const recentCourtCases = Object.values(state.constitutionalRuntime.courtCases).filter(
    (courtCase) => monthsSince(state.currentDate, courtCase.filedDate) <= 48,
  ).length;
  const recentCourtCrisis = Object.values(state.constitutionalRuntime.impeachments).some(
    (row) => monthsSince(state.currentDate, row.introducedDate) <= 48,
  ) || Object.values(state.constitutionalRuntime.recalls).some(
    (row) => monthsSince(state.currentDate, row.introducedDate) <= 48,
  );
  const activeJudges = Object.values(state.officeTerms).filter(
    (term) => term.status === "active" && world.offices[term.officeId]?.kind === "constitutional_court_justice",
  ).length;
  const courtVacancyShare = clamp((world.courtConstitution.judges - activeJudges) / Math.max(1, world.courtConstitution.judges));

  let score = 0.08 + confidenceStress * 0.08 + clamp((0.62 - averageCohesion) / 0.3) * 0.12;
  let trigger: ProposalContext["trigger"] = "reform_movement";
  if (ruleId === "assembly_term_years") {
    score += (recentAssemblyElection ? 0.22 : 0) + clamp((0.58 - averageCohesion) / 0.28) * 0.24;
    score += direction < 0 && averageCohesion < 0.52 ? 0.08 : 0;
    trigger = recentAssemblyElection ? "election_mandate" : "institutional_conflict";
  } else if (ruleId === "presidential_term_limit") {
    score += clamp(presidentTerms / Math.max(1, state.provincialRuntime.constitutionalRules.presidential_term_limit?.value ?? 2)) * 0.22;
    score += Math.abs(presidentStanding) * 0.16 + (recentCourtCrisis ? 0.22 : 0);
    score += direction * presidentStanding > 0 ? 0.1 : 0;
    trigger = recentCourtCrisis ? "institutional_conflict" : recentAssemblyElection ? "election_mandate" : "reform_movement";
  } else if (ruleId === "court_term_years") {
    score += courtVacancyShare * 0.34 + clamp(recentCourtCases / 8) * 0.2 + (recentCourtCrisis ? 0.22 : 0);
    score += direction > 0 && courtVacancyShare > 0 ? 0.08 : 0;
    trigger = recentCourtCrisis || courtVacancyShare > 0.2 ? "court_crisis" : "institutional_conflict";
  } else {
    score += clamp(recentReturns / 4) * 0.46 + (recentAssemblyElection && recentReturns > 0 ? 0.12 : 0);
    score += direction < 0 && recentReturns >= 2 ? 0.1 : 0;
    trigger = recentReturns > 0 ? "executive_legislative_conflict" : "institutional_conflict";
  }
  return { score: clamp(score), trigger };
}

/** Political support for the actual amendment; hash contributes only bounded final variance. */
export function constitutionalSupportScore(
  world: KernelWorld,
  state: SimState,
  amendment: ConstitutionalAmendment,
  memberId: string,
  provinceId: string | null = null,
): number {
  const profile = getAgentProfile(world, state, memberId);
  const provincialMember = state.provincialRuntime.legislators[memberId];
  const partyId = state.politicians[memberId]?.partyId ?? provincialMember?.partyId ?? null;
  const sponsorPartyId = state.politicians[amendment.sponsorId]?.partyId ?? null;
  const axis = amendment.ruleId === "assembly_term_years" || amendment.ruleId === "court_term_years"
    ? "authority"
    : amendment.ruleId === "presidential_term_limit" || amendment.ruleId === "veto_override_fraction"
      ? "authority"
      : "economic";
  const ideology = profile?.ideology[axis] ?? (partyId ? world.partyPublicIdeology[partyId]?.[axis] ?? 0 : 0);
  const direction = amendmentDirection(state, amendment.ruleId, amendment.proposedValue);
  const loyalty = profile?.traits.partyLoyalty ?? 0.45 + (stableHash(`${memberId}:constitutional-loyalty`) % 41) / 100;
  const institutionalism = profile?.traits.institutionalism ?? 0.52;
  const presidentId = currentPresidentId(world, state);
  const presidentPartyId = presidentId ? state.politicians[presidentId]?.partyId ?? null : null;
  let institutionalInterest = 0;
  if (amendment.ruleId === "presidential_term_limit" || amendment.ruleId === "veto_override_fraction") {
    const alignedWithPresident = partyId && presidentPartyId && partyId === presidentPartyId ? 1 : -1;
    institutionalInterest = alignedWithPresident * direction * 0.22;
  } else if (amendment.ruleId === "assembly_term_years") {
    institutionalInterest = direction * (profile?.traits.ambition ?? 0.5) * 0.1;
  } else if (amendment.ruleId === "court_term_years") {
    institutionalInterest = direction * institutionalism * 0.1;
  }
  let provinceInterest = 0;
  if (provinceId) {
    const governorId = Object.values(state.officeTerms).find(
      (term) => term.status === "active" && world.offices[term.officeId]?.kind === "governor" && world.offices[term.officeId]?.provinceId === provinceId,
    )?.holderId;
    const governorPartyId = governorId ? state.politicians[governorId]?.partyId ?? null : null;
    if (amendment.ruleId === "presidential_term_limit" || amendment.ruleId === "veto_override_fraction") {
      provinceInterest += governorPartyId && presidentPartyId && governorPartyId === presidentPartyId ? direction * 0.13 : -direction * 0.1;
    }
    const governance = state.provincialRuntime.provinces[provinceId];
    if (amendment.ruleId === "veto_override_fraction") provinceInterest += -(governance?.federalRelationship ?? 0) * direction * 0.12;
    if (amendment.ruleId === "assembly_term_years") provinceInterest += (governance?.politicalCapital ?? 0.5) < 0.35 ? -direction * 0.08 : 0;
  }
  const sponsorCoalition = partyId && sponsorPartyId && partyId === sponsorPartyId ? 0.2 * loyalty : 0;
  const reformConsensus = (amendment.politicalImpetus - 0.5) * 0.72;
  const statusQuo = (institutionalism - 0.5) * (amendment.politicalImpetus < 0.58 ? -0.18 : 0.08);
  const noise = ((stableHash(`${amendment.id}:${provinceId ?? "federal"}:${memberId}:vote`) % 1001) - 500) / 12500;
  return ideology * direction * 0.34 + sponsorCoalition + reformConsensus + statusQuo + institutionalInterest + provinceInterest + noise;
}

export function proposeConstitutionalAmendment(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
  commandId: string | null,
  politicalContext?: ProposalContext,
): { amendment: ConstitutionalAmendment; events: SimEvent[] } | { error: CommandError } {
  if (!isFederalMp(world, state, actorId)) return { error: reject("NOT_ASSEMBLY_MEMBER", actorId) };
  if (!LEGAL_VALUES[ruleId]?.some((value) => Math.abs(value - proposedValue) < 0.000001)) {
    return { error: reject("INVALID_CONSTITUTIONAL_VALUE", `${ruleId}:${proposedValue}`) };
  }
  const current = state.provincialRuntime.constitutionalRules[ruleId];
  if (!current) return { error: reject("UNKNOWN_CONSTITUTIONAL_RULE", ruleId) };
  if (Math.abs(current.value - proposedValue) < 0.000001) return { error: reject("NO_POLICY_CHANGE", ruleId) };
  const open = Object.values(state.provincialRuntime.constitutionalAmendments).some(
    (amendment) => amendment.ruleId === ruleId && ["proposed", "ratifying"].includes(amendment.status),
  );
  if (open) return { error: reject("AMENDMENT_ALREADY_PENDING", ruleId) };
  const id = `CAMEND_${String(Object.keys(state.provincialRuntime.constitutionalAmendments).length + 1).padStart(4, "0")}`;
  const amendment: ConstitutionalAmendment = {
    id,
    title: titleFor(state, ruleId),
    summary: `Changes ${current.label.toLowerCase()} from ${current.value} to ${proposedValue}.`,
    sponsorId: actorId,
    proposedDate: state.currentDate,
    ruleId,
    proposedValue,
    proposalTrigger: politicalContext?.trigger ?? (actorId === state.playerPoliticianId ? "player_sponsorship" : "reform_movement"),
    politicalImpetus: politicalContext?.score ?? constitutionalProposalImpetus(world, state, ruleId, proposedValue).score,
    status: "proposed",
    assemblyVoteId: null,
    assemblyVotes: {},
    assemblyYes: 0,
    ratificationDeadline: null,
    provincialVoteIds: {},
    ratifiedProvinceIds: [],
    rejectedProvinceIds: [],
    enactedDate: null,
  };
  state.provincialRuntime.constitutionalAmendments[id] = amendment;
  return {
    amendment,
    events: [pushHistory(state, { date: state.currentDate, type: "CONSTITUTIONAL_AMENDMENT_PROPOSED", importance: 0.86, visibility: "public", actorIds: [actorId], entityIds: [id, ruleId], payload: { amendmentId: id, ruleId, proposedValue, trigger: amendment.proposalTrigger, politicalImpetus: Math.round(amendment.politicalImpetus * 100) / 100 }, sourceScheduledEventId: null, sourceCommandId: commandId })],
  };
}

export function castConstitutionalAssemblyVote(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  amendmentId: string,
  choice: "yes" | "no" | "abstain",
): { error?: CommandError } {
  if (actorId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "Only the player stores their constitutional vote") };
  if (!isFederalMp(world, state, actorId)) return { error: reject("NOT_ASSEMBLY_MEMBER", actorId) };
  const amendment = state.provincialRuntime.constitutionalAmendments[amendmentId];
  if (!amendment || amendment.status !== "proposed") return { error: reject("AMENDMENT_NOT_PENDING", amendmentId) };
  amendment.assemblyVotes[actorId] = choice;
  return {};
}

export function castConstitutionalRatificationVote(
  state: SimState,
  actorId: string,
  amendmentId: string,
  choice: "yes" | "no" | "abstain",
): { error?: CommandError } {
  if (actorId !== state.playerPoliticianId) return { error: reject("PLAYER_AUTONOMY", "Only the player stores their ratification vote") };
  const amendment = state.provincialRuntime.constitutionalAmendments[amendmentId];
  if (!amendment || amendment.status !== "ratifying") return { error: reject("AMENDMENT_NOT_RATIFYING", amendmentId) };
  const row = state.provincialRuntime.legislators[actorId];
  if (!row || row.serviceEndDate != null) return { error: reject("NOT_PROVINCIAL_LEGISLATOR", actorId) };
  const key = `pending:${amendmentId}:${row.provinceId}:${actorId}`;
  state.provincialRuntime.votes[key] = {
    id: key,
    provinceId: row.provinceId,
    subjectKind: "constitutional_ratification",
    subjectId: amendmentId,
    date: state.currentDate,
    votes: { [actorId]: choice },
    yes: choice === "yes" ? 1 : 0,
    no: choice === "no" ? 1 : 0,
    abstain: choice === "abstain" ? 1 : 0,
    passed: false,
  };
  return {};
}

function federalVote(world: KernelWorld, state: SimState, amendment: ConstitutionalAmendment): void {
  const members = currentAssemblyMemberIds(world, state);
  let yes = 0;
  for (const id of members) {
    let choice = amendment.assemblyVotes[id];
    if (!choice) {
      if (id === state.playerPoliticianId) choice = "abstain";
      else {
        const score = constitutionalSupportScore(world, state, amendment, id);
        choice = score >= 0.045 ? "yes" : score <= -0.055 ? "no" : "abstain";
      }
      amendment.assemblyVotes[id] = choice;
    }
    if (choice === "yes") yes += 1;
  }
  amendment.assemblyYes = yes;
  amendment.assemblyVoteId = `CAVOTE_${amendment.id}`;
  if (yes >= 280) {
    amendment.status = "ratifying";
    // Lorsain v1 uses no universal ratification deadline. All 21 Provincial
    // Assemblies receive a recorded vote; the proposal fails if fewer than 13 ratify.
    amendment.ratificationDeadline = null;
  } else {
    amendment.status = "assembly_failed";
  }
}

function ratificationVote(world: KernelWorld, state: SimState, amendment: ConstitutionalAmendment, provinceId: string): ProvincialVote | null {
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly || assembly.memberIds.length === 0) return null;
  const votes: ProvincialVote["votes"] = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const memberId of assembly.memberIds) {
    const pendingKey = `pending:${amendment.id}:${provinceId}:${memberId}`;
    const pending = state.provincialRuntime.votes[pendingKey]?.votes[memberId];
    const score = constitutionalSupportScore(world, state, amendment, memberId, provinceId);
    const choice = pending ?? (memberId === state.playerPoliticianId ? "abstain" : score >= 0.035 ? "yes" : score <= -0.05 ? "no" : "abstain");
    votes[memberId] = choice;
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
    delete state.provincialRuntime.votes[pendingKey];
  }
  const id = `RATIFY_${amendment.id}_${provinceId}`;
  const passed = yes > no;
  const vote: ProvincialVote = { id, provinceId, subjectKind: "constitutional_ratification", subjectId: amendment.id, date: state.currentDate, votes, yes, no, abstain, passed };
  state.provincialRuntime.votes[id] = vote;
  return vote;
}

export function processConstitutionalAmendmentsMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const hasOpen = Object.values(state.provincialRuntime.constitutionalAmendments).some((amendment) => ["proposed", "ratifying"].includes(amendment.status));
  const prior = Object.values(state.provincialRuntime.constitutionalAmendments)
    .sort((a, b) => b.proposedDate.localeCompare(a.proposedDate) || b.id.localeCompare(a.id))[0];
  const cooldownSatisfied = !prior || monthsSince(state.currentDate, prior.proposedDate) >= 96;
  if (!hasOpen && cooldownSatisfied && monthNumber(state.currentDate) - monthNumber(state.scenarioStartDate) >= 48) {
    const possibilities = CONSTITUTIONAL_RULE_IDS.flatMap((ruleId) => {
      const current = state.provincialRuntime.constitutionalRules[ruleId]?.value;
      return LEGAL_VALUES[ruleId]
        .filter((value) => Math.abs(value - (current ?? value)) > 0.000001)
        .map((proposedValue) => ({ ruleId, proposedValue, context: constitutionalProposalImpetus(world, state, ruleId, proposedValue) }));
    }).sort((a, b) => b.context.score - a.context.score || a.ruleId.localeCompare(b.ruleId) || a.proposedValue - b.proposedValue);
    const proposal = possibilities[0];
    if (proposal && proposal.context.score >= 0.48) {
      const chance = clamp((proposal.context.score - 0.44) * 0.035, 0, 0.018);
      const gate = (stableHash(`${state.rng.masterSeed}:${state.currentDate}:${proposal.ruleId}:${proposal.proposedValue}:proposal`) % 10000) / 10000;
      if (gate < chance) {
        const draft: ConstitutionalAmendment = {
          id: "PROSPECTIVE",
          title: "Prospective amendment",
          summary: "Prospective amendment",
          sponsorId: "",
          proposedDate: state.currentDate,
          ruleId: proposal.ruleId,
          proposedValue: proposal.proposedValue,
          proposalTrigger: proposal.context.trigger,
          politicalImpetus: proposal.context.score,
          status: "proposed",
          assemblyVoteId: null,
          assemblyVotes: {},
          assemblyYes: 0,
          ratificationDeadline: null,
          provincialVoteIds: {},
          ratifiedProvinceIds: [],
          rejectedProvinceIds: [],
          enactedDate: null,
        };
        const sponsorId = currentAssemblyMemberIds(world, state)
          .filter((id) => id !== state.playerPoliticianId)
          .sort((a, b) => constitutionalSupportScore(world, state, { ...draft, sponsorId: b }, b) - constitutionalSupportScore(world, state, { ...draft, sponsorId: a }, a) || a.localeCompare(b))[0];
        if (sponsorId && constitutionalSupportScore(world, state, { ...draft, sponsorId }, sponsorId) > 0.05) {
          const proposed = proposeConstitutionalAmendment(world, state, sponsorId, proposal.ruleId, proposal.proposedValue, commandId, proposal.context);
          if (!("error" in proposed)) events.push(...proposed.events);
        }
      }
    }
  }
  for (const amendment of Object.values(state.provincialRuntime.constitutionalAmendments).sort((a, b) => a.id.localeCompare(b.id))) {
    if (amendment.status === "proposed" && compareIsoDate(state.currentDate, addMonths(amendment.proposedDate, 1)) >= 0) {
      federalVote(world, state, amendment);
      events.push(pushHistory(state, { date: state.currentDate, type: amendment.assemblyYes >= 280 ? "CONSTITUTIONAL_AMENDMENT_SENT_TO_PROVINCES" : "CONSTITUTIONAL_AMENDMENT_FAILED", importance: 0.88, visibility: "public", actorIds: [amendment.sponsorId], entityIds: [amendment.id], payload: { amendmentId: amendment.id, assemblyYes: amendment.assemblyYes, required: 280 }, sourceScheduledEventId: null, sourceCommandId: commandId }));
    }
    if (amendment.status !== "ratifying") continue;
    const unvoted = world.provinceIds
      .filter((provinceId) => !amendment.provincialVoteIds[provinceId])
      .sort((a, b) =>
        stableHash(`${amendment.id}:ratification-order:${a}`) -
          stableHash(`${amendment.id}:ratification-order:${b}`) || a.localeCompare(b),
      );
    for (const provinceId of unvoted.slice(0, 3)) {
      const vote = ratificationVote(world, state, amendment, provinceId);
      if (!vote) continue;
      amendment.provincialVoteIds[provinceId] = vote.id;
      (vote.passed ? amendment.ratifiedProvinceIds : amendment.rejectedProvinceIds).push(provinceId);
      events.push(pushHistory(state, { date: state.currentDate, type: "CONSTITUTIONAL_AMENDMENT_PROVINCIAL_VOTE", importance: 0.5, visibility: "public", actorIds: [], entityIds: [amendment.id, provinceId, vote.id], payload: { amendmentId: amendment.id, provinceId, yes: vote.yes, no: vote.no, abstain: vote.abstain, ratified: vote.passed }, sourceScheduledEventId: null, sourceCommandId: commandId }));
    }
    if (amendment.ratifiedProvinceIds.length >= 13) {
      amendment.status = "ratified";
      amendment.enactedDate = state.currentDate;
      const rule = state.provincialRuntime.constitutionalRules[amendment.ruleId];
      if (rule) {
        rule.value = amendment.proposedValue;
        rule.amendedDate = state.currentDate;
        rule.sourceAmendmentId = amendment.id;
      }
      events.push(pushHistory(state, { date: state.currentDate, type: "CONSTITUTIONAL_AMENDMENT_RATIFIED", importance: 1, visibility: "public", actorIds: [amendment.sponsorId], entityIds: [amendment.id, amendment.ruleId], payload: { amendmentId: amendment.id, ruleId: amendment.ruleId, value: amendment.proposedValue, ratifyingProvinces: amendment.ratifiedProvinceIds.length }, sourceScheduledEventId: null, sourceCommandId: commandId }));
    } else if (unvoted.length === 0 || (amendment.ratificationDeadline && compareIsoDate(state.currentDate, amendment.ratificationDeadline) >= 0)) {
      amendment.status = "failed";
      events.push(pushHistory(state, { date: state.currentDate, type: "CONSTITUTIONAL_AMENDMENT_FAILED", importance: 0.82, visibility: "public", actorIds: [amendment.sponsorId], entityIds: [amendment.id], payload: { amendmentId: amendment.id, stage: "provincial_ratification", ratifyingProvinces: amendment.ratifiedProvinceIds.length, required: 13 }, sourceScheduledEventId: null, sourceCommandId: commandId }));
    }
  }
  return events;
}
