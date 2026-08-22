# Known issues and development policy

## Policy (from Phase 5 onward)

Classify every discovered issue.

**BLOCKING** — fix immediately:

- reachable through legitimate gameplay
- corrupts a legitimate save/state
- breaks determinism
- produces invalid election/campaign mathematics
- violates a major canonical political rule in normal play
- prevents the 2028–2029 vertical slice from functioning

**NONBLOCKING / BACKLOG** — record and continue:

- requires manually corrupting save JSON
- validator accepts a state engine commands cannot naturally create
- concerns future cycles outside the vertical slice
- historical metadata could be stricter
- documentation mismatch
- minor coefficient/balance concern
- missing defensive validation with no normal gameplay failure

Do not stop an entire phase for nonblocking hardening.

---

## Phase 4 leftovers (nonblocking)

These were accepted as **not blockers** to Phase 5 unless Phase 5 directly touches the affected code or a failing test proves they are reachable through legitimate gameplay.

| ID | Severity | Issue |
| --- | --- | --- |
| P4-SAVE-XREF | NONBLOCKING | Hostile/tampered-save reference validation is incomplete. A hand-edited JSON save can still omit some cross-checks the engine would never produce. |
| P4-DRES-HIST | NONBLOCKING | Stricter DomainResolutionRecord historical proof validation (archive/event payload edge cases) beyond the legitimate 2028 path. |
| P4-POLL-SNAP | NONBLOCKING | Historical PollRecord snapshot/cross-reference strictness can still be tighter for impossible hand-edited records. |
| P4-FUTURE-CYCLE | NONBLOCKING | Future presidential-cycle integrity beyond the first vertical slice (2033+ Terena playthrough with Assembly 2030 still unresolved). |
| P4-PRES-STATUS | **FIXED in Phase 5** | `presidentialStatus` is now scenario-start metadata only. `seedStartingPublicStanding()` materializes it once; later `candidateStandingOrDefault()` / `ensureCandidateStanding()` do not reapply frontrunner/likely/possible/exploring. |
| P4-ASM-2030 | **FIXED in Phase 11.1** | National Assembly election resolves via `RESOLVE_ASSEMBLY_ELECTION` (incumbent + membership-party STV fields) and June 1 assumption seats 420 members; next Assembly election is scheduled. Full Assembly campaign/nomination pipeline remains light (NONBLOCKING depth). |
| P4-SPECIAL | NONBLOCKING | Special presidential-election integration is not a full domain (regular 2028 cycle is the vertical slice). |
| P4-REGIONAL-POLL | NONBLOCKING | Regional/specialist pollsters are rejected until geographic coverage is modeled. |
| P4-IND-PETITION | NONBLOCKING | Independent qualification is an explicit evidence hook; petitions/signatures are deferred. |
| P4-PYTHON | NONBLOCKING | `python scripts/validate_content.py` requires a real Python 3 install; Windows Store stub may exit 9009. `pnpm validate:content` and `pnpm validate:phase0b:recount` are the supported Node path. |

No Phase 4 **BLOCKING** items remain for the 2028–2029 supported gameplay path.

---

## Phase 5 notes

Phase 5 campaign simulation is **COMPLETE** at `e3a6aae`.

| ID | Severity | Issue |
| --- | --- | --- |
| P5-SAVE-XREF | NONBLOCKING | Campaign JSON that cannot be produced by engine commands (orphaned CAMP ids, extra debate participants, extra recent-effect rows, malformed CampaignState/DebateState) is not exhaustively hostile-validated. |
| P5-FINANCE-CAT | NONBLOCKING | Fundraising is a single aggregate stream, not donor categories. Politically meaningful but not FEC-style. |
| P5-ASM-CAMPAIGN | NONBLOCKING | Assembly campaign type exists, but 2030 Assembly candidate generation / full Assembly campaign loop is still incomplete (carries P4-ASM-2030). |
| P5-QUAL-GATES | **FIXED** | Qualification uses campaign milestones and real endorsements; DEV evidence injection is not required for the 2028 path. |
| P5-POLL-CADENCE | NONBLOCKING | Monthly public polls rotate one nomination contest plus one general field rather than firing every pollster every day. Cadence is approximate. |
| P5-ATTACK-LEADER | NONBLOCKING | NPC attack targeting uses public standing order among active same-race rivals, not a full poll-based targeting planner. |

---

## Phase 6 notes

Phase 6 legislature is **COMPLETE** at `3c976fa`.

| ID | Severity | Issue |
| --- | --- | --- |
| P6-COMMITTEES-CANON | NONBLOCKING | Committees are functional dimension scaffolding, not the richer canonical committee content that may arrive later. |
| P6-MAJORITY-DEFAULT | NONBLOCKING | Ordinary committee/floor/amendment majority is simple majority of votes cast (tie fails). That is an implementation default, not a quoted constitutional rule. Repassage after return uses the world constitutional absolute majority (Terena 211 of 420 authorized seats, including when a seat is vacant). |
| P6-SAVE-XREF | NONBLOCKING | Hostile legislature JSON (orphaned BILL/AMD/LVOTE/LAW ids, invented committee membership) is not exhaustively cross-validated. |
| P6-NEGOTIATION | NONBLOCKING | Committee negotiation is a small magnitude-softening amendment, not a full multi-round bargain with side payments. |
| P6-WHIP | NONBLOCKING | Whip estimates are imperfect public ranges, not a calibrated polling model. |
| P6-VITEST-RPC | NONBLOCKING | Vitest workers time out RPC at 60s per file. The Phase 5 four-seed realism harness was split into `campaigns.realism.test.ts` (2 seeds) so each file stays under that limit after 420-MP legislative months. |

---

## Phase 7 notes

Phase 7 Executive + Playable UI is **COMPLETE**. Phase 8 Courts + Constitutional System is **COMPLETE**.

No Phase 7 **BLOCKING** items remain for the first manual playtest path (title → New Game → Play → End Turn; player President chooses ministers).

| ID | Severity | Issue |
| --- | --- | --- |
| P7-SAVE-XREF | NONBLOCKING | Hostile executive JSON (orphaned REG/MOT/EMG/WAR/BUD ids, invented ministry records) is not exhaustively cross-validated. |
| P7-MINISTRY-DEPTH | NONBLOCKING | Ministries only store administrativeCapacity / currentPriorities. Deep cabinet politics and Phase 9 economic effects are deferred. |
| P7-BUDGET-ECON | NONBLOCKING | Budget is indexed envelopes and continuity, not a macroeconomy. |
| P7-UI-POLISH | NONBLOCKING | First playable UI is information-dense and unpolished. Charts, chamber animation, map analytics, and typography wait for Phase 11. |
| P7-WORKER | NONBLOCKING | Turns run on the main thread with a processing indicator. Phase 11.1 measured ordinary months ~0.7s median and Assembly resolve ~12s on the integration host; Web Worker still deferred (not required to unblock play). |
| P7-REG-ANNUL-DEFAULT | NONBLOCKING | Regulation annulment uses simple majority of votes cast (tie fails). That is a Phase-7 procedural default, not a quoted constitutional rule. |

## Phase 7.1 notes

**Phase 7.1 First Playtest UX is COMPLETE (`670b38b`). Phase 8 Courts + Constitutional System is COMPLETE (`72733d4`). Phase 9 Economy/Organizations/Media is COMPLETE. Phase 9.5 UI System V3 shell is COMPLETE (`887b500`). Phase 9.6 UI System V3.1 is COMPLETE.**

| ID | Severity | Issue |
| --- | --- | --- |
| P95-INTERRUPT-LEAK | **FIXED in Phase 9.5** | Home/decisions no longer show raw `PRESIDENTIAL_ELECTION_DUE` or `Unresolved domain event …` strings. |
| P95-VOTE-FORMAT | **FIXED in Phase 9.5** | Election results use `formatPublicNumber()` — no `6205093/1` rational leak. |
| P95-CAMPAIGN-ACTIONS | **FIXED in Phase 9.5** | Campaign action buttons disable at 0 actions with visible `0 / N` counter. |
| P95-MAP-HOVER | **FIXED in Phase 9.5** | Map hover no longer calls persistent `onSelect`. |
| P96-MAP-FILL-CSS | **FIXED in Phase 9.6** | Constituency SVG `fill` attributes are no longer overridden by `fill: transparent`. |
| P96-MAP-PLURALITY | **FIXED in Phase 9.6** | Multi-member constituencies use sitting-seat plurality; exact ties are a neutral fill. |
| P96-TRADE-BASELINE | **FIXED in Phase 9.6** | Neutral Trade sector no longer collapses 100→70 on the first processed month. |
| P96-EMPLOYMENT-LABEL | **FIXED in Phase 9.6** | Home shows Employment index for `employmentIndex`. |
| P96-PRES-MAP | **FIXED in Phase 9.6** | Presidential election tab no longer paints Assembly incumbency as presidential geography. |
| P9-BUNDLE-SIZE | NONBLOCKING | Production game bundle ~10.5MB (GeoJSON in client). Code-split or server-side map prep in Phase 11. |
| P9-CITY-PLACEMENT | NONBLOCKING | Canonical city JSON uses authoring x/y; runtime map places cities at province centroids + offset. Documented in `@lorsain/map`. |
| P9-FORMAT-CRLF | NONBLOCKING | Repo-wide `format:check` may fail on pre-existing CRLF files; format only Phase 9 touched files when committing. |
| P9-PYTHON | NONBLOCKING | `python scripts/validate_content.py` may exit 9009 on Windows Store stub. |
| P9-UI-POLISH | NONBLOCKING | Phase 9.6 completes V3.1 game-facing screens; chamber animation and generated newspaper copy wait for Phase 11. |
| P96-CHAMBER-SEMICIRCLE | NONBLOCKING | Assembly overview uses a composition bar and grouped seat blocks, not a physical semicircle. |
| P96-NEWS-PROSE | NONBLOCKING | News groups outlet treatments under public events; it does not write original newspaper copy. |
| P96-EXEC-DEPTH | NONBLOCKING | Presidential desk uses cards/drawers; appointment search is still a compact list, not a full personnel UI. |
| P95-SCREENSHOTS | NONBLOCKING | Automated visual regression / screenshot CI not yet wired. |

## Phase 10 / 10.1 / 10.2 notes

**Phase 10.1 Foreign Affairs functional completion is COMPLETE** (builds on Phase 10 at `9b3bda7`). **Phase 10.2 institutional deepening** closes treaty ratification DecisionContract crash, Assembly war-authorization referral, canonical WA/LTO membership, Security Council veto canon, leadership schedule/name/monarchy fixes, and bounded institution consequences. **Phase 11.1 integration COMPLETE** (see below).

| ID | Severity | Issue |
| --- | --- | --- |
| P10-CAL-HORIZON | RESOLVED (10.1) | `pnpm calibrate:foreign` uses a calibration-only foreign month driver (`advanceForeignCalibrationMonths`) and completes full 15-year horizons without domestic election interrupts. |
| P10-FOREIGN-PARLIAMENTS | NONBLOCKING | Foreign domestic politics remain abstract (leader turnover only). No foreign election campaigns. |
| P10-WA-SIM | RESOLVED (10.2) | Canonical membership in `world_institutions.json` (WA 48, LTO 43, DC 13, CSC 5, NAF 20). Great-power SC vetoes W24/W28/W37/W40 (not W13). Bounded WA/LTO/CSC/NAF consequences. Not a full UN simulator. |
| P10-FOREIGN-TEST-SLOW | NONBLOCKING | Foreign integration tests advance many months per case (~4–9 min total in full suite). Acceptable for CI; consider splitting in Phase 11. |
| P10-VITEST-TIMEOUT | NONBLOCKING | Full `pnpm test` may report a Vitest worker timeout after all tests pass on slow hosts. |
| P10-WORLD-BUNDLE | NONBLOCKING | World SVG embedded in client bundle increases size; same code-split opportunity as P9-BUNDLE-SIZE. |
| P101-VASK-WAR-RATE | NONBLOCKING | Vaskara–Terena armed conflict is possible but rare in 15-year calibration (latent tension + deterrence); not guaranteed by design. |
| P101-TREATY-LEG-VOTE | RESOLVED (10.2) | Ripe ratification no longer crashes DecisionContract (empty targetIds). Threshold is `simple_majority_cast` (yes > no). Real `legislativeVotes` + Assembly display title. |
| P102-INST-DEPTH | NONBLOCKING | Institutions remain light-touch: mediation/condemnation/bloc effects are bounded, not a full multilateral negotiation sim. |
| P102-ALLIANCE-EXIT | NONBLOCKING | Hard alliances can terminate after prolonged bilateral collapse + long tenure; still not a rich withdrawal-politics model. |

## Phase 11.1 notes

**Phase 11.1 Full-game integration is COMPLETE.** See `docs/PHASE_11_1_RESULTS.md` and `docs/PHASE_11_INTEGRATION_TEST_PLAN.md`.

| ID | Severity | Issue |
| --- | --- | --- |
| P111-ASM-2030 | **FIXED** | Assembly election domain resolver + assumption + UI resolve control. |
| P111-PERF | NONBLOCKING | Ordinary months exceed aspirational 250ms on measured host (~734ms median); still playable. Assembly national STV ~12s. |
| P111-WORKER | NONBLOCKING | Same as P7-WORKER — no worker shipped in 11.1. |
| P111-BUNDLE | NONBLOCKING | Same as P9-BUNDLE-SIZE — ~10.5MB client bundle. |
| P111-ASM-CAMPAIGN | NONBLOCKING | Assembly resolver does not yet run a full nomination/campaign season before STV. |
| P111-SCREENSHOTS | NONBLOCKING | Populated visual QA screenshots deferred to 11.2. |
| P111-MIGRATION-FIXTURES | NONBLOCKING | On-disk historic save fixtures still not checked in. |

## Phase 8 leftovers

| ID | Severity | Issue |
| --- | --- | --- |
| P8-DOCTRINE | NONBLOCKING | No full written opinions, standing doctrine, interlocutory appeals, or lower courts. |
| P8-CASELAW-UI | NONBLOCKING | Precedent summary is a short list, not a case-law search system. |
| P8-PARTIAL-INVALIDATION | NONBLOCKING | Phase 8 uses whole-law disposition rather than item-level invalidation. |
| P71-UI-POLISH | NONBLOCKING | Presentation is functional, not final. Charts, animation, map analytics, and typography wait for Phase 11. |
| P71-NEWS | NONBLOCKING | Home briefing uses structured events, not generated newspaper copy (Phase 9). |
