import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { collectPlayerActionableDecisions, currentAssemblyMemberIds, storiesChronological, } from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { EconomyPage } from "./economyScreen.js";
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { isMp, playerCampaign, qualitativeStanding } from "./format.js";
import { contestDisplayName, campaignTypeLabel, electionDisplayName, eventDisplay, factionDisplayName, partyColor, partyDisplayName, politicianDisplayName, pollShareLine, } from "./presentation.js";
import { decisionDisplayLabel, formatPublicNumber, formatPublicPercent, interruptDisplay, } from "./presentation/display.js";
import { DashboardLayout, EmptyState, MetricStrip, NewsItem, PageHeader, RightRail, SectionCard, StatCard, TabBar, ActivityFeedItem, LeadStory, StatusBadge, } from "./ui/kit.js";
import { PoliticianProfile, PoliticianCard } from "./ui/politician.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap } from "./map/TerenaMap.js";
import { latestPublicPoll, mapFillFor } from "./map/fills.js";
export function GamePages(props) {
    const { screen } = props;
    if (screen === "home")
        return _jsx(Home, { ...props });
    if (screen === "career")
        return _jsx(Career, { ...props });
    if (screen === "assembly")
        return _jsx(AssemblyPage, { ...props });
    if (screen === "party")
        return _jsx(Party, { ...props });
    if (screen === "campaign")
        return _jsx(CampaignPage, { ...props });
    if (screen === "elections")
        return _jsx(Elections, { ...props });
    if (screen === "executive")
        return _jsx(ExecutivePage, { ...props });
    if (screen === "courts")
        return _jsx(CourtsPage, { ...props });
    if (screen === "economy")
        return _jsx(EconomyPage, { ...props });
    if (screen === "organizations")
        return _jsx(OrganizationsPage, { ...props });
    if (screen === "news")
        return _jsx(NewsPage, { ...props });
    if (screen === "terena")
        return _jsx(Terena, { ...props });
    return _jsx(Archive, { ...props });
}
function Home(props) {
    const playerId = props.snap.playerPoliticianId;
    const interrupt = props.snap.pendingInterrupt;
    const decisions = collectPlayerActionableDecisions(props.world, props.snap);
    const monthEvents = (props.events.length ? props.events : props.snap.history.slice(-24)).filter((e) => e.type !== "TURN_COMPLETED");
    const lead = [...monthEvents].sort((a, b) => b.importance - a.importance)[0] ??
        props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-1)[0];
    const feed = monthEvents.slice(-12).reverse();
    const stories = storiesChronological(props.snap).slice(0, 5);
    const polls = Object.values(props.snap.polls).slice(-2);
    const n = props.snap.economyRuntime.national;
    const upcoming = Object.values(props.snap.elections).filter((e) => e.status !== "resolved");
    const figure = props.figures.get(playerId);
    const runtime = props.snap.politicians[playerId];
    const standing = props.snap.candidateStanding[playerId];
    const prevConfidence = props.snap.economyRuntime.history.slice(-2)[0]?.confidenceIndex ?? n.confidenceIndex;
    const confDelta = n.confidenceIndex - prevConfidence;
    return (_jsxs("div", { className: "home-briefing", children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: playerId, office: props.offices[0] ?? "Private citizen", party: partyDisplayName(props.world, runtime?.partyId ?? null, props.snap), faction: factionDisplayName(props.world, runtime?.factionId ?? null), ...(figure?.home ? { home: figure.home } : {}), standing: `Public standing: ${qualitativeStanding(standing?.favorability)}`, ...((figure?.notes ?? figure?.display_summary)
                    ? { biography: figure?.notes ?? figure?.display_summary }
                    : {}) }), interrupt ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "Urgent" }), _jsx("p", { children: interruptDisplay(interrupt) })] })) : null, decisions.length > 0 ? (_jsx(SectionCard, { title: "Required decisions", children: decisions.map((d) => (_jsx("div", { className: "urgent-item", children: decisionDisplayLabel(d, interrupt) }, d.key))) })) : null, lead ? (_jsx(LeadStory, { kicker: "Lead story", headline: eventDisplay(props.catalog, props.world, props.snap, lead), date: lead.date })) : (_jsx(EmptyState, { children: "No major developments this month." })), _jsx(DashboardLayout, { main: _jsxs(_Fragment, { children: [_jsxs(SectionCard, { title: "Political situation", children: [_jsxs(MetricStrip, { children: [_jsx(StatCard, { label: "Standing", value: qualitativeStanding(standing?.favorability) }), _jsx(StatCard, { label: "Confidence", value: n.confidenceIndex.toFixed(1), hint: `${confDelta >= 0 ? "+" : ""}${confDelta.toFixed(1)} vs prior month` }), _jsx(StatCard, { label: "Unemployment idx", value: n.employmentIndex.toFixed(1), hint: "Jan 2028 = 100" }), props.campaign ? (_jsx(StatCard, { label: "Campaign actions", value: `${props.campaign.actionPointsRemaining} / ${props.campaign.actionPointsMax}` })) : null] }), polls.length > 0 ? (_jsxs("div", { className: "muted", style: { marginTop: "0.75rem" }, children: ["Latest poll ", polls[polls.length - 1].publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, polls[polls.length - 1].firstPreference)] })) : null] }), _jsxs(SectionCard, { title: "Recent activity", children: [feed.length === 0 ? _jsx(EmptyState, { children: "Quiet month in public records." }) : null, feed.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] }), stories.length > 0 ? (_jsx(SectionCard, { title: "In the press", children: stories.map((s) => (_jsx(NewsItem, { headline: s.headlineKey, outlet: props.world.mediaOutlets[s.outletId]?.name ?? s.outletId, date: s.date, category: s.category }, s.id))) })) : null] }), rail: _jsxs(RightRail, { children: [_jsxs(SectionCard, { title: "Upcoming elections", children: [upcoming.length === 0 ? _jsx(EmptyState, { children: "No pending elections." }) : null, upcoming.map((el) => (_jsxs("div", { className: "rail-item", children: [_jsx("strong", { children: electionDisplayName(el.id) }), _jsx("div", { className: "muted", children: el.date })] }, el.id)))] }), _jsx(SectionCard, { title: "Campaign", children: props.campaign ? (_jsxs("div", { children: [_jsx(StatusBadge, { tone: "ok", children: "Active" }), _jsx("div", { className: "muted", children: campaignTypeLabel(props.campaign.type) })] })) : (_jsx(EmptyState, { children: "Not campaigning" })) })] }) })] }));
}
function Career(props) {
    const [tab, setTab] = useState("overview");
    const figure = props.figures.get(props.snap.playerPoliticianId);
    const runtime = props.snap.politicians[props.snap.playerPoliticianId];
    const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
    const age = figure?.birth_date
        ? Number(props.snap.currentDate.slice(0, 4)) - Number(figure.birth_date.slice(0, 4))
        : null;
    const terms = Object.values(props.snap.officeTerms)
        .filter((t) => t.holderId === props.snap.playerPoliticianId)
        .sort((a, b) => {
        const ad = a.startDate ?? "";
        const bd = b.startDate ?? "";
        return ad < bd ? 1 : ad > bd ? -1 : 0;
    });
    return (_jsxs("div", { children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: props.snap.playerPoliticianId, office: props.offices[0] ?? "Private citizen", party: partyDisplayName(props.world, runtime?.partyId ?? null, props.snap), faction: factionDisplayName(props.world, runtime?.factionId ?? null), ...(figure?.home ? { home: figure.home } : {}), standing: `Public standing: ${qualitativeStanding(standing?.favorability)}`, ...((figure?.notes ?? figure?.display_summary)
                    ? { biography: figure?.notes ?? figure?.display_summary }
                    : {}) }), _jsx(TabBar, { tabs: [
                    { id: "overview", label: "Overview" },
                    { id: "career", label: "Career" },
                    { id: "positions", label: "Positions" },
                    { id: "relationships", label: "Relationships" },
                    { id: "record", label: "Public record" },
                ], value: tab, onChange: setTab }), tab === "overview" ? (_jsxs(SectionCard, { title: "Public biography", children: [_jsx("p", { children: figure?.notes ?? figure?.display_summary ?? "No public biography on file." }), age != null ? _jsxs("p", { children: ["Age: ", age] }) : null] })) : null, tab === "career" ? (_jsxs(SectionCard, { title: "Offices", children: [terms.length === 0 ? _jsx(EmptyState, { children: "No office terms on file." }) : null, terms.map((t) => (_jsxs("div", { children: [props.world.offices[t.officeId]?.title ?? t.officeId, " \u00B7 ", t.status, " \u00B7 ", t.startDate, t.endDate ? ` – ${t.endDate}` : ""] }, t.id)))] })) : null, tab === "positions" ? (_jsxs(SectionCard, { title: "Public offices and campaign", children: [_jsx("p", { children: props.offices.join(", ") || "No current office" }), _jsx("p", { className: "muted", children: props.campaign ? "Campaign underway" : "Not currently campaigning" })] })) : null, tab === "relationships" ? (_jsx(SectionCard, { title: "Known public associations", children: _jsx(EmptyState, { children: "Exact private relationship values are not shown. Use Organizations for known public contact." }) })) : null, tab === "record" ? (_jsx(SectionCard, { title: "Recent public events", children: props.snap.history
                    .filter((e) => e.actorIds.includes(props.snap.playerPoliticianId))
                    .slice(-12)
                    .map((e) => (_jsxs("div", { className: "muted", children: [e.date, " \u00B7 ", eventDisplay(props.catalog, props.world, props.snap, e)] }, e.id))) })) : null] }));
}
function Party(props) {
    const partyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
    const party = partyId ? props.world.partyDefinitions[partyId] : null;
    const runtime = partyId ? props.snap.partyStates[partyId] : null;
    const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
    const caucus = currentAssemblyMemberIds(props.world, props.snap).filter((id) => props.snap.politicians[id]?.partyId === partyId).length;
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Party", title: party?.name ?? "No party" }), party ? (_jsxs("div", { className: "party-banner", style: { borderLeftColor: partyColor(props.world, partyId) }, children: [_jsxs(StatusBadge, { tone: "ok", children: [caucus, " Assembly seats"] }), _jsxs("div", { className: "muted", children: ["Leader:", " ", runtime?.leaderId
                                ? politicianDisplayName(props.catalog, runtime.leaderId)
                                : "vacant"] })] })) : null, _jsxs(SectionCard, { title: "Caucus & factions", children: [_jsxs("p", { children: ["Leader:", " ", runtime?.leaderId ? politicianDisplayName(props.catalog, runtime.leaderId) : "vacant"] }), _jsxs("p", { children: ["Assembly caucus: ", caucus] }), (party?.factionIds ?? []).map((fid) => (_jsxs("div", { children: [factionDisplayName(props.world, fid), " \u00B7 chair", " ", props.snap.factionStates[fid]?.chairId
                                ? politicianDisplayName(props.catalog, props.snap.factionStates[fid].chairId)
                                : "vacant"] }, fid))), contests.map((c) => (_jsxs("div", { className: "contest-card", children: [_jsx("strong", { children: contestDisplayName(props.snap, props.world, c.id) }), _jsx(StatusBadge, { tone: c.status === "open" ? "warn" : "idle", children: c.status }), _jsxs("div", { className: "muted", children: [Object.keys(c.entries).length, " candidates"] }), c.winnerId ? (_jsxs("div", { children: ["Winner: ", politicianDisplayName(props.catalog, c.winnerId)] })) : null] }, c.id)))] })] }));
}
function Elections(props) {
    const elections = Object.values(props.snap.elections);
    const due = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
    const contests = Object.values(props.snap.partyContests).filter((c) => c.type === "presidential_nomination");
    const poll = latestPublicPoll(props.snap);
    const [sel, setSel] = useState(null);
    const [tab, setTab] = useState("presidential");
    const presElections = elections.filter((e) => e.id.includes("PRES"));
    const asmElections = elections.filter((e) => e.id.includes("ASM"));
    function renderElectionResult(el) {
        const totalVotes = el.countArchive && "firstPreferences" in el.countArchive
            ? Object.values(el.countArchive.firstPreferences).reduce((sum, w) => {
                const n = Number(String(w).split("/")[0]);
                return sum + (Number.isFinite(n) ? n : 0);
            }, 0)
            : 0;
        return (_jsxs("div", { className: "election-result-card", children: [_jsx("h4", { className: "serif-head", children: electionDisplayName(el.id) }), _jsxs("div", { className: "muted", children: [el.status, " \u00B7 ", el.date] }), _jsx("div", { className: "candidate-result-list", children: Object.values(el.candidates).map((cand) => {
                        const fp = el.countArchive && "firstPreferences" in el.countArchive
                            ? el.countArchive.firstPreferences[cand.politicianId]
                            : undefined;
                        const votes = fp ? formatPublicNumber(fp) : null;
                        const share = totalVotes > 0 && fp
                            ? Number(String(fp).split("/")[0]) / totalVotes
                            : undefined;
                        return (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: cand.politicianId, compact: true, action: votes ? (_jsxs("span", { className: "election-votes", children: [formatPublicPercent(share), " \u00B7 ", votes] })) : null }, cand.politicianId));
                    }) }), due && el.id === "ELEC_PRES_2028" ? (_jsx("button", { type: "button", className: "btn", onClick: () => {
                        props.report(props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" }));
                        props.onDone();
                    }, children: "Resolve election" })) : null, el.countArchive && "rounds" in el.countArchive ? (_jsxs("div", { className: "rcv-rounds", children: [_jsx("div", { className: "kicker", children: "RCV rounds" }), el.countArchive.rounds.map((r, i) => (_jsxs("div", { className: "rcv-round", children: [_jsxs("strong", { children: ["Round ", r.round ?? i + 1] }), r.eliminatedId
                                    ? ` — Eliminated: ${politicianDisplayName(props.catalog, r.eliminatedId)}`
                                    : r.electedId
                                        ? ` — Elected: ${politicianDisplayName(props.catalog, r.electedId)}`
                                        : ""] }, i)))] })) : null, el.winnerIds.map((id) => (_jsxs("div", { className: "election-winner", children: ["Winner: ", politicianDisplayName(props.catalog, id)] }, id)))] }, el.id));
    }
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Returns", title: "Elections", subtitle: "Public polls and certified results only." }), _jsx(TabBar, { tabs: [
                    { id: "presidential", label: "Presidential" },
                    { id: "assembly", label: "Assembly" },
                    { id: "nominations", label: "Nominations" },
                ], value: tab, onChange: setTab }), _jsxs("div", { className: "dash dash-2", children: [_jsxs(SectionCard, { title: "Map", children: [_jsx(TerenaMap, { bundle: props.bundle, mode: "election", selectedId: sel?.id ?? null, fillFor: (f, kind) => mapFillFor("election", props.world, props.snap, f, kind), onSelect: setSel }), _jsx(MapLegend, { mode: "election", world: props.world }), sel ? _jsx("p", { children: sel.name }) : _jsx(EmptyState, { children: "Sitting members and polls \u2014 not latent support." }), poll ? (_jsxs("p", { className: "muted", children: ["Latest poll ", poll.publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)] })) : null] }), _jsxs("div", { children: [tab === "nominations"
                                ? contests.map((c) => (_jsxs(SectionCard, { title: contestDisplayName(props.snap, props.world, c.id), children: [_jsx(StatusBadge, { children: c.status }), Object.values(c.entries)
                                            .filter((e) => e.status !== "potential")
                                            .map((e) => (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: e.politicianId, compact: true }, e.politicianId))), c.winnerId ? (_jsxs("div", { children: ["Nomination winner: ", politicianDisplayName(props.catalog, c.winnerId)] })) : null] }, c.id)))
                                : null, tab === "presidential" ? presElections.map(renderElectionResult) : null, tab === "assembly" ? asmElections.map(renderElectionResult) : null] })] })] }));
}
function Terena(props) {
    const [mode, setMode] = useState("political");
    const [sel, setSel] = useState(null);
    const hover = sel ? props.catalog.places.get(sel.id) : null;
    const org = props.campaign && sel?.kind === "constituency"
        ? props.campaign.organizationByConstituency[sel.id]
        : undefined;
    const sitting = useMemo(() => {
        if (!sel || sel.kind !== "constituency")
            return 0;
        return currentAssemblyMemberIds(props.world, props.snap).filter((id) => {
            const term = Object.values(props.snap.officeTerms).find((t) => {
                if (t.holderId !== id)
                    return false;
                if (t.status !== "active" && t.status !== "suspended")
                    return false;
                return props.world.offices[t.officeId]?.constituencyId === sel.id;
            });
            return !!term;
        }).length;
    }, [sel, props.snap, props.world]);
    const regionEcon = sel?.kind === "province" ? props.snap.economyRuntime.provinces[sel.id] : undefined;
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Geography", title: "Terena", subtitle: "Interactive map derived from canonical GeoJSON. Supplied SVG files remain authoring references." }), _jsx(TabBar, { tabs: [
                    { id: "political", label: "Political" },
                    { id: "election", label: "Election" },
                    { id: "campaign", label: "Campaign" },
                    { id: "economy", label: "Economy" },
                    { id: "organizations", label: "Organizations" },
                ], value: mode, onChange: setMode }), _jsxs("div", { className: "dash dash-2", children: [_jsx(TerenaMap, { bundle: props.bundle, mode: mode, selectedId: sel?.id ?? null, fillFor: (f, kind) => mapFillFor(mode, props.world, props.snap, f, kind, props.campaign?.organizationByConstituency), onSelect: setSel, onHover: (s) => props.setMapHover(s?.id ?? null) }), _jsx(MapLegend, { mode: mode, world: props.world }), _jsx(SectionCard, { title: "Selection", children: sel && hover ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: hover.name }), _jsx("div", { className: "muted", children: sel.kind === "constituency"
                                        ? `${hover.seats ?? "?"} seats · ${sitting} sitting${hover.provinceName ? ` · ${hover.provinceName}` : ""}`
                                        : "Province" }), org != null ? _jsxs("div", { children: ["Your field organization: ", org.toFixed(2)] }) : null, regionEcon ? (_jsxs("div", { children: ["Conditions ", regionEcon.conditionsIndex.toFixed(1), " \u00B7 employment", " ", regionEcon.employmentIndex.toFixed(1)] })) : null, mode === "election" ? (_jsx("p", { className: "muted", children: "Election colors use sitting members and published polls, never hidden voter truth." })) : null] })) : (_jsx(EmptyState, { children: "Select a constituency, province, or city." })) })] })] }));
}
function Archive(props) {
    const [filter, setFilter] = useState("all");
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
    const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
    const leadership = Object.values(props.snap.partyContests).filter((c) => c.winnerId);
    const events = props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-40).reverse();
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "History", title: "Archive", subtitle: "Political history drawn from public records." }), _jsx(TabBar, { tabs: [
                    { id: "all", label: "All" },
                    { id: "elections", label: "Elections" },
                    { id: "laws", label: "Laws" },
                    { id: "leadership", label: "Leadership" },
                    { id: "events", label: "Events" },
                ], value: filter, onChange: setFilter }), (filter === "all" || filter === "elections") && elections.length > 0 ? (_jsx(SectionCard, { title: "Elections", children: elections.map((e) => (_jsxs("div", { children: [electionDisplayName(e.id), " won by", " ", e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")] }, e.id))) })) : null, (filter === "all" || filter === "laws") && laws.length > 0 ? (_jsx(SectionCard, { title: "Laws enacted", children: laws.map((l) => (_jsxs("div", { children: [l.title, " (", l.enactedDate, ")"] }, l.id))) })) : null, (filter === "all" || filter === "leadership") && leadership.length > 0 ? (_jsx(SectionCard, { title: "Party leadership", children: leadership.map((c) => (_jsxs("div", { children: [contestDisplayName(props.snap, props.world, c.id), " \u2014", " ", politicianDisplayName(props.catalog, c.winnerId)] }, c.id))) })) : null, (filter === "all" || filter === "events") ? (_jsx(SectionCard, { title: "Public events", children: events.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, _jsxs("details", { className: "dev-panel", children: [_jsx("summary", { children: "Development tools" }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: props.debug, onChange: (e) => props.setDebug(e.target.checked) }), " ", "Show hidden developer numbers"] }), props.debug ? (_jsx("pre", { children: JSON.stringify({
                            standing: props.snap.candidateStanding[props.snap.playerPoliticianId],
                            player: props.snap.politicians[props.snap.playerPoliticianId],
                            mp: isMp(props.world, props.snap, props.snap.playerPoliticianId),
                        }, null, 2) })) : null] })] }));
}
//# sourceMappingURL=pages.js.map