import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectPlayerActionableDecisions, addMonths, createSimulation, nominationCalendarDates, parseSaveFile, restoreSimulation, } from "@lorsain/sim";
import { loadBrowserContentBundle } from "./content/browserReader.js";
import { kernelWorldFromBundle } from "./content/world.js";
import { downloadSave, getSave, listSaves, putSave, readImportedSave, } from "./saves.js";
import { playerCampaign, playerOffices, politicianName } from "./format.js";
import { GamePages } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
import { useCommandFeedback } from "./feedback.js";
import { catalogFromBundle, partyColor, partyDisplayName, politicianDisplayName } from "./presentation.js";
import { GameShell } from "./ui/shell.js";
import { StatusBadge } from "./ui/kit.js";
import { PoliticianAvatar, PoliticianCard } from "./ui/politician.js";
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
    function replaceSimulation(save) {
        if (!world)
            return;
        const restored = restoreSimulation(save, world);
        refresh(restored);
    }
    function resolveAssemblyElection() {
        if (!sim || !world || busy || countingElection)
            return;
        setCountingElection(true);
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
    function endTurn() {
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
    const roleKind = Object.values(snap.officeTerms)
        .filter((term) => term.holderId === snap.playerPoliticianId && (term.status === "active" || term.status === "suspended"))
        .map((term) => world.offices[term.officeId]?.kind)
        .find(Boolean) ?? "private_citizen";
    const interrupt = snap.pendingInterrupt;
    const decisionCount = collectPlayerActionableDecisions(world, snap).length;
    return (_jsxs(GameShell, { screen: screen, onNavigate: setScreen, date: snap.currentDate, playerLine: `${politicianDisplayName(catalog, snap.playerPoliticianId)} · ${offices[0] ?? "No office"} · ${partyDisplayName(world, player.partyId, snap)}`, decisionCount: decisionCount, roleKind: roleKind, campaignActive: Boolean(playerCampaign(snap)), busy: busy || countingElection, busyLabel: countingElection ? "Counting Assembly ballots…" : busyLabel, endTurnDisabled: Boolean(interrupt?.requiresResolution), onEndTurn: endTurn, onSave: () => void saveGame(), onExport: () => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`), children: [_jsx(DecisionPanel, { world: world, snap: snap, sim: sim, onDone: () => refresh(sim), report: feedback.report, countingElection: countingElection, onResolveAssembly: resolveAssemblyElection }), _jsx(GamePages, { screen: screen, world: world, snap: snap, sim: sim, bundle: bundle, catalog: catalog, figures: figures, offices: offices, events: turnEvents, campaign: playerCampaign(snap), selectedBill: selectedBill, setSelectedBill: setSelectedBill, mapHover: mapHover, setMapHover: setMapHover, debug: debug, setDebug: setDebug, onDone: () => refresh(sim), report: feedback.report, countingElection: countingElection, onResolveAssembly: resolveAssemblyElection, askConfirm: feedback.askConfirm }), feedback.overlay()] }));
}
//# sourceMappingURL=App.js.map