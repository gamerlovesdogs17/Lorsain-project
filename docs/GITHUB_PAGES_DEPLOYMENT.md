# GitHub Pages deployment

The game is configured for the repository subpath `/Lorsain-project/`.

## Automated deployment

The workflow `.github/workflows/pages.yml` runs on pushes to `main` or `master` and by manual dispatch. It installs pnpm 9.15.9 on Node 22, performs the workspace build with `VITE_BASE_PATH=/Lorsain-project/`, uploads `apps/game/dist`, and deploys through GitHub's Pages action.

In the GitHub repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The expected public address for the current remote is:

`https://gamerlovesdogs17.github.io/Lorsain-project/`

Do not mark the public site validated merely because the workflow exists. Confirm the latest Actions deployment and exercise New Game, End Turn, save/reload, maps, and an election from the public address. Until that live checklist passes, public Pages remains a **RELEASE ACTION**, not a requirement **PASS**.

### Closeout status (2026-09-04 / validated 2026-09-05)

Closeout commit `6d81af6` on `main` rebuilt successfully. Explicit **Deploy game to GitHub Pages** run [`33937667191`](https://github.com/gamerlovesdogs17/Lorsain-project/actions/runs/33937667191) **succeeded**. Live public checklist on `https://gamerlovesdogs17.github.io/Lorsain-project/` confirmed the Phase 11.3 title/shell (`THE POLITICAL LIFE OF TERENA`), `/Lorsain-project/assets/…` loads, New Game (Governor), Terena map, Assembly leadership labels, dedicated Caucus workspace, End Turn Worker advance, IndexedDB save, and Resume.

Note: GitHub still also emits the legacy dynamic `pages build and deployment` job alongside the explicit workflow. Prefer **Settings → Pages → Build and deployment → Source → GitHub Actions** so only the `apps/game/dist` artifact path remains authoritative. The live site for `6d81af6` already serves the current game.

## Faithful local smoke test

Build the exact subpath bundle, then serve it with the checked-in Pages-style server:

```powershell
$env:VITE_BASE_PATH='/Lorsain-project/'
pnpm game:build
pnpm preview:pages
```

Open `http://127.0.0.1:4173/Lorsain-project/`. The server deliberately requires the repository prefix and serves the built asset and Worker MIME types rather than silently falling back to `index.html` for missing prefixed assets.

## Why the earlier preview was blank

The application bundle was valid, but a root-style preview fallback answered prefixed asset requests with the HTML entry document. The browser then rejected JavaScript because it received `text/html`. The fix has three parts:

1. Vite emits all entry, chunk, asset, and module-Worker URLs under `/Lorsain-project/`.
2. GitHub Actions builds with the same base and deploys the game distribution directory.
3. The local Pages-style smoke server strips the known prefix and returns the requested file with the correct content type.
