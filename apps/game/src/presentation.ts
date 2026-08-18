import type { ContentBundle } from "@lorsain/content-loader";
import type { KernelWorld, SimEvent, SimState } from "@lorsain/sim";
import { COMMITTEE_NAMES } from "@lorsain/sim";
import type { PolicyItem } from "@lorsain/sim";

export type FigureName = { id: string; name: string };

export type PlaceInfo = {
  id: string;
  name: string;
  kind: "province" | "constituency";
  seats?: number;
  provinceName?: string;
};

export type PresentationCatalog = {
  figures: Map<string, FigureName>;
  issues: Map<string, { name: string; low?: string; high?: string }>;
  places: Map<string, PlaceInfo>;
};

export function catalogFromBundle(
  bundle: ContentBundle,
  figures: Map<string, FigureName>,
): PresentationCatalog {
  const issues = new Map<string, { name: string; low?: string; high?: string }>();
  for (const issue of (bundle.content.terena_issues?.issues ?? []) as Array<{
    id: string;
    name: string;
    low?: string;
    high?: string;
  }>) {
    issues.set(issue.id, {
      name: issue.name,
      ...(issue.low ? { low: issue.low } : {}),
      ...(issue.high ? { high: issue.high } : {}),
    });
  }
  const places = new Map<string, PlaceInfo>();
  for (const f of (bundle.content.terena_provinces?.features ?? []) as Array<{
    properties?: { id?: string; name?: string };
  }>) {
    const id = f.properties?.id;
    const name = f.properties?.name;
    if (id && name) places.set(id, { id, name, kind: "province" });
  }
  for (const f of (bundle.content.terena_constituencies?.features ?? []) as Array<{
    properties?: {
      id?: string;
      district_number?: number;
      seats?: number;
      plurality_province_name?: string;
      svg_path_id?: string;
    };
  }>) {
    const id = f.properties?.id;
    if (!id) continue;
    const n = f.properties?.district_number;
    const provinceName = f.properties?.plurality_province_name;
    const name =
      n != null ? `Constituency ${String(n)}${provinceName ? ` (${provinceName})` : ""}` : id;
    const info: PlaceInfo = {
      id,
      name,
      kind: "constituency",
      ...(f.properties?.seats != null ? { seats: f.properties.seats } : {}),
      ...(provinceName ? { provinceName } : {}),
    };
    places.set(id, info);
    if (f.properties?.svg_path_id) places.set(f.properties.svg_path_id, info);
  }
  return { figures, issues, places };
}

export function politicianDisplayName(catalog: PresentationCatalog, id: string): string {
  return catalog.figures.get(id)?.name ?? id;
}

export function partyDisplayName(
  world: KernelWorld,
  partyId: string | null | undefined,
  state?: SimState,
): string {
  if (!partyId) return "Independent";
  return world.partyDefinitions[partyId]?.name ?? state?.dynamicParties[partyId]?.name ?? partyId;
}

export function partyColor(world: KernelWorld, partyId: string | null | undefined): string {
  if (!partyId) return "#6b7280";
  return world.partyDefinitions[partyId]?.color ?? "#6b7280";
}

export function factionDisplayName(
  world: KernelWorld,
  factionId: string | null | undefined,
): string {
  if (!factionId) return "No faction";
  return world.factionDefinitions[factionId]?.name ?? factionId;
}

export function constituencyDisplayName(catalog: PresentationCatalog, id: string | null): string {
  if (!id) return "National";
  return catalog.places.get(id)?.name ?? id;
}

export function issueDisplayName(catalog: PresentationCatalog, issueId: string): string {
  return catalog.issues.get(issueId)?.name ?? issueId;
}

export function committeeDisplayName(id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return COMMITTEE_NAMES[id as keyof typeof COMMITTEE_NAMES] ?? id;
}

export function electionDisplayName(id: string): string {
  if (id === "ELEC_PRES_2028") return "2028 presidential election";
  if (id === "ELEC_ASM_2030") return "2030 Assembly election";
  if (id.startsWith("ELEC_PRES_")) return `Presidential election ${id.slice(10)}`;
  if (id.startsWith("ELEC_ASM_")) return `Assembly election ${id.slice(9)}`;
  return id;
}

export function contestDisplayName(state: SimState, world: KernelWorld, contestId: string): string {
  const contest = state.partyContests[contestId];
  if (!contest) return contestId;
  const party = partyDisplayName(world, contest.partyId);
  if (contest.type === "presidential_nomination") return `${party} presidential nomination`;
  if (contest.type === "party_leadership") return `${party} leadership contest`;
  if (contest.type === "faction_chair") {
    return `${factionDisplayName(world, contest.factionId)} chair contest`;
  }
  return `${party} contest`;
}

export function policyItemDisplay(catalog: PresentationCatalog, item: PolicyItem): string {
  const issue = issueDisplayName(catalog, item.issueId);
  const dir = item.direction > 0 ? "for" : item.direction < 0 ? "against" : "neutral on";
  const mag = item.magnitude >= 0.75 ? "strong" : item.magnitude >= 0.4 ? "moderate" : "limited";
  return `${mag} ${dir} ${issue}`;
}

export function campaignTypeLabel(type: string): string {
  if (type === "presidential_nomination") return "presidential nomination campaign";
  if (type === "presidential_general") return "presidential general-election campaign";
  if (type === "assembly") return "Assembly campaign";
  return type.replace(/_/g, " ");
}

function titleCaseEvent(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function eventDisplay(
  catalog: PresentationCatalog,
  world: KernelWorld,
  state: SimState,
  event: SimEvent,
): string {
  const who = (ids: string[]) =>
    ids.map((id) => politicianDisplayName(catalog, id)).filter(Boolean);
  const actors = who(event.actorIds);
  const lead = actors[0];
  const second = actors[1];
  switch (event.type) {
    case "CAMPAIGN_LAUNCHED":
      return `${lead ?? "A politician"} launches a ${campaignTypeLabel(String(event.payload.campaignType ?? "campaign"))}`;
    case "CAMPAIGN_WITHDRAWN":
      return `${lead ?? "A candidate"} withdraws from the race`;
    case "CAMPAIGN_VISIT":
      return `${lead ?? "A candidate"} campaigns ${event.payload.geographyKind === "national" ? "nationwide" : `in ${constituencyDisplayName(catalog, String(event.payload.geographyId ?? event.payload.id ?? ""))}`}`;
    case "FIELD_ORGANIZED":
      return `${lead ?? "A campaign"} organizes in ${constituencyDisplayName(catalog, String(event.payload.constituencyId ?? ""))}`;
    case "AD_CAMPAIGN":
      return `${lead ?? "A campaign"} runs ${String(event.payload.messageType ?? "campaign")} advertising`;
    case "CAMPAIGN_MESSAGE":
      return `${lead ?? "A candidate"} emphasizes ${issueDisplayName(catalog, String(event.payload.issueId ?? "their message"))}`;
    case "CAMPAIGN_ATTACK":
      return event.payload.backfire
        ? `${lead ?? "A candidate"}'s attack on ${second ?? "a rival"} backfires`
        : `${lead ?? "A candidate"} attacks ${second ?? "a rival"}`;
    case "FUNDRAISING_PUSH":
      return `${lead ?? "A campaign"} raises funds`;
    case "ENDORSEMENT_MADE":
    case "ENDORSEMENT_RECEIVED":
      return `${lead ?? "Someone"} endorses ${second ?? "a candidate"}`;
    case "ENDORSEMENT_DECLINED":
      return `${lead ?? "Someone"} declines to endorse ${second ?? "a candidate"}`;
    case "ENDORSEMENT_SWITCHED":
      return `${lead ?? "An endorser"} switches an endorsement`;
    case "ENDORSEMENT_WITHDRAWN":
      return `An endorsement is withdrawn`;
    case "BILL_INTRODUCED":
      return `${lead ?? "An MP"} introduces a bill`;
    case "BILL_COSPONSORED":
      return `${lead ?? "An MP"} cosponsors a bill`;
    case "AMENDMENT_PROPOSED":
      return `${lead ?? "An MP"} proposes an amendment`;
    case "BILL_PASSED":
    case "FLOOR_PASSED":
      return `The Assembly passes a bill`;
    case "BILL_FAILED":
    case "FLOOR_FAILED":
      return `The Assembly rejects a bill`;
    case "BILL_SIGNED":
      return `The President signs a bill`;
    case "BILL_RETURNED":
      return `The President returns a bill to the Assembly`;
    case "LAW_ENACTED":
      return `A law is enacted`;
    case "MINISTER_APPOINTED":
      return `${lead ?? "The President"} appoints ${second ?? "a minister"}`;
    case "MINISTER_DISMISSED":
      return `${lead ?? "The President"} dismisses a minister`;
    case "REGULATION_ISSUED":
      return `The government issues a regulation`;
    case "BUDGET_PROPOSED":
      return `The President proposes a budget`;
    case "MOTION_INTRODUCED":
      return `${lead ?? "An MP"} introduces an Assembly motion`;
    case "COURT_VACANCY":
      return `A Constitutional Court seat becomes vacant`;
    case "JUDGE_NOMINATED":
      return `${lead ?? "The President"} nominates ${second ?? "a judge"}`;
    case "JUDGE_CONFIRMED":
      return `The Assembly confirms ${second ?? lead ?? "a Constitutional Court judge"}`;
    case "JUDGE_REJECTED":
      return `The Assembly rejects a judicial nominee`;
    case "CASE_FILED":
      return `A constitutional case is filed`;
    case "COURT_DECISION":
      return `The Constitutional Court ${String(event.payload.disposition ?? "decides a case").toLowerCase()}s a case ${event.payload.uphold != null ? `(${String(event.payload.uphold)}–${String(event.payload.invalidate)})` : ""}`.trim();
    case "LAW_INVALIDATED":
      return `The Court invalidates a law`;
    case "REGULATION_INVALIDATED":
      return `The Court invalidates a regulation`;
    case "IMPEACHMENT_INTRODUCED":
      return `${lead ?? "An MP"} introduces an impeachment`;
    case "PRESIDENT_IMPEACHED":
      return `The Assembly impeaches the President`;
    case "IMPEACHMENT_REJECTED":
      return `An impeachment does not succeed`;
    case "PRESIDENT_REMOVED":
      return `The President is removed from office`;
    case "RECALL_INTRODUCED":
      return `${lead ?? "An MP"} introduces a national recall referral`;
    case "RECALL_REFERRED":
      return `The Assembly refers a presidential recall to a national vote`;
    case "RECALL_FAILED":
      return `A presidential recall fails`;
    case "RECALL_SUCCEEDED":
      return `Voters recall the President`;
    case "TURN_COMPLETED":
      return `Month completed`;
    case "POLL_PUBLISHED":
      return `A poll is published`;
    default:
      if (lead) return `${lead}: ${titleCaseEvent(event.type)}`;
      return titleCaseEvent(event.type);
  }
}

export function pollShareLine(
  catalog: PresentationCatalog,
  world: KernelWorld,
  state: SimState,
  shares: Array<{ politicianId: string; share: number }>,
): string {
  return [...shares]
    .sort((a, b) => b.share - a.share)
    .slice(0, 5)
    .map(
      (s) =>
        `${politicianDisplayName(catalog, s.politicianId)} (${partyDisplayName(world, state.politicians[s.politicianId]?.partyId ?? null)}) ${(s.share * 100).toFixed(1)}%`,
    )
    .join(" · ");
}

export function stanceLabel(stance: string): string {
  if (stance === "support") return "Support";
  if (stance === "oppose") return "Oppose";
  if (stance === "free_vote") return "Free vote";
  return stance;
}

export function billStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
