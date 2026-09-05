import type { ContentBundle } from "@lorsain/content-loader";
import type { KernelWorld, SimEvent, SimState, TreatyRecord } from "@lorsain/sim";
import {
  COMMITTEE_NAMES,
  TERENA_WORLD_ID,
  bilateralKey,
  currentPresidentId,
  optionForPolicyItem,
  provisionForPolicyItem,
} from "@lorsain/sim";
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
  state?: SimState | null,
): PresentationCatalog {
  const publicFigures = new Map(figures);
  if (state) {
    for (const politician of Object.values(state.politicians)) {
      if (politician.displayName?.trim()) {
        publicFigures.set(politician.id, { id: politician.id, name: politician.displayName });
      }
    }
  }
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
  return { figures: publicFigures, issues, places };
}

export function politicianDisplayName(catalog: PresentationCatalog, id: string): string {
  const named = catalog.figures.get(id)?.name;
  if (named && named.trim()) return named;
  if (id.startsWith("GENASM_") || id.startsWith("POL_PLEG_"))
    return generatedAssemblyCandidateName(id);
  // Never leak raw simulation IDs into normal play surfaces.
  return "Unknown politician";
}

function publicPoliticalActorName(
  catalog: PresentationCatalog,
  world: KernelWorld,
  state: SimState,
  id: string,
): string {
  if (state.politicians[id]) return politicianDisplayName(catalog, id);
  const caucus = world.factionDefinitions[id];
  if (caucus) return caucus.name;
  const provincialOrganization = world.provincialPartyOrganizations[id];
  if (provincialOrganization) {
    const province = catalog.places.get(provincialOrganization.provinceId)?.name ?? "provincial";
    return `${partyDisplayName(world, provincialOrganization.partyId, state)} ${province} organization`;
  }
  const organization = world.interestOrganizations[id];
  if (organization) return organization.name;
  return "A political organization";
}

/** Deterministic public label for long-run generated Assembly candidates. */
export function generatedAssemblyCandidateName(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const first = [
    "Alex",
    "Mira",
    "Jonah",
    "Elena",
    "Rafi",
    "Soren",
    "Nadia",
    "Theo",
    "Lina",
    "Omar",
  ][(hash >>> 0) % 10]!;
  const last = [
    "Vale",
    "Korrin",
    "Denev",
    "Ashar",
    "Brel",
    "Quenn",
    "Sable",
    "Torin",
    "Wren",
    "Hale",
  ][(hash >>> 8) % 10]!;
  return `${first} ${last}`;
}

export function partyDisplayName(
  world: KernelWorld,
  partyId: string | null | undefined,
  state?: SimState,
): string {
  if (!partyId) return "Independent";
  return (
    world.partyDefinitions[partyId]?.name ??
    state?.dynamicParties[partyId]?.name ??
    "Unrecognized party"
  );
}

export function partyColor(world: KernelWorld, partyId: string | null | undefined): string {
  if (!partyId) return "#6b7280";
  return world.partyDefinitions[partyId]?.color ?? "#6b7280";
}

export function factionDisplayName(
  world: KernelWorld,
  factionId: string | null | undefined,
): string {
  if (!factionId) return "No caucus";
  return world.factionDefinitions[factionId]?.name ?? "Unrecognized caucus";
}

export function constituencyDisplayName(catalog: PresentationCatalog, id: string | null): string {
  if (!id) return "National";
  return catalog.places.get(id)?.name ?? "Unknown constituency";
}

export function issueDisplayName(catalog: PresentationCatalog, issueId: string): string {
  return catalog.issues.get(issueId)?.name ?? "Unrecognized issue";
}

export function committeeDisplayName(id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return COMMITTEE_NAMES[id as keyof typeof COMMITTEE_NAMES] ?? "Committee";
}

export function countryDisplayName(
  world: KernelWorld,
  countryId: string | null | undefined,
): string {
  if (!countryId) return "Unknown country";
  if (countryId === TERENA_WORLD_ID) return world.worldCountries[countryId]?.name ?? "Terena";
  return world.worldCountries[countryId]?.name ?? "Unknown country";
}

export function institutionDisplayName(
  world: KernelWorld,
  institutionId: string | null | undefined,
): string {
  if (!institutionId) return "No institution";
  return world.worldInstitutions[institutionId]?.name ?? "International organization";
}

export function powerTierLabel(tier: string | null | undefined): string {
  if (!tier) return "Unknown";
  return tier
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function relationPublicLabel(general: number | null | undefined): string {
  if (general == null) return "No recorded relations";
  if (general >= 60) return "Close partner";
  if (general >= 25) return "Friendly";
  if (general >= 5) return "Cordial";
  if (general >= -5) return "Neutral";
  if (general >= -25) return "Cool";
  if (general >= -60) return "Strained";
  return "Hostile";
}

export function militaryPostureLabel(posture: string | null | undefined): string {
  if (!posture) return "Unknown";
  if (posture === "normal") return "Normal readiness";
  if (posture === "heightened") return "Heightened readiness";
  if (posture === "mobilized") return "Mobilized";
  if (posture === "crisis_deployment") return "Crisis deployment";
  return posture.replace(/_/g, " ");
}

export function treatyTypeLabel(kind: string | null | undefined): string {
  if (!kind) return "Treaty";
  if (kind === "collective_security") return "Collective security pact";
  if (kind === "trade") return "Trade agreement";
  if (kind === "non_aggression") return "Non-aggression pact";
  if (kind === "mutual_defense") return "Mutual defense treaty";
  if (kind === "sanctions_coordination") return "Sanctions coordination";
  return kind.replace(/_/g, " ");
}

const PUBLIC_CRISIS_STAGES = new Set(["incident", "active", "deescalating", "conflict"]);

export function isPublicCrisisStage(stage: string | null | undefined): boolean {
  return !!stage && PUBLIC_CRISIS_STAGES.has(stage);
}

export function publicActiveCrises(state: SimState) {
  return Object.values(state.foreignAffairsRuntime.crises).filter(
    (c) => c.stage !== "latent" && c.stage !== "settled",
  );
}

export function latentStrategicTensions(state: SimState) {
  return Object.values(state.foreignAffairsRuntime.crises).filter((c) => c.stage === "latent");
}

export function crisisStageLabel(stage: string | null | undefined): string {
  if (!stage) return "Unknown";
  if (stage === "latent") return "Background tension";
  if (stage === "incident") return "Diplomatic incident";
  if (stage === "active") return "Active crisis";
  if (stage === "deescalating") return "De-escalating";
  if (stage === "settled") return "Settled";
  if (stage === "conflict") return "Armed conflict";
  return stage.replace(/_/g, " ");
}

export function publicSeverityLabel(
  intensity: number | null | undefined,
  stage: string | null | undefined,
): string {
  if (stage === "latent") return "Low-profile";
  if (stage === "settled") return "Resolved";
  const n = intensity ?? 0;
  if (stage === "conflict") {
    if (n >= 0.75) return "Severe";
    if (n >= 0.5) return "Major";
    return "Significant";
  }
  if (n >= 0.7) return "High";
  if (n >= 0.45) return "Elevated";
  if (n >= 0.25) return "Moderate";
  return "Limited";
}

export type CountryLeaderDisplay = { name: string; title: string };

export function resolveCountryLeaderDisplay(
  world: KernelWorld,
  state: SimState,
  countryId: string,
  catalog?: PresentationCatalog,
): CountryLeaderDisplay | null {
  if (countryId === TERENA_WORLD_ID) {
    const presidentId = currentPresidentId(world, state);
    if (!presidentId) return null;
    const name = catalog ? politicianDisplayName(catalog, presidentId) : presidentId;
    return { name, title: "President" };
  }
  const runtime = state.foreignAffairsRuntime.countries[countryId];
  if (!runtime) return null;
  const activeLeader = runtime.metadata.activeLeader;
  if (
    activeLeader &&
    typeof activeLeader === "object" &&
    !Array.isArray(activeLeader) &&
    typeof (activeLeader as { name?: unknown }).name === "string"
  ) {
    const rec = activeLeader as { name: string; title?: string };
    return { name: rec.name, title: rec.title ?? "Head of Government" };
  }
  const leader = runtime.leaderId ? world.worldLeaders[runtime.leaderId] : undefined;
  if (leader) return { name: leader.name, title: leader.title };
  const canonicalLeaderId = world.worldLeadersByCountryId[countryId];
  const canonicalLeader = canonicalLeaderId ? world.worldLeaders[canonicalLeaderId] : undefined;
  if (canonicalLeader) return { name: canonicalLeader.name, title: canonicalLeader.title };
  return null;
}

export function treatyStatusLabel(treaty: TreatyRecord): string {
  const status = treaty.status as string;
  if (status === "counterparty_pending") return "Awaiting counterparty acceptance";
  if (status === "proposed") {
    if (treaty.ratificationStatus === "pending") return "Pending Assembly ratification";
    return "Proposed — awaiting counterparty";
  }
  if (status === "active") {
    if (treaty.ratificationStatus === "ratified") return "In force (ratified)";
    return "In force";
  }
  if (status === "suspended") return "Suspended";
  if (status === "terminated") {
    if (treaty.ratificationStatus === "rejected") return "Rejected";
    return "Terminated";
  }
  if (treaty.ratificationStatus === "rejected") return "Rejected";
  if (treaty.ratificationStatus === "pending") return "Pending Assembly ratification";
  if (treaty.ratificationStatus === "withdrawn") return "Withdrawn";
  return status.replace(/_/g, " ");
}

export function countryRecentEvents(state: SimState, countryId: string, limit = 6): SimEvent[] {
  const diplomaticByActor = Object.values(state.foreignAffairsRuntime.diplomaticActions).filter(
    (a) => a.actorCountryId === countryId,
  );
  return state.history
    .filter((e) => {
      if (e.type === "TURN_COMPLETED") return false;
      if (e.actorIds[0] === countryId) return true;
      if (e.entityIds.includes(countryId)) return true;
      if (e.payload.targetCountryId === countryId) return true;
      return diplomaticByActor.some(
        (a) =>
          e.entityIds.includes(a.id) ||
          (a.targetCountryId &&
            e.entityIds.includes(a.targetCountryId) &&
            e.date === a.date &&
            e.type.toLowerCase().includes(a.kind.replace(/_/g, ""))),
      );
    })
    .slice(-limit)
    .reverse();
}

export function foreignPresidentialActionLabel(
  world: KernelWorld,
  state: SimState,
  action: { kind: string; targetCountryId: string | null; metadata?: Record<string, unknown> },
): string {
  const target = action.targetCountryId
    ? countryDisplayName(world, action.targetCountryId)
    : "a foreign government";
  if (action.kind === "treaty_proposal") {
    const kind =
      typeof action.metadata?.treatyKind === "string"
        ? treatyTypeLabel(action.metadata.treatyKind)
        : "treaty";
    return `Incoming ${kind} proposal from ${target}`;
  }
  if (action.kind === "outreach") return `Diplomatic outreach from ${target}`;
  if (action.kind === "summit") return `Summit invitation from ${target}`;
  if (action.kind === "warning") return `Formal warning from ${target}`;
  if (action.kind === "trade_negotiation") return `Trade negotiation offer from ${target}`;
  return `Incoming diplomacy from ${target}`;
}

export function mediaHeadlineForEvent(
  eventType: string,
  framing: "restrained" | "sensational" | "critical" | "sympathetic" = "restrained",
): string {
  const sensational = framing === "sensational";
  if (eventType.startsWith("FOREIGN_CRISIS_") || eventType.includes("CRISIS")) {
    return sensational
      ? "International crisis dominates headlines"
      : "International crisis develops";
  }
  if (
    eventType.startsWith("INTERNATIONAL_CONFLICT_") ||
    eventType === "INTERNATIONAL_CONFLICT_STARTED"
  ) {
    return sensational ? "War fears spread abroad" : "Armed conflict erupts internationally";
  }
  if (eventType.includes("TREATY")) {
    return sensational ? "Treaty drama on the world stage" : "Diplomatic treaty developments";
  }
  if (eventType.includes("SANCTION")) {
    return sensational ? "Sanctions shock global markets" : "Sanctions reshape foreign relations";
  }
  if (
    eventType.includes("DIPLOMATIC") ||
    eventType.includes("FOREIGN_OUTREACH") ||
    eventType.includes("INCOMING_DIPLOMACY")
  ) {
    return sensational ? "Diplomatic surprise from abroad" : "Foreign diplomatic developments";
  }
  if (eventType.includes("POSTURE") || eventType.includes("ALLIANCE")) {
    return sensational ? "Military posture stirs concern" : "Alliance and posture updates abroad";
  }
  if (eventType.includes("FOREIGN") || eventType.includes("INTERNATIONAL")) {
    return sensational ? "Global tensions rise" : "International developments";
  }
  return sensational ? "Political storm in Valen" : "Political developments";
}

export function diplomaticActionLabel(kind: string | null | undefined): string {
  if (!kind) return "Diplomatic action";
  if (kind === "outreach") return "Diplomatic outreach";
  if (kind === "summit") return "Summit";
  if (kind === "sanctions") return "Sanctions imposed";
  if (kind === "lift_sanctions") return "Sanctions lifted";
  if (kind === "posture_change") return "Military posture change";
  if (kind === "treaty_proposal") return "Treaty proposal";
  if (kind === "warning") return "Diplomatic warning";
  if (kind === "mediation") return "Crisis mediation";
  if (kind === "trade_negotiation") return "Trade negotiation";
  if (kind === "alliance_consultation") return "Alliance consultation";
  return kind.replace(/_/g, " ");
}

function countryFromEvent(world: KernelWorld, state: SimState, event: SimEvent): string | null {
  const payloadTarget =
    typeof event.payload.targetCountryId === "string" ? event.payload.targetCountryId : null;
  if (payloadTarget) return countryDisplayName(world, payloadTarget);
  const entity = event.entityIds.find((id) => world.worldCountries[id]);
  if (entity) return countryDisplayName(world, entity);
  return null;
}

export function electionDisplayName(id: string): string {
  if (id === "ELEC_PRES_2028") return "2028 presidential election";
  if (id === "ELEC_ASM_2030") return "2030 Assembly election";
  if (id.startsWith("ELEC_PRES_")) return `Presidential election ${id.slice(10)}`;
  if (id.startsWith("ELEC_ASM_")) return `Assembly election ${id.slice(9)}`;
  if (id.startsWith("ELEC_GOV_")) return `Gubernatorial election ${id.slice(-4)}`;
  if (id.startsWith("ELEC_PASM_")) return `Provincial Assembly election ${id.slice(-4)}`;
  return "Election record";
}

export function contestDisplayName(state: SimState, world: KernelWorld, contestId: string): string {
  const contest = state.partyContests[contestId];
  if (!contest) return "Political contest";
  const party = partyDisplayName(world, contest.partyId);
  if (contest.type === "presidential_nomination") return `${party} presidential nomination`;
  if (contest.type === "party_leadership") return `${party} leadership contest`;
  if (contest.type === "faction_chair") {
    return `${factionDisplayName(world, contest.factionId)} chair contest`;
  }
  return `${party} contest`;
}

export function policyItemDisplay(catalog: PresentationCatalog, item: PolicyItem): string {
  const provision = provisionForPolicyItem(item);
  const option = optionForPolicyItem(item);
  if (provision && option) return `${provision.category}: ${option.label}`;
  const issue = issueDisplayName(catalog, item.issueId);
  const dir = item.direction > 0 ? "for" : item.direction < 0 ? "against" : "neutral on";
  const mag = item.magnitude >= 0.75 ? "strong" : item.magnitude >= 0.4 ? "moderate" : "limited";
  return `${mag} ${dir} ${issue}`;
}

export function campaignTypeLabel(type: string): string {
  if (type === "presidential_nomination") return "presidential nomination campaign";
  if (type === "presidential_general") return "presidential general-election campaign";
  if (type === "assembly") return "Assembly campaign";
  if (type === "gubernatorial") return "gubernatorial campaign";
  if (type === "provincial_assembly") return "Provincial Assembly campaign";
  return type.replace(/_/g, " ");
}

function titleCaseEvent(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function publicBillTitle(
  catalog: PresentationCatalog,
  state: SimState,
  event: SimEvent,
): string | null {
  const billId = typeof event.payload.billId === "string" ? event.payload.billId : null;
  const lawId = typeof event.payload.lawId === "string" ? event.payload.lawId : null;
  const rec =
    (lawId ? state.legislatureRuntime.enactedLaws[lawId] : undefined) ??
    (billId ? state.legislatureRuntime.bills[billId] : undefined);
  const title = rec?.title?.trim();
  if (!title) return null;
  const issueId = rec?.policyItems?.[0]?.issueId ?? title.match(/ISS_[A-Z0-9_]+/)?.[0];
  if (issueId && /ISS_/.test(title)) {
    return `the ${issueDisplayName(catalog, issueId)} Act`;
  }
  return title;
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
    case "ENDORSEMENT_RECEIVED": {
      const endorserId =
        typeof event.payload.endorserId === "string" ? event.payload.endorserId : event.actorIds[0];
      const targetId =
        typeof event.payload.targetId === "string"
          ? event.payload.targetId
          : event.actorIds.find((id) => id !== endorserId && state.politicians[id]);
      const endorser = endorserId
        ? publicPoliticalActorName(catalog, world, state, endorserId)
        : "A political organization";
      const target = targetId ? politicianDisplayName(catalog, targetId) : "a candidate";
      return `${endorser} endorses ${target}`;
    }
    case "ENDORSEMENT_DECLINED":
      return `${lead ?? "Someone"} declines to endorse ${second ?? "a candidate"}`;
    case "ENDORSEMENT_SWITCHED":
      return `${lead ?? "An endorser"} switches an endorsement`;
    case "ENDORSEMENT_WITHDRAWN":
      return `An endorsement is withdrawn`;
    case "BILL_INTRODUCED":
      return publicBillTitle(catalog, state, event)
        ? `${lead ?? "An MP"} introduces ${publicBillTitle(catalog, state, event)}`
        : `${lead ?? "An MP"} introduces a bill`;
    case "BILL_COSPONSORED":
      return `${lead ?? "An MP"} cosponsors a bill`;
    case "AMENDMENT_PROPOSED":
      return `${lead ?? "An MP"} proposes an amendment`;
    case "BILL_PASSED":
    case "FLOOR_PASSED":
    case "BILL_FLOOR_PASSED":
      return publicBillTitle(catalog, state, event)
        ? `The Assembly passes ${publicBillTitle(catalog, state, event)}`
        : `The Assembly passes a bill`;
    case "BILL_FAILED":
    case "FLOOR_FAILED":
    case "BILL_FLOOR_FAILED":
      return publicBillTitle(catalog, state, event)
        ? `The Assembly rejects ${publicBillTitle(catalog, state, event)}`
        : `The Assembly rejects a bill`;
    case "BILL_SIGNED":
      return publicBillTitle(catalog, state, event)
        ? `The President signs ${publicBillTitle(catalog, state, event)}`
        : `The President signs a bill`;
    case "BILL_RETURNED":
      return publicBillTitle(catalog, state, event)
        ? `The President returns ${publicBillTitle(catalog, state, event)} to the Assembly`
        : `The President returns a bill to the Assembly`;
    case "LAW_ENACTED":
      return publicBillTitle(catalog, state, event)
        ? `${publicBillTitle(catalog, state, event)} becomes law`
        : `A law is enacted`;
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
    case "DIPLOMATIC_OUTREACH":
      return `Terena extends diplomatic outreach to ${countryFromEvent(world, state, event) ?? "a foreign government"}`;
    case "DIPLOMATIC_SUMMIT":
      return `${lead ?? "The President"} holds a summit with ${countryFromEvent(world, state, event) ?? "a foreign leader"}`;
    case "DIPLOMATIC_WARNING":
      return `Terena issues a diplomatic warning to ${countryFromEvent(world, state, event) ?? "a foreign government"}`;
    case "SANCTIONS_IMPOSED":
      return `Sanctions are imposed on ${countryFromEvent(world, state, event) ?? "a foreign state"}`;
    case "SANCTIONS_LIFTED":
      return `Sanctions are lifted against ${countryFromEvent(world, state, event) ?? "a foreign state"}`;
    case "TREATY_PROPOSED":
      return `A new treaty is proposed with ${countryFromEvent(world, state, event) ?? "foreign partners"}`;
    case "TREATY_COUNTERPARTY_PENDING":
      return `A proposed treaty awaits acceptance by ${countryFromEvent(world, state, event) ?? "foreign partners"}`;
    case "TREATY_RATIFICATION_PENDING":
      return `The Assembly must ratify a proposed treaty with ${countryFromEvent(world, state, event) ?? "foreign partners"}`;
    case "TREATY_RATIFIED":
      return `The Assembly ratifies a treaty with ${countryFromEvent(world, state, event) ?? "foreign partners"}`;
    case "TREATY_REJECTED":
      return `The Assembly rejects a proposed treaty with ${countryFromEvent(world, state, event) ?? "foreign partners"}`;
    case "INCOMING_DIPLOMACY":
    case "FOREIGN_INCOMING_DIPLOMACY":
      return `${countryFromEvent(world, state, event) ?? "A foreign government"} seeks a diplomatic response from Terena`;
    case "TRADE_NEGOTIATION":
      return `Terena opens trade negotiations with ${countryFromEvent(world, state, event) ?? "a trading partner"}`;
    case "ALLIANCE_CONSULTATION":
      return `${lead ?? "The President"} consults ${institutionDisplayName(world, event.entityIds[0])}`;
    case "CRISIS_MEDIATION":
      return `${lead ?? "Terena"} offers mediation in an international crisis`;
    case "TERENA_POSTURE_CHANGED":
      return `Terena adjusts military posture to ${militaryPostureLabel(String(event.payload.posture ?? ""))}`;
    case "MILITARY_POSTURE_CHANGED":
      return `${countryFromEvent(world, state, event) ?? "A foreign power"} changes military posture`;
    case "FOREIGN_OUTREACH":
      return `${countryFromEvent(world, state, event) ?? "A foreign government"} reaches out diplomatically`;
    case "FOREIGN_LEADERSHIP_CHANGE":
      return `Leadership changes in ${countryFromEvent(world, state, event) ?? "a foreign state"}`;
    case "INTERNATIONAL_CONFLICT_STARTED":
      return `An international conflict erupts involving ${countryFromEvent(world, state, event) ?? "foreign belligerents"}`;
    case "INTERNATIONAL_CONFLICT_ESCALATED":
      return `An international conflict intensifies involving ${countryFromEvent(world, state, event) ?? "foreign belligerents"}`;
    case "INTERNATIONAL_CONFLICT_CEASEFIRE":
      return `Ceasefire talks open in an international conflict involving ${countryFromEvent(world, state, event) ?? "foreign belligerents"}`;
    case "INTERNATIONAL_CONFLICT_ENDED":
      return `An international conflict involving ${countryFromEvent(world, state, event) ?? "foreign belligerents"} ends`;
    case "FOREIGN_AFFAIRS_MONTH":
      return `Foreign affairs briefing: ${String(event.payload.activeCrises ?? 0)} active crises internationally`;
    default:
      if (event.type.startsWith("FOREIGN_CRISIS_ESCALATED")) {
        return `International tensions escalate involving ${countryFromEvent(world, state, event) ?? "foreign powers"}`;
      }
      if (event.type.startsWith("FOREIGN_CRISIS_DEESCALATED")) {
        return `International tensions ease involving ${countryFromEvent(world, state, event) ?? "foreign powers"}`;
      }
      if (event.type.startsWith("FOREIGN_CRISIS_")) {
        return `International crisis develops involving ${countryFromEvent(world, state, event) ?? "foreign powers"}`;
      }
      if (event.type.startsWith("INTERNATIONAL_CONFLICT_")) {
        return `International conflict involving ${countryFromEvent(world, state, event) ?? "foreign belligerents"}`;
      }
      if (lead) return `${lead}: ${titleCaseEvent(event.type)}`;
      return titleCaseEvent(event.type);
  }
}

export function terenaBilateralRelationLabel(
  world: KernelWorld,
  state: SimState,
  countryId: string,
): string {
  const key = bilateralKey(TERENA_WORLD_ID, countryId);
  const rel = state.foreignAffairsRuntime.bilateralRelations[key];
  if (!rel) return relationPublicLabel(null);
  return relationPublicLabel(rel.general);
}

export function pollShareLine(
  catalog: PresentationCatalog,
  world: KernelWorld,
  state: SimState,
  shares: Array<{ politicianId: string; partyId?: string | null; share: number }>,
): string {
  return [...shares]
    .sort((a, b) => b.share - a.share)
    .slice(0, 5)
    .map(
      (s) =>
        `${politicianDisplayName(catalog, s.politicianId)} (${partyDisplayName(world, s.partyId ?? null, state)}) ${(s.share * 100).toFixed(1)}%`,
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
