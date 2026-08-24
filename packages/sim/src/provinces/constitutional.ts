import { addMonths, compareIsoDate } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
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

export function proposeConstitutionalAmendment(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
  commandId: string | null,
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
    events: [pushHistory(state, { date: state.currentDate, type: "CONSTITUTIONAL_AMENDMENT_PROPOSED", importance: 0.86, visibility: "public", actorIds: [actorId], entityIds: [id, ruleId], payload: { amendmentId: id, ruleId, proposedValue }, sourceScheduledEventId: null, sourceCommandId: commandId })],
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
        const profile = getAgentProfile(world, state, id);
        const publicImpetus = 0.1 + (stableHash(`${amendment.ruleId}:${amendment.proposedValue}:impetus`) % 9) / 100;
        const score =
          (profile?.traits.institutionalism ?? 0.5) * 0.45 +
          (profile?.traits.pragmatism ?? 0.5) * 0.2 +
          (profile?.skills.legislation ?? 0.5) * 0.15 +
          (stableHash(`${amendment.id}:${id}`) % 1000) / 5000 + publicImpetus;
        choice = score >= 0.58 ? "yes" : score >= 0.28 ? "no" : "abstain";
      }
      amendment.assemblyVotes[id] = choice;
    }
    if (choice === "yes") yes += 1;
  }
  amendment.assemblyYes = yes;
  amendment.assemblyVoteId = `CAVOTE_${amendment.id}`;
  if (yes >= 280) {
    amendment.status = "ratifying";
    amendment.ratificationDeadline = addMonths(state.currentDate, 18);
  } else {
    amendment.status = "assembly_failed";
  }
}

function ratificationVote(state: SimState, amendment: ConstitutionalAmendment, provinceId: string): ProvincialVote | null {
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly || assembly.memberIds.length === 0) return null;
  const votes: ProvincialVote["votes"] = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const memberId of assembly.memberIds) {
    const pendingKey = `pending:${amendment.id}:${provinceId}:${memberId}`;
    const pending = state.provincialRuntime.votes[pendingKey]?.votes[memberId];
    const roll = stableHash(`${amendment.id}:${provinceId}:${memberId}`) % 100;
    const choice = pending ?? (memberId === state.playerPoliticianId ? "abstain" : roll < 59 ? "yes" : roll < 94 ? "no" : "abstain");
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
  const year = Number(state.currentDate.slice(0, 4));
  const month = state.currentDate.slice(5, 7);
  const hasOpen = Object.values(state.provincialRuntime.constitutionalAmendments).some((amendment) => ["proposed", "ratifying"].includes(amendment.status));
  if (!hasOpen && month === "04" && year >= 2039 && (year - 2039) % 11 === 0) {
    const ruleId = CONSTITUTIONAL_RULE_IDS[stableHash(`${year}:rule`) % CONSTITUTIONAL_RULE_IDS.length]!;
    const current = state.provincialRuntime.constitutionalRules[ruleId]?.value;
    const alternatives = LEGAL_VALUES[ruleId].filter((value) => Math.abs(value - (current ?? value)) > 0.000001);
    const proposedValue = alternatives[stableHash(`${year}:${ruleId}:value`) % Math.max(1, alternatives.length)];
    const sponsorId = currentAssemblyMemberIds(world, state)
      .filter((id) => id !== state.playerPoliticianId)
      .sort((a, b) => {
        const ap = getAgentProfile(world, state, a);
        const bp = getAgentProfile(world, state, b);
        const as = (ap?.traits.institutionalism ?? 0) + (ap?.skills.legislation ?? 0);
        const bs = (bp?.traits.institutionalism ?? 0) + (bp?.skills.legislation ?? 0);
        return bs - as || a.localeCompare(b);
      })[0];
    if (sponsorId && proposedValue != null) {
      const proposed = proposeConstitutionalAmendment(world, state, sponsorId, ruleId, proposedValue, commandId);
      if (!("error" in proposed)) events.push(...proposed.events);
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
      const vote = ratificationVote(state, amendment, provinceId);
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
