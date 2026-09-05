# Phase 11.4 completion status

Date: 2026-09-05 (executable Constitution + law depth pass)

## Phase 11.3

**ACCEPTED** (unchanged).

## Determination

**Phase 11.4 NOT YET ACCEPTED**

Core blockers advanced substantially in this pass (canonical mapping, executable order fields, law depth, constitutionality gates, Quick Amendments / Lawbook UX). Acceptance is still withheld because:

- full screenshot QA matrix for the new flows was not regenerated against this HEAD;
- Assembly modes `closed_list_pr` / `mixed_member` still count with STV (FPTP plurality winners are wired; others remain approximate);
- Priority 8–17 political-depth items (promises/agendas, mentorship, crises, global search polish, etc.) remain largely deferred;
- remote Pages must be verified against the handoff HEAD after push.

## What this pass fixed

### Priority 0 — Canonical Constitution
- Remapped mis-targeted amendment subjects to real clauses in `data/terena_constitution.json`
- Founding baselines now equal canonical clause text
- Fixed nonexistent `ART_VIII_S3_C1` → `ART_VIII_S2_C3`
- Court founding term corrected to **12 years**; Art XII province counts use **21**
- `constitutionValidation.ts` + tests fail loudly on bad targets / baseline mismatch

### Priority 2 — Executable Constitution
- `metricEffects` applied to `orderMetrics` + national economy indices on ratification
- Presidential election modes: RCV / plurality / majority runoff / **Assembly selection**
- Judicial review modes alter merits lean; `legislative_finality` blocks invalidation
- One-party / nonpartisan / restricted status via `partyAllowedUnderConstitution` + `partyLegalStatus` on nominations, presidential field, Assembly filing
- Article XII thresholds dynamic; referendum path enacts/fails without provincial votes
- Emergency declaration respects emergency power mode
- Treaty assembly requirement reads treaty approval mode
- Assembly cycle stores `electoralMethod`; FPTP uses plurality winners

### Priority 1 / 6 / 7 — UX
- Quick Amendments catalog (search + Article + topic filters) shares Document Mode builder
- Lawbook Amend / Replace / Repeal preloads Introduce
- Party legal status on Parties / History / Assembly
- Delegation lean + Why factors on bill Politics tab

### Priority 3–5 — Laws
- 0 subjects with only 2 proposal options (was 34)
- Numeric/threshold/duration/percentage controls with `parameterValue`
- Proposal-specific economy effects before direction×magnitude fallback
- Bill constitutionality assessment + hard reject for unavailable ordinary law

## Tests (this HEAD)

`packages/sim/src/phase11_4*.test.ts` — **53 passed** including:

- `phase11_4.constitution-exec.test.ts` (canonical targets + gameplay behaviors)
- `phase11_4.law-depth.test.ts` (catalog depth, constitutionality, specific effects)

## Audit snapshot

See `docs/qa/phase11_4/policy-constitution-audit.json` (regenerate via `node scripts/audit-policy-constitution.mjs`).

## Known limitations / deferred

- Closed-list PR / MMP assembly counting still STV-based
- Screenshot matrix + Pages verification pending for this HEAD
- Promises/agendas, Cabinet investigations, organization scorecards, Year in Terena, global search polish deferred
- Map-centric redesign remains deferred (per brief)

## Feature / commit revert map

| Commit theme | Feature | Independently revertible? | Dependencies |
|---|---|---|---|
| Canonical remap + validation | Correct clause targets + tests | Yes | None |
| Executable order gameplay | Elections/courts/parties/emergency/treaty/referendum/metrics | Partially | Remap |
| Law catalog + effects + constitutionality | Provisions depth, economy effects, bill gates | Yes | None |
| Game UX (Quick Amend / Lawbook / whip / party status) | UI only | Yes | Sim exports |

## Explicit verdict

> **PHASE 11.4 NOT YET ACCEPTED**
