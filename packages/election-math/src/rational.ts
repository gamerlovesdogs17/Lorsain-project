/**
 * Exact reduced rational numbers (BigInt).
 * Outcome-critical election arithmetic must use this type — never IEEE floats.
 */

export type Rational = {
  readonly num: bigint;
  readonly den: bigint; // always > 0
};

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function rational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new Error("Rational denominator cannot be zero");
  if (num === 0n) return { num: 0n, den: 1n };
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

export function fromBigInt(n: bigint): Rational {
  return rational(n, 1n);
}

export function fromInt(n: number): Rational {
  if (!Number.isInteger(n)) throw new Error(`fromInt requires integer, got ${n}`);
  return fromBigInt(BigInt(n));
}

/** Parse "num/den" or integer string. */
export function parseRational(s: string): Rational {
  const t = s.trim();
  if (!t) throw new Error("empty rational string");
  const slash = t.indexOf("/");
  if (slash < 0) return rational(BigInt(t), 1n);
  const num = BigInt(t.slice(0, slash));
  const den = BigInt(t.slice(slash + 1));
  return rational(num, den);
}

export function serializeRational(r: Rational): string {
  return `${r.num.toString()}/${r.den.toString()}`;
}

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new Error("division by zero rational");
  return rational(a.num * b.den, a.den * b.num);
}

export function neg(a: Rational): Rational {
  return rational(-a.num, a.den);
}

export function compare(a: Rational, b: Rational): number {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

export function eq(a: Rational, b: Rational): boolean {
  return compare(a, b) === 0;
}

export function lt(a: Rational, b: Rational): boolean {
  return compare(a, b) < 0;
}

export function lte(a: Rational, b: Rational): boolean {
  return compare(a, b) <= 0;
}

export function gt(a: Rational, b: Rational): boolean {
  return compare(a, b) > 0;
}

export function gte(a: Rational, b: Rational): boolean {
  return compare(a, b) >= 0;
}

export function isZero(a: Rational): boolean {
  return a.num === 0n;
}

export function isPositive(a: Rational): boolean {
  return a.num > 0n;
}

/** Floor toward -∞ for any sign. */
export function floor(a: Rational): bigint {
  if (a.den === 1n) return a.num;
  const q = a.num / a.den;
  const r = a.num % a.den;
  if (r === 0n) return q;
  if (a.num < 0n) return q - 1n;
  return q;
}

export function min(a: Rational, b: Rational): Rational {
  return lt(a, b) ? a : b;
}

export function max(a: Rational, b: Rational): Rational {
  return gt(a, b) ? a : b;
}

export function sum(values: readonly Rational[]): Rational {
  let s = rational(0n, 1n);
  for (const v of values) s = add(s, v);
  return s;
}

export const ZERO = rational(0n, 1n);
export const ONE = rational(1n, 1n);
