# Phase 17C completion notes

**Date:** 2026-09-13  
**Starting tip:** `2917a9253c88fd3afed0c00af8100c12c56de6ea`

## Phase 17B final patches (accepted into this pass)

| Area | Change |
|------|--------|
| Scandals | `stageWeights` now drive stage selection; Party vs Government responses distinct; resignation/`remove_minister` ends ministerial terms; `restrict_duties` suspends terms; cleared outcomes set `guilty=false` |
| Provincial negotiation | Incentive spend stored as durable `fiscalOutlays` one-time records (survive recompute; expire after charge month) |
| Biographies | Background archetypes + office/Party/scandal milestones via `refreshPoliticianPublicBiography` |

## Measurement → change log

| PROBLEM | EVIDENCE | CHANGE | EXPECTED |
|---------|----------|--------|----------|
| Party contest history spam | `PARTY_CONTEST_CANDIDACY_DECLARED` ~28% of 2y history | importance 0.55→0.22; open/create lowered | HISTORY_TYPE_DOMINANCE cleared on 10y |
| Law enactment news dominance | `government:law_enacted` top family | major/minor importance; media floors | Shifted; residual `bill_signed` then suppressed |
| Bill signed / enacted double beat | Both at high importance | `BILL_SIGNED` importance 0.28 | Signing leaves news pool |
| Scandal drought | 0–1/decade some seeds | Monthly spawn ~4.5% | 1–8 records/decade observed |
| Foreign crisis spam | ~158 crises/10y | emergence ×0.035 + cap 1/month | ~45–52/decade |
| Government churn flag noise | avg term 18m flagged | flag threshold &lt;12m | 18–24m no longer “chaotic” |

## Runtime matrix (authoritative: 3×10y)

Seeds `phase17c-00` … `02` (~5.5–6m each). Reports under `docs/qa/phase17c/`.

Residual flags (informational): `PROVINCE_MEDIA_NEGLECT` (all), some `EXECUTIVE_SITUATION_CLUSTER`, occasional `SCANDAL_DROUGHT` / actor concentration. Not treated as blockers if histories differ and crises/scandals are in plausible bands.

## Multi-seed variety (concrete)

- **Scandals:** 1 vs 8 vs 3 records; different type mixes across seeds  
- **Government terms:** average closed term 18–24 months; reshuffles 6–7  
- **Foreign:** crisis totals ~45–52 (down from ~158); theme mixes include border/cyber/trade  
- **Media:** legislation share ~0.39–0.43 after tuning (was higher with universal high-importance enactments)  
- Histories share Terena institutions but not identical scandal/government/crisis sequences  

## Known remaining soft spots (not Phase 17B blockers)

- Province-tagged news share still near zero (needs more province-visible events or tagging)  
- Executive situation template clustering on some seeds  
- Legislation still a large media category (improved, not eliminated)  

## Phase 18 readiness (do not implement)

- Ship **one** canonical scenario: **Terena**  
- Custom scenario create/import/export/share later  
- No default multi-scenario bookmarks  
