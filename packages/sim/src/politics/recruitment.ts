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
import {
  AS_MAX_RECRUITMENTS_PER_MONTH,
  type OpenSeatCategory,
  type OpenSeatContest,
} from "./types.js";

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function officeFilled(state: SimState, officeId: string): boolean {
  return occupyingTerms(state, officeId).length > 0;
}

function nextAssemblyElectionId(state: SimState): string | null {
  return (
    Object.values(state.elections)
      .filter(
        (e) =>
          e.type === "assembly" &&
          e.status !== "resolved" &&
          e.status !== "cancelled" &&
          e.date >= state.currentDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0]?.id ?? null
  );
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

  const countbackFilledThisMonth = new Set(
    state.history
      .filter(
        (e) =>
          e.type === "ASSEMBLY_CASUAL_VACANCY_FILLED" &&
          e.date === state.currentDate &&
          String(e.payload.method ?? "") === "countback",
      )
      .map((e) => e.entityIds[0])
      .filter((id): id is string => typeof id === "string"),
  );

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
      const id = `OPEN_${term.officeId}_${politicianId}_${state.currentDate.slice(0, 7).replace("-", "")}`;
      if (runtime.openSeatContests[id] || found.some((s) => s.id === id)) continue;
      const partyId = state.politicians[politicianId]?.partyId ?? null;
      const filledByCountback =
        office.kind === "assembly_member" &&
        (countbackFilledThisMonth.has(office.id) || officeFilled(state, office.id));
      const category: OpenSeatCategory = filledByCountback
        ? "countback"
        : office.kind === "governor"
          ? "by_election"
          : "midterm_exit";
      const nextElection = nextAssemblyElectionId(state);
      found.push({
        id,
        officeId: term.officeId,
        officeKind: office.kind,
        constituencyId: office.constituencyId ?? null,
        partyId,
        reason:
          category === "by_election"
            ? "by_election"
            : exit.type === "POLITICIAN_DIED"
              ? "death"
              : "retirement",
        category,
        detectedDate: state.currentDate,
        status: filledByCountback
          ? "skipped_countback"
          : officeFilled(state, term.officeId)
            ? "filled"
            : "open",
        recruitedPoliticianId: filledByCountback
          ? (occupyingTerms(state, term.officeId)[0]?.holderId ?? null)
          : null,
        electionId: (() => {
          const fromCountback = state.history.find(
            (e) => e.type === "ASSEMBLY_CASUAL_VACANCY_FILLED" && e.entityIds[0] === office.id,
          )?.entityIds[2];
          return typeof fromCountback === "string" ? fromCountback : nextElection;
        })(),
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
      if (!holder) {
        // Truly vacant seat ahead of election → future open seat / by-election style recruit.
        const id = `OPEN_VACANT_${election.id}_${office.id}`;
        if (runtime.openSeatContests[id] || found.some((s) => s.id === id)) continue;
        found.push({
          id,
          officeId: office.id,
          officeKind: "assembly_member",
          constituencyId: office.constituencyId ?? null,
          partyId: null,
          reason: "upcoming_election",
          category: "future_open_seat",
          detectedDate: state.currentDate,
          status: "open",
          recruitedPoliticianId: null,
          electionId: election.id,
        });
        continue;
      }
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
        category: "upcoming_election",
        detectedDate: state.currentDate,
        status: "open",
        recruitedPoliticianId: null,
        electionId: election.id,
      });
    }
  }

  return found;
}

function ideologyDistance(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  partyId: string,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  const partyPos = state.partyStates[partyId]?.publicPlatform?.positions;
  if (!profile || !partyPos) return 0.5;
  const axes = [
    Math.abs((profile.ideology.economic ?? 0) - (partyPos.economy ?? 0)),
    Math.abs((profile.ideology.social ?? 0) - (partyPos.social_policy ?? 0)),
    Math.abs((profile.ideology.green ?? 0) - (partyPos.environment ?? 0)),
  ];
  return axes.reduce((a, b) => a + b, 0) / axes.length;
}

function priorCandidacyBoost(state: SimState, politicianId: string): number {
  let n = 0;
  for (const election of Object.values(state.elections)) {
    if (election.assembly?.candidacies[politicianId]) n += 1;
    if (election.candidates[politicianId]) n += 1;
  }
  for (const election of Object.values(state.provincialRuntime.elections ?? {})) {
    if (election.candidates[politicianId]) n += 1;
  }
  return Math.min(0.25, n * 0.08);
}

function recruitScore(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  seat: OpenSeatContest,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return 0;
  const pol = state.politicians[politicianId];
  const province =
    seat.officeKind === "governor"
      ? (world.offices[seat.officeId]?.provinceId ?? null)
      : seat.constituencyId
        ? (world.constituencyProvinceShares[seat.constituencyId]
            ?.slice()
            .sort((a, b) => b.share - a.share || a.provinceId.localeCompare(b.provinceId))[0]
            ?.provinceId ?? null)
        : null;
  const home = pol?.homeProvinceId ?? world.politicianHomeProvince?.[politicianId] ?? null;
  const provinceTie = province && home && province === home ? 0.22 : 0;
  const ideologyFit = seat.partyId
    ? Math.max(0, 0.28 - ideologyDistance(world, state, politicianId, seat.partyId) * 0.28)
    : 0;
  const electoralFit =
    (profile.skills.campaigning * 0.18 + (profile.traits.ambition ?? 0) * 0.1) *
    (seat.category === "upcoming_election" || seat.category === "future_open_seat" ? 1.15 : 1);
  return (
    profile.traits.ambition * 0.22 +
    profile.skills.campaigning * 0.2 +
    profile.skills.legislation * 0.12 +
    profile.traits.partyLoyalty * 0.12 +
    provinceTie +
    ideologyFit +
    electoralFit +
    priorCandidacyBoost(state, politicianId)
  );
}

/**
 * Detect open seats from retiring/resigned incumbents and recruit plausible party candidates.
 * Countback-filled seats are classified and do not generate phantom recruitment news.
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
    if (seat.category === "countback" || seat.status === "skipped_countback") {
      // Record for bookkeeping but skip recruit news / phantom open-seat churn.
      continue;
    }
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
          category: seat.category,
          electionId: seat.electionId,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  // Mark occupied open seats as filled.
  for (const seat of Object.values(runtime.openSeatContests)) {
    if (
      seat.status === "open" &&
      officeFilled(state, seat.officeId) &&
      seat.category !== "upcoming_election"
    ) {
      seat.status = "filled";
      seat.recruitedPoliticianId =
        seat.recruitedPoliticianId ?? occupyingTerms(state, seat.officeId)[0]?.holderId ?? null;
    }
  }

  const open = Object.values(runtime.openSeatContests)
    .filter(
      (s) =>
        s.status === "open" &&
        s.category !== "countback" &&
        (s.category === "upcoming_election" ||
          s.category === "future_open_seat" ||
          s.category === "by_election" ||
          s.category === "midterm_exit"),
    )
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
        return (
          !alreadyMp ||
          seat.category === "upcoming_election" ||
          seat.category === "future_open_seat"
        );
      })
      .sort(
        (a, b) =>
          recruitScore(world, state, b, seat) - recruitScore(world, state, a, seat) ||
          a.localeCompare(b),
      );

    if (pool.length === 0) continue;
    const pickIndex = Math.min(
      pool.length - 1,
      Math.floor(rng.float01("npc-decisions") * Math.min(3, pool.length)),
    );
    const recruitId = pool[pickIndex]!;
    const preferred =
      pool.find(
        (id) =>
          recruitScore(world, state, id, seat) >=
            recruitScore(world, state, recruitId, seat) - 0.05 &&
          stableHash(`${seat.id}:${id}:recruit`) % 100 < 70,
      ) ?? recruitId;

    seat.status = "recruited";
    seat.recruitedPoliticianId = preferred;
    if (!seat.electionId) seat.electionId = nextAssemblyElectionId(state);
    runtime.activityThisMonth.recruitments += 1;

    if (
      seat.electionId &&
      seat.constituencyId &&
      (seat.category === "upcoming_election" ||
        seat.category === "future_open_seat" ||
        seat.category === "by_election")
    ) {
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
      if (!("error" in filed)) {
        events.push(...filed.events);
        seat.status = "filled";
      }
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
          category: seat.category,
          score: recruitScore(world, state, preferred, seat),
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  return events;
}
