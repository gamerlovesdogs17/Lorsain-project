# Phase 11.3 UI — Before / After

Date: 2026-08-23  
Baseline: `b00ec52` (Phase 11.2 / UI System V4)  
Target grammar: `docs/UI_SYSTEM_V5.md` · Audit: `docs/PHASE_11_3_UI_ARCHITECTURE_AUDIT.md`

For each major screen: what failed in the V4 card-dashboard reading, what V5 structure replaces it, and why the workflow is clearer.

---

## Home

**OLD PROBLEM**  
Role briefing existed, but the page still read as a stack of SectionCards and equal-weight panels. Urgent work competed with reference metrics; the politician’s month was hard to scan in three seconds.

**NEW STRUCTURE**  
`WorkLayout` with politician masthead + `BriefStrip` → urgent interrupt / required decisions → one `LeadStory` → compact indicators. No metric card collage.

**WHY BETTER**  
The player sees duty before decoration. Role voice (President vs Governor vs private citizen) drives the strip and decision list instead of a generic dashboard.

---

## Office

**OLD PROBLEM**  
Non-governor roles often redirected (“go to Executive / Assembly / Courts”) instead of owning the job. The page felt like a label, not a workbench.

**NEW STRUCTURE**  
Role-specific `WorkLayout` workbench: President/MP/Speaker/Justice embed real controls; Governor retains dense provincial metrics, `PolicyChoiceGroup` priorities, and local context.

**WHY BETTER**  
Office answers “what can I do in this job this month?” without forcing a sidebar hunt. Authority and reference stay on one surface.

---

## Career

**OLD PROBLEM**  
Opportunities were primary in V4 intent, but biography and empty Relationships chrome still diluted the “what can I run for?” question. History was card-heavy.

**NEW STRUCTURE**  
Masthead + Opportunities as the default work area; office/election/campaign history as tables/rows. Relationships tab removed; org contact deep-links to Organizations.

**WHY BETTER**  
Filing and eligibility are the career verb. Empty tabs and duplicate relationship UI no longer interrupt the path into Campaign.

---

## Party

**OLD PROBLEM**  
Faction and officeholder walls of politician cards made party power hard to compare. Contests and representation competed with portrait grids.

**NEW STRUCTURE**  
Identity header + representation metrics + `MasterDetail` for factions/nominations/officeholders (rows + inspector).

**WHY BETTER**  
The player inspects one contest or faction at a time against party-wide numbers, matching how party strategy is actually decided.

---

## Campaign

**OLD PROBLEM**  
Campaign was improved in V4 but still drifted toward stacked cards and secondary map placement. Geographic strategy was easy to miss beside action lists.

**NEW STRUCTURE**  
Command center: race identity top; resources/rivals left; organization map center; actions right; polls/activity bottom.

**WHY BETTER**  
Running a race feels like operating a campaign HQ — map and actions share one composition instead of a vertical briefing deck.

---

## Elections

**OLD PROBLEM**  
Type-specific views existed, but results and fields still leaned on large cards. Multi-member Assembly risked single-winner presentation habits.

**NEW STRUCTURE**  
Presidential: map + candidate rail + RCV/table. Assembly: composition + constituency detail. Governor: province map + race. Compact `DataTable` / `EntityRow` results.

**WHY BETTER**  
Each election type matches its counting and geography. Results scan as political data, not a gallery of candidate cards.

---

## Assembly

**OLD PROBLEM**  
Agenda, composition, and bill prose competed in a card sequence. Pending player votes were easy to lose among reference panels.

**NEW STRUCTURE**  
Composition strip → current business → pending votes in the right rail → bill table → selected bill tabs (Overview / Provisions / Politics / Process) with `PolicyChoiceGroup` for drafting.

**WHY BETTER**  
Floor duty is isolated. Legislation is chosen as named legal options, not walls of prose or raw vectors.

---

## Executive

**OLD PROBLEM**  
Presidential work mixed long cards across dispositions, cabinet, and budget without a clear desk metaphor. Sign/return choices were verbose.

**NEW STRUCTURE**  
Tabbed Desk / Cabinet / Budget / Regulations inside `WorkLayout`. Concise SIGN / RETURN / NO ACTION for dispositions; cabinet and regulations as rows + inspectors.

**WHY BETTER**  
Authority is partitioned the way a presidency works day-to-day, with decisions short enough to execute under time pressure.

---

## Courts

**OLD PROBLEM**  
Docket, bench, and votes sat in parallel cards; a justice’s owed vote was not always the loudest element.

**NEW STRUCTURE**  
Docket list + selected case detail + bench strip; player judicial vote surfaced first when pending. Office embeds the same duty for justices.

**WHY BETTER**  
Court months are sparse; when a vote exists, the UI makes that the job rather than a buried panel.

---

## Economy

**OLD PROBLEM**  
Giant current/delta cards and repeated section cards made national vs regional reading heavy. Trends competed with decorative cards.

**NEW STRUCTURE**  
`MetricStrip` → national trends → regional `MapDetailLayout` / table → sectors → history rows. Fewer giant cards.

**WHY BETTER**  
The briefing answers temporary vs cyclical vs structural movement with comparable indicators and geography, not a card wall.

---

## Organizations

**OLD PROBLEM**  
Org pages mixed selection with card-heavy issue dumps; relationship and activity were hard to pair with a single actor.

**NEW STRUCTURE**  
`WorkLayout` + `MasterDetail`: org list as `EntityRow`s, inspector for issues, public activity, relationship, and actions.

**WHY BETTER**  
Interest-group play is “pick an actor, then act” — the same grammar as other directories.

---

## News

**OLD PROBLEM**  
Risk of event-log styling: flat chronological dumps that read like debug output rather than political coverage.

**NEW STRUCTURE**  
Lead story + secondary items + topic groupings; outlet treatments nested under the public event. `WorkLayout` framing.

**WHY BETTER**  
The player reads politics as news hierarchy (what mattered) instead of a telemetry feed.

---

## Foreign Affairs

**OLD PROBLEM**  
Functionally complete after Phase 10.x, but layout still competed with domestic card habits; map and country detail were not always the primary composition.

**NEW STRUCTURE**  
Layout-only rework: world map + country detail + presidential action strip. No foreign simulation reopen.

**WHY BETTER**  
Diplomacy is geographic and bilateral by nature; the screen matches that without inventing new systems.

---

## Maps

**OLD PROBLEM**  
Maps could feel like decorative SVGs beside legends and mode controls. Fake or hollow modes were already banned in V4; residual risk was weak detail integration.

**NEW STRUCTURE**  
Mode bar + large map + persistent right detail + truthful legend (`MapDetailLayout`). Political / Election / Campaign / Economy only when public data exists.

**WHY BETTER**  
Maps are inspection tools inside political workflows, with the same hover/click/tap/keyboard contract as elsewhere.

---

## Archive

**OLD PROBLEM**  
Long saves risked undifferentiated chronological dumps — “50-year feed” behavior that freezes the UI and obscures institutional memory.

**NEW STRUCTURE**  
Sectioned archive (Elections / Administrations / Legislation / Courts / Foreign / Economy) with period filters and pagination; row/table presentation.

**WHY BETTER**  
History is queryable by institution. Decades of play remain navigable without rendering every record as a card.

---

## New Game

**OLD PROBLEM**  
Featured starts mixed meaningful offices with limited Minister/Mayor careers and underspecified “what will I actually play?” copy. Cards looked like a marketing roster more than a role picker.

**NEW STRUCTURE**  
Featured band limited to meaningful gameplay roles; each start shows name, role, gameplay focus, and complexity (High / Medium / Low). Full searchable roster remains secondary for everyone else.

**WHY BETTER**  
Players pick a job with known depth and focus (executive/foreign, provincial, legislation/constituency, judicial, etc.) without treating Limited roles as equivalent full campaigns.
