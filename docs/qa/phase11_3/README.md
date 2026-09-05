# Phase 11.3 browser QA evidence

Date: 2026-09-04

Current PNG evidence lives in `final/`. Captures were regenerated on **2026-09-04 evening** from CURRENT HEAD with:

```text
node scripts/phase11_3-capture-screenshots.mjs
```

Requires a running Vite game server (default `http://localhost:5174/Lorsain-project/`) and Playwright (`playwright` workspace `devDependency`). The script loads real QA fixtures through the development-only loader (`qaFixture`, `qaScreen`, optional `qaPlayer` / focused record) and writes PNGs into `final/`. An `assembly-worker` fixture is available among the Vite QA fixtures for Worker/Assembly paths.

Earlier full-page JPEG captures under this directory (August 2026 pass) are **archival only** — superseded by the regenerated `final/*.png` set. Do not cite the `.jpg` names as current closeout evidence.

The development-only QA loader exposes a hidden ready sentinel. Historical assertion contracts and per-file dimensions for the older JPEG pass remain in `browser-qa-manifest.json` for reference.

## Regenerated final set (2026-09-04)

Representative current captures (not exhaustive of every file in `final/`):

### Shell and roles

- `title-1440.png`, `governor-home-1440.png`, `global-shell-1440.png`, `mp-home-1440.png`, `mobile-menu-390.png`

### Assembly / party / caucus

- `assembly-chamber-1440.png`, `assembly-900.png` — Speaker + Floor Leaders + Whips + current business before chamber (chamber is a link); compact Required decisions banner
- `party-leader-1440.png`, `caucus-1440.png`, `caucus-chair-1440.png`, `assembly-delegation-leadership-1440.png`

### Campaign and map

- `campaign-hq-1440.png`, `campaign-forecast-1440.png`, `campaign-polling-1440.png`, `campaign-ground-game-1440.png`, `campaign-previous-1440.png`, `campaign-390.png`
- `map-inspector-selected-1440.png`, `map-inspector-drawer-1440.png`, `mobile-map-selected-390.png`

### Election Night and History

- `election-night-presidential-rcv.png`, `election-night-presidential-later.png`
- `election-night-assembly-partial.png`, `election-night-assembly-certified.png`
- `election-night-governors.png`, `election-night-provincial-assemblies.png`
- `history-wiki-year.png`, `history-wiki-assembly-election.png`, `history-wiki-governor-election.png`, `history-wiki-presidential-election.png`

### Constitution, news, legislation

- `constitution-reader.png`, `constitution-amendment-clause.png`
- `news-front-populated.png`, `news-outlet-front.png`, `news-article-reader.png`
- `bill-workspace-1440.png`

## Archival JPEG set (2026-08-30)

The following JPEG names document an earlier Vite fixture pass. They remain on disk for long-page inspection history but are superseded by `final/*.png`.

### Institutional and role evidence (archival)

- `party-directory-1440.jpg`, `party-caucus-1440.jpg`, `party-leadership-election-1440.jpg`
- `assembly-chamber-1440.jpg`, `committee-detail-1440.jpg`, `federal-roll-call-1440.jpg`
- `bill-provision-builder-1440.jpg`, `bill-detail-1440.jpg`
- `politician-profile-1440.jpg`, `politician-voting-record-1440.jpg`, `career-opportunities-1440.jpg`
- `court-bench-docket-1440.jpg`, `court-decision-1440.jpg`, `judicial-appointment-browser-1440.jpg`
- `governor-home-1440.jpg`, `governor-province-1440.jpg`, `governor-legislation-vote-1440.jpg`, `provincial-roll-call-1440.jpg`
- `constitutional-amendment-tracker-1440.jpg`

### Campaign, organizations, economy, and public information (archival)

- `ground-game-campaign-1440.jpg`, `organizations-scorecard-1440.jpg`
- `economy-public-metrics-1440.jpg`, `economy-regional-map-1440.jpg`
- `political-map-hover-1440.jpg`, `terena-map-inspector-1440.jpg`, `election-map-governor-1440.jpg`
- `political-calendar-1440.jpg`, `global-search-1440.jpg`, `news-populated-1440.jpg`, `archive-populated-1440.jpg`

### Responsive evidence (archival)

- `province-responsive-1200.jpg`, `assembly-responsive-900.jpg`, `map-responsive-600.jpg`
- `mobile-governor-390.jpg`, `mobile-campaign-390.jpg`, `mobile-map-interaction-390.jpg`

## Notes from the archival 2026-08-30 pass

That pass exercised President, MP, Governor, Provincial Assembly member, active presidential candidate, party leader, caucus chair, justice, and former-officeholder perspectives across 1440–390 widths. A linked Provincial Assembly identity defect found then was fixed and protected by regression tests. Prefer the 2026-09-04 `final/*.png` set when citing Phase 11.3 closeout evidence.
