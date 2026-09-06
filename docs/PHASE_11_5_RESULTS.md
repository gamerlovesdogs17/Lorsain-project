# Phase 11.5 results

Date: 2026-09-06

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

## Map experiment revert

See `docs/PHASE_11_5_MAP_EXPERIMENT.md`.

## Known limitations

- EntityLink not yet on every History/Assembly prose surface
- Full Caucus-dedicated page remains embedded in Party view
- Turn summary is month-crossing briefing, not a separate modal product
- Map markers for non-geographic national events intentionally omitted
- Performance bundle-splitting deferred

## Deferred to Phase 12+

- Party split/merge expansion
- Deep NPC goals / relationship engine
- Cabinet-politics rewrite
- Budget engine / foreign-policy engine
- Campaign 2.0
