# Phase 18A — Hardcoded Terena audit (classification)

Audit scope: bundled **Terena** path vs portable **scenario** path introduced in Phase 18A.

| Class | Meaning |
| --- | --- |
| **A** | Must stay Terena-specific (canonical bundled content only) |
| **B** | Shared contract — Terena uses the same field as custom scenarios |
| **C** | Legacy hardcode to remove over time (custom worlds bypass or override) |

## Boot and world construction

| Location | Finding | Class |
| --- | --- | --- |
| `apps/game/src/content/browserReader.ts` → `loadBrowserContentBundle` | Loads only repo Terena JSON slices | **A** |
| `apps/game/src/content/world.ts` → `kernelWorldFromBundle` | Delegates to `buildKernelWorldFromTerenaBundle` | **A** (New Game path) |
| `packages/sim/src/scenario/kernelBridge.ts` | `buildKernelWorldFromScenarioDocument` for imports | **B** |
| `packages/sim/src/world.ts` → `buildTerenaKernelWorld` | Full calendar/office validation for content-shaped input | **B** (alias `buildKernelWorldFromContentInput`) |
| `packages/sim/src/scenario/miniWorldBuilder.ts` | Programmatic mini world from scenario manifest | **B** |

## Content loader validators (Terena cardinality)

| Location | Finding | Class |
| --- | --- | --- |
| `packages/content-loader/src/core.ts` | 21 provinces, 420 assembly seats, 420 MPs, 21 governors | **C** for custom; **A** for bundled Terena validation |
| Constitution assembly seats `420` | Enforced at load time | **C** |
| Scenario party seat sums vs 420 | 2026 archive checks | **C** |

## Simulation / UI assumptions

| Location | Finding | Class |
| --- | --- | --- |
| `packages/sim/src/integration/harness.ts` | `foreignCountries !== 48`, cabinet `12` | **C** (Terena integration harness only) |
| `apps/game` title copy | “Terena” masthead for default New Game | **A** |
| `KernelWorld.terenaWorldCountryId` | Field name Terena-centric | **C** (world id alias; custom sets own id) |
| Save `scenarioId` | Already generic | **B** |
| Phase 18A provenance | `scenarioFormatVersion`, `scenarioName`, `countryName` on world/state/save | **B** |

## Terena → common scenario contract (mapping)

| Terena source | Scenario document (v1) |
| --- | --- |
| `data/scenario_terena_2028.json` | `startDate`, embedded via `content_bundle_ref` or host bundle |
| `bundle.manifest.content_version` | `gameVersion` |
| `TERENA_2028` | `scenarioId` (bundled only) |
| `terena_constitution` slices | `contentSections.constitution` (editable subset) |
| `terena_parties` | `contentSections.parties` |
| Province / constituency GeoJSON | `contentSections.geography` placeholders; full geo **not** in 18A |
| Full ContentBundle | `contentEmbed.kernel_input` or host `terenaBundle` at play time |
| QA mini fixture | `contentEmbed.kind: mini_playable_v1` |

## Phase 18A intentional limits

- No second official scenario in the shipped bundle.
- No eval/scripting in scenario files.
- Geography / people / foreign **editors** not implemented (stubs only in UI tabs).
- Custom worlds do not pass through `content-loader` Terena cardinality checks.
