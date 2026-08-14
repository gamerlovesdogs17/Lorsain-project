import { describe, expect, it } from "vitest";
import {
  createRngService,
  cyrb128,
  deriveStreamState,
  parseSerializedRngState,
  restoreRngService,
  STREAM_NAMES,
} from "./rng.js";

describe("xoshiro128** RNG", () => {
  it("pins cyrb128 seed derivation golden vector", () => {
    expect(cyrb128("TERENA-2028-SIM-01")).toEqual([3804565382, 1732539268, 4259663450, 2019832408]);
    expect(deriveStreamState("TERENA-2028-SIM-01", "elections")).toEqual([
      2608768348, 925361081, 1412999381, 4167167536,
    ]);
  });

  it("reproduces a golden uint32 sequence for a fixed seed/stream", () => {
    const rng = createRngService("TERENA-2028-SIM-01");
    const draws = Array.from({ length: 8 }, () => rng.uint32("elections"));
    expect(draws).toEqual([
      25412305, 2607758284, 17564144, 2144756402, 2623183547, 663756615, 1137633849, 3433510278,
    ]);
  });

  it("isolates streams so flavor draws do not change elections", () => {
    const a = createRngService("stream-isolation");
    const b = createRngService("stream-isolation");
    a.uint32("flavor");
    a.uint32("flavor");
    expect(a.uint32("elections")).toBe(b.uint32("elections"));
  });

  it("round-trips serialize via restoreRngService", () => {
    const rng = createRngService("serialize-me");
    rng.uint32("campaigns");
    rng.uint32("campaigns");
    const snap = rng.serialize();
    const restored = restoreRngService(snap);
    expect(restored.masterSeed).toBe("serialize-me");
    expect(restored.uint32("campaigns")).toBe(rng.uint32("campaigns"));
  });

  it("rejects restored all-zero stream state", () => {
    const snap = createRngService("ok").serialize();
    snap.streams.elections = [0, 0, 0, 0];
    expect(() => restoreRngService(snap)).toThrow(/all-zero/);
  });

  it("rejects restored state missing a stream", () => {
    const snap = createRngService("ok").serialize();
    delete (snap.streams as { flavor?: unknown }).flavor;
    expect(() => restoreRngService(snap)).toThrow(/missing stream/);
  });

  it("rejects malformed unknown save JSON without TypeError", () => {
    expect(() => restoreRngService(null)).toThrow(/non-null object/);
    expect(() => restoreRngService("x")).toThrow(/non-null object/);
    expect(() => restoreRngService({})).toThrow(/Unsupported RNG algo/);
    expect(() =>
      restoreRngService({ algo: "xoshiro128**", masterSeed: "s", streams: null }),
    ).toThrow(/streams must be an object/);
    expect(() => restoreRngService({ algo: "xoshiro128**", masterSeed: "s", streams: {} })).toThrow(
      /missing stream/,
    );
  });

  it("parseSerializedRngState accepts valid serialized snapshots", () => {
    const snap = createRngService("parse-me").serialize();
    const parsed = parseSerializedRngState(JSON.parse(JSON.stringify(snap)));
    expect(parsed.masterSeed).toBe("parse-me");
  });

  it("defines all required named streams", () => {
    expect(STREAM_NAMES).toContain("elections");
    expect(STREAM_NAMES).toContain("generation");
    expect(STREAM_NAMES).toHaveLength(10);
  });
});
