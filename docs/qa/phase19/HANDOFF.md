# Phase 19 handoff notes

Working inventory while finishing the combined Scenario Studio option-coverage + usability pass.

## Shipped in this pass (code)

- Shared `packages/scenario/src/optionCatalogs.ts` (engine-aligned IDs + human labels)
- Full Constitution order fields in Scenario Studio (`ConstitutionOrderFields`)
- Bounded Party `ideologyFamily` + optional `ideologyLabel`
- Law catalog picker; Person background catalog; Political skill via `skill:` trait (not `background`)
- Optional Tutorial Mode + Settings reset; no permanent coach
- Constitutional amendments in shared Assembly vote / whip subject path
- FORM A GOVERNMENT coalition workspace (qualitative partners; no exact scores)
- Tablet/iPad CSS breakpoints; glossary in Settings → Interface
- Tests: option coverage, option→world init, constitutional assembly, government formation

## Still verify before calling COMPLETE

- Quality / Integration / Pages / 2y smoke green on tip
- Manual tablet matrix fill-in (`tablet-qa.md`)
- Beginner script re-walk (`beginner-task-audit.md`)
- Visual captures (desktop + tablet) at tip SHA
- Phase 18 custom Extended still green if unchanged path

## Explicit non-goals preserved

- No Scenario Browser / extra bundled scenarios
- No permanent advisor / turn-transparency panels
- No Phase 18E / 19A / 19B split
- No Phase 20 certification work yet
