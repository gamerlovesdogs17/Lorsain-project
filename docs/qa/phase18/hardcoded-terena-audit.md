# Phase 18 — Hardcoded Terena audit (classification)

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
| `packages/sim/src/scenario/miniWorldCalendars.ts` | Calendars from `startDate` + `contentSections.elections` intervals | **B** |

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

## Phase 18B–D — custom mini world (updated)

| Location | Finding | Class |
| --- | --- | --- |
| `miniWorldBuilder.ts` (before 18B) | `TERENA_*_CALENDAR`, `ELEC_PRES_2028` / `ELEC_ASM_2030` on scheduled events | **C** → **fixed** via `miniWorldCalendars.ts` |
| Mini playable bootstrap | First presidential calendar event deferred ~4y; assembly due omitted until electorate exists | **B** (QA stability; explicit `elections.next*Date` overrides) |
| `seedMiniPlayableScheduledElections` | Synthetic candidates + `assembly_selection` when no electorate | **B** |
| `miniWorldBuilder.ts` (18B+) | First presidential cycle deferred ≥4 years; assembly calendar due not scheduled until electorate exists | **B** (QA stability; full assembly STV still needs `constituencyElectorate`) |
| `seedMiniPlayableScheduledElections` + `assembly_selection` when no electorate | Synthetic mini-world presidential resolution without Terena ballots | **B** |
| `packages/sim/src/elections/state.ts` → `seedCanonicalElections` | Still seeds Terena canonical IDs when electorate content exists | **C** (Terena / full kernel_input only) |
| `packages/sim/src/elections/types.ts` | `CANONICAL_PRESIDENTIAL_ELECTION_ID` / `CANONICAL_ASSEMBLY_ELECTION_ID` | **C** (Terena scenario anchor; custom uses date-based `ELEC_*_{year}`) |
| `packages/sim/src/parties/contests.ts`, `parties/state.ts`, `save.ts` | `ELEC_PRES_2028` scenario-start cycle hooks | **C** |
| `apps/game/src/presentation.ts` | Display label for `ELEC_PRES_2028` | **C** |
| `KernelWorld.relationWithTerena` on foreign countries in mini builder | Terena-centric field name on generic stub countries | **C** |
| `KernelWorld.terenaWorldCountryId` | Player home country id field name | **C** |
| Scenario `contentSections.elections` | Intervals only (no month/weekday editor yet) | **B** (partial contract) |

### QA fixtures (no `scenarioId` branching in sim)

| File | Role |
| --- | --- |
| `docs/qa/phase18/fixtures/custom-mini-world.lorsain.json` | Alphaven baseline (18A) — 2 provinces, 24 seats |
| `docs/qa/phase18/fixtures/aster-custom.lorsain.json` | Aster Federation — 2029-04-01, 5 provinces, 120 seats, 4 parties, presidential |
| `docs/qa/phase18/fixtures/brinor-custom.lorsain.json` | Brinor Commonwealth — 2030-09-01, 10 provinces, 240 seats, 5 parties, parliamentary |

### Tests and extended runs

| Command | Scope |
| --- | --- |
| `pnpm exec vitest run packages/sim/src/phase18.customWorld.test.ts` | Alphaven + Aster + Brinor structure, 12-month, save/load, Terena save smoke |
| `pnpm exec tsx scripts/phase18-custom-extended.ts --years=5` | Aster + Brinor × 5 years → `docs/qa/phase18/extended-custom-summary.json` |
| GitHub `phase18-custom-extended.yml` | Manual / scheduled extended script only |

## Phase 18A intentional limits

- No second official scenario in the shipped bundle.
- No eval/scripting in scenario files.
- Geography / people / foreign **editors** not implemented (stubs only in UI tabs).
- Custom worlds do not pass through `content-loader` Terena cardinality checks.
