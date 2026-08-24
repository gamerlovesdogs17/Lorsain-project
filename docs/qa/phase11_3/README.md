# Phase 11.3 browser QA evidence

Date: 2026-08-24

These captures were taken from the running Vite application with real game state. The judicial-appointment and party-leadership fixtures are reproducible with `scripts/create-judicial-qa-save.ts`; they use the normal engine and schema rather than mocked component props.

## Desktop institutional workspaces

- `assembly-chamber-1440.png` — complete 420-seat National Assembly chamber.
- `bill-detail-1440.png` — concrete provision, current law, alternatives and estimated effects.
- `committee-detail-1440.png` — chair, full roster and party/caucus composition.
- `federal-roll-call-1440.png` — named individual federal votes and party breakdown.
- `provincial-roll-call-1440.png` — named Provincial Assembly votes.
- `politician-voting-record-1440.png` — linked politician record and vote filters.
- `constitutional-amendment-tracker-1440.png` — 280-vote federal threshold and all 21 Provincial Assemblies.
- `court-bench-docket-1440.png` — nine-seat bench and docket.
- `judicial-appointment-browser-1440.png` — legally qualified nominee list for a real vacancy.
- `party-directory-detail-1440.png` — all-party master/detail workspace.
- `party-leadership-election-1440.png` — live leadership contest and explicit player entry.
- `organizations-scorecard-1440.png` — behavior-based public organization record.

## Role, campaign, economy and navigation

- `governor-home-1440.png`, `governor-province-1440.png`, and `governor-legislation-vote-1440.png` — Governor briefing, Province workbench and legislative action.
- `career-opportunities-1440.png` — eligible political opportunities and geography.
- `ground-game-campaign-1440.png` — active campaign with province/constituency Ground Game.
- `economy-public-metrics-1440.png` and `economy-regional-map-1440.png` — public economic measures and persistent regional variation.
- `election-map-governor-1440.png` and `terena-map-inspector-1440.png` — truthful mode data and compact pinned inspector.
- `political-calendar-1440.png` — grouped public election and institutional dates.
- `global-search-1440.png` — cross-institution navigation and politician search.

## Responsive evidence

- `province-responsive-1200.png`
- `assembly-responsive-900.png`
- `map-responsive-600.png`
- `mobile-governor-390.png`
- `mobile-campaign-390.png`

The responsive set exercises the required 1200, 900, 600 and 390 pixel layouts. The 1440 captures cover the full desktop workspace. Map selection remains available by click/tap and keyboard; hover is supplementary and clears without removing a pinned selection.
