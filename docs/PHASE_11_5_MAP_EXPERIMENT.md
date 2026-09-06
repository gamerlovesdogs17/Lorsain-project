# Phase 11.5 — Map Experiment (Situation Room)

## What was added

A new **Situation Room** screen accessible from the navigation sidebar under "Government → Situation Room". This is a map-centric overview that lets the player click provinces to see a compact dossier (governor, economy, assembly, party control) without leaving the map view.

## How to revert

Remove the following changes to fully revert the map experiment:

### 1. `apps/game/src/pages.tsx`
- Remove `"situation"` from the `Screen` type union
- Remove `if (screen === "situation") return <SituationRoom {...props} />;` from `GamePages`
- Remove the entire `SituationRoom` function (search for `function SituationRoom`)

### 2. `apps/game/src/App.tsx`
- Remove `"situation"` from the `QA_SCREENS` set

### 3. `apps/game/src/ui/shell.tsx`
- Remove `{ id: "situation", label: "Situation Room", icon: "🗺" }` from the `NAV_GROUPS` "Government" group

### 4. `apps/game/src/styles.css`
- Remove the `.situation-room-workspace` and `.situation-province-card` CSS rules (under the "Situation room" comment)

### 5. This file
- Delete `docs/PHASE_11_5_MAP_EXPERIMENT.md`

## Design notes

- The Situation Room reuses `TerenaMap` and `MapDetailLayout` from existing code
- It uses `mapFillFor` and `MapLegend` for consistent map coloring
- Province click → inspector card with governor, economy, assembly, party control
- "Open province dossier" button navigates to full Terena screen with that province focused
- The normal Home screen and Terena screen remain available and unchanged
- No new dependencies were added
