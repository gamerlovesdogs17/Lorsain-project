# Test architecture tiers (Phase 17A.2)

## Tier 1 — Normal Push CI (`.github/workflows/ci.yml`)

Runs on every push/PR. Target: **~5–10 minutes** (hard ceiling well under 30).

### Quality

- build, typecheck, lint, format
- `pnpm test:fast` (honest Vitest wrapper; excludes heavy suites)
- content validation (TS + Python)
- **2-year world smoke** (`pnpm test:smoke`, ~1 min) — catastrophic breakage only
  (default 1–2y after nomination-field fix; use `--years=5` locally for longer election-cycle checks)

### Integration (`pnpm test:integration`)

Targeted correctness only:

- `foreign.commands.test.ts` (cheap foreign command/seed checks)
- Terena integration
- Phase 11.2 / 11.3 institutional suites
- campaigns.vertical, legislature.vertical
- dist-exports smoke

Does **not** run:

- full `foreign.test.ts` / `foreign.determinism.test.ts` (long-horizon)
- `phase11.integration.test.ts` / `phase11.closeout.test.ts` / `playable-path.test.ts`
- 25 / 50 / 100-year certification shards
- 10,000 synthetic-election acceptance
- election performance benchmarks
- Phase 12 autonomous multi-month audits
- Phase 15 long-run / multi-seed audits
- agents / parties / election-math performance suites

## Tier 2 — Extended Validation (`.github/workflows/extended-validation.yml`)

Triggers:

- `workflow_dispatch` (manual)
- weekly schedule (Sunday 06:00 UTC)

Contents:

1. **`pnpm test:extended`** — expensive Vitest acceptance:
   - `foreign.test.ts` / `foreign.determinism.test.ts`
   - `phase11.integration.test.ts` / `phase11.closeout.test.ts` / `playable-path.test.ts`
   - `elections.test.ts` (incl. 10k synthetic acceptance + perf)
   - `campaigns.realism.test.ts`
   - `phase12.autonomous-audit.test.ts`
   - `phase15.longrun.test.ts` / `phase15.multiseed.test.ts`
   - agents / parties / election-math performance
2. **2 × 25-year cert shards** (`CERT-25-A`, `CERT-25-B`) + aggregate audit

## Tier 3 — Release Certification (`.github/workflows/certification.yml`)

Trigger: **manual only** (`workflow_dispatch`).

Matrix: 3×25 + 2×50 + 1×100 shards + aggregate.

Use for milestones, betas, release candidates, major simulation architecture changes.

## Honest Vitest wrapper

`scripts/run-vitest-honest.mjs` + `scripts/vitest-honest-classify.mjs`:

- prefers machine-readable JSON completion counts when available
- strips ANSI before text classification
- may exit 0 for known `[vitest-worker]: Timeout calling "onTaskUpdate"` **only when**
  - all expected test files completed (completed === total)
  - all expected tests completed (completed === total)
  - zero failed tests / files
  - exactly one recognized infrastructure error
  - no TypeError / unhandled rejection / assertion failure
- never reintroduces `dangerouslyIgnoreUnhandledErrors`
- incomplete suites (e.g. `Test Files 2 passed (17)`) **fail**
