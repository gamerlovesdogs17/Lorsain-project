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

New Terena treaties requiring ratification create a public record and an Assembly vote (`CAST_TREATY_RATIFICATION_VOTE`). Player MPs choose explicitly; missing votes are abstentions, not fabricated yes votes. Tally uses **`simple_majority_cast`** (yes > no among cast votes), matching ordinary Assembly motion semantics. NPC choices use the DecisionContract with **empty `targetIds`** (treaty/country context stays in signals/metadata) so foreign country IDs never violate politician public-facts.

Duplicate active treaties for the same pair/kind are blocked by proposal cooldowns and identity checks. Lifecycle can terminate trade/non-aggression under bilateral breakdown and can terminate hard alliances only after prolonged collapse + long tenure; mutual defense/collective security may suspend during war between members.

## Institutions (Phase 10.2)

Canonical membership lives in `data/world_institutions.json` (`member_country_ids`, and for WA `security_council_veto_ids`):

| Institution | Members | Notes |
| --- | --- | --- |
| INT_WA | 48/48 | Universal. SC veto powers: W24, W28, W37, W40 (not W13). |
| INT_LTO | 43 | Includes W40 Vaskara and W24 Elzesh. Non-members: W02, W10, W14, W25, W42 (documented in file). |
| INT_DC | 13 | Aligns with country `alignment_ids`. |
| INT_CSC | 5 | Aligns with country `alignment_ids`. |
| INT_NAF | 20 | Aligns with country `alignment_ids`. |

Runtime `institutionIds` are seeded from these lists. Bounded monthly consequences: WA mediation/condemnation/veto, LTO dispute progression, CSC bloc coordination, NAF mediation, DC Article 6 consultation.

## War powers

Unilateral `BEGIN_WAR_POWERS` (player or NPC President) schedules an Assembly **war_authorization** referral with the Speaker as institutional procedural sponsor (`constitutionalReferral` metadata). The President is never treated as an MP. Pending authorization prevents premature same-tick `WAR_POWERS_EXPIRED` when the 30-day unilateral window crosses a monthly boundary.

## Leadership

Foreign leadership schedules derive from canonical `since_year`, title, and government form, with a deterministic per-country month phase so democracies do not all turn over on the same January. Monarch titles (King/Queen/Emperor/Duke/Prince/…) use long dynastic intervals; incumbents who remain in office do not emit fake same-name “replacements.”

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

Reports crises, conflicts, sanctions, treaty uniqueness/duplicates/terminations, leadership distribution/same-name, WA/LTO/CSC/NAF/DC institution counters, war-power/Assembly authorization signals, AI toward Terena, posture.

Example 5×15-year smoke (Aug 2026): ~250 emergent crises per run, ~1–3 conflicts ever, ~30% runs with Terena involvement, sanctions sometimes lifted, foreign AI toward Terena on every run.

## Tests

- `packages/sim/src/foreign.test.ts` — baseline (48 countries incl. W41), determinism, migration, player autonomy, Phase 10.1/10.2 regressions (ratification E2E, war-auth referral, WA/LTO membership + veto, LTO disputes, leadership schedule/names)
- `packages/sim/src/foreign.determinism.test.ts` — RNG stream isolation

## UI

- **Foreign Affairs** screen (`apps/game/src/foreignAffairsScreen.tsx`) under World navigation
- **WorldMap** (`apps/game/src/map/WorldMap.tsx`) with relation/alliance/crisis/sanctions/posture modes
- Archive **Foreign** tab for treaties, crises, conflicts, sanctions, leadership changes
