import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { caseTitle, collectPlayerActionableDecisions, assemblyCandidateEligibilityError, currentAssemblyElectionForFiling, currentAssemblyMemberIds, currentGubernatorialOpportunity, governedProvinceId, evaluatePresidentialEligibility, provincialLegislatorForPolitician, publicConstituencyPressures, storiesChronological, TERENA_WORLD_ID, activeCoalition, } from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { EconomyPage } from "./economyScreen.js";
import { ElectionsPage } from "./electionsScreen.js";
import { ForeignAffairsPage } from "./foreignAffairsScreen.js";
import { OrganizationsPage } from "./organizationsScreen.js";
import { NewsPage } from "./newsScreen.js";
import { HistoryPage } from "./historyScreen.js";
import { OfficePage } from "./officeScreen.js";
import { PartyPage } from "./partyScreen.js";
import { SettingsPage } from "./settingsScreen.js";
import { groundGameStrength, isMp, isPresident, playerCampaign, publicStandingLabel, } from "./format.js";
import { contestDisplayName, campaignTypeLabel, committeeDisplayName, countryDisplayName, crisisStageLabel, electionDisplayName, eventDisplay, factionDisplayName, isPublicCrisisStage, latentStrategicTensions, partyDisplayName, politicianDisplayName, pollShareLine, partyColor, publicSeverityLabel, mediaHeadlineForEvent, treatyStatusLabel, treatyTypeLabel, } from "./presentation.js";
import { decisionDisplayLabel, interruptDisplay } from "./presentation/display.js";
import { nationalPublicEconomy, regionalPublicEconomy } from "./presentation/economy.js";
import { EntityLink } from "./ui/entityLink.js";
import { ActivityFeedItem, BriefStrip, CommandHeader, DataTable, EmptyState, EntityIdentityBanner, EntityRow, NewsItem, ObjectLead, PageHeader, SectionCard, SectionDivider, TabBar, LeadStory, MapDetailLayout, StatusBadge, WorkLayout, } from "./ui/kit.js";
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
        return _jsx(PartyPage, { ...props });
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
    if (screen === "situation")
        return _jsx(SituationRoom, { ...props });
    if (screen === "settings") {
        return _jsx(SettingsPage, { showBack: false });
    }
    return (_jsx(HistoryPage, { world: props.world, snap: props.snap, bundle: props.bundle, catalog: props.catalog, ...(props.onEntityNavigate ? { onEntityNavigate: props.onEntityNavigate } : {}) }));
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
    const feed = monthEvents
        .filter((e) => e.importance >= 0.35 || e.visibility === "public")
        .slice(-5)
        .reverse();
    const stories = storiesChronological(props.snap).slice(0, 2);
    const polls = Object.values(props.snap.polls).slice(-1);
    const publicEconomy = nationalPublicEconomy(props.snap);
    const upcoming = Object.values(props.snap.elections)
        .filter((e) => e.status !== "resolved")
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);
    const figure = props.figures.get(playerId);
    const runtime = props.snap.politicians[playerId];
    const standingLabel = publicStandingLabel(props.world, props.snap, playerId);
    const standingContext = props.snap.history
        .filter((event) => event.visibility === "public" &&
        event.actorIds.includes(playerId) &&
        event.type !== "TURN_COMPLETED")
        .slice(-2)
        .reverse();
    const governedProvince = governedProvinceId(props.world, props.snap, playerId);
    const governorState = governedProvince
        ? props.snap.provincialRuntime.provinces[governedProvince]
        : null;
    const governorEconomy = governedProvince
        ? props.snap.economyRuntime.provinces[governedProvince]
        : null;
    const governorPublicEconomy = governedProvince
        ? regionalPublicEconomy(props.snap, governedProvince)
        : null;
    const playerIsMp = isMp(props.world, props.snap, playerId);
    const provincialMember = provincialLegislatorForPolitician(props.snap, playerId);
    const provincialChamber = provincialMember?.serviceStartDate && provincialMember.serviceEndDate == null
        ? props.snap.provincialRuntime.assemblies[provincialMember.provinceId]
        : null;
    const provincialVotesDue = provincialMember && provincialChamber
        ? Object.values(props.snap.provincialRuntime.bills).filter((bill) => bill.provinceId === provincialMember.provinceId &&
            bill.status === "introduced" &&
            !props.snap.provincialRuntime.votes[`pending:bill:${bill.id}:${provincialMember.id}`]).length
        : 0;
    const playerConstituencyId = Object.values(props.snap.officeTerms).flatMap((term) => {
        if (term.holderId !== playerId || (term.status !== "active" && term.status !== "suspended"))
            return [];
        const office = props.world.offices[term.officeId];
        return office?.kind === "assembly_member" && office.constituencyId
            ? [office.constituencyId]
            : [];
    })[0] ?? null;
    const constituencyPressures = playerConstituencyId
        ? publicConstituencyPressures(props.world, props.snap, playerConstituencyId)
        : [];
    const billsAwaiting = Object.values(props.snap.legislatureRuntime.bills).filter((bill) => bill.status === "sent_to_president").length;
    const publicCrises = Object.values(props.snap.foreignAffairsRuntime.crises).filter((crisis) => isPublicCrisisStage(crisis.stage)).length;
    const votesDue = decisions.filter((decision) => decision.kind.endsWith("vote")).length;
    const coalition = activeCoalition(props.snap);
    const openSeats = Object.values(props.snap.politicsRuntime?.openSeatContests ?? {}).filter((s) => s.status === "open" || s.status === "recruited");
    const openLeadership = Object.values(props.snap.partyContests).filter((c) => c.type === "party_leadership" && c.status !== "resolved" && c.status !== "cancelled");
    const governing = props.snap.governingRuntime;
    const agendaActive = (governing?.agenda?.items ?? [])
        .filter((i) => i.status === "active")
        .slice(0, 3);
    const partyLabel = partyDisplayName(props.world, runtime?.partyId ?? null, props.snap);
    const partyTint = runtime?.partyId ? partyColor(props.world, runtime.partyId) : undefined;
    const go = (screen) => props.onNavigate?.(screen);
    const playerName = figure?.name ?? politicianDisplayName(props.catalog, playerId);
    const briefTitle = playerIsPresident
        ? "Presidential desk"
        : governedProvince
            ? `${props.catalog.places.get(governedProvince)?.name ?? "Province"} desk`
            : playerIsMp
                ? "Assembly desk"
                : provincialMember && provincialChamber
                    ? `${props.catalog.places.get(provincialMember.provinceId)?.name ?? "Province"} Assembly desk`
                    : props.campaign
                        ? "Campaign desk"
                        : "Political desk";
    const briefItems = playerIsPresident
        ? [
            { label: "Bills awaiting", value: billsAwaiting },
            { label: "Public crises", value: publicCrises },
            { label: "Your decisions", value: decisions.length },
            {
                label: "Confidence",
                value: `${publicEconomy.confidence} · ${publicEconomy.confidenceTrend.toLowerCase()}`,
            },
        ]
        : governedProvince && governorState && governorEconomy
            ? [
                { label: "Conditions", value: governorPublicEconomy?.conditions ?? "—" },
                { label: "Monthly actions", value: governorState.actionPointsRemaining },
                { label: "Pressure", value: governorState.activePressureId ? "Action needed" : "Stable" },
                { label: "Standing", value: standingLabel },
            ]
            : playerIsMp
                ? [
                    { label: "Votes due", value: votesDue },
                    {
                        label: "Active bills",
                        value: Object.values(props.snap.legislatureRuntime.bills).filter((bill) => ["committee", "floor_scheduled", "repassage_scheduled"].includes(bill.status)).length,
                    },
                    {
                        label: "Next Assembly",
                        value: upcoming.find((election) => election.type === "assembly")?.date ?? "—",
                    },
                    { label: "Standing", value: standingLabel },
                ]
                : provincialMember && provincialChamber
                    ? [
                        { label: "Votes due", value: provincialVotesDue },
                        { label: "Agenda bills", value: provincialChamber.agendaBillIds.length },
                        { label: "Next election", value: provincialChamber.nextElectionDate },
                        { label: "Standing", value: standingLabel },
                    ]
                    : props.campaign
                        ? [
                            { label: "Monthly actions", value: props.campaign.actionPointsRemaining },
                            { label: "Cash", value: Math.round(props.campaign.cashOnHand).toLocaleString() },
                            {
                                label: "Race",
                                value: props.campaign.electionId
                                    ? electionDisplayName(props.campaign.electionId)
                                    : campaignTypeLabel(props.campaign.type),
                            },
                            { label: "Standing", value: standingLabel },
                        ]
                        : [
                            { label: "Scheduled races", value: upcoming.length },
                            { label: "Standing", value: standingLabel },
                            { label: "Office", value: props.offices[0] ?? "Private citizen" },
                            { label: "Date", value: props.snap.currentDate },
                        ];
    const hasActionRequired = Boolean(interrupt) ||
        decisions.length > 0 ||
        Boolean(terenaPublicCrisis) ||
        Boolean(playerIsPresident && warTrigger);
    const primaryActions = (_jsxs(_Fragment, { children: [decisions.length > 0 ? (_jsxs("button", { type: "button", className: "btn btn-sm", onClick: () => go("office"), children: ["Pending decisions (", decisions.length, ")"] })) : null, props.campaign ? (_jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("campaign"), children: "Campaign \u2192" })) : null, _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("news"), children: "News \u2192" })] }));
    return (_jsx("div", { className: "home-v5 home-desk home-v2 home-final", "data-tutorial": "home-desk", children: _jsx(WorkLayout, { header: _jsxs(_Fragment, { children: [_jsx(CommandHeader, { kicker: "Home", title: briefTitle, subtitle: `${props.snap.currentDate} · ${standingLabel} standing`, status: _jsx(BriefStrip, { items: briefItems, "aria-label": "Office status" }), actions: primaryActions, "data-qa": "home-command-header" }), _jsx(EntityIdentityBanner, { name: playerName, office: props.offices[0] ?? "Private citizen", party: partyLabel, ...(partyTint ? { color: partyTint } : {}), ...(figure?.home || runtime?.homeProvinceId
                            ? {
                                meta: `Home · ${figure?.home ??
                                    props.catalog.places.get(runtime?.homeProvinceId ?? "")?.name ??
                                    "—"}`,
                            }
                            : {}), actions: _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("career"), children: "Career \u2192" }) })] }), main: _jsxs(_Fragment, { children: [_jsxs("section", { className: "home-section", children: [_jsx(ObjectLead, { kicker: "Pending", title: "Decisions before you", meta: "Actions that block progress or demand a vote" }), interrupt ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "Urgent" }), _jsx("p", { children: interruptDisplay(interrupt) })] })) : null, decisions.length > 0 ? (_jsxs("div", { className: "home-action-list", children: [decisions.slice(0, 8).map((d) => (_jsxs("div", { className: "decision-row", children: [_jsx("span", { children: decisionDisplayLabel(d, interrupt) }), _jsx(StatusBadge, { tone: "warn", children: "Action" })] }, d.key))), decisions.length > 8 ? (_jsxs("p", { className: "muted", children: [decisions.length - 8, " more in Attention."] })) : null] })) : null, terenaPublicCrisis ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "International crisis" }), _jsxs("p", { children: ["Terena is involved (", crisisStageLabel(terenaPublicCrisis.stage), " \u00B7", " ", publicSeverityLabel(terenaPublicCrisis.intensity, terenaPublicCrisis.stage), "). See Foreign Affairs."] }), _jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("foreign"), children: "Open Foreign Affairs \u2192" })] })) : null, terenaLatentTension && !terenaPublicCrisis ? (_jsxs("div", { className: "briefing-note alert", children: [_jsx("strong", { children: "Strategic tension" }), _jsxs("p", { children: ["Background tension persists (", publicSeverityLabel(terenaLatentTension.intensity, terenaLatentTension.stage), ")."] })] })) : null, playerIsPresident && warTrigger ? (_jsxs("div", { className: "briefing-urgent alert", children: [_jsx("strong", { children: "War powers decision required" }), _jsx("p", { children: "Invoke war powers or seek Assembly authorization." }), _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("executive"), children: "Government \u2192" }), _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("foreign"), children: "Foreign Affairs \u2192" })] })] })) : null, !hasActionRequired ? (_jsx("div", { className: "home-calm-state", children: _jsx("p", { className: "muted", children: "Nothing currently requires your immediate action. Review government context and recent news." }) })) : null] }), _jsxs("section", { className: "home-section", children: [_jsx(ObjectLead, { kicker: "Institutions", title: "Government and Party", meta: "Coalition, agenda, and political machine", trailing: _jsxs("div", { className: "row", children: [_jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("executive"), children: "Government \u2192" }), _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("party"), children: "Party \u2192" })] }) }), _jsxs("dl", { className: "dossier-facts compact home-institution-facts", children: [agendaActive.length ? (_jsxs("div", { children: [_jsx("dt", { children: "Agenda" }), _jsx("dd", { children: agendaActive.map((i) => i.title.replace(/^[^:]+:\s*/, "")).join(" · ") })] })) : governing?.fiscal?.lastUpdated ? (_jsxs("div", { children: [_jsx("dt", { children: "Fiscal" }), _jsxs("dd", { children: ["FY", governing.fiscal.fiscalYear, " \u00B7 bal ", governing.fiscal.balance.toFixed(0), " \u00B7 debt ", governing.fiscal.debt.toFixed(0)] })] })) : (_jsxs("div", { children: [_jsx("dt", { children: "Government" }), _jsx("dd", { className: "muted", children: "No active agenda items this turn" })] })), coalition ? (_jsxs("div", { children: [_jsx("dt", { children: "Coalition" }), _jsx("dd", { children: coalition.partyIds
                                                    .map((id) => partyDisplayName(props.world, id, props.snap))
                                                    .join(" · ") })] })) : (_jsxs("div", { children: [_jsx("dt", { children: "Party" }), _jsx("dd", { children: partyLabel })] })), openLeadership.length > 0 ? (_jsxs("div", { children: [_jsx("dt", { children: "Leadership contests" }), _jsx("dd", { children: openLeadership
                                                    .slice(0, 2)
                                                    .map((c) => partyDisplayName(props.world, c.partyId, props.snap))
                                                    .join(", ") })] })) : null, openSeats.length > 0 ? (_jsxs("div", { children: [_jsx("dt", { children: "Open seats" }), _jsxs("dd", { children: [openSeats.length, " contested or recruiting"] })] })) : null, _jsxs("div", { children: [_jsx("dt", { children: "Economy" }), _jsx("dd", { children: governorPublicEconomy?.summary ??
                                                    `${publicEconomy.growth.toFixed(1)}% annual output growth · ${publicEconomy.confidenceTrend.toLowerCase()} confidence` })] })] })] }), props.campaign ? (_jsxs("section", { className: "home-section", children: [_jsx(ObjectLead, { kicker: "Campaign", title: campaignTypeLabel(props.campaign.type), meta: props.campaign.electionId
                                    ? electionDisplayName(props.campaign.electionId)
                                    : "Active campaign", trailing: _jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("campaign"), children: "Campaign HQ \u2192" }) }), _jsx(BriefStrip, { "aria-label": "Campaign status", items: [
                                    {
                                        label: "Actions left",
                                        value: props.campaign.actionPointsRemaining,
                                    },
                                    {
                                        label: "Cash",
                                        value: Math.round(props.campaign.cashOnHand).toLocaleString(),
                                    },
                                    { label: "Standing", value: standingLabel },
                                ] })] })) : null, _jsxs("section", { className: "home-section", children: [_jsx(ObjectLead, { kicker: "Record", title: "Recent major news", meta: "Public developments this turn", trailing: _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("news"), children: "News desk \u2192" }) }), _jsx("div", { className: "lead-block", children: lead ? (_jsx(LeadStory, { kicker: "Lead story", headline: eventDisplay(props.catalog, props.world, props.snap, lead), date: lead.date })) : (_jsx(EmptyState, { children: "No major developments this month." })) }), feed.length > 0 ? (_jsx("div", { className: "home-change-feed", children: feed.map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })) : null, stories.length > 0 ? (_jsx("div", { className: "home-press-brief", children: stories.map((s) => (_jsx(NewsItem, { headline: s.headlineKey === "Political developments" ||
                                        s.headlineKey === "Political storm in Valen"
                                        ? mediaHeadlineForEvent(s.factEventType, s.framing)
                                        : s.headlineKey, outlet: props.world.mediaOutlets[s.outletId]?.name ?? "Press", date: s.date, category: s.category }, s.id))) })) : null] }), _jsxs("section", { className: "home-section", children: [_jsx(SectionDivider, { title: "What is next", hint: "Calendar and near-term political work" }), upcoming.length === 0 ? (_jsx(EmptyState, { children: "No pending elections on the near calendar." })) : (upcoming.map((el) => (_jsx("div", { className: "decision-row", children: _jsxs("div", { children: [_jsx("strong", { children: electionDisplayName(el.id) }), _jsx("div", { className: "muted", children: el.date })] }) }, el.id)))), upcoming.length > 0 ? (_jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("elections"), children: "Elections calendar \u2192" })) : null, playerIsMp && constituencyPressures.length ? (_jsxs("div", { className: "home-constituency-brief", children: [_jsx("p", { className: "muted", children: "Constituency pressures shaping local politics:" }), constituencyPressures.slice(0, 3).map((pressure) => (_jsx(EntityRow, { title: pressure.label, meta: pressure.detail, status: _jsx(StatusBadge, { tone: pressure.level === "urgent" ? "warn" : "idle", children: pressure.level === "urgent"
                                                ? "Urgent"
                                                : pressure.level === "important"
                                                    ? "Important"
                                                    : "Watch" }) }, pressure.kind)))] })) : null] })] }), rail: _jsxs(_Fragment, { children: [_jsxs("section", { className: "home-rail-block", children: [_jsx(SectionDivider, { title: "Your position" }), _jsxs("dl", { className: "dossier-facts compact home-position-facts", children: [_jsxs("div", { children: [_jsx("dt", { children: "Office" }), _jsx("dd", { children: props.offices[0] ?? "Private citizen" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Party" }), _jsx("dd", { children: partyLabel })] }), _jsxs("div", { children: [_jsx("dt", { children: "Standing" }), _jsx("dd", { children: standingLabel })] }), figure?.home || runtime?.homeProvinceId ? (_jsxs("div", { children: [_jsx("dt", { children: "Home" }), _jsx("dd", { children: figure?.home ??
                                                    props.catalog.places.get(runtime?.homeProvinceId ?? "")?.name ??
                                                    "—" })] })) : null] }), standingContext.length ? (_jsxs("div", { className: "home-standing-context", children: [_jsx("p", { className: "muted", children: "Recent public context for standing:" }), standingContext.map((event) => (_jsx(ActivityFeedItem, { date: event.date, text: eventDisplay(props.catalog, props.world, props.snap, event) }, event.id)))] })) : null] }), _jsxs("section", { className: "home-rail-block", children: [_jsx(SectionDivider, { title: "Shortcuts" }), _jsxs("div", { className: "home-context-links row", children: [_jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => go("executive"), children: "Government \u2192" }), _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("party"), children: "Party \u2192" }), _jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("assembly"), children: "Assembly \u2192" }), props.campaign ? (_jsx("button", { type: "button", className: "btn ghost btn-sm", onClick: () => go("campaign"), children: "Campaign \u2192" })) : null] }), polls[0] ? (_jsxs("p", { className: "muted", children: ["Latest poll ", polls[0].publicationDate, ":", " ", pollShareLine(props.catalog, props.world, props.snap, polls[0].firstPreference)] })) : null] })] }) }) }));
}
function Career(props) {
    const [tab, setTab] = useState("opportunities");
    const [raceGeography, setRaceGeography] = useState("");
    const [directoryQuery, setDirectoryQuery] = useState("");
    const [directorySelection, setDirectorySelection] = useState(props.snap.playerPoliticianId);
    const [directoryVoteFilter, setDirectoryVoteFilter] = useState("all");
    const [directoryParty, setDirectoryParty] = useState("all");
    const [directoryCaucus, setDirectoryCaucus] = useState("all");
    const [directoryProvince, setDirectoryProvince] = useState("all");
    const [directoryOffice, setDirectoryOffice] = useState("all");
    const [directoryPage, setDirectoryPage] = useState(0);
    const [comparisonIds, setComparisonIds] = useState([]);
    useEffect(() => {
        if (props.globalFocus?.kind !== "Politician")
            return;
        setDirectorySelection(props.globalFocus.id);
        setTab("directory");
    }, [props.globalFocus]);
    useEffect(() => {
        setDirectoryPage(0);
    }, [directoryQuery, directoryParty, directoryCaucus, directoryProvince, directoryOffice]);
    const figure = props.figures.get(props.snap.playerPoliticianId);
    const runtime = props.snap.politicians[props.snap.playerPoliticianId];
    const standingLabel = publicStandingLabel(props.world, props.snap, props.snap.playerPoliticianId);
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
        const ah = props.world.constituencyProvinceShares[a]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId])
            ? 1
            : 0;
        const bh = props.world.constituencyProvinceShares[b]?.some((share) => share.provinceId === props.world.politicianHomeProvince[playerId])
            ? 1
            : 0;
        return (bh - ah ||
            (props.world.constituencyElectorate[b]?.seats ?? 0) -
                (props.world.constituencyElectorate[a]?.seats ?? 0) ||
            a.localeCompare(b));
    });
    const chosenConstituency = raceGeography || eligibleConstituencies[0] || "";
    const gubernatorial = currentGubernatorialOpportunity(props.snap, props.world, playerId);
    const playerHome = runtime?.homeProvinceId ?? props.world.politicianHomeProvince[playerId] ?? null;
    const provincialAssemblyOpportunities = Object.values(props.snap.provincialRuntime.assemblyElections)
        .filter((election) => election.playerDecision == null &&
        election.status !== "resolved" &&
        election.provinceId === playerHome)
        .sort((a, b) => a.date.localeCompare(b.date));
    const presidential = Object.values(props.snap.elections)
        .filter((election) => election.type === "presidential" &&
        election.status !== "resolved" &&
        election.status !== "cancelled")
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
    return (_jsxs("div", { children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: props.snap.playerPoliticianId, office: props.offices[0] ?? "Private citizen", party: partyDisplayName(props.world, runtime?.partyId ?? null, props.snap), faction: factionDisplayName(props.world, runtime?.factionId ?? null), ...(figure?.home ? { home: figure.home } : {}), standing: `Public standing: ${standingLabel}`, ...((figure?.notes ?? figure?.display_summary)
                    ? { biography: figure?.notes ?? figure?.display_summary }
                    : runtime?.description
                        ? { biography: runtime.description }
                        : {}) }), _jsx(TabBar, { tabs: [
                    { id: "opportunities", label: "Political opportunities" },
                    { id: "overview", label: "Overview" },
                    { id: "career", label: "Career" },
                    { id: "positions", label: "Positions" },
                    { id: "record", label: "Public record" },
                    { id: "directory", label: "Politicians" },
                    {
                        id: "comparison",
                        label: `Compare${comparisonIds.length ? ` (${comparisonIds.length})` : ""}`,
                    },
                    { id: "figures", label: "Figures to watch" },
                ], value: tab, onChange: setTab }), tab === "opportunities" ? (_jsxs("div", { className: "opportunities-layout", children: [_jsxs("div", { className: "opportunities-intro", children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "Run for office" }), _jsx("h2", { children: "Political opportunities" })] }), _jsxs("p", { children: ["Only races for which ", politicianDisplayName(props.catalog, playerId), " is presently eligible are actionable. Public facts are shown; hidden support is not."] })] }), presidential ? (_jsxs("section", { className: "opportunity-row", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "National" }), _jsx("h3", { children: "President" }), _jsx("strong", { children: presidential.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsx("p", { children: presidentialEligibility?.eligible
                                            ? "Constitutionally eligible"
                                            : presidentialEligibility?.reasons.join(" · ") || "Not presently eligible" }), _jsxs("p", { className: "muted", children: ["Nomination: ", nomination?.status ?? "not open", " \u00B7 national constituency \u00B7 term incompatibilities apply on assumption."] })] }), _jsx("div", { className: "opportunity-action", children: presidentialEligibility?.eligible &&
                                    nomination &&
                                    ["open", "qualification"].includes(nomination.status) &&
                                    !nomination.entries[playerId] ? (_jsx("button", { className: "btn", onClick: () => run({
                                        type: "DECLARE_CAMPAIGN",
                                        politicianId: playerId,
                                        campaignType: "presidential_nomination",
                                        contestId: nomination.id,
                                    }), children: "Enter nomination" })) : nomination?.entries[playerId] ? (_jsx(StatusBadge, { tone: "ok", children: "Entered" })) : (_jsx(StatusBadge, { children: "Not yet open" })) })] })) : null, assemblyElection ? (_jsxs("section", { className: "opportunity-row opportunity-geographic", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "Constituency" }), _jsx("h3", { children: "National Assembly" }), _jsx("strong", { children: assemblyElection.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsxs("p", { children: [eligibleConstituencies.length
                                                ? `${eligibleConstituencies.length} eligible constituencies`
                                                : "No eligible constituency", " ", "\u00B7 filing ", assemblyCycle?.filingOpenDate, "\u2013", assemblyCycle?.filingDeadlineDate] }), assemblyCycle?.filingStatus === "open" && !assemblyDecision ? (_jsx("div", { className: "geography-choice-grid", role: "listbox", "aria-label": "Choose an Assembly constituency", children: eligibleConstituencies.map((id) => {
                                            const info = props.catalog.places.get(id);
                                            const parties = constituencySittingSeatBreakdown(props.world, props.snap, id);
                                            const selected = id === chosenConstituency;
                                            return (_jsxs("button", { type: "button", className: `geography-choice${selected ? " selected" : ""}`, onClick: () => setRaceGeography(id), children: [_jsx("strong", { children: info?.name ?? "Unknown constituency" }), _jsxs("span", { children: [info?.provinceName ?? "Terena", " \u00B7", " ", props.world.constituencyElectorate[id]?.seats ?? "?", " seats"] }), _jsx("span", { children: parties
                                                            .slice(0, 2)
                                                            .map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`)
                                                            .join(" · ") || "Open representation" })] }, id));
                                        }) })) : (_jsxs("p", { className: "muted", children: ["Filing status:", " ", assemblyDecision?.decision ?? assemblyCycle?.filingStatus ?? "planned"] }))] }), _jsx("div", { className: "opportunity-action", children: assemblyCycle?.filingStatus === "open" &&
                                    !assemblyDecision &&
                                    chosenConstituency ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => run({
                                                type: "FILE_ASSEMBLY_CANDIDACY",
                                                electionId: assemblyElection.id,
                                                constituencyId: chosenConstituency,
                                            }), children: "File candidacy" }), _jsx("button", { className: "btn secondary", onClick: () => run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: assemblyElection.id }), children: "Decline this cycle" })] })) : assemblyDecision?.decision === "filed" ? (_jsx(StatusBadge, { tone: "ok", children: "Filed" })) : assemblyDecision?.decision === "declined" ? (_jsx(StatusBadge, { children: "Declined" })) : (_jsx(StatusBadge, { children: "Filing not open" })) })] })) : null, gubernatorial.map((race) => {
                        const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
                        return (_jsxs("section", { className: "opportunity-row", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "Province" }), _jsxs("h3", { children: ["Governor of ", provinceName] }), _jsx("strong", { children: race.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsxs("p", { children: ["Resident and presently eligible \u00B7 incumbent", " ", race.incumbentId
                                                    ? politicianDisplayName(props.catalog, race.incumbentId)
                                                    : "none"] }), _jsxs("p", { className: "muted", children: ["Filing ", race.filingOpenDate, "\u2013", race.filingDeadlineDate, " \u00B7 province-wide plurality election."] })] }), _jsx("div", { className: "opportunity-action", children: race.status === "filing_open" ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => run({
                                                    type: "FILE_GUBERNATORIAL_CANDIDACY",
                                                    electionId: race.id,
                                                    provinceId: race.provinceId,
                                                }), children: "File candidacy" }), _jsx("button", { className: "btn secondary", onClick: () => run({ type: "DECLINE_GUBERNATORIAL_CANDIDACY", electionId: race.id }), children: "Decline this cycle" })] })) : (_jsxs(StatusBadge, { children: ["Opens ", race.filingOpenDate] })) })] }, race.id));
                    }), provincialAssemblyOpportunities.map((race) => {
                        const provinceName = props.catalog.places.get(race.provinceId)?.name ?? race.provinceId;
                        return (_jsxs("section", { className: "opportunity-row", children: [_jsxs("div", { className: "opportunity-office", children: [_jsx("span", { children: "Province" }), _jsxs("h3", { children: [provinceName, " Provincial Assembly"] }), _jsx("strong", { children: race.date })] }), _jsxs("div", { className: "opportunity-details", children: [_jsxs("p", { children: ["Province-wide proportional election \u00B7 chamber", " ", props.snap.provincialRuntime.assemblies[race.provinceId]?.seatCount ?? "—", " ", "seats"] }), _jsx("p", { className: "muted", children: "A provincial term can build a record for Governor or the National Assembly." })] }), _jsx("div", { className: "opportunity-action", children: race.status === "filing_open" ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => run({ type: "FILE_PROVINCIAL_ASSEMBLY_CANDIDACY", electionId: race.id }), children: "Join party list" }), _jsx("button", { className: "btn secondary", onClick: () => run({
                                                    type: "DECLINE_PROVINCIAL_ASSEMBLY_CANDIDACY",
                                                    electionId: race.id,
                                                }), children: "Decline this cycle" })] })) : (_jsx(StatusBadge, { children: "Opens five months before election" })) })] }, race.id));
                    }), !presidential &&
                        !assemblyElection &&
                        gubernatorial.length === 0 &&
                        provincialAssemblyOpportunities.length === 0 ? (_jsx(EmptyState, { children: "No modeled election opportunity is currently scheduled." })) : null] })) : null, tab === "overview" ? (_jsxs(SectionCard, { title: "Public biography", children: [_jsx("p", { children: figure?.notes ??
                            figure?.display_summary ??
                            runtime?.description ??
                            "No public biography on file." }), age != null ? _jsxs("p", { children: ["Age: ", age] }) : null] })) : null, tab === "career" ? (_jsxs(SectionCard, { title: "Offices", children: [terms.length === 0 ? _jsx(EmptyState, { children: "No office terms on file." }) : null, terms.map((t) => (_jsxs("div", { children: [props.world.offices[t.officeId]?.title ?? t.officeId, " \u00B7 ", t.status, " \u00B7 ", t.startDate, t.endDate ? ` – ${t.endDate}` : ""] }, t.id)))] })) : null, tab === "positions" ? (_jsxs(SectionCard, { title: "Public offices and campaign", children: [_jsx("p", { children: props.offices.join(", ") || "No current office" }), _jsx("p", { className: "muted", children: props.campaign ? "Campaign underway" : "Not currently campaigning" }), _jsx("p", { className: "muted", children: "Public associations: see Organizations for known contacts." })] })) : null, tab === "record" ? (_jsxs(SectionCard, { title: "Public history", children: [props.snap.history.filter((e) => e.visibility === "public" && e.actorIds.includes(props.snap.playerPoliticianId)).length === 0 ? (_jsx(EmptyState, { children: "No public career events are recorded yet." })) : null, [
                        ...new Set(props.snap.history
                            .filter((e) => e.visibility === "public" && e.actorIds.includes(props.snap.playerPoliticianId))
                            .map((e) => e.date.slice(0, 4))),
                    ]
                        .sort()
                        .reverse()
                        .map((year) => (_jsxs("section", { className: "profile-history-year", children: [_jsx("strong", { children: year }), _jsx("div", { children: props.snap.history
                                    .filter((e) => e.visibility === "public" &&
                                    e.actorIds.includes(props.snap.playerPoliticianId) &&
                                    e.date.startsWith(year))
                                    .slice()
                                    .reverse()
                                    .map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id))) })] }, year)))] })) : null, tab === "directory"
                ? (() => {
                    const PAGE_SIZE = 30;
                    const query = directoryQuery.trim().toLowerCase();
                    const rows = Object.values(props.snap.politicians)
                        .filter((politician) => politician.alive)
                        .filter((politician) => {
                        const name = politicianDisplayName(props.catalog, politician.id).toLowerCase();
                        const party = partyDisplayName(props.world, politician.partyId, props.snap).toLowerCase();
                        return !query || name.includes(query) || party.includes(query);
                    })
                        .filter((politician) => directoryParty === "all" || politician.partyId === directoryParty)
                        .filter((politician) => directoryCaucus === "all" || politician.factionId === directoryCaucus)
                        .filter((politician) => directoryProvince === "all" ||
                        (politician.homeProvinceId ??
                            props.world.politicianHomeProvince[politician.id]) === directoryProvince)
                        .filter((politician) => {
                        if (directoryOffice === "all")
                            return true;
                        if (directoryOffice === "party_leader")
                            return Object.values(props.snap.partyStates).some((party) => party.leaderId === politician.id);
                        if (directoryOffice === "caucus_leader")
                            return Object.values(props.snap.factionStates).some((caucus) => caucus.chairId === politician.id);
                        return Object.values(props.snap.officeTerms).some((term) => term.holderId === politician.id &&
                            term.status === "active" &&
                            props.world.offices[term.officeId]?.kind === directoryOffice);
                    })
                        .sort((a, b) => politicianDisplayName(props.catalog, a.id).localeCompare(politicianDisplayName(props.catalog, b.id)));
                    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
                    const page = Math.min(directoryPage, pageCount - 1);
                    const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                    const selected = props.snap.politicians[directorySelection] ?? rows[0];
                    const selectedTerms = selected
                        ? Object.values(props.snap.officeTerms).filter((term) => term.holderId === selected.id)
                        : [];
                    const selectedCommittees = selected
                        ? Object.values(props.snap.legislatureRuntime.committees).filter((committee) => committee.chairId === selected.id)
                        : [];
                    const selectedPartyLeadership = selected
                        ? Object.values(props.snap.partyStates).filter((party) => party.leaderId === selected.id)
                        : [];
                    const selectedCaucusLeadership = selected
                        ? Object.values(props.snap.factionStates).filter((caucus) => caucus.chairId === selected.id)
                        : [];
                    const selectedEndorsements = selected
                        ? Object.values(props.snap.endorsements)
                            .filter((endorsement) => endorsement.public &&
                            (endorsement.targetId === selected.id ||
                                (endorsement.endorserType === "politician" &&
                                    endorsement.endorserId === selected.id)))
                            .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                            .slice(0, 10)
                        : [];
                    const selectedOrganizationEndorsements = selected
                        ? Object.entries(props.snap.organizationRuntime.actors)
                            .flatMap(([organizationId, actor]) => actor.endorsements
                            .filter((endorsement) => endorsement.public && endorsement.politicianId === selected.id)
                            .map((endorsement) => ({ organizationId, endorsement })))
                            .sort((a, b) => b.endorsement.date.localeCompare(a.endorsement.date) ||
                            a.organizationId.localeCompare(b.organizationId))
                            .slice(0, 10)
                        : [];
                    const selectedVotes = selected
                        ? Object.values(props.snap.legislatureRuntime.legislativeVotes)
                            .filter((vote) => vote.votes[selected.id])
                            .filter((vote) => directoryVoteFilter === "all" ||
                            vote.votes[selected.id] === directoryVoteFilter)
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .slice(0, 40)
                        : [];
                    return (_jsx(WorkLayout, { main: _jsxs(_Fragment, { children: [_jsx("input", { "aria-label": "Search politicians", placeholder: "Search name or party", value: directoryQuery, onChange: (event) => setDirectoryQuery(event.target.value) }), _jsxs("div", { className: "directory-filters", children: [_jsxs("label", { className: "field-label", children: ["Party", _jsxs("select", { value: directoryParty, onChange: (event) => setDirectoryParty(event.target.value), children: [_jsx("option", { value: "all", children: "All parties" }), Object.keys(props.world.partyDefinitions)
                                                            .filter((partyId) => partyId !== props.world.independentAggregatePartyId)
                                                            .sort()
                                                            .map((partyId) => (_jsx("option", { value: partyId, children: partyDisplayName(props.world, partyId, props.snap) }, partyId)))] })] }), _jsxs("label", { className: "field-label", children: ["Caucus", _jsxs("select", { value: directoryCaucus, onChange: (event) => setDirectoryCaucus(event.target.value), children: [_jsx("option", { value: "all", children: "All caucuses" }), Object.entries(props.world.factionDefinitions)
                                                            .sort((a, b) => a[1].name.localeCompare(b[1].name))
                                                            .map(([caucusId, caucus]) => (_jsx("option", { value: caucusId, children: caucus.name }, caucusId)))] })] }), _jsxs("label", { className: "field-label", children: ["Province", _jsxs("select", { value: directoryProvince, onChange: (event) => setDirectoryProvince(event.target.value), children: [_jsx("option", { value: "all", children: "All provinces" }), props.world.provinceIds
                                                            .slice()
                                                            .sort((a, b) => (props.catalog.places.get(a)?.name ?? a).localeCompare(props.catalog.places.get(b)?.name ?? b))
                                                            .map((provinceId) => (_jsx("option", { value: provinceId, children: props.catalog.places.get(provinceId)?.name ?? "Province" }, provinceId)))] })] }), _jsxs("label", { className: "field-label", children: ["Office", _jsxs("select", { value: directoryOffice, onChange: (event) => setDirectoryOffice(event.target.value), children: [_jsx("option", { value: "all", children: "All offices" }), _jsx("option", { value: "assembly_member", children: "National Assembly" }), _jsx("option", { value: "governor", children: "Governor" }), _jsx("option", { value: "minister", children: "Minister" }), _jsx("option", { value: "mayor", children: "Mayor" }), _jsx("option", { value: "constitutional_court_justice", children: "Justice" }), _jsx("option", { value: "party_leader", children: "Party leader" }), _jsx("option", { value: "caucus_leader", children: "Caucus chair" })] })] })] }), _jsxs("div", { className: "directory-count-row", children: [_jsxs("p", { className: "muted", children: [rows.length, " matching public figures \u00B7 ", PAGE_SIZE, " per page"] }), comparisonIds.length >= 2 ? (_jsxs("button", { type: "button", className: "btn btn-sm secondary", onClick: () => setTab("comparison"), children: ["Compare selected (", comparisonIds.length, ")"] })) : null] }), _jsx("div", { className: "entity-list politician-directory-list", children: visibleRows.map((politician) => (_jsxs("div", { className: "politician-directory-row", children: [_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: politician.id, compact: true, selected: politician.id === selected?.id, onSelect: () => setDirectorySelection(politician.id) }), _jsx("button", { type: "button", className: `compare-toggle${comparisonIds.includes(politician.id) ? " selected" : ""}`, "aria-pressed": comparisonIds.includes(politician.id), disabled: !comparisonIds.includes(politician.id) && comparisonIds.length >= 3, onClick: () => setComparisonIds((ids) => ids.includes(politician.id)
                                                    ? ids.filter((id) => id !== politician.id)
                                                    : [...ids, politician.id].slice(0, 3)), children: comparisonIds.includes(politician.id) ? "Comparing" : "Compare" })] }, politician.id))) }), pageCount > 1 ? (_jsxs("div", { className: "pager", children: [_jsx("button", { type: "button", className: "btn secondary", disabled: page === 0, onClick: () => setDirectoryPage(page - 1), children: "Previous" }), _jsxs("span", { className: "muted", children: ["Page ", page + 1, " of ", pageCount] }), _jsx("button", { type: "button", className: "btn secondary", disabled: page >= pageCount - 1, onClick: () => setDirectoryPage(page + 1), children: "Next" })] })) : null] }), rail: selected ? (_jsxs(_Fragment, { children: [_jsx(PoliticianProfile, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: selected.id, party: partyDisplayName(props.world, selected.partyId, props.snap), ...(selected.description ? { biography: selected.description } : {}) }), _jsx(SectionDivider, { title: "Office history" }), selectedTerms.length === 0 ? (_jsx(EmptyState, { children: "No public office on file." })) : (selectedTerms
                                    .slice()
                                    .reverse()
                                    .map((term) => (_jsxs("div", { className: "muted", children: [props.world.offices[term.officeId]?.title ?? "Public office", " \u00B7", " ", term.startDate ?? "date unknown", " \u00B7 ", term.status] }, term.id)))), _jsx(SectionDivider, { title: "Institutional roles" }), selectedCommittees.length +
                                    selectedPartyLeadership.length +
                                    selectedCaucusLeadership.length ===
                                    0 ? (_jsx(EmptyState, { children: "No current public leadership role." })) : (_jsxs(_Fragment, { children: [selectedCommittees.map((committee) => (_jsxs("div", { className: "muted", children: ["Chair \u00B7 ", committeeDisplayName(committee.id)] }, committee.id))), selectedPartyLeadership.map((party) => (_jsxs("div", { className: "muted", children: ["Leader \u00B7 ", partyDisplayName(props.world, party.partyId, props.snap)] }, party.partyId))), selectedCaucusLeadership.map((caucus) => (_jsxs("div", { className: "muted", children: ["Chair \u00B7 ", factionDisplayName(props.world, caucus.factionId)] }, caucus.factionId)))] })), _jsx(SectionDivider, { title: "Public endorsements" }), selectedEndorsements.length + selectedOrganizationEndorsements.length ===
                                    0 ? (_jsx(EmptyState, { children: "No public endorsement is recorded." })) : (_jsxs(_Fragment, { children: [selectedEndorsements.map((endorsement) => {
                                            const giving = endorsement.endorserType === "politician" &&
                                                endorsement.endorserId === selected.id;
                                            const other = giving
                                                ? politicianDisplayName(props.catalog, endorsement.targetId)
                                                : endorsement.endorserType === "politician"
                                                    ? politicianDisplayName(props.catalog, endorsement.endorserId)
                                                    : endorsement.endorserType === "faction"
                                                        ? factionDisplayName(props.world, endorsement.endorserId)
                                                        : `${props.catalog.places.get(props.world.provincialPartyOrganizations[endorsement.endorserId]?.provinceId ?? "")?.name ?? "Provincial"} party organization`;
                                            return (_jsx(EntityRow, { title: giving ? `Endorsed ${other}` : `Endorsed by ${other}`, meta: `${contestDisplayName(props.snap, props.world, endorsement.contestId)} · ${endorsement.date}`, status: _jsx(StatusBadge, { tone: endorsement.status === "active" ? "ok" : "idle", children: endorsement.status === "active"
                                                        ? "Current"
                                                        : endorsement.status[0].toUpperCase() +
                                                            endorsement.status.slice(1) }) }, endorsement.id));
                                        }), selectedOrganizationEndorsements.map(({ organizationId, endorsement }, index) => {
                                            const campaign = endorsement.campaignId
                                                ? props.snap.campaignRuntime.campaigns[endorsement.campaignId]
                                                : null;
                                            return (_jsx(EntityRow, { title: `Endorsed by ${props.world.interestOrganizations[organizationId]?.name ?? "Public organization"}`, meta: `${campaign ? campaignTypeLabel(campaign.type) : "Political campaign"} · ${endorsement.date}${endorsement.withdrawnDate ? ` · withdrawn ${endorsement.withdrawnDate}` : ""}`, status: _jsx(StatusBadge, { tone: (endorsement.status ?? "active") === "active"
                                                        ? "ok"
                                                        : "idle", children: (endorsement.status ?? "active") === "active"
                                                        ? "Current"
                                                        : "Withdrawn" }) }, `${organizationId}:${endorsement.campaignId ?? "campaign"}:${index}`));
                                        })] })), _jsx(SectionDivider, { title: "Recent Assembly votes" }), _jsx("div", { className: "map-scale-switch", "aria-label": "Filter politician voting record", children: ["all", "yes", "no", "abstain"].map((choice) => (_jsx("button", { type: "button", className: directoryVoteFilter === choice ? "active" : "", onClick: () => setDirectoryVoteFilter(choice), children: choice === "yes"
                                            ? "Aye"
                                            : choice === "no"
                                                ? "Nay"
                                                : choice[0].toUpperCase() + choice.slice(1) }, choice))) }), selectedVotes.length === 0 ? (_jsx(EmptyState, { children: "No recorded federal roll call matches this filter." })) : (_jsx(DataTable, { dense: true, headers: ["Date", "Measure", "Vote", "Party", "Caucus"], children: selectedVotes.map((vote) => {
                                        const bill = props.snap.legislatureRuntime.bills[vote.billId];
                                        const choice = vote.votes[selected.id];
                                        const partyId = vote.partyIdsAtVote?.[selected.id];
                                        const recommendation = partyId
                                            ? (props.snap.legislatureRuntime.partyRecommendations[`${partyId}:${vote.billId}`]?.stance ?? "free_vote")
                                            : "free_vote";
                                        const followed = recommendation === "free_vote"
                                            ? "Free vote"
                                            : recommendation === "support"
                                                ? choice === "yes"
                                                    ? "Followed party"
                                                    : "Broke with party"
                                                : choice === "no"
                                                    ? "Followed party"
                                                    : "Broke with party";
                                        const factionId = vote.factionIdsAtVote?.[selected.id];
                                        const caucusRecommendation = factionId
                                            ? (props.snap.legislatureRuntime.factionRecommendations[`${factionId}:${vote.billId}`]?.stance ?? "free_vote")
                                            : "free_vote";
                                        const caucusFollowed = caucusRecommendation === "free_vote"
                                            ? "Free vote"
                                            : caucusRecommendation === "support"
                                                ? choice === "yes"
                                                    ? "Followed caucus"
                                                    : "Broke with caucus"
                                                : choice === "no"
                                                    ? "Followed caucus"
                                                    : "Broke with caucus";
                                        return (_jsxs("tr", { children: [_jsx("td", { children: vote.date }), _jsx("td", { children: bill?.title ?? "Assembly matter" }), _jsx("td", { children: choice === "yes" ? "Aye" : choice === "no" ? "Nay" : "Abstain" }), _jsx("td", { children: followed }), _jsx("td", { children: caucusFollowed })] }, vote.id));
                                    }) })), _jsx(SectionDivider, { title: "Recent public history" }), props.snap.history
                                    .filter((event) => event.visibility === "public" && event.actorIds.includes(selected.id))
                                    .slice(-8)
                                    .reverse()
                                    .map((event) => (_jsx(ActivityFeedItem, { date: event.date, text: eventDisplay(props.catalog, props.world, props.snap, event) }, event.id))), props.snap.history.filter((event) => event.visibility === "public" && event.actorIds.includes(selected.id)).length === 0 ? (_jsx(EmptyState, { children: "No public career event is recorded." })) : null] })) : (_jsx(EmptyState, { children: "Select a politician." })) }));
                })()
                : null, tab === "comparison"
                ? (() => {
                    const selected = comparisonIds
                        .map((id) => props.snap.politicians[id])
                        .filter((row) => Boolean(row));
                    const activeOffice = (id) => Object.values(props.snap.officeTerms)
                        .filter((term) => term.holderId === id &&
                        (term.status === "active" || term.status === "suspended"))
                        .map((term) => props.world.offices[term.officeId]?.title)
                        .filter(Boolean)
                        .join(", ") || "Private citizen";
                    const publicAge = (id) => {
                        const birthDate = props.figures.get(id)?.birth_date ??
                            props.snap.generatedAgentProfiles[id]?.birthDate;
                        if (!birthDate)
                            return "Not published";
                        const today = props.snap.currentDate;
                        const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
                        return String(years - (today.slice(5) < birthDate.slice(5) ? 1 : 0));
                    };
                    const electionRecord = (id) => {
                        let wins = 0;
                        let races = 0;
                        for (const election of Object.values(props.snap.elections)) {
                            if (election.candidates[id] || election.assembly?.candidacies[id])
                                races += 1;
                            if (election.winnerIds.includes(id))
                                wins += 1;
                        }
                        for (const election of Object.values(props.snap.provincialRuntime.elections)) {
                            if (election.candidates[id])
                                races += 1;
                            if (election.winnerId === id)
                                wins += 1;
                        }
                        return races ? `${wins} wins in ${races} recorded races` : "No recorded election";
                    };
                    const leadership = (id) => {
                        const roles = [
                            ...Object.values(props.snap.partyStates)
                                .filter((party) => party.leaderId === id)
                                .map((party) => `${partyDisplayName(props.world, party.partyId, props.snap)} leader`),
                            ...Object.values(props.snap.factionStates)
                                .filter((caucus) => caucus.chairId === id)
                                .map((caucus) => `${factionDisplayName(props.world, caucus.factionId)} chair`),
                            ...Object.values(props.snap.legislatureRuntime.committees)
                                .filter((committee) => committee.chairId === id)
                                .map((committee) => `${committeeDisplayName(committee.id)} chair`),
                        ];
                        return roles.join(", ") || "No current leadership post";
                    };
                    const voteSummary = (id) => {
                        const choices = Object.values(props.snap.legislatureRuntime.legislativeVotes)
                            .map((vote) => vote.votes[id])
                            .filter(Boolean);
                        if (!choices.length)
                            return "No federal roll-call record";
                        return `${choices.filter((choice) => choice === "yes").length} aye · ${choices.filter((choice) => choice === "no").length} nay · ${choices.filter((choice) => choice === "abstain").length} abstain`;
                    };
                    const career = (id) => {
                        const terms = Object.values(props.snap.officeTerms).filter((term) => term.holderId === id);
                        return terms.length
                            ? [
                                ...new Set(terms.map((term) => props.world.offices[term.officeId]?.title ?? "Public office")),
                            ].join(", ")
                            : "No public office";
                    };
                    const rows = [
                        ["Age", publicAge],
                        ["Current office", activeOffice],
                        [
                            "Party",
                            (id) => partyDisplayName(props.world, props.snap.politicians[id]?.partyId ?? null, props.snap),
                        ],
                        [
                            "Caucus",
                            (id) => factionDisplayName(props.world, props.snap.politicians[id]?.factionId ?? null),
                        ],
                        [
                            "Province",
                            (id) => props.catalog.places.get(props.snap.politicians[id]?.homeProvinceId ??
                                props.world.politicianHomeProvince[id] ??
                                "")?.name ?? "Not published",
                        ],
                        ["Public standing", (id) => publicStandingLabel(props.world, props.snap, id)],
                        ["Career", career],
                        ["Election record", electionRecord],
                        ["Leadership", leadership],
                        ["Voting record", voteSummary],
                    ];
                    return (_jsxs("div", { className: "politician-comparison", children: [_jsx(PageHeader, { kicker: "Public record", title: "Compare politicians", subtitle: "Public offices, affiliations, standing, elections, leadership, and roll calls. Hidden personality and strategy are not shown." }), selected.length < 2 ? (_jsx(EmptyState, { children: "Select two or three politicians from the directory to compare." })) : (_jsx(DataTable, { headers: [
                                    "Public fact",
                                    ...selected.map((politician) => politicianDisplayName(props.catalog, politician.id)),
                                ], children: _jsx(_Fragment, { children: rows.map(([label, value]) => (_jsxs("tr", { children: [_jsx("th", { scope: "row", children: label }), selected.map((politician) => (_jsx("td", { children: value(politician.id) }, politician.id)))] }, label))) }) })), selected.length ? (_jsx("div", { className: "button-row", children: selected.map((politician) => (_jsxs("button", { type: "button", className: "btn btn-sm secondary", onClick: () => setComparisonIds((ids) => ids.filter((id) => id !== politician.id)), children: ["Remove ", politicianDisplayName(props.catalog, politician.id)] }, politician.id))) })) : null] }));
                })()
                : null, tab === "figures"
                ? (() => {
                    const activeKind = (id, kind) => Object.values(props.snap.officeTerms).some((term) => term.holderId === id &&
                        (term.status === "active" || term.status === "suspended") &&
                        props.world.offices[term.officeId]?.kind === kind);
                    const publicAchievementScore = (id) => {
                        const standing = publicStandingLabel(props.world, props.snap, id);
                        const standingScore = standing === "National figure"
                            ? 6
                            : standing === "Prominent"
                                ? 4
                                : standing === "Established"
                                    ? 2
                                    : 0;
                        const terms = Object.values(props.snap.officeTerms).filter((term) => term.holderId === id).length;
                        const leadership = Object.values(props.snap.partyStates).some((party) => party.leaderId === id) ||
                            Object.values(props.snap.factionStates).some((caucus) => caucus.chairId === id)
                            ? 4
                            : 0;
                        const legislation = Object.values(props.snap.legislatureRuntime.bills).filter((bill) => bill.sponsorId === id || bill.cosponsorIds.includes(id)).length;
                        const wins = Object.values(props.snap.elections).filter((election) => election.winnerIds.includes(id)).length +
                            Object.values(props.snap.provincialRuntime.elections).filter((election) => election.winnerId === id).length;
                        return (standingScore +
                            Math.min(5, terms) +
                            leadership +
                            Math.min(4, legislation) +
                            Math.min(5, wins));
                    };
                    const ranked = (ids) => ids
                        .filter((id) => props.snap.politicians[id]?.alive && !props.snap.politicians[id]?.retired)
                        .sort((a, b) => publicAchievementScore(b) - publicAchievementScore(a) ||
                        politicianDisplayName(props.catalog, a).localeCompare(politicianDisplayName(props.catalog, b)))
                        .slice(0, 8);
                    const allIds = Object.keys(props.snap.politicians);
                    const provincialLeaders = new Set();
                    for (const assembly of Object.values(props.snap.provincialRuntime.assemblies)) {
                        if (assembly.presidingOfficerId)
                            provincialLeaders.add(assembly.presidingOfficerId);
                        for (const leadership of Object.values(assembly.partyLeadership)) {
                            if (leadership.floorLeaderId)
                                provincialLeaders.add(leadership.floorLeaderId);
                            if (leadership.whipId)
                                provincialLeaders.add(leadership.whipId);
                        }
                    }
                    const groups = [
                        {
                            title: "Prominent Governors",
                            ids: ranked(allIds.filter((id) => activeKind(id, "governor"))),
                        },
                        {
                            title: "Senior legislators",
                            ids: ranked(allIds.filter((id) => activeKind(id, "assembly_member") || activeKind(id, "speaker"))),
                        },
                        { title: "Emerging provincial leaders", ids: ranked([...provincialLeaders]) },
                        {
                            title: "Major legal figures",
                            ids: ranked(allIds.filter((id) => activeKind(id, "constitutional_court_justice") ||
                                Object.values(props.snap.constitutionalRuntime.legalCareerPool).some((career) => career.fullPoliticianId === id))),
                        },
                    ];
                    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Political class", title: "Figures to watch", subtitle: "Contextual public prominence based on office, standing, electoral success, leadership, and legislative work\u2014not hidden potential." }), _jsx("div", { className: "figures-watch-grid", children: groups.map((group) => (_jsx(SectionCard, { title: group.title, children: group.ids.length === 0 ? (_jsx(EmptyState, { children: "No public figure currently qualifies." })) : (group.ids.map((id) => (_jsx(PoliticianCard, { catalog: props.catalog, world: props.world, state: props.snap, politicianId: id, compact: true, descriptor: publicStandingLabel(props.world, props.snap, id), onSelect: () => {
                                            setDirectorySelection(id);
                                            setTab("directory");
                                        } }, id)))) }, group.title))) })] }));
                })()
                : null] }));
}
function Terena(props) {
    const [mode, setMode] = useState("political");
    const [sel, setSel] = useState(null);
    const [hoverSel, setHoverSel] = useState(null);
    const [mapElectionId, setMapElectionId] = useState("");
    const [campaignMapScale, setCampaignMapScale] = useState("province");
    useEffect(() => {
        const focus = props.globalFocus;
        if (!focus || (focus.kind !== "Province" && focus.kind !== "Constituency"))
            return;
        const kind = focus.kind === "Province" ? "province" : "constituency";
        const place = props.catalog.places.get(focus.id);
        if (!place)
            return;
        setMode("political");
        setSel({ id: focus.id, kind, name: place.name });
        setHoverSel(null);
    }, [props.globalFocus, props.catalog]);
    const place = sel ? props.catalog.places.get(sel.id) : null;
    const electionChoices = [
        ...Object.values(props.snap.elections).map((election) => ({
            id: election.id,
            date: election.date,
            type: election.type,
            status: election.status,
            provinceId: null,
        })),
        ...Object.values(props.snap.provincialRuntime.elections).map((election) => ({
            id: election.id,
            date: election.date,
            type: "gubernatorial",
            status: election.status,
            provinceId: election.provinceId,
        })),
        ...Object.values(props.snap.provincialRuntime.assemblyElections).map((election) => ({
            id: election.id,
            date: election.date,
            type: "provincial_assembly",
            status: election.status,
            provinceId: election.provinceId,
        })),
    ].sort((a, b) => {
        const aa = a.status !== "resolved" && a.status !== "assumed" ? 1 : 0;
        const ba = b.status !== "resolved" && b.status !== "assumed" ? 1 : 0;
        return (ba - aa ||
            (aa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
            a.id.localeCompare(b.id));
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
    const regionPublicEcon = sel?.kind === "province" ? regionalPublicEconomy(props.snap, sel.id) : null;
    const tooltip = (selection) => {
        if (mode === "economy" && selection.kind === "province") {
            const data = regionalPublicEconomy(props.snap, selection.id);
            return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" \u00B7 ", data ? data.summary : "No regional series"] })] }));
        }
        if (mode === "campaign") {
            const value = selection.kind === "province"
                ? props.campaign?.organizationByProvince[selection.id]
                : selection.kind === "constituency"
                    ? props.campaign?.organizationByConstituency[selection.id]
                    : null;
            return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" ", "\u00B7", " ", value == null
                                ? "No active field operation"
                                : `Ground Game ${groundGameStrength(value)}/100`] })] }));
        }
        if (mode === "political" && selection.kind === "constituency") {
            const rows = constituencySittingSeatBreakdown(props.world, props.snap, selection.id);
            return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" ", "\u00B7", " ", rows
                                .map((row) => `${partyDisplayName(props.world, row.partyId, props.snap)} ${row.seats}`)
                                .join(" · ") || "No sitting members"] })] }));
        }
        if (mode === "election") {
            const national = activeMapElection ? props.snap.elections[activeMapElection.id] : null;
            const regional = activeMapElection
                ? props.snap.provincialRuntime.elections[activeMapElection.id]
                : null;
            const provincialAssembly = activeMapElection
                ? props.snap.provincialRuntime.assemblyElections[activeMapElection.id]
                : null;
            if (selection.kind === "constituency" &&
                national?.assembly?.constituencyResults[selection.id]) {
                const result = national.assembly.constituencyResults[selection.id];
                return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" ", "\u00B7 ", result.electedIds.length, " elected \u00B7 turnout", " ", (result.turnout.turnoutRate * 100).toFixed(0), "%"] })] }));
            }
            if (selection.kind === "province" && regional) {
                const race = Object.values(props.snap.provincialRuntime.elections).find((candidate) => candidate.provinceId === selection.id &&
                    candidate.date.slice(0, 4) === regional.date.slice(0, 4));
                if (race)
                    return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" ", "\u00B7", " ", race.winnerId
                                        ? `Winner ${politicianDisplayName(props.catalog, race.winnerId)}`
                                        : `${race.status.replace(/_/g, " ")} · ${Object.keys(race.candidates).length} candidates`] })] }));
            }
            if (selection.kind === "province" && provincialAssembly) {
                const race = Object.values(props.snap.provincialRuntime.assemblyElections).find((candidate) => candidate.provinceId === selection.id &&
                    candidate.date.slice(0, 4) === provincialAssembly.date.slice(0, 4));
                if (race) {
                    const leading = Object.entries(race.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
                    const tie = leading.length > 1 && leading[0][1] === leading[1][1];
                    return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsxs("span", { children: [" ", "\u00B7", " ", race.status === "resolved"
                                        ? `${tie ? "No single party plurality" : `${partyDisplayName(props.world, leading[0]?.[0] ?? null, props.snap)} leads`} · turnout ${race.turnoutRate == null ? "not recorded" : `${(race.turnoutRate * 100).toFixed(0)}%`}`
                                        : race.status.replace(/_/g, " ")] })] }));
                }
            }
            return (_jsxs(_Fragment, { children: [_jsx("strong", { children: selection.name }), _jsx("span", { children: " \u00B7 No published geographic result for this election." })] }));
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
                if (activeMapElection?.type === "gubernatorial" ||
                    activeMapElection?.type === "provincial_assembly")
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
                                if (next.type === "gubernatorial" || next.type === "provincial_assembly")
                                    return current.kind === "province" ? current : null;
                                return null;
                            });
                        }, children: electionChoices.map((election) => (_jsxs("option", { value: election.id, children: [election.provinceId
                                    ? `${props.catalog.places.get(election.provinceId)?.name ?? election.provinceId} · `
                                    : "", election.date.slice(0, 4), " \u00B7 ", election.type.replace(/_/g, " "), " \u00B7", " ", election.status.replace(/_/g, " ")] }, election.id))) })] })) : null, mode === "campaign" ? (_jsxs("div", { className: "map-scale-switch", "aria-label": "Campaign map scale", children: [_jsx("button", { type: "button", className: campaignMapScale === "province" ? "active" : "", onClick: () => {
                            setCampaignMapScale("province");
                            setSel(null);
                        }, children: "Provinces" }), _jsx("button", { type: "button", className: campaignMapScale === "constituency" ? "active" : "", onClick: () => {
                            setCampaignMapScale("constituency");
                            setSel(null);
                        }, children: "Constituencies" })] })) : null, _jsx(MapDetailLayout, { className: "terena-map-workspace", detailVisible: sel != null, map: _jsxs(_Fragment, { children: [_jsx(TerenaMap, { bundle: props.bundle, mode: mode, selectedId: sel?.id ?? null, showConstituencies: mode !== "economy" &&
                                !(mode === "election" && activeMapElection?.type !== "assembly") &&
                                !(mode === "campaign" && campaignMapScale === "province"), fillFor: (f, kind) => mapFillFor(mode, props.world, props.snap, f, kind, props.campaign?.organizationByConstituency, props.campaign?.organizationByProvince, activeMapElection?.id), onSelect: setSel, onHover: (selection) => {
                                setHoverSel(selection);
                                props.setMapHover(selection?.id ?? null);
                            }, tooltipFor: tooltip }), mode === "election" && activeMapElection?.type === "presidential" ? (_jsxs("div", { className: "map-legend", children: [_jsx("div", { className: "kicker", children: "Legend" }), _jsx("div", { className: "legend-items", children: _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "swatch", style: { background: "#d8d6cf" } }), "No public geographic data"] }) })] })) : (_jsx(MapLegend, { mode: mode, world: props.world }))] }), detail: _jsxs("div", { className: "compact-map-inspector", children: [_jsx(SectionDivider, { title: "Selection", hint: mode[0].toUpperCase() + mode.slice(1) }), sel ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: place?.name ?? sel.name }), _jsx("div", { className: "muted", children: sel.kind === "constituency"
                                        ? `${place?.seats ?? "?"} seats · ${sitting} sitting${place?.provinceName ? ` · ${place.provinceName}` : ""}`
                                        : sel.kind === "province"
                                            ? "Province"
                                            : "City · public geographic label" }), sel.kind === "province" ? (_jsxs("div", { className: "province-dossier-inline", children: [_jsxs("dl", { className: "dossier-facts compact", children: [(() => {
                                                    const gov = Object.values(props.snap.officeTerms).find((t) => t.status === "active" &&
                                                        props.world.offices[t.officeId]?.kind === "governor" &&
                                                        props.world.offices[t.officeId]?.provinceId === sel.id);
                                                    return (_jsxs("div", { children: [_jsx("dt", { children: "Governor" }), _jsx("dd", { children: gov ? politicianDisplayName(props.catalog, gov.holderId) : "Vacant" })] }));
                                                })(), regionPublicEcon ? (_jsxs("div", { children: [_jsx("dt", { children: "Economy" }), _jsx("dd", { children: regionPublicEcon.summary })] })) : null, (() => {
                                                    const asm = props.snap.provincialRuntime.assemblies[sel.id];
                                                    return asm ? (_jsxs("div", { children: [_jsx("dt", { children: "Provincial assembly" }), _jsxs("dd", { children: [asm.seatCount, " seats \u00B7 next election ", asm.nextElectionDate] })] })) : null;
                                                })(), (() => {
                                                    const recentProvElections = [
                                                        ...Object.values(props.snap.provincialRuntime.elections).filter((e) => e.provinceId === sel.id),
                                                        ...Object.values(props.snap.provincialRuntime.assemblyElections).filter((e) => e.provinceId === sel.id),
                                                    ]
                                                        .sort((a, b) => b.date.localeCompare(a.date))
                                                        .slice(0, 2);
                                                    return recentProvElections.length > 0 ? (_jsxs("div", { children: [_jsx("dt", { children: "Recent elections" }), _jsx("dd", { children: recentProvElections
                                                                    .map((e) => `${e.date} ${e.status.replace(/_/g, " ")}`)
                                                                    .join(" · ") })] })) : null;
                                                })(), (() => {
                                                    const pressureId = props.snap.provincialRuntime.provinces[sel.id]?.activePressureId;
                                                    return pressureId ? (_jsxs("div", { children: [_jsx("dt", { children: "Active pressure" }), _jsx("dd", { children: pressureId.replace(/_/g, " ") })] })) : null;
                                                })()] }), props.snap.history
                                            .filter((e) => e.visibility === "public" && e.entityIds.includes(sel.id))
                                            .slice(-3)
                                            .reverse().length > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "kicker", children: "Recent province news" }), props.snap.history
                                                    .filter((e) => e.visibility === "public" && e.entityIds.includes(sel.id))
                                                    .slice(-3)
                                                    .reverse()
                                                    .map((e) => (_jsx(ActivityFeedItem, { date: e.date, text: eventDisplay(props.catalog, props.world, props.snap, e) }, e.id)))] })) : null] })) : null, org != null ? _jsxs("div", { children: ["Your Ground Game: ", groundGameStrength(org), "/100"] }) : null, mode === "political" && sel.kind === "constituency"
                                    ? constituencySittingSeatBreakdown(props.world, props.snap, sel.id).map((row) => (_jsxs("div", { className: "muted", children: [partyDisplayName(props.world, row.partyId, props.snap), " \u00B7 ", row.seats, " ", "sitting seat", row.seats === 1 ? "" : "s"] }, row.partyId ?? "none")))
                                    : null, mode === "economy" && regionEcon ? _jsx("div", { children: regionPublicEcon?.summary }) : null, mode === "election" ? (_jsx("div", { className: "map-selection-mode", children: tooltip(sel) })) : null] })) : (_jsx(EmptyState, { children: mode === "election" && activeMapElection?.type === "presidential"
                                ? "This national presidential race has no public geographic result. Select another election for a geographic view."
                                : "Select a constituency, province, or city." }))] }) }), hoverSel && !sel ? (_jsxs("p", { className: "muted map-hover-note", children: ["Hovering ", hoverSel.name, "; click or tap to keep its details open."] })) : null] }));
}
/**
 * PHASE 11.5 MAP EXPERIMENT — Situation Room
 * A standalone map-centric screen. Revertible: remove this function,
 * the "situation" Screen union member, the route in GamePages,
 * the QA_SCREENS entry, and the NAV_GROUPS entry.
 */
function SituationRoom(props) {
    const [mode, setMode] = useState("political");
    const [sel, setSel] = useState(null);
    const provinceIds = props.world.provinceIds;
    const economy = sel?.kind === "province" ? regionalPublicEconomy(props.snap, sel.id) : null;
    const governor = sel?.kind === "province"
        ? Object.values(props.snap.officeTerms).find((t) => t.status === "active" &&
            props.world.offices[t.officeId]?.kind === "governor" &&
            props.world.offices[t.officeId]?.provinceId === sel.id)
        : null;
    const provAssembly = sel?.kind === "province" ? props.snap.provincialRuntime.assemblies[sel.id] : null;
    const partyControl = sel?.kind === "province"
        ? (() => {
            const members = Object.values(props.snap.officeTerms).filter((t) => t.status === "active" &&
                props.world.offices[t.officeId]?.kind === "assembly_member" &&
                (props.snap.politicians[t.holderId]?.homeProvinceId === sel.id ||
                    props.world.politicianHomeProvince[t.holderId] === sel.id));
            const counts = new Map();
            for (const t of members) {
                const party = props.snap.politicians[t.holderId]?.partyId ?? "independent";
                counts.set(party, (counts.get(party) ?? 0) + 1);
            }
            return [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([id, seats]) => `${partyDisplayName(props.world, id === "independent" ? null : id, props.snap)} ${seats}`);
        })()
        : [];
    return (_jsxs("div", { children: [_jsx(PageHeader, { kicker: "Situation room", title: "Terena at a glance", subtitle: "Map-centric overview \u2014 click a province for its dossier. This is an experimental view.", actions: _jsx("button", { type: "button", className: "btn secondary", onClick: () => props.onEntityNavigate?.("Province", provinceIds[0] ?? ""), children: "Full provinces \u2192" }) }), _jsx(TabBar, { tabs: [
                    { id: "political", label: "Political" },
                    { id: "economy", label: "Economy" },
                ], value: mode, onChange: setMode }), _jsx(MapDetailLayout, { className: "situation-room-workspace", detailVisible: true, map: _jsx(TerenaMap, { bundle: props.bundle, mode: mode, selectedId: sel?.id ?? null, fillFor: (feature, kind) => mapFillFor(mode, props.world, props.snap, feature, kind, props.campaign?.organizationByConstituency, props.campaign?.organizationByProvince), showConstituencies: false, onSelect: setSel, tooltipFor: (s) => _jsx("strong", { children: s.name }) }), detail: sel ? (_jsxs("div", { className: "situation-province-card", "data-qa": "situation-province-selected", children: [_jsx("h3", { children: sel.name }), mode === "political" ? (_jsx("p", { className: "muted situation-legend", children: "Political layer colors provinces by the sitting Governor's Party." })) : null, _jsxs("dl", { className: "dossier-facts compact", children: [_jsxs("div", { children: [_jsx("dt", { children: "Governor" }), _jsx("dd", { children: governor && props.onEntityNavigate ? (_jsx(EntityLink, { kind: "Politician", id: governor.holderId, label: politicianDisplayName(props.catalog, governor.holderId), onNavigate: props.onEntityNavigate })) : governor ? (politicianDisplayName(props.catalog, governor.holderId)) : ("Vacant") })] }), governor ? (_jsxs("div", { children: [_jsx("dt", { children: "Governor party" }), _jsx("dd", { children: (() => {
                                                const partyId = props.snap.politicians[governor.holderId]?.partyId ?? null;
                                                return props.onEntityNavigate && partyId ? (_jsx(EntityLink, { kind: "Party", id: partyId, label: partyDisplayName(props.world, partyId, props.snap), onNavigate: props.onEntityNavigate })) : (partyDisplayName(props.world, partyId, props.snap));
                                            })() })] })) : null, economy ? (_jsxs("div", { children: [_jsx("dt", { children: "Economy" }), _jsx("dd", { children: economy.summary })] })) : null, provAssembly ? (_jsxs("div", { children: [_jsx("dt", { children: "Provincial assembly" }), _jsxs("dd", { children: [provAssembly.seatCount, " seats"] })] })) : null, partyControl.length > 0 ? (_jsxs("div", { children: [_jsx("dt", { children: "MP representation" }), _jsx("dd", { children: partyControl.join(" · ") })] })) : null] }), _jsx("button", { type: "button", className: "btn secondary btn-sm", onClick: () => {
                                props.setGlobalFocus({ kind: "Province", id: sel.id });
                                props.onEntityNavigate?.("Province", sel.id);
                            }, children: "Open province dossier \u2192" })] })) : (_jsx("p", { className: "muted", "data-qa": "situation-province-empty", children: "Click a province on the map to view its dossier. Political coloring shows Governor Party control." })), legend: _jsx(MapLegend, { world: props.world, mode: mode }) })] }));
}
const ARCHIVE_PAGE_SIZE = 25;
function ArchivePager(props) {
    if (props.pageCount <= 1)
        return null;
    return (_jsxs("div", { className: "pager", children: [_jsx("button", { type: "button", className: "btn secondary", disabled: props.page <= 0, onClick: () => props.onChange(props.page - 1), children: "Previous" }), _jsxs("span", { className: "muted", children: ["Page ", props.page + 1, " of ", props.pageCount, " \u00B7 ", props.total, " records"] }), _jsx("button", { type: "button", className: "btn secondary", disabled: props.page >= props.pageCount - 1, onClick: () => props.onChange(props.page + 1), children: "Next" })] }));
}
function _Archive(props) {
    const [tab, setTab] = useState("elections");
    const [page, setPage] = useState(0);
    const laws = useMemo(() => Object.values(props.snap.legislatureRuntime.enactedLaws).sort((a, b) => (b.enactedDate ?? "") < (a.enactedDate ?? "") ? -1 : 1), [props.snap.legislatureRuntime.enactedLaws]);
    const elections = useMemo(() => {
        const national = Object.values(props.snap.elections)
            .filter((e) => e.status === "resolved")
            .map((e) => ({
            id: e.id,
            date: e.date,
            label: electionDisplayName(e.id),
            detail: e.type === "assembly"
                ? `${e.winnerIds.length} members elected`
                : `won by ${e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`,
        }));
        const gubernatorial = Object.values(props.snap.provincialRuntime.elections)
            .filter((e) => e.status === "resolved" || e.status === "assumed")
            .map((e) => ({
            id: e.id,
            date: e.date,
            label: `${props.catalog.places.get(e.provinceId)?.name ?? e.provinceId} gubernatorial`,
            detail: e.winnerId
                ? `won by ${politicianDisplayName(props.catalog, e.winnerId)}`
                : "result unavailable",
        }));
        return [...national, ...gubernatorial].sort((a, b) => (b.date < a.date ? -1 : 1));
    }, [props.catalog, props.snap.elections, props.snap.provincialRuntime.elections]);
    const administrations = useMemo(() => {
        const canonical = props.bundle.content.terena_presidential_administrations?.administrations?.map((a) => ({
            id: a.id,
            date: a.term_start,
            title: a.president_name,
            meta: `${partyDisplayName(props.world, a.party_id, props.snap)} · ${a.term_start} – ${a.term_end}${a.status ? ` · ${a.status}` : ""}`,
        })) ?? [];
        const assumptions = props.snap.history
            .filter((e) => e.type === "PRESIDENTIAL_ASSUMPTION" ||
            e.type === "ACTING_PRESIDENT_ASSUMED" ||
            e.type === "OFFICE_TERM_ENDED")
            .filter((e) => {
            if (e.type !== "OFFICE_TERM_ENDED")
                return true;
            const officeId = e.payload?.officeId;
            return officeId === "OFFICE_PRESIDENT" || officeId == null;
        })
            .map((e) => ({
            id: e.id,
            date: e.date,
            title: eventDisplay(props.catalog, props.world, props.snap, e),
            meta: e.date,
        }));
        const leadership = Object.values(props.snap.partyContests)
            .filter((c) => c.winnerId)
            .map((c) => ({
            id: c.id,
            date: c.resolvedDate ?? c.openedDate ?? c.createdDate ?? "",
            title: contestDisplayName(props.snap, props.world, c.id),
            meta: politicianDisplayName(props.catalog, c.winnerId),
        }));
        return [...canonical, ...assumptions, ...leadership].sort((a, b) => (b.date ?? "") < (a.date ?? "") ? -1 : 1);
    }, [props.bundle, props.catalog, props.snap, props.world]);
    const courtRows = useMemo(() => {
        const decisions = Object.values(props.snap.constitutionalRuntime.courtDecisions)
            .slice()
            .sort((a, b) => (b.decisionDate < a.decisionDate ? -1 : 1))
            .map((d) => {
            const courtCase = props.snap.constitutionalRuntime.courtCases[d.caseId];
            return {
                id: d.id,
                date: d.decisionDate,
                title: courtCase ? caseTitle(courtCase) : d.caseId,
                meta: `${d.disposition} · uphold ${d.uphold} · invalidate ${d.invalidate}`,
            };
        });
        const history = props.snap.history
            .filter((e) => e.type === "COURT_DECISION" || e.type === "COURT_VACANCY")
            .map((e) => ({
            id: e.id,
            date: e.date,
            title: eventDisplay(props.catalog, props.world, props.snap, e),
            meta: e.date,
        }));
        const seen = new Set(decisions.map((d) => d.id));
        return [...decisions, ...history.filter((h) => !seen.has(h.id))].sort((a, b) => b.date < a.date ? -1 : 1);
    }, [props.catalog, props.snap, props.world]);
    const foreign = props.snap.foreignAffairsRuntime;
    const foreignRows = useMemo(() => {
        const treaties = Object.values(foreign.treaties).map((t) => ({
            id: t.id,
            date: t.signedDate ?? "",
            title: t.title,
            meta: `${treatyTypeLabel(t.kind)} · ${treatyStatusLabel(t)}${t.signedDate ? ` · ${t.signedDate}` : ""}`,
        }));
        const crises = Object.values(foreign.crises).map((c) => ({
            id: c.id,
            date: c.startedDate,
            title: c.participantIds.map((id) => countryDisplayName(props.world, id)).join(" · "),
            meta: `${crisisStageLabel(c.stage)} · since ${c.startedDate}`,
        }));
        const conflicts = Object.values(foreign.conflicts).map((c) => ({
            id: c.id,
            date: c.startedDate ?? c.endedDate ?? "",
            title: c.belligerentIds.map((id) => countryDisplayName(props.world, id)).join(" vs "),
            meta: `${publicSeverityLabel(c.intensity, "conflict")}${c.endedDate ? ` · ended ${c.endedDate}` : " · ongoing"}`,
        }));
        const sanctions = Object.values(foreign.sanctions).map((s) => ({
            id: s.id,
            date: s.imposedDate,
            title: `${countryDisplayName(props.world, s.imposerId)} → ${countryDisplayName(props.world, s.targetId)}`,
            meta: `${s.active ? "active" : "lifted"} · ${s.imposedDate}`,
        }));
        const diplomatic = props.snap.history
            .filter((e) => {
            if (e.type === "TURN_COMPLETED")
                return false;
            return /DIPLOMATIC|SANCTION|TREATY|FOREIGN|CRISIS|TRADE|POSTURE|CONFLICT|ALLIANCE/i.test(e.type);
        })
            .map((e) => ({
            id: e.id,
            date: e.date,
            title: eventDisplay(props.catalog, props.world, props.snap, e),
            meta: e.date,
        }));
        return [...treaties, ...crises, ...conflicts, ...sanctions, ...diplomatic].sort((a, b) => (b.date ?? "") < (a.date ?? "") ? -1 : 1);
    }, [foreign, props.catalog, props.snap.history, props.world]);
    const economyRows = useMemo(() => {
        const shocks = props.snap.economyRuntime.shocks.map((s) => ({
            id: s.id,
            date: s.date,
            title: s.kind.replace(/_/g, " "),
            meta: `${s.date} · ${s.remainingMonths} months remain`,
        }));
        const history = props.snap.history
            .filter((e) => e.type === "ECONOMY_MONTH" ||
            e.type === "ECONOMY_SHOCK" ||
            /ECONOMY|FISCAL|BUDGET/i.test(e.type))
            .filter((e) => e.type !== "TURN_COMPLETED")
            .map((e) => ({
            id: e.id,
            date: e.date,
            title: eventDisplay(props.catalog, props.world, props.snap, e),
            meta: e.date,
        }));
        // Cap economy event noise: prefer named shocks, then recent public history
        return [...shocks, ...history].sort((a, b) => (b.date < a.date ? -1 : 1)).slice(0, 200);
    }, [props.catalog, props.snap, props.world]);
    const rowsForTab = tab === "elections"
        ? elections.map((e) => ({ id: e.id, date: e.date, title: e.label, meta: e.detail }))
        : tab === "administrations"
            ? administrations
            : tab === "legislation"
                ? laws.map((l) => ({
                    id: l.id,
                    date: l.enactedDate ?? "",
                    title: l.title,
                    meta: l.enactedDate ?? "",
                }))
                : tab === "courts"
                    ? courtRows
                    : tab === "foreign"
                        ? foreignRows
                        : economyRows;
    const pageCount = Math.max(1, Math.ceil(rowsForTab.length / ARCHIVE_PAGE_SIZE));
    const pageIndex = Math.min(page, pageCount - 1);
    const pageRows = rowsForTab.slice(pageIndex * ARCHIVE_PAGE_SIZE, pageIndex * ARCHIVE_PAGE_SIZE + ARCHIVE_PAGE_SIZE);
    return (_jsx(WorkLayout, { header: _jsx(PageHeader, { kicker: "History", title: "Archive", subtitle: "Sectioned public records \u2014 not an unbounded fifty-year feed." }), main: _jsxs(_Fragment, { children: [_jsx(TabBar, { tabs: [
                        { id: "elections", label: "Elections" },
                        { id: "administrations", label: "Administrations" },
                        { id: "legislation", label: "Legislation" },
                        { id: "courts", label: "Courts" },
                        { id: "foreign", label: "Foreign" },
                        { id: "economy", label: "Economy" },
                    ], value: tab, onChange: (id) => {
                        setTab(id);
                        setPage(0);
                    } }), _jsx(SectionDivider, { title: tab === "elections"
                        ? "Elections"
                        : tab === "administrations"
                            ? "Administrations"
                            : tab === "legislation"
                                ? "Legislation"
                                : tab === "courts"
                                    ? "Courts"
                                    : tab === "foreign"
                                        ? "Foreign"
                                        : "Economy", hint: rowsForTab.length === 0
                        ? "No records in this section yet."
                        : `${rowsForTab.length} record${rowsForTab.length === 1 ? "" : "s"}` }), pageRows.length === 0 ? _jsx(EmptyState, { children: "No records in this section yet." }) : null, tab === "legislation" || tab === "elections" ? (_jsx(DataTable, { dense: true, headers: ["Date", "Record", "Detail"], children: pageRows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: row.date || "—" }), _jsx("td", { children: row.title }), _jsx("td", { children: row.meta })] }, row.id))) })) : (pageRows.map((row) => (_jsx(EntityRow, { title: row.title, meta: row.meta, status: row.date || undefined }, row.id)))), _jsx(ArchivePager, { page: pageIndex, pageCount: pageCount, total: rowsForTab.length, onChange: setPage })] }) }));
}
//# sourceMappingURL=pages.js.map