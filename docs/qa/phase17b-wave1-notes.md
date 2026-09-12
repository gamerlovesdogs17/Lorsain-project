# Phase 17B — Wave 1 content notes

**Date:** 2026-09-12  
**Scope:** Substantive content using existing engines only (no UI rebuild).

## Summary counts

| Area | Added (approx.) | Notes |
|------|----------------:|-------|
| Legislative provision families | **8** | 32 new reform options (+8 founding baselines) |
| Policy interaction rules | **+8** (14 total) | Synergy / strain / contradiction across new + existing law |
| Executive / cabinet situations | **10** templates | Quarterly `GOVERNMENT_EXECUTIVE_SITUATION` events |
| Scandal types | **6** | `POLITICAL_SCANDAL_ALLEGATION` + impeachment grounds hooks |
| Crisis narrative themes | **+6** new labels | 13 themed packages with distinct escalation thresholds |
| Trade treaty variants | **6** | Metadata on `trade` treaties at proposal time |
| Content cooldown helper | **1** module | Wired to situations + scandal spawner |
| Unit tests | **1** file | `phase17b.content.test.ts` |

## New provision IDs

- `PROV_CROSS_BORDER_DATA` — federal adequacy vs provincial opt-out vs consent mandate  
- `PROV_TEMP_WORKER` — caps vs open sectoral vs permanent pathway  
- `PROV_CONSUMER_FINANCE` — deregulation vs caps vs public lender vs predatory ban  
- `PROV_BODY_CAMERA` — voluntary vs incentive vs mandatory recording  
- `PROV_GAS_BRIDGE` — extend gas vs schedule vs hydrogen incentive vs mandated phase-out  
- `PROV_ALGORITHM_AUDIT` — voluntary vs provincial sandbox vs national registry  
- `PROV_DEPOSIT_INSURANCE` — low cap vs statutory vs universal vs mutualized public fund  
- `PROV_COMMUNITY_POLICING` — unfunded mandate vs optional grants vs universal vs local-only  

## Unique mechanical patterns (not reskins)

1. **Situation eligibility** — `when(state, world)` predicates tie ministry scenes to enacted law options + capacity/services.  
2. **Scandal severity paths** — `administrative` / `investigation` / `prosecutorial` stage rolls; investigation+ registers `future_scandal` / `future_corruption_investigation` grounds.  
3. **Crisis escalation profiles** — theme-specific thresholds in `processCrisisLifecycle` (different conflict vs de-escalation pacing).  
4. **Trade treaty variants** — `acceptanceBias`, `ratificationFriction`, and `domesticReaction` on proposal metadata.  
5. **Content cooldown registry** — `metadata.contentCooldowns` map shared by governing + politics spawners.  

## Files touched

- `packages/sim/src/legislature/provisions.ts`  
- `packages/sim/src/governing/interactions.ts`  
- `packages/sim/src/governing/situations.ts`  
- `packages/sim/src/governing/monthly.ts`  
- `packages/sim/src/politics/scandals.ts`  
- `packages/sim/src/politics/agency.ts`  
- `packages/sim/src/content/cooldown.ts`  
- `packages/sim/src/foreign/crisis-emergence.ts`  
- `packages/sim/src/foreign/crisis-packages.ts`  
- `packages/sim/src/foreign/crises.ts`  
- `packages/sim/src/foreign/domesticPolitics.ts`  
- `packages/sim/src/foreign/treaty-variants.ts`  
- `packages/sim/src/foreign/treaties.ts`  
- `packages/sim/src/media/monthly.ts`  
- `packages/sim/src/phase17b.content.test.ts`  

## Follow-ups (later waves)

- Ministry-specific complication labels on implementation delay (typed catalog).  
- Org endorsement campaign templates in `data/terena_organizations.json`.  
- Additional `headlineFor` branches once scandal / situation volume is play-tested.  
