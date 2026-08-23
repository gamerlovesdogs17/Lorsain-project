# Phase 11 Integration Test Plan

Status key: **PASS** · **FAIL** · **BLOCKER** · **NONBLOCKING** · **PARTIAL**

Phase 11.1 closes the recurring election and career loop required for v1. Future-cycle failures are blocking: a regular election must naturally create a field, preserve player choice, resolve, survive save/reload, update officeholders, and schedule the next cycle. Scenarios are marked PASS only after automated execution or an actual browser workflow.

## A. Career and election cycles

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| A1 | 2028 presidential election and January 2029 transition | PASS | `phase11.integration.test.ts`; existing 2028 election and nomination archives are hashed before the later cycle |
| A2 | 2030 Assembly filing opens before election day | PASS | Typed `AssemblyElectionCycleState`; deterministic national allocation; closeout tests |
| A3 | Adrian Joric explicitly runs, campaigns, appears on ballot, and reaches June transition | PASS | Automated reload matrix plus 1440/900/600/390 browser workflow |
| A4 | Adrian Joric declines, is absent from ballot, leaves office, and remains playable | PASS | Closeout test plus 390px browser workflow |
| A5 | Eligible non-incumbent files, campaigns, and wins or loses normally | PASS | Alina Fairwin automated and 900px browser workflows |
| A6 | 2030 Assembly count persists 48 typed STV archives and seats exactly 420 MPs | PASS | Closeout/integration tests and Assembly-specific result inspection |
| A7 | 2033 nominations are created naturally for the exact future election | PASS | Observer and Ana paths; no candidate injection |
| A8 | 2033 field finalizes naturally, election resolves, and January 2034 transition occurs | PASS | Observer and player-contender integration tests plus browser workflows |
| A9 | Next presidential and Assembly elections schedule after transitions | PASS | 2038 presidential and 2034 Assembly assertions |
| A10 | Former officeholders and defeated candidates remain playable without automatic jobs | PASS | Mara, Adrian-decline, Ana nomination-loss, and ordinary observer paths |

## B. Election invariants

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| B1 | Allocation is independent of constituency iteration order | PASS | `phase11.closeout.test.ts` |
| B2 | Candidate is in at most one Assembly race | PASS | Closeout test and save validation |
| B3 | Player incumbent is absent unless explicitly filed | PASS | Adrian decline path |
| B4 | Candidates are eligible, living, not retired, and have legitimate affiliation | PASS | Closeout allocation assertions |
| B5 | Every winner is a finalized candidate; no duplicate winners | PASS | Closeout and integration assertions |
| B6 | Every constituency has at least its magnitude; all 420 seats fill | PASS | Closeout test and 20-seed calibration |
| B7 | Challenger supply is not consumed by early constituency IDs | PASS | National round-robin allocation plus order-independence test; 0/48 uncontested in 20 seeds |
| B8 | Campaign organization has a bounded effect on first preferences | PASS | Paired controlled closeout test |
| B9 | Campaign status becomes won/lost/completed or remains withdrawn after election | PASS | Closeout and integration assertions |
| B10 | Speaker, party totals, composition, map, and permissions remain valid after June 1 | PASS | Integration invariants and browser result/transition inspection |

## C. Save, load, migration, and history

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| C1 | Assembly save/reload before filing, after filing, during campaign, before/after count, and before/after assumption | PASS | Adrian and non-incumbent integration tests |
| C2 | 2033 save/reload before entry, during nomination campaign, after nomination, before/after election, and after assumption | PASS | Ana and observer integration tests |
| C3 | Same seed/actions twice and checkpoint reloads produce identical hashes | PASS | `runDeterministicHorizon` and cycle-specific hash comparisons |
| C4 | Schema v10 saves migrate deterministically to v11 | PASS | Closeout migration test; old Assembly summaries become typed legacy archives |
| C5 | 2028 election and nomination history remains unchanged after 2033 | PASS | Stored hash assertions |
| C6 | 2030 and 2033 results remain inspectable without current-office rewrites | PASS | Typed archives and Elections UI current/history selector |

## D. UI and browser QA

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Filing controls at 1440px and 900px | PASS | Adrian incumbent and Alina non-incumbent screenshots |
| D2 | Assembly campaign actions at 900px | PASS | Adrian/Alina campaign actions; no horizontal overflow |
| D3 | Indeterminate Assembly count at 600px | PASS | Worker count screenshot; one invocation; controls disabled |
| D4 | Assembly national and constituency results at 390px | PASS | Party summary, 420/211 context, C007 preferences/elected/rounds |
| D5 | 2033 observer nominations at 1440px | PASS | Six fresh party contests, five NPC entries each, 2028 retained below |
| D6 | 2033 player nomination controls at 600px | PASS | Ana declare/support/debate/fundraise workflow; no horizontal overflow |
| D7 | Post-election Executive reflects new President | PASS | Jonah Ravel shown as President in January 2034 |
| D8 | New election UI exposes public labels, not internal IDs | PASS | Manual result and campaign inspection |

## E. Performance and packaging

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| E1 | 20-seed field/count/persistence calibration | PASS | `pnpm calibrate:assembly` |
| E2 | Assembly count leaves UI responsive | PASS | Dedicated Web Worker; observed click return 278–306 ms with indeterminate state |
| E3 | Count is invoked once and restores deterministic final state | PASS | Worker protocol and browser/integration hash checks |
| E4 | Production build and existing foreign calibration remain valid | PASS | Closeout validation commands |
| E5 | Bundle size reduction | NONBLOCKING | Main JS remains about 10.8 MB; code splitting is Phase 11.2 debt |

## Failure log

No Phase 11.1 recurring-election or career-continuity blocker remains. Visual polish, deeper court content, richer foreign domestic politics, and bundle splitting remain explicitly outside this closeout.
