# Final UI Reference Study — live PPUSA + BFTH (correction pass)

**Inspected:** 2026-09-18 (live rendered pages via fetch + structural reading).  
**Purpose:** Correct Lorsain toward compact political-world IA (PPUSA) with game polish (BFTH), without pixel-copying.  
**Rule:** No third-party screenshot binaries are committed. Observations below are from live page structure.

This supersedes the earlier marketing-heavy draft.

---

## Confirmation

This pass inspected **actual PPUSA game-interface routes**, not only the marketing homepage / Patreon about copy:

| URL | Inspected |
| --- | --- |
| https://powerplayusa.net/chambers/1 | Senate / legislature chamber |
| https://powerplayusa.net/executive | White House / executive |
| https://powerplayusa.net/elections/overview | Elections overview |
| https://powerplayusa.net/parties/1 | Party organization |
| https://powerplayusa.net/states/55 | Wisconsin state dossier |
| https://powerplayusa.net/executive/laws | Laws / code index |

BFTH (secondary): Steam store + mechanics docs + screenshot gallery indexes (structure only).

---

## PPUSA page records

### PAGE: Senate / Legislature (`/chambers/1`)

**VISIBLE STRUCTURE**
- Compact chamber title + session label (103rd Congress)
- Time-critical funding alert strip
- Leadership roster: President of the Senate, Pro Tempore, Majority/Minority Leader, Whips — each with person + Party
- Chamber description (short institutional primer)
- Chamber info table (session, members, committees)
- Seat counts by Party (dense numeric chips: 54 / 34 / 5)
- Bills on the Floor table + Bills in Committee table

**INFORMATION DENSITY:** High. Little whitespace; tables and leadership grid carry politics immediately.

**ENTITY PRESENTATION:** Named politicians with Party affiliation inline. Seats as numbers, not giant cards.

**ACTIONS:** Implicit (floor/committee bill lists). Leadership is identity-first.

**NAVIGATION:** Institution-scoped (this chamber), not a global dashboard.

**WHAT LORSAIN SHOULD LEARN**
- Lead with **composition + leadership + current business** in the first viewport.
- Separate **chamber control numbers** from executive “Government.”
- Prefer compact tables for bills over huge bill cards.

**WHAT LORSAIN SHOULD NOT COPY**
- US-specific offices (Pro Tempore, filibuster framing).
- Discord/community chrome.
- Exact layout/colors.

---

### PAGE: White House / Executive (`/executive`)

**VISIBLE STRUCTURE**
- President / Vice President identity blocks
- Short institutional primer (“The Presidency”)
- Resolute Desk work queue (resolutions awaiting action)
- Positions Taken budget (session-limited announcements)

**INFORMATION DENSITY:** Medium-high; executive identity then actionable queue.

**ENTITY PRESENTATION:** Officeholders as people first.

**ACTIONS:** Desk queue + take position.

**WHAT LORSAIN SHOULD LEARN**
- Executive page = **who holds power + what is waiting on the desk**, not four KPI tiles.
- Agenda/queue near the top.

**WHAT LORSAIN SHOULD NOT COPY**
- US Resolute Desk branding; session “positions left” as a hard mechanic clone.

---

### PAGE: Elections overview (`/elections/overview`)

**VISIBLE STRUCTURE**
- Active contested elections as compact race rows (office, leading candidate, Party swing %)
- Large ballot-measures table (state, measure, polling, decide week, Campaign action)

**INFORMATION DENSITY:** Very high tabular density for measures; races as tight cards/rows.

**WHAT LORSAIN SHOULD LEARN**
- Race list should be **scannable rows**, not giant isolated candidate hero cards.
- Polling + Party identity adjacent to candidate name.

**WHAT LORSAIN SHOULD NOT COPY**
- US state ballot-measure flood as primary UI.

---

### PAGE: Party (`/parties/1`)

**VISIBLE STRUCTURE**
- Party title
- Chair / Deputy / Treasurer with caucus tags
- National committee officers
- Party info table: members, treasury, strength %, multi-axis ideology scores
- Caucuses table: chair, members, stances, influence %
- State parties strength table

**INFORMATION DENSITY:** Extremely high organizational density — identity then officers then caucuses then states.

**WHAT LORSAIN SHOULD LEARN**
- Party page should pack **leaders, strength, ideology, caucuses, treasury** without a viewport of empty Party-selector cards.
- Caucuses as a first-class compact table.

**WHAT LORSAIN SHOULD NOT COPY**
- Discord join links; dollar treasury spectacle; exact ideology axis list.

---

### PAGE: State / subnational (`/states/55` Wisconsin)

**VISIBLE STRUCTURE**
- State identity (“Badger State”)
- Tab strip: Overview · Elections · Legislature · Metrics · Laws · Agencies · Governor
- Governor / Lt.Gov / Senators with Party
- State cabinet list
- State parties strength table
- History blurb + dense state info table (population, economy, rules, ideology axes)
- Economic composition sections

**WHAT LORSAIN SHOULD LEARN**
- Province dossier = **Governor + Party control + elections + facts + map**, compact tabs.
- Entity-rich header, not a blank map with tiny side panel.

**WHAT LORSAIN SHOULD NOT COPY**
- Corporate market-share minigame depth as the center of the dossier.

---

### PAGE: Laws (`/executive/laws`)

**VISIBLE STRUCTURE**
- Dense code/index listing of laws (large scrollable legal inventory)

**WHAT LORSAIN SHOULD LEARN**
- Law/statute browsers can be **dense lists with strong search**, not giant cards per Act.

**WHAT LORSAIN SHOULD NOT COPY**
- US Code taxonomy verbatim.

---

## BFTH secondary lessons

| Source | Lesson for Lorsain | Do not copy |
| --- | --- | --- |
| Steam + mechanics | Career/office ladder framing; action economy readable; mobile/tablet first-class | Exact PC scales, NY dark-mode art |
| UI news (sortable cards, confirmations) | Sortable dense registries; confirm only irreversible acts | Pixel chrome |

---

## Design correction for Lorsain

**Target feel:** PPUSA compact political-world IA + BFTH polish + Lorsain institutional depth.

**Density is not the enemy.** Prefer:

- compact scannable strips
- entity names with Party color/avatar initials
- early composition / leadership / business
- deep links everywhere

Avoid:

- giant hero banners
- one-KPI-per-panel dashboards
- decorative emptiness
- labeling plurality Party as “Government”

---

## Shell / search

PPUSA-style lesson: global jump to people/parties/states/bills. Lorsain already has Ctrl+K search — keep expanding entity coverage; keep chrome compact so content width wins.
