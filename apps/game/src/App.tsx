import { useEffect, useMemo, useState } from "react";
import {
  collectPlayerActionableDecisions,
  createSimulation,
  parseSaveFile,
  restoreSimulation,
  type KernelWorld,
  type SaveFile,
  type SimEvent,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import type { ContentBundle } from "@lorsain/content-loader";
import { loadBrowserContentBundle } from "./content/browserReader.js";
import { kernelWorldFromBundle } from "./content/world.js";
import {
  downloadSave,
  getSave,
  listSaves,
  putSave,
  readImportedSave,
  type SavedGameRow,
} from "./saves.js";
import { playerCampaign, playerOffices, politicianName } from "./format.js";
import { GamePages, type Figure, type Screen } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
import { useCommandFeedback } from "./feedback.js";
import { catalogFromBundle, partyDisplayName, politicianDisplayName } from "./presentation.js";
import { GameShell } from "./ui/shell.js";
import { PoliticianCard } from "./ui/politician.js";

export default function App() {
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
  const [world, setWorld] = useState<KernelWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"title" | "select" | "load" | "play">("title");
  const [sim, setSim] = useState<Simulation | null>(null);
  const [snap, setSnap] = useState<SimState | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [busy, setBusy] = useState(false);
  const [countingElection, setCountingElection] = useState(false);
  const [turnEvents, setTurnEvents] = useState<SimEvent[]>([]);
  const [saves, setSaves] = useState<SavedGameRow[]>([]);
  const [query, setQuery] = useState("");
  const [partyFilter, setPartyFilter] = useState("all");
  const [officeFilter, setOfficeFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [browsePage, setBrowsePage] = useState(0);
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [mapHover, setMapHover] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const feedback = useCommandFeedback();

  useEffect(() => {
    try {
      const loaded = loadBrowserContentBundle();
      setBundle(loaded);
      setWorld(kernelWorldFromBundle(loaded));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const figures = useMemo(() => {
    const map = new Map<string, Figure>();
    for (const f of (bundle?.content.starting_figures.figures ?? []) as Figure[]) map.set(f.id, f);
    return map;
  }, [bundle]);
  const catalog = useMemo(
    () => (bundle ? catalogFromBundle(bundle, figures) : null),
    [bundle, figures],
  );

  function refresh(next: Simulation) {
    setSim(next);
    setSnap(next.getSnapshot());
  }

  function startGame(politicianId: string) {
    if (!world) return;
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
    if (!sim || !snap) return;
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

  function loadFile(save: SaveFile) {
    if (!world) return;
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

  function replaceSimulation(save: SaveFile) {
    if (!world) return;
    const restored = restoreSimulation(save, world);
    refresh(restored);
  }

  function resolveAssemblyElection() {
    if (!sim || !world || busy || countingElection) return;
    setCountingElection(true);
    const worker = new Worker(new URL("./electionWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<
      | { ok: true; save: SaveFile; result: ReturnType<Simulation["executeCommand"]> }
      | { ok: false; message: string }
    >) => {
      worker.terminate();
      try {
        if (event.data.ok) {
          feedback.report(event.data.result);
          if (event.data.result.ok) replaceSimulation(event.data.save);
        } else {
          feedback.setNotice(event.data.message);
        }
      } catch (error) {
        feedback.setNotice(
          error instanceof Error ? error.message : "The Assembly count could not be restored.",
        );
      } finally {
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
    if (!sim) return;
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
      if (!result.ok) feedback.setNotice(result.error.message);
    }, 20);
  }

  if (error) {
    return (
      <div className="app-title">
        <div className="title-card">
          <h1>Lorsain</h1>
          <p>{error}</p>
          <button className="btn" onClick={() => setError(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }
  if (!world || !bundle) {
    return (
      <div className="app-title">
        <div className="title-card">
          <h1>Lorsain</h1>
          <p>Loading Terena…</p>
        </div>
      </div>
    );
  }
  if (mode === "title") {
    return (
      <div className="app-title">
        <div className="title-card">
          <h1>LORSAIN</h1>
          <p>The Dual-Mandate Republic of Terena. January 2028.</p>
          <div className="row">
            <button className="btn" onClick={() => setMode("select")}>
              New Game
            </button>
            <button
              className="btn secondary"
              onClick={async () => {
                setSaves(await listSaves());
                setMode("load");
              }}
            >
              Load Game
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (mode === "load") {
    return (
      <div className="page">
        <h2>Load game</h2>
        <div className="row">
          <button className="btn secondary" onClick={() => setMode("title")}>
            Back
          </button>
          <label className="btn secondary">
            Import
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) loadFile(await readImportedSave(file));
              }}
            />
          </label>
        </div>
        <div className="list" style={{ marginTop: "1rem" }}>
          {saves.map((s) => (
            <div className="pick" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <div className="muted">
                  {s.playerName} · {s.date}
                </div>
              </div>
              <button
                className="btn"
                onClick={() => void getSave(s.id).then((row) => row && loadFile(row.save))}
              >
                Load
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (mode === "select") {
    const figuresList = bundle.content.starting_figures.figures as Figure[];
    function officeKind(f: Figure): string {
      const o = (f.office ?? "").toLowerCase();
      if (o.includes("president of")) return "president";
      if (o.includes("governor")) return "governor";
      if (o.includes("minister")) return "minister";
      if (o.includes("leader of") || o.includes("speaker")) return "leader";
      if (o.includes("assembly") || o.includes("mp") || o.includes("committee")) return "assembly";
      if (o.includes("justice") || o.includes("judge")) return "courts";
      return "other";
    }
    function careerRank(f: Figure): number {
      const o = (f.office ?? "").toLowerCase();
      if (o.includes("president of")) return 0;
      if (o.includes("speaker")) return 1;
      if (o.includes("leader of")) return 2;
      if (o.includes("minister")) return 3;
      if (o.includes("governor")) return 4;
      if (o.includes("chief justice")) return 5;
      if (f.presidential_status === "frontrunner") return 6;
      if (o.includes("chair")) return 7;
      if (f.presidential_status === "likely") return 8;
      return 99;
    }
    const filtered = figuresList
      .filter((f) => {
        const q = query.trim().toLowerCase();
        const hay = `${f.name} ${f.office} ${f.party} ${f.home} ${f.notes ?? ""}`.toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (partyFilter !== "all" && f.party_id !== partyFilter) return false;
        if (officeFilter !== "all" && officeKind(f) !== officeFilter) return false;
        if (provinceFilter !== "all" && (f.home ?? "") !== provinceFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const d = careerRank(a) - careerRank(b);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });
    const searching =
      query.trim().length > 0 ||
      partyFilter !== "all" ||
      officeFilter !== "all" ||
      provinceFilter !== "all";
    const provinces = [
      ...new Set(figuresList.map((f) => f.home).filter((h): h is string => Boolean(h))),
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
    const card = (f: Figure) => (
      <PoliticianCard
        key={f.id}
        catalog={tempCatalog}
        world={world}
        politicianId={f.id}
        name={f.name}
        partyLabel={f.party ?? "Independent"}
        partyId={f.party_id ?? null}
        {...(f.office ? { office: f.office } : {})}
        {...(f.home ? { home: f.home } : {})}
        {...((f.notes ?? f.display_summary)
          ? { descriptor: f.notes ?? f.display_summary }
          : {})}
        action={
          <button className="btn" onClick={() => startGame(f.id)}>
            Play
          </button>
        }
      />
    );
    return (
      <div className="page new-game-page">
        <div className="new-game-header">
          <h2 className="serif-head">Choose your career</h2>
          <p className="muted">
            Begin as a notable officeholder, or search the full public roster. Hidden traits are
            never shown.
          </p>
        </div>
        <div className="row new-game-filters">
          <input
            className="search"
            placeholder="Search by name, office, party, or home"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setBrowsePage(0);
            }}
          />
          <select
            value={partyFilter}
            onChange={(e) => {
              setPartyFilter(e.target.value);
              setBrowsePage(0);
            }}
          >
            <option value="all">All parties</option>
            {Object.values(world.partyDefinitions).map((p) => (
              <option key={p.partyId} value={p.partyId}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={officeFilter}
            onChange={(e) => {
              setOfficeFilter(e.target.value);
              setBrowsePage(0);
            }}
          >
            <option value="all">All offices</option>
            <option value="president">President</option>
            <option value="governor">Governors</option>
            <option value="minister">Ministers</option>
            <option value="leader">Party leaders</option>
            <option value="assembly">Assembly</option>
            <option value="courts">Courts</option>
          </select>
          <select
            value={provinceFilter}
            onChange={(e) => {
              setProvinceFilter(e.target.value);
              setBrowsePage(0);
            }}
          >
            <option value="all">All provinces</option>
            {provinces.map((home) => (
              <option key={home} value={home}>
                {home}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => setMode("title")}>
            Back
          </button>
        </div>
        {!searching ? (
          <>
            <h3>Featured careers</h3>
            <div className="featured-grid">{featured.map(card)}</div>
            <h3 style={{ marginTop: "1.25rem" }}>Find another politician</h3>
            <p className="muted">Ordinary MPs and other public figures — {browse.length} remaining.</p>
          </>
        ) : (
          <p className="muted">{filtered.length} matching politicians</p>
        )}
        <div className="featured-grid">{pageRows.map(card)}</div>
        {pageCount > 1 ? (
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              className="btn secondary"
              disabled={page <= 0}
              onClick={() => setBrowsePage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {page + 1} of {pageCount}
            </span>
            <button
              className="btn secondary"
              disabled={page >= pageCount - 1}
              onClick={() => setBrowsePage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    );
  }
  if (!sim || !snap || !catalog) return null;
  const player = snap.politicians[snap.playerPoliticianId]!;
  const offices = playerOffices(world, snap, snap.playerPoliticianId);
  const interrupt = snap.pendingInterrupt;
  const decisionCount = collectPlayerActionableDecisions(world, snap).length;
  return (
    <GameShell
      screen={screen}
      onNavigate={setScreen}
      date={snap.currentDate}
      playerLine={`${politicianDisplayName(catalog, snap.playerPoliticianId)} · ${offices[0] ?? "No office"} · ${partyDisplayName(world, player.partyId, snap)}`}
      decisionCount={decisionCount}
      busy={busy || countingElection}
      endTurnDisabled={Boolean(interrupt?.requiresResolution)}
      onEndTurn={endTurn}
      onSave={() => void saveGame()}
      onExport={() => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`)}
    >
      <DecisionPanel
        world={world}
        snap={snap}
        sim={sim}
        onDone={() => refresh(sim)}
        report={feedback.report}
        countingElection={countingElection}
        onResolveAssembly={resolveAssemblyElection}
      />
      <GamePages
        screen={screen}
        world={world}
        snap={snap}
        sim={sim}
        bundle={bundle}
        catalog={catalog}
        figures={figures}
        offices={offices}
        events={turnEvents}
        campaign={playerCampaign(snap)}
        selectedBill={selectedBill}
        setSelectedBill={setSelectedBill}
        mapHover={mapHover}
        setMapHover={setMapHover}
        debug={debug}
        setDebug={setDebug}
        onDone={() => refresh(sim)}
        report={feedback.report}
        countingElection={countingElection}
        onResolveAssembly={resolveAssemblyElection}
        askConfirm={feedback.askConfirm}
      />
      {feedback.overlay()}
    </GameShell>
  );
}
