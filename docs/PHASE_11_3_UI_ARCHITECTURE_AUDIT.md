# Phase 11.3 UI Architecture Audit

Date: 2026-08-23  
Baseline: `b00ec52` (Phase 11.2 accepted on `main`)  
Status: living decision record for the V5 reconstruction

## Verdict on V4

Phase 11.2 improved role awareness and added Office, but the product still reads as a **dashboard of SectionCards**. PPUSA / BFTH / Pixel Bootstrap inspirations were documented more than embodied. Phase 11.3 treats every major page as open for reconsideration.

Guiding product identity:

> A political simulation game — not an enterprise admin panel, not a React card collage, not a spreadsheet with borders.

Desktop-first. Dense. Role-specific. Map + detail and list + inspector preferred over card grids.

---

## Screen-by-screen decisions

| Screen | Player purpose (3–5s) | Decision | Architecture |
| --- | --- | --- | --- |
| **Home** | What matters this month? | **Rebuild** | Role briefing strip → urgent decisions → one lead story → compact indicators. No card collage. |
| **Office** | Do my job | **Rebuild** | Current-job workbench. President/MP/Speaker/Justice embed real controls; Governor keeps dense workspace. Stop “go elsewhere” redirects. |
| **Career** | Who am I / what can I run for? | **Rebuild** | Overview masthead + Opportunities as primary + timeline/history tables. Kill empty Relationships tab. |
| **Party** | Party power & contests | **Rebuild** | Identity header + representation metrics + master/detail for factions/nominations. No politician card walls. |
| **Campaign** | Run the race | **Rebuild as command center** | Race identity top; left resources/rivals; center map; right actions; bottom polls/activity. |
| **Elections** | Understand races & results | **Rebuild by election type** | Presidential: map + candidate rail + RCV. Assembly: seats/composition + constituency detail. Governor: province map + race. Compact tables, not giant cards. |
| **Assembly** | Legislate | **Rebuild** | Composition strip → current business → pending player votes rail → bill table → selected bill detail with Overview/Provisions/Politics/Process. |
| **Executive** | Presidential authority | **Rebuild** | Tabs: Desk / Cabinet / Budget / Regulations. Concise SIGN/RETURN/NO ACTION. |
| **Courts** | Docket & justice work | **Rebuild** | Docket list + selected case + bench strip. Player votes obvious. |
| **Economy** | National briefing | **Rebuild** | Indicator strip → trends → regional table/map → sectors → history. Fewer giant cards. |
| **Organizations** | Interest groups | **Rebuild** | List + selected org inspector. |
| **News** | Political news | **Rebuild** | Lead / secondary / topic groups. Event-log styling banned. |
| **Foreign** | Diplomacy | **Layout-only rework** | Map + country detail + action strip. No sim reopen. |
| **Maps** | Explore geography | **Rebuild** | Mode bar + large map + right detail + legend. Truthful modes only. |
| **Archive** | Long memory | **Rebuild** | Sectioned: Elections / Administrations / Legislation / Courts / Foreign / Economy. Paginated. No 50-year feed. |
| **New Game** | Choose a playable life | **Rebuild** | Featured starts with role/complexity copy; searchable full roster secondary. |

### Pages added

- None required as permanent nav destinations beyond existing set.
- **Politician inspector drawer** (shared) — opened from Elections/Party/Assembly/Cabinet without a new sidebar item.

### Pages removed / merged

- No route deletions in 11.3 (compatibility).
- Career “Relationships” tab content merged into Organizations deep-link; tab removed.
- Non-governor Office prose redirects replaced by embedded work panels.

---

## Layout grammar (UI System V5)

| Pattern | Use |
| --- | --- |
| `WorkLayout` | Top identity + main + optional right rail |
| `MapDetailLayout` | Large map + selected-entity panel |
| `MasterDetail` | List/table + inspector |
| `MetricStrip` | Compact indicators (not a card each) |
| `EntityRow` | Dense politician/bill/org rows |
| `DataTable` | Results, bills, seats, archive |
| `PolicyChoiceGroup` | Current + LOW/MOD/HIGH style options |
| `SectionDivider` | Non-card sectioning |
| Cards | Only for identity objects (candidate, bill, story) |

Desktop widths: use 2–3 columns at ≥1200px. Mobile collapses rails into drawers/tabs.

---

## Inspiration → concrete adoption

### PPUSA

- Election map + right candidate rail + below rounds/breakdown
- Compact result tables (Candidate | Party | 1st pref | Status)
- “Constituencies / provinces to watch” from **public** org/poll/margin signals
- Policy category as unit of choice (current / alternatives / cost / effects)

### Battle for the Hill

- Campaign page as identity/command center
- Race status prominence
- Politician as protagonist (Home/Career/Office voice)

### Pixel Bootstrap / Tabler

- Tables, badges, tabs, drawers, tooltips, responsive grids
- Not installed as a theme

---

## Policy / legislation UX principles

1. Title + one line + major effects + cost + action
2. “Details” expand for mechanism/prose
3. Bills scan as rows; selected bill uses Overview / Provisions / Politics / Process / History
4. Governor priorities use the same PolicyChoiceGroup grammar
5. No hidden formulas; no latent support

---

## Residual 11.2 defects in scope

| Defect | Fix |
| --- | --- |
| Raw `NPC###` in UI | Display helpers never fall back to raw IDs in normal play |
| `Public standing: unknown` | Seed/default standing for officeholders; copy “Not routinely measured” only when truly N/A |
| Screenshot stitch bugs | Dedicated QA capture path; do not twist CSS for broken harness |

---

## Balance / calibration (paired with UI)

Whole-game harness: **100 saves × 600 months** with catastrophic invariants, politics/economy/career/foreign telemetry. Existing calibrate scripts retained; new whole-game runner added.

---

## Out of scope (do not become Phase 12)

- Provincial legislatures, municipal grand strategy, tactical warfare, espionage, new production chains
- Foreign architecture reopen absent bugs
- Weakening election math for speed
