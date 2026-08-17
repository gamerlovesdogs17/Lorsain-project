import { buildContentBundle, type ContentFileReader } from "@lorsain/content-loader";
import { BROWSER_REFERENCE_DIRECTORY_MARKERS } from "./inventory.js";

export { BROWSER_CONTENT_GLOBS, BROWSER_REFERENCE_DIRECTORY_MARKERS } from "./inventory.js";

/**
 * Runtime-consumed canon is eager-loaded. Provenance under source/azgaar/ is
 * presence-only (README marker), so the playable app does not bundle 100MB+ of
 * Azgaar exports. Node validation still checks the real directory on disk.
 */
const rawModules = import.meta.glob(
  ["../../../../data/**/*.{json,md,geojson}", "../../../../PROJECT_MASTER_BIBLE.md"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const mapModules = import.meta.glob("../../../../maps/**/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const provenanceMarkers = import.meta.glob("../../../../source/azgaar/README.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function allModules(): Record<string, string> {
  return { ...rawModules, ...mapModules, ...provenanceMarkers };
}

function lookup(relativePath: string): string | undefined {
  const suffix = relativePath.replace(/\\/g, "/");
  for (const [key, value] of Object.entries(allModules())) {
    const normalized = key.replace(/\\/g, "/");
    if (normalized.endsWith(`/${suffix}`) || normalized.endsWith(suffix)) return value;
  }
  return undefined;
}

function pathExists(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (lookup(normalized) != null) return true;
  const marker = BROWSER_REFERENCE_DIRECTORY_MARKERS[normalized];
  if (marker && lookup(marker) != null) return true;
  return false;
}

/** Relative paths the browser reader can currently resolve (for inventory tests). */
export function listBrowserReadableRelativePaths(): string[] {
  const out = new Set<string>();
  for (const key of Object.keys(allModules())) {
    const normalized = key.replace(/\\/g, "/");
    const dataIdx = normalized.lastIndexOf("/data/");
    const mapsIdx = normalized.lastIndexOf("/maps/");
    const bibleIdx = normalized.lastIndexOf("/PROJECT_MASTER_BIBLE.md");
    const azgaarIdx = normalized.lastIndexOf("/source/azgaar/");
    if (dataIdx >= 0) out.add(normalized.slice(dataIdx + 1));
    else if (mapsIdx >= 0) out.add(normalized.slice(mapsIdx + 1));
    else if (bibleIdx >= 0) out.add("PROJECT_MASTER_BIBLE.md");
    else if (azgaarIdx >= 0) out.add(normalized.slice(azgaarIdx + 1));
  }
  return [...out].sort();
}

export function createBrowserContentReader(): ContentFileReader {
  return {
    readText(relativePath: string): string {
      const text = lookup(relativePath);
      if (text == null) throw new Error(`Missing canonical file ${relativePath}`);
      return text;
    },
    exists(relativePath: string): boolean {
      return pathExists(relativePath);
    },
  };
}

export function loadBrowserContentBundle() {
  return buildContentBundle("browser", createBrowserContentReader());
}
