import { useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import type {
  CommandResult,
  KernelWorld,
  SimState,
  Simulation,
} from "@lorsain/sim";
import { nominationCalendarDates } from "@lorsain/sim";
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
  onResolvePresidential: () => void;
};

function voteWeight(raw: unknown): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

function statusLabel(status: string): string {
  if (status === "field_open") return "Filing open";
  if (status === "field_finalized") return "Ballot finalized";
  if (status === "qualification") return "Qualification underway";
  if (status === "qualified") return "Qualified";
  if (status === "declared") return "Declared";
  if (status === "voting") return "Voting / counting";
  if (status === "resolved") return "Certified";
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

function ElectionNightPanel(props: {
  phase: "ready" | "counting" | "certified";
  title: string;
  detail: string;
  outcome?: string | null;
}) {
  return (
    <section className={`election-night-workspace ${props.phase}`} aria-live="polite">
      <div>
        <div className="kicker">Election Night</div>
        <h3>{props.title}</h3>
        <p>{props.detail}</p>
      </div>
      <div className="election-night-state">
        <StatusBadge tone={props.phase === "certified" ? "ok" : "warn"}>
          {props.phase === "ready" ? "Polls closed" : props.phase === "counting" ? "Counting" : "Certified"}
        </StatusBadge>
        {props.outcome ? <strong>{props.outcome}</strong> : null}
      </div>
    </section>
  );
}

export function ElectionsPage(props: Props) {
  const elections = Object.values(props.snap.elections);
  const presidentialDue = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const assemblyDue = props.snap.pendingInterrupt?.code === "ASSEMBLY_ELECTION_DUE";
  const poll = latestPublicPoll(props.snap);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [tab, setTab] = useState<"presidential" | "assembly" | "provincial_assembly" | "gubernatorial" | "internal" | "calendar">(
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
  const internalPartyContests = Object.values(props.snap.partyContests).sort((a, b) => {
    const aLive = a.status !== "resolved" && a.status !== "cancelled";
    const bLive = b.status !== "resolved" && b.status !== "cancelled";
    return Number(bLive) - Number(aLive) || (b.resolvedDate ?? b.createdDate).localeCompare(a.resolvedDate ?? a.createdDate) || a.id.localeCompare(b.id);
  });
  const internalCaucusContests = Object.values(props.snap.legislatureRuntime.caucusContests).sort(
    (a, b) => Number(b.status === "open") - Number(a.status === "open") || b.closeDate.localeCompare(a.closeDate) || a.id.localeCompare(b.id),
  );
  const [internalSelection, setInternalSelection] = useState(
    internalPartyContests[0]
      ? `party:${internalPartyContests[0].id}`
      : internalCaucusContests[0]
        ? `caucus:${internalCaucusContests[0].id}`
        : "",
  );
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
  const provincialAssembly = Object.values(props.snap.provincialRuntime.assemblyElections).sort(
    (a, b) => {
      const aa = a.status !== "resolved" ? 1 : 0;
      const ba = b.status !== "resolved" ? 1 : 0;
      return ba - aa || (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.provinceId.localeCompare(b.provinceId);
    },
  );
  const [provincialAssemblyElectionId, setProvincialAssemblyElectionId] = useState("");
  const selectedProvincialAssembly =
    provincialAssembly.find((race) => race.id === provincialAssemblyElectionId) ??
    provincialAssembly.find((race) => race.provinceId === homeProvince) ??
    provincialAssembly[0] ??
    null;
  const groupProvincialCycles = <T extends { date: string; status: string }>(
    rows: T[],
    label: string,
  ) => Object.values(rows.reduce<Record<string, { date: string; title: string; detail: string; count: number }>>(
    (groups, row) => {
      const key = `${row.date}:${row.status}`;
      const existing = groups[key];
      if (existing) {
        existing.count += 1;
        existing.title = `${existing.count} ${label}`;
      } else {
        groups[key] = { date: row.date, title: `1 ${label}`, detail: statusLabel(row.status), count: 1 };
      }
      return groups;
    },
    {},
  ));
  const calendarEvents = [
    ...elections.map((election) => ({ date: election.date, title: election.type === "presidential" ? "Presidential election" : "National Assembly election", detail: statusLabel(election.status) })),
    ...groupProvincialCycles(Object.values(props.snap.provincialRuntime.elections), "gubernatorial elections"),
    ...groupProvincialCycles(Object.values(props.snap.provincialRuntime.assemblyElections), "Provincial Assembly elections"),
    ...Object.values(props.snap.legislatureRuntime.caucusContests).map((contest) => ({ date: contest.closeDate, title: `${partyDisplayName(props.world, contest.partyId, props.snap)} ${contest.role === "floor_leader" ? "floor leader" : "whip"} election`, detail: statusLabel(contest.status) })),
    ...Object.values(props.snap.partyContests).flatMap((contest) => {
      const electionDate = typeof contest.metadata.electionDate === "string" ? contest.metadata.electionDate : null;
      const date = contest.type === "presidential_nomination" && electionDate
        ? nominationCalendarDates(electionDate).resolve
        : contest.resolvedDate ?? (typeof contest.metadata.closeDate === "string" ? contest.metadata.closeDate : null) ?? contest.openedDate ?? contest.createdDate;
      const title = contest.type === "presidential_nomination"
        ? `${partyDisplayName(props.world, contest.partyId, props.snap)} presidential nomination`
        : contest.factionId
          ? `${props.world.factionDefinitions[contest.factionId]?.name ?? "Caucus"} leadership contest`
          : `${partyDisplayName(props.world, contest.partyId, props.snap)} leadership election`;
      return [{ date, title, detail: statusLabel(contest.status) }];
    }),
    ...Object.values(props.snap.provincialRuntime.constitutionalAmendments).flatMap((amendment) => amendment.ratificationDeadline ? [{ date: amendment.ratificationDeadline, title: `${amendment.title} ratification deadline`, detail: `${amendment.ratifiedProvinceIds.length} of 13 provinces` }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

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
        {presidentialDue && election.status !== "resolved" ? (
          <ElectionNightPanel
            phase={election.status === "voting" ? "counting" : "ready"}
            title="The national vote is ready to count"
            detail="The official ranked-choice tally has not been run. No projection or invented progress is shown."
          />
        ) : election.status === "resolved" ? (
          <ElectionNightPanel
            phase="certified"
            title={winnerId ? `${politicianDisplayName(props.catalog, winnerId)} elected President` : "Presidential result certified"}
            detail="The result below is the certified national ranked-choice count."
            outcome={
              winnerId === props.snap.playerPoliticianId
                ? "You won the presidency."
                : election.candidates[props.snap.playerPoliticianId]
                  ? "Your campaign was defeated."
                  : winnerId
                    ? `${partyDisplayName(props.world, election.candidates[winnerId]?.partyId ?? null, props.snap)} victory`
                    : null
            }
          />
        ) : null}
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
              <button type="button" className="btn" onClick={props.onResolvePresidential}>
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
    const playerFiled = Object.values(fields).some((entry) =>
      entry.candidateIds.includes(props.snap.playerPoliticianId),
    );
    const playerElected = Object.values(results).some((entry) =>
      entry.electedIds.includes(props.snap.playerPoliticianId),
    );

    return (
      <div className="assembly-election-view">
        {assemblyDue && election.status !== "resolved" ? (
          <ElectionNightPanel
            phase={props.countingElection || election.status === "voting" ? "counting" : "ready"}
            title={props.countingElection ? "The national STV count is underway" : "All constituency ballots are ready"}
            detail={props.countingElection ? "The count is running off the main interface. Results appear only when the exact count finishes." : "Begin the official count when ready. The count cannot be run twice."}
          />
        ) : election.status === "resolved" ? (
          <ElectionNightPanel
            phase="certified"
            title={majority ? `${partyDisplayName(props.world, majority.partyId, props.snap)} wins an Assembly majority` : "No party wins an Assembly majority"}
            detail="Certified constituency STV results and the national party composition are shown below."
            outcome={playerFiled ? (playerElected ? "You were elected." : "You were not elected.") : null}
          />
        ) : null}
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
            <SectionDivider title="Constituency result desk" hint="Highest-turnout certified counts" />
            <div className="election-result-feed">
              {Object.values(results)
                .sort((a, b) => b.turnout.turnoutRate - a.turnout.turnoutRate || a.constituencyId.localeCompare(b.constituencyId))
                .slice(0, 8)
                .map((constituency) => (
                  <button
                    type="button"
                    key={constituency.constituencyId}
                    onClick={() => setSelection({ id: constituency.constituencyId, kind: "constituency", name: constituencyDisplayName(props.catalog, constituency.constituencyId) })}
                  >
                    <strong>{constituencyDisplayName(props.catalog, constituency.constituencyId)}</strong>
                    <span>{constituency.electedIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}</span>
                    <small>Turnout {formatPublicPercent(constituency.turnout.turnoutRate)}</small>
                  </button>
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
                         selectedAssembly?.assembly?.candidacies[candidateId]?.partyId ??
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

  function provincialAssemblyView(election: (typeof provincialAssembly)[number]) {
    const sameCycle = provincialAssembly.filter((candidate) => candidate.date.slice(0, 4) === election.date.slice(0, 4));
    const pluralityParty = (race: (typeof provincialAssembly)[number]): string | null =>
      Object.entries(race.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const partyRows = [...new Set([...Object.keys(election.partySeats), ...Object.keys(election.partyVoteShares)])]
      .map((partyId) => ({
        partyId,
        seats: election.partySeats[partyId] ?? 0,
        voteShare: election.partyVoteShares[partyId],
      }))
      .sort((a, b) => b.seats - a.seats || (b.voteShare ?? 0) - (a.voteShare ?? 0) || a.partyId.localeCompare(b.partyId));
    const leadingParty = partyRows[0] ?? null;
    const playerFiled = election.candidateIds.includes(props.snap.playerPoliticianId);
    const playerElected = election.electedIds.includes(props.snap.playerPoliticianId);

    return (
      <div className="provincial-assembly-election-view">
        {election.status === "resolved" ? (
          <ElectionNightPanel
            phase="certified"
            title={leadingParty ? `${partyDisplayName(props.world, leadingParty.partyId, props.snap)} leads the ${props.catalog.places.get(election.provinceId)?.name ?? "provincial"} Assembly` : "Provincial Assembly result certified"}
            detail="The party vote, seat allocation, and elected slate below are the certified province-wide result."
            outcome={playerFiled ? (playerElected ? "You won a seat." : "You were not elected.") : null}
          />
        ) : null}
        <label className="election-cycle-picker">
          Province
          <select value={election.id} onChange={(event) => setProvincialAssemblyElectionId(event.target.value)}>
            {provincialAssembly.map((race) => (
              <option key={race.id} value={race.id}>
                {props.catalog.places.get(race.provinceId)?.name ?? "Province"} · {race.date.slice(0, 4)} · {statusLabel(race.status)}
              </option>
            ))}
          </select>
        </label>
        <MapDetailLayout
          className="provincial-election-layout"
          map={
            <>
              <SectionDivider title="Provincial Assembly map" hint={`${election.date.slice(0, 4)} cycle`} />
              <TerenaMap
                bundle={props.bundle}
                mode="election"
                selectedId={election.provinceId}
                showConstituencies={false}
                fillFor={(feature, kind) => {
                  if (kind !== "province") return "transparent";
                  const race = sameCycle.find((candidate) => candidate.provinceId === feature.id);
                  return race?.status === "resolved" ? partyColor(props.world, pluralityParty(race)) : "#d8d6cf";
                }}
                onSelect={(selected) => {
                  if (selected.kind !== "province") return;
                  const race = sameCycle.find((candidate) => candidate.provinceId === selected.id);
                  if (race) setProvincialAssemblyElectionId(race.id);
                }}
                tooltipFor={(selected) => {
                  const race = sameCycle.find((candidate) => candidate.provinceId === selected.id);
                  const partyId = race ? pluralityParty(race) : null;
                  return (
                    <>
                      <strong>{selected.name}</strong>
                      <span>{race?.status === "resolved" && partyId ? `${partyDisplayName(props.world, partyId, props.snap)} holds the largest bloc` : race ? statusLabel(race.status) : "No race in this cycle"}</span>
                    </>
                  );
                }}
              />
              <p className="muted">Certified provinces are colored by the party holding the largest Assembly bloc, not by a fictional single winner.</p>
            </>
          }
          detail={
            <>
              <SectionDivider
                title={`${props.catalog.places.get(election.provinceId)?.name ?? "Province"} Assembly`}
                hint={`${election.date} · ${props.snap.provincialRuntime.assemblies[election.provinceId]?.seatCount ?? election.electedIds.length} seats`}
                actions={<StatusBadge tone={statusTone(election.status)}>{statusLabel(election.status)}</StatusBadge>}
              />
              {election.turnoutRate != null ? <p className="muted">Turnout {formatPublicPercent(election.turnoutRate)}</p> : null}
              {partyRows.length ? (
                <DataTable headers={["Party", "Vote", "Seats"]} dense>
                  {partyRows.map((row) => (
                    <tr key={row.partyId}>
                      <td><span className="party-swatch" style={{ background: partyColor(props.world, row.partyId) }} aria-hidden /> {partyDisplayName(props.world, row.partyId, props.snap)}</td>
                      <td>{row.voteShare == null ? "—" : formatPublicPercent(row.voteShare)}</td>
                      <td>{row.seats}</td>
                    </tr>
                  ))}
                </DataTable>
              ) : <EmptyState>The provincial party field has not been finalized.</EmptyState>}
              {election.electedIds.length ? (
                <details className="elected-slate">
                  <summary>View elected members ({election.electedIds.length})</summary>
                  <div className="compact-result-list">
                    {election.electedIds.map((id) => (
                      <EntityRow key={id} title={politicianDisplayName(props.catalog, id)} meta={partyDisplayName(props.world, Object.entries(election.personalRankingsByParty).find(([, candidateIds]) => candidateIds.includes(id))?.[0] ?? null, props.snap)} status={<StatusBadge tone="ok">Elected</StatusBadge>} />
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          }
        />
      </div>
    );
  }

  function internalElectionView() {
    const selectedPartyId = internalSelection.startsWith("party:") ? internalSelection.slice(6) : null;
    const selectedCaucusId = internalSelection.startsWith("caucus:") ? internalSelection.slice(7) : null;
    const partyContest = internalPartyContests.find((contest) => contest.id === selectedPartyId) ?? null;
    const caucusContest = internalCaucusContests.find((contest) => contest.id === selectedCaucusId) ?? null;
    const provincialLeadership = Object.values(props.snap.provincialRuntime.assemblies)
      .flatMap((assemblyState) => assemblyState.leadershipHistory)
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .slice(0, 30);
    const caucusTallies = caucusContest
      ? Object.values(caucusContest.votes).reduce<Record<string, number>>((totals, candidateId) => {
          totals[candidateId] = (totals[candidateId] ?? 0) + 1;
          return totals;
        }, {})
      : {};

    return (
      <div className="internal-election-view">
        <div className="internal-election-picker">
          <label>
            Contest
            <select value={internalSelection} onChange={(event) => setInternalSelection(event.target.value)}>
              <optgroup label="Party and nomination contests">
                {internalPartyContests.map((contest) => (
                  <option key={contest.id} value={`party:${contest.id}`}>
                    {contestDisplayName(props.snap, props.world, contest.id)} · {statusLabel(contest.status)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Assembly caucus elections">
                {internalCaucusContests.map((contest) => (
                  <option key={contest.id} value={`caucus:${contest.id}`}>
                    {partyDisplayName(props.world, contest.partyId, props.snap)} {contest.role.replace(/_/g, " ")} · {statusLabel(contest.status)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
        {partyContest ? (
          <SectionCard title={contestDisplayName(props.snap, props.world, partyContest.id)}>
            {partyContest.status === "resolved" ? (
              <ElectionNightPanel
                phase="certified"
                title={partyContest.winnerId ? `${politicianDisplayName(props.catalog, partyContest.winnerId)} wins` : "Internal result certified"}
                detail="The result is drawn from the recorded selector count."
                outcome={partyContest.entries[props.snap.playerPoliticianId] ? (partyContest.winnerId === props.snap.playerPoliticianId ? "You won." : "You were not elected.") : null}
              />
            ) : null}
            <SectionDivider title="Field" hint={`${partyDisplayName(props.world, partyContest.partyId, props.snap)} · ${statusLabel(partyContest.status)}`} />
            {Object.values(partyContest.entries)
              .filter((entry) => entry.status !== "potential")
              .sort((a, b) => Number(b.politicianId === partyContest.winnerId) - Number(a.politicianId === partyContest.winnerId) || a.politicianId.localeCompare(b.politicianId))
              .map((entry) => (
                <EntityRow
                  key={entry.politicianId}
                  title={politicianDisplayName(props.catalog, entry.politicianId)}
                  meta={statusLabel(entry.status)}
                  status={partyContest.winnerId === entry.politicianId ? <StatusBadge tone="ok">Winner</StatusBadge> : <StatusBadge>{statusLabel(entry.status)}</StatusBadge>}
                  selected={partyContest.winnerId === entry.politicianId}
                />
              ))}
            {partyContest.countArchive?.rounds.length ? (
              <>
                <SectionDivider title="Ranked-choice count" hint="Recorded elimination sequence" />
                <DataTable headers={["Round", "Outcome"]} dense>
                  {partyContest.countArchive.rounds.map((round, index) => (
                    <tr key={index}>
                      <td>{round.round}</td>
                      <td>{round.eliminatedId ? `Excluded ${politicianDisplayName(props.catalog, round.eliminatedId)}` : round.electedId ? `Elected ${politicianDisplayName(props.catalog, round.electedId)}` : "Count complete"}</td>
                    </tr>
                  ))}
                </DataTable>
              </>
            ) : null}
          </SectionCard>
        ) : caucusContest ? (
          <SectionCard title={`${partyDisplayName(props.world, caucusContest.partyId, props.snap)} ${caucusContest.role.replace(/_/g, " ")} election`}>
            {caucusContest.status === "resolved" ? (
              <ElectionNightPanel
                phase="certified"
                title={caucusContest.winnerId ? `${politicianDisplayName(props.catalog, caucusContest.winnerId)} elected` : "Caucus result certified"}
                detail="Members' recorded ballots determine this internal Assembly office."
                outcome={caucusContest.candidateIds.includes(props.snap.playerPoliticianId) ? (caucusContest.winnerId === props.snap.playerPoliticianId ? "You won." : "You were not elected.") : null}
              />
            ) : null}
            <SectionDivider title="Candidates" hint={`${caucusContest.closeDate} · ${statusLabel(caucusContest.status)}`} />
            {caucusContest.candidateIds.map((candidateId) => (
              <EntityRow
                key={candidateId}
                title={politicianDisplayName(props.catalog, candidateId)}
                meta={(caucusContest.platforms[candidateId] ?? "No platform published").replace(/_/g, " ")}
                trailing={caucusContest.status === "resolved" ? `${caucusTallies[candidateId] ?? 0} votes` : null}
                status={caucusContest.winnerId === candidateId ? <StatusBadge tone="ok">Winner</StatusBadge> : <StatusBadge>{caucusContest.status === "resolved" ? "Not elected" : "Declared"}</StatusBadge>}
              />
            ))}
          </SectionCard>
        ) : (
          <EmptyState>No internal election has been recorded.</EmptyState>
        )}
        <SectionDivider title="Recent provincial leadership elections" hint="Speaker, floor leader, and whip" />
        <DataTable headers={["Date", "Province", "Office", "Winner", "Trigger"]} dense>
          {provincialLeadership.map((record) => (
            <tr key={record.id}>
              <td>{record.date}</td>
              <td>{props.catalog.places.get(record.provinceId)?.name ?? "Province"}</td>
              <td>{record.role.replace(/_/g, " ")}</td>
              <td>{record.winnerId ? politicianDisplayName(props.catalog, record.winnerId) : "No winner"}</td>
              <td>{record.trigger.replace(/_/g, " ")}</td>
            </tr>
          ))}
        </DataTable>
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
          { id: "assembly", label: "National Assembly" },
          { id: "provincial_assembly", label: "Provincial Assemblies" },
          { id: "gubernatorial", label: "Governors" },
          { id: "internal", label: "Internal Elections" },
          { id: "calendar", label: "Political Calendar" },
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
      {tab === "provincial_assembly" ? (
        selectedProvincialAssembly ? (
          provincialAssemblyView(selectedProvincialAssembly)
        ) : (
          <EmptyState>No Provincial Assembly election is scheduled.</EmptyState>
        )
      ) : null}
      {tab === "gubernatorial" ? (
        <div className="governor-election-view">
          {selectedGovernorRace ? (
            <>
              {selectedGovernorRace.status === "resolved" || selectedGovernorRace.status === "assumed" ? (
                <ElectionNightPanel
                  phase="certified"
                  title={selectedGovernorRace.winnerId ? `${politicianDisplayName(props.catalog, selectedGovernorRace.winnerId)} elected Governor` : "Gubernatorial result certified"}
                  detail={`Certified province-wide result for ${props.catalog.places.get(selectedGovernorRace.provinceId)?.name ?? "the province"}.`}
                  outcome={selectedGovernorRace.candidates[props.snap.playerPoliticianId] ? (selectedGovernorRace.winnerId === props.snap.playerPoliticianId ? "You won the governorship." : "Your campaign was defeated.") : null}
                />
              ) : selectedGovernorRace.date <= props.snap.currentDate ? (
                <ElectionNightPanel
                  phase="ready"
                  title="Polls closed in the province"
                  detail="The official result will appear when the provincial count is completed."
                />
              ) : null}
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
                                   candidate.partyId,
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
      {tab === "internal" ? internalElectionView() : null}
      {tab === "calendar" ? (
        <div className="political-calendar">
          {calendarEvents.length === 0 ? <EmptyState>No political dates are scheduled.</EmptyState> : null}
          {[...new Set(calendarEvents.map((event) => event.date.slice(0, 4)))].map((year) => (
            <section key={year} className="calendar-year">
              <h2>{year}</h2>
              <div className="calendar-events">
                {calendarEvents.filter((event) => event.date.startsWith(year)).map((event, index) => <EntityRow key={`${event.date}:${event.title}:${index}`} title={event.title} meta={event.date} status={<StatusBadge>{event.detail}</StatusBadge>} />)}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
