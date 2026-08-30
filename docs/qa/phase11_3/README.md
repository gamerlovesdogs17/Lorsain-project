# Phase 11.3 browser QA evidence

Date: 2026-08-30

These JPEG captures come from the running Vite application loaded with real, replayable engine saves. They are not isolated components or mocked props. Regenerate the two fixtures with:

`node packages/content-loader/node_modules/tsx/dist/cli.mjs scripts/create-judicial-qa-save.ts`

The final pass adds replay points for an active Provincial Assembly member linked to the full politician directory, a former President after transition, and certified 2029–2030 provincial/federal election results. Current PNG evidence is in `final/`; the earlier full-page JPEG set remains useful for long-page inspection.

The development-only QA loader accepts a fixture, destination screen, optional player viewpoint, and optional focused record. It exposes a hidden ready sentinel. Before every capture the browser pass asserted the requested viewport, fixture date, player, route, expected heading/content, and decoded image dimensions. The exact assertion contract and per-file dimensions are in `browser-qa-manifest.json`.

## Institutional and role evidence

- `party-directory-1440.jpg`, `party-caucus-1440.jpg`, `party-leadership-election-1440.jpg` — all-party/caucus navigation and live internal politics.
- `assembly-chamber-1440.jpg`, `committee-detail-1440.jpg`, `federal-roll-call-1440.jpg` — 420-seat chamber, full committee roster, and named individual federal votes.
- `bill-provision-builder-1440.jpg`, `bill-detail-1440.jpg` — one-to-three provision drafting, variable policy alternatives, current law, effects, affected groups, and clause-amendment UX.
- `politician-profile-1440.jpg`, `politician-voting-record-1440.jpg`, `career-opportunities-1440.jpg` — politician identity, public record, and actionable career paths.
- `court-bench-docket-1440.jpg`, `court-decision-1440.jpg`, `judicial-appointment-browser-1440.jpg` — nine-seat bench, structured opinions with individual votes, and candidates with explicit legal careers.
- `governor-home-1440.jpg`, `governor-province-1440.jpg`, `governor-legislation-vote-1440.jpg`, `provincial-roll-call-1440.jpg` — role briefing, Provincial Assembly, Governor legislation, disposition, and named roll call.
- `constitutional-amendment-tracker-1440.jpg` — federal threshold plus all 21 Provincial Assemblies in a geographic tracker and accessible table.

## Campaign, organizations, economy, and public information

- `ground-game-campaign-1440.jpg` — active campaign with provincial and constituency Ground Game.
- `organizations-scorecard-1440.jpg` — behavior-based relationships, public positions, and scorecards.
- `economy-public-metrics-1440.jpg`, `economy-regional-map-1440.jpg` — centralized public statistics and persistent regional variation.
- `political-map-hover-1440.jpg`, `terena-map-inspector-1440.jpg`, `election-map-governor-1440.jpg` — temporary hover, persistent selection, truthful mode data, and a real planned gubernatorial race.
- `political-calendar-1440.jpg`, `global-search-1440.jpg`, `news-populated-1440.jpg`, `archive-populated-1440.jpg` — cross-system navigation and populated long-lived information surfaces.

## Responsive evidence

- `province-responsive-1200.jpg`
- `assembly-responsive-900.jpg`
- `map-responsive-600.jpg`
- `mobile-governor-390.jpg`
- `mobile-campaign-390.jpg`
- `mobile-map-interaction-390.jpg`

The 390-pixel checks found no document-level horizontal overflow. Wide political tables remain usable through local horizontal scrolling. Hover is supplementary: click/tap and keyboard activation create the persistent map selection.

## Final role and interaction pass

The 2026-08-30 pass exercised President, MP, Governor, Provincial Assembly member, active presidential candidate, party leader, caucus chair, justice, and former-officeholder perspectives. It covered 1440, 1200, 900, 600, and 390 pixel widths. A linked Provincial Assembly identity defect found during this pass was fixed in the UI and command authority layer, then protected by an engine regression test.

Election evidence now includes certified Presidential, National Assembly, gubernatorial, and Provincial Assembly results. The map pass verified live tooltip appearance, leave-to-clear, persistent click selection, keyboard selection, and 390-pixel selection without a retained hover. The final clean-tab route sequence reported no console warnings or errors.
