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
| P4-PRES-STATUS | NONBLOCKING at Phase 4 close; **Phase 5 must fix** | `candidateStandingOrDefault()` reapplied canonical `presidentialStatus` (frontrunner/likely/possible/exploring) on every default derivation. Scenario-start metadata only; materialize once. |
| P4-ASM-2030 | NONBLOCKING | Incomplete actual 2030 Assembly candidate-generation domain. Synthetic STV resolver exists; Terena 2030 field is not yet a full campaign/candidate pipeline. |
| P4-SPECIAL | NONBLOCKING | Special presidential-election integration is not a full domain (regular 2028 cycle is the vertical slice). |
| P4-REGIONAL-POLL | NONBLOCKING | Regional/specialist pollsters are rejected until geographic coverage is modeled. |
| P4-IND-PETITION | NONBLOCKING | Independent qualification is an explicit evidence hook; petitions/signatures are deferred. |
| P4-PYTHON | NONBLOCKING | `python scripts/validate_content.py` requires a real Python 3 install; Windows Store stub may exit 9009. `pnpm validate:content` and `pnpm validate:phase0b:recount` are the supported Node path. |

No Phase 4 **BLOCKING** items remain for the 2028–2029 supported gameplay path.

---

## Phase 5 notes

Phase 5 campaign work records additional issues below as they are found. Do not mark Phase 6 started here.
