import { createHash } from "node:crypto";
import type { SerializedRngState } from "@lorsain/sim";

/** Stable hash helper for future determinism / save-replay tests. */
export function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function hashRngState(state: SerializedRngState): string {
  return hashJson(state);
}
