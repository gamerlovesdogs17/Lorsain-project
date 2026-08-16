# Lorsain Political Simulator — Phase 4 Electorate and General Elections

This repository holds the **canonical content foundation** and TypeScript simulation kernel for a single-player political simulation set in Lorsain / Terena.

## Status

**Phase 0, 0.5, and 0b are complete/canonical. Phase 1 kernel (`b158271`) and Phase 1.1 integrity hardening (`1c7b079`) are complete. Phase 2 politician-agent substrate is complete at `c43c0fb`. Phase 3 parties/factions/nominations is COMPLETE at `dc9ea2d`. Phase 4 electorate/support/polling/turnout/formal general elections is COMPLETE. Phase 5 (campaign actions) has not started. Known nonblocking leftovers: `docs/KNOWN_ISSUES.md`.**

## Canonical lock

- Content version: **0.3.1-predev** (Phase 0b political world canonized at `7e94984` as `0.3.0-predev`; this patch adds calendars, offices, and succession)
- Save schema version: **4** (independent of contentVersion and npm package versions; v1→v2→v3→v4 migrate)
- Scenario: **TERENA_2028** (1 January 2028)
- Country: **Republic of Terena** (`TER` / world `W41` / SVG `TERENA`)
- RNG: **xoshiro128**** with cyrb128 stream seeding (no host PRNG in sim)
- Counting: **`@lorsain/election-math`** (exact rationals, IRV, STV Droop+WIG)
- Starting roster: **530** politicians including **420** Assembly MPs
- Historical Assembly: **2026 STV archive** (48 constituencies)
- Canonical AI tiers: **rich 316 / standard 207 / light 7**

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

0 → 0.5 election-math → **0b content (canonical)** → **1 kernel (`b158271`)** → **1.1 save/state integrity (`1c7b079`)** → **2 politician agents (`c43c0fb`)** → **3 parties/factions/nominations (`dc9ea2d`)** → **4 electorate / polls / general elections (complete)** → 5 campaign actions → …

**Phase 4** owns the public electorate: voter blocs, underlying support, public candidate standing, polls, turnout, and formal presidential RCV / Assembly STV counts. **Phase 5** will own campaign activity that changes that standing (fundraising, ads, field, travel, debates, attacks, dropout). Do not collapse the layers.
