# Phase 17B — Content audit (actual inventory)

**Repo:** Lorsain project  
**Generated:** 2026-09-12  
**Scope:** Counted content under `packages/`, `data/`, `apps/` (no new gameplay content implemented in this pass).  
**Related:** `docs/qa/phase17b-content-gap-draft.md` (qualitative gap notes from Phase 17A), `docs/qa/phase11_4/repetition-audit.json` (36-month frequency probe).

## Methodology

- **Authoritative world data** lives primarily in `data/*.json` (see `data/content_manifest.json`).
- **Mechanical / narrative catalogs** are mostly **TypeScript constants** in `packages/sim/src/**` (provisions, constitution amendments, party org catalogs, campaign flavor, media headline branches, foreign crisis *theme labels*, etc.).
- There is **no separate `content/` pack directory** beyond browser inventory helpers in `apps/game/src/content/`.
- **Counts are entries in repo**, not player-visible events per playthrough.
- **Unique mechanical patterns** means distinct simulation behaviors (stage machines, command paths, option shapes)—**not** title/wording variants on the same hook.

> **Central rule (Phase 17B):** DO NOT COUNT RESKINS AS VARIETY. Near-duplicate headlines, crisis theme strings, or bill titles that share the same trigger and effects count as **one** pattern.

---

## Executive summary

| Judgment band | Domains |
|---------------|---------|
| **STRONG** | Party leadership / contests architecture, caucus command surface, legislative provision *volume*, constitutional amendment catalog |
| **ADEQUATE** | Legislation UX + provision library, campaigns pipeline, courts *types*, foreign affairs *architecture*, history timeline JSON, canonical figures |
| **THIN** | Executive/cabinet *situations*, budget *political* disputes, implementation *named* complications, endorsements/lobbying *campaigns*, debates flavor, media template diversity, trade/sanctions *scenario* text |
| **VERY THIN / absent** | Scandal/investigation/resignation arcs, ministry-domain crisis scenes, legal *doctrine* packages, dedicated amendment content beyond provisions/constitution |

---

## Where to add content (reuse existing engines)

| Domain | Best extension paths | Engine to reuse |
|--------|----------------------|-----------------|
| Bills / provisions / policy interactions | `packages/sim/src/legislature/provisions.ts`, `packages/sim/src/governing/interactions.ts` | `variableProvision()` + `LEGISLATIVE_PROVISIONS`; `INTERACTION_RULES` |
| Constitutional amendments | `packages/sim/src/provinces/constitutionChanges.ts` | `ConstitutionChangeSubject` / `alternatives[]` |
| Constitutional order modes (structural) | `packages/sim/src/provinces/constitutionalOrder.ts` | Mode enums + `orderPatch` on alternatives |
| Government agenda / promises | `packages/sim/src/governing/agenda.ts`, `packages/sim/src/governing/promises.ts` | Agenda refresh + promise linkage to bills |
| Implementation responses | `packages/sim/src/governing/implementation.ts` | `IMPLEMENTATION_RESPONSE_ACTIONS` + lag/posture logic |
| Budget politics | `packages/sim/src/governing/budgetPlanning.ts`, `packages/sim/src/executive/procedure.ts` | Ministry choices + envelope vs request |
| Party priorities / platform / strategies | `packages/sim/src/partyOrg/catalog.ts` | `PARTY_PRIORITY_CATALOG`, `PLATFORM_POLICY_OPTIONS`, `CAMPAIGN_STRATEGY_CATALOG` |
| Campaign flavor (non-fabricated) | `packages/sim/src/campaigns/situations.ts`, `packages/sim/src/campaigns/debates.ts` | `CAMPAIGN_SITUATIONS`, `DEBATE_NOTABLE_MOMENTS` |
| Organizations / endorsements | `data/terena_organizations.json`, `packages/sim/src/organizations/procedure.ts`, `packages/sim/src/organizations/monthly.ts` | Canon org defs + meeting/endorse/scorecard flows |
| Provincial bills | `packages/sim/src/provinces/politics.ts` (`SUBJECT_POLICY`) | `ProvincialBillSubject` enum |
| Courts (questions / grounds) | `packages/sim/src/courts/monthly.ts`, `packages/sim/src/courts/types.ts` | Case spawn hooks + `IMPEACHMENT_GROUNDS` |
| Foreign crisis *identity* | `packages/sim/src/foreign/crisis-emergence.ts` (`assignCrisisTheme`) | Theme label branches (mechanical crisis is procedural) |
| Treaties | `packages/sim/src/foreign/treaty-lifecycle.ts`, `data/world_countries.json` | `TREATY_KINDS` + runtime treaty records |
| News / history voice | `packages/sim/src/media/monthly.ts` (`headlineFor`), `data/terena_history_timeline.json`, `data/world_history_timeline.json` | Per-`type` headline branches + timeline entries |
| Politicians (canon) | `data/terena_starting_figures.json`, `data/_seed_figures_30.json` | World kernel figure ingest |
| Issues / org issue tags | `data/terena_issues.json`, org `issues[]` in `data/terena_organizations.json` | Issue catalog drives scoring |
| Schema validation for new JSON | `packages/content-schema/src/schemas.ts`, `packages/content-loader/` | Zod + loader CLI |

---

## Category inventory

### Legislation / provisions / amendments

| Metric | Count |
|--------|------:|
| Issue dimensions (`data/terena_issues.json`) | **15** |
| Legislative provision families (`LEGISLATIVE_PROVISIONS`) | **51** |
| Provision options (incl. founding baselines) | **227** |
| Policy interaction rules (`INTERACTION_RULES`) | **6** |
| Amendment *content packs* | **0** (amendments reuse provision swaps + constitution subjects procedurally) |

**Unique mechanical patterns (≈8–10, not 227):**

1. Multi-option `variableProvision` ladder (founding + ≥1 reform option).
2. `controlHint` shapes: **categorical**, **numeric**, **binary**, **threshold**, **percentage**, **duration** (used across provisions; ~91 hinted options).
3. Multi-axis `dimensionEffects` vs legacy scalar `direction`.
4. Optional `fiscalImpact` on enactment.
5. Cross-provision **synergy / strain / contradiction** via `governing/interactions.ts` (6 rules; same-provision contradictions are drafting-only and **do not fire** at runtime).
6. Bill amendment pipeline (`legislature/procedure.ts`)—generic, not a separate amendment catalog.
7. Provincial mirror subjects (**12**) map to national issues (`provinces/politics.ts`).

**Frequency notes (from `repetition-audit.json`, 36 months):**

- **HIGH:** `government:law_enacted` headlines (122), `politics:bill_signed` (39)—institutional churn dominates media.
- **LOW:** Distinct policy-family *narrative* beyond enacted-law templates.

**Judgment:** **ADEQUATE** volume on provisions; **THIN** on cross-bill narrative families and post-enactment amending-legislation *story* hooks (mechanic exists via `request_amending_legislation`).

---

### Government / executive situations

| Metric | Count |
|--------|------:|
| Dedicated executive *situation* catalog | **0** |
| Executive procedure surface (`executive/procedure.ts`) | **~1,030** LOC (commands: budgets, regulations, emergencies, war powers, motions—not a scene list) |
| Cabinet ministries (`governing/departments.ts`) | **12** departments / office mappings |

**Unique mechanical patterns:** regulation issuance from enacted law items, emergency/war-power gates tied to `provinces/constitutionGameplay.ts`, budget proposal/envelope path, cabinet appoint/dismiss (stateful, not scenario catalog).

**Frequency:** Executive actions generate **government** media category heavily; few distinct *situation* templates.

**Judgment:** **THIN** for narrative executive/crisis content; **STRONG** on command/mechanic breadth.

---

### Cabinet

| Metric | Count |
|--------|------:|
| Minister portfolios (engine) | **12** |
| Ministry-specific *event* catalog | **0** |
| Shared implementation/budget/agenda hooks | **yes** (department pressure in `budgetPlanning.ts`, implementation by department) |

**Patterns:** one architecture for all ministries; performance is qualitative UI, not domain scene library.

**Frequency:** Reshuffle + “too early to assess” loops (Phase 17A QA notes); regulation attempts when portfolios rotate.

**Judgment:** **THIN** (mechanics **ADEQUATE**).

---

### Implementation complications

| Metric | Count |
|--------|------:|
| Named complication / delay *catalog* | **0** |
| Implementation response actions | **8** (`increase_resources`, `revise_timetable`, `issue_guidance`, `negotiate_provinces`, `request_amending_legislation`, `reduce_scope`, `replace_responsible_minister`, `pause_rollout`) |
| Lag kinds (derived) | **4** (`fast`, `medium`, `slow`, `electoral`) + major-law flag |

**Patterns:** progress/capacity/posture simulation; complications emerge from numeric state, not typed content entries.

**Frequency:** Delays fire from simulation; **player-facing complication labels** are generic status strings.

**Judgment:** **THIN** (mechanics **ADEQUATE** after Phase 17A wiring).

---

### Budget disputes

| Metric | Count |
|--------|------:|
| Fiscal stances | **5** (+ `custom`) |
| Per-ministry choices | **4** (`full_request`, `partial_request`, `hold_baseline`, `cut`) |
| Budget dispute *scenario* text / events | **0** dedicated catalog |

**Patterns:** envelope vs request math (`budgetPlanning.ts`); assembly pass/fail/continuing resolution (`governing/budget.ts`).

**Frequency:** **MEDIUM** in media (`government:budget_proposed` ×7 in 36-month probe); political fight *copy* is thin.

**Judgment:** **THIN** narrative, **ADEQUATE** mechanics.

---

### Elections / campaigns

| Metric | Count |
|--------|------:|
| Parties / factions (`data/terena_parties.json`) | **7** / **15** |
| Nomination rules | **7** |
| Starting figures (`terena_starting_figures.json`) | **530** |
| Historical 2026 candidates | **535** |
| Campaign situation templates | **8** (×4 titles each → **32** title strings) |
| Debate notable moments | **8** |
| Debate issue emphasis labels | **10** (several issue IDs in map are **legacy/unused** vs current `ISS_*` set) |
| Campaign strategies (party org) | **5** |

**Patterns:** full election/certification pipeline (procedural); campaign flavor is **state-conditioned** titles only (`campaigns/situations.ts`—must not invent unrecorded events).

**Frequency:** Campaign situations **unique** in probe (32/32); elections media moderate.

**Judgment:** **ADEQUATE** mechanics + canon roster; **THIN** debate/campaign *distinct beats* beyond 8 templates.

---

### Scandals

| Metric | Count |
|--------|------:|
| Scandal arc definitions | **0** |
| Impeachment grounds (legal) | **4** |
| Grounds source kinds (incl. placeholders) | **8** (`future_scandal`, `future_corruption_investigation`, etc.) |
| Agent memory tag | `scandal_association` (trait hook only) |

**Patterns:** impeachment/recall **machinery** exists; **no** investigation → resignation content pipeline.

**Frequency:** **NEVER-FIRING** for scandal arcs in practice (placeholders unused).

**Judgment:** **VERY THIN / absent**.

---

### Endorsements

| Metric | Count |
|--------|------:|
| Interest organizations (canon) | **10** |
| Player commands: meet / seek endorsement / scorecard | **3** flows in `organizations/procedure.ts` |
| Caucus endorsement commands | **2** (`CAUCUS_CHAIR_ENDORSED`, primary endorse) |
| Endorsement *campaign* catalog | **0** |

**Patterns:** probabilistic org endorsement from alignment + relationship; caucus/leadership endorsements are mechanical.

**Frequency:** Organizations media **very low** (3 org headlines / 36 months in probe).

**Judgment:** **THIN**.

---

### Party events

| Metric | Count |
|--------|------:|
| Contest types (engine) | **≥6** (`party_leadership`, `presidential_nomination`, `gubernatorial_nomination`, `assembly_nomination`, `faction_chair`, office nominations) |
| Static “party event” scene catalog | **0** |
| Party priority catalog entries | **18** |
| Platform policy option IDs | **35** (8 issue buckets × ~4 options) |
| Pending committee action types | **stringly** (`partyOrg/pendingActions.ts` executes catalog-backed payloads) |

**Patterns:** contests + committee votes + platform/priority commands; events are **history types**, not a content pack.

**Frequency:** `politics:party_contest` moderate (12 / 36 months).

**Judgment:** **STRONG** architecture, **THIN** scripted party *events* beyond contests.

---

### Caucus events

| Metric | Count |
|--------|------:|
| Caucus commands (`caucus/commands.ts`) | **13** exported command handlers |
| Caucus stance / growth enums | **3** stances, **4** growth strategies, **2** relation kinds |
| Caucus *narrative* event catalog | **0** |

**Patterns:** form/split/merge, priorities, alliances, recruitment, bill positions, leadership elections (wired via party/campaign systems).

**Frequency:** Autonomous caucus agenda activity documented in Phase 12 audits; not headline-dense.

**Judgment:** **STRONG** mechanics, **ADEQUATE** flavor via priorities/agenda systems—not a separate scene library.

---

### Organizations / lobbying

| Metric | Count |
|--------|------:|
| Canon organizations | **10** |
| Media outlets | **7** |
| Recurring org *campaign* templates | **0** |
| Monthly org behavior | scorecard reactions + optional NPC outreach (procedural) |

**Patterns:** relationship + policyAlignment updates on votes/sponsors; issue fit heuristics per org type.

**Frequency:** **LOW** (organizations category 3/340 stories in probe).

**Judgment:** **THIN**.

---

### Provincial politics

| Metric | Count |
|--------|------:|
| Provinces (GeoJSON + manifest) | **21** provinces (`P01–P20` + FDV) |
| Provincial bill subjects | **12** |
| Provincial relation model | **3** buckets (`friendly` / `divided` / `hostile`) |
| Federal–provincial *dispute scene* catalog | **0** |

**Patterns:** provincial assemblies + bills tied to `SUBJECT_POLICY`; implementation `negotiate_provinces` response.

**Frequency:** Provincial labels appear in media catch-alls; limited dedicated event types.

**Judgment:** **ADEQUATE** structural simulation, **THIN** event variety.

---

### Court cases

| Metric | Count |
|--------|------:|
| Case types | **7** |
| Static fact-pattern library | **0** (questions generated from law/regulation/bill titles in `courts/monthly.ts`) |
| Impeachment grounds | **4** |
| Legal career pool entries | runtime-generated + canon hooks |

**Patterns:** spawn from enacted law, emergency, regulation, provincial bill, impeachment; precedent graph stores decisions—not a dossier catalog.

**Frequency:** **MEDIUM** (`courts:court_decision` ×27 / 36 months).

**Judgment:** **ADEQUATE** machinery, **THIN** fact-pattern / dossier variety.

---

### Legal doctrines

| Metric | Count |
|--------|------:|
| Competing doctrine *packages* | **0** |
| Precedent treatment relations | **5** (`relies_on`, `follows`, `distinguishes`, `limits`, `overturns`) |

**Patterns:** merit lean + institutional judge traits + precedent similarity; no authored doctrine text library.

**Judgment:** **THIN**.

---

### Constitutional disputes

| Metric | Count |
|--------|------:|
| Amendment subjects (`constitutionChanges.ts`) | **22** |
| Alternative clause texts (`proposedClauseText`) | **79** (includes founding + reform options) |
| Constitutional order mode enums | **12** mode groups (party system, election modes, judicial review, emergency powers, etc.) |

**Patterns:** ratification via assembly; gameplay patches via `orderPatch` / `rulePatch`; disputes also appear as **case types** (`ELECTION_CONSTITUTIONAL_DISPUTE`, `FEDERAL_PROVINCIAL_DISPUTE`).

**Frequency:** Amendments era-sync in `history15/constitutionalEras.ts` (procedural).

**Judgment:** **STRONG** on amendable text volume, **ADEQUATE** on dispute *scenes*.

---

### Politician backgrounds / careers

| Metric | Count |
|--------|------:|
| Canon starting figures | **530** |
| Career ambition kinds | **5** (`seek_higher_office`, `contest_leadership`, `accept_cabinet`, `retire`, `hold_course`) |
| Career stages | **7** |
| Authored biography templates | **0** (generated descriptions + audit in `agents/generated-quality.ts`) |

**Patterns:** procedural career AI (`politics/careers.ts`); legal career pool for bench.

**Frequency:** Office assumption/term events common; biography duplication flagged by quality audit tooling.

**Judgment:** **THIN** narrative diversity, **ADEQUATE** canon headcount.

---

### Foreign affairs — crises / treaties / trade / sanctions

| Metric | Count |
|--------|------:|
| World countries | **48** |
| World leaders | **47** |
| World institutions | **5** |
| Crisis stage machine | **6** stages |
| Crisis *theme labels* (authored strings) | **7** (+ fallback duplicates → **5** dominate in probe) |
| Treaty kinds | **5** |
| Sanction scopes | **3** |
| Trade dispute *scenario* catalog | **0** (trade ties derived in `foreign/trade.ts`) |

**Patterns:** crises emerge from bilateral relations/posture/sanctions; treaties lifecycle in `foreign/treaty-lifecycle.ts`; conflicts bridge from crises (`foreign/conflicts.ts`).

**Frequency (probe):** 40 crisis theme assignments → **5 unique** strings evenly split (**HIGH** repetition); foreign media moderate.

**Judgment:** **ADEQUATE** architecture, **THIN** on distinct crisis *packages* and trade-war narrative.

---

### News / history templates

| Metric | Count |
|--------|------:|
| Media headline branches (`if (type === …)` in `media/monthly.ts`) | **33** |
| Article structure families | **5** |
| Catch-all category pools | **7** categories × generic lines |
| Terena history timeline entries | **32** |
| World history timeline entries | **28** |
| Phase 15 constitutional era labels | procedural (`ERA_FOUNDING` seed + sync) |

**Patterns:** cooldown + structural fingerprinting (`media/types.ts`); event-type-first headlines; catch-all uses `title` / `narrativeTitle` payload when present.

**Frequency (probe):** 340 stories → **177** unique exact headlines, **117** structural; regenerated headlines **86** unique exact (**HIGH** duplicate pressure); cooldown window dupes lower for primary pipeline (3) vs regenerated (151).

**Judgment:** **THIN** template diversity relative to event volume; history JSON **ADEQUATE** as reference spine.

---

## Cross-cutting frequency signals (36-month probe)

Source: `docs/qa/phase11_4/repetition-audit.json` (seed `P114-REPETITION-AUDIT-2030`).

| Signal | Observation |
|--------|-------------|
| **Over-frequent** | Enacted-law and budget headline families; treaty ratification phrasing clones |
| **Under-represented** | Organizations, debates, scandal/impeachment narrative, ministry-domain crises |
| **Exhaustion risk (~10–20y)** | Foreign crisis theme pool (5–7 labels), campaign situation templates (8), org interactions without refresh pools |
| **Never / rarely firing** | `future_scandal` grounds, dedicated scandal arcs, rich trade/sanctions spiral *copy* |

---

## Content architecture notes

1. **JSON world canon** (`data/`) is the right place for **figures, parties, orgs, issues, timelines, world countries**—validated via `packages/content-schema` and loaded through `packages/content-loader` / `world.ts`.
2. **Mechanical law and amendment text** intentionally live in **`packages/sim/src/legislature/provisions.ts`** and **`packages/sim/src/provinces/constitutionChanges.ts`** because they bind directly to simulation types (do not split without loader work).
3. **Flavor that must stay truth-safe** (campaign situations, media) belongs next to **consumers** with explicit comments forbidding fabricated events (`campaigns/situations.ts`, `media/monthly.ts`).
4. **No scandal or ministry-crisis engine** exists yet—adding content there requires **new hooks** (likely `governing/`, `executive/`, `politics/`, or `media/monthly.ts` event types), not just JSON.

---

## Suggested Phase 17B saturation order (content-only)

1. **Implementation + budget + legislation interactions** — expand `INTERACTION_RULES`, complication *types* (if engine extended), distinctive provision clusters (not title reskins).
2. **Scandals + careers + biographies** — largest variety debt; needs new arcs tied to existing impeachment/grounds placeholders.
3. **Executive / cabinet domain scenes** — attach to ministries in `governing/departments.ts` + history events.
4. **Organizations + endorsements** — expand `terena_organizations.json` and org monthly campaigns.
5. **Foreign crisis packages** — extend `assignCrisisTheme` + crisis metadata (avoid repeating 5 theme strings).
6. **Courts fact patterns + doctrines** — optional small catalogs consumed by `courts/monthly.ts` spawn paths.
7. **Media + history** — new `headlineFor` branches and timeline entries; reduce catch-all dependence.

---

## Audit artifacts

| Artifact | Purpose |
|----------|---------|
| This file | Phase 17B baseline counts + extension map |
| `docs/qa/phase17b-content-gap-draft.md` | Pre-audit qualitative ranks |
| `docs/qa/phase11_4/repetition-audit.json` | Frequency / duplication metrics |
| `data/content_manifest.json` | Authoritative data file registry |

**Counts snapshot (machine-verified 2026-09-12):** 51 provisions · 227 options · 22 constitutional subjects · 79 clause alternatives · 8 campaign situation templates · 33 media type branches · 10 organizations · 530 starting figures · 7 crisis theme labels (5 dominate runtime probe).
