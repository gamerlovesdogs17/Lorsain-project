import { useMemo, useState } from "react";
import {
  activeCoalition,
  canAssumeOffice,
  currentPresidentialAuthorityId,
  estimatedProvisionEffects,
  issuesForMinistryOffice,
  departmentFromOfficeId,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { cabinet, isMp, isPresident, playerOffices, qualitativeStanding } from "./format.js";
import {
  issueDisplayName,
  partyDisplayName,
  policyItemDisplay,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import { formatIndexDelta } from "./presentation/display.js";
import {
  BriefStrip,
  DataTable,
  EmptyState,
  EntityRow,
  PageHeader,
  SectionDivider,
  StatusBadge,
  TabBar,
  WorkLayout,
} from "./ui/kit.js";
import { PoliticianProfile } from "./ui/politician.js";

type GovTab = "overview" | "cabinet" | "agenda" | "budget" | "implementation";

const PLATFORM_ISSUE_LABELS: Record<string, string> = {
  economy: "Economy",
  taxes: "Taxes",
  labor: "Labor",
  housing: "Housing",
  social_policy: "Social policy",
  environment: "Environment",
  institutional_reform: "Institutional reform",
  foreign_policy: "Foreign policy",
};

function billConsequences(
  catalog: PresentationCatalog,
  bill: {
    summary: string;
    policyItems: Array<{
      issueId: string;
      provisionId?: string;
      optionId?: string;
      direction: number;
      magnitude: number;
      fiscalImpact: number | null;
    }>;
  },
): string[] {
  const lines: string[] = [];
  if (bill.summary.trim()) lines.push(bill.summary.trim());
  for (const item of bill.policyItems.slice(0, 3)) {
    lines.push(policyItemDisplay(catalog, item));
    const effects = estimatedProvisionEffects(item);
    const bits = Object.entries(effects)
      .filter(([, v]) => typeof v === "number" && Math.abs(v) >= 0.05)
      .slice(0, 3)
      .map(
        ([k, v]) =>
          `${k
            .replace(/Index$/, "")
            .replace(/([A-Z])/g, " $1")
            .trim()} ${formatIndexDelta(v as number)}`,
      );
    if (bits.length) lines.push(bits.join(" · "));
  }
  return lines.slice(0, 4);
}

function performanceTone(score: number): "ok" | "warn" | "idle" {
  if (score >= 0.62) return "ok";
  if (score >= 0.4) return "idle";
  return "warn";
}

function qualitativePerformance(score: number | null | undefined, evidence: boolean): string {
  if (!evidence) return "Too early to assess";
  if (score == null) return "Too early to assess";
  if (score >= 0.72) return "Strong record";
  if (score >= 0.55) return "Adequate";
  if (score >= 0.4) return "Uneven";
  return "Under pressure";
}

function qualitativeDelivery(status: string, progress: number): string {
  if (status === "fully_implemented" || progress >= 0.92) return "On track";
  if (status === "delayed" || progress < 0.35) return "Behind schedule";
  if (status === "partially_implemented" || progress < 0.65) return "Some delays";
  if (status.includes("fail") || status.includes("collapse")) return "Serious trouble";
  return "On track";
}

function qualitativeCoalition(negotiationScore: number | null | undefined): string {
  if (negotiationScore == null) return "Single-party";
  if (negotiationScore >= 0.7) return "Cooperative";
  if (negotiationScore >= 0.45) return "Strained";
  return "Critical";
}

function qualitativeService(score: number | null | undefined): string {
  if (score == null) return "Unassessed";
  if (score >= 0.7) return "Strong";
  if (score >= 0.55) return "Adequate";
  if (score >= 0.4) return "Under pressure";
  return "Weak";
}

export function ExecutivePage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
  selectedBill?: string | null;
  setSelectedBill?: (id: string | null) => void;
  onNavigate?: (screen: "assembly") => void;
  debug?: boolean;
}) {
  const cab = cabinet(props.world, props.snap);
  const presidentId = currentPresidentialAuthorityId(props.world, props.snap);
  const president = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const vacantMinistries = cab.filter((m) => m.holderId == null);
  const governing = props.snap.governingRuntime;
  const coalition = activeCoalition(props.snap);
  const [selectedMinisterOfficeId, setSelectedMinisterOfficeId] = useState<string | null>(null);
  const [govTab, setGovTab] = useState<GovTab>("overview");
  const [appointOfficeId, setAppointOfficeId] = useState(vacantMinistries[0]?.officeId ?? "");
  const [appointQuery, setAppointQuery] = useState("");
  const [appointPoliticianId, setAppointPoliticianId] = useState<string | null>(null);
  const [regOffice, setRegOffice] = useState("");
  const [regIssue, setRegIssue] = useState("");
  const [regDir, setRegDir] = useState<1 | -1>(1);
  const [regMag, setRegMag] = useState(0.3);
  const [regMajor, setRegMajor] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<null | "regulation" | "budget">(null);
  const [deferredBills, setDeferredBills] = useState<Set<string>>(() => new Set());
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const selectedOfficeId = vacantMinistries.some((m) => m.officeId === appointOfficeId)
    ? appointOfficeId
    : (vacantMinistries[0]?.officeId ?? "");
  const eligibilityOfficeId =
    selectedMinisterOfficeId &&
    cab.some((m) => m.officeId === selectedMinisterOfficeId && m.holderId)
      ? selectedMinisterOfficeId
      : selectedOfficeId;
  const eligible = useMemo(() => {
    if (!eligibilityOfficeId) return [];
    const q = appointQuery.trim().toLowerCase();
    return Object.keys(props.snap.politicians)
      .filter((id) => {
        if (id === props.snap.playerPoliticianId) return false;
        if (
          canAssumeOffice(props.snap, props.world, eligibilityOfficeId, id, "substantive", {
            ignoreOfficeCapacity: true,
          }) != null
        ) {
          return false;
        }
        if (!q) return true;
        const offices = playerOffices(props.world, props.snap, id).join(" ");
        const party = partyDisplayName(
          props.world,
          props.snap.politicians[id]?.partyId ?? null,
          props.snap,
        );
        return `${politicianDisplayName(props.catalog, id)} ${party} ${offices}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a).localeCompare(
          politicianDisplayName(props.catalog, b),
        ),
      )
      .slice(0, 60);
  }, [appointQuery, eligibilityOfficeId, props.catalog, props.snap, props.world]);

  const pendingBills = Object.values(props.snap.legislatureRuntime.bills).filter(
    (b) => b.status === "sent_to_president" && !deferredBills.has(b.id),
  );
  const standing = presidentId ? props.snap.candidateStanding[presidentId] : undefined;
  const regulations = Object.values(props.snap.executiveRuntime.regulations);
  const emergencies = Object.values(props.snap.executiveRuntime.emergencies);
  const warPowers = Object.values(props.snap.executiveRuntime.warPowers);
  const budgets = Object.values(props.snap.executiveRuntime.budgets);
  const agendaItems = [...(governing?.agenda?.items ?? [])].sort(
    (a, b) => b.priority - a.priority || a.title.localeCompare(b.title),
  );
  const promises = Object.values(governing?.promises ?? {}).sort((a, b) =>
    a.updatedDate < b.updatedDate ? 1 : -1,
  );
  const implementations = Object.values(governing?.implementations ?? {}).sort((a, b) =>
    a.enactedDate < b.enactedDate ? 1 : -1,
  );
  const fiscal = governing?.fiscal;
  const budgetCycle = governing?.budgetCycle;

  const govTabs: Array<{ id: GovTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "cabinet", label: "Cabinet" },
    { id: "agenda", label: "Agenda" },
    { id: "budget", label: "Budget" },
    { id: "implementation", label: "Implementation" },
  ];

  const overviewStrip = [
    {
      label: "Cabinet",
      value: `${cab.filter((m) => m.holderId).length}/${cab.length}`,
    },
    {
      label: "Agenda",
      value: agendaItems.filter((i) => i.status === "active").length,
    },
    {
      label: "Budget",
      value:
        budgetCycle?.stage && budgetCycle.stage !== "idle"
          ? budgetCycle.stage.replaceAll("_", " ")
          : (budgets[0]?.status ?? "idle"),
    },
    {
      label: "Delivery",
      value: implementations.filter((i) =>
        ["preparing", "partially_implemented", "delayed"].includes(i.status),
      ).length,
    },
  ];

  return (
    <WorkLayout
      className={`government-desk-v2${president ? " presidential-desk" : ""}`}
      header={
        <PageHeader
          kicker={president ? "Presidential command" : "Executive branch"}
          title="Government"
          subtitle={
            president
              ? "Cabinet, agenda, budget, and delivery under your authority."
              : "President, cabinet, agenda, fiscal cycle, and implementation."
          }
        />
      }
      main={
        <>
          <BriefStrip items={overviewStrip} />
          <TabBar tabs={govTabs} value={govTab} onChange={setGovTab} />

          {govTab === "overview" ? (
            <div className="gov-institution">
              <section className="gov-institution-block">
                <SectionDivider title="Head of government" />
                {presidentId ? (
                  <PoliticianProfile
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={presidentId}
                    office="President"
                    party={partyDisplayName(
                      props.world,
                      props.snap.politicians[presidentId]?.partyId ?? null,
                      props.snap,
                    )}
                    standing={`Public standing: ${qualitativeStanding(standing?.favorability)}`}
                  />
                ) : (
                  <EmptyState>The presidency is vacant.</EmptyState>
                )}
              </section>

              {president ? (
                <section className="gov-institution-block">
                  <SectionDivider title="Desk" hint="Bills awaiting disposition" />
                  {pendingBills.length === 0 && vacantMinistries.length === 0 ? (
                    <EmptyState>No bills or vacancies awaiting you.</EmptyState>
                  ) : null}
                  {pendingBills.map((b) => {
                    const floor =
                      b.floorVoteId != null
                        ? props.snap.legislatureRuntime.legislativeVotes[b.floorVoteId]
                        : null;
                    const consequences = billConsequences(props.catalog, b);
                    const open = detailsOpen[b.id] ?? false;
                    return (
                      <div key={b.id} className="bill-action">
                        <h3 className="bill-action-title">{b.title}</h3>
                        <div className="bill-action-tally muted">
                          {floor
                            ? `Floor vote: Yes ${floor.yes} · No ${floor.no} · Abstain ${floor.abstain}${floor.passed ? " · passed" : ""}`
                            : "Floor tally unavailable"}
                        </div>
                        <div className="bill-action-actions">
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              props.report(
                                props.sim.executeCommand({ type: "SIGN_BILL", billId: b.id }),
                              );
                              props.onDone();
                            }}
                          >
                            Sign
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              props.report(
                                props.sim.executeCommand({ type: "RETURN_BILL", billId: b.id }),
                              );
                              props.onDone();
                            }}
                          >
                            Return
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              setDeferredBills((prev) => {
                                const next = new Set(prev);
                                next.add(b.id);
                                return next;
                              })
                            }
                          >
                            Take no action
                          </button>
                        </div>
                        <ul className="bill-action-consequences">
                          {consequences.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <div className="bill-action-details">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setDetailsOpen((prev) => ({ ...prev, [b.id]: !open }))}
                          >
                            {open ? "Hide details" : "Details"}
                          </button>
                          {open ? (
                            <div className="bill-action-details-body">
                              <p className="muted">
                                Sponsor: {politicianDisplayName(props.catalog, b.sponsorId)}
                              </p>
                              {b.policyItems.map((p, i) => (
                                <p key={`${p.issueId}-${i}`}>
                                  {policyItemDisplay(props.catalog, p)}
                                </p>
                              ))}
                              {b.summary ? <p>{b.summary}</p> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {vacantMinistries.length > 0 ? (
                    <p className="muted">
                      {vacantMinistries.length} cabinet post
                      {vacantMinistries.length === 1 ? "" : "s"} vacant — open Cabinet to appoint.
                    </p>
                  ) : null}
                  {emergencies.map((e) => (
                    <div key={e.id} className="badge warn">
                      Emergency {e.status} · expires {e.expiresDate}
                    </div>
                  ))}
                </section>
              ) : null}

              <section className="gov-institution-block">
                <SectionDivider title="Fiscal snapshot" />
                {fiscal?.lastUpdated ? (
                  <dl className="dossier-facts compact">
                    <div>
                      <dt>Fiscal year</dt>
                      <dd>FY{fiscal.fiscalYear}</dd>
                    </div>
                    <div>
                      <dt>Revenue</dt>
                      <dd>{fiscal.revenue.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>Expenditure</dt>
                      <dd>{fiscal.expenditure.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>Balance</dt>
                      <dd>{fiscal.balance.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>Debt</dt>
                      <dd>{fiscal.debt.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{fiscal.lastUpdated}</dd>
                    </div>
                  </dl>
                ) : (
                  <EmptyState>Awaiting first governing month fiscal update.</EmptyState>
                )}
                {budgetCycle && budgetCycle.stage !== "idle" ? (
                  <p className="muted">
                    Budget cycle: {budgetCycle.stage.replaceAll("_", " ")}
                    {budgetCycle.failureConsequence
                      ? ` · ${budgetCycle.failureConsequence.replaceAll("_", " ")}`
                      : ""}
                  </p>
                ) : null}
              </section>

              <section className="gov-institution-block">
                <SectionDivider title="Coalition agreement" />
                {coalition ? (
                  <dl className="dossier-facts compact">
                    <div>
                      <dt>Status</dt>
                      <dd>{coalition.status}</dd>
                    </div>
                    <div>
                      <dt>Partners</dt>
                      <dd>
                        {coalition.partyIds
                          .map((id) => partyDisplayName(props.world, id, props.snap))
                          .join(" · ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Priorities</dt>
                      <dd>
                        {coalition.policyPriorities
                          .map((p) => PLATFORM_ISSUE_LABELS[p] ?? p.replaceAll("_", " "))
                          .join(" · ") || "None recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Climate</dt>
                      <dd>{qualitativeCoalition(coalition.negotiationScore)}</dd>
                    </div>
                    <div>
                      <dt>Formed</dt>
                      <dd>{coalition.formedDate}</dd>
                    </div>
                  </dl>
                ) : (
                  <EmptyState>No active coalition agreement.</EmptyState>
                )}
              </section>

              <section className="gov-institution-block">
                <SectionDivider title="Active agenda" hint="Top government priorities" />
                {agendaItems.filter((i) => i.status === "active").length === 0 ? (
                  <EmptyState>No active agenda items.</EmptyState>
                ) : (
                  agendaItems
                    .filter((i) => i.status === "active")
                    .slice(0, 6)
                    .map((item) => (
                      <EntityRow
                        key={item.id}
                        title={item.title.replace(/^[^:]+:\s*/, "")}
                        meta={`${issueDisplayName(props.catalog, item.issueId)} · ${item.source.replaceAll("_", " ")}`}
                        status={<StatusBadge>{item.status}</StatusBadge>}
                        trailing={`P${item.priority}`}
                      />
                    ))
                )}
              </section>

              {(emergencies.length > 0 || warPowers.length > 0) && (
                <section className="gov-institution-block">
                  <SectionDivider title="Emergency / war" />
                  {emergencies.map((e) => (
                    <EntityRow
                      key={e.id}
                      title={`Emergency ${e.status}`}
                      meta={`Expires ${e.expiresDate}`}
                    />
                  ))}
                  {warPowers.map((w) => (
                    <EntityRow key={w.id} title="War powers" status={w.status} />
                  ))}
                </section>
              )}
            </div>
          ) : null}

          {govTab === "cabinet" ? (
            <div className="gov-institution">
              <SectionDivider
                title="Cabinet"
                hint="Scan portfolios; open a minister for governing context"
              />
              <div className="gov-cabinet-list">
                {cab.map((m) => {
                  const perf = governing?.ministerialPerformance?.[m.officeId];
                  const partyId = m.holderId
                    ? (props.snap.politicians[m.holderId]?.partyId ?? null)
                    : null;
                  const selected = selectedMinisterOfficeId === m.officeId;
                  return (
                    <button
                      type="button"
                      key={m.officeId}
                      className={`gov-cabinet-row gov-cabinet-selectable${selected ? " selected" : ""}`}
                      onClick={() => setSelectedMinisterOfficeId(selected ? null : m.officeId)}
                    >
                      <div className="gov-cabinet-main">
                        <strong>{m.title}</strong>
                        <div className="muted">
                          {m.holderId
                            ? `${politicianDisplayName(props.catalog, m.holderId)} · ${partyDisplayName(props.world, partyId, props.snap)}`
                            : "Vacant"}
                        </div>
                      </div>
                      <StatusBadge tone={perf ? performanceTone(perf.score) : "idle"}>
                        {qualitativePerformance(perf?.score, Boolean(perf))}
                      </StatusBadge>
                    </button>
                  );
                })}
              </div>

              {selectedMinisterOfficeId
                ? (() => {
                    const m = cab.find((row) => row.officeId === selectedMinisterOfficeId);
                    if (!m) return null;
                    const perf = governing?.ministerialPerformance?.[m.officeId];
                    const relatedImpl = implementations.filter((rec) => {
                      const dept = departmentFromOfficeId(m.officeId);
                      return (
                        rec.departmentId === dept ||
                        rec.ministryOfficeId === m.officeId ||
                        rec.departmentId === m.officeId
                      );
                    });
                    return (
                      <div className="gov-minister-detail card">
                        <SectionDivider
                          title={m.title}
                          hint={
                            m.holderId
                              ? politicianDisplayName(props.catalog, m.holderId)
                              : "Vacant portfolio"
                          }
                        />
                        {m.holderId ? (
                          <PoliticianProfile
                            catalog={props.catalog}
                            world={props.world}
                            state={props.snap}
                            politicianId={m.holderId}
                            office={m.title}
                            party={partyDisplayName(
                              props.world,
                              props.snap.politicians[m.holderId]?.partyId ?? null,
                              props.snap,
                            )}
                          />
                        ) : (
                          <EmptyState>This ministry has no minister.</EmptyState>
                        )}
                        <dl className="dossier-facts compact">
                          <div>
                            <dt>Performance</dt>
                            <dd>
                              {qualitativePerformance(perf?.score, Boolean(perf))}
                              {props.debug && perf ? ` (${(perf.score * 100).toFixed(0)})` : ""}
                            </dd>
                          </div>
                          <div>
                            <dt>Active delivery</dt>
                            <dd>
                              {relatedImpl.length
                                ? relatedImpl
                                    .slice(0, 3)
                                    .map(
                                      (rec) =>
                                        props.snap.legislatureRuntime.enactedLaws[rec.lawId]
                                          ?.title ?? rec.lawId,
                                    )
                                    .join(" · ")
                                : "No major programs assigned"}
                            </dd>
                          </div>
                        </dl>
                        {president && m.holderId ? (
                          <div className="row wrap">
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() =>
                                props.askConfirm({
                                  title: "Dismiss minister",
                                  body: `Dismiss ${politicianDisplayName(props.catalog, m.holderId!)} as ${m.title}?`,
                                  confirmLabel: "Dismiss",
                                  action: () => {
                                    props.report(
                                      props.sim.executeCommand({
                                        type: "DISMISS_MINISTER",
                                        officeId: m.officeId,
                                      }),
                                    );
                                    props.onDone();
                                  },
                                })
                              }
                            >
                              Dismiss
                            </button>
                            {appointPoliticianId ? (
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  props.askConfirm({
                                    title: "Reshuffle cabinet seat",
                                    body: `Replace ${politicianDisplayName(props.catalog, m.holderId!)} with ${politicianDisplayName(props.catalog, appointPoliticianId)} as ${m.title}? Coalition share breaches cause political strain.`,
                                    confirmLabel: "Reshuffle",
                                    action: () => {
                                      props.report(
                                        props.sim.executeCommand({
                                          type: "RESHUFFLE_CABINET",
                                          officeId: m.officeId,
                                          politicianId: appointPoliticianId,
                                        }),
                                      );
                                      setAppointPoliticianId(null);
                                      props.onDone();
                                    },
                                  })
                                }
                              >
                                Reshuffle to selected
                              </button>
                            ) : (
                              <span className="muted">
                                Select a politician below to reshuffle this seat.
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                : null}

              {president && (vacantMinistries.length > 0 || selectedMinisterOfficeId) ? (
                <div className="appoint-panel">
                  <SectionDivider
                    title={
                      selectedMinisterOfficeId &&
                      cab.find((m) => m.officeId === selectedMinisterOfficeId)?.holderId
                        ? "Reshuffle candidate"
                        : "Appoint a minister"
                    }
                    hint="Choose a politician for appointment or cabinet reshuffle"
                  />
                  {vacantMinistries.length > 0 ? (
                    <div className="row">
                      <select
                        value={appointOfficeId || vacantMinistries[0]?.officeId || ""}
                        onChange={(e) => {
                          setAppointOfficeId(e.target.value);
                          setAppointPoliticianId(null);
                        }}
                      >
                        {vacantMinistries.map((m) => (
                          <option key={m.officeId} value={m.officeId}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                      <input
                        className="search"
                        placeholder="Search politicians"
                        value={appointQuery}
                        onChange={(e) => setAppointQuery(e.target.value)}
                      />
                    </div>
                  ) : (
                    <input
                      className="search"
                      placeholder="Search politicians for reshuffle"
                      value={appointQuery}
                      onChange={(e) => setAppointQuery(e.target.value)}
                    />
                  )}
                  <div
                    className="list"
                    style={{ marginTop: "0.6rem", maxHeight: "16rem", overflow: "auto" }}
                  >
                    {eligible.map((id) => {
                      const offices = playerOffices(props.world, props.snap, id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`pick ${appointPoliticianId === id ? "active" : ""}`}
                          onClick={() => setAppointPoliticianId(id)}
                        >
                          <div>
                            <strong>{politicianDisplayName(props.catalog, id)}</strong>
                            <div className="muted">
                              {partyDisplayName(
                                props.world,
                                props.snap.politicians[id]?.partyId ?? null,
                                props.snap,
                              )}
                              {offices.length ? ` · ${offices.join(", ")}` : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {vacantMinistries.length > 0 ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ marginTop: "0.6rem" }}
                      disabled={!selectedOfficeId || !appointPoliticianId}
                      onClick={() => {
                        if (!selectedOfficeId || !appointPoliticianId) return;
                        props.report(
                          props.sim.executeCommand({
                            type: "APPOINT_MINISTER",
                            officeId: selectedOfficeId,
                            politicianId: appointPoliticianId,
                          }),
                        );
                        setAppointPoliticianId(null);
                        props.onDone();
                      }}
                    >
                      Appoint
                    </button>
                  ) : null}
                </div>
              ) : null}

              {president ? (
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setPanel("regulation")}
                  >
                    Issue regulation
                  </button>
                </div>
              ) : null}

              <SectionDivider title="Regulations" />
              {regulations.length === 0 ? <EmptyState>No regulations on record.</EmptyState> : null}
              {regulations.map((r) => (
                <EntityRow
                  key={r.id}
                  title={
                    cab.find((m) => m.officeId === r.ministryOfficeId)?.title ?? r.ministryOfficeId
                  }
                  meta={r.policyItems.map((p) => policyItemDisplay(props.catalog, p)).join("; ")}
                  status={r.status}
                  trailing={
                    mp && r.major && r.status === "active" ? (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          props.report(
                            props.sim.executeCommand({
                              type: "INTRODUCE_MOTION",
                              kind: "regulation_annulment",
                              targetId: r.id,
                            }),
                          );
                          props.onDone();
                        }}
                      >
                        Move to annul
                      </button>
                    ) : null
                  }
                />
              ))}
            </div>
          ) : null}

          {govTab === "agenda" ? (
            <div className="gov-institution">
              <SectionDivider
                title="Government agenda"
                hint="Platform, coalition, and crisis priorities"
              />
              {agendaItems.length === 0 ? (
                <EmptyState>No agenda compiled yet.</EmptyState>
              ) : (
                <div className="gov-agenda-list">
                  {agendaItems.slice(0, 16).map((item) => {
                    const linkedBill = item.billId
                      ? (props.snap.legislatureRuntime.bills[item.billId] ?? null)
                      : null;
                    const billStale =
                      linkedBill &&
                      ["withdrawn", "defeated", "enacted", "archived", "lapsed"].includes(
                        linkedBill.status,
                      );
                    return (
                      <EntityRow
                        key={item.id}
                        title={item.title.replace(/^[^:]+:\s*/, "")}
                        meta={`${issueDisplayName(props.catalog, item.issueId)} · ${item.source.replaceAll("_", " ")}${
                          linkedBill
                            ? ` · bill ${linkedBill.status.replaceAll("_", " ")}`
                            : item.billStatus === "ambiguous"
                              ? " · multiple bills — set exact reference"
                              : ""
                        }`}
                        status={<StatusBadge>{item.status.replaceAll("_", " ")}</StatusBadge>}
                        trailing={
                          linkedBill &&
                          !billStale &&
                          props.setSelectedBill &&
                          props.onNavigate ? (
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              onClick={() => {
                                props.setSelectedBill?.(linkedBill.id);
                                props.onNavigate?.("assembly");
                              }}
                            >
                              Open in Assembly
                            </button>
                          ) : linkedBill && billStale ? (
                            <StatusBadge>{linkedBill.status.replaceAll("_", " ")}</StatusBadge>
                          ) : (
                            `P${item.priority}`
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}

              <SectionDivider title="Promises" hint="Platform and coalition commitments" />
              {promises.length === 0 ? (
                <EmptyState>No promise records yet.</EmptyState>
              ) : (
                promises
                  .slice(0, 24)
                  .map((p) => (
                    <EntityRow
                      key={p.id}
                      title={issueDisplayName(props.catalog, p.issueId)}
                      meta={`${partyDisplayName(props.world, p.partyId, props.snap)} · ${p.source} · ${p.notes || "—"}`}
                      status={<StatusBadge>{p.status.replaceAll("_", " ")}</StatusBadge>}
                      trailing={p.updatedDate}
                    />
                  ))
              )}

              <SectionDivider title="Coalition agreement summary" />
              {coalition ? (
                <dl className="dossier-facts compact">
                  <div>
                    <dt>Partners</dt>
                    <dd>
                      {coalition.partyIds
                        .map((id) => partyDisplayName(props.world, id, props.snap))
                        .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Policy bargain</dt>
                    <dd>
                      {coalition.policyPriorities
                        .map((p) => PLATFORM_ISSUE_LABELS[p] ?? p.replaceAll("_", " "))
                        .join(" · ") || "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Cabinet shares</dt>
                    <dd>
                      {Object.entries(coalition.cabinetShares)
                        .map(
                          ([id, share]) =>
                            `${partyDisplayName(props.world, id, props.snap)} ${(share * 100).toFixed(0)}%`,
                        )
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <EmptyState>No coalition bargain in force.</EmptyState>
              )}
            </div>
          ) : null}

          {govTab === "budget" ? (
            <div className="gov-institution">
              <SectionDivider title="Fiscal position" />
              {fiscal?.lastUpdated ? (
                <dl className="dossier-facts compact">
                  <div>
                    <dt>FY</dt>
                    <dd>{fiscal.fiscalYear}</dd>
                  </div>
                  <div>
                    <dt>Revenue</dt>
                    <dd>{fiscal.revenue.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Spending</dt>
                    <dd>{fiscal.expenditure.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>{fiscal.balance.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Debt</dt>
                    <dd>{fiscal.debt.toFixed(1)}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState>No fiscal snapshot yet.</EmptyState>
              )}

              {budgetCycle ? (
                <p className="muted">
                  Cycle stage: {budgetCycle.stage.replaceAll("_", " ")}
                  {budgetCycle.lastProcessedDate ? ` · last ${budgetCycle.lastProcessedDate}` : ""}
                </p>
              ) : null}

              {president ? (
                <div className="row" style={{ marginBottom: "0.75rem" }}>
                  <button type="button" className="btn" onClick={() => setPanel("budget")}>
                    Propose budget
                  </button>
                </div>
              ) : null}

              <SectionDivider title="Budget proposals" />
              {budgets.length === 0 ? (
                <EmptyState>No budget has been proposed this cycle.</EmptyState>
              ) : null}
              {budgets.map((b) => {
                const amounts =
                  Object.keys(b.ministryAmounts ?? {}).length > 0
                    ? b.ministryAmounts
                    : b.allocations;
                const total =
                  b.totalEnvelope > 0
                    ? b.totalEnvelope
                    : Object.values(amounts).reduce((s, n) => s + n, 0);
                return (
                  <div key={b.id} className="budget-row">
                    <EntityRow
                      title={`FY ${b.fiscalYear}`}
                      meta={`${b.status}${b.fiscalStance ? ` · ${b.fiscalStance.replaceAll("_", " ")}` : ""}`}
                      trailing={total.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    />
                    <DataTable dense headers={["Ministry", "Amount", "Share"]}>
                      {Object.entries(amounts).map(([officeId, n]) => (
                        <tr key={officeId}>
                          <td>
                            {cab.find((m) => m.officeId === officeId)?.title ??
                              props.world.offices[officeId]?.title ??
                              "Ministry"}
                          </td>
                          <td>{n.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td>
                            {total > 0
                              ? `${((n / total) * 100).toFixed(0)}%`
                              : ((b.allocations[officeId] ?? 0) * 100).toFixed(0) + "%"}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                    {mp && b.status === "proposed" ? (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          props.report(
                            props.sim.executeCommand({
                              type: "INTRODUCE_MOTION",
                              kind: "budget_approval",
                              targetId: b.id,
                            }),
                          );
                          props.onDone();
                        }}
                      >
                        Move to approve
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {govTab === "implementation" ? (
            <div className="gov-institution">
              <SectionDivider
                title="Law implementation"
                hint="Enactment versus administrative delivery"
              />
              {implementations.length === 0 ? (
                <EmptyState>No implementation records yet.</EmptyState>
              ) : (
                <div className="gov-implementation-list">
                  {implementations.slice(0, 40).map((rec) => {
                    const law = props.snap.legislatureRuntime.enactedLaws[rec.lawId];
                    const ministry =
                      cab.find((m) => departmentFromOfficeId(m.officeId) === rec.departmentId)
                        ?.title ?? rec.departmentId.replaceAll("_", " ");
                    const canRespond =
                      president ||
                      (rec.ministryOfficeId != null &&
                        cab.some(
                          (m) =>
                            m.officeId === rec.ministryOfficeId &&
                            m.holderId === props.snap.playerPoliticianId,
                        ));
                    return (
                      <div key={rec.lawId} className="gov-impl-card">
                        <EntityRow
                          title={law?.title ?? rec.lawId}
                          meta={`${ministry} · ${rec.posture.replaceAll("_", " ")}`}
                          status={
                            <StatusBadge>
                              {qualitativeDelivery(rec.status, rec.progress)}
                            </StatusBadge>
                          }
                          trailing={
                            props.debug ? `${(rec.progress * 100).toFixed(0)}%` : undefined
                          }
                        />
                        {canRespond &&
                        rec.status !== "fully_implemented" &&
                        rec.status !== "blocked" ? (
                          <div className="row wrap" style={{ marginTop: "0.35rem" }}>
                            {(
                              [
                                ["increase_resources", "Add resources"],
                                ["revise_timetable", "Revise timetable"],
                                ["issue_guidance", "Issue guidance"],
                                ["negotiate_provinces", "Negotiate provinces"],
                                ["reduce_scope", "Reduce scope"],
                                ["pause_rollout", "Pause rollout"],
                              ] as const
                            ).map(([action, label]) => (
                              <button
                                type="button"
                                key={action}
                                className="btn secondary btn-sm"
                                onClick={() => {
                                  props.report(
                                    props.sim.executeCommand({
                                      type: "RESPOND_TO_IMPLEMENTATION",
                                      lawId: rec.lawId,
                                      action,
                                    }),
                                  );
                                  props.onDone();
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <SectionDivider title="Service outcomes" />
              {governing?.services ? (
                <dl className="dossier-facts compact">
                  <div>
                    <dt>Healthcare</dt>
                    <dd>
                      {qualitativeService(governing.services.healthcareAccess)}
                      {props.debug
                        ? ` (${(governing.services.healthcareAccess * 100).toFixed(0)})`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Education</dt>
                    <dd>
                      {qualitativeService(governing.services.educationQuality)}
                      {props.debug
                        ? ` (${(governing.services.educationQuality * 100).toFixed(0)})`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Infrastructure</dt>
                    <dd>
                      {qualitativeService(governing.services.infrastructureQuality)}
                      {props.debug
                        ? ` (${(governing.services.infrastructureQuality * 100).toFixed(0)})`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Public safety</dt>
                    <dd>
                      {qualitativeService(governing.services.publicSafety)}
                      {props.debug
                        ? ` (${(governing.services.publicSafety * 100).toFixed(0)})`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Administration</dt>
                    <dd>
                      {qualitativeService(governing.services.administrativeDelivery)}
                      {props.debug
                        ? ` (${(governing.services.administrativeDelivery * 100).toFixed(0)})`
                        : ""}
                    </dd>
                  </div>
                </dl>
              ) : (
                <EmptyState>Service outcomes not yet scored.</EmptyState>
              )}
            </div>
          ) : null}

          {president && panel === "regulation" ? (
            <div className="action-drawer-backdrop" onClick={() => setPanel(null)}>
              <div className="action-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="action-drawer-head">
                  <h3>Issue regulation</h3>
                  <button type="button" className="btn quiet" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <div className="form-stack">
                  <p className="muted">
                    Choose a ministry and policy domain, then a regulatory stance. Exact magnitudes
                    stay in Debug Mode.
                  </p>
                  <select
                    value={regOffice}
                    onChange={(e) => {
                      setRegOffice(e.target.value);
                      setRegIssue("");
                    }}
                  >
                    <option value="">Choose ministry</option>
                    {cab.map((m) => (
                      <option key={m.officeId} value={m.officeId}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  <select value={regIssue} onChange={(e) => setRegIssue(e.target.value)}>
                    <option value="">Choose issue in ministry jurisdiction</option>
                    {(regOffice
                      ? issuesForMinistryOffice(regOffice)
                      : props.world.issueIds
                    ).map((id) => (
                      <option key={id} value={id}>
                        {issueDisplayName(props.catalog, id)}
                      </option>
                    ))}
                  </select>
                  <div className="row wrap">
                    <button
                      type="button"
                      className={`btn secondary${regDir === 1 ? " selected" : ""}`}
                      onClick={() => setRegDir(1)}
                    >
                      Tighten / advance
                    </button>
                    <button
                      type="button"
                      className={`btn secondary${regDir === -1 ? " selected" : ""}`}
                      onClick={() => setRegDir(-1)}
                    >
                      Ease / reverse
                    </button>
                  </div>
                  <div className="row wrap">
                    {(
                      [
                        ["limited", 0.2],
                        ["targeted", 0.35],
                        ["broad", 0.55],
                        ["sweeping", 0.8],
                      ] as const
                    ).map(([label, mag]) => (
                      <button
                        type="button"
                        key={label}
                        className={`btn secondary${Math.abs(regMag - mag) < 0.01 ? " selected" : ""}`}
                        onClick={() => setRegMag(mag)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={regMajor}
                      onChange={(e) => setRegMajor(e.target.checked)}
                    />{" "}
                    Subject regulation to Assembly annulment review (major instrument)
                  </label>
                  <p className="muted">
                    Sweeping/broad stances and multi-item rules are treated as major even without
                    this checkbox.
                  </p>
                  {props.debug ? (
                    <label>
                      Debug magnitude {regMag.toFixed(2)}
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={regMag}
                        onChange={(e) => setRegMag(Number(e.target.value))}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    disabled={!regOffice || !regIssue}
                    onClick={() => {
                      props.report(
                        props.sim.executeCommand({
                          type: "ISSUE_REGULATION",
                          ministryOfficeId: regOffice,
                          policyItems: [
                            {
                              issueId: regIssue,
                              direction: regDir,
                              magnitude: regMag,
                              fiscalImpact: null,
                            },
                          ],
                          major: regMajor,
                        }),
                      );
                      props.onDone();
                      setPanel(null);
                    }}
                  >
                    Issue regulation
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {president && panel === "budget" ? (
            <div className="action-drawer-backdrop" onClick={() => setPanel(null)}>
              <div className="action-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="action-drawer-head">
                  <h3>Propose budget</h3>
                  <button type="button" className="btn quiet" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="muted">
                  Choose a fiscal stance. That sets the total spending envelope from ministry
                  requests; ministry amounts remain distinct from shares.
                </p>
                <div className="row wrap" style={{ marginBottom: "0.65rem" }}>
                  {(
                    [
                      ["Hold real spending", "hold"],
                      ["Modest increase", "modest_increase"],
                      ["Expansionary", "expansionary"],
                      ["Consolidation", "consolidation"],
                    ] as const
                  ).map(([label, stance]) => (
                    <button
                      type="button"
                      key={stance}
                      className="btn secondary"
                      onClick={() => {
                        props.report(
                          props.sim.executeCommand({
                            type: "PROPOSE_BUDGET",
                            fiscalStance: stance,
                          }),
                        );
                        setPanel(null);
                        props.onDone();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="muted">Or seed custom ministry amounts, then propose:</p>
                <div className="row wrap" style={{ marginBottom: "0.65rem" }}>
                  {(
                    [
                      ["Hold baseline", "hold_baseline"],
                      ["Partial requests", "partial_request"],
                      ["Full requests", "full_request"],
                      ["Cut package", "cut"],
                    ] as const
                  ).map(([label, choice]) => (
                    <button
                      type="button"
                      key={choice}
                      className="btn secondary"
                      onClick={() => {
                        const stance =
                          choice === "full_request"
                            ? "expansionary"
                            : choice === "partial_request"
                              ? "modest_increase"
                              : choice === "cut"
                                ? "consolidation"
                                : "hold";
                        const choices: Record<string, typeof choice> = {};
                        for (const m of cab) choices[m.officeId] = choice;
                        props.report(
                          props.sim.executeCommand({
                            type: "PROPOSE_BUDGET",
                            fiscalStance: stance,
                            ministryChoices: choices,
                          }),
                        );
                        setPanel(null);
                        props.onDone();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <table className="table budget-editor">
                  <thead>
                    <tr>
                      <th>Ministry</th>
                      <th>Custom amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cab.map((m) => (
                      <tr key={m.officeId}>
                        <td>{m.title}</td>
                        <td>
                          <input
                            className="search"
                            type="number"
                            min={0}
                            step={0.1}
                            value={allocations[m.officeId] ?? ""}
                            placeholder="0"
                            onChange={(e) =>
                              setAllocations((prev) => ({ ...prev, [m.officeId]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Custom total{" "}
                  {cab
                    .reduce((s, m) => s + (Number(allocations[m.officeId] ?? 0) || 0), 0)
                    .toLocaleString()}
                </p>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    const next: Record<string, number> = {};
                    let sum = 0;
                    for (const m of cab) {
                      const n = Number(allocations[m.officeId] ?? 0);
                      if (!Number.isFinite(n) || n < 0) {
                        props.report({
                          ok: false,
                          error: {
                            code: "INVALID_BUDGET",
                            message: "Allocations must be zero or positive numbers.",
                          },
                        });
                        return;
                      }
                      next[m.officeId] = n;
                      sum += n;
                    }
                    if (sum <= 0) {
                      props.report({
                        ok: false,
                        error: {
                          code: "INVALID_BUDGET",
                          message:
                            "Set at least one ministry allocation before proposing a custom budget.",
                        },
                      });
                      return;
                    }
                    props.report(
                      props.sim.executeCommand({
                        type: "PROPOSE_BUDGET",
                        allocations: next,
                        fiscalStance: "custom",
                      }),
                    );
                    setPanel(null);
                    props.onDone();
                  }}
                >
                  Propose custom budget
                </button>
              </div>
            </div>
          ) : null}
        </>
      }
    />
  );
}
