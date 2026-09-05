import { useEffect, useMemo, useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  caseTitle,
  collectPlayerActionableDecisions,
  assemblyCandidateEligibilityError,
  currentAssemblyElectionForFiling,
  currentAssemblyMemberIds,
  currentGubernatorialOpportunity,
  governedProvinceId,
  evaluatePresidentialEligibility,
  isDeclaredContestCandidate,
  PARTY_PLATFORM_ISSUES,
  partyLegalStatus,
  partyPlatformLabel,
  provincialLegislatorForPolitician,
  publicConstituencyPressures,
  storiesChronological,
  TERENA_WORLD_ID,
  type CommandResult,
  type KernelWorld,
  type SimEvent,
  type SimState,
  type Simulation,
  type PartyPlatformIssue,
} from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { EconomyPage } from "./economyScreen.js";
import { ElectionsPage } from "./electionsScreen.js";
import { ForeignAffairsPage } from "./foreignAffairsScreen.js";
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { HistoryPage } from "./historyScreen.js";
import { OfficePage } from "./officeScreen.js";
import {
  groundGameStrength,
  isMp,
  isPresident,
  playerCampaign,
  publicStandingLabel,
} from "./format.js";
import {
  contestDisplayName,
  campaignTypeLabel,
  committeeDisplayName,
  countryDisplayName,
  crisisStageLabel,
  electionDisplayName,
  eventDisplay,
  factionDisplayName,
  isPublicCrisisStage,
  latentStrategicTensions,
  partyColor,
  partyDisplayName,
  partyLegalStatusLabel,
  politicianDisplayName,
  pollShareLine,
  publicSeverityLabel,
  mediaHeadlineForEvent,
  treatyStatusLabel,
  treatyTypeLabel,
  type PresentationCatalog,
} from "./presentation.js";
import { decisionDisplayLabel, interruptDisplay } from "./presentation/display.js";
import { nationalPublicEconomy, regionalPublicEconomy } from "./presentation/economy.js";
import {
  ActivityFeedItem,
  BriefStrip,
  DataTable,
  EmptyState,
  EntityRow,
  NewsItem,
  PageHeader,
  SectionCard,
  SectionDivider,
  TabBar,
  LeadStory,
  MapDetailLayout,
  StatusBadge,
  WorkLayout,
} from "./ui/kit.js";
import { PoliticianProfile, PoliticianCard } from "./ui/politician.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap, type MapMode, type MapSelection } from "./map/TerenaMap.js";
import { constituencySittingSeatBreakdown, mapFillFor } from "./map/fills.js";

export type Screen =
  | "home"
  | "career"
  | "office"
  | "assembly"
  | "party"
  | "campaign"
  | "elections"
  | "executive"
  | "courts"
  | "economy"
  | "organizations"
  | "news"
  | "foreign"
  | "terena"
  | "archive";

export type Figure = {
  id: string;
  name: string;
  office?: string;
  party?: string;
  faction?: string;
  home?: string;
  notes?: string;
  display_summary?: string;
  birth_date?: string;
  party_id?: string | null;
  faction_id?: string | null;
  presidential_status?: string | null;
};

type PageProps = {
  screen: Screen;
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
  figures: Map<string, Figure>;
  offices: string[];
  events: SimEvent[];
  campaign: ReturnType<typeof playerCampaign>;
  selectedBill: string | null;
  setSelectedBill: (id: string | null) => void;
  mapHover: string | null;
  setMapHover: (id: string | null) => void;
  debug: boolean;
  setDebug: (v: boolean) => void;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  countingElection: boolean;
  onResolveAssembly: () => void;
  onResolvePresidential: () => void;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
  globalFocus: { kind: string; id: string } | null;
  setGlobalFocus: (focus: { kind: string; id: string } | null) => void;
};

const PARTY_PLATFORM_LABELS: Record<PartyPlatformIssue, string> = {
  economy: "Economy",
  taxes: "Taxes",
  labor: "Labor",
  housing: "Housing",
  social_policy: "Social policy",
  environment: "Environment",
  institutional_reform: "Institutional reform",
  foreign_policy: "Foreign policy",
};

export function GamePages(props: PageProps) {
  const { screen } = props;
  if (screen === "home") return <Home {...props} />;
  if (screen === "career") return <Career {...props} />;
  if (screen === "office") return <OfficePage {...props} />;
  if (screen === "assembly") return <AssemblyPage {...props} />;
  if (screen === "party") return <Party {...props} />;
  if (screen === "campaign") return <CampaignPage {...props} />;
  if (screen === "elections") return <ElectionsPage {...props} />;
  if (screen === "executive") return <ExecutivePage {...props} />;
  if (screen === "courts") return <CourtsPage {...props} />;
  if (screen === "economy") return <EconomyPage {...props} />;
  if (screen === "organizations") return <OrganizationsPage {...props} />;
  if (screen === "news") return <NewsPage {...props} />;
  if (screen === "foreign") return <ForeignAffairsPage {...props} />;
  if (screen === "terena") return <Terena {...props} />;
  return (
    <HistoryPage
      world={props.world}
      snap={props.snap}
      bundle={props.bundle}
      catalog={props.catalog}
    />
  );
}

function Home(props: PageProps) {
  const playerId = props.snap.playerPoliticianId;
  const interrupt = props.snap.pendingInterrupt;
  const decisions = collectPlayerActionableDecisions(props.world, props.snap);
  const monthEvents = (props.events.length ? props.events : props.snap.history.slice(-24)).filter(
    (e) => e.type !== "TURN_COMPLETED",
  );
  const lead =
    [...monthEvents].sort((a, b) => b.importance - a.importance)[0] ??
    props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-1)[0];
  const terenaPublicCrisis = Object.values(props.snap.foreignAffairsRuntime.crises).find(
    (c) => isPublicCrisisStage(c.stage) && c.participantIds.includes(TERENA_WORLD_ID),
  );
  const terenaLatentTension = latentStrategicTensions(props.snap).find((c) =>
    c.participantIds.includes(TERENA_WORLD_ID),
  );
  const playerIsPresident = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
  const warTrigger = props.snap.executiveRuntime.warTrigger;
  const feed = monthEvents.slice(-8).reverse();
  const stories = storiesChronological(props.snap).slice(0, 4);
  const polls = Object.values(props.snap.polls).slice(-2);
  const publicEconomy = nationalPublicEconomy(props.snap);
  const upcoming = Object.values(props.snap.elections).filter((e) => e.status !== "resolved");
  const figure = props.figures.get(playerId);
  const runtime = props.snap.politicians[playerId];
  const standingLabel = publicStandingLabel(props.world, props.snap, playerId);
  const standingContext = props.snap.history
    .filter(
      (event) =>
        event.visibility === "public" &&
        event.actorIds.includes(playerId) &&
        event.type !== "TURN_COMPLETED",
    )
    .slice(-3)
    .reverse();
  const governedProvince = governedProvinceId(props.world, props.snap, playerId);
  const governorState = governedProvince
    ? props.snap.provincialRuntime.provinces[governedProvince]
    : null;
  const governorEconomy = governedProvince
    ? props.snap.economyRuntime.provinces[governedProvince]
    : null;
  const governorPublicEconomy = governedProvince
    ? regionalPublicEconomy(props.snap, governedProvince)
    : null;
  const playerIsMp = isMp(props.world, props.snap, playerId);
  const provincialMember = provincialLegislatorForPolitician(props.snap, playerId);
  const provincialChamber =
    provincialMember?.serviceStartDate && provincialMember.serviceEndDate == null
      ? props.snap.provincialRuntime.assemblies[provincialMember.provinceId]
      : null;
  const provincialVotesDue =
    provincialMember && provincialChamber
      ? Object.values(props.snap.provincialRuntime.bills).filter(
          (bill) =>
            bill.provinceId === provincialMember.provinceId &&
            bill.status === "introduced" &&
            !props.snap.provincialRuntime.votes[`pending:bill:${bill.id}:${provincialMember.id}`],
        ).length
      : 0;
  const playerConstituencyId =
    Object.values(props.snap.officeTerms).flatMap((term) => {
      if (term.holderId !== playerId || (term.status !== "active" && term.status !== "suspended"))
        return [];
      const office = props.world.offices[term.officeId];
      return office?.kind === "assembly_member" && office.constituencyId
        ? [office.constituencyId]
        : [];
    })[0] ?? null;
  const constituencyPressures = playerConstituencyId
    ? publicConstituencyPressures(props.world, props.snap, playerConstituencyId)
    : [];
  const billsAwaiting = Object.values(props.snap.legislatureRuntime.bills).filter(
    (bill) => bill.status === "sent_to_president",
  ).length;
  const publicCrises = Object.values(props.snap.foreignAffairsRuntime.crises).filter((crisis) =>
    isPublicCrisisStage(crisis.stage),
  ).length;
  const votesDue = decisions.filter((decision) => decision.kind.endsWith("vote")).length;
  const briefTitle = playerIsPresident
    ? "Presidential briefing"
    : governedProvince
      ? `${props.catalog.places.get(governedProvince)?.name ?? "Province"} briefing`
      : playerIsMp
        ? "Assembly briefing"
        : provincialMember && provincialChamber
          ? `${props.catalog.places.get(provincialMember.provinceId)?.name ?? "Province"} Assembly briefing`
          : props.campaign
            ? "Campaign briefing"
            : "Career briefing";

  const briefItems = playerIsPresident
    ? [
        { label: "Bills awaiting", value: billsAwaiting },
        { label: "Public crises", value: publicCrises },
        { label: "Your decisions", value: decisions.length },
        {
          label: "Confidence",
          value: `${publicEconomy.confidence} · ${publicEconomy.confidenceTrend.toLowerCase()}`,
        },
      ]
    : governedProvince && governorState && governorEconomy
      ? [
          { label: "Conditions", value: governorPublicEconomy?.conditions ?? "—" },
          { label: "Monthly actions", value: governorState.actionPointsRemaining },
          { label: "Pressure", value: governorState.activePressureId ? "Action needed" : "Stable" },
          { label: "Standing", value: standingLabel },
        ]
      : playerIsMp
        ? [
            { label: "Votes due", value: votesDue },
            {
              label: "Active bills",
              value: Object.values(props.snap.legislatureRuntime.bills).filter((bill) =>
                ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status),
              ).length,
            },
            {
              label: "Next Assembly",
              value: upcoming.find((election) => election.type === "assembly")?.date ?? "—",
            },
            { label: "Standing", value: standingLabel },
          ]
        : provincialMember && provincialChamber
          ? [
              { label: "Votes due", value: provincialVotesDue },
              { label: "Agenda bills", value: provincialChamber.agendaBillIds.length },
              { label: "Next election", value: provincialChamber.nextElectionDate },
              { label: "Standing", value: standingLabel },
            ]
          : props.campaign
            ? [
                { label: "Monthly actions", value: props.campaign.actionPointsRemaining },
                { label: "Cash", value: Math.round(props.campaign.cashOnHand).toLocaleString() },
                {
                  label: "Race",
                  value: props.campaign.electionId
                    ? electionDisplayName(props.campaign.electionId)
                    : campaignTypeLabel(props.campaign.type),
                },
                { label: "Standing", value: standingLabel },
              ]
            : [
                { label: "Scheduled races", value: upcoming.length },
                { label: "Opportunities", value: "Career" },
                { label: "Standing", value: standingLabel },
                { label: "Office", value: props.offices[0] ?? "Private citizen" },
              ];

  return (
    <div className="home-v5 home-desk">
      <WorkLayout
        header={
          <>
            <div className="home-desk-hero">
              <div className="home-desk-hero-copy">
                <div className="kicker">Political desk</div>
                <h2 className="home-desk-title">{briefTitle}</h2>
                <p className="muted home-desk-lede">
                  {props.offices[0] ?? "Private citizen"} · {standingLabel} standing ·{" "}
                  {props.snap.currentDate}
                </p>
              </div>
              <BriefStrip items={briefItems} />
            </div>
            <PoliticianProfile
              catalog={props.catalog}
              world={props.world}
              state={props.snap}
              politicianId={playerId}
              office={props.offices[0] ?? "Private citizen"}
              party={partyDisplayName(props.world, runtime?.partyId ?? null, props.snap)}
              faction={factionDisplayName(props.world, runtime?.factionId ?? null)}
              {...(figure?.home ? { home: figure.home } : {})}
              standing={`Public standing: ${standingLabel}`}
              {...((figure?.notes ?? figure?.display_summary)
                ? { biography: figure?.notes ?? figure?.display_summary }
                : {})}
            />
          </>
        }
        main={
          <>
            {interrupt ? (
              <div className="briefing-urgent alert">
                <strong>Urgent</strong>
                <p>{interruptDisplay(interrupt)}</p>
              </div>
            ) : null}
            {decisions.length > 0 ? (
              <div>
                <SectionDivider title="Required decisions" />
                {decisions.map((d) => (
                  <div key={d.key} className="decision-row">
                    <span>{decisionDisplayLabel(d, interrupt)}</span>
                    <StatusBadge tone="warn">Action</StatusBadge>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="lead-block">
              {lead ? (
                <LeadStory
                  kicker="Lead story"
                  headline={eventDisplay(props.catalog, props.world, props.snap, lead)}
                  date={lead.date}
                />
              ) : (
                <EmptyState>No major developments this month.</EmptyState>
              )}
            </div>
            {terenaPublicCrisis ? (
              <div className="briefing-urgent alert">
                <strong>International crisis</strong>
                <p>
                  Terena is involved in an active international crisis (
                  {crisisStageLabel(terenaPublicCrisis.stage)} ·{" "}
                  {publicSeverityLabel(terenaPublicCrisis.intensity, terenaPublicCrisis.stage)}).
                  See Foreign Affairs.
                </p>
              </div>
            ) : null}
            {terenaLatentTension && !terenaPublicCrisis ? (
              <div className="briefing-note alert">
                <strong>Strategic tension</strong>
                <p>
                  Background tension persists (
                  {publicSeverityLabel(terenaLatentTension.intensity, terenaLatentTension.stage)}
                  ). Monitor Foreign Affairs.
                </p>
              </div>
            ) : null}
            {playerIsPresident && warTrigger ? (
              <div className="briefing-urgent alert">
                <strong>War powers decision required</strong>
                <p>
                  Open Executive or Foreign Affairs to invoke war powers or seek Assembly
                  authorization.
                </p>
              </div>
            ) : null}
            <SectionDivider title="Recent activity" />
            {feed.length === 0 ? <EmptyState>Quiet month in public records.</EmptyState> : null}
            {feed.map((e) => (
              <ActivityFeedItem
                key={e.id}
                date={e.date}
                text={eventDisplay(props.catalog, props.world, props.snap, e)}
              />
            ))}
            {stories.length > 0 ? (
              <>
                <SectionDivider title="In the press" />
                {stories.map((s) => (
                  <NewsItem
                    key={s.id}
                    headline={
                      s.headlineKey === "Political developments" ||
                      s.headlineKey === "Political storm in Valen"
                        ? mediaHeadlineForEvent(s.factEventType, s.framing)
                        : s.headlineKey
                    }
                    outlet={props.world.mediaOutlets[s.outletId]?.name ?? "Press"}
                    date={s.date}
                    category={s.category}
                  />
                ))}
              </>
            ) : null}
          </>
        }
        rail={
          <>
            <SectionDivider title="Calendar" />
            {upcoming.length === 0 ? <EmptyState>No pending elections.</EmptyState> : null}
            {upcoming.map((el) => (
              <div key={el.id} className="decision-row">
                <div>
                  <strong>{electionDisplayName(el.id)}</strong>
                  <div className="muted">{el.date}</div>
                </div>
              </div>
            ))}
            <SectionDivider title="Campaign" />
            {props.campaign ? (
              <div>
                <StatusBadge tone="ok">Active</StatusBadge>
                <div className="muted">{campaignTypeLabel(props.campaign.type)}</div>
              </div>
            ) : (
              <EmptyState>Not campaigning</EmptyState>
            )}
            {polls.length > 0 ? (
              <>
                <SectionDivider title="Public poll" />
                <p className="muted">
                  {polls[polls.length - 1]!.publicationDate}:{" "}
                  {pollShareLine(
                    props.catalog,
                    props.world,
                    props.snap,
                    polls[polls.length - 1]!.firstPreference,
                  )}
                </p>
              </>
            ) : null}
            {playerIsMp && constituencyPressures.length ? (
              <div className="home-constituency-brief">
                <SectionDivider
                  title="Constituency brief"
                  hint="Public pressures shaping local politics"
                />
                {constituencyPressures.slice(0, 4).map((pressure) => (
                  <EntityRow
                    key={pressure.kind}
                    title={pressure.label}
                    meta={pressure.detail}
                    status={
                      <StatusBadge tone={pressure.level === "urgent" ? "warn" : "idle"}>
                        {pressure.level === "urgent"
                          ? "Urgent"
                          : pressure.level === "important"
                            ? "Important"
                            : "Watch"}
                      </StatusBadge>
                    }
                  />
                ))}
              </div>
            ) : null}
            <SectionDivider
              title="Why this standing?"
              hint="Public context, not a hidden formula"
            />
            <p className="muted">
              Your {standingLabel} standing is presented alongside recent public conduct and the
              conditions attached to your office.
            </p>
            {standingContext.length ? (
              standingContext.map((event) => (
                <ActivityFeedItem
                  key={event.id}
                  date={event.date}
                  text={eventDisplay(props.catalog, props.world, props.snap, event)}
                />
              ))
            ) : (
              <EmptyState>No recent personal event dominates the public record.</EmptyState>
            )}
            <p className="muted">
              Economic context:{" "}
              {governorPublicEconomy?.summary ??
                `${publicEconomy.growth.toFixed(1)}% annual output growth and ${publicEconomy.confidenceTrend.toLowerCase()} confidence`}
              .
            </p>
          </>
        }
      />
    </div>
  );
}

function Career(props: PageProps) {
  const [tab, setTab] = useState<
    | "opportunities"
    | "overview"
    | "career"
    | "positions"
    | "record"
    | "directory"
    | "comparison"
    | "figures"
  >("opportunities");
  const [raceGeography, setRaceGeography] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directorySelection, setDirectorySelection] = useState(props.snap.playerPoliticianId);
  const [directoryVoteFilter, setDirectoryVoteFilter] = useState<"all" | "yes" | "no" | "abstain">(
    "all",
  );
  const [directoryParty, setDirectoryParty] = useState("all");
  const [directoryCaucus, setDirectoryCaucus] = useState("all");
  const [directoryProvince, setDirectoryProvince] = useState("all");
  const [directoryOffice, setDirectoryOffice] = useState("all");
  const [directoryPage, setDirectoryPage] = useState(0);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  useEffect(() => {
    if (props.globalFocus?.kind !== "Politician") return;
    setDirectorySelection(props.globalFocus.id);
    setTab("directory");
  }, [props.globalFocus]);
  useEffect(() => {
    setDirectoryPage(0);
  }, [directoryQuery, directoryParty, directoryCaucus, directoryProvince, directoryOffice]);
  const figure = props.figures.get(props.snap.playerPoliticianId);
  const runtime = props.snap.politicians[props.snap.playerPoliticianId];
  const standingLabel = publicStandingLabel(props.world, props.snap, props.snap.playerPoliticianId);
  const age = figure?.birth_date
    ? Number(props.snap.currentDate.slice(0, 4)) - Number(figure.birth_date.slice(0, 4))
    : null;
  const terms = Object.values(props.snap.officeTerms)
    .filter((t) => t.holderId === props.snap.playerPoliticianId)
    .sort((a, b) => {
      const ad = a.startDate ?? "";
      const bd = b.startDate ?? "";
      return ad < bd ? 1 : ad > bd ? -1 : 0;
    });
  const playerId = props.snap.playerPoliticianId;
  const assemblyElection = currentAssemblyElectionForFiling(props.snap);
  const assemblyCycle = assemblyElection?.assembly;
  const assemblyDecision = assemblyCycle?.decisions[playerId];
  const eligibleConstituencies = Object.keys(props.world.constituencyElectorate)
    .filter(
      (id) => assemblyCandidateEligibilityError(props.snap, props.world, playerId, id) == null,
    )
    .sort((a, b) => {
      const ah = props.world.constituencyProvinceShares[a]?.some(
        (share) => share.provinceId === props.world.politicianHomeProvince[playerId],
      )
        ? 1
        : 0;
      const bh = props.world.constituencyProvinceShares[b]?.some(
        (share) => share.provinceId === props.world.politicianHomeProvince[playerId],
      )
        ? 1
        : 0;
      return (
        bh - ah ||
        (props.world.constituencyElectorate[b]?.seats ?? 0) -
          (props.world.constituencyElectorate[a]?.seats ?? 0) ||
        a.localeCompare(b)
      );
    });
  const chosenConstituency = raceGeography || eligibleConstituencies[0] || "";
  const gubernatorial = currentGubernatorialOpportunity(props.snap, props.world, playerId);
  const playerHome =
    runtime?.homeProvinceId ?? props.world.politicianHomeProvince[playerId] ?? null;
  const provincialAssemblyOpportunities = Object.values(
    props.snap.provincialRuntime.assemblyElections,
  )
    .filter(
      (election) =>
        election.playerDecision == null &&
        election.status !== "resolved" &&
        election.provinceId === playerHome,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const presidential = Object.values(props.snap.elections)
    .filter(
      (election) =>
        election.type === "presidential" &&
        election.status !== "resolved" &&
        election.status !== "cancelled",
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const presidentialEligibility = presidential
    ? evaluatePresidentialEligibility(props.world, props.snap, playerId, presidential.date)
    : null;
  const nomination = presidential
    ? Object.values(props.snap.partyContests).find(
        (contest) =>
          contest.type === "presidential_nomination" &&
          contest.partyId === runtime?.partyId &&
          contest.metadata.electionId === presidential.id,
      )
    : null;
  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    const result = props.sim.executeCommand(command);
    props.report(result);
    props.onDone();
  };
  return (
    <div>
      <PoliticianProfile
        catalog={props.catalog}
        world={props.world}
        state={props.snap}
        politicianId={props.snap.playerPoliticianId}
        office={props.offices[0] ?? "Private citizen"}
        party={partyDisplayName(props.world, runtime?.partyId ?? null, props.snap)}
        faction={factionDisplayName(props.world, runtime?.factionId ?? null)}
        {...(figure?.home ? { home: figure.home } : {})}
        standing={`Public standing: ${standingLabel}`}
        {...((figure?.notes ?? figure?.display_summary)
          ? { biography: figure?.notes ?? figure?.display_summary }
          : runtime?.description
            ? { biography: runtime.description }
            : {})}
      />
      <TabBar
        tabs={[
          { id: "opportunities", label: "Political opportunities" },
          { id: "overview", label: "Overview" },
          { id: "career", label: "Career" },
          { id: "positions", label: "Positions" },
          { id: "record", label: "Public record" },
          { id: "directory", label: "Politicians" },
          {
            id: "comparison",
            label: `Compare${comparisonIds.length ? ` (${comparisonIds.length})` : ""}`,
          },
          { id: "figures", label: "Figures to watch" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "opportunities" ? (
        <div className="opportunities-layout">
          <div className="opportunities-intro">
            <div>
              <span className="eyebrow">Run for office</span>
              <h2>Political opportunities</h2>
            </div>
            <p>
              Only races for which {politicianDisplayName(props.catalog, playerId)} is presently
              eligible are actionable. Public facts are shown; hidden support is not.
            </p>
          </div>
          {presidential ? (
            <section className="opportunity-row">
              <div className="opportunity-office">
                <span>National</span>
                <h3>President</h3>
                <strong>{presidential.date}</strong>
              </div>
              <div className="opportunity-details">
                <p>
                  {presidentialEligibility?.eligible
                    ? "Constitutionally eligible"
                    : presidentialEligibility?.reasons.join(" · ") || "Not presently eligible"}
                </p>
                <p className="muted">
                  Nomination: {nomination?.status ?? "not open"} · national constituency · term
                  incompatibilities apply on assumption.
                </p>
              </div>
              <div className="opportunity-action">
                {presidentialEligibility?.eligible &&
                nomination &&
                ["open", "qualification"].includes(nomination.status) &&
                !nomination.entries[playerId] ? (
                  <button
                    className="btn"
                    onClick={() =>
                      run({
                        type: "DECLARE_CAMPAIGN",
                        politicianId: playerId,
                        campaignType: "presidential_nomination",
                        contestId: nomination.id,
                      })
                    }
                  >
                    Enter nomination
                  </button>
                ) : nomination?.entries[playerId] ? (
                  <StatusBadge tone="ok">Entered</StatusBadge>
                ) : (
                  <StatusBadge>Not yet open</StatusBadge>
                )}
              </div>
            </section>
          ) : null}
          {assemblyElection ? (
            <section className="opportunity-row opportunity-geographic">
              <div className="opportunity-office">
                <span>Constituency</span>
                <h3>National Assembly</h3>
                <strong>{assemblyElection.date}</strong>
              </div>
              <div className="opportunity-details">
                <p>
                  {eligibleConstituencies.length
                    ? `${eligibleConstituencies.length} eligible constituencies`
                    : "No eligible constituency"}{" "}
                  · filing {assemblyCycle?.filingOpenDate}–{assemblyCycle?.filingDeadlineDate}
                </p>
                {assemblyCycle?.filingStatus === "open" && !assemblyDecision ? (
                  <div
                    className="geography-choice-grid"
                    role="listbox"
                    aria-label="Choose an Assembly constituency"
                  >
                    {eligibleConstituencies.map((id) => {
                      const info = props.catalog.places.get(id);
                      const parties = constituencySittingSeatBreakdown(props.world, props.snap, id);
                      const selected = id === chosenConstituency;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`geography-choice${selected ? " selected" : ""}`}
                          onClick={() => setRaceGeography(id)}
                        >
                          <strong>{info?.name ?? "Unknown constituency"}</strong>
                          <span>
                            {info?.provinceName ?? "Terena"} ·{" "}
                            {props.world.constituencyElectorate[id]?.seats ?? "?"} seats
                          </span>
                          <span>
                            {parties
                              .slice(0, 2)
                              .map(
                                (row) =>
                                  `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`,
                              )
                              .join(" · ") || "Open representation"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">
                    Filing status:{" "}
                    {assemblyDecision?.decision ?? assemblyCycle?.filingStatus ?? "planned"}
                  </p>
                )}
              </div>
              <div className="opportunity-action">
                {assemblyCycle?.filingStatus === "open" &&
                !assemblyDecision &&
                chosenConstituency ? (
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        run({
                          type: "FILE_ASSEMBLY_CANDIDACY",
                          electionId: assemblyElection.id,
                          constituencyId: chosenConstituency,
                        })
                      }
                    >
                      File candidacy
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id })
                      }
                    >
                      Decline this cycle
                    </button>
                  </>
                ) : assemblyDecision?.decision === "filed" ? (
                  <StatusBadge tone="ok">Filed</StatusBadge>
                ) : assemblyDecision?.decision === "declined" ? (
                  <StatusBadge>Declined</StatusBadge>
                ) : (
                  <StatusBadge>Filing not open</StatusBadge>
                )}
              </div>
            </section>
          ) : null}
          {gubernatorial.map((race) => {
            const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
            return (
              <section className="opportunity-row" key={race.id}>
                <div className="opportunity-office">
                  <span>Province</span>
                  <h3>Governor of {provinceName}</h3>
                  <strong>{race.date}</strong>
                </div>
                <div className="opportunity-details">
                  <p>
                    Resident and presently eligible · incumbent{" "}
                    {race.incumbentId
                      ? politicianDisplayName(props.catalog, race.incumbentId)
                      : "none"}
                  </p>
                  <p className="muted">
                    Filing {race.filingOpenDate}–{race.filingDeadlineDate} · province-wide plurality
                    election.
                  </p>
                </div>
                <div className="opportunity-action">
                  {race.status === "filing_open" ? (
                    <>
                      <button
                        className="btn"
                        onClick={() =>
                          run({
                            type: "FILE_GUBERNATORIAL_CANDIDACY",
                            electionId: race.id,
                            provinceId: race.provinceId,
                          })
                        }
                      >
                        File candidacy
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() =>
                          run({ type: "DECLINE_GUBERNATORIAL_CANDIDACY", electionId: race.id })
                        }
                      >
                        Decline this cycle
                      </button>
                    </>
                  ) : (
                    <StatusBadge>Opens {race.filingOpenDate}</StatusBadge>
                  )}
                </div>
              </section>
            );
          })}
          {provincialAssemblyOpportunities.map((race) => {
            const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
            return (
              <section className="opportunity-row" key={race.id}>
                <div className="opportunity-office">
                  <span>Province</span>
                  <h3>{provinceName} Provincial Assembly</h3>
                  <strong>{race.date}</strong>
                </div>
                <div className="opportunity-details">
                  <p>
                    Province-wide proportional election · chamber{" "}
                    {props.snap.provincialRuntime.assemblies[race.provinceId]?.seatCount ?? "—"}{" "}
                    seats
                  </p>
                  <p className="muted">
                    A provincial term can build a record for Governor or the National Assembly.
                  </p>
                </div>
                <div className="opportunity-action">
                  {race.status === "filing_open" ? (
                    <>
                      <button
                        className="btn"
                        onClick={() =>
                          run({ type: "FILE_PROVINCIAL_ASSEMBLY_CANDIDACY", electionId: race.id })
                        }
                      >
                        Join party list
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() =>
                          run({
                            type: "DECLINE_PROVINCIAL_ASSEMBLY_CANDIDACY",
                            electionId: race.id,
                          })
                        }
                      >
                        Decline this cycle
                      </button>
                    </>
                  ) : (
                    <StatusBadge>Opens five months before election</StatusBadge>
                  )}
                </div>
              </section>
            );
          })}
          {!presidential &&
          !assemblyElection &&
          gubernatorial.length === 0 &&
          provincialAssemblyOpportunities.length === 0 ? (
            <EmptyState>No modeled election opportunity is currently scheduled.</EmptyState>
          ) : null}
        </div>
      ) : null}
      {tab === "overview" ? (
        <SectionCard title="Public biography">
          <p>
            {figure?.notes ??
              figure?.display_summary ??
              runtime?.description ??
              "No public biography on file."}
          </p>
          {age != null ? <p>Age: {age}</p> : null}
        </SectionCard>
      ) : null}
      {tab === "career" ? (
        <SectionCard title="Offices">
          {terms.length === 0 ? <EmptyState>No office terms on file.</EmptyState> : null}
          {terms.map((t) => (
            <div key={t.id}>
              {props.world.offices[t.officeId]?.title ?? t.officeId} · {t.status} · {t.startDate}
              {t.endDate ? ` – ${t.endDate}` : ""}
            </div>
          ))}
        </SectionCard>
      ) : null}
      {tab === "positions" ? (
        <SectionCard title="Public offices and campaign">
          <p>{props.offices.join(", ") || "No current office"}</p>
          <p className="muted">
            {props.campaign ? "Campaign underway" : "Not currently campaigning"}
          </p>
          <p className="muted">Public associations: see Organizations for known contacts.</p>
        </SectionCard>
      ) : null}
      {tab === "record" ? (
        <SectionCard title="Public history">
          {props.snap.history.filter(
            (e) => e.visibility === "public" && e.actorIds.includes(props.snap.playerPoliticianId),
          ).length === 0 ? (
            <EmptyState>No public career events are recorded yet.</EmptyState>
          ) : null}
          {[
            ...new Set(
              props.snap.history
                .filter(
                  (e) =>
                    e.visibility === "public" && e.actorIds.includes(props.snap.playerPoliticianId),
                )
                .map((e) => e.date.slice(0, 4)),
            ),
          ]
            .sort()
            .reverse()
            .map((year) => (
              <section className="profile-history-year" key={year}>
                <strong>{year}</strong>
                <div>
                  {props.snap.history
                    .filter(
                      (e) =>
                        e.visibility === "public" &&
                        e.actorIds.includes(props.snap.playerPoliticianId) &&
                        e.date.startsWith(year),
                    )
                    .slice()
                    .reverse()
                    .map((e) => (
                      <ActivityFeedItem
                        key={e.id}
                        date={e.date}
                        text={eventDisplay(props.catalog, props.world, props.snap, e)}
                      />
                    ))}
                </div>
              </section>
            ))}
        </SectionCard>
      ) : null}
      {tab === "directory"
        ? (() => {
            const PAGE_SIZE = 30;
            const query = directoryQuery.trim().toLowerCase();
            const rows = Object.values(props.snap.politicians)
              .filter((politician) => politician.alive)
              .filter((politician) => {
                const name = politicianDisplayName(props.catalog, politician.id).toLowerCase();
                const party = partyDisplayName(
                  props.world,
                  politician.partyId,
                  props.snap,
                ).toLowerCase();
                return !query || name.includes(query) || party.includes(query);
              })
              .filter(
                (politician) => directoryParty === "all" || politician.partyId === directoryParty,
              )
              .filter(
                (politician) =>
                  directoryCaucus === "all" || politician.factionId === directoryCaucus,
              )
              .filter(
                (politician) =>
                  directoryProvince === "all" ||
                  (politician.homeProvinceId ??
                    props.world.politicianHomeProvince[politician.id]) === directoryProvince,
              )
              .filter((politician) => {
                if (directoryOffice === "all") return true;
                if (directoryOffice === "party_leader")
                  return Object.values(props.snap.partyStates).some(
                    (party) => party.leaderId === politician.id,
                  );
                if (directoryOffice === "caucus_leader")
                  return Object.values(props.snap.factionStates).some(
                    (caucus) => caucus.chairId === politician.id,
                  );
                return Object.values(props.snap.officeTerms).some(
                  (term) =>
                    term.holderId === politician.id &&
                    term.status === "active" &&
                    props.world.offices[term.officeId]?.kind === directoryOffice,
                );
              })
              .sort((a, b) =>
                politicianDisplayName(props.catalog, a.id).localeCompare(
                  politicianDisplayName(props.catalog, b.id),
                ),
              );
            const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
            const page = Math.min(directoryPage, pageCount - 1);
            const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            const selected = props.snap.politicians[directorySelection] ?? rows[0];
            const selectedTerms = selected
              ? Object.values(props.snap.officeTerms).filter(
                  (term) => term.holderId === selected.id,
                )
              : [];
            const selectedCommittees = selected
              ? Object.values(props.snap.legislatureRuntime.committees).filter(
                  (committee) => committee.chairId === selected.id,
                )
              : [];
            const selectedPartyLeadership = selected
              ? Object.values(props.snap.partyStates).filter(
                  (party) => party.leaderId === selected.id,
                )
              : [];
            const selectedCaucusLeadership = selected
              ? Object.values(props.snap.factionStates).filter(
                  (caucus) => caucus.chairId === selected.id,
                )
              : [];
            const selectedEndorsements = selected
              ? Object.values(props.snap.endorsements)
                  .filter(
                    (endorsement) =>
                      endorsement.public &&
                      (endorsement.targetId === selected.id ||
                        (endorsement.endorserType === "politician" &&
                          endorsement.endorserId === selected.id)),
                  )
                  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                  .slice(0, 10)
              : [];
            const selectedOrganizationEndorsements = selected
              ? Object.entries(props.snap.organizationRuntime.actors)
                  .flatMap(([organizationId, actor]) =>
                    actor.endorsements
                      .filter(
                        (endorsement) =>
                          endorsement.public && endorsement.politicianId === selected.id,
                      )
                      .map((endorsement) => ({ organizationId, endorsement })),
                  )
                  .sort(
                    (a, b) =>
                      b.endorsement.date.localeCompare(a.endorsement.date) ||
                      a.organizationId.localeCompare(b.organizationId),
                  )
                  .slice(0, 10)
              : [];
            const selectedVotes = selected
              ? Object.values(props.snap.legislatureRuntime.legislativeVotes)
                  .filter((vote) => vote.votes[selected.id])
                  .filter(
                    (vote) =>
                      directoryVoteFilter === "all" ||
                      vote.votes[selected.id] === directoryVoteFilter,
                  )
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 40)
              : [];
            return (
              <WorkLayout
                main={
                  <>
                    <input
                      aria-label="Search politicians"
                      placeholder="Search name or party"
                      value={directoryQuery}
                      onChange={(event) => setDirectoryQuery(event.target.value)}
                    />
                    <div className="directory-filters">
                      <label className="field-label">
                        Party
                        <select
                          value={directoryParty}
                          onChange={(event) => setDirectoryParty(event.target.value)}
                        >
                          <option value="all">All parties</option>
                          {Object.keys(props.world.partyDefinitions)
                            .filter(
                              (partyId) => partyId !== props.world.independentAggregatePartyId,
                            )
                            .sort()
                            .map((partyId) => (
                              <option key={partyId} value={partyId}>
                                {partyDisplayName(props.world, partyId, props.snap)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Caucus
                        <select
                          value={directoryCaucus}
                          onChange={(event) => setDirectoryCaucus(event.target.value)}
                        >
                          <option value="all">All caucuses</option>
                          {Object.entries(props.world.factionDefinitions)
                            .sort((a, b) => a[1].name.localeCompare(b[1].name))
                            .map(([caucusId, caucus]) => (
                              <option key={caucusId} value={caucusId}>
                                {caucus.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Province
                        <select
                          value={directoryProvince}
                          onChange={(event) => setDirectoryProvince(event.target.value)}
                        >
                          <option value="all">All provinces</option>
                          {props.world.provinceIds
                            .slice()
                            .sort((a, b) =>
                              (props.catalog.places.get(a)?.name ?? a).localeCompare(
                                props.catalog.places.get(b)?.name ?? b,
                              ),
                            )
                            .map((provinceId) => (
                              <option key={provinceId} value={provinceId}>
                                {props.catalog.places.get(provinceId)?.name ?? "Province"}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Office
                        <select
                          value={directoryOffice}
                          onChange={(event) => setDirectoryOffice(event.target.value)}
                        >
                          <option value="all">All offices</option>
                          <option value="assembly_member">National Assembly</option>
                          <option value="governor">Governor</option>
                          <option value="minister">Minister</option>
                          <option value="mayor">Mayor</option>
                          <option value="constitutional_court_justice">Justice</option>
                          <option value="party_leader">Party leader</option>
                          <option value="caucus_leader">Caucus chair</option>
                        </select>
                      </label>
                    </div>
                    <div className="directory-count-row">
                      <p className="muted">
                        {rows.length} matching public figures · {PAGE_SIZE} per page
                      </p>
                      {comparisonIds.length >= 2 ? (
                        <button
                          type="button"
                          className="btn btn-sm secondary"
                          onClick={() => setTab("comparison")}
                        >
                          Compare selected ({comparisonIds.length})
                        </button>
                      ) : null}
                    </div>
                    <div className="entity-list politician-directory-list">
                      {visibleRows.map((politician) => (
                        <div className="politician-directory-row" key={politician.id}>
                          <PoliticianCard
                            catalog={props.catalog}
                            world={props.world}
                            state={props.snap}
                            politicianId={politician.id}
                            compact
                            selected={politician.id === selected?.id}
                            onSelect={() => setDirectorySelection(politician.id)}
                          />
                          <button
                            type="button"
                            className={`compare-toggle${comparisonIds.includes(politician.id) ? " selected" : ""}`}
                            aria-pressed={comparisonIds.includes(politician.id)}
                            disabled={
                              !comparisonIds.includes(politician.id) && comparisonIds.length >= 3
                            }
                            onClick={() =>
                              setComparisonIds((ids) =>
                                ids.includes(politician.id)
                                  ? ids.filter((id) => id !== politician.id)
                                  : [...ids, politician.id].slice(0, 3),
                              )
                            }
                          >
                            {comparisonIds.includes(politician.id) ? "Comparing" : "Compare"}
                          </button>
                        </div>
                      ))}
                    </div>
                    {pageCount > 1 ? (
                      <div className="pager">
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={page === 0}
                          onClick={() => setDirectoryPage(page - 1)}
                        >
                          Previous
                        </button>
                        <span className="muted">
                          Page {page + 1} of {pageCount}
                        </span>
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={page >= pageCount - 1}
                          onClick={() => setDirectoryPage(page + 1)}
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </>
                }
                rail={
                  selected ? (
                    <>
                      <PoliticianProfile
                        catalog={props.catalog}
                        world={props.world}
                        state={props.snap}
                        politicianId={selected.id}
                        party={partyDisplayName(props.world, selected.partyId, props.snap)}
                        {...(selected.description ? { biography: selected.description } : {})}
                      />
                      <SectionDivider title="Office history" />
                      {selectedTerms.length === 0 ? (
                        <EmptyState>No public office on file.</EmptyState>
                      ) : (
                        selectedTerms
                          .slice()
                          .reverse()
                          .map((term) => (
                            <div key={term.id} className="muted">
                              {props.world.offices[term.officeId]?.title ?? "Public office"} ·{" "}
                              {term.startDate ?? "date unknown"} · {term.status}
                            </div>
                          ))
                      )}
                      <SectionDivider title="Institutional roles" />
                      {selectedCommittees.length +
                        selectedPartyLeadership.length +
                        selectedCaucusLeadership.length ===
                      0 ? (
                        <EmptyState>No current public leadership role.</EmptyState>
                      ) : (
                        <>
                          {selectedCommittees.map((committee) => (
                            <div key={committee.id} className="muted">
                              Chair · {committeeDisplayName(committee.id)}
                            </div>
                          ))}
                          {selectedPartyLeadership.map((party) => (
                            <div key={party.partyId} className="muted">
                              Leader · {partyDisplayName(props.world, party.partyId, props.snap)}
                            </div>
                          ))}
                          {selectedCaucusLeadership.map((caucus) => (
                            <div key={caucus.factionId} className="muted">
                              Chair · {factionDisplayName(props.world, caucus.factionId)}
                            </div>
                          ))}
                        </>
                      )}
                      <SectionDivider title="Public endorsements" />
                      {selectedEndorsements.length + selectedOrganizationEndorsements.length ===
                      0 ? (
                        <EmptyState>No public endorsement is recorded.</EmptyState>
                      ) : (
                        <>
                          {selectedEndorsements.map((endorsement) => {
                            const giving =
                              endorsement.endorserType === "politician" &&
                              endorsement.endorserId === selected.id;
                            const other = giving
                              ? politicianDisplayName(props.catalog, endorsement.targetId)
                              : endorsement.endorserType === "politician"
                                ? politicianDisplayName(props.catalog, endorsement.endorserId)
                                : endorsement.endorserType === "faction"
                                  ? factionDisplayName(props.world, endorsement.endorserId)
                                  : `${props.catalog.places.get(props.world.provincialPartyOrganizations[endorsement.endorserId]?.provinceId ?? "")?.name ?? "Provincial"} party organization`;
                            return (
                              <EntityRow
                                key={endorsement.id}
                                title={giving ? `Endorsed ${other}` : `Endorsed by ${other}`}
                                meta={`${contestDisplayName(props.snap, props.world, endorsement.contestId)} · ${endorsement.date}`}
                                status={
                                  <StatusBadge
                                    tone={endorsement.status === "active" ? "ok" : "idle"}
                                  >
                                    {endorsement.status === "active"
                                      ? "Current"
                                      : endorsement.status[0]!.toUpperCase() +
                                        endorsement.status.slice(1)}
                                  </StatusBadge>
                                }
                              />
                            );
                          })}
                          {selectedOrganizationEndorsements.map(
                            ({ organizationId, endorsement }, index) => {
                              const campaign = endorsement.campaignId
                                ? props.snap.campaignRuntime.campaigns[endorsement.campaignId]
                                : null;
                              return (
                                <EntityRow
                                  key={`${organizationId}:${endorsement.campaignId ?? "campaign"}:${index}`}
                                  title={`Endorsed by ${props.world.interestOrganizations[organizationId]?.name ?? "Public organization"}`}
                                  meta={`${campaign ? campaignTypeLabel(campaign.type) : "Political campaign"} · ${endorsement.date}${endorsement.withdrawnDate ? ` · withdrawn ${endorsement.withdrawnDate}` : ""}`}
                                  status={
                                    <StatusBadge
                                      tone={
                                        (endorsement.status ?? "active") === "active"
                                          ? "ok"
                                          : "idle"
                                      }
                                    >
                                      {(endorsement.status ?? "active") === "active"
                                        ? "Current"
                                        : "Withdrawn"}
                                    </StatusBadge>
                                  }
                                />
                              );
                            },
                          )}
                        </>
                      )}
                      <SectionDivider title="Recent Assembly votes" />
                      <div
                        className="map-scale-switch"
                        aria-label="Filter politician voting record"
                      >
                        {(["all", "yes", "no", "abstain"] as const).map((choice) => (
                          <button
                            type="button"
                            key={choice}
                            className={directoryVoteFilter === choice ? "active" : ""}
                            onClick={() => setDirectoryVoteFilter(choice)}
                          >
                            {choice === "yes"
                              ? "Aye"
                              : choice === "no"
                                ? "Nay"
                                : choice[0]!.toUpperCase() + choice.slice(1)}
                          </button>
                        ))}
                      </div>
                      {selectedVotes.length === 0 ? (
                        <EmptyState>No recorded federal roll call matches this filter.</EmptyState>
                      ) : (
                        <DataTable dense headers={["Date", "Measure", "Vote", "Party", "Caucus"]}>
                          {selectedVotes.map((vote) => {
                            const bill = props.snap.legislatureRuntime.bills[vote.billId];
                            const choice = vote.votes[selected.id]!;
                            const partyId = vote.partyIdsAtVote?.[selected.id];
                            const recommendation = partyId
                              ? (props.snap.legislatureRuntime.partyRecommendations[
                                  `${partyId}:${vote.billId}`
                                ]?.stance ?? "free_vote")
                              : "free_vote";
                            const followed =
                              recommendation === "free_vote"
                                ? "Free vote"
                                : recommendation === "support"
                                  ? choice === "yes"
                                    ? "Followed party"
                                    : "Broke with party"
                                  : choice === "no"
                                    ? "Followed party"
                                    : "Broke with party";
                            const factionId = vote.factionIdsAtVote?.[selected.id];
                            const caucusRecommendation = factionId
                              ? (props.snap.legislatureRuntime.factionRecommendations[
                                  `${factionId}:${vote.billId}`
                                ]?.stance ?? "free_vote")
                              : "free_vote";
                            const caucusFollowed =
                              caucusRecommendation === "free_vote"
                                ? "Free vote"
                                : caucusRecommendation === "support"
                                  ? choice === "yes"
                                    ? "Followed caucus"
                                    : "Broke with caucus"
                                  : choice === "no"
                                    ? "Followed caucus"
                                    : "Broke with caucus";
                            return (
                              <tr key={vote.id}>
                                <td>{vote.date}</td>
                                <td>{bill?.title ?? "Assembly matter"}</td>
                                <td>
                                  {choice === "yes" ? "Aye" : choice === "no" ? "Nay" : "Abstain"}
                                </td>
                                <td>{followed}</td>
                                <td>{caucusFollowed}</td>
                              </tr>
                            );
                          })}
                        </DataTable>
                      )}
                      <SectionDivider title="Recent public history" />
                      {props.snap.history
                        .filter(
                          (event) =>
                            event.visibility === "public" && event.actorIds.includes(selected.id),
                        )
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <ActivityFeedItem
                            key={event.id}
                            date={event.date}
                            text={eventDisplay(props.catalog, props.world, props.snap, event)}
                          />
                        ))}
                      {props.snap.history.filter(
                        (event) =>
                          event.visibility === "public" && event.actorIds.includes(selected.id),
                      ).length === 0 ? (
                        <EmptyState>No public career event is recorded.</EmptyState>
                      ) : null}
                    </>
                  ) : (
                    <EmptyState>Select a politician.</EmptyState>
                  )
                }
              />
            );
          })()
        : null}
      {tab === "comparison"
        ? (() => {
            const selected = comparisonIds
              .map((id) => props.snap.politicians[id])
              .filter((row): row is NonNullable<typeof row> => Boolean(row));
            const activeOffice = (id: string) =>
              Object.values(props.snap.officeTerms)
                .filter(
                  (term) =>
                    term.holderId === id &&
                    (term.status === "active" || term.status === "suspended"),
                )
                .map((term) => props.world.offices[term.officeId]?.title)
                .filter(Boolean)
                .join(", ") || "Private citizen";
            const publicAge = (id: string) => {
              const birthDate =
                props.figures.get(id)?.birth_date ??
                props.snap.generatedAgentProfiles[id]?.birthDate;
              if (!birthDate) return "Not published";
              const today = props.snap.currentDate;
              const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
              return String(years - (today.slice(5) < birthDate.slice(5) ? 1 : 0));
            };
            const electionRecord = (id: string) => {
              let wins = 0;
              let races = 0;
              for (const election of Object.values(props.snap.elections)) {
                if (election.candidates[id] || election.assembly?.candidacies[id]) races += 1;
                if (election.winnerIds.includes(id)) wins += 1;
              }
              for (const election of Object.values(props.snap.provincialRuntime.elections)) {
                if (election.candidates[id]) races += 1;
                if (election.winnerId === id) wins += 1;
              }
              return races ? `${wins} wins in ${races} recorded races` : "No recorded election";
            };
            const leadership = (id: string) => {
              const roles = [
                ...Object.values(props.snap.partyStates)
                  .filter((party) => party.leaderId === id)
                  .map(
                    (party) => `${partyDisplayName(props.world, party.partyId, props.snap)} leader`,
                  ),
                ...Object.values(props.snap.factionStates)
                  .filter((caucus) => caucus.chairId === id)
                  .map((caucus) => `${factionDisplayName(props.world, caucus.factionId)} chair`),
                ...Object.values(props.snap.legislatureRuntime.committees)
                  .filter((committee) => committee.chairId === id)
                  .map((committee) => `${committeeDisplayName(committee.id)} chair`),
              ];
              return roles.join(", ") || "No current leadership post";
            };
            const voteSummary = (id: string) => {
              const choices = Object.values(props.snap.legislatureRuntime.legislativeVotes)
                .map((vote) => vote.votes[id])
                .filter(Boolean);
              if (!choices.length) return "No federal roll-call record";
              return `${choices.filter((choice) => choice === "yes").length} aye · ${choices.filter((choice) => choice === "no").length} nay · ${choices.filter((choice) => choice === "abstain").length} abstain`;
            };
            const career = (id: string) => {
              const terms = Object.values(props.snap.officeTerms).filter(
                (term) => term.holderId === id,
              );
              return terms.length
                ? [
                    ...new Set(
                      terms.map(
                        (term) => props.world.offices[term.officeId]?.title ?? "Public office",
                      ),
                    ),
                  ].join(", ")
                : "No public office";
            };
            const rows: Array<[string, (id: string) => string]> = [
              ["Age", publicAge],
              ["Current office", activeOffice],
              [
                "Party",
                (id) =>
                  partyDisplayName(
                    props.world,
                    props.snap.politicians[id]?.partyId ?? null,
                    props.snap,
                  ),
              ],
              [
                "Caucus",
                (id) =>
                  factionDisplayName(props.world, props.snap.politicians[id]?.factionId ?? null),
              ],
              [
                "Province",
                (id) =>
                  props.catalog.places.get(
                    props.snap.politicians[id]?.homeProvinceId ??
                      props.world.politicianHomeProvince[id] ??
                      "",
                  )?.name ?? "Not published",
              ],
              ["Public standing", (id) => publicStandingLabel(props.world, props.snap, id)],
              ["Career", career],
              ["Election record", electionRecord],
              ["Leadership", leadership],
              ["Voting record", voteSummary],
            ];
            return (
              <div className="politician-comparison">
                <PageHeader
                  kicker="Public record"
                  title="Compare politicians"
                  subtitle="Public offices, affiliations, standing, elections, leadership, and roll calls. Hidden personality and strategy are not shown."
                />
                {selected.length < 2 ? (
                  <EmptyState>
                    Select two or three politicians from the directory to compare.
                  </EmptyState>
                ) : (
                  <DataTable
                    headers={[
                      "Public fact",
                      ...selected.map((politician) =>
                        politicianDisplayName(props.catalog, politician.id),
                      ),
                    ]}
                  >
                    <>
                      {rows.map(([label, value]) => (
                        <tr key={label}>
                          <th scope="row">{label}</th>
                          {selected.map((politician) => (
                            <td key={politician.id}>{value(politician.id)}</td>
                          ))}
                        </tr>
                      ))}
                    </>
                  </DataTable>
                )}
                {selected.length ? (
                  <div className="button-row">
                    {selected.map((politician) => (
                      <button
                        key={politician.id}
                        type="button"
                        className="btn btn-sm secondary"
                        onClick={() =>
                          setComparisonIds((ids) => ids.filter((id) => id !== politician.id))
                        }
                      >
                        Remove {politicianDisplayName(props.catalog, politician.id)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })()
        : null}
      {tab === "figures"
        ? (() => {
            const activeKind = (id: string, kind: string) =>
              Object.values(props.snap.officeTerms).some(
                (term) =>
                  term.holderId === id &&
                  (term.status === "active" || term.status === "suspended") &&
                  props.world.offices[term.officeId]?.kind === kind,
              );
            const publicAchievementScore = (id: string) => {
              const standing = publicStandingLabel(props.world, props.snap, id);
              const standingScore =
                standing === "National figure"
                  ? 6
                  : standing === "Prominent"
                    ? 4
                    : standing === "Established"
                      ? 2
                      : 0;
              const terms = Object.values(props.snap.officeTerms).filter(
                (term) => term.holderId === id,
              ).length;
              const leadership =
                Object.values(props.snap.partyStates).some((party) => party.leaderId === id) ||
                Object.values(props.snap.factionStates).some((caucus) => caucus.chairId === id)
                  ? 4
                  : 0;
              const legislation = Object.values(props.snap.legislatureRuntime.bills).filter(
                (bill) => bill.sponsorId === id || bill.cosponsorIds.includes(id),
              ).length;
              const wins =
                Object.values(props.snap.elections).filter((election) =>
                  election.winnerIds.includes(id),
                ).length +
                Object.values(props.snap.provincialRuntime.elections).filter(
                  (election) => election.winnerId === id,
                ).length;
              return (
                standingScore +
                Math.min(5, terms) +
                leadership +
                Math.min(4, legislation) +
                Math.min(5, wins)
              );
            };
            const ranked = (ids: string[]) =>
              ids
                .filter(
                  (id) => props.snap.politicians[id]?.alive && !props.snap.politicians[id]?.retired,
                )
                .sort(
                  (a, b) =>
                    publicAchievementScore(b) - publicAchievementScore(a) ||
                    politicianDisplayName(props.catalog, a).localeCompare(
                      politicianDisplayName(props.catalog, b),
                    ),
                )
                .slice(0, 8);
            const allIds = Object.keys(props.snap.politicians);
            const provincialLeaders = new Set<string>();
            for (const assembly of Object.values(props.snap.provincialRuntime.assemblies)) {
              if (assembly.presidingOfficerId) provincialLeaders.add(assembly.presidingOfficerId);
              for (const leadership of Object.values(assembly.partyLeadership)) {
                if (leadership.floorLeaderId) provincialLeaders.add(leadership.floorLeaderId);
                if (leadership.whipId) provincialLeaders.add(leadership.whipId);
              }
            }
            const groups = [
              {
                title: "Prominent Governors",
                ids: ranked(allIds.filter((id) => activeKind(id, "governor"))),
              },
              {
                title: "Senior legislators",
                ids: ranked(
                  allIds.filter(
                    (id) => activeKind(id, "assembly_member") || activeKind(id, "speaker"),
                  ),
                ),
              },
              { title: "Emerging provincial leaders", ids: ranked([...provincialLeaders]) },
              {
                title: "Major legal figures",
                ids: ranked(
                  allIds.filter(
                    (id) =>
                      activeKind(id, "constitutional_court_justice") ||
                      Object.values(props.snap.constitutionalRuntime.legalCareerPool).some(
                        (career) => career.fullPoliticianId === id,
                      ),
                  ),
                ),
              },
            ];
            return (
              <div>
                <PageHeader
                  kicker="Political class"
                  title="Figures to watch"
                  subtitle="Contextual public prominence based on office, standing, electoral success, leadership, and legislative work—not hidden potential."
                />
                <div className="figures-watch-grid">
                  {groups.map((group) => (
                    <SectionCard key={group.title} title={group.title}>
                      {group.ids.length === 0 ? (
                        <EmptyState>No public figure currently qualifies.</EmptyState>
                      ) : (
                        group.ids.map((id) => (
                          <PoliticianCard
                            key={id}
                            catalog={props.catalog}
                            world={props.world}
                            state={props.snap}
                            politicianId={id}
                            compact
                            descriptor={publicStandingLabel(props.world, props.snap, id)}
                            onSelect={() => {
                              setDirectorySelection(id);
                              setTab("directory");
                            }}
                          />
                        ))
                      )}
                    </SectionCard>
                  ))}
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}

function Party(props: PageProps) {
  const playerPartyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
  const availablePartyIds = Object.keys(props.world.partyDefinitions)
    .filter((id) => id !== props.world.independentAggregatePartyId)
    .sort((a, b) =>
      partyDisplayName(props.world, a, props.snap).localeCompare(
        partyDisplayName(props.world, b, props.snap),
      ),
    );
  const [selectedPartyId, setSelectedPartyId] = useState(
    playerPartyId ?? availablePartyIds[0] ?? "",
  );
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(
    props.globalFocus?.kind === "Caucus" ? props.globalFocus.id : null,
  );
  useEffect(() => {
    if (props.globalFocus?.kind === "Party" && props.world.partyDefinitions[props.globalFocus.id]) {
      setSelectedPartyId(props.globalFocus.id);
    } else if (props.globalFocus?.kind === "Caucus") {
      const partyId = props.world.factionDefinitions[props.globalFocus.id]?.partyId;
      if (partyId) {
        setSelectedPartyId(partyId);
        setSelectedFactionId(props.globalFocus.id);
      }
    }
  }, [props.globalFocus, props.world]);
  const partyId = selectedPartyId || playerPartyId;
  const party = partyId ? props.world.partyDefinitions[partyId] : null;
  const runtime = partyId ? props.snap.partyStates[partyId] : null;
  const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
  const members = currentAssemblyMemberIds(props.world, props.snap);
  const caucus = members.filter((id) => props.snap.politicians[id]?.partyId === partyId).length;
  const totalSeats = props.world.legislativeConstitution.assemblySeatCount;
  const presidentId = Object.values(props.snap.officeTerms).find((t) => {
    if (t.status !== "active") return false;
    return props.world.offices[t.officeId]?.kind === "president";
  })?.holderId;
  const govParty = presidentId ? props.snap.politicians[presidentId]?.partyId : null;
  const position = !partyId ? "Independent" : partyId === govParty ? "In government" : "Opposition";
  const recent = props.snap.history
    .filter((e) => {
      if (e.type === "TURN_COMPLETED") return false;
      return (
        e.entityIds.includes(partyId ?? "") ||
        e.payload.partyId === partyId ||
        e.payload.previousPartyId === partyId
      );
    })
    .slice(-8)
    .reverse();
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const caucusLeadership = partyId ? props.snap.legislatureRuntime.caucusLeadership[partyId] : null;
  const caucusContests = Object.values(props.snap.legislatureRuntime.caucusContests).filter(
    (contest) => contest.partyId === partyId,
  );
  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    props.report(props.sim.executeCommand(command));
    props.onDone();
  };
  const selectedFaction = selectedFactionId
    ? props.world.factionDefinitions[selectedFactionId]
    : null;
  if (selectedFaction) {
    const factionState = props.snap.factionStates[selectedFaction.factionId];
    const factionMembers = Object.values(props.snap.politicians)
      .filter(
        (politician) =>
          politician.alive &&
          !politician.retired &&
          politician.factionId === selectedFaction.factionId,
      )
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a.id).localeCompare(
          politicianDisplayName(props.catalog, b.id),
        ),
      );
    const factionMps = members.filter(
      (memberId) => props.snap.politicians[memberId]?.factionId === selectedFaction.factionId,
    );
    const partyAssemblyMembers = members.filter(
      (memberId) => props.snap.politicians[memberId]?.partyId === selectedFaction.partyId,
    );
    const leadershipContests = Object.values(props.snap.partyContests)
      .filter((contest) => contest.factionId === selectedFaction.factionId)
      .sort((a, b) =>
        (b.resolvedDate ?? b.createdDate).localeCompare(a.resolvedDate ?? a.createdDate),
      );
    const factionVotes = Object.values(props.snap.legislatureRuntime.legislativeVotes)
      .map((vote) => {
        const choices = Object.entries(vote.votes).filter(
          ([memberId]) =>
            (vote.factionIdsAtVote?.[memberId] ?? props.snap.politicians[memberId]?.factionId) ===
            selectedFaction.factionId,
        );
        return {
          vote,
          aye: choices.filter(([, choice]) => choice === "yes").length,
          nay: choices.filter(([, choice]) => choice === "no").length,
          abstain: choices.filter(([, choice]) => choice === "abstain").length,
        };
      })
      .filter((row) => row.aye + row.nay + row.abstain > 0)
      .sort((a, b) => b.vote.date.localeCompare(a.vote.date) || b.vote.id.localeCompare(a.vote.id))
      .slice(0, 8);
    const priorities = factionVotes.filter((row) => row.aye > row.nay).slice(0, 3);
    const factionEndorsements = Object.values(props.snap.endorsements)
      .filter(
        (endorsement) =>
          endorsement.public &&
          endorsement.endorserType === "faction" &&
          endorsement.endorserId === selectedFaction.factionId,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 8);
    const prominentMembers = factionMembers
      .slice()
      .sort((a, b) => {
        const aOffice = Object.values(props.snap.officeTerms).some(
          (term) => term.holderId === a.id && term.status === "active",
        );
        const bOffice = Object.values(props.snap.officeTerms).some(
          (term) => term.holderId === b.id && term.status === "active",
        );
        return (
          Number(b.id === factionState?.chairId) - Number(a.id === factionState?.chairId) ||
          Number(bOffice) - Number(aOffice) ||
          politicianDisplayName(props.catalog, a.id).localeCompare(
            politicianDisplayName(props.catalog, b.id),
          )
        );
      })
      .slice(0, 8);
    const latestContest = leadershipContests[0] ?? null;
    return (
      <div className="caucus-page page-tone-caucus">
        <PageHeader
          kicker="Ideological caucus"
          title={selectedFaction.name}
          subtitle={`${partyDisplayName(props.world, selectedFaction.partyId, props.snap)} · organized tendency within the party, distinct from its Assembly delegation.`}
          actions={
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSelectedFactionId(null);
                props.setGlobalFocus({ kind: "Party", id: selectedFaction.partyId });
              }}
            >
              Back to party
            </button>
          }
        />
        <BriefStrip
          items={[
            { label: "Known members", value: factionMembers.length },
            { label: "Assembly members", value: factionMps.length },
            {
              label: "Share of party MPs",
              value: partyAssemblyMembers.length
                ? `${Math.round((factionMps.length / partyAssemblyMembers.length) * 100)}%`
                : "—",
            },
            { label: "Status", value: factionState?.status.replaceAll("_", " ") ?? "active" },
          ]}
        />
        <div className="caucus-identity-grid">
          <SectionCard title="Caucus leadership">
            {factionState?.chairId ? (
              <PoliticianCard
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={factionState.chairId}
                office="Caucus chair"
              />
            ) : (
              <EmptyState>The chair is vacant.</EmptyState>
            )}
            <p className="muted">
              The chair speaks for this ideological caucus. Party leadership and Assembly Delegation
              offices are separate institutions.
            </p>
            <dl className="fact-list">
              <div>
                <dt>Selection</dt>
                <dd>Ranked-choice vote of current caucus members</dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>
                  Living, active members of this caucus may stand; the player is never entered
                  automatically.
                </dd>
              </div>
              <div>
                <dt>Current term</dt>
                <dd>
                  {latestContest?.resolvedDate
                    ? `Mandate recorded ${latestContest.resolvedDate}`
                    : "No completed leadership election is archived."}
                </dd>
              </div>
              <div>
                <dt>Next contest</dt>
                <dd>
                  {latestContest?.status === "open"
                    ? `Open now · scheduled close ${String(latestContest.metadata.scheduledCloseDate ?? "not published")}`
                    : "Triggered by a vacancy or an institutional challenge; no fixed future date is promised."}
                </dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Place in the party">
            <p>
              {selectedFaction.name} accounts for {factionMps.length} of the party's{" "}
              {partyAssemblyMembers.length} sitting Assembly members.
            </p>
            <div
              className="composition-bar"
              aria-label={`${selectedFaction.name} share of the party Assembly delegation`}
            >
              <span
                className="composition-seg"
                style={{
                  width: `${partyAssemblyMembers.length ? (factionMps.length / partyAssemblyMembers.length) * 100 : 0}%`,
                  background: partyColor(props.world, selectedFaction.partyId),
                }}
              />
            </div>
            <p className="muted">
              This is public membership and office data, not hidden cohesion or voting intent.
            </p>
          </SectionCard>
        </div>
        <div className="caucus-identity-grid">
          <SectionCard title="Public priorities and influence">
            <p>
              <strong>{factionMps.length}</strong> Assembly members give the caucus{" "}
              {partyAssemblyMembers.length
                ? `${Math.round((factionMps.length / partyAssemblyMembers.length) * 100)}%`
                : "no measurable share"}{" "}
              of its party delegation.
            </p>
            {priorities.length === 0 ? (
              <EmptyState>
                No recent affirmative roll call establishes a public legislative priority.
              </EmptyState>
            ) : (
              priorities.map(({ vote }) => (
                <EntityRow
                  key={vote.id}
                  title={
                    props.snap.legislatureRuntime.bills[vote.billId]?.title ?? "Assembly measure"
                  }
                  meta={`Recent caucus majority support · ${vote.date}`}
                />
              ))
            )}
            <p className="muted">
              Influence is described from public membership and roll calls. Hidden ideological
              scores and future voting intent are not shown.
            </p>
          </SectionCard>
          <SectionCard title="Prominent members">
            <div className="politician-card-grid">
              {prominentMembers.map((politician) => (
                <PoliticianCard
                  key={politician.id}
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={politician.id}
                  compact
                  descriptor={
                    politician.id === factionState?.chairId
                      ? "Caucus chair"
                      : publicStandingLabel(props.world, props.snap, politician.id)
                  }
                />
              ))}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Recent caucus votes">
          {factionVotes.length === 0 ? (
            <EmptyState>No federal roll call includes a recorded member of this caucus.</EmptyState>
          ) : (
            <DataTable
              dense
              headers={["Date", "Measure", "Aye", "Nay", "Abstain", "Caucus position"]}
            >
              {factionVotes.map(({ vote, aye, nay, abstain }) => (
                <tr key={vote.id}>
                  <td>{vote.date}</td>
                  <td>
                    {props.snap.legislatureRuntime.bills[vote.billId]?.title ?? "Assembly measure"}
                  </td>
                  <td>{aye}</td>
                  <td>{nay}</td>
                  <td>{abstain}</td>
                  <td>{aye > nay ? "Supported" : nay > aye ? "Opposed" : "Divided"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
        <SectionCard title="Public endorsements">
          {factionEndorsements.length === 0 ? (
            <EmptyState>This caucus has no public contest endorsement on record.</EmptyState>
          ) : (
            factionEndorsements.map((endorsement) => (
              <EntityRow
                key={endorsement.id}
                title={`Backs ${politicianDisplayName(props.catalog, endorsement.targetId)}`}
                meta={`${contestDisplayName(props.snap, props.world, endorsement.contestId)} · ${endorsement.date}`}
                status={
                  <StatusBadge tone={endorsement.status === "active" ? "ok" : "idle"}>
                    {endorsement.status === "active"
                      ? "Current"
                      : endorsement.status.replaceAll("_", " ")}
                  </StatusBadge>
                }
              />
            ))
          )}
        </SectionCard>
        <SectionCard title="Caucus leadership elections">
          {leadershipContests.length === 0 ? (
            <EmptyState>No leadership election is recorded for this caucus.</EmptyState>
          ) : (
            leadershipContests.map((contest) => (
              <div className="contest-card" key={contest.id}>
                <strong>{contestDisplayName(props.snap, props.world, contest.id)}</strong>{" "}
                <StatusBadge tone={contest.status === "open" ? "warn" : "idle"}>
                  {contest.status.replaceAll("_", " ")}
                </StatusBadge>
                <div className="party-contest-field">
                  {Object.values(contest.entries)
                    .filter((entry) => entry.status !== "potential")
                    .map((entry) => (
                      <PoliticianCard
                        key={entry.politicianId}
                        catalog={props.catalog}
                        world={props.world}
                        state={props.snap}
                        politicianId={entry.politicianId}
                        compact
                        descriptor={
                          contest.winnerId === entry.politicianId
                            ? "Elected chair"
                            : entry.status.replaceAll("_", " ")
                        }
                      />
                    ))}
                </div>
                {contest.status === "open" &&
                selectedFaction.partyId === playerPartyId &&
                props.snap.politicians[props.snap.playerPoliticianId]?.factionId ===
                  selectedFaction.factionId &&
                !contest.entries[props.snap.playerPoliticianId] ? (
                  <button
                    className="btn"
                    onClick={() =>
                      run({
                        type: "DECLARE_PARTY_CONTEST_CANDIDACY",
                        contestId: contest.id,
                        politicianId: props.snap.playerPoliticianId,
                      })
                    }
                  >
                    Stand for caucus chair
                  </button>
                ) : null}
              </div>
            ))
          )}
        </SectionCard>
        <SectionCard title="Members">
          <div className="politician-card-grid">
            {factionMembers.slice(0, 36).map((politician) => (
              <PoliticianCard
                key={politician.id}
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={politician.id}
                compact
              />
            ))}
          </div>
          {factionMembers.length > 36 ? (
            <p className="muted">Showing 36 of {factionMembers.length} current members.</p>
          ) : null}
        </SectionCard>
      </div>
    );
  }
  const endorsementActorName = (type: string, id: string): string => {
    if (type === "politician") return politicianDisplayName(props.catalog, id);
    if (type === "faction") return props.world.factionDefinitions[id]?.name ?? "Party caucus";
    const provincial = props.world.provincialPartyOrganizations[id];
    if (provincial) {
      const province = props.catalog.places.get(provincial.provinceId)?.name ?? "Provincial";
      return `${province} party organization`;
    }
    return props.world.interestOrganizations[id]?.name ?? "Political organization";
  };

  return (
    <div>
      <PageHeader
        kicker="Parties and caucuses"
        title={party?.name ?? "No party"}
        subtitle="National party directory, internal elections, caucuses, and parliamentary leadership."
      />
      <div className="party-directory-strip" role="navigation" aria-label="All parties">
        {availablePartyIds.map((id) => {
          const seats = members.filter(
            (memberId) => props.snap.politicians[memberId]?.partyId === id,
          ).length;
          const leader = props.snap.partyStates[id]?.leaderId;
          return (
            <button
              key={id}
              type="button"
              className={`party-directory-item${id === partyId ? " selected" : ""}`}
              style={{ borderLeftColor: partyColor(props.world, id) }}
              onClick={() => {
                setSelectedPartyId(id);
                setSelectedFactionId(null);
                props.setGlobalFocus({ kind: "Party", id });
              }}
            >
              <strong>{partyDisplayName(props.world, id, props.snap)}</strong>
              <span>
                {partyLegalStatusLabel(partyLegalStatus(props.snap, id))} · {seats} seats ·{" "}
                {leader ? politicianDisplayName(props.catalog, leader) : "leadership vacant"}
              </span>
            </button>
          );
        })}
      </div>
      {party ? (
        <div className="party-banner" style={{ borderLeftColor: partyColor(props.world, partyId) }}>
          <StatusBadge tone="ok">
            {caucus} of {totalSeats} Assembly seats
          </StatusBadge>
          <StatusBadge>{position}</StatusBadge>
          <StatusBadge>
            {partyLegalStatusLabel(partyLegalStatus(props.snap, partyId))}
          </StatusBadge>
        </div>
      ) : null}
      {runtime?.leaderId ? (
        <PoliticianCard
          catalog={props.catalog}
          world={props.world}
          state={props.snap}
          politicianId={runtime.leaderId}
          office="Party leader"
        />
      ) : (
        <EmptyState>Leadership is vacant.</EmptyState>
      )}
      <SectionCard title="Public platform">
        {runtime?.publicPlatform ? (
          <>
            <p className="muted">
              Public issue positions move gradually with party identity, caucus influence, and
              leadership. Updated {runtime.publicPlatform.updatedDate}.
            </p>
            <div className="party-platform-grid">
              {PARTY_PLATFORM_ISSUES.map((issue) => (
                <div key={issue} className="party-platform-position">
                  <span>{PARTY_PLATFORM_LABELS[issue]}</span>
                  <strong>
                    {partyPlatformLabel(issue, runtime.publicPlatform!.positions[issue])}
                  </strong>
                </div>
              ))}
            </div>
            <details className="platform-history">
              <summary>
                Recent published platforms ({runtime.publicPlatform.history.length})
              </summary>
              {runtime.publicPlatform.history.length === 0 ? (
                <EmptyState>No prior platform publication is recorded in this save.</EmptyState>
              ) : (
                runtime.publicPlatform.history
                  .slice()
                  .reverse()
                  .slice(0, 6)
                  .map((entry) => {
                    const emphasis = PARTY_PLATFORM_ISSUES.slice()
                      .sort(
                        (a, b) =>
                          Math.abs(entry.positions[b]) - Math.abs(entry.positions[a]) ||
                          a.localeCompare(b),
                      )
                      .slice(0, 2)
                      .map(
                        (issue) =>
                          `${PARTY_PLATFORM_LABELS[issue]}: ${partyPlatformLabel(issue, entry.positions[issue])}`,
                      )
                      .join(" · ");
                    return (
                      <EntityRow
                        key={`${entry.date}:${entry.reason}`}
                        title={
                          entry.reason === "scenario_opening"
                            ? "Opening platform"
                            : entry.reason === "leadership_change"
                              ? "Leadership platform"
                              : "Annual party platform"
                        }
                        meta={`${entry.date}${entry.leaderId ? ` · Leader ${politicianDisplayName(props.catalog, entry.leaderId)}` : ""} · ${emphasis}`}
                      />
                    );
                  })
              )}
            </details>
          </>
        ) : (
          <EmptyState>This party has not yet published a public platform.</EmptyState>
        )}
      </SectionCard>
      <SectionCard title="Caucuses">
        <div className="faction-cards">
          {(party?.factionIds ?? []).map((fid) => {
            const chair = props.snap.factionStates[fid]?.chairId;
            const caucusMembers = Object.values(props.snap.politicians).filter(
              (politician) =>
                politician.factionId === fid && politician.alive && !politician.retired,
            );
            const caucusMps = members.filter(
              (memberId) => props.snap.politicians[memberId]?.factionId === fid,
            ).length;
            const share = caucus === 0 ? 0 : Math.round((caucusMps / caucus) * 100);
            return (
              <button
                key={fid}
                type="button"
                className="faction-card faction-card-link"
                onClick={() => {
                  setSelectedFactionId(fid);
                  props.setGlobalFocus({ kind: "Caucus", id: fid });
                }}
              >
                <strong>{factionDisplayName(props.world, fid)}</strong>
                <div className="muted">
                  Chair: {chair ? politicianDisplayName(props.catalog, chair) : "vacant"}
                </div>
                <div className="muted">
                  {caucusMps} MPs · {share}% of party caucus · {caucusMembers.length} known
                  politicians
                </div>
                <span className="link-cue">Open caucus →</span>
              </button>
            );
          })}
        </div>
      </SectionCard>
      <SectionCard title="Assembly Delegation">
        {caucusLeadership ? (
          <div className="faction-cards">
            {caucusLeadership.floorLeaderId ? (
              <PoliticianCard
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={caucusLeadership.floorLeaderId}
                office="Floor leader"
                compact
              />
            ) : (
              <div className="faction-card">
                <strong>Floor leader</strong>
                <div className="muted">Vacant</div>
              </div>
            )}
            {caucusLeadership.whipId ? (
              <PoliticianCard
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={caucusLeadership.whipId}
                office="Whip"
                compact
              />
            ) : (
              <div className="faction-card">
                <strong>Whip</strong>
                <div className="muted">Vacant</div>
              </div>
            )}
            <div className="faction-card">
              <strong>Next delegation election</strong>
              <div className="muted">{caucusLeadership.nextElectionDate}</div>
            </div>
          </div>
        ) : (
          <EmptyState>No sitting Assembly delegation.</EmptyState>
        )}
        {caucusContests
          .filter((contest) => contest.status === "open")
          .map((contest) => (
            <div key={contest.id} className="decision-row">
              <div>
                <strong>
                  {contest.role === "floor_leader" ? "Floor leader election" : "Whip election"}
                </strong>
                <div className="muted">
                  Assembly members voting · closes {contest.closeDate} ·{" "}
                  {contest.candidateIds.length} candidates · {contest.trigger.replaceAll("_", " ")}
                </div>
                {contest.playerDecision === "declared" &&
                !contest.platforms[props.snap.playerPoliticianId] ? (
                  <div className="button-row" aria-label="Choose caucus campaign emphasis">
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        run({
                          type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                          contestId: contest.id,
                          emphasis: "legislative_agenda",
                        })
                      }
                    >
                      Legislative agenda
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        run({
                          type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                          contestId: contest.id,
                          emphasis: "party_unity",
                        })
                      }
                    >
                      Party unity
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        run({
                          type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                          contestId: contest.id,
                          emphasis: "electoral_recovery",
                        })
                      }
                    >
                      Electoral recovery
                    </button>
                  </div>
                ) : null}
                {contest.platforms[props.snap.playerPoliticianId] ? (
                  <div className="muted">
                    Your campaign:{" "}
                    {contest.platforms[props.snap.playerPoliticianId]!.replaceAll("_", " ")} ·{" "}
                    {contest.endorsements[props.snap.playerPoliticianId]?.length ?? 0} delegation
                    endorsements
                  </div>
                ) : null}
              </div>
              {partyId === playerPartyId && contest.playerDecision == null ? (
                <button
                  className="btn"
                  onClick={() =>
                    run({ type: "DECLARE_CAUCUS_LEADERSHIP_CANDIDACY", contestId: contest.id })
                  }
                >
                  Stand for election
                </button>
              ) : (
                <StatusBadge>{contest.playerDecision ?? contest.status}</StatusBadge>
              )}
            </div>
          ))}
      </SectionCard>
      <SectionCard title="Nominations and leadership">
        {contests.length === 0 ? <EmptyState>No current party contests.</EmptyState> : null}
        {contests.map((c) => {
          const publicEndorsements = Object.values(props.snap.endorsements)
            .filter((endorsement) => endorsement.contestId === c.id && endorsement.public)
            .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
          const liveEndorsements = publicEndorsements.filter(
            (endorsement) => endorsement.status === "active",
          );
          const playerEndorsement = liveEndorsements.find(
            (endorsement) =>
              endorsement.endorserType === "politician" &&
              endorsement.endorserId === props.snap.playerPoliticianId,
          );
          const playerIsCandidate = isDeclaredContestCandidate(c, props.snap.playerPoliticianId);
          const canEndorse =
            partyId === playerPartyId &&
            !playerIsCandidate &&
            c.status !== "resolved" &&
            c.status !== "cancelled";
          return (
            <div key={c.id} className="contest-card">
              <strong>{contestDisplayName(props.snap, props.world, c.id)}</strong>{" "}
              <StatusBadge tone={c.status === "open" ? "warn" : "idle"}>
                {c.status.replaceAll("_", " ")}
              </StatusBadge>
              <div className="muted">
                {Object.values(c.entries).filter((entry) => entry.status !== "potential").length}{" "}
                candidates
              </div>
              <div className="party-contest-field">
                {Object.values(c.entries)
                  .filter((entry) => entry.status !== "potential")
                  .slice(0, 8)
                  .map((entry) => (
                    <PoliticianCard
                      key={entry.politicianId}
                      catalog={props.catalog}
                      world={props.world}
                      state={props.snap}
                      politicianId={entry.politicianId}
                      compact
                      action={
                        canEndorse &&
                        !playerEndorsement &&
                        (entry.status === "declared" || entry.status === "qualified") ? (
                          <button
                            type="button"
                            className="btn secondary btn-sm"
                            onClick={() =>
                              run({
                                type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
                                contestId: c.id,
                                endorserId: props.snap.playerPoliticianId,
                                targetId: entry.politicianId,
                              })
                            }
                          >
                            Endorse
                          </button>
                        ) : null
                      }
                    />
                  ))}
              </div>
              {c.winnerId ? (
                <div>Winner: {politicianDisplayName(props.catalog, c.winnerId)}</div>
              ) : null}
              {playerEndorsement ? (
                <div className="player-endorsement-control">
                  <span>
                    You endorsed{" "}
                    <strong>
                      {politicianDisplayName(props.catalog, playerEndorsement.targetId)}
                    </strong>{" "}
                    on {playerEndorsement.date}.
                  </span>
                  <button
                    type="button"
                    className="btn danger quiet"
                    onClick={() =>
                      run({ type: "WITHDRAW_ENDORSEMENT", endorsementId: playerEndorsement.id })
                    }
                  >
                    Withdraw endorsement
                  </button>
                </div>
              ) : null}
              {publicEndorsements.length ? (
                <details className="endorsement-network">
                  <summary>
                    Public endorsement record ({liveEndorsements.length} current ·{" "}
                    {publicEndorsements.length - liveEndorsements.length} closed)
                  </summary>
                  {publicEndorsements.slice(0, 20).map((endorsement) => {
                    const statusEvent = props.snap.history
                      .slice()
                      .reverse()
                      .find(
                        (event) =>
                          event.payload.endorsementId === endorsement.id &&
                          (event.type === "ENDORSEMENT_WITHDRAWN" ||
                            event.type === "ENDORSEMENT_ENDED" ||
                            event.type === "ENDORSEMENT_SWITCHED"),
                      );
                    return (
                      <EntityRow
                        key={endorsement.id}
                        title={endorsementActorName(
                          endorsement.endorserType,
                          endorsement.endorserId,
                        )}
                        meta={`Backs ${politicianDisplayName(props.catalog, endorsement.targetId)} · endorsed ${endorsement.date}${statusEvent ? ` · status changed ${statusEvent.date}` : ""}`}
                        status={
                          <StatusBadge tone={endorsement.status === "active" ? "ok" : "idle"}>
                            {endorsement.status === "active"
                              ? "Current"
                              : endorsement.status[0]!.toUpperCase() + endorsement.status.slice(1)}
                          </StatusBadge>
                        }
                      />
                    );
                  })}
                </details>
              ) : null}
              {c.status === "open" &&
              partyId === playerPartyId &&
              !c.entries[props.snap.playerPoliticianId] ? (
                <button
                  className="btn"
                  onClick={() =>
                    run({
                      type: "DECLARE_PARTY_CONTEST_CANDIDACY",
                      contestId: c.id,
                      politicianId: props.snap.playerPoliticianId,
                    })
                  }
                >
                  Enter contest
                </button>
              ) : null}
            </div>
          );
        })}
      </SectionCard>
      {elections.length > 0 ? (
        <SectionCard title="Recent electoral performance">
          {elections.map((e) => (
            <div key={e.id}>
              {electionDisplayName(e.id)} ·{" "}
              {e.type === "assembly"
                ? Object.entries(e.assembly?.partySeatTotals ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(
                      ([id, seats]) =>
                        `${partyDisplayName(props.world, id === "independent" ? null : id, props.snap)} ${seats}`,
                    )
                    .join(" · ") || `${e.winnerIds.length} members elected`
                : e.winnerIds[0]
                  ? politicianDisplayName(props.catalog, e.winnerIds[0])
                  : e.status}
            </div>
          ))}
        </SectionCard>
      ) : null}
      <SectionCard title="Recent party events">
        {recent.length === 0 ? <EmptyState>No recent public party events.</EmptyState> : null}
        {recent.map((e) => (
          <ActivityFeedItem
            key={e.id}
            date={e.date}
            text={eventDisplay(props.catalog, props.world, props.snap, e)}
          />
        ))}
      </SectionCard>
    </div>
  );
}

function Terena(props: PageProps) {
  const [mode, setMode] = useState<MapMode>("political");
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [hoverSel, setHoverSel] = useState<MapSelection | null>(null);
  const [mapElectionId, setMapElectionId] = useState("");
  const [campaignMapScale, setCampaignMapScale] = useState<"province" | "constituency">("province");
  useEffect(() => {
    const focus = props.globalFocus;
    if (!focus || (focus.kind !== "Province" && focus.kind !== "Constituency")) return;
    const kind = focus.kind === "Province" ? "province" : "constituency";
    const place = props.catalog.places.get(focus.id);
    if (!place) return;
    setMode("political");
    setSel({ id: focus.id, kind, name: place.name });
    setHoverSel(null);
  }, [props.globalFocus, props.catalog]);
  const place = sel ? props.catalog.places.get(sel.id) : null;
  const electionChoices = [
    ...Object.values(props.snap.elections).map((election) => ({
      id: election.id,
      date: election.date,
      type: election.type,
      status: election.status,
      provinceId: null as string | null,
    })),
    ...Object.values(props.snap.provincialRuntime.elections).map((election) => ({
      id: election.id,
      date: election.date,
      type: "gubernatorial",
      status: election.status,
      provinceId: election.provinceId as string | null,
    })),
    ...Object.values(props.snap.provincialRuntime.assemblyElections).map((election) => ({
      id: election.id,
      date: election.date,
      type: "provincial_assembly",
      status: election.status,
      provinceId: election.provinceId as string | null,
    })),
  ].sort((a, b) => {
    const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
    const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
    return (
      ba - aa ||
      (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
      a.id.localeCompare(b.id)
    );
  });
  const activeMapElection =
    electionChoices.find((election) => election.id === mapElectionId) ?? electionChoices[0] ?? null;
  const org =
    mode === "campaign" && props.campaign && sel?.kind === "constituency"
      ? props.campaign.organizationByConstituency[sel.id]
      : mode === "campaign" && props.campaign && sel?.kind === "province"
        ? props.campaign.organizationByProvince[sel.id]
        : undefined;
  const sitting = useMemo(() => {
    if (!sel || sel.kind !== "constituency") return 0;
    return currentAssemblyMemberIds(props.world, props.snap).filter((id) => {
      const term = Object.values(props.snap.officeTerms).find((t) => {
        if (t.holderId !== id) return false;
        if (t.status !== "active" && t.status !== "suspended") return false;
        return props.world.offices[t.officeId]?.constituencyId === sel.id;
      });
      return !!term;
    }).length;
  }, [sel, props.snap, props.world]);
  const regionEcon =
    sel?.kind === "province" ? props.snap.economyRuntime.provinces[sel.id] : undefined;
  const regionPublicEcon =
    sel?.kind === "province" ? regionalPublicEconomy(props.snap, sel.id) : null;
  const tooltip = (selection: MapSelection) => {
    if (mode === "economy" && selection.kind === "province") {
      const data = regionalPublicEconomy(props.snap, selection.id);
      return (
        <>
          <strong>{selection.name}</strong>
          <span> · {data ? data.summary : "No regional series"}</span>
        </>
      );
    }
    if (mode === "campaign") {
      const value =
        selection.kind === "province"
          ? props.campaign?.organizationByProvince[selection.id]
          : selection.kind === "constituency"
            ? props.campaign?.organizationByConstituency[selection.id]
            : null;
      return (
        <>
          <strong>{selection.name}</strong>
          <span>
            {" "}
            ·{" "}
            {value == null
              ? "No active field operation"
              : `Ground Game ${groundGameStrength(value)}/100`}
          </span>
        </>
      );
    }
    if (mode === "political" && selection.kind === "constituency") {
      const rows = constituencySittingSeatBreakdown(props.world, props.snap, selection.id);
      return (
        <>
          <strong>{selection.name}</strong>
          <span>
            {" "}
            ·{" "}
            {rows
              .map(
                (row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`,
              )
              .join(" · ") || "No sitting members"}
          </span>
        </>
      );
    }
    if (mode === "election") {
      const national = activeMapElection ? props.snap.elections[activeMapElection.id] : null;
      const regional = activeMapElection
        ? props.snap.provincialRuntime.elections[activeMapElection.id]
        : null;
      const provincialAssembly = activeMapElection
        ? props.snap.provincialRuntime.assemblyElections[activeMapElection.id]
        : null;
      if (
        selection.kind === "constituency" &&
        national?.assembly?.constituencyResults[selection.id]
      ) {
        const result = national.assembly.constituencyResults[selection.id]!;
        return (
          <>
            <strong>{selection.name}</strong>
            <span>
              {" "}
              · {result.electedIds.length} elected · turnout{" "}
              {(result.turnout.turnoutRate * 100).toFixed(0)}%
            </span>
          </>
        );
      }
      if (selection.kind === "province" && regional) {
        const race = Object.values(props.snap.provincialRuntime.elections).find(
          (candidate) =>
            candidate.provinceId === selection.id &&
            candidate.date.slice(0, 4) === regional.date.slice(0, 4),
        );
        if (race)
          return (
            <>
              <strong>{selection.name}</strong>
              <span>
                {" "}
                ·{" "}
                {race.winnerId
                  ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}`
                  : `${race.status.replace(/_/g, " ")} · ${Object.keys(race.candidates).length} candidates`}
              </span>
            </>
          );
      }
      if (selection.kind === "province" && provincialAssembly) {
        const race = Object.values(props.snap.provincialRuntime.assemblyElections).find(
          (candidate) =>
            candidate.provinceId === selection.id &&
            candidate.date.slice(0, 4) === provincialAssembly.date.slice(0, 4),
        );
        if (race) {
          const leading = Object.entries(race.partySeats).sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
          );
          const tie = leading.length > 1 && leading[0]![1] === leading[1]![1];
          return (
            <>
              <strong>{selection.name}</strong>
              <span>
                {" "}
                ·{" "}
                {race.status === "resolved"
                  ? `${tie ? "No single party plurality" : `${partyDisplayName(props.world, leading[0]?.[0] ?? null, props.snap)} leads`} · turnout ${race.turnoutRate == null ? "not recorded" : `${(race.turnoutRate * 100).toFixed(0)}%`}`
                  : race.status.replace(/_/g, " ")}
              </span>
            </>
          );
        }
      }
      return (
        <>
          <strong>{selection.name}</strong>
          <span> · No published geographic result for this election.</span>
        </>
      );
    }
    return <strong>{selection.name}</strong>;
  };
  const switchMapMode = (nextMode: MapMode) => {
    setMode(nextMode);
    setHoverSel(null);
    setSel((current) => {
      if (!current || nextMode === "political") return current;
      if (nextMode === "economy") return current.kind === "province" ? current : null;
      if (nextMode === "campaign") {
        return current.kind === campaignMapScale ? current : null;
      }
      if (nextMode === "election") {
        if (activeMapElection?.type === "assembly")
          return current.kind === "constituency" ? current : null;
        if (
          activeMapElection?.type === "gubernatorial" ||
          activeMapElection?.type === "provincial_assembly"
        )
          return current.kind === "province" ? current : null;
        return null;
      }
      return current;
    });
  };
  return (
    <div>
      <PageHeader
        kicker="Geography"
        title="Terena"
        subtitle="Interactive map derived from canonical GeoJSON. Supplied SVG files remain authoring references."
      />
      <TabBar
        tabs={[
          { id: "political", label: "Political" },
          { id: "election", label: "Election" },
          { id: "campaign", label: "Campaign" },
          { id: "economy", label: "Economy" },
        ]}
        value={mode}
        onChange={switchMapMode}
      />
      {mode === "election" && electionChoices.length ? (
        <label className="map-election-picker">
          Election
          <select
            value={activeMapElection?.id ?? ""}
            onChange={(event) => {
              const id = event.target.value;
              const next = electionChoices.find((election) => election.id === id);
              setMapElectionId(id);
              setSel((current) => {
                if (!current || !next) return null;
                if (next.type === "assembly")
                  return current.kind === "constituency" ? current : null;
                if (next.type === "gubernatorial" || next.type === "provincial_assembly")
                  return current.kind === "province" ? current : null;
                return null;
              });
            }}
          >
            {electionChoices.map((election) => (
              <option key={election.id} value={election.id}>
                {election.provinceId
                  ? `${props.catalog.places.get(election.provinceId)?.name ?? election.provinceId} · `
                  : ""}
                {election.date.slice(0, 4)} · {election.type.replace(/_/g, " ")} ·{" "}
                {election.status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mode === "campaign" ? (
        <div className="map-scale-switch" aria-label="Campaign map scale">
          <button
            type="button"
            className={campaignMapScale === "province" ? "active" : ""}
            onClick={() => {
              setCampaignMapScale("province");
              setSel(null);
            }}
          >
            Provinces
          </button>
          <button
            type="button"
            className={campaignMapScale === "constituency" ? "active" : ""}
            onClick={() => {
              setCampaignMapScale("constituency");
              setSel(null);
            }}
          >
            Constituencies
          </button>
        </div>
      ) : null}
      <MapDetailLayout
        className="terena-map-workspace"
        detailVisible={sel != null}
        map={
          <>
            <TerenaMap
              bundle={props.bundle}
              mode={mode}
              selectedId={sel?.id ?? null}
              showConstituencies={
                mode !== "economy" &&
                !(mode === "election" && activeMapElection?.type !== "assembly") &&
                !(mode === "campaign" && campaignMapScale === "province")
              }
              fillFor={(f, kind) =>
                mapFillFor(
                  mode,
                  props.world,
                  props.snap,
                  f,
                  kind,
                  props.campaign?.organizationByConstituency,
                  props.campaign?.organizationByProvince,
                  activeMapElection?.id,
                )
              }
              onSelect={setSel}
              onHover={(selection) => {
                setHoverSel(selection);
                props.setMapHover(selection?.id ?? null);
              }}
              tooltipFor={tooltip}
            />
            {mode === "election" && activeMapElection?.type === "presidential" ? (
              <div className="map-legend">
                <div className="kicker">Legend</div>
                <div className="legend-items">
                  <span className="legend-item">
                    <span className="swatch" style={{ background: "#d8d6cf" }} />
                    No public geographic data
                  </span>
                </div>
              </div>
            ) : (
              <MapLegend mode={mode} world={props.world} />
            )}
          </>
        }
        detail={
          <div className="compact-map-inspector">
            <SectionDivider title="Selection" hint={mode[0]!.toUpperCase() + mode.slice(1)} />
            {sel ? (
              <>
                <strong>{place?.name ?? sel.name}</strong>
                <div className="muted">
                  {sel.kind === "constituency"
                    ? `${place?.seats ?? "?"} seats · ${sitting} sitting${place?.provinceName ? ` · ${place.provinceName}` : ""}`
                    : sel.kind === "province"
                      ? "Province"
                      : "City · public geographic label"}
                </div>
                {org != null ? <div>Your Ground Game: {groundGameStrength(org)}/100</div> : null}
                {mode === "political" && sel.kind === "constituency"
                  ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (
                      <div key={row.partyId ?? "none"} className="muted">
                        {partyDisplayName(props.world, row.partyId, props.snap)} · {row.seats}{" "}
                        sitting seat{row.seats === 1 ? "" : "s"}
                      </div>
                    ))
                  : null}
                {mode === "economy" && regionEcon ? <div>{regionPublicEcon?.summary}</div> : null}
                {mode === "election" ? (
                  <div className="map-selection-mode">{tooltip(sel)}</div>
                ) : null}
              </>
            ) : (
              <EmptyState>
                {mode === "election" && activeMapElection?.type === "presidential"
                  ? "This national presidential race has no public geographic result. Select another election for a geographic view."
                  : "Select a constituency, province, or city."}
              </EmptyState>
            )}
          </div>
        }
      />
      {hoverSel && !sel ? (
        <p className="muted map-hover-note">
          Hovering {hoverSel.name}; click or tap to keep its details open.
        </p>
      ) : null}
    </div>
  );
}

const ARCHIVE_PAGE_SIZE = 25;

type ArchiveTab =
  "elections" | "administrations" | "legislation" | "courts" | "foreign" | "economy";

function ArchivePager(props: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (props.pageCount <= 1) return null;
  return (
    <div className="pager">
      <button
        type="button"
        className="btn secondary"
        disabled={props.page <= 0}
        onClick={() => props.onChange(props.page - 1)}
      >
        Previous
      </button>
      <span className="muted">
        Page {props.page + 1} of {props.pageCount} · {props.total} records
      </span>
      <button
        type="button"
        className="btn secondary"
        disabled={props.page >= props.pageCount - 1}
        onClick={() => props.onChange(props.page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function _Archive(props: PageProps) {
  const [tab, setTab] = useState<ArchiveTab>("elections");
  const [page, setPage] = useState(0);

  const laws = useMemo(
    () =>
      Object.values(props.snap.legislatureRuntime.enactedLaws).sort((a, b) =>
        (b.enactedDate ?? "") < (a.enactedDate ?? "") ? -1 : 1,
      ),
    [props.snap.legislatureRuntime.enactedLaws],
  );
  const elections = useMemo(() => {
    const national = Object.values(props.snap.elections)
      .filter((e) => e.status === "resolved")
      .map((e) => ({
        id: e.id,
        date: e.date,
        label: electionDisplayName(e.id),
        detail:
          e.type === "assembly"
            ? `${e.winnerIds.length} members elected`
            : `won by ${e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`,
      }));
    const gubernatorial = Object.values(props.snap.provincialRuntime.elections)
      .filter((e) => e.status === "resolved" || e.status === "assumed")
      .map((e) => ({
        id: e.id,
        date: e.date,
        label: `${props.catalog.places.get(e.provinceId)?.name ?? e.provinceId} gubernatorial`,
        detail: e.winnerId
          ? `won by ${politicianDisplayName(props.catalog, e.winnerId)}`
          : "result unavailable",
      }));
    return [...national, ...gubernatorial].sort((a, b) => (b.date < a.date ? -1 : 1));
  }, [props.catalog, props.snap.elections, props.snap.provincialRuntime.elections]);

  const administrations = useMemo(() => {
    const canonical =
      props.bundle.content.terena_presidential_administrations?.administrations?.map((a) => ({
        id: a.id,
        date: a.term_start,
        title: a.president_name,
        meta: `${partyDisplayName(props.world, a.party_id, props.snap)} · ${a.term_start} – ${a.term_end}${a.status ? ` · ${a.status}` : ""}`,
      })) ?? [];
    const assumptions = props.snap.history
      .filter(
        (e) =>
          e.type === "PRESIDENTIAL_ASSUMPTION" ||
          e.type === "ACTING_PRESIDENT_ASSUMED" ||
          e.type === "OFFICE_TERM_ENDED",
      )
      .filter((e) => {
        if (e.type !== "OFFICE_TERM_ENDED") return true;
        const officeId = (e.payload as { officeId?: string } | undefined)?.officeId;
        return officeId === "OFFICE_PRESIDENT" || officeId == null;
      })
      .map((e) => ({
        id: e.id,
        date: e.date,
        title: eventDisplay(props.catalog, props.world, props.snap, e),
        meta: e.date,
      }));
    const leadership = Object.values(props.snap.partyContests)
      .filter((c) => c.winnerId)
      .map((c) => ({
        id: c.id,
        date: c.resolvedDate ?? c.openedDate ?? c.createdDate ?? "",
        title: contestDisplayName(props.snap, props.world, c.id),
        meta: politicianDisplayName(props.catalog, c.winnerId!),
      }));
    return [...canonical, ...assumptions, ...leadership].sort((a, b) =>
      (b.date ?? "") < (a.date ?? "") ? -1 : 1,
    );
  }, [props.bundle, props.catalog, props.snap, props.world]);

  const courtRows = useMemo(() => {
    const decisions = Object.values(props.snap.constitutionalRuntime.courtDecisions)
      .slice()
      .sort((a, b) => (b.decisionDate < a.decisionDate ? -1 : 1))
      .map((d) => {
        const courtCase = props.snap.constitutionalRuntime.courtCases[d.caseId];
        return {
          id: d.id,
          date: d.decisionDate,
          title: courtCase ? caseTitle(courtCase) : d.caseId,
          meta: `${d.disposition} · uphold ${d.uphold} · invalidate ${d.invalidate}`,
        };
      });
    const history = props.snap.history
      .filter((e) => e.type === "COURT_DECISION" || e.type === "COURT_VACANCY")
      .map((e) => ({
        id: e.id,
        date: e.date,
        title: eventDisplay(props.catalog, props.world, props.snap, e),
        meta: e.date,
      }));
    const seen = new Set(decisions.map((d) => d.id));
    return [...decisions, ...history.filter((h) => !seen.has(h.id))].sort((a, b) =>
      b.date < a.date ? -1 : 1,
    );
  }, [props.catalog, props.snap, props.world]);

  const foreign = props.snap.foreignAffairsRuntime;
  const foreignRows = useMemo(() => {
    const treaties = Object.values(foreign.treaties).map((t) => ({
      id: t.id,
      date: t.signedDate ?? "",
      title: t.title,
      meta: `${treatyTypeLabel(t.kind)} · ${treatyStatusLabel(t)}${t.signedDate ? ` · ${t.signedDate}` : ""}`,
    }));
    const crises = Object.values(foreign.crises).map((c) => ({
      id: c.id,
      date: c.startedDate,
      title: c.participantIds.map((id) => countryDisplayName(props.world, id)).join(" · "),
      meta: `${crisisStageLabel(c.stage)} · since ${c.startedDate}`,
    }));
    const conflicts = Object.values(foreign.conflicts).map((c) => ({
      id: c.id,
      date: c.startedDate ?? c.endedDate ?? "",
      title: c.belligerentIds.map((id) => countryDisplayName(props.world, id)).join(" vs "),
      meta: `${publicSeverityLabel(c.intensity, "conflict")}${c.endedDate ? ` · ended ${c.endedDate}` : " · ongoing"}`,
    }));
    const sanctions = Object.values(foreign.sanctions).map((s) => ({
      id: s.id,
      date: s.imposedDate,
      title: `${countryDisplayName(props.world, s.imposerId)} → ${countryDisplayName(props.world, s.targetId)}`,
      meta: `${s.active ? "active" : "lifted"} · ${s.imposedDate}`,
    }));
    const diplomatic = props.snap.history
      .filter((e) => {
        if (e.type === "TURN_COMPLETED") return false;
        return /DIPLOMATIC|SANCTION|TREATY|FOREIGN|CRISIS|TRADE|POSTURE|CONFLICT|ALLIANCE/i.test(
          e.type,
        );
      })
      .map((e) => ({
        id: e.id,
        date: e.date,
        title: eventDisplay(props.catalog, props.world, props.snap, e),
        meta: e.date,
      }));
    return [...treaties, ...crises, ...conflicts, ...sanctions, ...diplomatic].sort((a, b) =>
      (b.date ?? "") < (a.date ?? "") ? -1 : 1,
    );
  }, [foreign, props.catalog, props.snap.history, props.world]);

  const economyRows = useMemo(() => {
    const shocks = props.snap.economyRuntime.shocks.map((s) => ({
      id: s.id,
      date: s.date,
      title: s.kind.replace(/_/g, " "),
      meta: `${s.date} · ${s.remainingMonths} months remain`,
    }));
    const history = props.snap.history
      .filter(
        (e) =>
          e.type === "ECONOMY_MONTH" ||
          e.type === "ECONOMY_SHOCK" ||
          /ECONOMY|FISCAL|BUDGET/i.test(e.type),
      )
      .filter((e) => e.type !== "TURN_COMPLETED")
      .map((e) => ({
        id: e.id,
        date: e.date,
        title: eventDisplay(props.catalog, props.world, props.snap, e),
        meta: e.date,
      }));
    // Cap economy event noise: prefer named shocks, then recent public history
    return [...shocks, ...history].sort((a, b) => (b.date < a.date ? -1 : 1)).slice(0, 200);
  }, [props.catalog, props.snap, props.world]);

  const rowsForTab: Array<{ id: string; date: string; title: string; meta: string }> =
    tab === "elections"
      ? elections.map((e) => ({ id: e.id, date: e.date, title: e.label, meta: e.detail }))
      : tab === "administrations"
        ? administrations
        : tab === "legislation"
          ? laws.map((l) => ({
              id: l.id,
              date: l.enactedDate ?? "",
              title: l.title,
              meta: l.enactedDate ?? "",
            }))
          : tab === "courts"
            ? courtRows
            : tab === "foreign"
              ? foreignRows
              : economyRows;

  const pageCount = Math.max(1, Math.ceil(rowsForTab.length / ARCHIVE_PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = rowsForTab.slice(
    pageIndex * ARCHIVE_PAGE_SIZE,
    pageIndex * ARCHIVE_PAGE_SIZE + ARCHIVE_PAGE_SIZE,
  );

  return (
    <WorkLayout
      header={
        <PageHeader
          kicker="History"
          title="Archive"
          subtitle="Sectioned public records — not an unbounded fifty-year feed."
        />
      }
      main={
        <>
          <TabBar
            tabs={[
              { id: "elections", label: "Elections" },
              { id: "administrations", label: "Administrations" },
              { id: "legislation", label: "Legislation" },
              { id: "courts", label: "Courts" },
              { id: "foreign", label: "Foreign" },
              { id: "economy", label: "Economy" },
            ]}
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(0);
            }}
          />

          <SectionDivider
            title={
              tab === "elections"
                ? "Elections"
                : tab === "administrations"
                  ? "Administrations"
                  : tab === "legislation"
                    ? "Legislation"
                    : tab === "courts"
                      ? "Courts"
                      : tab === "foreign"
                        ? "Foreign"
                        : "Economy"
            }
            hint={
              rowsForTab.length === 0
                ? "No records in this section yet."
                : `${rowsForTab.length} record${rowsForTab.length === 1 ? "" : "s"}`
            }
          />

          {pageRows.length === 0 ? <EmptyState>No records in this section yet.</EmptyState> : null}

          {tab === "legislation" || tab === "elections" ? (
            <DataTable dense headers={["Date", "Record", "Detail"]}>
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date || "—"}</td>
                  <td>{row.title}</td>
                  <td>{row.meta}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            pageRows.map((row) => (
              <EntityRow
                key={row.id}
                title={row.title}
                meta={row.meta}
                status={row.date || undefined}
              />
            ))
          )}

          <ArchivePager
            page={pageIndex}
            pageCount={pageCount}
            total={rowsForTab.length}
            onChange={setPage}
          />

          {import.meta.env.DEV ? (
            <details className="dev-panel">
              <summary>Development tools</summary>
              <label>
                <input
                  type="checkbox"
                  checked={props.debug}
                  onChange={(e) => props.setDebug(e.target.checked)}
                />{" "}
                Show hidden developer numbers
              </label>
              {props.debug ? (
                <pre>
                  {JSON.stringify(
                    {
                      standing: props.snap.candidateStanding[props.snap.playerPoliticianId],
                      player: props.snap.politicians[props.snap.playerPoliticianId],
                      mp: isMp(props.world, props.snap, props.snap.playerPoliticianId),
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
            </details>
          ) : null}
        </>
      }
    />
  );
}
