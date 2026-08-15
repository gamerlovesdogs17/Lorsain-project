# Phase 0b Review Report (integrity pass)

Content version: **0.3.0-predev** (under review — not canonized).
Seed `TERENA-2028-CANON-01` / stream `generation`.

## Candidate identity integrity
- Total 2026 candidates: **1010**
- Politician candidates (resolve to starting_figures): **475** (420 MPs + 55 notable losers)
- Historical-only candidates: **535**
- Dangling candidate references: **0**

## Names / text
- Digit names (figures / historical / election): **0 / 0 / 0**
- `???` / replacement char: **0**
- Surname reuse capped; occasional repeats remain (normal)

## Roster
- Total: **530** · MPs **420** · Governors **21** · Cabinet **12** · Judges **9** · Mayors **12** · Unelected-2026 notables **55**
- AI tiers: rich **316** / standard **207** / light **7**

## Factions (MP means — sample)
Labour Left economic **0.67** vs Reform Labour **0.31**; Workers’ Bloc ISS_LABOR **0.86**.
NU Market economic **-0.51** vs NatCons social **-0.43** / nationalism **0.47**.
CR Liberal social **0.55** / authority **-0.37** vs Moderates social **0.40**.
Green Eco ISS_LABOR **0.60** vs Mainstream **0.38**; both climate ~0.84–0.85.
RL Autonomists ISS_DECENT **0.90**.

## 2026 election
- Seats exact: LAB 128 / NU 110 / CR 69 / GRN 41 / RL 35 / PM 29 / IND 8
- FP: LAB 29.1% · NU 24.0% · CR 14.9% · GRN 11.0% · RL 10.2% · PM 9.1% · IND 1.8%
- National turnout ~**65.5%**; valid **34,766,322**; invalid/blank **457,008**
- Eliminations **578** · first-count elected **24** · after transfer **396** · same-party transfer events **3375** · exhaustion ~**2.2%** · lots **0**

## Court
All 9: exact +12y terms, legal_philosophy, appointing authority.
Vacancies during next presidential term: **2029-06-01**, **2031-03-14**.
Former accidental **2028-08-15** vacancy removed → seat now ends **2034-08-15**.

## Pollsters
House effects = **centered vote-share-point offsets** (`unit: vote_share_points`, `centered: true`, vector sum ≈ 0).

## Validation
build / typecheck / lint / format:check / test (73) / validate:content / recount 48/48 — **PASS**.
Python validator updated; not executed here (no Python runtime).

## Canonization
**Ready for review approval.** Do not treat as committed canon until you say so.
**Phase 1 not started.**
