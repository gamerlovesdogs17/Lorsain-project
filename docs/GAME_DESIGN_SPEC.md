# Game Design Specification

## 1. Core premise

This is a single-player persistent political-world simulator inspired by the breadth of multiplayer political simulations, but every person other than the player is an autonomous NPC. The player controls exactly one politician at a time. The simulation is not a party-management god game.

The world must be capable of producing plausible political history with zero player input. A required development benchmark is that the game can simulate fifty years while the player repeatedly chooses **End Turn / No Action** and still generate elections, careers, retirements, party changes, legislation, scandals, governments, court appointments and foreign events without deadlocking.

## 2. Time

Normal time advances in **one-month turns**. Election nights, debates, leadership contests, constitutional crises, wars and other major events may interrupt the monthly flow with dedicated screens, but they do not change the underlying calendar.

The default scenario begins **1 January 2028**. Presidential election day is in October 2028. The next regular Assembly election is in 2030.

## 3. Player career

The player creates or selects one politician. The player may begin as a municipal politician, provincial legislator/governor, Assembly candidate, Assembly member or selected advanced-scenario officeholder. Offices must not form a mandatory ladder.

Losing an election does not automatically end the game. An out-of-office politician can seek party work, media roles, advocacy positions, appointments or a later comeback. Retirement or death normally produces a career-summary ending. An optional **Continue World** button allows the player to select another existing politician and continue the same simulation, while the former character remains part of history.

Career discovery is a distinct gameplay step. The player sees legitimate Political Opportunities with public dates, incumbent/field information, compatibility and geography before explicitly choosing to run or decline. The Campaign screen begins after exploration or filing; it is not the only place where opportunities appear.

## 4. Information philosophy

Neither the player nor NPCs should have omniscient access to simulation truth. Polls, whip counts, rumors, fundraising estimates, intelligence reports and relationship descriptions are observations with error. Staff quality and political relationships improve information quality.

The UI should prefer labels such as **Friendly**, **Tense**, **Likely Yes**, or a vote range over raw hidden values. Exact debug numbers can exist in developer mode.

## 5. Determinism

All simulation randomness must use a seeded deterministic RNG owned by the simulation engine. `Math.random()` must never be used in gameplay logic. Given the same scenario seed and the same player actions, the simulation must reproduce the same history.

Randomness supplies uncertainty and variation; it must not replace causal modeling. Elections are not coin flips. Leadership elections are not arbitrary dice rolls. Random noise should matter most when underlying incentives are close.

## 6. NPC model

Each active politician has persistent traits, goals, skills and memories. **Persisted traits** (0..1): ambition, integrity, ego, riskTolerance, sociability, pragmatism, institutionalism, partyLoyalty, factionLoyalty, retirementInclination. **Persisted skills** (0..1): campaigning, fundraising, legislation, administration, media, negotiation. Ideology and issue salience are separate. Display labels such as competence, charisma and executive skill are **composites of skills**, not separate hidden persisted axes.

Relationships are directional. A may trust B more than B trusts A. Store at least **affinity** and **trust** separately. Major political events create durable memory records: endorsements, betrayals, appointments, attacks, leadership support, major negotiations, scandals and repeated voting alliances. Trivial interactions may decay.

NPCs form plans from their own information. They may miscalculate. A politician can launch a leadership challenge believing they have the votes and lose badly.

## 7. Active population

Target roughly **800–1,200 fully active political NPCs** in v1. This includes national politicians, important provincial politicians, ministers, judges, party officials, major mayors and high-salience candidates. Lower municipal politics and minor organizations can be represented with lighter-weight entities until they become relevant.

The initial 2028 roster is canonical. Generate the large roster once from a fixed development seed, review it, and commit it as content. New post-2028 entrants are procedural.

## 8. Party and caucus system

Parties are institutions with rules, staff, funds, ideology ranges, nomination procedures, leadership offices and recognized internal caucuses. Caucuses have memberships, chairs, endorsements, discipline levels and issue priorities.

A politician's vote should not be determined simply by party or caucus. A general decision utility can combine policy preference, caucus recommendation, party loyalty, constituency preference, personal relationship, career incentive, leadership pressure, donor/organization pressure, information uncertainty and a small stochastic term.

Parties may split, merge, rename or collapse when institutional conditions are met. These should be rare, path-dependent events rather than random flavor events.

## 9. Elections

### Voters
Use aggregated demographic/geographic voter blocs rather than simulating 72 million individual people. Each constituency has distributions for class, age, education, urbanization, religion/culture, unionization, sector, region and issue salience.

### Support model
Underlying support responds to party baseline, candidate quality, ideology fit, campaign effort, endorsements, spending, incumbency, economy, government approval, scandals, local issues and turnout. A small correlated polling/election error is added only after fundamentals.

### Polls
Pollsters draw noisy samples from underlying support and have persistent house effects and quality ratings. The player sees polls, not engine truth.

### Campaign AI
NPC candidates independently fundraise, advertise, travel, debate, seek endorsements, choose issues, attack, defend and drop out. Their strategy depends on resources, polling beliefs, risk tolerance and goals.

### RCV and STV
Implement real count logic. Presidential RCV must preserve ballots/transfers. Assembly STV must rank individual candidates, apply quota and transfer rules, and allow same-party candidates to compete. Assembly electoral regions are population-balanced national districts and are **not required to follow province boundaries**; the map data records each district’s plurality province and cross-province population shares.

### Gubernatorial elections

The detailed constitutional procedure remains canonically deferred. The v1 gameplay assumption is a direct province-wide plurality election every four years, using one shared campaign/election abstraction rather than 21 separate engines. Incumbents and challengers decide from near-cycle runtime state; the player must explicitly file. Winning ends incompatible offices on the assumption date, records public history, and schedules the next cycle. This is a procedural implementation assumption, not invented constitutional lore.

## 10. Legislature

Bills are entities with sponsors, policy effects, text/summary metadata, committees, amendments, procedural state and vote history. NPCs introduce legislation based on ideology, issue salience, electoral incentives and party strategy.

A proposal contains **one to three concrete provisions**. Each provision represents one legal category and one named rule option, with current law, proposed change, and a restrained public estimate of metric effects. The simulation may translate the provision into issue direction/magnitude internally, but normal play never asks the player to author a raw policy vector. Deterministic titles and summaries describe the legal change; IDs and generic ideology phrases are not public bill copy.

Committees control hearings and reports. The Speaker controls floor scheduling under rules that limit permanent burial of presidential Priority Bills. Party and caucus leaders whip votes, but individual members decide.

Vote decisions should be inspectable after the fact through explanations such as "supported because policy alignment + constituency + caucus; relationship with sponsor had little effect." Do not expose the exact utility formula in normal play.

## 11. Executive

The president appoints ministers and directs agencies within statutory authority. Ministers have their own skills (including administration), ideology, relationships, ambitions and public profile. Assembly ministerial-censure votes can remove them.

Executive actions consume political and administrative capacity. A president cannot personally micromanage every department without tradeoffs.

## 12. Courts

The Constitutional Court has nine persistent NPC judges with ideology, legal philosophy, institutionalism and relationships. Cases arise from laws and executive acts, not from a purely random deck. The court can invalidate laws, regulations, emergency actions and election procedures.

Precedents should be stored as simplified doctrine flags/weights so prior cases influence later legal outcomes without requiring a natural-language legal model.

## 13. Economy

The economy should be politically deep but computationally lighter than a grand-strategy economic simulator. Track GDP, productivity, unemployment, inflation, wages, inequality, debt, interest rates, housing costs, energy prices and major sectors nationally and by province.

Policy changes should have lags, uncertainty and distributional effects. Do not implement a one-variable "GDP down = government loses" rule. Voter groups care about different outcomes.

`100` is a long-run/reference center, not the January 2028 definition. The canonical scenario begins with deliberately unequal national, sector and provincial values. Province character persists through sector exposure, growth/inflation/housing/trade sensitivity and bounded structural trends. Monthly noise and shocks operate inside medium-term cycles and momentum; slow anchors prevent a pure random walk without forcing every series back to exactly 100. Provincial policy investment persists but decays, so one action cannot permanently ratchet every index upward.

## 13.1 Provincial government

Governors exercise bounded gameplay-level authority consistent with canonical provincial responsibility for local transport, land use, school administration, public hospitals, policing frameworks and delegated taxation. A governor sets an administrative priority, directs a limited investment emphasis, takes a public position on a relevant federal initiative, and responds to province-specific pressure. These actions consume provincial action points/political capital and affect regional conditions or standing. Governors do not gain federal regulation, budget, treaty, war, court or Assembly power, and no simulated provincial legislature is implied.

Ministers may advise a portfolio priority without acquiring presidential regulation power. Mayors have one bounded civic-priority action and are explicitly a limited v1 role; municipal grand strategy is not modeled.

## 14. Organizations

Unions, business groups, professional associations, farm groups, advocacy organizations and media outlets have memberships, resources, issue priorities, endorsements and relationships. They lobby, spend, mobilize and rate politicians.

Endorsements should carry different value depending on constituency, credibility and member alignment.

## 15. Media

Media outlets have audience, ideological reputation, factual reputation, geography and format. News coverage should be generated from structured events with templates and controlled text variation. Runtime LLM calls are not required and should not be a core dependency.

Investigative stories can uncover real hidden behavior. False allegations may occur as political events, but the simulation must distinguish allegation from truth internally.

## 16. Scandals and ethics

Scandals should come from actions, hidden traits, financial conflicts, investigations or credible discoveries. They should be uncommon enough to matter. Severity depends on evidence, media trust, partisan context, prior reputation and whether the politician lies or cooperates.

## 17. Foreign affairs

All 48 states exist as persistent entities. Foreign governments have leadership, regime type, economy, military capability, relations, treaties, strategic goals and domestic constraints. Terena's president has meaningful diplomatic authority, while major treaties and prolonged war require Assembly involvement.

Foreign AI should be utility/rule based. It must be possible to simulate trade disputes, sanctions, military crises, alliances, elections in democratic foreign states and leadership changes in authoritarian ones without scripting every event.

## 18. History archive

Every save maintains an in-game historical database: elections, officeholders, cabinets, party leaders, caucus leaders, major bills, court appointments, landmark rulings, wars, treaties, party splits, scandals and major economic events.

A politician page should remain accessible after retirement or death. Long saves should feel like generated political history, not disposable runs.

## 19. Turn resolution order

Recommended monthly resolution sequence:

1. lock player actions and queued commitments
2. update information/polls/economic observations
3. NPC planning and candidacy decisions
4. party/caucus actions and negotiations
5. campaign actions
6. legislative/committee/executive actions
7. judicial processes due this month
8. organization/media actions
9. foreign-policy and international events
10. economy/demographic updates
11. elections, appointments, retirements and deaths due on date
12. relationship/memory updates and decay
13. history log and news generation
14. save checkpoint and UI digest

## 20. Non-negotiable simulation rules

The engine never gives the player hidden bonuses because they are human. NPCs use the same core rules as the player. The presidency is not the only meaningful objective. The game must support failure and recovery. Political change must be path-dependent. The simulation should prefer causal systems over arbitrary event cards, while still using events for shocks that genuinely originate outside normal political behavior.
