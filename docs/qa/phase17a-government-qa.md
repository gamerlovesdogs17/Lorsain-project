# Phase 17A Government QA manifest

Mechanical truth: `packages/sim/src/phase17a.government.test.ts` (Vitest).

## Assertion matrix

| Area | Assertion | Mechanical test |
|------|-----------|-----------------|
| Cabinet performance | Early vs scored ministers | `cabinet performance distinguishes early vs scored ministers` |
| Implementation posture | Real governing mutation | `implementation posture change is a real governing response` |
| Budget propose | Persists + reload | `budget proposal mutates executive budget state and survives reload` |
| Budget books | Propose does not change `fiscal.expenditure` | `budget stances produce different totals and projected metadata without changing books` |
| Budget effect | Approved + `processBudgetCycle` applies once | `approved budget applies fiscal expenditure once via processBudgetCycle` |
| Full request | Literal `ministryRequests`; `preferredEnvelope` may be lower; `envelopeConflict` | `full_request uses literal ministry requests and may exceed preferred envelope` |
| Implementation cmd | State + history; auth gate; `increase_resources` spends | `implementation response command changes state and records history` |
| Reshuffle | Officeholder + history | `cabinet reshuffle changes officeholder and records history` |
| Agenda link | No auto-link sole opposition housing bill; `setAgendaItemBill` | `agenda does not auto-link sole opposition housing bill; setAgendaItemBill attaches it` |
| Agenda exact id | Housing B not A | `agenda Open-in-Assembly uses exact billId, never a sibling housing bill` |
| Regulation major | Derived magnitude gate (constrained mandate) | `derived major regulation blocked under constrained_dual_mandate without major flag` |
| Regulation jurisdiction | Interior housing ok; defense rejected | `regulation jurisdiction accepts housing/interior and rejects defense` |
| Amending bill | `metadata.amendmentBillId` + real bill row | `request_amending_legislation creates a bill id on the implementation record` |

Constitution exec (Phase 11.4): `phase11_4.constitution-exec.test.ts` — major regulation blocked via sweeping magnitude (0.8), minor at 0.2.

## UI manifest (capture at release SHA)

Capture script: `scripts/phase17a-government-qa-capture.mjs`  
Fixture builder: `scripts/create-phase17a-government-qa-save.ts` → `docs/qa/phase17a/fixtures/government-browser-save.json`  
Vite QA params: `qaFixture=phase17a-government`, `qaScreen=executive`, `qaPlayer=NPC003` (president after advance).

**Run (dev server must expose `/__qa/fixtures/` — use `pnpm --filter @lorsain/game exec vite` with `VITE_BASE_PATH=/Lorsain-project/`):**

```powershell
$env:VITE_BASE_PATH="/Lorsain-project/"
pnpm --filter @lorsain/game exec vite --port 5177 --host 127.0.0.1
# other terminal:
npx playwright install chromium
$env:QA_DEV_PORT="5177"
node scripts/phase17a-government-qa-capture.mjs
```

Manifest: `docs/qa/phase17a/manifest.json` (PNG sha256, assertions, failures).

### Captured at `c5f0b7e808a0030f2c24a8a9480ca3699a893eb2`

**Note:** `git rev-parse HEAD` at capture time; working tree was **dirty** (uncommitted sim, game, capture script, fixture, PNGs, and docs). Screenshots reflect dev-server assets on disk, not necessarily a clean commit.

| Viewport | File | sha256 | Overflow | Key checks |
|----------|------|--------|----------|------------|
| 1280×720 | `government-overview-1280.png` | `2b6b9baf653f03d60839b1f158b230afcfab22d8c4b093f55a71852454c72c13` | pass | Government, tabs, Head of government |
| 1280×720 | `government-executive-1280.png` | `e4bc922cbf4150dbc01392e18cca4f51b7f4df654162f1981ba6ebc23d6328ab` | pass | Executive power strip |
| 1280×720 | `government-cabinet-minister-1280.png` | `fdd0e272375c7458a2295d9a70b8e4d654d5aafb85fbe66251c48a4c7e638125` | pass | Cabinet rows, minister detail (Minister of Agriculture) |
| 1280×720 | `government-agenda-1280.png` | `92a0828d6b7598206c972c137c508675ee659ef1d71d86efd099f3c618e5be62` | pass | Open in Assembly |
| 1280×720 | `government-implementation-1280.png` | `bd968471195dbb8efd3757ba4f81fbb4c1efddb337e8609ab65098a1a6609122` | pass | Delayed record response actions |
| 1280×720 | `government-budget-1280.png` | `08dde11eaa96a620daf6ec871f560db1df806ed9ed99b8790b900656200c19ab` | pass | Preferred envelope, full request, projected |
| 390×844 | `government-overview-390.png` | `cdf34dda8177588a44afea7cb8e7283088de994d75ba49b097a92bebafda1ee6` | pass | Tabs, no horizontal overflow |
| 390×844 | `government-executive-390.png` | `62933844b4e402bb821af83e0b9df662b0e58b487948983dfbb77df3582675c5` | pass | Tabs, no horizontal overflow |
| 390×844 | `government-cabinet-390.png` | `d4bb79a09c3379b02645e8a726c6fc421952d23bbb869cd31930a85b163d8d68` | pass | Tabs, no horizontal overflow |
| 390×844 | `government-implementation-390.png` | `5f5b8475d43f2c68c56abb818e94bbd383274203546550593d1fd108bf50d941` | pass | Tabs, no horizontal overflow |
| 390×844 | `government-budget-390.png` | `70d22438bd5603d269b9ca8c09003fdcee36766178193472c718c120271157bb` | pass | Tabs, no horizontal overflow |

Manifest: `overflowAssertionsPassed`: **true** (`desktopOverflowPassed`, `mobileOverflowPassed`). Generated `2026-09-12T21:58:14.632Z` against `http://127.0.0.1:5177/Lorsain-project/`.

## Mechanical-only sign-off

Screenshots at HEAD SHA (dirty tree) are present. Also verify:

- All Phase 17A government Vitest cases green
- `pnpm test:smoke` (2y) green on CI seed
- Typecheck / lint for `apps/game/src/executiveScreen.tsx`
