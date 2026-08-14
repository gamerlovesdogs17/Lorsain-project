# Canonical Data Contract

**Content version:** `0.2.0-predev`

## 1. Identity layers

Terena intentionally has three related stable identifiers:

- `W41` — Terena as a country on the world map / world-country catalog
- `TER` — Terena as the domestic simulation country ID
- `TERENA` — the country-outline path ID in the domestic SVG

The crosswalk is explicit in `data/canonical_crosswalk.json`. Do not collapse these identifiers casually; each belongs to a different namespace.

## 2. Authoritative geography

- `data/terena_provinces.geojson` — authoritative province geometry/properties
- `data/terena_constituencies.geojson` — authoritative Assembly electoral-region geometry/properties
- `data/terena_cities.json` — authoritative city coordinates/metadata
- `maps/terena_game_map.svg` — lightweight **political** runtime domestic vector asset
- `maps/world_political.svg` — runtime world vector asset

`data/terena_geography.json` is a derived summary for easy inspection. A validator must fail if it drifts from the authoritative files.

## 3. Constituencies and provinces are different layers

The 20 provinces + Valen Federal District are historical administrative governments. The 48 Assembly constituencies are independent national STV electoral regions. They may cross provincial boundaries because equal population and useful STV district magnitude take priority over provincial nesting.

Every constituency therefore stores:

- `plurality_province_id`
- `plurality_province_name`
- `province_population_shares`
- `crosses_province_boundaries`

The plurality field is descriptive only. It must never be interpreted as containment.

## 4. Stable map and geography IDs

### Required on runtime political SVGs

- world country paths on `maps/world_political.svg`: `W01`–`W48`
- domestic outline on `maps/terena_game_map.svg`: `TERENA`
- provinces on `maps/terena_game_map.svg`: `FDV`, `P01`–`P20`
- constituencies on `maps/terena_game_map.svg`: `C001`–`C048`
- cities on `maps/terena_game_map.svg`: `CITY01`–`CITY18`

### Stable canonical geography IDs (not required on `terena_game_map.svg`)

- rivers: `R01`–`R08`
- routes: `RT01`–`RT18`

These IDs remain stable contracts for geography/reference assets and derived summaries. They must **not** be deleted or renamed. They are **not** required elements of the lightweight political runtime SVG. Rivers/routes may later load from detailed/reference geography as optional overlays.

Display names may change without changing those IDs.

### Naming note: Shoren vs Shorren

Province **Shorren** (`P11`) and city **Shoren** (`CITY08`) are an intentional near-homophone pair retained after city/province exact-name collision cleanup. Do not “fix” by renaming without an explicit content decision. Stable IDs remain `P11` and `CITY08`.

## 5. Static content vs save state

Files in `data/` define scenario/static content. Runtime systems must clone/instantiate mutable save state instead of mutating imported canonical objects. Saves require their own `schemaVersion` and `contentVersion`.

## 6. Electoral counting and eligibility

- Counting rules: `data/terena_electoral_counting.json` + `docs/TERENA_ELECTORAL_COUNTING.md` (implemented in Phase 0.5 `election-math`)
- Presidential eligibility: `data/terena_presidential_eligibility.json` is **pending/reference** (`derived_or_reference.presidential_eligibility_pending`) until explicitly approved and promoted to authoritative. Draft defaults are not final gameplay law.

## 7. Raw Azgaar source

`source/azgaar/` exists to preserve provenance and enable future geographic repair. It is not runtime content and should not be loaded by the game. The canonical crosswalk is the only bridge from raw generator identifiers to game identifiers. Azgaar cells are provenance/authoring artifacts only — never runtime simulation entities.
