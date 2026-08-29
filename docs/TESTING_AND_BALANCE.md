# Testing, Simulation QA and Balance Plan

## 1. Determinism suite

Every CI run loads `TERENA_2028`, executes a fixed command script for 240 turns and compares a state hash. Save/reload at multiple points must produce the identical final hash. No gameplay system may call `Math.random()`.

**Phase 11.1 closeout:** `packages/sim/src/phase11.integration.test.ts` runs the natural 2028→2034 presidential horizon, Assembly filing/count/assumption paths, player/observer scenarios, checkpoint save/reload hash equality, and catastrophic invariants. `phase11.closeout.test.ts` covers allocation, player filing autonomy, bounded campaign influence, typed archives, and v10→v11 migration. Use:

```bash
pnpm exec vitest run packages/sim/src/phase11.integration.test.ts
pnpm exec vitest run packages/sim/src/phase11.closeout.test.ts
```

**Phase 11.2:** `phase11_2.governor.test.ts` covers provincial authority, explicit filing, recurring 21-race scheduling and save/reload. `phase11_2.systems.test.ts` covers canonical uneven economy starts, four-year persistence/determinism, trade-exposure response, campaign geographic distribution/decay, concrete bills and cross-role permission rejection. Campaign map fills retain component regression tests. Use:

```bash
pnpm exec vitest run packages/sim/src/phase11_2.governor.test.ts
pnpm exec vitest run packages/sim/src/phase11_2.systems.test.ts
pnpm calibrate:economy
pnpm calibrate:campaign-geography
```

The systems regression also advances across the canonical 2029-06-01 Court vacancy date to ensure an automatic nonblocking event due exactly on a turn target is processed before the state date advances. Minister and Mayor permission checks assert one bounded role action per month and reject direct calls from every other role.

## 2. Hands-off autonomy test

Run at least 100 saves for 600 monthly turns with a player who takes no political actions. Fail the build or balance candidate if a material share of runs show deadlocked election calendars, empty party leadership, permanent unfilled offices, impossible seat counts, runaway negative money, no legislation for years, constant civil war, or every party converging to identical ideology.

## 3. Election invariants

Presidential RCV tests must guarantee one valid winner, consistent transfer arithmetic and no creation/loss of non-exhausted ballots. STV tests must guarantee exactly 420 Assembly seats and exactly the constituency seat magnitude in each district. Recurring-cycle tests also assert: field finalization precedes resolution; every winner is a finalized candidate; no politician appears in two Assembly constituencies; declined players are absent; campaign status agrees with the result; assumption dates begin winner terms; historical elections are not overwritten; and the next regular date advances.

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

The Phase 11.2 calibrator runs 12 deterministic seeds for 48 months and reports canonical starting national values, province/sector ranges, one-year and four-year output movement, maximum province spread, shock frequency, bound hits, average monthly movement and direction changes. Acceptance requires a non-flat start, persistent regional spread, both short/long movement, no bound collapse, and reproducibility. The trade regression separately compares a highly exposed island province with the sheltered federal district under an identical trade disruption.

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

Assembly calibration is a required 20-seed batch:

```bash
pnpm calibrate:assembly
```

Record candidate count and candidates/seat, uncontested constituencies, incumbent candidates/winners/reelection, challenger wins, party seat change, turnout, represented parties, field-generation time, one-constituency STV time, full-resolution time, and archive-serialization time. The closeout browser check separately records worker click-return time and total count time; an indeterminate count state is required because the engine does not cheaply expose honest progress percentages.

Phase 11.2 browser measurements on the development host: normal End Turn 1.152s total / 282ms click return, 2028 nomination month 6.157s / 431ms, 2033 nomination month 15.140s / 325ms, and 2030 Assembly count 14.242s / 277ms. Click return includes browser-control overhead and is therefore a conservative observed main-thread upper bound. The isolated integration harness recorded ordinary-turn median 799ms, maximum 976ms, Assembly resolution 12.282s, and 2033 presidential resolution 1.133s.

## 14. UI correctness

Browser QA covers new game, character selection, end turn, save/load behavior, map interaction, election count, bill vote, relationship inspection, and history pages. Phase 11.1 requires actual Adrian run/decline, eligible non-incumbent Assembly, 2033 player contender, and 2033 observer workflows at 1440, 900, 600, and 390 pixels. Filing controls, Assembly campaign actions, indeterminate count state, national/constituency results, nomination controls, transitions, and horizontal overflow are inspected. Tooltips and result cards must use public names/data rather than raw IDs.

Phase 11.2 additionally requires President, MP, Governor, non-incumbent, former officeholder and justice role passes, plus limited-role checks for Minister/Mayor. Inspect Home/Office/Career, province actions, gubernatorial filing/campaign/result, concrete bill composition, each truthful domestic map mode, world-map modes, hover/leave/click/tap/keyboard behavior, and populated News/Archive states. Responsive widths are 1440, 1200, 900, 600 and 390 pixels. Evidence screenshots live under `docs/qa/phase11_2/`.

### 14.1 Phase 11.3 institutional acceptance

The formal whole-game gate is **100 deterministic saves × 600 monthly turns**, but it is never the first long run. Use this pyramid:

- `pnpm test:fast` for deterministic unit and focused subsystem tests;
- `pnpm test:integration` for browser-independent cross-system flows and migrations;
- `pnpm test:long` for one resumable 600-month candidate-depletion probe;
- `pnpm calibrate:game` for the staged 1, 3, 10, 25 and finally 100-seed gates.

The 600-month gates must pass in order. A failed stage is diagnosed and rerun before expanding the sample. Do not launch the 100-seed run while any earlier gate has an execution error, catastrophic invariant failure, candidate-shortage event, determinism failure, or unexplained bound/save-growth result.

Every seed writes an atomic shard as soon as it finishes. `--resume` reuses a shard only when its absolute seed index, requested horizon, content version and source fingerprint match. Interrupted processes therefore retain completed work, while code or canonical-content changes invalidate stale shards. Separate invocations can fill disjoint ranges safely:

```bash
pnpm calibrate:game --seed-start=0 --seed-count=3 --months=600 --parallel=3 --resume
pnpm calibrate:game --seed-start=3 --seed-count=7 --months=600 --parallel=7 --resume
pnpm calibrate:whole-game:aggregate --seed-start=0 --seed-count=10 --months=600 --require-complete
```

The aggregator performs no gameplay draws. It rejects mixed or stale source/content revisions, sorts by absolute seed, emits a compact index rather than duplicating every raw monthly record, and can write both JSON and Markdown. The checked-in runner may divide absolute seed indices among workers, but merges results in seed order and performs a continuous/reload determinism check after aggregation. Parallelism may change wall-clock duration only; it must not change a seed's simulation result.

Required telemetry covers catastrophic invariants, candidate supply and generation/promotion, party/faction/caucus leadership turnover, Provincial Assembly elections and legislation, Governor disposition/override, constitutional amendments, federal bills/amendments/roll calls, organization relationships and endorsements, career generations, economy cycles, campaign geography/outcomes, monthly/election performance and serialized save growth at 0/120/300/600 months. Acceptance requires zero catastrophic failures and identical continuous/reload hashes.

Targeted Phase 11.3 regressions additionally prove:

- 21 chambers, 25–65 seats, unique public names and renewable legislators;
- federal recruitment sizes the pre-filing promotion class from valid filings, running incumbents and command-layer-eligible challengers; no count-time fallback generation is permitted;
- annual NPC lifecycle decisions are deterministic, survive save/reload, leave the player untouched, and reduce both the original active cohort and mean active age over fifty years;
- player authority/autonomy for party, caucus, provincial, Court and constitutional commands;
- recurring leadership contests and individual archived ballots;
- 280 federal votes plus 13 provincial ratifications, with amendment-specific province ordering rather than P01-first scheduling;
- provincial bills, roll calls, Governor sign/veto and two-thirds override;
- Court federal–provincial jurisdiction, qualification and opinion authorship;
- concrete one-to-three-provision federal bills and targeted amendments;
- organization endorsement withdrawal and relationship change from policy behavior;
- save schema 12→13→14 deterministic migration without fabricated history.

Browser acceptance covers President, MP/Speaker, Governor, non-incumbent/former officeholder and Justice, plus limited Minister/Mayor disclosure. V6 screens are inspected at 1440, 1200, 900, 600 and 390 pixels. Required flows include party/caucus selection, chamber and roll calls, bill comparison/amendment, Court bench/docket/decision/appointment, Provincial Assembly/Governor disposition, constitutional tracker, Ground Game, Economy, Calendar, global search/profile navigation, map hover/leave/click/tap/keyboard selection and populated long-save pages. Evidence lives under `docs/qa/phase11_3/screenshots/`.

Normal closeout commands remain `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm validate:content`, `pnpm validate:phase0b:recount`, `pnpm game:build`, `pnpm calibrate:foreign`, `pnpm calibrate:assembly`, `pnpm calibrate:economy`, and `pnpm calibrate:campaign-geography`.

## 15. Long-save migration

Maintain fixture saves from every released schema version. Migration tests upgrade them to current version and verify critical history, player identity, election results and officeholders remain intact.

## 16. Balance dashboards

Build developer-only reports for party vote share, seat share, incumbency, campaign spending, endorsement effects, bill passage, presidential approval, economic series, career outcomes and war frequency. Balance using batch distributions, not one memorable playthrough.
