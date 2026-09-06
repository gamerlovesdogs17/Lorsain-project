# Phase 11.5 results

Date: 2026-09-06 (final closeout with Prettier CI gate + screenshots)

## Determination

**Phase 11.5 COMPLETE** — core player-experience systems are implemented (not stubs): global search expansion, entity inspector, EntityLink, navigation history, notification levels, month summary, WhyPanel, profile/dossier revamps, Lawbook/legal cross-links, Home hierarchy, optional Situation Room map experiment, density preference, and accessibility markers.

## Delivered

| Area | Status |
|------|--------|
| Global search (Cmd/Ctrl+K) | Expanded kinds: articles, clauses, offices, existing entities |
| Entity inspector drawer | Politician / Party / Bill / Law / Province / Court |
| EntityLink | Wired in News; reusable elsewhere |
| Nav history | Back/forward stack (cap 50) |
| Notifications | ACTION_REQUIRED / MAJOR / BACKGROUND / SYSTEM |
| Month summary | Skippable; threshold-based |
| Why? / debug | WhyPanel + `lorsain-debug-why` |
| Profiles | Politician dossier, Party legal-status prominence, Caucus distinct, Province dossier |
| Legal cross-links | Constitution ↔ Court ↔ Act/Lawbook |
| Home hierarchy | Attention → state → developments → upcoming |
| Map experiment | Optional `situation` screen; revert doc |
| Density | `lorsain-density` localStorage |
| A11y | focus-visible; Deleted/Added markers on diffs |

## Screenshots

Captured from the live game via `scripts/phase11_5-capture-screenshots.mjs` into `docs/qa/phase11_5/final/`:

| File | Covers |
|------|--------|
| `home-1440.png` / `home-390.png` | Home hierarchy + mobile Home |
| `global-search-1440.png` / `search-party-1440.png` | Cmd/Ctrl+K search |
| `politician-profile-1440.png` / `profile-390.png` | Politician dossier + mobile |
| `inspector-1440.png` | Contextual entity inspector |
| `party-dossier-1440.png` | Party profile |
| `province-dossier-1440.png` | Province dossier |
| `situation-room-1440.png` | Map experiment |
| `assembly-1440.png` | Assembly workspace |
| `elections-calendar-1440.png` | Elections / calendar |
| `news-1440.png` | News desk |

Full brief matrix items not separately captured (Lawbook, Constitution↔Court click chains, Why bill-vote modal, notifications drawer, month-summary drawer, mobile Constitution/map) remain available in-product; capture script can be extended later.

## Map experiment revert

See `docs/PHASE_11_5_MAP_EXPERIMENT.md`.

## Known limitations

- EntityLink not yet on every History/Assembly prose surface
- Full Caucus-dedicated page remains embedded in Party view
- Turn summary is month-crossing briefing, not a separate modal product
- Map markers for non-geographic national events intentionally omitted
- Performance bundle-splitting deferred
- Screenshot matrix is representative, not every brief line-item

## Deferred to Phase 12+

- Party split/merge expansion
- Deep NPC goals / relationship engine
- Cabinet-politics rewrite
- Budget engine / foreign-policy engine
- Campaign 2.0
- Generational political-history overhaul
