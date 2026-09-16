import { parseIsoDate, presidentialAssumptionDate } from "../calendar.js";
import { enqueueScheduled } from "../scheduler.js";
import type { KernelWorld, SimState } from "../types.js";
import { addElectionCandidate, partiesWithoutNominee } from "./field.js";
import {
  CANONICAL_ASSEMBLY_ELECTION_ID,
  CANONICAL_PRESIDENTIAL_ELECTION_ID,
  emptyElectoralRuntime,
  type ElectionState,
} from "./types.js";

export function emptyElectoralRuntimeState(): ReturnType<typeof emptyElectoralRuntime> {
  return emptyElectoralRuntime();
}

export function plannedElection(
  partial: Pick<
    ElectionState,
    "id" | "type" | "date" | "geographyKind" | "constituencyId" | "seats"
  >,
): ElectionState {
  return {
    ...partial,
    status: "planned",
    fieldFinalized: false,
    candidates: {},
    partiesWithoutNominee: [],
    turnout: null,
    countInput: null,
    countArchive: null,
    winnerIds: [],
    resultEventId: null,
    assembly: null,
    metadata: {},
  };
}

export function presidentialElectionIdForDate(date: string): string {
  return `ELEC_PRES_${parseIsoDate(date).year}`;
}

export function allocatePresidentialElectionId(state: SimState, date: string): string {
  const semantic = presidentialElectionIdForDate(date);
  if (!state.elections[semantic]) return semantic;
  let n = 2;
  while (state.elections[`${semantic}_${n}`]) n += 1;
  return `${semantic}_${n}`;
}

export function needsElectoralSeed(state: SimState, world: KernelWorld): boolean {
  return (
    Object.keys(world.constituencyElectorate).length > 0 &&
    Object.keys(state.elections).length === 0
  );
}

/** Mini playable worlds: seed presidential elections linked from the calendar scheduler. */
export function seedMiniPlayableScheduledElections(state: SimState, world: KernelWorld): void {
  if (Object.keys(world.constituencyElectorate).length > 0) return;
  const partyIds = Object.keys(world.partyDefinitions)
    .filter((id) => id !== world.independentAggregatePartyId)
    .sort();
  const leaderIds = partyIds
    .map((pid) => world.startingPartyLeaders[pid])
    .filter((id): id is string => typeof id === "string");
  const fallbackCandidates = world.politicians.map((p) => p.id).sort();
  const candidatePool = [...new Set([...leaderIds, ...fallbackCandidates])];

  for (const ev of state.scheduler.events) {
    if (ev.eventType !== "PRESIDENTIAL_ELECTION_DUE") continue;
    const id = typeof ev.payload.electionId === "string" ? ev.payload.electionId : null;
    if (!id || state.elections[id]) continue;
    const election = plannedElection({
      id,
      type: "presidential",
      date: ev.dueDate,
      geographyKind: "national",
      constituencyId: null,
      seats: 1,
    });
    election.metadata = { ...election.metadata, miniPlayableSynthetic: true };
    state.elections[id] = election;
    const nominees = candidatePool.slice(0, Math.max(2, Math.min(candidatePool.length, 4)));
    for (const politicianId of nominees) {
      const pol = state.politicians[politicianId];
      addElectionCandidate(
        state,
        world,
        id,
        {
          politicianId,
          partyId: pol?.partyId ?? partyIds[0] ?? null,
          sourceContestId: null,
          filedDate: world.scenarioStartDate,
          publicIdeology: null,
          withdrawn: false,
          independentQualified: false,
        },
        { syntheticFixture: true },
      );
    }
    const seeded = state.elections[id]!;
    seeded.partiesWithoutNominee = partiesWithoutNominee(world, seeded);
    seeded.fieldFinalized = true;
    seeded.status = "field_finalized";
  }
}

export function seedCanonicalElections(state: SimState, world: KernelWorld): void {
  if (Object.keys(world.constituencyElectorate).length === 0) return;
  if (!state.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID]) {
    state.elections[CANONICAL_PRESIDENTIAL_ELECTION_ID] = plannedElection({
      id: CANONICAL_PRESIDENTIAL_ELECTION_ID,
      type: "presidential",
      date: world.nextRegularPresidentialElectionDate,
      geographyKind: "national",
      constituencyId: null,
      seats: 1,
    });
  }
  if (!state.elections[CANONICAL_ASSEMBLY_ELECTION_ID]) {
    state.elections[CANONICAL_ASSEMBLY_ELECTION_ID] = plannedElection({
      id: CANONICAL_ASSEMBLY_ELECTION_ID,
      type: "assembly",
      date: world.nextRegularAssemblyElectionDate,
      geographyKind: "national",
      constituencyId: null,
      seats: 0,
    });
  }
  for (const ev of state.scheduler.events) {
    if (ev.eventType === "PRESIDENTIAL_ELECTION_DUE" && ev.payload.electionId == null) {
      ev.payload = { ...ev.payload, electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID };
    }
    if (ev.eventType === "ASSEMBLY_ELECTION_DUE" && ev.payload.electionId == null) {
      ev.payload = { ...ev.payload, electionId: CANONICAL_ASSEMBLY_ELECTION_ID };
    }
  }
}

export function scheduleAssumptionIfNeeded(
  state: SimState,
  world: KernelWorld,
  electionDate: string,
  electionId: string,
  commandId: string | null,
): void {
  const election = state.elections[electionId];
  const due =
    typeof election?.metadata.assumptionDate === "string"
      ? election.metadata.assumptionDate
      : presidentialAssumptionDate(electionDate, world.presidentialCalendar);
  const exists = state.scheduler.events.some(
    (e) =>
      e.eventType === "PRESIDENTIAL_ASSUMPTION_DUE" &&
      e.dueDate === due &&
      e.payload.electionId === electionId,
  );
  if (exists) return;
  enqueueScheduled(state, {
    dueDate: due,
    eventType: "PRESIDENTIAL_ASSUMPTION_DUE",
    payload: { electionId, electionDate },
    priority: 0,
    blocking: true,
    requiresResolution: true,
    source: commandId,
  });
}

export function ensurePlannedPresidentialElection(
  state: SimState,
  world: KernelWorld,
  date: string,
): ElectionState {
  const existing = Object.values(state.elections).find(
    (e) => e.type === "presidential" && e.date === date,
  );
  if (existing) return existing;
  const id = allocatePresidentialElectionId(state, date);
  const election = plannedElection({
    id,
    type: "presidential",
    date,
    geographyKind: "national",
    constituencyId: null,
    seats: 1,
  });
  state.elections[id] = election;
  return election;
}
