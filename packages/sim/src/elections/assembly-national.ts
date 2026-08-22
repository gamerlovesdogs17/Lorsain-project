import {
  assemblyAssumptionDate,
  compareIsoDate,
  parseIsoDate,
  regularElectionDate,
  type IsoDate,
} from "../calendar.js";
import {
  activeTermsForPolitician,
  assumeOffice,
  endTerm,
  occupyingTerms,
  officesAreIncompatible,
  officesOfKind,
} from "../offices.js";
import { enqueueScheduled, pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { emptyIdeology } from "../agents/profile.js";
import { resolveAssemblyConstituency } from "./assembly.js";
import { createDomainResolution } from "./resolution.js";
import { plannedElection } from "./state.js";
import type { ElectionCandidate, ElectionState } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function publicIdeologyForIndependent(
  world: KernelWorld,
  politicianId: string,
): NonNullable<ElectionCandidate["publicIdeology"]> {
  const profile = world.agentProfiles[politicianId];
  if (profile?.ideology) {
    return { ...emptyIdeology(), ...profile.ideology };
  }
  return emptyIdeology();
}

export function assemblyElectionIdForDate(date: IsoDate): string {
  return `ELEC_ASM_${parseIsoDate(date).year}`;
}

export function ensurePlannedAssemblyElection(
  state: SimState,
  world: KernelWorld,
  date: IsoDate,
): ElectionState {
  const existing = Object.values(state.elections).find(
    (e) => e.type === "assembly" && e.geographyKind === "national" && e.date === date,
  );
  if (existing) return existing;
  const id = assemblyElectionIdForDate(date);
  let alloc = id;
  if (state.elections[alloc]) {
    let n = 2;
    while (state.elections[`${id}_${n}`]) n += 1;
    alloc = `${id}_${n}`;
  }
  const seats = Object.values(world.constituencyElectorate).reduce((a, c) => a + c.seats, 0);
  const election = plannedElection({
    id: alloc,
    type: "assembly",
    date,
    geographyKind: "national",
    constituencyId: null,
    seats,
  });
  state.elections[alloc] = election;
  return election;
}

function assemblyOfficeByConstituency(world: KernelWorld): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of officesOfKind(world, "assembly_member")) {
    if (o.constituencyId) map.set(o.constituencyId, o.id);
  }
  return map;
}

function sittingHolders(state: SimState, officeId: string): string[] {
  return occupyingTerms(state, officeId)
    .filter((t) => t.holdingKind === "substantive")
    .map((t) => t.holderId)
    .sort();
}

function incumbentReservations(
  state: SimState,
  world: KernelWorld,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of officesOfKind(world, "assembly_member")) {
    if (!o.constituencyId) continue;
    for (const id of sittingHolders(state, o.id)) {
      map.set(id, o.constituencyId);
    }
  }
  return map;
}

function eligibleChallenger(state: SimState, world: KernelWorld, id: string): boolean {
  const pol = state.politicians[id];
  if (!pol?.alive || pol.retired) return false;
  if (pol.partyId == null || pol.partyId === world.independentAggregatePartyId) return false;
  const party = world.partyDefinitions[pol.partyId];
  if (!party || party.organizationType !== "membership_party") return false;
  for (const t of activeTermsForPolitician(state, id)) {
    const kind = world.offices[t.officeId]?.kind;
    if (
      kind === "president" ||
      kind === "governor" ||
      kind === "constitutional_court_justice" ||
      kind === "assembly_member"
    ) {
      return false;
    }
  }
  return true;
}

/** Deterministic STV field: incumbents plus membership-party challengers. */
export function buildAssemblyConstituencyField(
  state: SimState,
  world: KernelWorld,
  constituencyId: string,
  officeId: string,
  claimedChallengers: ReadonlySet<string> = new Set(),
  incumbentsByPolitician: ReadonlyMap<string, string> = new Map(),
):
  | {
      candidateIds: string[];
      partyByCandidate: Record<string, string | null>;
      ideologyById: Record<string, ElectionCandidate["publicIdeology"]>;
    }
  | { error: CommandError } {
  const el = world.constituencyElectorate[constituencyId];
  if (!el) return { error: reject("INVALID_GEOGRAPHY", constituencyId) };
  const partyByCandidate: Record<string, string | null> = {};
  const ideologyById: Record<string, ElectionCandidate["publicIdeology"]> = {};
  const candidates = new Set<string>();

  for (const id of sittingHolders(state, officeId)) {
    const pol = state.politicians[id];
    if (!pol?.alive || pol.retired) continue;
    candidates.add(id);
    if (pol.partyId == null || pol.partyId === world.independentAggregatePartyId) {
      partyByCandidate[id] = null;
      ideologyById[id] = publicIdeologyForIndependent(world, id);
    } else {
      partyByCandidate[id] = pol.partyId;
    }
  }

  const partyIds = Object.keys(world.partyDefinitions)
    .filter((pid) => world.partyDefinitions[pid]?.organizationType === "membership_party")
    .sort();
  const perPartyTarget = Math.max(2, Math.ceil(el.seats * 0.6));
  for (const partyId of partyIds) {
    let added = [...candidates].filter((id) => partyByCandidate[id] === partyId).length;
    const pool = Object.keys(state.politicians)
      .filter((id) => state.politicians[id]?.partyId === partyId && eligibleChallenger(state, world, id))
      .filter(
        (id) =>
          !candidates.has(id) &&
          !claimedChallengers.has(id) &&
          !incumbentsByPolitician.has(id),
      )
      .sort();
    for (const id of pool) {
      if (added >= perPartyTarget) break;
      candidates.add(id);
      partyByCandidate[id] = partyId;
      added += 1;
    }
  }

  if (candidates.size < el.seats) {
    const filler = Object.keys(state.politicians)
      .filter(
        (id) =>
          eligibleChallenger(state, world, id) &&
          !candidates.has(id) &&
          !claimedChallengers.has(id) &&
          !incumbentsByPolitician.has(id),
      )
      .sort();
    for (const id of filler) {
      if (candidates.size >= el.seats) break;
      candidates.add(id);
      partyByCandidate[id] = state.politicians[id]!.partyId;
    }
  }

  if (candidates.size < el.seats) {
    return {
      error: reject(
        "INSUFFICIENT_CANDIDATES",
        `${constituencyId}: ${candidates.size} candidates for ${el.seats} seats`,
      ),
    };
  }

  return { candidateIds: [...candidates].sort(), partyByCandidate, ideologyById };
}

export function resolveAssemblyElection(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  args: { electionId: string; scheduledEventId: string; commandId: string },
): { events: SimEvent[]; election: ElectionState } | { error: CommandError } {
  const election = state.elections[args.electionId];
  if (!election || election.type !== "assembly" || election.geographyKind !== "national") {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  if (election.status === "resolved" || election.status === "cancelled") {
    return { error: reject("INVALID_ELECTION", "election is closed") };
  }
  if (compareIsoDate(state.currentDate, election.date) !== 0) {
    return { error: reject("WRONG_DATE", `currentDate ${state.currentDate} != ${election.date}`) };
  }

  const officeByConst = assemblyOfficeByConstituency(world);
  const constituencyIds = Object.keys(world.constituencyElectorate).sort();
  if (constituencyIds.length === 0) {
    return { error: reject("NO_ELECTORATE", "no constituency electorate") };
  }

  const constituencyWinners: Record<string, string[]> = {};
  const constituencyElectionIds: Record<string, string> = {};
  const allWinners: string[] = [];
  const claimedChallengers = new Set<string>();
  const incumbentsByPolitician = incumbentReservations(state, world);
  let totalSeats = 0;

  for (const cid of constituencyIds) {
    const officeId = officeByConst.get(cid);
    if (!officeId) return { error: reject("MISSING_OFFICE", `no assembly office for ${cid}`) };
    const field = buildAssemblyConstituencyField(
      state,
      world,
      cid,
      officeId,
      claimedChallengers,
      incumbentsByPolitician,
    );
    if ("error" in field) return { error: field.error };
    for (const id of field.candidateIds) {
      if (!incumbentsByPolitician.has(id)) claimedChallengers.add(id);
    }
    const out = resolveAssemblyConstituency(world, state, rng, {
      constituencyId: cid,
      candidateIds: field.candidateIds,
      partyByCandidate: field.partyByCandidate,
      ideologyById: field.ideologyById,
    });
    if ("error" in out) return { error: out.error };
    constituencyElectionIds[cid] = out.election.id;
    constituencyWinners[cid] = [...out.election.winnerIds];
    allWinners.push(...out.election.winnerIds);
    totalSeats += out.election.winnerIds.length;
    // Constituency counts are archived under the national election metadata; they are not
    // separate top-level ElectionState records (those require resultEventId wiring).
    election.metadata = {
      ...election.metadata,
      [`archive:${cid}`]: {
        electionId: out.election.id,
        turnout: out.election.turnout,
        winnerIds: out.election.winnerIds,
        candidateIds: field.candidateIds,
      },
    };
    for (const id of field.candidateIds) {
      if (!election.candidates[id]) {
        election.candidates[id] = {
          politicianId: id,
          partyId: field.partyByCandidate[id] ?? null,
          sourceContestId: null,
          filedDate: state.currentDate,
          publicIdeology: field.ideologyById[id] ?? null,
          withdrawn: false,
          independentQualified: (field.partyByCandidate[id] ?? null) == null,
        };
      }
    }
  }

  if (new Set(allWinners).size !== allWinners.length) {
    return { error: reject("DUPLICATE_WINNERS", "same politician won multiple seats") };
  }

  const authorized = world.legislativeConstitution.assemblySeatCount;
  if (totalSeats !== authorized) {
    return {
      error: reject("SEAT_COUNT", `elected ${totalSeats} != authorized ${authorized}`),
    };
  }

  election.fieldFinalized = true;
  election.status = "resolved";
  election.seats = totalSeats;
  election.winnerIds = [...allWinners].sort();
  election.metadata = {
    ...election.metadata,
    constituencyWinners,
    constituencyElectionIds,
    certifiedForAssumption: true,
  };

  const resultEvent = pushHistory(state, {
    date: state.currentDate,
    type: "ASSEMBLY_ELECTION_RESULT",
    importance: 1,
    visibility: "public",
    actorIds: election.winnerIds.slice(0, 12),
    entityIds: [election.id],
    payload: {
      electionId: election.id,
      seats: totalSeats,
      constituencies: constituencyIds.length,
    },
    sourceScheduledEventId: args.scheduledEventId,
    sourceCommandId: args.commandId,
  });
  election.resultEventId = resultEvent.id;

  const assumeDate = assemblyAssumptionDate(election.date, world.assemblyCalendar);
  const exists = state.scheduler.events.some(
    (e) =>
      e.eventType === "ASSEMBLY_ASSUMPTION_DUE" &&
      e.dueDate === assumeDate &&
      e.payload.electionId === election.id,
  );
  if (!exists) {
    enqueueScheduled(state, {
      dueDate: assumeDate,
      eventType: "ASSEMBLY_ASSUMPTION_DUE",
      payload: { electionId: election.id, electionDate: election.date },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: args.commandId,
    });
  }

  return { events: [resultEvent], election };
}

export function applyAssemblyAssumption(
  state: SimState,
  world: KernelWorld,
  args: { date: IsoDate; scheduledEventId: string; commandId: string },
): { events: SimEvent[] } | { error: CommandError } {
  const src = state.scheduler.events.find((e) => e.id === args.scheduledEventId);
  const electionId =
    typeof src?.payload.electionId === "string" ? src.payload.electionId : null;
  if (!electionId) {
    return { error: reject("MISSING_ELECTION_ID", "assumption event lacks electionId") };
  }
  const election = state.elections[electionId];
  if (!election || election.type !== "assembly" || election.status !== "resolved") {
    return { error: reject("INVALID_ELECTION", electionId) };
  }
  const winnersRaw = election.metadata.constituencyWinners;
  if (!winnersRaw || typeof winnersRaw !== "object") {
    return { error: reject("MISSING_WINNERS", "no certified constituency winners") };
  }
  const constituencyWinners = winnersRaw as Record<string, string[]>;
  const officeByConst = assemblyOfficeByConstituency(world);
  const events: SimEvent[] = [];

  const nextYear = parseIsoDate(election.date).year + world.assemblyCalendar.intervalYears;
  const nextElection = regularElectionDate(world.assemblyCalendar, nextYear);
  const nextAssume = assemblyAssumptionDate(nextElection, world.assemblyCalendar);

  for (const office of officesOfKind(world, "assembly_member")) {
    for (const term of occupyingTerms(state, office.id)) {
      const ended = endTerm(state, term.id, args.date, "assembly_assumption");
      if (ended) {
        events.push(
          pushHistory(state, {
            date: args.date,
            type: "OFFICE_TERM_ENDED",
            importance: 0.6,
            visibility: "public",
            actorIds: [term.holderId],
            entityIds: [office.id],
            payload: { reason: "assembly_assumption", electionId },
            sourceScheduledEventId: args.scheduledEventId,
            sourceCommandId: args.commandId,
          }),
        );
      }
    }
  }

  for (const [cid, winners] of Object.entries(constituencyWinners).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const officeId = officeByConst.get(cid);
    if (!officeId) return { error: reject("MISSING_OFFICE", cid) };
    for (const holderId of winners) {
      for (const t of activeTermsForPolitician(state, holderId)) {
        const other = world.offices[t.officeId];
        const assemblyOffice = world.offices[officeId];
        if (!other || !assemblyOffice) continue;
        if (other.id === officeId) continue;
        if (officesAreIncompatible(assemblyOffice, other)) {
          const ended = endTerm(state, t.id, args.date, "incompatible_with_assembly");
          if (ended) {
            events.push(
              pushHistory(state, {
                date: args.date,
                type: "OFFICE_TERM_ENDED",
                importance: 0.6,
                visibility: "public",
                actorIds: [holderId],
                entityIds: [t.officeId],
                payload: { reason: "incompatible_with_assembly", electionId },
                sourceScheduledEventId: args.scheduledEventId,
                sourceCommandId: args.commandId,
              }),
            );
          }
        }
      }
      const assumed = assumeOffice(state, world, {
        officeId,
        holderId,
        date: args.date,
        accessionReason: "election",
        holdingKind: "substantive",
        endDate: nextAssume,
        startKnown: true,
        sourceElectionId: electionId,
      });
      if ("error" in assumed) return { error: assumed.error };
    }
  }

  const speakerOffice = world.offices.OFFICE_SPEAKER;
  if (speakerOffice) {
    const speakerTerms = occupyingTerms(state, "OFFICE_SPEAKER");
    const winnerSet = new Set(Object.values(constituencyWinners).flat());
    for (const term of speakerTerms) {
      if (!winnerSet.has(term.holderId)) {
        const ended = endTerm(state, term.id, args.date, "left_assembly");
        if (ended) {
          events.push(
            pushHistory(state, {
              date: args.date,
              type: "OFFICE_TERM_ENDED",
              importance: 0.7,
              visibility: "public",
              actorIds: [term.holderId],
              entityIds: ["OFFICE_SPEAKER"],
              payload: { reason: "left_assembly", electionId },
              sourceScheduledEventId: args.scheduledEventId,
              sourceCommandId: args.commandId,
            }),
          );
        }
      }
    }
    if (occupyingTerms(state, "OFFICE_SPEAKER").length === 0) {
      const fallback = [...winnerSet].sort()[0];
      if (fallback) {
        const assumed = assumeOffice(state, world, {
          officeId: "OFFICE_SPEAKER",
          holderId: fallback,
          date: args.date,
          accessionReason: "assembly_selection",
          holdingKind: "substantive",
          endDate: null,
          startKnown: true,
          sourceElectionId: electionId,
        });
        if ("error" in assumed) return { error: assumed.error };
        events.push(
          pushHistory(state, {
            date: args.date,
            type: "SPEAKER_SELECTED",
            importance: 0.8,
            visibility: "public",
            actorIds: [fallback],
            entityIds: ["OFFICE_SPEAKER"],
            payload: { electionId, reason: "post_election_continuity" },
            sourceScheduledEventId: args.scheduledEventId,
            sourceCommandId: args.commandId,
          }),
        );
      }
    }
  }

  const nextState = ensurePlannedAssemblyElection(state, world, nextElection);
  const scheduled = state.scheduler.events.some(
    (e) =>
      e.eventType === "ASSEMBLY_ELECTION_DUE" &&
      e.dueDate === nextElection &&
      e.payload.electionId === nextState.id,
  );
  if (!scheduled) {
    enqueueScheduled(state, {
      dueDate: nextElection,
      eventType: "ASSEMBLY_ELECTION_DUE",
      payload: { electionId: nextState.id },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_ASSEMBLY_REGULAR",
    });
  }

  events.push(
    pushHistory(state, {
      date: args.date,
      type: "ASSEMBLY_ASSUMPTION",
      importance: 1,
      visibility: "public",
      actorIds: [],
      entityIds: [electionId],
      payload: {
        electionId,
        seats: election.winnerIds.length,
        nextElectionDate: nextElection,
      },
      sourceScheduledEventId: args.scheduledEventId,
      sourceCommandId: args.commandId,
    }),
  );

  createDomainResolution(state, {
    sourceScheduledEventId: args.scheduledEventId,
    domainType: "assembly_assumption",
    date: args.date,
    electionId,
    resultEventId: events[events.length - 1]!.id,
    archiveElectionId: electionId,
    metadata: {},
  });

  return { events };
}
