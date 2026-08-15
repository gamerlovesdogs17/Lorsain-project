import { describe, expect, it } from "vitest";
import type { HostToWorkerMessage, WorkerToHostMessage } from "./worker-protocol.js";
import { syntheticWorld } from "./synthetic-world.js";

describe("worker protocol", () => {
  it("round-trips through JSON without functions", () => {
    const msg: HostToWorkerMessage = {
      type: "INIT_NEW_GAME",
      requestId: "r1",
      world: syntheticWorld(),
      playerPoliticianId: "P1",
    };
    const clone = JSON.parse(JSON.stringify(msg)) as HostToWorkerMessage;
    expect(clone.type).toBe("INIT_NEW_GAME");
    const err: WorkerToHostMessage = {
      type: "ERROR",
      requestId: "r1",
      error: { code: "X", message: "nope" },
    };
    expect(JSON.parse(JSON.stringify(err)).error.code).toBe("X");
  });
});
