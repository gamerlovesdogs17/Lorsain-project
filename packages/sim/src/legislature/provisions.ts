import type { SimState } from "../types.js";
import { policyIndexDelta } from "../economy/policy.js";
import type { NationalEconomyIndices } from "../economy/types.js";
import type { PolicyItem } from "./types.js";

export type LegislativeProvisionOption = {
  id: string;
  label: string;
  change: string;
  billTitle: string;
  direction: -1 | 0 | 1;
  magnitude: number;
  fiscalImpact: number | null;
};

export type LegislativeProvisionDefinition = {
  id: string;
  issueId: string;
  category: string;
  currentLawLabel: string;
  options: readonly LegislativeProvisionOption[];
};

function provision(
  id: string,
  issueId: string,
  category: string,
  currentLawLabel: string,
  low: readonly [string, string, string],
  middle: readonly [string, string, string],
  high: readonly [string, string, string],
  fiscal: readonly [number | null, number | null, number | null] = [null, null, null],
): LegislativeProvisionDefinition {
  return {
    id,
    issueId,
    category,
    currentLawLabel,
    options: [
      { id: "low", label: low[0], change: low[1], billTitle: low[2], direction: -1, magnitude: 0.65, fiscalImpact: fiscal[0] },
      { id: "current", label: middle[0], change: middle[1], billTitle: middle[2], direction: 0, magnitude: 0.2, fiscalImpact: fiscal[1] },
      { id: "high", label: high[0], change: high[1], billTitle: high[2], direction: 1, magnitude: 0.65, fiscalImpact: fiscal[2] },
    ],
  };
}

/** Concrete, public legislative choices. Ideological issues remain evaluation dimensions, not bill text. */
export const LEGISLATIVE_PROVISIONS: readonly LegislativeProvisionDefinition[] = [
  provision("PROV_BARGAINING_SCOPE", "ISS_LABOR", "Collective bargaining coverage", "Workplace bargaining with voluntary sector agreements",
    ["Workplace agreements only", "Ends statutory sector-wide bargaining and leaves agreements to individual workplaces.", "Workplace Bargaining Bill"],
    ["Keep current coverage", "Leaves existing workplace and voluntary sector agreements in force.", "Collective Bargaining Continuity Bill"],
    ["Sector bargaining standard", "Creates binding sector bargaining councils for covered industries.", "Sector Bargaining Standards Bill"], [-0.04, 0, 0.08]),
  provision("PROV_CHILD_BENEFIT", "ISS_WELFARE", "Child benefit eligibility", "Income-tested benefit for low- and middle-income households",
    ["Narrow eligibility", "Limits the child benefit to low-income households.", "Child Benefit Targeting Bill"],
    ["Keep income test", "Retains the present income-tested child benefit.", "Family Support Continuity Bill"],
    ["Universal benefit", "Pays the child benefit to every household with eligible children.", "Universal Child Benefit Bill"], [-0.12, 0, 0.22]),
  provision("PROV_RAIL_OWNERSHIP", "ISS_OWNERSHIP", "National rail ownership", "Mixed public infrastructure and private train operations",
    ["Private concessions", "Moves passenger operations to long-term private concessions.", "Passenger Rail Concessions Bill"],
    ["Keep mixed system", "Retains public infrastructure and private train operations.", "Rail Operations Continuity Bill"],
    ["Public operator", "Creates one public operator for interprovincial passenger rail.", "National Passenger Rail Bill"], [-0.12, 0, 0.18]),
  provision("PROV_STRATEGIC_TARIFFS", "ISS_TRADE", "Strategic import safeguards", "Cabinet may impose temporary safeguards after an injury finding",
    ["End safeguard power", "Repeals the temporary safeguard process for industrial imports.", "Open Markets Bill"],
    ["Keep injury test", "Retains temporary safeguards after an independent injury finding.", "Trade Safeguards Continuity Bill"],
    ["Broaden safeguards", "Allows safeguards for designated strategic industries before severe injury occurs.", "Strategic Industries Safeguards Bill"], [-0.08, 0, 0.12]),
  provision("PROV_HOUSING_APPROVALS", "ISS_HOUSING", "Housing approval rules", "Provinces set approval rules within national safety law",
    ["Province discretion", "Removes national housing-supply deadlines and leaves approvals to provinces.", "Provincial Planning Freedom Bill"],
    ["Keep current rules", "Retains provincial approvals under national safety law.", "Planning Administration Continuity Bill"],
    ["Supply deadlines", "Requires large cities to decide qualifying housing applications within fixed deadlines.", "Housing Approvals and Supply Bill"], [-0.05, 0, 0.16]),
  provision("PROV_CLEAN_POWER", "ISS_CLIMATE", "Electricity clean-power standard", "Utilities follow a gradual national clean-power schedule",
    ["Pause the schedule", "Suspends the next clean-power requirement for four years.", "Energy Reliability Pause Bill"],
    ["Keep current schedule", "Retains the current clean-power timetable.", "Clean Power Continuity Bill"],
    ["Advance the schedule", "Moves the next two clean-power deadlines forward and funds grid connections.", "Clean Electricity Acceleration Bill"], [-0.08, 0, 0.2]),
  provision("PROV_REPRODUCTIVE_LAW", "ISS_LIBERTY", "Reproductive health law", "National law permits abortion within a statutory time limit",
    ["Province discretion", "Allows each province to set abortion law, subject to emergency-care protections.", "Provincial Reproductive Law Bill"],
    ["Keep statutory limit", "Retains the existing national time limit and medical exceptions.", "Reproductive Health Continuity Bill"],
    ["National protection", "Guarantees lawful abortion access through the national statutory limit in every province.", "Reproductive Health Protection Bill"], [null, null, 0.05]),
  provision("PROV_RESIDENCY_PATH", "ISS_IMMIGRATION", "Permanent residency eligibility", "Five-year lawful-residence route with language and civic requirements",
    ["Longer residency route", "Raises the qualifying period for permanent residency to eight years.", "Residency Qualification Bill"],
    ["Keep five-year route", "Retains the present five-year route and civic requirements.", "Residency Law Continuity Bill"],
    ["Shorter residency route", "Reduces the qualifying period to three years for applicants meeting work and civic requirements.", "Residency Access Bill"], [-0.03, 0, 0.04]),
  provision("PROV_POLICE_COMPLAINTS", "ISS_POLICING", "Police misconduct review", "Provincial bodies investigate complaints under national minimum standards",
    ["Internal review", "Returns ordinary misconduct investigations to police internal-affairs units.", "Police Discipline Bill"],
    ["Keep provincial review", "Retains provincial review bodies and national minimum standards.", "Police Review Continuity Bill"],
    ["Independent review", "Creates an independent national inspector with power to reopen serious cases.", "Independent Police Review Bill"], [-0.04, 0, 0.09]),
  provision("PROV_REVENUE_DISCRETION", "ISS_DECENT", "Provincial revenue authority", "Provinces may levy a limited property surcharge",
    ["National uniformity", "Repeals the provincial property surcharge and replaces it with a national transfer formula.", "National Revenue Uniformity Bill"],
    ["Keep limited surcharge", "Retains the present provincial property-surcharge authority.", "Provincial Revenue Continuity Bill"],
    ["Broader local authority", "Allows provinces to vary the surcharge within a wider statutory band.", "Provincial Revenue Powers Bill"], [-0.06, 0, 0.03]),
  provision("PROV_EMERGENCY_RENEWAL", "ISS_EXEC", "Emergency-power renewal", "Assembly approval is required after the initial emergency period",
    ["Shorter initial period", "Requires Assembly approval after seven days of emergency authority.", "Emergency Powers Safeguards Bill"],
    ["Keep current renewal", "Retains the existing Assembly renewal deadline.", "Emergency Administration Continuity Bill"],
    ["Longer executive period", "Extends the President's initial emergency authority before an Assembly vote.", "Emergency Powers Extension Bill"], [null, null, null]),
  provision("PROV_DONOR_DISCLOSURE", "ISS_REFORM", "Campaign donor disclosure", "Large donations are published during the campaign",
    ["Annual disclosure", "Moves large-donor publication to one annual filing after the election.", "Campaign Reporting Bill"],
    ["Keep current disclosure", "Retains campaign-period publication of large donations.", "Election Disclosure Continuity Bill"],
    ["Rapid disclosure", "Requires publication of large donations within five working days.", "Rapid Campaign Disclosure Bill"], [-0.02, 0, 0.04]),
  provision("PROV_CONCORD_PROCUREMENT", "ISS_CONCORD", "Concord defense procurement", "Lorsain may join projects after separate Cabinet approval",
    ["Domestic preference", "Requires a domestic-source preference for major defense procurement.", "Defense Procurement Preference Bill"],
    ["Keep project review", "Retains project-by-project participation after Cabinet review.", "Defense Cooperation Continuity Bill"],
    ["Joint procurement", "Authorizes a standing framework for joint Concord procurement.", "Concord Joint Procurement Bill"], [-0.04, 0, 0.08]),
  provision("PROV_VASKARA_SANCTIONS", "ISS_VASKARA", "Vaskara sanctions authority", "Targeted sanctions require a published executive finding",
    ["Narrow sanctions", "Limits new sanctions to named security officials and military suppliers.", "Targeted Sanctions Limitation Bill"],
    ["Keep finding process", "Retains targeted sanctions after a published executive finding.", "Sanctions Procedure Continuity Bill"],
    ["Broaden sanctions", "Adds state banks and strategic exporters to the available sanctions list.", "Vaskara Strategic Sanctions Bill"], [null, null, null]),
  provision("PROV_READINESS_FUND", "ISS_DEFENSE", "Defense readiness appropriation", "Readiness funding follows the enacted annual budget",
    ["Reduce readiness fund", "Reduces the equipment-readiness appropriation for the next two fiscal years.", "Defense Savings Bill"],
    ["Keep current funding", "Retains the current equipment-readiness appropriation.", "Readiness Funding Continuity Bill"],
    ["Increase readiness fund", "Adds a four-year appropriation for maintenance, reserves and equipment replacement.", "Defense Readiness Investment Bill"], [-0.16, 0, 0.24]),
] as const;

export function legislativeProvision(id: string): LegislativeProvisionDefinition | null {
  return LEGISLATIVE_PROVISIONS.find((item) => item.id === id) ?? null;
}

export function legislativeProvisionOption(
  provisionId: string,
  optionId: string,
): LegislativeProvisionOption | null {
  return legislativeProvision(provisionId)?.options.find((option) => option.id === optionId) ?? null;
}

export function policyItemForProvision(provisionId: string, optionId: string): PolicyItem | null {
  const definition = legislativeProvision(provisionId);
  const option = legislativeProvisionOption(provisionId, optionId);
  if (!definition || !option) return null;
  return {
    issueId: definition.issueId,
    provisionId,
    optionId,
    direction: option.direction,
    magnitude: option.magnitude,
    fiscalImpact: option.fiscalImpact,
  };
}

export function provisionForPolicyItem(item: PolicyItem): LegislativeProvisionDefinition | null {
  if (item.provisionId) return legislativeProvision(item.provisionId);
  return LEGISLATIVE_PROVISIONS.find((definition) => definition.issueId === item.issueId) ?? null;
}

export function optionForPolicyItem(item: PolicyItem): LegislativeProvisionOption | null {
  const definition = provisionForPolicyItem(item);
  if (!definition) return null;
  if (item.optionId) return definition.options.find((option) => option.id === item.optionId) ?? null;
  const direction = item.direction < 0 ? -1 : item.direction > 0 ? 1 : 0;
  return definition.options.find((option) => option.direction === direction) ?? definition.options[1] ?? null;
}

export function currentProvisionOption(state: SimState, provisionId: string): LegislativeProvisionOption | null {
  const laws = Object.values(state.legislatureRuntime.enactedLaws)
    .filter((law) => law.operative)
    .sort((a, b) => b.enactedDate.localeCompare(a.enactedDate) || b.id.localeCompare(a.id));
  for (const law of laws) {
    const item = law.policyItems.find((candidate) => candidate.provisionId === provisionId);
    if (item) return optionForPolicyItem(item);
  }
  return legislativeProvision(provisionId)?.options.find((option) => option.id === "current") ?? null;
}

export function estimatedProvisionEffects(item: PolicyItem): Partial<NationalEconomyIndices> {
  return policyIndexDelta(item);
}

export function naturalBillCopy(
  state: SimState,
  items: readonly PolicyItem[],
): { title: string; summary: string } {
  const resolved = items.flatMap((item) => {
    const definition = provisionForPolicyItem(item);
    const option = optionForPolicyItem(item);
    return definition && option ? [{ definition, option }] : [];
  });
  const first = resolved[0];
  let title = first?.option.billTitle ?? "Public Administration Bill";
  if (resolved.length > 1) {
    const category = resolved[0]!.definition.category.replace(/ (rules|law|eligibility|coverage|authority)$/i, "");
    const second = resolved[1]!.definition.category.replace(/ (rules|law|eligibility|coverage|authority)$/i, "");
    title = `${category} and ${second} Bill`;
  }
  const used = new Set([
    ...Object.values(state.legislatureRuntime.bills).map((bill) => bill.title),
    ...Object.values(state.legislatureRuntime.enactedLaws).map((law) => law.title),
  ]);
  if (used.has(title)) {
    const stem = title.replace(/ (Act|Bill)$/i, "");
    title = `${stem} Amendment Bill`;
    if (used.has(title)) title = `${stem} Further Amendment Bill`;
    if (used.has(title)) {
      let number = 2;
      do {
        title = `${stem} (No. ${number}) Bill`;
        number += 1;
      } while (used.has(title));
    }
  }
  return {
    title,
    summary: resolved.map(({ option }) => option.change).join(" "),
  };
}

export function concretePolicyItem(item: PolicyItem): PolicyItem {
  if (item.provisionId && item.optionId) return { ...item };
  const definition = provisionForPolicyItem(item);
  if (!definition) return { ...item };
  const direction = item.direction < 0 ? -1 : item.direction > 0 ? 1 : 0;
  const option = definition.options.find((candidate) => candidate.direction === direction) ?? definition.options[1]!;
  return policyItemForProvision(definition.id, option.id) ?? { ...item };
}
