/**
 * Shared browser content-path inventory (no Vite import.meta.glob).
 * Globs are relative to apps/game/src/content/ → repo root is ../../../../
 */
export const BROWSER_CONTENT_GLOBS = {
  data: "../../../../data/**/*.{json,md,geojson}",
  maps: "../../../../maps/**/*.svg",
  masterBible: "../../../../PROJECT_MASTER_BIBLE.md",
  azgaarPresence: "../../../../source/azgaar/README.md",
} as const;

/** Manifest paths that are directories; browser proves presence via a marker file. */
export const BROWSER_REFERENCE_DIRECTORY_MARKERS: Record<string, string> = {
  "source/azgaar/": "source/azgaar/README.md",
  "source/azgaar": "source/azgaar/README.md",
};
