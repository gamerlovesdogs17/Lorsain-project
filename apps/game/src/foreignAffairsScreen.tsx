import { useMemo, useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  TERENA_WORLD_ID,
  bilateralKey,
  type Command,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { isPresident } from "./format.js";
import {
  countryDisplayName,
  countryRecentEvents,
  crisisStageLabel,
  diplomaticActionLabel,
  eventDisplay,
  foreignPresidentialActionLabel,
  institutionDisplayName,
  latentStrategicTensions,
  militaryPostureLabel,
  powerTierLabel,
  publicActiveCrises,
  publicSeverityLabel,
  resolveCountryLeaderDisplay,
  terenaBilateralRelationLabel,
  treatyStatusLabel,
  treatyTypeLabel,
  type PresentationCatalog,
} from "./presentation.js";
import { formatPublicPercent } from "./presentation/display.js";
import {
  ActivityFeedItem,
  EmptyState,
  MetricStrip,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  TabBar,
} from "./ui/kit.js";
import { WorldMap, type WorldMapMode } from "./map/WorldMap.js";
import { worldFillFor, worldLegendItems } from "./map/worldFills.js";

const MAX_DIPLOMATIC_ACTIONS_PER_MONTH = 2;

const TREATY_KINDS = [
  "trade",
  "non_aggression",
  "mutual_defense",
  "collective_security",
  "sanctions_coordination",
] as const;

const POSTURES = ["normal", "heightened", "mobilized", "crisis_deployment"] as const;

type DrawerKind =
  | "outreach"
  | "summit"
  | "treaty"
  | "trade"
  | "sanctions"
  | "lift_sanctions"
  | "alliance"
  | "posture"
  | "mediation"
  | "warning"
  | "incoming_diplomacy"
  | null;

function terenaSanctionsOn(state: SimState, targetId: string): boolean {
  return Object.values(state.foreignAffairsRuntime.sanctions).some(
    (s) => s.active && s.imposerId === TERENA_WORLD_ID && s.targetId === targetId,
  );
}

function sanctionsScopeLabel(severity: number): string {
  if (severity >= 0.75) return "comprehensive";
  if (severity >= 0.55) return "broad";
  if (severity >= 0.35) return "targeted";
  return "limited";
}

export function ForeignAffairsPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
}) {
  const { world, snap, sim, bundle, catalog } = props;
  const president = isPresident(world, snap, snap.playerPoliticianId);
  const [mode, setMode] = useState<WorldMapMode>("relation");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [treatyKind, setTreatyKind] = useState<string>("trade");
  const [treatyTitle, setTreatyTitle] = useState("");
  const [sanctionSeverity, setSanctionSeverity] = useState(0.45);
  const [posture, setPosture] = useState("normal");
  const [institutionId, setInstitutionId] = useState("INT_DC");
  const [crisisId, setCrisisId] = useState("");

  const [incomingActionIndex, setIncomingActionIndex] = useState(0);

  const runtime = snap.foreignAffairsRuntime;
  const capacityUsed = runtime.diplomaticActionsThisMonth;
  const capacityLeft = MAX_DIPLOMATIC_ACTIONS_PER_MONTH - capacityUsed;
  const publicCrises = useMemo(() => publicActiveCrises(snap), [snap]);
  const latentTensions = useMemo(() => latentStrategicTensions(snap), [snap]);
  const warTrigger = snap.executiveRuntime.warTrigger;
  const incomingDiplomacy = runtime.pendingPresidentialActions;
  const selectedCanonical = selectedId ? world.worldCountries[selectedId] : undefined;
  const selectedRuntime = selectedId ? runtime.countries[selectedId] : undefined;
  const selectedLeader = selectedId
    ? resolveCountryLeaderDisplay(world, snap, selectedId, catalog)
    : undefined;
  const relationKey =
    selectedId && selectedId !== TERENA_WORLD_ID ? bilateralKey(TERENA_WORLD_ID, selectedId) : null;
  const bilateral = relationKey ? runtime.bilateralRelations[relationKey] : undefined;

  const targetable =
    selectedId && selectedId !== TERENA_WORLD_ID && !!runtime.countries[selectedId];
  const terenaRuntime = runtime.countries[TERENA_WORLD_ID];
  const terenaInstitutions = terenaRuntime?.institutionIds ?? ["INT_DC"];
  const activeCrisisOptions = publicCrises.filter(
    (c) => c.stage === "active" || c.stage === "incident" || c.stage === "deescalating",
  );
  const selectedRecentEvents = selectedId ? countryRecentEvents(snap, selectedId) : [];
  const selectedCountryCrises = selectedId
    ? [...publicCrises, ...latentTensions].filter((c) => c.participantIds.includes(selectedId))
    : [];

  const diplomaticFeed = useMemo(
    () => Object.values(runtime.diplomaticActions).slice(-6).reverse(),
    [runtime.diplomaticActions],
  );

  const leadershipChanges = useMemo(
    () =>
      snap.history
        .filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE")
        .slice(-5)
        .reverse(),
    [snap.history],
  );

  const activeSanctions = useMemo(
    () => Object.values(runtime.sanctions).filter((s) => s.active),
    [runtime.sanctions],
  );

  function run(command: Parameters<Simulation["executeCommand"]>[0]) {
    props.report(sim.executeCommand(command));
    setDrawer(null);
    props.onDone();
  }

  function drawerNeedsTarget(kind: DrawerKind): boolean {
    return (
      kind === "outreach" ||
      kind === "summit" ||
      kind === "treaty" ||
      kind === "trade" ||
      kind === "sanctions" ||
      kind === "lift_sanctions" ||
      kind === "warning"
    );
  }

  return (
    <div className="foreign-affairs-page">
      <PageHeader
        kicker="International"
        title="Foreign Affairs"
        subtitle={
          president
            ? "Direct Terena's diplomacy on the world stage."
            : "Public diplomatic posture, treaties, and international developments."
        }
      />

      {president && warTrigger ? (
        <div className="briefing-urgent alert foreign-war-urgent">
          <strong>War powers required</strong>
          <p>
            International developments require a presidential war-powers decision. Seek Assembly
            authorization if unilateral authority expires.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() =>
              props.askConfirm({
                title: "Begin war powers",
                body: "Invoke presidential war powers in response to the international crisis?",
                confirmLabel: "Begin war powers",
                action: () => run({ type: "BEGIN_WAR_POWERS" }),
              })
            }
          >
            Begin war powers
          </button>
        </div>
      ) : null}

      {president && incomingDiplomacy.length > 0 ? (
        <div className="briefing-urgent alert foreign-incoming-diplomacy">
          <strong>Incoming diplomacy</strong>
          <p>{foreignPresidentialActionLabel(world, snap, incomingDiplomacy[0]!)}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setIncomingActionIndex(0);
              setDrawer("incoming_diplomacy");
            }}
          >
            Respond
          </button>
        </div>
      ) : null}

      <MetricStrip>
        <StatCard
          label="Diplomatic capacity"
          value={president ? `${capacityUsed}/${MAX_DIPLOMATIC_ACTIONS_PER_MONTH}` : "—"}
          hint={president ? `${capacityLeft} remaining this month` : "Presidential prerogative"}
        />
        <StatCard
          label="Active crises"
          value={String(publicCrises.length)}
          hint="Public international crises"
        />
        <StatCard
          label="Strategic tension"
          value={String(latentTensions.length)}
          hint="Background tensions not yet public crises"
        />
        <StatCard
          label="Active treaties"
          value={String(
            Object.values(runtime.treaties).filter((t) => t.status === "active").length,
          )}
        />
        <StatCard label="Active sanctions" value={String(activeSanctions.length)} />
        <StatCard
          label="Terena posture"
          value={militaryPostureLabel(terenaRuntime?.posture ?? "normal")}
        />
      </MetricStrip>

      <TabBar
        tabs={[
          { id: "relation", label: "Relations" },
          { id: "alliance", label: "Alliances" },
          { id: "crisis", label: "Crises" },
          { id: "sanctions", label: "Sanctions" },
          { id: "posture", label: "Posture" },
        ]}
        value={mode}
        onChange={setMode}
      />

      <div className="foreign-affairs-layout">
        <div className="foreign-detail-panel">
          <SectionCard title="Selected country">
            {selectedCanonical && selectedId ? (
              <>
                <strong className="serif-head">{selectedCanonical.name}</strong>
                {selectedId === TERENA_WORLD_ID ? (
                  <StatusBadge tone="ok">Home country</StatusBadge>
                ) : null}
                <div className="foreign-detail-grid">
                  <div>
                    <span className="kicker">Government</span>
                    <div>{selectedCanonical.government || "—"}</div>
                  </div>
                  <div>
                    <span className="kicker">Region</span>
                    <div>{selectedCanonical.region || "—"}</div>
                  </div>
                  <div>
                    <span className="kicker">Leader</span>
                    <div>
                      {selectedLeader ? `${selectedLeader.name}, ${selectedLeader.title}` : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="kicker">Power</span>
                    <div>{powerTierLabel(selectedCanonical.powerTier)}</div>
                  </div>
                  <div>
                    <span className="kicker">Alignment</span>
                    <div>{selectedCanonical.alignment || "Independent"}</div>
                  </div>
                  {selectedId !== TERENA_WORLD_ID ? (
                    <>
                      <div>
                        <span className="kicker">Relations with Terena</span>
                        <div>{terenaBilateralRelationLabel(world, snap, selectedId)}</div>
                        {bilateral ? (
                          <div className="muted">
                            Trust {formatPublicPercent(bilateral.trust)} · economic ties{" "}
                            {formatPublicPercent(bilateral.economicTies)}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <span className="kicker">Trade exposure</span>
                        <div>{formatPublicPercent(selectedRuntime?.tradeExposure ?? 0)}</div>
                      </div>
                      <div>
                        <span className="kicker">Military posture</span>
                        <div>{militaryPostureLabel(selectedRuntime?.posture ?? "normal")}</div>
                      </div>
                    </>
                  ) : null}
                </div>

                {selectedRuntime && selectedRuntime.institutionIds.length > 0 ? (
                  <div style={{ marginTop: "0.65rem" }}>
                    <span className="kicker">Institutions</span>
                    <div className="foreign-chip-row">
                      {selectedRuntime.institutionIds.map((id) => (
                        <StatusBadge key={id}>{institutionDisplayName(world, id)}</StatusBadge>
                      ))}
                    </div>
                    <div className="muted" style={{ marginTop: "0.35rem" }}>
                      World Assembly:{" "}
                      {selectedRuntime.institutionIds.includes("INT_WA")
                        ? "member"
                        : "not a member"}
                      {" · "}
                      Lorsain Trade Organization:{" "}
                      {selectedRuntime.institutionIds.includes("INT_LTO")
                        ? "member"
                        : "not a member"}
                    </div>
                  </div>
                ) : null}

                {selectedId !== TERENA_WORLD_ID ? (
                  <>
                    <div style={{ marginTop: "0.65rem" }}>
                      <span className="kicker">Treaties involving this country</span>
                      {Object.values(runtime.treaties)
                        .filter((t) => t.memberIds.includes(selectedId))
                        .slice(0, 6)
                        .map((t) => (
                          <div key={t.id} className="muted">
                            {t.title} · {treatyTypeLabel(t.kind)} · {treatyStatusLabel(t)}
                          </div>
                        ))}
                      {Object.values(runtime.treaties).every(
                        (t) => !t.memberIds.includes(selectedId),
                      ) ? (
                        <div className="muted">None on record.</div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "0.65rem" }}>
                      <span className="kicker">Sanctions</span>
                      {Object.values(runtime.sanctions)
                        .filter((s) => s.active && s.targetId === selectedId)
                        .map((s) => (
                          <div key={s.id} className="muted">
                            Imposed by {countryDisplayName(world, s.imposerId)} ·{" "}
                            {sanctionsScopeLabel(s.severity)} measures
                          </div>
                        ))}
                      {Object.values(runtime.sanctions).every(
                        (s) => !s.active || s.targetId !== selectedId,
                      ) ? (
                        <div className="muted">No active sanctions.</div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "0.65rem" }}>
                      <span className="kicker">Crises & tension</span>
                      {selectedCountryCrises.map((c) => (
                        <div key={c.id} className="muted">
                          {c.stage === "latent" ? "Strategic tension" : crisisStageLabel(c.stage)} ·{" "}
                          {publicSeverityLabel(c.intensity, c.stage)}
                        </div>
                      ))}
                      {selectedCountryCrises.length === 0 ? (
                        <div className="muted">No active crises or strategic tension.</div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "0.65rem" }}>
                      <span className="kicker">Recent developments</span>
                      {selectedRecentEvents.map((e) => (
                        <ActivityFeedItem
                          key={e.id}
                          date={e.date}
                          text={eventDisplay(catalog, world, snap, e)}
                        />
                      ))}
                      {selectedRecentEvents.length === 0 ? (
                        <div className="muted">No recent public events.</div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <EmptyState>Select a country on the map.</EmptyState>
            )}
          </SectionCard>
        </div>

        {president ? (
          <div className="foreign-actions-panel">
            <SectionCard title="Presidential diplomacy">
              {capacityLeft <= 0 ? (
                <p className="text-warn">Monthly diplomatic capacity exhausted (2/month).</p>
              ) : (
                <p className="muted">
                  {capacityLeft} presidential action{capacityLeft === 1 ? "" : "s"} remaining this
                  month.
                </p>
              )}
              <div className="foreign-action-grid">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("outreach")}
                >
                  Diplomatic outreach
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("summit")}
                >
                  Summit
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("treaty")}
                >
                  Negotiate treaty
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("trade")}
                >
                  Trade settlement
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("sanctions")}
                >
                  Impose sanctions
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={
                    !targetable ||
                    capacityLeft <= 0 ||
                    !selectedId ||
                    !terenaSanctionsOn(snap, selectedId)
                  }
                  onClick={() => setDrawer("lift_sanctions")}
                >
                  Lift sanctions
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={capacityLeft <= 0}
                  onClick={() => setDrawer("alliance")}
                >
                  Alliance consultation
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={capacityLeft <= 0}
                  onClick={() => setDrawer("posture")}
                >
                  Military posture
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={capacityLeft <= 0 || activeCrisisOptions.length === 0}
                  onClick={() => {
                    setCrisisId(activeCrisisOptions[0]?.id ?? "");
                    setDrawer("mediation");
                  }}
                >
                  Crisis mediation
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={!targetable || capacityLeft <= 0}
                  onClick={() => setDrawer("warning")}
                >
                  Diplomatic warning
                </button>
              </div>
              {!targetable && selectedId !== TERENA_WORLD_ID ? (
                <p className="muted">Select a foreign country to target bilateral actions.</p>
              ) : null}
            </SectionCard>
          </div>
        ) : null}

        <div className="foreign-map-panel">
          <WorldMap
            bundle={bundle}
            mode={mode}
            selectedId={selectedId}
            fillFor={(id) => worldFillFor(mode, world, snap, id)}
            onSelect={setSelectedId}
            tooltipFor={(id) => {
              const country = world.worldCountries[id];
              const countryRuntime = runtime.countries[id];
              const activeCountryCrises = publicCrises.filter((crisis) =>
                crisis.participantIds.includes(id),
              );
              const countrySanctions = activeSanctions.filter(
                (sanction) => sanction.targetId === id,
              );
              const detail =
                mode === "relation"
                  ? id === TERENA_WORLD_ID
                    ? "Home country"
                    : terenaBilateralRelationLabel(world, snap, id)
                  : mode === "alliance"
                    ? countryRuntime?.institutionIds
                        .map((institution) => institutionDisplayName(world, institution))
                        .join(" · ") ||
                      country?.alignment ||
                      "Independent"
                    : mode === "crisis"
                      ? activeCountryCrises.length
                        ? `${activeCountryCrises.length} active public crisis${activeCountryCrises.length === 1 ? "" : "es"}`
                        : "No active public crisis"
                      : mode === "sanctions"
                        ? countrySanctions.length
                          ? `${countrySanctions.length} active sanction${countrySanctions.length === 1 ? "" : "s"}`
                          : "No active sanctions"
                        : militaryPostureLabel(countryRuntime?.posture ?? "normal");
              return (
                <>
                  <strong>{countryDisplayName(world, id)}</strong>
                  <span>{detail}</span>
                </>
              );
            }}
          />
          <div className="map-legend">
            <div className="kicker">Legend</div>
            <div className="legend-items">
              {worldLegendItems(mode, world).map((item) => (
                <span key={item.label} className="legend-item">
                  <span className="swatch" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="foreign-global-panels">
        <SectionCard title="Active crises">
          {publicCrises.length === 0 ? (
            <EmptyState>No active international crises.</EmptyState>
          ) : null}
          {publicCrises.map((c) => (
            <div key={c.id} className="foreign-crisis-row">
              <StatusBadge tone={c.stage === "conflict" ? "warn" : "idle"}>
                {crisisStageLabel(c.stage)}
              </StatusBadge>
              <div>{c.participantIds.map((id) => countryDisplayName(world, id)).join(" · ")}</div>
              <div className="muted">
                Since {c.startedDate} · {publicSeverityLabel(c.intensity, c.stage)}
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Strategic tension">
          {latentTensions.length === 0 ? (
            <EmptyState>No background strategic tensions on record.</EmptyState>
          ) : null}
          {latentTensions.map((c) => (
            <div key={c.id} className="foreign-crisis-row foreign-tension-row">
              <StatusBadge tone="idle">Strategic tension</StatusBadge>
              <div>{c.participantIds.map((id) => countryDisplayName(world, id)).join(" · ")}</div>
              <div className="muted">
                Since {c.startedDate} · {publicSeverityLabel(c.intensity, c.stage)}
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Recent diplomatic changes">
          {diplomaticFeed.length === 0 ? (
            <EmptyState>No recent diplomatic actions.</EmptyState>
          ) : null}
          {diplomaticFeed.map((a) => (
            <div key={a.id} className="muted">
              {a.date} · {diplomaticActionLabel(a.kind)}
              {a.targetCountryId
                ? ` · ${countryDisplayName(world, a.targetCountryId)}`
                : a.metadata.institutionId
                  ? ` · ${institutionDisplayName(world, String(a.metadata.institutionId))}`
                  : ""}
              {a.initiator === "player" ? " · Terena initiative" : ""}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Sanctions in force">
          {activeSanctions.length === 0 ? (
            <EmptyState>No sanctions currently in force.</EmptyState>
          ) : null}
          {activeSanctions.slice(0, 8).map((s) => (
            <div key={s.id} className="muted">
              {countryDisplayName(world, s.imposerId)} → {countryDisplayName(world, s.targetId)} ·
              {sanctionsScopeLabel(s.severity)} measures
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Leadership changes abroad">
          {leadershipChanges.length === 0 ? (
            <EmptyState>No recent foreign leadership changes.</EmptyState>
          ) : null}
          {leadershipChanges.map((e) => (
            <ActivityFeedItem
              key={e.id}
              date={e.date}
              text={eventDisplay(catalog, world, snap, e)}
            />
          ))}
        </SectionCard>
      </div>

      {president && drawer ? (
        <div className="action-drawer-backdrop" onClick={() => setDrawer(null)}>
          <div
            className={`action-drawer${drawer === "incoming_diplomacy" ? " incoming-diplomacy-drawer" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="action-drawer-head">
              <h3>
                {drawer === "incoming_diplomacy"
                  ? "Respond to incoming diplomacy"
                  : drawer === "outreach"
                    ? "Diplomatic outreach"
                    : drawer === "summit"
                      ? "Summit"
                      : drawer === "treaty"
                        ? "Negotiate treaty"
                        : drawer === "trade"
                          ? "Trade settlement"
                          : drawer === "sanctions"
                            ? "Impose sanctions"
                            : drawer === "lift_sanctions"
                              ? "Lift sanctions"
                              : drawer === "alliance"
                                ? "Alliance consultation"
                                : drawer === "posture"
                                  ? "Military posture"
                                  : drawer === "mediation"
                                    ? "Crisis mediation"
                                    : "Diplomatic warning"}
              </h3>
              <button type="button" className="btn quiet" onClick={() => setDrawer(null)}>
                Close
              </button>
            </div>
            <div className="form-stack">
              {drawerNeedsTarget(drawer) && selectedId ? (
                <p>
                  Target: <strong>{countryDisplayName(world, selectedId)}</strong>
                </p>
              ) : null}
              {drawer === "incoming_diplomacy" && incomingDiplomacy[incomingActionIndex] ? (
                <>
                  <p>
                    {foreignPresidentialActionLabel(
                      world,
                      snap,
                      incomingDiplomacy[incomingActionIndex]!,
                    )}
                  </p>
                  {incomingDiplomacy.length > 1 ? (
                    <select
                      value={String(incomingActionIndex)}
                      onChange={(e) => setIncomingActionIndex(Number(e.target.value))}
                    >
                      {incomingDiplomacy.map((action, idx) => (
                        <option key={`${action.kind}-${action.targetCountryId ?? idx}`} value={idx}>
                          {foreignPresidentialActionLabel(world, snap, action)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="incoming-diplomacy-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const action = incomingDiplomacy[incomingActionIndex]!;
                        run({
                          type: "RESPOND_INCOMING_DIPLOMACY",
                          accept: true,
                          kind: action.kind,
                          targetCountryId: action.targetCountryId ?? undefined,
                        } as unknown as Command);
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        const action = incomingDiplomacy[incomingActionIndex]!;
                        run({
                          type: "RESPOND_INCOMING_DIPLOMACY",
                          accept: false,
                          kind: action.kind,
                          targetCountryId: action.targetCountryId ?? undefined,
                        } as unknown as Command);
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </>
              ) : null}
              {drawer === "treaty" ? (
                <>
                  <select value={treatyKind} onChange={(e) => setTreatyKind(e.target.value)}>
                    {TREATY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {treatyTypeLabel(k)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="search"
                    placeholder="Optional treaty title"
                    value={treatyTitle}
                    onChange={(e) => setTreatyTitle(e.target.value)}
                  />
                </>
              ) : null}
              {drawer === "sanctions" ? (
                <label>
                  Scope: {sanctionsScopeLabel(sanctionSeverity)}
                  <input
                    type="range"
                    min={0.2}
                    max={0.9}
                    step={0.05}
                    value={sanctionSeverity}
                    onChange={(e) => setSanctionSeverity(Number(e.target.value))}
                  />
                </label>
              ) : null}
              {drawer === "alliance" ? (
                <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
                  {terenaInstitutions.map((id) => (
                    <option key={id} value={id}>
                      {institutionDisplayName(world, id)}
                    </option>
                  ))}
                </select>
              ) : null}
              {drawer === "posture" ? (
                <select value={posture} onChange={(e) => setPosture(e.target.value)}>
                  {POSTURES.map((p) => (
                    <option key={p} value={p}>
                      {militaryPostureLabel(p)}
                    </option>
                  ))}
                </select>
              ) : null}
              {drawer === "mediation" ? (
                <select value={crisisId} onChange={(e) => setCrisisId(e.target.value)}>
                  {activeCrisisOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.participantIds.map((id) => countryDisplayName(world, id)).join(" – ")} (
                      {crisisStageLabel(c.stage)})
                    </option>
                  ))}
                </select>
              ) : null}
              {drawer !== "incoming_diplomacy" ? (
                <button
                  type="button"
                  className="btn"
                  disabled={
                    capacityLeft <= 0 ||
                    (drawerNeedsTarget(drawer) && !targetable) ||
                    (drawer === "mediation" && !crisisId)
                  }
                  onClick={() => {
                    if (drawer === "outreach" && selectedId) {
                      props.askConfirm({
                        title: "Diplomatic outreach",
                        body: `Extend outreach to ${countryDisplayName(world, selectedId)}? Uses 1 of ${MAX_DIPLOMATIC_ACTIONS_PER_MONTH} monthly actions.`,
                        confirmLabel: "Send outreach",
                        action: () =>
                          run({ type: "DIPLOMATIC_OUTREACH", targetCountryId: selectedId }),
                      });
                      return;
                    }
                    if (drawer === "summit" && selectedId) {
                      props.askConfirm({
                        title: "Summit",
                        body: `Hold a summit with ${countryDisplayName(world, selectedId)}?`,
                        confirmLabel: "Hold summit",
                        action: () =>
                          run({ type: "DIPLOMATIC_SUMMIT", targetCountryId: selectedId }),
                      });
                      return;
                    }
                    if (drawer === "treaty" && selectedId) {
                      props.askConfirm({
                        title: "Propose treaty",
                        body: `Propose a ${treatyTypeLabel(treatyKind)} with ${countryDisplayName(world, selectedId)}? The counterparty must accept before the agreement can take effect${treatyKind !== "trade" ? ", and the Assembly must ratify it" : ""}.`,
                        confirmLabel: "Propose",
                        action: () =>
                          run({
                            type: "PROPOSE_TREATY",
                            targetCountryId: selectedId,
                            kind: treatyKind,
                            ...(treatyTitle.trim() ? { title: treatyTitle.trim() } : {}),
                          }),
                      });
                      return;
                    }
                    if (drawer === "trade" && selectedId) {
                      run({ type: "NEGOTIATE_TRADE", targetCountryId: selectedId });
                      return;
                    }
                    if (drawer === "sanctions" && selectedId) {
                      props.askConfirm({
                        title: "Impose sanctions",
                        body: `Impose sanctions on ${countryDisplayName(world, selectedId)}?`,
                        confirmLabel: "Impose",
                        action: () =>
                          run({
                            type: "IMPOSE_SANCTIONS",
                            targetCountryId: selectedId,
                            severity: sanctionSeverity,
                          }),
                      });
                      return;
                    }
                    if (drawer === "lift_sanctions" && selectedId) {
                      run({ type: "LIFT_SANCTIONS", targetCountryId: selectedId });
                      return;
                    }
                    if (drawer === "alliance") {
                      run({ type: "ALLIANCE_CONSULTATION", institutionId });
                      return;
                    }
                    if (drawer === "posture") {
                      run({ type: "ADJUST_MILITARY_POSTURE", posture });
                      return;
                    }
                    if (drawer === "mediation" && crisisId) {
                      run({ type: "MEDIATE_CRISIS", crisisId });
                      return;
                    }
                    if (drawer === "warning" && selectedId) {
                      props.askConfirm({
                        title: "Diplomatic warning",
                        body: `Issue a formal warning to ${countryDisplayName(world, selectedId)}?`,
                        confirmLabel: "Issue warning",
                        action: () =>
                          run({ type: "ISSUE_DIPLOMATIC_WARNING", targetCountryId: selectedId }),
                      });
                    }
                  }}
                >
                  Confirm action
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
