import { useMemo, useState } from "react";
import {
  canAssumeOffice,
  currentPresidentialAuthorityId,
  estimatedProvisionEffects,
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
  DataTable,
  EmptyState,
  EntityRow,
  PageHeader,
  SectionDivider,
  WorkLayout,
} from "./ui/kit.js";
import { PoliticianCard, PoliticianProfile } from "./ui/politician.js";

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
}) {
  const cab = cabinet(props.world, props.snap);
  const presidentId = currentPresidentialAuthorityId(props.world, props.snap);
  const president = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const vacantMinistries = cab.filter((m) => m.holderId == null);
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
  const eligible = useMemo(() => {
    if (!selectedOfficeId) return [];
    const q = appointQuery.trim().toLowerCase();
    return Object.keys(props.snap.politicians)
      .filter((id) => {
        if (id === props.snap.playerPoliticianId) return false;
        if (
          canAssumeOffice(props.snap, props.world, selectedOfficeId, id, "substantive", {
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
  }, [appointQuery, props.catalog, props.snap, props.world, selectedOfficeId]);

  const pendingBills = Object.values(props.snap.legislatureRuntime.bills).filter(
    (b) => b.status === "sent_to_president" && !deferredBills.has(b.id),
  );
  const standing = presidentId ? props.snap.candidateStanding[presidentId] : undefined;
  const regulations = Object.values(props.snap.executiveRuntime.regulations);
  const emergencies = Object.values(props.snap.executiveRuntime.emergencies);
  const warPowers = Object.values(props.snap.executiveRuntime.warPowers);
  const budgets = Object.values(props.snap.executiveRuntime.budgets);

  return (
    <WorkLayout
      {...(president ? { className: "presidential-desk" } : {})}
      header={
        <PageHeader
          kicker={president ? "Presidential command" : "Government"}
          title="Executive"
          subtitle={
            president
              ? "The administration is yours to direct."
              : "President, cabinet, budget, and regulations."
          }
        />
      }
      main={
        <>
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

          {president ? (
            <>
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
                            <p key={`${p.issueId}-${i}`}>{policyItemDisplay(props.catalog, p)}</p>
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
                  {vacantMinistries.length === 1 ? "" : "s"} vacant.
                </p>
              ) : null}
              {emergencies.map((e) => (
                <div key={e.id} className="badge warn">
                  Emergency {e.status} · expires {e.expiresDate}
                </div>
              ))}
            </>
          ) : null}

          <SectionDivider title="Cabinet" />
          <div className="politician-card-grid">
            {cab.map((m) =>
              m.holderId ? (
                <PoliticianCard
                  key={m.officeId}
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={m.holderId}
                  office={m.title}
                  action={
                    president ? (
                      <details className="card-menu">
                        <summary className="btn quiet" aria-label="Minister actions">
                          ⋯
                        </summary>
                        <div className="card-menu-pop">
                          <button
                            type="button"
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
                        </div>
                      </details>
                    ) : null
                  }
                />
              ) : (
                <div key={m.officeId} className="politician-card static compact">
                  <div className="politician-card-body">
                    <strong>{m.title}</strong>
                    <div className="muted">Vacant</div>
                  </div>
                </div>
              ),
            )}
          </div>

          {president && vacantMinistries.length > 0 ? (
            <div className="appoint-panel">
              <SectionDivider
                title="Appoint a minister"
                hint="Choose the vacant portfolio and politician"
              />
              <div className="row">
                <select
                  value={selectedOfficeId}
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
                Appoint selected politician
              </button>
            </div>
          ) : null}

          {president ? (
            <div className="row">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setPanel("regulation")}
              >
                Issue regulation
              </button>
              <button type="button" className="btn secondary" onClick={() => setPanel("budget")}>
                Propose budget
              </button>
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
                  <select value={regOffice} onChange={(e) => setRegOffice(e.target.value)}>
                    <option value="">Choose ministry</option>
                    {cab.map((m) => (
                      <option key={m.officeId} value={m.officeId}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  <select value={regIssue} onChange={(e) => setRegIssue(e.target.value)}>
                    <option value="">Choose issue</option>
                    {props.world.issueIds.map((id) => (
                      <option key={id} value={id}>
                        {issueDisplayName(props.catalog, id)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={String(regDir)}
                    onChange={(e) => setRegDir(Number(e.target.value) as 1 | -1)}
                  >
                    <option value="1">For</option>
                    <option value="-1">Against</option>
                  </select>
                  <label>
                    Regulatory scope{" "}
                    {regMag >= 0.75
                      ? "sweeping"
                      : regMag >= 0.5
                        ? "broad"
                        : regMag >= 0.3
                          ? "targeted"
                          : "limited"}
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={regMag}
                      onChange={(e) => setRegMag(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={regMajor}
                      onChange={(e) => setRegMajor(e.target.checked)}
                    />{" "}
                    Major
                  </label>
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

          <SectionDivider title="Budget" />
          {budgets.length === 0 ? (
            <EmptyState>No budget has been proposed this cycle.</EmptyState>
          ) : null}
          {budgets.map((b) => {
            const total = Object.values(b.allocations).reduce((s, n) => s + n, 0);
            return (
              <div key={b.id} className="budget-row">
                <EntityRow
                  title={`FY ${b.fiscalYear}`}
                  meta={b.status}
                  trailing={total.toLocaleString()}
                />
                <DataTable dense headers={["Ministry", "Envelope"]}>
                  {Object.entries(b.allocations).map(([officeId, n]) => (
                    <tr key={officeId}>
                      <td>
                        {cab.find((m) => m.officeId === officeId)?.title ??
                          props.world.offices[officeId]?.title ??
                          "Ministry"}
                      </td>
                      <td>{n.toLocaleString()}</td>
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

          {president && panel === "budget" ? (
            <div className="action-drawer-backdrop" onClick={() => setPanel(null)}>
              <div className="action-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="action-drawer-head">
                  <h3>Propose budget</h3>
                  <button type="button" className="btn quiet" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="muted">Set each ministry envelope. Nothing is auto-equalized.</p>
                <table className="table budget-editor">
                  <thead>
                    <tr>
                      <th>Ministry</th>
                      <th>Envelope</th>
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
                            step={1}
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
                  Total{" "}
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
                            "Set at least one ministry allocation before proposing a budget.",
                        },
                      });
                      return;
                    }
                    props.report(
                      props.sim.executeCommand({ type: "PROPOSE_BUDGET", allocations: next }),
                    );
                    setPanel(null);
                    props.onDone();
                  }}
                >
                  Propose budget
                </button>
              </div>
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

          {mp
            ? cab
                .filter((m) => m.holderId)
                .map((m) => (
                  <button
                    key={`censure-${m.officeId}`}
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      props.report(
                        props.sim.executeCommand({
                          type: "INTRODUCE_MOTION",
                          kind: "ministerial_censure",
                          targetId: m.officeId,
                        }),
                      );
                      props.onDone();
                    }}
                  >
                    Move to censure {m.title}
                  </button>
                ))
            : null}

          {emergencies.length > 0 || warPowers.length > 0 ? (
            <>
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
            </>
          ) : null}
        </>
      }
    />
  );
}
