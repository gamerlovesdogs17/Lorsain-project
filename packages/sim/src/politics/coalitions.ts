import { padId, pushHistory } from "../scheduler.js";
import {
  assemblyPluralityPartyId,
  cabinetFormationMode,
} from "../provinces/constitutionGameplay.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { PARTY_PLATFORM_ISSUES, type PartyPlatformIssue } from "../parties/types.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import type { CoalitionAgreement } from "./types.js";

function partySeatCounts(world: KernelWorld, state: SimState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of currentAssemblyMemberIds(world, state)) {
    const partyId = state.politicians[id]?.partyId;
    if (!partyId) continue;
    if (state.partyStates[partyId]?.status === "defunct") continue;
    counts[partyId] = (counts[partyId] ?? 0) + 1;
  }
  return counts;
}

function needsCoalition(
  world: KernelWorld,
  state: SimState,
): {
  needed: boolean;
  trigger: CoalitionAgreement["trigger"] | null;
} {
  const mode = cabinetFormationMode(state);
  if (mode === "assembly_confidence") {
    return { needed: true, trigger: "assembly_confidence" };
  }
  const counts = partySeatCounts(world, state);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length < 2) return { needed: false, trigger: null };
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const top = ranked[0]![1];
  if (total > 0 && top / total < 0.5) {
    return { needed: true, trigger: "no_plurality" };
  }
  if (ranked.length >= 2 && ranked[0]![1] === ranked[1]![1]) {
    return { needed: true, trigger: "no_plurality" };
  }
  void assemblyPluralityPartyId;
  return { needed: false, trigger: null };
}

function pickPriorities(state: SimState, partyIds: string[]): PartyPlatformIssue[] {
  const scores = new Map<PartyPlatformIssue, number>();
  for (const issue of PARTY_PLATFORM_ISSUES) scores.set(issue, 0);
  for (const partyId of partyIds) {
    const positions = state.partyStates[partyId]?.publicPlatform?.positions;
    if (!positions) continue;
    for (const issue of PARTY_PLATFORM_ISSUES) {
      scores.set(issue, (scores.get(issue) ?? 0) + Math.abs(positions[issue] ?? 0));
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([issue]) => issue);
}

function ideologyCompatibility(state: SimState, a: string, b: string): number {
  const pa = state.partyStates[a]?.publicPlatform?.positions;
  const pb = state.partyStates[b]?.publicPlatform?.positions;
  if (!pa || !pb) return 0.4;
  let sum = 0;
  for (const issue of PARTY_PLATFORM_ISSUES) {
    sum += 1 - Math.min(1, Math.abs((pa[issue] ?? 0) - (pb[issue] ?? 0)));
  }
  return sum / PARTY_PLATFORM_ISSUES.length;
}

function historyCompatibility(state: SimState, partyIds: string[]): number {
  const runtime = ensurePoliticsRuntime(state);
  let score = 0.5;
  for (const past of Object.values(runtime.coalitionAgreements)) {
    const overlap = past.partyIds.filter((id) => partyIds.includes(id)).length;
    if (overlap >= 2) {
      score += past.status === "broken" ? -0.08 : 0.12;
    }
  }
  const family = runtime.partyFamilyHistory.filter(
    (link) =>
      partyIds.includes(link.partyId) ||
      (link.relatedPartyId != null && partyIds.includes(link.relatedPartyId)),
  );
  if (family.some((f) => f.event === "merged_into" || f.event === "absorbed")) score += 0.05;
  if (family.some((f) => f.event === "split_from")) score -= 0.04;
  return Math.max(0, Math.min(1, score));
}

function scoreCoalitionOption(
  state: SimState,
  partyIds: string[],
  counts: Record<string, number>,
): number {
  if (partyIds.length < 2) return 0;
  let ideo = 0;
  let pairs = 0;
  for (let i = 0; i < partyIds.length; i += 1) {
    for (let j = i + 1; j < partyIds.length; j += 1) {
      ideo += ideologyCompatibility(state, partyIds[i]!, partyIds[j]!);
      pairs += 1;
    }
  }
  const ideoMean = pairs > 0 ? ideo / pairs : 0;
  const seats = partyIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const majority = seats / total;
  const platform = pickPriorities(state, partyIds).length / 3;
  const hist = historyCompatibility(state, partyIds);
  return ideoMean * 0.4 + Math.min(1, majority) * 0.35 + platform * 0.1 + hist * 0.15;
}

function enumerateOptions(ranked: Array<[string, number]>): string[][] {
  const options: string[][] = [];
  const top = ranked[0]![0];
  for (let i = 1; i < ranked.length; i += 1) {
    options.push([top, ranked[i]![0]]);
  }
  if (ranked.length >= 3) {
    options.push([top, ranked[1]![0], ranked[2]![0]]);
  }
  if (ranked.length >= 4) {
    options.push([top, ranked[1]![0], ranked[3]![0]]);
  }
  return options
    .map((ids) => [...new Set(ids)].sort())
    .filter((ids, idx, arr) => arr.findIndex((o) => o.join("|") === ids.join("|")) === idx);
}

function applyCoalitionTerms(state: SimState, agreement: CoalitionAgreement): void {
  for (const partyId of agreement.partyIds) {
    const leadership = state.legislatureRuntime.caucusLeadership[partyId];
    if (!leadership) continue;
    leadership.platformDemand = agreement.policyPriorities[0] ?? leadership.platformDemand ?? null;
    leadership.coalitionPreference = agreement.partyIds.slice();
    // Prefer bills already aligned with coalition priorities when present.
    const priorityBoost = Object.values(state.legislatureRuntime.bills)
      .filter((b) =>
        [
          "introduced",
          "committee",
          "committee_passed",
          "floor_scheduled",
          "returned_by_president",
          "repassage_scheduled",
        ].includes(b.status),
      )
      .filter((b) => {
        const party = state.politicians[b.sponsorId]?.partyId;
        return party != null && agreement.partyIds.includes(party);
      })
      .map((b) => b.id)
      .sort();
    if (priorityBoost.length > 0) {
      const merged = [...new Set([...priorityBoost.slice(0, 2), ...leadership.priorityBillIds])];
      leadership.priorityBillIds = merged.slice(0, 3);
    }
  }
}

function leadershipChangedThisMonth(state: SimState, partyIds: string[]): boolean {
  return state.history.some(
    (e) =>
      e.date === state.currentDate &&
      (e.type === "PARTY_LEADER_CHANGED" ||
        e.type === "PARTY_LEADERSHIP_CONTEST_RESOLVED" ||
        e.type === "PARTY_CONTEST_RESOLVED") &&
      partyIds.some((id) => e.entityIds.includes(id)),
  );
}

function policyViolationThisMonth(state: SimState, agreement: CoalitionAgreement): boolean {
  const priority = new Set(agreement.policyPriorities);
  return state.history.some((e) => {
    if (e.date !== state.currentDate) return false;
    if (e.type !== "BILL_ENACTED" && e.type !== "LAW_ENACTED") return false;
    const issue = String(e.payload.platformIssue ?? e.payload.issueId ?? "");
    if (!issue) return false;
    // Partner party voting against a priority enactment is a soft violation signal.
    return priority.has(issue as PartyPlatformIssue);
  });
}

/**
 * When cabinetFormation is assembly_confidence OR no plurality party,
 * score multiple coalition options, negotiate, and store terms that feed
 * caucus agenda / cabinet appointment preferences.
 */
export function processCoalitionMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  const active = Object.values(runtime.coalitionAgreements).find(
    (c) => c.status === "active" || c.status === "negotiating",
  );
  const need = needsCoalition(world, state);

  if (active && active.status === "active") {
    if (!need.needed) {
      const mode = cabinetFormationMode(state);
      if (mode !== "assembly_confidence") {
        active.status = "broken";
        active.brokenDate = state.currentDate;
        active.breakdownReason = "plurality_restored";
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "COALITION_BROKEN",
            importance: 0.7,
            visibility: "public",
            actorIds: [],
            entityIds: active.partyIds,
            payload: { coalitionId: active.id, reason: active.breakdownReason },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      return events;
    }

    const noconf = state.history.some(
      (e) =>
        e.date === state.currentDate &&
        (e.type === "MOTION_PASSED" || e.type === "CABINET_NO_CONFIDENCE") &&
        String(e.payload.kind ?? "").includes("confidence"),
    );
    const leadershipBreak = leadershipChangedThisMonth(state, active.partyIds);
    const policyBreak = policyViolationThisMonth(state, active);
    if (noconf || leadershipBreak || policyBreak) {
      active.status = "broken";
      active.brokenDate = state.currentDate;
      active.breakdownReason = noconf
        ? "no_confidence"
        : leadershipBreak
          ? "leadership_change"
          : "policy_violation";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "COALITION_BROKEN",
          importance: 0.8,
          visibility: "public",
          actorIds: [],
          entityIds: active.partyIds,
          payload: { coalitionId: active.id, reason: active.breakdownReason },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else {
      applyCoalitionTerms(state, active);
    }
    return events;
  }

  if (!need.needed || !need.trigger) return events;

  const counts = partySeatCounts(world, state);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length < 2) return events;

  const scored = enumerateOptions(ranked)
    .map((partyIds) => ({ partyIds, score: scoreCoalitionOption(state, partyIds, counts) }))
    .sort((a, b) => b.score - a.score || a.partyIds.join("|").localeCompare(b.partyIds.join("|")));

  if (scored.length === 0) return events;
  const best = scored[0]!;

  // Negotiation: if best is weak, keep negotiating one month; else form.
  if (active?.status === "negotiating") {
    // Complete negotiation with best available option this month.
  } else if (best.score < 0.42) {
    const id = padId("COAL", state.counters.nextOrgActionId++);
    const negotiating: CoalitionAgreement = {
      id,
      formedDate: state.currentDate,
      status: "negotiating",
      brokenDate: null,
      partyIds: best.partyIds,
      policyPriorities: pickPriorities(state, best.partyIds),
      cabinetShares: {},
      trigger: need.trigger,
      breakdownReason: null,
      negotiationScore: best.score,
      alternativeOptions: scored.slice(0, 4),
      metadata: { phase: "talks" },
    };
    runtime.coalitionAgreements[id] = negotiating;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "COALITION_NEGOTIATING",
        importance: 0.55,
        visibility: "public",
        actorIds: [],
        entityIds: best.partyIds,
        payload: {
          coalitionId: id,
          partyIds: best.partyIds,
          score: best.score,
          alternatives: scored.slice(0, 3),
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    return events;
  }

  const partners = best.partyIds;
  const shares: Record<string, number> = {};
  const shareTotal = partners.reduce((sum, id) => sum + (counts[id] ?? 0), 0) || 1;
  for (const id of partners) shares[id] = (counts[id] ?? 0) / shareTotal;

  const existingNegotiating = active?.status === "negotiating" ? active : null;
  const id = existingNegotiating?.id ?? padId("COAL", state.counters.nextOrgActionId++);
  const agreement: CoalitionAgreement = {
    id,
    formedDate: state.currentDate,
    status: "active",
    brokenDate: null,
    partyIds: partners,
    policyPriorities: pickPriorities(state, partners),
    cabinetShares: shares,
    trigger: need.trigger,
    breakdownReason: null,
    negotiationScore: best.score,
    alternativeOptions: scored.slice(0, 4),
    metadata: { negotiatedFrom: existingNegotiating?.id ?? null },
  };
  runtime.coalitionAgreements[id] = agreement;
  applyCoalitionTerms(state, agreement);

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "COALITION_FORMED",
      importance: 0.85,
      visibility: "public",
      actorIds: [],
      entityIds: partners,
      payload: {
        coalitionId: id,
        partyIds: partners,
        trigger: need.trigger,
        policyPriorities: agreement.policyPriorities,
        cabinetShares: shares,
        negotiationScore: best.score,
        alternativeOptions: scored.slice(0, 3),
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}

export function activeCoalition(state: SimState): CoalitionAgreement | null {
  const runtime = ensurePoliticsRuntime(state);
  return Object.values(runtime.coalitionAgreements).find((c) => c.status === "active") ?? null;
}
