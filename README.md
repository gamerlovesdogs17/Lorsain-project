# Lorsain Political Simulator — Phase 7.1 First Playtest UX (COMPLETE)

This repository holds the **canonical content foundation**, TypeScript simulation kernel, and playable React game for a single-player political simulation set in Lorsain / Terena.

## Status

**Phase 0, 0.5, and 0b are complete/canonical. Phase 1 kernel (`b158271`) and Phase 1.1 integrity hardening (`1c7b079`) are complete. Phase 2 politician-agent substrate is complete at `c43c0fb`. Phase 3 parties/factions/nominations is COMPLETE at `dc9ea2d`. Phase 4 electorate/support/polling/turnout/formal general elections is COMPLETE at `1352dc4`. Phase 5 campaign simulation is COMPLETE at `e3a6aae`. Phase 6 legislature is COMPLETE at `3c976fa`. Phase 7 Executive + Playable UI is COMPLETE at `90b54d4`. Phase 7.1 First Playtest UX is COMPLETE. Blockers vs backlog: `docs/KNOWN_ISSUES.md`.**

## Canonical lock

- Content version: **0.3.1-predev** (Phase 0b political world canonized at `7e94984` as `0.3.0-predev`; this patch adds calendars, offices, and succession)
- Save schema version: **7** (independent of contentVersion and npm package versions; v1→v2→v3→v4→v5→v6→v7 migrate)
- Scenario: **TERENA_2028** (1 January 2028)
- Country: **Republic of Terena** (`TER` / world `W41` / SVG `TERENA`)
- RNG: **xoshiro128**** with cyrb128 stream seeding (no host PRNG in sim)
- Counting: **`@lorsain/election-math`** (exact rationals, IRV, STV Droop+WIG)
- Starting roster: **530** politicians including **420** Assembly MPs
- Historical Assembly: **2026 STV archive** (48 constituencies)
- Canonical AI tiers: **rich 316 / standard 207 / light 7**

## Play the game

```bash
pnpm install
pnpm game
```

Windows: double-click `start-game.bat`. The app is served at `http://localhost:5173`.

```bash
pnpm game:build                 # production build of apps/game
pnpm --filter @lorsain/game dev # same as pnpm game
```

New Game → choose a politician (search/party filters; public office/biography only) → January 2028 dashboard → End Turn. All gameplay mutations go through `@lorsain/sim` commands. Browser saves use IndexedDB; Export/Import uses the same schema/migration path as Node. Canonical `data/` and `maps/` load through a browser-safe Vite glob — not Node `fs` and not a second copy of canon.

## Repository layout

- `data/`, `maps/`, `docs/`, `scripts/`, `source/azgaar/` — approved locations
- `apps/game` — React 19 + Vite playable UI (`@lorsain/game`)
- `packages/sim`, `content-schema`, `content-loader`, `map`, `election-math`, `testing`

### Package consumption convention

Built packages export **`dist/`** via `package.json` `exports`.  
Vitest aliases map `@lorsain/*` to `src/` for unit tests.  
CI runs `pnpm build` before tests so dist smoke tests pass.  
`@lorsain/content-loader` is browser-safe; use `@lorsain/content-loader/node` for filesystem loading. The game never imports `@lorsain/content-loader/node`.

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
pnpm game
pnpm game:build
```

## Phase order (locked)

0 → 0.5 election-math → **0b content (canonical)** → **1 kernel (`b158271`)** → **1.1 save/state integrity (`1c7b079`)** → **2 politician agents (`c43c0fb`)** → **3 parties/factions/nominations (`dc9ea2d`)** → **4 electorate / polls / general elections (`1352dc4`)** → **5 campaign simulation (`e3a6aae`)** → **6 legislature (`3c976fa`)** → **7 executive + playable UI (`90b54d4`)** → **7.1 first playtest UX (COMPLETE)** → 8 courts → 9 economy/organizations/media → 10 foreign affairs → 11 final integration + UI polish + balance + content.

**Phase 4** owns the public electorate: voter blocs, underlying support, public candidate standing, polls, turnout, and formal presidential RCV / Assembly STV counts. **Phase 5** owns campaign activity that changes that standing. **Phase 6** owns the Assembly. **Phase 7** owns executive government and the first playable React UI. **Phase 7.1** turns those engine controls into understandable player controls (no silent omitted votes, campaign/policy forms, human-readable names). Phase 8 courts have not started. The old separate Phase 12 full UI / Phase 13 balance roadmap is superseded; Phase 11 absorbs those final tasks.
