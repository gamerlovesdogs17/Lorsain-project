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
  const [turnEvents, setTurnEvents] = useState<SimEvent[]>([]);
  const [saves, setSaves] = useState<SavedGameRow[]>([]);
  const [query, setQuery] = useState("");
  const [partyFilter, setPartyFilter] = useState("all");
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
    const list = (bundle.content.starting_figures.figures as Figure[])
      .filter((f) => {
        const q = query.trim().toLowerCase();
        const hay = `${f.name} ${f.office} ${f.party} ${f.home} ${f.notes ?? ""}`.toLowerCase();
        if (q && !hay.includes(q)) return false;
        if (partyFilter !== "all" && f.party_id !== partyFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const rank = (f: Figure) =>
          f.office?.toLowerCase().includes("president")
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
    return (
      <div className="page new-game-page">
        <div className="new-game-header">
          <h2 className="serif-head">Choose your career</h2>
          <p className="muted">
            Select a politician to begin. Public offices and biographies only — hidden traits are
            never shown.
          </p>
        </div>
        <div className="row new-game-filters">
          <input
            className="search"
            placeholder="Search by name, office, party, or home"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)}>
            <option value="all">All parties</option>
            {Object.values(world.partyDefinitions).map((p) => (
              <option key={p.partyId} value={p.partyId}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => setMode("title")}>
            Back
          </button>
        </div>
        <div className="politician-card-grid">
          {list.slice(0, 60).map((f) => (
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
              {...((f.notes ?? f.display_summary) ? { descriptor: f.notes ?? f.display_summary } : {})}
              action={
                <button className="btn" onClick={() => startGame(f.id)}>
                  Play
                </button>
              }
            />
          ))}
        </div>
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
      busy={busy}
      endTurnDisabled={Boolean(interrupt?.requiresResolution)}
      onEndTurn={endTurn}
      onSave={() => void saveGame()}
      onExport={() => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`)}
    >
      {feedback.overlay()}
      <DecisionPanel
        world={world}
        snap={snap}
        sim={sim}
        onDone={() => refresh(sim)}
        report={feedback.report}
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
        askConfirm={feedback.askConfirm}
      />
    </GameShell>
  );
}
