import { useMemo, useState } from "react";
import {
  PROVINCIAL_INVESTMENTS,
  PROVINCIAL_PRIORITIES,
  caseTitle,
  collectPlayerActionableDecisions,
  currentAssemblyMemberIds,
  currentCourtJudgeIds,
  currentGovernorId,
  currentSpeakerId,
  deriveCabinet,
  governedProvinceId,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { isMp, isPresident, isSpeaker, publicStandingLabel } from "./format.js";
import {
  constituencyDisplayName,
  partyDisplayName,
  politicianDisplayName,
  relationPublicLabel,
  type PresentationCatalog,
} from "./presentation.js";
import {
  BriefStrip,
  EmptyState,
  EntityRow,
  MetricStrip,
  PageHeader,
  PolicyChoiceGroup,
  SectionCard,
  SectionDivider,
  StatCard,
  StatusBadge,
  WorkLayout,
} from "./ui/kit.js";

const title = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function OfficePage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (result: CommandResult) => boolean;
}) {
  const playerId = props.snap.playerPoliticianId;
  const terms = Object.values(props.snap.officeTerms).filter(
    (term) => term.holderId === playerId && (term.status === "active" || term.status === "suspended"),
  );
  const kinds = terms.flatMap((term) => {
    const office = props.world.offices[term.officeId];
    return office ? [{ term, office }] : [];
  });
  const provinceId = governedProvinceId(props.world, props.snap, playerId);
  const province = provinceId ? props.snap.provincialRuntime.provinces[provinceId] : null;
  const economy = provinceId ? props.snap.economyRuntime.provinces[provinceId] : null;
  const [priority, setPriority] = useState(province?.administrativePriority ?? "transport");
  const [investment, setInvestment] = useState(province?.investmentEmphasis ?? "transport");
  const [federalIssue, setFederalIssue] = useState(props.world.issueIds[0] ?? "ISS_HOUSING");
  const [limitedIssue, setLimitedIssue] = useState(props.world.issueIds[0] ?? "ISS_HOUSING");
  const [deferredBills, setDeferredBills] = useState<Record<string, true>>({});
  const provinceName = provinceId
    ? props.catalog.places.get(provinceId)?.name ?? "Unknown province"
    : null;
  const election = provinceId
    ? Object.values(props.snap.provincialRuntime.elections)
        .filter((race) => race.provinceId === provinceId && race.status !== "assumed")
        .sort((a, b) => a.date.localeCompare(b.date))[0]
    : null;
  const pressures = provinceId
    ? Object.values(props.snap.provincialRuntime.pressures).filter(
        (pressure) => pressure.provinceId === provinceId && pressure.status === "open",
      )
    : [];
  const provincialMps = useMemo(() => {
    if (!provinceId) return [];
    return currentAssemblyMemberIds(props.world, props.snap).filter((id) =>
      Object.values(props.snap.officeTerms).some((term) => {
        if (term.holderId !== id || (term.status !== "active" && term.status !== "suspended")) {
          return false;
        }
        const cid = props.world.offices[term.officeId]?.constituencyId;
        return (
          cid &&
          props.world.constituencyProvinceShares[cid]?.some((share) => share.provinceId === provinceId)
        );
      }),
    );
  }, [provinceId, props.snap, props.world]);

  const execute = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    const result = props.sim.executeCommand(command);
    props.report(result);
    props.onDone();
  };

  const standingLabel = publicStandingLabel(props.world, props.snap, playerId);
  const cab = deriveCabinet(props.world, props.snap);
  const vacantMinistries = cab.filter((m) => m.holderId == null);
  const pendingBills = Object.values(props.snap.legislatureRuntime.bills).filter(
    (b) => b.status === "sent_to_president" && !deferredBills[b.id],
  );
  const playerIsPresident = isPresident(props.world, props.snap, playerId);
  const playerIsMp = isMp(props.world, props.snap, playerId);
  const playerIsSpeaker = isSpeaker(props.world, props.snap, playerId);
  const playerIsJustice = currentCourtJudgeIds(props.world, props.snap).includes(playerId);
  const mpConstituencyId = kinds.find((k) => k.office.kind === "assembly_member")?.office
    .constituencyId;
  const upcomingVotes = collectPlayerActionableDecisions(props.world, props.snap).filter((d) =>
    [
      "committee_vote",
      "floor_vote",
      "repassage_vote",
      "amendment_vote",
      "motion_vote",
      "confirmation_vote",
      "impeachment_vote",
      "recall_vote",
      "treaty_ratification_vote",
    ].includes(d.kind),
  );
  const sponsoredBills = Object.values(props.snap.legislatureRuntime.bills)
    .filter((b) => b.sponsorId === playerId)
    .sort(
      (a, b) =>
        (b.introducedDate ?? "").localeCompare(a.introducedDate ?? "") || a.id.localeCompare(b.id),
    )
    .slice(0, 8);
  const floorQueue = Object.values(props.snap.legislatureRuntime.bills)
    .filter((b) =>
      ["committee", "floor_scheduled", "repassage_scheduled"].includes(b.status),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const pendingCases = Object.values(props.snap.constitutionalRuntime.courtCases)
    .filter((c) => c.status === "pending")
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  if (provinceId && province && economy) {
    const governorId = currentGovernorId(props.world, props.snap, provinceId);
    return (
      <div className="office-page governor-office">
        <PageHeader
          kicker="Provincial government"
          title={`Office of the Governor · ${provinceName}`}
          subtitle="Administration, investment priorities, and federal advocacy."
        />
        <WorkLayout
          header={
            <>
              <BriefStrip
                items={[
                  {
                    label: "Governor",
                    value: politicianDisplayName(props.catalog, governorId ?? playerId),
                  },
                  { label: "Next election", value: election?.date ?? "Not scheduled" },
                  { label: "Standing", value: standingLabel },
                  { label: "Actions", value: province.actionPointsRemaining },
                ]}
              />
              <MetricStrip>
                <StatCard label="Conditions" value={economy.conditionsIndex.toFixed(1)} />
                <StatCard label="Employment" value={economy.employmentIndex.toFixed(1)} />
                <StatCard label="Housing" value={economy.housingIndex.toFixed(1)} />
                <StatCard
                  label="Federal relationship"
                  value={relationPublicLabel(province.federalRelationship)}
                />
              </MetricStrip>
            </>
          }
          main={
            <>
              <SectionDivider title="Governor's agenda" hint="Each apply costs 1 action point" />
              <PolicyChoiceGroup
                title="Administrative priority"
                currentLabel={title(province.administrativePriority)}
                selectedId={priority}
                onSelect={(id) => setPriority(id as typeof priority)}
                options={PROVINCIAL_PRIORITIES.map((item) => ({
                  id: item,
                  label: title(item),
                  summary: `Emphasize ${title(item).toLowerCase()} in provincial administration.`,
                  cost: "1 AP",
                  current: item === province.administrativePriority,
                }))}
                details={
                  <button
                    className="btn"
                    type="button"
                    disabled={
                      province.actionPointsRemaining < 1 ||
                      priority === province.administrativePriority
                    }
                    onClick={() => execute({ type: "GOVERNOR_SET_PRIORITY", provinceId, priority })}
                  >
                    Apply priority (1 AP)
                  </button>
                }
              />
              <PolicyChoiceGroup
                title="Public investment emphasis"
                currentLabel={title(province.investmentEmphasis)}
                selectedId={investment}
                onSelect={(id) => setInvestment(id as typeof investment)}
                options={PROVINCIAL_INVESTMENTS.map((item) => ({
                  id: item,
                  label: title(item),
                  summary: `Direct provincial capital toward ${title(item).toLowerCase()}.`,
                  cost: "1 AP",
                  current: item === province.investmentEmphasis,
                }))}
                details={
                  <button
                    className="btn"
                    type="button"
                    disabled={
                      province.actionPointsRemaining < 1 ||
                      investment === province.investmentEmphasis
                    }
                    onClick={() =>
                      execute({ type: "GOVERNOR_DIRECT_INVESTMENT", provinceId, focus: investment })
                    }
                  >
                    Direct investment (1 AP)
                  </button>
                }
              />
              <SectionCard title="Federal initiative">
                <label>
                  Issue
                  <select value={federalIssue} onChange={(event) => setFederalIssue(event.target.value)}>
                    {props.world.issueIds.map((item) => (
                      <option key={item} value={item}>
                        {props.catalog.issues.get(item)?.name ?? title(item.replace("ISS_", ""))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={province.actionPointsRemaining < 1}
                    onClick={() =>
                      execute({
                        type: "GOVERNOR_TAKE_FEDERAL_POSITION",
                        provinceId,
                        issueId: federalIssue,
                        direction: 1,
                      })
                    }
                  >
                    Support (1 AP)
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={province.actionPointsRemaining < 1}
                    onClick={() =>
                      execute({
                        type: "GOVERNOR_TAKE_FEDERAL_POSITION",
                        provinceId,
                        issueId: federalIssue,
                        direction: -1,
                      })
                    }
                  >
                    Oppose (1 AP)
                  </button>
                </div>
              </SectionCard>
              <SectionDivider title="Provincial pressures" />
              {pressures.length === 0 ? <EmptyState>No unresolved provincial pressure.</EmptyState> : null}
              {pressures.map((pressure) => (
                <div className="pressure-row" key={pressure.id}>
                  <div>
                    <strong>{pressure.title}</strong>
                    <div className="muted">Opened {pressure.openedDate}</div>
                  </div>
                  <div className="row">
                    <button
                      className="btn secondary"
                      onClick={() =>
                        execute({
                          type: "GOVERNOR_RESPOND_TO_PRESSURE",
                          provinceId,
                          pressureId: pressure.id,
                          response: "mobilize",
                        })
                      }
                    >
                      Mobilize
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        execute({
                          type: "GOVERNOR_RESPOND_TO_PRESSURE",
                          provinceId,
                          pressureId: pressure.id,
                          response: "coordinate",
                        })
                      }
                    >
                      Coordinate
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        execute({
                          type: "GOVERNOR_RESPOND_TO_PRESSURE",
                          provinceId,
                          pressureId: pressure.id,
                          response: "request_federal_support",
                        })
                      }
                    >
                      Request federal support
                    </button>
                  </div>
                </div>
              ))}
            </>
          }
          rail={
            <>
              <SectionDivider title="Political situation" />
              <p>
                <strong>{provincialMps.length}</strong> Assembly members represent constituencies
                touching {provinceName}.
              </p>
              <div className="compact-roster">
                {provincialMps.slice(0, 12).map((id) => (
                  <span key={id}>{politicianDisplayName(props.catalog, id)}</span>
                ))}
              </div>
              <SectionDivider title="Election" />
              {election ? (
                <>
                  <StatusBadge tone={election.status === "filing_open" ? "warn" : "idle"}>
                    {title(election.status)}
                  </StatusBadge>
                  <p>
                    {election.date} · {Object.keys(election.candidates).length} filed candidates
                  </p>
                </>
              ) : (
                <EmptyState>No election scheduled.</EmptyState>
              )}
              <p className="muted">Use Career → Opportunities for reelection or another race.</p>
            </>
          }
        />
      </div>
    );
  }

  const primary = kinds[0]?.office.kind ?? "private_citizen";
  const officeTitle = kinds[0]?.office.title ?? "Private citizen";
  const limited = primary === "minister" || primary === "mayor";
  const latestLimitedAction = Object.values(props.snap.provincialRuntime.actions)
    .filter(
      (action) =>
        action.actorId === playerId &&
        (action.kind === "ministry_advice" || action.kind === "civic_priority"),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const limitedActionUsed =
    latestLimitedAction?.date.slice(0, 7) === props.snap.currentDate.slice(0, 7);

  if (playerIsPresident || primary === "president") {
    return (
      <div className="office-page">
        <PageHeader
          kicker="Presidential desk"
          title={officeTitle}
          subtitle="Immediate executive business from the current administration."
        />
        <WorkLayout
          header={
            <BriefStrip
              items={[
                { label: "Standing", value: standingLabel },
                { label: "Bills awaiting", value: pendingBills.length },
                { label: "Cabinet vacancies", value: vacantMinistries.length },
                {
                  label: "Party",
                  value: partyDisplayName(
                    props.world,
                    props.snap.politicians[playerId]?.partyId ?? null,
                    props.snap,
                  ),
                },
              ]}
            />
          }
          main={
            <>
              <SectionDivider title="Awaiting signature" hint="SIGN · RETURN · NO ACTION" />
              {pendingBills.length === 0 ? (
                <EmptyState>No bills await presidential action.</EmptyState>
              ) : null}
              {pendingBills.map((b) => (
                <div key={b.id} className="decision-row">
                  <div>
                    <strong>{b.title}</strong>
                    <div className="muted">Sent to the President</div>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => execute({ type: "SIGN_BILL", billId: b.id })}
                    >
                      Sign
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => execute({ type: "RETURN_BILL", billId: b.id })}
                    >
                      Return
                    </button>
                    <button
                      type="button"
                      className="btn quiet"
                      title="Leave the bill on your desk"
                      onClick={() => setDeferredBills((prev) => ({ ...prev, [b.id]: true }))}
                    >
                      No action
                    </button>
                  </div>
                </div>
              ))}
              <SectionDivider title="Cabinet vacancies" />
              {vacantMinistries.length === 0 ? (
                <EmptyState>Cabinet is fully staffed.</EmptyState>
              ) : (
                vacantMinistries.map((m) => (
                  <EntityRow
                    key={m.officeId}
                    title={m.title}
                    meta="Vacant portfolio"
                    status={<StatusBadge tone="warn">Open</StatusBadge>}
                  />
                ))
              )}
            </>
          }
          rail={
            <>
              <SectionDivider title="Desk links" />
              <p className="muted">Full appointment, budget, regulation, and emergency tools live in Executive.</p>
              <button type="button" className="btn secondary" disabled>
                Open Executive →
              </button>
              <p className="muted">Foreign crises and treaties are handled in Foreign Affairs.</p>
              <button type="button" className="btn secondary" disabled>
                Open Foreign Affairs →
              </button>
            </>
          }
        />
      </div>
    );
  }

  if (playerIsSpeaker || primary === "speaker") {
    const speakerId = currentSpeakerId(props.world, props.snap);
    return (
      <div className="office-page">
        <PageHeader
          kicker="Speaker's chair"
          title={officeTitle}
          subtitle="Floor scheduling cues from the current legislative runtime."
        />
        <WorkLayout
          header={
            <BriefStrip
              items={[
                {
                  label: "Speaker",
                  value: politicianDisplayName(props.catalog, speakerId ?? playerId),
                },
                { label: "Standing", value: standingLabel },
                { label: "On calendar", value: floorQueue.length },
                {
                  label: "Floor bills",
                  value: floorQueue.filter((b) => b.status === "floor_scheduled").length,
                },
              ]}
            />
          }
          main={
            <>
              <SectionDivider title="Floor scheduling" hint="Schedule or delay bills already on the calendar" />
              {floorQueue.length === 0 ? (
                <EmptyState>No active legislative business on the floor calendar.</EmptyState>
              ) : null}
              {floorQueue.map((bill) => (
                <div key={bill.id} className="decision-row">
                  <div>
                    <strong>{bill.title}</strong>
                    <div className="muted">
                      {title(bill.status)} · Sponsor{" "}
                      {politicianDisplayName(props.catalog, bill.sponsorId)}
                    </div>
                  </div>
                  <div className="row">
                    <StatusBadge
                      tone={
                        bill.status === "floor_scheduled" || bill.status === "repassage_scheduled"
                          ? "warn"
                          : "idle"
                      }
                    >
                      {title(bill.status)}
                    </StatusBadge>
                    {bill.status === "floor_scheduled" || bill.status === "repassage_scheduled" ? (
                      <>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => execute({ type: "SCHEDULE_BILL", billId: bill.id })}
                        >
                          Schedule
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => execute({ type: "DELAY_BILL", billId: bill.id })}
                        >
                          Delay
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </>
          }
          rail={
            <>
              <SectionDivider title="Desk links" />
              <p className="muted">Bill text, amendments, and votes remain in Assembly.</p>
              <button type="button" className="btn secondary" disabled>
                Open Assembly →
              </button>
            </>
          }
        />
      </div>
    );
  }

  if (playerIsMp || primary === "assembly_member") {
    return (
      <div className="office-page">
        <PageHeader
          kicker="Member's desk"
          title={officeTitle}
          subtitle="Votes, sponsorship, and constituency representation."
        />
        <WorkLayout
          header={
            <BriefStrip
              items={[
                { label: "Standing", value: standingLabel },
                { label: "Votes due", value: upcomingVotes.length },
                { label: "Sponsored", value: sponsoredBills.length },
                {
                  label: "Constituency",
                  value: mpConstituencyId
                    ? constituencyDisplayName(props.catalog, mpConstituencyId)
                    : "—",
                },
              ]}
            />
          }
          main={
            <>
              <SectionDivider title="Upcoming votes" />
              {upcomingVotes.length === 0 ? (
                <EmptyState>No pending votes require your action.</EmptyState>
              ) : null}
              {upcomingVotes.map((d) => (
                <EntityRow
                  key={d.key}
                  title={d.label}
                  meta={title(d.kind)}
                  status={<StatusBadge tone="warn">Due</StatusBadge>}
                />
              ))}
              <SectionDivider title="Sponsored bills" />
              {sponsoredBills.length === 0 ? (
                <EmptyState>You have not sponsored an active bill.</EmptyState>
              ) : null}
              {sponsoredBills.map((bill) => (
                <EntityRow
                  key={bill.id}
                  title={bill.title}
                  meta={`Introduced ${bill.introducedDate ?? "—"}`}
                  status={<StatusBadge>{title(bill.status)}</StatusBadge>}
                />
              ))}
            </>
          }
          rail={
            <>
              <SectionDivider title="Constituency" />
              {mpConstituencyId ? (
                <p>
                  You sit for{" "}
                  <strong>{constituencyDisplayName(props.catalog, mpConstituencyId)}</strong>.
                </p>
              ) : (
                <EmptyState>No constituency seat on record.</EmptyState>
              )}
              <p className="muted">Introduce legislation and cast recorded votes in Assembly.</p>
              <button type="button" className="btn secondary" disabled>
                Open Assembly →
              </button>
              <p className="muted">Career tracks the next Assembly filing window.</p>
              <button type="button" className="btn secondary" disabled>
                Open Career →
              </button>
            </>
          }
        />
      </div>
    );
  }

  if (playerIsJustice || primary === "constitutional_court_justice") {
    return (
      <div className="office-page page-tone-court">
        <PageHeader
          kicker="Chambers"
          title={officeTitle}
          subtitle="Pending constitutional cases from the court runtime."
        />
        <WorkLayout
          header={
            <BriefStrip
              items={[
                { label: "Standing", value: standingLabel },
                { label: "Pending cases", value: pendingCases.length },
                {
                  label: "Your votes due",
                  value: pendingCases.filter(
                    (c) =>
                      c.participatingJudgeIds.includes(playerId) &&
                      !props.snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${c.id}`],
                  ).length,
                },
              ]}
            />
          }
          main={
            <>
              <SectionDivider title="Pending cases" />
              {pendingCases.length === 0 ? <EmptyState>No active cases on the docket.</EmptyState> : null}
              {pendingCases.map((c) => {
                const needsVote =
                  c.participatingJudgeIds.includes(playerId) &&
                  !props.snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${c.id}`];
                const recorded =
                  props.snap.constitutionalRuntime.pendingPlayerVotes[`judicial:${c.id}`];
                return (
                  <div key={c.id} className="decision-row">
                    <div>
                      <strong>{caseTitle(c)}</strong>
                      <div className="muted">
                        {c.caseType.replace(/_/g, " ")} · filed {c.filedDate}
                        {c.expedited ? " · expedited" : ""}
                      </div>
                    </div>
                    <div className="row">
                      {needsVote ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              execute({ type: "CAST_JUDICIAL_VOTE", caseId: c.id, choice: "uphold" })
                            }
                          >
                            Uphold
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() =>
                              execute({
                                type: "CAST_JUDICIAL_VOTE",
                                caseId: c.id,
                                choice: "invalidate",
                              })
                            }
                          >
                            Invalidate
                          </button>
                        </>
                      ) : recorded ? (
                        <StatusBadge tone="ok">Vote recorded</StatusBadge>
                      ) : (
                        <StatusBadge>On docket</StatusBadge>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          }
          rail={
            <>
              <SectionDivider title="Desk links" />
              <p className="muted">Full bench, nominations, and precedent archive remain in Courts.</p>
              <button type="button" className="btn secondary" disabled>
                Open Courts →
              </button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="office-page">
      <PageHeader
        kicker="Current role"
        title={officeTitle}
        subtitle={
          limited
            ? "A bounded supporting role in the current v1 political model."
            : "No current public office. Your political career continues."
        }
      />
      {kinds.length ? (
        <MetricStrip>
          {kinds.map(({ office, term }) => (
            <StatCard
              key={term.id}
              label={office.kind.replace(/_/g, " ")}
              value={term.startDate ?? "Current"}
            />
          ))}
        </MetricStrip>
      ) : null}
      <SectionCard title="Role briefing">
        {primary === "minister" ? (
          <div className="office-actions">
            <p>Ministers advise the presidential executive; they do not possess presidential authority.</p>
            <label>
              Advisory focus
              <select value={limitedIssue} onChange={(event) => setLimitedIssue(event.target.value)}>
                {props.world.issueIds.map((issueId) => (
                  <option key={issueId} value={issueId}>
                    {props.catalog.issues.get(issueId)?.name ?? title(issueId.replace("ISS_", ""))}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={limitedActionUsed}
              onClick={() => execute({ type: "MINISTER_ADVISE_PRIORITY", issueId: limitedIssue })}
            >
              Submit monthly policy advice
            </button>
            {latestLimitedAction ? (
              <p className="muted">
                Latest advice:{" "}
                {props.catalog.issues.get(latestLimitedAction.focus)?.name ??
                  title(latestLimitedAction.focus)}{" "}
                · {latestLimitedAction.date}
              </p>
            ) : null}
          </div>
        ) : null}
        {primary === "mayor" ? (
          <div>
            <p>
              Municipal play is intentionally limited in v1. You may set one visible civic emphasis while
              pursuing broader political opportunities.
            </p>
            <div className="row">
              {(["housing", "transport", "services"] as const).map((civic) => (
                <button
                  key={civic}
                  className="btn secondary"
                  disabled={limitedActionUsed}
                  onClick={() => execute({ type: "MAYOR_SET_CIVIC_PRIORITY", priority: civic })}
                >
                  {title(civic)}
                </button>
              ))}
            </div>
            {latestLimitedAction ? (
              <p className="muted">
                Current civic emphasis: {title(latestLimitedAction.focus)} · set{" "}
                {latestLimitedAction.date}
              </p>
            ) : null}
          </div>
        ) : null}
        {primary === "private_citizen" ? (
          <p>
            You remain playable without office. Career lists future races for which you are eligible; no
            appointment or candidacy is automatic.
          </p>
        ) : null}
      </SectionCard>
      {limited ? (
        <div className="role-depth-note">
          <StatusBadge tone="warn">Limited role</StatusBadge>
          <span>This start has a smaller action set than President, MP, Governor or Justice.</span>
        </div>
      ) : null}
    </div>
  );
}
