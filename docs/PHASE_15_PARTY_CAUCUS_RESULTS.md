# Party / Caucus / Phase 14–15 Results

## Verdicts

| Area | Verdict |
|------|---------|
| Party Organization | **COMPLETE** (authoritative Chair; real Committee; terms) |
| Assembly Delegation | **COMPLETE** (whip strength affects votes; persuade) |
| Caucuses 2.0 | **COMPLETE** (shares, endorsements, alliances, merge/split) |
| Phase 14 | **COMPLETE** (candidate-specific primary maps) |
| Phase 13 remainder | **PARTIAL** (budget/propose exists; province/Court conflict not expanded this run) |
| Phase 15 | **COMPLETE** foundation (eras, governments, yearbooks, long-run audit) |

Phase 16 was **not** started.

## Authoritative leadership
- Single national leader = National Chair
- `setPartyLeader` syncs chair; `resolveChairElection` uses `setPartyLeader`
- Legacy `party_leadership` auto-contests disabled
- Schema 23/24 migrations reconcile chair ↔ leaderId
- Invariant tests in `partyOrg.authority.test.ts`

## National Committee
- Seeded 12–24 members; real votes; can reject major actions

## Caucuses
- `caucusRuntime` shares (membership / assembly / institutional)
- Endorsements boost chair election affinity
- Alliances, merge, split, gradual monthly drift

## Whip
- `whipStrengths` consumed in `explainLegislativeVote`
- `WHIP_PERSUADE_MEMBER` temporary bonuses

## Primary maps
- Contest polls aggregate by candidateId
- Candidate shade colors + legend names

## Phase 15
- `history15Runtime`: eras, government terms, tenures, yearbooks, cohorts
- History UI sections for eras / governments / Year in Terena
- 25-year long-run audit test

## QA
- `scripts/phase15-capture-screenshots.mjs` asserts DOM before capture
- Manifest + duplicate hash failure
- See `docs/qa/phase15/`
