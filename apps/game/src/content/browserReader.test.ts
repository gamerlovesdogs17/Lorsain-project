import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BROWSER_CONTENT_GLOBS, BROWSER_REFERENCE_DIRECTORY_MARKERS } from "./inventory.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const readerSource = readFileSync(
  resolve(fileURLToPath(new URL(".", import.meta.url)), "browserReader.ts"),
  "utf8",
);

describe("browser canonical content inventory", () => {
  it("points Vite globs at the repository data/ and maps/ roots and includes geojson", () => {
    expect(BROWSER_CONTENT_GLOBS.data).toBe("../../../../data/**/*.{json,md,geojson}");
    expect(BROWSER_CONTENT_GLOBS.maps).toBe("../../../../maps/**/*.svg");
    expect(BROWSER_CONTENT_GLOBS.masterBible).toBe("../../../../PROJECT_MASTER_BIBLE.md");
    expect(BROWSER_CONTENT_GLOBS.azgaarPresence).toBe("../../../../source/azgaar/README.md");
    expect(readerSource).toContain("../../../../data/**/*.{json,md,geojson}");
    expect(readerSource).toContain("../../../../maps/**/*.svg");
    expect(readerSource).toContain("../../../../PROJECT_MASTER_BIBLE.md");
    expect(readerSource).toContain("../../../../source/azgaar/README.md");
    expect(readerSource).not.toMatch(/["']\.\.\/\.\.\/\.\.\/data\//);
    expect(readerSource).not.toMatch(/["']\.\.\/\.\.\/\.\.\/maps\//);
  });

  it("covers every manifest authoritative and derived_or_reference path without bundling Azgaar bulk", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, "data/content_manifest.json"), "utf8"),
    ) as {
      authoritative: Record<string, string>;
      derived_or_reference: Record<string, string>;
    };

    for (const rel of Object.values(manifest.authoritative)) {
      if (rel.endsWith(".geojson")) {
        expect(BROWSER_CONTENT_GLOBS.data).toContain("geojson");
      }
      expect(readFileSync(resolve(repoRoot, rel), "utf8").length).toBeGreaterThan(0);
    }

    for (const rel of Object.values(manifest.derived_or_reference)) {
      if (rel === "source/azgaar/" || rel === "source/azgaar") {
        expect(BROWSER_REFERENCE_DIRECTORY_MARKERS[rel]).toBe("source/azgaar/README.md");
        expect(
          readFileSync(resolve(repoRoot, "source/azgaar/README.md"), "utf8").length,
        ).toBeGreaterThan(0);
        expect(readerSource).not.toContain("source/azgaar/**");
        continue;
      }
      if (rel === "PROJECT_MASTER_BIBLE.md") {
        expect(BROWSER_CONTENT_GLOBS.masterBible).toContain("PROJECT_MASTER_BIBLE.md");
        continue;
      }
      expect(readFileSync(resolve(repoRoot, rel), "utf8").length).toBeGreaterThan(0);
    }
  });
});
