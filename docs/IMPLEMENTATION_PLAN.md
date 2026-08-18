# Full Implementation Plan

## 1. Recommended product shape

Build the game first as a **desktop-class web application**: React + TypeScript UI with a pure TypeScript simulation engine. Keep the simulation independent of React so it can later run in a Web Worker, Node test harness, server process or Tauri desktop wrapper without rewriting game rules.

Recommended stack:

- TypeScript 5+
- React 19 + Vite
- pure TypeScript simulation package
- Zod for content/save validation
- Dexie/IndexedDB for local save persistence
- Web Worker for turn simulation
- Zustand or equivalent for UI-only state; simulation state remains engine-owned
- SVG + lightweight D3 helpers for maps and charts
- Vitest for unit/property tests
- Playwright for end-to-end flows
- optional Tauri packaging after browser vertical slice is stable

Avoid requiring a backend for the initial single-player release. Save files should be exportable/importable JSON or compressed binary bundles.

## 2. Repository layout

```text
/apps/game/                 React UI (Vite copies runtime SVGs into app public/ at build)
/packages/sim/              deterministic simulation engine
/packages/content-schema/   Zod schemas + content types
/packages/content-loader/   manifest load + FK/ID validation
/packages/election-math/    institution-agnostic RCV/STV (Phase 0.5 — counting package)
/packages/map/              SVG/GeoJSON helpers
/packages/testing/          simulation harnesses, fixtures, metrics
/data/                      CANONICAL machine-readable content (authoritative paths)
/maps/                      runtime + reference SVGs at repo root
/scripts/                   content generation, validation, migrations
/docs/                      design/architecture documentation
```

Do not relocate canonical content into a separate `/content/` tree during bootstrap. Keep `data/` and `maps/` as the authority paths defined by `data/content_manifest.json`.

## 3. Architectural boundary

The simulation engine receives immutable content definitions plus a mutable save state. It returns deterministic events/state changes. React never directly mutates simulation entities.

Conceptually:

```text
Static Content + Save State + Player Commands + RNG Seed
                        ↓
                   Simulation Engine
                        ↓
             New State + Event/News Log
                        ↓
                   UI View Models
```

This separation is the most important technical decision in the project.

## 4. Content layer

All canonical world data should be schema-validated on startup and in CI. Use stable string IDs, never array positions, as foreign keys. The Azgaar source IDs remain only in the crosswalk files and migration tools. `data/content_manifest.json` defines authoritative files. `terena_geography.json` is a derived convenience summary rather than a second independent source of truth.

Content categories include countries, provinces, constituencies, cities, issues, parties, factions, offices, ministries, committees, organizations, media outlets, historical politicians, treaties, election rules, constitutional rules and scenario events already in progress on 1 January 2028.

## 5. Deterministic RNG

Create one simulation RNG service using **xoshiro128**** (four uint32 words; native JS bitwise ops). It supports named independent streams such as `elections`, `npc-decisions`, `campaigns`, `legislature`, `economy`, `foreign-affairs`, `health-life-events`, `scandals`, `flavor`, and `generation`. Streams prevent unrelated UI or flavor changes from changing election outcomes. Never use `Math.random()` in simulation logic.

Every stochastic event written to the history log records enough metadata in debug builds to reproduce it.

## 6. Simulation state model

Use normalized entity dictionaries keyed by stable IDs. Do not keep large circular class graphs. Entity methods belong in systems; state entities remain serializable plain data.

Top-level save state should include calendar, RNG state, politicians, relationships, parties/factions, organizations, offices/officeholders, elections, campaigns, legislature, bills, executive, courts, economy, countries/relations, media, event queue, history index and player character.

## 7. Web Worker

Turn simulation should run in a Web Worker as soon as the core engine is stable. The UI posts a compact command bundle and receives progress events plus the final turn result. This prevents a 1,000-NPC monthly turn from freezing the interface.

The worker must be optional in tests; the same engine should run synchronously in Node/Vitest.

## 8. Save architecture

Each save has a `schemaVersion`, `contentVersion`, scenario ID and deterministic RNG state. Create migrations from day one. Never silently discard unknown or old fields.

Recommended persistence model:

- current normalized state snapshot
- compressed major-event history
- election result archive
- optional annual snapshots for fast historical browsing

Do not store a full duplicate world snapshot every month.

## 9. Phase 0 — repository bootstrap

**COMPLETE (hardened).** Next dependency order:

- **Phase 0.5** — **COMPLETE** — `packages/election-math` (exact rationals, IRV, STV Droop+WIG, lots, fixtures)
- **Phase 0b** — **COMPLETE / CANONICAL** (`7e94984`) — 530 roster, 420 MPs, 2026 STV archive, voter blocs, pollsters, eligibility
- **Phase 1** — **COMPLETE** (`b158271`) — deterministic world kernel (calendar, offices/terms, scheduler, commands, save/load, worker protocol types)
- **Phase 1.1** — **COMPLETE** (`1c7b079`) — save/state integrity hardening (scheduler/history temporal rules, domain-block authenticity, world-aware resume)
- **Phase 2** — **COMPLETE (`c43c0fb`)** — politician agents, sparse relationships/memories/beliefs, deterministic goals, explainable decision engine
- **Phase 3** — **COMPLETE (`dc9ea2d`)** — parties, factions, leadership, endorsements, membership/defections, split foundation, presidential nomination systems
- **Phase 4** — **COMPLETE (`1352dc4`)** — electorate, underlying support, public standing, polling, turnout, formal general-election RCV/STV, domain resolution (nonblocking leftovers: `docs/KNOWN_ISSUES.md`)
- **Phase 5** — **COMPLETE (`e3a6aae`)** — campaign organizations, resources, actions, debates, NPC strategy, operational nomination calendar, nomination/general integration.
- **Phase 6** — **COMPLETE (`3c976fa`)** — Assembly sessions, functional committees, structured bills, amendments, votes, whip estimates, presidential return veto and 211-vote repassage. Stage timing guarantees the player a month to act before committee/floor/repassage tallies.
- **Phase 7** — **COMPLETE (`90b54d4`)** — executive government + first playable React UI.
- **Phase 7.1** — **COMPLETE (`670b38b`)** — first-playtest UX: no silently omitted player decisions, campaign/policy forms, human-readable presentation, Home briefing, canonical party colors, command feedback.
- **Phase 8** — **COMPLETE (`72733d4`)** — Constitutional Court, nomination/252 confirmation, judicial review, nonrenewable 12-year terms, impeachment 280 + Court judgment requiring a structured public basis, recall referral 252 + national vote.
- **Phase 9** — **COMPLETE** — political macroeconomy, canonical organizations/media, UI System V2, derived GeoJSON Terena map, schemaVersion 9.
- **Phase 9.5** — **COMPLETE** — UI System V3 playtest UX pass: grouped navigation, campaign command center, player-safe labels, map hover/click fix, responsive shell. See `docs/UI_SYSTEM_V3.md`.

Deliverables:

- monorepo/package structure
- TypeScript strict mode
- lint/format/test commands
- Zod content schemas
- loader for the supplied JSON/GeoJSON/SVG package
- scenario manifest for `TERENA_2028`
- deterministic RNG service with serialization test

Acceptance criteria: CI can load every content file, validate every ID reference and reproduce a known RNG sequence exactly.

## 9.5. Phase 0.5 — institution-agnostic election math

**COMPLETE.** Counting package ready for Phase 0b archive generation. Do not reimplement RCV/STV elsewhere.

## 9.6. Phase 0b — canonical starting world content

**COMPLETE / CANONICAL** at commit `7e94984`. Content version at canonization `0.3.0-predev`; calendar/office/succession patch `0.3.1-predev`. Fixed TERENA_2028 political world: **530** roster (420 MPs), 2026 Assembly STV archive (election-math), voter blocs, pollsters, approved presidential eligibility. Dev generators under `scripts/phase0b/`. Do not regenerate accepted political content.

## 10. Phase 1 — world kernel and clock

**COMPLETE (`b158271`).** `@lorsain/sim` provides a deterministic monthly-turn kernel. Phase 1.1 adds save/state integrity hardening without changing legitimate execution.

- Date-only Gregorian calendar (no host timezone / wall clock)
- Regular presidential election: second Saturday in October every 5 years, assume office 20 January following
- Regular Assembly election: second Sunday in May every 4 years, assume office 1 June following
- Normalized `SimState`, office definitions vs office terms, scheduler, commands, SimEvents, history
- Save schemaVersion **1** at Phase 1; **schemaVersion 2** from Phase 2 (v1→v2); **schemaVersion 3** from Phase 3 (v2→v3); **schemaVersion 4** from Phase 4 (v3→v4); **schemaVersion 5** from Phase 5 (v4→v5); **schemaVersion 6** from Phase 6 (v5→v6); **schemaVersion 7** from Phase 7 (v6→v7); **schemaVersion 8** from Phase 8 (v7→v8)
- Domain interrupts: unresolved political domain events (`requiresResolution`) cannot be skipped with `RESUME_TURN`
- Worker protocol **types** only (no Worker runtime dependency)

Acceptance criteria: synthetic 20-year save/reload hash match; TERENA_2028 advances until `PRESIDENTIAL_ELECTION_DUE` on 2028-10-14.

## 11. Phase 2 — politicians, relationships and goals

**COMPLETE (`c43c0fb`).** `@lorsain/sim` politician-brain substrate (`packages/sim/src/agents/`).

- One politician type; the player is identified only by `playerPoliticianId`. NPC planners do not choose actions for that ID.
- No runtime LLM. Structured causes/results are authoritative; prose is not.
- **Hidden truth vs beliefs:** an actor's true `AgentProfile` is simulation truth. Other politicians hold sparse beliefs. The decision engine receives `DecisionActorContext` (own profile, own goals/relationships/beliefs, public facts), never another politician's hidden profile.
- **Static vs save-owned profiles:** `KernelWorld.agentProfiles` holds the 530 canonical starting profiles. `SimState.generatedAgentProfiles` is empty and reserved for future post-2028 generated politicians; those IDs must not collide with canonical profiles. `getAgentProfile(world, state, id)` uses the canonical profile when present, otherwise the save-owned generated profile, then sparse `agentProfileOverrides`.
- **Directional sparse relationships** (−1..+1 affinity/trust/respect). Missing edges are neutral. No 530×530 matrix. Lazy exponential decay toward 0; no monthly O(N²) sweep.
- **Subjective political memories** with durability classes, lazy effective-salience decay, and tier caps. Global history remains `SimEvent`.
- **Sparse beliefs** updated by observations with a documented weighted rule. Confidence staleness is lazy. Low confidence does not reveal truth.
- **Deterministic initial goals** from offices, traits, roles, salience, age, and authored presidential status. No RNG. AI tier caps active goals (rich 5 / standard 3 / light 2).
- **Domain-agnostic utility engine:** later domains supply `DecisionOption`s keyed to specific active goal IDs; Phase 2 ranks them with trait-weighted signals and a structured breakdown. Bounded `npc-decisions` noise only. Reordering valid unique-id options does not change the choice.
- Save **schemaVersion 2**. v1 saves migrate with empty cognitive history, then `restoreSimulation` seeds deterministic goals. Documented as: Phase 1 saves begin Phase 2 cognitive history at migration/load because that state did not exist previously.

Acceptance criteria for this phase: required relationship/memory/belief/goal/decision/player-autonomy/save tests in `@lorsain/sim`.

## 12. Phase 3 — parties, factions and nominations

**COMPLETE (`dc9ea2d`).** Party institutions live in `packages/sim/src/parties/`. Membership authority is `PoliticianRuntime.partyId` / `factionId` (no persisted member arrays). `PARTY_IND` is a statistical aggregate, never a membership party. Runtime leadership is `PartyState.leaderId` / `FactionState.chairId`, not `AgentProfile.roleTypes` and not office terms. Starting 2028 presidential contests are **planned**, not auto-resolved on monthly turns.

Each 2028 party nomination method is a rule module that builds a compact selectorate and always counts through `@lorsain/election-math` `countIrv`. Save **schemaVersion 3**; v2 saves migrate with empty party structs, then `restoreSimulation` seeds canonical institutions when `partyStates` are empty.

Acceptance criteria: 1,000 automated party leadership contests respond to faction size and endorsements without collapsing into pure noise or a single-faction lock.

## 13. Phase 4 — electorate, polling, and formal general elections

**COMPLETE (`1352dc4`).** Public-electorate domain in `packages/sim/src/elections/`. This is **not** campaign simulation.

Layering:

- Phase 2: politician minds (hidden `AgentProfile`)
- Phase 3: party/faction selectorates and nominations
- Phase 4: voters, underlying support, public standing, polls, turnout, formal general elections (**COMPLETE `1352dc4`**)
- Phase 5: campaign actions that **change** public standing/support (**COMPLETE `e3a6aae`**)
- Phase 6: legislature — **COMPLETE (`3c976fa`)**
- Phase 7: executive + playable UI — **COMPLETE (`90b54d4`)**
- Phase 7.1: first playtest UX — **COMPLETE**
- Phase 8: courts + constitutional system
- Phase 9: economy + organizations + media
- Phase 10: foreign affairs
- Phase 11: final integration + UI polish + balance + content

`KernelWorld` holds immutable voter blocs, pollster definitions, issue→ideology dimensions, constituency population, and compact 2026 turnout priors. `SimState` holds only mutable electoral objects: sparse environment shifts, lazy public candidate standing, `ElectionState`, `PollRecord`s, `DomainResolutionRecord`s. Canonical voter-bloc JSON is **not** copied into saves.

Voters use **public** political information (party/faction culture, offices, standing, environment). They do not read hidden ambition, integrity, ego, private ideology, campaigning/media skill, private goals, or private relationships. Polls are noisy observations of latent support (`campaigns` RNG stream), not truth. Formal IRV/STV counts call `@lorsain/election-math` and archive exact ballot groups, weights, rankings, and lot draws.

Save **schemaVersion 4**; v3→v4 migration adds empty electoral structs. `restoreSimulation` seeds canonical `ELEC_PRES_2028` / `ELEC_ASM_2030` when electorate content is present and `elections` is empty. TERENA_2028 starts with an unfinalized 2028 presidential field and empty poll history. A regular winner is certified as president-elect immediately; assumption of office is 2029-01-20.

Acceptance criteria: 10,000 synthetic general-election cases remain legal; poll means approach latent+house-effect; presidential IRV and Assembly STV archives replay; v3→v4 migration is deterministic; Phase 0b content is unchanged.

## 14. Phase 5 — campaign actions (COMPLETE)

Persistent `SimState.campaignRuntime` is separate from `PartyContest` and `ElectionState`. Campaigns belong to existing politicians (`CAMP…` / `DEBATE…` IDs from counters, not RNG). Types: `presidential_nomination`, `presidential_general`, `assembly`. Resources are aggregates (`cashOnHand`, `totalRaised`, `totalSpent`, capacities, sparse `organizationByConstituency`). No campaign debt. No individual donors/PACs.

Player commands (`DECLARE_CAMPAIGN`, `CAMPAIGN_FUNDRAISE`, `CAMPAIGN_VISIT`, `CAMPAIGN_ORGANIZE`, `CAMPAIGN_ADVERTISE`, `CAMPAIGN_MESSAGE`, `CAMPAIGN_ATTACK`, `CAMPAIGN_SEEK_ENDORSEMENT`, `CAMPAIGN_SEEK_NOMINATION_SUPPORT`, `CAMPAIGN_PREPARE_DEBATE`, `WITHDRAW_CAMPAIGN`) are explicit. The engine never autonomously chooses those actions for `playerPoliticianId`. NPCs use the Phase 2 decision engine with public polls/standing/endorsements/resources — not latent Phase 4 support and not another candidate's hidden `AgentProfile`. Monthly processing uses a small action-point budget. Effects are bounded with diminishing returns and centralized momentum decay.

A centralized operational nomination calendar (derived from the presidential election date, not constitutional canon) opens membership-party contests, closes qualification using real Phase 3 evidence (member/provincial milestones, NU caucus endorsements, PM provincial-org endorsements, Civic Reform declared-eligible), resolves via `resolvePartyContest` / `countIrv` (including a single qualified candidate), and finalizes the presidential field when at least two live nominees exist. Attacks, contrast/negative ads, and NPC rival targeting are race-scoped (same contest, same general election, or same assembly constituency). Field organization applies a small candidate-specific mobilization factor during ballot realization; it does not add the same turnout bonus to every candidate. Nomination selectorates use standing plus that contest's polls only.

Causal chain: campaign action → public standing/org/cash → Phase 4 underlying support → polls observe → NPCs react. Polls are never edited directly. Phase 3 selectorates still run; campaign standing is an additional public signal. Nomination winners transition into linked `presidential_general` campaigns, inheriting cash/org. Withdrawal reconciles contest entries and unresolved election candidacies. Debates produce political effects, not transcripts. Player may appear in a scheduled debate; the engine does not choose their strategy or prep.

`presidentialStatus` is scenario-start metadata only: materialized once into public standing at TERENA_2028 init. Future standing comes from runtime history/campaigns.

Save **schemaVersion 5**; v4→v5 adds empty campaign runtime and `nextCampaignId` / `nextDebateId`. No fabricated campaign history. `contentVersion` remains `0.3.1-predev`. 20-year synthetic kernel hash at Phase 5 close: `d719f8693a6e3e532f9095e9c2e753d3`.

From Phase 5 onward: fix **BLOCKING** issues (legitimate gameplay, save corruption, determinism, invalid election/campaign math, vertical-slice breakage). Record **NONBLOCKING** hostile-save / future-cycle / docs gaps in `docs/KNOWN_ISSUES.md` and continue.

Acceptance criteria: zero-DEV 2028 nomination+general path reaches October IRV and January assumption; player loss is not game-over; spending cannot exceed funds; cross-race attacks reject unchanged; deterministic save/restore mid-campaign; Phase 0b content unchanged.

## 15. Phase 6 — legislature (COMPLETE)

Runtime Assembly lives in `packages/sim/src/legislature/` as `SimState.legislatureRuntime`. Membership is derived from current `assembly_member` terms (not a copied roster). Five functional committees map issue dimensions. Bills carry structured `PolicyItem`s. **Stage timing is backend-guaranteed:** month N introduce (visible), month N+1 or later committee tally, month N+2 or later floor tally if committee passed; returned bills wait a month before repassage. `CAST_LEGISLATIVE_VOTE` is `{ billId, stage, choice, amendmentId? }` (`committee` | `floor` | `repassage`); pending choices cannot cross stages. Proposed amendments are voted (ordinary majority of votes cast, tie fails) before the parent bill leaves that stage. Ordinary committee/floor votes use simple majority of votes cast (tie fails). After a suspensive presidential return, repassage uses `KernelWorld.legislativeConstitution.assemblyAbsoluteMajority` from `terena_constitution.json` (**211** for Terena's authorized 420 seats). Vacancies do not shrink that denominator. Synthetic/harness worlds supply their own constitutional pair (harness: 36/19). Player never auto-sponsors, auto-votes, or auto-signs; uncast player votes are **ABSTAIN**. NPC votes are individual Phase 2 decisions. Speaker political queue sort is NPC-only; player Speaker keeps clerical FIFO unless they issue `SCHEDULE_BILL` / `DELAY_BILL`.

Save **schemaVersion 6**; v5→v6 adds empty legislature runtime and `nextBillId` / `nextAmendmentId` / `nextLegislativeVoteId` / `nextLawId`. No fabricated bills. `contentVersion` remains `0.3.1-predev`. 20-year synthetic kernel hash at Phase 6 close: `c98484fa46cfa98358742cf4d73f018d` (changed from Phase 5 `d719f8693a6e3e532f9095e9c2e753d3` because schema 6 adds empty legislature fields).

Acceptance criteria: an autonomous Assembly can introduce, committee, negotiate and pass/fail bills for four simulated years; coalition patterns differ by issue instead of producing one permanent government/opposition split. Player autonomy and constitutional 211-vote suspensive-veto override hold.

## 16. Phase 7 — executive + playable UI (COMPLETE)

Merged former “Phase 6.5 playable UI” and executive/ministry simulation.

**Executive kernel** lives in `packages/sim/src/executive/` as `SimState.executiveRuntime`. Cabinet holders are derived from active minister `OfficeTerm`s (12 canonical offices in `terena_offices.json`); ministries store only lightweight `administrativeCapacity` / `currentPriorities`. Commands: `APPOINT_MINISTER`, `DISMISS_MINISTER`, `ISSUE_REGULATION`, `INTRODUCE_MOTION`, `CAST_MOTION_VOTE`, `PROPOSE_BUDGET`, `DECLARE_EMERGENCY`, `BEGIN_WAR_POWERS`. Presidential powers use `currentPresidentialAuthorityId` (substantive, else acting). Player President is never auto-appointed, dismissed, regulated, budgeted, or put into emergency/war. NPC President uses Phase 2 on stream `legislature`. Assembly motions (`ministerial_censure`, `regulation_annulment`, `budget_approval`, `emergency_extension`, `emergency_termination`, `war_authorization`) use the same stage-safe month delay as bills. Censure uses authorized seat count × 0.55 (Terena **231** of 420). Regulation annulment uses documented simple majority of votes cast (tie fails), not quoted as constitutional canon. Budget is a calendar-year cycle with continuing appropriation if late — no shutdown. Emergencies/wars are not randomly generated; tests arm `emergencyTrigger` / `warTrigger`.

Save **schemaVersion 7**; v6→v7 adds empty executive runtime and `nextRegulationId` / `nextMotionId` / `nextEmergencyId` / `nextWarPowerId` / `nextBudgetId`. No fabricated past executive actions. `contentVersion` remains `0.3.1-predev`. 20-year synthetic kernel hash: `58c049dad4ca4b020941da51854bd889` (changed from Phase 6 `c98484fa46cfa98358742cf4d73f018d` because schema 7 adds empty executive fields).

**Playable UI** is `apps/game`: React 19 + Vite, consuming `@lorsain/sim` only through commands. Launch with `pnpm game` or `start-game.bat`. Browser content loading uses `import.meta.glob` over canonical `data/` and `maps/`. IndexedDB (Dexie) stores serialized `SaveFile`s. Screens: title/New Game/Load, politician select, Home, Career, Assembly (including a 420-seat chamber from live membership), Party, Campaign, Elections (IRV rounds), Executive, Courts, Terena map, Archive. Role-aware actions. Hidden traits/skills/private goals are not shown in normal UI.

Web Worker turn processing is deferred to Phase 11 if still needed.

## 17. Phase 8 — courts and constitution

**COMPLETE.** Runtime Constitutional Court lives in `packages/sim/src/courts/` as `SimState.constitutionalRuntime`. Membership is **derived** from active `constitutional_court_justice` `OfficeTerm`s (nine canonical seats). There is no duplicate nine-person roster. Terms are 12-year; `KernelWorld.courtConstitution.renewable` is loaded from `terena_constitution.json` (false for Terena). When `renewable === false`, any politician who has ever held a substantive Constitutional Court `OfficeTerm` (active or ended, any seat) is ineligible (`COURT_TERM_NONRENEWABLE`). Vacancies create `awaiting_nomination` slots. `NOMINATE_CONSTITUTIONAL_JUDGE` is player-President only when the player holds the office; NPC Presidents nominate through Phase 2 using their own hidden profile and public facts about the nominee. Assembly confirmation is **252 YES** of the authorized 420-seat Assembly (`ceil(420 * 0.6)`). Impeachment is **280 YES** (`ceil(420 * 2 / 3)`, not the rounded 0.6666667 percent helper) plus a Court `IMPEACHMENT_JUDGMENT`. Introduction requires a public, actionable `ConstitutionalGroundsRecord` (`INTRODUCE_IMPEACHMENT { basisId }`); the player cannot manufacture evidence by choosing a grounds label. Assembly and Court merits use stored `evidenceStrength` / `severity`. Recall referral is **252 YES**, then a national YES/NO vote using existing Phase 4 blocs; success uses existing Phase 1 succession. Vacancies do not lower thresholds. Recall remains political and distinct from impeachment.

Case types: `LAW_REVIEW`, `REGULATION_REVIEW`, `EXECUTIVE_ACTION_REVIEW`, `EMERGENCY_REVIEW`, `ELECTION_CONSTITUTIONAL_DISPUTE`, `IMPEACHMENT_JUDGMENT`. Dispositions are `UPHOLD` / `INVALIDATE`. Invalidated laws remain archived with `operative: false`. Regulations may be `active`, `annulled`, `invalidated`, or `expired`. Player judges never auto-vote; missed deadlines become `nonparticipation`. Party/faction loyalty is muted on the bench. Lightweight precedent records influence later similar cases. Emergency review is expedited and does not change the canonical 14-day initial emergency. Serious Court invalidations of presidential emergencies, major regulations, executive actions, or war powers may create a public impeachment basis. Treason/corruption/scandal generators are not invented in Phase 8.

Save **schemaVersion 8**; v7→v8 adds empty `constitutionalRuntime` (including `grounds: {}`) and court counters. … 20-year synthetic kernel hash: `9e72db0735b48e9b02fa8110a93cd48c`. **Commit: `72733d4`.**

## 18. Phase 9 — economy, organizations, media, UI v2, map

**COMPLETE.** Normalized economy indices (Jan 2028 = 100), lagged policy effects, regional variation from voter-bloc archetypes. Ten canonical organizations from `terena_organizations.json`; seven media outlets from `terena_media.json`. Stories from real public events only. Month order: economy → organizations → campaign/legislature/executive/courts → scheduled → media. UI System V2 + `<TerenaMap />` from GeoJSON (no runtime `terena_svg` injection). Save **schemaVersion 9**; v8→v9 baseline economy, empty org/media history. 20-year synthetic hash: `6b3dea55f2279a6216bb676c8fa1175b`. See `docs/UI_SYSTEM_V2.md`.

## 18.5. Phase 9.5 — UI System V3 playtest UX

**COMPLETE.** UI-only pass (no simulation rule changes): grouped navigation + responsive drawer, End Turn–first top bar, political briefing Home, politician cards/profile, campaign command center with action drawers, election vote formatting, map legend + lighter selection stroke + hover-vs-click fix, assembly bill progress track, archive filters, organizations relationship labels. Player-safe presentation in `apps/game/src/presentation/display.ts` with regression tests. See `docs/UI_SYSTEM_V3.md`. **Phase 10 not started.**

## 19. Phase 10 — foreign affairs

Implement 48 foreign states, leaders, strategic goals, bilateral relations, trade exposure, treaties, sanctions, military posture, diplomatic actions and crisis escalation. Initially abstract foreign domestic politics except for leadership/election changes in major states; deepen later.

Acceptance criteria: 50-year hands-off simulations do not produce constant world war or permanent peace. Alliance commitments, geography and capability alter behavior.

## 20. Phase 11 — final integration + UI polish + balance + content

Polish the playable UI, add remaining screens (courts, organizations/media depth, economy dashboard, historical wiki), calibrate coefficients, and run large-batch balance. This absorbs the old Phase 12 full UI and Phase 13 balance/content tasks.

## 21. First playable vertical slice

The Phase 7 UI plus Phase 8 Courts screen is the first playable constitutional target:

- 2028 scenario load
- player as an Assembly member, presidential candidate, sitting President, or Constitutional Court judge
- End Turn through October 2028 IRV and 20 January 2029 assumption
- campaign, legislature, executive, and court commands without DEV commands
- save/load in the browser

Phase 11 later adds organizations/media, economy, and wiki polish. Map components must consume stable SVG IDs and external JSON.

## 22. Performance targets

A normal monthly turn with 1,000 active NPCs should complete under roughly 250 ms on a mid-range desktop when no major election count runs, and under 1 second for ordinary election months. Full general election resolution may take longer but should provide worker progress rather than block the UI.

Avoid O(N²) all-politician relationship processing. Store sparse relationship edges and derive default neutrality. Recompute only relevant networks.

## 25. Narrative generation

Use structured templates, grammar variants and event metadata for news, messages and summaries. Runtime LLM use may be offered as an optional enhancement later, but the game must remain fully functional offline and deterministic without it.

## 26. Modding/data editing

Keep scenario content in human-readable JSON/JSON5 or YAML compiled into validated JSON. Provide stable schemas and an eventual dev-mode content inspector. Geography should remain SVG/GeoJSON. A mod should be able to replace parties, politicians and starting history without editing simulation source.

## 27. Major technical risks

**Simulation scope:** mitigate through vertical slices and abstraction levels.  
**NPC performance:** sparse relationships, event-driven updates and worker execution.  
**Unstable balance:** batch simulation and telemetry.  
**Save breakage:** schema versions and migrations from phase 0.  
**Map/data ID drift:** immutable canonical IDs and automated cross-reference tests.  
**AI feeling random:** explicit utility factors, memory, goals and imperfect knowledge.  
**UI overload:** progressive disclosure; show reasons and summaries before raw tables.

## 28. Definition of v1

v1 is not "every political institution imaginable." It is complete when a player can build a career through multiple election cycles in Terena while autonomous NPCs run parties, contest elections, legislate, govern, litigate and respond to a living economy and international environment; the save can continue for decades; maps and archives update correctly; and the player is never required to control any entity other than their politician.
