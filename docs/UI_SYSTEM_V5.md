# Lorsain UI System V5 — Dense political workbench

Date: 2026-08-23  
Applies from: Phase 11.3  
Baseline: `b00ec52` (Phase 11.2 accepted)  
Decision record: `docs/PHASE_11_3_UI_ARCHITECTURE_AUDIT.md`  
Supersedes: `docs/UI_SYSTEM_V4.md` for layout grammar, page architecture, and presentation density. V4 role/map/truthfulness rules remain unless this document states otherwise.

## Product character

Lorsain is a political simulation. Screens answer a political question under time pressure: what must this politician do, what authority do they hold, and what public evidence supports the choice. The interface is desktop-first, dense, and role-specific.

It is not an enterprise admin panel, not a marketing surface, and not a collage of `SectionCard`s. Prefer map + detail and list + inspector over card grids. Compact is correct; clutter is not.

## Relationship to V4

| Keep from V4 | Replace in V5 |
| --- | --- |
| Public-facts-only presentation; no latent support | Card-dashboard page shells |
| Role-aware navigation and Office as permanent page | Generic equal-weight SectionCard stacking |
| Truthful map modes and hover/click/tap contract | Full-width prose and oversized identity cards for repeated entities |
| Responsive breakpoints 1440 / 1200 / 900 / 600 / 390 | “Stack everything” as the only mobile strategy |
| Concrete legislation categories and Career Opportunities | Hollow redirects (“go to Executive”) for Office work |

---

## Page architecture

| Page | Primary question (≈3–5s) | Structure |
| --- | --- | --- |
| **Home** | What matters this month? | Role briefing strip → urgent decisions → one lead story → compact indicators. No card collage. |
| **Office** | Do my job | Current-job workbench. President / MP / Speaker / Justice embed real controls; Governor keeps dense provincial workspace. |
| **Career** | Who am I / what can I run for? | Overview masthead + Opportunities primary + timeline/history tables. No empty Relationships tab. |
| **Party** | Party power and contests | Identity header + representation metrics + master/detail for factions and nominations. No politician card walls. |
| **Campaign** | Run the race | Command center: race identity; left resources/rivals; center map; right actions; bottom polls/activity. |
| **Elections** | Understand races and results | By type: Presidential map + candidate rail + RCV; Assembly seats/composition + constituency detail; Governor province map + race. Compact tables. |
| **Assembly** | Legislate | Composition strip → current business → pending player votes rail → bill table → selected bill (Overview / Provisions / Politics / Process). |
| **Executive** | Presidential authority | Tabs: Desk / Cabinet / Budget / Regulations. Concise SIGN / RETURN / NO ACTION. |
| **Courts** | Docket and justice work | Docket list + selected case + bench strip. Player votes obvious. |
| **Economy** | National briefing | Indicator strip → trends → regional table/map → sectors → history. |
| **Organizations** | Interest groups | List + selected org inspector. |
| **News** | Political news | Lead / secondary / topic groups. Event-log styling banned. |
| **Foreign Affairs** | Diplomacy | Map + country detail + action strip (layout rework; no foreign architecture reopen). |
| **Maps** | Explore geography | Mode bar + large map + right detail + legend. Truthful modes only. |
| **Archive** | Long memory | Sectioned: Elections / Administrations / Legislation / Courts / Foreign / Economy. Paginated. |
| **New Game** | Choose a playable life | Featured starts (role, focus, complexity) + searchable full roster. |

No permanent nav destinations added in 11.3. Shared **politician inspector** may open from Elections / Party / Assembly / Cabinet without a new sidebar item. Career Relationships content deep-links to Organizations.

---

## Desktop layout patterns

Primitives live in `apps/game/src/ui/kit.tsx`.

| Pattern | Use |
| --- | --- |
| `WorkLayout` | Top identity / brief → main column → optional right rail → optional footer. Default office and briefing shell. |
| `MapDetailLayout` | Toolbar → large map → selected-entity panel → legend. Elections, Economy regional, Maps, Foreign, Campaign geography. |
| `MasterDetail` | List/table + inspector (`listWidth` narrow/wide). Organizations, bills, archive sections, party contests. |
| `MetricStrip` / `BriefStrip` | Three to six comparable indicators — not one card per metric. |
| `EntityRow` | Dense politician / bill / org / activity rows with optional select. |
| `DataTable` | Results, seats, bills, archive, history. Prefer over card lists. |
| `PolicyChoiceGroup` | Current law + named alternatives (LOW / MOD / HIGH style) with scannable effects/cost; Details optional. |
| `SectionDivider` | Non-card sectioning between work regions. |
| `RightRail` / work-layout rail | Pending votes, selected entity, secondary actions. |
| Cards | Only for identity objects (candidate, bill, story, featured start). Never wrap one line for decoration. |

Desktop (≥1200px): use two or three columns. Do not stretch body prose across the full content width.

---

## Side rails

- Right rails hold **work the player owes now** or **selection context**, not decorative summaries.
- Assembly: pending player votes and selected-bill actions.
- Campaign: actions and rivals beside the map.
- Elections / Maps / Foreign: selected geography or candidate.
- On narrow viewports, rails collapse to drawers, tabs, or ordered stacks (actions → primary visualization → detail).

---

## Entity rows and tables

- Repeated politicians, bills, organizations, and history use `EntityRow` or `DataTable`.
- Bound, filter, or paginate large collections. Do not render hundreds of full politician cards.
- Selected row state must be visible without relying on color alone.
- Tables use dense padding; captions optional for accessibility.

---

## Cards (when allowed)

Allowed when the card is the container for a **single identity object or decision**:

- Featured New Game start
- Lead news story
- Selected bill identity (not every bill in a list)
- Candidate identity in a short field preview

Disallowed: wrapping each metric, each history line, or each empty state in a `SectionCard`. Prefer `SectionDivider` + rows.

---

## Typography

- Institutional titles and politician names: editorial serif (`--serif`).
- Navigation, controls, tables, kickers: system sans (`--sans`).
- Kickers: short, uppercase, tracked — context only.
- Tabular figures for comparable numbers.
- Hierarchy: page title → current question/masthead → section title → compact label → body/reference.
- No ornamental display type, marketing heroes, or long all-caps headings.

---

## Color and party colors

- Warm paper (`--paper` / `--bg`) and deep ink (`--ink`) establish the editorial base.
- Governmental navy (`--navy` / `--accent`) for navigation and primary institutional actions.
- Danger red for destructive / overdue / rejection; green for completed public state — never as a hidden-probability cue.
- **Party colors** come from canonical party definitions via `partyColor()`. Use for swatches, map fills, composition bars, and left-edge identity accents. Do not flood page backgrounds with party color.
- Map no-data and ties use explicit neutrals.
- Color always pairs with label, number, border, or placement.

---

## Spacing and width

- Content uses available width up to ~96rem where workbench layouts need it; New Game browse stays narrower (~72rem).
- Dense tables and master/detail use tighter internal gaps than identity blocks.
- Prefer compact rows for repeated entities.
- Full-width controls reserved for mobile or long text entry.

---

## Buttons and badges

- Primary: `.btn` (navy). Secondary / quiet / ghost for lesser actions. `.danger` for irreversible harm.
- Buttons are convenience; simulation commands revalidate permission.
- Busy states disable repeat submission with truthful labels (`Counting nominations…`), not fake percentages.
- `StatusBadge` tones: `ok` / `warn` / `idle` — status text remains required.
- Complexity and Limited role labels on New Game use badges, not marketing chips.

---

## Policy choices

`PolicyChoiceGroup` grammar (Assembly composer, Governor priorities, analogous executive choices):

1. Title + current law label
2. Named alternatives with one-line summary
3. Scannable effects and cost
4. Optional Details for mechanism/prose
5. No hidden formulas; no latent support

A tester should answer without source: what is current, what changes, what it does, cost, tradeoffs, how to choose.

---

## Election presentation

| Type | Presentation |
| --- | --- |
| Presidential | Map (when public geography exists; else explicit neutral) + candidate rail + RCV rounds / compact result table |
| Assembly | Seat composition strip + constituency master/detail; multi-member STV not forced into single-winner cards |
| Governor | Province map + race detail; plurality results as dense tables |
| Nominations | Contest list + selected contest detail; counting status truthful |

Historical cycles remain selectable. No first-array election fallback as “current.”

---

## Campaign presentation

Command-center layout:

- **Top:** race identity, status, calendar
- **Left:** cash, action points, rivals / standing
- **Center:** organization map (national / province / constituency scales)
- **Right:** monthly actions
- **Bottom:** polls and recent activity

Geographic strategy must be obvious. National / province / constituency organization remains truthful; no ID-order bias in presentation claims.

---

## Navigation

Grouped sidebar (`apps/game/src/ui/shell.tsx`):

- **Overview:** Home, Office, Career
- **Politics:** Party, Campaign, Elections
- **Government:** Assembly, Executive, Courts
- **Society:** Economy, Organizations, News
- **World:** Foreign Affairs, Maps (`terena` route key retained)
- **Reference:** Archive

Context markers emphasize the current role’s most relevant government page, active Campaign, and Career for private/former politicians. Information stays reachable without authority; screens then read as informational.

Office labels: Province / Presidency / Judicial office / Member's office as appropriate.

---

## Role awareness

| Role | Lead surfaces |
| --- | --- |
| President | Dispositions, legislation inbox, cabinet, foreign crises, economy, reelection |
| Speaker / MP | Floor queue, votes, bills, constituency, election calendar |
| Governor | Province conditions, AP, priority/investment/federal position, local MPs, gubernatorial race |
| Justice | Pending judicial vote, docket, term/incompatibility |
| Candidate | Race, cash, AP, opponents, geography, activity |
| Former / private | Legitimate opportunities and filing windows |
| Minister / Mayor | Labeled **Limited**; one named monthly action; not featured as full-depth starts |

---

## Responsive behavior

Breakpoints: **1440, 1200, 900, 600, 390** CSS pixels.

| Width | Expectation |
| --- | --- |
| 1440 / 1200 | Two–three column workbench, side rails, broad maps |
| 900 | Nav drawer; actions before secondary maps/reference; tables may scroll horizontally when necessary |
| 600 | Fewer metric columns; segmented tabs; thumb-sized primary controls |
| 390 | Order: urgent → actions → primary visualization → detail. Maps keep zoom and tap selection. Dense rows reflow to labeled pairs |

Campaign, Office (Province), Elections, Foreign, and Maps need explicit mobile ordering — not a generic stack.

---

## Mobile

- Touch never depends on hover; selection is tap/click/keyboard.
- Primary touch targets aim for ≥40 CSS px in core workflows.
- Drawers and confirm dialogs remain keyboard-dismissible (Escape) with focus preserved where practical.

---

## Accessibility

- Every interactive control is keyboard reachable with an accessible name.
- Visible `:focus-visible` is not removed.
- Map geographies are focusable in the SVG accessibility tree.
- Hover-only content is duplicated by selection/focus.
- Status does not depend on color alone.
- Dialogs/drawers use headings and explicit close controls.
- Motion is restrained; respect reduced-motion where animation exists.

---

## Long-save discipline

News groups outlet treatment under events. Archive is category + period, not a 50-year undifferentiated feed. Elections use current/selected records. Candidate and member lists are bounded. Assess screens with years of bills, news, elections, and history — not only 2028-01-01.

---

## Non-goals (Phase 11.3)

No provincial legislatures, municipal grand strategy, tactical warfare, espionage, new production chains, purchased UI themes, or foreign-architecture reopen absent bugs. Do not begin Phase 11.4 content/prose depth from this document alone.

---

## Implementation anchors

- Kit: `apps/game/src/ui/kit.tsx`
- Shell / nav: `apps/game/src/ui/shell.tsx`
- Styles: `apps/game/src/styles.css`
- Audit: `docs/PHASE_11_3_UI_ARCHITECTURE_AUDIT.md`
- Before/after: `docs/PHASE_11_3_UI_BEFORE_AFTER.md`
