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

Representative **1280×720** captures live under [`docs/qa/phase17b2/`](./phase17b2/) with assert-before-capture and [`manifest.json`](./phase17b2/manifest.json) (SHA-256 per PNG).

| File | Fixture | Route | Pre-capture assertions |
|------|---------|-------|------------------------|
| `17b2-government-executive-1280.png` | `phase17a-government` | Government → Executive | Government title; Regulation power strip; `#lorsain-browser-qa-state[data-ready=true]` |
| `17b2-foreign-overview-1280.png` | `institutions` | Foreign Affairs → Overview | `[data-qa=foreign-affairs]`; `[data-qa=fa-summary-strip]` exactly once |
| `17b2-courts-bench-1280.png` | `institutions` | Courts | Constitutional Court header; `.bench-chart` |
| `17b2-news-front-1280.png` | `institutions` | News | `.news-paper`; `.news-outlet-switcher` |
| `17b2-campaign-hq-1280.png` | `active-campaign` | Campaign HQ | Active race (not idle HQ); calendar/actions sections |

```bash
node scripts/phase17b2-qa-capture.mjs
# Full Government tab sweep (17A): node scripts/phase17a-government-qa-capture.mjs
```

**Not yet captured** (need 17B-specific save or deep navigation — placeholders only, no fabricated PNGs):

- Scandal arc on News (allegation stage + Weak/Mixed evidence labels)
- Org lobby conflict headline (union vs business mechanical difference visible in copy)
- Court case detail with doctrine/rule line tied to fact pattern
- Foreign crisis panel with package-specific recommended actions
- Province trade/regional pressure event on History or province screen

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
- [x] Representative PNGs (5 surfaces under `docs/qa/phase17b2/`; 17A remains full Government sweep)
