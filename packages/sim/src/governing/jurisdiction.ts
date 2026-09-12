import type { PolicyItem } from "../legislature/types.js";
import type { DepartmentId } from "./types.js";
import {
  departmentForIssue,
  departmentForPolicyItem,
  departmentFromOfficeId,
} from "./departments.js";

/** Whether a ministry office may regulate the given policy items. */
export function ministryMayRegulate(
  ministryOfficeId: string,
  policyItems: readonly PolicyItem[],
): { allowed: boolean; reason?: string; requiredDepartment?: DepartmentId } {
  const ministryDept = departmentFromOfficeId(ministryOfficeId);
  if (!ministryDept) {
    return { allowed: false, reason: "unknown ministry office" };
  }
  for (const item of policyItems) {
    const needed = departmentForPolicyItem(item);
    if (needed !== ministryDept) {
      return {
        allowed: false,
        reason: `${ministryDept} ministry cannot regulate ${item.issueId || item.provisionId || "item"} (belongs to ${needed})`,
        requiredDepartment: needed,
      };
    }
  }
  return { allowed: true };
}

/** Issues a ministry may offer in regulation UI. */
export function issuesForMinistryOffice(ministryOfficeId: string): string[] {
  const dept = departmentFromOfficeId(ministryOfficeId);
  if (!dept) return [];
  const all = [
    "ISS_LABOR",
    "ISS_WELFARE",
    "ISS_OWNERSHIP",
    "ISS_TRADE",
    "ISS_TAX",
    "ISS_HOUSING",
    "ISS_CLIMATE",
    "ISS_LIBERTY",
    "ISS_IMMIGRATION",
    "ISS_POLICING",
    "ISS_DECENT",
    "ISS_EXEC",
    "ISS_REFORM",
    "ISS_DEFENSE",
  ];
  return all.filter((issueId) => departmentForIssue(issueId) === dept);
}
