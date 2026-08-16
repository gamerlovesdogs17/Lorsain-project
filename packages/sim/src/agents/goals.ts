import type { IsoDate } from "../calendar.js";
import { padId } from "../scheduler.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { jsonSafetyError, type JsonObject } from "../json.js";
import {
  ageOnDate,
  getAgentProfile,
  publicPoliticianFacts,
  requireAgentProfile,
} from "./profile.js";
import { GOAL_MIN_DRAFT_PRIORITY, MAX_ACTIVE_GOALS, clamp01 } from "./policy.js";
import {
  PRESIDENTIAL_SEEK_STATUSES,
  isGoalHorizon,
  isGoalStatus,
  isGoalType,
  type GoalHorizon,
  type GoalStatus,
  type GoalType,
} from "./types.js";

export type PoliticianGoal = {
  id: string;
  ownerId: string;
  type: GoalType;
  priority: number;
  status: GoalStatus;
  createdDate: IsoDate;
  lastReviewedDate: IsoDate;
  horizon: GoalHorizon;
  targetOfficeId: string | null;
  targetOfficeKind: string | null;
  targetIssueId: string | null;
  targetEntityId: string | null;
  source: string;
  metadata: JsonObject;
};

type GoalDraft = {
  type: GoalType;
  priority: number;
  horizon: GoalHorizon;
  targetOfficeId: string | null;
  targetOfficeKind: string | null;
  targetIssueId: string | null;
  targetEntityId: string | null;
  source: string;
  metadata: JsonObject;
};

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function goalIdentity(g: {
  type: GoalType;
  targetOfficeId: string | null;
  targetOfficeKind: string | null;
  targetIssueId: string | null;
  targetEntityId: string | null;
}): string {
  return [
    g.type,
    g.targetOfficeId ?? "",
    g.targetOfficeKind ?? "",
    g.targetIssueId ?? "",
    g.targetEntityId ?? "",
  ].join("|");
}

function compareDrafts(a: GoalDraft, b: GoalDraft): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.type < b.type) return -1;
  if (a.type > b.type) return 1;
  const ia = goalIdentity(a);
  const ib = goalIdentity(b);
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

function primaryOffice(
  facts: NonNullable<ReturnType<typeof publicPoliticianFacts>>,
): { officeId: string; kind: string } | null {
  const rank = [
    "president",
    "speaker",
    "governor",
    "minister",
    "mayor",
    "constitutional_court_justice",
    "assembly_member",
  ];
  for (const kind of rank) {
    const hit = facts.occupying.find((o) => o.kind === kind);
    if (hit) return hit;
  }
  return facts.occupying[0] ?? null;
}

/**
 * Deterministic draft motivations from canonical actor facts. No RNG.
 */
export function generateGoalDrafts(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  asOfDate: IsoDate = state.currentDate,
): GoalDraft[] {
  const profile = getAgentProfile(world, state, politicianId);
  const runtime = state.politicians[politicianId];
  if (!profile || !runtime || !runtime.alive) return [];
  const facts = publicPoliticianFacts(world, state, politicianId);
  if (!facts) return [];
  const t = profile.traits;
  const age = ageOnDate(profile.birthDate, asOfDate) ?? 50;
  const drafts: GoalDraft[] = [];
  const held = primaryOffice(facts);
  const retired = runtime.retired;

  if (held && t.retirementInclination < 0.85 && !retired) {
    drafts.push({
      type: "retain_office",
      priority: clamp01(0.45 + 0.4 * (1 - t.retirementInclination) + 0.15 * t.ambition),
      horizon: "near",
      targetOfficeId: held.officeId,
      targetOfficeKind: held.kind,
      targetIssueId: null,
      targetEntityId: null,
      source: "officeholding",
      metadata: {},
    });
  }

  if (t.ambition >= 0.35 && !retired) {
    drafts.push({
      type: "career_advancement",
      priority: clamp01(t.ambition * 0.85 - t.retirementInclination * 0.35),
      horizon: "career",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: null,
      source: "ambition",
      metadata: {},
    });
  }

  if (t.ambition >= 0.45) {
    drafts.push({
      type: "increase_influence",
      priority: clamp01(t.ambition * 0.7 + t.ego * 0.2),
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: null,
      source: "ambition",
      metadata: {},
    });
  }

  const hasPartyInstitutions = Object.keys(state.partyStates).length > 0;
  const isFactionChair = hasPartyInstitutions
    ? Boolean(runtime.factionId && state.factionStates[runtime.factionId]?.chairId === politicianId)
    : profile.roleTypes.includes("faction_chair") && Boolean(runtime.factionId);
  if (isFactionChair && runtime.factionId) {
    drafts.push({
      type: "advance_faction",
      priority: clamp01(0.55 + 0.4 * t.factionLoyalty),
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: runtime.factionId,
      source: "faction_chair",
      metadata: {},
    });
  }

  const isPartyLeader = hasPartyInstitutions
    ? Boolean(runtime.partyId && state.partyStates[runtime.partyId]?.leaderId === politicianId)
    : profile.roleTypes.includes("party_leader") && Boolean(runtime.partyId);
  if (isPartyLeader && runtime.partyId) {
    drafts.push({
      type: "advance_party",
      priority: clamp01(0.55 + 0.4 * t.partyLoyalty),
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: runtime.partyId,
      source: "party_leader",
      metadata: {},
    });
  }

  let topIssue: { id: string; salience: number } | null = null;
  for (const [id, salience] of Object.entries(profile.issueSalience)) {
    if (
      !topIssue ||
      salience > topIssue.salience ||
      (salience === topIssue.salience && id < topIssue.id)
    ) {
      topIssue = { id, salience };
    }
  }
  if (topIssue && topIssue.salience >= 0.7) {
    drafts.push({
      type: "issue_outcome",
      priority: clamp01(0.4 + 0.5 * topIssue.salience),
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: topIssue.id,
      targetEntityId: null,
      source: "issue_salience",
      metadata: {},
    });
  }

  let status = profile.presidentialStatus;
  if (hasPartyInstitutions) {
    status = null;
    for (const contest of Object.values(state.partyContests)) {
      if (contest.type !== "presidential_nomination") continue;
      const entry = contest.entries[politicianId];
      if (!entry || entry.status === "withdrawn" || entry.status === "eliminated") continue;
      if (entry.status === "winner") continue;
      status = entry.seedPresidentialStatus ?? "declared";
      break;
    }
  }
  if (
    status &&
    (PRESIDENTIAL_SEEK_STATUSES as readonly string[]).includes(status) &&
    t.ambition >= 0.4 &&
    t.retirementInclination < 0.75 &&
    !facts.officeKinds.includes("president") &&
    !retired
  ) {
    const boost: Record<string, number> = {
      frontrunner: 0.92,
      likely: 0.78,
      possible: 0.62,
      exploring: 0.5,
    };
    drafts.push({
      type: "seek_office",
      priority: clamp01((boost[status] ?? 0.5) * (0.55 + 0.45 * t.ambition)),
      horizon: "near",
      targetOfficeId: null,
      targetOfficeKind: "president",
      targetIssueId: null,
      targetEntityId: null,
      source: "presidential_status",
      metadata: { presidentialStatus: status },
    });
  }

  if (t.ego >= 0.55) {
    drafts.push({
      type: "reputation",
      priority: clamp01(t.ego * 0.65),
      horizon: "medium",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: null,
      source: "ego",
      metadata: {},
    });
  }

  if (age >= 62 || t.retirementInclination >= 0.6) {
    drafts.push({
      type: "legacy",
      priority: clamp01(0.3 + 0.5 * t.retirementInclination + (age >= 65 ? 0.15 : 0)),
      horizon: "lifetime",
      targetOfficeId: null,
      targetOfficeKind: null,
      targetIssueId: null,
      targetEntityId: null,
      source: "career_stage",
      metadata: { age },
    });
    if (t.retirementInclination >= 0.7) {
      drafts.push({
        type: "retirement",
        priority: clamp01(t.retirementInclination * 0.8),
        horizon: "near",
        targetOfficeId: null,
        targetOfficeKind: null,
        targetIssueId: null,
        targetEntityId: null,
        source: "retirement_inclination",
        metadata: {},
      });
    }
  }

  return drafts.filter((d) => d.priority >= GOAL_MIN_DRAFT_PRIORITY).sort(compareDrafts);
}

function allocateGoal(
  state: SimState,
  ownerId: string,
  draft: GoalDraft,
  date: IsoDate,
): PoliticianGoal {
  const id = padId("GOAL", state.counters.nextGoalId++);
  const goal: PoliticianGoal = {
    id,
    ownerId,
    type: draft.type,
    priority: clamp01(draft.priority),
    status: "active",
    createdDate: date,
    lastReviewedDate: date,
    horizon: draft.horizon,
    targetOfficeId: draft.targetOfficeId,
    targetOfficeKind: draft.targetOfficeKind,
    targetIssueId: draft.targetIssueId,
    targetEntityId: draft.targetEntityId,
    source: draft.source,
    metadata: draft.metadata,
  };
  state.goals[id] = goal;
  return goal;
}

export function goalsOwnedBy(state: SimState, ownerId: string): PoliticianGoal[] {
  return Object.values(state.goals)
    .filter((g) => g.ownerId === ownerId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type GoalReviewResult = {
  politicianId: string;
  added: string[];
  satisfied: string[];
  abandoned: string[];
  superseded: string[];
};

export const DERIVED_GOAL_SOURCES = new Set([
  "officeholding",
  "ambition",
  "faction_chair",
  "party_leader",
  "issue_salience",
  "presidential_status",
  "ego",
  "career_stage",
  "retirement_inclination",
]);

export function isDerivedGoalSource(source: string): boolean {
  return DERIVED_GOAL_SOURCES.has(source);
}

function stillMatchesFacts(
  goal: PoliticianGoal,
  facts: NonNullable<ReturnType<typeof publicPoliticianFacts>>,
  alive: boolean,
  retired: boolean,
): "satisfied" | "abandoned" | null {
  if (!alive) return "abandoned";
  if (goal.type === "retain_office") {
    if (goal.targetOfficeId && !facts.officeIds.includes(goal.targetOfficeId)) return "abandoned";
    if (!goal.targetOfficeId && facts.officeIds.length === 0) return "abandoned";
  }
  if (goal.type === "seek_office" && goal.targetOfficeKind) {
    if (facts.officeKinds.includes(goal.targetOfficeKind)) return "satisfied";
  }
  if (goal.type === "retirement" && retired) return "satisfied";
  if (
    goal.type === "advance_faction" &&
    goal.targetEntityId &&
    facts.factionId !== goal.targetEntityId
  ) {
    return "abandoned";
  }
  if (
    goal.type === "advance_party" &&
    goal.targetEntityId &&
    facts.partyId !== goal.targetEntityId
  ) {
    return "abandoned";
  }
  return null;
}

export function reviewGoals(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  asOfDate: IsoDate,
): GoalReviewResult | { error: CommandError } {
  if (!state.politicians[politicianId]) {
    return { error: reject("UNKNOWN_POLITICIAN", politicianId) };
  }
  if (asOfDate !== state.currentDate) {
    return { error: reject("INVALID_GOAL", "asOfDate must equal currentDate") };
  }
  const profile = requireAgentProfile(world, state, politicianId);
  const facts = publicPoliticianFacts(world, state, politicianId);
  if (!facts) return { error: reject("UNKNOWN_POLITICIAN", politicianId) };
  const runtime = state.politicians[politicianId]!;
  const result: GoalReviewResult = {
    politicianId,
    added: [],
    satisfied: [],
    abandoned: [],
    superseded: [],
  };
  const drafts = generateGoalDrafts(world, state, politicianId, asOfDate);
  const draftByKey = new Map(drafts.map((d) => [goalIdentity(d), d]));
  const owned = goalsOwnedBy(state, politicianId);

  for (const goal of owned) {
    if (goal.status !== "active") continue;
    const closed = stillMatchesFacts(goal, facts, runtime.alive, runtime.retired);
    if (closed) {
      goal.status = closed;
      goal.lastReviewedDate = asOfDate;
      result[closed].push(goal.id);
      continue;
    }
    if (isDerivedGoalSource(goal.source)) {
      const draft = draftByKey.get(goalIdentity(goal));
      if (draft) {
        goal.priority = draft.priority;
        goal.lastReviewedDate = asOfDate;
      } else {
        goal.status = "superseded";
        goal.lastReviewedDate = asOfDate;
        result.superseded.push(goal.id);
      }
    } else {
      goal.lastReviewedDate = asOfDate;
    }
  }

  const active = goalsOwnedBy(state, politicianId).filter((g) => g.status === "active");
  const domainActive = active.filter((g) => !isDerivedGoalSource(g.source));
  const derivedActive = active.filter((g) => isDerivedGoalSource(g.source));
  const derivedKeys = new Set(derivedActive.map(goalIdentity));
  type Candidate = { kind: "existing"; goal: PoliticianGoal } | { kind: "draft"; draft: GoalDraft };
  const candidates: Candidate[] = derivedActive.map((goal) => ({ kind: "existing", goal }));
  for (const draft of drafts) {
    if (!derivedKeys.has(goalIdentity(draft))) candidates.push({ kind: "draft", draft });
  }
  const candidatePriority = (c: Candidate): number =>
    c.kind === "existing" ? c.goal.priority : c.draft.priority;
  const candidateType = (c: Candidate): GoalType =>
    c.kind === "existing" ? c.goal.type : c.draft.type;
  const candidateIdentity = (c: Candidate): string =>
    c.kind === "existing" ? goalIdentity(c.goal) : goalIdentity(c.draft);
  const candidateId = (c: Candidate): string => (c.kind === "existing" ? c.goal.id : "");
  candidates.sort((a, b) => {
    if (candidatePriority(a) !== candidatePriority(b)) {
      return candidatePriority(b) - candidatePriority(a);
    }
    if (candidateType(a) !== candidateType(b)) {
      return candidateType(a) < candidateType(b) ? -1 : 1;
    }
    const ia = candidateIdentity(a);
    const ib = candidateIdentity(b);
    if (ia !== ib) return ia < ib ? -1 : 1;
    const ida = candidateId(a);
    const idb = candidateId(b);
    if (ida !== idb) return ida < idb ? -1 : 1;
    return 0;
  });
  const cap = MAX_ACTIVE_GOALS[profile.aiTier];
  const slots = Math.max(0, cap - domainActive.length);
  const keep = candidates.slice(0, slots);
  const drop = candidates.slice(slots);
  for (const c of drop) {
    if (c.kind === "existing") {
      c.goal.status = "superseded";
      c.goal.lastReviewedDate = asOfDate;
      result.superseded.push(c.goal.id);
    }
  }
  for (const c of keep) {
    if (c.kind === "draft") {
      const goal = allocateGoal(state, politicianId, c.draft, asOfDate);
      result.added.push(goal.id);
    }
  }
  return result;
}

export function seedInitialGoals(state: SimState, world: KernelWorld): void {
  const ids = Object.keys(state.politicians).sort();
  for (const id of ids) {
    reviewGoals(state, world, id, state.currentDate);
  }
}

export function needsInitialGoals(state: SimState): boolean {
  return Object.keys(state.goals).length === 0 && state.counters.nextGoalId === 1;
}

export function assertGoalShape(goal: PoliticianGoal): string | null {
  if (!isGoalType(goal.type)) return `goal ${goal.id} invalid type`;
  if (!isGoalStatus(goal.status)) return `goal ${goal.id} invalid status`;
  if (!isGoalHorizon(goal.horizon)) return `goal ${goal.id} invalid horizon`;
  if (goal.priority < 0 || goal.priority > 1) return `goal ${goal.id} priority out of range`;
  const jsonErr = jsonSafetyError(goal.metadata, `goal.${goal.id}.metadata`);
  if (jsonErr) return jsonErr;
  return null;
}
