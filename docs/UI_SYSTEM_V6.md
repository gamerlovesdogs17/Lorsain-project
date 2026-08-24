# Lorsain UI System V6 — Institutions in Use

Date: 2026-08-23  
Status: implemented in Phase 11.3  
Builds on: `UI_SYSTEM_V5.md`

## Purpose

V6 is the interface contract for an institutionally complete political simulation. It keeps V5's editorial workbench, but replaces isolated dashboards with connected directories, chambers, profiles, legal records, election calendars, and regional offices. A player should be able to answer three questions from every primary screen: what institution am I looking at, what public record explains its present state, and what can my politician lawfully do now?

V6 does not expose hidden support, AI utility, private traits, exact relationship scores, or internal event weights.

## Shell and navigation

- Home is a role-specific briefing, not a universal metric dashboard.
- Office is contextual: Presidency, Province, Assembly, Court, or a clearly limited role desk.
- Career owns political opportunities and the public politician directory.
- Elections owns the Political Calendar rather than adding another permanent sidebar item.
- Ctrl/Cmd+K opens global search for pages, politicians, parties, caucuses, provinces, elections, bills, and Court cases.
- Desktop uses a grouped left rail. At narrow widths the rail becomes an explicit menu; it must never cover the work area after navigation.
- Informational national pages remain available to every role, while contextual labels identify the player's actual office.

## Shared composition patterns

### Institutional directory

Use a compact master list with a persistent inspector. Rows compare identity, officeholder, representation, and public status. Portrait cards are reserved for identity and selection, not repeated numerical summaries.

### Political profile

The profile masthead contains public name, current highest office, party, caucus, home, standing, and a restrained biography. The detailed record connects office history, elections, sponsorships, roll calls, leadership, endorsements, and Court participation where applicable. Generated politicians use the same component and never fall back to a raw ID.

### Workbench

The primary action or required vote precedes reference material. Supporting history belongs in a compact rail, table, or inspector. Empty institutions use a short factual empty state; they do not reserve a giant blank card.

### Data tables

Tables are preferred for roll calls, candidate fields, bill histories, memberships, and archive records. Mobile tables may scroll horizontally inside their own container, but the page itself must not create horizontal overflow.

## Party and caucus directory

The Party page is national, not synonymous with “my party.” Its first layer lists every major party with leader and Assembly seats. Selecting a party opens:

- identity, public description, government/opposition status, and representation;
- leader and current leadership contests;
- caucuses with chair, MP share, and known membership;
- parliamentary floor leader and whip;
- presidential nominations and recent public party events.

Player-facing copy uses **caucus** for organized intraparty groups. Storage may retain `faction`.

## Assembly chamber

The 420-seat hemicycle is a public composition and member-selection surface, not a decorative chart. Every occupied seat is keyboard-selectable and has an accessible politician/party label. It appears before bill detail because current chamber control frames all legislative work.

Assembly business uses three linked layers:

1. chamber composition and current agenda;
2. bills and required player decisions;
3. selected-bill detail, provisions, politics, procedure, and roll calls.

## Roll calls and caucus positions

A roll call shows stage, date, outcome, threshold, yes/no/abstain totals, party breakdown, and individual member choices. Committee votes use the same pattern at committee scale. Selecting a member opens public office and voting history.

Caucus recommendations are public political pressure, not compulsory ballots. The floor leader may set the caucus position and the whip communicates a qualitative whip estimate. The interface must not claim certainty about private votes.

## Bill and provision UX

A federal bill contains one to three concrete provisions. Each provision is a named policy category with two to five legal alternatives. Drafting shows:

- current law;
- the proposed alternative;
- concise public estimated effects;
- fiscal direction where public;
- no generic low/current/high slider.

Ordinary amendments target a specific provision and replace its option. Every adopted or rejected amendment is retained in version history. NPC bills receive deterministic editorial titles and concise descriptions based on their actual contents.

## Court bench and opinions

The Court begins with a nine-seat bench. Each seat shows office, judge, and term end. Selecting a judge opens appointment, term, case, and vote history.

The docket places any required player vote first. A decided case shows:

- disposition and controlling constitutional provision;
- majority author and joining judges;
- dissent author and joining judges where applicable;
- a concise holding and rationale;
- the individual vote of every participating judge.

The appointment browser lists only legally qualified public candidates and explains eligibility in public terms. It replaces raw politician-ID entry and does not reveal private judicial utilities.

## Provincial legislature and Governor

The Governor's Province workbench combines regional conditions, a 25–65 seat Provincial Assembly, party composition, presiding officer, legislation, administrative priorities, federal advocacy, pressures, and the next election.

A Governor may send one focused provincial measure to the chamber, then sign or veto a passed measure. A two-thirds chamber override is shown as a real roll call. Provincial legislation uses a bounded subject catalog and one-stage vote; it is not a second federal simulator.

Provincial Assembly members and candidates are named public figures. Their provincial careers feed the federal politician directory and later national recruitment.

## Constitutional amendment tracker

The Assembly screen owns the constitutional tracker because the federal proposal threshold begins there. Every amendment shows:

- supported rule and proposed value;
- 280-vote federal threshold;
- federal roll call;
- ratification deadline;
- Provincial Assembly votes and progress toward 13 of 21;
- adopted, failed, or pending status;
- the live constitutional effect after adoption.

No presidential signature control appears.

## Organizations

Organizations use a national directory and selected scorecard. Public relationship copy distinguishes contact, trust, and policy alignment qualitatively. The scorecard prioritizes sponsorships, votes, signatures, vetoes, Governor policy, and public positions; meetings are a small secondary input. Endorsements may become withdrawn historical records after a campaign closes or a sustained policy break.

Organization influence is described in public language. Raw normalized values remain internal.

## Ground Game

Campaign field infrastructure is called **Ground Game** in player-facing text. Internal `organizationByProvince` and `organizationByConstituency` names may remain.

- Display strength on a 0–100 scale without decimals.
- National actions distribute broad effects without constituency-ID ordering.
- Province actions build provincial infrastructure and weighted constituency spillover.
- Constituency actions remain local.
- Maintenance preserves part of established infrastructure while allowing slow decay.
- Maps toggle province and constituency scale and never reveal latent support.

## Economy statistics

The public briefing leads with derived real-output growth, unemployment, inflation, real pay, housing conditions, and confidence. Internal reference indices remain available in a secondary disclosure and on detailed trend/region views.

The January scenario may say “reference index 100,” but must not imply that current values equal 100 or that January 2028 defines neutrality. With no prior month, cards say that no comparison is available.

## Map inspector

Domestic modes are Political, Election, Campaign, and Economy. A mode exists only when it visualizes the named public data.

- Hover is temporary and uses a lightweight tooltip.
- Pointer leave removes hover only.
- Click/tap pins a compact detail inspector.
- Keyboard Enter/Space pins the focused geography.
- Zoom, pan, and Reset remain lightweight.
- Political mode shows sitting multi-member composition/plurality.
- Election mode uses the selected election's public result or published poll; a national race without geographic data remains neutral and says so.
- Campaign mode shows Ground Game.
- Economy mode shows structural provincial conditions.

Selection outlines remain restrained; province boundaries are stronger than internal constituency borders.

## Political Calendar

The calendar unifies public election dates, nomination resolutions, party and caucus contests, and constitutional ratification deadlines. Simultaneous all-province cycles appear as grouped entries rather than 42 repetitive rows. Detail pages retain province-level inspection.

## Responsive behavior

V6 acceptance widths are 1440, 1200, 900, 600, and 390 pixels.

- At 1440 and 1200, use master/detail, rails, and split workbenches.
- At 900, collapse secondary rails after the primary action and visualization.
- At 600 and 390, use the explicit navigation drawer, keep the top action bar compact, and order urgent action before reference.
- Campaign and map controls remain tap-sized; the map never depends on hover.
- Governor metrics, chamber summaries, and policy choices become compact single-column sections, not scaled-down desktop cards.

## Accessibility basics

- Interactive SVG seats/geographies expose roles, labels, focus, and Enter/Space activation.
- Dialogs have names and explicit close controls; Escape closes global search.
- Busy turn/count states use live status text and no fake progress percentage.
- Color is always paired with a name, total, status, or legend.
- Tooltips supplement rather than replace keyboard/persistent detail.
- Focus and selected states remain visible at every supported width.

