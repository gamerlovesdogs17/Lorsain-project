# Phase 11.2 Results

Date: 2026-08-23  
Scope: integration closeout, role gameplay, economic geography, campaign geography, concrete legislation and UI System V4  
Starting revision: `1603049 Complete Phase 11.1 recurring election closeout`

## Status

Phase 11.2 is complete. No known blocker remains in the supported v1 gameplay path. Phase 11.3 balance tuning has not begun.

The phase adds one permanent page (`Office`), makes Home and navigation role-aware, places Political Opportunities inside Career, adds Governors as a distinct Elections view, and removes the nonfunctional Organizations map mode. No accepted federal simulation system was replaced.

## Integration closeout

- Future presidential contests are created as empty shells. Candidate interest is populated when the nomination exploration window opens from then-current eligibility, office, leadership, standing, election history, prominence, career and term-limit state. Filed historical fields do not change.
- Nomination-resolution turns use `apps/game/src/turnWorker.ts`. Browser QA showed a truthful `Counting nominations…` status, disabled End Turn, and a responsive main UI. Continuous and save/reload simulation hashes remain identical.
- Assembly allocation pins every candidacy whose status is `filed`. Player filing or decline allocates around those records and cannot move an NPC, duplicate the player, or reshuffle saved geography.
- A populated browser run found and fixed an analogous exact-date scheduler defect: a nonblocking auto-vacancy due exactly on the turn target is now processed before the save receives that date. The June 2029 Court vacancy no longer stalls play.

## Page and navigation architecture

| Decision | Result |
| --- | --- |
| Home | retained; rebuilt as a role-specific briefing |
| Office | added; owns current-office identity and actions |
| Career | retained; Political Opportunities is the default view |
| Province / Governor | implemented as the Governor form of Office, avoiding a duplicate page |
| Provincial elections | implemented as the Governors view within Elections |
| Election detail | implemented as type-specific panels within Elections |
| Terena Map | renamed Maps; route identity retained for compatibility |
| Organizations map mode | removed because no canonical public geographic dataset exists |
| Politician directory | not added; New Game search and existing politician cards satisfy the current workflow |
| Government/administration detail | not added as another sidebar destination; Office and Executive divide authority cleanly |
| Regional statistics | shared between Office, Economy and Maps rather than duplicated |

The sidebar keeps national information accessible while marking the pages most relevant to the current role. Office is labeled Presidency, Province, Member's office or Judicial office where appropriate. A private or former officeholder is directed toward Career without losing access to government reference screens.

## Governor gameplay and elections

A Governor has two monthly provincial actions and may:

- set one bounded administrative priority;
- direct a public-investment emphasis;
- support or oppose a named federal initiative affecting the province;
- answer an open province-specific pressure through mobilization, coordination or a request for federal support.

The Office page combines current province conditions, employment, housing, federal relationship, standing, relevant MPs, unresolved pressure and the next race. Commands validate the current substantive Governor and target province; no UI-only permission exists.

All 21 provinces receive recurring gubernatorial races. The documented v1 procedural assumption is a direct province-wide plurality election every four years. Races have filing windows, explicit player file/decline, current-state NPC incumbency/challenger decisions, campaigns, results, assumption, history and next-cycle scheduling. Winning ends incompatible offices on assumption. The rule is a gameplay assumption, not newly invented constitutional lore.

Minister and Mayor remain deliberately limited roles. A Minister chooses one named monthly advisory focus; a Mayor chooses one monthly civic emphasis. Repetition in the same month is rejected by the command layer and the UI shows the recorded choice. They are not featured as equivalent full-depth starts.

## Political Opportunities

Career now answers “What can I run for?” before static biography. It evaluates President, Assembly and Governor opportunities using current eligibility and incompatibilities. Each row shows office, public geography, election and filing dates, incumbent/public field information and current status. The player must explicitly file or decline.

Assembly geography is presented as eligible constituencies ranked by public home connection and seat magnitude. Governor geography is limited to eligible provinces. No latent support or invented win percentage is exposed. Campaign begins only after a legitimate candidacy exists and then owns race execution.

## Concrete legislation

The public bill workflow contains 15 concrete policy categories with three named legal options each. A bill requires one provision and permits at most three, with duplicate categories rejected. The composer shows current law, proposed change and restrained national metric estimates. Internally each option maps to a typed `PolicyItem`; normal play does not expose raw direction/magnitude controls.

NPC bills use deterministic category-specific titles and summaries such as `Sector Bargaining Standards Bill`, `Reproductive Health Protection Bill` and `Independent Police Review Bill`. Bill copy never uses issue IDs or the former “Moderate on …” phrasing. Amendments remain compatible with the underlying accepted legislative system.

## Starting economy and behavior

Canonical January 2028 national values:

| Metric | Start |
| --- | ---: |
| Output | 98.7 |
| Employment | 99.3 |
| Prices | 103.8 |
| Real wages | 97.6 |
| Housing | 96.4 |
| Confidence | 94.8 |
| Fiscal pressure | 0.41 |

- Province conditions range: **91.9–105.2**.
- Sector conditions range: **92.8–102.7**.
- Twelve-seed, 48-month calibration: one-year output change **+0.237 to +2.603**; four-year change **+0.165 to +2.881**; largest province spread **17.088**; **4** shocks; **0** bound hits; average monthly output movement **0.148**; average direction changes **10.58**.

Province profiles carry sector exposure plus growth, inflation, housing and trade sensitivity and bounded structural trend. National cycles, momentum, policy lags, shocks and slow anchors create short-, medium- and long-term movement without a pure random walk or forced return to exactly 100. A regression test confirms a highly trade-exposed island province reacts more strongly than the sheltered federal district to an identical trade disruption.

The Economy screen shows current level, monthly/12-month/longer change, bounded history, sectors, province history and public shock/policy explanations. Wording is `Index reference = 100`, not `Jan 2028 = 100`.

## Campaign geographic organization

Campaign state now distinguishes national infrastructure, province organization and constituency organization. National work distributes small effects across all 21 provinces and all 48 constituencies using population/geography rather than sorted IDs. Province work strengthens the province and spills unevenly into its constituencies; constituency work remains local. Monthly maintenance retains infrastructure while allowing unattended strength to decay.

Calibration evidence:

- national constituencies reached: **48/48**;
- national provinces reached: **21/21**;
- mean gain C001–C004: **0.003415**;
- mean gain C005–C048: **0.003409**;
- only-first-four result: **false**;
- province action gain: **0.0990**;
- constituency action gain: **0.1204**;
- twelve-month persistence: **0.1238 → 0.08591**;
- final constituency range: **0.008–0.08591**.

The Campaign map has province and constituency scales, a real organization legend, recent selection detail and no latent-support layer.

## Map changes and QA

- Political mode shows current sitting Assembly plurality/composition.
- Election mode is tied to a selected real election. Assembly and gubernatorial results use their public geography; a national presidential election with no geographic result is explicitly neutral rather than fabricated.
- Campaign mode shows the campaign's province/constituency organization.
- Economy mode shows canonical and evolving province conditions.
- Organizations mode was removed until public geographic organization data exists.
- World modes remain Relations, Alliances, Crises, Sanctions and Posture and now have the same real tooltip, click/tap and keyboard-selection behavior.

Domestic and world maps use temporary hover, leave-to-clear, persistent click/tap selection, keyboard Enter/Space selection, restrained borders and a lightweight tooltip. Terena Maps additionally support zoom, pan and reset. Pointer capture begins only after a real drag threshold, so a click is not swallowed. Mobile selection does not depend on hover.

## Performance

Measured in the real in-app browser on this development host:

| Operation | Total | UI dispatch / observed main-thread upper bound |
| --- | ---: | ---: |
| 2028 nomination-resolution turn | 6.157s | 431ms |
| 2033 nomination-resolution turn | 15.140s | 325ms |
| Normal January 2028 End Turn | 1.152s | 282ms |
| 2030 Assembly Worker count | 14.242s | 277ms |

During both nomination measurements the status was `Counting nominations…`, End Turn was disabled, and polling remained responsive. The click-return value includes browser-control round-trip overhead, so it is a conservative observed upper bound rather than an engine task-duration claim. No percentage is fabricated. The existing Assembly Worker is preserved.

The final 20-seed Assembly calibration reported a mean full count of **7.391s** (6.592–8.230s) and mean archive serialization of **12.64ms**. Large repeated lists remain bounded, filtered or progressively disclosed.

## Browser playtest matrix

| Role | Evidence exercised |
| --- | --- |
| President | role Home, Presidency/Executive, Foreign Affairs, Economy, opportunities and maps |
| Speaker / MP | Assembly agenda, concrete bill introduction, votes/workflow, Career and election path |
| Governor | role Home, Province Office, economy, successful priority action, federal position choices, Career, presidential declaration and campaign geography |
| Non-incumbent | Alina Fairwin private-citizen Home, eligible opportunities, multi-year continuation and public history |
| Former officeholder | Mara Velic continued after the 2029 presidential transition; Home became career-focused and Governor/Assembly opportunities remained available while the term-limited presidency was explained |
| Justice | Belma Kerrin Court bench, docket, vote context, recent rulings and precedent empty states |
| Minister | Amara Fenric selected a named advisory focus; second action disabled/rejected for the month; role labeled Limited |
| Mayor | Alina Iordan set a civic emphasis; second action disabled/rejected for the month; role labeled Limited |

The populated run reached September 2033 and included the 2028 presidential result, 2029 gubernatorial results, 2030 Assembly result/assumption, regional economic movement, years of grouped News and years of public Archive history. The June 2029 justice expiry and both election Workers were exercised in the browser.

Responsive widths **1440, 1200, 900, 600 and 390px** were inspected. At 1200/900/600 the responsive drawer was present and document width stayed within the viewport. At 390 the Governor, Campaign and map-selection workflows remained usable with no horizontal overflow; priority order was actions, main visualization, then reference detail.

## Screenshot evidence

Screenshots are stored in `docs/qa/phase11_2/`:

1. `01-home-president-1440.png`
2. `02-home-governor-1440.png`
3. `03-career-political-opportunities-1440.png`
4. `04-governor-province-office-1440.png`
5. `05-active-presidential-campaign-1440.png`
6. `06-campaign-organization-map-1440.png`
7. `07-economy-national-trends-1440.png`
8. `08-economy-regional-map-1440.png`
9. `09-political-map-hover-1440.png`
10. `10-election-map-no-hidden-geography-1440.png`
11. `11-assembly-results-1440.png`
12. `12-gubernatorial-race-1440.png`
13. `13-news-populated-1440.png`
14. `14-archive-populated-1440.png`
15. `15-mobile-governor-390.png`
16. `16-mobile-campaign-390.png`
17. `17-mobile-map-selection-390.png`

## Validation

Required repository commands are recorded at final closeout:

| Command | Result |
| --- | --- |
| `pnpm build` | PASS |
| `pnpm test` | All 49 files / 478 tests PASS; process reports the known Vitest worker-RPC transport error after completion |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm validate:content` | PASS |
| `pnpm validate:phase0b:recount` | PASS; 420 seats |
| `pnpm game:build` | PASS |
| `pnpm calibrate:foreign` | PASS; 20 seeds × 15 years |
| `pnpm calibrate:assembly` | PASS; 20 seeds |
| `pnpm calibrate:economy` | PASS; 12 seeds × 48 months |
| `pnpm calibrate:campaign-geography` | PASS |

The exact unsplit `pnpm test` command completed all **49 files / 478 tests with zero assertion failures** in 1,397.05s, then returned nonzero because Vitest 3.2.7 reported `[vitest-worker]: Timeout calling "onTaskUpdate"`. The same fixed 60-second worker-RPC limitation can occur in the five-minute foreign file even though its configured test timeout is 90 seconds; its 32 tests all pass. The isolated Phase 11 integration file exits cleanly with all 9 tests passing in 691.46s, and the remaining corpus passed all 469 assertions. A legacy election test that printed its entire national IRV archive was independently reduced to a deterministic archive hash. No test was skipped and no assertion failed; `P10-VITEST-TIMEOUT` remains a runner-level nonblocking issue.

## Final analogous-bug review

The final sweep searched first/sorted/sliced selection, hardcoded 2028 IDs, flat 100 defaults, `winnerIds[0]`, raw-ID fallbacks and placeholder modes. Clear blockers found and fixed in addition to the named work:

- exact-target nonblocking office expiry could invalidate a legitimate long save;
- Minister advice silently selected the first issue and role actions could repeat without a monthly limit;
- World map interaction still relied on SVG title text and lacked keyboard/real tooltip parity;
- NPC campaign messaging selected the lexicographically first issue instead of the politician's highest-salience issue;
- NPC cabinet vacancy order selected the first office ID rather than a deterministic political draw;
- NPC Assembly eligibility was tested only against the first constituency instead of any legitimate constituency;
- Court proceedings used raw ID order rather than stage-ready and introduced dates.
- an election test emitted the entire national transfer archive even though a compact deterministic hash was sufficient evidence, overloading the long-suite runner channel.

Stable ordering retained after review is used only for final deterministic tie-breaking, public chronological selection, bounded display, or explicit calibration comparison. Presidential `winnerIds[0]` remains correct for the single-winner RCV domain; Assembly UI uses all winners and party seat totals.

## Remaining nonblocking / deliberate deferrals

- Detailed gubernatorial constitutional procedure may later replace the documented v1 plurality assumption.
- Minister, Mayor, party-leader and faction-chair depth remains intentionally bounded; the UI labels the limitation and does not feature those starts as full equivalents.
- Organizations has no map mode until canonical public geographic presence data exists.
- Historic save fixture files and production bundle code-splitting remain release-engineering backlog.
- Phase 11.3: deep incumbency, competitiveness, economic coefficient, war-frequency and long-run distribution balance.
- Phase 11.4: biographies, news/flavor prose, tutorials and worldbuilding variety.
- Phase 11.5: release-candidate audit, packaging and final v1 decision.
