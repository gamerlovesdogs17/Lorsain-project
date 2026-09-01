import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectPlayerActionableDecisions, addMonths, createSimulation, governedProvinceId, nominationCalendarDates, parseSaveFile, provincialLegislatorForPolitician, restoreSimulation, } from "@lorsain/sim";
import { loadBrowserContentBundle } from "./content/browserReader.js";
import { kernelWorldFromBundle } from "./content/world.js";
import { downloadSave, getSave, listSaves, putSave, readImportedSave, } from "./saves.js";
import { playerCampaign, playerOffices, politicianName, publicStandingLabel } from "./format.js";
import { GamePages } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
import { useCommandFeedback } from "./feedback.js";
import { catalogFromBundle, eventDisplay, partyColor, partyDisplayName, politicianDisplayName } from "./presentation.js";
import { GameShell } from "./ui/shell.js";
import { StatusBadge } from "./ui/kit.js";
import { PoliticianAvatar, PoliticianCard } from "./ui/politician.js";
const QA_SCREENS = new Set([
    "home", "career", "office", "assembly", "party", "campaign", "elections", "executive",
    "courts", "economy", "organizations", "news", "foreign", "terena", "archive",
]);
function monthsBetween(startDate, endDate) {
    return Math.max(0, (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
        Number(endDate.slice(5, 7)) -
        Number(startDate.slice(5, 7)));
}
function savedGamePoliticalSummary(world, row) {
    const state = row.save.simulation;
    const player = state.politicians[state.playerPoliticianId];
    const activeTerm = Object.values(state.officeTerms).find((term) => term.holderId === state.playerPoliticianId &&
        (term.status === "active" || term.status === "suspended"));
    const office = activeTerm ? world.offices[activeTerm.officeId] : null;
    const party = player?.partyId ? world.partyDefinitions[player.partyId] : null;
    const campaign = Object.values(state.campaignRuntime.campaigns).find((row) => row.politicianId === state.playerPoliticianId && row.status === "active");
    const context = state.pendingInterrupt?.code.includes("ELECTION")
        ? "Election decision awaiting resolution"
        : campaign
            ? "Active election campaign"
            : state.pendingInterrupt?.requiresResolution
                ? "Political decision awaiting resolution"
                : "Government and political calendar in progress";
    const playedMonths = monthsBetween(state.scenarioStartDate, state.currentDate);
    return {
        office: office?.title ?? "Private citizen",
        party: party?.name ?? "Independent",
        context,
        played: playedMonths < 12
            ? `${playedMonths} month${playedMonths === 1 ? "" : "s"} played`
            : `${Math.floor(playedMonths / 12)} year${Math.floor(playedMonths / 12) === 1 ? "" : "s"}, ${playedMonths % 12} months played`,
    };
}
function qaScreen(value) {
    return value != null && QA_SCREENS.has(value) ? value : "home";
}
export default function App() {
    const [bundle, setBundle] = useState(null);
    const [world, setWorld] = useState(null);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState("title");
    const [sim, setSim] = useState(null);
    const [snap, setSnap] = useState(null);
    const [screen, setScreen] = useState("home");
    const [busy, setBusy] = useState(false);
    const [busyLabel, setBusyLabel] = useState("Processing…");
    const busyRef = useRef(false);
    const [countingElection, setCountingElection] = useState(false);
    const [turnEvents, setTurnEvents] = useState([]);
    const [saves, setSaves] = useState([]);
    const [query, setQuery] = useState("");
    const [partyFilter, setPartyFilter] = useState("all");
    const [officeFilter, setOfficeFilter] = useState("all");
    const [provinceFilter, setProvinceFilter] = useState("all");
    const [browsePage, setBrowsePage] = useState(0);
    const [selectedBill, setSelectedBill] = useState(null);
    const [mapHover, setMapHover] = useState(null);
    const [debug, setDebug] = useState(false);
    const [globalFocus, setGlobalFocus] = useState(null);
    const [watchlist, setWatchlist] = useState(() => {
        if (typeof window === "undefined")
            return [];
        try {
            const raw = JSON.parse(window.localStorage.getItem("lorsain-watchlist") ?? "[]");
            return Array.isArray(raw) ? raw.filter((value) => typeof value === "string") : [];
        }
        catch {
            return [];
        }
    });
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const qaBooted = useRef(false);
    const feedback = useCommandFeedback();
    useEffect(() => {
        try {
            const loaded = loadBrowserContentBundle();
            setBundle(loaded);
            setWorld(kernelWorldFromBundle(loaded));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);
    useEffect(() => {
        if (!world)
            return;
        if (import.meta.env.DEV) {
            const fixture = new URLSearchParams(window.location.search).get("qaTitleFixture");
            if (fixture) {
                void fetch(`/__qa/fixtures/${encodeURIComponent(fixture)}.json`, { cache: "no-store" })
                    .then(async (response) => {
                    if (!response.ok)
                        throw new Error(`Browser QA fixture ${fixture} was not found.`);
                    return await response.json();
                })
                    .then((save) => {
                    const player = save.simulation.politicians[save.simulation.playerPoliticianId];
                    const figureName = bundle?.content.starting_figures.figures?.find((figure) => figure.id === save.simulation.playerPoliticianId)?.name;
                    setSaves([{ id: `qa-title:${fixture}`, name: `Career of ${figureName ?? player?.displayName ?? save.simulation.playerPoliticianId}`, savedAt: `${save.simulation.currentDate}T18:00:00.000Z`, playerName: figureName ?? player?.displayName ?? save.simulation.playerPoliticianId, date: save.simulation.currentDate, save }]);
                })
                    .catch(() => setSaves([]));
                return;
            }
        }
        void listSaves().then(setSaves).catch(() => setSaves([]));
    }, [bundle, world]);
    useEffect(() => {
        if (!import.meta.env.DEV || !world || qaBooted.current)
            return;
        const params = new URLSearchParams(window.location.search);
        const fixture = params.get("qaFixture");
        if (!fixture)
            return;
        qaBooted.current = true;
        void fetch(`/__qa/fixtures/${encodeURIComponent(fixture)}.json`, { cache: "no-store" })
            .then(async (response) => {
            if (!response.ok)
                throw new Error(`Browser QA fixture ${fixture} was not found.`);
            return await response.json();
        })
            .then((save) => {
            const playerId = params.get("qaPlayer");
            const prepared = playerId && save.simulation.politicians[playerId]
                ? { ...save, simulation: { ...save.simulation, playerPoliticianId: playerId } }
                : save;
            const parsed = parseSaveFile(prepared, world.contentVersion);
            if (!parsed.ok)
                throw new Error(parsed.error.message);
            const restored = restoreSimulation(parsed.save, world);
            const focusKind = params.get("qaFocusKind");
            const focusId = params.get("qaFocusId");
            setTurnEvents([]);
            setMode("play");
            setScreen(qaScreen(params.get("qaScreen")));
            if (focusKind && focusId) {
                setGlobalFocus({ kind: focusKind, id: focusId });
                if (focusKind === "Bill")
                    setSelectedBill(focusId);
            }
            refresh(restored);
        })
            .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, [world]);
    useEffect(() => {
        window.localStorage.setItem("lorsain-watchlist", JSON.stringify(watchlist));
    }, [watchlist]);
    useEffect(() => {
        if (!import.meta.env.DEV || !sim)
            return;
        const params = new URLSearchParams(window.location.search);
        if (!params.has("qaFixture"))
            return;
        params.set("qaScreen", screen);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, [screen, sim]);
    const figures = useMemo(() => {
        const map = new Map();
        for (const f of (bundle?.content.starting_figures.figures ?? []))
            map.set(f.id, f);
        return map;
    }, [bundle]);
    const catalog = useMemo(() => (bundle ? catalogFromBundle(bundle, figures, snap) : null), [bundle, figures, snap]);
    const searchEntries = useMemo(() => {
        if (!world || !snap || !catalog)
            return [];
        const pages = [
            ["home", "Home", "Current political briefing"], ["career", "Political opportunities", "Career and politician directory"],
            ["party", "Parties and caucuses", "Leadership and internal politics"], ["campaign", "Campaign", "Race command center and Ground Game"],
            ["elections", "Elections and calendar", "Presidential, Assembly and provincial races"], ["assembly", "National Assembly", "Bills, committees and roll calls"],
            ["executive", "Executive", "President, cabinet and administration"], ["courts", "Constitutional Court", "Bench, docket and decisions"],
            ["economy", "Economy", "Public national and regional indicators"], ["organizations", "Organizations", "Influence, priorities and scorecards"],
            ["foreign", "Foreign Affairs", "World relations and crises"], ["terena", "Maps", "Political, election and economic geography"],
            ["news", "News", "Political news desk"], ["archive", "History of Terena", "Political encyclopedia and election archive"],
        ];
        const entries = pages.map(([screen, label, detail]) => ({ id: screen, kind: "Page", label, detail, screen }));
        for (const politician of Object.values(snap.politicians)) {
            if (!politician.alive)
                continue;
            entries.push({ id: politician.id, kind: "Politician", label: politicianDisplayName(catalog, politician.id), detail: partyDisplayName(world, politician.partyId, snap), screen: "career" });
        }
        for (const partyId of Object.keys(world.partyDefinitions)) {
            if (partyId === world.independentAggregatePartyId)
                continue;
            entries.push({ id: partyId, kind: "Party", label: partyDisplayName(world, partyId, snap), detail: "Leadership, caucus and electoral record", screen: "party" });
        }
        for (const faction of Object.values(world.factionDefinitions)) {
            entries.push({ id: faction.factionId, kind: "Caucus", label: faction.name, detail: partyDisplayName(world, faction.partyId, snap), screen: "party" });
        }
        for (const provinceId of world.provinceIds) {
            entries.push({ id: provinceId, kind: "Province", label: catalog.places.get(provinceId)?.name ?? "Province", detail: "Governor, Assembly and regional statistics", screen: "terena" });
        }
        for (const constituencyId of Object.keys(world.constituencyElectorate).sort()) {
            const place = catalog.places.get(constituencyId);
            entries.push({
                id: constituencyId,
                kind: "Constituency",
                label: place?.name ?? "Constituency",
                detail: `${place?.provinceName ?? "Terena"} · ${world.constituencyElectorate[constituencyId]?.seats ?? "?"} Assembly seats`,
                screen: "terena",
            });
        }
        for (const organization of Object.values(world.interestOrganizations)) {
            entries.push({ id: organization.id, kind: "Organization", label: organization.name, detail: organization.type, screen: "organizations" });
        }
        for (const election of Object.values(snap.elections)) {
            entries.push({ id: election.id, kind: "Election", label: `${election.date.slice(0, 4)} ${election.type === "assembly" ? "National Assembly" : "presidential"} election`, detail: election.status.replace(/_/g, " "), screen: "elections" });
        }
        for (const election of Object.values(snap.provincialRuntime.elections)) {
            const province = catalog.places.get(election.provinceId)?.name ?? "Province";
            entries.push({ id: election.id, kind: "Election", label: `${election.date.slice(0, 4)} ${province} gubernatorial election`, detail: election.status.replace(/_/g, " "), screen: "elections" });
        }
        for (const election of Object.values(snap.provincialRuntime.assemblyElections)) {
            const province = catalog.places.get(election.provinceId)?.name ?? "Province";
            entries.push({ id: election.id, kind: "Election", label: `${election.date.slice(0, 4)} ${province} Assembly election`, detail: election.status.replace(/_/g, " "), screen: "elections" });
        }
        for (const bill of Object.values(snap.legislatureRuntime.bills)) {
            entries.push({ id: bill.id, kind: "Bill", label: bill.title, detail: bill.status.replace(/_/g, " "), screen: "assembly" });
        }
        for (const courtCase of Object.values(snap.constitutionalRuntime.courtCases)) {
            entries.push({ id: courtCase.id, kind: "Court case", label: courtCase.constitutionalQuestion, detail: courtCase.status.replace(/_/g, " "), screen: "courts" });
        }
        return entries;
    }, [world, snap, catalog]);
    function refresh(next) {
        setSim(next);
        setSnap(next.getSnapshot());
    }
    function selectSearchEntry(entry) {
        setGlobalFocus({ kind: entry.kind, id: entry.id });
        if (entry.kind === "Bill")
            setSelectedBill(entry.id);
        setScreen(entry.screen);
    }
    function startGame(politicianId) {
        if (!world)
            return;
        const created = createSimulation({
            world,
            playerPoliticianId: politicianId,
            seed: "TERENA-2028",
        });
        setTurnEvents([]);
        setScreen("home");
        setMode("play");
        refresh(created);
    }
    async function saveGame() {
        if (!sim || !snap)
            return;
        const savedAt = new Date().toISOString();
        await putSave({
            id: `${snap.playerPoliticianId}-${Date.now()}`,
            name: `${politicianName(figures, snap.playerPoliticianId, snap)} ${snap.currentDate}`,
            savedAt,
            playerName: politicianName(figures, snap.playerPoliticianId, snap),
            date: snap.currentDate,
            save: sim.serializeSave(),
        });
        setLastSavedAt(savedAt);
        setSaves(await listSaves());
    }
    async function checkpointAutosave(reason) {
        if (!sim || !snap)
            return;
        const savedAt = new Date().toISOString();
        await putSave({
            id: `autosave-${snap.playerPoliticianId}`,
            name: `Autosave · ${reason}`,
            savedAt,
            playerName: politicianName(figures, snap.playerPoliticianId, snap),
            date: snap.currentDate,
            save: sim.serializeSave(),
        });
        setLastSavedAt(savedAt);
    }
    function loadFile(save) {
        if (!world)
            return;
        const parsed = parseSaveFile(save, world.contentVersion);
        if (!parsed.ok) {
            setError(parsed.error.message);
            return;
        }
        const restored = restoreSimulation(parsed.save, world);
        setTurnEvents([]);
        setMode("play");
        setScreen("home");
        refresh(restored);
    }
    function replaceSimulation(save) {
        if (!world)
            return;
        const restored = restoreSimulation(save, world);
        refresh(restored);
    }
    async function resolveAssemblyElection() {
        if (!sim || !world || busy || countingElection)
            return;
        setCountingElection(true);
        try {
            await checkpointAutosave("before Assembly count");
        }
        catch {
            feedback.setNotice("The pre-count autosave could not be written. The count has not started.");
            setCountingElection(false);
            return;
        }
        const worker = new Worker(new URL("./electionWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event) => {
            worker.terminate();
            try {
                if (event.data.ok) {
                    feedback.report(event.data.result);
                    if (event.data.result.ok)
                        replaceSimulation(event.data.save);
                }
                else {
                    feedback.setNotice(event.data.message);
                }
            }
            catch (error) {
                feedback.setNotice(error instanceof Error ? error.message : "The Assembly count could not be restored.");
            }
            finally {
                setCountingElection(false);
            }
        };
        worker.onerror = (event) => {
            worker.terminate();
            feedback.setNotice(event.message || "The Assembly count could not be completed.");
            setCountingElection(false);
        };
        worker.postMessage({ save: sim.serializeSave(), world });
    }
    async function resolvePresidentialElection() {
        if (!sim || busyRef.current || countingElection)
            return;
        busyRef.current = true;
        setBusyLabel("Counting presidential ballots…");
        setBusy(true);
        const before = sim.getSnapshot().history.length;
        try {
            await checkpointAutosave("before presidential count");
        }
        catch {
            feedback.setNotice("The pre-count autosave could not be written. The count has not started.");
            busyRef.current = false;
            setBusy(false);
            return;
        }
        try {
            const result = sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
            feedback.report(result);
            if (result.ok) {
                const resumed = sim.executeCommand({ type: "RESUME_TURN" });
                if (!resumed.ok)
                    feedback.report(resumed);
                setTurnEvents(sim.getSnapshot().history.slice(before));
            }
            refresh(sim);
        }
        finally {
            busyRef.current = false;
            setBusy(false);
        }
    }
    async function endTurn() {
        if (!sim || !world || busyRef.current || countingElection)
            return;
        busyRef.current = true;
        const before = sim.getSnapshot().history.length;
        const nextMonth = addMonths(snap?.currentDate ?? sim.getSnapshot().currentDate, 1);
        const nominationDue = Object.values(sim.getSnapshot().partyContests).some((contest) => {
            if (contest.type !== "presidential_nomination")
                return false;
            if (contest.status === "resolved" || contest.status === "cancelled")
                return false;
            const electionDate = contest.metadata.electionDate;
            if (typeof electionDate !== "string")
                return false;
            return nominationCalendarDates(electionDate).resolve <= nextMonth;
        });
        setBusyLabel(nominationDue ? "Counting nominations…" : "Processing…");
        setBusy(true);
        try {
            await checkpointAutosave(nominationDue ? "before nomination count" : "before turn");
        }
        catch {
            feedback.setNotice("Autosave failed, so the turn was not advanced.");
            busyRef.current = false;
            setBusy(false);
            return;
        }
        const worker = new Worker(new URL("./turnWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event) => {
            worker.terminate();
            try {
                if (event.data.ok) {
                    const restored = restoreSimulation(event.data.save, world);
                    setTurnEvents(restored.getSnapshot().history.slice(before));
                    refresh(restored);
                    if (!event.data.result.ok)
                        feedback.setNotice(event.data.result.error.message);
                }
                else {
                    feedback.setNotice(event.data.message);
                }
            }
            catch (error) {
                feedback.setNotice(error instanceof Error ? error.message : "The turn could not be restored.");
            }
            finally {
                busyRef.current = false;
                setBusy(false);
            }
        };
        worker.onerror = (event) => {
            worker.terminate();
            feedback.setNotice(event.message || "The turn could not be completed.");
            busyRef.current = false;
            setBusy(false);
        };
        worker.postMessage({ save: sim.serializeSave(), world });
    }
    if (error) {
        return (_jsx("div", { className: "app-title", children: _jsxs("div", { className: "title-card", children: [_jsx("h1", { children: "Lorsain" }), _jsx("p", { children: error }), _jsx("button", { className: "btn", onClick: () => setError(null), children: "Back" })] }) }));
    }
    if (!world || !bundle) {
        return (_jsx("div", { className: "app-title", children: _jsxs("div", { className: "title-card", children: [_jsx("h1", { children: "Lorsain" }), _jsx("p", { children: "Loading Terena\u2026" })] }) }));
    }
    if (mode === "title") {
        const latest = saves[0] ?? null;
        const latestSummary = latest ? savedGamePoliticalSummary(world, latest) : null;
        return (_jsxs("div", { className: "political-title-screen", children: [_jsxs("section", { className: "title-masthead", "aria-labelledby": "lorsain-title", children: [_jsx("div", { className: "title-seal", "aria-hidden": "true", children: "L" }), _jsxs("div", { className: "title-wordmark", children: [_jsx("span", { children: "THE POLITICAL LIFE OF TERENA" }), _jsx("h1", { id: "lorsain-title", children: "LORSAIN" }), _jsx("p", { children: "Govern, legislate, campaign and build a public life in the Dual-Mandate Republic." })] }), _jsxs("div", { className: "title-founding-line", children: [_jsx("span", { children: "Republic founded 1971" }), _jsx("span", { children: "January 2028 scenario" })] })] }), _jsxs("section", { className: "title-political-desk", children: [latest && latestSummary ? (_jsxs("article", { className: "continue-dossier", children: [_jsx("div", { className: "kicker", children: "Continue political career" }), _jsxs("div", { className: "continue-dossier-head", children: [_jsxs("div", { children: [_jsx("h2", { children: latest.playerName }), _jsx("p", { children: latestSummary.office })] }), _jsx("time", { children: latest.date })] }), _jsxs("div", { className: "continue-party-line", children: [_jsx("span", { className: "continue-party-mark", style: { background: partyColor(world, latest.save.simulation.politicians[latest.save.simulation.playerPoliticianId]?.partyId ?? null) } }), _jsx("strong", { children: latestSummary.party })] }), _jsxs("dl", { className: "continue-dossier-facts", children: [_jsxs("div", { children: [_jsx("dt", { children: "Political context" }), _jsx("dd", { children: latestSummary.context })] }), _jsxs("div", { children: [_jsx("dt", { children: "Career length" }), _jsx("dd", { children: latestSummary.played })] }), _jsxs("div", { children: [_jsx("dt", { children: "Last saved" }), _jsx("dd", { children: new Date(latest.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) })] })] }), _jsx("button", { className: "btn title-continue", onClick: () => loadFile(latest.save), children: "Continue" })] })) : (_jsxs("article", { className: "continue-dossier empty", children: [_jsx("div", { className: "kicker", children: "No current career" }), _jsx("h2", { children: "Enter Terenan politics" }), _jsx("p", { children: "Choose a politician and begin on 1 January 2028." }), _jsx("button", { className: "btn title-continue", onClick: () => setMode("select"), children: "Start a new game" })] })), _jsxs("nav", { className: "title-actions", "aria-label": "Main menu", children: [_jsxs("button", { type: "button", onClick: () => setMode("select"), children: [_jsx("span", { children: "New Game" }), _jsx("small", { children: "Choose a political life" })] }), _jsxs("button", { type: "button", onClick: () => setMode("load"), disabled: saves.length === 0, children: [_jsx("span", { children: "Load Game" }), _jsxs("small", { children: [saves.length, " saved career", saves.length === 1 ? "" : "s"] })] }), _jsxs("button", { type: "button", disabled: true, children: [_jsx("span", { children: "Settings" }), _jsx("small", { children: "Display and accessibility" })] })] })] })] }));
    }
    if (mode === "load") {
        return (_jsxs("div", { className: "load-career-screen", children: [_jsxs("header", { className: "load-career-head", children: [_jsxs("div", { children: [_jsx("div", { className: "kicker", children: "LORSAIN RECORDS" }), _jsx("h1", { children: "Saved political careers" }), _jsx("p", { children: "Resume a career with its office, allegiance and political context intact." })] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn secondary", onClick: () => setMode("title"), children: "Back" }), _jsxs("label", { className: "btn secondary", children: ["Import save", _jsx("input", { type: "file", accept: "application/json", hidden: true, onChange: async (e) => { const file = e.target.files?.[0]; if (file)
                                                loadFile(await readImportedSave(file)); } })] })] })] }), _jsx("div", { className: "saved-career-grid", children: saves.map((s) => {
                        const summary = savedGamePoliticalSummary(world, s);
                        const savedPlayer = s.save.simulation.politicians[s.save.simulation.playerPoliticianId];
                        return _jsxs("article", { className: "saved-career", children: [_jsxs("div", { className: "saved-career-date", children: [_jsx("span", { children: s.date }), _jsx("small", { children: summary.played })] }), _jsx("h2", { children: s.playerName }), _jsx("p", { className: "saved-career-office", children: summary.office }), _jsxs("div", { className: "continue-party-line", children: [_jsx("span", { className: "continue-party-mark", style: { background: partyColor(world, savedPlayer?.partyId ?? null) } }), _jsx("strong", { children: summary.party })] }), _jsx("p", { className: "saved-career-context", children: summary.context }), _jsxs("footer", { children: [_jsxs("small", { children: ["Saved ", new Date(s.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })] }), _jsx("button", { className: "btn", onClick: () => void getSave(s.id).then((row) => row && loadFile(row.save)), children: "Resume" })] })] }, s.id);
                    }) })] }));
    }
    if (mode === "select") {
        const figuresList = bundle.content.starting_figures.figures;
        function officeKind(f) {
            const o = (f.office ?? "").toLowerCase();
            if (o.includes("president of"))
                return "president";
            if (o.includes("governor"))
                return "governor";
            if (o.includes("minister"))
                return "minister";
            if (o.includes("leader of") || o.includes("speaker"))
                return "leader";
            if (o.includes("assembly") || o.includes("mp") || o.includes("committee"))
                return "assembly";
            if (o.includes("justice") || o.includes("judge"))
                return "courts";
            return "other";
        }
        function careerRank(f) {
            const o = (f.office ?? "").toLowerCase();
            if (o.includes("president of"))
                return 0;
            if (o.includes("speaker"))
                return 1;
            if (o.includes("leader of"))
                return 2;
            if (o.includes("governor"))
                return 3;
            if (o.includes("chief justice"))
                return 4;
            if (f.presidential_status === "frontrunner")
                return 5;
            if (o.includes("assembly") || o.includes("mp"))
                return 6;
            return 99;
        }
        function roleDescription(f) {
            const kind = officeKind(f);
            if (kind === "president")
                return "Run the national executive and foreign policy.";
            if (kind === "governor")
                return "Lead provincial administration and build toward reelection or national office.";
            if (kind === "assembly")
                return "Legislate, vote and build a political career.";
            if (kind === "courts")
                return "Hear constitutional cases and shape public precedent.";
            if (kind === "leader")
                return "Manage party politics alongside the powers of any elected office held.";
            if (kind === "minister")
                return "Limited role: advise the President and pursue a broader political career.";
            if ((f.office ?? "").toLowerCase().includes("mayor"))
                return "Limited role: set a civic priority and pursue future office.";
            return "Continue a political career and seek a legitimate electoral opportunity.";
        }
        /** Featured starts only — meaningful gameplay depth, not Limited minister/mayor loops. */
        function gameplayFocus(f) {
            const kind = officeKind(f);
            const o = (f.office ?? "").toLowerCase();
            if (kind === "president")
                return "Executive · foreign · legislation";
            if (kind === "governor")
                return "Provincial administration · reelection";
            if (o.includes("speaker"))
                return "Floor control · legislation · party";
            if (kind === "leader")
                return "Party contests · caucus · career";
            if (kind === "assembly" || o.includes("mp") || o.includes("committee"))
                return "Legislation · constituency · votes";
            if (kind === "courts")
                return "Constitutional docket · precedent";
            if (f.presidential_status === "frontrunner")
                return "Presidential nomination · campaign";
            return "Electoral career · opportunities";
        }
        function complexity(f) {
            const kind = officeKind(f);
            const o = (f.office ?? "").toLowerCase();
            if (kind === "president" || o.includes("speaker") || f.presidential_status === "frontrunner")
                return "High";
            if (kind === "governor" || kind === "leader" || kind === "assembly" || kind === "courts")
                return "Medium";
            return "Low";
        }
        function roleLabel(f) {
            const o = (f.office ?? "").trim();
            if (o)
                return o;
            if (f.presidential_status === "frontrunner")
                return "Presidential frontrunner";
            return "Public figure";
        }
        const filtered = figuresList
            .filter((f) => {
            const q = query.trim().toLowerCase();
            const hay = `${f.name} ${f.office} ${f.party} ${f.home} ${f.notes ?? ""}`.toLowerCase();
            if (q && !hay.includes(q))
                return false;
            if (partyFilter !== "all" && f.party_id !== partyFilter)
                return false;
            if (officeFilter !== "all" && officeKind(f) !== officeFilter)
                return false;
            if (provinceFilter !== "all" && (f.home ?? "") !== provinceFilter)
                return false;
            return true;
        })
            .sort((a, b) => {
            const d = careerRank(a) - careerRank(b);
            return d !== 0 ? d : a.name.localeCompare(b.name);
        });
        const searching = query.trim().length > 0 ||
            partyFilter !== "all" ||
            officeFilter !== "all" ||
            provinceFilter !== "all";
        const provinces = [
            ...new Set(figuresList.map((f) => f.home).filter((h) => Boolean(h))),
        ].sort((a, b) => a.localeCompare(b));
        const featured = figuresList
            .filter((f) => careerRank(f) < 99)
            .sort((a, b) => careerRank(a) - careerRank(b) || a.name.localeCompare(b.name))
            .slice(0, 18);
        const pageSize = 18;
        const browse = searching ? filtered : filtered.filter((f) => careerRank(f) === 99);
        const pageCount = Math.max(1, Math.ceil(browse.length / pageSize));
        const page = Math.min(browsePage, pageCount - 1);
        const pageRows = browse.slice(page * pageSize, page * pageSize + pageSize);
        const tempCatalog = catalogFromBundle(bundle, figures);
        const featuredCard = (f) => {
            const accent = partyColor(world, f.party_id ?? null);
            const level = complexity(f);
            return (_jsxs("article", { className: "featured-start", style: { borderLeftColor: accent }, children: [_jsxs("div", { className: "featured-start-top", children: [_jsx(PoliticianAvatar, { name: f.name, ...(f.party_id != null ? { partyId: f.party_id } : {}), world: world, size: "sm" }), _jsxs("div", { className: "featured-start-id", children: [_jsx("h3", { className: "featured-start-name serif-head", children: f.name }), _jsx("div", { className: "featured-start-role", children: roleLabel(f) }), _jsxs("div", { className: "muted featured-start-party", children: [f.party ?? "Independent", f.home ? ` · ${f.home}` : ""] })] }), _jsx(StatusBadge, { tone: level === "High" ? "warn" : level === "Medium" ? "idle" : "ok", children: level })] }), _jsxs("div", { className: "featured-start-focus", children: [_jsx("span", { className: "kicker", children: "Gameplay focus" }), _jsx("div", { children: gameplayFocus(f) })] }), _jsxs("div", { className: "featured-start-foot", children: [_jsxs("span", { className: "muted", children: ["Complexity \u00B7 ", level] }), _jsx("button", { className: "btn", onClick: () => startGame(f.id), children: "Play" })] })] }, f.id));
        };
        const rosterCard = (f) => (_jsx(PoliticianCard, { catalog: tempCatalog, world: world, politicianId: f.id, name: f.name, partyLabel: f.party ?? "Independent", partyId: f.party_id ?? null, ...(f.office ? { office: f.office } : {}), ...(f.home ? { home: f.home } : {}), descriptor: `${roleDescription(f)}${f.notes ?? f.display_summary ? ` ${f.notes ?? f.display_summary}` : ""}`, compact: officeKind(f) === "minister" || (f.office ?? "").toLowerCase().includes("mayor"), action: _jsx("button", { className: "btn", onClick: () => startGame(f.id), children: "Play" }) }, f.id));
        return (_jsxs("div", { className: "page new-game-page", children: [_jsxs("div", { className: "new-game-header", children: [_jsx("h2", { className: "serif-head", children: "Choose your career" }), _jsx("p", { className: "muted", children: "Featured starts are full-depth political roles. Search the roster for Limited offices and other public figures. Hidden traits are never shown." })] }), _jsxs("div", { className: "row new-game-filters", children: [_jsx("input", { className: "search", placeholder: "Search by name, office, party, or home", value: query, onChange: (e) => {
                                setQuery(e.target.value);
                                setBrowsePage(0);
                            } }), _jsxs("select", { value: partyFilter, onChange: (e) => {
                                setPartyFilter(e.target.value);
                                setBrowsePage(0);
                            }, children: [_jsx("option", { value: "all", children: "All parties" }), Object.values(world.partyDefinitions).map((p) => (_jsx("option", { value: p.partyId, children: p.name }, p.partyId)))] }), _jsxs("select", { value: officeFilter, onChange: (e) => {
                                setOfficeFilter(e.target.value);
                                setBrowsePage(0);
                            }, children: [_jsx("option", { value: "all", children: "All offices" }), _jsx("option", { value: "president", children: "President" }), _jsx("option", { value: "governor", children: "Governors" }), _jsx("option", { value: "minister", children: "Ministers" }), _jsx("option", { value: "leader", children: "Party leaders" }), _jsx("option", { value: "assembly", children: "Assembly" }), _jsx("option", { value: "courts", children: "Courts" })] }), _jsxs("select", { value: provinceFilter, onChange: (e) => {
                                setProvinceFilter(e.target.value);
                                setBrowsePage(0);
                            }, children: [_jsx("option", { value: "all", children: "All provinces" }), provinces.map((home) => (_jsx("option", { value: home, children: home }, home)))] }), _jsx("button", { className: "btn secondary", onClick: () => setMode("title"), children: "Back" })] }), !searching ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "new-game-section-head", children: [_jsx("h3", { children: "Featured starts" }), _jsx("p", { className: "muted", children: "Name, role, gameplay focus, and complexity \u2014 President, Governor, Assembly, courts, and party leadership with real monthly work." })] }), _jsx("div", { className: "featured-start-grid", children: featured.map(featuredCard) }), _jsxs("div", { className: "new-game-section-head", style: { marginTop: "1.25rem" }, children: [_jsx("h3", { children: "Full roster" }), _jsxs("p", { className: "muted", children: ["Ordinary MPs, Limited ministers/mayors, and other public figures \u2014 ", browse.length, " ", "remaining. Use search and filters for the complete list."] })] })] })) : (_jsxs("p", { className: "muted", children: [filtered.length, " matching politicians"] })), _jsx("div", { className: "featured-grid", children: pageRows.map(rosterCard) }), pageCount > 1 ? (_jsxs("div", { className: "row", style: { marginTop: "0.75rem" }, children: [_jsx("button", { className: "btn secondary", disabled: page <= 0, onClick: () => setBrowsePage((p) => Math.max(0, p - 1)), children: "Previous" }), _jsxs("span", { className: "muted", children: ["Page ", page + 1, " of ", pageCount] }), _jsx("button", { className: "btn secondary", disabled: page >= pageCount - 1, onClick: () => setBrowsePage((p) => p + 1), children: "Next" })] })) : null] }));
    }
    if (!sim || !snap || !catalog)
        return null;
    const player = snap.politicians[snap.playerPoliticianId];
    const offices = playerOffices(world, snap, snap.playerPoliticianId);
    const provincialMember = provincialLegislatorForPolitician(snap, snap.playerPoliticianId);
    const roleKind = Object.values(snap.officeTerms)
        .filter((term) => term.holderId === snap.playerPoliticianId && (term.status === "active" || term.status === "suspended"))
        .map((term) => world.offices[term.officeId]?.kind)
        .find(Boolean) ?? (provincialMember?.serviceStartDate && provincialMember.serviceEndDate == null ? "provincial_legislator" : "private_citizen");
    const interrupt = snap.pendingInterrupt;
    const playerDecisions = collectPlayerActionableDecisions(world, snap);
    const decisionScreen = (kind) => {
        if (kind === "assembly_filing")
            return "career";
        if (kind === "judicial_vote" || kind === "confirmation_vote" || kind === "impeachment_vote" || kind === "recall_vote")
            return "courts";
        if (kind === "foreign_presidential_action" || kind === "incoming_treaty" || kind === "incoming_summit" || kind === "war_powers")
            return "foreign";
        if (kind === "sign_bill")
            return "executive";
        if (kind === "interrupt" && interrupt?.code.includes("ELECTION"))
            return "elections";
        return "assembly";
    };
    const attentionItems = playerDecisions.map((decision) => ({
        id: decision.key,
        label: decision.label,
        detail: decision.kind === "interrupt" ? "The turn cannot continue until this is resolved." : "Your affirmative choice is required.",
        screen: decisionScreen(decision.kind),
        tone: decision.kind === "interrupt" ? "urgent" : "soon",
    }));
    for (const election of Object.values(snap.provincialRuntime.elections)) {
        if (election.status !== "filing_open" || election.playerDecision != null)
            continue;
        const playerHome = player.homeProvinceId ?? world.politicianHomeProvince[player.id];
        if (election.provinceId !== playerHome && election.incumbentId !== player.id)
            continue;
        attentionItems.push({ id: `governor-filing:${election.id}`, label: `Governor filing is open in ${catalog.places.get(election.provinceId)?.name ?? "your province"}.`, detail: `Deadline ${election.filingDeadlineDate}`, screen: "career", tone: "soon" });
    }
    for (const election of Object.values(snap.provincialRuntime.assemblyElections)) {
        if (election.status !== "filing_open" || election.playerDecision != null)
            continue;
        const playerHome = player.homeProvinceId ?? world.politicianHomeProvince[player.id];
        if (election.provinceId !== playerHome)
            continue;
        attentionItems.push({ id: `provincial-filing:${election.id}`, label: `Provincial Assembly filing is open in ${catalog.places.get(election.provinceId)?.name ?? "your province"}.`, detail: `Election ${election.date}`, screen: "career", tone: "soon" });
    }
    const watchedIds = new Set(watchlist.map((entry) => entry.slice(entry.indexOf(":") + 1)));
    const publicTurnEvents = turnEvents.filter((event) => event.visibility === "public" && event.type !== "TURN_COMPLETED");
    const meaningfulTurnEvents = publicTurnEvents.filter((event) => event.importance >= 0.45);
    const briefingSource = (meaningfulTurnEvents.length ? meaningfulTurnEvents : publicTurnEvents).slice(-10).reverse();
    const briefingItems = briefingSource.map((event) => ({
        id: event.id,
        date: event.date,
        label: eventDisplay(catalog, world, snap, event),
        watched: [...event.actorIds, ...event.entityIds].some((id) => watchedIds.has(id)) || [...watchedIds].some((id) => JSON.stringify(event.payload).includes(id)),
    }));
    const activeCampaign = playerCampaign(snap);
    const campaignDate = activeCampaign?.electionId
        ? snap.elections[activeCampaign.electionId]?.date ?? snap.provincialRuntime.elections[activeCampaign.electionId]?.date ?? snap.provincialRuntime.assemblyElections[activeCampaign.electionId]?.date
        : activeCampaign?.contestId && typeof snap.partyContests[activeCampaign.contestId]?.metadata.electionDate === "string"
            ? snap.partyContests[activeCampaign.contestId].metadata.electionDate
            : null;
    const monthsRemaining = campaignDate ? Math.max(0, (Number(campaignDate.slice(0, 4)) - Number(snap.currentDate.slice(0, 4))) * 12 + Number(campaignDate.slice(5, 7)) - Number(snap.currentDate.slice(5, 7))) : null;
    const provinceId = governedProvinceId(world, snap, player.id);
    const roleActions = activeCampaign?.actionPointsRemaining ?? (provinceId ? snap.provincialRuntime.provinces[provinceId]?.actionPointsRemaining : null);
    const statusSegments = [
        `Standing: ${publicStandingLabel(world, snap, player.id)}`,
        ...(roleActions != null ? [`${roleActions} action${roleActions === 1 ? "" : "s"}`] : []),
        ...(activeCampaign && monthsRemaining != null ? [`${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"} to election`] : []),
    ];
    const lastSavedLabel = lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Autosave runs before every turn and national count.";
    return (_jsxs(GameShell, { screen: screen, onNavigate: setScreen, date: snap.currentDate, playerLine: `${politicianDisplayName(catalog, snap.playerPoliticianId)} · ${offices[0] ?? "No office"} · ${partyDisplayName(world, player.partyId, snap)}`, decisionCount: attentionItems.length, roleKind: roleKind, campaignActive: Boolean(playerCampaign(snap)), busy: busy || countingElection, busyLabel: countingElection ? "Counting Assembly ballots…" : busyLabel, endTurnDisabled: Boolean(interrupt?.requiresResolution), onEndTurn: () => void endTurn(), onSave: () => void saveGame(), onExport: () => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`), searchEntries: searchEntries, onSearchSelect: selectSearchEntry, attentionItems: attentionItems, briefingItems: briefingItems, watchlist: watchlist, onToggleWatch: (entry) => {
            const key = `${entry.kind}:${entry.id}`;
            setWatchlist((items) => items.includes(key) ? items.filter((item) => item !== key) : [...items, key]);
        }, statusSegments: statusSegments, lastSavedLabel: lastSavedLabel, children: [_jsx(DecisionPanel, { world: world, snap: snap, sim: sim, onDone: () => refresh(sim), report: feedback.report, countingElection: countingElection, onResolveAssembly: resolveAssemblyElection, onResolvePresidential: () => void resolvePresidentialElection() }), _jsx(GamePages, { screen: screen, world: world, snap: snap, sim: sim, bundle: bundle, catalog: catalog, figures: figures, offices: offices, events: turnEvents, campaign: playerCampaign(snap), selectedBill: selectedBill, setSelectedBill: setSelectedBill, mapHover: mapHover, setMapHover: setMapHover, debug: debug, setDebug: setDebug, onDone: () => refresh(sim), report: feedback.report, countingElection: countingElection, onResolveAssembly: resolveAssemblyElection, onResolvePresidential: () => void resolvePresidentialElection(), askConfirm: feedback.askConfirm, globalFocus: globalFocus }), import.meta.env.DEV ? (_jsx("output", { id: "lorsain-browser-qa-state", hidden: true, "data-ready": "true", "data-screen": screen, "data-player": snap.playerPoliticianId, "data-date": snap.currentDate, children: "Browser QA ready" })) : null, feedback.overlay()] }));
}
//# sourceMappingURL=App.js.map