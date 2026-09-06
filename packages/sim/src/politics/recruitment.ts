import { pushHistory } from "../scheduler.js";
import { getAgentProfile } from "../agents/profile.js";
import { partyLegalStatus } from "../parties/state.js";
import { partyMembers } from "../parties/queries.js";
import { competitivePartiesAllowed } from "../provinces/constitutionGameplay.js";
import { fileAssemblyCandidacy } from "../elections/assembly-cycle.js";
import { occupyingTerms, officesOfKind } from "../offices.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import { AS_MAX_RECRUITMENTS_PER_MONTH, type OpenSeatContest } from "./types.js";

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function detectOpenSeats(world: KernelWorld, state: SimState): OpenSeatContest[] {
  const runtime = ensurePoliticsRuntime(state);
  const found: OpenSeatContest[] = [];
  const recentExits = state.history
    .filter(
      (e) =>
        (e.type === "POLITICIAN_RETIRED" || e.type === "POLITICIAN_DIED") &&
        e.date.slice(0, 7) === state.currentDate.slice(0, 7),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const exit of recentExits) {
    const politicianId = exit.actorIds[0];
    if (!politicianId) continue;
    const priorTerms = Object.values(state.officeTerms)
      .filter(
        (t) =>
          t.holderId === politicianId &&
          (t.endedDate === state.currentDate ||
            (t.status === "ended" && (t.endedDate ?? state.currentDate) >= state.currentDate)),
      )
      .sort((a, b) => a.officeId.localeCompare(b.officeId));
    for (const term of priorTerms) {
      const office = world.offices[term.officeId];
      if (!office) continue;
      if (office.kind !== "assembly_member" && office.kind !== "governor") continue;
      // Still treat as open for recruitment even if countback already filled the seat.
      const id = `OPEN_${term.officeId}_${politicianId}_${state.currentDate.slice(0, 7).replace("-", "")}`;
      if (runtime.openSeatContests[id] || found.some((s) => s.id === id)) continue;
      const partyId = state.politicians[politicianId]?.partyId ?? null;
      found.push({
        id,
        officeId: term.officeId,
        officeKind: office.kind,
        constituencyId: office.constituencyId ?? null,
        partyId,
        reason: exit.type === "POLITICIAN_DIED" ? "death" : "retirement",
        detectedDate: state.currentDate,
        status: "open",
        recruitedPoliticianId: null,
        electionId: null,
      });
    }
  }

  // Upcoming assembly elections: seats where party lacks a filed candidacy and incumbent is retiring soon.
  for (const election of Object.values(state.elections).sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      election.type !== "assembly" ||
      election.status === "resolved" ||
      election.status === "cancelled"
    ) {
      continue;
    }
    if (!election.assembly) continue;
    for (const office of officesOfKind(world, "assembly_member").sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const holders = occupyingTerms(state, office.id);
      const holder = holders[0]?.holderId;
      if (!holder) continue;
      const pol = state.politicians[holder];
      if (!pol?.partyId) continue;
      const retiringSoon =
        pol.retired ||
        (getAgentProfile(world, state, holder)?.traits.retirementInclination ?? 0) >= 0.75;
      if (!retiringSoon) continue;
      const filed = Object.values(election.assembly.candidacies).some(
        (c) =>
          c.status === "filed" &&
          c.constituencyId === office.constituencyId &&
          state.politicians[c.politicianId]?.partyId === pol.partyId,
      );
      if (filed) continue;
      const id = `OPEN_ELEC_${election.id}_${office.id}`;
      if (runtime.openSeatContests[id]) continue;
      found.push({
        id,
        officeId: office.id,
        officeKind: "assembly_member",
        constituencyId: office.constituencyId ?? null,
        partyId: pol.partyId,
        reason: "upcoming_election",
        detectedDate: state.currentDate,
        status: "open",
        recruitedPoliticianId: null,
        electionId: election.id,
      });
    }
  }

  return found;
}

function recruitScore(world: KernelWorld, state: SimState, politicianId: string): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return 0;
  return (
    profile.traits.ambition * 0.35 +
    profile.skills.campaigning * 0.3 +
    profile.skills.legislation * 0.2 +
    profile.traits.partyLoyalty * 0.15
  );
}

/**
 * Detect open seats from retiring/resigned incumbents and recruit plausible party candidates.
 * Respects partyLegalStatus / competitivePartiesAllowed.
 */
export function processOpenSeatRecruitmentMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const events: SimEvent[] = [];
  if (!competitivePartiesAllowed(state) && partyLegalStatus(state, null) === "prohibited") {
    // still allow sole-party recruitment below
  }

  for (const seat of detectOpenSeats(world, state)) {
    runtime.openSeatContests[seat.id] = seat;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "OPEN_SEAT_DETECTED",
        importance: 0.55,
        visibility: "public",
        actorIds: [],
        entityIds: [seat.officeId, ...(seat.partyId ? [seat.partyId] : [])],
        payload: {
          openSeatId: seat.id,
          officeId: seat.officeId,
          partyId: seat.partyId,
          reason: seat.reason,
          electionId: seat.electionId,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  const open = Object.values(runtime.openSeatContests)
    .filter((s) => s.status === "open")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const seat of open) {
    if (runtime.activityThisMonth.recruitments >= AS_MAX_RECRUITMENTS_PER_MONTH) break;
    if (!seat.partyId) continue;
    const legal = partyLegalStatus(state, seat.partyId);
    if (legal === "prohibited" || legal === "defunct") continue;
    if (
      !competitivePartiesAllowed(state) &&
      legal !== "sole_recognized" &&
      legal !== "restricted"
    ) {
      continue;
    }

    const pool = partyMembers(state, seat.partyId)
      .filter((id) => id !== state.playerPoliticianId)
      .filter((id) => {
        const p = state.politicians[id]!;
        if (!p.alive || p.retired) return false;
        const holding = occupyingTerms(state, seat.officeId).some((t) => t.holderId === id);
        if (holding) return false;
        const alreadyMp = officesOfKind(world, "assembly_member").some((o) =>
          occupyingTerms(state, o.id).some((t) => t.holderId === id),
        );
        return !alreadyMp || seat.reason === "upcoming_election";
      })
      .sort(
        (a, b) =>
          recruitScore(world, state, b) - recruitScore(world, state, a) || a.localeCompare(b),
      );

    if (pool.length === 0) continue;
    const pickIndex = Math.min(
      pool.length - 1,
      Math.floor(rng.float01("npc-decisions") * Math.min(3, pool.length)),
    );
    const recruitId = pool[pickIndex]!;
    // Prefer top-scoring with light noise via hash when RNG is flat.
    const preferred =
      pool.find(
        (id) =>
          recruitScore(world, state, id) >= recruitScore(world, state, recruitId) - 0.05 &&
          stableHash(`${seat.id}:${id}:recruit`) % 100 < 70,
      ) ?? recruitId;

    seat.status = "recruited";
    seat.recruitedPoliticianId = preferred;
    runtime.activityThisMonth.recruitments += 1;

    if (seat.electionId && seat.constituencyId && seat.reason === "upcoming_election") {
      const filed = fileAssemblyCandidacy(
        state,
        world,
        {
          electionId: seat.electionId,
          constituencyId: seat.constituencyId,
          politicianId: preferred,
        },
        commandId,
      );
      if (!("error" in filed)) events.push(...filed.events);
    }

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "PARTY_RECRUITED_CANDIDATE",
        importance: 0.6,
        visibility: "public",
        actorIds: [preferred],
        entityIds: [seat.partyId, seat.officeId, seat.id],
        payload: {
          openSeatId: seat.id,
          politicianId: preferred,
          partyId: seat.partyId,
          officeId: seat.officeId,
          electionId: seat.electionId,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
