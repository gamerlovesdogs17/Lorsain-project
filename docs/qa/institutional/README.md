# Institutional completion QA screenshots

Capture script: `scripts/phase16b-capture-screenshots.mjs`

Output: `docs/qa/institutional/final/`  
Manifest: `docs/qa/institutional/manifest.json`

Requires Vite at `http://localhost:5174/Lorsain-project/` (override with `QA_BASE_URL`).

## Assert-before-capture

Every PNG is written only after positive DOM assertions pass. Negative checks reject wrong screens (e.g. Archive on Settings). Duplicate `sha256` across distinct shots fails the run.

## Critical vs optional

**Critical (fail the run if unproven):**

- `settings-page-1440.png` / `settings-debug-off-1440.png` (title → Settings)
- `legislation-list-1440.png`
- `selected-bill-1440.png` (inspector in viewport, not bottom-dock pattern)

**Optional (WARN + skip write if fixture cannot prove):** assembly overview, committees, whip desk, party leadership qualitative shares, FA overview single nav, mobile assembly.

## Run

```bash
node scripts/phase16b-capture-screenshots.mjs
```
