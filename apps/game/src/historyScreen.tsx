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

type HistorySection = "years" | "elections" | "people" | "parties" | "laws" | "court";
type ArticleRef = { id: string; section: HistorySection; title: string; deck: string; date: string };

const SECTION_LABELS: Record<HistorySection, string> = {
  years: "Years",
  elections: "Elections",
  people: "People",
  parties: "Parties",
  laws: "Acts",
  court: "Court cases",
};

function voteWeight(raw: unknown): number {
  const [numerator, denominator = "1"] = String(raw ?? "0").split("/");
  const den = Number(denominator);
  return den === 0 ? 0 : (Number(numerator) || 0) / den;
}

function partyAtElection(election: SimState["elections"][string], politicianId: string): string | null {
  return election.candidates[politicianId]?.partyId ?? null;
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
    const people = Object.values(props.snap.politicians).filter((person) => {
      const heldOffice = Object.values(props.snap.officeTerms).some((term) => term.holderId === person.id);
      const contested = Object.values(props.snap.elections).some((election) => Boolean(election.candidates[person.id]));
      return person.id === props.snap.playerPoliticianId || heldOffice || contested;
    }).map((person) => ({ id: `person:${person.id}`, section: "people" as const, title: politicianDisplayName(props.catalog, person.id), deck: `${partyDisplayName(props.world, person.partyId, props.snap)} political career.`, date: "" }));
    const parties = Object.keys(props.world.partyDefinitions).filter((id) => id !== props.world.independentAggregatePartyId).map((id) => ({ id: `party:${id}`, section: "parties" as const, title: partyDisplayName(props.world, id, props.snap), deck: "Leadership, platform and electoral history.", date: "" }));
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws).map((law) => ({ id: `law:${law.id}`, section: "laws" as const, title: law.title, deck: law.policyItems.map((item) => policyItemDisplay(props.catalog, item)).join("; "), date: law.enactedDate }));
    const court = Object.values(props.snap.constitutionalRuntime.courtDecisions).map((decision) => {
      const courtCase = props.snap.constitutionalRuntime.courtCases[decision.caseId];
      return { id: `court:${decision.id}`, section: "court" as const, title: courtCase ? caseTitle(courtCase) : "Constitutional Court decision", deck: courtCase?.constitutionalQuestion ?? "Constitutional judgment.", date: decision.decisionDate };
    });
    return [...yearRows, ...elections, ...people, ...parties, ...laws, ...court].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
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
    return <>
      <p className="wiki-lead">The year {year} in Terena comprises {events.length} recorded public developments, {elections.length} certified national election{elections.length === 1 ? "" : "s"}, and {laws.length} enacted Act{laws.length === 1 ? "" : "s"}.</p>
      <h2 id="events">Major events</h2>
      {events.length === 0 ? <EmptyState>No public events are recorded for this year.</EmptyState> : <ol className="wiki-timeline">{events.slice(0, 40).map((event) => <li key={event.id}><time>{event.date}</time><span>{eventDisplay(props.catalog, props.world, props.snap, event)}</span></li>)}</ol>}
      {elections.length > 0 ? <><h2 id="elections">Elections</h2>{elections.map((election) => <button type="button" className="wiki-related-link" key={election.id} onClick={() => openArticle(articles.find((row) => row.id === `election:${election.id}`)!)}><strong>{electionDisplayName(election.id)}</strong><span>{election.date} · certified result</span></button>)}</> : null}
      {laws.length > 0 ? <><h2 id="laws">Legislation</h2><ul className="wiki-plain-list">{laws.map((law) => <li key={law.id}><button type="button" onClick={() => openArticle(articles.find((row) => row.id === `law:${law.id}`)!)}>{law.title}</button><span>{law.enactedDate}</span></li>)}</ul></> : null}
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
      return <>
        <p className="wiki-lead">The {election.date.slice(0, 4)} presidential election was a national ranked-choice election. The certified winner was {election.winnerIds.map((winner) => politicianDisplayName(props.catalog, winner)).join(", ")}.</p>
        <div className="wiki-result-banner"><span>Certified {election.date}</span><strong>{election.winnerIds.map((winner) => politicianDisplayName(props.catalog, winner)).join(", ")}</strong></div>
        <h2 id="result">First preferences</h2>
        <DataTable dense headers={["Candidate", "Party at election", "Votes", "Share"]}>{rows.map((candidateId) => <tr key={candidateId}><td>{politicianDisplayName(props.catalog, candidateId)}</td><td>{partyDisplayName(props.world, partyAtElection(election, candidateId), props.snap)}</td><td>{Math.round(voteWeight(first[candidateId])).toLocaleString()}</td><td>{total ? `${((voteWeight(first[candidateId]) / total) * 100).toFixed(1)}%` : "—"}</td></tr>)}</DataTable>
        <h2 id="count">RCV count</h2>
        <div className="wiki-round-list">{rounds.map((round, index) => <div key={index}><strong>Round {index + 1}</strong><span>{round.electedId ? `${politicianDisplayName(props.catalog, round.electedId)} elected` : round.eliminatedId ? `${politicianDisplayName(props.catalog, round.eliminatedId)} eliminated` : "Votes transferred"}</span></div>)}</div>
      </>;
    }
    const cycle = election.assembly;
    const parties = Object.entries(cycle?.partySeatTotals ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return <>
      <p className="wiki-lead">The {election.date.slice(0, 4)} National Assembly election filled 420 seats from 48 multi-member constituencies using the single transferable vote.</p>
      <div className="wiki-composition" aria-label="Certified Assembly composition">{parties.map(([partyId, seats]) => <span key={partyId} style={{ width: `${(seats / 420) * 100}%`, background: partyColor(props.world, partyId === "independent" ? null : partyId) }} title={`${partyDisplayName(props.world, partyId === "independent" ? null : partyId, props.snap)} ${seats}`} />)}</div>
      <p className="wiki-majority-line">420 seats · 211 required for a majority · {Object.keys(cycle?.constituencyResults ?? {}).length} constituency results archived</p>
      <DataTable dense headers={["Party", "Seats", "Change"]}>{parties.map(([partyId, seats]) => <tr key={partyId}><td>{partyDisplayName(props.world, partyId === "independent" ? null : partyId, props.snap)}</td><td>{seats}</td><td>{seats - (cycle?.previousPartySeatTotals[partyId] ?? 0) >= 0 ? "+" : ""}{seats - (cycle?.previousPartySeatTotals[partyId] ?? 0)}</td></tr>)}</DataTable>
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
    if (kind === "person") return renderPerson(id);
    if (kind === "party") return renderParty(id);
    if (kind === "law") return renderLaw(id);
    return renderCourt(id);
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
        <nav className="wiki-toc" aria-label="Article contents"><strong>Contents</strong><a href="#overview">Overview</a><a href="#events">Record</a><a href="#elections">Elections</a></nav>
        <div className="wiki-article-body" id="overview">{articleBody(selected)}</div>
        <footer>Article generated from the current save's public historical record. Historical election affiliations and results use archived election data.</footer>
      </article> : <EmptyState>No article matches this section.</EmptyState>}
    </div>}
  />;
}
