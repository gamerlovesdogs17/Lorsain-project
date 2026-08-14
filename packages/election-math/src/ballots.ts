import {
  add,
  gt,
  isPositive,
  lte,
  parseRational,
  serializeRational,
  ZERO,
  type Rational,
} from "./rational.js";
import type { BallotGroupInput, CandidateId, PreparedBallot } from "./types.js";

export type ExcludedReasonStats = {
  groups: number;
  knownWeight: string;
};

export type ExcludedBallotStats = {
  /** Number of excluded ballot *groups* (not individual voters). */
  excludedBallotGroupCount: number;
  /** Exact sum of parseable positive/zero weights on excluded groups. */
  excludedKnownWeight: string;
  /** Excluded groups whose weight string could not be parsed. */
  unknownWeightGroups: number;
  excludedByReason: Record<string, ExcludedReasonStats>;
};

export type BallotValidationResult = {
  valid: PreparedBallot[];
  /** Malformed / blank structured inputs excluded from total_valid. */
  excluded: Array<{ reason: string; input: BallotGroupInput; knownWeight: Rational | null }>;
  totalValid: Rational;
  exclusionStats: ExcludedBallotStats;
};

const AUTO_PREFIX = "__auto_ballot_";

function formatAutoId(n: number): string {
  return `${AUTO_PREFIX}${String(n).padStart(6, "0")}`;
}

function tryParseWeight(weight: string): Rational | null {
  try {
    return parseRational(weight);
  } catch {
    return null;
  }
}

function buildExclusionStats(excluded: BallotValidationResult["excluded"]): ExcludedBallotStats {
  const byReason = new Map<string, { groups: number; knownWeight: Rational }>();
  let known = ZERO;
  let unknownWeightGroups = 0;

  for (const e of excluded) {
    const cur = byReason.get(e.reason) ?? { groups: 0, knownWeight: ZERO };
    cur.groups += 1;
    if (e.knownWeight !== null) {
      cur.knownWeight = add(cur.knownWeight, e.knownWeight);
      known = add(known, e.knownWeight);
    } else {
      unknownWeightGroups += 1;
    }
    byReason.set(e.reason, cur);
  }

  const excludedByReason: Record<string, ExcludedReasonStats> = {};
  for (const [reason, v] of [...byReason.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    excludedByReason[reason] = {
      groups: v.groups,
      knownWeight: serializeRational(v.knownWeight),
    };
  }

  return {
    excludedBallotGroupCount: excluded.length,
    excludedKnownWeight: serializeRational(known),
    unknownWeightGroups,
    excludedByReason,
  };
}

/**
 * Validate and normalize ballot groups.
 * Duplicate explicit IDs are excluded (not silently renamed).
 * Auto IDs use `__auto_ballot_NNNNNN` and never collide with reserved/supplied IDs.
 */
export function prepareBallots(
  candidateIds: readonly CandidateId[],
  ballots: readonly BallotGroupInput[],
): BallotValidationResult {
  const candidates = new Set(candidateIds);
  const valid: PreparedBallot[] = [];
  const excluded: BallotValidationResult["excluded"] = [];

  const reserved = new Set<string>();
  for (const input of ballots) {
    if (typeof input.id === "string" && input.id.length > 0) {
      reserved.add(input.id);
    }
  }

  const usedIds = new Set<string>();
  let autoSeq = 1;

  const nextAutoId = (): string => {
    for (;;) {
      const id = formatAutoId(autoSeq++);
      if (!reserved.has(id) && !usedIds.has(id)) return id;
    }
  };

  for (const input of ballots) {
    const knownWeight = typeof input.weight === "string" ? tryParseWeight(input.weight) : null;

    if (typeof input.id === "string" && input.id.length > 0) {
      if (usedIds.has(input.id)) {
        excluded.push({ reason: "duplicate_ballot_group_id", input, knownWeight });
        continue;
      }
    }

    if (!Array.isArray(input.rankings)) {
      excluded.push({ reason: "rankings_not_array", input, knownWeight });
      continue;
    }
    if (input.rankings.length === 0) {
      excluded.push({ reason: "blank_ranking", input, knownWeight });
      continue;
    }

    const seen = new Set<string>();
    let badReason: string | null = null;
    for (const id of input.rankings) {
      if (typeof id !== "string" || !candidates.has(id)) {
        badReason = `unknown_or_invalid_candidate:${String(id)}`;
        break;
      }
      if (seen.has(id)) {
        badReason = `duplicate_ranking:${id}`;
        break;
      }
      seen.add(id);
    }
    if (badReason) {
      excluded.push({ reason: badReason, input, knownWeight });
      continue;
    }

    if (knownWeight === null) {
      excluded.push({ reason: "invalid_weight", input, knownWeight: null });
      continue;
    }
    if (!isPositive(knownWeight) || !gt(knownWeight, ZERO)) {
      excluded.push({ reason: "non_positive_weight", input, knownWeight });
      continue;
    }

    const id = typeof input.id === "string" && input.id.length > 0 ? input.id : nextAutoId();
    usedIds.add(id);
    valid.push({
      id,
      rankings: [...input.rankings],
      weight: knownWeight,
    });
  }

  let totalValid = ZERO;
  for (const b of valid) totalValid = add(totalValid, b.weight);
  return {
    valid,
    excluded,
    totalValid,
    exclusionStats: buildExclusionStats(excluded),
  };
}

/** Fail closed when there is no valid vote value to count. */
export function assertPositiveTotalValid(totalValid: Rational, method: string): void {
  if (lte(totalValid, ZERO)) {
    throw new Error(
      `${method} count rejected: totalValid is ${serializeRational(totalValid)} (no valid ballot weight)`,
    );
  }
}

/** Next continuing preference: skip eliminated and elected/non-continuing. */
export function nextContinuingPreference(
  rankings: readonly CandidateId[],
  continuing: ReadonlySet<CandidateId>,
): CandidateId | null {
  for (const id of rankings) {
    if (continuing.has(id)) return id;
  }
  return null;
}
