# Final redesign — page inventory

Source of truth: `apps/game/src` at HEAD `fbc58f5`.  
Inventoried from `App.tsx` modes, `pages.tsx` `Screen` + `GamePages`, `ui/shell.tsx` `NAV_GROUPS`, `*Screen.tsx` / scenario studio, and in-shell overlays.  
Do not treat dead `_Archive` in `pages.tsx` as live UI — hash/nav `archive` routes to `HistoryPage`.

**Breakpoint / visual QA columns:** blank until audited.  
**Redesign status:** `PENDING` for all user-facing surfaces.

---

## Master inventory

| id | route/screen | major tabs | archetype suggestion | desktop | tablet | phone | redesign status | visual QA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| meta-title | `mode:title` (no hash) | — | meta | | | | PENDING | |
| meta-new-game | `mode:select` | Featured starts · Full roster (filters/pagination) | meta | | | | PENDING | |
| meta-load | `mode:load` | Saved careers grid · Import save | meta | | | | PENDING | |
| meta-settings-title | `mode:settings` | Same as Settings sections (below) | meta | | | | PENDING | |
| meta-error | `error` card | — | meta | | | | PENDING | |
| meta-loading | Loading Terena… | — | meta | | | | PENDING | |
| studio-hub | `mode:scenarioStudio` | Quick Build · Blank document · Import JSON | editor | | | | PENDING | |
| studio-quick-build | Scenario Studio → Quick Build wizard | Country / start / gov form / seats / provinces / parties / electoral preset | editor | | | | PENDING | |
| studio-import | `mode:importScenario` | pick → summary (errors / warnings / suggestions) | editor | | | | PENDING | |
| studio-editor | `mode:scenarioEditor` | See **Scenario Studio tabs** | editor | | | | PENDING | |
| studio-custom-select | `mode:customSelect` | Politician roster for imported/custom scenario | meta | | | | PENDING | |
| play-home | `#/home` · nav Home | Briefing / inbox surface; DecisionPanel on Home | political-command | | | | PENDING | |
| play-career | `#/career` · nav Career | Political opportunities · Overview · Career · Positions · Public record · Politicians · Compare · Figures to watch | entity-profile | | | | PENDING | |
| play-office | `#/office` · nav Office (role-labeled) | Role variants (not TabBar): Governor · Provincial Assembly member · President · Speaker · Assembly member · Constitutional Court justice · Minister/Mayor limited · Private citizen | political-command | | | | PENDING | |
| play-campaign | `#/campaign` · nav Campaign HQ | Strategic HQ + map layers (Forecast · Polling · Ground Game · Previous); scale Provinces/Constituencies; action drawers | political-command | | | | PENDING | |
| play-settings | `#/settings` · nav Settings | See **Settings sections** | meta | | | | PENDING | |
| play-assembly | `#/assembly` · nav Assembly | Overview · Legislation · Committees · Delegation | procedural | | | | PENDING | |
| play-assembly-legislation | Assembly → Legislation | Bills · Introduce (MP) · Votes · Statutes (+ ConstitutionBrowser) | procedural | | | | PENDING | |
| play-assembly-bill | Assembly → bill dossier | Overview · Provisions · Amendments · Support · Procedure · History | procedural | | | | PENDING | |
| play-assembly-constitutional | Assembly → constitutional amendment dossier | Overview · Support · Procedure · History | procedural | | | | PENDING | |
| play-elections | `#/elections` · nav Elections | Presidential · National Assembly · Provincial Assemblies · Governors · Internal Elections · Political Calendar | procedural | | | | PENDING | |
| play-election-night | Elections → Election Night workspace | Live/replay count UI (speed controls, event log, map) | map | | | | PENDING | |
| play-party | `#/party` · nav Parties | Overview · Leadership · Caucuses · Platform · Organization · History | entity-profile | | | | PENDING | |
| play-executive | `#/executive` · nav Government | Overview · Form a government (when hung) · Executive · Cabinet · Agenda · Implementation · Budget | political-command | | | | PENDING | |
| play-executive-formation | Government → Form a government | FormGovernmentWorkspace (partners · priorities · red lines · cabinet draft) | negotiation | | | | PENDING | |
| play-executive-minister | Government → Cabinet minister dossier | Overview · Implementation · Policy · Legislation · Budget | entity-profile | | | | PENDING | |
| play-courts | `#/courts` · nav Law & Constitution | Bench · Nominations/confirmation · Docket · Decisions · Impeachment/recall (section layout, no TabBar) | procedural | | | | PENDING | |
| play-economy | `#/economy` · nav Economy | Indicator tabs: Output · Employment · Prices · Wages · Housing · Confidence; regional table/map | map | | | | PENDING | |
| play-situation | `#/situation` · nav Situation Room | Political · Economy (province map + dossier) | map | | | | PENDING | |
| play-terena | `#/terena` · nav Provinces | Political · Election · Campaign · Economy | map | | | | PENDING | |
| play-foreign | `#/foreign` · nav Foreign Affairs | Overview · Relations · Treaties · Trade · Security · Crises · History | political-command | | | | PENDING | |
| play-organizations | `#/organizations` · nav Organizations | Org list + selected entity profile/actions (no TabBar) | entity-profile | | | | PENDING | |
| play-news | `#/news` · nav News | all · politics · elections · government · economy · courts · organizations · foreign | editorial | | | | PENDING | |
| play-archive | `#/archive` · nav History | Years · Long-term · Elections · People · Parties · Caucuses · Provinces · Acts · Court cases · Constitution · Foreign affairs | editorial | | | | PENDING | |
| overlay-nav-drawer | Shell nav drawer (mobile/tablet) | NAV_GROUPS: Politics · Elections · Institutions · World · Record · Meta | meta | | | | PENDING | |
| overlay-attention | Shell Attention / Political inbox | Categorized required/upcoming items | meta | | | | PENDING | |
| overlay-briefing | Shell “This turn” briefing | Since-last-turn event list | meta | | | | PENDING | |
| overlay-inspector | Shell entity inspector | Focused Politician/Party/Bill/Law/Province/Court case facts | entity-profile | | | | PENDING | |
| overlay-month-summary | Month summary drawer | Post-turn monthly briefing | meta | | | | PENDING | |
| overlay-search | Command palette (Ctrl+K) | Global search + watchlist toggles | meta | | | | PENDING | |
| overlay-utility | Topbar ⋮ utility menu | Save game · Export save | meta | | | | PENDING | |
| overlay-mobile-command | Bottom rail (≤1279px) | Home · Assembly · Government · Elections · More | meta | | | | PENDING | |
| overlay-map-detail | PoliticalMapWorkspace detail drawer | Selected province/constituency dossier on maps | map | | | | PENDING | |
| overlay-campaign-actions | Campaign HQ ActionDrawer | Visit · Organize · Advertise · Message · Attack · Activate GOTV · Endorsement | negotiation | | | | PENDING | |
| overlay-confirm | Feedback confirm modal | Irreversible action confirmation | meta | | | | PENDING | |
| overlay-notice | Feedback notice toast/banner | Command result notices | meta | | | | PENDING | |
| overlay-tutorial | TutorialCoach | First-use lesson coach (dialog) | meta | | | | PENDING | |
| overlay-decisions | DecisionPanel (Home / Office) | Required player decisions / election resolve | procedural | | | | PENDING | |
| overlay-busy | Shell busy state | Turn / count processing status | meta | | | | PENDING | |

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

Editor (`ScenarioStudioScreen` / `STUDIO_TABS` in `scenario/studio/navigation.ts`):

| id | label | archetype | redesign status |
| --- | --- | --- | --- |
| overview | Overview | editor | PENDING |
| constitution | Constitution | editor | PENDING |
| geography | Geography | editor | PENDING |
| parties | Parties | editor | PENDING |
| people | People | editor | PENDING |
| government | Government | editor | PENDING |
| elections | Elections | editor | PENDING |
| laws | Laws | editor | PENDING |
| organizations | Organizations | editor | PENDING |
| foreign | Foreign Affairs | editor | PENDING |
| validation | Validation | editor | PENDING |
| packs | Content Packs | editor | PENDING |

Hub entry surfaces (not editor tabs): **Quick Build**, **Blank document**, **Import JSON**; Import flow phases **pick** / **summary**.

---

## Settings sections

`SettingsPage` (`settingsScreen.tsx`) — available from title `mode:settings` and in-play `#/settings`:

| id | label | contents (summary) | redesign status |
| --- | --- | --- | --- |
| game | Game | Tutorial Mode · Reset tutorial · Autosave · Confirm major actions | PENDING |
| interface | Interface | Compact density · Glossary | PENDING |
| notifications | Notifications | Category toggles (`NOTIFICATION_CATEGORIES`) | PENDING |
| accessibility | Accessibility | Reduced motion · High contrast | PENDING |
| advanced | Advanced | Debug Mode · schema/version badge | PENDING |

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
| Named nested page/tab surfaces in master table (assembly/legislation/bill/constitutional, election-night, formation, minister) | **7** |
| Shell / global overlays in master table | **13** |
| Settings sections | **5** |
| **Master inventory rows (table above)** | **55** |
| **Distinct user-facing navigable surfaces (modes + play screens + studio hub/import/editor + major overlays, excluding duplicate nested detail tabs counted only once under parents)** | **~48** |

**Short summary:** **17** in-play screens, **12** Scenario Studio editor tabs, **5** Settings sections, **13** shell/global overlays, plus **7** pre-play meta modes and **4** Scenario Studio entry/edit surfaces — **55** master inventory rows; redesign status **PENDING** for all.
