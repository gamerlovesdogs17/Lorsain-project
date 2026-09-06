import type { PolicyItem } from "../legislature/types.js";
import type { DepartmentId } from "./types.js";

/** Map Cabinet portfolio / office id suffixes to department ids. */
export const DEPARTMENT_OFFICE_IDS: Record<DepartmentId, string> = {
  finance: "OFFICE_MINISTER_FINANCE",
  labour: "OFFICE_MINISTER_LABOUR",
  health: "OFFICE_MINISTER_HEALTH",
  education: "OFFICE_MINISTER_EDUCATION",
  interior: "OFFICE_MINISTER_INTERIOR",
  justice: "OFFICE_MINISTER_JUSTICE",
  transport: "OFFICE_MINISTER_TRANSPORT",
  energy: "OFFICE_MINISTER_ENERGY",
  foreign: "OFFICE_MINISTER_FOREIGN",
  defense: "OFFICE_MINISTER_DEFENSE",
  economy: "OFFICE_MINISTER_ECONOMY",
  agriculture: "OFFICE_MINISTER_AGRICULTURE",
};

const ISSUE_DEPARTMENT: Record<string, DepartmentId> = {
  ISS_LABOR: "labour",
  ISS_WELFARE: "health",
  ISS_OWNERSHIP: "economy",
  ISS_TRADE: "economy",
  ISS_HOUSING: "interior",
  ISS_CLIMATE: "energy",
  ISS_LIBERTY: "justice",
  ISS_IMMIGRATION: "interior",
  ISS_POLICING: "interior",
  ISS_DECENT: "interior",
  ISS_EXEC: "justice",
  ISS_REFORM: "justice",
  ISS_DEFENSE: "defense",
};

const PROVISION_DEPARTMENT: Record<string, DepartmentId> = {
  PROV_UNEMPLOYMENT_INSURANCE: "labour",
  PROV_PAID_LEAVE: "labour",
  PROV_MINIMUM_WAGE: "labour",
  PROV_BARGAINING_SCOPE: "labour",
  PROV_CHILD_BENEFIT: "health",
  PROV_HEALTH_FINANCING: "health",
  PROV_PRIMARY_CARE: "health",
  PROV_HIGHER_ED_AID: "education",
  PROV_SCHOOL_MEALS: "education",
  PROV_INCOME_TAX: "finance",
  PROV_CORPORATE_TAX: "finance",
  PROV_ESTATE_TAX: "finance",
  PROV_RAIL_OWNERSHIP: "transport",
  PROV_INFRASTRUCTURE_BANK: "transport",
  PROV_ENERGY_MARKET: "energy",
  PROV_GRID_INVESTMENT: "energy",
  PROV_NUCLEAR_POLICY: "energy",
  PROV_CARBON_PRICE: "energy",
  PROV_STRATEGIC_TARIFFS: "economy",
  PROV_HOUSING_APPROVALS: "interior",
  PROV_PUBLIC_HOUSING: "interior",
  PROV_IMMIGRATION_PATH: "interior",
  PROV_POLICING_MODEL: "interior",
  PROV_SURVEILLANCE_WARRANT: "justice",
  PROV_REPRODUCTIVE_LAW: "justice",
  PROV_DEFENSE_READINESS: "defense",
  PROV_ELECTION_ADMIN: "justice",
  PROV_ELECTORAL_FORMULA: "justice",
  PROV_DONOR_DISCLOSURE: "justice",
  PROV_REVENUE_DISCRETION: "finance",
  PROV_ELECTRICITY_MARKET: "energy",
};

export function departmentForIssue(issueId: string): DepartmentId {
  return ISSUE_DEPARTMENT[issueId] ?? "economy";
}

export function departmentForProvision(provisionId: string): DepartmentId {
  if (PROVISION_DEPARTMENT[provisionId]) return PROVISION_DEPARTMENT[provisionId]!;
  if (provisionId.includes("TAX") || provisionId.includes("REVENUE")) return "finance";
  if (
    provisionId.includes("LABOR") ||
    provisionId.includes("WAGE") ||
    provisionId.includes("LEAVE")
  )
    return "labour";
  if (provisionId.includes("HEALTH") || provisionId.includes("CARE")) return "health";
  if (provisionId.includes("SCHOOL") || provisionId.includes("EDUC")) return "education";
  if (
    provisionId.includes("ENERGY") ||
    provisionId.includes("CLIMATE") ||
    provisionId.includes("CARBON")
  )
    return "energy";
  if (
    provisionId.includes("RAIL") ||
    provisionId.includes("TRANSPORT") ||
    provisionId.includes("INFRA")
  )
    return "transport";
  if (provisionId.includes("DEFENSE") || provisionId.includes("WAR")) return "defense";
  if (
    provisionId.includes("JUSTICE") ||
    provisionId.includes("COURT") ||
    provisionId.includes("ELECT")
  )
    return "justice";
  if (provisionId.includes("AGRI") || provisionId.includes("FARM")) return "agriculture";
  return "economy";
}

export function departmentForPolicyItem(item: PolicyItem): DepartmentId {
  if (item.provisionId) return departmentForProvision(item.provisionId);
  return departmentForIssue(item.issueId);
}

/** Primary owning department for a multi-item law (majority vote, ties → first). */
export function departmentForLawItems(items: PolicyItem[]): DepartmentId {
  if (items.length === 0) return "economy";
  const counts = new Map<DepartmentId, number>();
  for (const item of items) {
    const d = departmentForPolicyItem(item);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: DepartmentId = departmentForPolicyItem(items[0]!);
  let bestN = -1;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

export function ministryOfficeForDepartment(departmentId: DepartmentId): string {
  return DEPARTMENT_OFFICE_IDS[departmentId];
}

export function departmentFromOfficeId(officeId: string): DepartmentId | null {
  for (const [dept, oid] of Object.entries(DEPARTMENT_OFFICE_IDS) as [DepartmentId, string][]) {
    if (oid === officeId) return dept;
  }
  return null;
}
