# Repository Review — v0.2 pre-development

The original package was conceptually strong but was **not yet safe to call implementation-ready**. This revision fixes the pre-code integrity issues found during audit.

## Fixed

1. **Constituency/province ambiguity.** 34 of 48 Assembly constituencies cross province boundaries. This is now explicitly canonical and documented. The old misleading `province_id` field has been replaced by `plurality_province_id`, with source-population composition included for every constituency.
2. **Population rounding drift.** Province and constituency baselines now each sum to exactly 72,000,000.
3. **Multiple source-of-truth risk.** `data/content_manifest.json` and `docs/CANONICAL_DATA_CONTRACT.md` now define authoritative vs derived files.
4. **Schema-reference gaps.** World countries now include map IDs, neighbor IDs and alignment IDs; parties point to machine-readable nomination-rule definitions; starting figures include party/faction/home IDs and fixed birth dates.
5. **Confusing city-name collisions.** Several cities that shared the exact name of a different province were renamed while retaining their stable `CITYxx` IDs.
6. **Runtime SVG labeling.** Runtime world/Terena SVGs no longer require static text labels; human-readable labeled reference SVGs remain available.
7. **Validation was too shallow.** `scripts/validate_content.py` now checks exact totals, IDs, references, faction shares, scenario officeholders, constituency province composition and SVG contracts.
8. **Stale raw source duplicate.** The older duplicate `.map` save was removed; the latest canonical editable Azgaar save remains.

## Intentionally not added yet

There is still no React/Vite app, package manager configuration, simulation code, save engine or test framework. That is deliberate. Cursor should first inspect this repository in Plan Mode and propose the architecture before any implementation bootstrap.
