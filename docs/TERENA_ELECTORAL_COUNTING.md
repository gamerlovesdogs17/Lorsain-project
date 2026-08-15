# Terena Electoral Counting Specification

**Content version:** `0.3.0-predev`  
**Machine-readable twin:** [`data/terena_electoral_counting.json`](../data/terena_electoral_counting.json)  
**Status:** Locked. Implemented in Phase 0.5 `packages/election-math`. Used by Phase 0b for 2026 archive generation.

## Package boundary

All counting algorithms live in `packages/election-math`. That package is **institution-agnostic**: it must not know about Labour, Civic Reform, named politicians, campaigns, or React. It accepts structured ballots/configuration and returns structured count results.

Consumers (same code path):

- 2026 historical Assembly STV archive generation/validation
- National Assembly STV elections (including 2030)
- Presidential IRV/RCV elections
- Party nomination contests that use transferable ballots

Do **not** implement a second counting algorithm anywhere else.

## Arithmetic

Use exact reduced **BigInt rationals**. Serialize as `"num/den"` strings in archives. Ordinary IEEE JavaScript floating-point must not decide winners, quotas, or transfer values. Results must reproduce identically in browser main thread, Web Worker, and Node.

## Assembly STV

### Droop quota

Computed **once** at count start from total valid first-preference votes:

`floor(total_valid / (seats + 1)) + 1`

Do **not** recompute quota after exhaustion or later rounds.

### Weighted Inclusive Gregory surplus transfers

- `surplus = candidate_total - quota`
- `transferable_total` = exact sum of weights of ballots currently credited to the elected candidate that have a next continuing preference
- If `transferable_total > surplus`: `transfer_factor = surplus / transferable_total`
- If `transferable_total <= surplus`: `transfer_factor = 1` (all transferable value moves); any unavoidable retained amount above quota caused by non-transferable ballots is **archived explicitly** and must not inflate other candidates
- Eliminate **one** candidate at a time
- If multiple candidates are over quota: process **one at a time**, highest current total first; ties use the tie hierarchy below
- Exhausted ballots remain archived but do not count as continuing votes

### STV / RCV tie-breaking

1. Previous-count totals walking backward  
2. Original first-preference totals  
3. Deterministic legal lot via `elections` RNG stream  

### Legal lot (no modulo bias)

Do **not** use simple `uint32 % N`.

1. Sort tied candidate IDs lexicographically  
2. Draw uint32 values from the `elections` stream  
3. Reject draws outside the largest multiple-of-N range below 2^32  
4. `index = acceptedDraw % N`  
5. Archive every draw used and the selected index  

## Presidential RCV (IRV)

- Instant-runoff voting  
- Eliminate the lowest candidate each round  
- Majority means **strictly greater than 50%** of continuing valid ballots  
- Exhausted ballots leave the continuing denominator  
- Preserve every round and transfer  
- Same tie hierarchy and rejection-sampled lot as above  

## Phase dependency

Phase **0.5** implemented this specification in `packages/election-math`.  
Phase **0b** must generate/validate the 2026 Assembly archive using that package — never a temporary alternate algorithm.
