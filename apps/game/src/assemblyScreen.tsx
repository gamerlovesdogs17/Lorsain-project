import { useState } from "react";
import {
  currentAssemblyMemberIds,
  currentProvisionOption,
  estimatedProvisionEffects,
  partyStance,
  factionStance,
  LEGISLATIVE_PROVISIONS,
  legislativeProvision,
  policyItemForProvision,
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
import { PageHeader, TabBar, BillProgressTrack } from "./ui/kit.js";

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
  const [tab, setTab] = useState<AssemblyTab>("bills");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [draftProvisions, setDraftProvisions] = useState<Array<{ provisionId: string; optionId: string }>>([
    { provisionId: LEGISLATIVE_PROVISIONS[0]?.id ?? "", optionId: "high" },
  ]);
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
  const draftItems = draftProvisions.flatMap((draft) => {
    const item = policyItemForProvision(draft.provisionId, draft.optionId);
    return item ? [item] : [];
  });

  return (
    <div>
      <PageHeader
        kicker="Legislature"
        title="National Assembly"
        subtitle={`${mps.length} sitting of ${props.world.legislativeConstitution.assemblySeatCount} authorized seats.`}
      />
      <TabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "bills", label: "Bills" },
          { id: "committees", label: "Committees" },
          { id: "votes", label: "Votes" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "overview" ? (
        <div className="card">
          <h3>Chamber composition</h3>
          <p>
            {mps.length} sitting of {props.world.legislativeConstitution.assemblySeatCount}{" "}
            authorized seats. Majority at{" "}
            {Math.floor(props.world.legislativeConstitution.assemblySeatCount / 2) + 1}.
          </p>
          <div className="composition-bar" aria-label="Party composition">
            {[...counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([party, n]) => (
                <div
                  key={party}
                  className="composition-seg"
                  style={{
                    width: `${(n / props.world.legislativeConstitution.assemblySeatCount) * 100}%`,
                    background: partyColor(props.world, party === "none" ? null : party),
                  }}
                  title={`${partyDisplayName(props.world, party === "none" ? null : party, props.snap)} ${n}`}
                />
              ))}
          </div>
          <p className="majority-note muted">
            Player party highlighted below. This is sitting membership, not a vote forecast.
          </p>
          <div className="chamber-blocks">
            {[...counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([party, n]) => {
                const playerParty =
                  props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? "none";
                return (
                  <div
                    key={party}
                    className={`chamber-block${party === playerParty ? " player-party" : ""}`}
                  >
                    {Array.from({ length: n }, (_, i) => (
                      <span
                        key={i}
                        className="seat"
                        style={{
                          background: partyColor(props.world, party === "none" ? null : party),
                        }}
                      />
                    ))}
                    <div className="muted" style={{ flexBasis: "100%", marginTop: "0.25rem" }}>
                      {partyDisplayName(props.world, party === "none" ? null : party, props.snap)} ·{" "}
                      {n}
                    </div>
                  </div>
                );
              })}
          </div>
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
                const metaTitle =
                  typeof v.metadata?.displayTitle === "string"
                    ? v.metadata.displayTitle
                    : typeof v.metadata?.title === "string" && v.metadata?.kind === "treaty_ratification"
                      ? `Treaty ratification: ${v.metadata.title}`
                      : null;
                const stageLabel =
                  v.metadata?.kind === "treaty_ratification"
                    ? "Treaty ratification"
                    : v.stage;
                return (
                  <tr key={v.id}>
                    <td>{parent?.title ?? metaTitle ?? v.billId}</td>
                    <td>{stageLabel}</td>
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
      {tab === "bills" ? (
        <>
          {mp ? (
            <div className="card bill-builder" style={{ margin: "0.8rem 0" }}>
              <div className="section-heading-row">
                <div>
                  <h3>Draft legislation</h3>
                  <p className="muted">Choose one required provision and up to two related provisions.</p>
                </div>
                <span className="badge">{draftProvisions.length}/3 provisions</span>
              </div>
              <div className="bill-builder-provisions">
                {draftProvisions.map((draft, index) => {
                  const definition = legislativeProvision(draft.provisionId) ?? LEGISLATIVE_PROVISIONS[0]!;
                  const option = definition.options.find((candidate) => candidate.id === draft.optionId) ?? definition.options[1]!;
                  const current = currentProvisionOption(props.snap, definition.id);
                  const item = policyItemForProvision(definition.id, option.id);
                  const effects = item ? estimatedProvisionEffects(item) : {};
                  const effectRows = Object.entries(effects).filter(([, value]) => typeof value === "number" && Math.abs(value) >= 0.01);
                  return (
                    <div className="bill-provision" key={`${index}-${draft.provisionId}`}>
                      <div className="bill-provision-controls">
                        <label>
                          Policy category
                          <select
                            value={definition.id}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              setDraftProvisions((rows) => rows.map((row, rowIndex) =>
                                rowIndex === index ? { provisionId: nextId, optionId: "high" } : row,
                              ));
                            }}
                          >
                            {LEGISLATIVE_PROVISIONS.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>{candidate.category}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Proposed rule
                          <select
                            value={option.id}
                            onChange={(event) => setDraftProvisions((rows) => rows.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, optionId: event.target.value } : row,
                            ))}
                          >
                            {definition.options.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                            ))}
                          </select>
                        </label>
                        {draftProvisions.length > 1 ? (
                          <button className="btn ghost" type="button" onClick={() =>
                            setDraftProvisions((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                          }>Remove</button>
                        ) : null}
                      </div>
                      <div className="bill-provision-brief">
                        <div><span>Current</span><strong>{current?.label ?? definition.currentLawLabel}</strong></div>
                        <div><span>Change</span><strong>{option.change}</strong></div>
                        <div>
                          <span>Estimated national effect</span>
                          <strong>{effectRows.length ? effectRows.map(([key, value]) =>
                            `${key.replace("Index", "").replace(/([A-Z])/g, " $1").toLowerCase()} ${(value as number) > 0 ? "+" : ""}${(value as number).toFixed(2)}`,
                          ).join(" · ") : "No material direct index effect"}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {draftProvisions.length < 3 ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const next = LEGISLATIVE_PROVISIONS.find((definition) =>
                      !draftProvisions.some((row) => row.provisionId === definition.id),
                    );
                    if (next) setDraftProvisions((rows) => [...rows, { provisionId: next.id, optionId: "high" }]);
                  }}
                >Add provision</button>
              ) : null}
              <div className="bill-copy-fields">
                <input
                  className="search"
                  placeholder="Optional title — a formal title will be generated"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <input
                  className="search"
                  placeholder="Optional sponsor statement"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn"
                style={{ marginTop: "0.5rem" }}
                disabled={draftItems.length < 1 || new Set(draftProvisions.map((row) => row.provisionId)).size !== draftProvisions.length}
                onClick={() => {
                  const r = props.sim.executeCommand({
                    type: "INTRODUCE_BILL",
                    title: title.trim(),
                    summary: summary.trim(),
                    policyItems: draftItems,
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
              <BillProgressTrack status={bill.status} />
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
