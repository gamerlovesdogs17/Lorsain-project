# Phase 11 Integration Test Plan

Status key: **PASS** · **FAIL** · **BLOCKER** · **NONBLOCKING** · **PARTIAL**

Phase 11.1 focuses on full-game integration QA. Scenarios are marked only after exercise (automated harness and/or manual browser play), not code review alone.

## A. Career / election cycles

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| A1 | 2028–2029 presidential cycle (MP hands-off through IRV + Jan 2029) | PASS | `phase11.integration.test.ts` 2029 transition |
| A2 | Presidential contender campaign commands (Ana Mirev path) | PASS | Existing `playable-path.test.ts` + Phase 7.1 manual path preserved |
| A3 | Sitting President Mara Velic → term end → still playable | PASS | `phase11.integration.test.ts` Mara continuity |
| A4 | 2030 Assembly election resolve + June 1 seating (420 seats) | PASS | `RESOLVE_ASSEMBLY_ELECTION` + assumption; integration test |
| A5 | Multi-year determinism with checkpoint save/reload | PASS | `runDeterministicHorizon` 36 months, MP seed |
| A6 | Next presidential cycle after 2029 (2033 horizon) | PARTIAL | Scheduled by existing presidential assumption; not fully playtested in 11.1 UI |
| A7 | Governor / non-federal office (no MP/President powers) | PASS | Existing playable-path governor negative commands |
| A8 | Constitutional Court justice actionable path | PARTIAL | Role selectable; depth remains NONBLOCKING (P8-*) |

## B. Cross-system integrations

| ID | Scenario | Status | Notes |
| --- | --- | --- | --- |
| B1 | campaign ↔ election | PASS | Vertical slice + integration advance |
| B2 | election ↔ office terms / permissions | PASS | President + Assembly assumption |
| B3 | legislature ↔ executive | PASS | Prior phase tests + long advance |
| B4 | legislature ↔ treaties | PASS | Phase 10.2 ratification path preserved |
| B5 | executive ↔ war powers | PASS | Phase 10.2 war-auth referral preserved |
| B6 | courts ↔ legislation/executive | PARTIAL | No new court deadlock found in 36-month run |
| B7 | economy / orgs / media coherence | PASS | Invariants + no NaN in harness |
| B8 | foreign ↔ domestic President resolver | PASS | Phase 10 tests + 48-country invariant |
| B9 | maps after elections | PARTIAL | Manual browser sample; no automated visual |
| B10 | archive history immutability | PARTIAL | Election records persist; deep wiki polish deferred |

## C. Save / load / migration

| ID | Scenario | Status | Notes |
| --- | --- | --- | --- |
| C1 | Mid-run save/reload hash match | PASS | Integration harness checkpoints |
| C2 | Difficult interrupt saves (election due) | PASS | Continuous vs reload around presidential |
| C3 | Post-Assembly seating save/reload | PASS | 2030 Assembly test |
| C4 | Old schema migration fixtures on disk | NONBLOCKING | Still synthetic downgrades only (P4-SAVE-XREF family) |

## D. Player autonomy / permissions

| ID | Scenario | Status | Notes |
| --- | --- | --- | --- |
| D1 | No silent player political choices | PASS | Existing autonomy tests + command rejects after office loss |
| D2 | Role permission enforcement in sim layer | PASS | Mara post-presidency regulation reject |
| D3 | Confirm dialog above action drawer | PASS | Phase 10.2 closeout `2d00d53` |

## E. Performance / packaging

| ID | Scenario | Status | Notes |
| --- | --- | --- | --- |
| E1 | Ordinary month turn timing | PASS | See `PHASE_11_1_RESULTS.md` |
| E2 | Election month timing | PASS | Presidential + Assembly measured |
| E3 | Web Worker decision | NONBLOCKING | Not required; leave `P7-WORKER` |
| E4 | Bundle size | NONBLOCKING | Still ~10.7MB; code-split deferred |

## Failure log

None open as BLOCKER after 11.1 fixes. Assembly 2030 incompleteness (former P4-ASM-2030) was a multi-cycle **BLOCKER** and was fixed with a minimal national STV resolver + assumption path.
