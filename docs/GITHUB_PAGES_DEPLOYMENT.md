# GitHub Pages deployment

The game is configured for the repository subpath `/Lorsain-project/`.

## Automated deployment

The workflow `.github/workflows/pages.yml` runs on pushes to `main` or `master` and by manual dispatch. It installs pnpm 9.15.9 on Node 22, performs the workspace build with `VITE_BASE_PATH=/Lorsain-project/`, uploads `apps/game/dist`, and deploys through GitHub's Pages action.

In the GitHub repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The expected public address for the current remote is:

`https://gamerlovesdogs17.github.io/Lorsain-project/`

Do not mark the public site validated merely because the workflow exists. Confirm the latest Actions deployment and exercise New Game, End Turn, save/reload, maps, and an election from the public address. Until that live checklist passes, public Pages remains a **RELEASE ACTION**, not a requirement **PASS**.

### Closeout status (2026-09-04)

The public address returned HTTP 200 but still identified itself as the older Phase 10 site. GitHub's dynamic `pages build and deployment` job succeeded for commit `08a1086`, while the repository's explicit **Deploy game to GitHub Pages** workflow failed during its build on the then-current exact-optional-property type error in the public polling layer. That source error is fixed in the closeout worktree and the complete local workspace build passes.

This combination indicates that Pages was still publishing its branch-source configuration rather than the new `apps/game/dist` workflow artifact. The remaining release action is external and deliberate: set Pages Source to **GitHub Actions**, publish the closeout commit, confirm the explicit workflow succeeds, and rerun the public-browser checklist. The faithful local subpath build validates the artifact only — it does **not** prove the older public deployment has updated.

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
