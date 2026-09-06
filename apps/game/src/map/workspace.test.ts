import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

describe("shared political map workspace", () => {
  it("uses a compact pinned card and a full drawer instead of a permanent side rail", () => {
    const kit = readFileSync(join(root, "../ui/kit.tsx"), "utf8");
    const css = readFileSync(join(root, "../styles.css"), "utf8");
    expect(kit).toContain("PoliticalMapWorkspace");
    expect(kit).toContain("map-pinned-card");
    expect(kit).toContain("map-detail-drawer");
    expect(css).toMatch(/\.map-pinned-card\s*\{[\s\S]*?position:\s*absolute/);
    expect(css).toMatch(/\.map-detail-drawer\s*\{[\s\S]*?position:\s*fixed/);
    const layoutRule = css.match(/\.map-detail-layout\s*\{[^}]*\}/)?.[0] ?? "";
    expect(layoutRule).not.toContain("grid-template-columns");
  });

  it("disables global focus outlines on SVG map hit-targets (prevents viewBox bullseye)", () => {
    const css = readFileSync(join(root, "../styles.css"), "utf8");
    expect(css).toMatch(/\.terena-map\s+\*:focus-visible[\s\S]*?outline:\s*none\s*!important/);
    expect(css).toMatch(
      /\.terena-map\s+\[role="button"\]:focus-visible[\s\S]*?outline:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /\.world-map\s+\[role="button"\]:focus-visible[\s\S]*?outline:\s*none\s*!important/,
    );
    const terena = readFileSync(join(root, "TerenaMap.tsx"), "utf8");
    const world = readFileSync(join(root, "WorldMap.tsx"), "utf8");
    expect(terena).toContain('style={{ outline: "none" }}');
    expect(world).toContain('style={{ outline: "none" }}');
    // SVG geographic viewBox makes native focus rings continent-sized — keep hit targets
    // out of the tab order (pointer/click selection remains).
    expect(terena).toMatch(/tabIndex=\{-1\}/);
    expect(world).toMatch(/tabIndex=\{-1\}/);
    expect(terena).not.toMatch(/tabIndex=\{0\}/);
    expect(world).not.toMatch(/tabIndex=\{0\}/);
  });
});
