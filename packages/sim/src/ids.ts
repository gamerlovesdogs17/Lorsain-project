/**
 * Canonical allocated IDs: PREFIX + one or more digits whose integer value is >= 1.
 * Leading zeros are allowed (EVT000001). Width is not fixed; EVT1000000 is valid.
 * EVT0 / SEV00 / EVTabc / banana are invalid.
 */
export function parseCanonicalAllocatedId(prefix: string, id: string): number | null {
  if (typeof id !== "string" || !id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = Number(rest);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function isCanonicalAllocatedId(prefix: string, id: string): boolean {
  return parseCanonicalAllocatedId(prefix, id) != null;
}
