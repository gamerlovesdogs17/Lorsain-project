# Testing, Simulation QA and Balance Plan

## 1. Determinism suite

Every CI run loads `TERENA_2028`, executes a fixed command script for 240 turns and compares a state hash. Save/reload at multiple points must produce the identical final hash. No gameplay system may call `Math.random()`.

## 2. Hands-off autonomy test

Run at least 100 saves for 600 monthly turns with a player who takes no political actions. Fail the build or balance candidate if a material share of runs show deadlocked election calendars, empty party leadership, permanent unfilled offices, impossible seat counts, runaway negative money, no legislation for years, constant civil war, or every party converging to identical ideology.

## 3. Election invariants

Presidential RCV tests must guarantee one valid winner, consistent transfer arithmetic and no creation/loss of non-exhausted ballots. STV tests must guarantee exactly 420 Assembly seats and exactly the constituency seat magnitude in each district.

Property tests should verify that materially increasing a candidate's support, holding everything else fixed, does not systematically lower their win probability.

## 4. Constituency sanity

Current `C001`–`C048` districts are population-balanced to approximately 1.17–1.67 million residents at the 72m baseline and elect 7–10 members. They are intentionally allowed to cross province boundaries. Automated tests should confirm geometry exists for every district, constituency coverage of Terena’s land area is complete without gaps/overlaps in the canonical GeoJSON (authoring provenance may use Azgaar cells; **cells are not runtime entities**), all seat totals sum to 420, no constituency ID is duplicated, `plurality_province_id` matches the largest source-population share, and every `province_population_shares` vector sums to approximately 1.

## 5. NPC decision tests

Create small deterministic fixtures where motivations are obvious: loyal ally versus enemy, ideologically aligned bill versus opposed bill, safe incumbent versus suicidal challenge. The chosen action should be explainable from inputs. Then add uncertainty to verify that occasional mistakes occur only near reasonable margins.

## 6. Relationship tests

Endorsements, attacks, betrayals and appointments must alter directional affinity/trust as specified. Repeated small cooperative events should accumulate with caps. Memory decay must never invert a relationship by itself.

## 7. Legislative productivity

Across hands-off four-year Assembly terms, track bills introduced, committee survival, floor votes and enactments by policy area. Tune so hostile presidents and fragmented Assemblies reduce productivity but do not produce automatic paralysis.

## 8. Coalition diversity

Measure party pairings in successful votes. Economic, civil-liberties, defense, regional and agricultural bills should produce measurably different coalition patterns. If the exact same bloc votes together on nearly every issue, faction/constituency incentives are too weak.

## 9. Career mobility

Over 50-year simulations, inspect distributions of career paths. Some politicians should stay local, some remain long-serving Assembly members, some move into cabinet/governorships, a small number reach the presidency, and many lose or retire. A hardcoded universal ladder is a failure.

## 10. Scandal rate

Track public scandals per politician-year. They should be rare enough that a scandal is news, with most politicians never experiencing a major one. Investigations should more often produce no major finding than a career-ending revelation.

## 11. Economic calibration

Run policy-neutral baselines and shock scenarios. Economic series should remain bounded and exhibit realistic inertia. A tax or spending change should not transform GDP instantly. Provincial shocks should diffuse over time rather than teleport nationally in one turn.

## 12. Foreign-affairs calibration

Run the batch calibrator after foreign-affairs changes:

```bash
pnpm calibrate:foreign
```

Default batch: **20 seeds × 15 years** (180 monthly turns), hands-off MP (`NPC030`), no player diplomatic commands. Uses the **calibration-only** foreign month driver (`advanceForeignCalibrationMonths`) so domestic election interrupts do not truncate the horizon.

The script prints per-seed totals and distribution summaries for:

- emergent crises created and settled
- conflicts started/ended/active at horizon
- Terena and Vaskara–Terena wars
- sanctions imposed and lifted
- treaties: total/active/unique/duplicate/max-duplicate/terminated/suspended/proposed/rejected/activated
- foreign leadership changes, same-name replacements, max transitions on one date
- WA actions/vetoes, LTO disputes filed/settled/failed, DC consultations, CSC actions, NAF mediations
- war-power begun and Assembly war-authorization motions
- foreign AI actions toward Terena
- elevated-posture signals

**Unit tests** (`packages/sim/src/foreign.test.ts`, `foreign.determinism.test.ts`) cover baseline seeding (48 countries including W41 with domestic President, canonical Terena relations), Vaskara heightened posture + **latent** (not public active) crisis, determinism, save/reload, v9→v10 migration (no fabricated history), player autonomy (MP treaty votes, President sanctions/treaties/posture), Phase 10.1/10.2 regressions (ratification E2E, war-authorization referral, WA/LTO membership + veto, LTO disputes, leadership schedule/names), and information boundaries.

**Desired long-run behavior** (extend batch to 100×50 years when tuning): a broad distribution where many saves have no great-power war, some have serious regional wars, and only a small minority escalate into system-wide conflict. Vaskara/Terena tension should raise risk without making war inevitable.

## 13. Performance benchmarks

Benchmark 1,000 active NPCs, 10,000 sparse relationship edges, a full Assembly, 48 constituencies and 48 foreign states. Monthly non-election turns should target <250 ms engine time on a mid-range desktop. Use profiling before adding micro-optimizations.

## 14. UI correctness

Playwright covers new game, character creation/selection, end turn, save, load, map interaction, election count, bill vote, relationship inspection and history pages. Tooltips must pull names/data from content rather than duplicate hardcoded strings.

## 15. Long-save migration

Maintain fixture saves from every released schema version. Migration tests upgrade them to current version and verify critical history, player identity, election results and officeholders remain intact.

## 16. Balance dashboards

Build developer-only reports for party vote share, seat share, incumbency, campaign spending, endorsement effects, bill passage, presidential approval, economic series, career outcomes and war frequency. Balance using batch distributions, not one memorable playthrough.
