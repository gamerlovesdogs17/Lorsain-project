# Final redesign — page inventory

Source of truth: `apps/game/src` at HEAD `11314a8` **correction pass** (compact PPUSA-inspired density CSS; Assembly Control / Majority / Government-aligned terminology).  
Inventoried from `App.tsx` modes, `pages.tsx` `Screen` + `GamePages`, `ui/shell.tsx` `NAV_GROUPS`, `*Screen.tsx` / scenario studio, and in-shell overlays.  
Do not treat dead `_Archive` in `pages.tsx` as live UI — hash/nav `archive` routes to `HistoryPage`.

**Breakpoint / visual QA columns:** blank until audited.  
**Redesign status:** every entry resolved — `PENDING` = **0**.

Status vocabulary (exactly one per entry):

| Status | Meaning |
| --- | --- |
| `REDESIGNED` | Phase 19 desk / shell / editor-workspace treatment applied (plus correction-pass density) |
| `VERIFIED — NO CHANGE REQUIRED` | Intentional surface; keep as-is (short reason required) |
| `PARTIAL — BLOCKER DOCUMENTED` | Incomplete; blocker must be named |

---

## Master inventory

| id | route/screen | major tabs | archetype suggestion | desktop | tablet | phone | redesign status | visual QA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| meta-title | `mode:title` (no hash) | — | meta | | | | VERIFIED — NO CHANGE REQUIRED — pre-play meta; not a political desk | |
| meta-new-game | `mode:select` | Featured starts · Full roster (filters/pagination) | meta | | | | VERIFIED — NO CHANGE REQUIRED — pre-play meta; not a political desk | |
| meta-load | `mode:load` | Saved careers grid · Import save | meta | | | | VERIFIED — NO CHANGE REQUIRED — pre-play meta; not a political desk | |
| meta-settings-title | `mode:settings` | Same as Settings sections (below) | meta | | | | REDESIGNED | |
| meta-error | `error` card | — | meta | | | | VERIFIED — NO CHANGE REQUIRED — system chrome; keep minimal | |
| meta-loading | Loading Terena… | — | meta | | | | VERIFIED — NO CHANGE REQUIRED — system chrome; keep minimal | |
| studio-hub | `mode:scenarioStudio` | Quick Build · Blank document · Import JSON | editor | | | | REDESIGNED | |
| studio-quick-build | Scenario Studio → Quick Build wizard | Country / start / gov form / seats / provinces / parties / electoral preset | editor | | | | REDESIGNED | |
| studio-import | `mode:importScenario` | pick → summary (errors / warnings / suggestions) | editor | | | | REDESIGNED | |
| studio-editor | `mode:scenarioEditor` | See **Scenario Studio tabs** | editor | | | | REDESIGNED | |
| studio-custom-select | `mode:customSelect` | Politician roster for imported/custom scenario | meta | | | | VERIFIED — NO CHANGE REQUIRED — pre-play meta; not a political desk | |
| play-home | `#/home` · nav Home | Briefing / inbox surface; DecisionPanel on Home | political-command | | | | REDESIGNED | |
| play-career | `#/career` · nav Career | Political opportunities · Overview · Career · Positions · Public record · Politicians · Compare · Figures to watch | entity-profile | | | | REDESIGNED | |
| play-office | `#/office` · nav Office (role-labeled) | Role variants (not TabBar): Governor · Provincial Assembly member · President · Speaker · Assembly member · Constitutional Court justice · Minister/Mayor limited · Private citizen | political-command | | | | REDESIGNED | |
| play-campaign | `#/campaign` · nav Campaign HQ | Strategic HQ + map layers (Forecast · Polling · Ground Game · Previous); scale Provinces/Constituencies; action drawers | political-command | | | | REDESIGNED | |
| play-settings | `#/settings` · nav Settings | See **Settings sections** | meta | | | | REDESIGNED | |
| play-assembly | `#/assembly` · nav Assembly | Overview · Legislation · Committees · Delegation | procedural | | | | REDESIGNED | |
| play-assembly-legislation | Assembly → Legislation | Bills · Introduce (MP) · Votes · Statutes (+ ConstitutionBrowser) | procedural | | | | REDESIGNED | |
| play-assembly-bill | Assembly → bill dossier | Overview · Provisions · Amendments · Support · Procedure · History | procedural | | | | REDESIGNED | |
| play-assembly-constitutional | Assembly → constitutional amendment dossier | Overview · Support · Procedure · History | procedural | | | | REDESIGNED | |
| play-elections | `#/elections` · nav Elections | Presidential · National Assembly · Provincial Assemblies · Governors · Internal Elections · Political Calendar | procedural | | | | REDESIGNED | |
| play-election-night | Elections → Election Night workspace | Live/replay count UI (speed controls, event log, map) | map | | | | REDESIGNED | |
| play-party | `#/party` · nav Parties | Overview · Leadership · Caucuses · Platform · Organization · History | entity-profile | | | | REDESIGNED | |
| play-executive | `#/executive` · nav Government | Overview · Form a government (when hung) · Executive · Cabinet · Agenda · Implementation · Budget | political-command | | | | REDESIGNED | |
| play-executive-formation | Government → Form a government | FormGovernmentWorkspace (partners · priorities · red lines · cabinet draft) | negotiation | | | | REDESIGNED | |
| play-executive-minister | Government → Cabinet minister dossier | Overview · Implementation · Policy · Legislation · Budget | entity-profile | | | | REDESIGNED | |
| play-courts | `#/courts` · nav Law & Constitution | Bench · Nominations/confirmation · Docket · Decisions · Impeachment/recall (section layout, no TabBar) | procedural | | | | REDESIGNED | |
| play-economy | `#/economy` · nav Economy | Indicator tabs: Output · Employment · Prices · Wages · Housing · Confidence; regional table/map | map | | | | REDESIGNED | |
| play-situation | `#/situation` · nav Situation Room | Political · Economy (province map + dossier) | map | | | | REDESIGNED | |
| play-terena | `#/terena` · nav Provinces | Political · Election · Campaign · Economy | map | | | | REDESIGNED | |
| play-foreign | `#/foreign` · nav Foreign Affairs | Overview · Relations · Treaties · Trade · Security · Crises · History | political-command | | | | REDESIGNED | |
| play-organizations | `#/organizations` · nav Organizations | Org list + selected entity profile/actions (no TabBar) | entity-profile | | | | REDESIGNED | |
| play-news | `#/news` · nav News | all · politics · elections · government · economy · courts · organizations · foreign | editorial | | | | REDESIGNED | |
| play-archive | `#/archive` · nav History | Years · Long-term · Elections · People · Parties · Caucuses · Provinces · Acts · Court cases · Constitution · Foreign affairs | editorial | | | | REDESIGNED | |
| overlay-nav-drawer | Shell nav drawer (mobile/tablet) | NAV_GROUPS: Politics · Elections · Institutions · World · Record · Meta | meta | | | | REDESIGNED | |
| overlay-attention | Shell Attention / Political inbox | Categorized required/upcoming items | meta | | | | REDESIGNED | |
| overlay-briefing | Shell “This turn” briefing | Since-last-turn event list | meta | | | | REDESIGNED | |
| overlay-inspector | Shell entity inspector | Focused Politician/Party/Bill/Law/Province/Court case facts | entity-profile | | | | REDESIGNED | |
| overlay-month-summary | Month summary drawer | Post-turn monthly briefing | meta | | | | REDESIGNED | |
| overlay-search | Command palette (Ctrl+K) | Global search + watchlist toggles | meta | | | | REDESIGNED | |
| overlay-utility | Topbar ⋮ utility menu | Save game · Export save | meta | | | | REDESIGNED | |
| overlay-mobile-command | Bottom rail (≤1279px) | Home · Assembly · Government · Elections · More | meta | | | | REDESIGNED | |
| overlay-map-detail | PoliticalMapWorkspace detail drawer | Selected province/constituency dossier on maps | map | | | | REDESIGNED | |
| overlay-campaign-actions | Campaign HQ ActionDrawer | Visit · Organize · Advertise · Message · Attack · Activate GOTV · Endorsement | negotiation | | | | REDESIGNED | |
| overlay-confirm | Feedback confirm modal | Irreversible action confirmation | meta | | | | VERIFIED — NO CHANGE REQUIRED — system chrome; keep minimal | |
| overlay-notice | Feedback notice toast/banner | Command result notices | meta | | | | VERIFIED — NO CHANGE REQUIRED — system chrome; keep minimal | |
| overlay-tutorial | TutorialCoach | First-use lesson coach (dialog) | meta | | | | VERIFIED — NO CHANGE REQUIRED — optional first-use coach; must stay bounded | |
| overlay-decisions | DecisionPanel (Home / Office) | Required player decisions / election resolve | procedural | | | | REDESIGNED | |
| overlay-busy | Shell busy state | Turn / count processing status | meta | | | | VERIFIED — NO CHANGE REQUIRED — system chrome; keep minimal | |

---

## In-game nav (shell)

From `NAV_GROUPS` in `ui/shell.tsx` (hash `#/<Screen>` while `mode:play`):

| Group | Screens |
| --- | --- |
| Politics | home, party, assembly, executive |
| Elections | elections, campaign |
| Institutions | courts, terena |
| World | economy, organizations, foreign, situation |
| Record | news, archive |
| Meta | career, office, settings |

Bottom rail (narrow): home, assembly, executive, elections, more (opens drawer).

`Screen` union also matches `QA_SCREENS` / `routeFromHash` in `App.tsx`. Entity deep-links: `#/<screen>/<kind>/<id>` (politician, party, caucus, province, constituency, election, bill, organization, court-case).

---

## Scenario Studio tabs

Editor (`ScenarioStudioScreen` / `STUDIO_TABS` in `scenario/studio/navigation.ts`) — shell class `scenario-editor studio-shell editor-workspace scenario-studio-final`:

| id | label | archetype | redesign status |
| --- | --- | --- | --- |
| overview | Overview | editor | REDESIGNED |
| constitution | Constitution | editor | REDESIGNED |
| geography | Geography | editor | REDESIGNED |
| parties | Parties | editor | REDESIGNED |
| people | People | editor | REDESIGNED |
| government | Government | editor | REDESIGNED |
| elections | Elections | editor | REDESIGNED |
| laws | Laws | editor | REDESIGNED |
| organizations | Organizations | editor | REDESIGNED |
| foreign | Foreign Affairs | editor | REDESIGNED |
| validation | Validation | editor | REDESIGNED |
| packs | Content Packs | editor | REDESIGNED |

Hub entry surfaces (not editor tabs): **Quick Build**, **Blank document**, **Import JSON**; Import flow phases **pick** / **summary**.

---

## Settings sections

`SettingsPage` (`settingsScreen.tsx`) — available from title `mode:settings` and in-play `#/settings`:

| id | label | contents (summary) | redesign status |
| --- | --- | --- | --- |
| game | Game | Tutorial Mode · Reset tutorial · Autosave · Confirm major actions | REDESIGNED |
| interface | Interface | Compact density · Glossary | REDESIGNED |
| notifications | Notifications | Category toggles (`NOTIFICATION_CATEGORIES`) | REDESIGNED |
| accessibility | Accessibility | Reduced motion · High contrast | REDESIGNED |
| advanced | Advanced | Debug Mode · schema/version badge | REDESIGNED |

---

## Nested workspaces (not separate routes)

Documented here so redesign does not miss them; they nest under parent screens above.

| Parent | Workspace | Notes |
| --- | --- | --- |
| Assembly → Statutes | `ConstitutionBrowser` | Constitution reading / amendment package UI |
| Government → Formation | `FormGovernmentWorkspace` | Coalition / cabinet formation |
| Elections (live/certified) | `ElectionNight` / `ElectionNightReplay` | Night workspace + history replay |
| Campaign HQ | Action drawers + map layers | See overlay + campaign rows |
| Maps (Terena / Situation / Economy / Foreign / Elections) | `PoliticalMapWorkspace` / `TerenaMap` / `WorldMap` | Detail drawer pattern |

---

## Counts (source-exhaustive)

| Category | Count |
| --- | --- |
| Pre-play / meta modes (title, select, load, settings-title, error, loading, custom-select) | **7** |
| Scenario Studio surfaces (hub, quick-build, import, editor) | **4** |
| Scenario Studio editor tabs | **12** |
| In-play `Screen` routes (incl. archive→History, settings) | **17** |
| Named nested page/tab surfaces in master table (assembly/legislation/bill/constitutional, election-night, formation, minister) | **6** |
| Shell / global overlays in master table | **15** |
| Settings sections | **5** |
| **Master inventory rows (table above)** | **49** |
| **Distinct user-facing navigable surfaces (modes + play screens + studio hub/import/editor + major overlays, excluding duplicate nested detail tabs counted only once under parents)** | **~43** |
| **Status-bearing rows (master + Studio tabs + Settings sections)** | **66** |

### Redesign status totals (all status-bearing rows)

| Status | Count |
| --- | --- |
| **REDESIGNED** | **56** |
| **VERIFIED — NO CHANGE REQUIRED** | **10** |
| **PARTIAL — BLOCKER DOCUMENTED** | **0** |
| **PENDING** | **0** |

**Short summary:** **17** in-play screens, **12** Scenario Studio editor tabs, **5** Settings sections, **15** shell/global overlays, plus **7** pre-play meta modes and **4** Scenario Studio entry/edit surfaces — **49** master inventory rows / **66** status-bearing rows. Correction pass at HEAD `11314a8`: **REDESIGNED: 56** · **VERIFIED — NO CHANGE REQUIRED: 10** · **PARTIAL: 0** · **PENDING: 0**.
