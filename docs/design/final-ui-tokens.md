# Final UI Tokens — Skeleton

**Status:** Categories only. Concrete CSS custom-property values are left for the design-system implementer.  
**Companion study:** `docs/design/final-ui-reference-study.md`  
**Rule:** Tokens encode *Lorsain* visual language. Do not port BFTH/PPUSA hex values, fonts, or spacing scales.

---

## How to use this file

1. Implementer fills each `<!-- TODO -->` / `/* TBD */` with CSS variables (and optional light/dark pairs).
2. Prefer semantic names (`--color-surface-raised`) over raw roles (`--blue-500`) except inside a controlled palette section.
3. Breakpoints and touch targets must support the reference study’s mobile/tablet-first lesson (drawer nav, not squeezed sidebar).

---

## 1. Typography

```css
:root {
  /* Font families */
  --font-display: /* TBD — expressive display for headlines / brand */;
  --font-ui: /* TBD — readable UI/body */;
  --font-mono: /* TBD — roll calls, codes, IDs */;

  /* Scale (rem or px — pick one system) */
  --text-xs: /* TBD */;
  --text-sm: /* TBD */;
  --text-md: /* TBD */;
  --text-lg: /* TBD */;
  --text-xl: /* TBD */;
  --text-2xl: /* TBD */;
  --text-hero: /* TBD — brand / election-night headline */;

  /* Weight & tracking */
  --font-weight-regular: /* TBD */;
  --font-weight-medium: /* TBD */;
  --font-weight-semibold: /* TBD */;
  --font-weight-bold: /* TBD */;
  --letter-spacing-tight: /* TBD */;
  --letter-spacing-normal: /* TBD */;
  --line-height-tight: /* TBD */;
  --line-height-body: /* TBD */;
}
```

**Notes for implementer:** Brand/hero type should outrank generic UI chrome. Avoid default Inter/Roboto/Arial stacks unless already locked by product policy.

---

## 2. Spacing

```css
:root {
  --space-0: /* TBD */;
  --space-1: /* TBD */;
  --space-2: /* TBD */;
  --space-3: /* TBD */;
  --space-4: /* TBD */;
  --space-5: /* TBD */;
  --space-6: /* TBD */;
  --space-8: /* TBD */;
  --space-10: /* TBD */;
  --space-12: /* TBD */;
  --space-16: /* TBD */;

  /* Layout rhythm */
  --space-section-y: /* TBD — vertical gap between page sections */;
  --space-stack-sm: /* TBD — tight stacks inside cards/lists */;
  --space-stack-md: /* TBD */;
  --gutter-page: /* TBD — page horizontal inset */;
  --gutter-panel: /* TBD — inspector / rail inset */;
}
```

---

## 3. Surfaces

```css
:root {
  --surface-canvas: /* TBD — app background */;
  --surface-raised: /* TBD — panels, workbenches */;
  --surface-sunken: /* TBD — wells, inset tables */;
  --surface-overlay: /* TBD — modals, drawers */;
  --surface-selected: /* TBD — selected row/seat */;
  --surface-hover: /* TBD */;

  --border-subtle: /* TBD */;
  --border-strong: /* TBD */;
  --border-focus: /* TBD — may alias focus ring */;

  --radius-sm: /* TBD */;
  --radius-md: /* TBD */;
  --radius-lg: /* TBD */;
  --radius-pill: /* TBD — use sparingly */;

  --shadow-sm: /* TBD */;
  --shadow-md: /* TBD */;
  --shadow-overlay: /* TBD */;
}
```

**Notes:** Prefer atmosphere via layered surfaces / restrained texture over flat single-color fills *and* over heavy multi-shadow “dashboard” chrome. Cards are tools for interaction/registry density, not default decoration.

---

## 4. Semantic colors

```css
:root {
  /* Text */
  --color-text-primary: /* TBD */;
  --color-text-secondary: /* TBD */;
  --color-text-muted: /* TBD */;
  --color-text-inverse: /* TBD */;
  --color-text-danger: /* TBD */;
  --color-text-success: /* TBD */;
  --color-text-warning: /* TBD */;

  /* Actions */
  --color-action-primary: /* TBD */;
  --color-action-primary-hover: /* TBD */;
  --color-action-secondary: /* TBD */;
  --color-action-danger: /* TBD */;
  --color-action-disabled: /* TBD */;

  /* Political / map (Lorsain parties — not US red/blue clones) */
  --color-party-a: /* TBD */;
  --color-party-b: /* TBD */;
  --color-party-c: /* TBD */;
  --color-party-other: /* TBD */;
  --color-map-unreported: /* TBD */;
  --color-map-lean: /* TBD */;
  --color-map-called: /* TBD */;

  /* Status */
  --color-status-info: /* TBD */;
  --color-status-success: /* TBD */;
  --color-status-warning: /* TBD */;
  --color-status-danger: /* TBD */;
  --color-status-pending: /* TBD */;
}
```

Optional dark theme:

```css
[data-theme="dark"] {
  /* TBD — remap surfaces + text + borders; keep party map hues distinguishable */
}
```

---

## 5. Breakpoints

```css
:root {
  --bp-sm: /* TBD — phone */;
  --bp-md: /* TBD — large phone / small tablet */;
  --bp-lg: /* TBD — tablet / small laptop */;
  --bp-xl: /* TBD — desktop */;
  --bp-2xl: /* TBD — wide desktop */;

  /* Behavioral thresholds (document intended behavior) */
  /* --nav-drawer-below: at/below this width, use drawer/menu instead of persistent rail */
  /* --chamber-compact-below: switch chamber layout to compact composition */
  /* --election-map-stack-below: stack map above returns list */
}
```

**Reference study constraint:** Below the drawer threshold, navigation must be explicit menu/drawer — never a permanently visible desktop sidebar squeezed into a narrow viewport.

---

## 6. Focus & touch

```css
:root {
  /* Focus */
  --focus-ring-width: /* TBD */;
  --focus-ring-offset: /* TBD */;
  --focus-ring-color: /* TBD */;
  --focus-ring: /* TBD — shorthand composed from above */;

  /* Touch / hit targets */
  --touch-min: /* TBD — minimum interactive size, e.g. 44px */;
  --touch-spacing: /* TBD — gap between adjacent controls */;
  --tap-feedback: /* TBD — pressed/active opacity or surface */;

  /* Motion (optional but recommended) */
  --motion-fast: /* TBD */;
  --motion-medium: /* TBD */;
  --motion-slow: /* TBD */;
  --ease-standard: /* TBD */;
  --ease-emphasized: /* TBD */;
}
```

**A11y notes:** Visible focus on all interactive controls (including chamber seats and map regions). Prefer `prefers-reduced-motion` overrides when motion tokens are introduced.

---

## 7. Component-oriented aliases (optional fill later)

Leave empty until surfaces/colors stabilize:

```css
:root {
  --shell-rail-width: /* TBD */;
  --shell-topbar-height: /* TBD */;
  --drawer-width: /* TBD */;
  --inspector-width: /* TBD */;
  --card-padding: /* TBD */;
  --table-row-height: /* TBD */;
  --modal-max-width: /* TBD */;
  --confirm-max-width: /* TBD */;
}
```

---

## Out of scope for this skeleton

- Copying competitor palettes or screenshot-measured spacing
- Committing third-party image assets
- Full component API docs (belongs with the design-system package once tokens exist)
