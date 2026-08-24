import { useState } from "react";
import {
  collectPlayerActionableDecisions,
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
  type NationalEconomyIndices,
  type PolicyItem,
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
import {
  BillProgressTrack,
  BriefStrip,
  DataTable,
  EntityRow,
  PageHeader,
  PolicyChoiceGroup,
  SectionDivider,
  StatusBadge,
  TabBar,
  WorkLayout,
  type PolicyChoiceOption,
} from "./ui/kit.js";

type ChamberTab = "business" | "draft" | "committees" | "votes";
type BillDetailTab = "overview" | "provisions" | "politics" | "process";

const EFFECT_LABELS: Record<keyof NationalEconomyIndices, string> = {
  outputIndex: "Output",
  employmentIndex: "Jobs",
  priceIndex: "Prices",
  realWageIndex: "Wages",
  housingIndex: "Housing",
  confidenceIndex: "Confidence",
  fiscalPressure: "Pressure",
};

function oneLine(text: string): string {
  const sentence = text.split(/(?<=\.)\s/)[0] ?? text;
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence;
}

function formatFiscal(impact: number | null | undefined): string | undefined {
  if (impact == null) return undefined;
  if (Math.abs(impact) < 0.005) return "No fiscal change";
  const rounded = Math.round(impact * 10) / 10;
  return impact > 0 ? `Cost +${rounded.toFixed(1)}` : `Savings ${Math.abs(rounded).toFixed(1)}`;
}

function effectChips(effects: Partial<NationalEconomyIndices>): PolicyChoiceOption["effects"] {
  return Object.entries(effects)
    .filter((entry): entry is [keyof NationalEconomyIndices, number] => {
      const value = entry[1];
      return typeof value === "number" && Math.abs(value) >= 0.01;
    })
    .map(([key, value]) => {
      const rounded = Math.round(value * 10) / 10;
      const label = EFFECT_LABELS[key] ?? String(key);
      const sign = value > 0 ? "+" : "−";
      return {
        label: `${label} ${sign}${Math.abs(rounded).toFixed(1)}`,
        tone: (value > 0 ? "up" : "down") as "up" | "down",
      };
    });
}

function statusTone(status: string): "ok" | "warn" | "idle" {
  if (status === "enacted" || status === "floor_passed" || status === "sent_to_president") return "ok";
  if (status === "failed" || status === "withdrawn" || status === "returned") return "warn";
  return "idle";
}

function provisionChoices(
  snap: SimState,
  definitionId: string,
): { definition: (typeof LEGISLATIVE_PROVISIONS)[number]; options: PolicyChoiceOption[]; currentLabel: string } {
  const definition = legislativeProvision(definitionId) ?? LEGISLATIVE_PROVISIONS[0]!;
  const current = currentProvisionOption(snap, definition.id);
  const options: PolicyChoiceOption[] = definition.options.map((opt) => {
    const item = policyItemForProvision(definition.id, opt.id);
    const effects = item ? effectChips(estimatedProvisionEffects(item)) : [];
    const cost = formatFiscal(opt.fiscalImpact);
    const choice: PolicyChoiceOption = {
      id: opt.id,
      label: opt.label,
      summary: oneLine(opt.change),
      current: current ? opt.id === current.id : opt.id === "current",
    };
    if (cost) choice.cost = cost;
    if (effects?.length) choice.effects = effects;
    return choice;
  });
  return {
    definition,
    options,
    currentLabel: current?.label ?? definition.currentLawLabel,
  };
}

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
  const [chamberTab, setChamberTab] = useState<ChamberTab>("business");
  const [billTab, setBillTab] = useState<BillDetailTab>("overview");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [draftProvisions, setDraftProvisions] = useState<Array<{ provisionId: string; optionId: string }>>([
    { provisionId: LEGISLATIVE_PROVISIONS[0]?.id ?? "", optionId: "high" },
  ]);
  const [amendIssue, setAmendIssue] = useState("");
  const [amendDir, setAmendDir] = useState<1 | -1>(1);
  const [amendMag, setAmendMag] = useState(0.4);

  const mps = currentAssemblyMemberIds(props.world, props.snap);
  const seatCount = props.world.legislativeConstitution.assemblySeatCount;
  const majority = Math.floor(seatCount / 2) + 1;
  const counts = new Map<string, number>();
  for (const id of mps) {
    const party = props.snap.politicians[id]?.partyId ?? "none";
    counts.set(party, (counts.get(party) ?? 0) + 1);
  }
  const partyRanks = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const playerParty = props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? "none";

  const bill = props.selectedBill ? props.snap.legislatureRuntime.bills[props.selectedBill] : null;
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const speaker = isSpeaker(props.world, props.snap, props.snap.playerPoliticianId);
  const whip = bill ? whipEstimate(props.world, props.snap, bill.id) : null;
  const votes = Object.values(props.snap.legislatureRuntime.legislativeVotes).sort((a, b) =>
    a.id < b.id ? 1 : -1,
  );
  const allBills = Object.values(props.snap.legislatureRuntime.bills).slice().reverse();
  const currentBusiness = allBills.filter((b) =>
    ["floor_scheduled", "repassage_scheduled", "committee"].includes(b.status),
  );
  const floorQueue = allBills.filter((b) =>
    b.status === "floor_scheduled" || b.status === "repassage_scheduled",
  );
  const draftItems = draftProvisions.flatMap((draft) => {
    const item = policyItemForProvision(draft.provisionId, draft.optionId);
    return item ? [item] : [];
  });

  const actionable = collectPlayerActionableDecisions(props.world, props.snap);
  const votesDue = actionable.filter((d) =>
    ["committee_vote", "floor_vote", "repassage_vote", "amendment_vote", "motion_vote"].includes(d.kind),
  );

  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    props.report(props.sim.executeCommand(command));
    props.onDone();
  };

  const selectBill = (id: string) => {
    props.setSelectedBill(id);
    setBillTab("overview");
    setChamberTab("business");
  };

  const chamberTabs: Array<{ id: ChamberTab; label: string }> = [
    { id: "business", label: "Business" },
    ...(mp ? [{ id: "draft" as const, label: "Introduce" }] : []),
    { id: "committees", label: "Committees" },
    { id: "votes", label: "Votes" },
  ];

  const compositionHeader = (
    <>
      <div className="composition-strip">
        <div className="composition-bar" aria-label="Party composition">
          {partyRanks.map(([party, n]) => (
            <div
              key={party}
              className="composition-seg"
              style={{
                width: `${(n / seatCount) * 100}%`,
                background: partyColor(props.world, party === "none" ? null : party),
              }}
              title={`${partyDisplayName(props.world, party === "none" ? null : party, props.snap)} ${n}`}
            />
          ))}
        </div>
        <p className="majority-note muted">
          Majority at {majority} · {mps.length} sitting of {seatCount} · composition, not a vote forecast
        </p>
        <div className="composition-legend">
          {partyRanks.map(([party, n]) => (
            <span key={party} className={party === playerParty ? "player-party" : undefined}>
              <span
                className="seat"
                style={{ background: partyColor(props.world, party === "none" ? null : party) }}
              />
              {partyDisplayName(props.world, party === "none" ? null : party, props.snap)} · {n}
            </span>
          ))}
        </div>
      </div>
      <BriefStrip
        items={[
          { label: "Sitting", value: `${mps.length}/${seatCount}` },
          { label: "Majority", value: majority },
          { label: "On floor", value: floorQueue.length },
          { label: "Votes due", value: votesDue.length },
        ]}
      />
    </>
  );

  const rail =
    mp || speaker ? (
      <>
        <SectionDivider title="Votes due" hint={votesDue.length ? "Cast before month close" : "None pending"} />
        {votesDue.length === 0 ? (
          <p className="muted">No legislative votes waiting on you.</p>
        ) : (
          votesDue.map((d) => (
            <div key={d.key} className="rail-vote">
              <div className="entity-row-title">{d.label}</div>
              <div className="row" style={{ marginTop: "0.35rem" }}>
                {d.kind === "motion_vote" ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice: "yes" })}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice: "no" })}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice: "abstain" })
                      }
                    >
                      Abstain
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({
                          type: "CAST_LEGISLATIVE_VOTE",
                          billId: d.billId!,
                          stage: d.stage!,
                          choice: "yes",
                          ...(d.amendmentId ? { amendmentId: d.amendmentId } : {}),
                        })
                      }
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "CAST_LEGISLATIVE_VOTE",
                          billId: d.billId!,
                          stage: d.stage!,
                          choice: "no",
                          ...(d.amendmentId ? { amendmentId: d.amendmentId } : {}),
                        })
                      }
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "CAST_LEGISLATIVE_VOTE",
                          billId: d.billId!,
                          stage: d.stage!,
                          choice: "abstain",
                          ...(d.amendmentId ? { amendmentId: d.amendmentId } : {}),
                        })
                      }
                    >
                      Abstain
                    </button>
                  </>
                )}
              </div>
              {d.billId ? (
                <button type="button" className="btn ghost" onClick={() => selectBill(d.billId!)}>
                  Open bill
                </button>
              ) : null}
            </div>
          ))
        )}
        {speaker ? (
          <>
            <SectionDivider title="Speaker" hint="Floor schedule" />
            {floorQueue.length === 0 ? (
              <p className="muted">No bills on the floor calendar.</p>
            ) : (
              floorQueue.map((b) => (
                <div key={b.id} className="rail-vote">
                  <div className="entity-row-title">{b.title}</div>
                  <div className="muted">{billStatusLabel(b.status)}</div>
                  <div className="row" style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => run({ type: "SCHEDULE_BILL", billId: b.id })}
                    >
                      Schedule
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => run({ type: "DELAY_BILL", billId: b.id })}
                    >
                      Delay
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        ) : null}
      </>
    ) : undefined;

  return (
    <div>
      <PageHeader
        kicker="Legislature"
        title="National Assembly"
        subtitle={`${mps.length} sitting of ${seatCount} authorized seats.`}
      />
      <WorkLayout
        header={compositionHeader}
        main={
          <>
            <TabBar tabs={chamberTabs} value={chamberTab} onChange={setChamberTab} />

            {chamberTab === "business" ? (
              <>
                <SectionDivider
                  title="Current business"
                  hint="Floor-scheduled and pending chamber work"
                />
                {currentBusiness.length === 0 ? (
                  <p className="muted">No bills on the active calendar.</p>
                ) : (
                  currentBusiness.map((b) => (
                    <EntityRow
                      key={b.id}
                      title={b.title}
                      meta={`${committeeDisplayName(b.assignedCommitteeId)} · ${politicianDisplayName(props.catalog, b.sponsorId)}`}
                      status={<StatusBadge tone={statusTone(b.status)}>{billStatusLabel(b.status)}</StatusBadge>}
                      selected={props.selectedBill === b.id}
                      onClick={() => selectBill(b.id)}
                    />
                  ))
                )}

                <SectionDivider title="Bills" hint="All introduced measures" />
                <DataTable headers={["Title", "Status", "Sponsor"]} dense>
                  {allBills.map((b) => (
                    <tr
                      key={b.id}
                      className={props.selectedBill === b.id ? "selected" : undefined}
                      onClick={() => selectBill(b.id)}
                    >
                      <td>{b.title}</td>
                      <td>
                        <StatusBadge tone={statusTone(b.status)}>{billStatusLabel(b.status)}</StatusBadge>
                      </td>
                      <td>{politicianDisplayName(props.catalog, b.sponsorId)}</td>
                    </tr>
                  ))}
                </DataTable>

                {bill ? (
                  <div className="bill-inspector">
                    <SectionDivider
                      title={bill.title}
                      hint={billStatusLabel(bill.status)}
                      actions={
                        <button type="button" className="btn ghost" onClick={() => props.setSelectedBill(null)}>
                          Close
                        </button>
                      }
                    />
                    <BillProgressTrack status={bill.status} />
                    <TabBar
                      tabs={[
                        { id: "overview", label: "Overview" },
                        { id: "provisions", label: "Provisions" },
                        { id: "politics", label: "Politics" },
                        { id: "process", label: "Process" },
                      ]}
                      value={billTab}
                      onChange={setBillTab}
                    />

                    {billTab === "overview" ? (
                      <div className="bill-tab-body">
                        <BriefStrip
                          items={[
                            { label: "Status", value: billStatusLabel(bill.status) },
                            { label: "Committee", value: committeeDisplayName(bill.assignedCommitteeId) },
                            {
                              label: "Sponsor",
                              value: politicianDisplayName(props.catalog, bill.sponsorId),
                            },
                            { label: "Cosponsors", value: bill.cosponsorIds.length },
                          ]}
                        />
                        {bill.summary ? <p>{oneLine(bill.summary)}</p> : null}
                        {mp ? (
                          <div className="row" style={{ marginTop: "0.6rem" }}>
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => run({ type: "COSPONSOR_BILL", billId: bill.id })}
                            >
                              Cosponsor
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {billTab === "provisions" ? (
                      <div className="bill-tab-body">
                        {bill.policyItems.map((p: PolicyItem, i: number) => (
                          <EntityRow
                            key={`${p.issueId}-${i}`}
                            title={policyItemDisplay(props.catalog, p)}
                            meta={issueDisplayName(props.catalog, p.issueId)}
                          />
                        ))}
                        {mp &&
                        ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status) ? (
                          <div style={{ marginTop: "0.8rem" }}>
                            <SectionDivider title="Propose amendment" hint="Magnitude is not auto-cut" />
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
                                  run({
                                    type: "PROPOSE_AMENDMENT",
                                    billId: bill.id,
                                    policyItems: items,
                                  });
                                }}
                              >
                                Propose amendment
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {billTab === "politics" ? (
                      <div className="bill-tab-body">
                        <BriefStrip
                          items={[
                            {
                              label: "Party",
                              value: stanceLabel(
                                partyStance(
                                  props.snap,
                                  props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? null,
                                  bill.id,
                                ),
                              ),
                            },
                            {
                              label: "Faction",
                              value: stanceLabel(
                                factionStance(
                                  props.snap,
                                  props.snap.politicians[props.snap.playerPoliticianId]?.factionId ?? null,
                                  bill.id,
                                ),
                              ),
                            },
                            ...(whip
                              ? [
                                  {
                                    label: "Whip yes",
                                    value: `${whip.likelyYes} (${whip.yesRange[0]}–${whip.yesRange[1]})`,
                                  },
                                  { label: "Uncertain", value: whip.uncertain },
                                ]
                              : []),
                          ]}
                        />
                        {whip ? (
                          <p className="muted">
                            Likely no {whip.likelyNo} · estimate only, not a recorded whip.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {billTab === "process" ? (
                      <div className="bill-tab-body">
                        {bill.committeeVoteId || bill.floorVoteId || bill.repassageVoteId ? (
                          <>
                            <SectionDivider title="Recorded votes" />
                            {[bill.committeeVoteId, bill.floorVoteId, bill.repassageVoteId]
                              .filter((id): id is string => !!id)
                              .map((id) => {
                                const v = props.snap.legislatureRuntime.legislativeVotes[id];
                                if (!v) return null;
                                return (
                                  <EntityRow
                                    key={id}
                                    title={v.stage}
                                    meta={`Yes ${v.yes} / No ${v.no} / Abstain ${v.abstain}`}
                                    status={
                                      <StatusBadge tone={v.passed ? "ok" : "warn"}>
                                        {v.passed ? "Passed" : "Failed"}
                                      </StatusBadge>
                                    }
                                  />
                                );
                              })}
                          </>
                        ) : (
                          <p className="muted">No recorded votes yet.</p>
                        )}
                        {bill.amendmentIds.length > 0 ? (
                          <>
                            <SectionDivider title="Amendments" />
                            {bill.amendmentIds.map((id) => {
                              const a = props.snap.legislatureRuntime.amendments[id];
                              if (!a) return null;
                              return (
                                <EntityRow
                                  key={id}
                                  title={politicianDisplayName(props.catalog, a.sponsorId)}
                                  meta={a.policyItems
                                    .map((p) => policyItemDisplay(props.catalog, p))
                                    .join("; ")}
                                  status={<StatusBadge>{a.status}</StatusBadge>}
                                />
                              );
                            })}
                          </>
                        ) : null}
                        {bill.cosponsorIds.length > 0 ? (
                          <p className="muted" style={{ marginTop: "0.6rem" }}>
                            Cosponsors:{" "}
                            {bill.cosponsorIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {chamberTab === "draft" && mp ? (
              <>
                <SectionDivider
                  title="Draft legislation"
                  hint="One required provision, up to two related"
                  actions={<StatusBadge>{draftProvisions.length}/3 provisions</StatusBadge>}
                />
                {draftProvisions.map((draft, index) => {
                  const { definition, options, currentLabel } = provisionChoices(
                    props.snap,
                    draft.provisionId,
                  );
                  const selected =
                    definition.options.find((o) => o.id === draft.optionId) ?? definition.options[1]!;
                  return (
                    <div key={`${index}-${draft.provisionId}`}>
                      <label className="draft-category">
                        Policy category
                        <select
                          value={definition.id}
                          onChange={(event) => {
                            const nextId = event.target.value;
                            setDraftProvisions((rows) =>
                              rows.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { provisionId: nextId, optionId: "high" }
                                  : row,
                              ),
                            );
                          }}
                        >
                          {LEGISLATIVE_PROVISIONS.map((candidate) => (
                            <option
                              key={candidate.id}
                              value={candidate.id}
                              disabled={
                                draftProvisions.some(
                                  (row, rowIndex) =>
                                    rowIndex !== index && row.provisionId === candidate.id,
                                )
                              }
                            >
                              {candidate.category}
                            </option>
                          ))}
                        </select>
                      </label>
                      <PolicyChoiceGroup
                        title={definition.category}
                        currentLabel={currentLabel}
                        options={options}
                        selectedId={draft.optionId}
                        onSelect={(optionId) =>
                          setDraftProvisions((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, optionId } : row,
                            ),
                          )
                        }
                        details={
                          <>
                            <p>{selected.change}</p>
                            {draftProvisions.length > 1 ? (
                              <button
                                className="btn ghost"
                                type="button"
                                onClick={() =>
                                  setDraftProvisions((rows) =>
                                    rows.filter((_, rowIndex) => rowIndex !== index),
                                  )
                                }
                              >
                                Remove provision
                              </button>
                            ) : null}
                          </>
                        }
                      />
                    </div>
                  );
                })}
                {draftProvisions.length < 3 ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const next = LEGISLATIVE_PROVISIONS.find(
                        (definition) =>
                          !draftProvisions.some((row) => row.provisionId === definition.id),
                      );
                      if (next) {
                        setDraftProvisions((rows) => [
                          ...rows,
                          { provisionId: next.id, optionId: "high" },
                        ]);
                      }
                    }}
                  >
                    Add provision
                  </button>
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
                  disabled={
                    draftItems.length < 1 ||
                    new Set(draftProvisions.map((row) => row.provisionId)).size !==
                      draftProvisions.length
                  }
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
              </>
            ) : null}

            {chamberTab === "committees" ? (
              <>
                <SectionDivider title="Committees" />
                {Object.values(props.snap.legislatureRuntime.committees).map((c) => (
                  <EntityRow
                    key={c.id}
                    title={committeeDisplayName(c.id)}
                    meta={`${c.memberIds.length} members · ${c.memberIds
                      .slice(0, 8)
                      .map((id) => politicianDisplayName(props.catalog, id))
                      .join(" · ")}${c.memberIds.length > 8 ? " …" : ""}`}
                  />
                ))}
              </>
            ) : null}

            {chamberTab === "votes" ? (
              <>
                <SectionDivider title="Completed votes" />
                <DataTable headers={["Bill", "Stage", "Result"]} dense>
                  {votes.slice(0, 30).map((v) => {
                    const parent = props.snap.legislatureRuntime.bills[v.billId];
                    const metaTitle =
                      typeof v.metadata?.displayTitle === "string"
                        ? v.metadata.displayTitle
                        : typeof v.metadata?.title === "string" &&
                            v.metadata?.kind === "treaty_ratification"
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
                </DataTable>
              </>
            ) : null}
          </>
        }
        rail={rail}
      />
    </div>
  );
}
