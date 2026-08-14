import type { Uint32Source } from "./types.js";

/** Deterministic fake uint32 source for lot tests. */
export function sequenceRng(draws: number[]): Uint32Source {
  let i = 0;
  return {
    nextUint32(): number {
      if (i >= draws.length) throw new Error(`sequenceRng exhausted at index ${i}`);
      return draws[i++]! >>> 0;
    },
  };
}

/** Never-called RNG — fails if a lot is unexpectedly needed. */
export function failRng(): Uint32Source {
  return {
    nextUint32(): number {
      throw new Error("unexpected lot draw");
    },
  };
}

export function infiniteRng(fill = 0): Uint32Source {
  return {
    nextUint32(): number {
      return fill >>> 0;
    },
  };
}
