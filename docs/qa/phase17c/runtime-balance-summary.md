# Phase 17C runtime balance summary

Generated: 2026-09-13 (authoritative matrix)  
Horizon: **10 years** × **3 independent seeds** (`phase17c-00` … `02`)  
Interim 5y tune shards also archived under `seeds/phase17c-tune-*.json` (not authoritative).

## Diagnostic flags (authoritative 3×10y)

| Flag | Seeds | Notes |
|------|-------|-------|
| `PROVINCE_MEDIA_NEGLECT` | all 3 | Province-tagged news share ~0.5–1.2% — soft residual |
| `GOVERNMENT_HIGH_CHURN` | 01, 02 (stale report) | Reports written when threshold was &lt;18m; **current** collector flags only &lt;12m. Measured averages **18–24m** — not chaotic |
| `EXECUTIVE_SITUATION_CLUSTER` | 01, 02 | `sit_surveillance_warrant_backlog` over-represented among fired situations |
| `SCANDAL_DROUGHT` | 00 | 1 record / decade (others 3–8) — variety, not spam |
| `ACTOR_SCANDAL_CONCENTRATION` | 00 | Single-target note when N is tiny |

## Per-seed matrix

### phase17c-00 (~5.9 min)

- Governments: 4 terms (3 closed), avg closed **24 months**, coalitions formed 1 / broken 0, reshuffles **6**
- Scandals: **1** (procurement favor → partially substantiated)
- Courts: 22 decisions (all UPHOLD in this shard)
- Foreign: **45** crises (border-heavy), treaties ~31 proposed / 21 ratified
- Media category share: legislation **39%**, other 28%, court 17%, foreign 8%
- Top headline family in shard: `politics:bill_signed` (pre–final pool gate; see below)

### phase17c-01 (~5.7 min)

- Governments: 5 terms (4 closed), avg **18 months**, reshuffles **6**
- Scandals: **8** mixed types; outcomes include substantiated, procedurally closed, unresolved; **1 resignation** history event
- Foreign: **50** crises; treaties ~33 / 20 ratified
- Media: legislation **43%**

### phase17c-02 (~5.8 min)

- Governments: 5 terms (4 closed), avg **18 months**, reshuffles **7**
- Scandals: **3** (petty expense, undisclosed interest, witness interference)
- Foreign: **52** crises; treaties include terminate/suspend
- Media: legislation **43%**

## Post-matrix media gate

After these shards were collected, `BILL_SIGNED` history importance was lowered to **0.28** with media pool floor **0.5**, so routine signing should drop out of outlet selection on subsequent Extended runs. Re-run Extended workflow to refresh headline-family shares before treating residual `bill_signed` dominance as current.

## Tuning evidence log

See `completion-notes.md`.

## Machine-readable

- Aggregate (includes tune shards): `runtime-balance-report.json`
- Per-seed: `seeds/phase17c-00.json` … `02.json`
