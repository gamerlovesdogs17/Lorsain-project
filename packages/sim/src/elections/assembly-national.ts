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
import { resolveAssemblyConstituency } from "./assembly.js";
import { createDomainResolution } from "./resolution.js";
import { plannedElection } from "./state.js";
import type { ElectionCandidate, ElectionState, TurnoutRecord } from "./types.js";
import { mergeTurnout } from "./turnout.js";
import { FIELD } from "../campaigns/policy.js";
import { ensureAssemblyElectionCycle } from "./assembly-cycle.js";
import { candidateStandingOrDefault } from "./standing.js";
import { seedCommitteesIfNeeded } from "../legislature/state.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectPostElectionSpeaker(
  state: SimState,
  world: KernelWorld,
  winnerIds: readonly string[],
  electionId: string,
): string | null {
  const seatTotals = state.elections[electionId]?.assembly?.partySeatTotals ?? {};
  const speakerOffice = world.offices.OFFICE_SPEAKER;
  if (!speakerOffice) return null;
  return winnerIds
    .filter((id) => id !== state.playerPoliticianId)
    .filter((id) =>
      activeTermsForPolitician(state, id).every((term) => {
        const other = world.offices[term.officeId];
        return (
          !other ||
          other.id === speakerOffice.id ||
          !officesAreIncompatible(speakerOffice, other)
        );
      }),
    )
    .sort((a, b) => {
      const score = (id: string) => {
        const politician = state.politicians[id];
        const standing = candidateStandingOrDefault(world, state, id);
        const partySeats = seatTotals[politician?.partyId ?? "independent"] ?? 0;
        const partyLeader =
          politician?.partyId && state.partyStates[politician.partyId]?.leaderId === id ? 1 : 0;
        return (
          (partySeats / Math.max(1, world.legislativeConstitution.assemblySeatCount)) * 1.8 +
          standing.nameRecognition * 0.35 +
          standing.favorability * 0.2 +
          partyLeader * 0.3
        );
      };
      return (
        score(b) - score(a) ||
        stableHash(`${electionId}:speaker:${a}`) - stableHash(`${electionId}:speaker:${b}`)
      );
    })[0] ?? null;
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

/** Read the persisted national filing allocation for one constituency. */
export function buildAssemblyConstituencyField(
  state: SimState,
  world: KernelWorld,
  constituencyId: string,
  _officeId: string,
  _claimedChallengers: ReadonlySet<string> = new Set(),
  _incumbentsByPolitician: ReadonlyMap<string, string> = new Map(),
):
  | {
      candidateIds: string[];
      partyByCandidate: Record<string, string | null>;
      ideologyById: Record<string, ElectionCandidate["publicIdeology"]>;
    }
  | { error: CommandError } {
  if (!world.constituencyElectorate[constituencyId]) {
    return { error: reject("INVALID_GEOGRAPHY", constituencyId) };
  }
  const election = Object.values(state.elections)
    .filter(
      (e) =>
        e.type === "assembly" &&
        e.geographyKind === "national" &&
        e.status !== "resolved" &&
        e.status !== "cancelled",
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (!election?.assembly) return { error: reject("FIELD_NOT_OPEN", constituencyId) };
  const persisted = election.assembly.constituencyFields[constituencyId];
  if (!persisted) return { error: reject("FIELD_NOT_OPEN", constituencyId) };
  const partyByCandidate: Record<string, string | null> = {};
  const ideologyById: Record<string, ElectionCandidate["publicIdeology"]> = {};
  const candidateIds = persisted.candidateIds.filter(
    (id) => election.candidates[id] && !election.candidates[id]!.withdrawn,
  );
  for (const id of candidateIds) {
    const candidate = election.candidates[id]!;
    partyByCandidate[id] = candidate.partyId;
    ideologyById[id] = candidate.publicIdeology;
  }
  return { candidateIds, partyByCandidate, ideologyById };
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
  if (!election.fieldFinalized || election.status !== "field_finalized") {
    return { error: reject("FIELD_NOT_FINALIZED", election.id) };
  }
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  if (cycle.filingStatus !== "closed") {
    return { error: reject("FIELD_NOT_FINALIZED", "Assembly filing remains open") };
  }

  const officeByConst = assemblyOfficeByConstituency(world);
  const constituencyIds = Object.keys(world.constituencyElectorate).sort();
  if (constituencyIds.length === 0) {
    return { error: reject("NO_ELECTORATE", "no constituency electorate") };
  }

  const constituencyWinners: Record<string, string[]> = {};
  const constituencyElectionIds: Record<string, string> = {};
  const allWinners: string[] = [];
  const allCandidates = new Set<string>();
  const turnoutParts: TurnoutRecord[] = [];
  let totalSeats = 0;

  for (const cid of constituencyIds) {
    const officeId = officeByConst.get(cid);
    if (!officeId) return { error: reject("MISSING_OFFICE", `no assembly office for ${cid}`) };
    const field = buildAssemblyConstituencyField(state, world, cid, officeId);
    if ("error" in field) return { error: field.error };
    for (const id of field.candidateIds) {
      if (allCandidates.has(id)) {
        return { error: reject("DUPLICATE_CANDIDATE", `${id} appears in multiple constituencies`) };
      }
      allCandidates.add(id);
    }
    const mobilizationByCandidate: Record<string, number> = {};
    for (const id of field.candidateIds) {
      const campaign = Object.values(state.campaignRuntime.campaigns).find(
        (c) =>
          c.type === "assembly" &&
          c.electionId === election.id &&
          c.constituencyId === cid &&
          c.politicianId === id &&
          c.status === "active",
      );
      const organization = campaign
        ? Math.min(
            1,
            (campaign.organizationByConstituency[cid] ?? 0) + campaign.fieldOrganization * 0.35,
          )
        : 0;
      mobilizationByCandidate[id] = 1 + FIELD.turnoutScale * organization;
    }
    const out = resolveAssemblyConstituency(world, state, rng, {
      constituencyId: cid,
      candidateIds: field.candidateIds,
      partyByCandidate: field.partyByCandidate,
      ideologyById: field.ideologyById,
      mobilizationByCandidate,
    });
    if ("error" in out) return { error: out.error };
    if (!out.election.turnout || !out.election.countArchive || out.election.countArchive.method !== "stv") {
      return { error: reject("COUNT_FAILED", `${cid} did not produce a complete STV archive`) };
    }
    constituencyElectionIds[cid] = out.election.id;
    constituencyWinners[cid] = [...out.election.winnerIds];
    allWinners.push(...out.election.winnerIds);
    totalSeats += out.election.winnerIds.length;
    turnoutParts.push(out.election.turnout);
    cycle.constituencyResults[cid] = {
      constituencyId: cid,
      constituencyElectionId: out.election.id,
      magnitude: out.election.seats,
      candidateIds: field.candidateIds.slice(),
      partyByCandidate: { ...field.partyByCandidate },
      firstPreferences: { ...out.election.countArchive.firstPreferences },
      electedIds: out.election.winnerIds.slice(),
      turnout: out.election.turnout,
      countArchive: out.election.countArchive,
      archiveCompleteness: "full",
    };
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
  election.turnout = mergeTurnout(turnoutParts);
  const partySeatTotals: Record<string, number> = {};
  for (const id of election.winnerIds) {
    const partyId = election.candidates[id]?.partyId ?? "independent";
    partySeatTotals[partyId] = (partySeatTotals[partyId] ?? 0) + 1;
  }
  cycle.partySeatTotals = partySeatTotals;
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
  const archivedWinners = election.assembly
    ? Object.fromEntries(
        Object.entries(election.assembly.constituencyResults).map(([cid, result]) => [
          cid,
          result.electedIds,
        ]),
      )
    : null;
  const winnersRaw =
    archivedWinners && Object.keys(archivedWinners).length > 0
      ? archivedWinners
      : election.metadata.constituencyWinners;
  if (!winnersRaw || typeof winnersRaw !== "object") {
    return { error: reject("MISSING_WINNERS", "no certified constituency winners") };
  }
  const constituencyWinners = winnersRaw as Record<string, string[]>;
  const officeByConst = assemblyOfficeByConstituency(world);
  const events: SimEvent[] = [];

  const assemblyTermYears =
    state.provincialRuntime.constitutionalRules.assembly_term_years?.value ??
    world.assemblyCalendar.intervalYears;
  const nextYear = parseIsoDate(election.date).year + assemblyTermYears;
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
      const presidentialTerm = activeTermsForPolitician(state, holderId).find(
        (term) => world.offices[term.officeId]?.kind === "president",
      );
      if (presidentialTerm) {
        events.push(
          pushHistory(state, {
            date: args.date,
            type: "ASSEMBLY_SEAT_DECLINED_INCOMPATIBLE_OFFICE",
            importance: 0.75,
            visibility: "public",
            actorIds: [holderId],
            entityIds: [electionId, cid, presidentialTerm.officeId],
            payload: {
              electionId,
              constituencyId: cid,
              protectedOfficeKind: "president",
            },
            sourceScheduledEventId: args.scheduledEventId,
            sourceCommandId: args.commandId,
          }),
        );
        continue;
      }
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
      const fallback = selectPostElectionSpeaker(state, world, [...winnerSet], electionId);
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

  // The new chamber exists immediately on assumption. Rebuild its committees
  // in the same transaction so restoring this date does not perform a hidden
  // reconciliation and change the save hash.
  seedCommitteesIfNeeded(world, state);

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
