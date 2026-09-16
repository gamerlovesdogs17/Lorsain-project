# Phase 19 — Tablet / iPad QA matrix

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

## Screen checklist

| Screen | 768×1024 | 834×1194 | 1024×768 | Overflow | Nav | Tabs | Tables | Dialogs | Maps | Notes |
|--------|----------|----------|----------|----------|-----|------|--------|---------|------|-------|
| Home | | | | | | | | | | |
| Assembly | | | | | | | | | | |
| Bill detail | | | | | | | | | | |
| Whip workspace | | | | | | | | | | |
| Constitution | | | | | | | | | | |
| Constitutional amendment vote | | | | | | | | | | |
| Party | | | | | | | | | | |
| Caucus | | | | | | | | | | |
| Coalition formation | | | | | | | | | | |
| Government / Cabinet / Budget | | | | | | | | | | |
| Elections / Campaign | | | | | | | | | | |
| Court | | | | | | | | | | |
| Foreign Affairs | | | | | | | | | | |
| History | | | | | | | | | | |
| Scenario Studio | | | | | | | | | | |
| Settings | | | | | | | | | | |

## CSS / interaction hooks shipped

- Tablet breakpoints at 1024 / 834 / 768
- Tab horizontal scroll + 44px min touch height
- Table region scroll (not page-wide 1600px)
- Safe-area padding for bottom chrome / tutorial coach
- 16px inputs to avoid iOS focus zoom
- Modal body scroll within viewport

## Known limitations

- Full Playwright device gallery is Extended QA, not Quality CI.
- Map pinch/pan depends on existing map gesture handlers; re-verify after map refactors.
