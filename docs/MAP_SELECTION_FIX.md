# Map selection fix (shared)

Date: 2026-09-06

## Symptom

Selecting/focusing a province, constituency, city, or country on any Terena/World map could draw enormous concentric black/white/red rings (bullseye) covering much of the viewport.

## Root cause

Map SVG features use `role="button"` + `tabIndex={0}` (`TerenaMap.tsx` / `WorldMap.tsx`). Global CSS focus rules:

```css
*:focus-visible { outline: 2px solid …; outline-offset: 2px; }
[role="button"]:focus-visible { outline: 3px solid …; outline-offset: 2px; }
```

resolve `outline` / `outline-offset` against Terena’s geographic **viewBox** (degrees), so a 2–3px outline becomes a continent-scale ring.

A later map stylesheet block also dropped `vector-effect: non-scaling-stroke` on province/constituency strokes and used `drop-shadow` on selection.

## Shared fix

In `apps/game/src/styles.css`:

1. After global focus rules, force `outline: none !important` on `.terena-map` / `.world-map` and all descendants `:focus` / `:focus-visible`.
2. Use non-scaling stroke highlights if an element is still focused.
3. Restore `vector-effect: non-scaling-stroke` on map province/constituency selection strokes; remove selection `drop-shadow`.

In `TerenaMap.tsx` / `WorldMap.tsx`:

1. Inline `style={{ outline: "none" }}` on hit-targets.
2. **`tabIndex={-1}`** on SVG hit-targets — geographic viewBox focus rings cannot be made reliably pixel-sized across browsers; click/pointer selection remains. Keyboard selection stays available via map workspace HTML controls / drawers.

Regression: `apps/game/src/map/workspace.test.ts` asserts the CSS + tabIndex guardrails.


## Surfaces verified (screenshots)

Under `docs/qa/map-selection/final/`:

- Situation Room province selected
- Elections region selected
- Election Night selected
- Mobile / narrow viewport
- Selected while zoomed

## Verdict

Shared CSS fix — no per-screen overrides.
