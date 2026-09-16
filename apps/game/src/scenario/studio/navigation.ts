import type { ScenarioValidationIssue } from "@lorsain/scenario";

export type StudioTab =
  | "overview"
  | "constitution"
  | "geography"
  | "parties"
  | "people"
  | "government"
  | "elections"
  | "laws"
  | "organizations"
  | "foreign"
  | "validation"
  | "packs";

export const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "constitution", label: "Constitution" },
  { id: "geography", label: "Geography" },
  { id: "parties", label: "Parties" },
  { id: "people", label: "People" },
  { id: "government", label: "Government" },
  { id: "elections", label: "Elections" },
  { id: "laws", label: "Laws" },
  { id: "organizations", label: "Organizations" },
  { id: "foreign", label: "Foreign Affairs" },
  { id: "validation", label: "Validation" },
  { id: "packs", label: "Content Packs" },
];

export function tabForIssuePath(path: string): StudioTab {
  if (path.includes("parties")) return "parties";
  if (path.includes("people")) return "people";
  if (
    path.includes("constitution") ||
    path.includes("assemblySeats") ||
    path.includes("courtJudges")
  )
    return "constitution";
  if (path.includes("geography") || path.includes("provinces")) return "geography";
  if (path.includes("foreign")) return "foreign";
  if (path.includes("government")) return "government";
  if (path.includes("elections")) return "elections";
  if (path.includes("laws")) return "laws";
  if (path.includes("organizations")) return "organizations";
  if (path === "name" || path === "countryName" || path === "startDate" || path === "description")
    return "overview";
  return "validation";
}

export function entityFocusFromIssue(issue: ScenarioValidationIssue): string | null {
  const m = issue.path.match(/\[(\d+)\]/);
  if (!m) return null;
  const idx = m[1];
  if (issue.path.includes("parties")) return `party:${idx}`;
  if (issue.path.includes("people")) return `person:${idx}`;
  if (issue.path.includes("provinces")) return `province:${idx}`;
  if (issue.path.includes("foreignCountries")) return `foreign:${idx}`;
  if (issue.path.includes("organizations")) return `org:${idx}`;
  return null;
}
