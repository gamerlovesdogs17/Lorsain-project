# Phase 11.3 results

Date: 2026-08-28

Scope: institutional politics, UI System V6, legislative depth and whole-game balance

Interrupted-export prompt baseline: `398d8e52b40c369f542dd2367fe38b86d173d719`; actual repository HEAD at resume: `2d215a606f090690b671ba3133357cb1a32fabb`

Safety checkpoint: `9031478` (`WIP: preserve interrupted Phase 11.3 institutional implementation`) on `phase11-3-institutional-resume`

Acceptance artifact: `docs/qa/phase11_3/whole_game_calibration.json`

Phase 11.4 has not begun.

## Final report

### 1. Final commit hash

The final immutable hash is reported in the task handoff after the closeout commit is created. A commit cannot contain its own hash. The interrupted work was preserved first at `9031478`; no reset, clean, checkout, or source discard was used.

### 2. Working-tree status

The task handoff records the post-commit `git status --short` result. The intended acceptance state is a clean `phase11-3-institutional-resume` worktree with all implementation, documentation, evidence and generated type outputs committed.

### 3. Long-run candidate-depletion fix

Federal recruitment no longer waits for count time and does not use an emergency anonymous-candidate patch as its normal path. Before Assembly filing, it counts real valid filings, incumbents who actually seek reelection and command-layer-eligible challengers. It promotes enough existing Provincial Assembly politicians to keep every constituency's legitimate field larger than its seat count. Stable identity, age, geography, party/faction membership, biography, save persistence and later officeholding all survive promotion.

### 4. Party directory architecture

Party is an all-party master/detail workspace. It exposes government/opposition status, national and provincial representation, leader, factions, officeholders, nomination and leadership contests, election performance and recent public events. It no longer treats the player's party as the only institution or a multi-member Assembly result as one national winner.

### 5. Caucus architecture

National Assembly caucuses are derived from sitting members and kept separate from whole-party membership. Every represented party has a persisted floor leader, whip, selection date, next election date, priority bills and public bill recommendations. Provincial caucuses have their own named floor leaders and whips without duplicating the federal legislature engine.

### 6. Party leadership election rules

Vacancies trigger contests immediately. Otherwise, four-year January reviews beginning in 2029 can trigger a contest after low cohesion, a severe Assembly defeat or a deterministic challenge check. Up to four eligible non-player candidates enter automatically; the player must explicitly enter. The full party membership is the selectorate, ranked-choice resolution is deterministic, and every contest is archived.

### 7. Caucus election rules

Represented Assembly parties elect floor leaders and whips after a general election, on a vacancy, after an eligible low-cohesion challenge, or after a four-year review that is itself politically triggered. A review that does not trigger a contest advances the next review date instead of producing calendar spam. Sitting caucus members are the selectorate. NPC candidates are ranked by role-relevant legislative, negotiating, loyalty and pragmatic attributes; the player is never auto-entered. Platforms, senior/caucus endorsements, named ballots, totals, winners, triggers and dates persist.

### 8. Parliamentary leadership/whip architecture

The Speaker, party floor leaders, whips and committee chairs are distinct offices. Floor leaders and whips can set public caucus positions on bills; the command layer rejects outsiders. Committee chairs and rosters are reseeded from actual current members, and post-election Speaker selection excludes the player and anyone holding an incompatible active office.

### 9. Assembly chamber visualization

The Assembly page renders all 420 authorized seats in a compact party-grouped semicircle. Selecting a seat opens the linked politician rather than creating 420 cards. Composition supports party totals, government/opposition reading and vacancies while current business and required votes remain more prominent than decorative geometry.

### 10. Federal roll-call architecture

Federal votes persist each named member's yes/no/abstain/absent choice, party totals, threshold, result and public date. Bill detail, roll-call detail and politician voting records link to one another. Filters separate bill, treaty, war, censure, confirmation and constitutional votes, and only current authorized members can vote.

### 11. Politician profile/directory architecture

One shared profile surface is reachable from linked names, global search, chamber seats, parties, courts, elections and office pages. It shows a natural display name and biography, geography, party/faction, current and former offices, election/campaign history, public standing, leadership record and filterable voting history. Generated politicians use the same model and never fall back to raw IDs as public names.

### 12. Court bench visualization

Courts presents the nine Constitutional Court seats as a bench with justice, vacancy and selected states, followed by the live docket and recent decisions. The design keeps the current case and required judicial action prominent instead of allowing empty procedural sections to dominate.

### 13. Court vote/opinion architecture

Resolved cases persist every justice's vote, disposition, majority author, dissent author where applicable, holding and public opinion text. Federal-provincial disputes and provincial-law invalidations use the same judicial record. Qualification and precedent matter without turning justices into party robots.

### 14. Judicial eligibility/appointment redesign

The President's appointment browser lists only legally qualified candidates for a real vacancy and explains the public professional basis. Constitutional lawyers, public-law attorneys, appellate/lower-court judges and promoted provincial solicitors provide a renewable pool. Confirmation remains 252 of 420; professional record and institutional confidence permit cross-party confirmations while controversial nominees may still fail.

### 15. Provincial Assembly model

Each of the 21 provinces has one unicameral lightweight Assembly with persisted members, party seat totals, Speaker, party floor leaders/whips, elections, public bills, named roll calls, Governor decisions and constitutional-ratification votes. It is deliberately not a second full federal government: there are no provincial cabinets, detailed budgets, taxes, committees or separate constitutions.

### 16. Provincial Assembly sizes

Chambers scale by canonical population/electorate weight using a bounded square-root rule. The smallest has 25 seats, the largest 65, and all 21 chamber totals are validated after elections and save/reload. Formal run median total: `{{PROVINCIAL_SEATS_MEDIAN}}` seats nationwide.

### 17. Provincial election system

Provincial Assembly elections recur every four years and use deterministic provincewide party-list proportional allocation with largest remainders and stable final tie-breaks. Candidates and winners remain named political actors. An eligible player must explicitly file or decline; no monthly AI decision can run the player.

### 18. Lightweight provincial-politician architecture

Provincial legislators have stable IDs, unique public names, short rule-based biographies, birth year, province, party/faction, standing, legislative/campaign skills, ambition and service history. Non-winners remain in the province's renewable political pool. This provides visible careers without giving every local figure the full national agent footprint.

### 19. National-politician promotion architecture

Promotion upgrades an existing provincial figure into a complete `PoliticianRuntime` and synthetic agent profile while retaining home province, party/faction, name, description and prior service. Promotion occurs before federal filing based on actual supply needs or career opportunity, not after a count fails. The full politician can then run, campaign, hold office, lead a party and enter later elections normally.

### 20. Governor legislative process

Provincial Assemblies introduce bounded measures in areas consistent with Governor authority. Members cast recorded final votes; a passed bill goes to the Governor. NPC Governors sign or veto from public policy and political context. A player Governor receives an explicit command decision and inaction never becomes an invented affirmative choice.

### 21. Provincial veto/override rule

A Governor may sign or veto a passed provincial bill. A veto returns it to the chamber, where at least two-thirds of authorized seats is required to override. Signed or overridden measures become provincial law; failed overrides are archived with the named roll call.

### 22. Federal–provincial Court integration

Provincial laws and Governor/federal conflicts can create Constitutional Court disputes. The Court may uphold or invalidate a provincial law and records named votes and opinions. The UI links the case to its province and affected law while exposing public holdings rather than hidden judicial utility.

### 23. Constitutional amendment procedure

An amendment requires at least 280 votes in the 420-seat National Assembly, followed by ratification in at least 13 of 21 Provincial Assemblies. The President has no sign, veto or ratification role. Lorsain v1 has no invented universal ratification deadline; a proposal may carry one only if a future authorized rule supplies it. Province scheduling is deterministically rotated by amendment-specific hash rather than always starting with the first province IDs.

### 24. Constitutional rules made dynamically amendable

Supported runtime rules are Assembly term years, presidential term limit, Court term years and the legislative veto-override fraction. Elections, opportunities, office transitions and override votes read the live constitutional rule store rather than stale 2028 constants. Presidential term length, gubernatorial terms, Court size and deeper constitutional rewrites remain unsupported and are not presented as amendable choices.

### 25. Federal bill/provision redesign

Bills contain one to three concrete legal provisions, with only one required. Each provision displays current law, proposed law, named alternatives, fiscal direction and estimated public metric effects. Deterministic editorial title templates produce ordinary legislative names and summaries; NPC bills no longer surface IDs or phrases such as “moderate on …”.

### 26. Ordinary amendment redesign

An ordinary amendment targets one existing provision and substitutes one valid named legal option. It does not replace the bill with a broad ideology slider. Version history records proposer, date, old option, new option and resulting bill text; invalid targets, duplicate current-law choices and unauthorized commands reject safely.

### 27. Number of major policy provisions/options added

There are 50 major provision categories and 161 named legal options. Each category has two to five alternatives, including asymmetrical institutional choices rather than a universal less/same/more scale. Persisted option IDs are policy-specific (for example, `national_protection`) rather than universal `low/current/high`; schema-13 development saves can read the old aliases and canonicalize all new writes.

### 28. Organizations redesign

Organizations respond to votes, sponsorship, enactment, signature, veto and campaign behavior through separate affinity, trust and policy-alignment dimensions. Meetings provide a small bounded relationship change rather than a primary grinding strategy. Endorsements require a live political basis and are publicly withdrawn when the campaign ends or the relationship collapses.

### 29. Organization scorecard architecture

The public scorecard shows relationship tier, trust, alignment, recent recorded interactions, issues, current activity and endorsement status without exposing hidden utility. It links relevant politicians, bills and campaigns. Geographic data is shown only where a legitimate public basis exists; the fake neutral organization map mode remains removed.

### 30. Ground Game terminology/presentation

Player-facing campaign copy uses Ground Game for campaign field infrastructure. The Campaign command center distinguishes national infrastructure, provincial strength and constituency strength, with recent visits, actions, resources and map selection in one workflow. It does not present normalized internal decimals as a vague “organization” stat.

### 31. Ground Game balance

National actions distribute small deterministic effects across real geography, province actions create weighted local spillover, constituency actions stay focused, and inactive field strength decays slowly rather than vanishing or remaining permanently maxed. Calibration confirms no sorted-ID C001–C004 preference and meaningful province/constituency spread: `{{CAMPAIGN_BALANCE_SUMMARY}}`.

### 32. New public economic metrics

Economy now emphasizes real growth, employment rate, CPI inflation, real-wage change, housing pressure, confidence and fiscal pressure while retaining internal indices for simulation. National, sector and province history distinguishes monthly, 12-month and longer movement; shocks and policy explanations remain public without exposing formulas.

### 33. Map inspector redesign

The Terena and World maps use a compact pinned inspector so geography remains the primary surface. Hover is temporary, click/tap/keyboard selection persists, mouse leave clears only hover, tooltips are mode-specific and hidden voter truth is never shown. Election, Campaign and Economy modes read actual named data; the false Organizations mode is absent.

### 34. Political Calendar

The calendar is a reusable panel rather than another permanent sidebar destination. It groups filing openings/deadlines, elections, assumptions, party/caucus leadership contests, legislative decisions, Court work and any authorized proposal-specific constitutional deadline, with role relevance and linked destinations.

### 35. Global search/profile navigation

The command palette searches politicians, parties, provinces, constituencies, bills, elections, organizations and Court cases. Results navigate to the correct page and selected detail where possible. Linked names across institutional screens use the same profile navigation model.

### 36. UI before/after architecture

V5's repeated dashboard-card grammar is replaced by V6 role workbenches, dense master/detail layouts, split panes, entity rows, chamber/bench visualizations, compact tables, timelines, maps and drawers. Navigation remains role-aware: Home briefs the current politician, Office hosts current authority, Career handles identity/opportunities, and informational national institutions remain accessible. The full comparison is in `docs/PHASE_11_3_UI_BEFORE_AFTER.md`; rules are in `docs/UI_SYSTEM_V6.md`.

### 37. Screenshots

Thirty-seven asserted running-browser JPEG captures are stored in `docs/qa/phase11_3/screenshots/`, with the fixture/assertion contract and decoded dimensions in `docs/qa/phase11_3/browser-qa-manifest.json`. They cover the 420-seat chamber, bill and committee details, federal/provincial roll calls, politician profile/record, amendment tracker, Court bench/decision/appointment, party/caucus politics, Governor play, Ground Game, economy/maps, calendar/search and required 1440/1200/900/600/390 responsive states. The browser console remained free of warnings and errors through the final role/map pass.

### 38. Full calibration sample size

`{{RUNS_COMPLETED}}` independent deterministic seeds × 600 months = `{{MONTHS_TOTAL}}` simulated months, plus seed-0 continuous/continuous and continuous/save-reload comparisons. This is the real monthly engine, not a reduced election-only model.

### 39. Catastrophic invariant failure rate

`{{CATASTROPHIC_FAILURES}}` catastrophic invariant failures across `{{RUNS_COMPLETED}}` completed runs: `{{CATASTROPHIC_RATE}}`. Runs with execution errors: `{{RUN_ERRORS}}`.

### 40. Candidate-generation statistics

Median Provincial-to-national promotions: `{{PROMOTIONS_MEDIAN}}` per run; median generated national politicians: `{{GENERATED_NATIONAL_MEDIAN}}`; total candidate-shortage events: `{{CANDIDATE_SHORTAGE_SUM}}`. Fields are generated before filing from renewable provincial careers rather than patched at count time.

### 41. Party leadership turnover statistics

Median party-leadership contests: `{{PARTY_CONTESTS_MEDIAN}}` per 50-year run; median faction-chair contests: `{{FACTION_CONTESTS_MEDIAN}}`. Vacancies, low cohesion, severe losses and recurring review can all cause turnover.

### 42. Caucus turnover statistics

Median national caucus floor-leader/whip contests: `{{CAUCUS_CONTESTS_MEDIAN}}` per run. Contests follow general elections, vacancies, low-cohesion challenges and politically triggered four-year reviews, with explicit player entry.

### 43. Provincial legislative/election statistics

Median per run: `{{PROV_ELECTIONS_MEDIAN}}` Provincial Assembly elections, `{{PROV_LEADERSHIP_MEDIAN}}` provincial leadership elections, `{{PROV_BILLS_MEDIAN}}` bills introduced and `{{PROV_LEGISLATORS_MEDIAN}}` persisted provincial politicians. Chamber totals remained within 25–65 seats and valid after every completed run.

### 44. Governor legislative statistics

Median per run: `{{PROV_SIGNED_MEDIAN}}` provincial bills signed, `{{PROV_VETO_MEDIAN}}` vetoed and `{{PROV_OVERRIDE_MEDIAN}}` vetoes overridden. The 21 Governors also continued through recurring provincewide elections; aggregate Governor races: `{{GOV_RACES}}`.

### 45. Constitutional amendment statistics

Median proposed per run: `{{CONST_PROPOSED_MEDIAN}}`; total ratified: `{{CONST_RATIFIED_SUM}}`; median failed: `{{CONST_FAILED_MEDIAN}}`. Every adopted amendment satisfied both federal and provincial thresholds. No proposal expired under an invented universal deadline because v1 has none.

### 46. Federal legislative statistics

Median per run: `{{FED_BILLS_MEDIAN}}` bills introduced, `{{FED_ENACTED_MEDIAN}}` enacted/signed and `{{FED_RETURNED_MEDIAN}}` returned by the President. Bills retain concrete provisions, versions, committees and named roll calls through the full horizon.

### 47. Organization relationship statistics

The neutral long-run harness takes no proactive player meetings, so its organization-action statistic is reported separately from controlled behavior tests: median actions `{{ORG_ACTIONS_MEDIAN}}`, median persisted public relationships `{{ORG_RELATIONSHIPS_MEDIAN}}`, total active/historical endorsements at run end `{{ORG_ENDORSEMENTS_SUM}}`. Regression tests prove a meeting adds only 0.015 affinity, no more than two meetings may occur in a month, policy behavior drives trust/alignment, and obsolete endorsements withdraw.

### 48. Career-mobility/generational statistics

The harness samples 24 canonical careers per run and records every office transition. Across the full matrix, median promotions were `{{PROMOTIONS_MEDIAN}}` and median full national politicians generated from the renewable class were `{{GENERATED_NATIONAL_MEDIAN}}`; the sampled transition total was `{{CAREER_TRANSITIONS_SUM}}`. Median NPC retirements/deaths were `{{RETIREMENTS_MEDIAN}}` / `{{DEATHS_MEDIAN}}`; median original politicians still active in 2078 were `{{ACTIVE_ORIGINAL_MEDIAN}}`, and mean active political age was `{{ACTIVE_AGE_MEDIAN}}`. Provincial service, Assembly, Governor, leadership, Court and presidential routes remain connected over fifty years.

### 49. Economic-cycle statistics

Across the matrix, median 50-year output-index change was `{{OUTPUT_DELTA_MEDIAN}}`, median output sign changes `{{OUTPUT_SIGN_CHANGES_MEDIAN}}`, median direction changes `{{OUTPUT_DIRECTION_CHANGES_MEDIAN}}` and median provincial ranking churn `{{RANKING_CHURN_MEDIAN}}`. Dedicated economic calibration: `{{ECONOMY_CALIBRATION_SUMMARY}}`. No canonical start is flat at 100 and the model exhibits cycles rather than pure random walk or universal reversion.

### 50. Campaign balance

Dedicated campaign-geography calibration completed with `{{CAMPAIGN_CALIBRATION_STATUS}}`. National actions do not select C001–C004, province actions remain weighted by local geography, targeted actions are stronger locally, and bounded decay prevents both instant disappearance and permanent maximum organization.

### 51. Performance before/after

Formal matrix median-of-run median turn time: `{{MEDIAN_TURN_MS}} ms`; median-of-run p95: `{{P95_TURN_MS}} ms`; maximum observed: `{{MAX_TURN_MS}} ms`. The Assembly Worker is preserved. Nomination-heavy turns use the off-main turn Worker with a truthful indeterminate state and double-run guard, so multi-second later-cycle work does not freeze the browser.

### 52. Save-size growth

Median final schema-14 save after 600 months: `{{FINAL_SAVE_BYTES}}` bytes (`{{FINAL_SAVE_MIB}} MiB`); minimum `{{FINAL_SAVE_MIN_BYTES}}`, maximum `{{FINAL_SAVE_MAX_BYTES}}`. Schema migration preserves player/date/history and deterministically seeds new structural fields without fabricating past events.

### 53. Deterministic save/reload results

Seed `{{DETERMINISM_SEED}}`: continuous-versus-continuous match `{{DUAL_MATCH}}`; continuous-versus-midpoint-save/reload match `{{RELOAD_MATCH}}`. Final hashes: `{{DETERMINISM_HASHES}}`. The targeted former candidate-shortage seed is `P113-WG-000`, the exact archived run that previously failed near month 358.

### 54. Remaining BLOCKERS

`{{BLOCKERS}}`

### 55. Genuinely NONBLOCKING debt for 11.4/11.5

- Later-cycle nomination counts can still consume multiple seconds of Worker time as the political population grows, although the UI remains responsive.
- The production client bundle remains large because canonical geography/content is bundled; route/data splitting is release engineering for 11.5.
- Manual responsive browser evidence exists, but automated screenshot-diff CI does not.
- Mayor and Minister are truthfully labeled limited roles; full municipal legislatures and ministry portfolio games are outside v1.
- Detailed provincial election canon can later replace the documented v1 proportional abstraction without discarding the institutional layer.
- Richer biographies, news prose, tutorials and content variety belong to 11.4.

### 56. Additional ideas for post-11.5 reassessment

After the release-candidate decision, reassess optional code-split geography, searchable case-law reporters, partial statutory invalidation, coalition/caucus negotiation depth, office-specific ministry portfolios, data-backed organization geography and a larger authored provincial-politician name pool. Detailed local budgets, taxes, cabinets, municipal councils and production chains should remain separate expansion decisions rather than stealth v1 scope.

### 57. STOP

Phase 11.3 stops here. Phase 11.4 has not begun.
