# Foreign Affairs System (Phase 10 / 10.1)

Phase 10 adds a persistent, deterministic 48-state foreign-policy layer to `@lorsain/sim`. Phase **10.1** completes reachable behavior (Terena runtime, AI, crises/conflicts, treaty consent, war powers, UI). It consumes Terena's existing presidency, Assembly, economy, media, and constitutional war-powers machinery rather than duplicating domestic authority.

Save **schemaVersion 10** introduces `foreignAffairsRuntime`. v9 saves migrate to an empty foreign runtime and receive the January 2028 baseline on first load — no fabricated prior diplomatic history.

## State model

`SimState.foreignAffairsRuntime`:

| Field | Purpose |
| --- | --- |
| `countries` | Per-country runtime: leader, posture, capabilities, trade exposure, strategic goals (internal), institution memberships |
| `bilateralRelations` | Sparse keyed edges (`W05\|W41`) with `general`, `trust`, `securityTension`, `economicTies` (−100…+100 or 0…100 as appropriate) |
| `treaties` | Persistent treaty records (parties, kind, status, ratification) |
| `sanctions` | Active sanction episodes (imposer, target, scope, severity) |
| `crises` | International crisis lifecycle records |
| `conflicts` | Abstract armed conflicts |
| `diplomaticActions` | Recent action log (player + AI) |
| `treatyRatifications` | Pending Assembly ratification votes |
| `pendingPlayerTreatyVotes` | Player MP ratification choices (never auto-cast) |

Static canon lives on `KernelWorld`: `worldCountries`, `worldInstitutions`, `worldLeaders`, `terenaWorldCountryId` (`W41`). Canonical content: `data/world_countries.json`, `data/world_institutions.json`, `data/world_leaders.json`.

Terena's President, Cabinet, and Assembly continue to come from domestic office terms and legislature runtime. Foreign affairs **reads** those systems; it does not create a parallel Terena government.

## Capabilities

Each foreign country receives a bounded `CapabilityVector` (0…1): economic, land, air, naval, strategic/nuclear where applicable, cyber, logistics. Derived from canonical `power_tier`, population, region, alignment, and geography — not population alone.

## Trade exposure

Lightweight bilateral trade exposure (0…1) per country pair, informed by neighbors, alignment, power tier, and canonical Terena relationships (Vaskara, Graeven, Nigis, Bharesh, Krigh, Soburish Federation). Sanctions and crises queue lagged `ISS_TRADE` effects into `economyRuntime.laggedEffects`.

## Strategic goals

Internal AI goals (~12 kinds: preserve security, strengthen alliance, contain rival, protect trade routes, avoid major war, etc.) are derived from country circumstances. They are **not** exposed in normal UI.

## Foreign AI

Monthly processing uses the **`foreign-affairs`** RNG stream exclusively. AI considers sparse relevant country pairs (neighbors, Terena-linked states, crisis participants) — not all-pairs every month.

Capabilities include outreach, treaty proposals, sanctions, posture changes, exercises, crisis escalation/de-escalation, and rare conflict initiation. War is not an ordinary monthly action.

## Crisis lifecycle

Explicit state machine (no ordinal stage arithmetic). Stages: `latent` → `incident` → `active` → `deescalating` / `conflict` → `settled`.

- **Latent** = background strategic tension (not counted as an active public crisis on Home).
- **Incident+** = public international crisis with structured events (`FOREIGN_CRISIS_*`, `INTERNATIONAL_CONFLICT_*`).
- Entering **conflict** creates an `InternationalConflict` record and emits `INTERNATIONAL_CONFLICT_STARTED`.
- New crises emerge monthly from bilateral tension, posture, sanctions, geography, treaties, and goals (`crisis-emergence.ts`).

January 2028 baseline includes a **latent** Vaskara–Terena (`W40`–`W41`) tension crisis (`meridian_basin_tension`). Outcomes vary by seed; war is not scripted.

## Terena (W41) runtime

All **48** countries have `foreignAffairsRuntime.countries` entries. Terena uses `leaderId: null`; the current President resolves from domestic office terms via `resolveCountryLeaderId` / `resolveCountryLeaderDisplay`. No duplicate `FLD_W41` foreign leader.

## Treaties and ratification

Treaty lifecycle: `proposed` → `counterparty_pending` → (`accepted` / `rejected`) → `ratification_pending` (when required) → `active`. Counterparties evaluate acceptance from relations, goals, crises, and treaty kind — hostile countries may reject defense pacts.

Treaty kinds include collective security, bilateral defense, trade, non-aggression, basing, arms limitation, economic cooperation. Pre-existing Democratic Concord collective security is seeded as active with `ratificationStatus: not_required`. Active treaties alter AI incentives (deterrence, crisis pressure, trade).

New Terena treaties requiring ratification create a public record and an Assembly vote (`CAST_TREATY_RATIFICATION_VOTE`). Player MPs choose explicitly; missing votes are abstentions, not fabricated yes votes.

## Sanctions

Persistent records with targeted/sectoral/broad scopes and bounded severity. Effects feed relations, trade exposure, crisis risk, media, organizations, and lagged economy — not instant GDP collapse.

## Military posture

Levels: `normal`, `heightened`, `mobilized`, `crisis_deployment`. Posture influences deterrence, crisis escalation, alliance concern, and domestic confidence. Vaskara starts at **heightened** in 2028.

## Armed conflict

Abstract only: participants, intensity, balance, objectives, ceasefire/settlement. Great-power war is possible but uncommon. Terena involvement uses existing `BEGIN_WAR_POWERS` / Assembly war-authorization — no bypass boolean.

## Player authority

**President** (current presidential authority): explicit commands via Foreign Affairs UI drawers — outreach, summit, treaty, trade settlement, sanctions, alliance consultation, posture, crisis mediation, warning. **2 actions/month** diplomatic capacity.

**MP**: treaty ratification votes only when institutionally pending.

**Governor / ordinary politician**: informational unless office grants domestic authority.

## Information boundaries

Normal UI shows public relations, treaties, sanctions, posture, leaders, alliances, public crises, broad capability tiers. Hidden: AI utilities, strategic goals, hidden escalation rolls, exact clandestine willingness.

Presentation helpers in `apps/game/src/presentation.ts` translate event types to readable copy.

## Turn order

Within each month (after economy, organizations, campaigns, legislature, executive, courts, and scheduled domestic events):

1. **Foreign affairs** (`processForeignAffairsMonth`)
2. **Media** (reports foreign events generated that month)

Foreign economic consequences enter as **lagged effects** for subsequent months.

## Save migration (v9 → v10)

`migrateSaveV9ToV10` bumps schema, adds empty `foreignAffairsRuntime` and new counters. Does **not** fabricate treaties, crises, or wars that were not previously modeled. `restoreSimulation` / new games call `seedForeignAffairsRuntime` when countries are empty.

## Calibration

```bash
pnpm calibrate:foreign
# optional: FOREIGN_CAL_SEEDS=100 FOREIGN_CAL_YEARS=50 pnpm calibrate:foreign
```

Runs **20 seeds × 15 years** (180 months) on TERENA_2028 using `Simulation.advanceForeignCalibrationMonths` — a **calibration-only** driver that advances foreign affairs without unresolved domestic election interrupts. Never used in normal gameplay.

Reports crises created/settled, conflicts started/ended (ever, not just at horizon), Terena/Vaskara wars, sanctions imposed/lifted, treaties proposed/rejected/activated, AI actions toward Terena, leadership changes, posture signals.

Example 5×15-year smoke (Aug 2026): ~250 emergent crises per run, ~1–3 conflicts ever, ~30% runs with Terena involvement, sanctions sometimes lifted, foreign AI toward Terena on every run.

## Tests

- `packages/sim/src/foreign.test.ts` — baseline (48 countries incl. W41), determinism, migration, player autonomy, Phase 10.1 regressions (sanctions, posture, crisis machine, treaty rejection, war trigger, leader display)
- `packages/sim/src/foreign.determinism.test.ts` — RNG stream isolation

## UI

- **Foreign Affairs** screen (`apps/game/src/foreignAffairsScreen.tsx`) under World navigation
- **WorldMap** (`apps/game/src/map/WorldMap.tsx`) with relation/alliance/crisis/sanctions/posture modes
- Archive **Foreign** tab for treaties, crises, conflicts, sanctions, leadership changes
