# Phase 17B — Wave 2 content notes

**Date:** 2026-09-12  
**Scope:** Substantive catalog expansion on existing engines (no UI). Builds on wave 1.

## Summary counts

| Area | Added (approx.) | Notes |
|------|----------------:|-------|
| Party priorities | **+6** (24 total catalog entries) | Provincial, defense, digital, rural, caucus cohesion, immigration integration |
| Campaign strategies | **+2** (7 total) | Issue ownership, regional ticket |
| Platform policy options | **+8** | New `immigration` and `defense` issue buckets (4 each) |
| Org lobbying campaign templates | **8** | Distinct summaries wired in `processOrganizationPoliticsMonth` |
| Caucus pressure templates | **6** | `CAUCUS_PRESSURE_EVENT` via `processCaucusPressureMonth` |
| Campaign situations | **+5** (13 total) | Economy, foreign, constitutional, regional, integrity frames |
| Debate flavor | **+6 moments**, **+10 issue emphases** | Full Terena issue-id coverage in debates |
| Court legal content | **1 module** | Doctrine labels + issue-specific law-review questions |
| Provincial pressure kinds | **+6 theme flavors** | Theme-triggered titles (ports, harvest, campus, border, mines, factories) |
| Constitutional alternatives | **+1** | `metro_charter_cities` on `art9_local_government` |
| Media headline branches | **+4 event types** | Org campaigns, caucus pressure/agenda, provincial theme pressures, debate emphasis |
| Unit tests | **+1 describe block** | Wave 2 asserts in `phase17b.content.test.ts` |
| Content report script | **1** | `scripts/phase17b-content-report.mjs` |

## Wiring (light)

- `politics/agency.ts` — caucus pressure month after caucus agenda.
- `politics/organizations.ts` — lobby template match + payload `lobbyTemplateId` / `summary`.
- `partyOrg/monthly.ts` — NPC priority templates use valid catalog ids.
- `courts/monthly.ts` + `courts/procedure.ts` — question catalog + doctrine rationales.

## Files touched

- `packages/sim/src/partyOrg/catalog.ts`
- `packages/sim/src/partyOrg/monthly.ts`
- `packages/sim/src/politics/caucusPressure.ts` (new)
- `packages/sim/src/politics/agency.ts`
- `packages/sim/src/politics/organizations.ts`
- `packages/sim/src/campaigns/situations.ts`
- `packages/sim/src/campaigns/debates.ts`
- `packages/sim/src/courts/legalContent.ts` (new)
- `packages/sim/src/courts/monthly.ts`
- `packages/sim/src/courts/procedure.ts`
- `packages/sim/src/provinces/types.ts`
- `packages/sim/src/provinces/monthly.ts`
- `packages/sim/src/provinces/constitutionChanges.ts`
- `packages/sim/src/media/monthly.ts`
- `packages/sim/src/phase17b.content.test.ts`
- `scripts/phase17b-content-report.mjs` (new)
