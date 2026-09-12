# Phase 17A — Executive / Government audit (working)

Starting SHA: `80833ed`

## Classification snapshot

| Area | Class |
|------|--------|
| Cabinet appoint/dismiss | GOOD MECHANIC + OLD/POOR UI → improving list/detail |
| Sign/veto bills | GOOD MECHANIC + usable overview |
| Regulations | MECHANIC EXISTS; UI was raw dropdown/slider → still constrained |
| Agenda / promises | GOOD MECHANIC + OLD table UI → list + Assembly link |
| Implementation | GOOD MECHANIC + raw % UI → qualitative delivery labels |
| Budget | GOOD MECHANIC + number-forward UI; political choices partial |
| Coalition constraints | MECHANIC EXISTS; surfaces in agenda |
| NPC executive parity | PARTIAL — same commands; NPC agency uses governing monthly |
| Ministry-specific gameplay | THIN — shared portfolio architecture only |
| Crisis surfacing in Government | THIN / partial |

## UI changes in this pass

- Cabinet: selectable rows, qualitative performance (“Too early to assess”), minister detail panel
- Agenda: priority rows with **Open in Assembly** when a linked bill exists
- Implementation: qualitative status (On track / Some delays / Behind / Serious trouble); exact % only in Debug
- CSS: mobile-friendly cabinet/agenda layout (~390px)

## Remaining for fuller Phase 17A

- Replace regulation slider panel with contextual policy actions
- Budget envelope decisions as FULL/PARTIAL/HOLD/CUT
- Richer ministry domain actions
- Asserted Government QA fixtures + 390px captures
- NPC reshuffle parity tests
