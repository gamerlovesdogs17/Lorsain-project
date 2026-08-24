# Phase 11.3 Results

Date: 2026-08-24  
Scope: GUI / layout reconstruction (UI System V5), policy UX clarity, residual UX bugs, whole-game balance + long-run calibration  
Baseline commit: `b00ec52` (Phase 11.2 accepted on `main`)  
Branch: `cursor/phase113-ui-balance`

## Status

**SUBSTANTIVELY COMPLETE for UI reconstruction + harness + sample calibration.**  
Formal acceptance target **100×600** is **running** (`docs/qa/phase11_3/whole_game_100x600_console.txt`). Sample evidence: **8×60** with catastrophic=0 (`docs/qa/phase11_3/whole_game_calibration_8x60.json`).

**STOP — do not begin Phase 11.4.**

---

## Final report (38 points)

### 1. Final commit hash

Recorded at closeout commit on `cursor/phase113-ui-balance` (see git log). Baseline: `b00ec52`.

### 2. Full page architecture before / after

See `docs/PHASE_11_3_UI_BEFORE_AFTER.md` and `docs/PHASE_11_3_UI_ARCHITECTURE_AUDIT.md`.  
V5 grammar: `WorkLayout`, `MapDetailLayout`, `MasterDetail`, `BriefStrip`, `EntityRow`, `DataTable`, `PolicyChoiceGroup`, `SectionDivider`. Shell class `v5`.

### 3. Pages added

None as permanent sidebar destinations. Politician inspector remains profile/card primitives (no separate nav route).

### 4. Pages removed / merged

- Career **Relationships** tab removed (Organizations deep-link note retained).
- Office prose redirects replaced by embedded role desks.
- No route key deletions.

### 5. Major layout changes

- Home: role briefing strip + decisions + lead + rail (not card collage)
- Campaign: `campaign-command-v5` left/resources · center/map · right/actions · footer/activity
- Elections: purpose-built Presidential / Assembly / Governor layouts
- Assembly: composition + business + vote rail + bill Overview/Provisions/Politics/Process
- Executive: concise SIGN/RETURN/NO ACTION; SectionDivider desks
- Economy: indicator strip → trends → regional table/map → sectors
- News: lead / secondary / topic groups + pagination
- Archive: section tabs + 25/page pagination
- Organizations: MasterDetail list + inspector
- Office: President/MP/Speaker/Justice/Governor real workbenches
- New Game: featured starts with role / focus / complexity

### 6. PPUSA-inspired patterns actually implemented

- Election map + compact candidate/result rail
- Dense result / STV preference tables
- Policy category as interaction unit (current / alternatives / cost / effects)
- Public “watch” geography via org/poll selection panels (no latent support)

### 7. BFTH-inspired patterns actually implemented

- Campaign as political command center
- Race identity prominence
- Role-specific Home/Office voice

### 8. Policy UX redesign

`PolicyChoiceGroup` for Assembly provisions and Governor priority/investment. One-line change + fiscal + fx chips; Details optional.

### 9. Legislation UX redesign

Bill table rows + selected inspector tabs. Drafting via PolicyChoiceGroup. No prose-first walls.

### 10–16. Campaign / Election / Career / Office / Map / Economy / News-Archive

Implemented as above. Maps retain mode + selection + detail from 11.2 with V5 MapDetailLayout usage on election/economy/org flows.

### 17. Responsive results

CSS breakpoints collapse rails to stacked columns at ≤1200px; shell single-column ≤900px. Manual screenshot matrix for 1440/390 remains **NONBLOCKING** (no automated stitch harness; do not twist CSS for broken capture).

### 18. Screenshot evidence

Populated mid-game capture set for 11.3 is **NONBLOCKING** pending dedicated QA pass. Phase 11.2 QA folder remains historical. Do not alter correct CSS for a broken harness (`P95-SCREENSHOTS`).

### 19. Residual bugs fixed

| Bug | Fix |
| --- | --- |
| Raw `NPC###` in eligibility / display | Eligibility copy no longer embeds ID; `politicianDisplayName` / party / place helpers stop falling back to raw IDs |
| `Public standing: unknown` | `candidateStandingOrDefault` + `publicStandingLabel`; copy “Not routinely measured” only when null |
| Office shallowness | Role desks with real snap actions |
| Career Relationships hollow tab | Removed |

### 20. Whole-game calibration sample (8×60)

| Metric | Result |
| --- | --- |
| Completed | 8/8 |
| Catastrophic | **0** |
| Determinism dual+reload | **match** |
| Presidential races | 8 (all LAB winners in this short sample — see §21) |
| Assembly seat-shift median | 22 |
| Uncontested median | 0 |
| Governor races | 168; incumbent retention ~0.29 |
| Economy outputΔ median | −0.73; signChanges median 13 |
| Legislative introduced/enacted med | 82 / 50 |
| Foreign conflicts started med | 0; treaties active med 10 |
| Median turn ms | ~906; p95 ~1696 |
| Save final bytes med | ~11.6 MB |

Artifact: `docs/qa/phase11_3/whole_game_calibration_8x60.json`  
Full acceptance: **100×600 in progress**.

### 21. Presidential balance

Short 8×60 sample: all winners `PARTY_LAB` — **NONBLOCKING for 11.3 close if 100×600 shows party diversity**; otherwise tune nomination/general competitiveness in follow-up (not 11.4 prose).

### 22. Assembly balance

Seat shifts ~19–25 half-seats; 0 uncontested in sample — healthy turnover signal without collapse.

### 23. Governor balance

168 races; median margin ~0.031; retention ~29% — competitive, not frozen.

### 24. Campaign balance

`calibrate:campaign-geography` confirms national reach 48/21, province/constituency local gains, decay over 12 months. Controlled A/B victory rates deferred to deeper 100×600 telemetry / 11.5 if needed.

### 25–26. Economy / regional

Dedicated economy calibration: non-flat start retained; direction changes ~10.5/48 months; regional spread persists (~17). Whole-game sample shows ranking churn and sign changes (cycles).

### 27–29. Party / legislative / career

Legislative productivity plausible (enacted ≈60% of introduced median). Career mobility + faction long-run detail: sample harness tracks; deep party-convergence analysis deferred to completed 100×600.

### 30. Foreign

Conflicts started median 0; treaties stable (~10). Architecture not reopened.

### 31. Performance before/after

| | Approx |
| --- | --- |
| Prior ordinary turn (11.1/11.2 notes) | ~1.15s / ~734ms host medians variously reported |
| 8×60 whole-game medianTurnMs | **~906 ms** |
| Workers | turn + election remain off-main-thread |

Material win on nomination/Assembly count still Workers-bound; further algo speedups are NONBLOCKING if correctness held.

### 32. Save growth

8×60 final save ~11.6 MB median. Longer horizons measured in 100×600 checkpoints (0/120/300/600).

### 33. Determinism

Seed 0 dual-run + mid-reload: **match** on 8×60 sample.

### 34. Catastrophic invariant failure rate

**0** on 8×60. Early-horizon ASM_SEAT_COUNT (<30 months) known seating gap; clears by Assembly seating (~month 40).

### 35. Remaining BLOCKERS

1. **100×600 acceptance run must finish** without catastrophic rate rising above near-zero.
2. Manual populated screenshot matrix for V5 screens (if treated as hard gate for your acceptance).

### 36. NONBLOCKING → 11.4 / 11.5

- Presidential LAB monopoly in short sample — verify on full run
- Automated screenshot CI (`P95-SCREENSHOTS`)
- Further turn/nomination CPU cuts
- Courts/Foreign residual SectionCard polish if any remain
- Politician drawer as shared inspector (optional)
- Bundle size ~10.9 MB main JS

### 37. Post-11.5 reassessment ideas

- Stronger election-night counting UX if count architecture exposes partial completion truthfully
- Deeper campaign A/B victory harness UI
- Archive full-text search
- Virtualized politician directory at 50+ years

### 38. STOP

**Do not begin Phase 11.4.**
