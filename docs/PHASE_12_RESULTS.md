# Phase 12 Political Life & NPC Agency — Results

Date: 2026-09-06

## Determination

**PHASE 12 COMPLETE** — intentions become real actions under the monthly political-agency hook.

NPC careers file candidacies and mark cabinet willingness; recruitment classifies countback vs election seats; platforms nudge on defeat; coalitions negotiate with terms that feed caucus/cabinet; org campaigns write bill pressure; party merge marks defunct successors; autonomous audits bound activity; Assembly Why panels use `explainLegislativeVote` (same engine as floor votes).

## Delivered

### Sim module `packages/sim/src/politics/`

| File | Role |
| --- | --- |
| `types.ts` | `Phase12Runtime`, ambition stages, open-seat categories, family links, audit bounds |
| `state.ts` | `ensurePoliticsRuntime`, parse, empty seed |
| `careers.ts` | Stages considering→…→won/lost; real assembly/presidential/governor filing; `willingCabinet` |
| `recruitment.ts` | Countback skip + upcoming/future/by-election recruit; expanded scoring |
| `leadership.ts` | Support-bloc notes + NPC endorsements on contests |
| `caucusAgenda.ts` | `priorityBillIds` + optional leadership/platform/coalition fields |
| `platforms.ts` | Electoral-defeat position nudge then `recordPartyPlatform` |
| `lifecycle.ts` | Split/merge/formation; defunct absorb + `partyFamilyHistory` |
| `memory.ts` | Alliance/rivalry from repeated endorsements/challenges |
| `cabinet.ts` | Contextual reshuffle reasons in History payload |
| `organizations.ts` | Scorecards + campaigns → `billPressure` / relationship deltas |
| `coalitions.ts` | Multi-option scoring, negotiation, terms → caucus/cabinet |
| `agency.ts` | `processPoliticalAgencyMonth` orchestrator |
| `explain.ts` | `explainEndorsement` / `explainLeadershipSupport` |
| `index.ts` | Public exports |

### Engine / save

- Monthly pipeline: party → **political_agency** → organizations (unchanged placement in `engine.ts`)
- `SimState.politicsRuntime`; schema **20**; migration seeds empty runtime
- `PARTY_STATUSES` includes `defunct`
- `chooseMinisterAppointment` prefers willing MPs + coalition shares
- Public APIs exported from `packages/sim/src/index.ts`

### Tests

- `packages/sim/src/phase12.agency.test.ts` — careers stages, willingness, countback classification, merge/defunct, formation, platform nudge, cabinet reason, coalitions, autonomy, idempotency
- `packages/sim/src/phase12.autonomous-audit.test.ts` — 3×24m + 2×60m seeds; documented `AS_AUDIT_BOUNDS_*`; exports `PHASE12_AUTONOMOUS_AUDIT_METRICS`

### Documented autonomous bounds

| Window | Career | Recruit | Open seat | Caucus | Reshuffle | Lifecycle | Org campaigns | Meaningful |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 24m | 1–200 | 0–100 | 0–120 | 0–160 | 0–6 | 0–3 | 0–80 | ≥1 |
| 60m | 2–480 | 0–240 | 0–280 | 0–400 | 0–12 | 0–5 | 0–180 | ≥3 |

### UI (minimal, prior)

- Home: opposition leader / coalition / open seats / leadership contests
- Politician dossier: ambition + recent political memories
- Party page: leadership contest + lifecycle cooldown status

## Known limitations (non-blocking)

- Full coalition-formation UX / universal Why panels remain light product surface
- Governor path uses existing `fileGubernatorialCandidacy` when filing is open
- No Phase 13/14 budget/macro/foreign overhaul

## Verdict

> **PHASE 12 COMPLETE** for political agency: the world moves without the player, and career/recruitment/platform/coalition/cabinet/org verbs mutate live state (not history-only nouns).
