# Phase 11.4 QA evidence

Capture script: `scripts/phase11_4-capture-screenshots.mjs`

Output directory: `docs/qa/phase11_4/final/`

## Expected captures

- `title-1440.png`
- `home-desk-1440.png`, `home-900.png`, `home-390.png`
- `shell-1440.png`
- `campaign-hq-1440.png`
- `elections-1440.png`, `election-night-1440.png`
- `assembly-1440.png`
- `news-front-1440.png`
- `history-wiki-1440.png`
- `party-1440.png`, `organizations-1440.png`, `courts-1440.png`, `economy-1440.png`, `map-1440.png`

## How to regenerate

```bash
# terminal A
pnpm --filter @lorsain/game dev

# terminal B (adjust port/base if needed)
set QA_BASE_URL=http://localhost:5174/Lorsain-project/
node scripts/phase11_4-capture-screenshots.mjs
```

Review screenshots for clipping, hierarchy, map selection, and old/new design mismatch before accepting.
