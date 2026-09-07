# Phase 15 QA screenshots

Capture script: `scripts/phase15-capture-screenshots.mjs`

Output: `docs/qa/phase15/final/`  
Manifest: `docs/qa/phase15/manifest.json`

Requires Vite at `http://localhost:5174/Lorsain-project/` (override with `QA_BASE_URL`).

## Assert-before-capture rule

**Every screenshot must pass DOM assertions before the PNG is written.**

1. Navigate with `qaFixture=institutions` and the target `qaScreen`.
2. Interact (tabs, province click) as needed for that shot.
3. Run locator / text / count checks that prove the intended UI is on screen.
4. **Only if assertions pass** — write the PNG named for that shot.
5. If assertions fail — **throw / skip write**. Never save a file whose name claims content that was not proven (no misleading filenames).

This prevents phase14-style false evidence where several distinct filenames were copies of the same generic page.

## Manifest

After a successful run, `manifest.json` lists each shot:

```json
{
  "shots": [
    {
      "file": "party-overview-1440.png",
      "screen": "party-overview",
      "assertions": ["…"],
      "ok": true,
      "sha256": "…",
      "bytes": 12345
    }
  ]
}
```

## Duplicate detection

Required shots must be **visually distinct** unless explicitly allowlisted.

If two required shots share the same `sha256`, the script exits `1` unless that sorted pair is in `ALLOW_DUPES` inside the capture script.

## Required inventory

| Screen id | File | Assert (summary) |
|---|---|---|
| party-overview | `party-overview-1440.png` | Party / Labour / Overview |
| party-leadership | `party-leadership-1440.png` | Leadership tab → National Chair / Leadership |
| national-committee | `national-committee-1440.png` | National Committee / Committee |
| caucuses-overview | `caucuses-overview-1440.png` | Caucuses tab → Membership / Caucus / % |
| assembly-delegation | `assembly-delegation-1440.png` | Assembly + Whip / Floor / Delegation |
| whip-desk | `whip-desk-1440.png` | Whip controls if present, else chamber |
| candidate-primary-map | `candidate-primary-map-1440.png` | Primary / Nomination / polling — fail if unproven |
| home-2 | `home-2-1440.png` | Action / Briefing |
| government-2 | `government-2-1440.png` | Government + gov tabs |
| history-15 | `history-15-1440.png` | History |
| situation-map-selected | `situation-map-selected-1440.png` | Province dossier after click (no bullseye required) |
| mobile-party | `mobile-party-390.png` | Party at 390px |

## Run

```bash
node scripts/phase15-capture-screenshots.mjs
```
