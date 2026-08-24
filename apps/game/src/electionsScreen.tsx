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
import {
  DataTable,
  EmptyState,
  EntityRow,
  MapDetailLayout,
  PageHeader,
  SectionCard,
  SectionDivider,
  StatusBadge,
  TabBar,
} from "./ui/kit.js";

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
  if (status === "filing_open") return "Filing open";
  if (status === "assumed") return "Assumed";
  return status.replace(/_/g, " ");
}

function statusTone(status: string): "ok" | "warn" | "idle" {
  if (status === "resolved" || status === "assumed") return "ok";
  if (status === "field_open" || status === "filing_open" || status === "qualification") return "warn";
  return "idle";
}

export function ElectionsPage(props: Props) {
  const elections = Object.values(props.snap.elections);
  const presidentialDue = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const assemblyDue = props.snap.pendingInterrupt?.code === "ASSEMBLY_ELECTION_DUE";
  const poll = latestPublicPoll(props.snap);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [tab, setTab] = useState<"presidential" | "assembly" | "gubernatorial" | "nominations">(
    "presidential",
  );

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
    return (
      ba - aa ||
      (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
      a.provinceId.localeCompare(b.provinceId)
    );
  });
  const homeProvince = props.world.politicianHomeProvince[props.snap.playerPoliticianId];
  const [governorElectionId, setGovernorElectionId] = useState("");
  const selectedGovernorRace =
    gubernatorial.find((race) => race.id === governorElectionId) ??
    gubernatorial.find((race) => race.provinceId === homeProvince) ??
    gubernatorial[0] ??
    null;

  function resolvePresidential() {
    const result = props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
    props.report(result);
    if (result.ok) props.sim.executeCommand({ type: "RESUME_TURN" });
    props.onDone();
  }

  function presidentialView(election: (typeof elections)[number]) {
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
      <article key={election.id} className="election-pres-block">
        <div className="election-pres-layout">
          <div>
            <SectionDivider
              title={electionDisplayName(election.id)}
              hint={election.date}
              actions={<StatusBadge tone={statusTone(election.status)}>{statusLabel(election.status)}</StatusBadge>}
            />
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
            ) : (
              <p className="muted">
                {election.status === "resolved"
                  ? "No certified winner recorded."
                  : "National result pending resolution."}
              </p>
            )}
            {poll && election.status !== "resolved" ? (
              <p className="muted">
                Latest national poll {poll.publicationDate}:{" "}
                {pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)}
              </p>
            ) : null}
            <TerenaMap
              bundle={props.bundle}
              mode="election"
              selectedId={null}
              showConstituencies={false}
              fillFor={(feature, kind) =>
                mapFillFor("election", props.world, props.snap, feature, kind)
              }
            />
            {presidentialDue && election.status !== "resolved" ? (
              <button type="button" className="btn" onClick={resolvePresidential}>
                Resolve election
              </button>
            ) : null}
          </div>
          <aside className="candidate-result-rail">
            <SectionDivider title="Candidates" hint="1st preference shares" />
            {ranked.length === 0 ? <EmptyState>No candidates filed.</EmptyState> : null}
            {ranked.map((candidate) => {
              const rawVotes = firstPreferences[candidate.politicianId];
              const firstPreferenceShare =
                totalVotes > 0 ? voteWeight(rawVotes) / totalVotes : undefined;
              const isWinner = winnerId === candidate.politicianId;
              return (
                <EntityRow
                  key={candidate.politicianId}
                  title={politicianDisplayName(props.catalog, candidate.politicianId)}
                  meta={partyDisplayName(props.world, candidate.partyId ?? null, props.snap)}
                  status={
                    isWinner ? (
                      <StatusBadge tone="ok">Winner</StatusBadge>
                    ) : election.status === "resolved" ? (
                      <StatusBadge>Defeated</StatusBadge>
                    ) : (
                      <StatusBadge>On ballot</StatusBadge>
                    )
                  }
                  trailing={
                    rawVotes != null ? (
                      <span className="election-votes">
                        {formatPublicPercent(firstPreferenceShare)}
                        <span className="muted"> · {formatPublicNumber(rawVotes)}</span>
                      </span>
                    ) : null
                  }
                  selected={isWinner}
                />
              );
            })}
          </aside>
        </div>
        {rounds.length > 0 ? (
          <>
            <SectionDivider title="Ranked-choice rounds" hint="Elimination and election sequence" />
            <DataTable headers={["Round", "Outcome"]} dense caption="RCV progression">
              {rounds.map((round, index) => (
                <tr key={index}>
                  <td>{round.round ?? index + 1}</td>
                  <td>
                    {round.eliminatedId
                      ? `Excluded ${politicianDisplayName(props.catalog, round.eliminatedId)}`
                      : round.electedId
                        ? `Elected ${politicianDisplayName(props.catalog, round.electedId)}`
                        : "Count complete"}
                  </td>
                </tr>
              ))}
            </DataTable>
          </>
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
    const magnitude = result?.magnitude ?? field?.magnitude ?? 0;
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
      return (
        [...totals.entries()].sort(
          (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
        )[0]?.[0] ?? null
      );
    };
    const steps = result?.countArchive?.steps ?? [];

    return (
      <div className="assembly-election-view">
        <SectionDivider
          title={electionDisplayName(election.id)}
          hint={`Election date ${election.date}`}
          actions={
            <StatusBadge tone={statusTone(election.status)}>{statusLabel(election.status)}</StatusBadge>
          }
        />
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
            <DataTable headers={["Party", "Seats", "Change"]} dense>
              {partyRows.map((row) => (
                <tr key={row.partyKey}>
                  <td>
                    <span
                      className="party-swatch"
                      style={{ background: partyColor(props.world, row.partyId) }}
                      aria-hidden
                    />{" "}
                    {partyDisplayName(props.world, row.partyId, props.snap)}
                  </td>
                  <td>{row.seats}</td>
                  <td className="muted">
                    {row.change === 0 ? "—" : row.change > 0 ? `+${row.change}` : row.change}
                  </td>
                </tr>
              ))}
            </DataTable>
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

        <MapDetailLayout
          className="assembly-results-layout"
          map={
            <>
              <SectionDivider title="Constituency map" />
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
                Colored by the party winning the largest seat share in that multi-member district.
              </p>
            </>
          }
          detail={
            <>
              <SectionDivider
                title={
                  constituencyId
                    ? constituencyDisplayName(props.catalog, constituencyId)
                    : "Constituency"
                }
                {...(constituencyId
                  ? {
                      hint: `${magnitude} seat${magnitude === 1 ? "" : "s"}${
                        result
                          ? ` · turnout ${formatPublicPercent(result.turnout.turnoutRate)}`
                          : " · ballot field"
                      }`,
                    }
                  : {})}
              />
              {!constituencyId ? (
                <EmptyState>Constituency fields are not available yet.</EmptyState>
              ) : (
                <>
                  {result?.archiveCompleteness === "legacy_summary" ? (
                    <p className="muted">This result predates detailed STV archiving.</p>
                  ) : null}
                  <DataTable
                    headers={["Candidate", "Party", "1st pref", "Status"]}
                    dense
                    caption={magnitude > 1 ? "STV multi-member field" : "Constituency field"}
                  >
                    {candidateRows.map((candidateId) => {
                      const rawVotes = firstPreferences[candidateId];
                      const share =
                        totalFirstPreferences > 0
                          ? voteWeight(rawVotes) / totalFirstPreferences
                          : undefined;
                      const partyId =
                        result?.partyByCandidate[candidateId] ??
                        props.snap.politicians[candidateId]?.partyId ??
                        null;
                      const status = result
                        ? elected.has(candidateId)
                          ? "Elected"
                          : "Not elected"
                        : "Candidate";
                      return (
                        <tr key={candidateId} className={elected.has(candidateId) ? "selected" : ""}>
                          <td>{politicianDisplayName(props.catalog, candidateId)}</td>
                          <td>{partyDisplayName(props.world, partyId, props.snap)}</td>
                          <td>
                            {rawVotes != null
                              ? `${formatPublicPercent(share)} · ${formatPublicNumber(rawVotes)}`
                              : "—"}
                          </td>
                          <td>
                            <StatusBadge tone={elected.has(candidateId) ? "ok" : "idle"}>
                              {status}
                            </StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                  {steps.length > 0 ? (
                    <>
                      <SectionDivider title="STV count steps" />
                      <DataTable headers={["Count", "Outcome"]} dense>
                        {steps.map((step) => {
                          const electedNames = [
                            ...(step.electedId ? [step.electedId] : []),
                            ...(step.electedIds ?? []),
                          ].map((id) => politicianDisplayName(props.catalog, id));
                          return (
                            <tr key={step.step}>
                              <td>{step.step}</td>
                              <td>
                                {electedNames.length
                                  ? `Elected ${electedNames.join(", ")}`
                                  : step.eliminatedId
                                    ? `Excluded ${politicianDisplayName(props.catalog, step.eliminatedId)}`
                                    : "Count complete"}
                              </td>
                            </tr>
                          );
                        })}
                      </DataTable>
                    </>
                  ) : null}
                </>
              )}
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-tone-election">
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
          {presidential.length === 0 ? <EmptyState>No presidential election is scheduled.</EmptyState> : null}
          {presidential.map(presidentialView)}
        </div>
      ) : null}
      {tab === "assembly" ? (
        <div>
          {assembly.length > 1 ? (
            <label className="election-cycle-picker">
              Election cycle
              <select
                value={selectedAssembly?.id ?? ""}
                onChange={(e) => setAssemblyId(e.target.value)}
              >
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
          {selectedGovernorRace ? (
            <>
              <label className="election-cycle-picker">
                Province
                <select
                  value={selectedGovernorRace.id}
                  onChange={(event) => setGovernorElectionId(event.target.value)}
                >
                  {gubernatorial.map((race) => (
                    <option key={race.id} value={race.id}>
                      {props.catalog.places.get(race.provinceId)?.name ?? race.provinceId} ·{" "}
                      {race.date.slice(0, 4)} · {statusLabel(race.status)}
                    </option>
                  ))}
                </select>
              </label>
              <MapDetailLayout
                map={
                  <>
                    <SectionDivider title="Provincial election map" />
                    <TerenaMap
                      bundle={props.bundle}
                      mode="election"
                      selectedId={selectedGovernorRace.provinceId}
                      showConstituencies={false}
                      fillFor={(feature, kind) =>
                        mapFillFor(
                          "election",
                          props.world,
                          props.snap,
                          feature,
                          kind,
                          undefined,
                          undefined,
                          selectedGovernorRace.id,
                        )
                      }
                      onSelect={(selected) => {
                        if (selected.kind !== "province") return;
                        const race = gubernatorial.find(
                          (candidate) =>
                            candidate.provinceId === selected.id &&
                            candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4),
                        );
                        if (race) setGovernorElectionId(race.id);
                      }}
                      tooltipFor={(selected) => {
                        const race = gubernatorial.find(
                          (candidate) =>
                            candidate.provinceId === selected.id &&
                            candidate.date.slice(0, 4) === selectedGovernorRace.date.slice(0, 4),
                        );
                        return (
                          <>
                            <strong>{selected.name}</strong>
                            <span>
                              {race?.winnerId
                                ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}`
                                : race
                                  ? `${statusLabel(race.status)} · ${Object.keys(race.candidates).length} candidates`
                                  : "No race in this cycle"}
                            </span>
                          </>
                        );
                      }}
                    />
                    <p className="muted">
                      Province-wide certified winners are colored by party. Unresolved races remain
                      neutral.
                    </p>
                  </>
                }
                detail={
                  <>
                    <SectionDivider
                      title={`${props.catalog.places.get(selectedGovernorRace.provinceId)?.name ?? selectedGovernorRace.provinceId} governor`}
                      hint={selectedGovernorRace.date}
                      actions={
                        <StatusBadge tone={statusTone(selectedGovernorRace.status)}>
                          {statusLabel(selectedGovernorRace.status)}
                        </StatusBadge>
                      }
                    />
                    {selectedGovernorRace.turnoutRate != null ? (
                      <p className="muted">
                        Turnout {formatPublicPercent(selectedGovernorRace.turnoutRate)}
                      </p>
                    ) : null}
                    <DataTable headers={["Candidate", "Party", "Share", "Status"]} dense>
                      {Object.values(selectedGovernorRace.candidates)
                        .filter((candidate) => !candidate.withdrawn)
                        .sort(
                          (a, b) =>
                            (selectedGovernorRace.voteShares[b.politicianId] ?? 0) -
                            (selectedGovernorRace.voteShares[a.politicianId] ?? 0),
                        )
                        .map((candidate) => {
                          const isWinner = selectedGovernorRace.winnerId === candidate.politicianId;
                          const status = isWinner
                            ? "Winner"
                            : selectedGovernorRace.status === "resolved" ||
                                selectedGovernorRace.status === "assumed"
                              ? "Not elected"
                              : candidate.incumbent
                                ? "Incumbent"
                                : "Filed";
                          return (
                            <tr key={candidate.politicianId}>
                              <td>{politicianDisplayName(props.catalog, candidate.politicianId)}</td>
                              <td>
                                {partyDisplayName(
                                  props.world,
                                  props.snap.politicians[candidate.politicianId]?.partyId ?? null,
                                  props.snap,
                                )}
                              </td>
                              <td>
                                {selectedGovernorRace.voteShares[candidate.politicianId] != null
                                  ? formatPublicPercent(
                                      selectedGovernorRace.voteShares[candidate.politicianId],
                                    )
                                  : "—"}
                              </td>
                              <td>
                                <StatusBadge tone={isWinner ? "ok" : "idle"}>{status}</StatusBadge>
                              </td>
                            </tr>
                          );
                        })}
                    </DataTable>
                    {Object.keys(selectedGovernorRace.candidates).length === 0 ? (
                      <EmptyState>The candidate field will form when filing opens.</EmptyState>
                    ) : null}
                  </>
                }
              />
            </>
          ) : (
            <EmptyState>No gubernatorial election is scheduled.</EmptyState>
          )}
        </div>
      ) : null}
      {tab === "nominations" ? (
        <div>
          {nominations.map((contest) => (
            <SectionCard key={contest.id} title={contestDisplayName(props.snap, props.world, contest.id)}>
              <StatusBadge tone={statusTone(contest.status)}>{statusLabel(contest.status)}</StatusBadge>
              <span className="muted nomination-cycle-label">
                {typeof contest.metadata.electionDate === "string"
                  ? ` Presidential election ${contest.metadata.electionDate}`
                  : " Presidential nomination"}
              </span>
              {Object.values(contest.entries)
                .filter((entry) => entry.status !== "potential")
                .map((entry) => (
                  <EntityRow
                    key={entry.politicianId}
                    title={politicianDisplayName(props.catalog, entry.politicianId)}
                    meta="Nomination candidate"
                    status={
                      contest.winnerId === entry.politicianId ? (
                        <StatusBadge tone="ok">Winner</StatusBadge>
                      ) : (
                        <StatusBadge>{entry.status.replace(/_/g, " ")}</StatusBadge>
                      )
                    }
                    selected={contest.winnerId === entry.politicianId}
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
