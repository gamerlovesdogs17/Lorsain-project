import type { Command, CommandResult, KernelWorld, SaveFile, SimState } from "./types.js";

/**
 * Cloneable host↔worker message types. No functions, DOM values, or class instances.
 * The simulation engine does not import Worker APIs.
 */

export type HostToWorkerMessage =
  | {
      type: "INIT_NEW_GAME";
      requestId: string;
      world: KernelWorld;
      playerPoliticianId: string;
      seed?: string;
    }
  | { type: "LOAD_SAVE"; requestId: string; save: SaveFile; world: KernelWorld }
  | { type: "EXECUTE_COMMAND"; requestId: string; command: Command }
  | { type: "GET_SNAPSHOT"; requestId: string }
  | { type: "HASH_STATE"; requestId: string };

export type WorkerToHostMessage =
  | { type: "READY"; requestId: string; snapshot: SimState }
  | { type: "COMMAND_RESULT"; requestId: string; result: CommandResult }
  | { type: "SNAPSHOT"; requestId: string; snapshot: SimState }
  | { type: "STATE_HASH"; requestId: string; hash: string }
  | { type: "ERROR"; requestId: string; error: { code: string; message: string } };

export function assertCloneableProtocol(_message: HostToWorkerMessage | WorkerToHostMessage): void {
  // Types are JSON-serializable by construction. Runtime check in tests via JSON round-trip.
}
