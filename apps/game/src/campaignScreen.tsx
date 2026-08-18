import { useMemo, useState, type ReactNode } from "react";
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
import { playerCampaign, playerOffices } from "./format.js";
import {
  campaignTypeLabel,
  constituencyDisplayName,
  issueDisplayName,
  partyDisplayName,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import { EmptyState, PageHeader, SectionCard } from "./ui/kit.js";
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
  const [orgId, setOrgId] = useState(Object.keys(props.world.constituencyElectorate)[0] ?? "");
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
  const contest = c?.contestId ? props.snap.partyContests[c.contestId] : null;

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
    const open = Object.values(props.snap.partyContests).find(
      (x) =>
        x.partyId === props.snap.politicians[props.snap.playerPoliticianId]?.partyId &&
        x.type === "presidential_nomination" &&
        (x.status === "open" || x.status === "planned" || x.status === "qualification"),
    );
    return (
      <div>
        <PageHeader
          kicker="War room"
          title="Campaign"
          subtitle="You are not running an active campaign."
        />
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
        ) : (
          <EmptyState>No open nomination contest is available to join right now.</EmptyState>
        )}
      </div>
    );
  }

  const rivals = activeRaceCampaigns(props.snap, c);
  const provinces = props.world.provinceIds;
  const constituencies = Object.keys(props.world.constituencyElectorate).sort();
  const issues = props.world.issueIds;
  const spendOptions = AD_SPENDS.filter((n) => n <= Math.floor(c.cashOnHand));
  const showDebate = shouldHoldDebate(props.snap.currentDate, c.type);
  const noActions = c.actionPointsRemaining <= 0;
  const playerPol = props.snap.politicians[props.snap.playerPoliticianId];

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

  return (
    <div className="campaign-page">
      <PageHeader kicker="Command center" title={campaignTypeLabel(c.type)} />
      <div className="campaign-command">
        <div className="campaign-map-pane">
          <TerenaMap
            bundle={props.bundle}
            mode="campaign"
            selectedId={mapSel?.id ?? null}
            fillFor={(f, kind) =>
              mapFillFor("campaign", props.world, props.snap, f, kind, c.organizationByConstituency)
            }
            onSelect={setMapSel}
            onHover={setHoverSel}
          />
          <MapLegend mode="campaign" world={props.world} />
          {(mapSel ?? hoverSel) ? (
            <p className="map-selection-note">
              {(mapSel ?? hoverSel)!.name}
              {(mapSel ?? hoverSel)!.kind === "constituency"
                ? ` · org ${(c.organizationByConstituency[(mapSel ?? hoverSel)!.id] ?? 0).toFixed(2)}`
                : ""}
            </p>
          ) : (
            <EmptyState>Field organization you control — not latent voter support.</EmptyState>
          )}
        </div>
        <aside className="campaign-panel">
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
          <div className="campaign-stats">
            <div>
              <div className="kicker">Cash on hand</div>
              <strong>{Math.round(c.cashOnHand).toLocaleString()}</strong>
            </div>
            <div>
              <div className="kicker">Field org</div>
              <strong>{c.fieldOrganization.toFixed(2)}</strong>
            </div>
            <div>
              <div className="kicker">Actions</div>
              <strong className={noActions ? "text-warn" : ""}>
                {c.actionPointsRemaining} / {c.actionPointsMax}
              </strong>
            </div>
          </div>
          {noActions ? (
            <p className="muted campaign-actions-note">
              All monthly campaign actions used. End Turn to refresh next month.
            </p>
          ) : null}
          <div className="campaign-actions-grid">
            {actionBtn("visit", "Visit")}
            {actionBtn("organize", "Organize")}
            {actionBtn("advertise", "Advertise")}
            {actionBtn("message", "Message")}
            {actionBtn("attack", "Attack", rivals.length === 0)}
            {actionBtn("endorsement", "Endorsement", !contest)}
          </div>
          <div className="row campaign-util">
            <button
              type="button"
              className="btn secondary"
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
                Prepare debate
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
          {rivals.length > 0 ? (
            <SectionCard title="Active rivals">
              {rivals.slice(0, 5).map((r) => (
                <PoliticianCard
                  key={r.politicianId}
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={r.politicianId}
                  compact
                />
              ))}
            </SectionCard>
          ) : null}
        </aside>
      </div>

      {activeAction === "visit" ? (
        <ActionDrawer title="Campaign visit" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Geography
              <select
                value={visitKind}
                onChange={(e) => setVisitKind(e.target.value as typeof visitKind)}
              >
                <option value="national">Nationwide</option>
                <option value="province">Province</option>
                <option value="constituency">Constituency</option>
              </select>
            </label>
            {visitKind !== "national" ? (
              <label>
                Place
                <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
                  <option value="">Choose place</option>
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
              Conduct visit (1 action)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "organize" ? (
        <ActionDrawer title="Field organization" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Constituency
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                {constituencies.map((id) => (
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
                  { type: "CAMPAIGN_ORGANIZE", campaignId: c.id, constituencyId: orgId },
                  props.report,
                  props.onDone,
                );
                setActiveAction(null);
              }}
            >
              Organize (1 action)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "advertise" ? (
        <ActionDrawer title="Advertising" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Message type
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
              Geography
              <select value={adGeo} onChange={(e) => setAdGeo(e.target.value as typeof adGeo)}>
                <option value="national">Nationwide</option>
                <option value="province">Province</option>
                <option value="constituency">Constituency</option>
              </select>
            </label>
            {adGeo !== "national" ? (
              <label>
                Place
                <select value={adGeoId} onChange={(e) => setAdGeoId(e.target.value)}>
                  <option value="">Choose place</option>
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
                Target rival
                <select value={adTarget} onChange={(e) => setAdTarget(e.target.value)}>
                  <option value="">Choose rival</option>
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
              Run ad (1 action)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "message" ? (
        <ActionDrawer title="Issue message" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Emphasize issue
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
              Emphasize (1 action)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "attack" ? (
        <ActionDrawer title="Attack rival" onClose={() => setActiveAction(null)}>
          <div className="form-stack">
            <label>
              Target
              <select value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)}>
                <option value="">Choose rival</option>
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
              Attack (1 action)
            </button>
          </div>
        </ActionDrawer>
      ) : null}

      {activeAction === "endorsement" && contest ? (
        <ActionDrawer title="Seek endorsement" onClose={() => setActiveAction(null)}>
          <p className="muted">Active rivals in this race cannot endorse you.</p>
          <input
            className="search"
            placeholder="Search eligible politicians"
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
            Ask for endorsement (1 action)
          </button>
        </ActionDrawer>
      ) : null}
    </div>
  );
}
