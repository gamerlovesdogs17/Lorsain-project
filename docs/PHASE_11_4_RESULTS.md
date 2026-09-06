# Phase 11.4 completion status

Date: 2026-09-06 (final mechanical-truth closeout)

## Phase 11.3

**ACCEPTED** (unchanged).

## Determination

**Phase 11.4 ACCEPTED** — core constitutional and legal mechanics are executable, tested, and historically stored. Remaining polish items are documented as known limitations, not blockers.

## Closeout delivered this pass

### Constitutional mechanical truth

- Strengthened executive: regulation annulment requires 2/3 Assembly fraction
- Emergency modes: durations aligned; Assembly confirmation deadline expires unconfirmed emergencies
- Treaty alternatives: removed unimplemented 3/4 sovereignty and provincial ratification claims; 2/3 supermajority remains real
- Defense control: copy matches unilateral-days mechanic (no fake three-officer concurrence)
- `unitary_party_republic` sets `partySystem: single_legal_party`
- One-party: removed “Party organs exercise state powers” overclaim
- Art XII: “11 of 21” correctly described as bare majority
- Referendum: `REFERENDUM_RESOLVED` History event with question, shares, turnout, result
- Entrenchment modes: none / heightened_threshold / election_interlock / referendum_core / hard_core

### Elections

- Closed-list PR (Hare / largest remainder)
- Compensatory MMP with national top-up and overhang expansion
- List MPs stored separately from constituency winners (`mmpListWinners*`)
- `assembly.electoralMethod` save/restore fixed

### Laws

- Control-specific UI (binary / categorical / numeric / duration / threshold)
- Proposal-specific / parameterized effects (audit: 100% runtime coverage of proposal options)
- Founding baselines renamed `founding_*` with `keep_*` migration aliases
- Provision history stack: repeal restores prior Act, not founding
- Natural option counts including genuine binaries

### Content / QA

- News short-window cooldown + structural diversity improvements
- Screenshots regenerated under `docs/qa/phase11_4/final/`
- Audits: `policy-effects-audit.json`, `repetition-audit.json`, `news-repetition-audit.md`

## Known limitations (non-blocking)

- Full provincial treaty ratification not modeled (alternative reworded)
- Defense concurrence of President/PM/Chief of Defence not modeled (reworded to days)
- Referendum is simplified national resolution (no campaign dynamics)
- Screenshot matrix does not yet cover every optional Lawbook amend/repeal visual state
- Map-centric Home deferred to Phase 11.5 experiment

## Verdict

> **PHASE 11.4 ACCEPTED**
