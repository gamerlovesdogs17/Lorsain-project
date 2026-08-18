# Lorsain UI System V2 (Phase 9)

Design references (layout inspiration only — no copied assets, CSS, or HTML):

- Pixel Bootstrap 5 docs — sidebar + tab navigation, cards, dense forms
- Power Play USA / Battle for the Hill marketing — election map + side information density
- A House Divided — dossier concept (public facts only; no hidden NPC traits)

## Principles

- **Government briefing + political dashboard + election analysis + serious newspaper**
- Off-white background, charcoal/navy structure, canonical party colors, thin borders
- **System sans-serif** for navigation, buttons, forms, tables, statistics (`system-ui` stack)
- **Serif only** for editorial headlines (`.serif-head`) — major news, election-night headers

## Reusable components (`apps/game/src/ui/kit.tsx`)

| Component | Role |
| --- | --- |
| `PageHeader` | Screen title + kicker + optional actions |
| `EntityHeader` | Politician/entity dossier header with avatar placeholder |
| `SectionCard` | Bordered content section |
| `StatCard` / `MetricStrip` | Compact KPI row |
| `TabBar` | Section tabs (Career, Assembly, Terena map modes, News filters) |
| `DashboardLayout` / `RightRail` | Main + contextual side rail |
| `NewsItem` | Structured press item |
| `EmptyState` | Information-boundary-safe empty copy |
| `ActionPanel` | Bounded player interaction cluster |

## Application shell

- Persistent **left navigation** with Phase 9 pages: Economy, Organizations, News
- **Top bar**: date, player, office, decision count, Save, End Turn
- Target resolutions: **1280×720** and **1920×1080** (`dash-2` two-column layout; mobile stack)

## Map architecture

- **Authoritative geometry**: `data/terena_provinces.geojson`, `data/terena_constituencies.geojson`, `data/terena_cities.json`
- **Runtime renderer**: `<TerenaMap />` in `apps/game/src/map/TerenaMap.tsx` — React-owned SVG paths via `@lorsain/map`
- **Reference only**: `maps/terena_game_map.svg`, `maps/terena_detailed.svg`, Azgaar material — cartographic authoring, **not** injected at runtime
- **Modes**: political, election, campaign, economy, organizations
- **Information boundaries**: election/campaign maps use polls, sitting MPs, player-known org — never latent voter support

## Phase 9 pages

- **Home** — briefing dashboard (metrics, press, decisions rail)
- **Economy** — normalized indices (Jan 2028 = 100), regional map, sectors
- **Organizations** — canonical directory + dossier + bounded player interactions
- **News** — structured stories from real `SimEvent`s, outlet filters
