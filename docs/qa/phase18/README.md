# Phase 18A — Scenario editor / custom worlds foundation

## Delivered

- **`@lorsain/scenario`** — format v1 (`lorsain-scenario`), parse/serialize, validate (errors/warnings/suggestions), import/export, size guard, forward-compatible unknown fields (warnings), `migrateScenario` stub.
- **Kernel bridge** — `buildKernelWorldFromScenarioDocument`, `buildKernelWorldFromTerenaBundle`, `buildKernelWorldFromContentInput`; mini playable builder for custom fixtures.
- **Save provenance** — optional `scenarioFormatVersion`, `scenarioName` on world, simulation state, and save envelope (separate from save `schemaVersion`).
- **Game UI** — Main menu **Import scenario** and **Scenario editor**; New Game unchanged (Terena). Import summary with actionable validation; editor tabs Overview / Constitution / Parties / Validation; dirty + export.
- **QA fixture** — `fixtures/custom-mini-world.lorsain.json` (not shipped as default scenario).

## Tests

```bash
pnpm exec vitest run packages/scenario/src/scenario.test.ts
pnpm exec vitest run packages/sim/src/phase18.customWorld.test.ts
```

Fast suite (includes scenario unit tests):

```bash
pnpm test:fast
```

## QA screenshots

`docs/qa/phase18/screenshots/` — menu, editor tabs, valid Alphaven import, invalid import errors (1280 + 390).

```bash
node scripts/phase18a-scenario-qa-capture.mjs
```


1. Build or run `pnpm game`.
2. Main menu → **Import scenario** → select `docs/qa/phase18/fixtures/custom-mini-world.lorsain.json`.
3. **Play scenario** → pick a politician.

## Remaining blockers (18B+)

- Full ContentBundle-shaped custom scenarios through `content-loader` without Terena cardinality (**C** items in audit).
- Geography, people, foreign scenario editors and map binding.
- Share/publish pipeline and scenario library UI.
- `content_bundle_ref` embed requires host bundle; no standalone Terena export in client yet.

See [hardcoded-terena-audit.md](./hardcoded-terena-audit.md) for A/B/C classification.
