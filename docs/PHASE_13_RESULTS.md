# Phase 13 Governing & Policy Depth — Results

Date: 2026-09-06

## Determination

**PARTIAL** — foundation COMPLETE for implementation lag, capacity (national/department/**provincial**), departments, fiscal/budget cycle, agenda/promises hooks, policy interactions, ministerial performance, and minimal UI; deferred depth (full provincial conflict/Court path, full regulatory authorization chain, investigations, opposition governing response, dedicated budget institutional screen grammar) remains out of scope for this pass.

## Delivered

### Sim module `packages/sim/src/governing/`

| File | Role |
| --- | --- |
| `types.ts` | ImplementationStatus, DepartmentId, FiscalState, GovernmentAgenda, PromiseRecord, ImplementationRecord, ServiceOutcomes, CapacityState (incl. provinces), Phase13Runtime |
| `state.ts` | `ensureGoverningRuntime`, `emptyGoverningRuntime`, `parseGoverningRuntime` |
| `implementation.ts` | Law enactment → lag stages by policy type; capacity slows progress; accelerated/standard/phased posture |
| `capacity.ts` | National + department + **provincial** capacity (0–1); strain from accelerated implementation |
| `departments.ts` | Provision/issue → Cabinet ministry ownership |
| `fiscal.ts` | Revenue/expenditure/balance/debt from current-law parameters (normalized units) |
| `budget.ts` | Annual cycle on executive budgets + Assembly outcomes; passage/failure consequences |
| `agenda.ts` | Agenda from platform + coalition + crises |
| `promises.ts` | Campaign/platform/coalition promise status from bills/laws/implementation |
| `interactions.ts` | High-value synergies/strains + contradiction detection |
| `performance.ts` | Ministerial performance from capacity + implementation record |
| `monthly.ts` | `processGoverningMonth` orchestrator |
| `index.ts` | Public exports |

### Engine / save

- Monthly pipeline: legislature → executive → **governing** → courts (commented in `engine.ts`)
- `SimState.governingRuntime`; schema **21**; `migrateSaveV20ToV21` seeds empty runtime (no fabricated history)

### UI (minimal)

- Lawbook Acts: implementation status / department / progress when present
- Home (executive/president): government agenda + fiscal snapshot
- Economy screen: national fiscal summary when governing fiscal has updated

### Tests

`packages/sim/src/phase13.governing.test.ts` covers:

1. Implementation stage progress
2. Low capacity slows implementation
3. Fiscal updates from policy
4. Budget passage / failure consequence
5. Department ownership
6. Policy contradiction/interaction
7. Save/load governingRuntime + v20→v21 migration
8. Accelerated posture raises strain
9. Provincial capacity damps implementation
10. Promise status follows law/implementation
11. Ministerial performance reflects governing record

## Known limitations (PARTIAL)

- Provincial national/competence conflict + Court challenge path not fully modeled (capacity hook only)
- Regulatory secondary-legislation authorization is not expanded beyond existing executive regs
- Promise tracking uses platform/coalition hooks only (no full campaign-promise content feed)
- Service outcomes are coarse indices, not constituency-facing delivery politics
- No dedicated Budget institutional screen grammar beyond economy/home summaries
- Investigations / Cabinet meeting events / opposition governing response deferred

## Explicitly deferred (Phase 14+)

- Campaigns/Elections 2.0, convention/debate overhauls, scenario editor, foreign expansion

## Verdict

> **PHASE 13 PARTIAL** — governing foundation is real and wired (including provincial capacity damping); remaining Phase 13 design letters (full budget UI grammar, investigations, opposition response, regulatory depth) are intentional follow-ons, not blockers for this foundation acceptance.
