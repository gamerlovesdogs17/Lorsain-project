# Phase 17C final closeout (2026-09-13)

**Run id:** `phase17c-final-20260913`  
**Matrix:** 3 × 10 years  
**Output:** `docs/qa/phase17c/final/` (mirrored aggregate at `docs/qa/phase17c/runtime-balance-report.json`)

## Patches closed in this pass

### Scandals
- Suspended / duties-restricted ministers restore via `MINISTER_DUTIES_RESTORED` when cleared and no replacement occupies the office.
- Replacement ends the restricted term; clearance does not resurrect the former minister.
- Fixtures E/F in `phase17c.truthfulness.test.ts`.

### Courts
- Doctrine counts from authoritative `courtDecisions` (`constitutionalRule`, case types, precedent treatments).
- Diagnostic `COURT_DOCTRINE_DOMINANCE`.
- Uphold bias: stronger case merits for emergencies/major regs/laws; judicial vote institutionalism/precedent lock-in softened (no outcome quota).
- Deterministic weak→uphold / strong→invalidate fixtures in `phase17c.court-balance.test.ts`.

### Foreign
- Contextual theme weights (neighbors can still produce trade/cyber/consular themes).
- Diagnostic `FOREIGN_CRISIS_THEME_DOMINANCE` at ≥55% share.

### Aggregation
- `--run-id`, `--outdir=final|tuning`, `--expected-seeds`; non-matching shards ignored/rejected.
- Tuning shards removed from authoritative `seeds/` (experiments under `tuning/`, gitignored).

### Hygiene
- `docs/qa/phase15/smoke-audit.json` gitignored (transient).

## Acceptance

Mark **COMPLETE** after final matrix lands without serious frozen/chaotic patterns and with rare-but-possible invalidation plus usable doctrine reporting.
