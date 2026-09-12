# Phase 17B.2 — representative QA

**Date:** 2026-09-12  
**Purpose:** Assert mechanical content differences on real surfaces; screenshots are optional evidence, not the primary proof.

## Assertions (primary)

| Surface | Fixture / test | Assertion |
|---------|----------------|-----------|
| Fiscal books | `phase17b2.persistence.test.ts` — recompute ×5 | Identical expenditure, revenue, balance, debt, national capacity, strain |
| Implementation | resource lifecycle test | Temporary allocation active → survives month → deactivates on `fully_implemented` |
| Anti-stack | increase_resources ×4 | Exactly one active allocation; boost capped ≤ 0.18 |
| Scandal A | weak expense | Resolves without guilt; no legal referral |
| Scandal B | procurement vs petty | Distinct investigators; deeper pressure / stage for procurement |
| Scandal C | witness interference | Can create constitutional grounds at referral |
| Court | `phase17b.behavior.test.ts` | Housing → competence; privacy → rights limitation |
| Organizations | union vs business labor bill | Different `preferAmendment` + `billPressureBonus` |
| Provinces | export vs service trade shock | Larger employment hit for export-heavy |
| Foreign | trade vs security crisis | Different packageId / mediation steps; treaty friction affects assembly path |
| Catalog | `validatePhase17bContentCatalogs()` | No duplicate IDs / invalid department refs |

## Screenshots (secondary)

Reuse existing game routes — do **not** invent fake UI:

| Shot | Route / panel | What to show |
|------|---------------|--------------|
| Executive situation | Government → Executive / ministry | Domain situation title + department |
| Scandal | History / News | Allegation stage label + qualitative evidence (Weak/Mixed/…) |
| Lobby conflict | History / org campaign event | Union vs business different asks |
| Court doctrine | Court case detail | Rule/doctrine matching fact pattern |
| Province event | Province / History | Trade/regional pressure |
| Foreign crisis | Foreign Affairs | Crisis package-specific recommended actions |
| Campaign/debate | Campaign | Debate or endorsement situation |

Capture command (when Vite QA fixture available):

```bash
# Prefer existing government capture for Executive surface:
node scripts/phase17a-government-qa-capture.mjs
```

Content-specific PNGs may be added under `docs/qa/phase17b2/` after a fixture save exists; until then, CI proof is the behavior/persistence test suite above.

## Verdict gate checklist

- [x] Fiscal recomputation idempotent
- [x] Temporary resources expire
- [x] No infinite resource stacking
- [x] Scandal stateful arcs
- [x] Allegation ≠ guilt
- [x] Severe path can reach legal referral
- [x] Ministry situation library expanded
- [x] Org mechanical differences
- [x] Court doctrine fact-aware
- [x] Foreign variant metadata consumed
- [x] Province profile differences
- [x] Behavior tests (not only counts)
- [x] Repetition report (informational)
- [ ] Full Quality + Integration + 2y smoke (run at tip)
- [ ] Representative PNGs (optional if surfaces already covered by 17A Government QA)
