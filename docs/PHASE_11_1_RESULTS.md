# Phase 11.1 Results — Recurring elections and career continuity closeout

**Baseline:** `ba0f184`
**Scope:** Phase 11.1 closeout only. Phase 11.2 has not started.

## Verdict

The core recurring political loop now works through the natural 2028, 2030, and 2033 calendars. Assembly candidacy is a persisted pre-election lifecycle rather than a ballot synthesized at count time; player entry is always affirmative; future presidential nominations belong to their exact election; both systems preserve history, resolve deterministically, update officeholders, and schedule the next regular cycle.

No DEV candidate injection is used by the recurring-cycle tests or browser playthroughs.

## 2030 Assembly architecture

- `AssemblyElectionCycleState` stores filing/finalization dates, constituency fields, candidacies, party seat baselines/totals, and typed constituency results.
- The filing window opens in December 2029. The player receives an explicit run/decline decision and is never auto-filed.
- NPC incumbents decide autonomously. Eligible challengers are assigned once at national scope using deterministic coverage rounds, geography, party need, career state, and public standing. Assignment does not depend on constituency processing order.
- The existing 530-person roster supports credible fields, so generated candidates were not necessary.
- A filed player receives one legitimate Assembly campaign tied to an election and constituency. Bounded constituency organization affects ballot preference weights; it never edits vote totals or guarantees victory.
- Election cleanup marks winning/losing campaigns complete while preserving withdrawn history.

## Player paths

- **Adrian Joric — run:** filing decision creates a C007 candidacy and Assembly campaign. Browser actions increased field organization and raised funds. The election included him; in the observed run he won and began a new term on 2030-06-01.
- **Adrian Joric — decline:** no candidacy or ballot entry was created. His term ended on 2030-06-01, MP permissions disappeared, Career recorded the ended term, and End Turn remained available as a private citizen.
- **Alina Fairwin — non-incumbent:** filed in home Constituency 6, campaigned, and in the observed run won a term beginning 2030-06-01. Tests accept either legitimate win or loss.

## Assembly result archive and UI

Each of the 48 `AssemblyConstituencyResult` records persists the finalized candidate field, party snapshots, first preferences, turnout, elected IDs, and the typed STV count archive including rounds and tie/lot records. The national election stores references and aggregates instead of duplicating a giant synthetic national ballot.

The Assembly result screen is separate from the presidential screen: national party seats and changes, 420-seat/211-majority context, composition, map, constituency picker, magnitude/turnout, candidate first preferences, elected MPs, and expandable STV rounds. Internal election, campaign, candidate, and transfer IDs are not shown in normal presentation.

## 20-seed Assembly calibration

| Metric | Min | Mean | Median | Max |
| --- | ---: | ---: | ---: | ---: |
| Candidates | 498 | 498 | 498 | 498 |
| Candidates per seat | 1.186 | 1.186 | 1.186 | 1.186 |
| Uncontested constituencies | 0 | 0 | 0 | 0 |
| Incumbent candidates | 419 | 419 | 419 | 419 |
| Incumbent winners | 372 | 376.15 | 376 | 379 |
| Challenger winners | 41 | 43.85 | 44 | 48 |
| Incumbent reelection rate | 88.8% | 89.8% | 89.7% | 90.5% |
| Party seat change | 17 | 22.7 | 23 | 26 |
| Turnout | 57.8% | 58.0% | 58.0% | 58.3% |
| Represented parties/independent grouping | 7 | 7 | 7 | 7 |

The fixed candidate count reflects a deterministic filed field from the same eligible roster, not hardcoded constituency sizes; vote transfers, winners, turnover, party changes, and turnout vary by count seed. Most importantly, the prior 41/48 mathematically uncontested failure is now 0/48 in every sample.

## Recurring 2033 presidential architecture

The January 2029 assumption schedules `ELEC_PRES_2033` and creates six fresh cycle-specific nomination contests. Each contest records its election ID/date, cycle, party, dates, and status. Runtime candidate interest uses current eligibility, party, office/career state, standing, leadership, prior history, term limits, and political context; scenario-start 2028 labels are not reused. The player is excluded from NPC entry and must declare after the contest opens.

Current-cycle helpers select the relevant unresolved/upcoming election. Nomination winners synchronize into that exact general election, finalize its field, and leave all 2028 archives immutable. The natural 2033 election resolves, the winner assumes office in January 2034, and the next regular presidential election is scheduled for 2038.

In the observer browser run, NPC parties autonomously produced six contests with five entries each; Jonah Ravel won the 2033 election and became President. In the Ana Mirev browser run, Ana declared in February 2033, used nomination support, fundraising, and debate preparation through August, lost the Labour nomination, remained Governor, and the general election plus January transition continued normally.

## Determinism and save/reload

- Assembly hashes match across reloads before filing, after filing, during campaign, immediately before/after count, and before/after June assumption.
- Presidential hashes match before player entry, during the nomination campaign, after nomination, before/after election, and after January 2034 assumption.
- Same-seed continuous/reload horizons remain identical.
- Schema v11 validation preserves typed fields and archives; v10 migration deterministically retains the former Assembly summary as a legacy archive.
- 2028 presidential and nomination hashes remain unchanged after completing 2033.

## Performance

20-seed production-style core measurements:

| Metric | Min | Mean | Median | Max |
| --- | ---: | ---: | ---: | ---: |
| Candidate-field generation | 114.265 ms | 121.350 ms | 116.430 ms | 142.299 ms |
| One constituency STV | 87.062 ms | 175.326 ms | 129.266 ms | 506.329 ms |
| Full 48-constituency resolve | 5698.779 ms | 6439.521 ms | 6414.832 ms | 7345.187 ms |
| Result serialization | 9.568 ms | 10.240 ms | 10.173 ms | 11.995 ms |

The final full-suite integration pass measured ordinary election resolution at 554 ms median/778 ms maximum, synchronous Assembly resolution at 12,157 ms, June assumption at 109 ms, and the natural 2033 presidential resolution at 940 ms. The browser invokes the national count once in a dedicated Web Worker, shows an honest indeterminate “Counting election…” state, and disables duplicate action. Observed UI-thread click return was 278–306 ms; observed complete counts were approximately 14–37 seconds in the hot Vite development session. The restored result was deterministic and landed on 2030-06-01 with 420 MPs.

## Browser QA

Actual browser workflows were completed at 1440, 900, 600, and 390 pixels:

- Adrian run: explicit filing, Assembly campaign actions, worker count, C007 result/round inspection, June transition.
- Adrian decline: ballot absence, ended term, no office, continued time advancement.
- Alina Fairwin non-incumbent: filing, campaign, count, election outcome, June transition.
- Ana Mirev 2033: natural contest, explicit entry, campaign actions, nomination loss, national election, January 2034 transition.
- Alina observer: autonomous 2033 nominations/election, old 2028 contests retained, 2038 election scheduled.

No tested width produced horizontal document overflow.

## Remaining debt

No known Phase 11.1 blocker remains. Genuine nonblocking debt is limited to broad V3.1 visual refinement, production bundle splitting, richer court/doctrine and foreign domestic-politics depth, hostile hand-edited-save cross-reference hardening, and checked-in historical migration fixtures. These are not part of this closeout.

## Validation

The final full suite passed 47 files and 468 tests with no unhandled runner errors. The Phase 11 harness contributed 14 passing closeout/integration tests. Both required 20-seed calibrations passed: the foreign harness completed 180 months per seed, and the Assembly harness completed every 420-seat count. Build, game build, typecheck, lint, content validation, and the Phase 0b recount are part of the same closeout validation set.
