import { useMemo, useState } from "react";
import {
  canAssumeOffice,
  currentPresidentialAuthorityId,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { cabinet, isMp, isPresident, playerOffices } from "./format.js";
import {
  issueDisplayName,
  partyDisplayName,
  policyItemDisplay,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";

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
        const fig = props.catalog.figures.get(id);
        const offices = playerOffices(props.world, props.snap, id).join(" ");
        const party = partyDisplayName(
          props.world,
          props.snap.politicians[id]?.partyId ?? null,
          props.snap,
        );
        return `${fig?.name ?? id} ${party} ${offices}`.toLowerCase().includes(q);
      })
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a).localeCompare(
          politicianDisplayName(props.catalog, b),
        ),
      )
      .slice(0, 60);
  }, [appointQuery, props.catalog, props.snap, props.world, selectedOfficeId]);

  return (
    <div className="card">
      <h3>Executive</h3>
      <p>President: {presidentId ? politicianDisplayName(props.catalog, presidentId) : "vacant"}</p>
      <table className="table">
        <tbody>
          {cab.map((m) => (
            <tr key={m.officeId}>
              <td>{m.title}</td>
              <td>{m.holderId ? politicianDisplayName(props.catalog, m.holderId) : "vacant"}</td>
              {president && m.holderId ? (
                <td>
                  <button
                    type="button"
                    className="btn danger"
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
                </td>
              ) : (
                <td />
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {president && vacantMinistries.length > 0 ? (
        <div className="card" style={{ marginTop: "0.8rem" }}>
          <h3>Appoint a minister</h3>
          <p className="muted">Choose the vacant portfolio and the politician yourself.</p>
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
        <div className="card" style={{ marginTop: "0.8rem" }}>
          <h3>Issue regulation</h3>
          <div className="row">
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
              Intensity {regMag.toFixed(2)}
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
              }}
            >
              Issue regulation
            </button>
          </div>
        </div>
      ) : null}

      <h3>Budget</h3>
      {Object.values(props.snap.executiveRuntime.budgets).map((b) => (
        <div key={b.id}>
          FY {b.fiscalYear} · {b.status}
          <div className="muted">
            {Object.entries(b.allocations)
              .map(([officeId, n]) => {
                const title = cab.find((m) => m.officeId === officeId)?.title ?? officeId;
                return `${title} ${n}`;
              })
              .join(" · ")}
          </div>
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
      ))}
      {president ? (
        <div className="card" style={{ marginTop: "0.6rem" }}>
          <h3>Propose budget</h3>
          <p className="muted">Set each ministry envelope. Nothing is auto-equalized.</p>
          {cab.map((m) => (
            <label key={m.officeId} className="row" style={{ marginTop: "0.3rem" }}>
              <span style={{ minWidth: "12rem" }}>{m.title}</span>
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
            </label>
          ))}
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
                    message: "Set at least one ministry allocation before proposing a budget.",
                  },
                });
                return;
              }
              props.report(props.sim.executeCommand({ type: "PROPOSE_BUDGET", allocations: next }));
              props.onDone();
            }}
          >
            Propose budget
          </button>
        </div>
      ) : null}

      {mp
        ? cab
            .filter((m) => m.holderId)
            .slice(0, 1)
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
      <h3>Regulations</h3>
      {Object.values(props.snap.executiveRuntime.regulations).map((r) => (
        <div key={r.id}>
          {r.status} ·{" "}
          {cab.find((m) => m.officeId === r.ministryOfficeId)?.title ?? r.ministryOfficeId} ·{" "}
          {r.policyItems.map((p) => policyItemDisplay(props.catalog, p)).join("; ")}
          {mp && r.major && r.status === "active" ? (
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
          ) : null}
        </div>
      ))}
      <h3>Emergency / war</h3>
      {Object.values(props.snap.executiveRuntime.emergencies).map((e) => (
        <div key={e.id}>
          Emergency {e.status} · expires {e.expiresDate}
        </div>
      ))}
      {Object.values(props.snap.executiveRuntime.warPowers).map((w) => (
        <div key={w.id}>War powers {w.status}</div>
      ))}
    </div>
  );
}
