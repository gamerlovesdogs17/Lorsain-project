# Phase 12 Political Life & NPC Agency — Results

Date: 2026-09-06

## Determination

**PARTIAL → core COMPLETE for agency glue; UI and edge cases remain light.**

Phase 12 delivers monthly NPC political agency so the world moves without the player: careers, open-seat recruitment, leadership support explanations, caucus agendas, post-election platform reviews, rare party lifecycle, memory/relationship hardening, cabinet reshuffles, org scorecards, and coalition agreements. Wired into the monthly engine after party institutions and before organizations.

## Delivered

### Sim module `packages/sim/src/politics/`

| File | Role |
| --- | --- |
| `types.ts` | `Phase12Runtime` + AS activity caps |
| `state.ts` | `ensurePoliticsRuntime`, parse, empty seed |
| `careers.ts` | Seek / retire / leadership / cabinet career decisions |
| `recruitment.ts` | Open-seat detection + party recruitment |
| `leadership.ts` | Support-bloc notes + NPC endorsements on contests |
| `caucusAgenda.ts` | Bounded `priorityBillIds` from platform/ideology |
| `platforms.ts` | Post-election `electoral_defeat` platform review |
| `lifecycle.ts` | Rare split/merge (+ fixture override for tests) |
| `memory.ts` | Alliance/rivalry from repeated endorsements/challenges |
| `cabinet.ts` | Occasional NPC presidential reshuffle |
| `organizations.ts` | Vote scorecards + issue campaigns |
| `coalitions.ts` | Agreements under `assembly_confidence` / no plurality |
| `agency.ts` | `processPoliticalAgencyMonth` orchestrator |
| `explain.ts` | `explainEndorsement` / `explainLeadershipSupport` |
| `index.ts` | Public exports |

### Engine / save

- Monthly pipeline: party → **political_agency** → organizations (commented in `engine.ts`)
- `SimState.politicsRuntime`; schema **20**; `migrateSaveV19ToV20` seeds empty runtime (no fabricated history)
- Public APIs exported from `packages/sim/src/index.ts`

### Tests

`packages/sim/src/phase12.agency.test.ts` covers careers, recruitment, leadership resolve, fixture split, memory round-trip, cabinet reshuffle, org scorecards, coalitions, NPC bills, 24-month autonomy bounds, monthly idempotency.

### UI (minimal)

- Home: opposition leader / coalition / open seats / leadership contests
- Politician dossier: vague public ambition + recent political memories
- Party page: leadership contest + lifecycle cooldown status

## Known limitations (PARTIAL)

- Open-seat path still leans on midterm vacancy countback for Assembly fills; recruitment is strongest around upcoming elections / recent exits
- Coalition model is lightweight (agreement record + History), not a full government-formation UI
- Party merge does not mark parties `defunct` in `PARTY_STATUSES` (members move; origin stays vacant)
- Why-UI factors exported but not yet a dedicated Why panel everywhere
- No Phase 13 budget/macro/foreign overhaul

## Verdict

> **PHASE 12 COMPLETE** for political agency (world moves without the player).
>
> Product surface remains intentionally light (Home / Party / dossier hooks) rather than many new screens.
> Full coalition-formation UX, universal Why panels on every endorsement surface, and defunct-party status marking stay as known limitations — not blockers for agency acceptance.