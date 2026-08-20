# Lorsain Political Simulator — Phase 10 Foreign Affairs

This repository holds the **canonical content foundation**, TypeScript simulation kernel, and playable React game for a single-player political simulation set in Lorsain / Terena.

## Status

**Phase 0–9.6 COMPLETE. Phase 10 Foreign Affairs COMPLETE.** Current UI truth: `docs/UI_SYSTEM_V3_1.md`. Foreign affairs design: `docs/FOREIGN_AFFAIRS_SYSTEM.md`. Blockers vs backlog: `docs/KNOWN_ISSUES.md`.

## Canonical lock

- Content version: **0.3.1-predev**
- Save schema version: **10** (v1→…→v9→v10 migrate; Phase 10 adds `foreignAffairsRuntime`)
- Scenario: **TERENA_2028** (1 January 2028)
- Country: **Republic of Terena** (`TER` / world `W41` / SVG `TERENA`)
- Foreign leaders: **47** canonical starting leaders (`data/world_leaders.json`, stable `FLD_Wxx` IDs)
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

New Game → featured careers or search/filter the full 530 roster (public office/biography only) → January 2028 dashboard → End Turn. All gameplay mutations go through `@lorsain/sim` commands. Browser saves use IndexedDB; Export/Import uses the same schema/migration path as Node. Canonical `data/` and `maps/` load through a browser-safe Vite glob — not Node `fs` and not a second copy of canon.

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

0 → 0.5 election-math → **0b content (canonical)** → **1 kernel (`b158271`)** → **1.1 save/state integrity (`1c7b079`)** → **2 politician agents (`c43c0fb`)** → **3 parties/factions/nominations (`dc9ea2d`)** → **4 electorate / polls / general elections (`1352dc4`)** → **5 campaign simulation (`e3a6aae`)** → **6 legislature (`3c976fa`)** → **7 executive + playable UI (`90b54d4`)** → **7.1 first playtest UX (`670b38b`)** → **8 courts (`72733d4`)** → **9 economy/organizations/media + UI v2 + map (pending review)** → 10 foreign affairs → 11 final integration + UI polish + balance + content.

**Phase 4** owns the public electorate: voter blocs, underlying support, public candidate standing, polls, turnout, and formal presidential RCV / Assembly STV counts. **Phase 5** owns campaign activity that changes that standing. **Phase 6** owns the Assembly. **Phase 7** owns executive government and the first playable React UI. **Phase 7.1** turns those engine controls into understandable player controls (no silent omitted votes, campaign/policy forms, human-readable names). **Phase 8** owns the Constitutional Court, 252 confirmation, judicial review, impeachment 280 + Court judgment, and recall referral 252 + national vote. The old separate Phase 12 full UI / Phase 13 balance roadmap is superseded; Phase 11 absorbs those final tasks.
