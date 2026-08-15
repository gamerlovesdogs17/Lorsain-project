# Lorsain Political Simulator — Phase 0b Complete

This repository holds the **canonical content foundation** and TypeScript monorepo for a single-player political simulation set in Lorsain / Terena.

## Status

**Phase 0b complete; Phase 1 next.** Phase 1 (simulation kernel) — not started.

## Canonical lock

- Content version: **0.3.0-predev**
- Scenario: **TERENA_2028** (1 January 2028)
- Country: **Republic of Terena** (`TER` / world `W41` / SVG `TERENA`)
- RNG: **xoshiro128**** with cyrb128 stream seeding (no `Math.random()` in sim)
- Counting: **`@lorsain/election-math`** (exact rationals, IRV, STV Droop+WIG)
- Starting roster: **530** politicians including **420** Assembly MPs
- Historical Assembly: **2026 STV archive** (48 constituencies)

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
pnpm validate:phase0b:recount
pnpm validate:python   # requires real Python 3
pnpm generate:phase0b  # development-only; outputs are committed canonical JSON
```

## Phase order (locked)

0 → 0.5 election-math → **0b content (complete)** → **1 kernel (next)** → 2 NPCs → …
