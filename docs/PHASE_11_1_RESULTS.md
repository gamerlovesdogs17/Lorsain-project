# Phase 11.1 Results — Full-game integration & deep playtest

**Commit baseline:** `2d00d53` (Phase 10.2 accepted)  
**Phase 11.1 closeout:** see git log for this commit  
**Do not start Phase 11.2 from this document alone.**

## Verdict

Phase 11.1 **completes** the integration foundation for v1 multi-cycle play:

- 2028→2029 presidential path remains deterministic with save/reload
- Sitting President leaving office remains playable (Mara Velic)
- **2030 Assembly election is now resolvable** (former multi-cycle blocker)
- Catastrophic invariants hold across a 36-month integrated MP run
- Web Worker **not** implemented (no evidence of mandatory UI freeze)
- Visual polish / balance / newspaper prose deferred to later 11.x

## Roles exercised

| Role | ID | Horizon | Method |
| --- | --- | --- | --- |
| Ordinary MP | NPC146 (Adrian Joric) | 2028-01 → ≥2030-12 | Automated integration harness |
| Sitting President | NPC001 (Mara Velic) | 2028-01 → ≥2029-02 | Automated continuity test |
| Presidential contender / Governor | NPC003 (Ana Mirev) | Campaign declare/fundraise | Existing playable-path + prior phase |
| Court justice | NPC020 / NPC991–998 | Depth sample | PARTIAL — role exists; no new court content |

## Election cycles tested

1. **2028 presidential** — resolve IRV, Jan 2029 assumption, Mara out of office  
2. **2030 Assembly** — `RESOLVE_ASSEMBLY_ELECTION` national STV field, June 1 seating, next election scheduled (2034)  
3. **Next presidential calendar** — still scheduled by existing assumption logic (not fully UI-playtested through 2033)

## Blockers discovered & fixed

| ID | Issue | Fix |
| --- | --- | --- |
| P111-ASM-2030 | `ASSEMBLY_ELECTION_DUE` had no resolver → multi-cycle dead end | `resolveAssemblyElection` + `ASSEMBLY_ASSUMPTION_DUE` auto-apply, UI resolve button, save validation for national parent elections |
| P111-ASM-FIELD | Challengers claimed incumbents of later constituencies | Incumbent reservation + single-constituency candidacy |
| P111-ASM-IND | Independent incumbents lacked publicIdeology | Snapshot ideology from agent profiles |
| P111-ASM-DRES | Assumption event lacked DomainResolutionRecord | `assembly_assumption` domain type |

## Unresolved BLOCKERS

None for the Phase 11.1 completion standard.

## NONBLOCKING debt → later 11.x

| ID | Defer to | Item |
| --- | --- | --- |
| P7-WORKER | 11.2/perf | Worker still unused; ordinary months ~0.7s median on this host (above aspirational 250ms, not UI-breaking) |
| P9-BUNDLE-SIZE / P10-WORLD-BUNDLE | 11.2 | Production JS ~10.5 MB |
| P4-ASM-2030 remainder | 11.3/content | Assembly campaigns / nomination contests still light; resolver uses incumbents + membership-party challengers |
| P8-* court depth | 11.4 | No full doctrine/UI search |
| P96-NEWS-PROSE | 11.4 | Newspaper prose |
| P71-UI-POLISH | 11.2 | Visual redesign |
| On-disk migration fixtures | 11.x | Still synthetic schema downgrades |
| Deep Archive wiki | 11.2/11.4 | Functional history, not encyclopedia polish |

## Save/reload matrix

| Moment | Result |
| --- | --- |
| Mid-2028 continuous vs reload | PASS (hash match) |
| Around presidential resolution | PASS |
| Post Jan 2029 | PASS |
| Post 2030 Assembly seating | PASS |
| 36-month horizon with checkpoints | PASS (`finalHash === reloadHash`) |

## Determinism

- Dual-run MP seed `P11-MP-2029` → identical hashes after 2029 transition  
- `runDeterministicHorizon` seed `P11-DET-MP`, 36 months, checkpoints including 2030-07-01 → matching final hash after reloads  

## Performance (this host)

| Metric | Value |
| --- | --- |
| Ordinary month median | ~734 ms |
| Ordinary month max (sample) | ~1169 ms |
| Assembly national resolve | ~11.6 s |
| Target (docs) | <250 ms ordinary / <1 s ordinary election |

Ordinary months exceed the aspirational 250 ms target on this machine but remain interactive. Assembly STV across 48 constituencies is a known heavy count (~12 s) — acceptable for rare domain resolution; worker deferred.

## Bundle size

- `apps/game/dist/assets/index-*.js` ≈ **10.5 MB** (gzip ≈ 2.4 MB)  
- CSS ≈ 18 KB  

No code-split in 11.1.

## Long-run invariants

`assertCatastrophicInvariants` checks:

- 420 sitting Assembly members (unique politicians)  
- Exactly one presidential authority  
- Player ID resolves  
- 48 foreign countries  
- Cabinet size 12  
- Membership-party leaders alive  
- Finite economy indices  

All PASS on integrated runs after Assembly seating.

## Validation commands

Run at closeout:

- `pnpm build`
- `pnpm test` (expect known `P10-VITEST-TIMEOUT` after pass)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm validate:content`
- `pnpm validate:phase0b:recount`
- `pnpm game:build`
- `pnpm calibrate:foreign`
- `pnpm exec vitest run packages/sim/src/phase11.integration.test.ts`

## Screenshot list

Automated harness evidence substituted for full marketing screenshots in 11.1. Manual browser confirmation retained from Phase 10.2 overlay fix; additional populated screenshots are recommended in 11.2 visual pass:

- Mid-campaign candidate  
- Presidential result  
- Jan 2029 transition  
- MP Assembly business  
- President desk  
- Court case (if active)  
- Economy / Organizations / News  
- Foreign Affairs crisis  
- Archive multi-event  
- Post-2030 map representation  

## Next recommended subphase

**Phase 11.2 — UI/UX visual polish** (typography, layout, empty states, optional map/bundle lazy-load), without new simulation systems.
