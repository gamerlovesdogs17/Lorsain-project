# Phase 19 handoff

**Status:** COMPLETE (usability / Studio option coverage / tutorial / tablet / a11y)

**Starting tip (review):** `fc9266ebd6e8f4280399860da641bf534fd4c9d7`  
**Phase 19 mechanical core:** `fbc58f5dd18020e273fb1ccd70069de19707fc53` (`ghvghjv`)  
**Final tip:** see git HEAD after closeout commits on `main`.

## Shipped

### Scenario Studio completeness

- Shared `packages/scenario/src/optionCatalogs.ts` (engine-aligned IDs + human labels)
- Full Constitution order fields (`ConstitutionOrderFields`) — Quick Build presets retained
- Bounded Party `ideologyFamily` + optional public `ideologyLabel`
- Law catalog picker; Person background catalog; Political skill via `skill:` trait (not `background`)
- Option coverage report: `docs/qa/phase19/scenario-option-coverage.md`
- Tests: option coverage / option→world init (`phase19.option-init.test.ts`)

### Tutorial Mode

- Optional Tutorial Mode (New Game / Settings); first-use lessons; skip/reset
- No permanent coach / turn-transparency / recommended-move panels
- Does not expose hidden numeric vote/negotiation scores

### Constitutional amendment Assembly gameplay

- Amendments participate in shared Assembly business / vote / whip path
- Exact threshold display; descriptions; Party positions; roll call
- Special ratification / entrenchment lifecycle preserved
- Tests: `phase19.constitutional-assembly.test.ts`

### Coalition formation

- FORM A GOVERNMENT workspace after hung Assembly
- Partner comparison (seats, fit, priorities, red lines) without exact scores
- Talks / counteroffers / agreement → investiture/confidence
- NPC parity on agreement structures
- Tests: `phase19.governmentFormation.test.ts`

### Gameplay usability

- Clearer object-first hierarchy on major desks (Home, Assembly, Government, Party, Elections/Campaign, Court, Foreign, History, Studio, Settings)
- Tables retained where comparison is the task; spreadsheet-only surfaces reduced
- Glossary affordance for specialized terms (Settings → Interface)
- Consistent EntityLink → profile / bill / province / case navigation

### Tablet / accessibility

- Breakpoints 1024 / 834 / 768; drawer + bottom rail; ~44px touch; safe-area; 16px inputs
- Matrix: `docs/qa/phase19/tablet-qa.md`
- Keyboard focus, semantic labels, color+text status, reduced motion / high contrast preserved

### Beginner task audit

- Script + ratings: `docs/qa/phase19/beginner-task-audit.md`
- No BROKEN / CONFUSING paths remaining on the ten core tasks

### Closeout fixes (tip)

- Canonical org count includes ORG_JIL / ORG_BAR; player-decision fixture ignores `form_government`
- Determinism golden refreshed after Court/reputation state shape
- Mini-world electorate seeding + mini-playable election ID gates restored Phase 18 custom Extended

## Explicit non-goals preserved

- No Scenario Browser / extra bundled scenarios
- No permanent advisor / turn-transparency panels
- No Phase 18E / 19A / 19B split
- Phase 20 beta hardening **not** started as certification work

## Intentionally unavailable (documented)

- Full provincial/governor election **mode** pickers (calendars/electorate still Terena-shaped for Terena; mini worlds use seeded electorates for national races)
- Deep Party nomination rule graph editor (labels/presets only)
- Fake regime name inventory (combinations of real constitutional settings define the system)

## Related docs

- `scenario-option-coverage.md`
- `tablet-qa.md`
- `beginner-task-audit.md`
- `READINESS.md` (historical kickoff inventory; superseded by this COMPLETE mark)
