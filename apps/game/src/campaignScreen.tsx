import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  activeRaceCampaigns,
  isDeclaredContestCandidate,
  politiciansAreActiveRaceRivals,
  shouldHoldDebate,
  type Command,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { groundGameStrength, playerCampaign, playerOffices } from "./format.js";
import {
  campaignTypeLabel,
  constituencyDisplayName,
  eventDisplay,
  issueDisplayName,
  partyDisplayName,
  politicianDisplayName,
  pollShareLine,
  type PresentationCatalog,
} from "./presentation.js";
import { latestPublicPoll } from "./map/fills.js";
import {
  ActivityFeedItem,
  EmptyState,
  EntityRow,
  PageHeader,
  SectionCard,
  SectionDivider,
  StatusBadge,
} from "./ui/kit.js";
import { PoliticianCard, PoliticianProfile } from "./ui/politician.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import { mapFillFor } from "./map/fills.js";

const AD_SPENDS = [5_000, 10_000, 25_000, 50_000, 100_000];
type ActionKind = "visit" | "organize" | "advertise" | "message" | "attack" | "endorsement" | null;

function run(
  sim: Simulation,
  command: Command,
  report: (r: CommandResult) => boolean,
  onDone: () => void,
) {
  report(sim.executeCommand(command));
  onDone();
}

function ActionDrawer(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="action-drawer-backdrop" onClick={props.onClose}>
      <div
        className="action-drawer"
        role="dialog"
        aria-label={props.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="action-drawer-head">
          <h3>{props.title}</h3>
          <button type="button" className="btn quiet" onClick={props.onClose}>
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function CampaignPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  bundle: ContentBundle;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
}) {
  const c = playerCampaign(props.snap);
  const [activeAction, setActiveAction] = useState<ActionKind>(null);
  const [visitKind, setVisitKind] = useState<"national" | "province" | "constituency">("national");
  const [visitId, setVisitId] = useState("");
  const [orgKind, setOrgKind] = useState<"province" | "constituency">("province");
  const [orgId, setOrgId] = useState(props.world.provinceIds[0] ?? "");
  const [adType, setAdType] = useState<"positive" | "contrast" | "negative">("positive");
  const [adIssue, setAdIssue] = useState(props.world.issueIds[0] ?? "");
  const [adGeo, setAdGeo] = useState<"national" | "province" | "constituency">("national");
  const [adGeoId, setAdGeoId] = useState("");
  const [adTarget, setAdTarget] = useState("");
  const [adSpend, setAdSpend] = useState(5_000);
  const [messageIssue, setMessageIssue] = useState(props.world.issueIds[0] ?? "");
  const [attackTarget, setAttackTarget] = useState("");
  const [attackIssue, setAttackIssue] = useState(props.world.issueIds[0] ?? "");
  const [endorserQuery, setEndorserQuery] = useState("");
  const [endorserId, setEndorserId] = useState<string | null>(null);
  const [mapSel, setMapSel] = useState<MapSelection | null>(null);
  const [hoverSel, setHoverSel] = useState<MapSelection | null>(null);
  const [mapScale, setMapScale] = useState<"province" | "constituency">("province");
  const contest = c?.contestId ? props.snap.partyContests[c.contestId] : null;
  const assemblyIncompatible = Object.values(props.snap.officeTerms).some((term) => {
    if (
      term.holderId !== props.snap.playerPoliticianId ||
      (term.status !== "active" && term.status !== "suspended")
    ) {
      return false;
    }
    const kind = props.world.offices[term.officeId]?.kind;
    return kind === "president" || kind === "governor" || kind === "constitutional_court_justice";
  });
  const assemblyElection = Object.values(props.snap.elections)
    .filter(
      (e) =>
        e.type === "assembly" &&
        e.geographyKind === "national" &&
        e.assembly?.filingStatus === "open" &&
        !assemblyIncompatible &&
        !e.assembly.decisions[props.snap.playerPoliticianId],
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  const incumbentConstituency = Object.values(props.snap.officeTerms)
    .filter(
      (term) =>
        term.holderId === props.snap.playerPoliticianId &&
        (term.status === "active" || term.status === "suspended"),
    )
    .map((term) => props.world.offices[term.officeId])
    .find((office) => office?.kind === "assembly_member")?.constituencyId;
  const preferredConstituency = useMemo(() => {
    if (incumbentConstituency) return incumbentConstituency;
    const home = props.world.politicianHomeProvince[props.snap.playerPoliticianId];
    return Object.keys(props.world.constituencyElectorate)
      .sort((a, b) => {
        const share = (id: string) =>
          props.world.constituencyElectorate[id]?.provincePopulationShares.find(
            (row) => row.provinceId === home,
          )?.share ?? 0;
        return share(b) - share(a) || a.localeCompare(b);
      })[0];
  }, [incumbentConstituency, props.snap.playerPoliticianId, props.world]);
  const [filingConstituency, setFilingConstituency] = useState(preferredConstituency ?? "");

  useEffect(() => {
    if (c?.type !== "assembly" || !c.constituencyId) return;
    setVisitKind("constituency");
    setOrgKind("constituency");
    setVisitId(c.constituencyId);
    setOrgId(c.constituencyId);
    setAdGeo("constituency");
    setAdGeoId(c.constituencyId);
  }, [c?.constituencyId, c?.type]);

  const endorsers = useMemo(() => {
    if (!c || !contest) return [];
    const q = endorserQuery.trim().toLowerCase();
    return Object.keys(props.snap.politicians)
      .filter((id) => {
        if (id === c.politicianId || id === props.snap.playerPoliticianId) return false;
        const pol = props.snap.politicians[id];
        if (!pol?.alive || pol.retired) return false;
        if (pol.partyId !== contest.partyId) return false;
        if (isDeclaredContestCandidate(contest, id)) return false;
        if (politiciansAreActiveRaceRivals(props.snap, id, c.politicianId)) return false;
        if (!q) return true;
        const hay =
          `${politicianDisplayName(props.catalog, id)} ${partyDisplayName(props.world, pol.partyId, props.snap)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a).localeCompare(
          politicianDisplayName(props.catalog, b),
        ),
      )
      .slice(0, 24);
  }, [c, contest, endorserQuery, props.catalog, props.snap, props.world]);

  if (!c) {
    const currentPresidential = Object.values(props.snap.elections)
      .filter(
        (e) =>
          e.type === "presidential" &&
          e.status !== "resolved" &&
          e.status !== "cancelled" &&
          e.date >= props.snap.currentDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
    const open = Object.values(props.snap.partyContests).find(
      (x) =>
        x.partyId === props.snap.politicians[props.snap.playerPoliticianId]?.partyId &&
        x.type === "presidential_nomination" &&
        x.metadata.electionId === currentPresidential?.id &&
        (x.status === "open" ||
          x.status === "qualification" ||
          (x.status === "planned" && x.metadata.candidateSource === "scenario_start")),
    );
    return (
      <div className="page-tone-campaign">
        <PageHeader
          kicker="War room"
          title="Campaign"
          subtitle="You are not running an active campaign."
        />
        {assemblyElection ? (
          <SectionCard title={incumbentConstituency ? "Seek reelection" : "Run for the Assembly"}>
            <p className="muted">
              Filing closes {assemblyElection.assembly!.filingDeadlineDate}. Filing creates a real
              constituency candidacy and opens your Assembly campaign.
            </p>
            <div className="form-stack filing-controls">
              <label>
                Constituency
                <select
                  value={filingConstituency || preferredConstituency}
                  disabled={Boolean(incumbentConstituency)}
                  onChange={(event) => setFilingConstituency(event.target.value)}
                >
                  {(incumbentConstituency
                    ? [incumbentConstituency]
                    : Object.keys(props.world.constituencyElectorate).sort()
                  ).map((id) => (
                    <option key={id} value={id}>
                      {constituencyDisplayName(props.catalog, id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    run(
                      props.sim,
                      {
                        type: "FILE_ASSEMBLY_CANDIDACY",
                        electionId: assemblyElection.id,
                        constituencyId: filingConstituency || preferredConstituency!,
                      },
                      props.report,
                      props.onDone,
                    )
                  }
                >
                  File candidacy
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    run(
                      props.sim,
                      { type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id },
                      props.report,
                      props.onDone,
                    )
                  }
                >
                  Do not run
                </button>
              </div>
            </div>
          </SectionCard>
        ) : null}
        {open ? (
          <SectionCard title="Enter the race">
            <p className="muted">
              {contest ? "A nomination contest is open in your party." : "Declare when you are ready."}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() =>
                run(
                  props.sim,
                  {
                    type: "DECLARE_CAMPAIGN",
                    politicianId: props.snap.playerPoliticianId,
                    campaignType: "presidential_nomination",
                    contestId: open.id,
                  },
                  props.report,
                  props.onDone,
                )
              }
            >
              Explore / declare candidacy
            </button>
          </SectionCard>
        ) : !assemblyElection ? (
          <EmptyState>No open nomination contest is available to join right now.</EmptyState>
        ) : null}
      </div>
    );
  }

  const rivals = activeRaceCampaigns(props.snap, c);
  const provinces = props.world.provinceIds;
  const constituencies =
    c.type === "assembly" && c.constituencyId
      ? [c.constituencyId]
      : Object.keys(props.world.constituencyElectorate).sort();
  const issues = props.world.issueIds;
  const spendOptions = AD_SPENDS.filter((n) => n <= Math.floor(c.cashOnHand));
  const showDebate = shouldHoldDebate(props.snap.currentDate, c.type);
  const noActions = c.actionPointsRemaining <= 0;
  const playerPol = props.snap.politicians[props.snap.playerPoliticianId];
  const campaignElectionDate =
    (c.electionId ? props.snap.elections[c.electionId]?.date : null) ??
    (c.electionId ? props.snap.provincialRuntime.elections[c.electionId]?.date : null) ??
    (typeof contest?.metadata.electionDate === "string" ? contest.metadata.electionDate : null);
  const gubernatorialRace = c.electionId
    ? props.snap.provincialRuntime.elections[c.electionId]
    : null;
  const raceDescription = c.type === "presidential_nomination"
    ? `${partyDisplayName(props.world, playerPol?.partyId ?? null, props.snap)} nomination · National`
    : c.type === "presidential_general"
      ? "President of Terena · National"
      : c.type === "assembly" && c.constituencyId
        ? `National Assembly · ${constituencyDisplayName(props.catalog, c.constituencyId)}`
        : c.type === "gubernatorial" && gubernatorialRace
          ? `Governor · ${props.catalog.places.get(gubernatorialRace.provinceId)?.name ?? gubernatorialRace.provinceId}`
          : "Political campaign";
  const poll = latestPublicPoll(props.snap);
  const recentActivity = props.snap.history
    .filter((e) =>
      e.type.startsWith("CAMPAIGN_") ||
      e.type.startsWith("ENDORSEMENT_") ||
      e.type === "POLL_PUBLISHED" ||
      e.type === "DEBATE_HELD",
    )
    .slice(-8)
    .reverse();

  function geoOptions(kind: "national" | "province" | "constituency") {
    if (kind === "national") return [] as string[];
    if (kind === "province") return provinces;
    return constituencies;
  }

  function openAction(kind: ActionKind) {
    if (noActions && kind !== null) return;
    setActiveAction(kind);
  }

  const actionBtn = (kind: ActionKind, label: string, disabled = false) => (
    <button
      type="button"
      className="campaign-action-btn"
      disabled={noActions || disabled}
      title={noActions ? "No campaign actions remaining this month" : undefined}
      onClick={() => openAction(kind)}
    >
      {label}
    </button>
  );

  const focus = mapSel ?? hoverSel;

  return (
    <div className="campaign-page page-tone-campaign">
      <PageHeader
        kicker="Command center"
        title={campaignTypeLabel(c.type).replace(/^./, (letter) => letter.toUpperCase())}
        subtitle={`${raceDescription} · Election ${campaignElectionDate ?? "upcoming"}`}
        actions={<StatusBadge tone={noActions ? "warn" : "ok"}>{c.status}</StatusBadge>}
      />

      <div className="campaign-command-v5">
        <aside className="campaign-left">
          <PoliticianProfile
            catalog={props.catalog}
            world={props.world}
            state={props.snap}
            politicianId={props.snap.playerPoliticianId}
            {...(playerOffices(props.world, props.snap, props.snap.playerPoliticianId)[0]
              ? { office: playerOffices(props.world, props.snap, props.snap.playerPoliticianId)[0] }
              : {})}
            party={partyDisplayName(props.world, playerPol?.partyId ?? null, props.snap)}
          />
          <SectionDivider title="Resources" />
          <div className="campaign-stats">
            <div>
              <div className="kicker">Cash</div>
              <strong>{Math.round(c.cashOnHand).toLocaleString()}</strong>
            </div>
            <div>
              <div className="kicker">Ground Game</div>
              <strong>{groundGameStrength(c.fieldOrganization)}/100</strong>
            </div>
            <div>
              <div className="kicker">AP</div>
              <strong className={noActions ? "text-warn" : ""}>
                {c.actionPointsRemaining}/{c.actionPointsMax}
              </strong>
            </div>
          </div>
          {noActions ? (
            <p className="muted campaign-actions-note">Monthly actions spent. End turn to refresh.</p>
          ) : null}
          <SectionDivider title="Rivals" {...(rivals.length ? {} : { hint: "No active rivals" })} />
          {rivals.length === 0 ? <EmptyState>Field is clear for now.</EmptyState> : null}
          {rivals.slice(0, 6).map((r) => (
            <EntityRow
              key={r.politicianId}
              title={politicianDisplayName(props.catalog, r.politicianId)}
              meta={partyDisplayName(
                props.world,
                props.snap.politicians[r.politicianId]?.partyId ?? null,
                props.snap,
              )}
              status={<StatusBadge>Rival</StatusBadge>}
            />
          ))}
        </aside>

        <div className="campaign-center">
          <div className="map-scale-switch" aria-label="Campaign map scale">
            <button
              type="button"
              className={mapScale === "province" ? "active" : ""}
              onClick={() => {
                setMapScale("province");
                setMapSel(null);
              }}
            >
              Provinces
            </button>
            <button
              type="button"
              className={mapScale === "constituency" ? "active" : ""}
              onClick={() => {
                setMapScale("constituency");
                setMapSel(null);
              }}
            >
              Constituencies
            </button>
          </div>
          <TerenaMap
            bundle={props.bundle}
            mode="campaign"
            selectedId={mapSel?.id ?? null}
            showConstituencies={mapScale === "constituency"}
            fillFor={(f, kind) =>
              mapFillFor(
                "campaign",
                props.world,
                props.snap,
                f,
                kind,
                c.organizationByConstituency,
                c.organizationByProvince,
              )
            }
            onSelect={setMapSel}
            onHover={setHoverSel}
            tooltipFor={(selection) => (
              <>
                <strong>{selection.name}</strong>
                <span>
                  {selection.kind === "province"
                    ? `Provincial Ground Game ${groundGameStrength(c.organizationByProvince[selection.id])}/100`
                    : selection.kind === "constituency"
                      ? `Constituency Ground Game ${groundGameStrength(c.organizationByConstituency[selection.id])}/100`
                      : "Campaign location"}
                </span>
              </>
            )}
          />
          <MapLegend mode="campaign" world={props.world} />
          {focus ? (
            <p className="map-selection-note">
              {focus.name}
              {focus.kind === "constituency"
                ? ` · Ground Game ${groundGameStrength(c.organizationByConstituency[focus.id])}/100`
                : focus.kind === "province"
                  ? ` · Ground Game ${groundGameStrength(c.organizationByProvince[focus.id])}/100`
                  : ""}
            </p>
          ) : (
            <EmptyState>Your Ground Game strength — not latent voter support.</EmptyState>
          )}
        </div>

        <aside className="campaign-right">
          <SectionDivider title="Actions" hint="1 AP each" />
          <div className="campaign-actions-grid">
            {actionBtn("visit", "Visit")}
            {actionBtn("organize", "Organize")}
            {actionBtn("advertise", "Advertise")}
            <button
              type="button"
              className="campaign-action-btn"
              disabled={noActions}
              title={noActions ? "No campaign actions remaining this month" : undefined}
              onClick={() =>
                run(
                  props.sim,
                  { type: "CAMPAIGN_FUNDRAISE", campaignId: c.id },
                  props.report,
                  props.onDone,
                )
              }
            >
              Fundraise
            </button>
            {actionBtn("message", "Message")}
            {actionBtn("endorsement", "Endorse", !contest)}
          </div>
          <SectionDivider title="Utilities" />
          <div className="row campaign-util">
            {c.type === "presidential_nomination" ? (
              <button
                type="button"
                className="btn secondary"
                disabled={noActions}
                onClick={() =>
                  run(
                    props.sim,
                    { type: "CAMPAIGN_SEEK_NOMINATION_SUPPORT", campaignId: c.id },
                    props.report,
                    props.onDone,
                  )
                }
              >
                Seek support
              </button>
            ) : null}
            {actionBtn("attack", "Attack", rivals.length === 0)}
            {showDebate ? (
              <button
                type="button"
                className="btn secondary"
                disabled={noActions}
                onClick={() =>
                  run(
                    props.sim,
                    { type: "CAMPAIGN_PREPARE_DEBATE", campaignId: c.id },
                    props.report,
                    props.onDone,
                  )
                }
              >
                Debate prep
              </button>
            ) : null}
            <button
              type="button"
              className="btn danger quiet"
              onClick={() =>
                props.askConfirm({
                  title: "Withdraw campaign",
                  body: "This ends your campaign. You cannot undo it.",
                  confirmLabel: "Withdraw",
                  action: () =>
                    run(
                      props.sim,
                      { type: "WITHDRAW_CAMPAIGN", campaignId: c.id },
                      props.report,
                      props.onDone,
                    ),
                })
              }
            >
              Withdraw
            </button>
          </div>
        </aside>
      </div>

      <div className="campaign-footer">
        <SectionDivider title="Recent campaign activity" />
        {recentActivity.length === 0 ? (
          <EmptyState>No recent campaign events in the public record.</EmptyState>
        ) : (
          recentActivity.map((e) => (
            <ActivityFeedItem
              key={e.id}
              date={e.date}
              text={eventDisplay(props.catalog, props.world, props.snap, e)}
            />
          ))
        )}
        <SectionDivider title="Public polls" hint="Published first-preference shares only" />
        {poll ? (
          <p className="muted">
            {poll.publicationDate}:{" "}
            {pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)}
          </p>
        ) : (
          <EmptyState>No public poll has been published yet.</EmptyState>
        )}
      </div>

      {activeAction === "visit" ? (
        <ActionDrawer title="Visit" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Area
              <select
                value={visitKind}
                onChange={(e) => setVisitKind(e.target.value as typeof visitKind)}
              >
                {c.type !== "assembly" ? <option value="national">Nationwide</option> : null}
                {c.type !== "assembly" ? <option value="province">Province</option> : null}
                <option value="constituency">Constituency</option>
              </select>
            </label>
            {visitKind !== "national" ? (
              <label>
                Place
                <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
                  <option value="">Choose</option>
                  {geoOptions(visitKind).map((id) => (
                    <option key={id} value={id}>
                      {constituencyDisplayName(props.catalog, id)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={visitKind !== "national" && !visitId}
              onClick={() => {
                run(
                  props.sim,
                  {
                    type: "CAMPAIGN_VISIT",
                    campaignId: c.id,
                    geographyKind: visitKind,
                    ...(visitKind === "national" ? {} : { geographyId: visitId }),
                  },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Visit (1 AP)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "organize" ? (
        <ActionDrawer title="Organize" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Level
              <select
                value={orgKind}
                disabled={c.type === "assembly"}
                onChange={(event) => {
                  const kind = event.target.value as typeof orgKind;
                  setOrgKind(kind);
                  setOrgId(kind === "province" ? (provinces[0] ?? "") : (constituencies[0] ?? ""));
                }}
              >
                {c.type !== "assembly" ? <option value="province">Province</option> : null}
                <option value="constituency">Constituency</option>
              </select>
            </label>
            <label>
              {orgKind === "province" ? "Province" : "Constituency"}
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                {(orgKind === "province" ? provinces : constituencies).map((id) => (
                  <option key={id} value={id}>
                    {constituencyDisplayName(props.catalog, id)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={!orgId}
              onClick={() => {
                run(
                  props.sim,
                  {
                    type: "CAMPAIGN_ORGANIZE",
                    campaignId: c.id,
                    geographyKind: orgKind,
                    geographyId: orgId,
                  },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Organize (1 AP)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "advertise" ? (
        <ActionDrawer title="Advertise" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Type
              <select value={adType} onChange={(e) => setAdType(e.target.value as typeof adType)}>
                <option value="positive">Positive</option>
                <option value="contrast">Contrast</option>
                <option value="negative">Negative</option>
              </select>
            </label>
            <label>
              Issue
              <select value={adIssue} onChange={(e) => setAdIssue(e.target.value)}>
                {issues.map((id) => (
                  <option key={id} value={id}>
                    {issueDisplayName(props.catalog, id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Area
              <select value={adGeo} onChange={(e) => setAdGeo(e.target.value as typeof adGeo)}>
                {c.type !== "assembly" ? <option value="national">Nationwide</option> : null}
                {c.type !== "assembly" ? <option value="province">Province</option> : null}
                <option value="constituency">Constituency</option>
              </select>
            </label>
            {adGeo !== "national" ? (
              <label>
                Place
                <select value={adGeoId} onChange={(e) => setAdGeoId(e.target.value)}>
                  <option value="">Choose</option>
                  {geoOptions(adGeo).map((id) => (
                    <option key={id} value={id}>
                      {constituencyDisplayName(props.catalog, id)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {adType !== "positive" ? (
              <label>
                Rival
                <select value={adTarget} onChange={(e) => setAdTarget(e.target.value)}>
                  <option value="">Choose</option>
                  {rivals.map((r) => (
                    <option key={r.politicianId} value={r.politicianId}>
                      {politicianDisplayName(props.catalog, r.politicianId)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Spend
              <select value={String(adSpend)} onChange={(e) => setAdSpend(Number(e.target.value))}>
                {spendOptions.length === 0 ? <option value="0">Not enough cash</option> : null}
                {spendOptions.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={
                spendOptions.length === 0 ||
                (adGeo !== "national" && !adGeoId) ||
                (adType !== "positive" && !adTarget)
              }
              onClick={() => {
                run(
                  props.sim,
                  {
                    type: "CAMPAIGN_ADVERTISE",
                    campaignId: c.id,
                    spend: adSpend,
                    messageType: adType,
                    geographyKind: adGeo,
                    issueId: adIssue || null,
                    ...(adGeo === "national" ? {} : { geographyId: adGeoId }),
                    ...(adType === "positive" ? {} : { targetPoliticianId: adTarget }),
                  },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Run ad (1 AP)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "message" ? (
        <ActionDrawer title="Message" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Issue
              <select value={messageIssue} onChange={(e) => setMessageIssue(e.target.value)}>
                {issues.map((id) => (
                  <option key={id} value={id}>
                    {issueDisplayName(props.catalog, id)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={!messageIssue}
              onClick={() => {
                run(
                  props.sim,
                  { type: "CAMPAIGN_MESSAGE", campaignId: c.id, issueId: messageIssue },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Emphasize (1 AP)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "attack" ? (
        <ActionDrawer title="Attack" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Rival
              <select value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)}>
                <option value="">Choose</option>
                {rivals.map((r) => (
                  <option key={r.politicianId} value={r.politicianId}>
                    {politicianDisplayName(props.catalog, r.politicianId)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Issue
              <select value={attackIssue} onChange={(e) => setAttackIssue(e.target.value)}>
                {issues.map((id) => (
                  <option key={id} value={id}>
                    {issueDisplayName(props.catalog, id)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={!attackTarget}
              onClick={() => {
                run(
                  props.sim,
                  {
                    type: "CAMPAIGN_ATTACK",
                    campaignId: c.id,
                    targetPoliticianId: attackTarget,
                    issueId: attackIssue || null,
                  },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Attack (1 AP)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "endorsement" && contest ? (
        <ActionDrawer title="Endorsement" onClose={() => setActiveAction(null)}>
          <p className="muted">Active rivals cannot endorse you.</p>
          <input
            className="search"
            placeholder="Search"
            value={endorserQuery}
            onChange={(e) => setEndorserQuery(e.target.value)}
          />
          <div className="politician-card-grid">
            {endorsers.map((id) => (
              <PoliticianCard
                key={id}
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={id}
                {...(playerOffices(props.world, props.snap, id)[0]
                  ? { office: playerOffices(props.world, props.snap, id)[0] }
                  : {})}
                selected={endorserId === id}
                compact
                onSelect={() => setEndorserId(id)}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!endorserId}
            onClick={() => {
              if (!endorserId) return;
              run(
                props.sim,
                {
                  type: "CAMPAIGN_SEEK_ENDORSEMENT",
                  campaignId: c.id,
                  endorserId,
                },
                props.report,
                props.onDone,
              );
              setActiveAction(null);
            }}
          >
            Ask (1 AP)
          </button>
        </ActionDrawer>
      ) : null}
    </div>
  );
}
