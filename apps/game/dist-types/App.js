import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { collectPlayerActionableDecisions, createSimulation, parseSaveFile, restoreSimulation, } from "@lorsain/sim";
import { loadBrowserContentBundle } from "./content/browserReader.js";
import { kernelWorldFromBundle } from "./content/world.js";
import { downloadSave, getSave, listSaves, putSave, readImportedSave, } from "./saves.js";
import { playerCampaign, playerOffices, politicianName } from "./format.js";
import { GamePages } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
import { useCommandFeedback } from "./feedback.js";
import { catalogFromBundle, partyDisplayName, politicianDisplayName } from "./presentation.js";
import { GameShell } from "./ui/shell.js";
import { PoliticianCard } from "./ui/politician.js";
export default function App() {
    const [bundle, setBundle] = useState(null);
    const [world, setWorld] = useState(null);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState("title");
    const [sim, setSim] = useState(null);
    const [snap, setSnap] = useState(null);
    const [screen, setScreen] = useState("home");
    const [busy, setBusy] = useState(false);
    const [turnEvents, setTurnEvents] = useState([]);
    const [saves, setSaves] = useState([]);
    const [query, setQuery] = useState("");
    const [partyFilter, setPartyFilter] = useState("all");
    const [selectedBill, setSelectedBill] = useState(null);
    const [mapHover, setMapHover] = useState(null);
    const [debug, setDebug] = useState(false);
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
    const figures = useMemo(() => {
        const map = new Map();
        for (const f of (bundle?.content.starting_figures.figures ?? []))
            map.set(f.id, f);
        return map;
    }, [bundle]);
    const catalog = useMemo(() => (bundle ? catalogFromBundle(bundle, figures) : null), [bundle, figures]);
    function refresh(next) {
        setSim(next);
        setSnap(next.getSnapshot());
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
        await putSave({
            id: `${snap.playerPoliticianId}-${Date.now()}`,
            name: `${politicianName(figures, snap.playerPoliticianId)} ${snap.currentDate}`,
            savedAt: new Date().toISOString(),
            playerName: politicianName(figures, snap.playerPoliticianId),
            date: snap.currentDate,
            save: sim.serializeSave(),
        });
        setSaves(await listSaves());
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
    function endTurn() {
        if (!sim)
            return;
        setBusy(true);
        window.setTimeout(() => {
            const before = sim.getSnapshot().history.length;
            let result = sim.executeCommand({ type: "ADVANCE_TURN" });
            if (result.ok && result.interrupt && !result.interrupt.requiresResolution) {
                sim.executeCommand({ type: "ACKNOWLEDGE_INTERRUPT" });
                result = sim.executeCommand({ type: "RESUME_TURN" });
            }
            setTurnEvents(sim.getSnapshot().history.slice(before));
            refresh(sim);
            setBusy(false);
            if (!result.ok)
                feedback.setNotice(result.error.message);
        }, 20);
    }
    if (error) {
        return (_jsx("div", { className: "app-title", children: _jsxs("div", { className: "title-card", children: [_jsx("h1", { children: "Lorsain" }), _jsx("p", { children: error }), _jsx("button", { className: "btn", onClick: () => setError(null), children: "Back" })] }) }));
    }
    if (!world || !bundle) {
        return (_jsx("div", { className: "app-title", children: _jsxs("div", { className: "title-card", children: [_jsx("h1", { children: "Lorsain" }), _jsx("p", { children: "Loading Terena\u2026" })] }) }));
    }
    if (mode === "title") {
        return (_jsx("div", { className: "app-title", children: _jsxs("div", { className: "title-card", children: [_jsx("h1", { children: "LORSAIN" }), _jsx("p", { children: "The Dual-Mandate Republic of Terena. January 2028." }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn", onClick: () => setMode("select"), children: "New Game" }), _jsx("button", { className: "btn secondary", onClick: async () => {
                                    setSaves(await listSaves());
                                    setMode("load");
                                }, children: "Load Game" })] })] }) }));
    }
    if (mode === "load") {
        return (_jsxs("div", { className: "page", children: [_jsx("h2", { children: "Load game" }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn secondary", onClick: () => setMode("title"), children: "Back" }), _jsxs("label", { className: "btn secondary", children: ["Import", _jsx("input", { type: "file", accept: "application/json", hidden: true, onChange: async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                            loadFile(await readImportedSave(file));
                                    } })] })] }), _jsx("div", { className: "list", style: { marginTop: "1rem" }, children: saves.map((s) => (_jsxs("div", { className: "pick", children: [_jsxs("div", { children: [_jsx("strong", { children: s.name }), _jsxs("div", { className: "muted", children: [s.playerName, " \u00B7 ", s.date] })] }), _jsx("button", { className: "btn", onClick: () => void getSave(s.id).then((row) => row && loadFile(row.save)), children: "Load" })] }, s.id))) })] }));
    }
    if (mode === "select") {
        const list = bundle.content.starting_figures.figures
            .filter((f) => {
            const q = query.trim().toLowerCase();
            const hay = `${f.name} ${f.office} ${f.party} ${f.home} ${f.notes ?? ""}`.toLowerCase();
            if (q && !hay.includes(q))
                return false;
            if (partyFilter !== "all" && f.party_id !== partyFilter)
                return false;
            return true;
        })
            .sort((a, b) => {
            const rank = (f) => f.office?.toLowerCase().includes("president")
                ? 0
                : f.presidential_status === "frontrunner"
                    ? 1
                    : f.presidential_status === "likely"
                        ? 2
                        : f.presidential_status
                            ? 3
                            : 4;
            const d = rank(a) - rank(b);
            return d !== 0 ? d : a.name.localeCompare(b.name);
        });
        const tempCatalog = catalogFromBundle(bundle, figures);
        return (_jsxs("div", { className: "page new-game-page", children: [_jsxs("div", { className: "new-game-header", children: [_jsx("h2", { className: "serif-head", children: "Choose your career" }), _jsx("p", { className: "muted", children: "Select a politician to begin. Public offices and biographies only \u2014 hidden traits are never shown." })] }), _jsxs("div", { className: "row new-game-filters", children: [_jsx("input", { className: "search", placeholder: "Search by name, office, party, or home", value: query, onChange: (e) => setQuery(e.target.value) }), _jsxs("select", { value: partyFilter, onChange: (e) => setPartyFilter(e.target.value), children: [_jsx("option", { value: "all", children: "All parties" }), Object.values(world.partyDefinitions).map((p) => (_jsx("option", { value: p.partyId, children: p.name }, p.partyId)))] }), _jsx("button", { className: "btn secondary", onClick: () => setMode("title"), children: "Back" })] }), _jsx("div", { className: "politician-card-grid", children: list.slice(0, 60).map((f) => (_jsx(PoliticianCard, { catalog: tempCatalog, world: world, politicianId: f.id, name: f.name, partyLabel: f.party ?? "Independent", partyId: f.party_id ?? null, ...(f.office ? { office: f.office } : {}), ...(f.home ? { home: f.home } : {}), ...((f.notes ?? f.display_summary) ? { descriptor: f.notes ?? f.display_summary } : {}), action: _jsx("button", { className: "btn", onClick: () => startGame(f.id), children: "Play" }) }, f.id))) })] }));
    }
    if (!sim || !snap || !catalog)
        return null;
    const player = snap.politicians[snap.playerPoliticianId];
    const offices = playerOffices(world, snap, snap.playerPoliticianId);
    const interrupt = snap.pendingInterrupt;
    const decisionCount = collectPlayerActionableDecisions(world, snap).length;
    return (_jsxs(GameShell, { screen: screen, onNavigate: setScreen, date: snap.currentDate, playerLine: `${politicianDisplayName(catalog, snap.playerPoliticianId)} · ${offices[0] ?? "No office"} · ${partyDisplayName(world, player.partyId, snap)}`, decisionCount: decisionCount, busy: busy, endTurnDisabled: Boolean(interrupt?.requiresResolution), onEndTurn: endTurn, onSave: () => void saveGame(), onExport: () => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`), children: [feedback.overlay(), _jsx(DecisionPanel, { world: world, snap: snap, sim: sim, onDone: () => refresh(sim), report: feedback.report }), _jsx(GamePages, { screen: screen, world: world, snap: snap, sim: sim, bundle: bundle, catalog: catalog, figures: figures, offices: offices, events: turnEvents, campaign: playerCampaign(snap), selectedBill: selectedBill, setSelectedBill: setSelectedBill, mapHover: mapHover, setMapHover: setMapHover, debug: debug, setDebug: setDebug, onDone: () => refresh(sim), report: feedback.report, askConfirm: feedback.askConfirm })] }));
}
//# sourceMappingURL=App.js.map