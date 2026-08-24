import { parseIsoDate, presidentialAssumptionDate } from "../calendar.js";
import { enqueueScheduled } from "../scheduler.js";
import type { KernelWorld, SimState } from "../types.js";
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
