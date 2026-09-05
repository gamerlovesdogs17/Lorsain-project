# Phase 11.3 closeout results

Date: 2026-09-04

Scope: institutional politics, public election truth, UI System V6, production deployment architecture, and current-source whole-game validation. Phase 11.4 has not begun.

The detailed requirement mapping is in `PHASE_11_3_REQUIREMENT_EVIDENCE.md`; deployment status is in `GITHUB_PAGES_DEPLOYMENT.md`; browser evidence is in `qa/phase11_3/final/`.

## Final report

### 1. Starting HEAD

This documentation/screenshot refresh continues from `6a2f5d2` (Phase 11.3 public Pages validation). Earlier closeout lineage remains: `08a1086` → `6d81af6` → `6a2f5d2`. Formatting commit `01ec453` and CI split `136698c` sit on that line; current WIP regenerates screenshots and closeout docs for a pending final push.

### 2. Final Phase 11.3 HEAD

The immutable acceptance hash is reported after the final push once CI is green; a commit cannot contain its own hash. Until then, treat acceptance as pending final CI green on HEAD.

### 3. Working-tree state

Closeout implementation and Pages validation are landed through `6a2f5d2`. Follow-up commits `01ec453` (Prettier) and `136698c` (quality/integration CI split) address Format/CI. Current WIP regenerates `docs/qa/phase11_3/final/*.png` (2026-09-04 evening) plus evidence docs; Playwright is a workspace `devDependency` for `scripts/phase11_3-capture-screenshots.mjs`. No reset, clean, or destructive source discard was used.

### 4. Map architecture changes

`PoliticalMapWorkspace` provides one map composition contract: layer controls, legend, canvas, hover tooltip, selected entity, compact inspector, and an optional full drawer. Terena, Economy, National Assembly, Governor, and Provincial Assembly election views reuse it; historical articles reuse the same result and replay primitives when geography exists.

### 5. Selection root fix

Click/tap/keyboard activation pins a small contextual card over the map without shrinking the canvas. Only **View full result** opens a larger drawer. Mobile uses the same compact card/bottom-drawer behavior. Additional cities in one province are fanned apart, and the real SVG circle owns the accessible action; the 390px production smoke independently selected Luren next to Gavren.

### 6. Campaign map modes

Campaign HQ offers Forecast, Polling, Ground Game, Previous Election, Activity, Spending, and Endorsements when public data exists. Regenerated captures show Forecast, Polling, Ground Game, and Previous as distinct modes (`campaign-forecast-1440.png`, `campaign-polling-1440.png`, `campaign-ground-game-1440.png`, `campaign-previous-1440.png`) plus HQ and mobile. Each mode has a literal legend and maintains province/constituency selection context.

### 7. Geographic polling

Public polls support national, province, and selective constituency geography. Direct, sparse, and no-local-poll states are explicit, with publication date, sample, method, and margin of error. The system does not manufacture monthly polls for all 48 constituencies.

### 8. Public forecast

Forecast uses only observable polling, the prior certified election, public economy, incumbency, materialized candidate standing, endorsements, campaign activity, and observable Ground Game. It labels Toss-up/Lean/Likely/Safe plus confidence and projects multi-member party seats rather than a fake two-party Assembly winner.

### 9. Election Night spoiler fix

Certified winner, majority, seat totals, and later RCV rounds remain behind the playback gate until the final truthful event or Instant. First viewing is labeled **Election Night**; history later offers **Replay Election Night**.

### 10. Election Night map progression

Assembly constituencies and province races begin neutral and fill only as their immutable result events appear. Totals, completion counts, gain/hold language, and recent-result feed update from revealed events. Deterministic timing uses count complexity, magnitude, turnout, closeness, and bounded stable variation without changing results.

### 11. RCV animation

Presidential bars resize and reorder from exact round totals; eliminations visibly exit, transfers and exhausted ballots are named, round state advances, and the elected threshold appears only in the truthful final round.

### 12. Historical election maps

Archived National Assembly, Governor, and Provincial Assembly elections retain actual historical maps, composition, turnout, and selection detail. Presidential history uses immutable national RCV because no geographic presidential returns are recorded.

### 13. Election Night replay

Compact presentation events are derived from immutable archives and reused by current and historical views. Final public poll/forecast observations remain separate from actual and certified results.

### 14. Dedicated Caucus pages

Every ideological caucus has a stable workspace with identity, parent party, Chair, membership/share, public priorities, prominent members, recent votes, influence, endorsements, leadership term, contest, selectorate, eligibility, candidates, ballots, and history.

### 15. Party Leadership workflow

Party pages expose the Party Leader separately from parliamentary and ideological offices, with selection method, electorate, next contest, candidates, endorsements, ranked ballots/rounds, result, and history. Player candidacy remains explicit.

### 16. Assembly Delegation leadership workflow

Each represented party's Assembly Delegation has distinct Floor Leader and Whip selection, triggers, platforms, ballots, and history. Player-facing copy no longer calls the parliamentary group an “Assembly caucus.”

### 17. Caucus Leadership workflow

The ideological Caucus Chair contest uses caucus membership as its selectorate, displays eligibility and endorsements, resolves by ranked choice, archives the result, and never auto-enters the player.

### 18. Assembly layout and leadership changes

Speaker, Floor Leaders, Whips, and current business appear before the chamber; the chamber is a link into the full seat view rather than an inline first-screen canvas. A compact Required decisions banner replaces the old full-width queue on ordinary Assembly screens. Captures: `assembly-chamber-1440.png`, `assembly-900.png`.

### 19. Global Required Decisions cleanup

Home and Office retain the full actionable queue. Other pages show a compact pending-count control that opens the queue rather than rendering unrelated decisions at the top of every screen.

### 20. Remaining UI-shell changes

Role-aware Home/Office/Career, stable global focus, entity navigation, compact tables, master/detail layouts, institution-specific visual grammar, honest limited-role labels, and material-action confirmations complete the ordinary-gameplay pass. New Game features only full-depth roles while keeping Mayor and Minister searchable as Limited.

### 21. Legacy policy-helper retirement

All 50 provision definitions use 161 policy-specific alternatives; no authored low/middle/high option remains. Read-time aliases preserve schema-13 development saves, but new writes canonicalize to the real policy option ID. Policies carry independent fiscal, capacity, wage, housing, regional, institutional, liberty, environment, and service tradeoffs. A minority of fights remain scalar-adjacent (duration, eligibility bands, timing/appropriation size) while still offering genuine institutional designs rather than a disguised less/same/more slider.

### 22. Constitutional semantic/runtime architecture

Amendments carry structured intent, clause target, current/proposed legal text, political difficulty, and modeled/text-only reach. Supported changes alter live Assembly term, presidential term-limit, Court term, and provincial veto-override rules only after 280 federal votes and 13 of 21 Provincial Assemblies; unsupported powers are not presented as simulated consequences.

### 23. News redesign

News is outlet-driven: a lead and secondary-event front page groups coverage around underlying public facts, shows the number of outlets, and offers Read/Compare Coverage. Article facts come from a public payload whitelist while outlet framing remains visibly separate. Copy is modest template fact-injection plus framing labels — not authored newspaper prose (Phase 11.4 content).

### 24. History Wiki expansion

The Wiki links years, politicians, parties, caucuses, provinces, administrations, laws, amendments, Court cases, elections, treaties, conflicts, and economic periods. Year articles use type-specific sections and article-specific contents rather than a universal event dump. Lead text is short template fact-injection, not rich encyclopedia prose.

### 25. GitHub Pages root cause

The live URL was still a branch-source Phase 10 site. The first explicit Pages workflow run for `08a1086` failed in `pnpm build` on an exact-optional property type in the polling layer, while GitHub's dynamic branch-source Pages job succeeded and continued publishing the old site. The type error is fixed in the closeout source.

### 26. Vite/base-path fix

Vite uses `/Lorsain-project/` in GitHub Actions or when `VITE_BASE_PATH` is supplied, while local development remains `/`. Entry, CSS, dynamic chunks, map/content imports, and module-Worker URLs build beneath the base. QA fixture serving remains development-only.

### 27. Pages deployment workflow

`.github/workflows/pages.yml` checks out source, installs pinned pnpm/Node, builds the workspace with the repository base, configures Pages, uploads `apps/game/dist`, and deploys with official actions and correct permissions/concurrency. Repository Pages Source must be set to **GitHub Actions** before publication.

### 28. Production-build smoke result

The Pages-style `/Lorsain-project/` build rendered with CSS/JS, title, New Game, Governor Home/Office, navigation, map hover/selection/drawer, Worker-driven End Turn, explicit save, reload, and Continue. Direct reopen returns the app because navigation is state/query based rather than browser-path routing. No QA fixture server was used.

### 29. Real deployed-site result

Live public Pages for the `6d81af6` / `6a2f5d2` lineage was validated as the Phase 11.3 game (title/shell, New Game → Governor, map, Assembly, Caucus, End Turn Worker, save/resume). Prefer Pages Source **GitHub Actions**; see `GITHUB_PAGES_DEPLOYMENT.md`.

### 30. Worker production test

The Pages-style build loaded the emitted turn Worker beneath the repository base, showed the legitimate Processing state, prevented double-run, and advanced January to February 2028. The election Worker result is recorded in the final production-browser pass.

### 31. Save/reload production test

A new Ana Mirev Governor career advanced to February 2028, saved through the real game control, reloaded from the production URL, and returned on the title screen as a one-month career dated 2028-02-01. No development fixture participated.

### 32. New-player QA

The real production path exercised Title → New Game → role roster → Governor Home → Office/navigation → map → End Turn → save/reload. Existing current-source fixture QA covers Assembly, Party, first decisions, Campaign, and election workflows without giant onboarding prose.

### 33. Role-transition QA

Tests and replay fixtures cover MP/Speaker incompatibility, Governor-to-presidential opportunity, candidate win/loss, Party Leader + MP, Caucus Chair + MP, Provincial Assembly promotion, justice duty, and former-officeholder continuation. Concurrent labels do not imply Party Leader = Floor Leader or Caucus Chair = Party Leader.

### 34. Repeated-bug regression tests

Focused tests protect compact map selection, nonblank certified/historical maps, campaign modes, real caucus routing, Election Night spoiler gates/report order, first-screen Assembly hierarchy, role terminology, policy IDs, constitutional behavior, authority, certification/recount, and meaningful provincial leadership history.

### 35. Current performance

Current 600-month telemetry: median monthly turn `1326 ms`, p95 `11259 ms`, and maximum `49440 ms` (shard `performance.maxTurnMs`; aggregate records median/p95 only). Heavy turn and national election counts remain off the main interface Worker. Production main bundle is about 11.3 MB before gzip (2.58 MB gzip); route/data splitting is Phase 11.5 release engineering.

### 36. Save sizes

Current schema-18 seed `P113-WG-000`: start `1.84 MiB`, 1 year `2.86 MiB`, 4 years `7.34 MiB`, 10 years `14.88 MiB`, 25 years `34.56 MiB`, and 50 years `74.30 MiB`. Section-level attribution is stored in the current shard. Growth is large and roughly linear rather than an accidental duplicated snapshot explosion; immutable archive compaction remains release work.

### 37. Deterministic 1×600

`P113-WG-000` completed 600/600 months to 2078-01-01 with hash `646457c47faeb4fe505184d84b9b67e2`. A separate midpoint-save/reload path produced `646457c47faeb4fe505184d84b9b67e2`; continuous versus segmented match = `true` (`dualRunMatch` and `reloadMatch`). Runs with execution errors: `0`; catastrophic failures: `0`.

### 38. 10×600 / 25×600 result

Not rerun. One current-source 600-month seed takes roughly 26 minutes and produces a roughly 75 MiB save; multiplying that before the explicitly deferred release soak was not practical or proportionate after the deterministic run and controlled mechanic tests. The 100×600 monster soak remains Phase 11.5.

### 39. Strict invariant failures

`0` strict-v1 failures across the completed current-source 600-month run. Candidate-shortage events: `0`; active Governors at end: `21`; generated-person quality errors/warnings: `0` / `0`.

### 40. Genuine remaining blockers

No known code or deterministic-simulation blocker remains. Formal Phase 11.3 `ACCEPTED` waits on final CI green on HEAD after the Prettier + quality/integration split. Public Pages path is already validated on the closeout lineage.

### 41. Nonblocking deferred items

- Phase 11.4: richer biographies, news prose, tutorials, flavor events, and worldbuilding variety.
- Phase 11.5: public-deployment retest, route/data splitting, immutable-save compaction, automated visual-diff CI, and the 100×600 release soak.
- Mayor/Minister remain truthfully Limited; municipal legislatures and ministry portfolio simulators are outside v1.
- Later-cycle nomination totals can take seconds of Worker time, but the browser remains responsive.

### 42. Phase 11.3 acceptance

**Ready for acceptance after CI** — pending final CI green on HEAD.

Gameplay/Pages closeout through `6a2f5d2` remains validated: live public URL smoke on `6d81af6`/`6a2f5d2` lineage (title/shell, New Game, map, Assembly, Caucus, End Turn Worker, save/resume). 1×600 evidence retained; no rerun. Screenshots regenerated into `docs/qa/phase11_3/final/` on 2026-09-04 evening from CURRENT HEAD via `scripts/phase11_3-capture-screenshots.mjs`. Prettier formatting (`01ec453`) and quality/integration CI split (`136698c`) address prior Format-step failure; do not mark `ACCEPTED` until the split CI jobs are verified green on the pushed HEAD.

STOP. Phase 11.4 has not begun.
