import { useEffect, useMemo, useRef, useState } from "react";
import {
  collectPlayerActionableDecisions,
  addMonths,
  createSimulation,
  governedProvinceId,
  nominationCalendarDates,
  parseSaveFile,
  provincialLegislatorForPolitician,
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
import { playerCampaign, playerOffices, politicianName, publicStandingLabel } from "./format.js";
import { GamePages, type Figure, type Screen } from "./pages.js";
import { DecisionPanel } from "./decisions.js";
import { useCommandFeedback } from "./feedback.js";
import {
  catalogFromBundle,
  eventDisplay,
  partyColor,
  partyDisplayName,
  politicianDisplayName,
} from "./presentation.js";
import {
  GameShell,
  type ShellAttentionItem,
  type ShellBriefingItem,
  type ShellSearchEntry,
} from "./ui/shell.js";
import { StatusBadge } from "./ui/kit.js";
import { PoliticianAvatar, PoliticianCard } from "./ui/politician.js";

const QA_SCREENS = new Set<Screen>([
  "home",
  "career",
  "office",
  "assembly",
  "party",
  "campaign",
  "elections",
  "executive",
  "courts",
  "economy",
  "organizations",
  "news",
  "foreign",
  "terena",
  "archive",
]);

function monthsBetween(startDate: string, endDate: string): number {
  return Math.max(
    0,
    (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
      Number(endDate.slice(5, 7)) -
      Number(startDate.slice(5, 7)),
  );
}

function savedGamePoliticalSummary(world: KernelWorld, row: SavedGameRow) {
  const state = row.save.simulation;
  const player = state.politicians[state.playerPoliticianId];
  const activeTerm = Object.values(state.officeTerms).find(
    (term) =>
      term.holderId === state.playerPoliticianId &&
      (term.status === "active" || term.status === "suspended"),
  );
  const office = activeTerm ? world.offices[activeTerm.officeId] : null;
  const party = player?.partyId ? world.partyDefinitions[player.partyId] : null;
  const campaign = Object.values(state.campaignRuntime.campaigns).find(
    (row) => row.politicianId === state.playerPoliticianId && row.status === "active",
  );
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
    played:
      playedMonths < 12
        ? `${playedMonths} month${playedMonths === 1 ? "" : "s"} played`
        : `${Math.floor(playedMonths / 12)} year${Math.floor(playedMonths / 12) === 1 ? "" : "s"}, ${playedMonths % 12} months played`,
  };
}

function qaScreen(value: string | null): Screen {
  return value != null && QA_SCREENS.has(value as Screen) ? (value as Screen) : "home";
}

function routeFromHash(): { screen: Screen; focus: { kind: string; id: string } | null } {
  if (typeof window === "undefined") return { screen: "home", focus: null };
  const parts = window.location.hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const screen = QA_SCREENS.has(parts[0] as Screen) ? (parts[0] as Screen) : "home";
  if (parts.length < 3) return { screen, focus: null };
  const kinds: Record<string, string> = {
    politician: "Politician",
    party: "Party",
    caucus: "Caucus",
    province: "Province",
    constituency: "Constituency",
    election: "Election",
    bill: "Bill",
    organization: "Organization",
    "court-case": "Court case",
  };
  const kind = kinds[parts[1]!.toLowerCase()];
  return { screen, focus: kind ? { kind, id: parts.slice(2).join("/") } : null };
}

function routeHash(screen: Screen, focus: { kind: string; id: string } | null): string {
  if (!focus) return `#/${screen}`;
  const kind = focus.kind.toLowerCase().replace(/\s+/g, "-");
  return `#/${screen}/${encodeURIComponent(kind)}/${encodeURIComponent(focus.id)}`;
}

export default function App() {
  const initialRoute = routeFromHash();
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
  const [world, setWorld] = useState<KernelWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"title" | "select" | "load" | "play">("title");
  const [sim, setSim] = useState<Simulation | null>(null);
  const [snap, setSnap] = useState<SimState | null>(null);
  const [screen, setScreen] = useState<Screen>(initialRoute.screen);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Processing…");
  const busyRef = useRef(false);
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
  const [globalFocus, setGlobalFocus] = useState<{ kind: string; id: string } | null>(
    initialRoute.focus,
  );
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = JSON.parse(window.localStorage.getItem("lorsain-watchlist") ?? "[]");
      return Array.isArray(raw)
        ? raw.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const qaBooted = useRef(false);
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

  useEffect(() => {
    if (!world) return;
    if (import.meta.env.DEV) {
      const fixture = new URLSearchParams(window.location.search).get("qaTitleFixture");
      if (fixture) {
        void fetch(`/__qa/fixtures/${encodeURIComponent(fixture)}.json`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error(`Browser QA fixture ${fixture} was not found.`);
            return (await response.json()) as SaveFile;
          })
          .then((save) => {
            const player = save.simulation.politicians[save.simulation.playerPoliticianId];
            const figureName = (
              bundle?.content.starting_figures.figures as Figure[] | undefined
            )?.find((figure) => figure.id === save.simulation.playerPoliticianId)?.name;
            setSaves([
              {
                id: `qa-title:${fixture}`,
                name: `Career of ${figureName ?? player?.displayName ?? save.simulation.playerPoliticianId}`,
                savedAt: `${save.simulation.currentDate}T18:00:00.000Z`,
                playerName: figureName ?? player?.displayName ?? save.simulation.playerPoliticianId,
                date: save.simulation.currentDate,
                save,
              },
            ]);
          })
          .catch(() => setSaves([]));
        return;
      }
    }
    void listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
  }, [bundle, world]);

  useEffect(() => {
    if (!import.meta.env.DEV || !world || qaBooted.current) return;
    const params = new URLSearchParams(window.location.search);
    const fixture = params.get("qaFixture");
    if (!fixture) return;
    qaBooted.current = true;
    void fetch(`/__qa/fixtures/${encodeURIComponent(fixture)}.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Browser QA fixture ${fixture} was not found.`);
        return (await response.json()) as SaveFile;
      })
      .then((save) => {
        const playerId = params.get("qaPlayer");
        const prepared =
          playerId && save.simulation.politicians[playerId]
            ? { ...save, simulation: { ...save.simulation, playerPoliticianId: playerId } }
            : save;
        const parsed = parseSaveFile(prepared, world.contentVersion);
        if (!parsed.ok) throw new Error(parsed.error.message);
        const restored = restoreSimulation(parsed.save, world);
        const focusKind = params.get("qaFocusKind");
        const focusId = params.get("qaFocusId");
        setTurnEvents([]);
        setMode("play");
        setScreen(qaScreen(params.get("qaScreen")));
        if (focusKind && focusId) {
          setGlobalFocus({ kind: focusKind, id: focusId });
          if (focusKind === "Bill") setSelectedBill(focusId);
        }
        refresh(restored);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [world]);

  useEffect(() => {
    window.localStorage.setItem("lorsain-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    const readRoute = () => {
      const route = routeFromHash();
      setScreen(route.screen);
      setGlobalFocus(route.focus);
    };
    window.addEventListener("hashchange", readRoute);
    return () => window.removeEventListener("hashchange", readRoute);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !sim) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("qaFixture")) return;
    params.set("qaScreen", screen);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [screen, sim]);

  const figures = useMemo(() => {
    const map = new Map<string, Figure>();
    for (const f of (bundle?.content.starting_figures.figures ?? []) as Figure[]) map.set(f.id, f);
    return map;
  }, [bundle]);
  const catalog = useMemo(
    () => (bundle ? catalogFromBundle(bundle, figures, snap) : null),
    [bundle, figures, snap],
  );
  const searchEntries = useMemo<ShellSearchEntry[]>(() => {
    if (!world || !snap || !catalog) return [];
    const pages: Array<[Screen, string, string]> = [
      ["home", "Home", "Current political briefing"],
      ["career", "Political opportunities", "Career and politician directory"],
      ["party", "Parties and caucuses", "Leadership and internal politics"],
      ["campaign", "Campaign", "Race command center and Ground Game"],
      ["elections", "Elections and calendar", "Presidential, Assembly and provincial races"],
      ["assembly", "National Assembly", "Bills, committees and roll calls"],
      ["executive", "Executive", "President, cabinet and administration"],
      ["courts", "Constitutional Court", "Bench, docket and decisions"],
      ["economy", "Economy", "Public national and regional indicators"],
      ["organizations", "Organizations", "Influence, priorities and scorecards"],
      ["foreign", "Foreign Affairs", "World relations and crises"],
      ["terena", "Maps", "Political, election and economic geography"],
      ["news", "News", "Political news desk"],
      ["archive", "History of Terena", "Political encyclopedia and election archive"],
    ];
    const entries: ShellSearchEntry[] = pages.map(([screen, label, detail]) => ({
      id: screen,
      kind: "Page",
      label,
      detail,
      screen,
    }));
    for (const politician of Object.values(snap.politicians)) {
      if (!politician.alive) continue;
      entries.push({
        id: politician.id,
        kind: "Politician",
        label: politicianDisplayName(catalog, politician.id),
        detail: partyDisplayName(world, politician.partyId, snap),
        screen: "career",
      });
    }
    for (const partyId of Object.keys(world.partyDefinitions)) {
      if (partyId === world.independentAggregatePartyId) continue;
      entries.push({
        id: partyId,
        kind: "Party",
        label: partyDisplayName(world, partyId, snap),
        detail: "Leadership, caucus and electoral record",
        screen: "party",
      });
    }
    for (const faction of Object.values(world.factionDefinitions)) {
      entries.push({
        id: faction.factionId,
        kind: "Caucus",
        label: faction.name,
        detail: partyDisplayName(world, faction.partyId, snap),
        screen: "party",
      });
    }
    for (const provinceId of world.provinceIds) {
      entries.push({
        id: provinceId,
        kind: "Province",
        label: catalog.places.get(provinceId)?.name ?? "Province",
        detail: "Governor, Assembly and regional statistics",
        screen: "terena",
      });
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
      entries.push({
        id: organization.id,
        kind: "Organization",
        label: organization.name,
        detail: organization.type,
        screen: "organizations",
      });
    }
    for (const election of Object.values(snap.elections)) {
      entries.push({
        id: election.id,
        kind: "Election",
        label: `${election.date.slice(0, 4)} ${election.type === "assembly" ? "National Assembly" : "presidential"} election`,
        detail: election.status.replace(/_/g, " "),
        screen: "elections",
      });
    }
    for (const election of Object.values(snap.provincialRuntime.elections)) {
      const province = catalog.places.get(election.provinceId)?.name ?? "Province";
      entries.push({
        id: election.id,
        kind: "Election",
        label: `${election.date.slice(0, 4)} ${province} gubernatorial election`,
        detail: election.status.replace(/_/g, " "),
        screen: "elections",
      });
    }
    for (const election of Object.values(snap.provincialRuntime.assemblyElections)) {
      const province = catalog.places.get(election.provinceId)?.name ?? "Province";
      entries.push({
        id: election.id,
        kind: "Election",
        label: `${election.date.slice(0, 4)} ${province} Assembly election`,
        detail: election.status.replace(/_/g, " "),
        screen: "elections",
      });
    }
    for (const bill of Object.values(snap.legislatureRuntime.bills)) {
      entries.push({
        id: bill.id,
        kind: "Bill",
        label: bill.title,
        detail: bill.status.replace(/_/g, " "),
        screen: "assembly",
      });
    }
    for (const courtCase of Object.values(snap.constitutionalRuntime.courtCases)) {
      entries.push({
        id: courtCase.id,
        kind: "Court case",
        label: courtCase.constitutionalQuestion,
        detail: courtCase.status.replace(/_/g, " "),
        screen: "courts",
      });
    }
    entries.push({
      id: "constitution-document",
      kind: "Page",
      label: "Constitution of Terena",
      detail: "Articles, amendments and legal text",
      screen: "assembly",
    });
    for (const amendment of Object.values(snap.provincialRuntime.constitutionalAmendments)) {
      entries.push({
        id: amendment.id,
        kind: "Amendment",
        label: amendment.title,
        detail: `${amendment.status.replace(/_/g, " ")} · ${amendment.proposedDate}`,
        screen: "assembly",
      });
    }
    for (const law of Object.values(snap.legislatureRuntime.enactedLaws)) {
      entries.push({
        id: law.id,
        kind: "Law",
        label: law.title,
        detail: `Enacted ${law.enactedDate}${law.operative ? " · in force" : ""}`,
        screen: "assembly",
      });
    }
    const year = Number(snap.currentDate.slice(0, 4));
    for (let y = year; y >= Math.max(1971, year - 12); y -= 1) {
      entries.push({
        id: `year:${y}`,
        kind: "Year",
        label: `Year in Terena · ${y}`,
        detail: "Historical retrospective",
        screen: "archive",
      });
    }
    return entries;
  }, [world, snap, catalog]);

  useEffect(() => {
    if (
      mode !== "play" ||
      (import.meta.env.DEV && new URLSearchParams(window.location.search).has("qaFixture"))
    )
      return;
    const focusForScreen =
      globalFocus &&
      searchEntries.some(
        (entry) =>
          entry.screen === screen && entry.kind === globalFocus.kind && entry.id === globalFocus.id,
      )
        ? globalFocus
        : null;
    const next = routeHash(screen, focusForScreen);
    if (window.location.hash !== next)
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${next}`,
      );
  }, [mode, screen, globalFocus, searchEntries]);

  function refresh(next: Simulation) {
    setSim(next);
    setSnap(next.getSnapshot());
  }

  function selectSearchEntry(entry: ShellSearchEntry) {
    setGlobalFocus(entry.kind === "Page" ? null : { kind: entry.kind, id: entry.id });
    if (entry.kind === "Bill") setSelectedBill(entry.id);
    setScreen(entry.screen);
  }

  function startGame(politicianId: string) {
    if (!world) return;
    const created = createSimulation({
      world,
      playerPoliticianId: politicianId,
      seed: "TERENA-2028",
    });
    setTurnEvents([]);
    setGlobalFocus(null);
    setSelectedBill(null);
    setScreen("home");
    setMode("play");
    refresh(created);
  }

  async function saveGame() {
    if (!sim || !snap) return;
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

  async function checkpointAutosave(reason: string): Promise<void> {
    if (!sim || !snap) return;
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
    const route = routeFromHash();
    setScreen(route.screen);
    setGlobalFocus(route.focus);
    refresh(restored);
  }

  function replaceSimulation(save: SaveFile) {
    if (!world) return;
    const restored = restoreSimulation(save, world);
    refresh(restored);
  }

  async function resolveAssemblyElection() {
    if (!sim || !world || busy || countingElection) return;
    setCountingElection(true);
    try {
      await checkpointAutosave("before Assembly count");
    } catch {
      feedback.setNotice("The pre-count autosave could not be written. The count has not started.");
      setCountingElection(false);
      return;
    }
    const worker = new Worker(new URL("./electionWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (
      event: MessageEvent<
        | { ok: true; save: SaveFile; result: ReturnType<Simulation["executeCommand"]> }
        | { ok: false; message: string }
      >,
    ) => {
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

  async function resolvePresidentialElection() {
    if (!sim || busyRef.current || countingElection) return;
    busyRef.current = true;
    setBusyLabel("Counting presidential ballots…");
    setBusy(true);
    const before = sim.getSnapshot().history.length;
    try {
      await checkpointAutosave("before presidential count");
    } catch {
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
        if (!resumed.ok) feedback.report(resumed);
        setTurnEvents(sim.getSnapshot().history.slice(before));
      }
      refresh(sim);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function endTurn() {
    if (!sim || !world || busyRef.current || countingElection) return;
    busyRef.current = true;
    const before = sim.getSnapshot().history.length;
    const nextMonth = addMonths(snap?.currentDate ?? sim.getSnapshot().currentDate, 1);
    const nominationDue = Object.values(sim.getSnapshot().partyContests).some((contest) => {
      if (contest.type !== "presidential_nomination") return false;
      if (contest.status === "resolved" || contest.status === "cancelled") return false;
      const electionDate = contest.metadata.electionDate;
      if (typeof electionDate !== "string") return false;
      return nominationCalendarDates(electionDate).resolve <= nextMonth;
    });
    setBusyLabel(nominationDue ? "Counting nominations…" : "Processing…");
    setBusy(true);
    try {
      await checkpointAutosave(nominationDue ? "before nomination count" : "before turn");
    } catch {
      feedback.setNotice("Autosave failed, so the turn was not advanced.");
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const worker = new Worker(new URL("./turnWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (
      event: MessageEvent<
        | { ok: true; save: SaveFile; result: ReturnType<Simulation["executeCommand"]> }
        | { ok: false; message: string }
      >,
    ) => {
      worker.terminate();
      try {
        if (event.data.ok) {
          const restored = restoreSimulation(event.data.save, world);
          setTurnEvents(restored.getSnapshot().history.slice(before));
          refresh(restored);
          if (!event.data.result.ok) feedback.setNotice(event.data.result.error.message);
        } else {
          feedback.setNotice(event.data.message);
        }
      } catch (error) {
        feedback.setNotice(
          error instanceof Error ? error.message : "The turn could not be restored.",
        );
      } finally {
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
    const latest = saves[0] ?? null;
    const latestSummary = latest ? savedGamePoliticalSummary(world, latest) : null;
    return (
      <div className="political-title-screen">
        <section className="title-masthead" aria-labelledby="lorsain-title">
          <div className="title-seal" aria-hidden="true">
            L
          </div>
          <div className="title-wordmark">
            <span>THE POLITICAL LIFE OF TERENA</span>
            <h1 id="lorsain-title">LORSAIN</h1>
            <p>Govern, legislate, campaign and build a public life in the Dual-Mandate Republic.</p>
          </div>
          <div className="title-founding-line">
            <span>Republic founded 1971</span>
            <span>January 2028 scenario</span>
          </div>
        </section>
        <section className="title-political-desk">
          {latest && latestSummary ? (
            <article className="continue-dossier">
              <div className="kicker">Continue political career</div>
              <div className="continue-dossier-head">
                <div>
                  <h2>{latest.playerName}</h2>
                  <p>{latestSummary.office}</p>
                </div>
                <time>{latest.date}</time>
              </div>
              <div className="continue-party-line">
                <span
                  className="continue-party-mark"
                  style={{
                    background: partyColor(
                      world,
                      latest.save.simulation.politicians[latest.save.simulation.playerPoliticianId]
                        ?.partyId ?? null,
                    ),
                  }}
                />
                <strong>{latestSummary.party}</strong>
              </div>
              <dl className="continue-dossier-facts">
                <div>
                  <dt>Political context</dt>
                  <dd>{latestSummary.context}</dd>
                </div>
                <div>
                  <dt>Career length</dt>
                  <dd>{latestSummary.played}</dd>
                </div>
                <div>
                  <dt>Last saved</dt>
                  <dd>
                    {new Date(latest.savedAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              </dl>
              <button className="btn title-continue" onClick={() => loadFile(latest.save)}>
                Continue
              </button>
            </article>
          ) : (
            <article className="continue-dossier empty">
              <div className="kicker">No current career</div>
              <h2>Enter Terenan politics</h2>
              <p>Choose a politician and begin on 1 January 2028.</p>
              <button className="btn title-continue" onClick={() => setMode("select")}>
                Start a new game
              </button>
            </article>
          )}
          <nav className="title-actions" aria-label="Main menu">
            <button type="button" onClick={() => setMode("select")}>
              <span>New Game</span>
              <small>Choose a political life</small>
            </button>
            <button type="button" onClick={() => setMode("load")} disabled={saves.length === 0}>
              <span>Load Game</span>
              <small>
                {saves.length} saved career{saves.length === 1 ? "" : "s"}
              </small>
            </button>
            <button type="button" disabled>
              <span>Settings</span>
              <small>Display and accessibility</small>
            </button>
          </nav>
        </section>
      </div>
    );
  }
  if (mode === "load") {
    return (
      <div className="load-career-screen">
        <header className="load-career-head">
          <div>
            <div className="kicker">LORSAIN RECORDS</div>
            <h1>Saved political careers</h1>
            <p>Resume a career with its office, allegiance and political context intact.</p>
          </div>
          <div className="row">
            <button className="btn secondary" onClick={() => setMode("title")}>
              Back
            </button>
            <label className="btn secondary">
              Import save
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
        </header>
        <div className="saved-career-grid">
          {saves.map((s) => {
            const summary = savedGamePoliticalSummary(world, s);
            const savedPlayer = s.save.simulation.politicians[s.save.simulation.playerPoliticianId];
            return (
              <article className="saved-career" key={s.id}>
                <div className="saved-career-date">
                  <span>{s.date}</span>
                  <small>{summary.played}</small>
                </div>
                <h2>{s.playerName}</h2>
                <p className="saved-career-office">{summary.office}</p>
                <div className="continue-party-line">
                  <span
                    className="continue-party-mark"
                    style={{ background: partyColor(world, savedPlayer?.partyId ?? null) }}
                  />
                  <strong>{summary.party}</strong>
                </div>
                <p className="saved-career-context">{summary.context}</p>
                <footer>
                  <small>
                    Saved{" "}
                    {new Date(s.savedAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                  <button
                    className="btn"
                    onClick={() => void getSave(s.id).then((row) => row && loadFile(row.save))}
                  >
                    Resume
                  </button>
                </footer>
              </article>
            );
          })}
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
      if (o.includes("governor")) return 3;
      if (o.includes("chief justice")) return 4;
      if (f.presidential_status === "frontrunner") return 5;
      if (o.includes("assembly") || o.includes("mp")) return 6;
      return 99;
    }
    function roleDescription(f: Figure): string {
      const kind = officeKind(f);
      if (kind === "president") return "Run the national executive and foreign policy.";
      if (kind === "governor")
        return "Lead provincial administration and build toward reelection or national office.";
      if (kind === "assembly") return "Legislate, vote and build a political career.";
      if (kind === "courts") return "Hear constitutional cases and shape public precedent.";
      if (kind === "leader")
        return "Manage party politics alongside the powers of any elected office held.";
      if (kind === "minister")
        return "Limited role: advise the President and pursue a broader political career.";
      if ((f.office ?? "").toLowerCase().includes("mayor"))
        return "Limited role: set a civic priority and pursue future office.";
      return "Continue a political career and seek a legitimate electoral opportunity.";
    }
    /** Featured starts only — meaningful gameplay depth, not Limited minister/mayor loops. */
    function gameplayFocus(f: Figure): string {
      const kind = officeKind(f);
      const o = (f.office ?? "").toLowerCase();
      if (kind === "president") return "Executive · foreign · legislation";
      if (kind === "governor") return "Provincial administration · reelection";
      if (o.includes("speaker")) return "Floor control · legislation · party";
      if (kind === "leader") return "Party contests · caucus · career";
      if (kind === "assembly" || o.includes("mp") || o.includes("committee"))
        return "Legislation · constituency · votes";
      if (kind === "courts") return "Constitutional docket · precedent";
      if (f.presidential_status === "frontrunner") return "Presidential nomination · campaign";
      return "Electoral career · opportunities";
    }
    function complexity(f: Figure): "High" | "Medium" | "Low" {
      const kind = officeKind(f);
      const o = (f.office ?? "").toLowerCase();
      if (kind === "president" || o.includes("speaker") || f.presidential_status === "frontrunner")
        return "High";
      if (kind === "governor" || kind === "leader" || kind === "assembly" || kind === "courts")
        return "Medium";
      return "Low";
    }
    function roleLabel(f: Figure): string {
      const o = (f.office ?? "").trim();
      if (o) return o;
      if (f.presidential_status === "frontrunner") return "Presidential frontrunner";
      return "Public figure";
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
    const featuredCard = (f: Figure) => {
      const accent = partyColor(world, f.party_id ?? null);
      const level = complexity(f);
      return (
        <article key={f.id} className="featured-start" style={{ borderLeftColor: accent }}>
          <div className="featured-start-top">
            <PoliticianAvatar
              name={f.name}
              {...(f.party_id != null ? { partyId: f.party_id } : {})}
              world={world}
              size="sm"
            />
            <div className="featured-start-id">
              <h3 className="featured-start-name serif-head">{f.name}</h3>
              <div className="featured-start-role">{roleLabel(f)}</div>
              <div className="muted featured-start-party">
                {f.party ?? "Independent"}
                {f.home ? ` · ${f.home}` : ""}
              </div>
            </div>
            <StatusBadge tone={level === "High" ? "warn" : level === "Medium" ? "idle" : "ok"}>
              {level}
            </StatusBadge>
          </div>
          <div className="featured-start-focus">
            <span className="kicker">Gameplay focus</span>
            <div>{gameplayFocus(f)}</div>
          </div>
          <div className="featured-start-foot">
            <span className="muted">Complexity · {level}</span>
            <button className="btn" onClick={() => startGame(f.id)}>
              Play
            </button>
          </div>
        </article>
      );
    };
    const rosterCard = (f: Figure) => (
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
        descriptor={
          officeKind(f) === "minister" || (f.office ?? "").toLowerCase().includes("mayor")
            ? roleDescription(f)
            : (f.notes ?? f.display_summary ?? roleDescription(f))
        }
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
            Featured starts are full-depth political roles. Search the roster for Limited offices
            and other public figures. Hidden traits are never shown.
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
            <div className="new-game-section-head">
              <h3>Featured starts</h3>
              <p className="muted">
                Name, role, gameplay focus, and complexity — President, Governor, Assembly, courts,
                and party leadership with real monthly work.
              </p>
            </div>
            <div className="featured-start-grid">{featured.map(featuredCard)}</div>
            <div className="new-game-section-head" style={{ marginTop: "1.25rem" }}>
              <h3>Full roster</h3>
              <p className="muted">
                Ordinary MPs, Limited ministers/mayors, and other public figures — {browse.length}{" "}
                remaining. Use search and filters for the complete list.
              </p>
            </div>
          </>
        ) : (
          <p className="muted">{filtered.length} matching politicians</p>
        )}
        <div className="featured-grid">{pageRows.map(rosterCard)}</div>
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
  const provincialMember = provincialLegislatorForPolitician(snap, snap.playerPoliticianId);
  const roleKind =
    Object.values(snap.officeTerms)
      .filter(
        (term) =>
          term.holderId === snap.playerPoliticianId &&
          (term.status === "active" || term.status === "suspended"),
      )
      .map((term) => world.offices[term.officeId]?.kind)
      .find(Boolean) ??
    (provincialMember?.serviceStartDate && provincialMember.serviceEndDate == null
      ? "provincial_legislator"
      : "private_citizen");
  const interrupt = snap.pendingInterrupt;
  const playerDecisions = collectPlayerActionableDecisions(world, snap);
  const decisionScreen = (kind: string): Screen => {
    if (kind === "assembly_filing") return "career";
    if (
      kind === "judicial_vote" ||
      kind === "confirmation_vote" ||
      kind === "impeachment_vote" ||
      kind === "recall_vote"
    )
      return "courts";
    if (
      kind === "foreign_presidential_action" ||
      kind === "incoming_treaty" ||
      kind === "incoming_summit" ||
      kind === "war_powers"
    )
      return "foreign";
    if (kind === "sign_bill") return "executive";
    if (kind === "interrupt" && interrupt?.code.includes("ELECTION")) return "elections";
    return "assembly";
  };
  const attentionItems: ShellAttentionItem[] = playerDecisions.map((decision) => ({
    id: decision.key,
    label: decision.label,
    detail:
      decision.kind === "interrupt"
        ? "The turn cannot continue until this is resolved."
        : "Your affirmative choice is required.",
    screen: decisionScreen(decision.kind),
    tone: decision.kind === "interrupt" ? "urgent" : "soon",
  }));
  for (const election of Object.values(snap.provincialRuntime.elections)) {
    if (election.status !== "filing_open" || election.playerDecision != null) continue;
    const playerHome = player.homeProvinceId ?? world.politicianHomeProvince[player.id];
    if (election.provinceId !== playerHome && election.incumbentId !== player.id) continue;
    attentionItems.push({
      id: `governor-filing:${election.id}`,
      label: `Governor filing is open in ${catalog.places.get(election.provinceId)?.name ?? "your province"}.`,
      detail: `Deadline ${election.filingDeadlineDate}`,
      screen: "career",
      tone: "soon",
    });
  }
  for (const election of Object.values(snap.provincialRuntime.assemblyElections)) {
    if (election.status !== "filing_open" || election.playerDecision != null) continue;
    const playerHome = player.homeProvinceId ?? world.politicianHomeProvince[player.id];
    if (election.provinceId !== playerHome) continue;
    attentionItems.push({
      id: `provincial-filing:${election.id}`,
      label: `Provincial Assembly filing is open in ${catalog.places.get(election.provinceId)?.name ?? "your province"}.`,
      detail: `Election ${election.date}`,
      screen: "career",
      tone: "soon",
    });
  }
  const watchedIds = new Set(watchlist.map((entry) => entry.slice(entry.indexOf(":") + 1)));
  const publicTurnEvents = turnEvents.filter(
    (event) => event.visibility === "public" && event.type !== "TURN_COMPLETED",
  );
  const meaningfulTurnEvents = publicTurnEvents.filter((event) => event.importance >= 0.45);
  const briefingSource = (meaningfulTurnEvents.length ? meaningfulTurnEvents : publicTurnEvents)
    .slice(-10)
    .reverse();
  const briefingItems: ShellBriefingItem[] = briefingSource.map((event) => ({
    id: event.id,
    date: event.date,
    label: eventDisplay(catalog, world, snap, event),
    watched:
      [...event.actorIds, ...event.entityIds].some((id) => watchedIds.has(id)) ||
      [...watchedIds].some((id) => JSON.stringify(event.payload).includes(id)),
  }));
  const activeCampaign = playerCampaign(snap);
  const campaignDate = activeCampaign?.electionId
    ? (snap.elections[activeCampaign.electionId]?.date ??
      snap.provincialRuntime.elections[activeCampaign.electionId]?.date ??
      snap.provincialRuntime.assemblyElections[activeCampaign.electionId]?.date)
    : activeCampaign?.contestId &&
        typeof snap.partyContests[activeCampaign.contestId]?.metadata.electionDate === "string"
      ? (snap.partyContests[activeCampaign.contestId]!.metadata.electionDate as string)
      : null;
  const monthsRemaining = campaignDate
    ? Math.max(
        0,
        (Number(campaignDate.slice(0, 4)) - Number(snap.currentDate.slice(0, 4))) * 12 +
          Number(campaignDate.slice(5, 7)) -
          Number(snap.currentDate.slice(5, 7)),
      )
    : null;
  const provinceId = governedProvinceId(world, snap, player.id);
  const roleActions =
    activeCampaign?.actionPointsRemaining ??
    (provinceId ? snap.provincialRuntime.provinces[provinceId]?.actionPointsRemaining : null);
  const statusSegments = [
    `Standing: ${publicStandingLabel(world, snap, player.id)}`,
    ...(roleActions != null ? [`${roleActions} action${roleActions === 1 ? "" : "s"}`] : []),
    ...(activeCampaign && monthsRemaining != null
      ? [`${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"} to election`]
      : []),
  ];
  const lastSavedLabel = lastSavedAt
    ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "Autosave runs before every turn and national count.";
  return (
    <GameShell
      screen={screen}
      onNavigate={setScreen}
      date={snap.currentDate}
      playerLine={`${politicianDisplayName(catalog, snap.playerPoliticianId)} · ${offices[0] ?? "No office"} · ${partyDisplayName(world, player.partyId, snap)}`}
      decisionCount={attentionItems.length}
      roleKind={roleKind}
      campaignActive={Boolean(playerCampaign(snap))}
      busy={busy || countingElection}
      busyLabel={countingElection ? "Counting Assembly ballots…" : busyLabel}
      endTurnDisabled={Boolean(interrupt?.requiresResolution)}
      onEndTurn={() => void endTurn()}
      onSave={() => void saveGame()}
      onExport={() => downloadSave(sim.serializeSave(), `lorsain-${snap.currentDate}.json`)}
      searchEntries={searchEntries}
      onSearchSelect={selectSearchEntry}
      attentionItems={attentionItems}
      briefingItems={briefingItems}
      watchlist={watchlist}
      onToggleWatch={(entry) => {
        const key = `${entry.kind}:${entry.id}`;
        setWatchlist((items) =>
          items.includes(key) ? items.filter((item) => item !== key) : [...items, key],
        );
      }}
      statusSegments={statusSegments}
      lastSavedLabel={lastSavedLabel}
    >
      {screen === "home" || screen === "office" ? (
        <DecisionPanel
          world={world}
          snap={snap}
          sim={sim}
          onDone={() => refresh(sim)}
          report={feedback.report}
          countingElection={countingElection}
          onResolveAssembly={resolveAssemblyElection}
          onResolvePresidential={() => void resolvePresidentialElection()}
          askConfirm={feedback.askConfirm}
        />
      ) : playerDecisions.length ? (
        <button
          type="button"
          className="required-decisions-indicator"
          onClick={() => setScreen("home")}
        >
          <span>Required decisions</span>
          <strong>{playerDecisions.length}</strong>
          <small>Open the political inbox on Home</small>
        </button>
      ) : null}
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
        onResolvePresidential={() => void resolvePresidentialElection()}
        askConfirm={feedback.askConfirm}
        globalFocus={globalFocus}
        setGlobalFocus={setGlobalFocus}
      />
      {import.meta.env.DEV ? (
        <output
          id="lorsain-browser-qa-state"
          hidden
          data-ready="true"
          data-screen={screen}
          data-player={snap.playerPoliticianId}
          data-date={snap.currentDate}
        >
          Browser QA ready
        </output>
      ) : null}
      {feedback.overlay()}
    </GameShell>
  );
}
