import { addMonths } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { recordPoliticalMemory } from "../agents/memories.js";
import { reviewGoals } from "../agents/goals.js";
import { applyPoliticianExit } from "../political-lifecycle.js";
import { declareCandidacy } from "../parties/contests.js";
import { activeTermsForPolitician, officesOfKind, occupyingTerms } from "../offices.js";
import { pushHistory } from "../scheduler.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import {
  AS_CAREER_COOLDOWN_MONTHS,
  AS_MAX_CAREER_ACTIONS_PER_MONTH,
  type CareerAmbitionKind,
  type CareerAmbitionRecord,
} from "./types.js";

function officeRank(kind: string): number {
  const order = [
    "president",
    "speaker",
    "governor",
    "minister",
    "mayor",
    "constitutional_court_justice",
    "assembly_member",
  ];
  const idx = order.indexOf(kind);
  return idx < 0 ? 99 : idx;
}

function primaryKind(world: KernelWorld, state: SimState, politicianId: string): string | null {
  const terms = activeTermsForPolitician(state, politicianId);
  let best: string | null = null;
  let bestRank = 999;
  for (const term of terms) {
    const kind = world.offices[term.officeId]?.kind;
    if (!kind) continue;
    const rank = officeRank(kind);
    if (rank < bestRank) {
      bestRank = rank;
      best = kind;
    }
  }
  return best;
}

function openLeadershipContests(state: SimState, partyId: string): string[] {
  return Object.values(state.partyContests)
    .filter(
      (c) =>
        c.type === "party_leadership" &&
        c.partyId === partyId &&
        (c.status === "open" || c.status === "planned" || c.status === "qualification"),
    )
    .map((c) => c.id)
    .sort();
}

function upcomingPresidentialElection(state: SimState): string | null {
  return (
    Object.values(state.elections)
      .filter(
        (e) =>
          e.type === "presidential" &&
          e.status !== "resolved" &&
          e.status !== "cancelled" &&
          e.date >= state.currentDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}

function vacantMinisterOffices(world: KernelWorld, state: SimState): string[] {
  return officesOfKind(world, "minister")
    .filter((o) => occupyingTerms(state, o.id).length === 0)
    .map((o) => o.id)
    .sort();
}

function decideKind(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  rng: RngService,
): {
  kind: CareerAmbitionKind;
  targetOfficeId: string | null;
  targetContestId: string | null;
  notes: string;
} {
  const profile = getAgentProfile(world, state, politicianId);
  const runtime = state.politicians[politicianId];
  if (!profile || !runtime || !runtime.alive || runtime.retired) {
    return { kind: "hold_course", targetOfficeId: null, targetContestId: null, notes: "inactive" };
  }
  const ambition = profile.traits.ambition;
  const retirement = profile.traits.retirementInclination;
  const held = primaryKind(world, state, politicianId);
  const age =
    profile.birthDate != null
      ? Number(state.currentDate.slice(0, 4)) - Number(profile.birthDate.slice(0, 4))
      : 50;

  const goals = Object.values(state.goals).filter(
    (g) => g.ownerId === politicianId && g.status === "active",
  );
  const wantsAdvance = goals.some(
    (g) =>
      g.type === "career_advancement" ||
      g.type === "seek_office" ||
      g.type === "increase_influence",
  );
  const wantsRetire = goals.some((g) => g.type === "retirement") || retirement >= 0.82;

  if (
    wantsRetire ||
    (age >= 72 && retirement >= 0.55 && rng.float01("npc-decisions") < retirement * 0.35)
  ) {
    const retireThreshold = retirement >= 0.95 ? 1 : 0.55 + retirement * 0.3;
    if (held && (retirement >= 0.95 || rng.float01("npc-decisions") < retireThreshold)) {
      return {
        kind: "retire",
        targetOfficeId: null,
        targetContestId: null,
        notes: "retirement_inclination",
      };
    }
  }

  if (runtime.partyId) {
    const contests = openLeadershipContests(state, runtime.partyId);
    const isLeader = state.partyStates[runtime.partyId]?.leaderId === politicianId;
    if (
      !isLeader &&
      contests.length > 0 &&
      ambition >= 0.55 &&
      (wantsAdvance || ambition >= 0.7) &&
      rng.float01("npc-decisions") < ambition * 0.55
    ) {
      return {
        kind: "contest_leadership",
        targetOfficeId: null,
        targetContestId: contests[0]!,
        notes: "open_leadership_contest",
      };
    }
  }

  const vacant = vacantMinisterOffices(world, state);
  if (
    vacant.length > 0 &&
    ambition >= 0.4 &&
    held !== "president" &&
    held !== "minister" &&
    rng.float01("npc-decisions") < ambition * 0.4 + 0.1
  ) {
    return {
      kind: "accept_cabinet",
      targetOfficeId: vacant[0]!,
      targetContestId: null,
      notes: "cabinet_vacancy",
    };
  }

  const openSeats = Object.values(ensurePoliticsRuntime(state).openSeatContests).filter(
    (s) => s.status === "open" && (s.partyId == null || s.partyId === runtime.partyId),
  );
  const presElection = upcomingPresidentialElection(state);
  const seekChance =
    ambition * 0.45 +
    (wantsAdvance ? 0.2 : 0) +
    (openSeats.length > 0 ? 0.25 : 0) +
    (presElection && ambition >= 0.65 ? 0.15 : 0) -
    retirement * 0.25;
  if (seekChance >= 0.35 && rng.float01("npc-decisions") < Math.min(0.85, seekChance)) {
    const seat = openSeats.sort((a, b) => a.id.localeCompare(b.id))[0];
    return {
      kind: "seek_higher_office",
      targetOfficeId: seat?.officeId ?? null,
      targetContestId: null,
      notes: seat ? "open_seat_opportunity" : presElection ? "presidential_cycle" : "ambition",
    };
  }

  return { kind: "hold_course", targetOfficeId: null, targetContestId: null, notes: "steady" };
}

function recordAmbition(state: SimState, record: CareerAmbitionRecord): void {
  const runtime = ensurePoliticsRuntime(state);
  runtime.careerAmbitions[record.politicianId] = record;
}

/**
 * Monthly career decisions for a bounded set of NPC politicians.
 * Uses goals + ambition traits + opportunity (open offices, contests, elections).
 */
export function processCareerDecisionsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  const candidates = Object.values(state.politicians)
    .filter(
      (p) =>
        p.alive &&
        !p.retired &&
        p.id !== state.playerPoliticianId &&
        ((getAgentProfile(world, state, p.id)?.traits.ambition ?? 0) >= 0.35 ||
          (getAgentProfile(world, state, p.id)?.traits.retirementInclination ?? 0) >= 0.8),
    )
    .sort((a, b) => {
      const pa = getAgentProfile(world, state, a.id);
      const pb = getAgentProfile(world, state, b.id);
      const retireBoostA = (pa?.traits.retirementInclination ?? 0) >= 0.9 ? 2 : 0;
      const retireBoostB = (pb?.traits.retirementInclination ?? 0) >= 0.9 ? 2 : 0;
      const aa = (pa?.traits.ambition ?? 0) + retireBoostA;
      const bb = (pb?.traits.ambition ?? 0) + retireBoostB;
      return bb - aa || a.id.localeCompare(b.id);
    });

  for (const pol of candidates) {
    if (runtime.activityThisMonth.careerActions >= AS_MAX_CAREER_ACTIONS_PER_MONTH) break;
    const existing = runtime.careerAmbitions[pol.id];
    if (existing?.cooldownUntil && existing.cooldownUntil > state.currentDate) continue;

    const decision = decideKind(world, state, pol.id, rng);
    if (decision.kind === "hold_course") continue;

    const record: CareerAmbitionRecord = {
      politicianId: pol.id,
      kind: decision.kind,
      targetOfficeId: decision.targetOfficeId,
      targetContestId: decision.targetContestId,
      decidedDate: state.currentDate,
      cooldownUntil: addMonths(state.currentDate, AS_CAREER_COOLDOWN_MONTHS),
      notes: decision.notes,
    };
    recordAmbition(state, record);
    runtime.activityThisMonth.careerActions += 1;

    if (decision.kind === "retire") {
      events.push(...applyPoliticianExit(state, world, pol.id, "retirement", commandId));
      recordPoliticalMemory(
        state,
        world,
        {
          ownerId: pol.id,
          subjectIds: [pol.id],
          kind: "generic",
          valence: -0.1,
          salience: 0.7,
          durability: "durable",
          tags: ["career", "retirement"],
          metadata: { source: "phase12_career" },
        },
        state.currentDate,
      );
      continue;
    }

    if (decision.kind === "contest_leadership" && decision.targetContestId) {
      const declared = declareCandidacy(state, world, decision.targetContestId, pol.id, commandId);
      if (!("error" in declared)) {
        events.push(...declared.events);
        recordPoliticalMemory(
          state,
          world,
          {
            ownerId: pol.id,
            subjectIds: [pol.id],
            kind: "generic",
            valence: 0.35,
            salience: 0.65,
            durability: "normal",
            tags: ["career", "leadership_challenge"],
            metadata: { contestId: decision.targetContestId, source: "phase12_career" },
          },
          state.currentDate,
        );
      }
    }

    if (decision.kind === "seek_higher_office" || decision.kind === "accept_cabinet") {
      reviewGoals(state, world, pol.id, state.currentDate);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "POLITICIAN_CAREER_DECISION",
          importance: 0.45,
          visibility: "public",
          actorIds: [pol.id],
          entityIds: [
            pol.id,
            ...(decision.targetOfficeId ? [decision.targetOfficeId] : []),
            ...(decision.targetContestId ? [decision.targetContestId] : []),
          ],
          payload: {
            kind: decision.kind,
            notes: decision.notes,
            targetOfficeId: decision.targetOfficeId,
            targetContestId: decision.targetContestId,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
      recordPoliticalMemory(
        state,
        world,
        {
          ownerId: pol.id,
          subjectIds: [pol.id],
          kind: "generic",
          valence: 0.25,
          salience: 0.55,
          durability: "normal",
          tags: ["career", decision.kind],
          metadata: {
            source: "phase12_career",
            targetOfficeId: decision.targetOfficeId,
          },
        },
        state.currentDate,
      );
    }
  }

  return events;
}
