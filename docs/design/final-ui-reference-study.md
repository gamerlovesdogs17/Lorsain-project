# Final UI Reference Study — BFTH & PPUSA

**Purpose:** Extract *structural* UX lessons from Battle for the Hill (BFTH) and Power Play USA (PPUSA) for Lorsain’s final UI direction.  
**Scope:** Presentation patterns, information hierarchy, and interaction grammar — not visual cloning.  
**Companion:** `docs/design/final-ui-tokens.md` (token category skeleton for the design-system implementer).

**No third-party screenshot binaries are stored in this repo.** References below describe what was inspected; implementers should open the cited URLs themselves.

---

## Structural inspiration vs visual copying

| | **Structural inspiration (allowed)** | **Visual copying (forbidden)** |
| --- | --- | --- |
| Definition | How screens are *organized*: what appears first, what is secondary, how actions relate to maps/chambers/cards | Exact colors, fonts, spacing, chrome, iconography, pixel layouts, marketing assets |
| Example | Election night = live map + headline totals + progressive returns | BFTH’s New York dark-mode background, PPUSA’s US map palette, Steam capsule art |
| Example | Campaign trail = actions + map + polling, not a spreadsheet of stats | Card radii, button styles, sidebar pixel widths |
| Example | Legislature = chamber composition + current business + vote flow | Multiplayer chat chrome, Discord CTAs, Ko-fi/Patreon monetization UI |
| Lorsain rule | Steal the *political grammar*; invent the *Lorsain look* | Never ship BFTH/PPUSA assets, brand marks, or near-identical skins |

If removing a competitor’s logo/colors would still leave a useful wireframe, that wireframe is structural. If the value depends on their look, it is visual copying — discard it.

---

## Sources inspected

### Battle for the Hill (BFTH)

| URL | What was inspected |
| --- | --- |
| https://store.steampowered.com/app/2331860/Battle_For_The_Hill/ | Steam store page: pitch, feature lists (career ladder, campaign stats, legislatures, courts/cabinet, maps), Early Access framing, screenshot *media strip* (capsule + in-game UI stills — viewed as gallery index, binaries not downloaded) |
| https://battleforthehill.com/ | Official site: career path framing (character → party → faction → nomination → office → law → coalitions → leadership), persistent-sim tone |
| https://battleforthehill.com/information/mechanics | Mechanics doc: Campaign Strength / reputation stack, Political Capital soft cap, legislative process list (bills, committees, voting), campaign actions |
| https://steampulse.org/game/2331860/media | Screenshot gallery *index* for app 2331860 (Steam media mirrors). Use as a catalog of store screenshots to review layouts; do not commit image binaries |
| https://steamcommunity.com/app/2331860/allnews/ (and related Steam news posts) | Community/news posts citing **Dark Mode**, **mobile interface overhaul**, **optional Desktop View on mobile**, **sortable information cards**, **better confirmation windows**, **major desktop UI polish**, legislative card reorganization, bill preview interfaces |
| Google Play listing for BFTH (`com.BattleForTheHill.bfth`) | Store listing + screenshot set for **mobile layouts** (campaign/governance on phone form factors). Cite listing screenshots as visual reference only; do not commit binaries |

### Power Play USA (PPUSA)

| URL | What was inspected |
| --- | --- |
| https://powerplayusa.net/ | Marketing/home: campaign trail framing; **election night county-by-county** with live returns / turnout / swing as the map turns color; **map command** (Senate/House/gov seats, registration, turnout); primaries with **delegate counts** and county polling; legislation / Cabinet / party leadership promises |
| https://www.patreon.com/powerplayusa/about | Feature list: character creation; primaries & generals; party/caucus/state party; fundraising; **legislation through committee**; governorship + state legislature; **Supreme Court**; **Cabinet**; press/media; economy (context for scope — not a UI pattern to copy wholesale) |

---

## Reference records

Format: **SOURCE | PAGE/SCREEN | WHAT IT DOES WELL | WHAT LORSAIN CAN LEARN | WHAT NOT TO COPY**

### BFTH

1. **Steam store + screenshots media** | Capsule / about / screenshot strip  
   | Positions the product as a *political career + institutions* game (office ladder, parties, bills, courts, executive) rather than a generic strategy dashboard.  
   | Lead marketing and in-game shells with **office, party, and institutional stakes** before raw metric grids.  
   | Free-to-play / MMO / Discord-required framing; US-centric capsule branding; exact screenshot chrome and colorways.

2. **battleforthehill.com** | Home career path sections  
   | Clear sequential fantasy: create character → join party/faction → win nomination → run → shape law → lead. Identity and affiliation precede “systems.”  
   | Onboarding and Home should narrate **politician → party → institution → action**, not “open the spreadsheet.”  
   | Community/Ko-fi monetization messaging; multiplayer toxicity/community-management chrome.

3. **battleforthehill.com/information/mechanics** | Core stats + legislative/campaign lists  
   | Separates *campaign efficacy* (Campaign Strength, reputation) from *action budget* (Political Capital) and lists legislative verbs (propose, committee, vote).  
   | Keep **action economy and public standing** readable; don’t bury campaign verbs under opaque numbers. Stats support the trail; they are not the trail.  
   | Exact 0–100 scales, PC soft-cap math, multiplayer-specific penalties (carpetbagging/party switch as social-PVP deterrence).

4. **Steam Community news (Government Expansion / Major Systems / Dark Mode)** | UI sections in announcements  
   | Explicit UX investments: desktop polish, mobile overhaul, Desktop View toggle on mobile, **sortable cards**, **confirmation windows**, bill preview, alphabetical/organized legislative lists, light/dark preference.  
   | Treat **mobile/tablet as first-class** (drawer/menu, not a squeezed sidebar). Use **sortable information cards** for dense registries. Reserve **confirmations for major/irreversible actions** only. Offer theme preference without making theme the product.  
   | Dark Mode’s New York background image; live player-count social footer; corporate minigame UIs; Discord role automation as primary chrome.

5. **SteamPulse media gallery index** | Screenshot catalog for 2331860  
   | Convenient index of store media for comparing desktop vs in-game panels without hunting Steam CDN URLs.  
   | Use as a *study checklist* (which screens exist: map, chamber, profile, campaign) when wiring Lorsain’s screen inventory.  
   | Do not mirror or commit third-party screenshot files; do not match pixel layouts.

6. **Play Store listing screenshots** | Mobile layout stills  
   | Shows campaign/government flows adapted to narrow viewports (stacked sections, thumb-reachable actions).  
   | Lorsain tablet/phone: **drawer nav**, stacked workbench, horizontal scroll *inside* tables only — never a desktop rail crushed into 360px.  
   | Android wrapper chrome, Unity splash branding, F2P store listing patterns.

### PPUSA

7. **powerplayusa.net** | “Win the Primary” / “Run Your Campaign” / “Claim Victory”  
   | Campaign is an **active trail**: primaries with delegates + county polling; rallies/ads/canvassing move polls; election night is a **spectacle** (county returns, turnout, swing, map color).  
   | Campaign screens = **actions + map + polling**. Election night = **map + headline totals + progressive reporting**. Primaries/delegates deserve a visual race browser, not a flat table only.  
   | US-only branding and American institutional names; multiplayer ticker/news feed as social theater; corporate empire / markets as equal hero features.

8. **powerplayusa.net** | “Command the Map” / “Govern the Nation”  
   | Map as command surface for seats, registration, turnout; governance framed as drafting, confirming Cabinet, driving House/Senate/White House business.  
   | Map should answer **who holds what** and **where the race is**; legislature/executive should feel like **chamber and desk**, not admin CRUD.  
   | Exact US red/blue map tropes as Lorsain’s color system; 50-state registration UX specifics.

9. **Patreon about** | Feature inventory  
   | Institutions are named as playable destinations: character, primaries, legislation/**committee**, Court, Cabinet, press. Hierarchy implies political *roles* before side systems.  
   | Lorsain’s IA should foreground **character identity, elections, chamber, Court, Cabinet/executive** as first-class destinations; secondary registries (directories, archives) sit one level down.  
   | Economy/corporate conquest as core identity; Discord-as-product; Patreon monetization UI.

---

## Structural lessons for Lorsain (emphasize)

### 1. Strong politician / party identity before stats
Profile and Home open on **who you are** (name, office, party/caucus, home) and **what you can do now**. Metrics (standing, funds, polls) support that identity; they do not replace the masthead.

### 2. Campaign as active trail (actions + map + polling)
A campaign screen is a **trail desk**: spend actions, see geography, read polls. Avoid a metric spreadsheet with a “campaign” label. PPUSA’s trail → poll movement loop and BFTH’s action/PC + ads/endorsements vocabulary both reinforce *doing*, not *watching numbers*.

### 3. Election night: map + headline totals + progressive reporting
Structure: (1) race headline and running totals, (2) map that updates as returns arrive / regions resolve, (3) progressive detail (county/district/province rows). PPUSA’s “map turns your color” and BFTH’s election-night authenticity notes are structural cues — implement with Lorsain geography and parties.

### 4. Legislature feels like a chamber
Composition (who sits where / seat shares), **current business**, and **votes** are co-equal. Bill preview and organized lists (BFTH) support the chamber; they don’t replace it. Align with existing V6 chamber layers: leadership/agenda → composition/bills → bill detail/roll call.

### 5. Sortable information cards; confirmations for major actions only
Dense lists (bills, members, races) benefit from **sortable/filterable cards or tables**. Confirmations are for consequential or irreversible acts (resign, dissolve, certify, override, major spend) — not every toggle.

### 6. Mobile / tablet first-class layouts
Drawer (or explicit menu) navigation; optional “desktop layout” only as an *escape hatch*, not the default. Never ship a squeezed permanent sidebar on narrow widths. Study Play Store / mobile overhaul notes as proof that political sims need real responsive IA.

### 7. Hierarchy: headline political state → secondary registries
First viewport answers: **what is the political situation?** Secondary surfaces hold directories, archives, full membership lists, and deep reference. PPUSA’s race browsing and map command illustrate headline state; registries are drill-downs.

### 8. PPUSA race browsing visual
County/district returns, color-shifting map, and browsable races teach a **visual election browser**. Apply to Lorsain provinces/districts and party colors from the Lorsain design system — not US party colors.

---

## What not to copy (global ban list)

- Multiplayer social chrome (live player counts as primary UI, Discord-gated access, chirp/chat-as-core-loop)
- Monetization surfaces (Ko-fi, Patreon, F2P store pressure)
- US-only branding, American flag/red-blue default identity, real-world US party skins
- Corporate / market / casino / lottery minigames as equal first-class heroes
- Exact color schemes, typography, radii, shadows, or pixel layouts from either product
- BFTH or PPUSA assets, logos, screenshot binaries, or near-identical themes (including BFTH Dark Mode NYC backdrop)

---

## Lorsain target identity

Lorsain should feel like **institutional depth presented as a political game** — not a spreadsheet with a map widget, and not a social MMO with bills bolted on.

- **Institutional depth:** Assembly chamber, Court, Cabinet/executive desks, party/caucus workspaces, and election calendars remain serious public records with lawful actions and readable procedure (consistent with `UI_SYSTEM_V6.md`).
- **Political-game presentation:** Identity and stakes lead; campaigns are trails; election night is a progressive spectacle; maps and chambers are command surfaces; cards and tables are tools for sorting power, not the aesthetic.
- **Single-player / Lorsain world:** Fiction-first branding (Lorsain / Terena parties, provinces, institutions). No competitor chrome, no US election-night cosplay as the default skin.
- **Presentation bar:** Dense enough for legislation and roll calls; dramatic enough that winning a race or passing a bill *feels* like politics on screen.

**One-line brief:** *Govern with institutional clarity; campaign and election night with political theater — both in Lorsain’s own visual language.*

---

## Suggested next steps (non-blocking)

1. Fill concrete values in `docs/design/final-ui-tokens.md`.
2. Wireframe election night and campaign trail against the structural lessons above (no competitor screenshots in-repo).
3. Audit current shell: identity-before-stats, drawer nav at tablet widths, confirmation scope.
