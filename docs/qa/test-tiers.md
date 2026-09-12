# Test architecture tiers (Phase 17A)

## Tier 1 — Normal Push CI (`.github/workflows/ci.yml`)

Runs on every push/PR:

- build, typecheck, lint, format
- `pnpm test:fast` (honest Vitest wrapper)
- content validation
- **5-year world smoke** (`pnpm test:smoke`)
- Integration suite (`pnpm test:integration`)

Does **not** run 25/50/100-year certification.

Target: minutes, not hours.

## Tier 2 — Extended Validation (`.github/workflows/extended-validation.yml`)

Triggers:

- `workflow_dispatch` (manual)
- weekly schedule (Sunday 06:00 UTC)

Matrix: `CERT-25-A`, `CERT-25-B` (independent shards) + aggregate audit.

## Tier 3 — Release Certification (`.github/workflows/certification.yml`)

Trigger: **manual only** (`workflow_dispatch`).

Matrix: 3×25 + 2×50 + 1×100 shards + aggregate.

Use for milestones, betas, release candidates, major simulation architecture changes.

## Honest Vitest wrapper

`scripts/run-vitest-honest.mjs` + `scripts/vitest-honest-classify.mjs`:

- strips ANSI before classification
- may exit 0 for known `[vitest-worker]: Timeout calling "onTaskUpdate"` **only** when all real tests passed and no TypeError / unhandled rejection / assertion failure
- never reintroduces `dangerouslyIgnoreUnhandledErrors`
