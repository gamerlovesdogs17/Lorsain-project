# Phase 17B content inventory (from Phase 17A.2)

Produced for the next saturation pass. Do **not** begin full 17B implementation
until Phase 17A is marked COMPLETE (desktop + 390px Government QA remaining).

## Ranked domains

| Domain | Rank | Notes |
|--------|------|-------|
| Government / executive content | THIN | Mechanics/UI improved; situation content still sparse |
| Cabinet / ministry situations | THIN | Shared workspace foundation only; few ministry-specific events |
| Legislation | ADEQUATE | Assembly UX strong; distinctive bill families uneven |
| Amendments | ADEQUATE | Executable constitution present; package variety limited |
| Implementation complications | THIN | Response commands exist; complication catalog thin |
| Budgets / fiscal conflicts | THIN→ADEQUATE | Envelope vs shares now real; political fiscal events thin |
| Elections | ADEQUATE | Pipeline strong; campaign color thinner than mechanics |
| Campaign events | ADEQUATE | |
| Scandals | VERY THIN | Almost no investigation / resignation content |
| Party leadership | STRONG | |
| Caucus politics | STRONG | |
| Organizations / lobbying | THIN | Scorecards exist; recurring campaigns thin |
| Provinces | ADEQUATE | |
| Courts | ADEQUATE | Precedent storage present; fact-pattern variety limited |
| Constitutional disputes | ADEQUATE | |
| Politician careers / backgrounds | THIN | Generated quality uneven; biographies repetitive |
| Foreign Affairs | ADEQUATE | Architecture strong; crisis templates can repeat |
| News / media | THIN | Structure fingerprinting helps; templates still re-skin |
| Historical templates | ADEQUATE | Phase 15 foundation |

## Content that fires too often

- Generic ministry performance empty / “too early” states after reshuffles
- Near-template news items with collapsed date/number fingerprints
- NPC regulation attempts when ministries rotate frequently

## Content that almost never fires

- Minister scandals / investigations
- Coalition red-line breach events (share shortfall now strains score; little narrative)
- Distinct ministry-domain crises (housing vs defence vs finance)
- Amending-legislation follow-through after implementation `request_amending_legislation`

## Duplicated / reskinned

- Housing-adjacent bills that differ mainly by title
- Foreign crisis labels that recycle stage language
- Court fact patterns with similar warrant/rights framing

## Obvious missing issue families

- Fiscal consolidation politics (austerity bargains, pension fights)
- Migration / housing interaction crises
- Energy security vs climate tradeoffs as cabinet fights
- Judicial appointment scandals tied to confirmation votes

## Systems that go empty after decades

- Promise tracker after early platform items resolve
- Organization campaigns without refresh pools
- Foreign crisis deck if templates are exhausted

## Next prompt focus

Phase 17B content saturation should prioritize: scandals, ministry situations,
implementation complications, fiscal conflict events, and biography/news variety —
without reopening accepted institutional architecture.
