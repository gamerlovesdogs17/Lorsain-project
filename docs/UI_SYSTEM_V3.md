# Lorsain UI System V3 (Phase 9.5)

Phase 9.5 shifts the interface from an internal admin dashboard toward a **political simulation game**: briefing-first home, grouped navigation, campaign command center, politician identity cards, and player-safe presentation helpers.

Design references (layout inspiration only — no copied assets):

- Power Play USA — political hierarchy, election presentation, activity awareness
- Battle for the Hill — candidate identity, map + side panel composition
- Pixel Bootstrap / Tabler — compact cards, badges, responsive shell patterns

## Principles

- **Government briefing + war room + election night + editorial press**
- Off-white (`#f3f0ea`) background, navy structure, thin borders, restrained radius
- System sans-serif for UI; serif (`.serif-head`) for lead headlines only
- **Never expose internal codes** (`PRESIDENTIAL_ELECTION_DUE`, rational vote strings)
- Information boundaries unchanged — no latent support, hidden traits, or debug numbers in normal play

## Player-safe presentation (`apps/game/src/presentation/display.ts`)

| Helper | Purpose |
| --- | --- |
| `interruptDisplay()` | Human-readable blocking-event copy |
| `formatPublicNumber()` | Integer vote totals (e.g. `6205093/1` → `6,205,093`) |
| `formatPublicPercent()` | Share percentages for election UI |
| `decisionDisplayLabel()` | Sanitize decision list labels |
| `relationshipPublicLabel()` | Organizations relationship wording |
| `billProgressIndex()` | Legislative pipeline step index |

Regression tests: `apps/game/src/presentation/display.test.ts`

## Application shell (`apps/game/src/ui/shell.tsx`)

Grouped navigation:

| Group | Screens |
| --- | --- |
| Overview | Home, Career |
| Politics | Party, Campaign, Elections |
| Government | Assembly, Executive, Courts |
| Society | Economy, Organizations, News |
| Reference | Map, Archive |

Top bar prioritizes **date**, **role**, **urgent count**, and **End Turn**. Save / Export live in a utility menu (⋮).

Responsive: drawer + hamburger below ~900px; tested breakpoints 390 / 600 / 900 / desktop.

## Reusable components

### Kit (`apps/game/src/ui/kit.tsx`)

V2 components retained. V3 additions:

- `LeadStory` — dominant briefing headline
- `ActivityFeedItem` — compact chronological feed row
- `BillProgressTrack` — Introduced → Committee → Floor → Passed → Executive → Enacted

### Politician identity (`apps/game/src/ui/politician.tsx`)

- `PoliticianAvatar` — letter avatar with party accent (portrait hook for future art)
- `PoliticianCard` — compact/selectable candidate row
- `PoliticianProfile` — dossier header for Career, Home, Campaign, Executive

### Map (`apps/game/src/map/TerenaMap.tsx`)

- **Hover** — temporary highlight + tooltip only (`onHover`)
- **Click** — persistent selection (`onSelect`)
- Selection stroke ~0.5 (not 0.9); province strokes stronger than constituency
- `MapLegend` — per-mode legend (`apps/game/src/ui/mapLegend.tsx`)

## Screen notes (Phase 9.5 — several of these were incomplete)

Phase 9.5 documented cabinet cards, a New Game card grid, and Archive “dev tools collapsed” as if they were finished. A later playtest showed they were not. **Phase 9.6 (`docs/UI_SYSTEM_V3_1.md`) is the honest completion record.** Do not treat the table below as the current running UI.

| Screen | V3 intent in 9.5 |
| --- | --- |
| Home | Political briefing: profile, lead story, urgent actions, situation metrics, activity feed |
| New Game | Politician card grid (not database rows) — still rendered the full 530-card wall |
| Campaign | Command center: ~60% map + side panel; actions open drawer |
| Elections | Tabs, candidate cards, formatted votes, RCV round list — presidential tab still used Assembly geography |
| Assembly | Bill progress track on selected legislation — overview was still a 420-square matrix |
| Executive | Intended presidential profile + cabinet cards — still a minister table with giant Dismiss buttons |
| Archive | Filter tabs; dev tools were still visible (collapsed) in ordinary play |
| Organizations | Human relationship labels (Neutral, Cordial, Hostile, …) |

## Tokens (CSS)

Defined in `apps/game/src/styles.css`:

- Spacing scale `--space-1` … `--space-5`
- `--navy`, `--paper`, `--line`, `--warn`
- Button variants: primary, secondary, danger, quiet, disabled
- Card types: identity, action drawer, briefing, election result, politician card

## Phase boundary

Phase 9.5 is **UI/UX only**. Simulation rules, save schema v9, determinism, and information boundaries are unchanged. Phase 10 (foreign affairs) is out of scope.

**Superseded for current UI truth by Phase 9.6:** `docs/UI_SYSTEM_V3_1.md`.

