# Phase 19 — Tablet / iPad QA matrix

Tip SHA at fill-in: see `HANDOFF.md` (final SHA).

Targets (portrait and landscape where listed):

- **768×1024**
- **834×1194**
- **1024×768**

Also retain **390px** phone spot checks for Home / Assembly / Government / Party / Scenario Studio.

## Method

Deterministic fixtures preferred. Assert before capture:

- correct fixture/state
- no page-level horizontal overflow
- primary actions visible
- no clipped control / nav obstruction
- selected object correct
- no hover-only required action
- touch targets ≈44×44 CSS px where practical

Do **not** put the full device matrix on every push CI.

Capture helper: `node scripts/final-redesign-qa-capture.mjs` (overflow assert + tablet viewports).
Representative AFTER shots: `docs/qa/final-redesign/after/`.

## Screen checklist

| Screen | 768×1024 | 834×1194 | 1024×768 | Overflow | Nav | Tabs | Tables | Dialogs | Maps | Notes |
|--------|----------|----------|----------|----------|-----|------|--------|---------|------|-------|
| Home | OK | OK (capture) | OK | none | drawer + bottom rail | n/a | n/a | OK | n/a | phone 390 OK |
| Assembly | OK | OK (capture) | OK | contained | OK | scroll | region scroll | OK | n/a | bill inspector hierarchy |
| Bill detail | OK | OK | OK | none | OK | scroll | support table | OK | n/a | object-first |
| Whip workspace | OK | OK | OK | none | OK | OK | MP table scroll | OK | n/a | shared amendment subject |
| Constitution | OK | OK | OK | none | OK | OK | OK | OK | n/a | |
| Constitutional amendment vote | OK | OK | OK | none | OK | OK | roll call | OK | n/a | shared Assembly path |
| Party | OK | OK (capture) | OK | none | OK | scroll | OK | OK | n/a | |
| Caucus | OK | OK | OK | none | OK | OK | OK | OK | n/a | |
| Coalition formation | OK | OK | OK | none | OK | OK | partner cards | OK | n/a | FORM A GOVERNMENT |
| Government / Cabinet / Budget | OK | OK (capture) | OK (capture) | none | OK | scroll | fiscal tables | OK | n/a | |
| Elections / Campaign | OK (elections) | OK | OK | none | OK | scroll | results tables | OK | touch | map gestures Extended |
| Court | OK | OK (capture) | OK | none | OK | OK | docket | OK | n/a | |
| Foreign Affairs | OK | OK | OK | none | OK | OK | OK | OK | n/a | |
| History | OK | OK | OK | none | OK | OK | OK | OK | n/a | |
| Scenario Studio | OK | OK | OK | none | OK | scroll | editors | OK | n/a | Phase 18 tablet + Phase 19 fields |
| Settings | OK | OK | OK | none | OK | OK | n/a | OK | n/a | Tutorial reset + glossary |

Legend: **OK** = usable at target; capture noted where PNG exists under `docs/qa/final-redesign/after/`.

## CSS / interaction hooks shipped

- Tablet breakpoints at 1024 / 834 / 768
- Tab horizontal scroll + 44px min touch height
- Table region scroll (not page-wide 1600px)
- Safe-area padding for bottom chrome / tutorial coach
- 16px inputs to avoid iOS focus zoom
- Modal body scroll within viewport
- Collapsible rail / drawer navigation (not squeezed full desktop sidebar)

## Known limitations

- Full Playwright device gallery is Extended QA, not Quality CI.
- Map pinch/pan depends on existing map gesture handlers; re-verify on physical iPad after map refactors.
- Not every inventory detail tab is captured at every tablet size on every commit.
