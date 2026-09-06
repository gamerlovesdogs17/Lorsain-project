# News repetition audit (Phase 11.4 / PRIORITY 9)

Generated: 2026-09-06T03:03:09.285Z

## Method

- Seed: `P114-REPETITION-AUDIT-2030`
- Advance integrated Terena world **36 months**
- Collect each media story once (by story id)
- Metrics: total / unique exact / unique structural / extras / **recent-window (8) exact duplicates**
- Distributions: headline family (`category:eventStem`), outlet, category, article body structure

Re-run:

```bash
pnpm --filter @lorsain/content-loader exec tsx ../../scripts/phase11_4-repetition-audit.mjs
```

## Results (this run)

| Metric | Value |
| --- | ---: |
| Total stories | 340 |
| Unique exact | 177 |
| Unique structural | 117 |
| Exact duplicate extras | 163 |
| Structural duplicate extras | 223 |
| Recent-window (8) exact dupes | 3 |
| Banned narrative fragments | 0 |

### Headline families (top)

- `government:law_enacted`: 122
- `politics:bill_signed`: 39
- `courts:court_decision`: 27
- `elections:presidential_election`: 20
- `politics:presidential_assumption`: 14
- `foreign:treaty_ratified`: 13
- `foreign:treaty_proposed`: 12
- `politics:party_contest`: 12
- `politics:office_term`: 11
- `government:bill_introduced`: 10
- `politics:bill_floor`: 9
- `courts:judge_confirmed`: 7

### Outlets

- `MED_EXC`: 68
- `MED_REC`: 68
- `MED_TPS`: 68
- `MED_CST`: 34
- `MED_DIR`: 34
- `MED_LED`: 34
- `MED_WRK`: 34

### Categories

- `government`: 139
- `politics`: 109
- `courts`: 34
- `elections`: 30
- `foreign`: 25
- `organizations`: 3

### Article body structures

- `consequence_first`: 80
- `event_first`: 72
- `political_reaction`: 66
- `regional`: 63
- `institutional`: 59

### Sample headlines

- Government tables budget for 2028
- Budget for 2028 ignites a capital spending fight
- Government tables the annual budget for 2028
- Election campaign activity continues
- Budget for 2028 faces immediate scrutiny
- Fiscal plan reaches the Assembly floor
- Campaign organizations keep working the field
- Spending outline enters the public record
- Candidates maintain their public schedules
- Treasury presents a measured fiscal plan
- Terena–United Provinces of Kraker Trade Accord ratified
- Terena–United Provinces of Kraker Trade Accord ratified amid fanfare
- Institutions finalize Terena–United Provinces of Kraker Trade Accord
- Assembly passes new legislation
- Ratification completes Terena–United Provinces of Kraker Trade Accord
- Valen notes foreign development (2028-02-01)

## Interpretation

- Prefer **recent-window duplicates** near zero; long-run exact extras can still rise when the same institutional beat recurs months apart.
- Structural unique should track closer to exact unique after template diversity work.
- Full JSON: `docs/qa/phase11_4/repetition-audit.json`
