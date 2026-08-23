import {
  restoreSimulation,
  type CommandResult,
  type KernelWorld,
  type SaveFile,
} from "@lorsain/sim";

type Request = { save: SaveFile; world: KernelWorld };
type Response =
  | { ok: true; save: SaveFile; result: CommandResult }
  | { ok: false; message: string };

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const simulation = restoreSimulation(event.data.save, event.data.world);
    const result = simulation.executeCommand({ type: "RESOLVE_ASSEMBLY_ELECTION" });
    if (result.ok) {
      const resumed = simulation.executeCommand({ type: "RESUME_TURN" });
      if (!resumed.ok) {
        self.postMessage({ ok: false, message: resumed.error.message } satisfies Response);
        return;
      }
    }
    self.postMessage({
      ok: true,
      save: simulation.serializeSave(),
      result,
    } satisfies Response);
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies Response);
  }
};

export {};
