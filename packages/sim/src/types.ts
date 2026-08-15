import type { IsoDate, RegularElectionCalendar } from "./calendar.js";
import type { JsonObject } from "./json.js";
import type { SerializedRngState, StreamName } from "./rng.js";

export const SAVE_SCHEMA_VERSION = 1 as const;

export type PoliticianRuntime = {
  id: string;
  alive: boolean;
  retired: boolean;
  partyId: string | null;
  factionId: string | null;
};

export type OfficeTermStatus = "active" | "ended" | "suspended";
export type HoldingKind = "substantive" | "acting";
export type ExpirationPolicy = "auto_vacate" | "requires_domain_resolution" | "none";

export type OfficeTerm = {
  id: string;
  officeId: string;
  holderId: string;
  startDate: IsoDate | null;
  startKnown: boolean;
  endDate: IsoDate | null;
  accessionReason: string;
  status: OfficeTermStatus;
  holdingKind: HoldingKind;
  sourceElectionId: string | null;
  endedDate: IsoDate | null;
  endedReason: string | null;
};

export type ScheduledEventStatus = "pending" | "processed" | "cancelled";

export type ScheduledEvent = {
  id: string;
  dueDate: IsoDate;
  eventType: string;
  payload: JsonObject;
  priority: number;
  sequence: number;
  blocking: boolean;
  requiresResolution: boolean;
  source: string | null;
  status: ScheduledEventStatus;
};

export type InterruptKind = "PRESENTATION" | "BLOCKING_DOMAIN";
export type InterruptResolutionStatus = "unresolved" | "acknowledged" | "resolved";

export type PendingInterrupt = {
  kind: InterruptKind;
  code: string;
  date: IsoDate;
  scheduledEventId: string;
  message: string;
  requiresResolution: boolean;
  resolutionStatus: InterruptResolutionStatus;
};

/** @deprecated Use PendingInterrupt. Kept as an alias for existing imports. */
export type DomainInterrupt = PendingInterrupt;

export type SimEvent = {
  id: string;
  date: IsoDate;
  turn: number;
  type: string;
  importance: number;
  visibility: "public" | "system";
  actorIds: string[];
  entityIds: string[];
  payload: JsonObject;
  sourceScheduledEventId: string | null;
  sourceCommandId: string | null;
};

export type Counters = {
  nextEventId: number;
  nextScheduledId: number;
  nextTermId: number;
  schedulerSequence: number;
  nextCommandId: number;
};

export type PresidentialRuntime = {
  nextRegularElectionDate: IsoDate;
  electedTermCountByPolitician: Record<string, number>;
  certifiedPresidentElectId: string | null;
};

export type SimState = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  contentVersion: string;
  scenarioId: string;
  scenarioStartDate: IsoDate;
  currentDate: IsoDate;
  completedTurns: number;
  activeTurnTarget: IsoDate | null;
  rng: SerializedRngState;
  playerPoliticianId: string;
  politicians: Record<string, PoliticianRuntime>;
  officeTerms: Record<string, OfficeTerm>;
  scheduler: { events: ScheduledEvent[] };
  pendingInterrupt: PendingInterrupt | null;
  history: SimEvent[];
  counters: Counters;
  presidential: PresidentialRuntime;
};

export type Command =
  | { type: "ADVANCE_TURN" }
  | { type: "RESUME_TURN" }
  | { type: "ACKNOWLEDGE_INTERRUPT" }
  | {
      type: "INJECT_PRESIDENTIAL_VACANCY";
      reason: string;
      presidentElectId?: string;
    }
  | { type: "DEV_DRAW_RNG"; stream: StreamName }
  | {
      type: "DEV_SCHEDULE_EVENT";
      dueDate: IsoDate;
      eventType: string;
      payload?: JsonObject;
      priority?: number;
      blocking?: boolean;
      requiresResolution?: boolean;
    }
  | { type: "DEV_SET_ALIVE"; politicianId: string; alive: boolean }
  | { type: "DEV_VACATE_OFFICE"; officeId: string; reason: string }
  | { type: "DEV_CERTIFY_PRESIDENT_ELECT"; politicianId: string }
  | {
      type: "DEV_ASSUME_OFFICE";
      officeId: string;
      holderId: string;
      holdingKind?: "substantive" | "acting";
      accessionReason?: string;
    }
  | { type: "DEV_RESUME_TERM"; termId: string };

export type CommandError = { code: string; message: string };

export type CommandResult =
  | {
      ok: true;
      commandId: string;
      events: SimEvent[];
      interrupt: PendingInterrupt | null;
    }
  | { ok: false; error: CommandError };

/**
 * Save envelope. Authoritative RNG lives only in `simulation.rng`.
 * Root-level `rng` is not part of schema v1.
 */
export type SaveFile = {
  schemaVersion: number;
  contentVersion: string;
  scenarioId: string;
  simulation: SimState;
};

export type SaveParseResult = { ok: true; save: SaveFile } | { ok: false; error: CommandError };

export type KernelOffice = {
  id: string;
  kind: string;
  title: string;
  jurisdictionId: string;
  capacity: number;
  constituencyId: string | null;
  provinceId: string | null;
  cityId: string | null;
  seatIndex: number | null;
  portfolio: string | null;
  incompatibleWithKinds: string[];
  mayCoexistWithKinds: string[];
  requiresHolderKinds: string[];
  suspendWhenActingPresident: boolean;
  noPartyMembershipWhileServing: boolean;
  actingAllowed: boolean;
  expirationPolicy: ExpirationPolicy;
};

export type InitialScheduledSpec = {
  dueDate: IsoDate;
  eventType: string;
  payload: JsonObject;
  priority: number;
  blocking: boolean;
  requiresResolution: boolean;
  source: string | null;
};

export type KernelWorld = {
  contentVersion: string;
  scenarioId: string;
  scenarioStartDate: IsoDate;
  canonicalSeed: string;
  offices: Record<string, KernelOffice>;
  successionOfficeIds: string[];
  specialElectionMoreThanDays: number;
  specialElectionWithinDays: number;
  presidentElectActingWithinDays: number;
  presidentialCalendar: RegularElectionCalendar;
  assemblyCalendar: RegularElectionCalendar;
  nextRegularPresidentialElectionDate: IsoDate;
  nextRegularAssemblyElectionDate: IsoDate;
  politicians: PoliticianRuntime[];
  startingTerms: Array<Omit<OfficeTerm, "id">>;
  initialScheduled: InitialScheduledSpec[];
  electedTermCounts: Record<string, number>;
};

export type CreateSimulationOptions = {
  world: KernelWorld;
  playerPoliticianId: string;
  seed?: string;
};
