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
});
