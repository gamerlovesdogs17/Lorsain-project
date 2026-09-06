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
  // Explicit no-plurality when seat tie for first.
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

/**
 * When cabinetFormation is assembly_confidence OR no plurality party,
 * store a coalition agreement; breakdown on meaningful trigger.
 */
export function processCoalitionMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  const active = Object.values(runtime.coalitionAgreements).find((c) => c.status === "active");
  const need = needsCoalition(world, state);

  if (active && !need.needed) {
    // Breakdown when plurality restored under presidential_choice / party_slate.
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

  if (active) {
    // Breakdown on cabinet no-confidence history this month.
    const noconf = state.history.some(
      (e) =>
        e.date === state.currentDate &&
        (e.type === "MOTION_PASSED" || e.type === "CABINET_NO_CONFIDENCE") &&
        String(e.payload.kind ?? "").includes("confidence"),
    );
    if (noconf) {
      active.status = "broken";
      active.brokenDate = state.currentDate;
      active.breakdownReason = "no_confidence";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "COALITION_BROKEN",
          importance: 0.8,
          visibility: "public",
          actorIds: [],
          entityIds: active.partyIds,
          payload: { coalitionId: active.id, reason: "no_confidence" },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
    return events;
  }

  if (!need.needed || !need.trigger) return events;

  const counts = partySeatCounts(world, state);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length < 2) return events;

  const partners: string[] = [ranked[0]![0]];
  let seats = ranked[0]![1];
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  for (const [partyId, n] of ranked.slice(1)) {
    if (seats / Math.max(1, total) >= 0.5 && partners.length >= 2) break;
    partners.push(partyId);
    seats += n;
    if (partners.length >= 3) break;
  }

  const shares: Record<string, number> = {};
  const shareTotal = partners.reduce((sum, id) => sum + (counts[id] ?? 0), 0) || 1;
  for (const id of partners) shares[id] = (counts[id] ?? 0) / shareTotal;

  const id = padId("COAL", state.counters.nextOrgActionId++);
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
    metadata: {},
  };
  runtime.coalitionAgreements[id] = agreement;

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
