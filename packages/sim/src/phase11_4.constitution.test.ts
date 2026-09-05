/**
 * Phase 11.4 — Constitution unification foundations
 *
 * Tests:
 *   1. Four alternatives per constitutional rule (via constitutionAlternativesFor)
 *   2. All CONSTITUTIONAL_LEGAL_VALUES values pass propose-path validation
 *      (i.e. none trigger INVALID_CONSTITUTIONAL_VALUE)
 *   3. diffConstitutionalText correctly marks deletions and additions
 *   4. presidential_term_limit === 0 means unlimited (eligibility skips term check)
 */
import { describe, expect, it } from "vitest";
import { createSimulation } from "./engine.js";
import { loadTerenaWorld } from "./integration/harness.js";
import {
  constitutionAlternativesFor,
  constitutionAlternativeFor,
  constitutionalDependencyWarnings,
  diffConstitutionalText,
} from "./provinces/constitutionAlternatives.js";
import type { DiffSegment } from "./provinces/constitutionAlternatives.js";
import { CONSTITUTIONAL_RULE_IDS } from "./provinces/types.js";
import {
  proposeConstitutionalAmendment,
  CONSTITUTIONAL_LEGAL_VALUES,
} from "./provinces/constitutional.js";
import { currentAssemblyMemberIds } from "./legislature/state.js";
import { evaluatePresidentialEligibility } from "./parties/eligibility.js";

/** Returns the first holder of an office of the given kind from the world's starting terms. */
function startingHolder(world: ReturnType<typeof loadTerenaWorld>, kind: string): string {
  const term = world.startingTerms.find(
    (candidate) => world.offices[candidate.officeId]?.kind === kind,
  );
  if (!term) throw new Error(`No starting office of kind: ${kind}`);
  return term.holderId;
}

// ─── 1. Alternatives coverage ───────────────────────────────────────────────

describe("Phase 11.4 — Constitution alternatives data", () => {
  it("provides exactly 4 alternatives per constitutional rule", () => {
    for (const ruleId of CONSTITUTIONAL_RULE_IDS) {
      const alts = constitutionAlternativesFor(ruleId);
      expect(alts).toHaveLength(4);
      // Every alternative must reference the correct ruleId
      for (const alt of alts) {
        expect(alt.ruleId).toBe(ruleId);
      }
    }
  });

  it("alternative values exactly match CONSTITUTIONAL_LEGAL_VALUES", () => {
    for (const ruleId of CONSTITUTIONAL_RULE_IDS) {
      const alts = constitutionAlternativesFor(ruleId);
      const altValues = alts.map((alt) => alt.value);
      const legalValues = CONSTITUTIONAL_LEGAL_VALUES[ruleId];
      // Same length
      expect(altValues).toHaveLength(legalValues.length);
      // Each legal value has a matching alternative (epsilon comparison for floats)
      for (const v of legalValues) {
        expect(alts.some((alt) => Math.abs(alt.value - v) < 0.000001)).toBe(true);
      }
    }
  });

  it("labels are descriptive and do not use qualitative terms (good/bad/moderate)", () => {
    for (const ruleId of CONSTITUTIONAL_RULE_IDS) {
      for (const alt of constitutionAlternativesFor(ruleId)) {
        expect(alt.label).toBeTruthy();
        expect(alt.label.length).toBeGreaterThan(4);
        // Labels must not use evaluative shorthand that implies recommended ranking
        expect(alt.label.toLowerCase()).not.toMatch(/\b(good|bad|moderate|best|worse|better)\b/);
      }
    }
  });

  it("proposedClauseText is non-empty Terena-style prose for each alternative", () => {
    for (const ruleId of CONSTITUTIONAL_RULE_IDS) {
      for (const alt of constitutionAlternativesFor(ruleId)) {
        expect(typeof alt.proposedClauseText).toBe("string");
        expect(alt.proposedClauseText.length).toBeGreaterThan(40);
        // Clause text must not be empty or obviously placeholder
        expect(alt.proposedClauseText.trim()).not.toBe("");
        expect(alt.proposedClauseText).not.toContain("TODO");
      }
    }
  });

  it("constitutionAlternativeFor returns correct alternative with epsilon matching", () => {
    // Exact integer match
    const a3 = constitutionAlternativeFor("assembly_term_years", 3);
    expect(a3).toBeDefined();
    expect(a3!.value).toBe(3);

    // Two-thirds: 2/3 as a JS float must match
    const vetoTwoThirds = constitutionAlternativeFor("veto_override_fraction", 2 / 3);
    expect(vetoTwoThirds).toBeDefined();
    expect(vetoTwoThirds!.label.toLowerCase()).toContain("two-thirds");

    // Value 0 for presidential_term_limit (no limit)
    const noLimit = constitutionAlternativeFor("presidential_term_limit", 0);
    expect(noLimit).toBeDefined();
    expect(noLimit!.proposedClauseText).toMatch(
      /no.*limit|without.*restriction|unrestricted|no constitutional limit/i,
    );

    // Non-existent value returns undefined
    expect(constitutionAlternativeFor("assembly_term_years", 99)).toBeUndefined();
  });

  it("constitutionalDependencyWarnings flags known coherence issues", () => {
    const shortCourt = constitutionalDependencyWarnings("court_term_years", 6, {
      assembly_term_years: 4,
      court_term_years: 12,
      presidential_term_limit: 2,
      veto_override_fraction: 2 / 3,
    });
    expect(shortCourt.length).toBeGreaterThan(0);
    const unlimited = constitutionalDependencyWarnings("presidential_term_limit", 0, {
      assembly_term_years: 4,
      court_term_years: 12,
      presidential_term_limit: 2,
      veto_override_fraction: 2 / 3,
    });
    expect(unlimited.some((w) => /term limit/i.test(w))).toBe(true);
  });
});

// ─── 2. Propose-path legal-value validation ─────────────────────────────────

describe("Phase 11.4 — Propose-path validation accepts all CONSTITUTIONAL_LEGAL_VALUES", () => {
  it("no CONSTITUTIONAL_LEGAL_VALUES entry triggers INVALID_CONSTITUTIONAL_VALUE", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-LEGAL-VALUES-VALIDATION",
    }).serializeSave().simulation;

    const members = currentAssemblyMemberIds(world, state);
    const actor = members.find((id) => id !== player) ?? player;

    for (const ruleId of CONSTITUTIONAL_RULE_IDS) {
      const currentValue = state.provincialRuntime.constitutionalRules[ruleId]?.value;
      const legalValues = CONSTITUTIONAL_LEGAL_VALUES[ruleId];

      for (const proposedValue of legalValues) {
        const testState = structuredClone(state);
        const result = proposeConstitutionalAmendment(
          world,
          testState,
          actor,
          ruleId,
          proposedValue,
          null,
        );
        // The only acceptable errors are NO_POLICY_CHANGE (current === proposed)
        // or AMENDMENT_ALREADY_PENDING — never INVALID_CONSTITUTIONAL_VALUE.
        if ("error" in result) {
          expect(result.error.code).not.toBe("INVALID_CONSTITUTIONAL_VALUE");
          // If the value equals the current value, NO_POLICY_CHANGE is expected
          if (Math.abs((currentValue ?? -1) - proposedValue) < 0.000001) {
            expect(result.error.code).toBe("NO_POLICY_CHANGE");
          }
        }
      }
    }
  });

  it("an out-of-range value produces INVALID_CONSTITUTIONAL_VALUE", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-INVALID-VALUE",
    }).serializeSave().simulation;

    const result = proposeConstitutionalAmendment(
      world,
      state,
      player,
      "assembly_term_years",
      99, // not a legal value
      null,
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.code).toBe("INVALID_CONSTITUTIONAL_VALUE");
    }
  });

  it("proposeConstitutionalAmendment stores proposedText from the alternative", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-PROPOSED-TEXT",
    }).serializeSave().simulation;

    // Find a legal value that differs from the current assembly_term_years value
    const currentValue =
      state.provincialRuntime.constitutionalRules.assembly_term_years?.value ?? 4;
    const alternateValue = CONSTITUTIONAL_LEGAL_VALUES.assembly_term_years.find(
      (v) => Math.abs(v - currentValue) > 0.000001,
    )!;
    expect(alternateValue).toBeDefined();

    const result = proposeConstitutionalAmendment(
      world,
      state,
      player,
      "assembly_term_years",
      alternateValue,
      null,
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const expected = constitutionAlternativeFor("assembly_term_years", alternateValue);
    expect(expected).toBeDefined();
    expect(result.amendment.proposedText).toBe(expected!.proposedClauseText);
  });
});

// ─── 3. diffConstitutionalText ───────────────────────────────────────────────

describe("Phase 11.4 — diffConstitutionalText helper", () => {
  it("returns only 'same' segments for identical texts", () => {
    const text = "The ordinary term of the National Assembly is four years.";
    const segments = diffConstitutionalText(text, text);
    expect(segments.every((s) => s.kind === "same")).toBe(true);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("marks deleted words when text is shorter", () => {
    const current = "No person may be elected President more than two times.";
    const proposed = "No person may be elected President more than once.";
    const segments = diffConstitutionalText(current, proposed);

    const deleted = segments.filter((s) => s.kind === "del");
    const added = segments.filter((s) => s.kind === "add");

    expect(deleted.length).toBeGreaterThan(0);
    expect(deleted.some((s) => s.text.includes("two"))).toBe(true);
    expect(added.some((s) => s.text.includes("once"))).toBe(true);
  });

  it("marks added words when text is longer", () => {
    const current = "No limit on the number of times a person may be elected.";
    const proposed =
      "There is no constitutional limit on the number of times a person may be elected.";
    const segments = diffConstitutionalText(current, proposed);

    const added = segments.filter((s) => s.kind === "add");
    expect(added.length).toBeGreaterThan(0);
    // "There is no constitutional" are new words
    expect(added.some((s) => s.text.includes("There") || s.text.includes("constitutional"))).toBe(
      true,
    );
  });

  it("reconstruct: same+add texts join to proposed; same+del texts join to current", () => {
    const current =
      "Justices of the Constitutional Court serve non-renewable terms of nine years and may not thereafter be reappointed to that Court.";
    const proposed =
      "Justices of the Constitutional Court serve non-renewable terms of fifteen years and may not thereafter be reappointed to that Court.";
    const segments = diffConstitutionalText(current, proposed);

    // same + del reconstruct to current
    const reconstructCurrent = segments
      .filter((s) => s.kind === "same" || s.kind === "del")
      .map((s) => s.text)
      .join("");
    expect(reconstructCurrent).toBe(current);

    // same + add reconstruct to proposed
    const reconstructProposed = segments
      .filter((s) => s.kind === "same" || s.kind === "add")
      .map((s) => s.text)
      .join("");
    expect(reconstructProposed).toBe(proposed);
  });

  it("adjacent segments of the same kind are merged (no single-token runs of the same kind)", () => {
    const current = "The Assembly serves for four years.";
    const proposed = "The Assembly serves for six years.";
    const segments = diffConstitutionalText(current, proposed);

    // Check that no two consecutive segments share the same kind
    for (let index = 1; index < segments.length; index++) {
      expect(segments[index]!.kind).not.toBe(segments[index - 1]!.kind);
    }
  });

  it("real alternative clause diff: assembly_term_years 4→6 yields minimal word changes", () => {
    const altFour = constitutionAlternativeFor("assembly_term_years", 4)!;
    const altSix = constitutionAlternativeFor("assembly_term_years", 6)!;
    expect(altFour).toBeDefined();
    expect(altSix).toBeDefined();

    const segments = diffConstitutionalText(altFour.proposedClauseText, altSix.proposedClauseText);

    // "four" should be deleted, "six" should be added
    const deleted = segments.filter((s: DiffSegment) => s.kind === "del");
    const added = segments.filter((s: DiffSegment) => s.kind === "add");
    expect(deleted.some((s) => s.text.includes("four"))).toBe(true);
    expect(added.some((s) => s.text.includes("six"))).toBe(true);

    // The bulk of the text should be unchanged
    const sameChars = segments
      .filter((s: DiffSegment) => s.kind === "same")
      .reduce((sum, s) => sum + s.text.length, 0);
    const totalChars = altFour.proposedClauseText.length;
    expect(sameChars / totalChars).toBeGreaterThan(0.8);
  });
});

// ─── 4. presidential_term_limit === 0 → unlimited ──────────────────────────

describe("Phase 11.4 — presidential_term_limit 0 means unlimited in eligibility", () => {
  it("a politician with many terms served remains eligible when term limit is 0", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-UNLIMITED-TERMS",
    }).serializeSave().simulation;

    // Set the constitutional rule to 0 (no term limit)
    state.provincialRuntime.constitutionalRules.presidential_term_limit!.value = 0;

    // Simulate the player having served many terms
    state.presidential.electedTermCountByPolitician[player] = 10;

    // Ensure the player is alive and eligible in all other respects
    state.politicians[player]!.alive = true;
    state.politicians[player]!.retired = false;

    const evaluation = evaluatePresidentialEligibility(world, state, player);

    // With term limit 0, the term-count check must not trigger ineligibility
    expect(evaluation.reasons).not.toContain(expect.stringContaining("Term limit reached"));
    // May still be ineligible for other reasons (age, office holds, etc.) but not term count
    if (!evaluation.eligible) {
      expect(evaluation.code).not.toBe("PRESIDENTIALLY_INELIGIBLE");
    }
    // Alternatively: simply assert no term-limit reason appears
    expect(evaluation.reasons.some((r) => r.includes("Term limit reached"))).toBe(false);
  });

  it("term limit 2 still blocks a politician with 2 elected terms (regression check)", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-TERM-LIMIT-2",
    }).serializeSave().simulation;

    // Restore the default constitutional term limit
    state.provincialRuntime.constitutionalRules.presidential_term_limit!.value = 2;
    state.presidential.electedTermCountByPolitician[player] = 2;
    state.politicians[player]!.alive = true;
    state.politicians[player]!.retired = false;

    const evaluation = evaluatePresidentialEligibility(world, state, player);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons.some((r) => r.includes("Term limit reached"))).toBe(true);
    expect(evaluation.reasons.some((r) => r.includes("2 of 2"))).toBe(true);
  });

  it("term limit 1 blocks after 1 elected term (regression: existing phase11_3 behavior)", () => {
    const world = loadTerenaWorld();
    const player = startingHolder(world, "assembly_member");
    const state = createSimulation({
      world,
      playerPoliticianId: player,
      seed: "P114-TERM-LIMIT-1",
    }).serializeSave().simulation;

    state.provincialRuntime.constitutionalRules.presidential_term_limit!.value = 1;
    state.presidential.electedTermCountByPolitician[player] = 1;
    state.politicians[player]!.alive = true;
    state.politicians[player]!.retired = false;

    const evaluation = evaluatePresidentialEligibility(world, state, player);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons.some((r) => r.includes("1 of 1"))).toBe(true);
  });
});
