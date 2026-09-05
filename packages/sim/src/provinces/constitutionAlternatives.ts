/**
 * Phase 11.4 — Constitution alternatives layer.
 *
 * Provides structured alternatives for each modelled constitutional rule, including
 * canonical Terena-style clause text and gameplay mechanical summaries.
 * Also provides the `diffConstitutionalText` helper for red/green UI diffing.
 */
import type { ConstitutionalRuleId } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConstitutionAlternative = {
  ruleId: ConstitutionalRuleId;
  /** Numeric value stored in `RuntimeConstitutionalRule.value`. */
  value: number;
  /**
   * Descriptive label — factual and neutral, NOT qualitative (no "good/bad/moderate").
   * Suitable for use in amendment proposal UI without implying a recommended choice.
   */
  label: string;
  /**
   * Full replacement clause text written in Terena constitutional style.
   * Stored on the `ConstitutionalAmendment.proposedText` field when a structured
   * amendment is proposed, so text and numeric rule stay unified.
   */
  proposedClauseText: string;
  /**
   * Plain-language description of what gameplay mechanics change when this
   * alternative is ratified (e.g. election frequency, eligibility thresholds).
   */
  mechanicalSummary: string;
};

/**
 * Token-level diff segment produced by `diffConstitutionalText`.
 * Adjacent tokens of the same kind are merged so consumers receive continuous runs.
 */
export type DiffSegment = { kind: "same" | "del" | "add"; text: string };

// ---------------------------------------------------------------------------
// Alternatives data
// ---------------------------------------------------------------------------

/** All alternatives, one set of four per constitutional rule. */
const CONSTITUTION_ALTERNATIVES: ConstitutionAlternative[] = [
  // ── assembly_term_years ─────────────────────────────────────────────────
  // Canonical clause: ART_IV_S1_C2
  //   "The ordinary term of the National Assembly is four years. Members remain
  //    in office until their successors assume office on 1 June following the election."
  {
    ruleId: "assembly_term_years",
    value: 3,
    label: "Three-year legislative cycle",
    proposedClauseText:
      "The ordinary term of the National Assembly is three years. Members remain in office until their successors assume office on 1 June following the election.",
    mechanicalSummary:
      "Assembly elections occur every 3 years; incumbents face voters more frequently and governing coalitions must renew their mandate on a shorter horizon.",
  },
  {
    ruleId: "assembly_term_years",
    value: 4,
    label: "Four-year legislative cycle",
    proposedClauseText:
      "The ordinary term of the National Assembly is four years. Members remain in office until their successors assume office on 1 June following the election.",
    mechanicalSummary:
      "Assembly elections occur every 4 years; the constitutional default that aligns with current Terena practice.",
  },
  {
    ruleId: "assembly_term_years",
    value: 5,
    label: "Five-year legislative cycle",
    proposedClauseText:
      "The ordinary term of the National Assembly is five years. Members remain in office until their successors assume office on 1 June following the election.",
    mechanicalSummary:
      "Assembly elections occur every 5 years; incumbents have a longer planning horizon and mid-term electoral pressure is reduced.",
  },
  {
    ruleId: "assembly_term_years",
    value: 6,
    label: "Six-year legislative cycle",
    proposedClauseText:
      "The ordinary term of the National Assembly is six years. Members remain in office until their successors assume office on 1 June following the election.",
    mechanicalSummary:
      "Assembly elections occur every 6 years; the longest available term, substantially reducing the frequency of national electoral campaigns.",
  },

  // ── presidential_term_limit ─────────────────────────────────────────────
  // Canonical clause: ART_III_S1_C3
  //   "No person may be elected President more than two times. Acting service
  //    does not constitute an elected term."
  //
  // IMPORTANT: value === 0 encodes "no limit" (unlimited re-elections).
  // The eligibility system in packages/sim/src/parties/eligibility.ts treats
  // presidential_term_limit === 0 as a bypass of the term-count check.
  {
    ruleId: "presidential_term_limit",
    value: 1,
    label: "Single presidential term",
    proposedClauseText:
      "No person may be elected President more than once. Acting service does not constitute an elected term.",
    mechanicalSummary:
      "A president may serve exactly one elected term; no re-election pathway exists and every presidential election produces a new incumbent.",
  },
  {
    ruleId: "presidential_term_limit",
    value: 2,
    label: "Two-term presidential limit",
    proposedClauseText:
      "No person may be elected President more than two times. Acting service does not constitute an elected term.",
    mechanicalSummary:
      "The constitutional default; a president may serve two elected terms, after which they become permanently ineligible.",
  },
  {
    ruleId: "presidential_term_limit",
    value: 3,
    label: "Three-term presidential limit",
    proposedClauseText:
      "No person may be elected President more than three times. Acting service does not constitute an elected term.",
    mechanicalSummary:
      "A president may seek up to three elected terms before permanent ineligibility applies; one additional term compared to the default.",
  },
  {
    ruleId: "presidential_term_limit",
    value: 0,
    label: "No presidential term limit",
    proposedClauseText:
      "There is no constitutional limit on the number of times a person may be elected President. Acting service does not constitute an elected term.",
    mechanicalSummary:
      "Presidential re-election is unrestricted by prior terms; a sitting president may seek re-election indefinitely. " +
      "In the eligibility system, value 0 is treated as unlimited — the term-count check is skipped entirely.",
  },

  // ── court_term_years ────────────────────────────────────────────────────
  // Canonical clause location: Article VI (Constitutional Court) — runtime_rule_id: court_term_years
  // Style follows ART_VI section on Court composition.
  {
    ruleId: "court_term_years",
    value: 6,
    label: "Six-year judicial term",
    proposedClauseText:
      "Justices of the Constitutional Court serve non-renewable terms of six years and may not thereafter be reappointed to that Court.",
    mechanicalSummary:
      "Court seats turn over rapidly; appointments arise every several years, increasing the political salience of each judicial vacancy.",
  },
  {
    ruleId: "court_term_years",
    value: 9,
    label: "Nine-year judicial term",
    proposedClauseText:
      "Justices of the Constitutional Court serve non-renewable terms of nine years and may not thereafter be reappointed to that Court.",
    mechanicalSummary:
      "Moderate tenure; the constitutional default balancing judicial independence with periodic renewal of the Court's composition.",
  },
  {
    ruleId: "court_term_years",
    value: 12,
    label: "Twelve-year judicial term",
    proposedClauseText:
      "Justices of the Constitutional Court serve non-renewable terms of twelve years and may not thereafter be reappointed to that Court.",
    mechanicalSummary:
      "Extended tenure reduces appointment frequency; justices serve across multiple presidential administrations before retiring.",
  },
  {
    ruleId: "court_term_years",
    value: 15,
    label: "Fifteen-year judicial term",
    proposedClauseText:
      "Justices of the Constitutional Court serve non-renewable terms of fifteen years and may not thereafter be reappointed to that Court.",
    mechanicalSummary:
      "Longest available tenure; Court appointments are rare events with substantial long-term influence on the institution's character.",
  },

  // ── veto_override_fraction ──────────────────────────────────────────────
  // Canonical clause location: Article V (Legislation) — runtime_rule_id: veto_override_fraction
  // Terena style for Article V on presidential returns / re-passage.
  {
    ruleId: "veto_override_fraction",
    value: 0.55,
    label: "Fifty-five percent override threshold",
    proposedClauseText:
      "A bill returned by the President with objections may be enacted into law if repassed by at least fifty-five percent of the sitting members of the National Assembly.",
    mechanicalSummary:
      "Override threshold is the lowest available; a governing majority coalition can defeat a presidential veto without requiring cross-party support.",
  },
  {
    ruleId: "veto_override_fraction",
    value: 0.6,
    label: "Three-fifths override threshold",
    proposedClauseText:
      "A bill returned by the President with objections may be enacted into law if repassed by at least three-fifths of the sitting members of the National Assembly.",
    mechanicalSummary:
      "Three-fifths threshold requires meaningful cross-party support; a strong governing majority can override vetoes without a full supermajority.",
  },
  {
    ruleId: "veto_override_fraction",
    value: 2 / 3,
    label: "Two-thirds override threshold",
    proposedClauseText:
      "A bill returned by the President with objections may be enacted into law if repassed by at least two-thirds of the sitting members of the National Assembly.",
    mechanicalSummary:
      "Standard supermajority threshold; presidential vetoes require broad legislative consensus to override, reinforcing executive influence over contentious bills.",
  },
  {
    ruleId: "veto_override_fraction",
    value: 0.75,
    label: "Three-quarters override threshold",
    proposedClauseText:
      "A bill returned by the President with objections may be enacted into law if repassed by at least three-quarters of the sitting members of the National Assembly.",
    mechanicalSummary:
      "Highest available threshold; presidential vetoes are almost irreversible in practice without near-unanimous assembly agreement.",
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns all structured alternatives for a given constitutional rule, in the
 * same order as `CONSTITUTIONAL_LEGAL_VALUES[ruleId]`.
 */
export function constitutionAlternativesFor(
  ruleId: ConstitutionalRuleId,
): ConstitutionAlternative[] {
  return CONSTITUTION_ALTERNATIVES.filter((alt) => alt.ruleId === ruleId);
}

/**
 * Returns the single alternative matching `(ruleId, value)`, or `undefined` if
 * no alternative is registered for that combination.
 *
 * Uses epsilon comparison (`< 0.000001`) to match floating-point values like `2/3`.
 */
export function constitutionAlternativeFor(
  ruleId: ConstitutionalRuleId,
  value: number,
): ConstitutionAlternative | undefined {
  return CONSTITUTION_ALTERNATIVES.find(
    (alt) => alt.ruleId === ruleId && Math.abs(alt.value - value) < 0.000001,
  );
}

/**
 * Lightweight coherence warnings when a proposed rule value sits awkwardly
 * beside other live constitutional rules. Does not block enactment.
 */
export function constitutionalDependencyWarnings(
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
  currentRules: Partial<Record<ConstitutionalRuleId, number>>,
): string[] {
  const warnings: string[] = [];
  const assemblyYears = currentRules.assembly_term_years ?? 4;
  const courtYears = currentRules.court_term_years ?? 12;

  if (ruleId === "court_term_years" && proposedValue < assemblyYears * 2) {
    warnings.push(
      "Judicial terms shorter than two Assembly cycles would place Court turnover on a faster rhythm than the elected legislature.",
    );
  }
  if (ruleId === "assembly_term_years" && courtYears < proposedValue * 2) {
    warnings.push(
      "Lengthening Assembly terms while Court terms remain comparatively short would keep judicial renewal frequent relative to legislative tenure.",
    );
  }
  if (ruleId === "veto_override_fraction" && proposedValue <= 0.55 + 1e-9) {
    warnings.push(
      "A bare eleven-twentieths override threshold would make presidential vetoes comparatively easy to reverse and may weaken the executive check on ordinary legislation.",
    );
  }
  if (ruleId === "presidential_term_limit" && proposedValue === 0) {
    warnings.push(
      "Abolishing presidential term limits would remove the existing lifetime ceiling on consecutive elected service; eligibility checks treat this as unlimited re-election.",
    );
  }
  return warnings;
}

/**
 * Word-level diff between two constitutional clause texts.
 *
 * Returns an array of `DiffSegment` objects where each segment has a `kind`
 * (`"same"` | `"del"` | `"add"`) and the contiguous `text` for that kind.
 * Adjacent segments of the same kind are merged, so the output is suitable
 * for direct red/green UI rendering.
 *
 * Algorithm: LCS (Longest Common Subsequence) on word+whitespace tokens,
 * O(m×n) time and space where m and n are token counts.
 */
export function diffConstitutionalText(currentText: string, proposedText: string): DiffSegment[] {
  // Tokenise into alternating word / whitespace runs so whitespace is preserved.
  const tokenize = (text: string): string[] => text.match(/\S+|\s+/g) ?? [];
  const aTokens = tokenize(currentText);
  const bTokens = tokenize(proposedText);

  const m = aTokens.length;
  const n = bTokens.length;

  // Build LCS table using Uint16Arrays for memory efficiency.
  // Values are capped at 65 535 which exceeds any realistic clause length.
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    for (let j = 1; j <= n; j++) {
      row[j] =
        aTokens[i - 1] === bTokens[j - 1]
          ? (prev[j - 1] ?? 0) + 1
          : Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
    }
  }

  // Backtrack to reconstruct the diff in reverse order, then reverse.
  const raw: DiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const aTok = aTokens[i - 1];
    const bTok = bTokens[j - 1];
    if (i > 0 && j > 0 && aTok != null && bTok != null && aTok === bTok) {
      raw.push({ kind: "same", text: aTok });
      i--;
      j--;
    } else if (j > 0 && bTok != null && (i === 0 || (dp[i]![j - 1] ?? 0) >= (dp[i - 1]![j] ?? 0))) {
      raw.push({ kind: "add", text: bTok });
      j--;
    } else if (i > 0 && aTok != null) {
      raw.push({ kind: "del", text: aTok });
      i--;
    } else {
      break;
    }
  }
  raw.reverse();

  // Merge adjacent segments of the same kind into continuous runs.
  const merged: DiffSegment[] = [];
  for (const seg of raw) {
    const last = merged.at(-1);
    if (last && last.kind === seg.kind) {
      last.text += seg.text;
    } else {
      merged.push({ kind: seg.kind, text: seg.text });
    }
  }

  return merged;
}
