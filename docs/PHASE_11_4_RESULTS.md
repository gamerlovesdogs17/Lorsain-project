# Phase 11.4 completion status

Date: 2026-09-05

## Phase 11.3

**ACCEPTED** (unchanged). Functional acceptance remains on the `f817f01` lineage.

## Determination

**Phase 11.4 NOT YET ACCEPTED**

This correction pass rebuilt the Constitution and legislative policy models conceptually, but acceptance still waits on:

- finishing catalog migration so most policy subjects leave the old two-proposal (formerly less/keep/more) shape;
- deeper ordinary-law constitutionality gates;
- fuller election/nomination enforcement under every constitutional order mode;
- Priority 2 playability depth and headline uniqueness from the prior pass.

## Correction pass (Constitution + Law) — what changed

### Legislative policy model
- `current: true` proposals removed; founding baselines use `founding: true`
- Current law is derived from enacted state via `currentProvisionOption`
- Fake “Keep …” proposal labels removed (audit: `keepCurrentLabels: 0`)
- Bill max provisions raised to 8; no-op current-law choices rejected
- Bill builder UI shows CURRENT LAW separately; effect chips use neutral `flat` tone
- NPC introduce path skips founding / current options
- Expanded multi-option catalogs for bargaining, rail, child benefit, trade safeguards, housing, clean power

### Constitutional model
- New `ConstitutionChangeSubject` / alternatives catalog covering **all Articles I–XII** (`constitutionChanges.ts`)
- Live `ConstitutionalOrderState` (`constitutionalOrder.ts`) with party system, election modes, amendment process, clause text overrides
- Single amendment path: `PROPOSE_CONSTITUTIONAL_PACKAGE` (free-text path returns `STRUCTURED_CONSTITUTIONAL_AMENDMENT_REQUIRED`)
- Document-first UI (`constitutionBrowser.tsx`): subject + alternative dropdowns, inline red/green preview, multi-change packages
- Article VII can enact `single_legal_party`; nomination filtering via `partyAllowedUnderConstitution`
- Article XII alternatives alter future Assembly/provincial thresholds
- Save schema **19** with `migrateSaveV18ToV19`

### Audits / tests
- `scripts/audit-policy-constitution.mjs` → `docs/qa/phase11_4/policy-constitution-audit.json`
- `packages/sim/src/phase11_4.constitution-law.test.ts`

### Remaining gaps (why still not accepted)
- ~34 of 50 policy subjects still have only **2** proposal options after excluding founding baselines
- Only ~1 numerical/threshold control type is richly used; more should become numeric/duration/threshold controls
- Ordinary legislation is not yet fully blocked by constitutional competence/party-system rules in the bill introducer
- Some constitutional order fields affect metrics/eligibility more than full election algorithms
- Screenshot recapture for the new builder flows may still be pending after this pass

## Audit snapshot

See `docs/qa/phase11_4/policy-constitution-audit.json`.

- Legislation: 50 subjects, 0 `current:true`, 0 Keep labels, varied option counts (2 / 3 / 4 / 5+)
- Constitution: 12/12 Articles amendable, 21 structured subjects, no Article marked text-only

## Screenshot evidence

`docs/qa/phase11_4/final/` — prior Priority 1 shots remain; correction-pass captures include (when regenerated):

- `constitution-1440.png`
- `constitution-diff-1440.png` / `constitution-one-party-1440.png`
- `constitution-article-vii-1440.png` / `constitution-article-xii-1440.png`
- `constitution-package-1440.png`
- `bill-builder-*.png`

## Save compatibility

- Schema 18 → 19 migration seeds `constitutionalOrder` and preserves historical amendments
- Legacy numeric `PROPOSE_CONSTITUTIONAL_AMENDMENT` still works for old four rules
- Provision option IDs retained where renamed only for labels/founding flags

## Feature revert map (correction pass)

Suggested logical commits (create in order if not already split):

1. Legislative founding/current-law model + procedure/UI
2. Provision catalog expansions
3. Constitutional order + change definitions
4. Package proposal / ratification / one-party mechanics
5. Constitution document UI
6. Tests + schema 19 migration + audit/docs

## Deferred (not Phase 11.5 started)

- Global map-centric shell
- Full court precedent engine
- Complete catalog numeric redesign for all 50 subjects
- Perfect constitutionality matrix for every ordinary law

Phase 11.5 has not begun.
