import { useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import type {
  CommandResult,
  KernelWorld,
  SimState,
  Simulation,
} from "@lorsain/sim";
import {
  constituencyDisplayName,
  contestDisplayName,
  electionDisplayName,
  partyColor,
  partyDisplayName,
  politicianDisplayName,
  pollShareLine,
  type PresentationCatalog,
} from "./presentation.js";
import { formatPublicNumber, formatPublicPercent } from "./presentation/display.js";
import { latestPublicPoll, mapFillFor } from "./map/fills.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import { EmptyState, PageHeader, SectionCard, StatusBadge, TabBar } from "./ui/kit.js";
import { PoliticianCard } from "./ui/politician.js";

type Props = {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (result: CommandResult) => boolean;
  countingElection: boolean;
  onResolveAssembly: () => void;
};

function voteWeight(raw: unknown): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

function statusLabel(status: string): string {
  if (status === "field_open") return "Filing open";
  if (status === "field_finalized") return "Ballot finalized";
  if (status === "qualification") return "Qualification";
  if (status === "resolved") return "Completed";
  if (status === "planned") return "Upcoming";
  return status.replace(/_/g, " ");
}

export function ElectionsPage(props: Props) {
  const elections = Object.values(props.snap.elections);
  const presidentialDue = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const assemblyDue = props.snap.pendingInterrupt?.code === "ASSEMBLY_ELECTION_DUE";
  const poll = latestPublicPoll(props.snap);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [tab, setTab] = useState<"presidential" | "assembly" | "gubernatorial" | "nominations">("presidential");

  const electionOrder = (a: (typeof elections)[number], b: (typeof elections)[number]) => {
    const aCurrent = a.status !== "resolved" && a.status !== "cancelled";
    const bCurrent = b.status !== "resolved" && b.status !== "cancelled";
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    return aCurrent ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  };
  const presidential = elections.filter((e) => e.type === "presidential").sort(electionOrder);
  const assembly = elections
    .filter((e) => e.type === "assembly" && e.geographyKind === "national")
    .sort(electionOrder);
  const nominations = Object.values(props.snap.partyContests)
    .filter((contest) => contest.type === "presidential_nomination")
    .sort((a, b) => {
      const aDate = typeof a.metadata.electionDate === "string" ? a.metadata.electionDate : "";
      const bDate = typeof b.metadata.electionDate === "string" ? b.metadata.electionDate : "";
      return bDate.localeCompare(aDate) || a.partyId.localeCompare(b.partyId);
    });
  const [assemblyId, setAssemblyId] = useState(assembly[0]?.id ?? "");
  const selectedAssembly = assembly.find((e) => e.id === assemblyId) ?? assembly[0] ?? null;
  const gubernatorial = Object.values(props.snap.provincialRuntime.elections).sort((a, b) => {
    const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
    const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
    return ba - aa || (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.provinceId.localeCompare(b.provinceId);
  });
  const homeProvince = props.world.politicianHomeProvince[props.snap.playerPoliticianId];
  const [governorElectionId, setGovernorElectionId] = useState("");
  const selectedGovernorRace = gubernatorial.find((race) => race.id === governorElectionId)
    ?? gubernatorial.find((race) => race.provinceId === homeProvince)
    ?? gubernatorial[0]
    ?? null;

  function resolvePresidential() {
    const result = props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    props.report(result);
    if (result.ok) props.sim.executeCommand({ type: "RESUME_TURN" });
    props.onDone();
  }

  function presidentialCard(election: (typeof elections)[number]) {
    const firstPreferences =
      election.countArchive && "firstPreferences" in election.countArchive
        ? election.countArchive.firstPreferences
        : {};
    const totalVotes = Object.values(firstPreferences).reduce(
      (sum, value) => sum + voteWeight(value),
      0,
    );
    const winnerId = election.winnerIds[0] ?? null;
    const ranked = Object.values(election.candidates)
      .slice()
      .sort((a, b) => {
        const votes =
          voteWeight(firstPreferences[b.politicianId]) -
          voteWeight(firstPreferences[a.politicianId]);
        return votes || Number(a.politicianId !== winnerId) - Number(b.politicianId !== winnerId);
      });
    const rounds =
      election.countArchive && "rounds" in election.countArchive
        ? election.countArchive.rounds
        : [];
    return (
      <article key={election.id} className="election-result-card">
        <h3 className="serif-head">{electionDisplayName(election.id)}</h3>
        <p className="muted">
          {statusLabel(election.status)} · {election.date}
          {election.status === "resolved"
            ? " · first-preference shares are not final-round totals"
            : ""}
        </p>
        {winnerId ? (
          <div className="election-winner-banner">
            <div className="kicker">Winner</div>
            <strong>{politicianDisplayName(props.catalog, winnerId)}</strong>
            <div className="muted">
              {partyDisplayName(
                props.world,
                election.candidates[winnerId]?.partyId ?? null,
                props.snap,
              )}
            </div>
          </div>
        ) : null}
        <div className="candidate-result-list">
          {ranked.map((candidate) => {
            const rawVotes = firstPreferences[candidate.politicianId];
            const firstPreferenceShare =
              totalVotes > 0 ? voteWeight(rawVotes) / totalVotes : undefined;
            return (
              <PoliticianCard
                key={candidate.politicianId}
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={candidate.politicianId}
                office="Presidential candidate"
                compact
                selected={winnerId === candidate.politicianId}
                action={
                  rawVotes != null ? (
                    <span className="election-votes">
                      {winnerId === candidate.politicianId ? "Winner · " : ""}1st pref{" "}
                      {formatPublicPercent(firstPreferenceShare)} · {formatPublicNumber(rawVotes)}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </div>
        {presidentialDue && election.status !== "resolved" ? (
          <button type="button" className="btn" onClick={resolvePresidential}>
            Resolve election
          </button>
        ) : null}
        {rounds.length > 0 ? (
          <details className="stv-details">
            <summary>View ranked-choice progression ({rounds.length} rounds)</summary>
            <div className="rcv-track">
              {rounds.map((round, index) => (
                <span key={index} className={`rcv-chip${round.electedId ? " winner" : ""}`}>
                  Round {round.round ?? index + 1}
                  {round.eliminatedId
                    ? `: excluded ${politicianDisplayName(props.catalog, round.eliminatedId)}`
                    : round.electedId
                      ? `: elected ${politicianDisplayName(props.catalog, round.electedId)}`
                      : ""}
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </article>
    );
  }

  function assemblyView(election: (typeof elections)[number]) {
    const cycle = election.assembly;
    const results = cycle?.constituencyResults ?? {};
    const fields = cycle?.constituencyFields ?? {};
    const available = [...new Set([...Object.keys(results), ...Object.keys(fields)])].sort();
    const constituencyId =
      selection?.kind === "constituency" && available.includes(selection.id)
        ? selection.id
        : available[0] ?? null;
    const result = constituencyId ? results[constituencyId] : null;
    const field = constituencyId ? fields[constituencyId] : null;
    const candidateIds = result?.candidateIds ?? field?.candidateIds ?? [];
    const elected = new Set(result?.electedIds ?? []);
    const firstPreferences = result?.firstPreferences ?? {};
    const totalFirstPreferences = Object.values(firstPreferences).reduce(
      (sum, value) => sum + voteWeight(value),
      0,
    );
    const candidateRows = candidateIds.slice().sort((a, b) => {
      const voteDelta = voteWeight(firstPreferences[b]) - voteWeight(firstPreferences[a]);
      return voteDelta || Number(elected.has(b)) - Number(elected.has(a)) || a.localeCompare(b);
    });
    const partyRows = Object.entries(cycle?.partySeatTotals ?? {})
      .map(([partyKey, seats]) => ({
        partyKey,
        partyId: partyKey === "independent" ? null : partyKey,
        seats,
        change: seats - (cycle?.previousPartySeatTotals[partyKey] ?? 0),
      }))
      .sort((a, b) => b.seats - a.seats || a.partyKey.localeCompare(b.partyKey));
    const majority = partyRows.find((row) => row.seats >= 211);
    const pluralityParty = (id: string): string | null => {
      const constituency = results[id];
      if (!constituency) return null;
      const totals = new Map<string | null, number>();
      for (const winnerId of constituency.electedIds) {
        const partyId = constituency.partyByCandidate[winnerId] ?? null;
        totals.set(partyId, (totals.get(partyId) ?? 0) + 1);
      }
      return [...totals.entries()].sort(
        (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
      )[0]?.[0] ?? null;
    };
    const steps = result?.countArchive?.steps ?? [];

    return (
      <div className="assembly-election-view">
        <SectionCard title={`${electionDisplayName(election.id)} · ${statusLabel(election.status)}`}>
          <p className="muted">Election date {election.date}</p>
          {partyRows.length > 0 ? (
            <>
              <div className="composition-bar" aria-label="Assembly party composition">
                {partyRows.map((row) => (
                  <span
                    key={row.partyKey}
                    className="composition-seg"
                    style={{
                      width: `${(row.seats / 420) * 100}%`,
                      background: partyColor(props.world, row.partyId),
                    }}
                    title={`${partyDisplayName(props.world, row.partyId, props.snap)}: ${row.seats}`}
                  />
                ))}
              </div>
              <p className="majority-note">
                420 seats · 211 for a majority ·{" "}
                {majority
                  ? `${partyDisplayName(props.world, majority.partyId, props.snap)} holds a majority`
                  : "No party holds a majority"}
              </p>
              <div className="assembly-party-summary">
                {partyRows.map((row) => (
                  <div key={row.partyKey} className="assembly-party-row">
                    <span
                      className="party-swatch"
                      style={{ background: partyColor(props.world, row.partyId) }}
                      aria-hidden
                    />
                    <span>{partyDisplayName(props.world, row.partyId, props.snap)}</span>
                    <strong>{row.seats}</strong>
                    <span className="muted">
                      {row.change === 0 ? "—" : row.change > 0 ? `+${row.change}` : row.change}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              {cycle?.filingStatus === "open"
                ? `Candidate filing is open through ${cycle.filingDeadlineDate}.`
                : election.fieldFinalized
                  ? `${Object.keys(fields).length} constituency ballots are finalized.`
                  : "Candidate filing has not opened."}
            </p>
          )}
          {assemblyDue && election.status !== "resolved" ? (
            <button
              type="button"
              className="btn"
              disabled={props.countingElection}
              onClick={props.onResolveAssembly}
            >
              {props.countingElection ? "Counting election…" : "Resolve Assembly election"}
            </button>
          ) : null}
          {props.countingElection ? (
            <p className="counting-state" role="status" aria-live="polite">
              Counting election… The national STV count is running in the background.
            </p>
          ) : null}
        </SectionCard>
        <div className="dash dash-2 assembly-results-layout">
          <SectionCard title="Constituency map">
            <TerenaMap
              bundle={props.bundle}
              mode="election"
              selectedId={constituencyId}
              fillFor={(feature, kind) =>
                kind === "constituency" && results[feature.id]
                  ? partyColor(props.world, pluralityParty(feature.id))
                  : kind === "province"
                    ? "#e7efe6"
                    : "transparent"
              }
              onSelect={setSelection}
            />
            <p className="muted">
              Constituencies are colored by the party winning the largest number of seats. Select
              one for its public count.
            </p>
          </SectionCard>
          <SectionCard
            title={
              constituencyId
                ? constituencyDisplayName(props.catalog, constituencyId)
                : "Constituency result"
            }
          >
            {!constituencyId ? (
              <EmptyState>Constituency fields are not available yet.</EmptyState>
            ) : (
              <>
                <p className="muted">
                  {result?.magnitude ?? field?.magnitude ?? 0} seats
                  {result ? ` · turnout ${formatPublicPercent(result.turnout.turnoutRate)}` : " · ballot field"}
                </p>
                {result?.archiveCompleteness === "legacy_summary" ? (
                  <p className="muted">This result predates detailed STV archiving.</p>
                ) : null}
                <div className="candidate-result-list assembly-candidate-list">
                  {candidateRows.map((candidateId) => {
                    const rawVotes = firstPreferences[candidateId];
                    const share =
                      totalFirstPreferences > 0
                        ? voteWeight(rawVotes) / totalFirstPreferences
                        : undefined;
                    return (
                      <PoliticianCard
                        key={candidateId}
                        catalog={props.catalog}
                        world={props.world}
                        state={props.snap}
                        politicianId={candidateId}
                        office={
                          result
                            ? elected.has(candidateId)
                              ? "Elected to the National Assembly"
                              : "Assembly candidate"
                            : "Filed Assembly candidate"
                        }
                        compact
                        selected={elected.has(candidateId)}
                        action={
                          <span className="election-votes">
                            {result ? (elected.has(candidateId) ? "Elected" : "Not elected") : "Candidate"}
                            {rawVotes != null
                              ? ` · 1st pref ${formatPublicPercent(share)} · ${formatPublicNumber(rawVotes)}`
                              : ""}
                          </span>
                        }
                      />
                    );
                  })}
                </div>
                {steps.length > 0 ? (
                  <details className="stv-details">
                    <summary>View STV count rounds ({steps.length})</summary>
                    <div className="rcv-track">
                      {steps.map((step) => {
                        const electedNames = [
                          ...(step.electedId ? [step.electedId] : []),
                          ...(step.electedIds ?? []),
                        ].map((id) => politicianDisplayName(props.catalog, id));
                        return (
                          <span
                            key={step.step}
                            className={`rcv-chip${electedNames.length ? " winner" : ""}`}
                          >
                            Count {step.step}: {electedNames.length
                              ? `elected ${electedNames.join(", ")}`
                              : step.eliminatedId
                                ? `excluded ${politicianDisplayName(props.catalog, step.eliminatedId)}`
                                : "count complete"}
                          </span>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Returns"
        title="Elections"
        subtitle="Upcoming cycles, active ballots, and certified public results."
      />
      <TabBar
        tabs={[
          { id: "presidential", label: "Presidential" },
          { id: "assembly", label: "Assembly" },
          { id: "gubernatorial", label: "Governors" },
          { id: "nominations", label: "Nominations" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "presidential" ? (
        <div>
          {poll ? (
            <p className="muted">
              Latest national poll {poll.publicationDate}:{" "}
              {pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)}
            </p>
          ) : (
            <EmptyState>No current national presidential poll has been published.</EmptyState>
          )}
          {presidential.map(presidentialCard)}
        </div>
      ) : null}
      {tab === "assembly" ? (
        <div>
          {assembly.length > 1 ? (
            <label className="election-cycle-picker">
              Election cycle
              <select value={selectedAssembly?.id ?? ""} onChange={(e) => setAssemblyId(e.target.value)}>
                {assembly.map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.date.slice(0, 4)} · {statusLabel(election.status)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedAssembly ? (
            assemblyView(selectedAssembly)
          ) : (
            <EmptyState>No Assembly election is scheduled.</EmptyState>
          )}
        </div>
      ) : null}
      {tab === "gubernatorial" ? (
        <div className="governor-election-view">
          {selectedGovernorRace ? <>
            <label className="election-cycle-picker">Province
              <select value={selectedGovernorRace.id} onChange={(event) => setGovernorElectionId(event.target.value)}>
                {gubernatorial.map((race) => <option key={race.id} value={race.id}>{props.catalog.places.get(race.provinceId)?.name ?? race.provinceId} · {race.date.slice(0, 4)} · {statusLabel(race.status)}</option>)}
              </select>
            </label>
            <div className="dash dash-2">
              <SectionCard title="Provincial election map">
                <TerenaMap
                  bundle={props.bundle}
                  mode="election"
                  selectedId={selectedGovernorRace.provinceId}
                  showConstituencies={false}
                  fillFor={(feature, kind) => mapFillFor("election", props.world, props.snap, feature, kind, undefined, undefined, selectedGovernorRace.id)}
                  onSelect={(selected) => {
                    if (selected.kind !== "province") return;
                    const race = gubernatorial.find((candidate) => candidate.provinceId === selected.id && candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4));
                    if (race) setGovernorElectionId(race.id);
                  }}
                  tooltipFor={(selected) => {
                    const race = gubernatorial.find((candidate) => candidate.provinceId === selected.id && candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4));
                    return <><strong>{selected.name}</strong><span>{race?.winnerId ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}` : race ? `${statusLabel(race.status)} · ${Object.keys(race.candidates).length} candidates` : "No race in this cycle"}</span></>;
                  }}
                />
                <p className="muted">Province-wide certified winners are colored by party. Unresolved races remain neutral.</p>
              </SectionCard>
              <SectionCard title={`${props.catalog.places.get(selectedGovernorRace.provinceId)?.name ?? selectedGovernorRace.provinceId} governor`}>
                <p className="muted">{selectedGovernorRace.date} · {statusLabel(selectedGovernorRace.status)}{selectedGovernorRace.turnoutRate != null ? ` · turnout ${formatPublicPercent(selectedGovernorRace.turnoutRate)}` : ""}</p>
                {Object.values(selectedGovernorRace.candidates)
                  .filter((candidate) => !candidate.withdrawn)
                  .sort((a, b) => (selectedGovernorRace.voteShares[b.politicianId] ?? 0) - (selectedGovernorRace.voteShares[a.politicianId] ?? 0))
                  .map((candidate) => <PoliticianCard
                    key={candidate.politicianId}
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={candidate.politicianId}
                    office={candidate.incumbent ? "Incumbent governor" : "Candidate for governor"}
                    compact
                    selected={selectedGovernorRace.winnerId === candidate.politicianId}
                    action={<span className="election-votes">{selectedGovernorRace.winnerId === candidate.politicianId ? "Winner" : selectedGovernorRace.status === "resolved" || selectedGovernorRace.status === "assumed" ? "Not elected" : "Filed"}{selectedGovernorRace.voteShares[candidate.politicianId] != null ? ` · ${formatPublicPercent(selectedGovernorRace.voteShares[candidate.politicianId])}` : ""}</span>}
                  />)}
                {Object.keys(selectedGovernorRace.candidates).length === 0 ? <EmptyState>The candidate field will form when filing opens.</EmptyState> : null}
              </SectionCard>
            </div>
          </> : <EmptyState>No gubernatorial election is scheduled.</EmptyState>}
        </div>
      ) : null}
      {tab === "nominations" ? (
        <div>
          {nominations.map((contest) => (
            <SectionCard
              key={contest.id}
              title={contestDisplayName(props.snap, props.world, contest.id)}
            >
              <StatusBadge>{statusLabel(contest.status)}</StatusBadge>
              <span className="muted nomination-cycle-label">
                {typeof contest.metadata.electionDate === "string"
                  ? ` Presidential election ${contest.metadata.electionDate}`
                  : " Presidential nomination"}
              </span>
              {Object.values(contest.entries)
                .filter((entry) => entry.status !== "potential")
                .map((entry) => (
                  <PoliticianCard
                    key={entry.politicianId}
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={entry.politicianId}
                    office="Presidential nomination candidate"
                    compact
                  />
                ))}
              {contest.winnerId ? (
                <p>Nomination winner: {politicianDisplayName(props.catalog, contest.winnerId)}</p>
              ) : null}
            </SectionCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}
