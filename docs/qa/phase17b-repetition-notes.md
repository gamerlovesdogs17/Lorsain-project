# Phase 17B — variety / repetition notes (dev scale)

**Date:** 2026-09-12  
**Scope:** Lightweight notes after waves 1–2. Heavy two-history difference runs belong in Extended Validation.

## Cooldown behavior

- Shared helper: `packages/sim/src/content/cooldown.ts`
- Wired into: executive situations (`governing/situations.ts`), scandal spawning (`politics/scandals.ts`)
- Templates record last-fired dates in governing/politics metadata; eligibility uses `minMonthsBetween`

## High-frequency risks (monitor in Extended)

| Family | Risk | Mitigation |
|--------|------|------------|
| Generic ministry “under pressure” | Reskin titles | Prefer situation IDs with distinct `when` predicates |
| Media headline branches | Sentence skeleton reuse | Wave 2 added event-type-specific branches |
| Foreign crisis themes | Same escalation tree | Wave 1 crisis packages with theme-specific thresholds |
| Org lobby campaigns | Repeat every few months | Use cooldown when wiring denser spawn rates |

## Never / rarely firing (expected until world state matches)

- Situations gated on new provision options (e.g. gas-bridge + high carbon levy)
- Scandal investigation/referral arcs (low rate, needs allegation first)
- Caucus pressure templates (requires active caucus leadership)

## Reskin findings

- Avoid counting housing/medical funding title variants as new patterns
- Wave 1–2 additions emphasize distinct predicates, doctrines, escalation packages, and stakeholder reactions

## Extended follow-ups (Phase 17C)

- Multi-seed 10–15y history difference report
- Machine-readable never-fired inventory from long runs
- Frequency balancing for any templates that dominate post–content expansion
