# Party Leadership / Caucuses / Phase 14–16 Results

## Verdicts

| Area | Verdict |
|------|---------|
| Party Leadership | **COMPLETE** (structured priorities, emphasis/planks, strategy catalog, resource allocator, endorsement browser, coalition cards, Chair elections 2.0, real NC votes, VC/Treasurer selection) |
| Caucuses 2.0 | **COMPLETE** (partyMemberSupport, institutional NC weights, growth strategies, primary endorsement effects, form/split/merge/dissolve, active-count fix) |
| Phase 14 | **COMPLETE** (candidate primary maps + Gov/Assembly office nomination contests; QA proves primary with active-campaign fixture) |
| Phase 15 | **COMPLETE** (constitutional eras, precedent links, legacies, election comparison, chronicles, History UI surfaces, multi-seed long-run in Integration) |
| Phase 16 | **PARTIAL→COMPLETE foundation** (existing FA deepened: domestic politics bridge, minister performance, FA desk tabs; not HOI4) |

Phase 17 was **not** started.

## Schema
- `SAVE_SCHEMA_VERSION = 25`
- `migrateSaveV24ToV25` seeds history15 encyclopedia fields + caucus PMS defaults + `dynamicFactions`

## QA
- Script: `scripts/phase16-capture-screenshots.mjs`
- Manifest: `docs/qa/phase16/manifest.json`
- Assert-before-capture, negative asserts, duplicate-hash failure

## Known issues
- Office nominations sync winners but do not fully replace NPC auto-fielding.
- Not every requested QA scenario (Chair ballot live, Caucus merge/split live, 50y History, treaty ratification UI) has a dedicated fixture; engine tests cover mechanics.
- Foreign Affairs remains a political-diplomacy layer on the Phase 10 runtime, not a wargame.
