# Lorsain UI System V4 — Role-aware political workspace

Date: 2026-08-23  
Applies from: Phase 11.2 / save schema 12

## Product character

Lorsain is a governmental, political, editorial, data-rich game. It is not a generic administration dashboard. Screens should make the current political question, the player's authority, and the public evidence for a decision obvious before presenting reference detail.

The interface uses three layers:

1. **Briefing** — what needs this politician's attention now.
2. **Work** — actions the current role can legitimately take.
3. **Reference** — national institutions, public history, maps, and data that remain available to every player.

Internal state, latent voter support, agent reasoning, exact hidden utilities, and unpublished geographic truth never become presentation merely because the simulation stores them.

## Page architecture

| Page | Primary question | Structure |
| --- | --- | --- |
| Home | What needs my attention as this politician? | role brief, interrupts, lead public event, immediate indicators, bounded activity |
| Office | What can I do in my current office? | role masthead, authority-specific workbench, office context, next career date |
| Career | What is my record and what can I seek next? | Opportunities first, then biography, office/election/campaign history and public record |
| Party | What is happening inside my party? | leadership and status, factions, contests, officeholders, type-correct election performance |
| Campaign | What am I running for, where, and what can I do now? | race header, resources, geographic organization map/list, opponents, actions and recent work |
| Elections | What race or result am I examining? | separate Presidential, Assembly, Governor and Nomination presentations |
| Assembly | What business is actionable now? | agenda and required votes before composition/reference |
| Executive | What is the national administration doing? | presidential workbench when authorized, public administration view otherwise |
| Courts | What is on the docket and does the player owe a vote? | pending duty, docket, bench, decisions and precedent |
| Economy | Is this movement temporary, cyclical, or structural? | current/delta cards, national history, sector history, regional map/comparison, explanations |
| Organizations | What does this organization want and how can I interact? | selected actor master/detail, issues, public activity, relationship and actions |
| News | What happened, and how did outlets frame it? | event clusters with lead and secondary events; outlet treatments nested under the event |
| Foreign Affairs | What is the public international situation and, if President, what can I do? | selected country master/detail, world map modes, commitments, crises and authorized actions |
| Maps | What public political or economic geography am I inspecting? | mode controls, scale/election selectors, interactive map, persistent detail and legend |
| Archive | What public history has accumulated? | category/year navigation with bounded lists and public-language summaries |

`Office` is the only new permanent page. Political Opportunities is a Career view; provincial elections are an Elections view; province statistics are shared components. No duplicate Province, Election Detail, or Regional Statistics sidebar destinations are added.

## Navigation

The sidebar remains grouped but the emphasis adapts to the player's role:

- **Briefing:** Home, Office, Career.
- **Politics:** Party, Campaign, Elections.
- **Government:** Assembly, Executive, Courts, Economy, Organizations, News.
- **World and record:** Foreign Affairs, Maps, Archive.

Context markers identify the current role's most relevant government page, an active Campaign, and Career for a private/former politician. Information remains reachable when the player lacks authority; the screen must then be clearly informational. `Terena Map` is labeled `Maps` while retaining its internal route key for compatibility.

Office labels are contextual: `Province` for a Governor, `Presidency` for a President, `Judicial office` for a justice, and `Member's office` for an MP or Speaker.

## Role-aware behavior

- **President:** required dispositions, legislation, cabinet, foreign crises, economic trend, and reelection dates lead.
- **Speaker/MP:** bills, votes, floor queue, constituency and election dates lead.
- **Governor:** province conditions, administrative action points, priority, investment, federal position, pressure response, local MPs, and gubernatorial career lead.
- **Justice:** pending judicial vote and docket lead; incompatible elected races are explained rather than offered.
- **Candidate:** race, cash, action points, opponents, geography and recent activity lead.
- **Former/private politician:** legitimate opportunities and filing dates lead.
- **Minister/Mayor:** the interface labels their v1 experience `Limited`; each has one visible named action per month with recorded feedback, and those bounded advice/civic-priority actions never imply presidential or full municipal authority.

Buttons are convenience, not permission. Every action is revalidated by the simulation command layer.

## Typography

- Page titles and institutional mastheads use the editorial serif stack.
- Navigation, controls, data tables and compact labels use the system sans stack.
- Kicker text is short, uppercase, tracked, and used only for context.
- Numerical values use tabular figures where comparisons matter.
- Long all-caps headings and ornamental display type are avoided.

The visual hierarchy is: page title, current question/masthead, section title, compact label, body/reference text.

## Color

- A warm paper surface and deep ink foreground establish the editorial base.
- Deep governmental blue marks navigation and primary institutional actions.
- Muted gold marks attention and civic emphasis.
- Red is reserved for destructive, overdue, conflict, or rejection states.
- Green indicates completed/positive public state, not hidden probability.
- Party colors identify parties and election results; they do not become broad page backgrounds.
- Map no-data and genuine ties use explicit neutral colors.

All text and interactive states must retain readable contrast. Color is always paired with a label, icon, number, border, or pattern of placement.

## Spacing and width

- Desktop content uses available space up to approximately 96rem.
- Dense political tables and master/detail layouts use smaller internal gaps than identity cards.
- A card must group a real object or decision; it must not exist only to wrap one line.
- Compact rows are preferred for repeated bills, votes, parties, stories, and historical entries.
- Full-width controls are reserved for mobile or genuinely long text entry.

## Cards and data layouts

Use the smallest structure that fits the information:

- **Masthead:** politician/office/race identity and top dates.
- **Metric strip:** three to six comparable current indicators.
- **Master/detail:** geography, organization, election and archive selection.
- **Compact table/list:** repeated bills, votes, officeholders, candidates and history.
- **Timeline:** career and political history.
- **Section card:** a coherent object or action group, with varied density.
- **Briefing band:** role-specific urgent/current information.

Do not render hundreds of full politician cards. Candidate and member collections use bounded previews, compact rows, pagination, or selected detail.

## Political Opportunities

Opportunities show only races the politician can legitimately seek. Each item includes office, geography, election date, filing dates, eligibility/incompatibility, incumbent, public field, and status. Run, decline, and withdrawal remain explicit.

Assembly geography is presented as constituency cards with province, magnitude and sitting party composition. Governor geography uses eligible provinces. No latent support or calculated win chance is shown unless a published poll supplies it.

## Legislation composer

A bill has one to three concrete provisions. Each row contains:

- a policy category;
- one named legal option;
- current law;
- the proposed legal change;
- restrained estimated public index effects.

The simulation stores the corresponding issue direction and magnitude, but the player does not author raw vectors. Default titles and summaries are deterministic, natural public prose. Public bill lists never fall back to issue IDs or phrases such as `Moderate on ...`.

## Maps

### Interaction contract

- Hover is transient and drives a lightweight tooltip for the current mode.
- The World map follows the same rule: Relations, Alliances, Crises, Sanctions and Posture tooltips state only public mode-relevant information.
- Mouse leave clears hover without clearing clicked selection.
- Click or tap creates persistent selection and opens/updates detail.
- Keyboard focus plus Enter/Space selects a geography.
- Touch never depends on hover.
- Wheel/buttons provide lightweight zoom; pointer drag pans; Reset restores the fitted national view.

### Visual hierarchy

- Province boundaries are stronger than internal constituency boundaries.
- Hover uses a subtle outline.
- Selection uses a restrained stronger outline/fill treatment, never a thick web of borders.
- Cities are secondary marks with symmetric enter/leave behavior.
- Legends name both value and no-data states.

### Mode truth

- **Political:** sitting Assembly plurality/composition.
- **Election:** the selected election's certified geography or legitimate public constituency polling. A national presidential election with no geographic public data remains neutral.
- **Campaign:** national, province and constituency field infrastructure, with an explicit scale selector.
- **Economy:** province conditions/employment/housing and public trend.
- **Organizations:** omitted until canonical public geographic presence/activity exists; a fake neutral fill is not a mode.

Tooltips use public mode data only. Maps never reveal latent voter support.

## Charts

- Show the current level plus monthly, 12-month and longer change where history permits.
- Label the scale `Index reference = 100`; January 2028 is not mathematically defined as 100.
- Use one decimal at most for public economic indices and avoid false precision.
- Lines and legends must distinguish national, selected province and selected sector context.
- Explain known shocks or policy effects in prose; do not expose formulas.

## Drawers, modals and menus

- A drawer is for a focused action with several inputs, such as campaign action or executive policy.
- A confirmation modal is required for consequential irreversible choices.
- Compact contextual menus hold secondary actions; primary monthly actions remain visible.
- Opening and closing preserve keyboard focus where practical; Escape dismisses transient layers.
- Busy states disable repeat submission and use truthful labels such as `Counting nomination...` without fake percentages.

## Tooltips and empty states

Tooltips identify the object first and then show no more than the current mode's essential public facts. They do not replace persistent selection detail.

Empty states explain whether the player lacks authority, no event exists, a filing window is closed, or data is not public. `Nothing here` and raw ID fallbacks are not acceptable player-facing copy.

## Responsive rules

Validated breakpoints are 1440, 1200, 900, 600 and 390 CSS pixels.

- **1440/1200:** use two-column master/detail, side rails and broad maps; do not stretch prose across the full width.
- **900:** collapse navigation to the responsive drawer; place current actions before secondary maps/reference; preserve compact tables with horizontal overflow only where necessary.
- **600:** reduce metric columns, use segmented horizontal tabs, and keep primary controls thumb-sized.
- **390:** show urgent/current information, actions, primary visualization and detail in that order. Maps retain zoom controls and tap selection. Dense rows reflow into labeled pairs rather than becoming microscopic tables.

Campaign, Province, Elections, Foreign Affairs and Maps receive explicit mobile ordering; a generic `stack every column` rule is insufficient.

## Accessibility basics

- Every interactive control is keyboard reachable and has an accessible name.
- Visible focus uses `:focus-visible` and is not removed.
- Map geographies are focusable buttons in the SVG accessibility tree.
- Hover-only content is duplicated by selection/focus behavior.
- Status does not depend on color alone.
- Dialogs and drawers use headings and explicit close controls.
- Motion is restrained and respects reduced-motion preferences where animation exists.
- Touch targets aim for at least 40 CSS pixels in primary workflows.

## Long-save discipline

News groups outlet treatment under the underlying event. Archive is navigated by category and period. Elections use current/selected records rather than first-array fallbacks. Candidate/member lists are bounded. Screens should be assessed with years of bills, news, elections, campaigns and history, not only on 2028-01-01.

## Non-goals

V4 does not add provincial legislatures, municipal grand strategy, hidden polling truth, a campaign staff simulator, a full regional input-output economy, or a purchased theme. Those are not required for a clear, legitimate v1 political role experience.
