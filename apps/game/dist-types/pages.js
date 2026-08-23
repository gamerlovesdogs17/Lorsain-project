import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { collectPlayerActionableDecisions, assemblyCandidateEligibilityError, currentAssemblyElectionForFiling, currentAssemblyMemberIds, currentGubernatorialOpportunity, governedProvinceId, evaluatePresidentialEligibility, storiesChronological, TERENA_WORLD_ID, } from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { EconomyPage } from "./economyScreen.js";
import { ElectionsPage } from "./electionsScreen.js";
import { ForeignAffairsPage } from "./foreignAffairsScreen.js";
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { OfficePage } from "./officeScreen.js";
import { isMp, isPresident, playerCampaign, qualitativeStanding } from "./format.js";
import { contestDisplayName, campaignTypeLabel, countryDisplayName, crisisStageLabel, electionDisplayName, eventDisplay, factionDisplayName, isPublicCrisisStage, latentStrategicTensions, partyColor, partyDisplayName, politicianDisplayName, pollShareLine, publicSeverityLabel, mediaHeadlineForEvent, treatyStatusLabel, treatyTypeLabel, } from "./presentation.js";
import { decisionDisplayLabel, formatIndexDelta, interruptDisplay, } from "./presentation/display.js";
import { DashboardLayout, EmptyState, MetricStrip, NewsItem, PageHeader, RightRail, SectionCard, StatCard, TabBar, ActivityFeedItem, LeadStory, StatusBadge, } from "./ui/kit.js";
import { PoliticianProfile, PoliticianCard } from "./ui/politician.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap } from "./map/TerenaMap.js";
import { constituencySittingSeatBreakdown, mapFillFor } from "./map/fills.js";
export function GamePages(props) {
    const { screen } = props;
    if (screen === "home")
        return _jsx(Home, { ...props });
    if (screen === "career")
        return _jsx(Career, { ...props });
    if (screen === "office")
        return _jsx(OfficePage, { ...props });
    if (screen === "assembly")
        return _jsx(AssemblyPage, { ...props });
    if (screen === "party")
        return _jsx(Party, { ...props });
    if (screen === "campaign")
        return _jsx(CampaignPage, { ...props });
    if (screen === "elections")
        return _jsx(ElectionsPage, { ...props });
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
    const terenaPublicCrisis = Object.values(props.snap.foreignAffairsRuntime.crises).find((c) => isPublicCrisisStage(c.stage) && c.participantIds.includes(TERENA_WORLD_ID));
    const terenaLatentTension = latentStrategicTensions(props.snap).find((c) => c.participantIds.includes(TERENA_WORLD_ID));
    const playerIsPresident = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
    const warTrigger = props.snap.executiveRuntime.warTrigger;
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
    const governedProvince = governedProvinceId(props.world, props.snap, playerId);
    const governorState = governedProvince ? props.snap.provincialRuntime.provinces[governedProvince] : null;
    const governorEconomy = governedProvince ? props.snap.economyRuntime.provinces[governedProvince] : null;
    const playerIsMp = isMp(props.world, props.snap, playerId);
    return (_jsxs("div", { className: "home-briefing", children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: playerId, office: props.offices[0] ?? "Private citizen", party: partyDisplayName(props.world, runtime?.partyId ?? null, props.snap), faction: factionDisplayName(props.world, runtime?.factionId ?? null), ...(figure?.home ? { home: figure.home } : {}), standing: `Public standing: ${qualitativeStanding(standing?.favorability)}`, ...((figure?.notes ?? figure?.display_summary)
                    ? { biography: figure?.notes ?? figure?.display_summary }
                    : {}) }), _jsxs("section", { className: "role-briefing-band", "aria-label": "Role briefing", children: [_jsxs("div", { className: "role-briefing-heading", children: [_jsx("span", { className: "eyebrow", children: "Your brief" }), _jsx("strong", { children: playerIsPresident ? "Presidential business" : governedProvince ? `${props.catalog.places.get(governedProvince)?.name ?? governedProvince} agenda` : playerIsMp ? "Assembly business" : props.campaign ? "Campaign priorities" : "Political career" })] }), _jsxs("div", { className: "role-briefing-items", children: [playerIsPresident ? _jsxs(_Fragment, { children: [_jsxs("span", { children: [_jsx("b", { children: Object.values(props.snap.legislatureRuntime.bills).filter((bill) => bill.status === "sent_to_president").length }), " bills awaiting action"] }), _jsxs("span", { children: [_jsx("b", { children: Object.values(props.snap.foreignAffairsRuntime.crises).filter((crisis) => isPublicCrisisStage(crisis.stage)).length }), " public crises"] }), _jsxs("span", { children: [_jsx("b", { children: decisions.length }), " decisions awaiting you"] })] }) : null, governedProvince && governorState && governorEconomy ? _jsxs(_Fragment, { children: [_jsxs("span", { children: [_jsx("b", { children: governorEconomy.conditionsIndex.toFixed(1) }), " regional conditions"] }), _jsxs("span", { children: [_jsx("b", { children: governorState.actionPointsRemaining }), " governor actions left"] }), _jsxs("span", { children: [_jsx("b", { children: governorState.activePressureId ? "Action needed" : "Stable" }), " provincial pressure"] })] }) : null, !playerIsPresident && !governedProvince && playerIsMp ? _jsxs(_Fragment, { children: [_jsxs("span", { children: [_jsx("b", { children: Object.values(props.snap.legislatureRuntime.bills).filter((bill) => ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status)).length }), " active bills"] }), _jsxs("span", { children: [_jsx("b", { children: decisions.filter((decision) => decision.kind.endsWith("vote")).length }), " votes due"] }), _jsxs("span", { children: [_jsx("b", { children: upcoming.find((election) => election.type === "assembly")?.date ?? "—" }), " next Assembly election"] })] }) : null, !playerIsPresident && !governedProvince && !playerIsMp && props.campaign ? _jsxs(_Fragment, { children: [_jsxs("span", { children: [_jsx("b", { children: props.campaign.actionPointsRemaining }), " campaign actions"] }), _jsxs("span", { children: [_jsx("b", { children: Math.round(props.campaign.cashOnHand) }), " cash on hand"] }), _jsxs("span", { children: [_jsx("b", { children: props.campaign.electionId ? electionDisplayName(props.campaign.electionId) : campaignTypeLabel(props.campaign.type) }), " active race"] })] }) : null, !playerIsPresident && !governedProvince && !playerIsMp && !props.campaign ? _jsxs(_Fragment, { children: [_jsxs("span", { children: [_jsx("b", { children: upcoming.length }), " scheduled elections"] }), _jsxs("span", { children: [_jsx("b", { children: "Career" }), " review eligible races"] }), _jsxs("span", { children: [_jsx("b", { children: "No office required" }), " the game continues"] })] }) : null] })] }), interrupt ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "Urgent" }), _jsx("p", { children: interruptDisplay(interrupt) })] })) : null, decisions.length > 0 ? (_jsx(SectionCard, { title: "Required decisions", children: decisions.map((d) => (_jsx("div", { className: "urgent-item", children: decisionDisplayLabel(d, interrupt) }, d.key))) })) : null, lead ? (_jsx(LeadStory, { kicker: "Lead story", headline: eventDisplay(props.catalog, props.world, props.snap, lead), date: lead.date })) : (_jsx(EmptyState, { children: "No major developments this month." })), terenaPublicCrisis ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "International crisis" }), _jsxs("p", { children: ["Terena is involved in an active international crisis (", crisisStageLabel(terenaPublicCrisis.stage), " \u00B7", " ", publicSeverityLabel(terenaPublicCrisis.intensity, terenaPublicCrisis.stage), "). See", " ", terenaPublicCrisis.participantIds
                                .filter((id) => id !== TERENA_WORLD_ID)
                                .map((id) => countryDisplayName(props.world, id))
                                .join(", ") || "foreign partners", " ", "on the Foreign Affairs map."] })] })) : null, terenaLatentTension && !terenaPublicCrisis ? (_jsxs("div", { className: "briefing-note alert", children: [_jsx("strong", { children: "Strategic tension" }), _jsxs("p", { children: ["Background tension with", " ", terenaLatentTension.participantIds
                                .filter((id) => id !== TERENA_WORLD_ID)
                                .map((id) => countryDisplayName(props.world, id))
                                .join(", ") || "a foreign power", " ", "persists (", publicSeverityLabel(terenaLatentTension.intensity, terenaLatentTension.stage), "). Monitor developments on the Foreign Affairs map."] })] })) : null, playerIsPresident && warTrigger ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "War powers decision required" }), _jsx("p", { children: "International developments require presidential war powers. Open Executive or Foreign Affairs to invoke war powers or seek Assembly authorization." })] })) : null, _jsx(DashboardLayout, { main: _jsxs(_Fragment, { children: [_jsxs(SectionCard, { title: "Political situation", children: [_jsxs(MetricStrip, { children: [_jsx(StatCard, { label: "Standing", value: qualitativeStanding(standing?.favorability) }), _jsx(StatCard, { label: "Confidence", value: n.confidenceIndex.toFixed(1), hint: `${formatIndexDelta(confDelta)} vs prior month` }), _jsx(StatCard, { label: "Employment index", value: n.employmentIndex.toFixed(1), hint: "Index reference = 100" }), props.campaign ? (_jsx(StatCard, { label: "Campaign actions", value: `${props.campaign.actionPointsRemaining} / ${props.campaign.actionPointsMax}` })) : null] }), polls.length > 0 ? (_jsxs("div", { className: "muted", style: { marginTop: "0.75rem" }, children: ["Latest poll ", polls[polls.length - 1].publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, polls[polls.length - 1].firstPreference)] })) : null] }), _jsxs(SectionCard, { title: "Recent activity", children: [feed.length === 0 ? _jsx(EmptyState, { children: "Quiet month in public records." }) : null, feed.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] }), stories.length > 0 ? (_jsx(SectionCard, { title: "In the press", children: stories.map((s) => (_jsx(NewsItem, { headline: s.headlineKey === "Political developments" ||
                                    s.headlineKey === "Political storm in Valen"
                                    ? mediaHeadlineForEvent(s.factEventType, s.framing)
                                    : s.headlineKey, outlet: props.world.mediaOutlets[s.outletId]?.name ?? s.outletId, date: s.date, category: s.category }, s.id))) })) : null] }), rail: _jsxs(RightRail, { children: [_jsxs(SectionCard, { title: "Upcoming elections", children: [upcoming.length === 0 ? _jsx(EmptyState, { children: "No pending elections." }) : null, upcoming.map((el) => (_jsxs("div", { className: "rail-item", children: [_jsx("strong", { children: electionDisplayName(el.id) }), _jsx("div", { className: "muted", children: el.date })] }, el.id)))] }), _jsx(SectionCard, { title: "Campaign", children: props.campaign ? (_jsxs("div", { children: [_jsx(StatusBadge, { tone: "ok", children: "Active" }), _jsx("div", { className: "muted", children: campaignTypeLabel(props.campaign.type) })] })) : (_jsx(EmptyState, { children: "Not campaigning" })) })] }) })] }));
}
function Career(props) {
    const [tab, setTab] = useState("opportunities");
    const [raceGeography, setRaceGeography] = useState("");
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
    const playerId = props.snap.playerPoliticianId;
    const assemblyElection = currentAssemblyElectionForFiling(props.snap);
    const assemblyCycle = assemblyElection?.assembly;
    const assemblyDecision = assemblyCycle?.decisions[playerId];
    const eligibleConstituencies = Object.keys(props.world.constituencyElectorate)
        .filter((id) => assemblyCandidateEligibilityError(props.snap, props.world, playerId, id) == null)
        .sort((a, b) => {
        const ah = props.world.constituencyProvinceShares[a]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId]) ? 1 : 0;
        const bh = props.world.constituencyProvinceShares[b]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId]) ? 1 : 0;
        return bh - ah || (props.world.constituencyElectorate[b]?.seats ?? 0) - (props.world.constituencyElectorate[a]?.seats ?? 0) || a.localeCompare(b);
    });
    const chosenConstituency = raceGeography || eligibleConstituencies[0] || "";
    const gubernatorial = currentGubernatorialOpportunity(props.snap, props.world, playerId);
    const presidential = Object.values(props.snap.elections)
        .filter((election) => election.type === "presidential" && election.status !== "resolved" && election.status !== "cancelled")
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    const presidentialEligibility = presidential
        ? evaluatePresidentialEligibility(props.world, props.snap, playerId, presidential.date)
        : null;
    const nomination = presidential
        ? Object.values(props.snap.partyContests).find((contest) => contest.type === "presidential_nomination" &&
            contest.partyId === runtime?.partyId &&
            contest.metadata.electionId === presidential.id)
        : null;
    const run = (command) => {
        const result = props.sim.executeCommand(command);
        props.report(result);
        props.onDone();
    };
    return (_jsxs("div", { children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: props.snap.playerPoliticianId, office: props.offices[0] ?? "Private citizen", party: partyDisplayName(props.world, runtime?.partyId ?? null, props.snap), faction: factionDisplayName(props.world, runtime?.factionId ?? null), ...(figure?.home ? { home: figure.home } : {}), standing: `Public standing: ${qualitativeStanding(standing?.favorability)}`, ...((figure?.notes ?? figure?.display_summary)
                    ? { biography: figure?.notes ?? figure?.display_summary }
                    : {}) }), _jsx(TabBar, { tabs: [
                    { id: "opportunities", label: "Political opportunities" },
                    { id: "overview", label: "Overview" },
                    { id: "career", label: "Career" },
                    { id: "positions", label: "Positions" },
                    { id: "relationships", label: "Relationships" },
                    { id: "record", label: "Public record" },
                ], value: tab, onChange: setTab }), tab === "opportunities" ? (_jsxs("div", { className: "opportunities-layout", children: [_jsxs("div", { className: "opportunities-intro", children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "Run for office" }), _jsx("h2", { children: "Political opportunities" })] }), _jsxs("p", { children: ["Only races for which ", politicianDisplayName(props.catalog, playerId), " is presently eligible are actionable. Public facts are shown; hidden support is not."] })] }), presidential ? (_jsxs("section", { className: "opportunity-row", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "National" }), _jsx("h3", { children: "President" }), _jsx("strong", { children: presidential.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsx("p", { children: presidentialEligibility?.eligible ? "Constitutionally eligible" : presidentialEligibility?.reasons.join(" · ") || "Not presently eligible" }), _jsxs("p", { className: "muted", children: ["Nomination: ", nomination?.status ?? "not open", " \u00B7 national constituency \u00B7 term incompatibilities apply on assumption."] })] }), _jsx("div", { className: "opportunity-action", children: presidentialEligibility?.eligible && nomination && ["open", "qualification"].includes(nomination.status) && !nomination.entries[playerId] ? (_jsx("button", { className: "btn", onClick: () => run({ type: "DECLARE_CAMPAIGN", politicianId: playerId, campaignType: "presidential_nomination", contestId: nomination.id }), children: "Enter nomination" })) : nomination?.entries[playerId] ? _jsx(StatusBadge, { tone: "ok", children: "Entered" }) : _jsx(StatusBadge, { children: "Not yet open" }) })] })) : null, assemblyElection ? (_jsxs("section", { className: "opportunity-row opportunity-geographic", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "Constituency" }), _jsx("h3", { children: "National Assembly" }), _jsx("strong", { children: assemblyElection.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsxs("p", { children: [eligibleConstituencies.length ? `${eligibleConstituencies.length} eligible constituencies` : "No eligible constituency", " \u00B7 filing ", assemblyCycle?.filingOpenDate, "\u2013", assemblyCycle?.filingDeadlineDate] }), assemblyCycle?.filingStatus === "open" && !assemblyDecision ? (_jsx("div", { className: "geography-choice-grid", role: "listbox", "aria-label": "Choose an Assembly constituency", children: eligibleConstituencies.map((id) => {
                                            const info = props.catalog.places.get(id);
                                            const parties = constituencySittingSeatBreakdown(props.world, props.snap, id);
                                            const selected = id === chosenConstituency;
                                            return _jsxs("button", { type: "button", className: `geography-choice${selected ? " selected" : ""}`, onClick: () => setRaceGeography(id), children: [_jsx("strong", { children: info?.name ?? id }), _jsxs("span", { children: [info?.provinceName ?? "Terena", " \u00B7 ", props.world.constituencyElectorate[id]?.seats ?? "?", " seats"] }), _jsx("span", { children: parties.slice(0, 2).map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`).join(" · ") || "Open representation" })] }, id);
                                        }) })) : _jsxs("p", { className: "muted", children: ["Filing status: ", assemblyDecision?.decision ?? assemblyCycle?.filingStatus ?? "planned"] })] }), _jsx("div", { className: "opportunity-action", children: assemblyCycle?.filingStatus === "open" && !assemblyDecision && chosenConstituency ? _jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => run({ type: "FILE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id, constituencyId: chosenConstituency }), children: "File candidacy" }), _jsx("button", { className: "btn secondary", onClick: () => run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id }), children: "Decline this cycle" })] }) : assemblyDecision?.decision === "filed" ? _jsx(StatusBadge, { tone: "ok", children: "Filed" }) : assemblyDecision?.decision === "declined" ? _jsx(StatusBadge, { children: "Declined" }) : _jsx(StatusBadge, { children: "Filing not open" }) })] })) : null, gubernatorial.map((race) => {
                        const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
                        return _jsxs("section", { className: "opportunity-row", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "Province" }), _jsxs("h3", { children: ["Governor of ", provinceName] }), _jsx("strong", { children: race.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsxs("p", { children: ["Resident and presently eligible \u00B7 incumbent ", race.incumbentId ? politicianDisplayName(props.catalog, race.incumbentId) : "none"] }), _jsxs("p", { className: "muted", children: ["Filing ", race.filingOpenDate, "\u2013", race.filingDeadlineDate, " \u00B7 province-wide plurality election."] })] }), _jsx("div", { className: "opportunity-action", children: race.status === "filing_open" ? _jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => run({ type: "FILE_GUBERNATORIAL_CANDIDACY", electionId: race.id, provinceId: race.provinceId }), children: "File candidacy" }), _jsx("button", { className: "btn secondary", onClick: () => run({ type: "DECLINE_GUBERNATORIAL_CANDIDACY", electionId: race.id }), children: "Decline this cycle" })] }) : _jsxs(StatusBadge, { children: ["Opens ", race.filingOpenDate] }) })] }, race.id);
                    }), !presidential && !assemblyElection && gubernatorial.length === 0 ? _jsx(EmptyState, { children: "No modeled election opportunity is currently scheduled." }) : null] })) : null, tab === "overview" ? (_jsxs(SectionCard, { title: "Public biography", children: [_jsx("p", { children: figure?.notes ?? figure?.display_summary ?? "No public biography on file." }), age != null ? _jsxs("p", { children: ["Age: ", age] }) : null] })) : null, tab === "career" ? (_jsxs(SectionCard, { title: "Offices", children: [terms.length === 0 ? _jsx(EmptyState, { children: "No office terms on file." }) : null, terms.map((t) => (_jsxs("div", { children: [props.world.offices[t.officeId]?.title ?? t.officeId, " \u00B7 ", t.status, " \u00B7 ", t.startDate, t.endDate ? ` – ${t.endDate}` : ""] }, t.id)))] })) : null, tab === "positions" ? (_jsxs(SectionCard, { title: "Public offices and campaign", children: [_jsx("p", { children: props.offices.join(", ") || "No current office" }), _jsx("p", { className: "muted", children: props.campaign ? "Campaign underway" : "Not currently campaigning" })] })) : null, tab === "relationships" ? (_jsx(SectionCard, { title: "Known public associations", children: _jsx(EmptyState, { children: "Exact private relationship values are not shown. Use Organizations for known public contact." }) })) : null, tab === "record" ? (_jsx(SectionCard, { title: "Recent public events", children: props.snap.history
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
                                .map((e) => (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: e.politicianId, compact: true }, e.politicianId))), c.winnerId ? (_jsxs("div", { children: ["Winner: ", politicianDisplayName(props.catalog, c.winnerId)] })) : null] }, c.id)))] }), elections.length > 0 ? (_jsx(SectionCard, { title: "Recent electoral performance", children: elections.map((e) => (_jsxs("div", { children: [electionDisplayName(e.id), " \u00B7", " ", e.type === "assembly"
                            ? Object.entries(e.assembly?.partySeatTotals ?? {})
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3)
                                .map(([id, seats]) => `${partyDisplayName(props.world, id === "independent" ? null : id, props.snap)} ${seats}`)
                                .join(" · ") || `${e.winnerIds.length} members elected`
                            : e.winnerIds[0]
                                ? politicianDisplayName(props.catalog, e.winnerIds[0])
                                : e.status] }, e.id))) })) : null, _jsxs(SectionCard, { title: "Recent party events", children: [recent.length === 0 ? _jsx(EmptyState, { children: "No recent public party events." }) : null, recent.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] })] }));
}
function Terena(props) {
    const [mode, setMode] = useState("political");
    const [sel, setSel] = useState(null);
    const [hoverSel, setHoverSel] = useState(null);
    const [mapElectionId, setMapElectionId] = useState("");
    const [campaignMapScale, setCampaignMapScale] = useState("province");
    const place = sel ? props.catalog.places.get(sel.id) : null;
    const electionChoices = [
        ...Object.values(props.snap.elections).map((election) => ({ id: election.id, date: election.date, type: election.type, status: election.status, provinceId: null })),
        ...Object.values(props.snap.provincialRuntime.elections).map((election) => ({ id: election.id, date: election.date, type: "gubernatorial", status: election.status, provinceId: election.provinceId })),
    ].sort((a, b) => {
        const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
        const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
        return ba - aa || (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.id.localeCompare(b.id);
    });
    const activeMapElection = electionChoices.find((election) => election.id === mapElectionId) ?? electionChoices[0] ?? null;
    const org = mode === "campaign" && props.campaign && sel?.kind === "constituency"
        ? props.campaign.organizationByConstituency[sel.id]
        : mode === "campaign" && props.campaign && sel?.kind === "province"
            ? props.campaign.organizationByProvince[sel.id]
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
    const tooltip = (selection) => {
        if (mode === "economy" && selection.kind === "province") {
            const data = props.snap.economyRuntime.provinces[selection.id];
            return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: data ? `Conditions ${data.conditionsIndex.toFixed(1)} · employment ${data.employmentIndex.toFixed(1)} · housing ${data.housingIndex.toFixed(1)}` : "No regional series" })] });
        }
        if (mode === "campaign") {
            const value = selection.kind === "province"
                ? props.campaign?.organizationByProvince[selection.id]
                : selection.kind === "constituency"
                    ? props.campaign?.organizationByConstituency[selection.id]
                    : null;
            return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: value == null ? "No active field operation" : `Field organization ${value.toFixed(2)}` })] });
        }
        if (mode === "political" && selection.kind === "constituency") {
            const rows = constituencySittingSeatBreakdown(props.world, props.snap, selection.id);
            return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: rows.map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`).join(" · ") || "No sitting members" })] });
        }
        if (mode === "election") {
            const national = activeMapElection ? props.snap.elections[activeMapElection.id] : null;
            const regional = activeMapElection ? props.snap.provincialRuntime.elections[activeMapElection.id] : null;
            if (selection.kind === "constituency" && national?.assembly?.constituencyResults[selection.id]) {
                const result = national.assembly.constituencyResults[selection.id];
                return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [result.electedIds.length, " elected \u00B7 turnout ", (result.turnout.turnoutRate * 100).toFixed(0), "%"] })] });
            }
            if (selection.kind === "province" && regional?.provinceId === selection.id) {
                return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: regional.winnerId ? `Winner ${politicianDisplayName(props.catalog, regional.winnerId)}` : `${regional.status.replace(/_/g, " ")} · ${Object.keys(regional.candidates).length} candidates` })] });
            }
            return _jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: "No published geographic result for this election." })] });
        }
        return _jsx("strong", { children: selection.name });
    };
    const switchMapMode = (nextMode) => {
        setMode(nextMode);
        setHoverSel(null);
        setSel((current) => {
            if (!current || nextMode === "political")
                return current;
            if (nextMode === "economy")
                return current.kind === "province" ? current : null;
            if (nextMode === "campaign") {
                return current.kind === campaignMapScale ? current : null;
            }
            if (nextMode === "election") {
                if (activeMapElection?.type === "assembly")
                    return current.kind === "constituency" ? current : null;
                if (activeMapElection?.type === "gubernatorial")
                    return current.kind === "province" ? current : null;
                return null;
            }
            return current;
        });
    };
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Geography", title: "Terena", subtitle: "Interactive map derived from canonical GeoJSON. Supplied SVG files remain authoring references." }), _jsx(TabBar, { tabs: [
                    { id: "political", label: "Political" },
                    { id: "election", label: "Election" },
                    { id: "campaign", label: "Campaign" },
                    { id: "economy", label: "Economy" },
                ], value: mode, onChange: switchMapMode }), mode === "election" && electionChoices.length ? (_jsxs("label", { className: "map-election-picker", children: ["Election", _jsx("select", { value: activeMapElection?.id ?? "", onChange: (event) => {
                            const id = event.target.value;
                            const next = electionChoices.find((election) => election.id === id);
                            setMapElectionId(id);
                            setSel((current) => {
                                if (!current || !next)
                                    return null;
                                if (next.type === "assembly")
                                    return current.kind === "constituency" ? current : null;
                                if (next.type === "gubernatorial")
                                    return current.kind === "province" ? current : null;
                                return null;
                            });
                        }, children: electionChoices.map((election) => _jsxs("option", { value: election.id, children: [election.provinceId ? `${props.catalog.places.get(election.provinceId)?.name ?? election.provinceId} · ` : "", election.date.slice(0, 4), " \u00B7 ", election.type.replace(/_/g, " "), " \u00B7 ", election.status.replace(/_/g, " ")] }, election.id)) })] })) : null, mode === "campaign" ? _jsxs("div", { className: "map-scale-switch", "aria-label": "Campaign map scale", children: [_jsx("button", { type: "button", className: campaignMapScale === "province" ? "active" : "", onClick: () => { setCampaignMapScale("province"); setSel(null); }, children: "Provinces" }), _jsx("button", { type: "button", className: campaignMapScale === "constituency" ? "active" : "", onClick: () => { setCampaignMapScale("constituency"); setSel(null); }, children: "Constituencies" })] }) : null, _jsxs("div", { className: "dash dash-2", children: [_jsx(TerenaMap, { bundle: props.bundle, mode: mode, selectedId: sel?.id ?? null, showConstituencies: mode !== "economy" && !(mode === "election" && activeMapElection?.type !== "assembly") && !(mode === "campaign" && campaignMapScale === "province"), fillFor: (f, kind) => mapFillFor(mode, props.world, props.snap, f, kind, props.campaign?.organizationByConstituency, props.campaign?.organizationByProvince, activeMapElection?.id), onSelect: setSel, onHover: (selection) => {
                            setHoverSel(selection);
                            props.setMapHover(selection?.id ?? null);
                        }, tooltipFor: tooltip }), mode === "election" && activeMapElection?.type === "presidential" ? (_jsxs("div", { className: "map-legend", children: [_jsx("div", { className: "kicker", children: "Legend" }), _jsx("div", { className: "legend-items", children: _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "swatch", style: { background: "#d8d6cf" } }), "No public geographic data"] }) })] })) : _jsx(MapLegend, { mode: mode, world: props.world }), _jsx(SectionCard, { title: "Selection", children: sel && place ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: place.name }), _jsx("div", { className: "muted", children: sel.kind === "constituency"
                                        ? `${place.seats ?? "?"} seats · ${sitting} sitting${place.provinceName ? ` · ${place.provinceName}` : ""}`
                                        : "Province" }), org != null ? _jsxs("div", { children: ["Your field organization: ", org.toFixed(2)] }) : null, mode === "political" && sel.kind === "constituency"
                                    ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (_jsxs("div", { className: "muted", children: [partyDisplayName(props.world, row.partyId, props.snap), " \u00B7 ", row.seats, " sitting seat", row.seats === 1 ? "" : "s"] }, row.partyId ?? "none")))
                                    : null, mode === "economy" && regionEcon ? (_jsxs("div", { children: ["Conditions ", regionEcon.conditionsIndex.toFixed(1), " \u00B7 employment", " ", regionEcon.employmentIndex.toFixed(1)] })) : null, mode === "election" ? (_jsx("div", { className: "map-selection-mode", children: tooltip(sel) })) : null] })) : (_jsx(EmptyState, { children: mode === "election" && activeMapElection?.type === "presidential"
                                ? "This national presidential race has no public geographic result. Select another election for a geographic view."
                                : "Select a constituency, province, or city." })) })] }), hoverSel && !sel ? _jsxs("p", { className: "muted map-hover-note", children: ["Hovering ", hoverSel.name, "; click or tap to keep its details open."] }) : null] }));
}
function Archive(props) {
    const [filter, setFilter] = useState("all");
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
    const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
    const governorElections = Object.values(props.snap.provincialRuntime.elections).filter((e) => e.status === "resolved" || e.status === "assumed");
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
                ], value: filter, onChange: setFilter }), (filter === "all" || filter === "elections") && elections.length > 0 ? (_jsxs(SectionCard, { title: "Elections", children: [elections.map((e) => (_jsxs("div", { children: [electionDisplayName(e.id), " \u00B7 ", e.type === "assembly" ? `${e.winnerIds.length} members elected` : `won by ${e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`] }, e.id))), governorElections.map((e) => _jsxs("div", { children: [props.catalog.places.get(e.provinceId)?.name ?? e.provinceId, " gubernatorial election \u00B7 ", e.winnerId ? `won by ${politicianDisplayName(props.catalog, e.winnerId)}` : "result unavailable"] }, e.id))] })) : null, (filter === "all" || filter === "laws") && laws.length > 0 ? (_jsx(SectionCard, { title: "Laws enacted", children: laws.map((l) => (_jsxs("div", { children: [l.title, " (", l.enactedDate, ")"] }, l.id))) })) : null, (filter === "all" || filter === "leadership") && leadership.length > 0 ? (_jsx(SectionCard, { title: "Party leadership", children: leadership.map((c) => (_jsxs("div", { children: [contestDisplayName(props.snap, props.world, c.id), " \u2014", " ", politicianDisplayName(props.catalog, c.winnerId)] }, c.id))) })) : null, (filter === "all" || filter === "foreign") ? (_jsxs(_Fragment, { children: [treaties.length > 0 ? (_jsx(SectionCard, { title: "Treaties", children: treaties.map((t) => (_jsxs("div", { children: [t.title, " \u00B7 ", treatyTypeLabel(t.kind), " \u00B7 ", treatyStatusLabel(t), t.signedDate ? ` · ${t.signedDate}` : ""] }, t.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "Treaties", children: _jsx(EmptyState, { children: "No treaties on record." }) })) : null, crises.length > 0 ? (_jsx(SectionCard, { title: "International crises", children: crises.map((c) => (_jsxs("div", { children: [c.participantIds.map((id) => countryDisplayName(props.world, id)).join(" · "), " \u00B7", " ", crisisStageLabel(c.stage), " \u00B7 since ", c.startedDate] }, c.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "International crises", children: _jsx(EmptyState, { children: "No crises on record." }) })) : null, conflicts.length > 0 ? (_jsx(SectionCard, { title: "Conflicts", children: conflicts.map((c) => (_jsxs("div", { children: [c.belligerentIds.map((id) => countryDisplayName(props.world, id)).join(" vs "), " \u00B7", publicSeverityLabel(c.intensity, "conflict"), c.endedDate ? ` · ended ${c.endedDate}` : " · ongoing"] }, c.id))) })) : null, sanctions.length > 0 ? (_jsx(SectionCard, { title: "Sanctions", children: sanctions.map((s) => (_jsxs("div", { children: [countryDisplayName(props.world, s.imposerId), " \u2192", " ", countryDisplayName(props.world, s.targetId), " \u00B7 ", s.active ? "active" : "lifted", " \u00B7", " ", s.imposedDate] }, s.id))) })) : null, foreignLeadership.length > 0 ? (_jsx(SectionCard, { title: "Foreign leadership changes", children: foreignLeadership.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, foreignEvents.length > 0 ? (_jsx(SectionCard, { title: "Diplomatic events", children: foreignEvents.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : filter === "foreign" ? (_jsx(SectionCard, { title: "Diplomatic events", children: _jsx(EmptyState, { children: "No diplomatic events recorded." }) })) : null] })) : null, (filter === "all" || filter === "events") ? (_jsx(SectionCard, { title: "Public events", children: events.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, import.meta.env.DEV ? (_jsxs("details", { className: "dev-panel", children: [_jsx("summary", { children: "Development tools" }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: props.debug, onChange: (e) => props.setDebug(e.target.checked) }), " ", "Show hidden developer numbers"] }), props.debug ? (_jsx("pre", { children: JSON.stringify({
                            standing: props.snap.candidateStanding[props.snap.playerPoliticianId],
                            player: props.snap.politicians[props.snap.playerPoliticianId],
                            mp: isMp(props.world, props.snap, props.snap.playerPoliticianId),
                        }, null, 2) })) : null] })) : null] }));
}
//# sourceMappingURL=pages.js.map