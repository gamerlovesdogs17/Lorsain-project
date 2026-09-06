# Phase 11.4 QA evidence

Capture script: `scripts/phase11_4-capture-screenshots.mjs`

Output directory: `docs/qa/phase11_4/final/`

## Screenshot inventory (25 captures)

All screenshots captured at 1440 × 900 (desktop) unless noted.

### Title & Home

| File | Description | Viewport |
|---|---|---|
| `title-1440.png` | Title / splash screen | 1440 × 900 |
| `home-desk-1440.png` | Home dashboard (desktop) | 1440 × 900 |
| `home-900.png` | Home dashboard (narrow) | 900 × 900 |
| `home-390.png` | Home dashboard (mobile) | 390 × 844 |

### Game shell & screens

| File | Description |
|---|---|
| `shell-1440.png` | Game shell frame |
| `campaign-hq-1440.png` | Campaign HQ (active-campaign fixture) |
| `elections-1440.png` | Elections screen (National Assembly tab, 2030 cycle) |
| `election-night-1440.png` | Election Night replay |
| `assembly-1440.png` | Assembly overview |
| `news-front-1440.png` | News front page |
| `history-wiki-1440.png` | History / archive wiki |
| `party-1440.png` | Party screen |
| `organizations-1440.png` | Organizations screen |
| `courts-1440.png` | Courts screen |
| `economy-1440.png` | Economy screen |
| `map-1440.png` | Terena map |

### Constitution browser

| File | Description |
|---|---|
| `constitution-1440.png` | Constitution browser (Law & Constitution tab) |
| `constitution-article-vii-1440.png` | Article VII — Elections & Political Parties |
| `constitution-one-party-1440.png` | One-party system alternative preview |
| `constitution-diff-1440.png` | Constitutional redline diff |
| `constitution-article-xii-1440.png` | Article XII — Amendment Process |
| `constitution-package-1440.png` | Multi-change package staging |

### Bill builder

| File | Description |
|---|---|
| `bill-builder-1440.png` | Bill Introduce tab |
| `bill-builder-categorical-1440.png` | Categorical provision selection |
| `bill-builder-complex-1440.png` | Complex bill with multiple provisions |

## Screenshot status

These screenshots exist from a **prior capture run** and were NOT regenerated during the 2026-09-05 closeout pass because no Vite dev server was available. They should be regenerated against the final committed HEAD before acceptance.

## News repetition audit (PRIORITY 9)

- Summary: `docs/qa/phase11_4/news-repetition-audit.md`
- JSON: `docs/qa/phase11_4/repetition-audit.json`

Regenerated: 2026-09-06 (current working tree)

| Metric | Value |
|---|---:|
| Total stories (36 months) | 340 |
| Unique exact | 177 |
| Recent-window (8) exact dupes | 3 |
| Banned narrative fragments | 0 |

```bash
node "node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/cli.mjs" scripts/phase11_4-repetition-audit.mjs
```

## Policy effects audit

- JSON: `docs/qa/phase11_4/policy-effects-audit.json`

Regenerated: 2026-09-06 (current working tree)

| Metric | Value |
|---|---:|
| Total options | 226 |
| Proposal options | 176 |
| Runtime coverage | 176/176 (100%) |

```bash
node scripts/audit-policy-effects.mjs
```

## How to regenerate screenshots

```bash
# terminal A — start the dev server
npm run --filter @lorsain/game dev
# or: cd apps/game && npm run dev

# terminal B — run capture (adjust port/base if needed)
set QA_BASE_URL=http://localhost:5174/Lorsain-project/
node scripts/phase11_4-capture-screenshots.mjs
```

The capture script uses Playwright (headless Chromium) and deterministic QA fixtures (`qaFixture`, `qaScreen`, `qaPlayer` URL params). It waits for the `#lorsain-browser-qa-state[data-ready="true"]` element before each screenshot.

Review screenshots for clipping, hierarchy, map selection, and old/new design mismatch before accepting.

## How to regenerate audits

```bash
# Policy effects (pure static analysis — no server needed)
node scripts/audit-policy-effects.mjs

# Repetition audit (runs 36-month simulation)
node "node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/cli.mjs" scripts/phase11_4-repetition-audit.mjs
```

## Phase 11.4 tests

```bash
npx vitest run "packages/sim/src/phase11_4" --reporter=verbose
```

Last run: **89 passed** across 8 test files (2026-09-05 working tree).
