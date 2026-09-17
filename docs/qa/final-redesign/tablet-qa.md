# Final redesign — tablet QA status

Targets: 768×1024, 834×1194, 1024×768 (portrait and landscape where listed).

## CSS / shell shipped

- Design tokens + tablet breakpoints (1024 / 834 / 768)
- Bottom rail primary destinations (Home, Assembly, Government, Elections, More)
- Drawer nav (not squeezed full desktop sidebar)
- Tab horizontal scroll + ~44px touch targets
- Contained table scroll regions
- 16px inputs (iOS zoom avoidance)
- Safe-area padding for chrome / tutorial coach

## Capture workflow

`node scripts/final-redesign-qa-capture.mjs` includes tablet viewports for major screens.
Asserts no page-level horizontal overflow before screenshot.

## Remaining limitations

- Full manual Safari/iPadOS gesture pass is Extended QA (pinch/pan maps).
- Scenario Studio tablet matrix should be re-run after each Studio layout change.
- Not every inventory detail tab is captured at every tablet size on every commit.
