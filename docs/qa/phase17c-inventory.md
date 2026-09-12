# Phase 17C — balance / repetition inventory

**Date:** 2026-09-12  
**Sources:** `docs/qa/phase17b-content-audit.md`, `docs/qa/phase17b-wave1-notes.md`, `docs/qa/phase17b-wave2-notes.md`, `docs/qa/phase17b-repetition-notes.md`, `docs/qa/phase17b-repetition-report.json`, `docs/qa/phase11_4/repetition-audit.json` (36-month probe).

Ranked targets for Extended Validation and tuning. **CRITICAL** = dominates player-visible history or undermines variety claims; **LOW** = polish / long-tail.

---

## Ranked balance & repetition targets

| Rank | Domain | Signal | Why |
|------|--------|--------|-----|
| **CRITICAL** | Media / history voice | `law_enacted` + bill-pipeline headlines dominate 36-month probes | Same institutional skeleton regardless of policy family (`phase17b-content-audit.md`) |
| **CRITICAL** | Legislative churn vs narrative | High enactment frequency, thin post-enactment story hooks | Players see “new law” more than distinct policy arcs |
| **HIGH** | Scandal / ethics arcs | Low live frequency; investigation→referral paths rarely surface | Wave 1 added types but spawn gates + cooldowns limit exposure |
| **HIGH** | Organizations / lobbying | Organizations media category very low vs canon org count | Org lobby templates exist (Wave 2) but outlet pick rates still thin |
| **HIGH** | Executive situations | Catalog grew (17B) but ministry “under pressure” titles can cluster by department | Repetition report: watch `dept=*` dominance clusters |
| **HIGH** | Party priorities | Many entries share `issueBucket=none` organizational pattern | 11/24 priorities — reskin risk for NPC priority picks |
| **MEDIUM** | Courts | `court_decision` moderate frequency; questions generated from titles | Doctrine labels help voice; fact-pattern dossiers still thin |
| **MEDIUM** | Foreign crises | Themed escalation packages distinct; generic diplomatic fallback still possible | Crisis packages ×14 — ensure themes fire in multi-seed runs |
| **MEDIUM** | Campaign situations | 16 templates; predicates vary but title pools overlap | Monitor `eventType` + standing-delta clusters |
| **MEDIUM** | Caucus pressure | Templates wired but require caucus leadership + agenda | Expected “never-fired” until world preconditions match |
| **MEDIUM** | Provincial politics | 21 provinces, 12 bill subjects; few dedicated headline types | Provinces matter mechanically; media still capital-heavy |
| **MEDIUM** | Policy interactions | 14 rules — high leverage, low count | Synergy/strain spikes can feel repetitive if same pairs fire often |
| **LOW** | Platform policy options | 40 options / 8+ issue buckets | Adequate for party org; not a headline driver |
| **LOW** | Campaign strategies | 7 strategies | Mechanical diversity OK; not a content volume problem |
| **LOW** | Constitution subjects | 21 subjects / 79 alt texts | Strong text volume; dispute *scenes* still procedural |
| **LOW** | Biography / NPC careers | 530 figures; generated bio duplication | Quality audit tooling exists; narrative not catalog-driven |

---

## Long-run questions (Phase 17C prep)

Use multi-seed **10–15 year** runs and diff reports (`phase17b-repetition-notes.md`). For each question, track: event-type histogram, catalog-id never-fired list, and cross-seed headline structural diversity.

1. **Governments too stable or too unstable?** — Confidence votes, formation fallbacks, reshuffles, emergency use vs long calm stretches.
2. **Same parties forever?** — Seat share variance, merger/contest frequency, family-link persistence in `history15`.
3. **Caucus splits under-modeled?** — Split/merge commands vs autonomous caucus agenda-only months.
4. **Scandal frequency believable?** — Allegations per term, stage progression to investigation/referral, impeachment grounds consumption.
5. **Court repetition?** — Case-type mix, disposition ratio, repeated law-review targets on the same provision family.
6. **Policy sequence boredom?** — Enactment order correlation (always climate before labor, etc.) from agenda + whip defaults.
7. **Foreign drift?** — Crisis theme rotation, treaty ratification/rejection mix, sanctions imposition/lift cadence.
8. **Provinces matter?** — Provincial bills signed, pressure kinds fired, gubernatorial vs national media share.
9. **NPC careers readable?** — Promotion/retire/cabinet arcs per figure; duplicate bio phrases in audit sample.
10. **History readability?** — Can a player skim 120 months and name three non-bill turning points?

---

## Tooling hooks (already in repo)

| Tool | Purpose |
|------|---------|
| `node scripts/phase17b-content-report.mjs` | Static catalog repetition / reskin clusters → JSON + MD |
| `validatePhase17bContentCatalogs()` | CI id/department guards (`phase17b.content.test.ts`) |
| `docs/qa/phase11_4/repetition-audit.json` | Baseline 36-month frequency probe (compare after 17C runs) |
| Extended Validation configs | Multi-seed history diff (not run in 17B.2 pass) |

---

## Suggested 17C execution order

1. Run whole-game calibration shards with **history export** enabled for media category + event-type histograms.
2. Diff against `repetition-audit.json` baselines; file regressions if `law_enacted` share rises after content expansion.
3. Tune spawn weights / cooldowns only where multi-seed evidence shows **OVERREPRESENTED** patterns (report JSON flags).
4. Add never-fired catalog report from long runs (machine-readable companion to repetition report).
