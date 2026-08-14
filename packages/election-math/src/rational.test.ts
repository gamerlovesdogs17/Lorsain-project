import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  div,
  eq,
  floor,
  fromBigInt,
  fromInt,
  gcd,
  gt,
  lt,
  mul,
  parseRational,
  rational,
  serializeRational,
  sub,
  ZERO,
  ONE,
} from "./rational.js";

describe("rational arithmetic", () => {
  it("normalizes zero and signs", () => {
    expect(rational(0n, 5n)).toEqual({ num: 0n, den: 1n });
    expect(rational(2n, -4n)).toEqual({ num: -1n, den: 2n });
    expect(rational(-6n, -9n)).toEqual({ num: 2n, den: 3n });
    expect(rational(-3n, 6n)).toEqual({ num: -1n, den: 2n });
  });

  it("reduces by gcd", () => {
    expect(gcd(12n, 18n)).toBe(6n);
    expect(rational(12n, 18n)).toEqual({ num: 2n, den: 3n });
  });

  it("rejects zero denominator", () => {
    expect(() => rational(1n, 0n)).toThrow(/denominator/);
  });

  it("adds subtracts multiplies divides", () => {
    expect(add(rational(1n, 2n), rational(1n, 3n))).toEqual({ num: 5n, den: 6n });
    expect(sub(ONE, rational(1n, 4n))).toEqual({ num: 3n, den: 4n });
    expect(mul(rational(2n, 3n), rational(3n, 5n))).toEqual({ num: 2n, den: 5n });
    expect(div(rational(1n, 2n), rational(1n, 4n))).toEqual({ num: 2n, den: 1n });
  });

  it("compares exactly", () => {
    expect(compare(rational(1n, 2n), rational(2n, 4n))).toBe(0);
    expect(lt(rational(1n, 3n), rational(1n, 2n))).toBe(true);
    expect(gt(rational(3n, 2n), ONE)).toBe(true);
    expect(eq(ZERO, rational(0n, 99n))).toBe(true);
  });

  it("floors toward -infinity", () => {
    expect(floor(rational(5n, 2n))).toBe(2n);
    expect(floor(rational(-5n, 2n))).toBe(-3n);
    expect(floor(fromInt(7))).toBe(7n);
  });

  it("handles very large BigInts", () => {
    const a = fromBigInt(10n ** 40n);
    const b = fromBigInt(10n ** 40n + 1n);
    expect(eq(sub(b, a), ONE)).toBe(true);
    expect(serializeRational(div(a, b))).toBe(`${10n ** 40n}/${10n ** 40n + 1n}`);
  });

  it("round-trips serialize/parse", () => {
    for (const s of ["0/1", "1/1", "5/7", "-3/4", "1000000000000/3"]) {
      const parsed = parseRational(s);
      expect(serializeRational(parseRational(serializeRational(parsed)))).toBe(
        serializeRational(parsed),
      );
    }
    expect(serializeRational(parseRational("42"))).toBe("42/1");
  });
});
