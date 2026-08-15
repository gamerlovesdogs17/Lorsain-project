/** Canonical JSON-value types. No BigInt, Map, Set, functions, Date, or cycles. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export function isFiniteJsonNumber(n: number): boolean {
  return Number.isFinite(n);
}

export function jsonSafetyError(value: unknown, path = "$"): string | null {
  const seen = new WeakSet<object>();
  function walk(v: unknown, p: string): string | null {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return null;
    if (t === "number") {
      if (!Number.isFinite(v as number))
        return `${p}: numbers must be finite JSON (no NaN/Infinity)`;
      return null;
    }
    if (t === "bigint") return `${p}: BigInt is not JSON-safe`;
    if (t === "undefined") return `${p}: undefined is not JSON-safe`;
    if (t === "function") return `${p}: functions are not JSON-safe`;
    if (t === "symbol") return `${p}: symbols are not JSON-safe`;
    if (t !== "object") return `${p}: unsupported type ${t}`;
    const obj = v as object;
    if (obj instanceof Map) return `${p}: Map is not JSON-safe`;
    if (obj instanceof Set) return `${p}: Set is not JSON-safe`;
    if (obj instanceof Date) return `${p}: Date instances are not JSON-safe`;
    if (Array.isArray(obj)) {
      if (seen.has(obj)) return `${p}: cyclic object`;
      seen.add(obj);
      for (let i = 0; i < obj.length; i++) {
        const err = walk(obj[i], `${p}[${i}]`);
        if (err) return err;
      }
      return null;
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      return `${p}: class instances are not JSON-safe`;
    }
    if (seen.has(obj)) return `${p}: cyclic object`;
    seen.add(obj);
    for (const [k, child] of Object.entries(obj as Record<string, unknown>)) {
      const err = walk(child, `${p}.${k}`);
      if (err) return err;
    }
    return null;
  }
  return walk(value, path);
}

export function isJsonValue(value: unknown): value is JsonValue {
  return jsonSafetyError(value) === null;
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return jsonSafetyError(value) === null;
}

export function assertJsonValue(value: unknown, label = "value"): JsonValue {
  const err = jsonSafetyError(value, label);
  if (err) throw new Error(err);
  return value as JsonValue;
}

export function assertJsonObject(value: unknown, label = "payload"): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(jsonSafetyError(value, label) ?? `${label} must be a JSON object`);
  }
  return value;
}
