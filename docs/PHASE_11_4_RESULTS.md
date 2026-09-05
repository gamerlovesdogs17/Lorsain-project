# Phase 11.4 completion status

Date: 2026-09-05

## Phase 11.3

**ACCEPTED** (unchanged). Functional acceptance remains on the `f817f01` lineage.

## Determination

**Phase 11.4 NOT YET ACCEPTED**

Priority 0 correctness and Priority 1 Constitution/Assembly/Campaign–Election Night evidence are substantially landed. Priority 2 political-depth coverage is still only partial (search/inbox polish + existing org scorecards; not a full career/memory/court-precedent/agenda expansion). Acceptance waits on broader Priority 2 playability depth and a cleaner multi-year headline uniqueness rate under ordinary play.

## Previous Phase 11.4 issues corrected

| Issue | Fix |
| --- | --- |
| Campaign screenshot showed inactive campaign | `active-campaign` fixture + capture |
| Election Night ≈ Elections | `election-night-partial` fixture + cycle select + EN panel |
| Invented campaign/crisis/headline specifics | Truthfulness rewrite + generator bans |
| Content tests used hardcoded strings | Production generator tests |
| Dual Constitution UX mental model | Document inspector owns alternatives + red/green diff; Business redirects proposals |
| Assembly leadership behind disclosure | Chamber stage + leadership rail together |
| Weak headline uniqueness | Catch-all/campaign/treaty variants + cooldown retries; audit artifact |

## Implemented this completion pass (commits after `509e3c0`)

### Correctness / QA
- Narrative truthfulness (`bd667f8`)
- Active campaign + fresh Election Night fixtures (`8192cd5`)
- Capture script + truthful screenshots (`d222f37`, `7ad7d4d`, later recaptures)
- Repetition audit script + JSON (`50d17ee`, `68e90fc`)

### Constitution
- Alternatives + mechanical text + eligibility `0` (`fcb75eb`)
- Document-centric inspector with live document diff (`bac98cb`)
- Dependency warnings helper
- Free-text retained only for non-`runtime_rule_id` clauses

### Assembly
- Leadership + hemicycle simultaneous; tighter packing (`9a0a70d`)

### Navigation / depth (partial)
- Search indexes amendments, laws, Year-in-Terena (`873bc4e`)
- Inbox sorted/labeled by urgency (`873bc4e`)

## Repetition audit (36-month run, seed `P114-REPETITION-AUDIT-2030`)

See `docs/qa/phase11_4/repetition-audit.json`.

After headline diversity fix (approximate):
- media stories: 340 total
- exact duplicate extras: ~208 (down from 311)
- structural duplicate extras: ~247
- banned invented-fragment hits: 0
- crisis themes distributed across neighbor/sanctions/trade/maritime/diplomatic fixtures

Still too repetitive for full acceptance of content diversity under long play.

## Screenshot evidence

`docs/qa/phase11_4/final/` including:
- `campaign-hq-1440.png` — active campaign command center
- `election-night-1440.png` — 2030 Assembly Election Night playback
- `assembly-1440.png` — leadership + hemicycle
- `constitution-1440.png` — document browser
- `constitution-diff-1440.png` — Article IV modeled rule red/green diff + alternatives

## Pages / build

- `pnpm --filter @lorsain/game build` succeeds (requires `pnpm --filter @lorsain/sim build` after sim export changes)
- GitHub Pages base path remains `/Lorsain-project/`
- Push `main` to refresh Pages when ready

## Save compatibility

- Additive constitutional `proposedText` / alternatives; no breaking save-format rewrite
- Eligibility treats `presidential_term_limit === 0` as unlimited

## Known problems / limitations

- Headline uniqueness still high-duplicate under multi-year media generation
- Priority 2 systems (party postmortems, career journal unification, court precedent, governing agenda, turn summary, campaign calendar day honesty, investigations) incomplete
- Constitution history list can visually crowd the document footer on dense articles
- Institutions fixture player is often a Governor (not MP), so Introduce amendment is correctly disabled in that QA shot
- Map-centric global shell explicitly deferred

## Feature revert map (this pass)

| Commit | Feature | Safe revert independently? | Dependencies |
| --- | --- | --- | --- |
| `bd667f8` | Narrative truthfulness | Yes | None |
| `fcb75eb` | Constitution alternatives + eligibility 0 | Prefer keep with UI | Consumed by `bac98cb` / `9a0a70d` |
| `8192cd5` | QA fixtures | Yes | Capture script |
| `9a0a70d` | Assembly chamber stage | Yes | Prefers `fcb75eb` exports |
| `d222f37` / `7ad7d4d` | Capture/docs evidence | Yes | Fixtures |
| `bac98cb` (+ typing follow-ups) | Constitution document inspector | Yes if sim exports kept | `fcb75eb` |
| `50d17ee` | Headline diversity + audit script | Yes | None |
| `873bc4e` | Search + inbox priority | Yes | None |

Earlier foundation UI/content: `26e6582`, `cd6694b`, `12f4cdc`, …

## Deferred (not Phase 11.5 started)

- Global map-centric shell
- Full court precedent engine
- Campaign promise tracker / implementation lag as first-class systems
- Complete party platform evolution + mentorship RPG
- Perfect mobile Assembly/Constitution density

Phase 11.5 has not begun.
