# Institutional UX + Correctness Completion Pass

Starting SHA: `e668fd0bdd90295fee298cde2736e542110079a3`

## Verdicts

| Area | Verdict |
|------|---------|
| Settings | **COMPLETE** |
| Assembly + Legislation UX | **COMPLETE** |
| Party Leadership Correctness | **PARTIAL** (deferred actions unified; UX qualitative bands) |
| Caucuses 2.0 | **COMPLETE** (active counts + estimate formatting) |
| Phase 14 | **PARTIAL** (authoritative nomination sync; primary poll fixture still soft) |
| Phase 15 | **COMPLETE** for precedent honesty (explicit-only chains) |
| Phase 16 | **PARTIAL** (single FA nav + actor-specific domestic reactions) |

Phase 17 was **not** started.

## Settings
- Start menu Settings enabled
- In-game Settings screen under Player nav
- Sections: Game, Interface, Notifications, Accessibility, Advanced
- Debug Mode relocated to Settings → Advanced (removed from Archive)
- Persists via `lorsain-player-settings`

## Assembly / Legislation
- Tabs: Overview | Legislation | Committees | Delegation
- Legislation master-detail: bill click opens workspace immediately
- Stage track + bill sub-tabs
- Whip desk under Delegation
- Legacy bottom inspector removed from primary workflow

## Information philosophy
- Helpers in `politicalInfo.ts` (sim + game)
- Estimates/bands in normal mode; exact internals in Debug
- Why panel qualitative when Debug off

## National Committee
- `PendingPartyAction` + `executePendingPartyAction`
- Approve executes once; reject does not
- Schema 25 (ensure defaults, no bump required)

## Court
- No inferred precedent links
- Explicit `precedentTreatments` on decisions only
- History displays recorded relationships only

## Nominations
- Auto-field skips nomination-required parties
- Sync withdraws co-partisan filings after nomination win

## Foreign Affairs
- Single tab strip
- Qualitative tension bands
- Actor-specific domestic reactions

## QA
- `docs/qa/institutional/` (10 asserted shots)
- `docs/qa/phase16/` (prior pass)
