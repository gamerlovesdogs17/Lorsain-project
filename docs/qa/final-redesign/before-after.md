# Final redesign — before / after

Exact SHA for AFTER captures is recorded in `docs/qa/final-redesign/after-manifest.json` when the capture script runs.

## Method

- BEFORE: seeded from prior deterministic QA shots at Phase 11–18 (same visual language as pre-final shell). Paths under `docs/qa/final-redesign/before/`.
- AFTER: `node scripts/final-redesign-qa-capture.mjs` against CURRENT HEAD with Playwright assert-before-capture (no page overflow).

## Major areas

| Area | Before | After | Hierarchy / interaction change |
|------|--------|-------|--------------------------------|
| Home | before/home-1440.png | after/home-desktop-*.png | Political home / command header; pending decisions without advisor panels |
| Assembly | before/assembly-1440.png | after/assembly-desktop-*.png | Chamber identity; bill/amendment procedural workspace; shared whip |
| Campaign | before/campaign-1440.png | after/campaign-desktop-*.png | Candidate identity + map + actions first |
| Party | before/party-1440.png | after/party-desktop-*.png | Party identity banner; caucuses as political blocs |
| Government | before/government-1440.png | after/executive-desktop-*.png | Command workspace; Form a government negotiation |
| Election night | before/election-night-1440.png | after/elections-* | Broadcast stage / map workspace |
| Court | before/courts-1440.png | after/courts-desktop-*.png | Bench + public reputation (no Party membership; no ideology floats) |
| History | before/history-1440.png | after/archive-desktop-*.png | Editorial archive, not debug log |
| Studio (tablet) | before/studio-834.png | (Studio capture in Extended) | Editor-workspace tokens |
| Home phone | before/home-390.png | after/home-phone-*.png | Bottom rail / drawer nav |

## Responsive

Tablet 768 / 834 / 1024 and phone 390 are first-class in AFTER matrix. Desktop-only before shots are not sufficient evidence of tablet readiness.
