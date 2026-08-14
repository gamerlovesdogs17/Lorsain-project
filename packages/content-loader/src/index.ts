/**
 * Browser-safe content-loader entry.
 * No node:* imports. Use `@lorsain/content-loader/node` for filesystem adapters.
 */
export {
  buildContentBundle,
  validateAndLoadContent,
  validateCanonicalContent,
  type ContentBundle,
  type ContentFileReader,
  type ContentIndex,
  type ParsedAuthoritativeContent,
  type ValidationIssue,
  type ValidationReport,
} from "./core.js";
