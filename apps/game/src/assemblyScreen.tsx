import { useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  collectPlayerActionableDecisions,
  CONSTITUTIONAL_RULE_IDS,
  currentAssemblyMemberIds,
  currentProvisionOption,
  defaultProvisionOptionId,
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
import { ConstitutionBrowser } from "./constitutionBrowser.js";
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
import { PoliticianProfile } from "./ui/politician.js";
import { TerenaMap } from "./map/TerenaMap.js";

type ChamberTab = "business" | "draft" | "committees" | "votes" | "lawbook";
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

const ORIGINAL_CONSTITUTIONAL_VALUES: Record<(typeof CONSTITUTIONAL_RULE_IDS)[number], number> = {
  assembly_term_years: 4,
  presidential_term_limit: 2,
  court_term_years: 12,
  veto_override_fraction: 2 / 3,
};

function AssemblyHemicycle(props: {
  world: KernelWorld;
  snap: SimState;
  catalog: PresentationCatalog;
  memberIds: string[];
  selectedId: string | null;
  leadershipIds?: Set<string>;
  voteByMember?: Record<string, "yes" | "no" | "abstain" | "absent"> | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const grouped = props.memberIds.slice().sort((a, b) => {
    const ap = props.snap.politicians[a]?.partyId ?? "";
    const bp = props.snap.politicians[b]?.partyId ?? "";
    return ap.localeCompare(bp) || a.localeCompare(b);
  });
  // Tighter packing: smaller ring step and denser seats for a chamber-like semicircle.
  const ringCounts = [24, 28, 32, 36, 40, 44, 48, 52, 56, 60] as const;
  let offset = 0;
  return (
    <svg
      className="assembly-hemicycle assembly-hemicycle-tight"
      viewBox="0 0 340 188"
      role="img"
      aria-label="420-seat National Assembly chamber"
    >
      {ringCounts.flatMap((count, ring) => {
        const radius = 48 + ring * 7.6;
        const start = offset;
        offset += count;
        return Array.from({ length: count }, (_, index) => {
          const memberId = grouped[start + index];
          if (!memberId) return null;
          const angle = Math.PI - (index / Math.max(1, count - 1)) * Math.PI;
          const x = 170 + Math.cos(angle) * radius;
          const y = 174 - Math.sin(angle) * radius;
          const partyId = props.snap.politicians[memberId]?.partyId ?? null;
          const isLeader = props.leadershipIds?.has(memberId) ?? false;
          const vote = props.voteByMember?.[memberId];
          const fill =
            vote === "yes"
              ? "#1f6b4a"
              : vote === "no"
                ? "#8b2e2e"
                : vote === "abstain"
                  ? "#9a6b16"
                  : vote === "absent"
                    ? "#9aa8b8"
                    : partyColor(props.world, partyId);
          return (
            <circle
              key={memberId}
              cx={x}
              cy={y}
              r={memberId === props.selectedId ? 3.4 : isLeader ? 2.7 : 2.05}
              fill={fill}
              stroke={isLeader ? "var(--navy, #0f2f45)" : "transparent"}
              strokeWidth={isLeader ? 1.1 : 0}
              className={memberId === props.selectedId ? "assembly-seat selected" : "assembly-seat"}
              tabIndex={0}
              role="button"
              aria-label={`${politicianDisplayName(props.catalog, memberId)}, ${partyDisplayName(props.world, partyId, props.snap)}${isLeader ? ", leadership" : ""}${vote ? `, vote ${vote}` : ""}`}
              onClick={() => props.onSelect(memberId)}
              onMouseEnter={() => props.onHover?.(memberId)}
              onMouseLeave={() => props.onHover?.(null)}
              onFocus={() => props.onHover?.(memberId)}
              onBlur={() => props.onHover?.(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") props.onSelect(memberId);
              }}
            />
          );
        });
      })}
    </svg>
  );
}

function oneLine(text: string): string {
  const sentence = text.split(/(?<=\.)\s/)[0] ?? text;
  return sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence;
}

function formatFiscal(impact: number | null | undefined): string | undefined {
  if (impact == null) return undefined;
  if (Math.abs(impact) < 0.005) return "No fiscal change";
  if (Math.abs(impact) < 0.05) return "Minimal fiscal effect";
  const rounded = Math.round(impact * 10) / 10;
  return impact > 0 ? `Cost +${rounded.toFixed(1)}` : `Savings ${Math.abs(rounded).toFixed(1)}`;
}

function effectChips(effects: Partial<NationalEconomyIndices>): PolicyChoiceOption["effects"] {
  return Object.entries(effects)
    .filter((entry): entry is [keyof NationalEconomyIndices, number] => {
      const value = entry[1];
      return typeof value === "number" && Math.abs(value) >= 0.05;
    })
    .map(([key, value]) => {
      const rounded = Math.round(value * 10) / 10;
      const label = EFFECT_LABELS[key] ?? String(key);
      const signed = rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
      return {
        label: `${label} ${signed}`,
        tone: "flat" as const,
      };
    });
}

function statusTone(status: string): "ok" | "warn" | "idle" {
  if (status === "enacted" || status === "floor_passed" || status === "sent_to_president")
    return "ok";
  if (status === "failed" || status === "withdrawn" || status === "returned") return "warn";
  return "idle";
}

function provisionChoices(
  snap: SimState,
  definitionId: string,
): {
  definition: (typeof LEGISLATIVE_PROVISIONS)[number];
  options: PolicyChoiceOption[];
  currentLabel: string;
} {
  const definition = legislativeProvision(definitionId) ?? LEGISLATIVE_PROVISIONS[0]!;
  const current = currentProvisionOption(snap, definition.id);
  const options: PolicyChoiceOption[] = definition.options
    .filter((opt) => !opt.founding && opt.id !== current?.id)
    .map((opt) => {
      const item = policyItemForProvision(definition.id, opt.id);
      const effects = item ? effectChips(estimatedProvisionEffects(item)) : [];
      const cost = formatFiscal(opt.fiscalImpact);
      const choice: PolicyChoiceOption = {
        id: opt.id,
        label: opt.label,
        summary: oneLine(opt.change),
        current: false,
        groups: opt.affectedGroups,
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
  bundle: ContentBundle;
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
  const [draftProvisions, setDraftProvisions] = useState<
    Array<{ provisionId: string; optionId: string }>
  >([
    {
      provisionId: LEGISLATIVE_PROVISIONS[0]?.id ?? "",
      optionId: defaultProvisionOptionId(LEGISLATIVE_PROVISIONS[0]?.id ?? ""),
    },
  ]);
  const [amendProvision, setAmendProvision] = useState("");
  const [amendOption, setAmendOption] = useState("");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const [rollCallFilter, setRollCallFilter] = useState<"all" | "yes" | "no" | "abstain">("all");
  const [lawQuery, setLawQuery] = useState("");

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
  const playerCaucusLeadership =
    playerParty !== "none" ? props.snap.legislatureRuntime.caucusLeadership[playerParty] : null;
  const playerMaySetWhip =
    !!playerCaucusLeadership &&
    [playerCaucusLeadership.floorLeaderId, playerCaucusLeadership.whipId].includes(
      props.snap.playerPoliticianId,
    );

  const bill = props.selectedBill ? props.snap.legislatureRuntime.bills[props.selectedBill] : null;
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const speaker = isSpeaker(props.world, props.snap, props.snap.playerPoliticianId);
  const whip = bill ? whipEstimate(props.world, props.snap, bill.id) : null;
  const votes = Object.values(props.snap.legislatureRuntime.legislativeVotes).sort((a, b) =>
    a.id < b.id ? 1 : -1,
  );
  const allBills = Object.values(props.snap.legislatureRuntime.bills).slice().reverse();
  const enactedLaws = Object.values(props.snap.legislatureRuntime.enactedLaws)
    .filter((law) => {
      const query = lawQuery.trim().toLowerCase();
      if (!query) return true;
      return `${law.title} ${law.policyItems.map((item) => policyItemDisplay(props.catalog, item)).join(" ")}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.enactedDate.localeCompare(a.enactedDate) || b.id.localeCompare(a.id));
  const currentBusiness = allBills.filter((b) =>
    ["floor_scheduled", "repassage_scheduled", "committee"].includes(b.status),
  );
  const committeeIds = Object.keys(props.snap.legislatureRuntime.committees).sort();
  const activeCommitteeId = selectedCommitteeId ?? committeeIds[0] ?? null;
  const selectedCommittee = activeCommitteeId
    ? props.snap.legislatureRuntime.committees[activeCommitteeId]
    : null;
  const floorQueue = allBills.filter(
    (b) => b.status === "floor_scheduled" || b.status === "repassage_scheduled",
  );
  const draftItems = draftProvisions.flatMap((draft) => {
    const item = policyItemForProvision(draft.provisionId, draft.optionId);
    return item ? [item] : [];
  });

  const actionable = collectPlayerActionableDecisions(props.world, props.snap);
  const votesDue = actionable.filter((d) =>
    ["committee_vote", "floor_vote", "repassage_vote", "amendment_vote", "motion_vote"].includes(
      d.kind,
    ),
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
    { id: "lawbook", label: "Law & Constitution" },
  ];
  const speakerHolderId =
    Object.values(props.snap.officeTerms).find(
      (term) =>
        (term.status === "active" || term.status === "suspended") &&
        props.world.offices[term.officeId]?.kind === "speaker",
    )?.holderId ?? null;
  const delegationLeaders = partyRanks.slice(0, 6).flatMap(([party]) => {
    if (party === "none") return [];
    const leadership = props.snap.legislatureRuntime.caucusLeadership[party];
    return leadership?.floorLeaderId
      ? [{ partyId: party, leaderId: leadership.floorLeaderId, whipId: leadership.whipId }]
      : [];
  });

  const compositionHeader = (
    <>
      <BriefStrip
        items={[
          { label: "Sitting", value: `${mps.length}/${seatCount}` },
          { label: "Majority", value: majority },
          { label: "On floor", value: floorQueue.length },
          { label: "Votes due", value: votesDue.length },
        ]}
      />
      <section className="assembly-chamber-stage" aria-label="Chamber and leadership">
        <div className="assembly-chamber-main">
          <div className="assembly-chamber-caption">
            <strong>National Assembly chamber</strong>
            <span className="muted">
              Leadership and composition shown together · outlined seats are leadership
            </span>
          </div>
          <AssemblyHemicycle
            world={props.world}
            snap={props.snap}
            catalog={props.catalog}
            memberIds={mps}
            selectedId={selectedMember}
            leadershipIds={
              new Set(
                [
                  speakerHolderId,
                  ...delegationLeaders.flatMap((row) => [row.leaderId, row.whipId].filter(Boolean)),
                ].filter((id): id is string => Boolean(id)),
              )
            }
            onSelect={setSelectedMember}
          />
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
            Majority at {majority} · {mps.length} sitting of {seatCount} · composition, not a vote
            forecast
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
        <aside className="assembly-leadership-rail" aria-label="Assembly leadership">
          <div className="assembly-speaker-desk">
            <span className="kicker">Presiding officer</span>
            <button
              type="button"
              className="assembly-leader-pick"
              disabled={!speakerHolderId}
              onClick={() => speakerHolderId && setSelectedMember(speakerHolderId)}
            >
              <strong>
                {speakerHolderId
                  ? politicianDisplayName(props.catalog, speakerHolderId)
                  : "Speaker vacant"}
              </strong>
              <small>Speaker of the National Assembly</small>
            </button>
          </div>
          <div className="assembly-delegation-leaders">
            <span className="kicker">Delegation leadership</span>
            {delegationLeaders.map((row) => (
              <button
                type="button"
                key={row.partyId}
                onClick={() => setSelectedMember(row.leaderId)}
              >
                <span
                  className="party-swatch"
                  style={{ background: partyColor(props.world, row.partyId) }}
                />
                <strong>{partyDisplayName(props.world, row.partyId, props.snap)}</strong>
                <small>
                  Floor leader · {politicianDisplayName(props.catalog, row.leaderId)}
                  {row.whipId ? ` · Whip ${politicianDisplayName(props.catalog, row.whipId)}` : ""}
                </small>
              </button>
            ))}
          </div>
        </aside>
      </section>
      {selectedMember ? (
        <div className="assembly-member-inspector">
          <PoliticianProfile
            catalog={props.catalog}
            world={props.world}
            state={props.snap}
            politicianId={selectedMember}
            office="Assembly member"
            party={partyDisplayName(
              props.world,
              props.snap.politicians[selectedMember]?.partyId ?? null,
              props.snap,
            )}
            {...(props.snap.politicians[selectedMember]?.description
              ? { biography: props.snap.politicians[selectedMember]!.description! }
              : {})}
          />
          <button type="button" className="btn ghost" onClick={() => setSelectedMember(null)}>
            Close member detail
          </button>
        </div>
      ) : null}
    </>
  );

  const rail =
    mp || speaker ? (
      <>
        <SectionDivider
          title="Votes due"
          hint={votesDue.length ? "Cast before month close" : "None pending"}
        />
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
                      onClick={() =>
                        run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice: "yes" })
                      }
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice: "no" })
                      }
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
    <div className="assembly-page assembly-chamber-v7">
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
                      status={
                        <StatusBadge tone={statusTone(b.status)}>
                          {billStatusLabel(b.status)}
                        </StatusBadge>
                      }
                      selected={props.selectedBill === b.id}
                      onClick={() => selectBill(b.id)}
                    />
                  ))
                )}

                <SectionDivider
                  title="Constitutional amendments"
                  hint="Assembly supermajority · provincial ratification when required"
                />
                {Object.values(props.snap.provincialRuntime.constitutionalAmendments).length ===
                0 ? (
                  <p className="muted">No amendment is currently before the institutions.</p>
                ) : null}
                {Object.values(props.snap.provincialRuntime.constitutionalAmendments)
                  .sort((a, b) => b.proposedDate.localeCompare(a.proposedDate))
                  .slice(0, 8)
                  .map((amendment) => (
                    <div className="constitutional-tracker" key={amendment.id}>
                      <div>
                        <strong>{amendment.title}</strong>
                        <p>{amendment.summary}</p>
                        <small>
                          {amendment.packageChanges?.length
                            ? `${amendment.packageChanges.length} structured change${
                                amendment.packageChanges.length === 1 ? "" : "s"
                              }`
                            : amendment.ruleId
                              ? "Legacy numeric rule amendment"
                              : "Historical record"}
                        </small>
                        {amendment.currentText && amendment.proposedText ? (
                          <div className="constitutional-redline compact">
                            <div>
                              <span>Current</span>
                              <del>{amendment.currentText}</del>
                            </div>
                            <div>
                              <span>Proposed</span>
                              <ins>{amendment.proposedText}</ins>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="constitutional-progress">
                        <span>Assembly {amendment.assemblyYes} yes</span>
                        <strong>{amendment.ratifiedProvinceIds.length} / 13 ratified</strong>
                        <StatusBadge
                          tone={
                            amendment.status === "ratified"
                              ? "ok"
                              : amendment.status.includes("failed")
                                ? "warn"
                                : "idle"
                          }
                        >
                          {amendment.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                      <details className="constitutional-provinces">
                        <summary>Ratification map and accessible record · 21 Assemblies</summary>
                        <div
                          className="constitutional-map-legend"
                          aria-label="Ratification map legend"
                        >
                          <span>
                            <i className="ratified" />
                            Ratified
                          </span>
                          <span>
                            <i className="rejected" />
                            Rejected
                          </span>
                          <span>
                            <i className="pending" />
                            Pending
                          </span>
                        </div>
                        <div className="constitutional-ratification-layout">
                          <TerenaMap
                            bundle={props.bundle}
                            mode="economy"
                            showConstituencies={false}
                            fillFor={(feature, kind) =>
                              kind !== "province"
                                ? "transparent"
                                : amendment.ratifiedProvinceIds.includes(feature.id)
                                  ? "#5f896c"
                                  : amendment.rejectedProvinceIds.includes(feature.id)
                                    ? "#a86460"
                                    : "#d2d6cf"
                            }
                            tooltipFor={(selection) => {
                              const status = amendment.ratifiedProvinceIds.includes(selection.id)
                                ? "Ratified"
                                : amendment.rejectedProvinceIds.includes(selection.id)
                                  ? "Rejected"
                                  : "Pending";
                              return (
                                <>
                                  <strong>{selection.name}</strong>
                                  <div>{status}</div>
                                </>
                              );
                            }}
                          />
                          <DataTable dense headers={["Province", "Status"]}>
                            {props.world.provinceIds
                              .slice()
                              .sort((a, b) =>
                                (props.catalog.places.get(a)?.name ?? a).localeCompare(
                                  props.catalog.places.get(b)?.name ?? b,
                                ),
                              )
                              .map((provinceId) => {
                                const ratified = amendment.ratifiedProvinceIds.includes(provinceId);
                                const rejected = amendment.rejectedProvinceIds.includes(provinceId);
                                const status = ratified
                                  ? "Ratified"
                                  : rejected
                                    ? "Rejected"
                                    : "Pending";
                                return (
                                  <tr key={provinceId}>
                                    <td>
                                      {props.catalog.places.get(provinceId)?.name ??
                                        "Unknown province"}
                                    </td>
                                    <td>
                                      <StatusBadge
                                        tone={ratified ? "ok" : rejected ? "warn" : "idle"}
                                      >
                                        {status}
                                      </StatusBadge>
                                    </td>
                                  </tr>
                                );
                              })}
                          </DataTable>
                        </div>
                      </details>
                      {mp &&
                      amendment.status === "proposed" &&
                      !amendment.assemblyVotes[props.snap.playerPoliticianId] ? (
                        <div className="row">
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              run({
                                type: "CAST_CONSTITUTIONAL_AMENDMENT_VOTE",
                                amendmentId: amendment.id,
                                choice: "yes",
                              })
                            }
                          >
                            Aye
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() =>
                              run({
                                type: "CAST_CONSTITUTIONAL_AMENDMENT_VOTE",
                                amendmentId: amendment.id,
                                choice: "no",
                              })
                            }
                          >
                            Nay
                          </button>
                          <button
                            type="button"
                            className="btn quiet"
                            onClick={() =>
                              run({
                                type: "CAST_CONSTITUTIONAL_AMENDMENT_VOTE",
                                amendmentId: amendment.id,
                                choice: "abstain",
                              })
                            }
                          >
                            Abstain
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                <div className="constitutional-proposal constitution-proposal-redirect">
                  <p>
                    Constitutional text is amended from{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setChamberTab("lawbook")}
                    >
                      Law &amp; Constitution
                    </button>
                    . Open a provision, compare alternatives in the document, then introduce the
                    measure. Assembly votes on pending amendments remain here.
                  </p>
                </div>

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
                        <StatusBadge tone={statusTone(b.status)}>
                          {billStatusLabel(b.status)}
                        </StatusBadge>
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
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => props.setSelectedBill(null)}
                        >
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
                            { label: "Version", value: `Version ${bill.version}` },
                            {
                              label: "Committee",
                              value: committeeDisplayName(bill.assignedCommitteeId),
                            },
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
                        ["committee", "floor_scheduled", "repassage_scheduled"].includes(
                          bill.status,
                        ) ? (
                          <div style={{ marginTop: "0.8rem" }}>
                            <SectionDivider
                              title="Propose amendment"
                              hint="Replace one concrete provision"
                            />
                            {(() => {
                              const amendable = bill.policyItems.filter((item) => item.provisionId);
                              const targetId = amendProvision || amendable[0]?.provisionId || "";
                              const target = targetId
                                ? provisionChoices(props.snap, targetId)
                                : null;
                              const currentItem = amendable.find(
                                (item) => item.provisionId === targetId,
                              );
                              const selectedOption =
                                amendOption ||
                                target?.options[0]?.id ||
                                target?.definition.options.find((option) => !option.founding)?.id ||
                                target?.definition.options[0]?.id ||
                                "";
                              return amendable.length === 0 || !target ? (
                                <p className="muted">
                                  This legacy bill has no concrete provision that can be amended.
                                </p>
                              ) : (
                                <>
                                  <label className="field-label">
                                    Provision
                                    <select
                                      value={targetId}
                                      onChange={(event) => {
                                        setAmendProvision(event.target.value);
                                        setAmendOption("");
                                      }}
                                    >
                                      {amendable.map((item) => (
                                        <option key={item.provisionId} value={item.provisionId}>
                                          {legislativeProvision(item.provisionId!)?.category ??
                                            issueDisplayName(props.catalog, item.issueId)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <PolicyChoiceGroup
                                    title={target.definition.category}
                                    currentLabel={target.currentLabel}
                                    selectedId={selectedOption}
                                    onSelect={setAmendOption}
                                    options={target.options}
                                  />
                                  <button
                                    type="button"
                                    className="btn"
                                    disabled={selectedOption === currentItem?.optionId}
                                    onClick={() => {
                                      const replacement = policyItemForProvision(
                                        targetId,
                                        selectedOption,
                                      );
                                      if (!replacement) return;
                                      run({
                                        type: "PROPOSE_AMENDMENT",
                                        billId: bill.id,
                                        policyItems: [replacement],
                                      });
                                    }}
                                  >
                                    Submit provision amendment
                                  </button>
                                </>
                              );
                            })()}
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
                                  props.snap.politicians[props.snap.playerPoliticianId]?.partyId ??
                                    null,
                                  bill.id,
                                ),
                              ),
                            },
                            {
                              label: "Caucus",
                              value: stanceLabel(
                                factionStance(
                                  props.snap,
                                  props.snap.politicians[props.snap.playerPoliticianId]
                                    ?.factionId ?? null,
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
                            {
                              label: "Next stage",
                              value:
                                bill.status === "committee"
                                  ? "Committee vote"
                                  : bill.status === "floor_scheduled"
                                    ? "Floor vote"
                                    : bill.status === "repassage_scheduled"
                                      ? "Repassage vote"
                                      : billStatusLabel(bill.status),
                            },
                          ]}
                        />
                        {whip ? (
                          <p className="muted">
                            Likely no {whip.likelyNo} · estimate only, not a recorded whip.
                          </p>
                        ) : null}
                        <SectionDivider
                          title="Party positions"
                          hint="Public recommendations; members retain their own vote"
                        />
                        <DataTable dense headers={["Party", "Seats", "Position"]}>
                          {partyRanks.map(([partyId, seats]) => (
                            <tr key={partyId}>
                              <td>
                                {partyDisplayName(
                                  props.world,
                                  partyId === "none" ? null : partyId,
                                  props.snap,
                                )}
                              </td>
                              <td>{seats}</td>
                              <td>
                                {stanceLabel(
                                  partyStance(
                                    props.snap,
                                    partyId === "none" ? null : partyId,
                                    bill.id,
                                  ),
                                )}
                              </td>
                            </tr>
                          ))}
                        </DataTable>
                        <SectionDivider title="Caucus positions" />
                        <div className="bill-caucus-positions">
                          {Object.values(props.world.factionDefinitions)
                            .filter((definition) => counts.has(definition.partyId))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((definition) => (
                              <EntityRow
                                key={definition.factionId}
                                title={definition.name}
                                meta={partyDisplayName(props.world, definition.partyId, props.snap)}
                                status={
                                  <StatusBadge>
                                    {stanceLabel(
                                      factionStance(props.snap, definition.factionId, bill.id),
                                    )}
                                  </StatusBadge>
                                }
                              />
                            ))}
                        </div>
                        <SectionDivider title="Organization positions" />
                        {Object.entries(props.snap.organizationRuntime.actors).flatMap(
                          ([organizationId, actor]) =>
                            actor.billPressure
                              .filter((pressure) => pressure.billId === bill.id)
                              .map((pressure) => ({ organizationId, pressure })),
                        ).length === 0 ? (
                          <p className="muted">
                            No organization has announced a position on this bill.
                          </p>
                        ) : (
                          Object.entries(props.snap.organizationRuntime.actors)
                            .flatMap(([organizationId, actor]) =>
                              actor.billPressure
                                .filter((pressure) => pressure.billId === bill.id)
                                .map((pressure) => ({ organizationId, pressure })),
                            )
                            .map(({ organizationId, pressure }) => (
                              <EntityRow
                                key={`${organizationId}:${pressure.billId}`}
                                title={
                                  props.world.interestOrganizations[organizationId]?.name ??
                                  "Public organization"
                                }
                                status={
                                  <StatusBadge tone={pressure.stance === "support" ? "ok" : "warn"}>
                                    {pressure.stance === "support" ? "Support" : "Oppose"}
                                  </StatusBadge>
                                }
                              />
                            ))
                        )}
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
                        {playerMaySetWhip ? (
                          <div className="whip-position-controls">
                            <SectionDivider
                              title="Set Assembly Delegation position"
                              hint="Party members retain their own vote; ideological caucuses are separate"
                            />
                            <div className="row">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  run({
                                    type: "SET_CAUCUS_BILL_POSITION",
                                    billId: bill.id,
                                    stance: "support",
                                  })
                                }
                              >
                                Support
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() =>
                                  run({
                                    type: "SET_CAUCUS_BILL_POSITION",
                                    billId: bill.id,
                                    stance: "oppose",
                                  })
                                }
                              >
                                Oppose
                              </button>
                              <button
                                type="button"
                                className="btn secondary"
                                onClick={() =>
                                  run({
                                    type: "SET_CAUCUS_BILL_POSITION",
                                    billId: bill.id,
                                    stance: "free_vote",
                                  })
                                }
                              >
                                Free vote
                              </button>
                            </div>
                          </div>
                        ) : null}
                        <SectionDivider
                          title="Version history"
                          hint={`Current version ${bill.version}`}
                        />
                        <div className="bill-version-history">
                          {bill.versionHistory
                            .slice()
                            .reverse()
                            .map((version) => {
                              const previous = bill.versionHistory.find(
                                (candidate) => candidate.version === version.version - 1,
                              );
                              const beforeByProvision = new Map(
                                (previous?.policyItems ?? []).map((item) => [
                                  item.provisionId ?? item.issueId,
                                  item,
                                ]),
                              );
                              const afterByProvision = new Map(
                                version.policyItems.map((item) => [
                                  item.provisionId ?? item.issueId,
                                  item,
                                ]),
                              );
                              const changed = [
                                ...new Set([
                                  ...beforeByProvision.keys(),
                                  ...afterByProvision.keys(),
                                ]),
                              ].flatMap((key) => {
                                const before = beforeByProvision.get(key);
                                const after = afterByProvision.get(key);
                                const beforeLabel = before
                                  ? policyItemDisplay(props.catalog, before)
                                  : "Not included";
                                const afterLabel = after
                                  ? policyItemDisplay(props.catalog, after)
                                  : "Removed";
                                return beforeLabel === afterLabel
                                  ? []
                                  : [{ key, beforeLabel, afterLabel }];
                              });
                              return (
                                <div
                                  key={`${bill.id}:v${version.version}`}
                                  className="bill-version-entry"
                                >
                                  <EntityRow
                                    title={`Version ${version.version}`}
                                    meta={`${version.date} · ${version.reason === "introduced" ? "Introduced" : "Adopted amendment"}`}
                                  />
                                  {changed.length ? (
                                    <div
                                      className="bill-version-diff"
                                      aria-label={`Changes in version ${version.version}`}
                                    >
                                      {changed.map((change) => (
                                        <div key={change.key} className="bill-version-diff-row">
                                          <span>{change.beforeLabel}</span>
                                          <strong aria-hidden="true">→</strong>
                                          <span>{change.afterLabel}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : version.version > 1 ? (
                                    <p className="muted">No operative provision changed.</p>
                                  ) : null}
                                </div>
                              );
                            })}
                        </div>
                        {bill.cosponsorIds.length > 0 ? (
                          <p className="muted" style={{ marginTop: "0.6rem" }}>
                            Cosponsors:{" "}
                            {bill.cosponsorIds
                              .map((id) => politicianDisplayName(props.catalog, id))
                              .join(", ")}
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
                  hint="Add concrete proposals that change current law"
                  actions={<StatusBadge>{draftProvisions.length}/8 provisions</StatusBadge>}
                />
                {draftProvisions.map((draft, index) => {
                  const { definition, options, currentLabel } = provisionChoices(
                    props.snap,
                    draft.provisionId,
                  );
                  const selected =
                    definition.options.find((o) => o.id === draft.optionId) ??
                    definition.options.find((o) => !o.founding) ??
                    definition.options[0]!;
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
                                  ? {
                                      provisionId: nextId,
                                      optionId: defaultProvisionOptionId(nextId),
                                    }
                                  : row,
                              ),
                            );
                          }}
                        >
                          {LEGISLATIVE_PROVISIONS.map((candidate) => (
                            <option
                              key={candidate.id}
                              value={candidate.id}
                              disabled={draftProvisions.some(
                                (row, rowIndex) =>
                                  rowIndex !== index && row.provisionId === candidate.id,
                              )}
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
                {draftProvisions.length < 8 ? (
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
                          { provisionId: next.id, optionId: defaultProvisionOptionId(next.id) },
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
                    meta={`${c.memberIds.length} members · Chair ${c.chairId ? politicianDisplayName(props.catalog, c.chairId) : "vacant"}`}
                    selected={c.id === activeCommitteeId}
                    onClick={() => setSelectedCommitteeId(c.id)}
                  />
                ))}
                {selectedCommittee ? (
                  <>
                    <SectionDivider
                      title={committeeDisplayName(selectedCommittee.id)}
                      hint={`Chair · ${selectedCommittee.chairId ? politicianDisplayName(props.catalog, selectedCommittee.chairId) : "Vacant"}`}
                    />
                    <div className="committee-composition-strip">
                      {[
                        ...selectedCommittee.memberIds
                          .reduce((map, memberId) => {
                            const partyId = props.snap.politicians[memberId]?.partyId ?? "none";
                            map.set(partyId, (map.get(partyId) ?? 0) + 1);
                            return map;
                          }, new Map<string, number>())
                          .entries(),
                      ]
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                        .map(([partyId, seats]) => (
                          <span key={partyId}>
                            <i
                              className="party-dot"
                              style={{
                                background: partyColor(
                                  props.world,
                                  partyId === "none" ? null : partyId,
                                ),
                              }}
                            />
                            {partyDisplayName(
                              props.world,
                              partyId === "none" ? null : partyId,
                              props.snap,
                            )}{" "}
                            {seats}
                          </span>
                        ))}
                    </div>
                    <div className="roll-call-scroll">
                      <DataTable dense headers={["Member", "Party", "Caucus"]}>
                        {selectedCommittee.memberIds.map((memberId) => (
                          <tr key={memberId} onClick={() => setSelectedMember(memberId)}>
                            <td>
                              <button type="button" className="link-button">
                                {politicianDisplayName(props.catalog, memberId)}
                              </button>
                              {memberId === selectedCommittee.chairId ? " · Chair" : ""}
                            </td>
                            <td>
                              {partyDisplayName(
                                props.world,
                                props.snap.politicians[memberId]?.partyId ?? null,
                                props.snap,
                              )}
                            </td>
                            <td>
                              {props.snap.politicians[memberId]?.factionId
                                ? (props.world.factionDefinitions[
                                    props.snap.politicians[memberId]!.factionId!
                                  ]?.name ?? "—")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </DataTable>
                    </div>
                    <SectionDivider title="Pending bills" />
                    {allBills.filter(
                      (candidate) =>
                        candidate.assignedCommitteeId === selectedCommittee.id &&
                        ["introduced", "committee"].includes(candidate.status),
                    ).length === 0 ? (
                      <p className="muted">No bill is presently pending.</p>
                    ) : (
                      allBills
                        .filter(
                          (candidate) =>
                            candidate.assignedCommitteeId === selectedCommittee.id &&
                            ["introduced", "committee"].includes(candidate.status),
                        )
                        .map((candidate) => (
                          <EntityRow
                            key={candidate.id}
                            title={candidate.title}
                            meta={billStatusLabel(candidate.status)}
                            onClick={() => selectBill(candidate.id)}
                          />
                        ))
                    )}
                    <SectionDivider title="Recent committee votes" />
                    {votes.filter((vote) => vote.committeeId === selectedCommittee.id).length ===
                    0 ? (
                      <p className="muted">No committee roll call has been recorded.</p>
                    ) : (
                      <DataTable dense headers={["Date", "Measure", "Result"]}>
                        {votes
                          .filter((vote) => vote.committeeId === selectedCommittee.id)
                          .slice(0, 12)
                          .map((vote) => (
                            <tr
                              key={vote.id}
                              onClick={() => {
                                setSelectedVoteId(vote.id);
                                setChamberTab("votes");
                              }}
                            >
                              <td>{vote.date}</td>
                              <td>
                                {props.snap.legislatureRuntime.bills[vote.billId]?.title ??
                                  "Assembly matter"}
                              </td>
                              <td>
                                {vote.yes}–{vote.no} · {vote.abstain} abstain
                              </td>
                            </tr>
                          ))}
                      </DataTable>
                    )}
                  </>
                ) : null}
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
                      v.metadata?.kind === "treaty_ratification" ? "Treaty ratification" : v.stage;
                    return (
                      <tr
                        key={v.id}
                        className={selectedVoteId === v.id ? "selected" : undefined}
                        onClick={() => setSelectedVoteId(v.id)}
                      >
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
                {selectedVoteId && props.snap.legislatureRuntime.legislativeVotes[selectedVoteId]
                  ? (() => {
                      const selectedVote =
                        props.snap.legislatureRuntime.legislativeVotes[selectedVoteId]!;
                      const rows = Object.entries(selectedVote.votes)
                        .filter(
                          ([, choice]) => rollCallFilter === "all" || choice === rollCallFilter,
                        )
                        .sort((a, b) =>
                          politicianDisplayName(props.catalog, a[0]).localeCompare(
                            politicianDisplayName(props.catalog, b[0]),
                          ),
                        );
                      const breakdown = new Map<
                        string,
                        { yes: number; no: number; abstain: number }
                      >();
                      for (const [memberId, choice] of Object.entries(selectedVote.votes)) {
                        const partyId = selectedVote.partyIdsAtVote?.[memberId] ?? "unrecorded";
                        const count = breakdown.get(partyId) ?? { yes: 0, no: 0, abstain: 0 };
                        count[choice] += 1;
                        breakdown.set(partyId, count);
                      }
                      return (
                        <div className="roll-call-panel">
                          <SectionDivider
                            title="Roll Call"
                            hint={`${selectedVote.yes} Aye · ${selectedVote.no} Nay · ${selectedVote.abstain} Abstain`}
                          />
                          <div className="roll-call-breakdown">
                            {[...breakdown.entries()]
                              .sort(
                                (a, b) =>
                                  b[1].yes +
                                  b[1].no +
                                  b[1].abstain -
                                  (a[1].yes + a[1].no + a[1].abstain),
                              )
                              .map(([partyId, count]) => (
                                <span key={partyId}>
                                  <strong>
                                    {partyId === "unrecorded"
                                      ? "Affiliation not archived"
                                      : partyDisplayName(
                                          props.world,
                                          partyId === "none" ? null : partyId,
                                          props.snap,
                                        )}
                                  </strong>{" "}
                                  {count.yes} Aye · {count.no} Nay · {count.abstain} Abstain
                                </span>
                              ))}
                          </div>
                          <div className="map-scale-switch" aria-label="Filter roll call">
                            {(["all", "yes", "no", "abstain"] as const).map((choice) => (
                              <button
                                type="button"
                                key={choice}
                                className={rollCallFilter === choice ? "active" : ""}
                                onClick={() => setRollCallFilter(choice)}
                              >
                                {choice === "yes"
                                  ? "Aye"
                                  : choice === "no"
                                    ? "Nay"
                                    : choice[0]!.toUpperCase() + choice.slice(1)}
                              </button>
                            ))}
                          </div>
                          <div className="roll-call-scroll">
                            <DataTable dense headers={["Member", "Party", "Caucus", "Vote"]}>
                              {rows.map(([memberId, choice]) => {
                                const historicalParty = selectedVote.partyIdsAtVote?.[memberId];
                                const historicalFaction = selectedVote.factionIdsAtVote?.[memberId];
                                return (
                                  <tr key={memberId} onClick={() => setSelectedMember(memberId)}>
                                    <td>
                                      <button type="button" className="link-button">
                                        {politicianDisplayName(props.catalog, memberId)}
                                      </button>
                                    </td>
                                    <td>
                                      {historicalParty === undefined
                                        ? "Not archived"
                                        : partyDisplayName(
                                            props.world,
                                            historicalParty,
                                            props.snap,
                                          )}
                                    </td>
                                    <td>
                                      {historicalFaction === undefined
                                        ? "Not archived"
                                        : historicalFaction
                                          ? (props.world.factionDefinitions[historicalFaction]
                                              ?.name ?? "Former caucus")
                                          : "—"}
                                    </td>
                                    <td>
                                      {choice === "yes"
                                        ? "Aye"
                                        : choice === "no"
                                          ? "Nay"
                                          : "Abstain"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </DataTable>
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </>
            ) : null}

            {chamberTab === "lawbook" ? (
              <>
                <ConstitutionBrowser
                  world={props.world}
                  snap={props.snap}
                  sim={props.sim}
                  mp={Boolean(mp)}
                  report={props.report}
                />

                <SectionDivider
                  title="Constitutional rule history"
                  hint="Founding values and adopted operational amendments"
                />
                <div className="constitution-history-list">
                  {Object.values(props.snap.provincialRuntime.constitutionalRules)
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map((rule) => {
                      const original = ORIGINAL_CONSTITUTIONAL_VALUES[rule.id];
                      const amendments = Object.values(
                        props.snap.provincialRuntime.constitutionalAmendments,
                      )
                        .filter(
                          (amendment) =>
                            amendment.ruleId === rule.id && amendment.status === "ratified",
                        )
                        .sort(
                          (a, b) =>
                            a.proposedDate.localeCompare(b.proposedDate) ||
                            a.id.localeCompare(b.id),
                        );
                      const formatValue = (value: number) =>
                        rule.unit === "fraction"
                          ? `${Math.round(value * 100)}%`
                          : `${value} ${rule.unit}`;
                      return (
                        <article key={`${rule.id}:history`} className="constitution-history-row">
                          <strong>{rule.label}</strong>
                          <div className="constitution-history-chain">
                            <span>Founding: {formatValue(original)}</span>
                            {amendments.map((amendment) => (
                              <span key={amendment.id}>
                                → {amendment.title}:{" "}
                                {amendment.proposedValue == null
                                  ? "text amended"
                                  : formatValue(amendment.proposedValue)}{" "}
                                ({amendment.enactedDate ?? amendment.proposedDate})
                              </span>
                            ))}
                            {amendments.length === 0 ? (
                              <span>→ Current rule unchanged</span>
                            ) : (
                              <span>→ Current: {formatValue(rule.value)}</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                </div>

                <SectionDivider
                  title="Current statutory position"
                  hint="Concrete policy categories in force"
                />
                <input
                  className="search lawbook-search"
                  value={lawQuery}
                  onChange={(event) => setLawQuery(event.target.value)}
                  placeholder="Search law or policy category"
                />
                <div className="current-law-grid">
                  {LEGISLATIVE_PROVISIONS.filter((definition) => {
                    const option = currentProvisionOption(props.snap, definition.id);
                    const query = lawQuery.trim().toLowerCase();
                    return (
                      !query ||
                      `${definition.category} ${option?.label ?? ""} ${option?.change ?? ""}`
                        .toLowerCase()
                        .includes(query)
                    );
                  })
                    .slice(0, 50)
                    .map((definition) => {
                      const option = currentProvisionOption(props.snap, definition.id);
                      const sourceLaws = Object.values(props.snap.legislatureRuntime.enactedLaws)
                        .filter((law) =>
                          law.policyItems.some((item) => item.provisionId === definition.id),
                        )
                        .sort(
                          (a, b) =>
                            b.enactedDate.localeCompare(a.enactedDate) || b.id.localeCompare(a.id),
                        );
                      const source = sourceLaws.find((law) => law.operative) ?? null;
                      return (
                        <article key={definition.id} className="current-law-row">
                          <div className="kicker">{definition.category}</div>
                          <strong>{option?.label ?? "No operative rule recorded"}</strong>
                          {option?.change ? <p className="muted">{option.change}</p> : null}
                          {source ? (
                            <div className="current-law-source">
                              <span>
                                In force from {source.title} · {source.enactedDate}
                                {sourceLaws.length > 1
                                  ? ` · ${sourceLaws.length - 1} earlier amendment${sourceLaws.length === 2 ? "" : "s"}`
                                  : ""}
                              </span>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => {
                                  setChamberTab("business");
                                  selectBill(source.billId);
                                  setBillTab("process");
                                }}
                              >
                                Open act history
                              </button>
                            </div>
                          ) : (
                            <span className="muted">Founding statutory position</span>
                          )}
                        </article>
                      );
                    })}
                </div>

                <SectionDivider
                  title="Statute book"
                  hint={`${Object.keys(props.snap.legislatureRuntime.enactedLaws).length} enacted laws`}
                />
                {enactedLaws.length === 0 ? (
                  <p className="muted">No enacted law matches this search.</p>
                ) : null}
                {enactedLaws.slice(0, 30).map((law) => (
                  <article key={law.id} className="statute-row">
                    <div>
                      <strong>{law.title}</strong>
                      <div className="muted">
                        Enacted {law.enactedDate} · Sponsor{" "}
                        {politicianDisplayName(props.catalog, law.sponsorId)}
                      </div>
                      <div className="muted">
                        {law.policyItems
                          .map((item) => policyItemDisplay(props.catalog, item))
                          .join("; ")}
                      </div>
                    </div>
                    <StatusBadge tone={law.operative ? "ok" : "warn"}>
                      {law.operative ? "Operative" : "Invalidated"}
                    </StatusBadge>
                  </article>
                ))}
                {enactedLaws.length > 30 ? (
                  <p className="muted">
                    Showing the 30 most recent matching laws. Refine the search to narrow the
                    statute book.
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        }
        rail={rail}
      />
    </div>
  );
}
