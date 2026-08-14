import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildContentBundle,
  validateAndLoadContent,
  validateCanonicalContent,
  type ContentBundle,
  type ContentFileReader,
  type ValidationReport,
} from "./core.js";

export function createNodeContentReader(repoRoot: string): ContentFileReader {
  return {
    readText(relativePath: string): string {
      return readFileSync(join(repoRoot, relativePath), "utf8");
    },
    exists(relativePath: string): boolean {
      return existsSync(join(repoRoot, relativePath));
    },
  };
}

export function validateCanonicalContentFromRepo(repoRoot: string): ValidationReport {
  return validateCanonicalContent(repoRoot, createNodeContentReader(repoRoot));
}

export function loadContentBundleFromRepo(repoRoot: string): ContentBundle {
  return buildContentBundle(repoRoot, createNodeContentReader(repoRoot));
}

export function validateAndLoadContentFromRepo(repoRoot: string) {
  return validateAndLoadContent(repoRoot, createNodeContentReader(repoRoot));
}
