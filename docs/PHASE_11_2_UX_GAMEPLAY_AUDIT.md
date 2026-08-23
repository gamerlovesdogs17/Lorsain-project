# Phase 11.2 UX and Gameplay Audit

Date: 2026-08-23  
Audited source: `1603049 Complete Phase 11.1 recurring election closeout`

## Audit boundary

This audit is based on the running-game architecture, command union, monthly systems, election and campaign state, office definitions, page components, presentation helpers, and canonical constitutional/world documents. It separates an action the simulation enforces from a screen that merely displays state. It also treats January 2028 as a populated scenario, not as a neutral developer fixture.

## Executive finding

The current game has strong federal systems but an information architecture built around subsystem names rather than the politician being played. President, Assembly member, Speaker, and justice have commands with real consequences. Governor is a prominent selectable office with no authority commands or recurring election. Mayor and Minister are also presented as playable careers despite having no role-specific command loop. Career does not answer what the player can seek next. Campaign owns filing choices that logically precede a campaign. Several map modes label political information they do not actually display. The economy's perfectly flat start prevents regional pages and maps from communicating a political geography.

Phase 11.2 therefore needs a role-aware `Office` workspace, a Career `Opportunities` workflow, distinct election presentations, canonical regional economic data, real campaign layers, and a smaller set of contextual navigation priorities. Existing accepted federal simulation systems should remain; their controls should be reorganized around player work.

## Role audit

### President

- **Meaningful commands now:** sign or return bills; appoint or dismiss ministers; issue regulations; propose a budget; declare an emergency; begin war powers; nominate judges; conduct diplomacy, treaties, trade talks, sanctions, alliance consultations, posture changes, crisis mediation, and warnings; make explicit campaign and party-contest choices.
- **Relevant pages now:** Home, Executive, Foreign Affairs, Economy, Courts, Campaign, Elections, Career, Organizations, News, Terena Map, Archive.
- **Actual monthly play:** manage required dispositions and foreign responses; select executive and diplomatic initiatives; monitor the Assembly, public standing, economy, and reelection path.
- **Election/career opportunities:** presidential reelection or future presidential cycle, plus existing party nomination mechanics. The path is visible mainly after Campaign has an open contest.
- **Informational only:** much of Party, Terena, Economy, News, and Archive; Cabinet is actionable only from Executive.
- **Dead ends:** Career does not surface reelection timing or compatibility. Home is largely the same briefing used for every role.
- **Simulation permission missing from UI:** no major confirmed presidential permission is wholly absent, but actions are spread across Executive, Courts, and Foreign Affairs without a unified office agenda.
- **UI action with weak backing:** none of the core presidential actions are fake, but some status cards imply more economic precision than the public-facing model should expose.
- **Prominent information needed:** required decisions, legislative inbox, cabinet/vacancies, foreign commitments and crises, economic trend, next election/nomination dates, current public standing.

### Speaker

- **Meaningful commands now:** all Assembly-member actions plus schedule or delay eligible bills; procedural sponsorship/fallback is simulated.
- **Relevant pages now:** Assembly, Home, Party, Career, Campaign, Elections, Courts for Assembly constitutional votes.
- **Actual monthly play:** vote, introduce/cosponsor/amend legislation, control floor scheduling, manage a political career.
- **Election/career opportunities:** Assembly reelection, party and presidential contest paths where eligible. Speakership succession exists, but a player-facing leadership path is not coherent.
- **Informational only:** committee composition and much of Party.
- **Dead ends:** no Speaker agenda or queue on Home; the distinctive role is reduced to two buttons inside bill detail.
- **Simulation permission missing from UI:** no separate procedural workbench or clear queue of bills awaiting Speaker action.
- **UI action with weak backing:** no false authority, but the role identity is nearly invisible.
- **Prominent information needed:** floor queue, ready bills, delayed business, required votes, caucus/party position, electoral calendar.

### Ordinary Assembly member

- **Meaningful commands now:** introduce and cosponsor bills; propose amendments; cast committee, floor, repassage, confirmation, motion, impeachment, recall, and treaty-ratification votes when eligible; file/decline and campaign; organization interactions.
- **Relevant pages now:** Assembly, Home, Career, Campaign, Elections, Party, Courts, Foreign Affairs, Organizations.
- **Actual monthly play:** legislative agenda, recorded votes, coalition/organization contact, constituency election planning and campaigning.
- **Election/career opportunities:** Assembly filing/decline and presidential nomination when eligible. Geography is currently a Campaign dropdown.
- **Informational only:** composition overview and most committee displays.
- **Dead ends:** Career does not connect record to opportunity; no constituency briefing; bills use abstract issue direction/magnitude inputs and weak generated prose.
- **Simulation permission missing from UI:** some vote types surface only on their subsystem pages rather than a consolidated office agenda.
- **UI action with weak backing:** the bill composer exposes raw policy vector controls rather than an intelligible legal proposal.
- **Prominent information needed:** current constituency, seat magnitude, bills and votes requiring attention, authored laws, public record, filing dates and eligible races.

### Governor

- **Meaningful commands now:** none that require gubernatorial authority. Generic party, campaign, and organization commands remain available when otherwise eligible.
- **Relevant pages now:** only generic Home, Career, Party, Economy, Organizations, News, Terena Map, Campaign/Elections if a federal opportunity exists.
- **Actual monthly play:** End Turn and generic political interaction. The office contributes prestige/recognition to other systems but cannot govern.
- **Election/career opportunities:** no gubernatorial election type, filing, reelection decision, campaign, result, assumption, or archive path. Federal presidential eligibility recognizes governor status.
- **Informational only:** office title and national/regional data.
- **Dead ends:** the office is a complete gameplay dead end despite being featured in New Game.
- **Simulation permission missing from UI:** the deeper problem is that restrained provincial authority is absent from the command layer as well as UI.
- **UI action with weak backing:** New Game markets Governor as if it were equivalent to a federal role.
- **Prominent information needed:** province conditions/trends, constituencies and cities, local organizations, relevant federal measures, provincial issue, limited agenda, federal relationship, reelection and future-office path.

Canonical scope permits provincial authority over local transport, land use, primary/secondary education administration, public hospitals, policing frameworks, and delegated portions of taxation. Phase 11.2 will model a bounded administrative priority and investment/emergency/public-position loop in those areas. It will not create provincial legislatures, independent provincial budgets, or a second federal government.

### Constitutional Court justice

- **Meaningful commands now:** cast a judicial vote on participating pending cases. Other constitutional actions shown on Courts belong to President or MPs and are correctly gated.
- **Relevant pages now:** Courts, Home, Career, News, Archive.
- **Actual monthly play:** review docket and vote when a case is pending; otherwise observe.
- **Election/career opportunities:** no elected-office run should be offered while judicial incompatibility applies; the 12-year nonrenewable term and post-office career need explanation.
- **Informational only:** bench, nominations, recent decisions, and precedent outside an active case.
- **Dead ends:** sparse months dominate; Career does not explain incompatibility or future eligibility.
- **Simulation permission missing from UI:** case merits are shown only as question/status; a justice needs a focused pending-vote briefing and public precedent context, not hidden leaning.
- **UI action with weak backing:** evidence/severity numeric labels in constitutional actions read like internal scores.
- **Prominent information needed:** pending vote, docket order, bench participation, recent rulings and controlling precedent, term end, incompatibility.

### Minister

- **Meaningful commands now:** none restricted to the holder. Regulations are issued by the President through a ministry; appointment and dismissal are presidential.
- **Relevant pages now:** generic Home/Career plus informational Executive, Party, Economy, News.
- **Actual monthly play:** generic party/organization/campaign activity and End Turn.
- **Election/career opportunities:** presidential eligibility may recognize ministerial experience; Assembly/presidential paths can exist when otherwise eligible.
- **Informational only:** cabinet placement and portfolio.
- **Dead ends:** no portfolio brief, recommendation, implementation, or presidential relationship loop.
- **Simulation permission missing from UI:** no legitimate minister action exists to surface.
- **UI action with weak backing:** featured New Game placement implies full executive authority.
- **Prominent information needed:** portfolio, responsible policy/economic indicators, current regulations/legislation, service status, and opportunities.

For v1, Ministers should receive a limited role-aware Office brief and a bounded `ADVISE_MINISTRY_PRIORITY` action that influences implementation without appropriating presidential regulation power. They must be labeled `Limited` in New Game, not marketed as equivalent to President/MP/Governor.

### Mayor

- **Meaningful commands now:** none restricted to the holder.
- **Relevant pages now:** generic Home, Career, Party, Economy, Organizations, News, Terena Map.
- **Actual monthly play:** generic political interaction and End Turn.
- **Election/career opportunities:** no mayoral recurring election; federal/Assembly opportunity can exist if eligible.
- **Informational only:** office title and home.
- **Dead ends:** no city brief or municipal action loop.
- **Simulation permission missing from UI:** no municipal authority model exists.
- **UI action with weak backing:** the full roster allows play without warning about depth.
- **Prominent information needed:** city/province identity, explicitly limited role depth, career openings.

Municipal grand strategy is out of scope. Mayors should receive a compact Office brief and one bounded civic-priority/public-advocacy action if it can reuse the provincial model safely; otherwise they must be clearly labeled `Limited` and not featured.

### Candidate

- **Meaningful commands now:** declare campaign, fundraise, visit, organize, advertise, message, attack, seek endorsement/nomination support, prepare for debate, withdraw; Assembly file/decline.
- **Relevant pages now:** Campaign, Elections, Party, Organizations, Home, Career, Terena Map.
- **Actual monthly play:** spend action points and money, select messages/geography/targets, monitor public polls and field.
- **Election/career opportunities:** only active/open opportunities are exposed, and Assembly geography is a dropdown on Campaign.
- **Informational only:** opponent/public polling displays and maps.
- **Dead ends:** no pre-campaign opportunity comparison; no governor path; national actions secretly target the first four constituency IDs; organization only has global/constituency layers and lacks maintenance.
- **Simulation permission missing from UI:** legitimate geographic selection deserves a dedicated public-facts workflow.
- **UI action with weak backing:** Campaign map can imply a coherent national organization that state does not contain.
- **Prominent information needed:** office, geography, dates, field, cash, actions, national/province/constituency organization, recent activity, public polling only.

### Party or faction leader

- **Meaningful commands now:** generic membership/faction changes, contest candidacy/withdrawal and personal endorsements; NPC party/faction leadership affects selectorates and party state. There is no leader-only agenda command.
- **Relevant pages now:** Party, Home, Career, Campaign, Elections, Assembly if also MP.
- **Actual monthly play:** underlying office-based actions plus contests/campaign. Leadership itself has little direct play.
- **Election/career opportunities:** leadership/faction contests exist, but Career does not expose them as a coherent opportunity path.
- **Informational only:** factions, leader, party position, contests and party events.
- **Dead ends:** no party agenda, whip, endorsement strategy, or candidate coordination loop for the leader.
- **Simulation permission missing from UI:** leader-specific permissions are mostly absent from simulation.
- **UI action with weak backing:** Party's national election summary treats the first winner as though every election were single-winner.
- **Prominent information needed:** leadership mandate, caucus, government/opposition status, current contests, nominations, election performance by appropriate result type, recent party events.

Phase 11.2 should give leaders a bounded party-priority/endorsement workbench only where existing party systems support it, and otherwise describe leadership as an additional responsibility rather than a standalone full role.

### Private citizen or former officeholder

- **Meaningful commands now:** party/faction changes where allowed, party-contest entry, eligible campaign entry once a race appears, generic organization contact.
- **Relevant pages now:** Career, Campaign, Elections, Party, Organizations, News, Archive, maps.
- **Actual monthly play:** wait for scattered opportunities, interact politically, and observe.
- **Election/career opportunities:** potentially valid but not discoverable before the Campaign screen exposes a window.
- **Informational only:** most government subsystem pages.
- **Dead ends:** losing office makes Home and navigation look unchanged while the action loop disappears.
- **Simulation permission missing from UI:** eligibility queries and filing calendar need a player-facing surface.
- **UI action with weak backing:** Executive/Courts remain equally prominent despite no authority.
- **Prominent information needed:** next legitimate opportunities, eligibility and incompatibility, filing/opening dates, public incumbents/fields, prior offices/elections/actions, active organization/party ties.

## Current page audit

### Home

- **Necessary:** yes, as the player briefing.
- **Current layout:** not appropriate for all roles. It uses one politician header, lead story, common economy strip, activity, press, elections, and campaign rail.
- **Decision:** retain but rebuild as role-aware. Urgent decisions remain first. The main worklist and regional/national emphasis must change for President, Speaker/MP, Governor, justice, candidate, and former officeholder.
- **Failure mode:** currently exposes a generic dashboard instead of answering “what needs my attention as this politician?”
- **Long-save risk:** feed and elections rail grow without prioritization.

### Career

- **Necessary:** yes.
- **Current layout:** insufficient. Biography, office terms, generic positions, a privacy empty state, and recent events do not form a career game.
- **Decision:** retain and substantially rebuild. Add `Opportunities` as a primary tab, plus timeline, elections/campaigns, major actions/votes, party/faction history, current standing, and eligibility/incompatibility explanations. Geography selection belongs here before declaration.
- **New workflow:** compare eligible races → inspect public geography facts → explicitly run or decline → Campaign becomes execution.

### Party

- **Necessary:** yes for party members; informationally accessible to independents.
- **Current layout:** partially appropriate but leader-first and card-heavy.
- **Decision:** retain, use compact leadership/caucus/faction master-detail, current contest focus, and election-performance components specific to election type. Remove all `winnerIds[0]` multi-seat assumptions.
- **Long-save risk:** every resolved election and contest is rendered without pagination/period grouping.

### Campaign

- **Necessary:** yes once exploring or active; otherwise it should hand off to Career opportunities.
- **Current layout:** good command-center intent but declaration/filing, many selects, and organization map are not aligned with the underlying geography.
- **Decision:** retain and redesign around race header, map/list regional allocation, cash/actions, opponents, recent actions, and focused action drawer. Assembly/Governor geography is chosen in Opportunities; campaign actions operate national/province/constituency layers.
- **Long-save risk:** opponent/activity lists need focused current-campaign bounds.

### Elections

- **Necessary:** yes.
- **Current layout:** one generic election component assumes a first winner and does not represent Assembly STV or future gubernatorial races well.
- **Decision:** retain as index plus type-specific detail: presidential candidate/RCV national result; Assembly national composition plus constituency detail; governor province/candidate/result; nominations party/selectorate detail. Add an `ElectionDetail` component, not a permanent sidebar page.

### Assembly

- **Necessary:** yes nationally and especially for MPs/Speaker.
- **Current layout:** bill-centered but uses raw issue/vector authoring, large card repetition, and weak agenda priority.
- **Decision:** retain. Lead with current legislative agenda and player-required votes; composition becomes supporting data. Rebuild legislation around one-to-three concrete provisions with named options, current law, and estimated public metric effects. Use master/detail and compact tables.

### Executive

- **Necessary:** yes as national administration information and President gameplay.
- **Current layout:** strong for President; mostly inert for everyone else; minister holders lack a portfolio view.
- **Decision:** retain for national administration. Move the current player's role-specific governing actions to Office; President Office can link/deep-link to Executive. Ministers see a limited portfolio brief and advice action without acquiring presidential powers.

### Courts

- **Necessary:** yes.
- **Current layout:** all constitutional roles/actions share a long page, producing large empty or irrelevant sections.
- **Decision:** retain, prioritize active docket/pending player vote, then bench/recent rulings/precedent. President and MP actions remain permission-gated and grouped separately. Hide internal-style evidence precision from ordinary public presentation.

### Economy

- **Necessary:** yes.
- **Current layout:** appropriate categories but undermined by flat baselines and one national history path.
- **Decision:** retain and rebuild around current/monthly/12-month/longer trend; national, province, and sector history; explanatory shocks/policy; limited precision; regional comparison map/list. “Jan 2028 = 100” becomes “Index reference = 100.”

### Organizations

- **Necessary:** yes because interactions and endorsement/support systems are real.
- **Current layout:** selected organization and actions are useful, but geographic relevance is absent and the map mode is fake.
- **Decision:** retain. Add public activity/influence by province derived from canonical presence plus recent action; use this in the map. If a place has no legitimate organization signal, display no-data rather than a neutral pseudo-result.

### News

- **Necessary:** yes.
- **Current layout:** behaves like a story/event list and can repeat one underlying event across outlets.
- **Decision:** retain, group by underlying fact event. Present lead event, secondary events, and outlet framing tabs/rows. Paginate or progressively reveal by month/year.

### Foreign Affairs

- **Necessary:** yes nationally; role-priority differs.
- **Current layout:** substantive President actions and world-map information are valid, but overly prominent for roles without foreign authority.
- **Decision:** retain. President sees it as primary navigation; others see it under National information. Preserve public/hidden boundaries and existing world-map modes; improve touch/selection consistency with Terena.

### Terena Map

- **Necessary:** geographic exploration is necessary, but “Terena Map” is too narrow once it is a shared political/election/campaign/economy/organization workspace.
- **Current layout:** Political is valid; Election duplicates sitting plurality; Campaign only shows constituency organization; Economy is flat; Organizations is static; hover state does not drive the detail experience.
- **Decision:** rename navigation label to `Maps` while retaining route key for save/UI compatibility. Keep Political. Make Election use a selected/current resolved election or legitimate published race data. Make Campaign show province and constituency field layers. Economy uses structural provincial data/trend. Organizations uses public activity/presence. Add real tooltip, separate transient hover from persistent click/tap selection, restrained styling, reset/fit controls if lightweight.

### Archive

- **Necessary:** yes for long saves.
- **Current layout:** category filters help, but sections remain flat and some foreign/crisis outputs expose internal-style magnitudes.
- **Decision:** retain. Organize by year/administration and category with expandable detail. Include elections, campaigns, offices/administrations, laws/votes, court rulings, party leadership, treaties/sanctions/crises, and economic history. Remove hidden intensity/formula values and raw IDs.

### Organizations and Foreign Affairs placement

Both remain pages. They should not be merged: organization relationship work and international affairs have different actors, authority, maps, and timescales. Their sidebar priority should be contextual rather than permanently equal for every role.

## Page and navigation decisions

### Add

- **Office:** a role-aware workspace for the current office. President summarizes executive obligations and links to Executive/Foreign; Speaker/MP shows legislative and constituency work; Governor contains the full Province workspace; Justice shows docket obligations; Minister/Mayor show explicitly bounded role briefs/actions.
- **Election detail component:** a routed/selected detail within Elections, not another permanent navigation item.
- **Political Opportunities component:** primary Career tab, not a separate permanent page.
- **Regional statistics component:** shared by Office/Governor, Economy, and map details, not a standalone page.

### Retain but rename/restructure

- `Terena Map` navigation label becomes `Maps`; the underlying screen remains accessible.
- Career leads with Opportunities when the player has no office or a filing decision is approaching.
- Campaign is for running campaigns, not the sole discovery/filing page.
- Elections becomes index plus election-type detail.

### Do not add

- No separate permanent Province and Governor pages: Governor is a role view inside Office, while provinces remain inspectable in Economy/Maps.
- No permanent Provincial Elections page: gubernatorial races are an Elections type.
- No standalone Politician Directory in the in-game sidebar: New Game search and contextual politician selectors already cover the workflow; reusable search can be extracted as a component.
- No separate Government/Administration detail route in Phase 11.2: Executive plus Office covers the workflow.

### Remove or merge

- Remove the duplicate/fake Election map behavior, not the mode.
- Remove the placeholder Organizations fill behavior; replace it with real public presence/activity.
- Merge candidacy discovery and geography choice out of Campaign into Career Opportunities.
- Merge role-specific executive/legislative/provincial/judicial “what can I do?” into Office rather than adding one permanent page per office kind.

### Role-aware navigation

The default hierarchy should be:

1. **Briefing:** Home, Office, Career.
2. **Current work:** role-dependent priority links—Executive/Foreign for President; Assembly for Speaker/MP; Province content through Office for Governor; Courts for justice; Campaign for candidate.
3. **Politics:** Party, Campaign, Elections.
4. **National:** Assembly, Executive, Courts, Economy, Organizations, News.
5. **World and reference:** Foreign Affairs, Maps, Archive.

All national information remains reachable. Context changes emphasis and grouping, not truth or access.

## Cross-system issues found before implementation

- Presidential contest shells and candidate interest are coupled too early; 2033 fields are chosen from 2029 state.
- Presidential nomination resolution runs synchronously on the browser main thread while Assembly correctly uses a Worker.
- Assembly player filing rebuilds allocation in a way that can move existing NPC `filed` geography.
- National campaign visits choose the first four sorted constituency IDs.
- NPC campaign geography uses first sorted constituency fallbacks.
- Campaign state has national and constituency organization but no province layer or monthly maintenance.
- Economy state initializes all visible national, provincial, and sector indices to exactly 100.
- Election and Political map modes share sitting plurality; Organizations map fill is not connected to organization data.
- Terena hover is stored outside the selected detail but does not drive a real tooltip; city hover lifecycle differs from province/constituency behavior.
- Party and generic election presentation use `winnerIds[0]` where an Assembly result has hundreds of winners.
- Bills allow an unbounded-looking array of abstract issue vectors; default titles expose issue IDs and NPC summaries use mechanical ideology language.
- Several screens fall back to raw IDs when display names are missing.
- New Game ranks Ministers and Governors as featured roles without explaining actual role depth.

## Implementation acceptance derived from the audit

The redesign is not complete unless authority is enforced in the command layer, player choices remain explicit, save schema changes are migrated, all new geography is deterministic, populated long-save screens are bounded, and browser QA proves role and responsive behavior. Cosmetic consistency alone cannot satisfy this audit.
