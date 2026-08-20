import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { collectPlayerActionableDecisions, currentAssemblyMemberIds, storiesChronological, } from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { EconomyPage } from "./economyScreen.js";
import { ForeignAffairsPage } from "./foreignAffairsScreen.js";
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { isMp, playerCampaign, qualitativeStanding } from "./format.js";
import { contestDisplayName, campaignTypeLabel, countryDisplayName, crisisStageLabel, electionDisplayName, eventDisplay, factionDisplayName, partyColor, partyDisplayName, politicianDisplayName, pollShareLine, treatyTypeLabel, } from "./presentation.js";
import { decisionDisplayLabel, formatIndexDelta, formatPublicNumber, formatPublicPercent, interruptDisplay, } from "./presentation/display.js";
import { DashboardLayout, EmptyState, MetricStrip, NewsItem, PageHeader, RightRail, SectionCard, StatCard, TabBar, ActivityFeedItem, LeadStory, StatusBadge, } from "./ui/kit.js";
import { PoliticianProfile, PoliticianCard } from "./ui/politician.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap } from "./map/TerenaMap.js";
import { constituencySittingSeatBreakdown, latestPublicPoll, mapFillFor } from "./map/fills.js";
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
    if (screen === "foreign")
        return _jsx(ForeignAffairsPage, { ...props });
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
    const terenaCrisis = Object.values(props.snap.foreignAffairsRuntime.crises).find((c) => c.stage !== "settled" && c.participantIds.includes("W41"));
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
                    : {}) }), interrupt ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "Urgent" }), _jsx("p", { children: interruptDisplay(interrupt) })] })) : null, decisions.length > 0 ? (_jsx(SectionCard, { title: "Required decisions", children: decisions.map((d) => (_jsx("div", { className: "urgent-item", children: decisionDisplayLabel(d, interrupt) }, d.key))) })) : null, lead ? (_jsx(LeadStory, { kicker: "Lead story", headline: eventDisplay(props.catalog, props.world, props.snap, lead), date: lead.date })) : (_jsx(EmptyState, { children: "No major developments this month." })), terenaCrisis ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "International crisis" }), _jsxs("p", { children: ["Terena is involved in an active international crisis (", crisisStageLabel(terenaCrisis.stage), "). See", " ", terenaCrisis.participantIds
                                .filter((id) => id !== "W41")
                                .map((id) => countryDisplayName(props.world, id))
                                .join(", ") || "foreign partners", " ", "on the Foreign Affairs map."] })] })) : null, _jsx(DashboardLayout, { main: _jsxs(_Fragment, { children: [_jsxs(SectionCard, { title: "Political situation", children: [_jsxs(MetricStrip, { children: [_jsx(StatCard, { label: "Standing", value: qualitativeStanding(standing?.favorability) }), _jsx(StatCard, { label: "Confidence", value: n.confidenceIndex.toFixed(1), hint: `${formatIndexDelta(confDelta)} vs prior month` }), _jsx(StatCard, { label: "Employment index", value: n.employmentIndex.toFixed(1), hint: "Jan 2028 = 100" }), props.campaign ? (_jsx(StatCard, { label: "Campaign actions", value: `${props.campaign.actionPointsRemaining} / ${props.campaign.actionPointsMax}` })) : null] }), polls.length > 0 ? (_jsxs("div", { className: "muted", style: { marginTop: "0.75rem" }, children: ["Latest poll ", polls[polls.length - 1].publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, polls[polls.length - 1].firstPreference)] })) : null] }), _jsxs(SectionCard, { title: "Recent activity", children: [feed.length === 0 ? _jsx(EmptyState, { children: "Quiet month in public records." }) : null, feed.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] }), stories.length > 0 ? (_jsx(SectionCard, { title: "In the press", children: stories.map((s) => (_jsx(NewsItem, { headline: s.headlineKey, outlet: props.world.mediaOutlets[s.outletId]?.name ?? s.outletId, date: s.date, category: s.category }, s.id))) })) : null] }), rail: _jsxs(RightRail, { children: [_jsxs(SectionCard, { title: "Upcoming elections", children: [upcoming.length === 0 ? _jsx(EmptyState, { children: "No pending elections." }) : null, upcoming.map((el) => (_jsxs("div", { className: "rail-item", children: [_jsx("strong", { children: electionDisplayName(el.id) }), _jsx("div", { className: "muted", children: el.date })] }, el.id)))] }), _jsx(SectionCard, { title: "Campaign", children: props.campaign ? (_jsxs("div", { children: [_jsx(StatusBadge, { tone: "ok", children: "Active" }), _jsx("div", { className: "muted", children: campaignTypeLabel(props.campaign.type) })] })) : (_jsx(EmptyState, { children: "Not campaigning" })) })] }) })] }));
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
    const members = currentAssemblyMemberIds(props.world, props.snap);
    const caucus = members.filter((id) => props.snap.politicians[id]?.partyId === partyId).length;
    const totalSeats = props.world.legislativeConstitution.assemblySeatCount;
    const presidentId = Object.values(props.snap.officeTerms).find((t) => {
        if (t.status !== "active")
            return false;
        return props.world.offices[t.officeId]?.kind === "president";
    })?.holderId;
    const govParty = presidentId ? props.snap.politicians[presidentId]?.partyId : null;
    const position = !partyId ? "Independent" : partyId === govParty ? "In government" : "Opposition";
    const recent = props.snap.history
        .filter((e) => {
        if (e.type === "TURN_COMPLETED")
            return false;
        return e.actorIds.some((id) => props.snap.politicians[id]?.partyId === partyId);
    })
        .slice(-8)
        .reverse();
    const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Party", title: party?.name ?? "No party" }), party ? (_jsxs("div", { className: "party-banner", style: { borderLeftColor: partyColor(props.world, partyId) }, children: [_jsxs(StatusBadge, { tone: "ok", children: [caucus, " of ", totalSeats, " Assembly seats"] }), _jsx(StatusBadge, { children: position })] })) : null, runtime?.leaderId ? (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: runtime.leaderId, office: "Party leader" })) : (_jsx(EmptyState, { children: "Leadership is vacant." })), _jsx(SectionCard, { title: "Factions", children: _jsx("div", { className: "faction-cards", children: (party?.factionIds ?? []).map((fid) => {
                        const chair = props.snap.factionStates[fid]?.chairId;
                        return (_jsxs("div", { className: "faction-card", children: [_jsx("strong", { children: factionDisplayName(props.world, fid) }), _jsxs("div", { className: "muted", children: ["Chair: ", chair ? politicianDisplayName(props.catalog, chair) : "vacant"] })] }, fid));
                    }) }) }), _jsxs(SectionCard, { title: "Nominations and leadership", children: [contests.length === 0 ? _jsx(EmptyState, { children: "No current party contests." }) : null, contests.map((c) => (_jsxs("div", { className: "contest-card", children: [_jsx("strong", { children: contestDisplayName(props.snap, props.world, c.id) }), " ", _jsx(StatusBadge, { tone: c.status === "open" ? "warn" : "idle", children: c.status }), _jsxs("div", { className: "muted", children: [Object.values(c.entries).filter((e) => e.status !== "potential").length, " candidates"] }), Object.values(c.entries)
                                .filter((e) => e.status !== "potential")
                                .slice(0, 6)
                                .map((e) => (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: e.politicianId, compact: true }, e.politicianId))), c.winnerId ? (_jsxs("div", { children: ["Winner: ", politicianDisplayName(props.catalog, c.winnerId)] })) : null] }, c.id)))] }), elections.length > 0 ? (_jsx(SectionCard, { title: "Recent electoral performance", children: elections.map((e) => (_jsxs("div", { children: [electionDisplayName(e.id), " \u00B7", " ", e.winnerIds[0]
                            ? politicianDisplayName(props.catalog, e.winnerIds[0])
                            : e.status] }, e.id))) })) : null, _jsxs(SectionCard, { title: "Recent party events", children: [recent.length === 0 ? _jsx(EmptyState, { children: "No recent public party events." }) : null, recent.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] })] }));
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
    function voteWeight(raw) {
        return Number(String(raw ?? "0").split("/")[0]) || 0;
    }
    function renderElectionResult(el, kind) {
        const firstPrefs = el.countArchive && "firstPreferences" in el.countArchive
            ? el.countArchive.firstPreferences
            : {};
        const totalVotes = Object.values(firstPrefs).reduce((sum, w) => sum + voteWeight(w), 0);
        const winnerId = el.winnerIds[0] ?? null;
        const ranked = Object.values(el.candidates).slice().sort((a, b) => {
            const aw = voteWeight(firstPrefs[a.politicianId]);
            const bw = voteWeight(firstPrefs[b.politicianId]);
            if (bw !== aw)
                return bw - aw;
            if (a.politicianId === winnerId)
                return -1;
            if (b.politicianId === winnerId)
                return 1;
            return a.politicianId.localeCompare(b.politicianId);
        });
        const rounds = el.countArchive && "rounds" in el.countArchive ? el.countArchive.rounds : [];
        return (_jsxs("div", { className: "election-result-card", children: [_jsx("h4", { className: "serif-head", children: electionDisplayName(el.id) }), _jsxs("div", { className: "muted", children: [el.status, " \u00B7 ", el.date, kind === "presidential" && el.status === "resolved"
                            ? " · first-preference shares below are not final-round totals"
                            : ""] }), winnerId ? (_jsxs("div", { className: "election-winner-banner", children: [_jsx("div", { className: "kicker", children: "Winner" }), _jsx("strong", { children: politicianDisplayName(props.catalog, winnerId) }), _jsx("div", { className: "muted", children: partyDisplayName(props.world, props.snap.politicians[winnerId]?.partyId ?? null, props.snap) })] })) : null, _jsx("div", { className: "candidate-result-list", children: ranked.map((cand) => {
                        const fp = firstPrefs[cand.politicianId];
                        const votes = fp ? formatPublicNumber(fp) : null;
                        const share = totalVotes > 0 && fp ? voteWeight(fp) / totalVotes : undefined;
                        const isWinner = winnerId === cand.politicianId;
                        return (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: cand.politicianId, compact: true, selected: isWinner, action: votes ? (_jsxs("span", { className: "election-votes", children: [isWinner ? "Winner · " : "", "1st pref ", formatPublicPercent(share), " \u00B7 ", votes] })) : null }, cand.politicianId));
                    }) }), due && el.id === "ELEC_PRES_2028" && el.status !== "resolved" ? (_jsx("button", { type: "button", className: "btn", onClick: () => {
                        const resolved = props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
                        props.report(resolved);
                        if (resolved.ok) {
                            props.sim.executeCommand({ type: "RESUME_TURN" });
                        }
                        props.onDone();
                    }, children: "Resolve election" })) : null, rounds.length > 0 ? (_jsxs("div", { className: "rcv-rounds", children: [_jsx("div", { className: "kicker", children: "RCV progression" }), _jsx("div", { className: "rcv-track", children: rounds.map((r, i) => (_jsxs("span", { className: `rcv-chip${r.electedId ? " winner" : ""}`, children: ["Round ", r.round ?? i + 1, r.eliminatedId
                                        ? `: eliminated ${politicianDisplayName(props.catalog, r.eliminatedId)}`
                                        : r.electedId
                                            ? `: elected ${politicianDisplayName(props.catalog, r.electedId)}`
                                            : ""] }, i))) })] })) : null] }, el.id));
    }
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Returns", title: "Elections", subtitle: "Public polls and certified results only." }), _jsx(TabBar, { tabs: [
                    { id: "presidential", label: "Presidential" },
                    { id: "assembly", label: "Assembly" },
                    { id: "nominations", label: "Nominations" },
                ], value: tab, onChange: setTab }), tab === "presidential" ? (_jsxs("div", { children: [poll ? (_jsxs("p", { className: "muted", children: ["Latest national poll ", poll.publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, poll.firstPreference)] })) : (_jsx(EmptyState, { children: "Presidential results are national. No geographic presidential returns are shown." })), presElections.map((el) => renderElectionResult(el, "presidential"))] })) : null, tab === "assembly" ? (_jsxs("div", { className: "dash dash-2", children: [_jsxs(SectionCard, { title: "Sitting Assembly geography", children: [_jsx(TerenaMap, { bundle: props.bundle, mode: "election", selectedId: sel?.id ?? null, fillFor: (f, kind) => mapFillFor("election", props.world, props.snap, f, kind), onSelect: setSel }), _jsx(MapLegend, { mode: "election", world: props.world }), sel?.kind === "constituency" ? (_jsxs("div", { children: [_jsx("p", { children: sel.name }), constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (_jsxs("div", { className: "muted", children: [partyDisplayName(props.world, row.partyId, props.snap), " \u00B7 ", row.seats, " sitting seat", row.seats === 1 ? "" : "s"] }, row.partyId ?? "none"))), _jsx("p", { className: "muted", children: "Sitting representation, not hidden voter support." })] })) : (_jsx(EmptyState, { children: "Select a constituency for the public seat breakdown." }))] }), _jsx("div", { children: asmElections.map((el) => renderElectionResult(el, "assembly")) })] })) : null, tab === "nominations" ? (_jsx("div", { children: contests.map((c) => (_jsxs(SectionCard, { title: contestDisplayName(props.snap, props.world, c.id), children: [_jsx(StatusBadge, { children: c.status }), Object.values(c.entries)
                            .filter((e) => e.status !== "potential")
                            .map((e) => (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: e.politicianId, compact: true }, e.politicianId))), c.winnerId ? (_jsxs("div", { children: ["Nomination winner: ", politicianDisplayName(props.catalog, c.winnerId)] })) : null] }, c.id))) })) : null] }));
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
                                        : "Province" }), org != null ? _jsxs("div", { children: ["Your field organization: ", org.toFixed(2)] }) : null, sel.kind === "constituency"
                                    ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (_jsxs("div", { className: "muted", children: [partyDisplayName(props.world, row.partyId, props.snap), " \u00B7 ", row.seats, " sitting seat", row.seats === 1 ? "" : "s"] }, row.partyId ?? "none")))
                                    : null, regionEcon ? (_jsxs("div", { children: ["Conditions ", regionEcon.conditionsIndex.toFixed(1), " \u00B7 employment", " ", regionEcon.employmentIndex.toFixed(1)] })) : null, mode === "election" ? (_jsx("p", { className: "muted", children: "Election colors use sitting members and published polls, never hidden voter truth." })) : null] })) : (_jsx(EmptyState, { children: "Select a constituency, province, or city." })) })] })] }));
}
function Archive(props) {
    const [filter, setFilter] = useState("all");
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
    const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
    const leadership = Object.values(props.snap.partyContests).filter((c) => c.winnerId);
    const events = props.snap.history.filter((e) => e.type !== "TURN_COMPLETED").slice(-40).reverse();
    const foreign = props.snap.foreignAffairsRuntime;
    const foreignEvents = props.snap.history
        .filter((e) => {
        if (e.type === "TURN_COMPLETED")
            return false;
        return /DIPLOMATIC|SANCTION|TREATY|FOREIGN|CRISIS|TRADE|POSTURE|CONFLICT|ALLIANCE/i.test(e.type);
    })
        .slice(-30)
        .reverse();
    const treaties = Object.values(foreign.treaties).sort((a, b) => (b.signedDate ?? "") < (a.signedDate ?? "") ? -1 : 1);
    const crises = Object.values(foreign.crises);
    const sanctions = Object.values(foreign.sanctions);
    const conflicts = Object.values(foreign.conflicts);
    const foreignLeadership = props.snap.history
        .filter((e) => e.type === "FOREIGN_LEADERSHIP_CHANGE")
        .slice(-20)
        .reverse();
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "History", title: "Archive", subtitle: "Political history drawn from public records." }), _jsx(TabBar, { tabs: [
                    { id: "all", label: "All" },
                    { id: "elections", label: "Elections" },
                    { id: "laws", label: "Laws" },
                    { id: "leadership", label: "Leadership" },
                    { id: "foreign", label: "Foreign" },
                    { id: "events", label: "Events" },
                ], value: filter, onChange: setFilter }), (filter === "all" || filter === "elections") && elections.length > 0 ? (_jsx(SectionCard, { title: "Elections", children: elections.map((e) => (_jsxs("div", { children: [electionDisplayName(e.id), " won by", " ", e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")] }, e.id))) })) : null, (filter === "all" || filter === "laws") && laws.length > 0 ? (_jsx(SectionCard, { title: "Laws enacted", children: laws.map((l) => (_jsxs("div", { children: [l.title, " (", l.enactedDate, ")"] }, l.id))) })) : null, (filter === "all" || filter === "leadership") && leadership.length > 0 ? (_jsx(SectionCard, { title: "Party leadership", children: leadership.map((c) => (_jsxs("div", { children: [contestDisplayName(props.snap, props.world, c.id), " \u2014", " ", politicianDisplayName(props.catalog, c.winnerId)] }, c.id))) })) : null, (filter === "all" || filter === "foreign") ? (_jsxs(_Fragment, { children: [treaties.length > 0 ? (_jsx(SectionCard, { title: "Treaties", children: treaties.map((t) => (_jsxs("div", { children: [t.title, " \u00B7 ", treatyTypeLabel(t.kind), " \u00B7 ", t.status, t.signedDate ? ` · ${t.signedDate}` : ""] }, t.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "Treaties", children: _jsx(EmptyState, { children: "No treaties on record." }) })) : null, crises.length > 0 ? (_jsx(SectionCard, { title: "International crises", children: crises.map((c) => (_jsxs("div", { children: [c.participantIds.map((id) => countryDisplayName(props.world, id)).join(" · "), " \u00B7", " ", crisisStageLabel(c.stage), " \u00B7 since ", c.startedDate] }, c.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "International crises", children: _jsx(EmptyState, { children: "No crises on record." }) })) : null, conflicts.length > 0 ? (_jsx(SectionCard, { title: "Conflicts", children: conflicts.map((c) => (_jsxs("div", { children: [c.belligerentIds.map((id) => countryDisplayName(props.world, id)).join(" vs "), " \u00B7 intensity ", Math.round(c.intensity * 100), "%", c.endedDate ? ` · ended ${c.endedDate}` : " · ongoing"] }, c.id))) })) : null, sanctions.length > 0 ? (_jsx(SectionCard, { title: "Sanctions", children: sanctions.map((s) => (_jsxs("div", { children: [countryDisplayName(props.world, s.imposerId), " \u2192", " ", countryDisplayName(props.world, s.targetId), " \u00B7 ", s.active ? "active" : "lifted", " \u00B7", " ", s.imposedDate] }, s.id))) })) : null, foreignLeadership.length > 0 ? (_jsx(SectionCard, { title: "Foreign leadership changes", children: foreignLeadership.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, foreignEvents.length > 0 ? (_jsx(SectionCard, { title: "Diplomatic events", children: foreignEvents.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "Diplomatic events", children: _jsx(EmptyState, { children: "No diplomatic events recorded." }) })) : null] })) : null, (filter === "all" || filter === "events") ? (_jsx(SectionCard, { title: "Public events", children: events.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, import.meta.env.DEV ? (_jsxs("details", { className: "dev-panel", children: [_jsx("summary", { children: "Development tools" }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: props.debug, onChange: (e) => props.setDebug(e.target.checked) }), " ", "Show hidden developer numbers"] }), props.debug ? (_jsx("pre", { children: JSON.stringify({
                            standing: props.snap.candidateStanding[props.snap.playerPoliticianId],
                            player: props.snap.politicians[props.snap.playerPoliticianId],
                            mp: isMp(props.world, props.snap, props.snap.playerPoliticianId),
                        }, null, 2) })) : null] })) : null] }));
}
//# sourceMappingURL=pages.js.map