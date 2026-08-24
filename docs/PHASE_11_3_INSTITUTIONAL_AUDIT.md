# Phase 11.3 Institutional Audit

Date: 2026-08-23  
Baseline: `398d8e52b40c369f542dd2367fe38b86d173d719`  
Status: pre-implementation audit with post-implementation re-review

## Purpose

Phase 11.3 V5 rebuilt much of the presentation layer and added a long-run calibration harness. It did not complete the institutional simulation needed to support that interface over a fifty-year game. This audit records what is real in the current source, what is only a presentation, and which existing systems should be extended rather than replaced.

The central architectural problem is candidate supply. The current uncommitted patch creates full synthetic Assembly candidates during federal field allocation. It is deterministic and saveable, but it is an emergency generator at the moment of shortage. A durable game needs politicians to exist before a federal filing decision, acquire provincial careers, become publicly legible, and then advance or leave politics.

## Institutional findings

| System | What currently exists | Player-facing reality | Blocking gap | Phase 11.3 decision |
| --- | --- | --- | --- | --- |
| Federal Assembly | 420 offices; committees; bill stages; amendments; committee/floor/repassage votes; party and faction recommendations; per-member vote records in roll calls | Bills and votes are actionable, but the chamber is primarily tables and truncated lists | No durable floor-leadership institution, weak voting-history navigation, no whole-chamber view, and long-run candidate depletion | Preserve procedure and roll calls. Add caucus leadership/whips, connected vote histories, a true 420-seat chamber view, and recruit federal candidates from provincial politics |
| Provincial politics | Governor actions, pressures, regional economic effects, and recurring gubernatorial elections | Governor has a useful but narrow office loop | No Provincial Assemblies, legislators, bills, leadership, election history, or promotion pipeline | Add 21 lightweight Provincial Assemblies with bounded PR elections, leadership, bills, Governor sign/veto, and federal recruitment |
| Parties | Party and faction runtime state; leaders/chairs; recurring contest machinery; endorsements; membership/faction changes; cohesion; presidential nominations | The Party page is centered on the player's party and a few current contests | No all-party institutional directory, no clear caucus layer, weak leadership powers, and few consequences visible for membership choices | Keep party/faction definitions and contest engine. Add directory/master-detail, scheduled leadership cycles, explicit player participation, caucus offices, and political consequences |
| Parliamentary caucuses | Party/faction recommendations and cohesion influence legislative choices | Recommendations appear around bills | No named floor leaders/whips or persistent caucus agenda | Add leadership records per represented party, public positions, agenda selection, whip estimates, and career history. Do not create a separate duplicate party membership model |
| Federal legislation | Concrete provision catalog; up to three policy items; current/estimated effects; amendments; version number; natural bill copy; presidential disposition | The draft experience has concrete choices, but later bill reading remains dense and recommendation-led | Alternatives are too generic in parts of the catalog; NPC titles/copy can feel templated; amendment history is not provision-centric; effects are still presented as internal indices | Retain procedure. Expand provisions to 2–5 named legal alternatives, sections, provision-specific amendment/version history, concise public effects, and deterministic editorial titles/descriptions |
| Constitutional law | Constitutional configuration in immutable world content; Court review of laws/regulations | Constitution is reference information | No amendment lifecycle and no runtime constitutional rules | Add a curated runtime rule set, federal proposal at 280 ayes, ratification by 13 of 21 Provincial Assemblies, enactment without presidential action, and save migration |
| Constitutional Court | Nine seats in world rules; nominations, confirmation, docket, individual votes, dispositions, precedent, vacancies | Court workbench exposes docket and recent cases | Bench is not visualized as a nine-seat institution; nomination discovery is shallow; opinions and federal-provincial disputes are absent | Preserve Court cases and votes. Add nine-seat bench, qualified nominee browser, concise deterministic opinions, judge vote histories, and federal-provincial dispute cases |
| Politicians | Full runtime politicians for canonical figures; generated agent profiles; relationships, beliefs, offices, elections, campaigns | Basic card/profile component appears in selected screens | No global directory/search, incomplete career and vote histories, and generated figures are sometimes displayed as IDs or generic labels | Add a searchable directory and reusable profile workspace covering offices, memberships, elections, bills, roll calls, Court votes, endorsements, and provincial careers |
| Organizations | Canonical organizations, strength/influence, relationships, meetings, commitments, endorsements, monthly activity | Master/detail page exists and actions work | Influence is not sufficiently traceable to politician behavior; geographic and legislative scorecards are weak | Keep organization actors. Add public issue scorecards based on recorded votes/actions, relationship explanations, geographic relevance, and denser master/detail presentation |
| Campaign field work | National, provincial, and constituency organization state; decay; geographic map | The campaign map works at two scales but calls the resource “organization” and exposes decimals | Language is confused with political organizations; scale is not human-readable | Rename player-facing field infrastructure to **Ground Game**, show 0–100 or qualitative strength, retain internal normalized values and deterministic geography |
| Economy | National, sector, and provincial indices with non-flat 2028 scenario profiles, history, cycles, shocks, policy effects | Trends and regional map are present | UI still leads with abstract index levels and even retains `Index = 100` copy | Derive public growth, unemployment, inflation, real-wage, affordability, and confidence measures while retaining bounded indices internally |
| Maps | Political, election, campaign, economy, and organization modes; hover/select callbacks; custom tooltip/detail areas | Maps are usable but details can become separate oversized panels | Inspector is inconsistent and sometimes verbose | Use a compact map inspector: hover is temporary, click/tap pins, leave clears only hover, selected state survives, and mode-specific public facts remain concise |
| Political calendar | Scheduler, election dates, contest dates, filing windows, votes and recurring monthly processors | Dates are scattered across Home, Career, Campaign, Elections, and institutional screens | No single readable calendar or role-aware agenda | Add a calendar/agenda component fed by existing public dates plus provincial sessions, leadership elections, ratification deadlines, and filing windows |
| Save system | Schema 12 with sequential migrations and validators for each runtime domain | Existing saves load through migrations | Provincial legislatures, caucus offices, amendments, and political-career records have no persisted shape | Advance to schema 13, seed new institutions deterministically at load, preserve player/date/history, and avoid fabricated retrospective events |

## Candidate-depletion root cause

The federal Assembly has 420 seats elected from 48 multi-member constituencies. Over long simulations, retirement, death, office incompatibility, repeated candidacies, and a finite canonical politician pool reduce the eligible field. Normal allocation can eventually reach fewer candidates than seats in a constituency. The expanded acceptance run exposed two versions of this failure: the inherited V5 build failed at month 358, and the first Provincial Assembly implementation still failed at month 406 because recruitment was sized from all living politicians rather than the subset who could and would actually file.

The emergency `GENASM_*` top-up patch has four qualities worth retaining:

- deterministic identity allocation;
- complete `PoliticianRuntime` records;
- generated agent profiles with coherent traits and skills;
- persisted party, faction, age, and geographic placement.

It must not remain the primary recruitment model because it creates politicians only after the federal field is already short. The replacement pipeline is:

1. Seed every province with a bounded Provincial Assembly roster derived from its 25–65 seat chamber.
2. Elect those legislators by provincewide party-list proportional representation at a lightweight abstraction.
3. Keep non-winning candidates in a provincial political pool rather than deleting them.
4. Advance suitable provincial legislators, party/caucus leaders, mayors, and former candidates into federal interest pools before filing.
5. Recruit new local politicians only when a province's total political pool falls below a forward-looking reserve threshold.
6. Give recruits identities and profiles at recruitment time, not at federal allocation time.
7. Leave a final invariant guard at allocation so corrupt or migrated saves fail safely, while normal fifty-year runs never depend on it.

This keeps the political class finite enough to understand, renewable enough to sustain the game, and visible before a candidacy becomes federal.

The implemented closeout makes the pre-filing calculation explicit. It counts valid existing filings, incumbents who actually seek reelection, and non-incumbents who pass the real command-layer eligibility rules. It then promotes already-serving Provincial Assembly members until the public national pool can support at least one more candidate than seats in every constituency. The allocator remains only an invariant guard; it does not invent candidates at count time.

## Provincial Assembly scope

The provincial layer will not duplicate the federal simulation. Each province receives:

- a chamber size from 25 to 65 based on canonical population/electorate weight;
- a current roster of lightweight legislators represented by normal politicians;
- provincewide proportional elections on a four-year cycle;
- party seat totals and a named presiding leader;
- a small legislative agenda with one-stage final votes;
- individual recorded votes only for the player's chamber and high-importance measures; aggregated deterministic votes elsewhere;
- Governor signature, veto, and a two-thirds override;
- constitutional-amendment ratification votes;
- a candidate reserve and promotion path into federal politics.

The layer explicitly excludes detailed provincial committees, local taxation, bicameral chambers, municipal councils, and a second full federal bill engine.

## Authority and autonomy

Every new command must validate the actor in the simulation layer. UI visibility is not authority. The relevant rules are:

- only current federal members vote on federal roll calls;
- only the appropriate caucus leader or whip sets a caucus position;
- only current Provincial Assembly members vote on provincial bills or ratification;
- only the current Governor signs or vetoes a provincial bill;
- only qualified politicians may enter leadership or election contests;
- no player candidacy, leadership bid, endorsement, vote, membership change, sign/veto choice, or amendment decision is inferred;
- missed deadlines may have documented consequences, but never become an invented affirmative choice.

## Information boundaries

Public screens may show recorded votes, public positions, office history, election history, published polls, public organization scorecards, official economic statistics, and enacted legal effects. They must not expose latent voter support, private AI utility scores, hidden relationship values, private whip certainty, raw conflict intensity, or deterministic future outcomes.

## Page and navigation decisions

| Existing page | Decision | Reason |
| --- | --- | --- |
| Home | Keep; make its agenda include institution-specific calendar items | It remains the role-aware briefing rather than a duplicate office page |
| Office | Keep; add the player's current institutional workbench, including Provincial Assembly or caucus duties | One contextual office page avoids permanent navigation entries for every role |
| Career | Keep; integrate directory-linked history and all legitimate federal/provincial opportunities | Career remains the long-term identity and candidacy workflow |
| Party | Keep; rebuild as all-party and caucus master/detail | A single-party view cannot explain national party competition or leadership careers |
| Campaign | Keep; rename field “Organization” to “Ground Game” and use compact geographic controls | Campaign actions remain one workflow |
| Elections | Keep; add Provincial Assembly election details alongside presidential, federal Assembly, and Governor-specific layouts | Election type belongs in detail layouts, not separate permanent pages |
| Assembly | Keep; add chamber, caucus, member, committee, bill, roll-call, and amendment detail views | Federal legislative business needs a single connected institution workspace |
| Executive | Keep | Presidency/cabinet authority remains distinct |
| Courts | Keep; add bench and nominee/detail workspaces | The Court is a national institution with distinct decisions |
| Economy | Keep; change the primary public measures | The underlying model remains useful |
| Organizations | Keep; connect behavior scorecards and public geography | The institution has real actions and should not be reduced to a map mode |
| News | Keep | Editorial event grouping remains the correct public surface |
| Foreign Affairs | Keep | No new foreign expansion is in scope |
| Terena Map | Keep; make inspector compact and link selected politicians/institutions | National spatial reference still serves several modes |
| Archive | Keep; add filters for provincial elections, leadership, roll calls, amendments, and Court opinions | Long saves require grouped institutional history |
| Political Calendar | Add as a reusable drawer/panel, not a permanent top-level page | It supports every role without creating another empty destination |
| Politician Directory | Add as a searchable workspace reachable from global search and linked names; not a permanent sidebar item | Profiles are connective tissue, not a separate daily role |
| Province | Keep within role-aware Office and map/election detail; do not add 21 pages | Governor and Provincial Assembly workflows need context, not navigation sprawl |

## UI reconstruction priorities

The V6 pass should change workflows, not repaint V5 cards:

1. Entity names everywhere become links into a shared inspector/profile.
2. Party, Assembly, Courts, Elections, and Organizations use master/detail workspaces on desktop and drawers on narrow screens.
3. The 420-seat Assembly uses a compact semicircle grouped by party, with member detail on selection; it is not 420 full cards.
4. The nine-seat Court uses a bench row with vacancy and selection states.
5. Bill drafting uses at most three sections, each with a concrete policy category and named legal alternatives.
6. Bill reading leads with title, purpose, sections, current law, proposed law, public effects, sponsor, stage, and next action.
7. Maps reserve most space for geography and use a compact pinned inspector rather than a second page-sized column.
8. Mobile prioritizes pending choice, selected institution/entity, primary visualization, then reference history.

## Pre-implementation similar-smell findings

These were the conditions found in the expanded-phase audit. Their closeout
disposition is recorded in the post-implementation re-review below.

- `winnerIds[0]` was legitimate for presidential single-winner resolution, but it was also used in generic UI paths that needed election-type checks.
- Several `.slice(0, ...)` calls were legitimate display limits; recommendation calculations that sampled the first sorted members required review because identifier order could distort party positions.
- `ELEC_PRES_2028` is legitimate as the canonical scenario election in compatibility code, but presentation and contest initialization must distinguish scenario seeding from future-cycle behavior.
- Economy fallbacks of `100` were legitimate internal reference defaults, but `Index = 100` was inaccurate player-facing copy.
- Campaign presentation exposed normalized decimal organization values and needed conversion to Ground Game strength.
- Generated-politician fallbacks could display IDs or “Generated candidate”; all durable recruits needed a human-facing identity and biography.
- Long lists in politician selection, bill histories, and Court dockets were truncated without an explicit progressive-display control.

## Acceptance architecture

The 100×600 harness must exercise the real monthly engine and report at least:

- successful months and catastrophic failures;
- Assembly and Provincial Assembly candidate pool minima;
- recruit creation, provincial wins, promotions, federal filings, retirements, and deaths;
- federal/provincial chamber seat integrity;
- leadership contest cadence and vacancies;
- bill, amendment, veto, override, constitutional proposal, ratification, and enactment counts;
- Court docket/vote/opinion counts;
- election competitiveness and party concentration;
- economic public-metric ranges and bounds;
- deterministic continuous/reload agreement;
- median/p95/max turn time and save size.

The phase is not complete merely because the harness avoids an exception. It must demonstrate that political careers renew through modeled institutions and that the browser remains usable when those histories are populated.

## Post-implementation analogous-bug re-review

The closeout review repeated the original search after implementation rather than treating the audit as satisfied by new screens.

- `winnerIds[0]` remains only in true single-winner presidential resolution/validation/telemetry or behind an election-type branch. Assembly presentation reads party seat totals and member lists.
- `ELEC_PRES_2028` remains only as the canonical scenario anchor, compatibility migration label, targeted regression fixture or 2028 calibration input. Runtime “current” selection uses linked dates/status.
- Ranked `.slice(0, …)` pools use public/institutional scores and stable IDs only as a final tie-break. Display limits do not determine political outcomes.
- One new defect was found and fixed: constitutional ratification used `world.provinceIds.filter(...).slice(0, 3)`, causing the same provinces to vote first. Scheduling now sorts by an amendment-specific deterministic hash before taking the monthly docket; a regression proves it is not the canonical first three.
- Two indirect first-member assumptions were also removed. A vacant-Speaker war-authorization referral now selects a non-player MP by legislative skill and institutionalism before a stable tie-break, and emergency Court review chooses a non-player petitioner through the deterministic decision stream. Regression tests cover both paths and protect player autonomy.
- Remaining `100` fallbacks are internal reference defaults for missing/corrupt economic scenario data. Player copy says reference index or no prior comparison and the canonical January state is non-flat.
- Remaining durable generated politicians carry `displayName`, `description` and `homeProvinceId`; Court, cabinet, economy and world-map fallback copy no longer prints raw entity IDs.
- Organization endorsements now leave an explicit withdrawn history when the campaign ends or their relationship/policy basis collapses; repeated active endorsement commands reject without duplication.
- A final provision audit found that named legal alternatives still persisted generic `low` / `current` / `high` identifiers. New choices now use stable policy-specific IDs, targeted amendments retain those IDs, and legacy development saves resolve the old values only through compatibility aliases.
- The first corrected 600-month probe uncovered two further analogous issues. Federal recruitment had still counted ineligible officeholders and incumbents who had declined; it now sizes the recruitment class from the actual filing pool. Judicial confirmations had also over-weighted party alignment until repeated rejection could empty the Court; qualification and institutional confidence now support cross-party confirmation while controversial nominees can still fail, and promoted provincial solicitors provide a renewable legal-career path.
- A one-seat Assembly vacancy caused by an ordinary mid-term departure is now treated as a public vacancy rather than a catastrophic seat-count failure. The invariant still rejects over-seating or loss of more than ten percent of the chamber, and every election must still elect all 420 authorized seats.
- The formal seed audit found a promoted politician who won the Presidency after already filing for the next Assembly election. Presidential assumption now withdraws any incompatible unresolved Assembly candidacy, while Assembly assumption defensively refuses to evict a sitting President. The reproducing seed retains presidential authority through 2078 with no catastrophic invariant failure.
- Browser QA confirmed responsive role workspaces, the full chamber, directory/profile navigation, truthful map modes, keyboard pinning, map tooltips, grouped calendar and Ground Game language. SVG-center automation can hit an overlaid city/constituency even when targeting an underlying province; real province selection is exercised in province-scale modes, while every visible geography remains keyboard-selectable.
