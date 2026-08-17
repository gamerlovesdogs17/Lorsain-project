import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { createSimulation, parseSaveFile, restoreSimulation, } from "@lorsain/sim";
import { loadBrowserContentBundle } from "./content/browserReader.js";
import { kernelWorldFromBundle } from "./content/world.js";
import { downloadSave, getSave, listSaves, putSave, readImportedSave, } from "./saves.js";
import { isMp, isPresident, isSpeaker, partyName, playerCampaign, playerOffices, politicianName, } from "./format.js";
import { GamePages } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
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
                setError(result.error.message);
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
        return (_jsxs("div", { className: "page", children: [_jsx("h2", { children: "Choose a politician" }), _jsx("p", { className: "muted", children: "Public offices and biographies only. Hidden traits are not shown." }), _jsxs("div", { className: "row", children: [_jsx("input", { className: "search", placeholder: "Search", value: query, onChange: (e) => setQuery(e.target.value) }), _jsxs("select", { value: partyFilter, onChange: (e) => setPartyFilter(e.target.value), children: [_jsx("option", { value: "all", children: "All parties" }), Object.values(world.partyDefinitions).map((p) => (_jsx("option", { value: p.partyId, children: p.name }, p.partyId)))] }), _jsx("button", { className: "btn secondary", onClick: () => setMode("title"), children: "Back" })] }), _jsx("div", { className: "list", style: { marginTop: "1rem" }, children: list.slice(0, 80).map((f) => (_jsxs("div", { className: "pick", children: [_jsxs("div", { children: [_jsx("strong", { children: f.name }), _jsxs("div", { className: "muted", children: [f.office ?? "Private citizen", " \u00B7 ", f.party ?? "Independent", f.faction ? ` / ${f.faction}` : "", " \u00B7 ", f.home] }), _jsx("div", { className: "muted", children: f.notes ?? f.display_summary })] }), _jsx("button", { className: "btn", onClick: () => startGame(f.id), children: "Play" })] }, f.id))) })] }));
    }
    if (!sim || !snap)
        return null;
    const player = snap.politicians[snap.playerPoliticianId];
    const offices = playerOffices(world, snap, snap.playerPoliticianId);
    const interrupt = snap.pendingInterrupt;
    return (_jsxs("div", { className: `shell ${busy ? "busy" : ""}`, children: [_jsxs("nav", { className: "nav", children: [_jsx("h2", { children: "Lorsain" }), [
                        ["home", "Home"],
                        ["career", "Career"],
                        ["assembly", "Assembly"],
                        ["party", "Party"],
                        ["campaign", "Campaign"],
                        ["elections", "Elections"],
                        ["executive", "Executive"],
                        ["terena", "Terena"],
                        ["archive", "Archive"],
                    ].map(([id, label]) => (_jsx("button", { className: screen === id ? "active" : "", onClick: () => setScreen(id), children: label }, id)))] }), _jsxs("div", { className: "main", children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("strong", { children: snap.currentDate }), _jsxs("div", { className: "muted", children: [politicianName(figures, snap.playerPoliticianId), " \u00B7 ", offices[0] ?? "No office", " \u00B7", " ", partyName(world, player.partyId)] })] }), _jsxs("div", { className: "row", children: [busy ? _jsx("span", { className: "muted", children: "Processing\u2026" }) : null, _jsx("button", { className: "btn secondary", onClick: () => void saveGame(), children: "Save" }), _jsx("button", { className: "btn secondary", onClick: () => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`), children: "Export" }), _jsx("button", { className: "btn", onClick: endTurn, disabled: busy || Boolean(interrupt?.requiresResolution), children: "End Turn" })] })] }), _jsxs("div", { className: "page", children: [_jsx(DecisionPanel, { world: world, snap: snap, sim: sim, interrupt: interrupt, mp: isMp(world, snap, snap.playerPoliticianId), president: isPresident(world, snap, snap.playerPoliticianId), speaker: isSpeaker(world, snap, snap.playerPoliticianId), onDone: () => refresh(sim) }), _jsx(GamePages, { screen: screen, world: world, snap: snap, sim: sim, bundle: bundle, figures: figures, offices: offices, events: turnEvents, campaign: playerCampaign(snap), selectedBill: selectedBill, setSelectedBill: setSelectedBill, mapHover: mapHover, setMapHover: setMapHover, debug: debug, setDebug: setDebug, onDone: () => refresh(sim) })] })] })] }));
}
//# sourceMappingURL=App.js.map