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
  storiesChronological,
  TERENA_WORLD_ID,
  type CommandResult,
  type KernelWorld,
  type SimEvent,
  type SimState,
  type Simulation,
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
import { OfficePage } from "./officeScreen.js";
import { groundGameStrength, isMp, isPresident, playerCampaign, publicStandingLabel } from "./format.js";
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
  politicianDisplayName,
  pollShareLine,
  publicSeverityLabel,
  mediaHeadlineForEvent,
  treatyStatusLabel,
  treatyTypeLabel,
  type PresentationCatalog,
} from "./presentation.js";
import {
  decisionDisplayLabel,
  formatIndexDelta,
  interruptDisplay,
} from "./presentation/display.js";
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
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
  globalFocus: { kind: string; id: string } | null;
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
  return <Archive {...props} />;
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
    (c) =>
      isPublicCrisisStage(c.stage) && c.participantIds.includes(TERENA_WORLD_ID),
  );
  const terenaLatentTension = latentStrategicTensions(props.snap).find((c) =>
    c.participantIds.includes(TERENA_WORLD_ID),
  );
  const playerIsPresident = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
  const warTrigger = props.snap.executiveRuntime.warTrigger;
  const feed = monthEvents.slice(-8).reverse();
  const stories = storiesChronological(props.snap).slice(0, 4);
  const polls = Object.values(props.snap.polls).slice(-2);
  const n = props.snap.economyRuntime.national;
  const upcoming = Object.values(props.snap.elections).filter((e) => e.status !== "resolved");
  const figure = props.figures.get(playerId);
  const runtime = props.snap.politicians[playerId];
  const standingLabel = publicStandingLabel(props.world, props.snap, playerId);
  const prevConfidence =
    props.snap.economyRuntime.history.slice(-2)[0]?.confidenceIndex ?? n.confidenceIndex;
  const confDelta = n.confidenceIndex - prevConfidence;
  const governedProvince = governedProvinceId(props.world, props.snap, playerId);
  const governorState = governedProvince ? props.snap.provincialRuntime.provinces[governedProvince] : null;
  const governorEconomy = governedProvince ? props.snap.economyRuntime.provinces[governedProvince] : null;
  const playerIsMp = isMp(props.world, props.snap, playerId);
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
        : props.campaign
          ? "Campaign briefing"
          : "Career briefing";

  const briefItems = playerIsPresident
    ? [
        { label: "Bills awaiting", value: billsAwaiting },
        { label: "Public crises", value: publicCrises },
        { label: "Your decisions", value: decisions.length },
        { label: "Confidence", value: `${n.confidenceIndex.toFixed(1)} (${formatIndexDelta(confDelta)})` },
      ]
    : governedProvince && governorState && governorEconomy
      ? [
          { label: "Conditions", value: governorEconomy.conditionsIndex.toFixed(1) },
          { label: "Actions left", value: governorState.actionPointsRemaining },
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
        : props.campaign
          ? [
              { label: "Actions", value: props.campaign.actionPointsRemaining },
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
    <div className="home-v5">
      <WorkLayout
        header={
          <>
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
            <SectionDivider title={briefTitle} hint="What matters this month" />
            <BriefStrip items={briefItems} />
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
                  {publicSeverityLabel(terenaPublicCrisis.intensity, terenaPublicCrisis.stage)}). See
                  Foreign Affairs.
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
                <p>Open Executive or Foreign Affairs to invoke war powers or seek Assembly authorization.</p>
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
          </>
        }
      />
    </div>
  );
}

function Career(props: PageProps) {
  const [tab, setTab] = useState<"opportunities" | "overview" | "career" | "positions" | "record" | "directory">(
    "opportunities",
  );
  const [raceGeography, setRaceGeography] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directorySelection, setDirectorySelection] = useState(props.snap.playerPoliticianId);
  const [directoryVoteFilter, setDirectoryVoteFilter] = useState<"all" | "yes" | "no" | "abstain">("all");
  const [directoryParty, setDirectoryParty] = useState("all");
  const [directoryCaucus, setDirectoryCaucus] = useState("all");
  const [directoryProvince, setDirectoryProvince] = useState("all");
  const [directoryOffice, setDirectoryOffice] = useState("all");
  useEffect(() => {
    if (props.globalFocus?.kind !== "Politician") return;
    setDirectorySelection(props.globalFocus.id);
    setTab("directory");
  }, [props.globalFocus]);
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
    .filter((id) => assemblyCandidateEligibilityError(props.snap, props.world, playerId, id) == null)
    .sort((a, b) => {
      const ah = props.world.constituencyProvinceShares[a]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId]) ? 1 : 0;
      const bh = props.world.constituencyProvinceShares[b]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId]) ? 1 : 0;
      return bh - ah || (props.world.constituencyElectorate[b]?.seats ?? 0) - (props.world.constituencyElectorate[a]?.seats ?? 0) || a.localeCompare(b);
    });
  const chosenConstituency = raceGeography || eligibleConstituencies[0] || "";
  const gubernatorial = currentGubernatorialOpportunity(props.snap, props.world, playerId);
  const playerHome = runtime?.homeProvinceId ?? props.world.politicianHomeProvince[playerId] ?? null;
  const provincialAssemblyOpportunities = Object.values(props.snap.provincialRuntime.assemblyElections)
    .filter((election) =>
      election.playerDecision == null &&
      election.status !== "resolved" &&
      election.provinceId === playerHome,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const presidential = Object.values(props.snap.elections)
    .filter((election) => election.type === "presidential" && election.status !== "resolved" && election.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const presidentialEligibility = presidential
    ? evaluatePresidentialEligibility(props.world, props.snap, playerId, presidential.date)
    : null;
  const nomination = presidential
    ? Object.values(props.snap.partyContests).find((contest) =>
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
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "opportunities" ? (
        <div className="opportunities-layout">
          <div className="opportunities-intro">
            <div><span className="eyebrow">Run for office</span><h2>Political opportunities</h2></div>
            <p>Only races for which {politicianDisplayName(props.catalog, playerId)} is presently eligible are actionable. Public facts are shown; hidden support is not.</p>
          </div>
          {presidential ? (
            <section className="opportunity-row">
              <div className="opportunity-office"><span>National</span><h3>President</h3><strong>{presidential.date}</strong></div>
              <div className="opportunity-details">
                <p>{presidentialEligibility?.eligible ? "Constitutionally eligible" : presidentialEligibility?.reasons.join(" · ") || "Not presently eligible"}</p>
                <p className="muted">Nomination: {nomination?.status ?? "not open"} · national constituency · term incompatibilities apply on assumption.</p>
              </div>
              <div className="opportunity-action">
                {presidentialEligibility?.eligible && nomination && ["open", "qualification"].includes(nomination.status) && !nomination.entries[playerId] ? (
                  <button className="btn" onClick={() => run({ type: "DECLARE_CAMPAIGN", politicianId: playerId, campaignType: "presidential_nomination", contestId: nomination.id })}>Enter nomination</button>
                ) : nomination?.entries[playerId] ? <StatusBadge tone="ok">Entered</StatusBadge> : <StatusBadge>Not yet open</StatusBadge>}
              </div>
            </section>
          ) : null}
          {assemblyElection ? (
            <section className="opportunity-row opportunity-geographic">
              <div className="opportunity-office"><span>Constituency</span><h3>National Assembly</h3><strong>{assemblyElection.date}</strong></div>
              <div className="opportunity-details">
                <p>{eligibleConstituencies.length ? `${eligibleConstituencies.length} eligible constituencies` : "No eligible constituency"} · filing {assemblyCycle?.filingOpenDate}–{assemblyCycle?.filingDeadlineDate}</p>
                {assemblyCycle?.filingStatus === "open" && !assemblyDecision ? (
                  <div className="geography-choice-grid" role="listbox" aria-label="Choose an Assembly constituency">
                    {eligibleConstituencies.map((id) => {
                      const info = props.catalog.places.get(id);
                      const parties = constituencySittingSeatBreakdown(props.world, props.snap, id);
                      const selected = id === chosenConstituency;
                      return <button key={id} type="button" className={`geography-choice${selected ? " selected" : ""}`} onClick={() => setRaceGeography(id)}>
                        <strong>{info?.name ?? "Unknown constituency"}</strong>
                        <span>{info?.provinceName ?? "Terena"} · {props.world.constituencyElectorate[id]?.seats ?? "?"} seats</span>
                        <span>{parties.slice(0, 2).map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`).join(" · ") || "Open representation"}</span>
                      </button>;
                    })}
                  </div>
                ) : <p className="muted">Filing status: {assemblyDecision?.decision ?? assemblyCycle?.filingStatus ?? "planned"}</p>}
              </div>
              <div className="opportunity-action">
                {assemblyCycle?.filingStatus === "open" && !assemblyDecision && chosenConstituency ? <>
                  <button className="btn" onClick={() => run({ type: "FILE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id, constituencyId: chosenConstituency })}>File candidacy</button>
                  <button className="btn secondary" onClick={() => run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id })}>Decline this cycle</button>
                </> : assemblyDecision?.decision === "filed" ? <StatusBadge tone="ok">Filed</StatusBadge> : assemblyDecision?.decision === "declined" ? <StatusBadge>Declined</StatusBadge> : <StatusBadge>Filing not open</StatusBadge>}
              </div>
            </section>
          ) : null}
          {gubernatorial.map((race) => {
            const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
            return <section className="opportunity-row" key={race.id}>
              <div className="opportunity-office"><span>Province</span><h3>Governor of {provinceName}</h3><strong>{race.date}</strong></div>
              <div className="opportunity-details"><p>Resident and presently eligible · incumbent {race.incumbentId ? politicianDisplayName(props.catalog, race.incumbentId) : "none"}</p><p className="muted">Filing {race.filingOpenDate}–{race.filingDeadlineDate} · province-wide plurality election.</p></div>
              <div className="opportunity-action">{race.status === "filing_open" ? <><button className="btn" onClick={() => run({ type: "FILE_GUBERNATORIAL_CANDIDACY", electionId: race.id, provinceId: race.provinceId })}>File candidacy</button><button className="btn secondary" onClick={() => run({ type: "DECLINE_GUBERNATORIAL_CANDIDACY", electionId: race.id })}>Decline this cycle</button></> : <StatusBadge>Opens {race.filingOpenDate}</StatusBadge>}</div>
            </section>;
          })}
          {provincialAssemblyOpportunities.map((race) => {
            const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
            return <section className="opportunity-row" key={race.id}>
              <div className="opportunity-office"><span>Province</span><h3>{provinceName} Provincial Assembly</h3><strong>{race.date}</strong></div>
              <div className="opportunity-details"><p>Province-wide proportional election · chamber {props.snap.provincialRuntime.assemblies[race.provinceId]?.seatCount ?? "—"} seats</p><p className="muted">A provincial term can build a record for Governor or the National Assembly.</p></div>
              <div className="opportunity-action">{race.status === "filing_open" ? <><button className="btn" onClick={() => run({ type: "FILE_PROVINCIAL_ASSEMBLY_CANDIDACY", electionId: race.id })}>Join party list</button><button className="btn secondary" onClick={() => run({ type: "DECLINE_PROVINCIAL_ASSEMBLY_CANDIDACY", electionId: race.id })}>Decline this cycle</button></> : <StatusBadge>Opens five months before election</StatusBadge>}</div>
            </section>;
          })}
          {!presidential && !assemblyElection && gubernatorial.length === 0 && provincialAssemblyOpportunities.length === 0 ? <EmptyState>No modeled election opportunity is currently scheduled.</EmptyState> : null}
        </div>
      ) : null}
      {tab === "overview" ? (
        <SectionCard title="Public biography">
          <p>{figure?.notes ?? figure?.display_summary ?? runtime?.description ?? "No public biography on file."}</p>
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
        <SectionCard title="Recent public events">
          {props.snap.history
            .filter((e) => e.actorIds.includes(props.snap.playerPoliticianId))
            .slice(-12)
            .map((e) => (
              <div key={e.id} className="muted">
                {e.date} · {eventDisplay(props.catalog, props.world, props.snap, e)}
              </div>
            ))}
        </SectionCard>
      ) : null}
      {tab === "directory" ? (() => {
        const query = directoryQuery.trim().toLowerCase();
        const rows = Object.values(props.snap.politicians)
          .filter((politician) => politician.alive)
          .filter((politician) => {
            const name = politicianDisplayName(props.catalog, politician.id).toLowerCase();
            const party = partyDisplayName(props.world, politician.partyId, props.snap).toLowerCase();
            return !query || name.includes(query) || party.includes(query);
          })
          .filter((politician) => directoryParty === "all" || politician.partyId === directoryParty)
          .filter((politician) => directoryCaucus === "all" || politician.factionId === directoryCaucus)
          .filter((politician) => directoryProvince === "all" || (politician.homeProvinceId ?? props.world.politicianHomeProvince[politician.id]) === directoryProvince)
          .filter((politician) => {
            if (directoryOffice === "all") return true;
            if (directoryOffice === "party_leader") return Object.values(props.snap.partyStates).some((party) => party.leaderId === politician.id);
            if (directoryOffice === "caucus_leader") return Object.values(props.snap.factionStates).some((caucus) => caucus.chairId === politician.id);
            return Object.values(props.snap.officeTerms).some((term) => term.holderId === politician.id && term.status === "active" && props.world.offices[term.officeId]?.kind === directoryOffice);
          })
          .sort((a, b) => politicianDisplayName(props.catalog, a.id).localeCompare(politicianDisplayName(props.catalog, b.id)));
        const selected = props.snap.politicians[directorySelection] ?? rows[0];
        const selectedTerms = selected ? Object.values(props.snap.officeTerms).filter((term) => term.holderId === selected.id) : [];
        const selectedCommittees = selected ? Object.values(props.snap.legislatureRuntime.committees).filter((committee) => committee.chairId === selected.id) : [];
        const selectedPartyLeadership = selected ? Object.values(props.snap.partyStates).filter((party) => party.leaderId === selected.id) : [];
        const selectedCaucusLeadership = selected ? Object.values(props.snap.factionStates).filter((caucus) => caucus.chairId === selected.id) : [];
        const selectedVotes = selected ? Object.values(props.snap.legislatureRuntime.legislativeVotes)
          .filter((vote) => vote.votes[selected.id])
          .filter((vote) => directoryVoteFilter === "all" || vote.votes[selected.id] === directoryVoteFilter)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 40) : [];
        return <WorkLayout
          main={<>
            <input aria-label="Search politicians" placeholder="Search name or party" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} />
            <div className="directory-filters">
              <label className="field-label">Party<select value={directoryParty} onChange={(event) => setDirectoryParty(event.target.value)}><option value="all">All parties</option>{Object.keys(props.world.partyDefinitions).filter((partyId) => partyId !== props.world.independentAggregatePartyId).sort().map((partyId) => <option key={partyId} value={partyId}>{partyDisplayName(props.world, partyId, props.snap)}</option>)}</select></label>
              <label className="field-label">Caucus<select value={directoryCaucus} onChange={(event) => setDirectoryCaucus(event.target.value)}><option value="all">All caucuses</option>{Object.entries(props.world.factionDefinitions).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([caucusId, caucus]) => <option key={caucusId} value={caucusId}>{caucus.name}</option>)}</select></label>
              <label className="field-label">Province<select value={directoryProvince} onChange={(event) => setDirectoryProvince(event.target.value)}><option value="all">All provinces</option>{props.world.provinceIds.slice().sort((a, b) => (props.catalog.places.get(a)?.name ?? a).localeCompare(props.catalog.places.get(b)?.name ?? b)).map((provinceId) => <option key={provinceId} value={provinceId}>{props.catalog.places.get(provinceId)?.name ?? "Province"}</option>)}</select></label>
              <label className="field-label">Office<select value={directoryOffice} onChange={(event) => setDirectoryOffice(event.target.value)}><option value="all">All offices</option><option value="assembly_member">National Assembly</option><option value="governor">Governor</option><option value="minister">Minister</option><option value="mayor">Mayor</option><option value="constitutional_court_justice">Justice</option><option value="party_leader">Party leader</option><option value="caucus_leader">Caucus chair</option></select></label>
            </div>
            <p className="muted">{rows.length} matching public figures · showing the first 80</p>
            <div className="entity-list">{rows.slice(0, 80).map((politician) => <PoliticianCard key={politician.id} catalog={props.catalog} world={props.world} state={props.snap} politicianId={politician.id} compact selected={politician.id === selected?.id} onSelect={() => setDirectorySelection(politician.id)} />)}</div>
          </>}
          rail={selected ? <>
            <PoliticianProfile catalog={props.catalog} world={props.world} state={props.snap} politicianId={selected.id} party={partyDisplayName(props.world, selected.partyId, props.snap)} {...(selected.description ? { biography: selected.description } : {})} />
            <SectionDivider title="Office history" />
            {selectedTerms.length === 0 ? <EmptyState>No public office on file.</EmptyState> : selectedTerms.slice().reverse().map((term) => <div key={term.id} className="muted">{props.world.offices[term.officeId]?.title ?? "Public office"} · {term.startDate ?? "date unknown"} · {term.status}</div>)}
            <SectionDivider title="Institutional roles" />
            {selectedCommittees.length + selectedPartyLeadership.length + selectedCaucusLeadership.length === 0 ? <EmptyState>No current public leadership role.</EmptyState> : <>
              {selectedCommittees.map((committee) => <div key={committee.id} className="muted">Chair · {committeeDisplayName(committee.id)}</div>)}
              {selectedPartyLeadership.map((party) => <div key={party.partyId} className="muted">Leader · {partyDisplayName(props.world, party.partyId, props.snap)}</div>)}
              {selectedCaucusLeadership.map((caucus) => <div key={caucus.factionId} className="muted">Chair · {factionDisplayName(props.world, caucus.factionId)}</div>)}
            </>}
            <SectionDivider title="Recent Assembly votes" />
            <div className="map-scale-switch" aria-label="Filter politician voting record">
              {(["all", "yes", "no", "abstain"] as const).map((choice) => <button type="button" key={choice} className={directoryVoteFilter === choice ? "active" : ""} onClick={() => setDirectoryVoteFilter(choice)}>{choice === "yes" ? "Aye" : choice === "no" ? "Nay" : choice[0]!.toUpperCase() + choice.slice(1)}</button>)}
            </div>
            {selectedVotes.length === 0 ? <EmptyState>No recorded federal roll call matches this filter.</EmptyState> : <DataTable dense headers={["Date", "Measure", "Vote", "Party", "Caucus"]}>
              {selectedVotes.map((vote) => {
                const bill = props.snap.legislatureRuntime.bills[vote.billId];
                const choice = vote.votes[selected.id]!;
                const partyId = selected.partyId;
                const recommendation = partyId ? props.snap.legislatureRuntime.partyRecommendations[`${partyId}:${vote.billId}`]?.stance ?? "free_vote" : "free_vote";
                const followed = recommendation === "free_vote" ? "Free vote" : recommendation === "support" ? choice === "yes" ? "Followed party" : "Broke with party" : choice === "no" ? "Followed party" : "Broke with party";
                const factionId = selected.factionId;
                const caucusRecommendation = factionId ? props.snap.legislatureRuntime.factionRecommendations[`${factionId}:${vote.billId}`]?.stance ?? "free_vote" : "free_vote";
                const caucusFollowed = caucusRecommendation === "free_vote" ? "Free vote" : caucusRecommendation === "support" ? choice === "yes" ? "Followed caucus" : "Broke with caucus" : choice === "no" ? "Followed caucus" : "Broke with caucus";
                return <tr key={vote.id}><td>{vote.date}</td><td>{bill?.title ?? "Assembly matter"}</td><td>{choice === "yes" ? "Aye" : choice === "no" ? "Nay" : "Abstain"}</td><td>{followed}</td><td>{caucusFollowed}</td></tr>;
              })}
            </DataTable>}
          </> : <EmptyState>Select a politician.</EmptyState>}
        />;
      })() : null}
    </div>
  );
}

function Party(props: PageProps) {
  const playerPartyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
  const availablePartyIds = Object.keys(props.world.partyDefinitions)
    .filter((id) => id !== props.world.independentAggregatePartyId)
    .sort((a, b) => partyDisplayName(props.world, a, props.snap).localeCompare(partyDisplayName(props.world, b, props.snap)));
  const [selectedPartyId, setSelectedPartyId] = useState(playerPartyId ?? availablePartyIds[0] ?? "");
  useEffect(() => {
    if (props.globalFocus?.kind === "Party" && props.world.partyDefinitions[props.globalFocus.id]) {
      setSelectedPartyId(props.globalFocus.id);
    } else if (props.globalFocus?.kind === "Caucus") {
      const partyId = props.world.factionDefinitions[props.globalFocus.id]?.partyId;
      if (partyId) setSelectedPartyId(partyId);
    }
  }, [props.globalFocus, props.world]);
  const partyId = selectedPartyId || playerPartyId;
  const party = partyId ? props.world.partyDefinitions[partyId] : null;
  const runtime = partyId ? props.snap.partyStates[partyId] : null;
  const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
  const members = currentAssemblyMemberIds(props.world, props.snap);
  const caucus = members.filter(
    (id) => props.snap.politicians[id]?.partyId === partyId,
  ).length;
  const totalSeats = props.world.legislativeConstitution.assemblySeatCount;
  const presidentId = Object.values(props.snap.officeTerms).find((t) => {
    if (t.status !== "active") return false;
    return props.world.offices[t.officeId]?.kind === "president";
  })?.holderId;
  const govParty = presidentId ? props.snap.politicians[presidentId]?.partyId : null;
  const position =
    !partyId ? "Independent" : partyId === govParty ? "In government" : "Opposition";
  const recent = props.snap.history
    .filter((e) => {
      if (e.type === "TURN_COMPLETED") return false;
      return e.actorIds.some((id) => props.snap.politicians[id]?.partyId === partyId);
    })
    .slice(-8)
    .reverse();
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const caucusLeadership = partyId ? props.snap.legislatureRuntime.caucusLeadership[partyId] : null;
  const caucusContests = Object.values(props.snap.legislatureRuntime.caucusContests).filter((contest) => contest.partyId === partyId);
  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    props.report(props.sim.executeCommand(command));
    props.onDone();
  };

  return (
    <div>
      <PageHeader kicker="Parties and caucuses" title={party?.name ?? "No party"} subtitle="National party directory, internal elections, factions, and parliamentary leadership." />
      <div className="party-directory-strip" role="navigation" aria-label="All parties">
        {availablePartyIds.map((id) => {
          const seats = members.filter((memberId) => props.snap.politicians[memberId]?.partyId === id).length;
          const leader = props.snap.partyStates[id]?.leaderId;
          return <button key={id} type="button" className={`party-directory-item${id === partyId ? " selected" : ""}`} style={{ borderLeftColor: partyColor(props.world, id) }} onClick={() => setSelectedPartyId(id)}>
            <strong>{partyDisplayName(props.world, id, props.snap)}</strong>
            <span>{seats} seats · {leader ? politicianDisplayName(props.catalog, leader) : "leadership vacant"}</span>
          </button>;
        })}
      </div>
      {party ? (
        <div className="party-banner" style={{ borderLeftColor: partyColor(props.world, partyId) }}>
          <StatusBadge tone="ok">
            {caucus} of {totalSeats} Assembly seats
          </StatusBadge>
          <StatusBadge>{position}</StatusBadge>
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
      <SectionCard title="Caucuses">
        <div className="faction-cards">
          {(party?.factionIds ?? []).map((fid) => {
            const chair = props.snap.factionStates[fid]?.chairId;
            const caucusMembers = Object.values(props.snap.politicians).filter((politician) => politician.factionId === fid && politician.alive && !politician.retired);
            const caucusMps = members.filter((memberId) => props.snap.politicians[memberId]?.factionId === fid).length;
            const share = caucus === 0 ? 0 : Math.round((caucusMps / caucus) * 100);
            return (
              <div key={fid} className="faction-card">
                <strong>{factionDisplayName(props.world, fid)}</strong>
                <div className="muted">
                  Chair: {chair ? politicianDisplayName(props.catalog, chair) : "vacant"}
                </div>
                <div className="muted">{caucusMps} MPs · {share}% of party caucus · {caucusMembers.length} known politicians</div>
              </div>
            );
          })}
        </div>
      </SectionCard>
      <SectionCard title="Assembly caucus">
        {caucusLeadership ? <div className="faction-cards">
          {caucusLeadership.floorLeaderId ? <PoliticianCard catalog={props.catalog} world={props.world} state={props.snap} politicianId={caucusLeadership.floorLeaderId} office="Floor leader" compact /> : <div className="faction-card"><strong>Floor leader</strong><div className="muted">Vacant</div></div>}
          {caucusLeadership.whipId ? <PoliticianCard catalog={props.catalog} world={props.world} state={props.snap} politicianId={caucusLeadership.whipId} office="Whip" compact /> : <div className="faction-card"><strong>Whip</strong><div className="muted">Vacant</div></div>}
          <div className="faction-card"><strong>Next caucus election</strong><div className="muted">{caucusLeadership.nextElectionDate}</div></div>
        </div> : <EmptyState>No sitting Assembly caucus.</EmptyState>}
        {caucusContests.filter((contest) => contest.status === "open").map((contest) => <div key={contest.id} className="decision-row">
          <div><strong>{contest.role === "floor_leader" ? "Floor leader election" : "Whip election"}</strong><div className="muted">Closes {contest.closeDate} · {contest.candidateIds.length} candidates</div></div>
          {partyId === playerPartyId && contest.playerDecision == null ? <button className="btn" onClick={() => run({ type: "DECLARE_CAUCUS_LEADERSHIP_CANDIDACY", contestId: contest.id })}>Stand for election</button> : <StatusBadge>{contest.playerDecision ?? contest.status}</StatusBadge>}
        </div>)}
      </SectionCard>
      <SectionCard title="Nominations and leadership">
        {contests.length === 0 ? <EmptyState>No current party contests.</EmptyState> : null}
        {contests.map((c) => (
          <div key={c.id} className="contest-card">
            <strong>{contestDisplayName(props.snap, props.world, c.id)}</strong>{" "}
            <StatusBadge tone={c.status === "open" ? "warn" : "idle"}>{c.status}</StatusBadge>
            <div className="muted">
              {Object.values(c.entries).filter((e) => e.status !== "potential").length} candidates
            </div>
            {Object.values(c.entries)
              .filter((e) => e.status !== "potential")
              .slice(0, 6)
              .map((e) => (
                <PoliticianCard
                  key={e.politicianId}
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={e.politicianId}
                  compact
                />
              ))}
            {c.winnerId ? (
              <div>Winner: {politicianDisplayName(props.catalog, c.winnerId)}</div>
            ) : null}
            {c.status === "open" && partyId === playerPartyId && !c.entries[props.snap.playerPoliticianId] ? <button className="btn" onClick={() => run({ type: "DECLARE_PARTY_CONTEST_CANDIDACY", contestId: c.id, politicianId: props.snap.playerPoliticianId })}>Enter contest</button> : null}
          </div>
        ))}
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
                    .map(([id, seats]) => `${partyDisplayName(props.world, id === "independent" ? null : id, props.snap)} ${seats}`)
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
    ...Object.values(props.snap.elections).map((election) => ({ id: election.id, date: election.date, type: election.type, status: election.status, provinceId: null as string | null })),
    ...Object.values(props.snap.provincialRuntime.elections).map((election) => ({ id: election.id, date: election.date, type: "gubernatorial", status: election.status, provinceId: election.provinceId as string | null })),
  ].sort((a, b) => {
    const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
    const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
    return ba - aa || (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.id.localeCompare(b.id);
  });
  const activeMapElection = electionChoices.find((election) => election.id === mapElectionId) ?? electionChoices[0] ?? null;
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
  const tooltip = (selection: MapSelection) => {
    if (mode === "economy" && selection.kind === "province") {
      const data = props.snap.economyRuntime.provinces[selection.id];
      return <><strong>{selection.name}</strong><span>{data ? `Conditions ${data.conditionsIndex.toFixed(1)} · employment ${data.employmentIndex.toFixed(1)} · housing ${data.housingIndex.toFixed(1)}` : "No regional series"}</span></>;
    }
    if (mode === "campaign") {
      const value = selection.kind === "province"
        ? props.campaign?.organizationByProvince[selection.id]
        : selection.kind === "constituency"
          ? props.campaign?.organizationByConstituency[selection.id]
          : null;
      return <><strong>{selection.name}</strong><span>{value == null ? "No active field operation" : `Ground Game ${groundGameStrength(value)}/100`}</span></>;
    }
    if (mode === "political" && selection.kind === "constituency") {
      const rows = constituencySittingSeatBreakdown(props.world, props.snap, selection.id);
      return <><strong>{selection.name}</strong><span>{rows.map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`).join(" · ") || "No sitting members"}</span></>;
    }
    if (mode === "election") {
      const national = activeMapElection ? props.snap.elections[activeMapElection.id] : null;
      const regional = activeMapElection ? props.snap.provincialRuntime.elections[activeMapElection.id] : null;
      if (selection.kind === "constituency" && national?.assembly?.constituencyResults[selection.id]) {
        const result = national.assembly.constituencyResults[selection.id]!;
        return <><strong>{selection.name}</strong><span>{result.electedIds.length} elected · turnout {(result.turnout.turnoutRate * 100).toFixed(0)}%</span></>;
      }
      if (selection.kind === "province" && regional?.provinceId === selection.id) {
        return <><strong>{selection.name}</strong><span>{regional.winnerId ? `Winner ${politicianDisplayName(props.catalog, regional.winnerId)}` : `${regional.status.replace(/_/g, " ")} · ${Object.keys(regional.candidates).length} candidates`}</span></>;
      }
      return <><strong>{selection.name}</strong><span>No published geographic result for this election.</span></>;
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
        if (activeMapElection?.type === "assembly") return current.kind === "constituency" ? current : null;
        if (activeMapElection?.type === "gubernatorial") return current.kind === "province" ? current : null;
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
        <label className="map-election-picker">Election
          <select value={activeMapElection?.id ?? ""} onChange={(event) => {
            const id = event.target.value;
            const next = electionChoices.find((election) => election.id === id);
            setMapElectionId(id);
            setSel((current) => {
              if (!current || !next) return null;
              if (next.type === "assembly") return current.kind === "constituency" ? current : null;
              if (next.type === "gubernatorial") return current.kind === "province" ? current : null;
              return null;
            });
          }}>
            {electionChoices.map((election) => <option key={election.id} value={election.id}>{election.provinceId ? `${props.catalog.places.get(election.provinceId)?.name ?? election.provinceId} · ` : ""}{election.date.slice(0, 4)} · {election.type.replace(/_/g, " ")} · {election.status.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      ) : null}
      {mode === "campaign" ? <div className="map-scale-switch" aria-label="Campaign map scale"><button type="button" className={campaignMapScale === "province" ? "active" : ""} onClick={() => { setCampaignMapScale("province"); setSel(null); }}>Provinces</button><button type="button" className={campaignMapScale === "constituency" ? "active" : ""} onClick={() => { setCampaignMapScale("constituency"); setSel(null); }}>Constituencies</button></div> : null}
      <div className="dash dash-2">
        <TerenaMap
          bundle={props.bundle}
          mode={mode}
          selectedId={sel?.id ?? null}
          showConstituencies={mode !== "economy" && !(mode === "election" && activeMapElection?.type !== "assembly") && !(mode === "campaign" && campaignMapScale === "province")}
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
          <div className="map-legend"><div className="kicker">Legend</div><div className="legend-items"><span className="legend-item"><span className="swatch" style={{ background: "#d8d6cf" }} />No public geographic data</span></div></div>
        ) : <MapLegend mode={mode} world={props.world} />}
        <SectionCard title="Selection">
          {sel && place ? (
            <>
              <strong>{place.name}</strong>
              <div className="muted">
                {sel.kind === "constituency"
                  ? `${place.seats ?? "?"} seats · ${sitting} sitting${place.provinceName ? ` · ${place.provinceName}` : ""}`
                  : "Province"}
              </div>
              {org != null ? <div>Your Ground Game: {groundGameStrength(org)}/100</div> : null}
              {mode === "political" && sel.kind === "constituency"
                ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (
                    <div key={row.partyId ?? "none"} className="muted">
                      {partyDisplayName(props.world, row.partyId, props.snap)} · {row.seats} sitting
                      seat{row.seats === 1 ? "" : "s"}
                    </div>
                  ))
                : null}
              {mode === "economy" && regionEcon ? (
                <div>
                  Conditions {regionEcon.conditionsIndex.toFixed(1)} · employment{" "}
                  {regionEcon.employmentIndex.toFixed(1)}
                </div>
              ) : null}
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
        </SectionCard>
      </div>
      {hoverSel && !sel ? <p className="muted map-hover-note">Hovering {hoverSel.name}; click or tap to keep its details open.</p> : null}
    </div>
  );
}

const ARCHIVE_PAGE_SIZE = 25;

type ArchiveTab =
  | "elections"
  | "administrations"
  | "legislation"
  | "courts"
  | "foreign"
  | "economy";

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

function Archive(props: PageProps) {
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
    return [...shocks, ...history]
      .sort((a, b) => (b.date < a.date ? -1 : 1))
      .slice(0, 200);
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
              <EntityRow key={row.id} title={row.title} meta={row.meta} status={row.date || undefined} />
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
