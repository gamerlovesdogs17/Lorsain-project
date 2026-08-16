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
- **Phase 2** — **IMPLEMENTED, pending review** — politician agents, sparse relationships/memories/beliefs, deterministic goals, explainable decision engine
- Phase 3 (parties/factions/nominations as active institutions) has **not started**

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
- Save schemaVersion **1** at Phase 1; **schemaVersion 2** from Phase 2 (v1→v2 migration)
- Domain interrupts: unresolved political domain events (`requiresResolution`) cannot be skipped with `RESUME_TURN`
- Worker protocol **types** only (no Worker runtime dependency)

Acceptance criteria: synthetic 20-year save/reload hash match; TERENA_2028 advances until `PRESIDENTIAL_ELECTION_DUE` on 2028-10-14.

## 11. Phase 2 — politicians, relationships and goals

**IMPLEMENTED, pending review.** `@lorsain/sim` politician-brain substrate (`packages/sim/src/agents/`). Phase 3 has not started and must not be faked here.

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

Acceptance criteria for this phase: required relationship/memory/belief/goal/decision/player-autonomy/save tests in `@lorsain/sim`. Party contests, campaigns, elections, and legislation remain Phase 3+.

## 12. Phase 3 — parties, factions and nominations

Implement party membership, caucuses, leaders, endorsements, discipline, membership elections, nomination rules and defect/split logic. Encode each 2028 party's nomination method separately through data-driven rule modules.

**Counting** for leadership/nomination RCV contests **consumes** `packages/election-math` (completed in Phase 0.5). Do not reimplement RCV/STV here.

Acceptance criteria: run 1,000 automated party leadership contests; results respond correctly to faction size, candidate relations, endorsements and uncertainty without collapsing into deterministic faction voting.

## 13. Phase 4 — election / campaign simulation (not counting math)

Implement voter blocs, underlying support, candidate quality, campaign resources, turnout, polling, and campaign AI. Presidential RCV and Assembly STV **counts** call `packages/election-math`.

Store complete count archives from election-math so election-night UI and historical pages can replay results.

Acceptance criteria: autonomous campaigns complete without player input; counting remains deterministic via election-math; 10,000 simulated elections show sensible monotonic response to support shifts and no impossible seat totals.

## 14. Phase 5 — campaign simulation

Implement fundraising, budgets, ad markets, field organization, visits, debates, endorsements, attacks, scandal response and candidate dropout. NPCs choose actions using perceived rather than true support.

Acceptance criteria: autonomous NPC candidates can complete an entire presidential and Assembly campaign with no player input; spending cannot exceed funds; candidates respond to changed polling and endorsements.

## 15. Phase 6 — legislature

Implement Assembly sessions, Speaker powers, committees, bills, amendments, scheduling, whip estimates, negotiations, votes, presidential return veto and repassage.

Start with structured policy parameters rather than free-form legislative text. Text summaries are generated from policy data.

Acceptance criteria: an autonomous Assembly can introduce, committee, negotiate and pass/fail bills for four simulated years; coalition patterns differ by issue instead of producing one permanent government/opposition split.

## 16. Phase 7 — executive and ministries

Implement cabinet appointments, ministry portfolios, agency capacity, regulations, ministerial censure, budget proposal, budget continuity, executive actions and implementation quality.

Acceptance criteria: a president can govern with a hostile Assembly but cannot ignore law or money; repeated appointment of unacceptable ministers produces censure and political cost rather than deadlock.

## 17. Phase 8 — courts and constitution

Implement Constitutional Court membership, appointments, case pipeline, doctrine/precedent flags, emergency review, election litigation and constitutional remedies.

Acceptance criteria: unconstitutional actions can be challenged; judge philosophy and precedent affect outcomes; court composition changes only through valid appointments/vacancies.

## 18. Phase 9 — economy and organizations

Implement national/provincial economic indicators and major sectors. Add unions, business groups, farm groups, advocacy organizations, endorsements and lobbying.

Acceptance criteria: policy changes have delayed measurable effects; organizations choose endorsements based on interests/relationships; economic shocks change politics without mechanically determining elections.

## 19. Phase 10 — media and information

Implement outlets, audience/reputation, structured article generation, investigations, rumors and polling presentation. Build a newspaper/digest home screen from simulation events.

Acceptance criteria: the same underlying event is covered differently by outlets without fabricating different objective facts; player information reflects source quality.

## 20. Phase 11 — foreign affairs

Implement 48 foreign states, leaders, strategic goals, bilateral relations, trade exposure, treaties, sanctions, military posture, diplomatic actions and crisis escalation. Initially abstract foreign domestic politics except for leadership/election changes in major states; deepen later.

Acceptance criteria: 50-year hands-off simulations do not produce constant world war or permanent peace. Alliance commitments, geography and capability alter behavior.

## 21. Phase 12 — full UI

Core screens:

- monthly dashboard/news digest
- politician profile and relationship network
- career/actions screen
- party and faction pages
- election/campaign pages
- Assembly chamber, bill and committee pages
- executive/cabinet pages
- court page
- organizations/media pages
- Terena interactive SVG map
- world foreign-affairs SVG map
- economy dashboard
- historical archive/wiki
- save/load/export settings

Map components must consume stable SVG IDs and external JSON. Filling `C001` by election winner or `P09` by unemployment should require no SVG editing.

## 22. Phase 13 — balance and content pass

Run large batches before adding more features. Calibrate party support, incumbency, campaign effects, relationships, career ambition, scandal frequency, legislative productivity and foreign crises.

Create developer dashboards for distributions instead of balancing by anecdotal single runs.

## 23. First playable vertical slice

Do **not** wait for every system. The first playable target should contain:

- 2028 scenario load
- player as an Assembly member or candidate
- 200–300 active national NPCs
- parties/factions and relationships
- one presidential campaign
- one set of Assembly by-elections or simplified Assembly election
- polling and endorsements
- basic Assembly bills/votes
- save/load
- interactive Terena map
- 24 months of play

Once this is fun and deterministic, scale outward.

## 24. Performance targets

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
