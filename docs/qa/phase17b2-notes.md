# Phase 17B.2 — pass notes

**Date:** 2026-09-12  
**Scope:** Repetition tooling, media structural variety, QA inventory prep (no Government redesign, no full CI).

## What changed

### Machine-readable repetition report

- Upgraded `scripts/phase17b-content-report.mjs` to emit:
  - **Console summary** of catalog counts
  - **`docs/qa/phase17b-repetition-report.json`** — per-category totals, mechanical-pattern clusters (trigger/actions/effects heuristics from compiled catalogs + source parses), `LIKELY_RESKIN_CLUSTER` flags, and `OVERREPRESENTED` dominance notes
  - **`docs/qa/phase17b-repetition-report.md`** — brief human scan of the same signals
- Report is **informational only** (no balance threshold exits).

### Media / news variety (existing engine)

- **`packages/sim/src/media/monthly.ts`**
  - Higher **pool importance floors** for routine bill pipeline events (`BILL_INTRODUCED`, `BILL_PASSED`, `LAW_ENACTED`).
  - **Score adjustments** down-rank low-significance enactments and procedural bills; modest boost for executive situations, scandals, and foreign crisis beats.
- **`packages/sim/src/media/articleBody.ts`**
  - Primary narrative shapes: **straight, conflict, accountability, analysis, reaction, legal, diplomatic** (legacy shapes retained for saves).
  - `articleStructureFor` now biases shape selection by **`factEventType` + category** when stories are minted.

### Tests

- `packages/sim/src/phase11_4.content.test.ts` — article-structure test updated for event-type-aware shapes (expects ≥5 primary shapes in a mixed fixture loop).

## Content domains (inherits parent + prior waves)

This pass did **not** add new scandal/fiscal/resource catalogs; it assumes Wave 1–2 and parent-agent work on:

- Executive situations, scandals, crisis packages, org/caucus templates, courts doctrine, provisions/interactions.

## How to run

```bash
pnpm --filter @lorsain/sim build
node scripts/phase17b-content-report.mjs
```

## Follow-ups (Phase 17C)

See `docs/qa/phase17c-inventory.md` for ranked balance/repetition targets and long-run validation questions.
