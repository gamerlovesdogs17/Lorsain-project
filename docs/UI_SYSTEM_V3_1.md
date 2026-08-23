# Lorsain UI System V3.1 (Phase 9.6)

Phase 9.6 completes the V3 political-game presentation and fixes regressions found in a fresh manual playtest of Phase 9.5 (`887b500`). Simulation architecture is unchanged except for the Trade sector baseline formula (a real economy bug, not a UI-only issue).

Phase 9.5 work that remains:

- grouped navigation and responsive drawer
- End Turn priority in the top bar
- campaign action drawers and disabled actions at 0 remaining
- player-safe interrupt labels and integer vote formatting
- politician cards / profiles
- map hover is not persistent selection
- map legends
- information boundaries
- save schema 9

Phase 10 (foreign affairs) is **not** started.

## Honest screen inventory

This is what the running game actually shows after Phase 9.6 — not a design wish list.

| Screen | What exists now |
| --- | --- |
| New Game | Featured careers (~18 notable officeholders) plus search, party, office, and province filters, with pagination for the remaining roster. Ordinary MPs remain playable. |
| Home | Politician profile, urgent interrupt copy, required decisions, lead story from public event details when a bill/law title exists, Employment index (not unemployment), confidence delta with a dash at ~0. |
| Party | Party color banner, Assembly seat count, government/opposition, leader card, faction cards with chairs, nomination contests with candidate cards, recent public events, resolved-election lines. Does **not** show hidden faction utility. |
| Campaign | Command center: map + side panel. Below 900px the campaign panel (cash, field org, actions) is ordered above the map. Action drawers unchanged. |
| Elections | Presidential tab is national results/polls/RCV only — no Assembly incumbency map. Assembly tab uses sitting-seat geography plus public seat breakdown. Nominations are contest cards, not a map. Winner banner, first-preference labeled as not final-round, RCV chips. |
| Assembly | Default tab is Bills. Overview is a composition bar + grouped seat blocks with exact counts and majority threshold, not a 420-square matrix. |
| Executive | When the player is President: presidential profile, immediate business (sign/return, vacancies, emergencies), cabinet as politician cards with a contextual ⋯ dismiss menu, regulation and budget in drawers, compact budget table. Visiting as a non-president remains informational. Budget **rules** are unchanged. |
| Courts | Judge cards in a responsive grid. Nominations consume space only when pending. Docket and recent decisions follow. Empty nomination columns are not rendered. |
| Economy | Indicator tabs, a full-width SVG trend chart, sector rows with value + bar + change vs 100. Trade no longer collapses 100→70 on a neutral February. |
| News | Stories grouped by source public event; outlet treatments sit under a shared lead. Distinct events stay separate. |
| Map | Political/election constituency fills come from the SVG `fill` attribute (CSS no longer forces `fill: transparent`). Multi-member constituencies use sitting-seat plurality; exact ties use a neutral fill. Economy remains province-based. Campaign uses field-organization intensity. Selection stroke is thinner for constituencies (`0.28`) than provinces (`0.42`). |
| Archive | Political history tabs. Development tools and “Show hidden developer numbers” appear only in `import.meta.env.DEV` builds. |

## Blocker fixes

1. **Constituency map fills** — `.map-constituency { fill: transparent }` overrode `TerenaMap` presentation fills. CSS no longer sets constituency fill.
2. **Multi-member coloring** — sitting Assembly seats are counted by party; plurality colors the constituency; exact ties are neutral. Details panel can show the public seat breakdown. This is sitting representation, not latent voter support.
3. **Trade sector baseline** — `trade = output*0.6 + confidence*0.2 + (200-price)*0.2` equals 100 when all national indices are 100. Other sectors already summed to 100 at baseline. 20-year synthetic kernel hash is now `86952783749897096b223e06992f8e8c`.
4. **Home employment label** — `employmentIndex` is labeled Employment index.

## Presentation helpers added in 9.6

`formatIndexDelta()` in `apps/game/src/presentation/display.ts` — after one-decimal rounding, zero is `— 0.0`, not an up-arrow.

`eventDisplay()` uses public bill/law titles when the payload contains them (`LAW_ENACTED` → `{title} becomes law`).

## What is still not claimed

- No physical parliamentary semicircle / chamber animation
- No generated newspaper prose beyond structured media framing
- No foreign affairs
- No charting library
- No screenshot CI
- Production Archive still has no developer tools (intentionally)

See `docs/KNOWN_ISSUES.md` for remaining NONBLOCKING UX debt.
