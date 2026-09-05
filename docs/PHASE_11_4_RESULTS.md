# Phase 11.4 completion status

Date: 2026-09-05

## Phase 11.3

**ACCEPTED** (unchanged). Functional acceptance remains on the `f817f01` lineage; tip docs may be later.

## Previous Phase 11.4 issues corrected in this pass

| Issue | Fix |
| --- | --- |
| Campaign screenshot showed inactive campaign | Added `active-campaign` QA fixture; capture uses it |
| Election Night screenshot was same as Elections / certified replay | Added `election-night-partial` fixture with fresh Election Night (`isFreshElectionNight`) |
| Campaign situations invented debates/rallies/dark-money/doubling | Rewrote titles to state-based framing; removed `debate_moment` |
| Crisis themes invented border/expulsions/closures | Themes gated to neighbors/sanctions/trade/maritime posture; generic fallback is diplomatic confrontation |
| Content tests asserted hardcoded strings | Tests now call `headlineFor`, `assignCrisisTheme`, and ban invented wording |
| Constitution dual UX without shared alternatives | Unified modeled-rule alternatives (4 each) + proposed clause text + red/green diff preview |
| Assembly leadership hidden behind disclosure | Leadership rail + tighter hemicycle shown simultaneously |

## What is IMPLEMENTED (this completion pass)

### Correctness / QA
- Narrative truthfulness pass
- Real generator tests
- Active campaign + fresh Election Night fixtures
- Capture script wired to those fixtures

### Constitution (modeled rules)
- `CONSTITUTIONAL_LEGAL_VALUES` with 4 options per rule
- `constitutionAlternatives.ts` clause text + mechanical summaries
- Proposal stores `proposedText`
- Unlimited presidential terms (`0`)
- Diff helper + Assembly Business preview UI
- Text-only amendments remain only for clauses without `runtime_rule_id` (honest split: modeled vs display text)

### Assembly
- Chamber stage: hemicycle + leadership rail together
- Tighter seat packing
- Leadership seats outlined; click leadership highlights chamber selection

## What remains incomplete (blocks full acceptance)

- Full Constitution document-centric editor (left TOC / center document / right inspector) still uses Assembly Business + Lawbook tabs rather than a dedicated document workspace
- Free-text vs modeled paths are unified for **modeled rules**, but Lawbook free-text UX is not fully retired as a competing mental model for players
- Election Night “broadcast mode” / mid-count population fixtures beyond fresh certified first-view
- Priority 2 political depth expansions (party postmortems, org scorecards, career memory, governing agenda, court precedent, investigations, turn summaries, global search density) are only partially present from earlier 11.4 content work
- Representative multi-year repetition audit report artifact not yet published as a calibration JSON

## Determination

**Phase 11.4 NOT YET ACCEPTED**

Priority 0 and most Priority 1 structural requirements are landed and tested. Full acceptance waits on deeper Constitution document UX completion and broader Priority 2 political-depth playability, plus fresh reviewed screenshot evidence from the new fixtures on green CI/Pages.

## Feature revert map (this pass)

| Commit | Feature | Safe revert? | Dependencies |
| --- | --- | --- | --- |
| `bd667f8` | Narrative truthfulness | Yes | None |
| `fcb75eb` | Constitution alternatives + eligibility 0 | Mostly; revert with UI commit that consumes exports | `9a0a70d` uses exports |
| `8192cd5` | QA fixtures | Yes | Capture script |
| `9a0a70d` | Assembly stage + amendment preview UI | Yes if `fcb75eb` kept or UI imports adjusted | Prefers `fcb75eb` |

Earlier Phase 11.4 commits (`26e6582`, `cd6694b`, `12f4cdc`, …) remain the foundation visual/content pass.

## Docs / evidence locations

- This file: `docs/PHASE_11_4_RESULTS.md` (supersedes prior “accepted” overclaims)
- Fixtures: `docs/qa/phase11_4/fixtures/`
- Screenshots: `docs/qa/phase11_4/final/` (regenerate after this tip)
- Capture: `scripts/phase11_4-capture-screenshots.mjs`

Phase 11.5 has not begun.
