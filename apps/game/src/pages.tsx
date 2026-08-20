import { useMemo, useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  collectPlayerActionableDecisions,
  currentAssemblyMemberIds,
  storiesChronological,
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
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { isMp, playerCampaign, qualitativeStanding } from "./format.js";
import {
  contestDisplayName,
  campaignTypeLabel,
  electionDisplayName,
  eventDisplay,
  factionDisplayName,
  partyColor,
  partyDisplayName,
  politicianDisplayName,
  pollShareLine,
  type PresentationCatalog,
} from "./presentation.js";
import {
  decisionDisplayLabel,
  formatIndexDelta,
  formatPublicNumber,
  formatPublicPercent,
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
import { constituencySittingSeatBreakdown, latestPublicPoll, mapFillFor } from "./map/fills.js";

export type Screen =
  | "home"
  | "career"
  | "assembly"
  | "party"
  | "campaign"
  | "elections"
  | "executive"
  | "courts"
  | "economy"
  | "organizations"
  | "news"
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
  if (screen === "assembly") return <AssemblyPage {...props} />;
  if (screen === "party") return <Party {...props} />;
  if (screen === "campaign") return <CampaignPage {...props} />;
  if (screen === "elections") return <Elections {...props} />;
  if (screen === "executive") return <ExecutivePage {...props} />;
  if (screen === "courts") return <CourtsPage {...props} />;
  if (screen === "economy") return <EconomyPage {...props} />;
  if (screen === "organizations") return <OrganizationsPage {...props} />;
  if (screen === "news") return <NewsPage {...props} />;
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
                  hint="Jan 2028 = 100"
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
                    headline={s.headlineKey}
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
  const [tab, setTab] = useState<"overview" | "career" | "positions" | "relationships" | "record">(
    "overview",
  );
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
          { id: "overview", label: "Overview" },
          { id: "career", label: "Career" },
          { id: "positions", label: "Positions" },
          { id: "relationships", label: "Relationships" },
          { id: "record", label: "Public record" },
        ]}
        value={tab}
        onChange={setTab}
      />
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
              {e.winnerIds[0]
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

function Elections(props: PageProps) {
  const elections = Object.values(props.snap.elections);
  const due = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const contests = Object.values(props.snap.partyContests).filter(
    (c) => c.type === "presidential_nomination",
  );
  const poll = latestPublicPoll(props.snap);
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [tab, setTab] = useState<"presidential" | "assembly" | "nominations">("presidential");

  const presElections = elections.filter((e) => e.id.includes("PRES"));
  const asmElections = elections.filter((e) => e.id.includes("ASM"));

  function voteWeight(raw: unknown): number {
    return Number(String(raw ?? "0").split("/")[0]) || 0;
  }

  function renderElectionResult(el: (typeof elections)[0], kind: "presidential" | "assembly") {
    const firstPrefs =
      el.countArchive && "firstPreferences" in el.countArchive
        ? el.countArchive.firstPreferences
        : {};
    const totalVotes = Object.values(firstPrefs).reduce((sum, w) => sum + voteWeight(w), 0);
    const winnerId = el.winnerIds[0] ?? null;
    const ranked = Object.values(el.candidates).slice().sort((a, b) => {
      const aw = voteWeight(firstPrefs[a.politicianId]);
      const bw = voteWeight(firstPrefs[b.politicianId]);
      if (bw !== aw) return bw - aw;
      if (a.politicianId === winnerId) return -1;
      if (b.politicianId === winnerId) return 1;
      return a.politicianId.localeCompare(b.politicianId);
    });
    const rounds =
      el.countArchive && "rounds" in el.countArchive ? el.countArchive.rounds : [];
    return (
      <div key={el.id} className="election-result-card">
        <h4 className="serif-head">{electionDisplayName(el.id)}</h4>
        <div className="muted">
          {el.status} · {el.date}
          {kind === "presidential" && el.status === "resolved"
            ? " · first-preference shares below are not final-round totals"
            : ""}
        </div>
        {winnerId ? (
          <div className="election-winner-banner">
            <div className="kicker">Winner</div>
            <strong>{politicianDisplayName(props.catalog, winnerId)}</strong>
            <div className="muted">
              {partyDisplayName(
                props.world,
                props.snap.politicians[winnerId]?.partyId ?? null,
                props.snap,
              )}
            </div>
          </div>
        ) : null}
        <div className="candidate-result-list">
          {ranked.map((cand) => {
            const fp = firstPrefs[cand.politicianId];
            const votes = fp ? formatPublicNumber(fp) : null;
            const share = totalVotes > 0 && fp ? voteWeight(fp) / totalVotes : undefined;
            const isWinner = winnerId === cand.politicianId;
            return (
              <PoliticianCard
                key={cand.politicianId}
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={cand.politicianId}
                compact
                selected={isWinner}
                action={
                  votes ? (
                    <span className="election-votes">
                      {isWinner ? "Winner · " : ""}1st pref {formatPublicPercent(share)} · {votes}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </div>
        {due && el.id === "ELEC_PRES_2028" && el.status !== "resolved" ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const resolved = props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
              props.report(resolved);
              if (resolved.ok) {
                props.sim.executeCommand({ type: "RESUME_TURN" });
              }
              props.onDone();
            }}
          >
            Resolve election
          </button>
        ) : null}
        {rounds.length > 0 ? (
          <div className="rcv-rounds">
            <div className="kicker">RCV progression</div>
            <div className="rcv-track">
              {rounds.map((r, i) => (
                <span
                  key={i}
                  className={`rcv-chip${r.electedId ? " winner" : ""}`}
                >
                  Round {r.round ?? i + 1}
                  {r.eliminatedId
                    ? `: eliminated ${politicianDisplayName(props.catalog, r.eliminatedId)}`
                    : r.electedId
                      ? `: elected ${politicianDisplayName(props.catalog, r.electedId)}`
                      : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader kicker="Returns" title="Elections" subtitle="Public polls and certified results only." />
      <TabBar
        tabs={[
          { id: "presidential", label: "Presidential" },
          { id: "assembly", label: "Assembly" },
          { id: "nominations", label: "Nominations" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "presidential" ? (
        <div>
          {poll ? (
            <p className="muted">
              Latest national poll {poll.publicationDate}:{" "}
              {pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)}
            </p>
          ) : (
            <EmptyState>
              Presidential results are national. No geographic presidential returns are shown.
            </EmptyState>
          )}
          {presElections.map((el) => renderElectionResult(el, "presidential"))}
        </div>
      ) : null}
      {tab === "assembly" ? (
        <div className="dash dash-2">
          <SectionCard title="Sitting Assembly geography">
            <TerenaMap
              bundle={props.bundle}
              mode="election"
              selectedId={sel?.id ?? null}
              fillFor={(f, kind) => mapFillFor("election", props.world, props.snap, f, kind)}
              onSelect={setSel}
            />
            <MapLegend mode="election" world={props.world} />
            {sel?.kind === "constituency" ? (
              <div>
                <p>{sel.name}</p>
                {constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (
                  <div key={row.partyId ?? "none"} className="muted">
                    {partyDisplayName(props.world, row.partyId, props.snap)} · {row.seats} sitting
                    seat{row.seats === 1 ? "" : "s"}
                  </div>
                ))}
                <p className="muted">Sitting representation, not hidden voter support.</p>
              </div>
            ) : (
              <EmptyState>Select a constituency for the public seat breakdown.</EmptyState>
            )}
          </SectionCard>
          <div>{asmElections.map((el) => renderElectionResult(el, "assembly"))}</div>
        </div>
      ) : null}
      {tab === "nominations" ? (
        <div>
          {contests.map((c) => (
            <SectionCard key={c.id} title={contestDisplayName(props.snap, props.world, c.id)}>
              <StatusBadge>{c.status}</StatusBadge>
              {Object.values(c.entries)
                .filter((e) => e.status !== "potential")
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
                <div>Nomination winner: {politicianDisplayName(props.catalog, c.winnerId)}</div>
              ) : null}
            </SectionCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Terena(props: PageProps) {
  const [mode, setMode] = useState<MapMode>("political");
  const [sel, setSel] = useState<MapSelection | null>(null);
  const hover = sel ? props.catalog.places.get(sel.id) : null;
  const org =
    props.campaign && sel?.kind === "constituency"
      ? props.campaign.organizationByConstituency[sel.id]
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
          { id: "organizations", label: "Organizations" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="dash dash-2">
        <TerenaMap
          bundle={props.bundle}
          mode={mode}
          selectedId={sel?.id ?? null}
          fillFor={(f, kind) =>
            mapFillFor(
              mode,
              props.world,
              props.snap,
              f,
              kind,
              props.campaign?.organizationByConstituency,
            )
          }
          onSelect={setSel}
          onHover={(s) => props.setMapHover(s?.id ?? null)}
        />
        <MapLegend mode={mode} world={props.world} />
        <SectionCard title="Selection">
          {sel && hover ? (
            <>
              <strong>{hover.name}</strong>
              <div className="muted">
                {sel.kind === "constituency"
                  ? `${hover.seats ?? "?"} seats · ${sitting} sitting${hover.provinceName ? ` · ${hover.provinceName}` : ""}`
                  : "Province"}
              </div>
              {org != null ? <div>Your field organization: {org.toFixed(2)}</div> : null}
              {sel.kind === "constituency"
                ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (
                    <div key={row.partyId ?? "none"} className="muted">
                      {partyDisplayName(props.world, row.partyId, props.snap)} · {row.seats} sitting
                      seat{row.seats === 1 ? "" : "s"}
                    </div>
                  ))
                : null}
              {regionEcon ? (
                <div>
                  Conditions {regionEcon.conditionsIndex.toFixed(1)} · employment{" "}
                  {regionEcon.employmentIndex.toFixed(1)}
                </div>
              ) : null}
              {mode === "election" ? (
                <p className="muted">Election colors use sitting members and published polls, never hidden voter truth.</p>
              ) : null}
            </>
          ) : (
            <EmptyState>Select a constituency, province, or city.</EmptyState>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Archive(props: PageProps) {
  const [filter, setFilter] = useState<
    "all" | "elections" | "laws" | "events" | "leadership"
  >("all");
  const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const leadership = Object.values(props.snap.partyContests).filter((c) => c.winnerId);
  const events = props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-40).reverse();

  return (
    <div>
      <PageHeader kicker="History" title="Archive" subtitle="Political history drawn from public records." />
      <TabBar
        tabs={[
          { id: "all", label: "All" },
          { id: "elections", label: "Elections" },
          { id: "laws", label: "Laws" },
          { id: "leadership", label: "Leadership" },
          { id: "events", label: "Events" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {(filter === "all" || filter === "elections") && elections.length > 0 ? (
        <SectionCard title="Elections">
          {elections.map((e) => (
            <div key={e.id}>
              {electionDisplayName(e.id)} won by{" "}
              {e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}
            </div>
          ))}
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
