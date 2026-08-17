import { useState } from "react";
import {
  currentAssemblyMemberIds,
  partyStance,
  factionStance,
  whipEstimate,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { isMp, isSpeaker } from "./format.js";
import {
  billStatusLabel,
  committeeDisplayName,
  issueDisplayName,
  partyColor,
  partyDisplayName,
  policyItemDisplay,
  politicianDisplayName,
  stanceLabel,
  type PresentationCatalog,
} from "./presentation.js";

type AssemblyTab = "overview" | "bills" | "committees" | "votes";

export function AssemblyPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  selectedBill: string | null;
  setSelectedBill: (id: string | null) => void;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
}) {
  const [tab, setTab] = useState<AssemblyTab>("overview");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [issueId, setIssueId] = useState(props.world.issueIds[0] ?? "");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [magnitude, setMagnitude] = useState(0.4);
  const [amendIssue, setAmendIssue] = useState("");
  const [amendDir, setAmendDir] = useState<1 | -1>(1);
  const [amendMag, setAmendMag] = useState(0.4);
  const mps = currentAssemblyMemberIds(props.world, props.snap);
  const counts = new Map<string, number>();
  for (const id of mps) {
    const party = props.snap.politicians[id]?.partyId ?? "none";
    counts.set(party, (counts.get(party) ?? 0) + 1);
  }
  const bill = props.selectedBill ? props.snap.legislatureRuntime.bills[props.selectedBill] : null;
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const speaker = isSpeaker(props.world, props.snap, props.snap.playerPoliticianId);
  const whip = bill ? whipEstimate(props.world, props.snap, bill.id) : null;
  const votes = Object.values(props.snap.legislatureRuntime.legislativeVotes).sort((a, b) =>
    a.id < b.id ? 1 : -1,
  );

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.8rem" }}>
        {(["overview", "bills", "committees", "votes"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={`btn ${tab === id ? "" : "secondary"}`}
            onClick={() => setTab(id)}
          >
            {id[0]!.toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="card">
          <h3>Assembly overview</h3>
          <p>
            {mps.length} sitting of {props.world.legislativeConstitution.assemblySeatCount}{" "}
            authorized seats.
          </p>
          <div className="chamber">
            {Array.from(
              { length: props.world.legislativeConstitution.assemblySeatCount },
              (_, i) => {
                const id = mps[i];
                const party = id ? (props.snap.politicians[id]?.partyId ?? null) : null;
                return (
                  <span
                    key={i}
                    className={`seat ${id ? "" : "vacant"}`}
                    style={{ background: id ? partyColor(props.world, party) : undefined }}
                    title={
                      id
                        ? `${politicianDisplayName(props.catalog, id)} · ${partyDisplayName(props.world, party, props.snap)}`
                        : "vacant"
                    }
                  />
                );
              },
            )}
          </div>
          <table className="table">
            <tbody>
              {[...counts.entries()].map(([party, n]) => (
                <tr key={party}>
                  <td>
                    <span
                      className="swatch"
                      style={{
                        background: partyColor(props.world, party === "none" ? null : party),
                      }}
                    />{" "}
                    {partyDisplayName(props.world, party === "none" ? null : party, props.snap)}
                  </td>
                  <td>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "committees" ? (
        <div className="card">
          <h3>Committees</h3>
          {Object.values(props.snap.legislatureRuntime.committees).map((c) => (
            <div key={c.id} style={{ marginBottom: "0.8rem" }}>
              <strong>{committeeDisplayName(c.id)}</strong>
              <div className="muted">{c.memberIds.length} members</div>
              <div className="muted">
                {c.memberIds
                  .slice(0, 12)
                  .map((id) => politicianDisplayName(props.catalog, id))
                  .join(" · ")}
                {c.memberIds.length > 12 ? " …" : ""}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {tab === "votes" ? (
        <div className="card">
          <h3>Completed votes</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Stage</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {votes.slice(0, 30).map((v) => {
                const parent = props.snap.legislatureRuntime.bills[v.billId];
                return (
                  <tr key={v.id}>
                    <td>{parent?.title ?? v.billId}</td>
                    <td>{v.stage}</td>
                    <td>
                      {v.passed ? "Passed" : "Failed"} · Yes {v.yes} / No {v.no} / Abstain{" "}
                      {v.abstain}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "bills" || tab === "overview" ? (
        <>
          {mp ? (
            <div className="card" style={{ margin: "0.8rem 0" }}>
              <h3>Introduce a bill</h3>
              <div className="row">
                <input
                  className="search"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <select value={issueId} onChange={(e) => setIssueId(e.target.value)}>
                  {props.world.issueIds.map((id) => (
                    <option key={id} value={id}>
                      {issueDisplayName(props.catalog, id)}
                    </option>
                  ))}
                </select>
                <select
                  value={String(direction)}
                  onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)}
                >
                  <option value="1">For</option>
                  <option value="-1">Against</option>
                </select>
                <label>
                  Intensity {magnitude.toFixed(2)}
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={magnitude}
                    onChange={(e) => setMagnitude(Number(e.target.value))}
                  />
                </label>
              </div>
              <input
                className="search"
                style={{ marginTop: "0.4rem" }}
                placeholder="Optional summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                style={{ marginTop: "0.5rem" }}
                disabled={!title.trim() || !issueId}
                onClick={() => {
                  const r = props.sim.executeCommand({
                    type: "INTRODUCE_BILL",
                    title: title.trim(),
                    summary: summary.trim(),
                    policyItems: [{ issueId, direction, magnitude, fiscalImpact: null }],
                  });
                  if (props.report(r) && r.ok) {
                    setTitle("");
                    setSummary("");
                  }
                  props.onDone();
                }}
              >
                Introduce
              </button>
            </div>
          ) : null}
          <div className="card">
            <h3>Bills</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Sponsor</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(props.snap.legislatureRuntime.bills)
                  .slice()
                  .reverse()
                  .map((b) => (
                    <tr key={b.id} onClick={() => props.setSelectedBill(b.id)}>
                      <td>{b.title}</td>
                      <td>{billStatusLabel(b.status)}</td>
                      <td>{politicianDisplayName(props.catalog, b.sponsorId)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {bill ? (
            <div className="card">
              <h3>{bill.title}</h3>
              <p className="muted">
                {billStatusLabel(bill.status)} · {committeeDisplayName(bill.assignedCommitteeId)}
              </p>
              {bill.summary ? <p>{bill.summary}</p> : null}
              <p>
                Sponsor: {politicianDisplayName(props.catalog, bill.sponsorId)}
                {bill.cosponsorIds.length
                  ? ` · Cosponsors: ${bill.cosponsorIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`
                  : ""}
              </p>
              <h4>Policy</h4>
              {bill.policyItems.map((p, i) => (
                <div key={`${p.issueId}-${i}`}>{policyItemDisplay(props.catalog, p)}</div>
              ))}
              <h4>Recommendations</h4>
              <p>
                Party:{" "}
                {stanceLabel(
                  partyStance(
                    props.snap,
                    props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? null,
                    bill.id,
                  ),
                )}
                {" · "}
                Faction:{" "}
                {stanceLabel(
                  factionStance(
                    props.snap,
                    props.snap.politicians[props.snap.playerPoliticianId]?.factionId ?? null,
                    bill.id,
                  ),
                )}
              </p>
              {whip ? (
                <p>
                  Whip estimate: likely yes {whip.likelyYes} (range {whip.yesRange[0]}–
                  {whip.yesRange[1]}), likely no {whip.likelyNo}, uncertain {whip.uncertain}
                </p>
              ) : null}
              {bill.committeeVoteId || bill.floorVoteId || bill.repassageVoteId ? (
                <div>
                  <h4>Recorded votes</h4>
                  {[bill.committeeVoteId, bill.floorVoteId, bill.repassageVoteId]
                    .filter((id): id is string => !!id)
                    .map((id) => {
                      const v = props.snap.legislatureRuntime.legislativeVotes[id];
                      if (!v) return null;
                      return (
                        <div key={id}>
                          {v.stage}: {v.passed ? "passed" : "failed"} · Yes {v.yes} / No {v.no} /
                          Abstain {v.abstain}
                        </div>
                      );
                    })}
                </div>
              ) : null}
              {bill.amendmentIds.length > 0 ? (
                <div>
                  <h4>Amendments</h4>
                  {bill.amendmentIds.map((id) => {
                    const a = props.snap.legislatureRuntime.amendments[id];
                    if (!a) return null;
                    return (
                      <div key={id}>
                        {politicianDisplayName(props.catalog, a.sponsorId)} · {a.status} ·{" "}
                        {a.policyItems.map((p) => policyItemDisplay(props.catalog, p)).join("; ")}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {mp ? (
                <div className="row" style={{ marginTop: "0.6rem" }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      props.report(
                        props.sim.executeCommand({ type: "COSPONSOR_BILL", billId: bill.id }),
                      );
                      props.onDone();
                    }}
                  >
                    Cosponsor
                  </button>
                  {speaker &&
                  (bill.status === "floor_scheduled" || bill.status === "repassage_scheduled") ? (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          props.report(
                            props.sim.executeCommand({ type: "SCHEDULE_BILL", billId: bill.id }),
                          );
                          props.onDone();
                        }}
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          props.report(
                            props.sim.executeCommand({ type: "DELAY_BILL", billId: bill.id }),
                          );
                          props.onDone();
                        }}
                      >
                        Delay
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {mp &&
              ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status) ? (
                <div style={{ marginTop: "0.8rem" }}>
                  <h4>Propose amendment</h4>
                  <p className="muted">Choose the item to change. Magnitude is not auto-cut.</p>
                  <div className="row">
                    <select
                      value={amendIssue || bill.policyItems[0]?.issueId || ""}
                      onChange={(e) => setAmendIssue(e.target.value)}
                    >
                      {bill.policyItems.map((p) => (
                        <option key={p.issueId} value={p.issueId}>
                          {issueDisplayName(props.catalog, p.issueId)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={String(amendDir)}
                      onChange={(e) => setAmendDir(Number(e.target.value) as 1 | -1)}
                    >
                      <option value="1">For</option>
                      <option value="-1">Against</option>
                    </select>
                    <label>
                      Intensity {amendMag.toFixed(2)}
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={amendMag}
                        onChange={(e) => setAmendMag(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const target = amendIssue || bill.policyItems[0]?.issueId;
                        if (!target) return;
                        const items = bill.policyItems.map((p) =>
                          p.issueId === target
                            ? { ...p, direction: amendDir, magnitude: amendMag }
                            : p,
                        );
                        props.report(
                          props.sim.executeCommand({
                            type: "PROPOSE_AMENDMENT",
                            billId: bill.id,
                            policyItems: items,
                          }),
                        );
                        props.onDone();
                      }}
                    >
                      Propose amendment
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
