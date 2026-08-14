/**
 * xoshiro128** — Blackman & Vigna (2018).
 * Four uint32 state words; native JS bitwise ops via Math.imul / >>>.
 * Never use Math.random() in simulation logic.
 */

export const STREAM_NAMES = [
  "elections",
  "npc-decisions",
  "campaigns",
  "legislature",
  "economy",
  "foreign-affairs",
  "health-life-events",
  "scandals",
  "flavor",
  "generation",
] as const;

export type StreamName = (typeof STREAM_NAMES)[number];

export type Xoshiro128State = readonly [number, number, number, number];

export type SerializedRngState = {
  algo: "xoshiro128**";
  masterSeed: string;
  streams: Record<StreamName, Xoshiro128State>;
};

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32 — expands a seed into successive uint32 values. */
export function splitmix32(state: number): { value: number; state: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return { value: (z ^ (z >>> 16)) >>> 0, state: next };
}

/**
 * cyrb128 — pinned deterministic 128-bit string hash (four uint32).
 * Portable across browser / Worker / Node. Not cryptographic.
 */
export function cyrb128(str: string): Xoshiro128State {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** @deprecated Prefer cyrb128 for stream seeding. Kept for non-stream utilities/tests. */
export function hashSeedToUint32(input: string): number {
  return cyrb128(input)[0]!;
}

function ensureNonZeroState(state: Xoshiro128State): Xoshiro128State {
  if ((state[0] | state[1] | state[2] | state[3]) === 0) {
    return [1, 0, 0, 0];
  }
  return state;
}

export function deriveStreamState(masterSeed: string, stream: StreamName): Xoshiro128State {
  return ensureNonZeroState(cyrb128(`${masterSeed}::${stream}`));
}

function assertUint32(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`Invalid uint32 in RNG state (${label}): ${n}`);
  }
}

export function assertValidXoshiroState(
  state: unknown,
  label: string,
): asserts state is Xoshiro128State {
  if (!Array.isArray(state) || state.length !== 4) {
    throw new Error(`RNG state ${label} must be exactly four uint32 words`);
  }
  for (let i = 0; i < 4; i++) {
    assertUint32(state[i] as number, `${label}[${i}]`);
  }
  if (
    ((state[0] as number) | (state[1] as number) | (state[2] as number) | (state[3] as number)) ===
    0
  ) {
    throw new Error(`RNG state ${label} must not be all-zero`);
  }
}

/**
 * Parse/validate serialized RNG from untrusted save JSON (`unknown`).
 * Fails with clear errors rather than incidental TypeErrors on missing fields.
 */
export function parseSerializedRngState(raw: unknown): SerializedRngState {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Serialized RNG must be a non-null object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.algo !== "xoshiro128**") {
    throw new Error(`Unsupported RNG algo: ${String(obj.algo)}`);
  }
  if (typeof obj.masterSeed !== "string" || obj.masterSeed.length === 0) {
    throw new Error("Serialized RNG masterSeed must be a non-empty string");
  }
  if (obj.streams === null || typeof obj.streams !== "object" || Array.isArray(obj.streams)) {
    throw new Error("Serialized RNG streams must be an object");
  }
  const streamsRaw = obj.streams as Record<string, unknown>;
  const streams = {} as Record<StreamName, Xoshiro128State>;
  for (const name of STREAM_NAMES) {
    if (!(name in streamsRaw)) {
      throw new Error(`Serialized RNG missing stream: ${name}`);
    }
    assertValidXoshiroState(streamsRaw[name], name);
    const s = streamsRaw[name] as Xoshiro128State;
    streams[name] = [s[0], s[1], s[2], s[3]];
  }
  return { algo: "xoshiro128**", masterSeed: obj.masterSeed, streams };
}

/** @deprecated Prefer parseSerializedRngState(unknown); kept for typed call sites. */
export function assertValidSerializedRng(state: SerializedRngState): void {
  parseSerializedRngState(state);
}

function nextUint32(state: Xoshiro128State): { value: number; state: Xoshiro128State } {
  const s0 = state[0];
  let s1 = state[1];
  const s2 = state[2];
  const s3 = state[3];

  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;

  let ns2 = (s2 ^ s0) >>> 0;
  let ns3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ ns2) >>> 0;
  const ns0 = (s0 ^ ns3) >>> 0;
  ns2 = (ns2 ^ t) >>> 0;
  ns3 = rotl(ns3, 11);

  return { value: result, state: [ns0, s1, ns2, ns3] };
}

export type RngService = {
  readonly algo: "xoshiro128**";
  readonly masterSeed: string;
  uint32(stream: StreamName): number;
  /** Uniform float in [0, 1) from one uint32 draw. */
  float01(stream: StreamName): number;
  serialize(): SerializedRngState;
};

function buildService(
  masterSeed: string,
  initial: Record<StreamName, Xoshiro128State>,
): RngService {
  const streams = { ...initial };
  return {
    algo: "xoshiro128**",
    masterSeed,
    uint32(stream: StreamName): number {
      const next = nextUint32(streams[stream]);
      streams[stream] = next.state;
      return next.value;
    },
    float01(stream: StreamName): number {
      return this.uint32(stream) / 0x1_0000_0000;
    },
    serialize(): SerializedRngState {
      const out = {} as Record<StreamName, Xoshiro128State>;
      for (const name of STREAM_NAMES) {
        out[name] = [streams[name][0], streams[name][1], streams[name][2], streams[name][3]];
      }
      return { algo: "xoshiro128**", masterSeed, streams: out };
    },
  };
}

/** Create a fresh RNG service from a master seed. */
export function createRngService(masterSeed: string): RngService {
  if (typeof masterSeed !== "string" || masterSeed.length === 0) {
    throw new Error("masterSeed must be a non-empty string");
  }
  const streams = {} as Record<StreamName, Xoshiro128State>;
  for (const name of STREAM_NAMES) {
    streams[name] = deriveStreamState(masterSeed, name);
  }
  return buildService(masterSeed, streams);
}

/**
 * Restore an RNG service from serialized state (including parsed save JSON).
 * Accepts `unknown` and validates shape before use.
 */
export function restoreRngService(serialized: unknown): RngService {
  const parsed = parseSerializedRngState(serialized);
  const streams = {} as Record<StreamName, Xoshiro128State>;
  for (const name of STREAM_NAMES) {
    const s = parsed.streams[name];
    streams[name] = [s[0], s[1], s[2], s[3]];
  }
  return buildService(parsed.masterSeed, streams);
}
