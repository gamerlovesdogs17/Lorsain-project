# Phase 11.x final cleanup

Date: 2026-09-06

## Determination

**11.x CLEANUP COMPLETE**

Constitutional operative text now matches runtime for the remaining known contradictions; Why? is wired into Assembly whip lean; EntityLink coverage expanded; inspector QA can open via `qaOpenInspector=1`; Situation Room political layer colors by Governor Party and always shows the dossier panel.

## Fixes

### Constitution truthfulness
- Narrow / standard emergency → post-declaration confirmation within 30 days (clause + mechanics + founding `ART_X_S2_C1`)
- Broad emergency → 90-day initial, no Assembly confirmation, no fake presidential auto-renewal
- Assembly-only → real `emergency_declaration` motion (absolute majority of membership) creating the emergency
- Treaty founding / provincial / 3⁄4 sovereignty claims rewritten to supported Assembly models; founding `ART_XI_S1_C1` updated
- Joint command / executive command clauses rewritten to unilateral-window mechanics
- Party-guided republic wording tied to Article VII single legal Party (no Party-organs-of-state claim)
- `assessConstitutionOrderDependencies` + Constitution browser display

### Why? / EntityLink / inspector / Situation Room
- `explainLegislativeVote` + Assembly WhyPanel on whip lean
- EntityLink in Assembly lean table, History members, Situation Room governor/party
- Inspector opens for QA via session flag / `qaOpenInspector=1`
- Situation Room political fill = Governor Party; empty-state panel always visible; province-selected card

## Tests
- Assembly emergency declaration + clause truth + order dependency in `phase11_4.constitution-exec.test.ts`
