# Lorsain Political Simulator — Phase 0.5 Complete

This repository holds the **canonical content foundation** and the **TypeScript monorepo** for a single-player political simulation set in Lorsain / Terena.

## Status

**Phase 0 (hardened) and Phase 0.5 (election-math) are complete.** Next: Phase 0b (canonical roster / 2026 archive / electorate) — not started.

## Canonical lock

- Content version: **0.2.0-predev**
- Scenario: **TERENA_2028** (1 January 2028)
- Country: **Republic of Terena** (`TER` / world `W41` / SVG `TERENA`)
- RNG: **xoshiro128**** with cyrb128 stream seeding (no `Math.random()` in sim)
- Counting: **`@lorsain/election-math`** (exact rationals, IRV, STV Droop+WIG)

## Repository layout

- `data/`, `maps/`, `docs/`, `scripts/`, `source/azgaar/` — approved locations
- `apps/game` — UI host scaffold
- `packages/sim`, `content-schema`, `content-loader`, `map`, `election-math`, `testing`

### Package consumption convention

Built packages export **`dist/`** via `package.json` `exports`.  
Vitest aliases map `@lorsain/*` to `src/` for unit tests.  
CI runs `pnpm build` before tests so dist smoke tests pass.  
`@lorsain/content-loader` is browser-safe; use `@lorsain/content-loader/node` for filesystem loading.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm validate:content
pnpm validate:python   # requires real Python 3
```

## Phase order (locked)

0 (complete) → **0.5 election-math (complete)** → **0b content (next)** → 1 kernel → 2 NPCs → …
