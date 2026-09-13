# Phase 17C — runtime balance measurement

Multi-seed **integrated Terena** runs with structured stats from `SimState.history`, `mediaRuntime`, scandal/court/foreign runtimes, and `history15` government records. Outputs are **informational** (diagnostic flags do not fail CI).

## Quick start

```bash
pnpm build
node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/phase17c-balance-run.ts
```

Defaults: **3 seeds × 10 years**, player `NPC146`, seeds named `phase17c-00` … `phase17c-02`.

### Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--seeds=N` | 3 | Number of seeds (max 24) |
| `--years=Y` | 10 | Simulated years per seed (max 25) |
| `--seed-prefix=NAME` | `phase17c` | Seed prefix (`NAME-00`, …) |
| `--shard=I` | — | Shard index for parallel CI |
| `--shard-count=N` | 1 | Total shards (use with `--shard`) |
| `--aggregate` | — | Merge `seeds/*.json` into aggregate JSON + MD |

Examples:

```bash
# 5 seeds, 12 years
node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/phase17c-balance-run.ts --seeds=5 --years=12

# Parallel shards (run 3 jobs, then aggregate)
node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/phase17c-balance-run.ts --seeds=9 --years=10 --shard=0 --shard-count=3
node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/phase17c-balance-run.ts --aggregate --years=10
```

## Outputs

| Path | Description |
|------|-------------|
| `docs/qa/phase17c/seeds/<seed>.json` | Per-seed `phase17c-runtime-balance/v1` report |
| `docs/qa/phase17c/runtime-balance-report.json` | Aggregate (includes full per-seed reports) |
| `docs/qa/phase17c/runtime-balance-summary.md` | Human-readable rollup |

## Report contents (collector)

Implemented in `packages/sim/src/balance/runtimeReport.ts` (`buildRuntimeBalanceReport`):

- History event counts by **type** and coarse **category** (legislation, government, elections, scandal, court, province, foreign, implementation, economy)
- Media / news composition, headline families, repetition metrics (exact / structural / 8-month window)
- Template catalogs: executive situations, scandal types, campaign situations — fired counts, never-fired, possibly-never-eligible (heuristic via cooldown registry)
- Actor concentration (scandal targets, cabinet-related actors)
- Party and province concentration from history payloads
- Government duration, coalition form/break, cabinet reshuffles (`history15` + history)
- Scandal outcomes and stages from `politicsRuntime.scandals`
- Court decision frequency and disposition payload breakdown
- Foreign crises (themes), treaties, treaty/crisis history types
- **Diagnostic flags** (informational)

## Diagnostic flag codes (sample)

| Code | Typical meaning |
|------|-----------------|
| `NEWS_LEGISLATION_DOMINANCE` | Bill/enactment headline families > ~35% of stories |
| `SCANDAL_SPAM` / `SCANDAL_DROUGHT` | Scandal history rate high or very low |
| `EXECUTIVE_SITUATION_CLUSTER` | One executive template dominates fires |
| `MEDIA_RECENT_DUPLICATE_PRESSURE` | Elevated 8-headline-window exact dupes |
| `GOVERNMENT_VERY_STABLE` / `GOVERNMENT_HIGH_CHURN` | Closed government term length extremes |
| `COALITION_CHURN` | Many coalition form/break events |
| `PROVINCE_MEDIA_NEGLECT` | Low province share in news composition |
| `ACTOR_SCANDAL_CONCENTRATION` | One politician dominates scandal targets |
| `HISTORY_TYPE_DOMINANCE` | Single history type > ~25% of events |
| `FOREIGN_CRISIS_THEME_FLAT` | All crises share one theme label |

## GitHub Actions

Workflow: [`.github/workflows/phase17c-balance.yml`](../../../.github/workflows/phase17c-balance.yml)

- **Manual** (`workflow_dispatch`) with optional seed/year inputs
- **Scheduled** monthly
- **Not** wired into normal CI or Integration workflows
- Three parallel shards + aggregate job (same pattern as Phase 15 extended certification)

## Related tooling

- Static catalog repetition: `node scripts/phase17b-content-report.mjs`
- 36-month media baseline: `docs/qa/phase11_4/repetition-audit.json` (`phase11_4-repetition-audit.mjs`)
- Inventory / tuning targets: [`docs/qa/phase17c-inventory.md`](../phase17c-inventory.md)

## Unit test

Fast Vitest coverage (24-month smoke, not 10y):

```bash
pnpm test packages/sim/src/balance/runtimeReport.test.ts
```
