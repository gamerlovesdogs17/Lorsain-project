/** Canonical deterministic serialization + hash. Not cryptographic. */

import { cyrb128 } from "./rng.js";

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    out[key] = canonicalize(rec[key]);
  }
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashCanonical(value: unknown): string {
  const [a, b, c, d] = cyrb128(canonicalJson(value));
  return [a, b, c, d].map((n) => n.toString(16).padStart(8, "0")).join("");
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const v of Object.values(value as Record<string, unknown>)) {
    deepFreeze(v);
  }
  return value;
}
