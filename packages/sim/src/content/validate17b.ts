import { DEPARTMENT_IDS } from "../governing/types.js";
import { EXECUTIVE_SITUATIONS } from "../governing/situations.js";
import { ORG_LOBBY_CAMPAIGN_TEMPLATES } from "../partyOrg/catalog.js";
import { CAMPAIGN_SITUATIONS } from "../campaigns/situations.js";

export type ContentValidationIssue = { catalog: string; id: string; message: string };

const VALID_DEPARTMENTS = new Set<string>(DEPARTMENT_IDS);

function assertUniqueIds(
  catalog: string,
  ids: string[],
  issues: ContentValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ catalog, id, message: "duplicate id" });
    }
    seen.add(id);
  }
}

/** Lightweight Phase 17B catalog checks for CI. */
export function validatePhase17bContentCatalogs(): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];

  assertUniqueIds(
    "EXECUTIVE_SITUATIONS",
    EXECUTIVE_SITUATIONS.map((s) => s.id),
    issues,
  );
  for (const sit of EXECUTIVE_SITUATIONS) {
    if (!VALID_DEPARTMENTS.has(sit.departmentId)) {
      issues.push({
        catalog: "EXECUTIVE_SITUATIONS",
        id: sit.id,
        message: `invalid departmentId: ${sit.departmentId}`,
      });
    }
    if (sit.titles.length === 0) {
      issues.push({ catalog: "EXECUTIVE_SITUATIONS", id: sit.id, message: "missing titles" });
    }
  }

  assertUniqueIds(
    "ORG_LOBBY_CAMPAIGN_TEMPLATES",
    ORG_LOBBY_CAMPAIGN_TEMPLATES.map((t) => t.id),
    issues,
  );

  assertUniqueIds(
    "CAMPAIGN_SITUATIONS",
    CAMPAIGN_SITUATIONS.map((s) => s.id),
    issues,
  );

  return issues;
}
