# Phase 17A.2 Government QA status

Final mechanical fixtures: `packages/sim/src/phase17a.government.test.ts` (8/8).

| Assertion | Status |
|-----------|--------|
| Budget hold vs full vs cut → different totals / fiscal path | PASS |
| Implementation response changes state + history; unauthorized rejected | PASS |
| Agenda exact `billId` (Housing B not A); stale status | PASS |
| Regulation jurisdiction (interior housing ok; defense rejected) | PASS |
| Cabinet reshuffle changes officeholder + history | PASS |

## Screenshot QA

**Not yet captured on this SHA.** Required before Phase 17A COMPLETE:

Desktop: Overview, Executive, Cabinet, selected minister, Agenda, implementation problem, Budget, coalition Cabinet, regulation workflow.

390px: Overview, Cabinet, selected minister, Implementation, Budget — no horizontal overflow / clipped controls / bottom-nav obstruction.

Use `scripts/prephase17-capture-screenshots.mjs` (or a Phase 17A government variant) with Vite preview and record SHA / viewport / fixture / hash in the manifest.
