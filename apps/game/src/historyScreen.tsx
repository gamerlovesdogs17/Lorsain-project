import { useMemo, useState } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  caseTitle,
  PARTY_PLATFORM_ISSUES,
  partyPlatformLabel,
  type KernelWorld,
  type SimState,
} from "@lorsain/sim";
import {
  electionDisplayName,
  eventDisplay,
  partyColor,
  partyDisplayName,
  policyItemDisplay,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import { DataTable, EmptyState, PageHeader, StatusBadge, TabBar, WorkLayout } from "./ui/kit.js";
import { TerenaMap } from "./map/TerenaMap.js";
import { ElectionNightReplay, type ElectionNightEvent } from "./electionsScreen.js";
import { provinceReportingOrder } from "./electionNight.js";

type HistorySection = "years" | "elections" | "people" | "parties" | "caucuses" | "provinces" | "laws" | "court" | "constitution" | "foreign";
type ArticleRef = { id: string; section: HistorySection; title: string; deck: string; date: string };

const SECTION_LABELS: Record<HistorySection, string> = {
  years: "Years",
  elections: "Elections",
  people: "People",
  parties: "Parties",
  caucuses: "Caucuses",
  provinces: "Provinces",
  laws: "Acts",
  court: "Court cases",
  constitution: "Constitution",
  foreign: "Foreign affairs",
};

function voteWeight(raw: unknown): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

function partyAtElection(election: SimState["elections"][string], politicianId: string): string | null {
  return election.candidates[politicianId]?.partyId ?? null;
}

function archivedPollElectionId(poll: SimState["polls"][string]): string | null {
  return poll.electionId ?? (typeof poll.metadata.electionId === "string" ? poll.metadata.electionId : null);
}

export function HistoryPage(props: {
  world: KernelWorld;
  snap: SimState;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
}) {
  const [section, setSection] = useState<HistorySection>("years");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const articles = useMemo<ArticleRef[]>(() => {
    const years = new Set<string>([props.snap.scenarioStartDate.slice(0, 4), props.snap.currentDate.slice(0, 4)]);
    for (const event of props.snap.history) years.add(event.date.slice(0, 4));
    const yearRows = [...years].sort().reverse().map((year) => ({ id: `year:${year}`, section: "years" as const, title: `${year} in Terena`, deck: "Government, elections and public events recorded during the year.", date: `${year}-12-31` }));
    const elections = Object.values(props.snap.elections).filter((row) => row.status === "resolved").map((row) => ({ id: `election:${row.id}`, section: "elections" as const, title: electionDisplayName(row.id), deck: row.type === "presidential" ? "National presidential election by ranked-choice vote." : "National Assembly election across 48 STV constituencies.", date: row.date }));
    const governorElections = Object.values(props.snap.provincialRuntime.elections).filter((row) => row.winnerId).map((row) => ({ id: `governor-election:${row.id}`, section: "elections" as const, title: `${props.catalog.places.get(row.provinceId)?.name ?? "Provincial"} governor election`, deck: "Province-wide certified gubernatorial result.", date: row.date }));
    const provincialElections = Object.values(props.snap.provincialRuntime.assemblyElections).filter((row) => row.status === "resolved").map((row) => ({ id: `provincial-election:${row.id}`, section: "elections" as const, title: `${props.catalog.places.get(row.provinceId)?.name ?? "Provincial"} Assembly election`, deck: "Certified provincial party vote and seat allocation.", date: row.date }));
    const people = Object.values(props.snap.politicians).filter((person) => {
      const heldOffice = Object.values(props.snap.officeTerms).some((term) => term.holderId === person.id);
      const contested = Object.values(props.snap.elections).some((election) => Boolean(election.candidates[person.id]));
      return person.id === props.snap.playerPoliticianId || heldOffice || contested;
    }).map((person) => ({ id: `person:${person.id}`, section: "people" as const, title: politicianDisplayName(props.catalog, person.id), deck: `${partyDisplayName(props.world, person.partyId, props.snap)} political career.`, date: "" }));
    const parties = Object.keys(props.world.partyDefinitions).filter((id) => id !== props.world.independentAggregatePartyId).map((id) => ({ id: `party:${id}`, section: "parties" as const, title: partyDisplayName(props.world, id, props.snap), deck: "Leadership, platform and electoral history.", date: "" }));
    const caucuses = Object.values(props.world.factionDefinitions).map((faction) => ({ id: `caucus:${faction.factionId}`, section: "caucuses" as const, title: faction.name, deck: `${partyDisplayName(props.world, faction.partyId, props.snap)} ideological caucus and leadership history.`, date: "" }));
    const provinces = props.world.provinceIds.map((provinceId) => ({ id: `province:${provinceId}`, section: "provinces" as const, title: props.catalog.places.get(provinceId)?.name ?? "Province", deck: "Governors, provincial elections, legislation and public regional record.", date: "" }));
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws).map((law) => ({ id: `law:${law.id}`, section: "laws" as const, title: law.title, deck: law.policyItems.map((item) => policyItemDisplay(props.catalog, item)).join("; "), date: law.enactedDate }));
    const court = Object.values(props.snap.constitutionalRuntime.courtDecisions).map((decision) => {
      const courtCase = props.snap.constitutionalRuntime.courtCases[decision.caseId];
      return { id: `court:${decision.id}`, section: "court" as const, title: courtCase ? caseTitle(courtCase) : "Constitutional Court decision", deck: courtCase?.constitutionalQuestion ?? "Constitutional judgment.", date: decision.decisionDate };
    });
    const constitution = [{ id: "constitution:document", section: "constitution" as const, title: "Constitution of the Republic of Terena", deck: "Articles, operational rules and ratified amendment history.", date: props.snap.currentDate }];
    const foreign = [{ id: "foreign:record", section: "foreign" as const, title: "Terena in the world", deck: "Treaties, sanctions, crises and conflicts in the saved public record.", date: props.snap.currentDate }];
    return [...yearRows, ...elections, ...governorElections, ...provincialElections, ...people, ...parties, ...caucuses, ...provinces, ...laws, ...court, ...constitution, ...foreign].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }, [props.catalog, props.snap, props.world]);

  const visible = articles.filter((article) => article.section === section && (!query.trim() || `${article.title} ${article.deck}`.toLowerCase().includes(query.trim().toLowerCase())));
  const selected = articles.find((article) => article.id === selectedId) ?? visible[0] ?? null;

  function openArticle(article: ArticleRef) {
    setSection(article.section);
    setSelectedId(article.id);
  }

  function renderYear(year: string) {
    const events = props.snap.history.filter((event) => event.date.startsWith(`${year}-`) && event.visibility === "public" && event.type !== "TURN_COMPLETED").sort((a, b) => b.importance - a.importance || a.date.localeCompare(b.date));
    const elections = Object.values(props.snap.elections).filter((election) => election.date.startsWith(`${year}-`) && election.status === "resolved");
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws).filter((law) => law.enactedDate.startsWith(`${year}-`));
    const officeholders = Object.values(props.snap.officeTerms).filter((term) => term.startDate?.startsWith(`${year}-`) || term.endDate?.startsWith(`${year}-`));
    const courtDecisions = Object.values(props.snap.constitutionalRuntime.courtDecisions).filter((decision) => decision.decisionDate.startsWith(`${year}-`));
    const economicPoints = props.snap.economyRuntime.history.filter((point) => point.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date));
    const foreignEvents = events.filter((event) => /TREATY|SANCTION|CRISIS|CONFLICT|WAR|DIPLOMATIC|FOREIGN/.test(event.type));
    return <>
      <p className="wiki-lead">The year {year} in Terena comprises {events.length} recorded public developments, {elections.length} certified national election{elections.length === 1 ? "" : "s"}, and {laws.length} enacted Act{laws.length === 1 ? "" : "s"}.</p>
      <h2 id="officeholders">Government and officeholders</h2>
      {officeholders.length === 0 ? <p>No national or provincial office transition is recorded for this year.</p> : <ol className="wiki-timeline">{officeholders.slice(0, 30).map((term) => <li key={term.id}><time>{term.startDate?.startsWith(`${year}-`) ? term.startDate : term.endDate}</time><span><strong>{props.world.offices[term.officeId]?.title ?? "Public office"}</strong><small>{politicianDisplayName(props.catalog, term.holderId)} · {term.startDate?.startsWith(`${year}-`) ? "assumed office" : "term ended"}</small></span></li>)}</ol>}
      <h2 id="events">Major events</h2>
      {events.length === 0 ? <EmptyState>No public events are recorded for this year.</EmptyState> : <ol className="wiki-timeline">{events.slice(0, 40).map((event) => <li key={event.id}><time>{event.date}</time><span>{eventDisplay(props.catalog, props.world, props.snap, event)}</span></li>)}</ol>}
      {elections.length > 0 ? <><h2 id="elections">Elections</h2>{elections.map((election) => <button type="button" className="wiki-related-link" key={election.id} onClick={() => openArticle(articles.find((row) => row.id === `election:${election.id}`)!)}><strong>{electionDisplayName(election.id)}</strong><span>{election.date} · certified result</span></button>)}</> : null}
      {laws.length > 0 ? <><h2 id="laws">Legislation</h2><ul className="wiki-plain-list">{laws.map((law) => <li key={law.id}><button type="button" onClick={() => openArticle(articles.find((row) => row.id === `law:${law.id}`)!)}>{law.title}</button><span>{law.enactedDate}</span></li>)}</ul></> : null}
      <h2 id="court">Constitutional Court</h2>
      {courtDecisions.length === 0 ? <p>No Constitutional Court judgment is recorded for this year.</p> : <ul className="wiki-plain-list">{courtDecisions.map((decision) => <li key={decision.id}><button type="button" onClick={() => openArticle(articles.find((row) => row.id === `court:${decision.id}`)!)}>{caseTitle(props.snap.constitutionalRuntime.courtCases[decision.caseId]!)}</button><span>{decision.decisionDate}</span></li>)}</ul>}
      <h2 id="economy">Economy</h2>
      {economicPoints.length === 0 ? <p>No monthly economic series is archived for this year.</p> : <p>Output moved from {economicPoints[0]!.outputIndex.toFixed(1)} to {economicPoints.at(-1)!.outputIndex.toFixed(1)}; employment from {economicPoints[0]!.employmentIndex.toFixed(1)} to {economicPoints.at(-1)!.employmentIndex.toFixed(1)}; confidence from {economicPoints[0]!.confidenceIndex.toFixed(1)} to {economicPoints.at(-1)!.confidenceIndex.toFixed(1)}. Index reference = 100.</p>}
      <h2 id="foreign">Foreign affairs</h2>
      {foreignEvents.length === 0 ? <p>No major foreign-affairs event is recorded for this year.</p> : <ol className="wiki-timeline">{foreignEvents.slice(0, 20).map((event) => <li key={event.id}><time>{event.date}</time><span>{eventDisplay(props.catalog, props.world, props.snap, event)}</span></li>)}</ol>}
    </>;
  }

  function renderElection(id: string) {
    const election = props.snap.elections[id];
    if (!election) return <EmptyState>The archived election could not be found.</EmptyState>;
    if (election.type === "presidential") {
      const first = election.countArchive && "firstPreferences" in election.countArchive ? election.countArchive.firstPreferences : {};
      const total = Object.values(first).reduce((sum, value) => sum + voteWeight(value), 0);
      const rows = Object.keys(election.candidates).sort((a, b) => voteWeight(first[b]) - voteWeight(first[a]) || a.localeCompare(b));
      const rounds = election.countArchive && "rounds" in election.countArchive ? election.countArchive.rounds : [];
      const replayEvents: ElectionNightEvent[] = rounds.map((round, index) => ({
        id: `${election.id}:round:${index}`,
        title: `Round ${index + 1}`,
        detail: round.electedId ? `${politicianDisplayName(props.catalog, round.electedId)} elected` : round.eliminatedId ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated` : "Preferences transferred",
        ...(round.electedId ? { pauseAfter: true } : {}),
      }));
      const finalPoll = Object.values(props.snap.polls).filter((poll) => archivedPollElectionId(poll) === election.id && poll.geographyKind === "national" && poll.publicationDate <= election.date).sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || b.id.localeCompare(a.id))[0];
      return <>
        <p className="wiki-lead">The {election.date.slice(0, 4)} presidential election was a national ranked-choice election. The certified winner was {election.winnerIds.map((winner) => politicianDisplayName(props.catalog, winner)).join(", ")}.</p>
        <div className="wiki-result-banner"><span>Certified {election.date}</span><strong>{election.winnerIds.map((winner) => politicianDisplayName(props.catalog, winner)).join(", ")}</strong></div>
        <h2 id="result">First preferences</h2>
        <DataTable dense headers={["Candidate", "Party at election", "Votes", "Share"]}>{rows.map((candidateId) => <tr key={candidateId}><td>{politicianDisplayName(props.catalog, candidateId)}</td><td>{partyDisplayName(props.world, partyAtElection(election, candidateId), props.snap)}</td><td>{Math.round(voteWeight(first[candidateId])).toLocaleString()}</td><td>{total ? `${((voteWeight(first[candidateId]) / total) * 100).toFixed(1)}%` : "—"}</td></tr>)}</DataTable>
        <h2 id="polling">Final public poll</h2>
        {finalPoll ? <DataTable dense headers={["Candidate", "Poll", "Actual first preference"]}>{finalPoll.firstPreference.slice().sort((a, b) => b.share - a.share).map((row) => <tr key={row.politicianId}><td>{politicianDisplayName(props.catalog, row.politicianId)}</td><td>{(row.share * 100).toFixed(1)}%</td><td>{total ? `${((voteWeight(first[row.politicianId]) / total) * 100).toFixed(1)}%` : "—"}</td></tr>)}</DataTable> : <p>No final national public poll is archived for this election.</p>}
        <h2 id="count">RCV count</h2>
        <div className="wiki-round-list">{rounds.map((round, index) => <div key={index}><strong>Round {index + 1}</strong><span>{round.electedId ? `${politicianDisplayName(props.catalog, round.electedId)} elected` : round.eliminatedId ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated` : "Votes transferred"}</span></div>)}</div>
        {replayEvents.length ? <ElectionNightReplay replayKey={`history:${election.id}`} historical title={`${election.date.slice(0, 4)} Presidential Election`} subtitle="Replay of the immutable certified national ranked-choice count. No geographic presidential result is fabricated." events={replayEvents} unitLabel="rounds shown" renderVisual={(visibleCount) => <div className="wiki-round-list">{rounds.slice(0, visibleCount).map((round, index) => <div key={index}><strong>Round {index + 1}</strong><span>{round.electedId ? `${politicianDisplayName(props.catalog, round.electedId)} elected` : round.eliminatedId ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated` : "Preferences transferred"}</span></div>)}</div>} /> : null}
      </>;
    }
    const cycle = election.assembly;
    const parties = Object.entries(cycle?.partySeatTotals ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const localPolls = Object.values(props.snap.polls).filter((poll) => archivedPollElectionId(poll) === election.id && poll.geographyKind === "constituency" && poll.publicationDate <= election.date);
    return <>
      <p className="wiki-lead">The {election.date.slice(0, 4)} National Assembly election filled 420 seats from 48 multi-member constituencies using the single transferable vote.</p>
      <div className="wiki-composition" aria-label="Certified Assembly composition">{parties.map(([partyId, seats]) => <span key={partyId} style={{ width: `${(seats / 420) * 100}%`, background: partyColor(props.world, partyId === "independent" ? null : partyId) }} title={`${partyDisplayName(props.world, partyId === "independent" ? null : partyId, props.snap)} ${seats}`} />)}</div>
      <p className="wiki-majority-line">420 seats · 211 required for a majority · {Object.keys(cycle?.constituencyResults ?? {}).length} constituency results archived</p>
      <DataTable dense headers={["Party", "Seats", "Change"]}>{parties.map(([partyId, seats]) => <tr key={partyId}><td>{partyDisplayName(props.world, partyId === "independent" ? null : partyId, props.snap)}</td><td>{seats}</td><td>{seats - (cycle?.previousPartySeatTotals[partyId] ?? 0) >= 0 ? "+" : ""}{seats - (cycle?.previousPartySeatTotals[partyId] ?? 0)}</td></tr>)}</DataTable>
      <h2 id="forecast">Final public evidence</h2>
      <p>{localPolls.length} constituenc{localPolls.length === 1 ? "y had" : "ies had"} a direct public poll archived before polls closed. Unpolled areas remain explicitly sparse; no later information rewrites these records.</p>
      <h2 id="map">Certified constituency map</h2>
      <p>The map is rebuilt only from the archived winners and their parties at this election.</p>
      <TerenaMap bundle={props.bundle} mode="election" showConstituencies fillFor={(feature, kind) => {
        if (kind !== "constituency") return "#f3f0e9";
        const result = cycle?.constituencyResults[feature.id];
        if (!result) return "#d9d6cf";
        const totals = new Map<string | null, number>();
        for (const winnerId of result.electedIds) {
          const partyId = result.partyByCandidate[winnerId] ?? null;
          totals.set(partyId, (totals.get(partyId) ?? 0) + 1);
        }
        const leader = [...totals.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? null;
        return partyColor(props.world, leader);
      }} tooltipFor={(picked) => {
        const result = cycle?.constituencyResults[picked.id];
        return <><strong>{picked.name}</strong><span>{result ? `${result.electedIds.length} certified members` : "No archived result"}</span></>;
      }} />
    </>;
  }

  function renderGovernorElection(id: string) {
    const election = props.snap.provincialRuntime.elections[id];
    if (!election?.winnerId) return <EmptyState>The archived governor election could not be found.</EmptyState>;
    const cycle = provinceReportingOrder(`${election.date}:governors`, Object.values(props.snap.provincialRuntime.elections).filter((row) => row.date === election.date && row.winnerId));
    const events: ElectionNightEvent[] = cycle.map((row) => ({ id: row.id, title: props.catalog.places.get(row.provinceId)?.name ?? "Province", detail: `${politicianDisplayName(props.catalog, row.winnerId!)} elected governor` }));
    const candidates = Object.values(election.candidates).sort((a, b) => (election.voteShares[b.politicianId] ?? 0) - (election.voteShares[a.politicianId] ?? 0));
    return <>
      <p className="wiki-lead">Voters in {props.catalog.places.get(election.provinceId)?.name ?? "the province"} elected {politicianDisplayName(props.catalog, election.winnerId)} governor on {election.date}.</p>
      <DataTable dense headers={["Candidate", "Party at election", "Vote share"]}>{candidates.map((candidate) => <tr key={candidate.politicianId}><td>{politicianDisplayName(props.catalog, candidate.politicianId)}</td><td>{partyDisplayName(props.world, candidate.partyId, props.snap)}</td><td>{((election.voteShares[candidate.politicianId] ?? 0) * 100).toFixed(1)}%</td></tr>)}</DataTable>
      <h2 id="map">Governor election map</h2>
      <ElectionNightReplay replayKey={`history:${election.date}:governors`} historical title={`${election.date.slice(0, 4)} Governor Elections`} subtitle="Replay of province-wide certified winners from the immutable archive." events={events} unitLabel="provinces shown" renderVisual={(visibleCount) => {
        const visible = new Map(cycle.slice(0, visibleCount).map((row) => [row.provinceId, row]));
        return <TerenaMap bundle={props.bundle} mode="election" showConstituencies={false} fillFor={(feature, kind) => {
          if (kind !== "province") return "transparent";
          const row = visible.get(feature.id);
          return row?.winnerId ? partyColor(props.world, row.candidates[row.winnerId]?.partyId ?? null) : "#d9d6cf";
        }} tooltipFor={(picked) => { const row = visible.get(picked.id); return <><strong>{picked.name}</strong><span>{row?.winnerId ? `${politicianDisplayName(props.catalog, row.winnerId)} elected` : "Result not yet shown"}</span></>; }} />;
      }} />
    </>;
  }

  function renderProvincialElection(id: string) {
    const election = props.snap.provincialRuntime.assemblyElections[id];
    if (!election || election.status !== "resolved") return <EmptyState>The archived provincial election could not be found.</EmptyState>;
    const cycle = provinceReportingOrder(`${election.date}:provincial`, Object.values(props.snap.provincialRuntime.assemblyElections).filter((row) => row.date === election.date && row.status === "resolved"));
    const parties = Object.entries(election.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const events: ElectionNightEvent[] = cycle.map((row) => ({ id: row.id, title: props.catalog.places.get(row.provinceId)?.name ?? "Province", detail: `${Object.values(row.partySeats).reduce((sum, seats) => sum + seats, 0)} seats certified` }));
    return <>
      <p className="wiki-lead">The {election.date.slice(0, 4)} {props.catalog.places.get(election.provinceId)?.name ?? "Provincial"} Assembly election allocated seats from the certified province-wide party vote.</p>
      <DataTable dense headers={["Party", "Vote share", "Seats"]}>{parties.map(([partyId, seats]) => <tr key={partyId}><td>{partyDisplayName(props.world, partyId, props.snap)}</td><td>{((election.partyVoteShares[partyId] ?? 0) * 100).toFixed(1)}%</td><td>{seats}</td></tr>)}</DataTable>
      <h2 id="map">Provincial election map</h2>
      <ElectionNightReplay replayKey={`history:${election.date}:provincial`} historical title={`${election.date.slice(0, 4)} Provincial Assembly Elections`} subtitle="Replay of certified provincial seat allocations." events={events} unitLabel="provinces shown" renderVisual={(visibleCount) => {
        const visible = new Map(cycle.slice(0, visibleCount).map((row) => [row.provinceId, row]));
        return <TerenaMap bundle={props.bundle} mode="election" showConstituencies={false} fillFor={(feature, kind) => {
          if (kind !== "province") return "transparent";
          const row = visible.get(feature.id);
          const lead = row ? Object.entries(row.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] : null;
          return lead ? partyColor(props.world, lead) : "#d9d6cf";
        }} tooltipFor={(picked) => { const row = visible.get(picked.id); return <><strong>{picked.name}</strong><span>{row ? `${Object.values(row.partySeats).reduce((sum, seats) => sum + seats, 0)} seats certified` : "Result not yet shown"}</span></>; }} />;
      }} />
    </>;
  }

  function renderPerson(id: string) {
    const person = props.snap.politicians[id];
    if (!person) return <EmptyState>The politician could not be found.</EmptyState>;
    const terms = Object.values(props.snap.officeTerms).filter((term) => term.holderId === id).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const elections = Object.values(props.snap.elections).filter((election) => election.candidates[id]).sort((a, b) => a.date.localeCompare(b.date));
    const votes = Object.values(props.snap.legislatureRuntime.legislativeVotes).filter((vote) => vote.votes[id]).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return <>
      <p className="wiki-lead">{politicianDisplayName(props.catalog, id)} is a Terenan political figure from {props.catalog.places.get(person.homeProvinceId ?? "")?.name ?? "Terena"}. The saved public record contains {terms.length} office term{terms.length === 1 ? "" : "s"} and {elections.length} national election appearance{elections.length === 1 ? "" : "s"}.</p>
      <h2 id="career">Political career</h2>
      {terms.length === 0 ? <EmptyState>No public office term is recorded.</EmptyState> : <ol className="wiki-timeline">{terms.map((term) => <li key={term.id}><time>{term.startDate ?? "Date not recorded"}</time><span><strong>{props.world.offices[term.officeId]?.title ?? "Public office"}</strong><small>{term.endDate ?? (term.status === "active" ? "Incumbent" : term.status)}</small></span></li>)}</ol>}
      <h2 id="elections">Elections</h2>
      {elections.length === 0 ? <EmptyState>No national candidacy is recorded.</EmptyState> : <ul className="wiki-plain-list">{elections.map((election) => <li key={election.id}><button type="button" onClick={() => openArticle(articles.find((row) => row.id === `election:${election.id}`)!)}>{electionDisplayName(election.id)}</button><span>{partyDisplayName(props.world, partyAtElection(election, id), props.snap)} · {election.winnerIds.includes(id) ? "Elected" : "Not elected"}</span></li>)}</ul>}
      {votes.length > 0 ? <><h2 id="votes">Selected roll calls</h2><DataTable dense headers={["Date", "Stage", "Vote"]}>{votes.map((vote) => <tr key={vote.id}><td>{vote.date}</td><td>{vote.stage.replace(/_/g, " ")}</td><td>{vote.votes[id] === "yes" ? "Aye" : vote.votes[id] === "no" ? "Nay" : "Abstain"}</td></tr>)}</DataTable></> : null}
    </>;
  }

  function renderParty(id: string) {
    const state = props.snap.partyStates[id];
    const contests = Object.values(props.snap.partyContests).filter((contest) => contest.partyId === id && contest.winnerId).sort((a, b) => (b.resolvedDate ?? "").localeCompare(a.resolvedDate ?? ""));
    const seatHistory = Object.values(props.snap.elections).filter((election) => election.type === "assembly" && election.status === "resolved" && election.assembly).sort((a, b) => a.date.localeCompare(b.date));
    return <>
      <p className="wiki-lead">{partyDisplayName(props.world, id, props.snap)} is a national political party whose public identity is recorded through its leaders, Assembly delegation, elections and evolving platform.</p>
      <h2 id="platform">Current public platform</h2>
      <dl className="wiki-platform">{PARTY_PLATFORM_ISSUES.map((issue) => <div key={issue}><dt>{issue.replace(/_/g, " ")}</dt><dd>{partyPlatformLabel(issue, state?.publicPlatform?.positions[issue] ?? 0)}</dd></div>)}</dl>
      <h2 id="leadership">Leadership history</h2>
      {contests.length === 0 ? <EmptyState>No completed leadership contest is recorded in this save.</EmptyState> : <ol className="wiki-timeline">{contests.map((contest) => <li key={contest.id}><time>{contest.resolvedDate ?? contest.createdDate}</time><span><strong>{politicianDisplayName(props.catalog, contest.winnerId!)}</strong><small>{contest.factionId ? "Caucus leadership" : "Party leadership"}</small></span></li>)}</ol>}
      <h2 id="assembly">National Assembly seats</h2>
      {seatHistory.length === 0 ? <EmptyState>No certified Assembly election is recorded.</EmptyState> : <div className="wiki-seat-history">{seatHistory.map((election) => <div key={election.id}><time>{election.date.slice(0, 4)}</time><span style={{ height: `${Math.max(0.4, ((election.assembly?.partySeatTotals[id] ?? 0) / 420) * 8)}rem`, background: partyColor(props.world, id) }} /><strong>{election.assembly?.partySeatTotals[id] ?? 0}</strong></div>)}</div>}
    </>;
  }

  function renderCaucus(id: string) {
    const caucus = props.world.factionDefinitions[id];
    if (!caucus) return <EmptyState>The caucus could not be found.</EmptyState>;
    const members = Object.values(props.snap.politicians).filter((person) => person.factionId === id);
    const contests = Object.values(props.snap.partyContests).filter((contest) => contest.factionId === id && contest.winnerId).sort((a, b) => (a.resolvedDate ?? a.createdDate).localeCompare(b.resolvedDate ?? b.createdDate));
    return <>
      <p className="wiki-lead">{caucus.name} is an ideological caucus within {partyDisplayName(props.world, caucus.partyId, props.snap)}. It is distinct from the party's Assembly Delegation and currently has {members.length} publicly affiliated politician{members.length === 1 ? "" : "s"}.</p>
      <h2 id="leadership">Leadership history</h2>
      {contests.length === 0 ? <EmptyState>No completed caucus leadership contest is recorded.</EmptyState> : <ol className="wiki-timeline">{contests.map((contest) => <li key={contest.id}><time>{contest.resolvedDate ?? contest.createdDate}</time><span><strong>{politicianDisplayName(props.catalog, contest.winnerId!)}</strong><small>Elected caucus chair</small></span></li>)}</ol>}
      <h2 id="members">Public members</h2>
      <ul className="wiki-plain-list">{members.slice(0, 60).map((person) => <li key={person.id}><button type="button" onClick={() => openArticle(articles.find((row) => row.id === `person:${person.id}`)!)}>{politicianDisplayName(props.catalog, person.id)}</button><span>{partyDisplayName(props.world, person.partyId, props.snap)}</span></li>)}</ul>
    </>;
  }

  function renderProvince(id: string) {
    const name = props.catalog.places.get(id)?.name ?? "Province";
    const governorTerms = Object.values(props.snap.officeTerms).filter((term) => props.world.offices[term.officeId]?.kind === "governor" && props.world.offices[term.officeId]?.provinceId === id).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const elections = Object.values(props.snap.provincialRuntime.elections).filter((row) => row.provinceId === id && row.winnerId).sort((a, b) => a.date.localeCompare(b.date));
    const assemblyElections = Object.values(props.snap.provincialRuntime.assemblyElections).filter((row) => row.provinceId === id && row.status === "resolved").sort((a, b) => a.date.localeCompare(b.date));
    const bills = Object.values(props.snap.provincialRuntime.bills).filter((bill) => bill.provinceId === id).sort((a, b) => b.introducedDate.localeCompare(a.introducedDate));
    const economy = props.snap.economyRuntime.provinces[id];
    return <>
      <p className="wiki-lead">{name}'s saved public record includes {governorTerms.length} gubernatorial term{governorTerms.length === 1 ? "" : "s"}, {assemblyElections.length} certified Provincial Assembly election{assemblyElections.length === 1 ? "" : "s"}, and {bills.length} provincial bill{bills.length === 1 ? "" : "s"}.</p>
      <h2 id="governors">Governors</h2>
      <ol className="wiki-timeline">{governorTerms.map((term) => <li key={term.id}><time>{term.startDate ?? "Date unavailable"}</time><span><strong>{politicianDisplayName(props.catalog, term.holderId)}</strong><small>{term.endDate ?? "Incumbent"}</small></span></li>)}</ol>
      <h2 id="elections">Elections</h2>
      {[...elections.map((row) => ({ id: `governor-election:${row.id}`, label: "Governor election", date: row.date })), ...assemblyElections.map((row) => ({ id: `provincial-election:${row.id}`, label: "Provincial Assembly election", date: row.date }))].sort((a, b) => a.date.localeCompare(b.date)).map((row) => <button className="wiki-related-link" type="button" key={row.id} onClick={() => openArticle(articles.find((article) => article.id === row.id)!)}><strong>{row.label}</strong><span>{row.date} · certified result</span></button>)}
      <h2 id="legislation">Provincial legislation</h2>
      {bills.length === 0 ? <EmptyState>No provincial bill is recorded.</EmptyState> : <DataTable dense headers={["Date", "Measure", "Status"]}>{bills.slice(0, 40).map((bill) => <tr key={bill.id}><td>{bill.introducedDate}</td><td><strong>{bill.title}</strong><br /><small>{bill.summary}</small></td><td>{bill.status.replaceAll("_", " ")}</td></tr>)}</DataTable>}
      <h2 id="economy">Current regional economy</h2>
      {economy ? <p>Conditions {economy.conditionsIndex.toFixed(1)} · employment {economy.employmentIndex.toFixed(1)} · housing {economy.housingIndex.toFixed(1)}. Index reference = 100; this is the current endpoint, not a reconstructed historical series.</p> : <p>No regional economic record is available.</p>}
    </>;
  }

  function renderConstitution() {
    const amendments = Object.values(props.snap.provincialRuntime.constitutionalAmendments).sort((a, b) => a.proposedDate.localeCompare(b.proposedDate));
    return <>
      <p className="wiki-lead">The Constitution is stored as structured Articles and clauses. Four operational clauses have modeled runtime rules; other ratified replacements change the authoritative legal text only.</p>
      <h2 id="rules">Operational rules</h2>
      <DataTable dense headers={["Rule", "Current value", "Last amended"]}>{Object.values(props.snap.provincialRuntime.constitutionalRules).map((rule) => <tr key={rule.id}><td>{rule.label}</td><td>{rule.unit === "fraction" ? `${Math.round(rule.value * 100)}%` : `${rule.value} ${rule.unit}`}</td><td>{rule.amendedDate ?? "Founding text"}</td></tr>)}</DataTable>
      <h2 id="amendments">Amendment history</h2>
      {amendments.length === 0 ? <EmptyState>No amendment has been proposed in this save.</EmptyState> : <ol className="wiki-timeline">{amendments.map((amendment) => <li key={amendment.id}><time>{amendment.proposedDate}</time><span><strong>{amendment.title}</strong><small>{amendment.status.replaceAll("_", " ")} · {amendment.runtimeEffect === "modeled_rule" ? "modeled rule" : "legal text only"}</small></span></li>)}</ol>}
      <h2 id="articles">Articles</h2>
      {(props.world.constitutionalDocument?.articles ?? []).map((article) => <section key={article.id}><h3>Article {article.number}. {article.title}</h3><p>{article.sections.length} section{article.sections.length === 1 ? "" : "s"}</p></section>)}
    </>;
  }

  function renderForeignRecord() {
    const runtime = props.snap.foreignAffairsRuntime;
    const countryName = (id: string) => props.world.worldCountries[id]?.name ?? id;
    const treaties = Object.values(runtime.treaties).sort((a, b) => (b.signedDate ?? "").localeCompare(a.signedDate ?? ""));
    const sanctions = Object.values(runtime.sanctions).sort((a, b) => b.imposedDate.localeCompare(a.imposedDate));
    const crises = Object.values(runtime.crises).sort((a, b) => b.startedDate.localeCompare(a.startedDate));
    const conflicts = Object.values(runtime.conflicts).sort((a, b) => b.startedDate.localeCompare(a.startedDate));
    return <>
      <p className="wiki-lead">Terena's public foreign-affairs record contains {treaties.length} treaty record{treaties.length === 1 ? "" : "s"}, {sanctions.length} sanction action{sanctions.length === 1 ? "" : "s"}, {crises.length} crisis record{crises.length === 1 ? "" : "s"}, and {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}.</p>
      <h2 id="treaties">Treaties</h2>
      {treaties.length === 0 ? <EmptyState>No treaty is recorded.</EmptyState> : <DataTable dense headers={["Treaty", "Members", "Status", "Date"]}>{treaties.map((treaty) => <tr key={treaty.id}><td>{treaty.title}</td><td>{treaty.memberIds.map(countryName).join(", ")}</td><td>{treaty.status.replaceAll("_", " ")}</td><td>{treaty.signedDate ?? "Not signed"}</td></tr>)}</DataTable>}
      <h2 id="sanctions">Sanctions</h2>
      {sanctions.length === 0 ? <p>No sanction is recorded.</p> : <ul className="wiki-plain-list">{sanctions.map((sanction) => <li key={sanction.id}><strong>{countryName(sanction.imposerId)} → {countryName(sanction.targetId)}</strong><span>{sanction.scope.replaceAll("_", " ")} · {sanction.imposedDate}{sanction.liftedDate ? ` to ${sanction.liftedDate}` : sanction.active ? " · active" : ""}</span></li>)}</ul>}
      <h2 id="crises">Crises and conflicts</h2>
      {[...crises.map((crisis) => ({ id: crisis.id, date: crisis.startedDate, title: crisis.participantIds.map(countryName).join("–"), detail: `Crisis · ${crisis.stage.replaceAll("_", " ")}` })), ...conflicts.map((conflict) => ({ id: conflict.id, date: conflict.startedDate, title: conflict.belligerentIds.map(countryName).join("–"), detail: conflict.endedDate ? `Conflict ended ${conflict.endedDate}${conflict.outcome ? ` · ${conflict.outcome}` : ""}` : "Conflict ongoing" }))].sort((a, b) => b.date.localeCompare(a.date)).map((row) => <div className="wiki-result-banner" key={row.id}><span>{row.date}</span><strong>{row.title}</strong><small>{row.detail}</small></div>)}
      <p className="muted">This archive omits hidden conflict intensity, balance and internal simulation values.</p>
    </>;
  }

  function renderLaw(id: string) {
    const law = props.snap.legislatureRuntime.enactedLaws[id];
    if (!law) return <EmptyState>The Act could not be found.</EmptyState>;
    return <><p className="wiki-lead">{law.title} became law on {law.enactedDate}. It was sponsored by {politicianDisplayName(props.catalog, law.sponsorId)} and contains {law.policyItems.length} operative provision{law.policyItems.length === 1 ? "" : "s"}.</p><h2 id="provisions">Provisions</h2><ol className="wiki-provisions">{law.policyItems.map((item, index) => <li key={`${item.provisionId}:${index}`}><strong>{policyItemDisplay(props.catalog, item)}</strong></li>)}</ol><h2 id="status">Status</h2><p><StatusBadge tone={law.operative ? "ok" : "warn"}>{law.operative ? "Operative" : "Invalidated"}</StatusBadge></p></>;
  }

  function renderCourt(id: string) {
    const decision = props.snap.constitutionalRuntime.courtDecisions[id];
    const courtCase = decision ? props.snap.constitutionalRuntime.courtCases[decision.caseId] : null;
    if (!decision || !courtCase) return <EmptyState>The decision could not be found.</EmptyState>;
    return <><p className="wiki-lead">The Constitutional Court decided {caseTitle(courtCase)} on {decision.decisionDate}, resolving whether {courtCase.constitutionalQuestion.toLowerCase()}.</p><div className="wiki-result-banner"><span>{decision.disposition}</span><strong>{decision.uphold} uphold · {decision.invalidate} invalidate</strong></div><h2 id="holding">Holding</h2><p>{typeof decision.metadata.holding === "string" ? decision.metadata.holding : courtCase.constitutionalQuestion}</p><h2 id="votes">Court vote</h2><DataTable dense headers={["Justice", "Vote"]}>{Object.entries(decision.votes).map(([justiceId, vote]) => <tr key={justiceId}><td>{politicianDisplayName(props.catalog, justiceId)}</td><td>{vote}</td></tr>)}</DataTable></>;
  }

  function articleBody(article: ArticleRef) {
    const [kind, id] = article.id.split(":", 2) as [string, string];
    if (kind === "year") return renderYear(id);
    if (kind === "election") return renderElection(id);
    if (kind === "governor-election") return renderGovernorElection(id);
    if (kind === "provincial-election") return renderProvincialElection(id);
    if (kind === "person") return renderPerson(id);
    if (kind === "party") return renderParty(id);
    if (kind === "caucus") return renderCaucus(id);
    if (kind === "province") return renderProvince(id);
    if (kind === "law") return renderLaw(id);
    if (kind === "court") return renderCourt(id);
    if (kind === "constitution") return renderConstitution();
    return renderForeignRecord();
  }

  function articleContents(article: ArticleRef): Array<{ id: string; label: string }> {
    const kind = article.id.split(":", 1)[0];
    if (kind === "year") return [{ id: "officeholders", label: "Government" }, { id: "events", label: "Major events" }, { id: "elections", label: "Elections" }, { id: "laws", label: "Legislation" }, { id: "court", label: "Court" }, { id: "economy", label: "Economy" }, { id: "foreign", label: "Foreign affairs" }];
    if (kind === "election") {
      const electionId = article.id.slice("election:".length);
      return props.snap.elections[electionId]?.type === "presidential"
        ? [{ id: "result", label: "Result" }, { id: "polling", label: "Polling" }, { id: "count", label: "RCV count and replay" }]
        : [{ id: "result", label: "Result" }, { id: "forecast", label: "Forecast evidence" }, { id: "map", label: "Map" }];
    }
    if (kind === "governor-election" || kind === "provincial-election") return [{ id: "overview", label: "Overview" }, { id: "map", label: "Map and replay" }];
    if (kind === "person") return [{ id: "career", label: "Career" }, { id: "elections", label: "Elections" }, { id: "votes", label: "Roll calls" }];
    if (kind === "party") return [{ id: "platform", label: "Platform" }, { id: "leadership", label: "Leadership" }, { id: "assembly", label: "Assembly" }];
    if (kind === "caucus") return [{ id: "leadership", label: "Leadership" }, { id: "members", label: "Members" }];
    if (kind === "province") return [{ id: "governors", label: "Governors" }, { id: "elections", label: "Elections" }, { id: "legislation", label: "Legislation" }, { id: "economy", label: "Economy" }];
    if (kind === "constitution") return [{ id: "rules", label: "Operational rules" }, { id: "amendments", label: "Amendments" }, { id: "articles", label: "Articles" }];
    if (kind === "foreign") return [{ id: "treaties", label: "Treaties" }, { id: "sanctions", label: "Sanctions" }, { id: "crises", label: "Crises and conflicts" }];
    if (kind === "law") return [{ id: "provisions", label: "Provisions" }, { id: "status", label: "Status" }];
    return [{ id: "holding", label: "Holding" }, { id: "votes", label: "Court vote" }];
  }

  return <WorkLayout
    header={<PageHeader kicker="Public record" title="History of Terena" subtitle="A generated political encyclopedia built only from canonical material and the saved public record." />}
    main={<div className="history-wiki">
      <aside className="wiki-index">
        <div className="wiki-index-brand"><strong>TERENA</strong><span>Political encyclopedia</span></div>
        <TabBar tabs={(Object.keys(SECTION_LABELS) as HistorySection[]).map((id) => ({ id, label: SECTION_LABELS[id] }))} value={section} onChange={(id) => { setSection(id); setSelectedId(null); }} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${SECTION_LABELS[section].toLowerCase()}`} aria-label="Search political history" />
        <div className="wiki-index-results">{visible.slice(0, 80).map((article) => <button type="button" className={selected?.id === article.id ? "active" : ""} key={article.id} onClick={() => setSelectedId(article.id)}><strong>{article.title}</strong><span>{article.deck}</span></button>)}</div>
      </aside>
      {selected ? <article className="wiki-article">
        <header><div className="kicker">{SECTION_LABELS[selected.section]} · Terena</div><h1>{selected.title}</h1><p>{selected.deck}</p></header>
        <nav className="wiki-toc" aria-label="Article contents"><strong>Contents</strong>{articleContents(selected).map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav>
        <div className="wiki-article-body" id="overview">{articleBody(selected)}</div>
        <footer>Article generated from the current save's public historical record. Historical election affiliations and results use archived election data.</footer>
      </article> : <EmptyState>No article matches this section.</EmptyState>}
    </div>}
  />;
}
