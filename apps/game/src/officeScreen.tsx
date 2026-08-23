import { useMemo, useState } from "react";
import {
  PROVINCIAL_INVESTMENTS,
  PROVINCIAL_PRIORITIES,
  currentAssemblyMemberIds,
  currentGovernorId,
  governedProvinceId,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { qualitativeStanding } from "./format.js";
import {
  partyDisplayName,
  politicianDisplayName,
  relationPublicLabel,
  type PresentationCatalog,
} from "./presentation.js";
import { EmptyState, MetricStrip, PageHeader, SectionCard, StatCard, StatusBadge } from "./ui/kit.js";

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
  const provinceName = provinceId
    ? props.catalog.places.get(provinceId)?.name ?? provinceId
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
        if (term.holderId !== id || (term.status !== "active" && term.status !== "suspended")) return false;
        const cid = props.world.offices[term.officeId]?.constituencyId;
        return cid && props.world.constituencyProvinceShares[cid]?.some((share) => share.provinceId === provinceId);
      }),
    );
  }, [provinceId, props.snap, props.world]);

  const execute = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    const result = props.sim.executeCommand(command);
    props.report(result);
    props.onDone();
  };

  if (provinceId && province && economy) {
    const governorId = currentGovernorId(props.world, props.snap, provinceId);
    return (
      <div className="office-page governor-office">
        <PageHeader
          kicker="Provincial government"
          title={`Office of the Governor · ${provinceName}`}
          subtitle="A restrained provincial executive: administration, investment priorities and federal advocacy."
        />
        <div className="office-masthead">
          <div>
            <span className="eyebrow">Governor</span>
            <h2>{politicianDisplayName(props.catalog, governorId ?? playerId)}</h2>
            <p>{partyDisplayName(props.world, props.snap.politicians[playerId]?.partyId ?? null, props.snap)}</p>
          </div>
          <div className="office-masthead-facts">
            <span>Next election<strong>{election?.date ?? "Not scheduled"}</strong></span>
            <span>Standing<strong>{qualitativeStanding(province.publicStanding)}</strong></span>
            <span>Actions this month<strong>{province.actionPointsRemaining}</strong></span>
          </div>
        </div>
        <MetricStrip>
          <StatCard label="Conditions" value={economy.conditionsIndex.toFixed(1)} />
          <StatCard label="Employment" value={economy.employmentIndex.toFixed(1)} />
          <StatCard label="Housing" value={economy.housingIndex.toFixed(1)} />
          <StatCard label="Federal relationship" value={relationPublicLabel(province.federalRelationship)} />
        </MetricStrip>
        <div className="office-grid">
          <main>
            <SectionCard title="Governor's agenda">
              <div className="office-actions">
                <label>
                  Administrative priority
                  <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
                    {PROVINCIAL_PRIORITIES.map((item) => <option key={item} value={item}>{title(item)}</option>)}
                  </select>
                </label>
                <button className="btn" type="button" disabled={province.actionPointsRemaining < 1} onClick={() =>
                  execute({ type: "GOVERNOR_SET_PRIORITY", provinceId, priority })
                }>Set priority</button>
                <label>
                  Public investment emphasis
                  <select value={investment} onChange={(event) => setInvestment(event.target.value as typeof investment)}>
                    {PROVINCIAL_INVESTMENTS.map((item) => <option key={item} value={item}>{title(item)}</option>)}
                  </select>
                </label>
                <button className="btn" type="button" disabled={province.actionPointsRemaining < 1} onClick={() =>
                  execute({ type: "GOVERNOR_DIRECT_INVESTMENT", provinceId, focus: investment })
                }>Direct investment</button>
                <label>
                  Federal initiative
                  <select value={federalIssue} onChange={(event) => setFederalIssue(event.target.value)}>
                    {props.world.issueIds.map((item) => <option key={item} value={item}>{props.catalog.issues.get(item)?.name ?? title(item.replace("ISS_", ""))}</option>)}
                  </select>
                </label>
                <div className="row">
                  <button className="btn secondary" type="button" disabled={province.actionPointsRemaining < 1} onClick={() =>
                    execute({ type: "GOVERNOR_TAKE_FEDERAL_POSITION", provinceId, issueId: federalIssue, direction: 1 })
                  }>Support</button>
                  <button className="btn secondary" type="button" disabled={province.actionPointsRemaining < 1} onClick={() =>
                    execute({ type: "GOVERNOR_TAKE_FEDERAL_POSITION", provinceId, issueId: federalIssue, direction: -1 })
                  }>Oppose</button>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Provincial pressures">
              {pressures.length === 0 ? <EmptyState>No unresolved provincial pressure.</EmptyState> : null}
              {pressures.map((pressure) => (
                <div className="pressure-row" key={pressure.id}>
                  <div><strong>{pressure.title}</strong><div className="muted">Opened {pressure.openedDate}</div></div>
                  <div className="row">
                    <button className="btn secondary" onClick={() => execute({ type: "GOVERNOR_RESPOND_TO_PRESSURE", provinceId, pressureId: pressure.id, response: "mobilize" })}>Mobilize</button>
                    <button className="btn secondary" onClick={() => execute({ type: "GOVERNOR_RESPOND_TO_PRESSURE", provinceId, pressureId: pressure.id, response: "coordinate" })}>Coordinate</button>
                    <button className="btn secondary" onClick={() => execute({ type: "GOVERNOR_RESPOND_TO_PRESSURE", provinceId, pressureId: pressure.id, response: "request_federal_support" })}>Request federal support</button>
                  </div>
                </div>
              ))}
            </SectionCard>
          </main>
          <aside>
            <SectionCard title="Political situation">
              <p><strong>{provincialMps.length}</strong> Assembly members represent constituencies touching {provinceName}.</p>
              <div className="compact-roster">
                {provincialMps.slice(0, 12).map((id) => <span key={id}>{politicianDisplayName(props.catalog, id)}</span>)}
              </div>
            </SectionCard>
            <SectionCard title="Election and career">
              {election ? <><StatusBadge tone={election.status === "filing_open" ? "warn" : "idle"}>{title(election.status)}</StatusBadge><p>{election.date} · {Object.keys(election.candidates).length} filed candidates</p></> : <EmptyState>No election scheduled.</EmptyState>}
              <p className="muted">Use Career → Opportunities to choose reelection or another legitimate race.</p>
            </SectionCard>
          </aside>
        </div>
      </div>
    );
  }

  const primary = kinds[0]?.office.kind ?? "private_citizen";
  const officeTitle = kinds[0]?.office.title ?? "Private citizen";
  const limited = primary === "minister" || primary === "mayor";
  const latestLimitedAction = Object.values(props.snap.provincialRuntime.actions)
    .filter((action) => action.actorId === playerId && (action.kind === "ministry_advice" || action.kind === "civic_priority"))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const limitedActionUsed = latestLimitedAction?.date.slice(0, 7) === props.snap.currentDate.slice(0, 7);
  return (
    <div className="office-page">
      <PageHeader kicker="Current role" title={officeTitle} subtitle={
        primary === "president" ? "National executive and foreign-policy authority."
          : primary === "speaker" ? "Assembly scheduling, procedure and institutional leadership."
            : primary === "assembly_member" ? "Legislation, recorded votes and constituency representation."
              : primary === "constitutional_court_justice" ? "Constitutional docket, deliberation and recorded judgment."
                : limited ? "A bounded supporting role in the current v1 political model."
                  : "No current public office. Your political career continues."
      } />
      {kinds.length ? <MetricStrip>{kinds.map(({ office, term }) => <StatCard key={term.id} label={office.kind.replace(/_/g, " ")} value={term.startDate ?? "Current"} />)}</MetricStrip> : null}
      <SectionCard title="Role briefing">
        {primary === "president" ? <p>Executive orders, regulations, appointments, budgets, bills, emergencies and international affairs are available through Executive and Foreign Affairs.</p> : null}
        {primary === "speaker" ? <p>The current legislative agenda, floor scheduling and bill delays are available in Assembly.</p> : null}
        {primary === "assembly_member" ? <p>Introduce concrete legislation, vote, build support and prepare for the next election through Assembly and Career.</p> : null}
        {primary === "constitutional_court_justice" ? <p>Pending constitutional cases and judicial votes are available in Courts.</p> : null}
        {primary === "minister" ? (
          <div className="office-actions">
            <p>Ministers advise the presidential executive; they do not possess presidential authority.</p>
            <label>
              Advisory focus
              <select value={limitedIssue} onChange={(event) => setLimitedIssue(event.target.value)}>
                {props.world.issueIds.map((issueId) => <option key={issueId} value={issueId}>{props.catalog.issues.get(issueId)?.name ?? title(issueId.replace("ISS_", ""))}</option>)}
              </select>
            </label>
            <button className="btn" disabled={limitedActionUsed} onClick={() => execute({ type: "MINISTER_ADVISE_PRIORITY", issueId: limitedIssue })}>Submit monthly policy advice</button>
            {latestLimitedAction ? <p className="muted">Latest advice: {props.catalog.issues.get(latestLimitedAction.focus)?.name ?? title(latestLimitedAction.focus)} · {latestLimitedAction.date}</p> : null}
          </div>
        ) : null}
        {primary === "mayor" ? (
          <div><p>Municipal play is intentionally limited in v1. You may set one visible civic emphasis while pursuing broader political opportunities.</p><div className="row">{(["housing", "transport", "services"] as const).map((priority) => <button key={priority} className="btn secondary" disabled={limitedActionUsed} onClick={() => execute({ type: "MAYOR_SET_CIVIC_PRIORITY", priority })}>{title(priority)}</button>)}</div>{latestLimitedAction ? <p className="muted">Current civic emphasis: {title(latestLimitedAction.focus)} · set {latestLimitedAction.date}</p> : null}</div>
        ) : null}
        {primary === "private_citizen" ? <p>You remain playable without office. Career lists future races for which you are eligible; no appointment or candidacy is automatic.</p> : null}
      </SectionCard>
      {limited ? <div className="role-depth-note"><StatusBadge tone="warn">Limited role</StatusBadge><span>This start has a smaller action set than President, MP, Governor or Justice.</span></div> : null}
    </div>
  );
}
