import { useMemo, useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
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
import { isMp, isPresident, playerCampaign, qualitativeStanding } from "./format.js";
import {
  contestDisplayName,
  campaignTypeLabel,
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
  DashboardLayout,
  EmptyState,
  MetricStrip,
  NewsItem,
  PageHeader,
  RightRail,
  SectionCard,
  StatCard,
  TabBar,
  ActivityFeedItem,
  LeadStory,
  StatusBadge,
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
  const feed = monthEvents.slice(-12).reverse();
  const stories = storiesChronological(props.snap).slice(0, 5);
  const polls = Object.values(props.snap.polls).slice(-2);
  const n = props.snap.economyRuntime.national;
  const upcoming = Object.values(props.snap.elections).filter((e) => e.status !== "resolved");
  const figure = props.figures.get(playerId);
  const runtime = props.snap.politicians[playerId];
  const standing = props.snap.candidateStanding[playerId];
  const prevConfidence =
    props.snap.economyRuntime.history.slice(-2)[0]?.confidenceIndex ?? n.confidenceIndex;
  const confDelta = n.confidenceIndex - prevConfidence;
  const governedProvince = governedProvinceId(props.world, props.snap, playerId);
  const governorState = governedProvince ? props.snap.provincialRuntime.provinces[governedProvince] : null;
  const governorEconomy = governedProvince ? props.snap.economyRuntime.provinces[governedProvince] : null;
  const playerIsMp = isMp(props.world, props.snap, playerId);

  return (
    <div className="home-briefing">
      <PoliticianProfile
        catalog={props.catalog}
        world={props.world}
        state={props.snap}
        politicianId={playerId}
        office={props.offices[0] ?? "Private citizen"}
        party={partyDisplayName(props.world, runtime?.partyId ?? null, props.snap)}
        faction={factionDisplayName(props.world, runtime?.factionId ?? null)}
        {...(figure?.home ? { home: figure.home } : {})}
        standing={`Public standing: ${qualitativeStanding(standing?.favorability)}`}
        {...((figure?.notes ?? figure?.display_summary)
          ? { biography: figure?.notes ?? figure?.display_summary }
          : {})}
      />

      <section className="role-briefing-band" aria-label="Role briefing">
        <div className="role-briefing-heading">
          <span className="eyebrow">Your brief</span>
          <strong>{playerIsPresident ? "Presidential business" : governedProvince ? `${props.catalog.places.get(governedProvince)?.name ?? governedProvince} agenda` : playerIsMp ? "Assembly business" : props.campaign ? "Campaign priorities" : "Political career"}</strong>
        </div>
        <div className="role-briefing-items">
          {playerIsPresident ? <>
            <span><b>{Object.values(props.snap.legislatureRuntime.bills).filter((bill) => bill.status === "sent_to_president").length}</b> bills awaiting action</span>
            <span><b>{Object.values(props.snap.foreignAffairsRuntime.crises).filter((crisis) => isPublicCrisisStage(crisis.stage)).length}</b> public crises</span>
            <span><b>{decisions.length}</b> decisions awaiting you</span>
          </> : null}
          {governedProvince && governorState && governorEconomy ? <>
            <span><b>{governorEconomy.conditionsIndex.toFixed(1)}</b> regional conditions</span>
            <span><b>{governorState.actionPointsRemaining}</b> governor actions left</span>
            <span><b>{governorState.activePressureId ? "Action needed" : "Stable"}</b> provincial pressure</span>
          </> : null}
          {!playerIsPresident && !governedProvince && playerIsMp ? <>
            <span><b>{Object.values(props.snap.legislatureRuntime.bills).filter((bill) => ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status)).length}</b> active bills</span>
            <span><b>{decisions.filter((decision) => decision.kind.endsWith("vote")).length}</b> votes due</span>
            <span><b>{upcoming.find((election) => election.type === "assembly")?.date ?? "—"}</b> next Assembly election</span>
          </> : null}
          {!playerIsPresident && !governedProvince && !playerIsMp && props.campaign ? <>
            <span><b>{props.campaign.actionPointsRemaining}</b> campaign actions</span>
            <span><b>{Math.round(props.campaign.cashOnHand)}</b> cash on hand</span>
            <span><b>{props.campaign.electionId ? electionDisplayName(props.campaign.electionId) : campaignTypeLabel(props.campaign.type)}</b> active race</span>
          </> : null}
          {!playerIsPresident && !governedProvince && !playerIsMp && !props.campaign ? <>
            <span><b>{upcoming.length}</b> scheduled elections</span>
            <span><b>Career</b> review eligible races</span>
            <span><b>No office required</b> the game continues</span>
          </> : null}
        </div>
      </section>

      {interrupt ? (
        <div className="briefing-urgent alert">
          <strong>Urgent</strong>
          <p>{interruptDisplay(interrupt)}</p>
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <SectionCard title="Required decisions">
          {decisions.map((d) => (
            <div key={d.key} className="urgent-item">
              {decisionDisplayLabel(d, interrupt)}
            </div>
          ))}
        </SectionCard>
      ) : null}

      {lead ? (
        <LeadStory
          kicker="Lead story"
          headline={eventDisplay(props.catalog, props.world, props.snap, lead)}
          date={lead.date}
        />
      ) : (
        <EmptyState>No major developments this month.</EmptyState>
      )}

      {terenaPublicCrisis ? (
        <div className="briefing-urgent alert">
          <strong>International crisis</strong>
          <p>
            Terena is involved in an active international crisis (
            {crisisStageLabel(terenaPublicCrisis.stage)} ·{" "}
            {publicSeverityLabel(terenaPublicCrisis.intensity, terenaPublicCrisis.stage)}). See{" "}
            {terenaPublicCrisis.participantIds
              .filter((id) => id !== TERENA_WORLD_ID)
              .map((id) => countryDisplayName(props.world, id))
              .join(", ") || "foreign partners"}{" "}
            on the Foreign Affairs map.
          </p>
        </div>
      ) : null}

      {terenaLatentTension && !terenaPublicCrisis ? (
        <div className="briefing-note alert">
          <strong>Strategic tension</strong>
          <p>
            Background tension with{" "}
            {terenaLatentTension.participantIds
              .filter((id) => id !== TERENA_WORLD_ID)
              .map((id) => countryDisplayName(props.world, id))
              .join(", ") || "a foreign power"}{" "}
            persists ({publicSeverityLabel(terenaLatentTension.intensity, terenaLatentTension.stage)}
            ). Monitor developments on the Foreign Affairs map.
          </p>
        </div>
      ) : null}

      {playerIsPresident && warTrigger ? (
        <div className="briefing-urgent alert">
          <strong>War powers decision required</strong>
          <p>
            International developments require presidential war powers. Open Executive or Foreign
            Affairs to invoke war powers or seek Assembly authorization.
          </p>
        </div>
      ) : null}

      <DashboardLayout
        main={
          <>
            <SectionCard title="Political situation">
              <MetricStrip>
                <StatCard
                  label="Standing"
                  value={qualitativeStanding(standing?.favorability)}
                />
                <StatCard
                  label="Confidence"
                  value={n.confidenceIndex.toFixed(1)}
                  hint={`${formatIndexDelta(confDelta)} vs prior month`}
                />
                <StatCard
                  label="Employment index"
                  value={n.employmentIndex.toFixed(1)}
                  hint="Index reference = 100"
                />
                {props.campaign ? (
                  <StatCard
                    label="Campaign actions"
                    value={`${props.campaign.actionPointsRemaining} / ${props.campaign.actionPointsMax}`}
                  />
                ) : null}
              </MetricStrip>
              {polls.length > 0 ? (
                <div className="muted" style={{ marginTop: "0.75rem" }}>
                  Latest poll {polls[polls.length - 1]!.publicationDate}:{" "}
                  {pollShareLine(
                    props.catalog,
                    props.world,
                    props.snap,
                    polls[polls.length - 1]!.firstPreference,
                  )}
                </div>
              ) : null}
            </SectionCard>
            <SectionCard title="Recent activity">
              {feed.length === 0 ? <EmptyState>Quiet month in public records.</EmptyState> : null}
              {feed.map((e) => (
                <ActivityFeedItem
                  key={e.id}
                  date={e.date}
                  text={eventDisplay(props.catalog, props.world, props.snap, e)}
                />
              ))}
            </SectionCard>
            {stories.length > 0 ? (
              <SectionCard title="In the press">
                {stories.map((s) => (
                  <NewsItem
                    key={s.id}
                    headline={
                      s.headlineKey === "Political developments" ||
                      s.headlineKey === "Political storm in Valen"
                        ? mediaHeadlineForEvent(s.factEventType, s.framing)
                        : s.headlineKey
                    }
                    outlet={props.world.mediaOutlets[s.outletId]?.name ?? s.outletId}
                    date={s.date}
                    category={s.category}
                  />
                ))}
              </SectionCard>
            ) : null}
          </>
        }
        rail={
          <RightRail>
            <SectionCard title="Upcoming elections">
              {upcoming.length === 0 ? <EmptyState>No pending elections.</EmptyState> : null}
              {upcoming.map((el) => (
                <div key={el.id} className="rail-item">
                  <strong>{electionDisplayName(el.id)}</strong>
                  <div className="muted">{el.date}</div>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Campaign">
              {props.campaign ? (
                <div>
                  <StatusBadge tone="ok">Active</StatusBadge>
                  <div className="muted">{campaignTypeLabel(props.campaign.type)}</div>
                </div>
              ) : (
                <EmptyState>Not campaigning</EmptyState>
              )}
            </SectionCard>
          </RightRail>
        }
      />
    </div>
  );
}

function Career(props: PageProps) {
  const [tab, setTab] = useState<"opportunities" | "overview" | "career" | "positions" | "relationships" | "record">(
    "opportunities",
  );
  const [raceGeography, setRaceGeography] = useState("");
  const figure = props.figures.get(props.snap.playerPoliticianId);
  const runtime = props.snap.politicians[props.snap.playerPoliticianId];
  const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
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
        standing={`Public standing: ${qualitativeStanding(standing?.favorability)}`}
        {...((figure?.notes ?? figure?.display_summary)
          ? { biography: figure?.notes ?? figure?.display_summary }
          : {})}
      />
      <TabBar
        tabs={[
          { id: "opportunities", label: "Political opportunities" },
          { id: "overview", label: "Overview" },
          { id: "career", label: "Career" },
          { id: "positions", label: "Positions" },
          { id: "relationships", label: "Relationships" },
          { id: "record", label: "Public record" },
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
                        <strong>{info?.name ?? id}</strong>
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
          {!presidential && !assemblyElection && gubernatorial.length === 0 ? <EmptyState>No modeled election opportunity is currently scheduled.</EmptyState> : null}
        </div>
      ) : null}
      {tab === "overview" ? (
        <SectionCard title="Public biography">
          <p>{figure?.notes ?? figure?.display_summary ?? "No public biography on file."}</p>
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
        </SectionCard>
      ) : null}
      {tab === "relationships" ? (
        <SectionCard title="Known public associations">
          <EmptyState>
            Exact private relationship values are not shown. Use Organizations for known public
            contact.
          </EmptyState>
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
    </div>
  );
}

function Party(props: PageProps) {
  const partyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
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

  return (
    <div>
      <PageHeader kicker="Party" title={party?.name ?? "No party"} />
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
      <SectionCard title="Factions">
        <div className="faction-cards">
          {(party?.factionIds ?? []).map((fid) => {
            const chair = props.snap.factionStates[fid]?.chairId;
            return (
              <div key={fid} className="faction-card">
                <strong>{factionDisplayName(props.world, fid)}</strong>
                <div className="muted">
                  Chair: {chair ? politicianDisplayName(props.catalog, chair) : "vacant"}
                </div>
              </div>
            );
          })}
        </div>
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
      return <><strong>{selection.name}</strong><span>{value == null ? "No active field operation" : `Field organization ${value.toFixed(2)}`}</span></>;
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
              {org != null ? <div>Your field organization: {org.toFixed(2)}</div> : null}
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

function Archive(props: PageProps) {
  const [filter, setFilter] = useState<
    "all" | "elections" | "laws" | "events" | "leadership" | "foreign"
  >("all");
  const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const governorElections = Object.values(props.snap.provincialRuntime.elections).filter((e) => e.status === "resolved" || e.status === "assumed");
  const leadership = Object.values(props.snap.partyContests).filter((c) => c.winnerId);
  const events = props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-40).reverse();
  const foreign = props.snap.foreignAffairsRuntime;
  const foreignEvents = props.snap.history
    .filter((e) => {
      if (e.type === "TURN_COMPLETED") return false;
      return /DIPLOMATIC|SANCTION|TREATY|FOREIGN|CRISIS|TRADE|POSTURE|CONFLICT|ALLIANCE/i.test(
        e.type,
      );
    })
    .slice(-30)
    .reverse();
  const treaties = Object.values(foreign.treaties).sort((a, b) =>
    (b.signedDate ?? "") < (a.signedDate ?? "") ? -1 : 1,
  );
  const crises = Object.values(foreign.crises);
  const sanctions = Object.values(foreign.sanctions);
  const conflicts = Object.values(foreign.conflicts);
  const foreignLeadership = props.snap.history
    .filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE")
    .slice(-20)
    .reverse();

  return (
    <div>
      <PageHeader kicker="History" title="Archive" subtitle="Political history drawn from public records." />
      <TabBar
        tabs={[
          { id: "all", label: "All" },
          { id: "elections", label: "Elections" },
          { id: "laws", label: "Laws" },
          { id: "leadership", label: "Leadership" },
          { id: "foreign", label: "Foreign" },
          { id: "events", label: "Events" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {(filter === "all" || filter === "elections") && elections.length > 0 ? (
        <SectionCard title="Elections">
          {elections.map((e) => (
            <div key={e.id}>
              {electionDisplayName(e.id)} · {e.type === "assembly" ? `${e.winnerIds.length} members elected` : `won by ${e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`}
            </div>
          ))}
          {governorElections.map((e) => <div key={e.id}>{props.catalog.places.get(e.provinceId)?.name ?? e.provinceId} gubernatorial election · {e.winnerId ? `won by ${politicianDisplayName(props.catalog, e.winnerId)}` : "result unavailable"}</div>)}
        </SectionCard>
      ) : null}
      {(filter === "all" || filter === "laws") && laws.length > 0 ? (
        <SectionCard title="Laws enacted">
          {laws.map((l) => (
            <div key={l.id}>
              {l.title} ({l.enactedDate})
            </div>
          ))}
        </SectionCard>
      ) : null}
      {(filter === "all" || filter === "leadership") && leadership.length > 0 ? (
        <SectionCard title="Party leadership">
          {leadership.map((c) => (
            <div key={c.id}>
              {contestDisplayName(props.snap, props.world, c.id)} —{" "}
              {politicianDisplayName(props.catalog, c.winnerId!)}
            </div>
          ))}
        </SectionCard>
      ) : null}
      {(filter === "all" || filter === "foreign") ? (
        <>
          {treaties.length > 0 ? (
            <SectionCard title="Treaties">
              {treaties.map((t) => (
                <div key={t.id}>
                  {t.title} · {treatyTypeLabel(t.kind)} · {treatyStatusLabel(t)}
                  {t.signedDate ? ` · ${t.signedDate}` : ""}
                </div>
              ))}
            </SectionCard>
          ) : filter === "foreign" ? (
            <SectionCard title="Treaties">
              <EmptyState>No treaties on record.</EmptyState>
            </SectionCard>
          ) : null}
          {crises.length > 0 ? (
            <SectionCard title="International crises">
              {crises.map((c) => (
                <div key={c.id}>
                  {c.participantIds.map((id) => countryDisplayName(props.world, id)).join(" · ")} ·{" "}
                  {crisisStageLabel(c.stage)} · since {c.startedDate}
                </div>
              ))}
            </SectionCard>
          ) : filter === "foreign" ? (
            <SectionCard title="International crises">
              <EmptyState>No crises on record.</EmptyState>
            </SectionCard>
          ) : null}
          {conflicts.length > 0 ? (
            <SectionCard title="Conflicts">
              {conflicts.map((c) => (
                <div key={c.id}>
                  {c.belligerentIds.map((id) => countryDisplayName(props.world, id)).join(" vs ")} ·
                  {publicSeverityLabel(c.intensity, "conflict")}
                  {c.endedDate ? ` · ended ${c.endedDate}` : " · ongoing"}
                </div>
              ))}
            </SectionCard>
          ) : null}
          {sanctions.length > 0 ? (
            <SectionCard title="Sanctions">
              {sanctions.map((s) => (
                <div key={s.id}>
                  {countryDisplayName(props.world, s.imposerId)} →{" "}
                  {countryDisplayName(props.world, s.targetId)} · {s.active ? "active" : "lifted"} ·{" "}
                  {s.imposedDate}
                </div>
              ))}
            </SectionCard>
          ) : null}
          {foreignLeadership.length > 0 ? (
            <SectionCard title="Foreign leadership changes">
              {foreignLeadership.map((e) => (
                <ActivityFeedItem
                  key={e.id}
                  date={e.date}
                  text={eventDisplay(props.catalog, props.world, props.snap, e)}
                />
              ))}
            </SectionCard>
          ) : null}
          {foreignEvents.length > 0 ? (
            <SectionCard title="Diplomatic events">
              {foreignEvents.map((e) => (
                <ActivityFeedItem
                  key={e.id}
                  date={e.date}
                  text={eventDisplay(props.catalog, props.world, props.snap, e)}
                />
              ))}
            </SectionCard>
          ) : filter === "foreign" ? (
            <SectionCard title="Diplomatic events">
              <EmptyState>No diplomatic events recorded.</EmptyState>
            </SectionCard>
          ) : null}
        </>
      ) : null}
      {(filter === "all" || filter === "events") ? (
        <SectionCard title="Public events">
          {events.map((e) => (
            <ActivityFeedItem
              key={e.id}
              date={e.date}
              text={eventDisplay(props.catalog, props.world, props.snap, e)}
            />
          ))}
        </SectionCard>
      ) : null}
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
    </div>
  );
}
