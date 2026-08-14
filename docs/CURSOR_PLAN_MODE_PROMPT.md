# Cursor Plan Mode Prompt — Lorsain / Terena Political Simulator

You are being handed a new single-player political simulation project. **Do not write implementation code yet. Stay in Plan Mode.** Your job in this first pass is to inspect the repository and the supplied canonical design/data package, challenge assumptions, identify missing dependencies or contradictions, and produce a phased technical implementation plan.

## Product concept

The player controls exactly one politician in the Republic of Terena. Every other politician is an autonomous NPC. The world continues independently of the player. The game is turn-based, normally one month per turn, and can run for decades. Elections, parties, caucuses, legislation, executive government, courts, economy, organizations, media and foreign affairs are all simulated.

This is not a god game. The player does not control their party, legislature, election opponents or government unless their character actually holds an office granting that authority. NPCs use the same core political rules as the player and have imperfect information.

## Canonical files you must read before planning

Read all files under the provided package, especially:

- `README.md`
- `docs/WORLD_BIBLE.md`
- `docs/TERENA_COUNTRY_BIBLE.md`
- `docs/GAME_DESIGN_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DATA_SCHEMA.md`
- `docs/TESTING_AND_BALANCE.md`
- `data/content_manifest.json`
- `docs/CANONICAL_DATA_CONTRACT.md`
- `data/world_countries.json`
- `data/terena_geography.json`
- `data/terena_starting_figures.json`
- `data/terena_nomination_rules.json`
- `data/canonical_crosswalk.json`
- `data/terena_provinces.geojson`
- `data/terena_constituencies.geojson`
- `maps/world_political.svg`
- `maps/terena_game_map.svg`

Treat the IDs in the supplied SVG/JSON/GeoJSON as stable external contracts unless you identify a concrete technical reason to change them.

## Core fixed design decisions

1. Default scenario begins 1 January 2028.
2. Normal turn = one month.
3. Terena has 72m residents, 20 provinces plus Federal District of Valen.
4. The 48 Assembly constituencies are population-balanced national electoral regions and may cross province boundaries; `plurality_province_id` is descriptive, not containment.
5. National Assembly = 420 members elected from 48 multi-member STV constituencies.
6. President = national RCV, five-year term, two-term maximum.
7. President and Assembly have independent mandates; Assembly does not elect a prime minister.
8. President cannot dissolve Assembly.
9. Ordinary veto is suspensive; absolute Assembly majority can repass.
10. Individual ministers can be removed by 55% Assembly censure.
11. Budget automatically continues if a replacement is late.
12. Major regulations can be annulled legislatively within the constitutional framework.
13. Emergency declaration expires in 14 days unless extended.
14. Offensive deployments beyond 30 days require Assembly authorization.
15. 3/5 Assembly may refer presidential recall to national vote.
16. Nine-member Constitutional Court with 12-year nonrenewable staggered terms.
17. Initial 2028 political world is canonical and fixed across new games. Future history is emergent.
18. Future politicians can be procedural; the starting political class should be generated once during development, reviewed and committed as fixed content.
19. All gameplay randomness must be deterministic and seeded. Never use uncontrolled `Math.random()` in simulation logic.
20. Runtime LLM calls are not required and must not be a core dependency.
21. A hands-off 50-year simulation must remain functional and plausible.

## Architecture preference

The existing design recommends React + TypeScript for UI and a pure TypeScript simulation package, with a Web Worker for turns, Zod validation, IndexedDB/Dexie saves, SVG/GeoJSON maps, Vitest and Playwright. You may recommend changes, but explain why and preserve the separation between UI and simulation engine.

## Your first-task output

Produce a detailed plan, not code. Include:

### A. Repository assessment
- What exists now.
- What is missing.
- Any conflicts between current repository structure and supplied spec.
- Dependencies/tooling you recommend.

### B. Proposed architecture
- package/module boundaries
- simulation state ownership
- command/event flow
- deterministic RNG and substreams
- Web Worker boundary
- content loading/validation
- save/version/migration design
- map integration
- history/archive storage

### C. Entity/data design review
Review the supplied schema. Identify fields/entities still needed. Pay special attention to sparse relationships, NPC imperfect knowledge, elections, STV/RCV ballots, bills, organizations, courts, foreign states and historical event logging.

### D. Simulation loop
Define exact monthly processing order and how major-event interrupts interact with the monthly clock. Identify which systems can run monthly, quarterly or only when triggered.

### E. NPC decision architecture
Propose a reusable utility/goal framework that remains inspectable and deterministic. Explain how ideology, caucus, party loyalty, constituency incentives, relationships, ambition, imperfect information and randomness combine without turning into arbitrary behavior.

### F. Electoral engine
Plan the voter-bloc model, campaign support model, polling model, presidential RCV count, Assembly STV count, candidate nomination systems and election archive. The result must support individual same-party candidates competing in STV.

### G. Legislative/executive/court systems
Plan bills, committees, amendments, scheduling, whipping, ministerial censure, budgets, regulations, executive authority, court cases and precedent.

### H. Economy/media/organizations/foreign affairs
Give an MVP abstraction and later expansion path for each. Do not accidentally turn the first implementation into a grand-strategy economy game.

### I. UI information architecture
Plan the major screens and navigation. The player should understand why events happened without being shown hidden engine truth. Reuse supplied SVG IDs rather than drawing a second map system.

### J. Phased roadmap
Break implementation into small reviewable phases with a vertical slice early. For each phase list concrete deliverables, dependencies and acceptance tests. Identify what to defer until after the first fun 24-month playable slice.

### K. Testing strategy
Incorporate deterministic hashes, hands-off simulations, election invariants, performance benchmarks, distribution dashboards and long-save migrations.

### L. Open questions
Only list questions that materially block architecture or implementation. Do not ask for flavor choices that can remain content data. Where a reasonable default exists, recommend it instead of blocking.

## Important planning behavior

Do not respond with a vague feature list. Trace dependencies. Identify the minimal simulation kernel that every later system relies on. Prefer data-driven systems over hardcoding. Explicitly call out features that should be postponed even if they are attractive. Assume this will become a large project and design for testability, save compatibility and deterministic batch simulation from the start.
